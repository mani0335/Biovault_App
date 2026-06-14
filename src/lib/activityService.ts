/**
 * Activity Tracking Service — Enterprise-level monitoring
 * Tracks every action on shared documents, vault files, and smart links.
 * Storage: localStorage (primary, Android-safe) + Supabase (best-effort cloud backup).
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Event Types ────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'shared'
  | 'opened'
  | 'viewed'
  | 'downloaded'
  | 'download_denied'
  | 'preview'
  | 'upload'
  | 'verified'
  | 'print_attempted'
  | 'screenshot_attempted'
  | 'screen_recording_detected'
  | 'link_accessed'
  | 'link_revoked'
  | 'link_expired'
  | 'access_denied'
  | 'session_blocked'
  | 'password_failed'
  | 'download_limit_reached'
  | 'security_alert'
  | 'vpn_detected'
  | 'suspicious_activity'
  | 'tab_switch'
  | 'copy_attempted'
  | 'rapid_scroll'
  | 'session_start'
  | 'session_end'
  | 're_accessed'
  | 'download_requested'
  | 'link_forwarded';

export type ActivityStatus = 'success' | 'blocked' | 'denied' | 'pending' | 'warning';

export interface ActivityEvent {
  id: string;
  userId: string;           // owner's userId
  shareId?: string;         // share token/id
  type: ActivityEventType;
  fileName: string;
  fileType: 'image' | 'pdf' | 'document' | 'unknown';
  sharedBy: string;
  recipientEmail?: string;
  recipientName?: string;
  timestamp: string;
  deviceInfo: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  ipAddress: string;
  geoLocation: string;
  geoCountry: string;
  geoCity: string;
  riskScore: number;
  status: ActivityStatus;
  securityEvents: string[];
  viewCount: number;
  downloadAttempts: number;
  screenshotAttempts: number;
  sessionDuration?: number;  // seconds
  metadata?: Record<string, unknown>;
}

export interface ShareAnalytics {
  shareId: string;
  fileName: string;
  fileType: string;
  ownerId: string;
  createdAt: string;
  totalViews: number;
  uniqueViewers: string[];   // unique IPs
  avgViewingTime: number;    // seconds
  totalDownloads: number;
  downloadAttempts: number;
  screenshotAttempts: number;
  printAttempts: number;
  geoBreakdown: Record<string, number>;
  deviceBreakdown: { mobile: number; desktop: number; tablet: number };
  accessTimeline: { timestamp: string; type: ActivityEventType }[];
  lastActivity: string;
  isRevoked: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  events: ActivityEvent[];
}

// ─── Geo/IP Cache ────────────────────────────────────────────────────────────

let _geoCache: { ip: string; country: string; city: string; countryCode: string } | null = null;
let _geoPending: Promise<typeof _geoCache> | null = null;

export async function getViewerGeoInfo(): Promise<typeof _geoCache> {
  if (_geoCache) return _geoCache;
  if (_geoPending) return _geoPending;

  _geoPending = (async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(tid);
      const d = await res.json();
      _geoCache = {
        ip: d.ip || 'Unknown',
        country: d.country_name || 'Unknown',
        city: d.city || 'Unknown',
        countryCode: d.country_code || '??',
      };
    } catch {
      _geoCache = { ip: 'Unknown', country: 'Unknown', city: 'Unknown', countryCode: '??' };
    }
    return _geoCache;
  })();

  return _geoPending;
}

// ─── Device Detection ────────────────────────────────────────────────────────

function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  // Truncate and sanitize
  return ua.substring(0, 150);
}

// ─── Risk Scoring ────────────────────────────────────────────────────────────

function calculateRiskScore(events: string[], meta?: Record<string, unknown>): number {
  let score = 0;
  const evtSet = new Set(events);

  if (evtSet.has('screenshot_attempted')) score += 30;
  if (evtSet.has('screen_recording_detected')) score += 35;
  if (evtSet.has('vpn_detected')) score += 20;
  if (evtSet.has('copy_attempted')) score += 15;
  if (evtSet.has('rapid_scroll')) score += 10;
  if (evtSet.has('tab_switch')) score += 5;
  if (evtSet.has('print_attempted')) score += 10;
  if (evtSet.has('suspicious_activity')) score += 25;
  if ((meta?.downloadAttempts as number) > 3) score += 15;
  if ((meta?.viewCount as number) > 20) score += 10;

  return Math.min(100, score);
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pinit_activity_events_v2';
const MAX_EVENTS = 2000;

// ─── Core Functions ──────────────────────────────────────────────────────────

/** Read all events from localStorage */
function readEvents(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write events to localStorage */
function writeEvents(events: ActivityEvent[]): void {
  try {
    const trimmed = events.slice(0, MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    // Fire custom event so ActivityPage re-renders in real time
    window.dispatchEvent(new CustomEvent('pinit_activity_update', { detail: trimmed.slice(0, 1) }));
  } catch {
    // Ignore storage errors
  }
}

/** Best-effort save to Supabase (won't block if table doesn't exist) */
async function trySaveToSupabase(event: ActivityEvent): Promise<void> {
  try {
    await (supabase as any).from('activity_logs').insert({
      event_id: event.id,
      user_id: event.userId,
      share_id: event.shareId || null,
      event_type: event.type,
      file_name: event.fileName,
      file_type: event.fileType,
      ip_address: event.ipAddress,
      geo_country: event.geoCountry,
      geo_city: event.geoCity,
      device_type: event.deviceType,
      device_info: event.deviceInfo,
      risk_score: event.riskScore,
      status: event.status,
      security_events: event.securityEvents,
      recipient_email: event.recipientEmail || null,
      recipient_name: event.recipientName || null,
      metadata: event.metadata || {},
      created_at: event.timestamp,
    });
  } catch {
    // Table may not exist — silent failure is fine
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LogActivityOptions {
  userId: string;
  shareId?: string;
  type: ActivityEventType;
  fileName: string;
  fileType?: ActivityEvent['fileType'];
  sharedBy?: string;
  recipientEmail?: string;
  recipientName?: string;
  securityEvents?: string[];
  status?: ActivityStatus;
  viewCount?: number;
  downloadAttempts?: number;
  screenshotAttempts?: number;
  sessionDuration?: number;
  metadata?: Record<string, unknown>;
  /** If true, skip async geo lookup (for synchronous calls) */
  skipGeo?: boolean;
}

/** Log a new activity event. Returns the created event. */
export async function logActivityEvent(opts: LogActivityOptions): Promise<ActivityEvent> {
  const geo = opts.skipGeo
    ? { ip: 'Unknown', country: 'Unknown', city: 'Unknown', countryCode: '??' }
    : (await getViewerGeoInfo()) || { ip: 'Unknown', country: 'Unknown', city: 'Unknown', countryCode: '??' };

  const securityEvents = opts.securityEvents || [];
  const riskScore = calculateRiskScore(securityEvents, {
    downloadAttempts: opts.downloadAttempts || 0,
    viewCount: opts.viewCount || 0,
  });

  const event: ActivityEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: opts.userId,
    shareId: opts.shareId,
    type: opts.type,
    fileName: opts.fileName || 'Unknown file',
    fileType: opts.fileType || 'unknown',
    sharedBy: opts.sharedBy || opts.userId,
    recipientEmail: opts.recipientEmail,
    recipientName: opts.recipientName,
    timestamp: new Date().toISOString(),
    deviceInfo: getDeviceInfo(),
    deviceType: detectDeviceType(),
    ipAddress: geo.ip,
    geoLocation: `${geo.city}, ${geo.country}`,
    geoCountry: geo.country,
    geoCity: geo.city,
    riskScore,
    status: opts.status || 'success',
    securityEvents,
    viewCount: opts.viewCount || 1,
    downloadAttempts: opts.downloadAttempts || 0,
    screenshotAttempts: opts.screenshotAttempts || 0,
    sessionDuration: opts.sessionDuration,
    metadata: opts.metadata,
  };

  const events = readEvents();
  events.unshift(event);
  writeEvents(events);

  // Best-effort cloud backup (non-blocking)
  trySaveToSupabase(event).catch(() => {});

  return event;
}

/** Synchronous quick-log for security events (no async geo) */
export function logSecurityEventSync(
  userId: string,
  shareId: string,
  type: ActivityEventType,
  fileName: string,
  details?: string
): void {
  const securityEvents = [type];
  const event: ActivityEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId,
    shareId,
    type,
    fileName,
    fileType: 'unknown',
    sharedBy: userId,
    timestamp: new Date().toISOString(),
    deviceInfo: getDeviceInfo(),
    deviceType: detectDeviceType(),
    ipAddress: _geoCache?.ip || 'Unknown',
    geoLocation: _geoCache ? `${_geoCache.city}, ${_geoCache.country}` : 'Unknown',
    geoCountry: _geoCache?.country || 'Unknown',
    geoCity: _geoCache?.city || 'Unknown',
    riskScore: calculateRiskScore(securityEvents),
    status: 'warning',
    securityEvents,
    viewCount: 0,
    downloadAttempts: 0,
    screenshotAttempts: 0,
    metadata: details ? { details } : undefined,
  };

  const events = readEvents();
  events.unshift(event);
  writeEvents(events);
}

/** Get all events for a user (owner's perspective) */
export function getActivityEvents(userId: string): ActivityEvent[] {
  return readEvents().filter((e) => e.userId === userId);
}

/** Get events by share ID */
export function getShareEvents(shareId: string): ActivityEvent[] {
  return readEvents().filter((e) => e.shareId === shareId);
}

/** Get all events for a user filtered by type category */
export function getEventsByCategory(
  userId: string,
  category: string
): ActivityEvent[] {
  const all = getActivityEvents(userId);
  switch (category) {
    case 'shared':
      return all.filter((e) => ['shared', 'link_accessed', 're_accessed'].includes(e.type));
    case 'downloads':
      return all.filter((e) => ['downloaded', 'download_denied', 'download_limit_reached'].includes(e.type));
    case 'views':
      return all.filter((e) => ['opened', 'viewed', 'preview', 'session_start', 'session_end'].includes(e.type));
    case 'security':
      return all.filter((e) =>
        [
          'print_attempted', 'screenshot_attempted', 'screen_recording_detected',
          'vpn_detected', 'security_alert', 'suspicious_activity', 'copy_attempted', 'tab_switch',
        ].includes(e.type)
      );
    case 'suspicious':
      return all.filter((e) => e.riskScore >= 30 || ['suspicious_activity', 'vpn_detected'].includes(e.type));
    case 'blocked':
      return all.filter((e) => ['session_blocked', 'access_denied', 'device_blocked', 'geo_blocked'].includes(e.type) || e.status === 'blocked' || e.status === 'denied');
    case 'revoked':
      return all.filter((e) => e.type === 'link_revoked' || e.type === 'link_expired');
    default:
      return all;
  }
}

/** Build analytics summary for a specific share */
export function buildShareAnalytics(shareId: string, ownerId: string, fileName: string, fileType: string, createdAt: string): ShareAnalytics {
  const events = getShareEvents(shareId);

  const viewEvents = events.filter((e) => ['opened', 'viewed', 'session_start', 'link_accessed', 're_accessed'].includes(e.type));
  const dlEvents = events.filter((e) => e.type === 'downloaded');
  const dlAttempts = events.filter((e) => ['downloaded', 'download_denied', 'download_limit_reached'].includes(e.type));
  const ssEvents = events.filter((e) => e.type === 'screenshot_attempted');
  const printEvents = events.filter((e) => e.type === 'print_attempted');

  const uniqueIPs = [...new Set(viewEvents.map((e) => e.ipAddress))];
  const sessionDurations = events.filter((e) => e.sessionDuration).map((e) => e.sessionDuration!);
  const avgViewingTime = sessionDurations.length > 0
    ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
    : 0;

  const geoBreakdown: Record<string, number> = {};
  for (const e of viewEvents) {
    const c = e.geoCountry || 'Unknown';
    geoBreakdown[c] = (geoBreakdown[c] || 0) + 1;
  }

  const deviceBreakdown = { mobile: 0, desktop: 0, tablet: 0 };
  for (const e of events) {
    if (e.deviceType === 'mobile') deviceBreakdown.mobile++;
    else if (e.deviceType === 'tablet') deviceBreakdown.tablet++;
    else deviceBreakdown.desktop++;
  }

  const allSecurityEvents = events.flatMap((e) => e.securityEvents);
  const maxRisk = events.reduce((max, e) => Math.max(max, e.riskScore), 0);
  const riskLevel: ShareAnalytics['riskLevel'] =
    maxRisk >= 75 ? 'critical' : maxRisk >= 50 ? 'high' : maxRisk >= 25 ? 'medium' : 'low';

  const isRevoked = events.some((e) => e.type === 'link_revoked');

  const accessTimeline = events
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((e) => ({ timestamp: e.timestamp, type: e.type }));

  return {
    shareId,
    fileName,
    fileType,
    ownerId,
    createdAt,
    totalViews: viewEvents.length,
    uniqueViewers: uniqueIPs,
    avgViewingTime,
    totalDownloads: dlEvents.length,
    downloadAttempts: dlAttempts.length,
    screenshotAttempts: ssEvents.length,
    printAttempts: printEvents.length,
    geoBreakdown,
    deviceBreakdown,
    accessTimeline,
    lastActivity: events.length > 0 ? events[0].timestamp : createdAt,
    isRevoked,
    riskLevel,
    events,
  };
}

/** Get aggregated analytics for all shares by a user */
export function getAllShareAnalytics(userId: string): ShareAnalytics[] {
  const events = getActivityEvents(userId);
  const shareMap = new Map<string, { events: ActivityEvent[]; fileName: string; fileType: string; createdAt: string }>();

  for (const evt of events) {
    if (!evt.shareId) continue;
    if (!shareMap.has(evt.shareId)) {
      shareMap.set(evt.shareId, {
        events: [],
        fileName: evt.fileName,
        fileType: evt.fileType,
        createdAt: evt.timestamp,
      });
    }
    shareMap.get(evt.shareId)!.events.push(evt);
  }

  return Array.from(shareMap.entries()).map(([shareId, { fileName, fileType, createdAt }]) =>
    buildShareAnalytics(shareId, userId, fileName, fileType, createdAt)
  );
}

/** Get overall stats for a user */
export function getActivityStats(userId: string) {
  const events = getActivityEvents(userId);
  const total = events.length;
  const shares = events.filter((e) => e.type === 'shared').length;
  const views = events.filter((e) => ['opened', 'viewed', 'link_accessed'].includes(e.type)).length;
  const downloads = events.filter((e) => e.type === 'downloaded').length;
  const securityAlerts = events.filter((e) =>
    ['screenshot_attempted', 'screen_recording_detected', 'print_attempted', 'vpn_detected', 'suspicious_activity'].includes(e.type)
  ).length;
  const blocked = events.filter((e) => e.status === 'blocked' || e.status === 'denied').length;
  const highRisk = events.filter((e) => e.riskScore >= 50).length;

  return { total, shares, views, downloads, securityAlerts, blocked, highRisk };
}

/** Admin: revoke a share link (sets is_active=false in Supabase) */
export async function revokeShareLink(shareId: string, userId: string, fileName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('share_configs')
      .update({ is_active: false })
      .eq('share_id', shareId)
      .eq('user_id', userId);

    if (!error) {
      // Log the revocation
      await logActivityEvent({
        userId,
        shareId,
        type: 'link_revoked',
        fileName,
        status: 'success',
        skipGeo: true,
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch activity events from Supabase and merge them into localStorage.
 * Call this on ActivityPage mount so events logged by external share-link
 * viewers (on their own devices) appear for the document owner.
 * Safe to call even if the table doesn't exist — errors are silently ignored.
 */
export async function syncFromSupabase(userId: string): Promise<void> {
  try {
    const { data, error } = await (supabase as any)
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data || !Array.isArray(data)) return;

    const existing = readEvents();
    const existingIds = new Set(existing.map((e) => e.id));

    const newEvents: ActivityEvent[] = (data as any[])
      .filter((row) => !existingIds.has(row.event_id))
      .map((row) => ({
        id: row.event_id,
        userId: row.user_id,
        shareId: row.share_id,
        type: row.event_type as ActivityEventType,
        fileName: row.file_name || 'Unknown file',
        fileType: (row.file_type || 'unknown') as ActivityEvent['fileType'],
        sharedBy: row.user_id,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        timestamp: row.created_at,
        deviceInfo: row.device_info || '',
        deviceType: (row.device_type || 'unknown') as ActivityEvent['deviceType'],
        ipAddress: row.ip_address || 'Unknown',
        geoLocation: row.geo_city && row.geo_country ? `${row.geo_city}, ${row.geo_country}` : 'Unknown',
        geoCountry: row.geo_country || 'Unknown',
        geoCity: row.geo_city || 'Unknown',
        riskScore: row.risk_score || 0,
        status: (row.status || 'success') as ActivityStatus,
        securityEvents: row.security_events || [],
        viewCount: 1,
        downloadAttempts: 0,
        screenshotAttempts: 0,
        metadata: row.metadata || {},
      }));

    if (newEvents.length > 0) {
      const merged = [...newEvents, ...existing];
      writeEvents(merged);
    }
  } catch {
    // Table doesn't exist yet — silent failure is fine
  }
}

/** Clear all activity events for a user */
export function clearAllActivity(userId: string): void {
  const events = readEvents().filter((e) => e.userId !== userId);
  writeEvents(events);
}

/** Format relative time */
export function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString();
}

/** Get risk level label and color */
export function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Critical', color: '#ef4444' };
  if (score >= 50) return { label: 'High', color: '#f97316' };
  if (score >= 25) return { label: 'Medium', color: '#eab308' };
  return { label: 'Low', color: '#22c55e' };
}

/** Get event type human-readable label */
export function getEventLabel(type: ActivityEventType): string {
  const labels: Record<ActivityEventType, string> = {
    shared: 'File Shared',
    opened: 'Link Opened',
    viewed: 'File Viewed',
    downloaded: 'Downloaded',
    download_denied: 'Download Denied',
    preview: 'Previewed',
    upload: 'Uploaded',
    verified: 'Verified',
    print_attempted: 'Print Attempted',
    screenshot_attempted: 'Screenshot Attempted',
    screen_recording_detected: 'Screen Recording',
    link_accessed: 'Link Accessed',
    link_revoked: 'Link Revoked',
    link_expired: 'Link Expired',
    access_denied: 'Access Denied',
    session_blocked: 'Session Blocked',
    password_failed: 'Wrong Password',
    download_limit_reached: 'Download Limit Hit',
    security_alert: 'Security Alert',
    vpn_detected: 'VPN Detected',
    suspicious_activity: 'Suspicious Activity',
    tab_switch: 'Tab Switched',
    copy_attempted: 'Copy Attempted',
    rapid_scroll: 'Rapid Scrolling',
    session_start: 'Session Started',
    session_end: 'Session Ended',
    re_accessed: 'Re-accessed',
  };
  return labels[type] || type;
}
