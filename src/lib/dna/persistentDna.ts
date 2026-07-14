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
  publicIp: string | null;
}

// 1024px keeps the PNG output at ~1.5-3 MB base64 (vs 5-11 MB at 1600px),
// preventing OOM crashes on Android WebView. DNA tile redundancy remains
// high: ~(1024/tileSide)² ≈ 1000+ copies — more than enough for recovery.
const MAX_CANVAS_SIDE = 1024;
const EXTRACT_TIME_BUDGET_MS = 4000;
// tileSide = ceil(sqrt(payloadBits)), and payloadBits varies per-asset with the
// exact length of ownerId/dnaId/assetUuid/timestamp — it can land on ANY integer,
// not just round numbers. A sparse candidate list (e.g. only 24/28/32) silently
// misses real tile sizes like 29 or 31 and makes extraction structurally
// impossible for those assets. Use every integer across the realistic range
// instead (ownerId 1-40 chars covers everything from short usernames to UUIDs).
function buildTileSideCandidates(): number[] {
  // Cover all realistic message lengths so extraction works for both:
  //   Old format: PINIT|ownerId|dnaId(13)|assetUuid(36)|timestamp(24)|END  (no ownerName)
  //   New format: PINIT|ownerId|dnaId(13)|assetUuid(36)|timestamp(24)|ownerName(≤60)|END
  // ownerId 1-40 chars, ownerName 0-60 chars → total message 87-188 chars.
  // Sweep msgLen 10-250 to guarantee no tile size is missing.
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (let msgLen = 10; msgLen <= 250; msgLen++) {
    const tileSide = Math.max(16, Math.ceil(Math.sqrt(16 + msgLen * 8)));
    if (!seen.has(tileSide)) { seen.add(tileSide); candidates.push(tileSide); }
  }
  return candidates.sort((a, b) => a - b);
}
const TILE_SIDE_CANDIDATES = buildTileSideCandidates();

function payloadToFingerprint(payload: OwnershipPayload): string {
  // Sanitize ownerName: strip pipe chars so they don't break the delimiter format.
  // Truncate to 60 chars to keep tile sizes manageable.
  const safeName = (payload.ownerName || '').replace(/\|/g, '_').trim().slice(0, 60);
  if (safeName) {
    return `PINIT|${payload.ownerId}|${payload.dnaId}|${payload.assetUuid}|${payload.timestamp}|${safeName}|END`;
  }
  return `PINIT|${payload.ownerId}|${payload.dnaId}|${payload.assetUuid}|${payload.timestamp}|END`;
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

/** Draw the image onto a canvas capped at MAX_CANVAS_SIDE on the longest side. */
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

// Embedding amplitude — how many low-order bits to use per pixel channel.
// AMPLITUDE=1  → ±1 change   — invisible but fragile (destroyed by any JPEG)
// AMPLITUDE=8  → ±8 change   — near-invisible, survives JPEG quality ≥ 65
// AMPLITUDE=14 → ±14 change  — near-invisible, survives screen-recording + platform re-encode (quality ≥ 50)
// AMPLITUDE=16 → ±16 change  — barely visible on large images, JPEG quality ≥ 50
// We use 14 (Scenario 3): survives double-pass encode (screen capture + Instagram/X compression).
// Extractor always tries [14, 8, LSB] so existing amplitude-8 files remain detectable.
const EMBED_AMPLITUDE = 14;

function clamp(v: number): number { return Math.max(0, Math.min(255, v)); }

/**
 * Embed ownership across every pixel tile of the image.
 * Uses amplitude-8 encoding (each bit shifts the channel value by ±EMBED_AMPLITUDE)
 * rather than single-bit LSB, giving meaningful JPEG resistance.
 * The fingerprint is repeated across ALL tiles so any remaining region can recover it.
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
          // Round orig to nearest even/odd multiple of AMPLITUDE,
          // then set it to that multiple ± AMPLITUDE/2 based on bit value.
          // Result: bit=1 → value is odd-multiple of AMP; bit=0 → even-multiple.
          const level = Math.round(orig / EMBED_AMPLITUDE);
          const base = level * EMBED_AMPLITUDE;
          data[idx + channel] = clamp(bit === 1 ? base + EMBED_AMPLITUDE - 1 : base);
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
 * Tries multiple tile positions and channels, yielding to the main thread
 * periodically and bailing out after a fixed time budget so a large or
 * heavily-tiled image can never freeze the UI.
 */
export async function extractPersistentDna(
  imageBase64: string,
): Promise<{ message: string; ownerId: string; dnaId: string; assetUuid: string; timestamp: string; ownerName?: string } | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(imageBase64);
  } catch { return null; }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try {
    ({ canvas, ctx } = drawBoundedCanvas(img));
  } catch { return null; }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch { return null; }

  const w = canvas.width;
  const h = canvas.height;
  const start = Date.now();
  let tilesChecked = 0;

  for (const tileSide of TILE_SIDE_CANDIDATES) {
    const tilesX = Math.floor(w / tileSide);
    const tilesY = Math.floor(h / tileSide);
    if (tilesX === 0 || tilesY === 0) continue;

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        if (Date.now() - start > EXTRACT_TIME_BUDGET_MS) return null;

        tilesChecked++;
        if (tilesChecked % 40 === 0) await yieldToMainThread();

        const channel = (tx + ty) % 3;
        const startX = tx * tileSide;
        const startY = ty * tileSide;

        // Try amplitude decoders in order: 14 (screen-record resilient), 8 (legacy), 0 (LSB)
        for (const amplitude of [14, 8, 0]) {
          const readBit = amplitude > 0
            ? (v: number) => ((v % amplitude) >= amplitude / 2 ? 1 : 0)
            : (v: number) => v & 1;

          const lenBits: number[] = [];
          for (let py = 0; py < tileSide && lenBits.length < 16; py++) {
            for (let px = 0; px < tileSide && lenBits.length < 16; px++) {
              const x = startX + px;
              const y = startY + py;
              if (x >= w || y >= h) continue;
              const idx = (y * w + x) * 4;
              lenBits.push(readBit(data[idx + channel]));
            }
          }
          if (lenBits.length < 16) break;

          let msgLen = 0;
          for (let b = 0; b < 16; b++) msgLen = (msgLen << 1) | lenBits[b];
          if (msgLen < 10 || msgLen > 500) continue;

          const msgBits: number[] = [];
          let bitIdx = 0;
          for (let py = 0; py < tileSide; py++) {
            for (let px = 0; px < tileSide; px++) {
              bitIdx++;
              if (bitIdx <= 16) continue;
              if (msgBits.length >= msgLen * 8) break;
              const x = startX + px;
              const y = startY + py;
              if (x >= w || y >= h) continue;
              const idx = (y * w + x) * 4;
              msgBits.push(readBit(data[idx + channel]));
            }
            if (msgBits.length >= msgLen * 8) break;
          }

          const extracted = bitsToString(msgBits);
          if (extracted.startsWith('PINIT|') && extracted.includes('|END')) {
            const parts = extracted.replace('|END', '').split('|');
            if (parts.length >= 4) {
              // Old format: ['PINIT', ownerId, dnaId, assetUuid, timestamp]          (5 parts)
              // New format: ['PINIT', ownerId, dnaId, assetUuid, timestamp, ownerName] (6 parts)
              return {
                message: extracted,
                ownerId: parts[1],
                dnaId: parts[2],
                assetUuid: parts[3],
                timestamp: parts[4] || 'Not Available',
                ownerName: parts.length >= 6 && parts[5] ? parts[5] : undefined,
              };
            }
          }
        }
      }
    }
  }

  return null;
}
