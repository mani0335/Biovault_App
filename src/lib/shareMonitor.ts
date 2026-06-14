/**
 * shareMonitor.ts
 * ───────────────
 * Recipient-side DNA tracking + owner-side monitoring data.
 *
 * Tables (graceful fallback to localStorage if Supabase tables don't exist yet):
 *   share_visitors        — one row per visitor per share
 *   share_security_events — screenshot / copy / devtools events
 *   download_requests     — pending/approved/rejected download requests
 *   share_chain           — forward-link parent→child chain
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  userAgent: string;
  screenResolution: string;
  language: string;
  timezone: string;
}

export interface GeoAddress {
  lat: number;
  lng: number;
  formatted: string;
  city: string;
  district: string;
  area: string;
  state: string;
  country: string;
  countryCode: string;
  pincode?: string;
}

export interface NetworkInfo {
  type: string;
  downlink?: number;
  effectiveType?: string;
}

export function getNetworkInfo(): NetworkInfo {
  const nav = navigator as Navigator & { connection?: { type?: string; downlink?: number; effectiveType?: string } };
  const conn = nav.connection;
  if (!conn) return { type: 'unknown' };
  return {
    type: conn.type || conn.effectiveType || 'unknown',
    downlink: conn.downlink,
    effectiveType: conn.effectiveType,
  };
}

export type ViewerActivityType =
  | 'zoom_in' | 'zoom_out' | 'scroll_rapid'
  | 'file_view_start' | 'file_view_end'
  | 'multiple_access_attempt' | 'location_change'
  | 'screen_recording_suspected' | 'idle' | 'resumed';

export interface VisitorRecord {
  shareId: string;
  visitorId: string;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  ipAddress?: string | null;
  geoAddress?: GeoAddress | null;
  deviceInfo?: DeviceInfo;
  sessionStart: string;
  parentVisitorId?: string | null;
  parentShareId?: string | null;
}

export async function getPublicIp(): Promise<string | null> {
  try {
    const res = await fetch('https://ip-api.com/json/?fields=query', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.query as string) || null;
  } catch {
    return null;
  }
}

export async function revokeVisitorAccess(shareId: string, visitorId: string): Promise<void> {
  try {
    const key = `pinit_revoked_${shareId}`;
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.includes(visitorId)) {
      existing.push(visitorId);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch { /* ignore */ }
  try {
    await (supabase as any).from('share_revoked_visitors').upsert({
      share_id: shareId,
      visitor_id: visitorId,
      revoked_at: new Date().toISOString(),
    }, { onConflict: 'share_id,visitor_id' });
  } catch { /* ignore */ }
}

export function isVisitorRevoked(shareId: string, visitorId: string): boolean {
  try {
    const key = `pinit_revoked_${shareId}`;
    const revoked: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    return revoked.includes(visitorId);
  } catch {
    return false;
  }
}

export type SecurityEventType =
  | 'screenshot_attempt'
  | 'screen_recording'
  | 'copy_attempt'
  | 'print_attempt'
  | 'devtools_open'
  | 'right_click'
  | 'tab_switch'
  | 'forward_link';

export interface SecurityEvent {
  shareId: string;
  visitorId: string;
  visitorName?: string;
  type: SecurityEventType;
  details?: string;
  riskScore: number;
  timestamp: string;
}

export interface DownloadRequest {
  id: string;
  shareId: string;
  visitorId: string;
  visitorName: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedLimit: number;
  downloadsUsed: number;
  createdAt: string;
}

export interface MonitorData {
  visitors: VisitorRecord[];
  securityEvents: SecurityEvent[];
  downloadRequests: DownloadRequest[];
}

