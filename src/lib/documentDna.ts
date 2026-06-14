/**
 * PINIT DNA — On-Device 6-Layer DNA Engine
 *
 * A client-side port of the Pinit-DNA "Generate DNA" pipeline, adapted to run
 * inside the Capacitor WebView (no server needed). Mirrors the 6-layer model:
 *
 *   L1 Cryptographic   — SHA-256 of the raw bytes
 *   L2 Structural      — Sobel edge signature (images) / byte histogram (docs)
 *   L3 Perceptual      — DCT pHash + aHash + dHash (images only)
 *   L4 Semantic        — RGB histogram + dominant colours (images only)
 *   L5 Metadata        — EXIF / file provenance digest
 *   L6 HMAC Seal       — HMAC-SHA256 over all layers (origin + integrity)
 *
 * Each layer runs independently with its own timing and status, so a partial
 * failure never aborts the others. Includes a weighted Verification engine and
 * a Difference engine for comparing two DNA records.
 *
 * NOTE — two Pinit-DNA features intentionally NOT ported here (they need the
 * Node + Python backend): AI Semantic Search (FAISS / sentence-transformers)
 * and Monitoring & Crawler (web crawl / Bing visual search). These call the
 * hosted PINIT-DNA REST API when available.
 */

import { computePHash } from './phash';

export type LayerStatus = 'complete' | 'failed' | 'skipped';

export interface DnaLayerResult {
  id: string;                 // 'L1' … 'L6'
  key: string;               // 'cryptographic' | 'structural' | …
  name: string;              // human label
  detail: string;            // short description shown in UI
  status: LayerStatus;
  durationMs: number;
}

export interface DocumentDNA {
  dnaId: string;                 // "DNA-A1B2-C3D4"
  signature: string;            // 16-char composed fingerprint
  version: string;             // engine version

  // ── Per-layer summary (drives the pipeline UI) ──
  layers: DnaLayerResult[];
  layerCount: number;            // layers that completed
  totalMs: number;

  // ── Raw layer values (used by Verify + Diff engines) ──
  sha256: string | null;        // L1
  edgeSignature: string | null; // L2
  pHash: string | null;         // L3 (also used for vault duplicate detection)
  aHash: string | null;         // L3
  dHash: string | null;         // L3
  colorHistogram: number[] | null; // L4 (24 bins: 8 per RGB channel)
  dominantColors: string[] | null; // L4
  exifSummary: string | null;   // L5
  hmacSeal: string | null;      // L6

  fileType: string;
  sizeBytes: number;
  composedAt: string;
}

const ENGINE_VERSION = '1.0.0-ondevice';
const IMAGE_MIME = /^image\//i;

// ─── Low-level helpers ──────────────────────────────────────────────────────

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return bufferToHex(digest);
  } catch {
    return null;
  }
}

async function sha256HexOfString(input: string): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
    return bufferToHex(digest);
  } catch {
    return null;
  }
}

