/**
 * PINIT Crypto & Steganography Utilities
 * Image embedding, encryption, and metadata extraction
 */

// ─── LSB Steganography Constants ──
const STEGO_TILE = 12;
const UUID_FIELD_LEN = 32; // 32 hex chars
const PAYLOAD_BYTES = 1 + UUID_FIELD_LEN + 2; // 35 bytes
const PAYLOAD_BITS = PAYLOAD_BYTES * 8; // 280 bits

// ─── CRC16 for payload validation ──
export const crc16js = (bytes: Uint8Array): number => {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
};

// ─── Build payload bits from userId ──
export const buildPayloadBits = (userId: string): number[] => {
  const str = (userId || '').replace(/-/g, '').substring(0, UUID_FIELD_LEN);
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
  for (let i = 0; i < PAYLOAD_BYTES; i++) for (let b = 7; b >= 0; b--) bits.push((payload[i] >> b) & 1);
  return bits;
};

// ─── Parse payload bits ──
export const parsePayloadBits = (bits: number[]): string | null => {
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

  // Restore hyphens if looks like UUID
  if (uid.length === 32 && /^[0-9a-fA-F]{32}$/.test(uid)) {
    uid = `${uid.slice(0, 8)}-${uid.slice(8, 12)}-${uid.slice(12, 16)}-${uid.slice(16, 20)}-${uid.slice(20)}`;
  }

  return uid;
};

// ─── Embed UUID & metadata into image ──
export const embedUUIDAdvanced = (
  imageData: ImageData,
  userId: string,
  gpsData: any,
  deviceInfo: any,
  ipAddress: string,
  timestamp: string | number,
  deviceSource: string,
  ipSource: string,
  gpsSource: string,
  width: number,
  height: number
): ImageData => {
  const data = imageData.data;
  const payloadBits = buildPayloadBits(userId);

  const gpsString = gpsData && gpsData.available ? `${gpsData.latitude},${gpsData.longitude}` : 'NOGPS';
  const fullMsg = `IMGCRYPT3|${userId}|${gpsString}|${timestamp || Date.now()}|${deviceInfo.deviceId || 'UNKNOWN'}|${deviceInfo.deviceName || 'UNKNOWN'}|${ipAddress || 'UNKNOWN'}|${deviceSource || 'Unknown'}|${ipSource || 'Unknown'}|${gpsSource || 'Unknown'}|${width}x${height}|END`;

  const fullBits: number[] = [];
  for (let i = 0; i < fullMsg.length; i++) {
    const c = fullMsg.charCodeAt(i);
    for (let b = 7; b >= 0; b--) fullBits.push((c >> b) & 1);
  }

  const TILE = STEGO_TILE;
  for (let idx = 0; idx < data.length; idx += 4) {
    const pi = idx / 4;
    const x = pi % width;
    const y = Math.floor(pi / width);
    const p = (y % TILE) * TILE + (x % TILE);

    data[idx] = (data[idx] & 0xfe) | payloadBits[(2 * p) % PAYLOAD_BITS];
    data[idx + 1] = (data[idx + 1] & 0xfe) | payloadBits[(2 * p + 1) % PAYLOAD_BITS];
    data[idx + 2] = (data[idx + 2] & 0xfe) | fullBits[pi % fullBits.length];
  }

  return imageData;
};

// ─── Extract UUID from image ──
export const extractUUIDAdvanced = (imageData: ImageData): ExtractedMetadata => {
  const data = imageData.data;
  const imgW = imageData.width || Math.round(Math.sqrt(data.length / 4)) || 1;
  const TILE = STEGO_TILE;

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

    const bits = votes.map((v, i) => (counts[i] > 0 && v > counts[i] / 2 ? 1 : 0));
    return parsePayloadBits(bits);
  };

  // Try offset (0,0)
  let uid = decodeWithOffset(0, 0);
  if (uid) return buildResultFromUserId(uid, data, imgW);

  // Try all offsets
  for (let oy = 0; oy < TILE; oy++) {
    for (let ox = 0; ox < TILE; ox++) {
      if (ox === 0 && oy === 0) continue;
      uid = decodeWithOffset(ox, oy);
      if (uid) return buildResultFromUserId(uid, data, imgW);
    }
  }

  // Fallback: not found
  return { found: false, userId: '' };
};

const buildResultFromUserId = (userId: string, data: Uint8ClampedArray, imgW: number): ExtractedMetadata => {
  return {
    found: true,
    userId,
    gps: { available: false, coordinates: null, mapsUrl: null, source: 'Unknown' },
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

// ─── SHA-256 hash of file ──
export const computeSHA256 = async (file: File): Promise<string> => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'sha256-unavailable-' + Date.now().toString(16);
  }
};

