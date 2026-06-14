/**
 * DnaMonitorDashboard.tsx
 * Real-time DNA Monitoring Center — full viewer intelligence per share link
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, ChevronDown, ChevronRight,
  Clock, Download, Eye, Fingerprint, Globe, MapPin, Monitor,
  Radio, Shield, Smartphone, Tablet, Users, X, Zap,
  Camera, Copy, Printer, RotateCcw, Send,
  UserX, FileDown, GitBranch, Mail, Phone, Ban,
} from 'lucide-react';
import {
  getShareMonitorData, subscribeToShareActivity,
  approveDownloadRequest, rejectDownloadRequest, revokeVisitorAccess,
} from '@/lib/shareMonitor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareLike {
  id: string;
  shareLink: string;
  createdAt: string;
  expiryDate?: string | null;
  image_name?: string;
}

interface Visitor {
  visitor_id: string;
  visitor_name: string;
  session_start: string;
  last_active?: string;
  geo_city?: string;
  geo_area?: string;
  geo_district?: string;
  geo_state?: string;
  geo_country?: string;
  geo_country_code?: string;
  geo_pincode?: string;
  gps_lat?: number;
  gps_lng?: number;
  device_type?: string;
  os?: string;
  browser?: string;
  screen_resolution?: string;
  language?: string;
  timezone?: string;
  network_type?: string;
  network_speed?: string;
  ip_address?: string;
  visitor_email?: string;
  visitor_phone?: string;
  parent_visitor_id?: string;
}

interface SecEvent {
  visitor_name?: string;
  visitor_id?: string;
  event_type: string;
  details?: string;
  risk_score?: number;
  created_at: string;
}

interface DlRequest {
  id: string;
  visitor_name?: string;
  visitor_id?: string;
  status?: string;
  created_at?: string;
}

interface ShareMonData {
  visitors: Visitor[];
  secEvents: SecEvent[];
  dlRequests: DlRequest[];
}

interface DnaMonitorDashboardProps {
  shares: ShareLike[];
  userId?: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flag(code?: string) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), day = Math.floor(d / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${day}d ago`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isActive(lastActive?: string): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 90000;
}

function riskBadge(score: number) {
  if (score >= 70) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (score >= 40) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
}

const EVENT_WEIGHTS: Record<string, number> = {
  screen_recording: 90, screenshot: 85, devtools: 65, copy: 50, print: 40, tab_switch: 15, zoom: 10,
};

function calcViewerRisk(events: SecEvent[]): number {
  let score = 0;
  events.forEach((e) => {
    const key = Object.keys(EVENT_WEIGHTS).find((k) => e.event_type.includes(k));
    if (key) score = Math.min(100, score + EVENT_WEIGHTS[key]);
  });
  return score;
}

function riskLabel(score: number): string {
  if (score >= 70) return 'HIGH RISK';
  if (score >= 40) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'SAFE';
}

function eventIcon(type: string) {
  if (type.includes('screenshot') || type.includes('screen_recording')) return <Camera className="w-3 h-3 text-red-400" />;
  if (type.includes('copy')) return <Copy className="w-3 h-3 text-amber-400" />;
  if (type.includes('print')) return <Printer className="w-3 h-3 text-amber-400" />;
  if (type.includes('devtools')) return <Monitor className="w-3 h-3 text-amber-400" />;
  if (type.includes('zoom')) return <Eye className="w-3 h-3 text-cyan-400" />;
  if (type.includes('tab_switch')) return <RotateCcw className="w-3 h-3 text-slate-400" />;
  if (type.includes('forward')) return <Send className="w-3 h-3 text-fuchsia-400" />;
  if (type.includes('download')) return <Download className="w-3 h-3 text-blue-400" />;
  if (type.includes('view_start')) return <Eye className="w-3 h-3 text-emerald-400" />;
  return <Activity className="w-3 h-3 text-slate-400" />;
}

function DeviceIcon({ type }: { type?: string }) {
  if (type === 'mobile') return <Smartphone className="w-4 h-4" />;
  if (type === 'tablet') return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

function exportCsv(shareId: string, fileName: string, visitors: Visitor[], secEvents: SecEvent[]) {
  const header = [
    'Visitor Name', 'Email', 'Phone', 'IP Address',
    'Country', 'State', 'City', 'Area', 'GPS',
    'Device', 'OS', 'Browser', 'Screen',
    'First Access', 'Last Active', 'Status',
    'Risk Score', 'Screenshots', 'Copies', 'Downloads',
  ].join(',');

  const rows = visitors.map((v) => {
    const myEvs = secEvents.filter((e) => e.visitor_id === v.visitor_id || e.visitor_name === v.visitor_name);
    const risk = calcViewerRisk(myEvs);
    const screenshots = myEvs.filter((e) => e.event_type.includes('screenshot') || e.event_type.includes('screen_recording')).length;
    const copies = myEvs.filter((e) => e.event_type.includes('copy')).length;
    const downloads = myEvs.filter((e) => e.event_type.includes('download')).length;
    const gps = v.gps_lat && v.gps_lng ? `${v.gps_lat.toFixed(5)},${v.gps_lng.toFixed(5)}` : '';
    return [
      v.visitor_name || '', v.visitor_email || '', v.visitor_phone || '', v.ip_address || '',
      v.geo_country || '', v.geo_state || '', v.geo_city || '', v.geo_area || '', gps,
      v.device_type || '', v.os || '', v.browser || '', v.screen_resolution || '',
      fmtDateTime(v.session_start), fmtDateTime(v.last_active), isActive(v.last_active) ? 'LIVE' : 'Offline',
      risk, screenshots, copies, downloads,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dna-audit-${fileName}-${shareId.slice(-8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Viewer Card ──────────────────────────────────────────────────────────────

const ViewerCard: React.FC<{
  visitor: Visitor;
  events: SecEvent[];
  shareId: string;
  onRevoke?: () => void;
}> = ({ visitor, events, shareId, onRevoke }) => {
  const [expanded, setExpanded] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const active = isActive(visitor.last_active);
  const myEvents = events.filter((e) => e.visitor_id === visitor.visitor_id || e.visitor_name === visitor.visitor_name);
  const riskScore = calcViewerRisk(myEvents);

  const screenshotCount = myEvents.filter((e) => e.event_type.includes('screenshot') || e.event_type.includes('screen_recording')).length;
  const copyCount = myEvents.filter((e) => e.event_type.includes('copy')).length;
  const downloadCount = myEvents.filter((e) => e.event_type.includes('download')).length;
  const forwardCount = myEvents.filter((e) => e.event_type.includes('forward')).length;

  const handleRevoke = async () => {
    if (revoked || revoking) return;
    setRevoking(true);
    try {
      await revokeVisitorAccess(shareId, visitor.visitor_id);
      setRevoked(true);
      onRevoke?.();
    } finally {
      setRevoking(false);
      setConfirmRevoke(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-all ${
        revoked
          ? 'border-red-800/40 bg-red-950/20 opacity-60'
          : active
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-slate-700/40 bg-slate-800/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          revoked ? 'bg-red-900/40 text-red-400 line-through'
          : active ? 'bg-emerald-500/20 text-emerald-300'
          : 'bg-slate-700/60 text-slate-300'
        }`}>
          {revoked ? <Ban className="w-4 h-4" /> : (visitor.visitor_name || 'A').charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold truncate ${revoked ? 'text-red-400 line-through' : 'text-white'}`}>
              {visitor.visitor_name || 'Anonymous'}
            </span>
            {revoked && (
              <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
                REVOKED
              </span>
            )}
            {!revoked && active && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
            {riskScore >= 40 && !revoked && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${riskBadge(riskScore)}`}>
                {riskLabel(riskScore)} · {riskScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
            <span className="flex items-center gap-1">
              <DeviceIcon type={visitor.device_type} />
              {visitor.os || '—'} · {visitor.browser || '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-slate-400">{fmtDate(visitor.session_start)}</p>
            <p className="text-[10px] text-slate-500">{fmtTime(visitor.session_start)}</p>
          </div>

          {/* Revoke button */}
          {!revoked && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmRevoke(true); }}
              className="ml-1 p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
              title="Revoke access"
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          )}

          <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Confirm revoke modal */}
      <AnimatePresence>
        {confirmRevoke && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5 overflow-hidden"
          >
            <p className="text-[11px] text-red-300 font-semibold mb-2">
              Revoke access for <span className="font-bold">{visitor.visitor_name}</span>? They won't be able to open this link again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 py-1.5 rounded-lg bg-red-600/30 border border-red-500/40 text-red-300 text-[10px] font-bold hover:bg-red-600/50 transition-all disabled:opacity-50"
              >
                {revoking ? 'Revoking…' : '✗ Revoke Access'}
              </button>
              <button
                onClick={() => setConfirmRevoke(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 text-[10px] font-bold hover:text-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick info row */}
      <div className="px-4 pb-2 flex flex-wrap gap-2">
        {visitor.geo_country && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/50 rounded-lg px-2 py-0.5">
            <MapPin className="w-3 h-3 text-cyan-500" />
            {flag(visitor.geo_country_code)} {visitor.geo_city || '—'}{visitor.geo_state ? `, ${visitor.geo_state}` : ''}
          </span>
        )}
        {visitor.ip_address && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/50 rounded-lg px-2 py-0.5 font-mono">
            <Globe className="w-3 h-3 text-blue-400" />
            {visitor.ip_address}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-900/50 rounded-lg px-2 py-0.5">
          <Clock className="w-3 h-3" />
          {timeAgo(visitor.last_active || visitor.session_start)}
        </span>
        {screenshotCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-0.5">
            <Camera className="w-3 h-3" />
            {screenshotCount} screenshots
          </span>
        )}
        {copyCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-0.5">
            <Copy className="w-3 h-3" />
            {copyCount} copies
          </span>
        )}
        {forwardCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-lg px-2 py-0.5">
            <Send className="w-3 h-3" />
            {forwardCount} forwards
          </span>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-700/30"
          >
            <div className="px-4 py-3 space-y-4">

              {/* Risk Score Bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Risk Score</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${riskBadge(riskScore)}`}>
                    {riskLabel(riskScore)} · {riskScore}/100
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      riskScore >= 70 ? 'bg-gradient-to-r from-red-600 to-red-400'
                      : riskScore >= 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${riskScore}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Activity counts */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { icon: <Camera className="w-3.5 h-3.5" />, label: 'Screenshots', count: screenshotCount, color: 'text-red-400' },
                  { icon: <Copy className="w-3.5 h-3.5" />, label: 'Copies', count: copyCount, color: 'text-amber-400' },
                  { icon: <Download className="w-3.5 h-3.5" />, label: 'Downloads', count: downloadCount, color: 'text-blue-400' },
                  { icon: <Send className="w-3.5 h-3.5" />, label: 'Forwards', count: forwardCount, color: 'text-fuchsia-400' },
                ].map(({ icon, label, count, color }) => (
                  <div key={label} className="bg-slate-900/50 rounded-xl p-2 text-center">
                    <div className={`${color} flex justify-center mb-1`}>{icon}</div>
                    <p className="text-sm font-bold text-white">{count}</p>
                    <p className="text-[8px] text-slate-500 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>

              {/* Contact info if available */}
              {(visitor.visitor_email || visitor.visitor_phone) && (
                <div>
                  <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest mb-2">📋 Contact Info</p>
                  <div className="space-y-1">
                    {visitor.visitor_email && (
                      <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-1.5">
                        <Mail className="w-3 h-3 text-violet-400 flex-shrink-0" />
                        <span className="text-[10px] text-slate-300 truncate">{visitor.visitor_email}</span>
                      </div>
                    )}
                    {visitor.visitor_phone && (
                      <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-1.5">
                        <Phone className="w-3 h-3 text-violet-400 flex-shrink-0" />
                        <span className="text-[10px] text-slate-300">{visitor.visitor_phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Location Intelligence */}
              <div>
                <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-2">📍 Location Intelligence</p>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {[
                    ['Country', `${flag(visitor.geo_country_code)} ${visitor.geo_country || '—'}`],
                    ['State', visitor.geo_state || '—'],
                    ['District', visitor.geo_district || '—'],
                    ['City', visitor.geo_city || '—'],
                    ['Area', visitor.geo_area || '—'],
                    ['Pincode', visitor.geo_pincode || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-900/50 rounded-lg px-2 py-1.5">
                      <p className="text-slate-500 text-[8px] uppercase tracking-wide">{label}</p>
                      <p className="text-slate-200 font-semibold truncate">{value}</p>
                    </div>
                  ))}
                </div>
                {visitor.gps_lat && visitor.gps_lng && (
                  <div className="mt-1.5 bg-slate-900/50 rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <Globe className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-300 font-mono">
                      {visitor.gps_lat.toFixed(5)}° N, {visitor.gps_lng.toFixed(5)}° E
                    </span>
                  </div>
                )}
                {visitor.ip_address && (
                  <div className="mt-1.5 bg-slate-900/50 rounded-lg px-2 py-1.5 flex items-center gap-2">
                    <Globe className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-300 font-mono">IP: {visitor.ip_address}</span>
                  </div>
                )}
              </div>

              {/* Device Intelligence */}
              <div>
                <p className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-widest mb-2">📱 Device Intelligence</p>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {[
                    ['Type', visitor.device_type || '—'],
                    ['OS', visitor.os || '—'],
                    ['Browser', visitor.browser || '—'],
                    ['Screen', visitor.screen_resolution || '—'],
                    ['Language', visitor.language || '—'],
                    ['Timezone', visitor.timezone || '—'],
                    ['Network', visitor.network_type || '—'],
                    ['Speed', visitor.network_speed || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-900/50 rounded-lg px-2 py-1.5">
                      <p className="text-slate-500 text-[8px] uppercase tracking-wide">{label}</p>
                      <p className="text-slate-200 font-semibold truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Session */}
              <div>
                <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2">⏱ Session</p>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {[
                    ['First Access', `${fmtDate(visitor.session_start)} ${fmtTime(visitor.session_start)}`],
                    ['Last Active', visitor.last_active ? `${fmtDate(visitor.last_active)} ${fmtTime(visitor.last_active)}` : '—'],
                    ['Status', revoked ? '🔴 Revoked' : active ? '🟢 Viewing' : '⚫ Offline'],
                    ['Viewer ID', (visitor.visitor_id || '—').slice(0, 16) + '…'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-900/50 rounded-lg px-2 py-1.5">
                      <p className="text-slate-500 text-[8px] uppercase tracking-wide">{label}</p>
                      <p className="text-slate-200 font-semibold truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Timeline */}
              {myEvents.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">📋 Activity Log</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {myEvents.map((ev, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px]">
                        <div className="mt-0.5 flex-shrink-0">{eventIcon(ev.event_type)}</div>
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-300 font-semibold">{ev.event_type.replace(/_/g, ' ')}</span>
                          {ev.details && <span className="text-slate-500 ml-1.5">· {ev.details}</span>}
                        </div>
                        <span className="text-slate-600 flex-shrink-0">{fmtTime(ev.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revoke button at bottom of expanded view */}
              {!revoked && (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="w-full py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-bold hover:bg-red-500/15 transition-all flex items-center justify-center gap-1.5"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Revoke This Viewer's Access
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Share Tree ───────────────────────────────────────────────────────────────

const ShareTree: React.FC<{ visitors: Visitor[]; events: SecEvent[]; shareId: string; shareLink: string }> = ({
  visitors, events, shareId, shareLink,
}) => {
  const forwarders = visitors.filter((v) =>
    events.some((e) => (e.visitor_id === v.visitor_id || e.visitor_name === v.visitor_name) && e.event_type.includes('forward'))
  );
  const childVisitors = visitors.filter((v) => v.parent_visitor_id);
  const rootVisitors = visitors.filter((v) => !v.parent_visitor_id);

  const shortLink = shareLink.split('/').pop()?.slice(-12) || shareId.slice(-8);

  return (
    <div className="space-y-3">
      {/* Master Link node */}
      <div className="flex items-center gap-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-600 flex items-center justify-center flex-shrink-0">
          <Fingerprint className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-fuchsia-300">Master Link</p>
          <p className="text-[9px] text-slate-500 font-mono">…{shortLink}</p>
        </div>
        <span className="text-[9px] text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-full px-2 py-0.5">
          {visitors.length} viewers
        </span>
      </div>

      {/* Root visitors (no parent) */}
      {rootVisitors.length > 0 && (
        <div className="ml-4 space-y-2">
          {rootVisitors.map((v, i) => {
            const isForwarder = forwarders.some((f) => f.visitor_id === v.visitor_id);
            const myChildren = childVisitors.filter((c) => c.parent_visitor_id === v.visitor_id);
            const risk = calcViewerRisk(events.filter((e) => e.visitor_id === v.visitor_id || e.visitor_name === v.visitor_name));
            return (
              <div key={v.visitor_id || i}>
                <div className="flex items-center gap-2">
                  {/* Tree line */}
                  <div className="flex flex-col items-center w-4 flex-shrink-0 self-stretch">
                    <div className="w-px flex-1 bg-slate-700/50" />
                    <div className="w-3 h-px bg-slate-700/50" />
                    <div className="w-px flex-1 bg-slate-700/50 opacity-0" />
                  </div>
                  <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    isForwarder ? 'border-violet-500/30 bg-violet-500/5' : 'border-slate-700/30 bg-slate-800/30'
                  }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isActive(v.last_active) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/60 text-slate-400'
                    }`}>
                      {(v.visitor_name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{v.visitor_name || 'Anonymous'}</p>
                      <p className="text-[9px] text-slate-500">{v.geo_city || v.geo_country || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isActive(v.last_active) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      {risk >= 40 && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${riskBadge(risk)}`}>{risk}</span>}
                      {isForwarder && (
                        <span className="text-[8px] text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                          <GitBranch className="w-2.5 h-2.5" /> shared
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Children */}
                {myChildren.length > 0 && (
                  <div className="ml-8 mt-1.5 space-y-1.5">
                    {myChildren.map((child, j) => {
                      const childRisk = calcViewerRisk(events.filter((e) => e.visitor_id === child.visitor_id || e.visitor_name === child.visitor_name));
                      return (
                        <div key={child.visitor_id || j} className="flex items-center gap-2">
                          <div className="flex flex-col items-center w-4 flex-shrink-0 self-stretch">
                            <div className="w-px flex-1 bg-slate-700/30" />
                            <div className="w-3 h-px bg-slate-700/30" />
                            <div className="w-px flex-1 bg-slate-700/30 opacity-0" />
                          </div>
                          <div className="flex-1 flex items-center gap-2 rounded-xl border border-slate-700/20 bg-slate-800/20 px-3 py-1.5">
                            <div className="w-6 h-6 rounded-lg bg-slate-700/40 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">
                              {(child.visitor_name || 'A').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-slate-300 truncate">{child.visitor_name || 'Anonymous'}</p>
                              <p className="text-[8px] text-slate-600">via {v.visitor_name}</p>
                            </div>
                            {childRisk >= 40 && <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${riskBadge(childRisk)}`}>{childRisk}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visitors.length === 0 && (
        <p className="text-[11px] text-slate-500 text-center py-4 ml-4">No viewers yet</p>
      )}
    </div>
  );
};

// ─── Share Monitor Panel ──────────────────────────────────────────────────────

const ShareMonitorPanel: React.FC<{ share: ShareLike }> = ({ share }) => {
  const [data, setData] = useState<ShareMonData>({ visitors: [], secEvents: [], dlRequests: [] });
  const [tab, setTab] = useState<'viewers' | 'events' | 'downloads' | 'tree'>('viewers');
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    const raw = await getShareMonitorData(share.id);
    setData({
      visitors: (raw.visitors as unknown as Visitor[]) || [],
      secEvents: (raw.securityEvents as unknown as SecEvent[]) || [],
      dlRequests: (raw.downloadRequests as unknown as DlRequest[]) || [],
    });
  }, [share.id]);

  useEffect(() => {
    load();
    const unsub = subscribeToShareActivity(share.id, load);
    const t = window.setInterval(load, 15000);
    return () => { unsub(); window.clearInterval(t); };
  }, [share.id, load]);

  const activeCount = data.visitors.filter((v) => isActive(v.last_active)).length;
  const alertCount = data.secEvents.filter((e) => (e.risk_score ?? 0) >= 40).length;
  const shortId = share.id.slice(-8);
  const fileName = share.image_name || share.shareLink.split('/').pop() || shortId;

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
      {/* Share header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Fingerprint className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{fileName}</p>
            <p className="text-[9px] text-slate-500 font-mono">#{shortId}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeCount > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {activeCount} live
            </span>
          )}
          <span className="text-[9px] text-slate-400 bg-slate-800 rounded-full px-2 py-0.5">{data.visitors.length} viewers</span>
          {alertCount > 0 && (
            <span className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">{alertCount} alerts</span>
          )}
          {/* Export CSV */}
          {data.visitors.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); exportCsv(share.id, fileName, data.visitors, data.secEvents); }}
              className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white transition-all"
              title="Export audit report CSV"
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-700/30"
          >
            {/* Tabs */}
            <div className="flex gap-1 p-3 pb-0">
              {([
                { key: 'viewers', label: `👁 Viewers (${data.visitors.length})` },
                { key: 'tree', label: `🌿 Share Tree` },
                { key: 'events', label: `⚡ Events (${data.secEvents.length})` },
                { key: 'downloads', label: `⬇ DLs (${data.dlRequests.length})` },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all ${
                    tab === key
                      ? 'bg-fuchsia-600/30 border border-fuchsia-500/40 text-fuchsia-300'
                      : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-2">
              {/* Viewers tab */}
              {tab === 'viewers' && (
                data.visitors.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-6">
                    No viewers yet — share the link to start tracking
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.visitors.map((v, i) => (
                      <ViewerCard
                        key={v.visitor_id || i}
                        visitor={v}
                        events={data.secEvents}
                        shareId={share.id}
                        onRevoke={load}
                      />
                    ))}
                  </div>
                )
              )}

              {/* Share Tree tab */}
              {tab === 'tree' && (
                <ShareTree
                  visitors={data.visitors}
                  events={data.secEvents}
                  shareId={share.id}
                  shareLink={share.shareLink}
                />
              )}

              {/* Events tab */}
              {tab === 'events' && (
                data.secEvents.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-6">No security events recorded</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {data.secEvents.map((ev, i) => {
                      const risk = ev.risk_score ?? 0;
                      const isHigh = risk >= 40;
                      return (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                          className={`flex items-start gap-2.5 rounded-xl px-3 py-2 border ${isHigh ? 'bg-red-500/5 border-red-800/30' : 'bg-slate-800/40 border-slate-700/30'}`}>
                          <div className="mt-0.5 flex-shrink-0">{eventIcon(ev.event_type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-white">{ev.event_type.replace(/_/g, ' ')}</p>
                            <p className="text-[9px] text-slate-500 truncate">
                              {ev.visitor_name || 'Unknown'}{ev.details ? ` · ${ev.details}` : ''}
                            </p>
                          </div>
                          {risk > 0 && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${riskBadge(risk)}`}>{risk}</span>}
                          <span className="text-[9px] text-slate-600 flex-shrink-0">{timeAgo(ev.created_at)}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              )}

              {/* Downloads tab */}
              {tab === 'downloads' && (
                data.dlRequests.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-6">No download requests</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {data.dlRequests.map((req, i) => (
                      <div key={i} className="rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{req.visitor_name || 'Unknown'}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            req.status === 'approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : req.status === 'rejected' ? 'text-red-400 bg-red-500/10 border-red-500/30'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                          }`}>
                            {req.status || 'pending'}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-500">{timeAgo(req.created_at)}</p>
                        {(!req.status || req.status === 'pending') && (
                          <div className="flex gap-1.5">
                            <button onClick={() => approveDownloadRequest(req.id, 1).then(load)}
                              className="flex-1 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold hover:bg-emerald-600/40 transition-all">
                              ✓ Approve
                            </button>
                            <button onClick={() => rejectDownloadRequest(req.id).then(load)}
                              className="flex-1 py-1 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-[9px] font-bold hover:bg-red-600/40 transition-all">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const DnaMonitorDashboard: React.FC<DnaMonitorDashboardProps> = ({ shares, onBack }) => {
  const [allData, setAllData] = useState<Record<string, ShareMonData>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    shares.forEach(async (s) => {
      const raw = await getShareMonitorData(s.id);
      setAllData((prev) => ({
        ...prev,
        [s.id]: {
          visitors: (raw.visitors as unknown as Visitor[]) || [],
          secEvents: (raw.securityEvents as unknown as SecEvent[]) || [],
          dlRequests: (raw.downloadRequests as unknown as DlRequest[]) || [],
        },
      }));
    });
  }, [shares, tick]);

  // Reload a single share's data
  const reloadShare = useCallback(async (shareId: string) => {
    const raw = await getShareMonitorData(shareId);
    setAllData((prev) => ({
      ...prev,
      [shareId]: {
        visitors: (raw.visitors as unknown as Visitor[]) || [],
        secEvents: (raw.securityEvents as unknown as SecEvent[]) || [],
        dlRequests: (raw.downloadRequests as unknown as DlRequest[]) || [],
      },
    }));
  }, []);

  // Aggregate stats
  const totalViewers = Object.values(allData).reduce((s, d) => s + d.visitors.length, 0);
  const activeViewers = Object.values(allData).reduce((s, d) => s + d.visitors.filter((v) => isActive(v.last_active)).length, 0);
  const totalEvents = Object.values(allData).reduce((s, d) => s + d.secEvents.length, 0);
  const secAlerts = Object.values(allData).reduce((s, d) => s + d.secEvents.filter((e) => (e.risk_score ?? 0) >= 40).length, 0);
  const dlPending = Object.values(allData).reduce((s, d) => s + d.dlRequests.filter((r) => !r.status || r.status === 'pending').length, 0);
  const totalScreenshots = Object.values(allData).reduce((s, d) =>
    s + d.secEvents.filter((e) => e.event_type.includes('screenshot') || e.event_type.includes('screen_recording')).length, 0);

  // All download requests across all shares (pending first, then rest)
  const allDlRequests = Object.entries(allData).flatMap(([shareId, d]) => {
    const share = shares.find((s) => s.id === shareId);
    const fileName = share?.image_name || share?.shareLink.split('/').pop() || shareId.slice(-8);
    return d.dlRequests.map((r) => ({ ...r, shareId, fileName }));
  }).sort((a, b) => {
    const aPending = !a.status || a.status === 'pending';
    const bPending = !b.status || b.status === 'pending';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
  });

  // Country breakdown
  const countryMap: Record<string, number> = {};
  Object.values(allData).forEach((d) => {
    d.visitors.forEach((v) => {
      const c = `${v.geo_country_code || '??'}|${v.geo_country || 'Unknown'}`;
      countryMap[c] = (countryMap[c] || 0) + 1;
    });
  });
  const countries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Device breakdown
  const devices = { mobile: 0, tablet: 0, desktop: 0 };
  Object.values(allData).forEach((d) => {
    d.visitors.forEach((v) => {
      if (v.device_type === 'mobile') devices.mobile++;
      else if (v.device_type === 'tablet') devices.tablet++;
      else devices.desktop++;
    });
  });

  // Recent activity feed
  const recentEvents = Object.values(allData)
    .flatMap((d) => d.secEvents)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  // Export all shares combined CSV
  const handleExportAll = () => {
    const allVisitors: Visitor[] = [];
    const allEvents: SecEvent[] = [];
    Object.values(allData).forEach((d) => {
      allVisitors.push(...d.visitors);
      allEvents.push(...d.secEvents);
    });
    exportCsv('all', 'all-shares', allVisitors, allEvents);
  };

  return (
    <div className="min-h-screen bg-[#080c18] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#080c18]/95 backdrop-blur border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-700 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">DNA Monitoring Center</h1>
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Real-time viewer intelligence</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {totalViewers > 0 && (
              <button
                onClick={handleExportAll}
                className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 bg-slate-800/60 border border-slate-700/40 rounded-full px-2.5 py-1 hover:text-white transition-all"
              >
                <FileDown className="w-3 h-3" /> Export All
              </button>
            )}
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Users className="w-4 h-4" />, label: 'Total Viewers', value: totalViewers, color: 'text-blue-400', bg: 'from-blue-600/20 to-blue-900/10 border-blue-700/30' },
            { icon: <Radio className="w-4 h-4" />, label: 'Active Now', value: activeViewers, color: 'text-emerald-400', bg: 'from-emerald-600/20 to-emerald-900/10 border-emerald-700/30' },
            { icon: <AlertTriangle className="w-4 h-4" />, label: 'Alerts', value: secAlerts, color: 'text-red-400', bg: 'from-red-600/20 to-red-900/10 border-red-700/30' },
            { icon: <Camera className="w-4 h-4" />, label: 'Screenshots', value: totalScreenshots, color: 'text-orange-400', bg: 'from-orange-600/20 to-orange-900/10 border-orange-700/30' },
            { icon: <Download className="w-4 h-4" />, label: 'Pending DLs', value: dlPending, color: 'text-amber-400', bg: 'from-amber-600/20 to-amber-900/10 border-amber-700/30' },
            { icon: <Zap className="w-4 h-4" />, label: 'Events', value: totalEvents, color: 'text-fuchsia-400', bg: 'from-fuchsia-600/20 to-fuchsia-900/10 border-fuchsia-700/30' },
          ].map(({ icon, label, value, color, bg }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br ${bg} border rounded-2xl p-3`}>
              <div className={`${color} mb-1`}>{icon}</div>
              <p className="text-xl font-black text-white">{value}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Download Requests Inbox ── */}
        {allDlRequests.length > 0 && (
          <div className={`rounded-2xl border overflow-hidden ${dlPending > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700/40 bg-slate-900/40'}`}>
            {/* Inbox header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/30">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${dlPending > 0 ? 'bg-amber-500/20' : 'bg-slate-700/40'}`}>
                <Download className={`w-4 h-4 ${dlPending > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Download Requests</p>
                <p className="text-[9px] text-slate-500">Viewers requesting file access</p>
              </div>
              {dlPending > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/40 rounded-full px-2.5 py-1 animate-pulse">
                  {dlPending} pending
                </span>
              )}
            </div>

            {/* Request cards */}
            <div className="p-3 space-y-2">
              {allDlRequests.map((req, i) => {
                const isPending = !req.status || req.status === 'pending';
                return (
                  <motion.div
                    key={req.id || i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-xl border px-3 py-3 space-y-2.5 ${
                      isPending
                        ? 'border-amber-500/25 bg-amber-500/5'
                        : req.status === 'approved'
                        ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70'
                        : 'border-red-500/20 bg-red-500/5 opacity-60'
                    }`}
                  >
                    {/* Who + what file */}
                    <div className="flex items-start gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isPending ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700/50 text-slate-400'
                      }`}>
                        {(req.visitor_name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{req.visitor_name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          Requesting download of <span className="text-slate-200 font-semibold">{(req as any).fileName}</span>
                        </p>
                        <p className="text-[9px] text-slate-600 mt-0.5">{timeAgo(req.created_at)}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        isPending
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                          : req.status === 'approved'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                          : 'text-red-400 bg-red-500/10 border-red-500/30'
                      }`}>
                        {isPending ? 'PENDING' : req.status?.toUpperCase()}
                      </span>
                    </div>

                    {/* Approve / Reject — only for pending */}
                    {isPending && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveDownloadRequest(req.id, 1).then(() => reloadShare((req as any).shareId))}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-600/35 active:scale-95 transition-all"
                        >
                          <span className="text-base leading-none">✓</span> Approve Download
                        </button>
                        <button
                          onClick={() => rejectDownloadRequest(req.id).then(() => reloadShare((req as any).shareId))}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-600/35 active:scale-95 transition-all"
                        >
                          <span className="text-base leading-none">✗</span> Reject
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Location intelligence */}
        {countries.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-4">
            <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Globe className="w-3 h-3" /> Location Intelligence
            </p>
            <div className="space-y-1.5">
              {countries.map(([key, count]) => {
                const [code, name] = key.split('|');
                const pct = totalViewers > 0 ? Math.round((count / totalViewers) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm w-6 flex-shrink-0">{flag(code)}</span>
                    <span className="text-[10px] text-slate-300 flex-1 min-w-0 truncate">{name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden flex-shrink-0">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 w-6 text-right flex-shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Device breakdown */}
        {totalViewers > 0 && (
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-4">
            <p className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Smartphone className="w-3 h-3" /> Device Breakdown
            </p>
            <div className="flex gap-3">
              {[
                { icon: <Smartphone className="w-4 h-4" />, label: 'Mobile', count: devices.mobile },
                { icon: <Tablet className="w-4 h-4" />, label: 'Tablet', count: devices.tablet },
                { icon: <Monitor className="w-4 h-4" />, label: 'Desktop', count: devices.desktop },
              ].map(({ icon, label, count }) => (
                <div key={label} className="flex-1 text-center bg-slate-800/50 rounded-xl p-2">
                  <div className="text-slate-400 flex justify-center mb-1">{icon}</div>
                  <p className="text-sm font-bold text-white">{count}</p>
                  <p className="text-[9px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live activity feed */}
        {recentEvents.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-4">
            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Live Activity Feed
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {recentEvents.map((ev, i) => {
                const risk = ev.risk_score ?? 0;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                    className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${risk >= 40 ? 'bg-red-500/5 border border-red-800/20' : 'bg-slate-800/30'}`}>
                    <div className="flex-shrink-0">{eventIcon(ev.event_type)}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-slate-200">{ev.event_type.replace(/_/g, ' ')}</span>
                      {ev.visitor_name && <span className="text-[9px] text-slate-500 ml-1.5">· {ev.visitor_name}</span>}
                    </div>
                    <span className="text-[9px] text-slate-600 flex-shrink-0">{timeAgo(ev.created_at)}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-share panels */}
        {shares.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Shield className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-slate-500 text-sm">No active share links</p>
            <p className="text-slate-600 text-xs">Create a share link to start monitoring viewers</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Share Links ({shares.length})
            </p>
            {shares.map((s) => (
              <ShareMonitorPanel key={s.id} share={s} />
            ))}
          </div>
        )}

        <div className="pb-8" />
      </div>
    </div>
  );
};

export default DnaMonitorDashboard;
