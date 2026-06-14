/**
 * PINIT DNA Lab — on-device equivalents of the Pinit-DNA server features:
 *   • Semantic Search  → "Find Similar" ranks vault items by DNA similarity
 *   • Difference Engine → "Compare" shows per-layer similarity between two items
 *   • Monitoring        → scans the vault for duplicates / near-duplicates
 *
 * All computation runs locally on the stored DNA fingerprints (no server). When
 * a vault item has no stored DNA yet, it is composed on demand from its data URL.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Fingerprint, Search, GitCompare, Radar, Loader2, ShieldCheck, AlertTriangle, Cloud, CloudOff, Globe, FileText, Activity, ChevronDown, ChevronUp, Shield, Eye, Share2, Clock, Radio } from 'lucide-react';
import {
  generateDocumentDNA, diffDocumentDNA, type DocumentDNA,
} from '@/lib/documentDna';
import { AssetAnalysisReport } from '@/components/AssetAnalysisReport';
import {
  getServerUrl, setServerUrl, isServerConfigured, pingServer,
  cloudSemanticSearch, cloudGenerateDna, cloudEnrollMonitor, cloudMonitorAlerts, cloudMonitorStats,
  type SemanticHit, type MonitorAlert,
} from '@/lib/pinitDnaApi';
import { getHops, buildTree, subscribeHops, type ShareHop, type TraceNode } from '@/lib/shareTrace';
import { ShareTraceGraph } from '@/components/ShareTraceGraph';
import {
  getShareMonitorData, approveDownloadRequest, rejectDownloadRequest,
  subscribeToShareActivity,
  type VisitorRecord, type DownloadRequest as DlRequest,
} from '@/lib/shareMonitor';
import { DnaMonitorDashboard } from '@/components/DnaMonitorDashboard';

// Accept BOTH storage formats: vaultService (name/encryptedData) and
// vaultManager (fileName/fileData/fileType).
interface LabDoc {
  id: string;
  name?: string;
  fileName?: string;
  encryptedData?: string;
  fileData?: string;
  fileType?: string;
  pHash?: string;
  metadata?: { size?: number; dna?: DocumentDNA };
}

interface ShareLike {
  id: string;
  shareLink: string;
  createdAt: string;
  expiryDate?: string | null;
  downloadLimit?: number | null;
  downloadsUsed?: number;
  passwordProtected?: boolean;
  enableChainTracking?: boolean;
  enableWatermark?: boolean;
}

interface DnaLabProps {
  documents: LabDoc[];
  userId?: string;
  onBack: () => void;
  shares?: ShareLike[];
}

type Tab = 'monitor' | 'similar' | 'compare' | 'report';

// ── Format-agnostic accessors ──
function docName(doc: LabDoc): string {
  return doc.name || doc.fileName || 'Untitled';
}

function mimeOf(doc: LabDoc): string {
  const d = doc.encryptedData || doc.fileData || '';
  if (d.startsWith('data:')) return d.slice(5, d.indexOf(';') >= 0 ? d.indexOf(';') : 5) || 'application/octet-stream';
  if (doc.fileType === 'pdf') return 'application/pdf';
  if (doc.fileType === 'image') return 'image/jpeg';
  const n = docName(doc);
  if (/\.pdf$/i.test(n)) return 'application/pdf';
  if (/\.(png|jpe?g|webp|gif)$/i.test(n)) return 'image/' + (n.split('.').pop() || 'png');
  if (/\.(mp4|mov|webm)$/i.test(n)) return 'video/' + (n.split('.').pop() || 'mp4');
  return 'application/octet-stream';
}

/** Return a usable data URL for a doc, reconstructing one from raw base64 if needed. */
function docDataUrl(doc: LabDoc): string {
  const raw = doc.encryptedData || doc.fileData || '';
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  // raw base64 (vaultManager fileData) → wrap with the right mime
  return `data:${mimeOf(doc)};base64,${raw}`;
}

/** Can we fingerprint this doc? (has stored DNA, or any image/pdf/video data) */
function isFingerprintable(doc: LabDoc): boolean {
  if (doc.metadata?.dna || doc.pHash) return true;
  const url = docDataUrl(doc);
  return url.startsWith('data:') && url.length > 32;
}

// ── Share Monitor sub-component ──────────────────────────────────────────────

interface ShareCardState {
  hops: ShareHop[];
  expanded: boolean;
  visitors: VisitorRecord[];
  dlRequests: DlRequest[];
  secEvents: { event_type: string; visitor_name?: string; created_at: string; risk_score: number }[];
}