// ─── EXIF extraction ──
export const getCaptureTime = (file: File): Promise<CaptureTimeData> => {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target?.result as ArrayBuffer);
          if (view.getUint16(0, false) !== 0xffd8) {
            resolve(getFileFallbackTime(file));
            return;
          }

          let offset = 2;
          while (offset < view.byteLength) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            if (marker === 0xffe1) {
              const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
                view.getUint8(offset + 4),
                view.getUint8(offset + 5)
              );

              if (exifHeader === 'Exif') {
                const tiffOffset = offset + 8;
                const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const numEntries = view.getUint16(tiffOffset + ifdOffset, littleEndian);

                for (let i = 0; i < numEntries; i++) {
                  const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
                  const tag = view.getUint16(entryOffset, littleEndian);

                  if (tag === 0x9003 || tag === 0x9004) {
                    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
                    let dateStr = '';

                    for (let k = 0; k < 19; k++) {
                      dateStr += String.fromCharCode(view.getUint8(tiffOffset + valueOffset + k));
                    }

                    const parts = dateStr.split(' ');
                    if (parts.length === 2) {
                      const dateParts = parts[0].split(':');
                      const timeParts = parts[1].split(':');

                      if (dateParts.length === 3 && timeParts.length === 3) {
                        const captureDate = new Date(
                          parseInt(dateParts[0]),
                          parseInt(dateParts[1]) - 1,
                          parseInt(dateParts[2]),
                          parseInt(timeParts[0]),
                          parseInt(timeParts[1]),
                          parseInt(timeParts[2])
                        );

                        resolve({ timestamp: captureDate.getTime(), source: 'EXIF', dateString: dateStr });
                        return;
                      }
                    }
                  }
                }
              }

              resolve(getFileFallbackTime(file));
              return;
            }

            if (marker === 0xffd9 || marker === 0xffda) break;
            const length = view.getUint16(offset, false);
            offset += length;
          }

          resolve(getFileFallbackTime(file));
        } catch (error) {
          resolve(getFileFallbackTime(file));
        }
      };

      reader.onerror = () => resolve(getFileFallbackTime(file));
      reader.readAsArrayBuffer(file.slice(0, 128 * 1024));
    } else {
      resolve(getFileFallbackTime(file));
    }
  });
};

const getFileFallbackTime = (file: File): CaptureTimeData => {
  if (file.lastModified) {
    return {
      timestamp: file.lastModified,
      source: 'File Modified',
      dateString: new Date(file.lastModified).toLocaleString(),
    };
  }
  return { timestamp: Date.now(), source: 'Current Time', dateString: new Date().toLocaleString() };
};

// ─── Device fingerprinting ──
/**
 * Get device fingerprint/ID with persistence
 * 
 * Priority:
 * 1. Hardware UUID (cached) - permanent ID even after uninstall
 * 2. Browser fingerprint - calculated from device properties
 * 
 * This returns the same value across uninstall/reinstall
 */
export const getDeviceFingerprint = (): string => {
  // ✅ Step 1: Check for cached hardware UUID (most persistent)
  const hardwareUUID = localStorage.getItem('biovault_hardwareUUID');
  if (hardwareUUID) {
    return hardwareUUID;
  }
  
  // ✅ Step 2: Check for registered device token (from previous registration)
  const registeredToken = localStorage.getItem('biovault_registeredDeviceToken');
  if (registeredToken) {
    return registeredToken;
  }
  
  // ✅ Step 3: Generate browser fingerprint as fallback
  let deviceId = localStorage.getItem('deviceFingerprint');

  if (!deviceId) {
    const screenData = window.screen.width + 'x' + window.screen.height + 'x' + window.screen.colorDepth;
    const platform = navigator.platform || 'unknown';
    const cores = navigator.hardwareConcurrency || 0;
    const memory = navigator.deviceMemory || 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const language = navigator.language || 'unknown';
    const touchPoints = navigator.maxTouchPoints || 0;
    const userAgent = navigator.userAgent || 'unknown';

    const fingerprint = `${screenData}|${platform}|${cores}|${memory}|${timezone}|${language}|${touchPoints}|${userAgent}`;

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
      hash |= 0;
    }

    const hashStr = Math.abs(hash).toString(36).toUpperCase().slice(0, 8);
    const deviceType = /Android|iPhone|iPad/i.test(userAgent) ? 'MOB' : 'DSK';
    deviceId = `${deviceType}-${hashStr}`;
    localStorage.setItem('deviceFingerprint', deviceId);
  }

  return deviceId;
};

export const getPublicIP = async (): Promise<string> => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = (await res.json()) as any;
    return data.ip || 'Unavailable';
  } catch {
    return 'Unavailable';
  }
};

// ─── Type definitions ──
export interface ExtractedMetadata {
  found: boolean;
  userId: string;
  gps?: { available: boolean; latitude?: number; longitude?: number; coordinates: string | null; mapsUrl: string | null; source: string };
  timestamp: number | null;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  deviceSource: string;
  ipSource: string;
  gpsSource: string;
  originalResolution: string | null;
  confidence: string;
}

export interface CaptureTimeData {
  timestamp: number;
  source: string;
  dateString: string;
}