// ─── Device detection ─────────────────────────────────────────────────────────

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const language = navigator.language || 'en';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const screenResolution = `${screen.width}×${screen.height}`;

  let type: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) type = 'tablet';
  else if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) type = 'mobile';

  let os = 'Unknown OS';
  if (/windows nt 10/i.test(ua)) os = 'Windows 11/10';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/i);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) {
    const m = ua.match(/(?:chrome|crios)\/([\d.]+)/i);
    browser = m ? `Chrome ${m[1].split('.')[0]}` : 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    const m = ua.match(/(?:firefox|fxios)\/([\d.]+)/i);
    browser = m ? `Firefox ${m[1].split('.')[0]}` : 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    const m = ua.match(/version\/([\d.]+)/i);
    browser = m ? `Safari ${m[1].split('.')[0]}` : 'Safari';
  } else if (/opr|opera/i.test(ua)) browser = 'Opera';

  return { type, os, browser, userAgent: ua, screenResolution, language, timezone };
}

// ─── Reverse geocoding (OpenStreetMap Nominatim — no API key required) ────────

export async function reverseGeocode(lat: number, lng: number): Promise<GeoAddress> {
  const fallback: GeoAddress = {
    lat, lng,
    formatted: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    city: 'Unknown', district: 'Unknown', area: 'Unknown', state: 'Unknown',
    country: 'Unknown', countryCode: '??',
  };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PINIT-Vault/1.0' } }
    );
    if (!res.ok) return fallback;
    const data: { display_name?: string; address?: Record<string, string> } = await res.json();
    const addr = data.address || {};
    return {
      lat, lng,
      formatted: data.display_name || fallback.formatted,
      city: addr.city || addr.town || addr.village || 'Unknown',
      area: addr.suburb || addr.quarter || addr.neighbourhood || addr.village || 'Unknown',
      district: addr.county || addr.district || 'Unknown',
      state: addr.state || 'Unknown',
      country: addr.country || 'Unknown',
      countryCode: (addr.country_code || '??').toUpperCase(),
      pincode: addr.postcode,
    };
  } catch {
    return fallback;
  }
}

// ─── Visitor ID (stable per-share, stored in viewer's browser) ────────────────

export function getOrCreateVisitorId(shareId: string): string {
  const key = `pinit_vuid_${shareId}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `v_${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ─── Log visitor access ───────────────────────────────────────────────────────

export async function logVisitorAccess(record: VisitorRecord): Promise<void> {
  const net = getNetworkInfo();
  const row = {
    share_id: record.shareId,
    visitor_id: record.visitorId,
    visitor_name: record.visitorName,
    visitor_email: record.visitorEmail ?? null,
    visitor_phone: record.visitorPhone ?? null,
    ip_address: record.ipAddress ?? null,
    geo_city: record.geoAddress?.city ?? null,
    geo_area: record.geoAddress?.area ?? null,
    geo_district: record.geoAddress?.district ?? null,
    geo_state: record.geoAddress?.state ?? null,
    geo_country: record.geoAddress?.country ?? null,
    geo_country_code: record.geoAddress?.countryCode ?? null,
    geo_pincode: record.geoAddress?.pincode ?? null,
    gps_lat: record.geoAddress?.lat ?? null,
    gps_lng: record.geoAddress?.lng ?? null,
    geo_formatted: record.geoAddress?.formatted ?? null,
    device_type: record.deviceInfo?.type ?? null,
    os: record.deviceInfo?.os ?? null,
    browser: record.deviceInfo?.browser ?? null,
    screen_resolution: record.deviceInfo?.screenResolution ?? null,
    language: record.deviceInfo?.language ?? null,
    timezone: record.deviceInfo?.timezone ?? null,
    network_type: net.type,
    network_speed: net.downlink ? `${net.downlink} Mbps` : null,
    session_start: record.sessionStart,
    last_active: record.sessionStart,
    parent_visitor_id: record.parentVisitorId ?? null,
    parent_share_id: record.parentShareId ?? null,
    created_at: new Date().toISOString(),
  };

  try {
    const key = `pinit_visitors_${record.shareId}`;
    const existing: unknown[] = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = (existing as Array<{ visitor_id: string }>).findIndex((v) => v.visitor_id === record.visitorId);
    if (idx >= 0) (existing as Array<Record<string, unknown>>)[idx] = { ...(existing[idx] as object), ...row };
    else existing.unshift(row);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
  } catch { /* ignore */ }

  try {
    await (supabase as unknown as { from: (t: string) => { upsert: (r: unknown, opts: object) => Promise<unknown> } })
      .from('share_visitors')
      .upsert(row, { onConflict: 'share_id,visitor_id' });
  } catch { /* table may not exist */ }
}

// ─── Log security event ───────────────────────────────────────────────────────

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const row = {
    share_id: event.shareId,
    visitor_id: event.visitorId,
    visitor_name: event.visitorName ?? null,
    event_type: event.type,
    details: event.details ?? null,
    risk_score: event.riskScore,
    created_at: event.timestamp,
  };

  try {
    const key = `pinit_sec_events_${event.shareId}`;
    const existing: unknown[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift(row);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)));
  } catch { /* ignore */ }

  try {
    await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } })
      .from('share_security_events')
      .insert(row);
  } catch { /* ignore */ }
}