function timeAgoShort(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function riskColor(score: number): string {
  if (score >= 70) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (score >= 40) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
}

const ShareCard: React.FC<{ share: ShareLike }> = ({ share }) => {
  const [state, setState] = useState<ShareCardState>({
    hops: [], expanded: false, visitors: [], dlRequests: [], secEvents: [],
  });
  const [traceOpen, setTraceOpen] = useState(false);
  const [dlTab, setDlTab] = useState<'viewers' | 'events' | 'downloads'>('viewers');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [hops, monData] = await Promise.all([
        getHops(share.id),
        getShareMonitorData(share.id),
      ]);
      if (!cancelled) setState((s) => ({
        ...s, hops,
        visitors: monData.visitors,
        dlRequests: monData.downloadRequests,
        secEvents: monData.securityEvents as ShareCardState['secEvents'],
      }));
    };
    load();
    const unsubHops = subscribeHops(share.id, load);
    const unsubMon = subscribeToShareActivity(share.id, load);
    const t = window.setInterval(load, 15000);
    return () => { cancelled = true; unsubHops(); unsubMon(); window.clearInterval(t); };
  }, [share.id]);

  const handleApprove = async (id: string) => {
    await approveDownloadRequest(id, 1);
    setState((s) => ({
      ...s,
      dlRequests: s.dlRequests.map((r) => r.id === id ? { ...r, status: 'approved' as const, approvedLimit: 1 } : r),
    }));
  };

  const handleReject = async (id: string) => {
    await rejectDownloadRequest(id);
    setState((s) => ({
      ...s,
      dlRequests: s.dlRequests.map((r) => r.id === id ? { ...r, status: 'rejected' as const } : r),
    }));
  };

  const isExpired = share.expiryDate ? new Date(share.expiryDate) < new Date() : false;
  const forwards = state.hops.filter((h) => h.parentVisitorId).length;
  const views = state.hops.length;
  const maxRisk = state.hops.reduce((m, h) => Math.max(m, h.riskScore || 0), 0);
  const shortId = share.id.slice(-8);
  const fileName = state.hops[0]?.fileName || share.shareLink.split('/').pop() || share.id;
  const lastActivity = state.hops.length > 0 ? state.hops[state.hops.length - 1].createdAt : share.createdAt;

  if (traceOpen) {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-slate-800/30 overflow-hidden">
        <ShareTraceGraph shareId={share.id} fileName={fileName} onBack={() => setTraceOpen(false)} />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-slate-500">#{shortId}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isExpired ? 'text-slate-400 bg-slate-700/40 border-slate-600/40' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'}`}>
              {isExpired ? 'Expired' : 'Active'}
            </span>
            {maxRisk > 0 && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${riskColor(maxRisk)}`}>
                Risk {maxRisk}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-white truncate mt-0.5">{fileName}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-slate-900/40 rounded-lg py-1.5">
          <div className="flex items-center justify-center gap-1 text-fuchsia-300"><Eye className="w-3 h-3" /></div>
          <div className="text-sm font-bold text-white">{views}</div>
          <div className="text-[8px] text-slate-500">Views</div>
        </div>
        <div className="bg-slate-900/40 rounded-lg py-1.5">
          <div className="flex items-center justify-center gap-1 text-amber-300"><Share2 className="w-3 h-3" /></div>
          <div className="text-sm font-bold text-white">{forwards}</div>
          <div className="text-[8px] text-slate-500">Forwards</div>
        </div>
        <div className="bg-slate-900/40 rounded-lg py-1.5">
          <div className="flex items-center justify-center gap-1 text-cyan-300"><Clock className="w-3 h-3" /></div>
          <div className="text-[10px] font-bold text-white leading-tight">{timeAgoShort(lastActivity)}</div>
          <div className="text-[8px] text-slate-500">Activity</div>
        </div>
      </div>

      {/* Evidence log toggle */}
      <button onClick={() => setState((s) => ({ ...s, expanded: !s.expanded }))}
        className="w-full flex items-center justify-between text-[10px] text-slate-400 hover:text-slate-200 transition-colors px-1">
        <span>Evidence log ({state.hops.length} events)</span>
        {state.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {state.expanded && (
        <div className="space-y-2">
          {/* Chain graph button */}
          <button onClick={() => setTraceOpen(true)}
            className="w-full py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600/40 to-purple-600/40 border border-fuchsia-500/30 text-[10px] font-semibold text-fuchsia-200 hover:from-fuchsia-600/60 hover:to-purple-600/60 transition-all">
            View Forward Chain Graph
          </button>

          {/* Sub-tabs */}
          <div className="flex gap-1">
            {(['viewers', 'events', 'downloads'] as const).map((t) => (
              <button key={t} onClick={() => setDlTab(t)}
                className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all ${dlTab === t ? 'bg-fuchsia-600/30 border border-fuchsia-500/40 text-fuchsia-300' : 'bg-slate-800/40 text-slate-500 border border-slate-700/30'}`}>
                {t === 'viewers' ? `Viewers (${state.visitors.length || state.hops.length})` : t === 'events' ? `Events (${state.secEvents.length})` : `Downloads (${state.dlRequests.length})`}
              </button>
            ))}
          </div>

          {/* Viewers tab — real visitor names + location */}
          {dlTab === 'viewers' && (
            state.visitors.length > 0 ? (
              <div className="space-y-1">
                {state.visitors.slice(0, 8).map((v, i) => (
                  <div key={i} className={`rounded-lg px-2.5 py-2 text-[9px] border ${i % 2 === 0 ? 'bg-slate-900/40 border-slate-700/30' : 'bg-slate-800/20 border-slate-700/20'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-white font-semibold">{(v as unknown as Record<string, string>).visitor_name || '—'}</span>
                      <span className="text-slate-500">{timeAgoShort((v as unknown as Record<string, string>).session_start || (v as unknown as Record<string, string>).created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 mt-0.5">
                      <span>{(v as unknown as Record<string, string>).geo_city || '—'}{(v as unknown as Record<string, string>).geo_state ? `, ${(v as unknown as Record<string, string>).geo_state}` : ''}</span>
                      <span>·</span>
                      <span>{(v as unknown as Record<string, string>).os || '—'}</span>
                      <span>·</span>
                      <span>{(v as unknown as Record<string, string>).browser || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : state.hops.length > 0 ? (
              <div className="rounded-lg overflow-hidden border border-slate-700/40">
                <div className="grid grid-cols-4 gap-0 bg-slate-900/60 px-2 py-1 text-[8px] font-semibold text-slate-500 uppercase tracking-wide">
                  <span>Time</span><span>Event</span><span>Location</span><span>Risk</span>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {state.hops.map((h, i) => (
                    <div key={i} className={`grid grid-cols-4 gap-0 px-2 py-1 text-[9px] border-t border-slate-700/30 ${i % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-900/20'}`}>
                      <span className="text-slate-500 truncate">{timeAgoShort(h.createdAt)}</span>
                      <span className="text-slate-300 truncate">{h.parentVisitorId ? 'Forward' : 'Open'}</span>
                      <span className="text-slate-400 truncate">{h.geoCity && h.geoCity !== 'Unknown' ? h.geoCity : (h.geoCountry || '—')}</span>
                      <span className={`font-bold ${(h.riskScore || 0) >= 70 ? 'text-red-400' : (h.riskScore || 0) >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{h.riskScore || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 text-center py-2">No viewers yet.</p>
            )
          )}

          {/* Security events tab */}
          {dlTab === 'events' && (
            state.secEvents.length === 0 ? (
              <p className="text-[10px] text-slate-500 text-center py-2">No security events recorded.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {state.secEvents.slice(0, 20).map((ev, i) => {
                  const risk = ev.risk_score ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-2 bg-slate-900/40 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-semibold text-white">{(ev.event_type || '').replace(/_/g, ' ')}</p>
                        <p className="text-[8px] text-slate-400 truncate">{ev.visitor_name || 'Unknown viewer'}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${riskColor(risk)}`}>{risk}</span>
                      <span className="text-[9px] text-slate-500">{timeAgoShort(ev.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Download requests tab */}
          {dlTab === 'downloads' && (
            state.dlRequests.length === 0 ? (
              <p className="text-[10px] text-slate-500 text-center py-2">No download requests yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {state.dlRequests.map((req, i) => (
                  <div key={i} className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-white">{(req as unknown as Record<string, string>).visitor_name || 'Unknown'}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                        ((req as unknown as Record<string, string>).status || req.status) === 'approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : ((req as unknown as Record<string, string>).status || req.status) === 'rejected' ? 'text-red-400 bg-red-500/10 border-red-500/30'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      }`}>
                        {((req as unknown as Record<string, string>).status || req.status) || 'pending'}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">{timeAgoShort((req as unknown as Record<string, string>).created_at || req.createdAt)}</p>
                    {(((req as unknown as Record<string, string>).status || req.status) === 'pending') && (
                      <div className="flex gap-1.5">
                        <button onClick={() => handleApprove(req.id || (req as unknown as Record<string, string>).id)}
                          className="flex-1 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-semibold hover:bg-emerald-600/40 transition-all">
                          ✓ Approve
                        </button>
                        <button onClick={() => handleReject(req.id || (req as unknown as Record<string, string>).id)}
                          className="flex-1 py-1 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-[9px] font-semibold hover:bg-red-600/40 transition-all">
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </motion.div>
  );
};

interface ShareMonitorDashboardProps {
  shares: ShareLike[];
  documents: LabDoc[];
  usable: LabDoc[];
  dupes: { a: string; b: string; sim: number }[] | null;
  busy: boolean;
  runMonitorScan: () => void;
  CLOUD_ENABLED: boolean;
  connected: boolean;
  enrolling: boolean;
  enrollAllForMonitoring: () => void;
  loadAlerts: () => void;
  alerts: MonitorAlert[] | null;
}

const ShareMonitorDashboard: React.FC<ShareMonitorDashboardProps> = ({
  shares, documents, usable, dupes, busy, runMonitorScan,
  CLOUD_ENABLED, connected, enrolling, enrollAllForMonitoring, loadAlerts, alerts,
}) => {
  const activeShares = shares.filter((s) => !s.expiryDate || new Date(s.expiryDate) >= new Date()).length;

  // Aggregate real security events across all shares from localStorage
  const tamperEvents = React.useMemo(() => {
    const all: { time: string; type: string; detail: string; risk: number; visitor: string }[] = [];
    for (const share of shares) {
      try {
        const raw = localStorage.getItem(`pinit_sec_events_${share.id}`);
        if (!raw) continue;
        const evs = JSON.parse(raw) as Array<{ event_type: string; visitor_name?: string; risk_score: number; created_at: string }>;
        for (const ev of evs.slice(0, 5)) {
          all.push({
            time: timeAgoShort(ev.created_at),
            type: (ev.event_type || '').replace(/_/g, ' '),
            detail: ev.visitor_name ? `By ${ev.visitor_name}` : 'Anonymous viewer',
            risk: ev.risk_score || 0,
            visitor: ev.visitor_name || 'Unknown',
          });
        }
      } catch { /* ignore */ }
    }
    return all.slice(0, 10);
  }, [shares]);

  return (
    <div className="space-y-4">
      {/* Top-level stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
          <div className="text-lg font-bold text-fuchsia-300">{shares.length}</div>
          <div className="text-[8px] text-slate-500 uppercase">Shares</div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
          <div className="text-lg font-bold text-cyan-300">{activeShares}</div>
          <div className="text-[8px] text-slate-500 uppercase">Active</div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
          <div className="text-lg font-bold text-amber-300">—</div>
          <div className="text-[8px] text-slate-500 uppercase">Forwards</div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
          <div className={`text-lg font-bold ${tamperEvents.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>{tamperEvents.length}</div>
          <div className="text-[8px] text-slate-500 uppercase">Alerts</div>
        </div>
      </div>

      {/* Per-share cards */}
      {shares.length === 0 ? (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 text-center">
          <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-semibold">No shares yet</p>
          <p className="text-[11px] text-slate-500 mt-1">Create a share link from the Share page to see live tracking here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Share Links</p>
          {shares.map((s) => <ShareCard key={s.id} share={s} />)}
        </div>
      )}

      {/* Tampering Alerts */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold text-red-300">Tampering Alerts</span>
          <span className="ml-auto text-[9px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded font-bold border border-red-500/30">
            {tamperEvents.length} events
          </span>
        </div>
        {tamperEvents.length === 0 ? (
          <p className="text-[10px] text-slate-500 text-center py-1">No security events yet — events are recorded when recipients view protected links.</p>
        ) : tamperEvents.map((ev, i) => (
          <div key={i} className="flex items-center gap-2 bg-slate-900/40 rounded-lg px-2.5 py-2">
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-white capitalize">{ev.type}</p>
              <p className="text-[9px] text-slate-400 truncate">{ev.detail}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${riskColor(ev.risk)}`}>{ev.risk}</span>
              <span className="text-[9px] text-slate-500">{ev.time}</span>
            </div>
          </div>
        ))}
        <p className="text-[9px] text-slate-600 text-center">Screenshot / devtools / copy-paste detection from PINIT DNA protected sessions</p>
      </div>

      {/* Vault duplicate scan (existing functionality preserved) */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-3.5 h-3.5 text-pink-400" />
          <span className="text-xs font-semibold text-slate-300">Vault Duplicate Scan</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-900/40 rounded-lg p-2">
            <div className="text-base font-bold text-white">{documents.length}</div>
            <div className="text-[9px] text-slate-400">Assets</div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <div className="text-base font-bold text-cyan-300">{usable.length}</div>
            <div className="text-[9px] text-slate-400">DNA-ready</div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <div className="text-base font-bold text-amber-300">{dupes ? dupes.length : '—'}</div>
            <div className="text-[9px] text-slate-400">Dupes</div>
          </div>
        </div>
        <button disabled={busy || usable.length === 0} onClick={runMonitorScan}
          className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold disabled:opacity-50">
          Scan vault for duplicates
        </button>
        {dupes && dupes.length === 0 && (
          <p className="text-xs text-emerald-300 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> No near-duplicates found.</p>
        )}
        {dupes && dupes.map((d, i) => (
          <div key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3 h-3 text-amber-400" /><span className="text-xs font-bold text-amber-300">{d.sim}% similar</span></div>
            <p className="text-[10px] text-slate-300 truncate">{d.a}</p>
            <p className="text-[10px] text-slate-400 truncate">{d.b}</p>
          </div>
        ))}

        {/* Web crawl monitoring (server) */}
        {CLOUD_ENABLED && (
          <div className="mt-1 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-cyan-300" /><span className="text-[11px] font-semibold text-cyan-200">Web Monitoring &amp; Crawler</span></div>
            {!connected ? (
              <p className="text-[10px] text-slate-400">Connect a PINIT-DNA server to crawl the web for stolen copies of your assets.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={enrollAllForMonitoring} disabled={enrolling || usable.length === 0}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-[11px] font-semibold disabled:opacity-50">
                    {enrolling ? 'Enrolling…' : 'Enroll vault for web monitoring'}
                  </button>
                  <button onClick={loadAlerts} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-[11px] font-semibold disabled:opacity-50">Refresh</button>
                </div>
                {alerts && alerts.length === 0 && <p className="text-[10px] text-emerald-300">No web copies detected yet.</p>}
                {alerts && alerts.map((al, i) => (
                  <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                    <div className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /><span className="text-[10px] font-bold text-amber-300">{al.similarity ? Math.round(al.similarity) + '% match' : 'Possible copy'}</span></div>
                    {al.sourceUrl && <p className="text-[10px] text-cyan-300 truncate">{al.sourceUrl}</p>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SimBar: React.FC<{ value: number | null }> = ({ value }) => (
  <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full ${value === null ? 'bg-slate-600' : value >= 85 ? 'bg-emerald-400' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
      style={{ width: `${value ?? 0}%` }}
    />
  </div>
);

export const DnaLabPage: React.FC<DnaLabProps> = ({ documents, userId, onBack, shares = [] }) => {
  const [reportDocId, setReportDocId] = useState<string>('');
  const [showFullMonitor, setShowFullMonitor] = useState(false);
  // Cloud (PINIT-DNA server) UI is parked until a public server is hosted.
  // Flip to true to re-enable the server panel + FAISS search + web crawler.
  const CLOUD_ENABLED = false;

  const [tab, setTab] = useState<Tab>('monitor');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const dnaCache = useMemo(() => new Map<string, DocumentDNA | null>(), []);

  // ── Cloud (PINIT-DNA server) state ──
  const [serverUrl, setSrvUrl] = useState(getServerUrl());
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [cloudHits, setCloudHits] = useState<SemanticHit[] | null>(null);
  const [cloudQuery, setCloudQuery] = useState('');
  const [alerts, setAlerts] = useState<MonitorAlert[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const connectServer = async () => {
    setConnecting(true); setStatus('');
    setServerUrl(serverUrl);
    const res = await pingServer();
    setConnected(res.ok);
    setStatus(res.ok ? '' : (res.notConfigured ? 'Enter a server URL first.' : `Cannot reach server: ${res.error}`));
    setConnecting(false);
  };

  const runCloudSearch = async () => {
    if (!cloudQuery.trim()) { setStatus('Type something to search for.'); return; }
    setBusy(true); setCloudHits(null); setStatus('Searching FAISS index…');
    const res = await cloudSemanticSearch(cloudQuery.trim(), 10);
    setCloudHits(res.ok && res.data ? (res.data.results || []) : []);
    setStatus(res.ok ? '' : `Search failed: ${res.error}`);
    setBusy(false);
  };

  const loadAlerts = async () => {
    setBusy(true); setStatus('Fetching crawler alerts…');
    const [a, s] = [await cloudMonitorAlerts(), await cloudMonitorStats()];
    setAlerts(a.ok && a.data ? (a.data.alerts || []) : []);
    setStatus(a.ok ? (s.ok && s.data ? `Active monitors: ${s.data.activeMonitors ?? 0}` : '') : `Failed: ${a.error}`);
    setBusy(false);
  };

  const enrollAllForMonitoring = async () => {
    setEnrolling(true);
    let done = 0;
    for (const d of usable.slice(0, 20)) {
      setStatus(`Enrolling ${done + 1}/${Math.min(20, usable.length)} for web monitoring…`);
      const url = docDataUrl(d);
      if (!url.startsWith('data:')) continue;
      const gen = await cloudGenerateDna(url, docName(d));
      if (gen.ok && gen.data?.dnaRecordId) { await cloudEnrollMonitor(gen.data.dnaRecordId); done++; }
    }
    setStatus(`Enrolled ${done} item(s) for web crawl monitoring.`);
    setEnrolling(false);
    await loadAlerts();
  };

  // Items we can fingerprint (stored DNA/pHash, or any readable image/pdf/video data)
  const usable = useMemo(
    () => documents.filter(isFingerprintable),
    [documents]
  );

  // Build a minimal DNA from a stored pHash so cloud-backed items (no inline
  // data URL) can still be compared on their perceptual layer.
  const partialFromPHash = (doc: LabDoc): DocumentDNA | null => {
    const ph = doc.pHash;
    if (!ph) return null;
    const sig = (ph.replace(/[^0-9a-f]/gi, '').toUpperCase() + '00000000').slice(0, 16);
    return {
      dnaId: `DNA-${sig.slice(0, 4)}-${sig.slice(4, 8)}`,
      signature: sig,
      version: 'phash-only',
      layers: [{ id: 'L3', key: 'perceptual', name: 'Perceptual Hash', detail: 'stored pHash', status: 'complete', durationMs: 0 }],
      layerCount: 1,
      totalMs: 0,
      sha256: null, edgeSignature: null, pHash: ph, aHash: null, dHash: null,
      colorHistogram: null, dominantColors: null, exifSummary: null, hmacSeal: null,
      fileType: mimeOf(doc), sizeBytes: doc.metadata?.size || 0, composedAt: new Date().toISOString(),
    };
  };

  const ensureDna = async (doc: LabDoc): Promise<DocumentDNA | null> => {
    if (doc.metadata?.dna) return doc.metadata.dna;
    if (dnaCache.has(doc.id)) return dnaCache.get(doc.id)!;
    let dna: DocumentDNA | null = null;
    try {
      const url = docDataUrl(doc);
      if (url.startsWith('data:')) {
        dna = await generateDocumentDNA(url, docName(doc), mimeOf(doc), doc.metadata?.size || url.length);
      }
    } catch { dna = null; }
    // Fallback: stored pHash → partial DNA (perceptual-only comparison)
    if (!dna) dna = partialFromPHash(doc);
    dnaCache.set(doc.id, dna);
    return dna;
  };

  // ── Monitoring: scan for duplicates / near-duplicates ──
  const [dupes, setDupes] = useState<{ a: string; b: string; sim: number }[] | null>(null);
  const runMonitorScan = async () => {
    setBusy(true); setDupes(null);
    try {
      const subset = usable.slice(0, 40); // cap for performance
      const dnas: { doc: LabDoc; dna: DocumentDNA | null }[] = [];
      for (let i = 0; i < subset.length; i++) {
        setStatus(`Fingerprinting ${i + 1}/${subset.length}…`);
        dnas.push({ doc: subset[i], dna: await ensureDna(subset[i]) });
      }
      const found: { a: string; b: string; sim: number }[] = [];
      for (let i = 0; i < dnas.length; i++)
        for (let j = i + 1; j < dnas.length; j++) {
          if (!dnas[i].dna || !dnas[j].dna) continue;
          const d = diffDocumentDNA(dnas[i].dna!, dnas[j].dna!);
          if (d.overallSimilarity >= 72) found.push({ a: docName(dnas[i].doc), b: docName(dnas[j].doc), sim: d.overallSimilarity });
        }
      found.sort((x, y) => y.sim - x.sim);
      setDupes(found);
      setStatus('');
    } finally { setBusy(false); }
  };

  // ── Semantic Search: Find Similar to a chosen item ──
  const [queryId, setQueryId] = useState<string>('');
  const [similar, setSimilar] = useState<{ name: string; sim: number; dnaId: string }[] | null>(null);
  const runFindSimilar = async () => {
    const query = usable.find((d) => d.id === queryId) || usable[0];
    if (!query) return;
    setBusy(true); setSimilar(null);
    try {
      setStatus('Fingerprinting query…');
      const qDna = await ensureDna(query);
      if (!qDna) { setSimilar([]); return; }
      const results: { name: string; sim: number; dnaId: string }[] = [];
      const others = usable.filter((d) => d.id !== query.id).slice(0, 40);
      for (let i = 0; i < others.length; i++) {
        setStatus(`Comparing ${i + 1}/${others.length}…`);
        const dna = await ensureDna(others[i]);
        if (!dna) continue;
        const d = diffDocumentDNA(qDna, dna);
        results.push({ name: docName(others[i]), sim: d.overallSimilarity, dnaId: dna.dnaId });
      }
      results.sort((a, b) => b.sim - a.sim);
      setSimilar(results.slice(0, 8));
      setStatus('');
    } finally { setBusy(false); }
  };

  // ── Difference Engine: compare two items ──
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [diff, setDiff] = useState<{ overall: number; identical: boolean; layers: { name: string; sim: number | null }[] } | null>(null);
  const runCompare = async () => {
    const L = usable.find((d) => d.id === leftId);
    const R = usable.find((d) => d.id === rightId);
    if (!L || !R) { setStatus('Pick two items to compare.'); return; }
    setBusy(true); setDiff(null);
    try {
      setStatus('Fingerprinting both…');
      const [a, b] = [await ensureDna(L), await ensureDna(R)];
      if (!a || !b) { setStatus('Could not fingerprint one of the items.'); return; }
      const d = diffDocumentDNA(a, b);
      setDiff({ overall: d.overallSimilarity, identical: d.identical, layers: d.layerDiffs.map((l) => ({ name: l.name, sim: l.similarity })) });
      setStatus('');
    } finally { setBusy(false); }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'monitor', label: 'Monitoring', icon: Radar },
    { id: 'similar', label: 'Find Similar', icon: Search },
    { id: 'compare', label: 'Compare', icon: GitCompare },
    { id: 'report', label: 'Report', icon: FileText },
  ];

  // Full Monitoring Center overlay
  if (showFullMonitor) {
    return (
      <DnaMonitorDashboard
        shares={shares.map((s) => ({ id: s.id, shareLink: s.shareLink, createdAt: s.createdAt, expiryDate: s.expiryDate, image_name: undefined }))}
        userId={userId}
        onBack={() => setShowFullMonitor(false)}
      />
    );
  }

  // When a report asset is chosen, show the full report view
  const reportDoc = documents.find((d) => d.id === reportDocId);
  if (reportDoc) {
    return (
      <AssetAnalysisReport doc={reportDoc} userId={userId || 'user'} onBack={() => setReportDocId('')} />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-4 pt-6 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700"><ArrowLeft className="w-5 h-5 text-slate-300" /></button>
        <div className="flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-pink-400" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">DNA Lab</h1>
            <p className="text-[10px] text-slate-400">On-device semantic search · difference engine · monitoring</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setStatus(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                active ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' : 'bg-slate-800/60 text-slate-300'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Cloud server panel — enables web crawl + FAISS when configured */}
      {CLOUD_ENABLED && (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {connected ? <Cloud className="w-4 h-4 text-emerald-400" /> : <CloudOff className="w-4 h-4 text-slate-400" />}
          <span className="text-[11px] font-semibold text-slate-200">PINIT-DNA Server</span>
          <span className={`text-[9px] font-bold ml-auto ${connected ? 'text-emerald-300' : 'text-slate-500'}`}>
            {connected ? 'Connected' : isServerConfigured() ? 'Offline' : 'Not set'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={serverUrl}
            onChange={(e) => setSrvUrl(e.target.value)}
            placeholder="https://your-pinit-dna-server.com"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white outline-none"
          />
          <button onClick={connectServer} disabled={connecting}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-[11px] font-semibold disabled:opacity-50">
            {connecting ? '…' : 'Connect'}
          </button>
        </div>
        <p className="text-[9px] text-slate-500">Hosts FAISS semantic search + web-crawl monitoring. Leave blank to stay fully on-device.</p>
      </div>
      )}

      {usable.length === 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-center text-sm text-slate-400">
          No DNA-ready items in your vault yet. Generate DNA from a file first.
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs text-purple-300"><Loader2 className="w-4 h-4 animate-spin" /> {status || 'Working…'}</div>
      )}

      {/* ── Monitoring ── */}
      {tab === 'monitor' && (
        <div className="space-y-3">
          {/* Full Monitoring Center launcher */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFullMonitor(true)}
            className="w-full relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-600"
          >
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 px-4 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-700 flex items-center justify-center flex-shrink-0">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">DNA Monitoring Center</p>
                <p className="text-[10px] text-slate-400">Real-time viewer intelligence · Live locations · Activity logs</p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </div>
            </div>
          </motion.button>

          <ShareMonitorDashboard
            shares={shares}
            documents={documents}
            usable={usable}
            dupes={dupes}
            busy={busy}
            runMonitorScan={runMonitorScan}
            CLOUD_ENABLED={CLOUD_ENABLED}
            connected={connected}
            enrolling={enrolling}
            enrollAllForMonitoring={enrollAllForMonitoring}
            loadAlerts={loadAlerts}
            alerts={alerts}
          />
        </div>
      )}

      {/* ── Find Similar (Semantic Search) ── */}
      {tab === 'similar' && (
        <div className="space-y-3">
          {usable.length < 2 && (
            <p className="text-xs text-amber-300/90">Add at least 2 assets ({usable.length}/2 ready). Generate DNA from a file, then come back.</p>
          )}
          <select value={queryId} onChange={(e) => setQueryId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
            <option value="">Pick an item to search by…</option>
            {usable.map((d) => <option key={d.id} value={d.id}>{docName(d)}</option>)}
          </select>
          <button disabled={busy || usable.length < 2} onClick={runFindSimilar}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? (status || 'Working…') : 'Find similar in vault'}
          </button>
          {similar && similar.length === 0 && <p className="text-xs text-slate-400">No comparable items found.</p>}
          {similar && similar.map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white truncate flex-1">{s.name}</span>
                <span className={`text-xs font-bold ml-2 ${s.sim >= 85 ? 'text-emerald-300' : s.sim >= 50 ? 'text-amber-300' : 'text-slate-400'}`}>{s.sim}%</span>
              </div>
              <SimBar value={s.sim} />
              <p className="text-[9px] text-slate-500 font-mono">{s.dnaId}</p>
            </div>
          ))}

          {/* Cloud FAISS semantic search */}
          {CLOUD_ENABLED && connected && (
            <div className="mt-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5 text-cyan-300" /><span className="text-[11px] font-semibold text-cyan-200">Cloud Semantic Search (FAISS)</span></div>
              <div className="flex gap-2">
                <input value={cloudQuery} onChange={(e) => setCloudQuery(e.target.value)} placeholder="Describe what to find…"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white outline-none" />
                <button onClick={runCloudSearch} disabled={busy} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-[11px] font-semibold disabled:opacity-50">Search</button>
              </div>
              {cloudHits && cloudHits.length === 0 && <p className="text-[10px] text-slate-400">No matches in the cloud index.</p>}
              {cloudHits && cloudHits.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-200 truncate flex-1">{h.filename}</span>
                  <span className="text-cyan-300 font-bold ml-2">{Math.round((h.score || 0) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Compare (Difference Engine) ── */}
      {tab === 'compare' && (
        <div className="space-y-3">
          {usable.length < 2 && (
            <p className="text-xs text-amber-300/90">Add at least 2 assets ({usable.length}/2 ready) to compare.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select value={leftId} onChange={(e) => setLeftId(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white">
              <option value="">Item A…</option>
              {usable.map((d) => <option key={d.id} value={d.id}>{docName(d)}</option>)}
            </select>
            <select value={rightId} onChange={(e) => setRightId(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white">
              <option value="">Item B…</option>
              {usable.map((d) => <option key={d.id} value={d.id}>{docName(d)}</option>)}
            </select>
          </div>
          <button disabled={busy || !leftId || !rightId} onClick={runCompare}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? (status || 'Working…') : 'Compare DNA'}
          </button>
          {status && !busy && !diff && <p className="text-xs text-amber-300">{status}</p>}
          {diff && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
              <div className="text-center">
                <div className={`text-3xl font-extrabold ${diff.overall >= 85 ? 'text-emerald-300' : diff.overall >= 50 ? 'text-amber-300' : 'text-red-300'}`}>{diff.overall}%</div>
                <div className="text-[10px] text-slate-400">{diff.identical ? 'Identical DNA signature' : 'Overall similarity'}</div>
              </div>
              {diff.layers.map((l, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px]"><span className="text-slate-300">{l.name}</span><span className="text-slate-400">{l.sim === null ? 'n/a' : l.sim + '%'}</span></div>
                  <SimBar value={l.sim} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Report (Asset Analysis) ── */}
      {tab === 'report' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Pick an asset to generate its analysis report — DNA fingerprint + engagement &amp; security analytics, with PDF export.</p>
          <select value={reportDocId} onChange={(e) => setReportDocId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
            <option value="">Choose an asset…</option>
            {documents.map((d) => <option key={d.id} value={d.id}>{docName(d)}</option>)}
          </select>
          {documents.length === 0 && <p className="text-xs text-slate-500">No assets in your vault yet.</p>}
        </div>
      )}
    </motion.div>
  );
};

export default DnaLabPage;