async function hmacSha256(keyData: string, message: string): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(keyData || 'PINIT-DNA'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return bufferToHex(sig);
  } catch {
    return null;
  }
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function formatDnaId(signature: string): string {
  const s = signature.replace(/[^0-9A-F]/gi, '').toUpperCase().padEnd(8, '0');
  return `DNA-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

/** Load a data URL into an HTMLImageElement (handlers registered before src). */
function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      if (typeof Image === 'undefined') { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

/** Render the first page of a PDF to a canvas (via pdfjs, worker from CDN). */
async function renderPdfFirstPage(bytes: Uint8Array): Promise<HTMLCanvasElement | null> {
  try {
    const pdfjs: any = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1024, viewport.width);
    canvas.height = Math.round(canvas.width * (viewport.height / viewport.width));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const renderViewport = page.getViewport({ scale: canvas.width / viewport.width * 1.2 });
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
    return canvas;
  } catch {
    return null;
  }
}

/** Capture a representative frame from a video data URL to a canvas. */
function captureVideoFrame(dataUrl: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'metadata';
      let settled = false;
      const done = (c: HTMLCanvasElement | null) => { if (!settled) { settled = true; resolve(c); } };
      const grab = () => {
        try {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w || !h) { done(null); return; }
          const canvas = document.createElement('canvas');
          const cap = 1024; const scale = Math.min(1, cap / Math.max(w, h));
          canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          done(canvas);
        } catch { done(null); }
      };
      video.onloadeddata = () => {
        try { video.currentTime = Math.min(1, (video.duration || 2) / 2); } catch { grab(); }
      };
      video.onseeked = grab;
      video.onerror = () => done(null);
      setTimeout(() => { if (!settled) grab(); }, 3000); // safety fallback
      video.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolve a visual still image for any supported file:
 *   image → itself · PDF → first page · video → a frame.
 * Returns an HTMLImageElement the layer functions can analyse, or null.
 */
async function getVisualImage(dataUrl: string, mime: string, bytes: Uint8Array | null): Promise<HTMLImageElement | null> {
  if (IMAGE_MIME.test(mime)) return loadImage(dataUrl);
  if (mime === 'application/pdf' && bytes) {
    const canvas = await renderPdfFirstPage(bytes);
    return canvas ? loadImage(canvas.toDataURL('image/png')) : null;
  }
  if (/^video\//i.test(mime)) {
    const canvas = await captureVideoFrame(dataUrl);
    return canvas ? loadImage(canvas.toDataURL('image/png')) : null;
  }
  return null;
}

/** Draw an image into an offscreen canvas at a target size and read pixels. */
function imageToGray(img: HTMLImageElement, w: number, h: number): number[] | null {
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray: number[] = [];
    for (let i = 0; i < w * h; i++) {
      gray.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }
    return gray;
  } catch {
    return null;
  }
}

// ─── L2 Structural — Sobel edge signature ───────────────────────────────────
function sobelEdgeSignature(img: HTMLImageElement): string | null {
  const S = 32;
  const gray = imageToGray(img, S, S);
  if (!gray) return null;
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const mags: number[] = [];
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[(y + dy) * S + (x + dx)];
          sx += v * gx[k]; sy += v * gy[k]; k++;
        }
      mags.push(Math.sqrt(sx * sx + sy * sy));
    }
  }
  // Coarse 8×8 occupancy grid → 64 bits → 16 hex
  const sorted = [...mags].sort((a, b) => a - b);
  const thresh = sorted[Math.floor(sorted.length * 0.6)] || 0;
  const grid = new Array(64).fill(0);
  const side = S - 2;
  for (let i = 0; i < mags.length; i++) {
    const gxIdx = Math.floor((i % side) / (side / 8));
    const gyIdx = Math.floor(Math.floor(i / side) / (side / 8));
    if (mags[i] >= thresh) grid[gyIdx * 8 + gxIdx]++;
  }
  let bits = '';
  const gmax = Math.max(...grid, 1);
  for (const g of grid) bits += g >= gmax / 4 ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.toUpperCase();
}

// ─── L2 (docs) — byte-distribution signature ────────────────────────────────
function byteHistogramSignature(bytes: Uint8Array): string {
  const bins = new Uint32Array(256);
  const stride = Math.max(1, Math.floor(bytes.length / 200_000));
  for (let i = 0; i < bytes.length; i += stride) bins[bytes[i]]++;
  const max = bins.reduce((m, v) => (v > m ? v : m), 1);
  let sig = '';
  for (let i = 0; i < 256; i++) sig += Math.round((bins[i] / max) * 15).toString(16);
  return (fnv1aHex(sig.slice(0, 128)) + fnv1aHex(sig.slice(128))).toUpperCase();
}

// ─── L3 — aHash (average) / dHash (difference) ──────────────────────────────
function aHash(img: HTMLImageElement): string | null {
  const gray = imageToGray(img, 8, 8);
  if (!gray) return null;
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  let bits = '';
  for (const g of gray) bits += g >= avg ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.toUpperCase();
}

function dHash(img: HTMLImageElement): string | null {
  const gray = imageToGray(img, 9, 8);
  if (!gray) return null;
  let bits = '';
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.toUpperCase();
}

// ─── L4 — RGB histogram + dominant colours ──────────────────────────────────
function colorAnalysis(img: HTMLImageElement): { histogram: number[]; dominant: string[] } | null {
  try {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, S, S);
    const data = ctx.getImageData(0, 0, S, S).data;
    const hist = new Array(24).fill(0); // 8 bins × RGB
    const buckets: Record<string, number> = {};
    for (let i = 0; i < S * S; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      hist[Math.min(7, r >> 5)]++;
      hist[8 + Math.min(7, g >> 5)]++;
      hist[16 + Math.min(7, b >> 5)]++;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }
    const total = S * S;
    const histNorm = hist.map((v) => Math.round((v / total) * 1000) / 1000);
    const dominant = Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => {
        const [r, g, bl] = k.split(',').map((n) => (parseInt(n) << 5) + 16);
        return `#${[r, g, bl].map((x) => Math.min(255, x).toString(16).padStart(2, '0')).join('')}`;
      });
    return { histogram: histNorm, dominant };
  } catch {
    return null;
  }
}

