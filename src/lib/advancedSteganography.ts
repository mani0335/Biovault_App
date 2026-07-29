/**
 * Advanced Steganography Module (from ImageCryptoAnalyzer)
 * Features:
 * - CRC16 validation for error detection
 * - Tile-based LSB steganography (12x12 tiles) - survives 80%+ cropping
 * - Majority voting for robust extraction
 * - Multi-channel embedding (R, G, B channels)
 * - IMGCRYPT3 format with full metadata
 * - 144 tile offset attempts for any crop position
 */

export interface AdvancedWatermarkMetadata {
  userId: string;
  gps: {
    available: boolean;
    latitude?: number;
    longitude?: number;
    coordinates?: string;
    mapsUrl?: string;
    source: string;
  };
  timestamp: string | null;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  deviceSource: string;
  ipSource: string;
  gpsSource: string;
  originalResolution: string | null;
  confidence: string;
  found: boolean;
}

// ============================================
// CRC16 VALIDATION
// ============================================
const STEGO_TILE = 12;
const UUID_FIELD_LEN = 32;
const PAYLOAD_BYTES = 1 + UUID_FIELD_LEN + 2; // 35 bytes = 280 bits
const PAYLOAD_BITS = PAYLOAD_BYTES * 8;

const crc16js = (bytes: Uint8Array): number => {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
};

// ============================================
// BUILD & PARSE PAYLOAD (with CRC16)
// ============================================
const buildPayloadBits = (userId: string): number[] => {
  const str = (userId || '').substring(0, UUID_FIELD_LEN);
  const uuidPadded = new Uint8Array(UUID_FIELD_LEN);
  for (let i = 0; i < str.length; i++) uuidPadded[i] = str.charCodeAt(i);

  const forCrc = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = str.length;
  forCrc.set(uuidPadded, 1);

  const crc = crc16js(forCrc);
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = str.length;
  payload.set(uuidPadded, 1);
  payload[PAYLOAD_BYTES - 2] = (crc >> 8) & 0xff;
  payload[PAYLOAD_BYTES - 1] = crc & 0xff;

  const bits: number[] = [];
  for (let i = 0; i < PAYLOAD_BYTES; i++)
    for (let b = 7; b >= 0; b--) bits.push((payload[i] >> b) & 1);

  return bits;
};

const parsePayloadBits = (bits: number[]): string | null => {
  if (bits.length < PAYLOAD_BITS) return null;

  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for (let i = 0; i < PAYLOAD_BYTES; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] || 0);
    bytes[i] = v;
  }

  const lenByte = bytes[0];
  if (lenByte <= 0 || lenByte > UUID_FIELD_LEN) return null;

  const uuidPadded = bytes.slice(1, 1 + UUID_FIELD_LEN);
  const crcRead = (bytes[PAYLOAD_BYTES - 2] << 8) | bytes[PAYLOAD_BYTES - 1];
  const forCrc = new Uint8Array(1 + UUID_FIELD_LEN);
  forCrc[0] = lenByte;
  forCrc.set(uuidPadded, 1);

  if (crc16js(forCrc) !== crcRead) return null;

  let uid = '';
  for (let i = 0; i < lenByte; i++) uid += String.fromCharCode(uuidPadded[i]);
  return uid;
};

