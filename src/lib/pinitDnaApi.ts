/**
 * PINIT-DNA Server Client — optional cloud sync.
 *
 * When the user hosts the Pinit-DNA Node+Python backend and saves its URL,
 * these calls enable the two features that can't run in the WebView:
 *   • AI Semantic Search (FAISS / sentence-transformers)  → POST /ai/search, /ai/similar
 *   • Monitoring & Crawler (web crawl / Bing visual search) → /monitor/*
 *
 * With no URL configured, every call short-circuits to a "not configured"
 * result and the app falls back to the on-device DNA Lab. Endpoints mirror the
 * Pinit-DNA Express routes exactly (base = <serverUrl>/api/v1).
 */

const URL_KEY = 'pinit_dna_server_url';
const DEFAULT_TIMEOUT = 15000;

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  notConfigured?: boolean;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export function getServerUrl(): string {
  try { return (localStorage.getItem(URL_KEY) || '').replace(/\/+$/, ''); } catch { return ''; }
}

export function setServerUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem(URL_KEY, clean);
    else localStorage.removeItem(URL_KEY);
  } catch { /* ignore */ }
}

export function isServerConfigured(): boolean {
  return getServerUrl().length > 0;
}

function apiBase(): string {
  const url = getServerUrl();
  return url ? `${url}/api/v1` : '';
}

// ─── Core fetch wrapper ─────────────────────────────────────────────────────

async function call<T>(
  path: string,
  init?: RequestInit,
  timeout = DEFAULT_TIMEOUT
): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) return { ok: false, notConfigured: true, error: 'No PINIT-DNA server configured' };

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) return { ok: false, error: (body && body.message) || `HTTP ${res.status}` };
    return { ok: true, data: body as T };
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'Request timed out' : err.message) : 'Network error';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(tid);
  }
}

// ─── Health / connectivity ──────────────────────────────────────────────────

export async function pingServer(): Promise<ApiResult<{ status?: string }>> {
  // Use the root /health endpoint — reflects whether the server is up, and stays
  // 200 even when the optional Python AI service is offline (/ai/health is 503 then).
  const url = getServerUrl();
  if (!url) return { ok: false, notConfigured: true, error: 'No PINIT-DNA server configured' };
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/health`, { method: 'GET', signal: controller.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, data: { status: body?.status || 'healthy' } };
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'Request timed out' : err.message) : 'Network error';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(tid);
  }
}

// ─── AI Semantic Search (FAISS) ─────────────────────────────────────────────

export interface SemanticHit { dnaRecordId: string; filename: string; score: number; fileType?: string; }

export async function cloudSemanticSearch(query: string, topK = 10): Promise<ApiResult<{ results: SemanticHit[] }>> {
  return call('/ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK }),
  });
}

export async function cloudFindSimilar(dnaRecordId: string, topK = 10): Promise<ApiResult<{ results: SemanticHit[] }>> {
  return call('/ai/similar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dnaRecordId, topK }),
  });
}

// ─── DNA generate (so a record exists server-side to index / monitor) ───────

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, b64] = dataUrl.split(',');
    const mime = head.slice(5, head.indexOf(';'));
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  } catch { return null; }
}

export interface CloudDnaRecord { dnaRecordId: string; status: string; fileType?: string; }

export async function cloudGenerateDna(dataUrl: string, fileName: string): Promise<ApiResult<CloudDnaRecord>> {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return { ok: false, error: 'Could not read file data' };
  const form = new FormData();
  form.append('image', blob, fileName);
  return call('/dna/generate', { method: 'POST', body: form }, 60000);
}

// ─── Monitoring & Crawler ───────────────────────────────────────────────────

export interface MonitorAlert { id: string; dnaRecordId: string; sourceUrl?: string; similarity?: number; detectedAt?: string; status?: string; }
export interface MonitorStats { activeMonitors?: number; totalAlerts?: number; pendingAlerts?: number; }

export async function cloudEnrollMonitor(dnaRecordId: string): Promise<ApiResult<{ id: string }>> {
  return call(`/monitor/enroll/${encodeURIComponent(dnaRecordId)}`, { method: 'POST' });
}

export async function cloudMonitorStats(): Promise<ApiResult<MonitorStats>> {
  return call('/monitor/stats', { method: 'GET' });
}

export async function cloudMonitorAlerts(): Promise<ApiResult<{ alerts: MonitorAlert[] }>> {
  return call('/monitor/alerts', { method: 'GET' });
}

export async function cloudRunCheck(monitorId: string): Promise<ApiResult<unknown>> {
  return call(`/monitor/${encodeURIComponent(monitorId)}/check`, { method: 'POST' }, 60000);
}
