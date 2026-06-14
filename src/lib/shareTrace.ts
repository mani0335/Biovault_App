/**
 * Share Trace Graph — track how a shared link is forwarded (A → B → C).
 *
 * How it works (fully on-device + Supabase, no Pinit-DNA server):
 *  1. Each viewer gets a stable `visitorId` (saved in their browser per share).
 *  2. A forward link carries `?ref=<senderVisitorId>` — when the next person
 *     opens it, we know who forwarded it → that's their parent.
 *  3. Each first-open logs a "hop" row to Supabase `share_hops`.
 *  4. The owner builds the tree from all hops for a share.
 */

import { supabase } from '@/integrations/supabase/client';

export interface ShareHop {
  shareId: string;
  visitorId: string;
  parentVisitorId: string | null;
  ownerId?: string;
  fileName?: string;
  deviceType?: string;
  ipAddress?: string;
  geoCity?: string;
  geoCountry?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  riskScore?: number;
  createdAt?: string;
}

export interface TraceNode extends ShareHop {
  children: TraceNode[];
  depth: number;
}

// ─── Visitor identity (stable per share, stored in the viewer's browser) ─────

export function getVisitorId(shareId: string): string {
  const key = `pinit_visitor_${shareId}`;
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

/** Read the forwarder's id from the URL (?ref=...). */
export function getRefFromUrl(): string | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const ref = p.get('ref');
    return ref && ref.startsWith('v_') ? ref : null;
  } catch {
    return null;
  }
}

/** Build a forward link that credits the current viewer as the parent. */
export function buildForwardLink(shareId: string): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('ref', getVisitorId(shareId));
    return url.toString();
  } catch {
    return window.location.href;
  }
}

// ─── Logging a hop ────────────────────────────────────────────────────────────

const HOPS_KEY = 'pinit_share_hops_v1';

function readLocalHops(): ShareHop[] {
  try { return JSON.parse(localStorage.getItem(HOPS_KEY) || '[]'); } catch { return []; }
}
function writeLocalHops(hops: ShareHop[]): void {
  try { localStorage.setItem(HOPS_KEY, JSON.stringify(hops.slice(0, 2000))); } catch { /* ignore */ }
}

/**
 * Record this viewer's hop once (first open). Idempotent per (shareId, visitorId)
 * thanks to the unique constraint + upsert. Writes locally + best-effort cloud.
 */
export async function recordHop(hop: ShareHop): Promise<void> {
  const enriched: ShareHop = { ...hop, createdAt: hop.createdAt || new Date().toISOString() };

  // local (de-duped)
  const local = readLocalHops();
  if (!local.some((h) => h.shareId === enriched.shareId && h.visitorId === enriched.visitorId)) {
    writeLocalHops([enriched, ...local]);
  }

  // cloud (upsert so re-opens don't duplicate)
  try {
    await (supabase as any).from('share_hops').upsert(
      {
        share_id: enriched.shareId,
        visitor_id: enriched.visitorId,
        parent_visitor_id: enriched.parentVisitorId,
        owner_id: enriched.ownerId || null,
        file_name: enriched.fileName || null,
        device_type: enriched.deviceType || null,
        ip_address: enriched.ipAddress || null,
        geo_city: enriched.geoCity || null,
        geo_country: enriched.geoCountry || null,
        gps_lat: enriched.gpsLat ?? null,
        gps_lng: enriched.gpsLng ?? null,
        risk_score: enriched.riskScore || 0,
        created_at: enriched.createdAt,
      },
      { onConflict: 'share_id,visitor_id', ignoreDuplicates: false }
    );
  } catch {
    /* table may not exist yet — local copy still works */
  }
}

// ─── Reading hops + building the tree ────────────────────────────────────────

export async function getHops(shareId: string): Promise<ShareHop[]> {
  let cloud: ShareHop[] = [];
  try {
    const { data } = await (supabase as any)
      .from('share_hops')
      .select('*')
      .eq('share_id', shareId)
      .order('created_at', { ascending: true });
    if (Array.isArray(data)) {
      cloud = data.map((r: any) => ({
        shareId: r.share_id,
        visitorId: r.visitor_id,
        parentVisitorId: r.parent_visitor_id,
        ownerId: r.owner_id,
        fileName: r.file_name,
        deviceType: r.device_type,
        ipAddress: r.ip_address,
        geoCity: r.geo_city,
        geoCountry: r.geo_country,
        gpsLat: r.gps_lat,
        gpsLng: r.gps_lng,
        riskScore: r.risk_score,
        createdAt: r.created_at,
      }));
    }
  } catch { /* offline / no table */ }

  // merge local (in case cloud is empty)
  const local = readLocalHops().filter((h) => h.shareId === shareId);
  const byId = new Map<string, ShareHop>();
  for (const h of [...local, ...cloud]) byId.set(h.visitorId, h);
  return [...byId.values()].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/** Build the forwarding tree. Roots = hops with no (known) parent. */
export function buildTree(hops: ShareHop[]): TraceNode[] {
  const nodes = new Map<string, TraceNode>();
  for (const h of hops) nodes.set(h.visitorId, { ...h, children: [], depth: 0 });

  const roots: TraceNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentVisitorId ? nodes.get(node.parentVisitorId) : null;
    if (parent) { node.depth = parent.depth + 1; parent.children.push(node); }
    else roots.push(node);
  }
  // normalise depths breadth-first (in case of out-of-order inserts)
  const fix = (n: TraceNode, d: number) => { n.depth = d; n.children.forEach((c) => fix(c, d + 1)); };
  roots.forEach((r) => fix(r, 0));
  return roots;
}

/** Subscribe to live hop inserts for a share. Returns an unsubscribe fn. */
export function subscribeHops(shareId: string, onChange: () => void): () => void {
  try {
    const ch = (supabase as any)
      .channel(`share_hops_${shareId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_hops', filter: `share_id=eq.${shareId}` }, () => onChange())
      .subscribe();
    return () => { try { (supabase as any).removeChannel(ch); } catch { /* ignore */ } };
  } catch {
    return () => { /* no-op */ };
  }
}

/** Request precise GPS (one-shot). Resolves null if denied/unavailable. */
export function getGpsOnce(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
      let settled = false;
      const done = (v: { lat: number; lng: number } | null) => { if (!settled) { settled = true; resolve(v); } };
      navigator.geolocation.getCurrentPosition(
        (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => done(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
      setTimeout(() => done(null), timeoutMs + 500);
    } catch {
      resolve(null);
    }
  });
}