// ─── Download request ─────────────────────────────────────────────────────────

export async function createDownloadRequest(
  shareId: string,
  visitorId: string,
  visitorName: string
): Promise<string> {
  const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const row: DownloadRequest = {
    id,
    shareId,
    visitorId,
    visitorName,
    status: 'pending',
    approvedLimit: 0,
    downloadsUsed: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    const key = `pinit_dl_req_${shareId}`;
    const existing: DownloadRequest[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift(row);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
  } catch { /* ignore */ }

  try {
    await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } })
      .from('download_requests')
      .insert({
        id: row.id,
        share_id: row.shareId,
        visitor_id: row.visitorId,
        visitor_name: row.visitorName,
        status: row.status,
        approved_limit: row.approvedLimit,
        downloads_used: row.downloadsUsed,
        created_at: row.createdAt,
      });
  } catch { /* ignore */ }

  return id;
}

export async function approveDownloadRequest(id: string, limit: number): Promise<void> {
  const update = { status: 'approved', approved_limit: limit };
  try {
    await (supabase as unknown as { from: (t: string) => { update: (r: unknown) => { eq: (col: string, val: string) => Promise<unknown> } } })
      .from('download_requests').update(update).eq('id', id);
  } catch { /* ignore */ }
}

export async function rejectDownloadRequest(id: string): Promise<void> {
  try {
    await (supabase as unknown as { from: (t: string) => { update: (r: unknown) => { eq: (col: string, val: string) => Promise<unknown> } } })
      .from('download_requests').update({ status: 'rejected' }).eq('id', id);
  } catch { /* ignore */ }
}

// ─── Generate a new DNA forward link ─────────────────────────────────────────

export interface ForwardLinkResult {
  newShareId: string;
  url: string;
}

export async function generateDNAForwardLink(
  parentShareId: string,
  forwarderVisitorId: string,
  forwarderName: string,
  originalRow: Record<string, unknown>
): Promise<ForwardLinkResult> {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const newShareId = `share_${ts}_${rand}`;
  const origin = window.location.origin;
  const url = `${origin}/share/${newShareId}`;

  // Store chain record locally
  const chainRow = {
    share_id: newShareId,
    parent_share_id: parentShareId,
    forwarder_visitor_id: forwarderVisitorId,
    forwarder_name: forwarderName,
    created_at: new Date().toISOString(),
  };

  try {
    const existing: unknown[] = JSON.parse(localStorage.getItem('pinit_share_chain') || '[]');
    existing.unshift(chainRow);
    localStorage.setItem('pinit_share_chain', JSON.stringify(existing.slice(0, 200)));
  } catch { /* ignore */ }

  // Store a copy of the original share in share_configs under the new ID
  const newRow = {
    ...originalRow,
    share_id: newShareId,
    parent_share_id: parentShareId,
    access_count: 0,
    downloads_used: 0,
    created_at: new Date().toISOString(),
    share_link: url,
  };

  // Also cache for offline
  try {
    const key = `pinit_fwd_${newShareId}`;
    localStorage.setItem(key, JSON.stringify(newRow));
  } catch { /* ignore */ }

  try {
    await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } })
      .from('share_configs')
      .insert(newRow);
  } catch { /* ignore */ }

  try {
    await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } })
      .from('share_chain')
      .insert(chainRow);
  } catch { /* ignore */ }

  return { newShareId, url };
}

