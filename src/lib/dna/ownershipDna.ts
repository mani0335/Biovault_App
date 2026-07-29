import type { OwnershipDna, OwnerRecoverySource, DeviceNetworkDna } from './types';
import { extractSimpleWatermark } from '@/lib/simpleSteganography';
import { findRecordByHashWithCloud, findRecordByFuzzyPHash } from './dnaRecordStore';
import { pHashSimilarity } from '@/lib/phash';

export interface VaultDocHint {
  pHash?: string | null;
  dnaId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
}

function generateUuid(): string {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function hmacSign(key: string, message: string): Promise<string> {
  try {
    if (!crypto?.subtle) return 'NO_CRYPTO';
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
    const arr = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex.toUpperCase();
  } catch { return 'SIGN_FAILED'; }
}

export async function buildOwnershipDna(params: {
  userId: string;
  ownerName?: string;
  dnaId: string;
  sha256: string | null;
  vaultId?: string;
  assetVersion?: number;
}): Promise<OwnershipDna> {
  const assetUuid = generateUuid();
  const encryptionTimestamp = new Date().toISOString();
  const pinitOwnerId = `PINIT-${params.userId.slice(0, 8).toUpperCase()}`;
  const vaultId = params.vaultId || `vault-${params.userId}`;

  const payload = JSON.stringify({
    pinitOwnerId,
    userId: params.userId,
    ownerName: params.ownerName,
    vaultId,
    dnaId: params.dnaId,
    assetUuid,
    sha256: params.sha256,
    encryptionTimestamp,
  });

  const digitalSignature = await hmacSign(params.userId, payload);

  return {
    pinitOwnerId,
    userId: params.userId,
    ownerName: params.ownerName,
    vaultId,
    dnaId: params.dnaId,
    assetUuid,
    assetVersion: params.assetVersion ?? 1,
    encryptionTimestamp,
    digitalSignature,
  };
}

export async function extractOwnerFromAsset(
  imageBase64: string,
  currentSha256?: string | null,
  currentPHash?: string | null,
  vaultDocHints?: VaultDocHint[],
): Promise<{ ownership: OwnershipDna | null; source: OwnerRecoverySource; fuzzyPHashSimilarity?: number; watermarkDevice?: DeviceNetworkDna | null }> {
  // 1. Try DNA record store lookup by exact hash (local + Supabase cloud)
  const record = await findRecordByHashWithCloud(currentSha256, currentPHash);
  if (record?.ownership) {
    return { ownership: record.ownership, source: 'exact-hash' };
  }

  // 2. Try persistent pixel DNA extraction — survives direct file copy and quality-75+ JPEG
  try {
    const { extractPersistentDna } = await import('./persistentDna');
    const persistent = await extractPersistentDna(imageBase64);
    if (persistent?.ownerId) {
      const { getDnaRecordWithCloud } = await import('./dnaRecordStore');
      const fullRecord = await getDnaRecordWithCloud(persistent.dnaId);

      // Build a minimal DeviceNetworkDna from watermark location fields so that
      // GPS / city / country always shows — even when Supabase is unreachable or
      // RLS blocks cross-user reads (the most common reason location is blank).
      const hasLocation = !!(persistent.locationStr || persistent.gpsLat != null);
      const hasDevice = !!(persistent.deviceManufacturer || persistent.deviceModel || persistent.deviceOs);
      const watermarkDevice: DeviceNetworkDna | null = (hasLocation || hasDevice) ? {
        manufacturer: persistent.deviceManufacturer ?? null,
        model: persistent.deviceModel ?? null,
        operatingSystem: persistent.deviceOs ?? null,
        osVersion: null,
        platform: null,
        browserVersion: null,
        deviceFingerprint: null,
        publicIp: null,
        address: null,
        village: null,
        area: null,
        road: null,
        city: persistent.city ?? null,
        state: persistent.state ?? null,
        country: persistent.country ?? null,
        timeZone: null,
        gpsLat: persistent.gpsLat ?? null,
        gpsLng: persistent.gpsLng ?? null,
        capturedAt: persistent.timestamp || new Date().toISOString(),
      } : null;

      if (fullRecord?.ownership) {
        return { ownership: fullRecord.ownership, source: 'persistent-dna', watermarkDevice };
      }

      // ownerName priority: (1) embedded in pixel DNA (v3 format, self-contained),
      // (2) localStorage when scanning on the owner's own device,
      // (3) undefined (shows as "Name Not Available" in UI).
      const localUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('biovault_userId') : null;
      const localName = typeof localStorage !== 'undefined' ? localStorage.getItem('biovault_userName') : null;
      const resolvedOwnerName =
        persistent.ownerName ||
        (localUserId && localUserId === persistent.ownerId && localName ? localName : undefined);

      const partial: OwnershipDna = {
        pinitOwnerId: `PINIT-${persistent.ownerId.slice(0, 8).toUpperCase()}`,
        userId: persistent.ownerId,
        ownerName: resolvedOwnerName ?? undefined,
        vaultId: `vault-${persistent.ownerId}`,
        dnaId: persistent.dnaId,
        assetUuid: persistent.assetUuid,
        assetVersion: 1,
        encryptionTimestamp: persistent.timestamp || 'Not Available',
        digitalSignature: 'Not Available',
      };
      return { ownership: partial, source: 'persistent-dna', watermarkDevice };
    }
  } catch { /* persistent extraction failed */ }

  // 3. Fuzzy perceptual hash matching — works for screenshots, crops, WhatsApp/arattai shares,
  //    and camera-at-screen scans. Threshold 55: wide enough to catch camera photos of screens
  //    (which suffer from moire, glare, perspective) while still avoiding false positives.
  if (currentPHash) {
    try {
      const fuzzyResult = await findRecordByFuzzyPHash(currentPHash, 55);
      if (fuzzyResult?.record.ownership) {
        return {
          ownership: fuzzyResult.record.ownership,
          source: 'perceptual-hash',
          fuzzyPHashSimilarity: fuzzyResult.similarity,
        };
      }
    } catch { /* fuzzy search failed */ }
  }

  // 4. Try legacy LSB watermark extraction (old files before amplitude embedding)
  try {
    const watermark = await extractSimpleWatermark(imageBase64);
    if (watermark?.userId) {
      const partial: OwnershipDna = {
        pinitOwnerId: `PINIT-${watermark.userId.slice(0, 8).toUpperCase()}`,
        userId: watermark.userId,
        vaultId: `vault-${watermark.userId}`,
        dnaId: record?.dnaId ?? 'Not Available',
        assetUuid: 'Not Available',
        assetVersion: 1,
        encryptionTimestamp: watermark.timestamp || 'Not Available',
        digitalSignature: 'Not Available',
      };
      return { ownership: partial, source: 'watermark' };
    }
  } catch { /* extraction failed */ }

  return { ownership: null, source: 'none' };
}