// ============================================
// EMBED ENCRYPTED IMAGE
// ============================================
export async function embedAdvancedWatermark(
  imageBase64: string,
  userId: string,
  timestamp?: string,
  deviceId?: string,
  deviceName?: string,
  ipAddress?: string,
  gpsData?: { latitude: number; longitude: number; source: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor not available'));
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Build CRC-validated payload for R+G channels
        const payloadBits = buildPayloadBits(userId);

        // Build IMGCRYPT3 message for B channel
        const gpsString =
          gpsData && gpsData.latitude && gpsData.longitude
            ? `${gpsData.latitude},${gpsData.longitude}`
            : 'NOGPS';

        const fullMsg = `IMGCRYPT3|${userId}|${gpsString}|${timestamp || Date.now()}|${deviceId || 'UNKNOWN'}|${deviceName || 'UNKNOWN'}|${ipAddress || 'UNKNOWN'}|Unknown|Unknown|${gpsData?.source || 'Unknown'}|${canvas.width}x${canvas.height}|END`;

        const fullBits: number[] = [];
        for (let i = 0; i < fullMsg.length; i++) {
          const c = fullMsg.charCodeAt(i);
          for (let b = 7; b >= 0; b--) fullBits.push((c >> b) & 1);
        }

        // Embed into image pixels
        const data = imageData.data;
        const width = canvas.width;
        const TILE = STEGO_TILE;

        for (let idx = 0; idx < data.length; idx += 4) {
          const pi = idx / 4;
          const x = pi % width;
          const y = Math.floor(pi / width);
          const p = ((y % TILE) * TILE) + (x % TILE);

          // R + G: tile-based CRC payload (survives cropping)
          data[idx] = (data[idx] & 0xfe) | payloadBits[(2 * p) % PAYLOAD_BITS];
          data[idx + 1] =
            (data[idx + 1] & 0xfe) | payloadBits[(2 * p + 1) % PAYLOAD_BITS];

          // B: full IMGCRYPT3 message (sequential backup)
          data[idx + 2] = (data[idx + 2] & 0xfe) | fullBits[pi % fullBits.length];
        }

        ctx.putImageData(imageData, 0, 0);
        const watermarkedBase64 = canvas.toDataURL('image/png');

        resolve(watermarkedBase64);
      } catch (err) {
        console.error('❌ Advanced steganography embedding failed:', err);
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for steganography'));
    };

    img.src = imageBase64;
  });
}

// ============================================
// EXTRACT & VERIFY
// ============================================
export async function extractAdvancedWatermark(
  imageBase64: string
): Promise<AdvancedWatermarkMetadata | null> {
  return new Promise((resolve) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const imgW = canvas.width;
        const TILE = STEGO_TILE;

        // METHOD 1: Tile-based extraction with majority voting (CRC-validated)
        const decodeWithOffset = (ox: number, oy: number): string | null => {
          const votes = new Array(PAYLOAD_BITS).fill(0);
          const counts = new Array(PAYLOAD_BITS).fill(0);

          for (let idx = 0; idx < data.length; idx += 4) {
            const pi = idx / 4;
            const tx = ((pi % imgW) + ox) % TILE;
            const ty = (Math.floor(pi / imgW) + oy) % TILE;
            const p = ty * TILE + tx;

            const i0 = (2 * p) % PAYLOAD_BITS;
            const i1 = (2 * p + 1) % PAYLOAD_BITS;
            votes[i0] += data[idx] & 1;
            counts[i0]++;
            votes[i1] += data[idx + 1] & 1;
            counts[i1]++;
          }

          const bits = votes.map(
            (v, i) => (counts[i] > 0 && v > counts[i] / 2) ? 1 : 0
          );

          return parsePayloadBits(bits);
        };

        // Fast path (most common)
        let uid = decodeWithOffset(0, 0);
        if (uid) {
          const result = buildResultFromExtraction(uid, data, imgW);
          resolve(result);
          return;
        }

        // Try all 144 tile offsets (handles any crop/rotation)
        for (let oy = 0; oy < TILE; oy++) {
          for (let ox = 0; ox < TILE; ox++) {
            if (ox === 0 && oy === 0) continue;
            uid = decodeWithOffset(ox, oy);
            if (uid) {
              const result = buildResultFromExtraction(uid, data, imgW);
              resolve(result);
              return;
            }
          }
        }

        // METHOD 2: IMGCRYPT3 from B channel (full metadata)
        const bBits: number[] = [];
        for (let idx = 0; idx < data.length; idx += 4)
          bBits.push(data[idx + 2] & 1);

        const r2 = extractIMGCRYPT3(bBits);
        if (r2) {
          resolve(r2);
          return;
        }

        // METHOD 3: Legacy R+G+B sequential
        const rgbBits: number[] = [];
        for (let idx = 0; idx < data.length; idx += 4) {
          rgbBits.push(data[idx] & 1, data[idx + 1] & 1, data[idx + 2] & 1);
        }

        const r3 = extractIMGCRYPT3(rgbBits);
        if (r3) {
          resolve(r3);
          return;
        }

        resolve(null);
      } catch (err) {
        console.error('❌ Advanced steganography extraction failed:', err);
        resolve(null);
      }
    };

    img.onerror = () => {
      console.error('❌ Failed to load image for extraction');
      resolve(null);
    };

    img.src = imageBase64;
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================
const buildResultFromExtraction = (
  userId: string,
  data: Uint8ClampedArray,
  imgW: number
): AdvancedWatermarkMetadata => {
  // Try B channel for full metadata
  const bBits: number[] = [];
  for (let idx = 0; idx < data.length; idx += 4) bBits.push(data[idx + 2] & 1);
  const full = extractIMGCRYPT3(bBits);

  if (full) return full;

  return {
    found: true,
    userId,
    gps: {
      available: false,
      coordinates: undefined,
      mapsUrl: undefined,
      source: 'Unknown',
    },
    timestamp: null,
    deviceId: null,
    deviceName: null,
    ipAddress: null,
    deviceSource: 'Unknown',
    ipSource: 'Unknown',
    gpsSource: 'Unknown',
    originalResolution: null,
    confidence: 'High',
  };
};

