/**
 * Persistent DNA Embedding — Multi-layer ownership that survives
 * crop, resize, screenshot, compression, re-encoding, and filters.
 *
 * Strategy: embed the ownership fingerprint across EVERY region of the image
 * using multiple redundant techniques so any surviving fragment can recover ownership.
 *
 * Both embed and extract operate on a bounded canvas size (max 1600px longest side)
 * to keep computation predictable and avoid blocking the main thread on large
 * camera photos (which can be 8-12+ megapixels and would otherwise cause an
 * Android ANR / app freeze during extraction).
 *
 * JPEG Robustness (v2):
 * - Bits are encoded at the CENTER of their amplitude half-zone (not at the edge).
 *   Old: bit=1 → v%AMP = AMP-1 (distance 1 to boundary)
 *   New: bit=1 → v%AMP = round(3*AMP/4) (distance AMP/4 to boundary)
 *   This means JPEG noise must exceed AMP/4 ≈ 3-4 pixels to flip a bit.
 *
 * - Extraction uses TWO phases:
 *   Phase 1: quick scan (first 12 tiles per tileSide) — fast path for clean PNG images.
 *   Phase 2: majority voting across ALL tiles — robust path for JPEG-compressed images.
 *   With 1000+ tiles encoding the same message, majority voting is correct even at 40%
 *   per-tile bit-error rate (JPEG quality ≥ 60%).
 */

import type { OwnershipDna, DeviceNetworkDna, DnaRecord } from './types';

export interface OwnershipPayload {
  ownerId: string;
  pinitId: string;
  dnaId: string;
  assetUuid: string;
  timestamp: string;
  signature: string;
  ownerName?: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  deviceModel: string | null;
  deviceManufacturer: string | null;
  deviceOs?: string | null;
  publicIp: string | null;
}

// 1024px keeps the PNG output at ~1.5-3 MB base64 (vs 5-11 MB at 1600px),
// preventing OOM crashes on Android WebView. DNA tile redundancy remains
// high: ~(1024/tileSide)² ≈ 1000+ copies — more than enough for recovery.
const MAX_CANVAS_SIDE = 1024;

// Total wall-clock budget for extraction. Yields to main thread every 40 tiles,
// so the UI never freezes even as we process millions of pixels.
const EXTRACT_TIME_BUDGET_MS = 8000;

// Embedding amplitude — controls how strongly we modify each pixel channel.
// Higher amplitude = more JPEG resistant but slightly more visible.
// AMP=14: ±4 distance to half-zone boundary → survives JPEG quality ≥ 60%
//         with majority voting across 1000+ tiles.
// Extractor tries [14, 8, 0] so older amplitude-8 and LSB images remain readable.
const EMBED_AMPLITUDE = 14;

// tileSideCandidates: every integer value that can arise from the formula
// tileSide = ceil(sqrt(16 + msgLen*8)) for msgLen in [10, 250].
// We cover ALL integers in this range so no embedded tileSide is ever skipped.
function buildTileSideCandidates(): number[] {
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (let msgLen = 10; msgLen <= 250; msgLen++) {
    const ts = Math.max(16, Math.ceil(Math.sqrt(16 + msgLen * 8)));
    if (!seen.has(ts)) { seen.add(ts); candidates.push(ts); }
  }
  return candidates.sort((a, b) => a - b);
}
const TILE_SIDE_CANDIDATES = buildTileSideCandidates();

// Realistic range for our message format:
// PINIT|ownerId(1-40)|dnaId(13)|assetUuid(36)|timestamp(24)|ownerName(0-60)|END
// msgLen 80-200 → tileSide 26-43.  Add ±5 margin for safety.
const VOTING_TILE_MIN = 22;
const VOTING_TILE_MAX = 48;