// ─── L5 — metadata / EXIF ───────────────────────────────────────────────────
async function metadataSummary(dataUrl: string, isImage: boolean, fileName: string, mime: string, size: number): Promise<string | null> {
  let exifPart = '';
  if (isImage) {
    try {
      const exifr = (await import('exifr')).default as any;
      const tags = await exifr.parse(dataUrl).catch(() => null);
      if (tags) {
        const make = tags.Make || tags.make;
        const model = tags.Model || tags.model;
        const date = tags.DateTimeOriginal || tags.CreateDate;
        exifPart = [make, model, date].filter(Boolean).join(' · ');
      }
    } catch { /* exifr unavailable / no EXIF */ }
  }
  const base = `${fileName}|${mime}|${size}`;
  return exifPart ? `${exifPart} · ${base}` : base;
}

// ─── Similarity helpers (for Verify + Diff) ─────────────────────────────────
function hexHamming(h1: string | null, h2: string | null): number | null {
  if (!h1 || !h2 || h1.length !== h2.length) return null;
  const bits = h1.length * 4;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    const a = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    diff += (a & 1) + ((a >> 1) & 1) + ((a >> 2) & 1) + ((a >> 3) & 1);
  }
  return Math.round(((bits - diff) / bits) * 100);
}

function histogramSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length !== b.length) return null;
  let inter = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { inter += Math.min(a[i], b[i]); sum += Math.max(a[i], b[i]); }
  return sum === 0 ? 100 : Math.round((inter / sum) * 100);
}

// ─── Public: Generate DNA ───────────────────────────────────────────────────

