import { supabase } from '@/integrations/supabase/client';
import { pHashSimilarity } from '@/lib/phash';
import type { DnaRecord, CustodyEvent } from './types';

const STORAGE_KEY = 'pinit_dna_records_v1';

function loadAll(): Record<string, DnaRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function persistAll(records: Record<string, DnaRecord>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* quota */ }
}

// ── Supabase sync (best-effort, one retry) ──

async function pushToSupabase(record: DnaRecord): Promise<void> {
  const payload = {
    dna_id: record.dnaId,
    signature: record.signature,
    user_id: record.userId,
    file_name: record.fileName,
    file_type: record.fileType,
    size_bytes: record.sizeBytes,
    sha256: record.sha256,
    p_hash: record.pHash,
    a_hash: record.aHash,
    d_hash: record.dHash,
    edge_signature: record.edgeSignature,
    hmac_seal: record.hmacSeal,
    ownership: record.ownership ? JSON.stringify(record.ownership) : null,
    device_network: record.deviceNetwork ? JSON.stringify(record.deviceNetwork) : null,
    custody: record.custody ? JSON.stringify(record.custody) : '[]',
    created_at: record.createdAt,
    color_histogram: record.colorHistogram ?? null,
    block_dct: record.blockDct ?? null,
    edge_density: record.edgeDensity ?? null,
    dominant_palette: record.dominantPalette ?? null,
  };
  try {
    const { error } = await (supabase as any).from('dna_records').upsert(payload, { onConflict: 'dna_id' });
    if (error) {
      // One retry after 2 seconds (handles transient network issues)
      await new Promise(r => setTimeout(r, 2000));
      await (supabase as any).from('dna_records').upsert(payload, { onConflict: 'dna_id' });
    }
  } catch { /* silent — table may not exist or offline */ }
}

async function fetchFromSupabaseBySha256(sha256: string): Promise<DnaRecord | null> {
  try {
    const { data } = await (supabase as any)
      .from('dna_records')
      .select('*')
      .eq('sha256', sha256)
      .limit(1);
    if (data?.[0]) return rowToRecord(data[0]);
  } catch { /* silent */ }
  return null;
}

async function fetchFromSupabaseByPHash(pHash: string): Promise<DnaRecord | null> {
  try {
    const { data } = await (supabase as any)
      .from('dna_records')
      .select('*')
      .eq('p_hash', pHash)
      .limit(1);
    if (data?.[0]) return rowToRecord(data[0]);
  } catch { /* silent */ }
  return null;
}

async function fetchFromSupabaseByDnaId(dnaId: string): Promise<DnaRecord | null> {
  try {
    const { data } = await (supabase as any)
      .from('dna_records')
      .select('*')
      .eq('dna_id', dnaId)
      .limit(1);
    if (data?.[0]) return rowToRecord(data[0]);
  } catch { /* silent */ }
  return null;
}