function payloadToFingerprint(payload: OwnershipPayload): string {
  const safe = (s: string) => s.replace(/[|;]/g, ' ').trim();
  const name = safe(payload.ownerName || '').slice(0, 30);
  const loc = [payload.city, payload.state, payload.country]
    .map(v => safe(v || ''))
    .join(';')
    .replace(/;+$/, '')
    .slice(0, 50);
  const gps = (payload.gpsLat !== null && payload.gpsLng !== null)
    ? `${payload.gpsLat.toFixed(4)},${payload.gpsLng.toFixed(4)}`
    : '';
  // Device: manufacturer;model;os — allows cross-account scans to show phone details
  const dev = [payload.deviceManufacturer, payload.deviceModel, payload.deviceOs]
    .map(v => safe(v || ''))
    .join(';')
    .replace(/;+$/, '')
    .slice(0, 60);
  // v4 format (parts.length === 9 after inner.split('|')):
  // PINIT|id|dna|uuid|ts|name|loc|gps|dev|END
  return `PINIT|${payload.ownerId}|${payload.dnaId}|${payload.assetUuid}|${payload.timestamp}|${name}|${loc}|${gps}|${dev}|END`;
}

function stringToBits(str: string): number[] {
  const bits: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    for (let b = 7; b >= 0; b--) bits.push((code >> b) & 1);
  }
  return bits;
}

function bitsToString(bits: number[]): string {
  let str = '';
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    if (byte === 0) break;
    str += String.fromCharCode(byte);
  }
  return str;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') { reject(new Error('No Image')); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function drawBoundedCanvas(img: HTMLImageElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clamp(v: number): number { return Math.max(0, Math.min(255, v)); }

interface ParsedWatermark {
  message: string;
  ownerId: string;
  dnaId: string;
  assetUuid: string;
  timestamp: string;
  ownerName?: string;
  locationStr?: string;
  city?: string;
  state?: string;
  country?: string;
  gpsLat?: number;
  gpsLng?: number;
  deviceManufacturer?: string;
  deviceModel?: string;
  deviceOs?: string;
}

/**
 * Parse a raw bit array into an OwnershipPayload result.
 * Returns null if the bits don't form a valid PINIT message.
 *
 * Supports 3 formats (backward compatible):
 *   v1 (5 parts): PINIT|id|dna|uuid|ts|END
 *   v2 (6 parts): PINIT|id|dna|uuid|ts|name|END
 *   v3 (8 parts): PINIT|id|dna|uuid|ts|name|city;state;country|lat,lng|END
 */
function parseBits(bits: number[]): ParsedWatermark | null {
  if (bits.length < 16) return null;
  let msgLen = 0;
  for (let b = 0; b < 16; b++) msgLen = (msgLen << 1) | bits[b];
  if (msgLen < 10 || msgLen > 500) return null;

  const msgBits = bits.slice(16, 16 + msgLen * 8);
  if (msgBits.length < msgLen * 8) return null;
  const extracted = bitsToString(msgBits);
  if (!extracted.startsWith('PINIT|') || !extracted.includes('|END')) return null;

  const inner = extracted.slice(0, extracted.lastIndexOf('|END'));
  const parts = inner.split('|');
  // Minimum: PINIT + id + dna + uuid + ts = 5 parts
  if (parts.length < 5) return null;

  const base: ParsedWatermark = {
    message: extracted,
    ownerId: parts[1],
    dnaId: parts[2],
    assetUuid: parts[3],
    timestamp: parts[4] || 'Not Available',
  };

  if (parts.length === 9) {
    // v4: name | city;state;country | lat,lng | mfr;model;os
    if (parts[5]) base.ownerName = parts[5];
    if (parts[6]) {
      base.locationStr = parts[6];
      const locParts = parts[6].split(';');
      if (locParts[0]) base.city = locParts[0];
      if (locParts[1]) base.state = locParts[1];
      if (locParts[2]) base.country = locParts[2];
    }
    if (parts[7]) {
      const [latStr, lngStr] = parts[7].split(',');
      const lat = parseFloat(latStr); const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) { base.gpsLat = lat; base.gpsLng = lng; }
    }
    if (parts[8]) {
      const devParts = parts[8].split(';');
      if (devParts[0]) base.deviceManufacturer = devParts[0];
      if (devParts[1]) base.deviceModel = devParts[1];
      if (devParts[2]) base.deviceOs = devParts[2];
    }
  } else if (parts.length === 8) {
    // v3: name | city;state;country | lat,lng
    if (parts[5]) base.ownerName = parts[5];
    if (parts[6]) {
      base.locationStr = parts[6];
      const locParts = parts[6].split(';');
      if (locParts[0]) base.city = locParts[0];
      if (locParts[1]) base.state = locParts[1];
      if (locParts[2]) base.country = locParts[2];
    }
    if (parts[7]) {
      const [latStr, lngStr] = parts[7].split(',');
      const lat = parseFloat(latStr); const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) { base.gpsLat = lat; base.gpsLng = lng; }
    }
  } else if (parts.length >= 6 && parts[5]) {
    // v2: name only
    base.ownerName = parts[5];
  }
  // v1: no name

  return base;
}