export async function generateDocumentDNA(
  dataUrl: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): Promise<DocumentDNA> {
  const composedAt = new Date().toISOString();
  const isImage = IMAGE_MIME.test(mimeType);
  const bytes = dataUrlToBytes(dataUrl);
  // Resolve a still frame for image / PDF (page 1) / video (a frame) so the
  // perceptual + semantic layers run on documents and videos too.
  const img = await getVisualImage(dataUrl, mimeType, bytes);
  const layers: DnaLayerResult[] = [];
  const t = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ── L1 Cryptographic ──
  let sha256: string | null = null;
  {
    const s = t();
    if (bytes) sha256 = await sha256Hex(bytes);
    layers.push({ id: 'L1', key: 'cryptographic', name: 'Cryptographic Fingerprint',
      detail: 'SHA-256 of raw bytes', status: sha256 ? 'complete' : 'failed', durationMs: Math.round(t() - s) });
  }

  // ── L2 Structural ──
  let edgeSignature: string | null = null;
  {
    const s = t();
    if (img) edgeSignature = sobelEdgeSignature(img);
    else if (bytes) edgeSignature = byteHistogramSignature(bytes);
    layers.push({ id: 'L2', key: 'structural', name: 'Structural Fingerprint',
      detail: img ? 'Sobel edge signature' : 'Byte distribution', status: edgeSignature ? 'complete' : 'failed', durationMs: Math.round(t() - s) });
  }

  // ── L3 Perceptual ──
  let pHash: string | null = null, ah: string | null = null, dh: string | null = null;
  {
    const s = t();
    if (img) {
      try {
        const c = document.createElement('canvas');
        const cap = 512; const scale = Math.min(1, cap / Math.max(img.width || 1, img.height || 1));
        c.width = Math.max(1, Math.round((img.width || cap) * scale));
        c.height = Math.max(1, Math.round((img.height || cap) * scale));
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        pHash = computePHash(c);
      } catch { pHash = null; }
      ah = aHash(img); dh = dHash(img);
    }
    const ok = !!(pHash || ah || dh);
    layers.push({ id: 'L3', key: 'perceptual', name: 'Perceptual Hash',
      detail: 'DCT pHash + aHash + dHash', status: ok ? 'complete' : 'skipped', durationMs: Math.round(t() - s) });
  }

  // ── L4 Semantic (colour/content distribution) ──
  let colorHistogram: number[] | null = null, dominantColors: string[] | null = null;
  {
    const s = t();
    if (img) {
      const ca = colorAnalysis(img);
      if (ca) { colorHistogram = ca.histogram; dominantColors = ca.dominant; }
    }
    layers.push({ id: 'L4', key: 'semantic', name: 'Semantic Analysis',
      detail: img ? 'RGB histogram + dominant colours' : 'Images/PDF/video only', status: colorHistogram ? 'complete' : 'skipped', durationMs: Math.round(t() - s) });
  }

  // ── L5 Metadata Provenance ──
  let exifSummary: string | null = null;
  {
    const s = t();
    exifSummary = await metadataSummary(dataUrl, isImage, fileName, mimeType, sizeBytes);
    layers.push({ id: 'L5', key: 'metadata', name: 'Metadata Provenance',
      detail: 'EXIF / file provenance', status: exifSummary ? 'complete' : 'failed', durationMs: Math.round(t() - s) });
  }

  // ── L6 HMAC Signature Seal ──
  const composedInput = [sha256, edgeSignature, pHash, ah, dh, (colorHistogram || []).join(','), exifSummary]
    .filter(Boolean).join('|');
  let hmacSeal: string | null = null;
  {
    const s = t();
    hmacSeal = await hmacSha256(sha256 || 'PINIT-DNA', composedInput);
    layers.push({ id: 'L6', key: 'steganography', name: 'HMAC Signature Seal',
      detail: 'HMAC-SHA256 of all layers', status: hmacSeal ? 'complete' : 'failed', durationMs: Math.round(t() - s) });
  }

  // ── Compose final signature ──
  const composedDigest = await sha256HexOfString(composedInput);
  const signature = (composedDigest ?? fnv1aHex(composedInput).repeat(2)).slice(0, 16).toUpperCase();
  const layerCount = layers.filter((l) => l.status === 'complete').length;
  const totalMs = layers.reduce((sum, l) => sum + l.durationMs, 0);

  return {
    dnaId: formatDnaId(signature),
    signature,
    version: ENGINE_VERSION,
    layers,
    layerCount,
    totalMs,
    sha256,
    edgeSignature,
    pHash,
    aHash: ah,
    dHash: dh,
    colorHistogram,
    dominantColors,
    exifSummary,
    hmacSeal,
    fileType: mimeType,
    sizeBytes,
    composedAt,
  };
}

// ─── Public: Verify engine (weighted per-layer scoring) ─────────────────────

export interface LayerScore { key: string; name: string; similarity: number | null; weight: number; }
export interface VerificationResult {
  passed: boolean;
  confidence: number;            // 0–100 weighted
  layerScores: LayerScore[];
  verifiedAt: string;
}

const LAYER_WEIGHTS: Record<string, number> = {
  cryptographic: 0.30, structural: 0.20, perceptual: 0.20,
  semantic: 0.15, metadata: 0.05, steganography: 0.10,
};
const PASS_THRESHOLD = 75;

