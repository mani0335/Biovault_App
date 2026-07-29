/**
 * PINIT — Shared Perceptual Hash Utility
 * Single source of truth for image fingerprinting
 */

// ─── Primary: 64-char 256-bit DCT pHash (16×16 standard) ──
export const computePHash = (canvas: HTMLCanvasElement): string | null => {
  try {
    const SIZE = 32;
    const small = document.createElement('canvas');
    small.width = SIZE;
    small.height = SIZE;
    small.getContext('2d')?.drawImage(canvas, 0, 0, SIZE, SIZE);
    const data = small.getContext('2d')?.getImageData(0, 0, SIZE, SIZE).data;
    if (!data) return null;

    const gray: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++)
      gray.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);

    const DCT = 16;
    const dct: number[] = [];
    for (let u = 0; u < DCT; u++) {
      for (let v = 0; v < DCT; v++) {
        let sum = 0;
        for (let x = 0; x < SIZE; x++)
          for (let y = 0; y < SIZE; y++)
            sum +=
              gray[x * SIZE + y] *
              Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * SIZE));
        dct.push(sum);
      }
    }

    const acDct = dct.slice(1);
    const median = [...acDct].sort((a, b) => a - b)[Math.floor(acDct.length / 2)];
    const bits = ['1', ...acDct.map((v) => (v >= median ? '1' : '0'))];
    let hex = '';
    for (let i = 0; i < 256; i += 4)
      hex += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16);
    return hex.toUpperCase(); // 64 chars
  } catch {
    return null;
  }
};

// ─── Legacy: 16-char 64-bit average hash ──
export const computePHashLegacy = (canvas: HTMLCanvasElement): string | null => {
  try {
    const small = document.createElement('canvas');
    small.width = 8;
    small.height = 8;
    small.getContext('2d')?.drawImage(canvas, 0, 0, 8, 8);
    const data = small.getContext('2d')?.getImageData(0, 0, 8, 8).data;
    if (!data) return null;

    const grays: number[] = [];
    for (let i = 0; i < 64; i++) grays.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);

    const avg = grays.reduce((a, b) => a + b, 0) / 64;
    let bits = '';
    for (const g of grays) bits += g >= avg ? '1' : '0';

    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.substr(i, 4), 2).toString(16);
    return hex.toUpperCase(); // 16 chars
  } catch {
    return null;
  }
};

// ─── Hamming similarity ──
export const pHashSimilarity = (h1: string | null, h2: string | null): number | null => {
  if (!h1 || !h2) return null;
  if (h1.length !== h2.length) return null;

  const totalBits = h1.length * 4;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    const b1 = parseInt(h1[i], 16).toString(2).padStart(4, '0');
    const b2 = parseInt(h2[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) if (b1[j] !== b2[j]) diff++;
  }
  return Math.round(((totalBits - diff) / totalBits) * 100);
};

// ─── Smart compare with auto-detection ──
export const smartPHashCompare = (
  uploadedCanvas: HTMLCanvasElement,
  storedHash: string | null
): {
  sim: number | null;
  uploadedHash: string | null;
  algorithm: string | null;
  isLegacy: boolean;
  note: string | null;
} => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return {
      sim: null,
      uploadedHash: null,
      algorithm: null,
      isLegacy: false,
      note: 'No fingerprint stored — pHash comparison unavailable.',
    };

  if (storedHash.length === 64) {
    const uploadedHash = computePHash(uploadedCanvas);
    return {
      sim: pHashSimilarity(uploadedHash, storedHash),
      uploadedHash,
      algorithm: '256-bit DCT',
      isLegacy: false,
      note: null,
    };
  }

  if (storedHash.length === 16) {
    const uploadedHash = computePHashLegacy(uploadedCanvas);
    return {
      sim: pHashSimilarity(uploadedHash, storedHash),
      uploadedHash,
      algorithm: '64-bit avg (legacy)',
      isLegacy: true,
      note: 'This asset uses legacy fingerprint. Re-embed for 256-bit accuracy.',
    };
  }

  return {
    sim: null,
    uploadedHash: null,
    algorithm: null,
    isLegacy: false,
    note: `Unknown fingerprint format (length ${storedHash.length}).`,
  };
};

// ─── Rotation-aware comparison ──
const rotateCanvasUtil = (src: HTMLCanvasElement, degrees: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  const swap = degrees === 90 || degrees === 270;
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
};

export const pHashSimWithRotationCompat = (
  uploadedCanvas: HTMLCanvasElement,
  storedHash: string | null
): {
  sim: number | null;
  rotation: number;
  algorithm: string | null;
  isLegacy: boolean;
  note: string | null;
} => {
  if (!storedHash || storedHash === 'PHASH-UNAVAIL')
    return { sim: null, rotation: 0, algorithm: null, isLegacy: false, note: 'No fingerprint stored.' };

  let best = { sim: 0, rotation: 0 };
  let bestMeta: any = null;

  for (const deg of [0, 90, 180, 270]) {
    const c = deg === 0 ? uploadedCanvas : rotateCanvasUtil(uploadedCanvas, deg);
    const result = smartPHashCompare(c, storedHash);
    if (result.sim !== null && result.sim > best.sim) {
      best = { sim: result.sim, rotation: deg };
      bestMeta = result;
    }
  }
  return {
    sim: best.sim || null,
    rotation: best.rotation,
    algorithm: bestMeta?.algorithm || null,
    isLegacy: bestMeta?.isLegacy || false,
    note: bestMeta?.note || null,
  };
};

// ─── Compute pHash from base64 image data ───────────────────────────────────
export const computePHashFromBase64 = async (base64Data: string): Promise<string | null> => {
  try {
    return new Promise((resolve) => {
      // Check if Image constructor is available
      if (typeof Image === 'undefined') {
        resolve(null);
        return;
      }
      
      const img = new Image();
      img.src = base64Data;
      
      img.onload = () => {
        // Check if document and canvas are available
        if (typeof document === 'undefined' || typeof document.createElement === 'undefined') {
          resolve(null);
          return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const hash = computePHash(canvas);
        resolve(hash);
      };
      
      img.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// ─── Find duplicates in document list ───────────────────────────────────────
export interface DuplicateDocument {
  documentId: string;
  documentName: string;
  similarity: number;
  rotation: number;
}

export const findDuplicates = (
  uploadedCanvas: HTMLCanvasElement,
  existingDocuments: Array<{ id: string; name: string; pHash?: string }>,
  threshold: number = 90
): DuplicateDocument[] => {
  const duplicates: DuplicateDocument[] = [];
  
  for (const doc of existingDocuments) {
    if (!doc.pHash || doc.pHash === 'PHASH-UNAVAIL') continue;
    
    const result = pHashSimWithRotationCompat(uploadedCanvas, doc.pHash);
    if (result.sim && result.sim >= threshold) {
      duplicates.push({
        documentId: doc.id,
        documentName: doc.name,
        similarity: result.sim,
        rotation: result.rotation
      });
    }
  }
  
  // Sort by similarity (highest first)
  return duplicates.sort((a, b) => b.similarity - a.similarity);
};
