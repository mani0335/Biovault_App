/**
 * portfolioShareService.ts
 * ────────────────────────
 * Supabase-backed portfolio share system.
 *
 * Architecture (mirrors vault sharing):
 * ──────────────────────────────────────
 * 1. Token is a short readable string: `portfolio_{timestamp}_{rand6}`
 *    → Stored in Supabase `portfolio_shares` table (NOT self-contained in URL).
 *    → Share URL: /share/portfolio_{timestamp}_{rand6}
 *
 * 2. Viewer opens the URL → ShareRouter detects `portfolio_` prefix →
 *    SharedPortfolioPage → calls loadShare(token) → fetches row from Supabase.
 *
 * 3. Owner's active shares are cached in localStorage for instant UI rendering.
 *    Supabase is the source of truth; localStorage is a write-through cache.
 *
 * 4. Device-binding and geo-restriction remain client-side (require browser APIs).
 *
 * 5. View-count increments call increment_portfolio_share_views() RPC which is
 *    SECURITY DEFINER — lets unauthenticated viewers trigger the update safely.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Portfolio } from '../types/Portfolio';

/* ─── CONSTANTS ────────────────────────────────────────── */
const STORE_KEY  = 'pinit_portfolio_shares';
const REVOKE_KEY = 'pinit_revoked_shares';

/* ─── TYPES ─────────────────────────────────────────────── */

export type ShareMode   = 'entire' | 'selected';
export type AccessMode  = 'view-only' | 'download';

export interface ExtendedShareSettings {
  mode:                ShareMode;
  selectedSections:    string[];
  accessMode:          AccessMode;
  expiryHours:         number;
  viewLimit:           number | null;
  watermark:           boolean;
  watermarkText:       string;
  screenshotProtection:boolean;
  deviceBound:         boolean;
  allowedCountry:      string;
}

export interface ShareRecord {
  /** The clean token string: `portfolio_{timestamp}_{rand6}` */
  token:             string;
  shareId:           string;   // same as token for new records
  portfolioId:       string;
  ownerId:           string;
  ownerName:         string;
  portfolio:         Portfolio;
  settings:          ExtendedShareSettings;
  expiresAt:         string | null;
  viewCount:         number;
  isRevoked:         boolean;
  deviceFingerprint: string;
  createdAt:         string;
}

export interface LoadResult {
  record:  ShareRecord | null;
  status:  'ok' | 'expired' | 'revoked' | 'view_limit' | 'invalid' | 'device_mismatch';
  message: string;
}

/* ─── TOKEN GENERATION ──────────────────────────────────── */

/** Generate a clean portfolio share token: portfolio_{timestamp}_{rand6} */
function generatePortfolioToken(): string {
  const ts   = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `portfolio_${ts}_${rand}`;
}

/* ─── DEVICE FINGERPRINT ────────────────────────────────── */

export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/* ─── LOCAL OWNER STORE ─────────────────────────────────── */

function readStore(): ShareRecord[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
  catch { return []; }
}
function writeStore(records: ShareRecord[]): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(records)); }
  catch { /* storage full – ignore */ }
}

function readRevoked(): string[] {
  try { return JSON.parse(localStorage.getItem(REVOKE_KEY) || '[]'); }
  catch { return []; }
}
function writeRevoked(ids: string[]): void {
  try { localStorage.setItem(REVOKE_KEY, JSON.stringify(ids)); }
  catch { /* ignore */ }
}

/* ─── DB ROW → ShareRecord ──────────────────────────────── */

function mapDbToRecord(row: Record<string, unknown>): ShareRecord {
  const settings = (row.share_settings as ExtendedShareSettings | null) ?? {
    mode: 'entire', selectedSections: [], accessMode: 'view-only',
    expiryHours: 24, viewLimit: null, watermark: false,
    watermarkText: 'Confidential Shared Copy', screenshotProtection: false,
    deviceBound: false, allowedCountry: '',
  };
  return {
    token:             row.share_id as string,
    shareId:           row.share_id as string,
    portfolioId:       row.portfolio_id as string,
    ownerId:           row.user_id as string,
    ownerName:         (row.owner_name as string) || '',
    portfolio:         (row.portfolio_snapshot as Portfolio) ?? ({} as Portfolio),
    settings,
    expiresAt:         (row.expiry_date as string | null) ?? null,
    viewCount:         (row.views_used as number) ?? 0,
    isRevoked:         (row.is_revoked as boolean) ?? false,
    deviceFingerprint: (row.device_fingerprint as string) || '',
    createdAt:         (row.created_at as string) || new Date().toISOString(),
  };
}