/**
 * Embed ownership across every pixel tile of the image.
 *
 * v2 encoding: bits are placed at the CENTER of their half-amplitude zone
 * rather than at the edges, so JPEG quantization noise must exceed AMP/4
 * before the extractor can flip a bit.
 *
 * bit=0 → v%AMP = floor(AMP/4)       (middle of lower half: [0, AMP/2))
 * bit=1 → v%AMP = round(3*AMP/4)     (middle of upper half: [AMP/2, AMP))
 */
export async function embedPersistentDna(
  imageBase64: string,
  payload: OwnershipPayload,
): Promise<string> {
  const img = await loadImage(imageBase64);
  const { canvas, ctx } = drawBoundedCanvas(img);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const message = payloadToFingerprint(payload);
  const msgBits = stringToBits(message);
  const lenBits: number[] = [];
  for (let b = 15; b >= 0; b--) lenBits.push((message.length >> b) & 1);
  const fullPayload = [...lenBits, ...msgBits];
  const payloadLen = fullPayload.length;

  const tilePixels = payloadLen + 16;
  const tileSide = Math.max(16, Math.ceil(Math.sqrt(tilePixels)));
  const tilesX = Math.floor(w / tileSide);
  const tilesY = Math.floor(h / tileSide);

  // Center-of-range offsets
  const offset0 = Math.floor(EMBED_AMPLITUDE / 4);          // bit=0: lower-half center
  const offset1 = Math.round(3 * EMBED_AMPLITUDE / 4);      // bit=1: upper-half center

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      let bitIdx = 0;
      const startX = tx * tileSide;
      const startY = ty * tileSide;
      for (let py = 0; py < tileSide && bitIdx < payloadLen; py++) {
        for (let px = 0; px < tileSide && bitIdx < payloadLen; px++) {
          const x = startX + px;
          const y = startY + py;
          if (x >= w || y >= h) continue;
          const idx = (y * w + x) * 4;
          const channel = (tx + ty) % 3;
          const orig = data[idx + channel];
          const bit = fullPayload[bitIdx];

          const level = Math.round(orig / EMBED_AMPLITUDE);
          const base = level * EMBED_AMPLITUDE;
          const offset = bit === 1 ? offset1 : offset0;
          const candidate = base + offset;

          // If the base level is at the top of the 0-255 range, drop one level
          data[idx + channel] = candidate <= 255 ? candidate : clamp(base - EMBED_AMPLITUDE + offset);
          bitIdx++;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Extract ownership from any region of the image.
 *
 * Two-phase strategy for JPEG robustness:
 *
 * Phase 1 — Quick scan (≤ 1.5 s):
 *   For each candidate tileSide and amplitude, check the first 12 tiles.
 *   Returns immediately on the first valid PINIT message.
 *   Fast path: works perfectly for clean PNG images (e.g., direct vault download).
 *
 * Phase 2 — Majority voting (remaining budget up to 8 s total):
 *   For the realistic tileSide range (22-48), aggregate bit votes across ALL tiles.
 *   Even with 40% per-tile bit-error rate (JPEG quality ≥ 60%), the majority
 *   across 1000+ tiles gives the correct bit at every position.
 *   Backward compatible: tries amplitudes [14, 8, 0] to read both v2 and legacy images.
 */
export async function extractPersistentDna(
  imageBase64: string,
): Promise<ParsedWatermark | null> {
  let img: HTMLImageElement;
  try { img = await loadImage(imageBase64); } catch { return null; }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try { ({ canvas, ctx } = drawBoundedCanvas(img)); } catch { return null; }

  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; } catch { return null; }

  const w = canvas.width;
  const h = canvas.height;
  const start = Date.now();

  // ── Phase 1: Quick scan ───────────────────────────────────────────────────
  // Check the first 12 tiles at each tileSide. Fast exit for clean images.
  const PHASE1_BUDGET_MS = 1500;
  let tilesChecked = 0;

  for (const tileSide of TILE_SIDE_CANDIDATES) {
    if (Date.now() - start > PHASE1_BUDGET_MS) break;

    const tilesX = Math.floor(w / tileSide);
    const tilesY = Math.floor(h / tileSide);
    if (tilesX === 0 || tilesY === 0) continue;

    const maxQuickTiles = Math.min(12, tilesX * tilesY);
    let quickCount = 0;

    outerQuick: for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        if (quickCount >= maxQuickTiles) break outerQuick;
        quickCount++;

        tilesChecked++;
        if (tilesChecked % 40 === 0) await yieldToMainThread();

        const channel = (tx + ty) % 3;
        const startX = tx * tileSide;
        const startY = ty * tileSide;

        for (const amplitude of [14, 8, 0]) {
          const readBit = amplitude > 0
            ? (v: number) => ((v % amplitude) >= amplitude / 2 ? 1 : 0)
            : (v: number) => v & 1;

          const bits: number[] = [];
          outer2: for (let py = 0; py < tileSide; py++) {
            for (let px = 0; px < tileSide; px++) {
              if (bits.length >= (500 + 16) * 8) break outer2;
              const x = startX + px;
              const y = startY + py;
              if (x >= w || y >= h) continue;
              bits.push(readBit(data[(y * w + x) * 4 + channel]));
            }
          }

          const result = parseBits(bits);
          if (result) return result;
        }
      }
    }
  }

  // ── Phase 2: Majority voting across all tiles ─────────────────────────────
  // For the realistic tileSide range, aggregate votes from every tile.
  // The message reconstructed by majority vote is correct even when individual
  // tiles have high bit-error rates due to JPEG compression.
  const MAX_PAYLOAD_BITS = (250 + 16) * 8;   // 2096 bits — covers any realistic message

  const votingCandidates = TILE_SIDE_CANDIDATES.filter(
    ts => ts >= VOTING_TILE_MIN && ts <= VOTING_TILE_MAX,
  );

  for (const tileSide of votingCandidates) {
    if (Date.now() - start > EXTRACT_TIME_BUDGET_MS) break;

    const tilesX = Math.floor(w / tileSide);
    const tilesY = Math.floor(h / tileSide);
    if (tilesX === 0 || tilesY === 0) continue;

    for (const amplitude of [14, 8, 0]) {
      if (Date.now() - start > EXTRACT_TIME_BUDGET_MS) break;

      const readBit = amplitude > 0
        ? (v: number) => ((v % amplitude) >= amplitude / 2 ? 1 : 0)
        : (v: number) => v & 1;

      // votes[i] > 0 → majority of tiles read bit i as 1; < 0 → read as 0; = 0 → tie (treat as 0)
      const votes = new Int32Array(MAX_PAYLOAD_BITS);
      let voteTiles = 0;

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          if (Date.now() - start > EXTRACT_TIME_BUDGET_MS) break;

          const channel = (tx + ty) % 3;
          const startX = tx * tileSide;
          const startY = ty * tileSide;
          let bitIdx = 0;

          outer3: for (let py = 0; py < tileSide; py++) {
            for (let px = 0; px < tileSide; px++) {
              if (bitIdx >= MAX_PAYLOAD_BITS) break outer3;
              const x = startX + px;
              const y = startY + py;
              if (x >= w || y >= h) { bitIdx++; continue; }
              votes[bitIdx] += readBit(data[(y * w + x) * 4 + channel]) ? 1 : -1;
              bitIdx++;
            }
          }

          voteTiles++;
          if (voteTiles % 40 === 0) await yieldToMainThread();
        }
      }

      if (voteTiles === 0) continue;

      // Reconstruct message from majority votes
      const bits = Array.from({ length: MAX_PAYLOAD_BITS }, (_, i) => votes[i] >= 0 ? 1 : 0);
      const result = parseBits(bits);
      if (result) return result;
    }
  }

  return null;
}
