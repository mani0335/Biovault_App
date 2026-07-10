import type { OwnershipDna, OwnerRecoverySource } from './types';
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
): Promise<{ ownership: OwnershipDna | null; source: OwnerRecoverySource; fuzzyPHashSimilarity?: number }> {
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
      if (fullRecord?.ownership) {
        return { ownership: fullRecord.ownership, source: 'persistent-dna' };
      }
      // ownerName priority: (1) embedded in pixel DNA (new format, self-contained),
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
      return { ownership: partial, source: 'persistent-dna' };
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

  // 5. Match against vault document pHashes passed by the caller.
  //    This is the fallback for shared images when Supabase has no records yet
  //    (e.g. INSERT policy not applied) but the owner has docs in their local vault.
  if (currentPHash && vaultDocHints?.length) {
    let bestSim = 0;
    let bestHint: VaultDocHint | null = null;
    for (const hint of vaultDocHints) {
      if (!hint.pHash) continue;
      const sim = pHashSimilarity(currentPHash, hint.pHash);
      if (sim !== null && sim >= 50 && sim > bestSim) {
        bestSim = sim;
        bestHint = hint;
      }
    }
    if (bestHint) {
      // Try to load the full DNA record for this vault doc
      if (bestHint.dnaId) {
        try {
          const { getDnaRecordWithCloud } = await import('./dnaRecordStore');
          const vaultRecord = await getDnaRecordWithCloud(bestHint.dnaId);
          if (vaultRecord?.ownership) {
            return { ownership: vaultRecord.ownership, source: 'perceptual-hash', fuzzyPHashSimilarity: bestSim };
          }
        } catch { /* silent */ }
      }
      // Build partial ownership from vault hint metadata
      if (bestHint.ownerId) {
        const partial: OwnershipDna = {
          pinitOwnerId: `PINIT-${bestHint.ownerId.slice(0, 8).toUpperCase()}`,
          userId: bestHint.ownerId,
          ownerName: bestHint.ownerName ?? undefined,
          vaultId: `vault-${bestHint.ownerId}`,
          dnaId: bestHint.dnaId ?? 'Not Available',
          assetUuid: 'Not Available',
          assetVersion: 1,
          encryptionTimestamp: 'Not Available',
          digitalSignature: 'Not Available',
        };
        return { ownership: partial, source: 'perceptual-hash', fuzzyPHashSimilarity: bestSim };
      }
    }
  }

  return { ownership: null, source: 'none' };
}