/* ─── PUBLIC URL HELPER ─────────────────────────────────── */

function getPublicBaseUrl(): string {
  const env = (import.meta as unknown as { env: Record<string, string> }).env;
  const publicUrl = env?.VITE_PUBLIC_URL;
  if (publicUrl && !publicUrl.includes('onrender.com')) {
    return publicUrl.replace(/\/$/, '');
  }
  const origin = window.location.origin;
  if (
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin.startsWith('capacitor://') ||
    origin.startsWith('file://')
  ) {
    return (env?.VITE_BACKEND_URL ?? 'https://biovault-backend-d13a.onrender.com').replace(/\/$/, '');
  }
  return origin;
}

/* ─── PUBLIC API ─────────────────────────────────────────── */

/**
 * Create a new portfolio share link.
 * Saves to Supabase and caches locally.
 * Returns the full share URL.
 */
export async function createShare(
  ownerId:   string,
  ownerName: string,
  portfolio: Portfolio,
  settings:  ExtendedShareSettings,
): Promise<string> {
  const shareId = generatePortfolioToken();
  const now     = new Date();
  const expiresAt = settings.expiryHours > 0
    ? new Date(now.getTime() + settings.expiryHours * 3_600_000).toISOString()
    : null;

  // Filter sections if mode = 'selected'
  let snapshotPortfolio = portfolio;
  if (settings.mode === 'selected' && settings.selectedSections.length > 0) {
    snapshotPortfolio = {
      ...portfolio,
      sections: portfolio.sections.filter(s =>
        settings.selectedSections.includes(s.title),
      ),
    };
  }

  const finalSettings: ExtendedShareSettings = {
    ...settings,
    selectedSections: settings.mode === 'entire' ? [] : settings.selectedSections,
  };

  const base      = getPublicBaseUrl();
  const shareLink = `${base}/share/${shareId}`;

  // Save to Supabase
  const { error } = await (supabase as any)
    .from('portfolio_shares')
    .insert({
      share_id:           shareId,
      user_id:            ownerId,
      portfolio_id:       portfolio.id,
      portfolio_snapshot: snapshotPortfolio,
      share_settings:     finalSettings,
      share_link:         shareLink,
      owner_name:         ownerName,
      expiry_date:        expiresAt,
      view_limit:         finalSettings.viewLimit,
      views_used:         0,
      is_active:          true,
      is_revoked:         false,
      device_fingerprint: getDeviceFingerprint(),
    });

  if (error) {
    throw new Error(`Failed to save share: ${error.message}`);
  }

  // Cache locally for owner UI
  const record: ShareRecord = {
    token:             shareId,
    shareId,
    portfolioId:       portfolio.id,
    ownerId,
    ownerName,
    portfolio:         snapshotPortfolio,
    settings:          finalSettings,
    expiresAt,
    viewCount:         0,
    isRevoked:         false,
    deviceFingerprint: getDeviceFingerprint(),
    createdAt:         now.toISOString(),
  };
  const store = readStore().filter(r => r.shareId !== shareId);
  writeStore([record, ...store]);

  return shareLink;
}

/**
 * Load and validate a portfolio share from Supabase by token.
 * Increments view count via SECURITY DEFINER RPC.
 */
