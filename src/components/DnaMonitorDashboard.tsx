/**
 * DnaMonitorDashboard.tsx
 * Real-time DNA Monitoring Center
 *
 * Layout (top → bottom):
 *   1. Sticky header
 *   2. DB setup banner (if tables missing)
 *   3. Download requests inbox (amber, always visible when pending)
 *   4. Per-share viewer cards — name → location → live activity
 *   5. Global event feed
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, Camera, ChevronDown, ChevronRight,
  Clock, Copy, Download, Eye, Fingerprint, Globe, MapPin,
  Monitor, Phone, Printer, Radio, RotateCcw, Send,
  Shield, Smartphone, Tablet, UserX, Users, X, Zap,
  Ban, FileDown, GitBranch, Check, AlertCircle,
} from 'lucide-react';
import {
  getShareMonitorData, subscribeToShareActivity,
  approveDownloadRequest, rejectDownloadRequest,
  revokeVisitorAccess, checkMonitoringTablesExist,
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
  visitor_phone?: string;
  ip_address?: string;
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
  parent_visitor_id?: string;
}

interface SecEvent {
  visitor_id?: string;
  visitor_name?: string;
  event_type: string;
  details?: string;
  risk_score?: number;
  created_at: string;
}

interface DlRequest {
  id: string;
  share_id?: string;
  visitor_id?: string;
  visitor_name?: string;
  status?: string;
  created_at?: string;
}

interface ShareMonData {
  visitors: Visitor[];
  secEvents: SecEvent[];
  dlRequests: DlRequest[];
}

export interface DnaMonitorDashboardProps {
  shares: ShareLike[];
  userId?: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SQL_SETUP = `-- Run once in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS share_visitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id text NOT NULL, visitor_id text NOT NULL,
  visitor_name text NOT NULL, visitor_phone text, ip_address text,
  geo_city text, geo_area text, geo_district text, geo_state text,
  geo_country text, geo_country_code text, geo_pincode text, geo_formatted text,
  gps_lat double precision, gps_lng double precision,
  device_type text, os text, browser text, screen_resolution text,
  language text, timezone text, network_type text, network_speed text,
  session_start timestamptz NOT NULL DEFAULT now(), last_active timestamptz,
  parent_visitor_id text, parent_share_id text, created_at timestamptz DEFAULT now(),
  UNIQUE(share_id, visitor_id)
);
CREATE TABLE IF NOT EXISTS share_security_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id text NOT NULL, visitor_id text, visitor_name text,
  event_type text NOT NULL, details text, risk_score integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS download_requests (
  id text PRIMARY KEY, share_id text NOT NULL,
  visitor_id text, visitor_name text, status text DEFAULT 'pending',
  approved_limit integer DEFAULT 0, downloads_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS share_revoked_visitors (
  share_id text NOT NULL, visitor_id text NOT NULL,
  revoked_at timestamptz DEFAULT now(), PRIMARY KEY (share_id, visitor_id)
);
ALTER TABLE share_visitors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_security_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_revoked_visitors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "p" ON share_visitors FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p" ON share_security_events FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p" ON download_requests FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "p" ON share_revoked_visitors FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;

function flag(code?: string) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000), m = Math.floor(d / 60000), h = Math.floor(d / 3600000);
  if (s < 10) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  return `${h}h ago`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isActive(lastActive?: string | null): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 90000;
}

const EVENT_WEIGHTS: Record<string, number> = {
  screen_recording: 90, screenshot: 85, devtools: 65, copy: 50, print: 40, tab_switch: 15, zoom: 10,
};

function calcRisk(events: SecEvent[]): number {
  let score = 0;
  events.forEach((e) => {
    const key = Object.keys(EVENT_WEIGHTS).find((k) => e.event_type.includes(k));
    if (key) score = Math.min(100, score + EVENT_WEIGHTS[key]);
  });
  return score;
}

function riskColor(score: number) {
  if (score >= 70) return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'from-red-600 to-red-400', label: 'HIGH RISK' };
  if (score >= 40) return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', bar: 'from-amber-600 to-amber-400', label: 'MEDIUM' };
  return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'from-emerald-600 to-emerald-400', label: 'SAFE' };
}

function EventIcon({ type }: { type: string }) {
  if (type.includes('screenshot') || type.includes('screen_recording')) return <Camera className="w-3 h-3 text-red-400 flex-shrink-0" />;
  if (type.includes('copy')) return <Copy className="w-3 h-3 text-amber-400 flex-shrink-0" />;
  if (type.includes('print')) return <Printer className="w-3 h-3 text-amber-400 flex-shrink-0" />;
  if (type.includes('devtools')) return <Monitor className="w-3 h-3 text-orange-400 flex-shrink-0" />;
  if (type.includes('tab_switch')) return <RotateCcw className="w-3 h-3 text-slate-400 flex-shrink-0" />;
  if (type.includes('forward')) return <Send className="w-3 h-3 text-fuchsia-400 flex-shrink-0" />;
  if (type.includes('download')) return <Download className="w-3 h-3 text-blue-400 flex-shrink-0" />;
  if (type.includes('zoom')) return <Eye className="w-3 h-3 text-cyan-400 flex-shrink-0" />;
  if (type.includes('view_start') || type.includes('opened')) return <Eye className="w-3 h-3 text-emerald-400 flex-shrink-0" />;
  return <Activity className="w-3 h-3 text-slate-400 flex-shrink-0" />;
}

function eventLabel(type: string): string {
  if (type.includes('screenshot')) return '📸 Screenshot detected';
  if (type.includes('screen_recording')) return '🔴 Screen recording started';
  if (type.includes('copy')) return '📋 Copied content';
  if (type.includes('print')) return '🖨️ Tried to print (Ctrl+P)';
  if (type.includes('devtools')) return '🛠️ Opened DevTools';
  if (type.includes('tab_switch')) return '🔄 Switched tab / app';
  if (type.includes('forward')) return '↗️ Forwarded link';
  if (type.includes('download_request')) return '⬇️ Requested download';
  if (type.includes('view_start') || type.includes('opened')) return '👁️ Opened document';
  if (type.includes('zoom')) return '🔍 Zoomed in';
  return type.replace(/_/g, ' ');
}

// ─── Setup Banner ─────────────────────────────────────────────────────────────

const SetupBanner: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SQL_SETUP).then(() => { setCopied(true); setTimeout(() => setCopied(false), 3000); });
  };
  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-500/20 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-300">One-time database setup required</p>
          <p className="text-[10px] text-amber-600">Monitoring tables don't exist yet — create them to start tracking viewers</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-[11px] text-slate-300 leading-relaxed">
          <span className="font-bold text-white">Step 1:</span> Open your{' '}
          <span className="text-amber-400 font-semibold">Supabase dashboard → SQL Editor</span>
        </p>
        <p className="text-[11px] text-slate-300">
          <span className="font-bold text-white">Step 2:</span> Paste and run this SQL:
        </p>
        <div className="relative bg-slate-950 rounded-xl border border-slate-700/50 p-3 max-h-32 overflow-y-auto">
          <pre className="text-[9px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">{SQL_SETUP}</pre>
        </div>
        <div className="flex gap-2">
          <button onClick={copy}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              copied ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800/60 border-slate-700/40 text-slate-300 hover:text-white'
            }`}>
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy SQL</>}
          </button>
          <button onClick={onDone}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-all">
            ✓ Done — Check Again
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Viewer Card ──────────────────────────────────────────────────────────────

const ViewerCard: React.FC<{
  visitor: Visitor;
  events: SecEvent[];
  shareId: string;
  fileName: string;
  onRevoke: () => void;
}> = ({ visitor, events, shareId, fileName, onRevoke }) => {
  const [showEvents, setShowEvents] = useState(true);
  const [revoked, setRevoked] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const live = isActive(visitor.last_active);
  const myEvents = events
    .filter((e) => e.visitor_id === visitor.visitor_id || e.visitor_name === visitor.visitor_name)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const risk = calcRisk(myEvents);
  const rc = riskColor(risk);

  const screenshots = myEvents.filter((e) => e.event_type.includes('screenshot') || e.event_type.includes('screen_recording')).length;
  const copies = myEvents.filter((e) => e.event_type.includes('copy')).length;
  const prints = myEvents.filter((e) => e.event_type.includes('print')).length;

  const handleRevoke = async () => {
    setRevoking(true);
    await revokeVisitorAccess(shareId, visitor.visitor_id);
    setRevoked(true);
    setRevoking(false);
    setConfirmRevoke(false);
    onRevoke();
  };

  const locationLine = [visitor.geo_city, visitor.geo_state, visitor.geo_country].filter(Boolean).join(', ');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden ${
        revoked ? 'border-red-800/40 bg-red-950/20 opacity-60'
        : live ? 'border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-transparent'
        : 'border-slate-700/40 bg-slate-800/20'
      }`}
    >
      {/* ── Top: Name + status ── */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        {/* Avatar */}
        <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 ${
          revoked ? 'bg-red-900/40 text-red-500' : live ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-700/60 text-slate-300'
        }`}>
          {revoked ? <Ban className="w-5 h-5" /> : (visitor.visitor_name || 'A').charAt(0).toUpperCase()}
          {live && !revoked && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#080c18] animate-pulse" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-base font-black ${revoked ? 'text-red-400 line-through' : 'text-white'}`}>
              {visitor.visitor_name}
            </span>
            {revoked && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">REVOKED</span>}
            {!revoked && live && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE NOW
              </span>
            )}
            {!revoked && !live && (
              <span className="text-[9px] text-slate-500 bg-slate-800/60 rounded-full px-2 py-0.5">
                {timeAgo(visitor.last_active || visitor.session_start)}
              </span>
            )}
          </div>

          {/* File accessed */}
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            Viewing · <span className="text-slate-400">{fileName}</span>
          </p>
        </div>

        {/* Risk badge */}
        {risk > 0 && (
          <div className={`flex-shrink-0 text-[9px] font-bold px-2 py-1 rounded-lg border ${rc.text} ${rc.bg} ${rc.border}`}>
            {rc.label} {risk}
          </div>
        )}
      </div>

      {/* ── Location ── */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span className="font-semibold">
            {flag(visitor.geo_country_code)} {locationLine || 'Location not captured'}
          </span>
        </div>
        {visitor.gps_lat && visitor.gps_lng && (
          <p className="text-[9px] text-slate-600 ml-5 mt-0.5 font-mono">
            GPS {visitor.gps_lat.toFixed(4)}° N, {visitor.gps_lng.toFixed(4)}° E
          </p>
        )}
      </div>

      {/* ── Device + IP row ── */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {visitor.device_type && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/60 rounded-lg px-2 py-1">
            {visitor.device_type === 'mobile' ? <Smartphone className="w-3 h-3" /> : visitor.device_type === 'tablet' ? <Tablet className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {visitor.os} · {visitor.browser}
          </span>
        )}
        {visitor.ip_address && (
          <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 rounded-lg px-2 py-1 font-mono">
            <Globe className="w-3 h-3" /> {visitor.ip_address}
          </span>
        )}
        {visitor.visitor_phone && (
          <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 rounded-lg px-2 py-1">
            <Phone className="w-3 h-3" /> {visitor.visitor_phone}
          </span>
        )}
        {visitor.parent_visitor_id && (
          <span className="flex items-center gap-1 text-[10px] text-fuchsia-400 bg-fuchsia-500/10 rounded-lg px-2 py-1">
            <GitBranch className="w-3 h-3" /> Forwarded link
          </span>
        )}
      </div>

      {/* ── Session times ── */}
      <div className="px-4 pb-2 flex gap-3 text-[9px] text-slate-600">
        <span><span className="text-slate-500">First access:</span> {fmtDate(visitor.session_start)} {fmtTime(visitor.session_start)}</span>
        {visitor.last_active && <span><span className="text-slate-500">Last active:</span> {fmtTime(visitor.last_active)}</span>}
      </div>

      {/* ── Alert counts ── */}
      {(screenshots > 0 || copies > 0 || prints > 0) && (
        <div className="px-4 pb-2 flex gap-2">
          {screenshots > 0 && <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-0.5"><Camera className="w-3 h-3" />{screenshots} screenshot{screenshots > 1 ? 's' : ''}</span>}
          {copies > 0 && <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-0.5"><Copy className="w-3 h-3" />{copies} cop{copies > 1 ? 'ies' : 'y'}</span>}
          {prints > 0 && <span className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-0.5"><Printer className="w-3 h-3" />{prints} print{prints > 1 ? 's' : ''}</span>}
        </div>
      )}

      {/* ── Risk bar ── */}
      {risk > 0 && (
        <div className="px-4 pb-2">
          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${rc.bar}`}
              initial={{ width: 0 }} animate={{ width: `${risk}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* ── Live Activity Feed ── */}
      <div className="border-t border-slate-700/30">
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-slate-800/30 transition-colors"
        >
          <Activity className="w-3 h-3 text-fuchsia-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest flex-1">
            Live Activity {myEvents.length > 0 ? `(${myEvents.length})` : ''}
          </span>
          {showEvents ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        </button>

        <AnimatePresence>
          {showEvents && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {myEvents.length === 0 ? (
                <p className="text-[10px] text-slate-600 text-center py-3 px-4">No activity recorded yet</p>
              ) : (
                <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
                  {myEvents.map((ev, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${
                        (ev.risk_score ?? 0) >= 70 ? 'bg-red-500/8 border border-red-800/20'
                        : (ev.risk_score ?? 0) >= 40 ? 'bg-amber-500/5'
                        : 'bg-slate-800/30'
                      }`}
                    >
                      <EventIcon type={ev.event_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-slate-200">{eventLabel(ev.event_type)}</p>
                        {ev.details && <p className="text-[9px] text-slate-500 truncate">{ev.details}</p>}
                      </div>
                      <span className="text-[9px] text-slate-600 flex-shrink-0 font-mono">{fmtTime(ev.created_at)}</span>
                      {(ev.risk_score ?? 0) > 0 && (
                        <span className={`text-[8px] font-bold px-1 rounded flex-shrink-0 ${
                          (ev.risk_score ?? 0) >= 70 ? 'text-red-400' : 'text-amber-400'
                        }`}>{ev.risk_score}</span>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Revoke confirm ── */}
      <AnimatePresence>
        {confirmRevoke && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-red-800/30 bg-red-950/30 px-4 py-3 overflow-hidden"
          >
            <p className="text-[11px] text-red-300 mb-2 font-semibold">
              Revoke access for <span className="font-black text-red-200">{visitor.visitor_name}</span>? They won't be able to open this link again.
            </p>
            <div className="flex gap-2">
              <button onClick={handleRevoke} disabled={revoking}
                className="flex-1 py-2 rounded-xl bg-red-600/30 border border-red-500/40 text-red-200 text-xs font-bold hover:bg-red-600/50 transition-all disabled:opacity-50">
                {revoking ? 'Revoking…' : '✗ Confirm Revoke'}
              </button>
              <button onClick={() => setConfirmRevoke(false)}
                className="px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-slate-400 text-xs font-bold hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom action bar ── */}
      {!revoked && (
        <div className="border-t border-slate-700/20 px-4 py-2 flex items-center justify-between">
          <span className="text-[9px] text-slate-600 font-mono">ID: {visitor.visitor_id.slice(0, 20)}…</span>
          <button
            onClick={() => setConfirmRevoke(true)}
            className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors py-1 px-2 rounded-lg hover:bg-red-500/10"
          >
            <UserX className="w-3 h-3" /> Revoke Access
          </button>
        </div>
      )}
    </motion.div>
  );
};

// ─── Download Requests Inbox ──────────────────────────────────────────────────

const DownloadInbox: React.FC<{
  requests: Array<DlRequest & { shareId: string; fileName: string }>;
  onAction: (shareId: string) => void;
}> = ({ requests, onAction }) => {
  const pending = requests.filter((r) => !r.status || r.status === 'pending');

  if (requests.length === 0) return null;

  return (
    <div className={`mx-4 rounded-2xl border overflow-hidden ${pending.length > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700/40 bg-slate-900/40'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/20">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${pending.length > 0 ? 'bg-amber-500/20' : 'bg-slate-700/40'}`}>
          <Download className={`w-4 h-4 ${pending.length > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Download Requests</p>
          <p className="text-[10px] text-slate-500">
            {pending.length > 0 ? `${pending.length} pending approval` : 'All handled'}
          </p>
        </div>
        {pending.length > 0 && (
          <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1 animate-pulse">
            {pending.length} NEW
          </span>
        )}
      </div>

      {/* Request list */}
      <div className="p-3 space-y-2">
        {requests.map((req, i) => {
          const isPending = !req.status || req.status === 'pending';
          return (
            <motion.div key={req.id || i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`rounded-xl border px-3 py-3 space-y-2 ${
                isPending ? 'border-amber-500/20 bg-amber-500/5'
                : req.status === 'approved' ? 'border-emerald-500/15 bg-emerald-500/5 opacity-70'
                : 'border-slate-700/30 bg-slate-800/20 opacity-60'
              }`}>
              {/* Who + what */}
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${
                  isPending ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700/50 text-slate-400'
                }`}>
                  {(req.visitor_name || 'A').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{req.visitor_name || 'Unknown'}</p>
                  <p className="text-[10px] text-slate-400">
                    Wants to download · <span className="text-slate-200">{req.fileName}</span>
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">{timeAgo(req.created_at)}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                  isPending ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : req.status === 'approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-slate-500 bg-slate-700/30 border-slate-700/40'
                }`}>
                  {isPending ? 'PENDING' : req.status?.toUpperCase()}
                </span>
              </div>

              {/* Approve / Reject */}
              {isPending && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => approveDownloadRequest(req.id, 1).then(() => onAction(req.shareId))}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 text-xs font-black hover:bg-emerald-600/40 active:scale-95 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve Download
                  </button>
                  <button
                    onClick={() => rejectDownloadRequest(req.id).then(() => onAction(req.shareId))}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600/20 border border-red-500/35 text-red-300 text-xs font-black hover:bg-red-600/35 active:scale-95 transition-all"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Share Section ────────────────────────────────────────────────────────────

const ShareSection: React.FC<{
  share: ShareLike;
  onReload: (shareId: string) => void;
}> = ({ share, onReload }) => {
  const [data, setData] = useState<ShareMonData>({ visitors: [], secEvents: [], dlRequests: [] });
  const [collapsed, setCollapsed] = useState(false);

  const fileName = share.image_name || share.shareLink.split('/').pop() || share.id.slice(-8);

  const load = useCallback(async () => {
    const raw = await getShareMonitorData(share.id);
    setData({
      visitors: (raw.visitors as unknown as Visitor[]) || [],
      secEvents: (raw.securityEvents as unknown as SecEvent[]) || [],
      dlRequests: (raw.downloadRequests as unknown as DlRequest[]) || [],
    });
    onReload(share.id);
  }, [share.id, onReload]);

  useEffect(() => {
    load();
    const unsub = subscribeToShareActivity(share.id, load);
    const t = window.setInterval(load, 20000);
    return () => { unsub(); window.clearInterval(t); };
  }, [share.id, load]);

  const liveCount = data.visitors.filter((v) => isActive(v.last_active)).length;

  return (
    <div className="space-y-2">
      {/* Share label */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-800/40 border border-slate-700/30 hover:bg-slate-800/60 transition-colors"
      >
        <Fingerprint className="w-4 h-4 text-fuchsia-400 flex-shrink-0" />
        <span className="flex-1 text-left text-xs font-bold text-white truncate">{fileName}</span>
        <span className="text-[9px] text-slate-500 font-mono">#{share.id.slice(-8)}</span>
        {liveCount > 0 && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {liveCount} live
          </span>
        )}
        <span className="text-[9px] text-slate-500">{data.visitors.length} viewers</span>
        {data.visitors.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); }} className="p-1">
            <FileDown
              className="w-3.5 h-3.5 text-slate-500 hover:text-white transition-colors"
              onClick={() => {
                const header = 'Name,Phone,IP,Country,City,Device,OS,Browser,First Access,Last Active,Risk';
                const rows = data.visitors.map((v) => {
                  const risk = calcRisk(data.secEvents.filter((e) => e.visitor_id === v.visitor_id || e.visitor_name === v.visitor_name));
                  return [v.visitor_name, v.visitor_phone || '', v.ip_address || '', v.geo_country || '', v.geo_city || '', v.device_type || '', v.os || '', v.browser || '', v.session_start, v.last_active || '', risk]
                    .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
                });
                const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `viewers-${share.id.slice(-8)}.csv`; a.click();
              }}
            />
          </button>
        )}
        {collapsed ? <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {data.visitors.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Eye className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="text-[11px] text-slate-500">No viewers yet</p>
                <p className="text-[10px] text-slate-600">Share the link — viewers will appear here after they enter their name and location</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Live viewers first, then offline */}
                {[...data.visitors]
                  .sort((a, b) => {
                    const aLive = isActive(a.last_active) ? 1 : 0;
                    const bLive = isActive(b.last_active) ? 1 : 0;
                    return bLive - aLive || new Date(b.session_start).getTime() - new Date(a.session_start).getTime();
                  })
                  .map((v, i) => (
                    <ViewerCard
                      key={v.visitor_id || i}
                      visitor={v}
                      events={data.secEvents}
                      shareId={share.id}
                      fileName={fileName}
                      onRevoke={load}
                    />
                  ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const DnaMonitorDashboard: React.FC<DnaMonitorDashboardProps> = ({ shares, onBack }) => {
  const [tablesOk, setTablesOk] = useState<boolean | null>(null); // null = checking
  const [allData, setAllData] = useState<Record<string, ShareMonData>>({});

  // Check if DB tables exist
  useEffect(() => {
    checkMonitoringTablesExist().then(setTablesOk);
  }, []);

  const handleReload = useCallback(async (shareId: string) => {
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
  const liveViewers = Object.values(allData).reduce((s, d) => s + d.visitors.filter((v) => isActive(v.last_active)).length, 0);
  const totalAlerts = Object.values(allData).reduce((s, d) => s + d.secEvents.filter((e) => (e.risk_score ?? 0) >= 40).length, 0);

  // All download requests enriched with share info
  const allDlRequests = Object.entries(allData).flatMap(([shareId, d]) => {
    const share = shares.find((s) => s.id === shareId);
    const fileName = share?.image_name || share?.shareLink.split('/').pop() || shareId.slice(-8);
    return d.dlRequests.map((r) => ({ ...r, shareId, fileName }));
  }).sort((a, b) => {
    const ap = !a.status || a.status === 'pending';
    const bp = !b.status || b.status === 'pending';
    if (ap && !bp) return -1; if (!ap && bp) return 1;
    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
  });

  const pendingCount = allDlRequests.filter((r) => !r.status || r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#080c18] text-white pb-10">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-[#080c18]/95 backdrop-blur-md border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-700 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white">DNA Monitoring Center</h1>
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Real-time viewer intelligence</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded-full px-2.5 py-1 animate-pulse">
                {pendingCount} request{pendingCount > 1 ? 's' : ''}
              </span>
            )}
            {tablesOk !== false && (
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DB setup banner ── */}
      {tablesOk === false && (
        <SetupBanner onDone={() => checkMonitoringTablesExist().then(setTablesOk)} />
      )}

      {/* ── Checking state ── */}
      {tablesOk === null && (
        <div className="flex items-center justify-center py-12 gap-3">
          <div className="w-5 h-5 border-2 border-fuchsia-500/30 border-t-fuchsia-500 rounded-full animate-spin" />
          <p className="text-[11px] text-slate-500">Connecting to monitoring…</p>
        </div>
      )}

      {tablesOk && (
        <div className="space-y-4 pt-4">

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 gap-2 px-4">
            {[
              { icon: <Users className="w-4 h-4" />, label: 'Viewers', value: totalViewers, color: 'text-blue-400', border: 'border-blue-700/30', from: 'from-blue-600/15' },
              { icon: <Radio className="w-4 h-4" />, label: 'Live Now', value: liveViewers, color: 'text-emerald-400', border: 'border-emerald-700/30', from: 'from-emerald-600/15' },
              { icon: <AlertTriangle className="w-4 h-4" />, label: 'Alerts', value: totalAlerts, color: 'text-red-400', border: 'border-red-700/30', from: 'from-red-600/15' },
            ].map(({ icon, label, value, color, border, from }) => (
              <div key={label} className={`bg-gradient-to-br ${from} to-transparent border ${border} rounded-2xl p-3`}>
                <div className={`${color} mb-1`}>{icon}</div>
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Download Requests Inbox (always visible when any exist) ── */}
          <DownloadInbox requests={allDlRequests} onAction={handleReload} />

          {/* ── Per-share sections ── */}
          {shares.length === 0 ? (
            <div className="text-center py-16 space-y-3 px-4">
              <Shield className="w-12 h-12 text-slate-700 mx-auto" />
              <p className="text-slate-400 text-sm font-semibold">No share links yet</p>
              <p className="text-slate-600 text-xs">Create a share link from the vault — viewers appear here the moment they open it</p>
            </div>
          ) : (
            <div className="px-4 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-slate-500" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Your Share Links ({shares.length})
                </p>
              </div>
              {shares.map((s) => (
                <ShareSection key={s.id} share={s} onReload={handleReload} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DnaMonitorDashboard;