function rowToRecord(row: any): DnaRecord {
  return {
    dnaId: row.dna_id,
    signature: row.signature || '',
    userId: row.user_id,
    fileName: row.file_name || '',
    fileType: row.file_type || '',
    sizeBytes: row.size_bytes || 0,
    sha256: row.sha256 || null,
    pHash: row.p_hash || null,
    aHash: row.a_hash || null,
    dHash: row.d_hash || null,
    edgeSignature: row.edge_signature || null,
    hmacSeal: row.hmac_seal || null,
    ownership: row.ownership ? (typeof row.ownership === 'string' ? JSON.parse(row.ownership) : row.ownership) : null,
    deviceNetwork: row.device_network ? (typeof row.device_network === 'string' ? JSON.parse(row.device_network) : row.device_network) : null,
    custody: row.custody ? (typeof row.custody === 'string' ? JSON.parse(row.custody) : row.custody) : [],
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// ── Public API ──

export function saveDnaRecord(record: DnaRecord): void {
  const all = loadAll();
  all[record.dnaId] = record;
  persistAll(all);
  pushToSupabase(record);
}

export function getDnaRecord(dnaId: string): DnaRecord | null {
  return loadAll()[dnaId] ?? null;
}

export async function getDnaRecordWithCloud(dnaId: string): Promise<DnaRecord | null> {
  const local = loadAll()[dnaId];
  if (local) return local;
  const cloud = await fetchFromSupabaseByDnaId(dnaId);
  if (cloud) {
    const all = loadAll();
    all[cloud.dnaId] = cloud;
    persistAll(all);
  }
  return cloud;
}

export function getAllDnaRecords(userId?: string): DnaRecord[] {
  const all = Object.values(loadAll());
  if (!userId) return all;
  return all.filter((r) => r.userId === userId);
}

export function findRecordByHash(sha256?: string | null, pHash?: string | null): DnaRecord | null {
  const all = Object.values(loadAll());
  if (sha256) {
    const match = all.find((r) => r.sha256 === sha256);
    if (match) return match;
  }
  if (pHash) {
    const match = all.find((r) => r.pHash === pHash);
    if (match) return match;
  }
  return null;
}

export async function findRecordByHashWithCloud(sha256?: string | null, pHash?: string | null): Promise<DnaRecord | null> {
  // Local first
  const local = findRecordByHash(sha256, pHash);
  if (local) return local;

  // Cloud lookup
  if (sha256) {
    const cloud = await fetchFromSupabaseBySha256(sha256);
    if (cloud) {
      const all = loadAll();
      all[cloud.dnaId] = cloud;
      persistAll(all);
      return cloud;
    }
  }
  if (pHash) {
    const cloud = await fetchFromSupabaseByPHash(pHash);
    if (cloud) {
      const all = loadAll();
      all[cloud.dnaId] = cloud;
      persistAll(all);
      return cloud;
    }
  }
  return null;
}

export function findRecordByUserId(userId: string): DnaRecord[] {
  return Object.values(loadAll()).filter((r) => r.userId === userId);
}

/**
 * Find the best-matching DNA record by perceptual hash similarity.
 * This is the primary detection path for screenshots, cropped/resized copies,
 * and social-media re-encoded images where pixel DNA is destroyed but visual
 * content is recognizable. Uses Hamming distance on 64-char DCT pHash.
 *
 * @param scannedPHash  pHash of the scanned image
 * @param threshold     Minimum similarity (0-100); 70 = visible match, 85 = near-identical
 */
export async function findRecordByFuzzyPHash(
  scannedPHash: string | null,
  threshold = 70,
): Promise<{ record: DnaRecord; similarity: number } | null> {
  if (!scannedPHash) return null;

  // Search local records first
  const localRecords = Object.values(loadAll());
  let best: { record: DnaRecord; similarity: number } | null = null;

  for (const record of localRecords) {
    if (!record.pHash) continue;
    const sim = pHashSimilarity(scannedPHash, record.pHash);
    if (sim !== null && sim >= threshold) {
      if (!best || sim > best.similarity) best = { record, similarity: sim };
    }
  }
  if (best && best.similarity >= 90) return best; // Very confident — skip cloud lookup

  // Supplement with cloud records (fetch all for current user — small table)
  try {
    const { data } = await (supabase as any)
      .from('dna_records')
      .select('dna_id, p_hash, ownership, device_network, sha256, file_name, file_type, size_bytes, created_at, signature, user_id, a_hash, d_hash, edge_signature, hmac_seal, custody')
      .not('p_hash', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (data?.length) {
      for (const row of data) {
        const rec = rowToRecord(row);
        const sim = pHashSimilarity(scannedPHash, rec.pHash ?? null);
        if (sim !== null && sim >= threshold) {
          if (!best || sim > best.similarity) best = { record: rec, similarity: sim };
        }
      }
    }
  } catch { /* silent */ }

  return best;
}

export function appendCustodyToRecord(dnaId: string, event: CustodyEvent): void {
  const all = loadAll();
  const record = all[dnaId];
  if (!record) return;
  record.custody = [...(record.custody || []), event];
  persistAll(all);
  pushToSupabase(record);
}

/**
 * Push every local DNA record to Supabase in the background.
 * Call once on app startup so records created before the INSERT policy
 * was applied get synced to the cloud for cross-device scanning.
 */
export async function syncAllLocalRecordsToCloud(): Promise<void> {
  const all = Object.values(loadAll());
  for (const record of all) {
    await pushToSupabase(record).catch(() => { /* silent */ });
  }
}
