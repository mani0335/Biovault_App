import { supabase } from '@/integrations/supabase/client';

export interface ScanEvent {
  id: string;
  owner_id: string;
  scanner_user_id: string | null;
  asset_id: string | null;
  asset_uuid: string | null;
  file_name: string | null;
  scanner_ip: string | null;
  scanner_city: string | null;
  scanner_country: string | null;
  scanner_device: string | null;
  scanned_at: string;
  is_seen: boolean;
}

export async function recordScanEvent(params: {
  ownerId: string;
  scannerUserId?: string | null;
  assetId?: string | null;
  assetUuid?: string | null;
  fileName?: string | null;
  scannerIp?: string | null;
  scannerCity?: string | null;
  scannerCountry?: string | null;
  scannerDevice?: string | null;
}): Promise<void> {
  try {
    await (supabase as any).from('scan_events').insert({
      owner_id: params.ownerId,
      scanner_user_id: params.scannerUserId ?? null,
      asset_id: params.assetId ?? null,
      asset_uuid: params.assetUuid ?? null,
      file_name: params.fileName ?? null,
      scanner_ip: params.scannerIp ?? null,
      scanner_city: params.scannerCity ?? null,
      scanner_country: params.scannerCountry ?? null,
      scanner_device: params.scannerDevice ?? null,
      scanned_at: new Date().toISOString(),
      is_seen: false,
    });
  } catch { /* silent — table may not exist */ }
}

export async function getUnseenScanEvents(ownerId: string): Promise<ScanEvent[]> {
  try {
    const { data } = await (supabase as any)
      .from('scan_events')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_seen', false)
      .order('scanned_at', { ascending: false });
    return data ?? [];
  } catch { return []; }
}

export async function getAllScanEvents(ownerId: string, limit = 50): Promise<ScanEvent[]> {
  try {
    const { data } = await (supabase as any)
      .from('scan_events')
      .select('*')
      .eq('owner_id', ownerId)
      .order('scanned_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch { return []; }
}

export async function markScanEventsSeen(ownerId: string): Promise<void> {
  try {
    await (supabase as any)
      .from('scan_events')
      .update({ is_seen: true })
      .eq('owner_id', ownerId)
      .eq('is_seen', false);
  } catch { /* silent */ }
}

export function getUnseenScanCount(ownerId: string): Promise<number> {
  return getUnseenScanEvents(ownerId).then((e) => e.length);
}