/** Generate DNA for a probe file and score it against a stored DNA record. */
export async function verifyDocumentDNA(
  probeDataUrl: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  stored: DocumentDNA
): Promise<VerificationResult> {
  const probe = await generateDocumentDNA(probeDataUrl, fileName, mimeType, sizeBytes);

  const cryptoSim = stored.sha256 && probe.sha256 ? (stored.sha256 === probe.sha256 ? 100 : 0) : null;
  const structSim = hexHamming(stored.edgeSignature, probe.edgeSignature);
  const percSim = (() => {
    const a = hexHamming(stored.pHash, probe.pHash);
    const b = hexHamming(stored.aHash, probe.aHash);
    const c = hexHamming(stored.dHash, probe.dHash);
    const vals = [a, b, c].filter((x): x is number => x !== null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  })();
  const semSim = histogramSimilarity(stored.colorHistogram, probe.colorHistogram);
  const metaSim = stored.exifSummary && probe.exifSummary
    ? (stored.exifSummary === probe.exifSummary ? 100 : 50) : null;
  const stegoSim = stored.hmacSeal && probe.hmacSeal ? (stored.hmacSeal === probe.hmacSeal ? 100 : 0) : null;

  const layerScores: LayerScore[] = [
    { key: 'cryptographic', name: 'Cryptographic', similarity: cryptoSim, weight: LAYER_WEIGHTS.cryptographic },
    { key: 'structural',    name: 'Structural',    similarity: structSim, weight: LAYER_WEIGHTS.structural },
    { key: 'perceptual',    name: 'Perceptual',    similarity: percSim,   weight: LAYER_WEIGHTS.perceptual },
    { key: 'semantic',      name: 'Semantic',      similarity: semSim,    weight: LAYER_WEIGHTS.semantic },
    { key: 'metadata',      name: 'Metadata',      similarity: metaSim,   weight: LAYER_WEIGHTS.metadata },
    { key: 'steganography', name: 'HMAC Seal',     similarity: stegoSim,  weight: LAYER_WEIGHTS.steganography },
  ];

  let weighted = 0, weightSum = 0;
  for (const l of layerScores) {
    if (l.similarity !== null) { weighted += l.similarity * l.weight; weightSum += l.weight; }
  }
  const confidence = weightSum > 0 ? Math.round(weighted / weightSum) : 0;

  return { passed: confidence >= PASS_THRESHOLD, confidence, layerScores, verifiedAt: new Date().toISOString() };
}

// ─── Public: Difference engine (compare two stored DNA records) ─────────────

export interface DnaDifference {
  overallSimilarity: number;     // 0–100
  identical: boolean;
  layerDiffs: { key: string; name: string; similarity: number | null }[];
}

// Similarity weighting emphasises the VISUAL layers (perceptual/structural/
// semantic) so a re-saved or re-shared copy still scores high, while the
// exact-match layers (crypto/metadata/HMAC) act as bonus signals — they don't
// drag the score to ~0 just because the file bytes changed.
const SIM_WEIGHTS: Record<string, number> = {
  perceptual: 0.42, structural: 0.26, semantic: 0.20,
  cryptographic: 0.06, metadata: 0.03, steganography: 0.03,
};

export function diffDocumentDNA(a: DocumentDNA, b: DocumentDNA): DnaDifference {
  const layerDiffs = [
    { key: 'cryptographic', name: 'Cryptographic', similarity: a.sha256 && b.sha256 ? (a.sha256 === b.sha256 ? 100 : 0) : null },
    { key: 'structural',    name: 'Structural',    similarity: hexHamming(a.edgeSignature, b.edgeSignature) },
    { key: 'perceptual',    name: 'Perceptual',    similarity: hexHamming(a.pHash, b.pHash) },
    { key: 'semantic',      name: 'Semantic',      similarity: histogramSimilarity(a.colorHistogram, b.colorHistogram) },
    { key: 'metadata',      name: 'Metadata',      similarity: (a.exifSummary && b.exifSummary) ? (a.exifSummary === b.exifSummary ? 100 : 50) : null },
    { key: 'steganography', name: 'HMAC Seal',     similarity: a.hmacSeal && b.hmacSeal ? (a.hmacSeal === b.hmacSeal ? 100 : 0) : null },
  ];

  // Weighted average over the layers both records actually have, renormalised
  // by the present weights so missing layers neither help nor hurt.
  let weighted = 0, weightSum = 0;
  for (const l of layerDiffs) {
    if (l.similarity === null) continue;
    const w = SIM_WEIGHTS[l.key] ?? 0;
    weighted += l.similarity * w;
    weightSum += w;
  }
  const overallSimilarity = weightSum > 0 ? Math.round(weighted / weightSum) : 0;
  return { overallSimilarity, identical: a.signature === b.signature, layerDiffs };
}