export async function loadShare(token: string): Promise<LoadResult> {
  if (!token || !token.startsWith('portfolio_')) {
    return { record: null, status: 'invalid', message: 'This share link is invalid or corrupted.' };
  }

  // Check local revocation list first (fast)
  const revoked = readRevoked();
  if (revoked.includes(token)) {
    return { record: null, status: 'revoked', message: 'This share link has been revoked by the owner.' };
  }

  // Fetch from Supabase
  const { data, error } = await (supabase as any)
    .from('portfolio_shares')
    .select('*')
    .eq('share_id', token)
    .single();

  if (error || !data) {
    return { record: null, status: 'invalid', message: 'This share link was not found. It may have been deleted.' };
  }

  const record = mapDbToRecord(data as Record<string, unknown>);

  // Revocation check
  if (record.isRevoked || !data.is_active) {
    return { record, status: 'revoked', message: 'This share link has been revoked by the owner.' };
  }

  // Expiry check
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return { record, status: 'expired', message: 'This share link has expired.' };
  }

  // View-limit check (server value)
  if (data.view_limit !== null && data.view_limit !== undefined) {
    if (data.views_used >= data.view_limit) {
      return {
        record,
        status: 'view_limit',
        message: `This link reached its maximum of ${data.view_limit} view${data.view_limit > 1 ? 's' : ''}.`,
      };
    }
  }

  // Device-binding check (client-side)
  if (record.settings.deviceBound) {
    const myFP      = getDeviceFingerprint();
    const boundKey  = `ps_bound_${token}`;
    const boundFP   = localStorage.getItem(boundKey);
    if (!boundFP) {
      localStorage.setItem(boundKey, myFP);
    } else if (boundFP !== myFP && myFP !== record.deviceFingerprint) {
      return { record, status: 'device_mismatch', message: 'This link is restricted to a specific device.' };
    }
  }

  // Increment view count via RPC (fire-and-forget — don't block rendering)
  (supabase as any).rpc('increment_portfolio_share_views', { p_share_id: token }).then(
    () => { /* success */ },
    () => { /* ignore RPC failure */ },
  );

  return { record, status: 'ok', message: '' };
}

/**
 * Revoke a share — marks it inactive in Supabase and locally.
 */
export async function revokeShare(shareId: string): Promise<void> {
  // Local revocation list (fast UI update)
  const revoked = readRevoked();
  if (!revoked.includes(shareId)) writeRevoked([...revoked, shareId]);
  writeStore(readStore().map(r =>
    r.shareId === shareId ? { ...r, isRevoked: true } : r,
  ));

  // Supabase update
  await (supabase as any)
    .from('portfolio_shares')
    .update({ is_revoked: true, is_active: false })
    .eq('share_id', shareId);
}

/**
 * Restore a previously-revoked share.
 */
export async function restoreShare(shareId: string): Promise<void> {
  writeRevoked(readRevoked().filter(id => id !== shareId));
  writeStore(readStore().map(r =>
    r.shareId === shareId ? { ...r, isRevoked: false } : r,
  ));

  await (supabase as any)
    .from('portfolio_shares')
    .update({ is_revoked: false, is_active: true })
    .eq('share_id', shareId);
}

/**
 * Get all shares for an owner — fetches from Supabase, falls back to localStorage.
 */
export async function getOwnerShares(ownerId: string): Promise<ShareRecord[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('portfolio_shares')
      .select('*')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false });

    if (error || !data || !Array.isArray(data)) throw new Error('fetch failed');

    const revoked = new Set(readRevoked());
    const records: ShareRecord[] = data.map((row: Record<string, unknown>) => {
      const rec = mapDbToRecord(row);
      return { ...rec, isRevoked: rec.isRevoked || revoked.has(rec.shareId) };
    });

    // Update local cache
    writeStore(records);
    return records;
  } catch {
    // Fallback to localStorage cache
    const revoked = new Set(readRevoked());
    return readStore()
      .filter(r => r.ownerId === ownerId)
      .map(r => ({ ...r, isRevoked: r.isRevoked || revoked.has(r.shareId) }));
  }
}

/**
 * Permanently delete a share record from Supabase and local cache.
 */
export async function deleteShareRecord(shareId: string): Promise<void> {
  writeStore(readStore().filter(r => r.shareId !== shareId));
  writeRevoked(readRevoked().filter(id => id !== shareId));

  await (supabase as any)
    .from('portfolio_shares')
    .delete()
    .eq('share_id', shareId);
}

/**
 * Geo-access check using ip-api.com with browser-locale fallback.
 */
export async function checkGeoAccess(allowedCountry: string): Promise<boolean> {
  if (!allowedCountry) return true;

  try {
    const res = await fetch('https://ip-api.com/json/?fields=countryCode', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const code: string = (data.countryCode ?? '').toUpperCase();
      return code === allowedCountry.toUpperCase();
    }
  } catch { /* fall through */ }

  // Fallback: browser locale country hint
  const locales = navigator.languages ?? [navigator.language];
  for (const loc of locales) {
    const parts = loc.split('-');
    if (parts.length > 1) {
      const country = parts[parts.length - 1].toUpperCase();
      if (country.length === 2) return country === allowedCountry.toUpperCase();
    }
  }
  return true;
}

/** @deprecated Use getOwnerShares (async) instead. */
export function generateShareId(): string {
  return generatePortfolioToken();
}