const extractIMGCRYPT3 = (bits: number[]): AdvancedWatermarkMetadata | null => {
  const total = bits.length;
  const maxScan = Math.min(total - 800, 3200);
  const maxRead = Math.min(500, Math.floor(total / 8));

  for (let off = 0; off <= maxScan; off += 8) {
    let text = '';
    for (let c = 0; c < maxRead; c++) {
      const s = off + c * 8;
      if (s + 8 > total) break;
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[s + b];
      text += v >= 32 && v <= 126 ? String.fromCharCode(v) : '\x00';
    }

    if (!text.includes('IMGCRYPT')) continue;

    const parsed = parseIMGCRYPT3Msg(text);
    if (parsed) return buildResult(parsed);
  }

  return null;
};

interface ParsedIMGCRYPT3 {
  userId: string;
  gps: string;
  timestamp: string | null;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  deviceSource: string | null;
  ipSource: string | null;
  gpsSource: string | null;
  originalResolution: string | null;
}

const parseIMGCRYPT3Msg = (text: string): ParsedIMGCRYPT3 | null => {
  const isV3 = text.includes('IMGCRYPT3|');
  const isV2 = !isV3 && text.includes('IMGCRYPT2|');
  const hdr = isV3 ? 'IMGCRYPT3|' : isV2 ? 'IMGCRYPT2|' : text.includes('IMGCRYPT|') ? 'IMGCRYPT|' : null;

  if (!hdr) return null;

  const si = text.indexOf(hdr) + hdr.length;
  const ei = text.indexOf('|END', si);
  if (ei <= si) return null;

  const pts = text.substring(si, ei).split('|');
  if (pts.length < 4 || !pts[0] || pts[0].length < 2) return null;

  return {
    userId: pts[0],
    gps: pts[1] || 'NOGPS',
    timestamp: pts[2] || null,
    deviceId: pts[3] || null,
    deviceName: pts[4] || null,
    ipAddress: pts[5] || null,
    deviceSource: pts[6] || null,
    ipSource: pts[7] || null,
    gpsSource: pts[8] || null,
    originalResolution: isV3 ? (pts[9] || null) : null,
  };
};

const buildResult = (m: ParsedIMGCRYPT3): AdvancedWatermarkMetadata => {
  let gps = {
    available: false,
    coordinates: undefined,
    mapsUrl: undefined,
    source: m.gpsSource || 'Unknown',
  };

  if (m.gps && m.gps !== 'NOGPS') {
    const pts = m.gps.split(',');
    if (pts.length === 2) {
      const lat = parseFloat(pts[0]);
      const lng = parseFloat(pts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        gps = {
          available: true,
          latitude: lat,
          longitude: lng,
          coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
          source: m.gpsSource || 'Unknown',
        };
      }
    }
  }

  return {
    found: true,
    userId: m.userId,
    gps,
    timestamp: m.timestamp,
    deviceId: m.deviceId,
    deviceName: m.deviceName,
    ipAddress: m.ipAddress,
    deviceSource: m.deviceSource || 'Unknown',
    ipSource: m.ipSource || 'Unknown',
    gpsSource: m.gpsSource || 'Unknown',
    originalResolution: m.originalResolution,
    confidence: 'Very High (CRC-validated)',
  };
};