// ─── Heartbeat: update visitor last_active ────────────────────────────────────

export async function updateVisitorLastActive(shareId: string, visitorId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    const key = `pinit_visitors_${shareId}`;
    const existing: Array<Record<string, unknown>> = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = existing.findIndex((v) => v.visitor_id === visitorId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], last_active: now };
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch { /* ignore */ }
  try {
    await (supabase as any).from('share_visitors')
      .update({ last_active: now })
      .eq('share_id', shareId)
      .eq('visitor_id', visitorId);
  } catch { /* ignore */ }
}

// ─── Log granular viewer activity ─────────────────────────────────────────────

export async function logViewerActivity(
  shareId: string,
  visitorId: string,
  visitorName: string,
  type: ViewerActivityType,
  details?: string,
  riskScore = 0,
): Promise<void> {
  const row = {
    share_id: shareId,
    visitor_id: visitorId,
    visitor_name: visitorName,
    event_type: type,
    details: details ?? null,
    risk_score: riskScore,
    created_at: new Date().toISOString(),
  };
  try {
    const key = `pinit_sec_events_${shareId}`;
    const existing: unknown[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift(row);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 500)));
  } catch { /* ignore */ }
  try {
    await (supabase as any).from('share_security_events').insert(row);
  } catch { /* ignore */ }
}

// ─── Get monitor data for owner ───────────────────────────────────────────────

export async function getShareMonitorData(shareId: string): Promise<MonitorData> {
  let visitors: VisitorRecord[] = [];
  let securityEvents: SecurityEvent[] = [];
  let downloadRequests: DownloadRequest[] = [];

  try {
    visitors = JSON.parse(localStorage.getItem(`pinit_visitors_${shareId}`) || '[]');
    securityEvents = JSON.parse(localStorage.getItem(`pinit_sec_events_${shareId}`) || '[]');
    downloadRequests = JSON.parse(localStorage.getItem(`pinit_dl_req_${shareId}`) || '[]');
  } catch { /* ignore */ }

  try {
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: object) => Promise<{ data: unknown[] | null }>;
          };
        };
      };
    };
    const [vRes, eRes, dRes] = await Promise.all([
      db.from('share_visitors').select('*').eq('share_id', shareId).order('created_at', { ascending: false }),
      db.from('share_security_events').select('*').eq('share_id', shareId).order('created_at', { ascending: false }),
      db.from('download_requests').select('*').eq('share_id', shareId).order('created_at', { ascending: false }),
    ]);
    if (vRes.data?.length) visitors = vRes.data as VisitorRecord[];
    if (eRes.data?.length) securityEvents = eRes.data as SecurityEvent[];
    if (dRes.data?.length) downloadRequests = dRes.data as DownloadRequest[];
  } catch { /* ignore */ }

  return { visitors, securityEvents, downloadRequests };
}

// ─── Subscribe to real-time share activity ────────────────────────────────────

export function subscribeToShareActivity(shareId: string, onUpdate: () => void): () => void {
  try {
    const ch = (supabase as unknown as {
      channel: (name: string) => {
        on: (evt: string, opts: object, cb: () => void) => { on: (...args: unknown[]) => { subscribe: () => unknown } };
      };
    })
      .channel(`sm_${shareId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_visitors', filter: `share_id=eq.${shareId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_security_events', filter: `share_id=eq.${shareId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'download_requests', filter: `share_id=eq.${shareId}` }, onUpdate)
      .subscribe();
    return () => {
      try {
        (supabase as unknown as { removeChannel: (ch: unknown) => void }).removeChannel(ch);
      } catch { /* ignore */ }
    };
  } catch {
    return () => { /* no-op */ };
  }
}

// ─── Check if monitoring tables exist ────────────────────────────────────────

export async function checkMonitoringTablesExist(): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from('share_visitors')
      .select('share_id')
      .limit(1);
    if (error && (error.code === '42P01' || String(error.message).includes('does not exist'))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
