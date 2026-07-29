/**
 * SecureShareGate.tsx — PINIT DNA Secure Share Viewer
 * Premium redesign: identity + location gate → secure content viewer
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Check, ChevronRight, Copy, Download, Eye,
  FileText, Fingerprint, Globe, Lock, MapPin, Monitor, Phone,
  Play, Send, Shield, Smartphone, Tablet, User, X, Zap, Activity,
  Radio, Clock, Wifi,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logActivityEvent } from '@/lib/activityService';
import { SecurePdfViewer } from '@/components/SecurePdfViewer';
import {
  detectDevice, reverseGeocode, getOrCreateVisitorId,
  logVisitorAccess, logSecurityEvent, createDownloadRequest,
  generateDNAForwardLink, updateVisitorLastActive, logViewerActivity,
  getPublicIp, isVisitorRevoked,
  type GeoAddress,
} from '@/lib/shareMonitor';
import { getGpsOnce } from '@/lib/shareTrace';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareRow {
  share_id: string;
  user_id: string;
  share_link: string;
  vault_image_id: string | null;
  image_name: string | null;
  download_limit: number | null;
  downloads_used: number;
  password: string | null;
  include_cert: boolean;
  is_active: boolean;
  access_count: number;
  created_by: string;
  expiry_date: string | null;
  created_at: string;
  parent_share_id?: string | null;
}

type Phase = 'loading' | 'error' | 'password' | 'gate' | 'viewing' | 'forward-modal' | 'dl-sent';
type GeoPhase = 'idle' | 'requesting' | 'done' | 'denied';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

function DeviceIcon({ type }: { type: 'mobile' | 'tablet' | 'desktop' }) {
  if (type === 'mobile') return <Smartphone className="w-3.5 h-3.5" />;
  if (type === 'tablet') return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
}

function fmt(d: Date) {
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Animated background grid ─────────────────────────────────────────────────

const GridBg: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `
        linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
    }} />
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,92,246,0.18) 0%, transparent 70%)',
    }} />
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(6,182,212,0.07) 0%, transparent 70%)',
    }} />
  </div>
);

// ─── Watermark overlay ────────────────────────────────────────────────────────

const Watermark: React.FC<{ name: string }> = ({ name }) => {
  const text = `PINIT DNA · ${name} · ${new Date().toLocaleDateString()}`;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden', userSelect: 'none' }}>
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 4 }).map((_, col) => (
          <div key={`${row}-${col}`} style={{
            position: 'absolute',
            top: `${row * 14}%`,
            left: `${col * 30 - 5}%`,
            transform: 'rotate(-35deg)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(139,92,246,0.15)',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            fontFamily: 'monospace',
          }}>{text}</div>
        ))
      )}
    </div>
  );
};

// ─── Loader ───────────────────────────────────────────────────────────────────

const PINITLoader: React.FC<{ label?: string }> = ({ label = 'Initialising secure channel…' }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: '#030712' }}>
    <GridBg />
    <div className="relative z-10 flex flex-col items-center gap-4">
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
          className="w-16 h-16 rounded-full border-2 border-fuchsia-500/10 border-t-fuchsia-500"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Fingerprint className="w-6 h-6 text-fuchsia-400" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-fuchsia-300 text-sm font-bold tracking-widest uppercase">PINIT DNA</p>
        <p className="text-slate-500 text-xs font-mono mt-1">{label}</p>
      </div>
    </div>
  </div>
);

// ─── Toast notification ───────────────────────────────────────────────────────

interface Toast { id: number; type: string; isHigh: boolean }

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => (
  <motion.div
    initial={{ opacity: 0, x: 60, scale: 0.9 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: 60, scale: 0.9 }}
    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-lg ${
      toast.isHigh
        ? 'bg-red-950/90 border-red-500/40 text-red-300'
        : 'bg-amber-950/90 border-amber-500/40 text-amber-300'
    }`}
    style={{ maxWidth: 220 }}
  >
    <AlertCircle className="w-3 h-3 flex-shrink-0" />
    <span>{toast.type.replace(/_/g, ' ')}</span>
    {toast.isHigh && (
      <span className="ml-auto bg-red-500/20 text-red-400 text-[9px] px-1.5 py-0.5 rounded font-bold">HIGH</span>
    )}
  </motion.div>
);

// ─── Step indicator ───────────────────────────────────────────────────────────

const StepDot: React.FC<{ n: number; active: boolean; done: boolean; label: string }> = ({ n, active, done, label }) => (
  <div className="flex flex-col items-center gap-1.5">
    <motion.div
      animate={{ scale: active ? 1.1 : 1 }}
      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
        done
          ? 'bg-emerald-500 border-emerald-400 text-white'
          : active
          ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-900/50'
          : 'bg-slate-800 border-slate-700 text-slate-500'
      }`}
    >
      {done ? <Check className="w-4 h-4" /> : n}
    </motion.div>
    <span className={`text-[10px] font-semibold tracking-wide uppercase ${active ? 'text-fuchsia-300' : done ? 'text-emerald-400' : 'text-slate-600'}`}>
      {label}
    </span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const SecureShareGate: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [shareRow, setShareRow] = useState<ShareRow | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState('');

  // Gate fields
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [geoPhase, setGeoPhase] = useState<GeoPhase>('idle');
  const [geo, setGeo] = useState<GeoAddress | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [gateStep, setGateStep] = useState<1 | 2>(1);

  // Viewing state
  const [sessionStart] = useState(() => new Date().toISOString());
  const [sessionSecs, setSessionSecs] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [imgError, setImgError] = useState(false);
  const [forwardRecipient, setForwardRecipient] = useState('');
  const [forwardLink, setForwardLink] = useState('');
  const [forwardLoading, setForwardLoading] = useState(false);
  const [dlSent, setDlSent] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDnaPanel, setShowDnaPanel] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const visitorId = token ? getOrCreateVisitorId(token) : 'v_anon';
  const device = detectDevice();

  useEffect(() => {
    document.body.style.background = '#030712';
    return () => { document.body.style.background = ''; };
  }, []);

  // Session timer
  useEffect(() => {
    if (phase !== 'viewing') return;
    const t = window.setInterval(() => setSessionSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const sessionLabel = (() => {
    const m = Math.floor(sessionSecs / 60), s = sessionSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  // Fetch share
  useEffect(() => {
    if (!token) { setLoadError('Invalid share link.'); setPhase('error'); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('share_configs')
          .select('share_id,user_id,share_link,vault_image_id,image_name,download_limit,downloads_used,include_cert,is_active,access_count,created_by,expiry_date,created_at,password')
          .eq('share_id', token)
          .maybeSingle();

        if (error || !data) {
          const fwdRaw = localStorage.getItem(`pinit_fwd_${token}`);
          if (fwdRaw) {
            const row = JSON.parse(fwdRaw) as ShareRow;
            setShareRow(row);
            setPhase(row.password ? 'password' : 'gate');
            return;
          }
          setLoadError(data === null ? 'Share link not found or expired.' : 'Could not load the share.');
          setPhase('error');
          return;
        }

        const row = data as ShareRow;
        if (!row.is_active) { setLoadError('This link has been disabled by the owner.'); setPhase('error'); return; }
        if (row.expiry_date && new Date(row.expiry_date) < new Date()) {
          setLoadError('This share link has expired.');
          setPhase('error');
          return;
        }

        supabase.from('share_configs')
          .update({ access_count: (row.access_count || 0) + 1 })
          .eq('share_id', token)
          .then(() => {});

        setShareRow(row);
        setPhase(row.password ? 'password' : 'gate');
      } catch {
        setLoadError('Something went wrong loading this share.');
        setPhase('error');
      }
    })();
  }, [token]);

  // Security monitoring
  const addToast = useCallback((type: string, riskScore: number, details?: string) => {
    const id = Date.now();
    const isHigh = riskScore >= 60;
    setToasts((prev) => [{ id, type, isHigh }, ...prev.slice(0, 4)]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    if (token) {
      logSecurityEvent({
        shareId: token, visitorId, visitorName,
        type: type as never,
        details, riskScore,
        timestamp: new Date(id).toISOString(),
      });
    }
  }, [token, visitorId, visitorName]);

  useEffect(() => {
    if (phase !== 'viewing') return;

    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); addToast('right_click', 20); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey)) {
        e.preventDefault();
        addToast('screenshot_attempt', 85, 'PrintScreen key pressed');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        addToast('print_attempt', 60);
      }
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); addToast('copy_attempt', 50); };
    const onVisibility = () => { if (document.hidden) addToast('tab_switch', 30); };

    let lastZoomDir = '';
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const dir = e.deltaY < 0 ? 'zoom_in' : 'zoom_out';
        if (dir !== lastZoomDir) {
          lastZoomDir = dir;
          if (token) logViewerActivity(token, visitorId, visitorName, dir as 'zoom_in' | 'zoom_out');
        }
      }
    };

    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices && origGetDisplayMedia) {
      (navigator.mediaDevices as any).getDisplayMedia = async (...args: unknown[]) => {
        addToast('screenshot_attempt', 90, 'Screen capture API invoked');
        if (token) logViewerActivity(token, visitorId, visitorName, 'screen_recording_suspected', 'getDisplayMedia called', 90);
        return origGetDisplayMedia(...(args as Parameters<typeof origGetDisplayMedia>));
      };
    }

    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('wheel', onWheel, { passive: true });

    const devToolsCheck = window.setInterval(() => {
      if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160)
        addToast('devtools_open', 65, 'Dev tools panel detected');
    }, 2000);

    const heartbeat = window.setInterval(() => {
      if (token) updateVisitorLastActive(token, visitorId);
    }, 30000);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('wheel', onWheel);
      window.clearInterval(devToolsCheck);
      window.clearInterval(heartbeat);
      if (navigator.mediaDevices && origGetDisplayMedia)
        (navigator.mediaDevices as any).getDisplayMedia = origGetDisplayMedia;
    };
  }, [phase, addToast, token, visitorId, visitorName]);

  // Password unlock
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareRow || !token) return;
    const { data } = await supabase
      .from('share_configs')
      .select('share_id')
      .eq('share_id', token)
      .eq('password', pwInput)
      .maybeSingle();
    if (data) { setUnlocked(true); setPhase('gate'); }
    else { setPwError(true); setTimeout(() => setPwError(false), 2000); }
  };

  // Location capture
  const requestLocation = async () => {
    setGeoPhase('requesting');
    const coords = await getGpsOnce(10000);
    if (coords) {
      const address = await reverseGeocode(coords.lat, coords.lng);
      setGeo(address);
      setGeoPhase('done');
    } else {
      setGeoPhase('denied');
    }
  };

  // Grant access
  const grantAccess = async () => {
    if (!shareRow || !token) return;
    const name = visitorName.trim();
    if (!name) return;

    // Check if this visitor has been individually revoked
    if (isVisitorRevoked(token, visitorId)) {
      setLoadError('Your access to this link has been revoked by the owner.');
      setPhase('error');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const parentVisitorId = params.get('ref');
    const sourcePlatform = params.get('via') ?? undefined;
    const parentShareId = shareRow.parent_share_id ?? null;
    const ipAddress = await getPublicIp();

    await logVisitorAccess({
      shareId: token,
      visitorId,
      visitorName: name,
      visitorEmail: visitorEmail.trim() || null,
      visitorPhone: visitorPhone.trim() || null,
      ipAddress,
      geoAddress: geo,
      deviceInfo: device,
      sessionStart,
      parentVisitorId,
      parentShareId,
      sourcePlatform,
    });

    logActivityEvent({
      userId: shareRow.user_id,
      shareId: token,
      type: 'link_accessed',
      fileName: shareRow.image_name || 'document',
      fileType: (shareRow.image_name || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
      viewCount: (shareRow.access_count || 0) + 1,
      metadata: {
        visitor_name: name,
        visitor_email: visitorEmail.trim() || null,
        visitor_phone: visitorPhone.trim() || null,
        visitor_city: geo?.city,
        visitor_country: geo?.country,
        device: device.type,
        browser: device.browser,
        os: device.os,
      },
    });

    setPhase('viewing');
    if (token) logViewerActivity(token, visitorId, name, 'file_view_start', shareRow.image_name || undefined);
  };

  // Request download
  const handleRequestDownload = async () => {
    if (!shareRow || !token || dlLoading) return;
    setDlLoading(true);
    await createDownloadRequest(token, visitorId, visitorName.trim() || 'Anonymous');
    logActivityEvent({
      userId: shareRow.user_id, shareId: token,
      type: 'download_requested',
      fileName: shareRow.image_name || 'document',
      fileType: 'image',
      metadata: { visitor_name: visitorName, visitor_city: geo?.city },
    });
    setDlLoading(false);
    setDlSent(true);
    setPhase('dl-sent');
  };

  // Forward link
  const handleGenerateForward = async () => {
    if (!shareRow || !token || !forwardRecipient.trim() || forwardLoading) return;
    setForwardLoading(true);
    const { url } = await generateDNAForwardLink(
      token, visitorId, visitorName.trim() || 'Anonymous',
      {
        user_id: shareRow.user_id,
        vault_image_id: shareRow.vault_image_id,
        image_name: shareRow.image_name,
        download_limit: shareRow.download_limit,
        downloads_used: 0,
        password: shareRow.password,
        include_cert: shareRow.include_cert,
        is_active: true,
        created_by: shareRow.created_by,
        expiry_date: shareRow.expiry_date,
      }
    );
    addToast('forward_link', 20, `Forwarded to: ${forwardRecipient.trim()}`);
    logActivityEvent({
      userId: shareRow.user_id, shareId: token,
      type: 'link_forwarded',
      fileName: shareRow.image_name || 'document',
      fileType: 'image',
      metadata: { forwarded_by: visitorName, intended_recipient: forwardRecipient, new_link: url },
    });
    setForwardLink(url);
    setForwardLoading(false);
  };

  const copyForwardLink = async () => {
    if (!forwardLink) return;
    try { await navigator.clipboard.writeText(forwardLink); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { /* ignore */ }
  };

  const contentUrl = shareRow?.vault_image_id || null;
  const nameLower = (shareRow?.image_name || '').toLowerCase();
  const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'];
  const isVideoFile = VIDEO_EXTS.some(ext => nameLower.endsWith(`.${ext}`));
  const isPdfFile = nameLower.endsWith('.pdf');
  const isPdf = isPdfFile && !!contentUrl?.startsWith('data:application/pdf');
  const isImage = !!contentUrl && contentUrl.startsWith('data:image') && !imgError;
  const isVideo = !!contentUrl && contentUrl.startsWith('data:video');
  const hasContent = isPdf || isImage || isVideo;
  const nameOk = visitorName.trim().length >= 2;
  const geoOk = geoPhase === 'done' || geoPhase === 'denied';
  const canEnter = nameOk && geoOk;

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (phase === 'loading') return <PINITLoader />;

  // ─── ERROR ────────────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#030712' }}>
        <GridBg />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-md w-full rounded-2xl p-8 border"
          style={{ background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Share Unavailable</h2>
              <p className="text-red-300/70 text-sm mt-1">{loadError}</p>
            </div>
            <p className="text-slate-600 text-xs">Links can expire, be revoked, or reach access limits.</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 font-mono">
              <Fingerprint className="w-3 h-3 text-fuchsia-600" />
              <span>PINIT DNA · Secure Share System</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── PASSWORD GATE ────────────────────────────────────────────────────────

  if (phase === 'password' && !unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#030712' }}>
        <GridBg />
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 max-w-sm w-full rounded-2xl p-8 border"
          style={{ background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(6,182,212,0.2)' }}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <Lock className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-white font-bold text-lg">Password Required</h2>
            <p className="text-slate-400 text-sm mt-1">This share is password protected</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="Enter access password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none transition-all ${
                pwError ? 'border border-red-500/60 bg-red-950/20' : 'border border-slate-700 bg-slate-800/60 focus:border-cyan-500'
              }`}
            />
            {pwError && (
              <p className="text-red-400 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Incorrect password — try again
              </p>
            )}
            <button type="submit"
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}>
              Unlock Access
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── IDENTITY + LOCATION GATE ─────────────────────────────────────────────

  if (phase === 'gate') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative" style={{ background: '#030712' }}>
        <GridBg />

        <div className="relative z-10 w-full max-w-lg">

          {/* Brand header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6">
            <div className="inline-flex items-center gap-2.5 mb-3 px-4 py-2 rounded-full border"
              style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)' }}>
              <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
              <Fingerprint className="w-4 h-4 text-fuchsia-400" />
              <span className="text-fuchsia-300 text-xs font-bold tracking-widest uppercase">PINIT DNA Secure Access</span>
            </div>
            <h1 className="text-2xl font-black text-white mb-2 tracking-tight">Identity Verification</h1>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              This document is protected. Verify your identity to access the secure content.
            </p>
          </motion.div>

          {/* Step indicators */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-4 mb-6">
            <StepDot n={1} active={gateStep === 1} done={gateStep > 1 || (nameOk)} label="Identity" />
            <div className="flex-1 max-w-12 h-px" style={{ background: nameOk ? 'rgba(139,92,246,0.5)' : 'rgba(100,116,139,0.3)' }} />
            <StepDot n={2} active={gateStep === 2} done={geoOk} label="Location" />
            <div className="flex-1 max-w-12 h-px" style={{ background: geoOk ? 'rgba(16,185,129,0.5)' : 'rgba(100,116,139,0.3)' }} />
            <StepDot n={3} active={canEnter} done={false} label="Access" />
          </motion.div>

          {/* Main card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.06)' }}>

            {/* Locked preview bar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b"
              style={{ background: 'rgba(139,92,246,0.05)', borderColor: 'rgba(139,92,246,0.12)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <Lock className="w-4 h-4 text-fuchsia-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {shareRow?.image_name || 'Secure Document'}
                </p>
                <p className="text-slate-500 text-xs">Content locked — complete verification to view</p>
              </div>
              <div className="flex-shrink-0">
                <span className="text-[10px] font-bold px-2 py-1 rounded-md"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#c084fc' }}>
                  PINIT DNA
                </span>
              </div>
            </div>

            <div className="p-5 space-y-4">

              {/* Step 1 — Identity */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.35)', color: '#c084fc' }}>1</div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Your Identity</span>
                  {nameOk && <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
                </div>

                {/* Name — required */}
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Full Name (required)"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none transition-all border"
                    style={{
                      background: 'rgba(30,41,59,0.8)',
                      borderColor: nameOk ? 'rgba(16,185,129,0.4)' : 'rgba(71,85,105,0.5)',
                    }}
                    autoComplete="name"
                  />
                </div>

                {/* Phone — optional */}
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="tel"
                    placeholder="Phone Number (optional)"
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none transition-all border"
                    style={{ background: 'rgba(30,41,59,0.8)', borderColor: 'rgba(71,85,105,0.5)' }}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

              {/* Step 2 — Location */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: 'rgba(6,182,212,0.2)', border: '1px solid rgba(6,182,212,0.35)', color: '#67e8f9' }}>2</div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Location Verification</span>
                  {geoOk && <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
                </div>

                {geoPhase === 'idle' && (
                  <motion.button
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    onClick={requestLocation}
                    className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all border"
                    style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.25)', color: '#67e8f9' }}>
                    <MapPin className="w-4 h-4" />
                    Allow Location Access
                  </motion.button>
                )}

                {geoPhase === 'requesting' && (
                  <div className="flex items-center gap-3 py-3 px-4 rounded-xl border"
                    style={{ background: 'rgba(6,182,212,0.06)', borderColor: 'rgba(6,182,212,0.2)' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: 'rgba(6,182,212,0.2)', borderTopColor: '#06b6d4' }} />
                    <div>
                      <p className="text-cyan-300 text-sm font-semibold">Capturing location…</p>
                      <p className="text-slate-500 text-xs">Please allow location access in your browser</p>
                    </div>
                  </div>
                )}

                {geoPhase === 'done' && geo && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 border space-y-3"
                    style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-bold uppercase tracking-wide">Location Verified</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['Country', `${flagEmoji(geo.countryCode)} ${geo.country}`],
                        ['State', geo.state],
                        ['District', geo.district],
                        ['City', geo.city],
                        ...(geo.area !== 'Unknown' ? [['Area', geo.area]] : []),
                        ...(geo.pincode ? [['Pincode', geo.pincode]] : []),
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg px-3 py-2"
                          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.12)' }}>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                          <p className="text-emerald-300 text-xs font-semibold truncate">{value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono">
                      GPS: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                    </p>
                  </motion.div>
                )}

                {geoPhase === 'denied' && (
                  <div className="rounded-xl p-4 border space-y-2"
                    style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400 text-xs font-bold">Location Unavailable</span>
                    </div>
                    <p className="text-slate-400 text-xs">
                      Access will still be logged with device and IP information.
                    </p>
                    <button onClick={() => setGeoPhase('done' as GeoPhase)}
                      className="text-amber-400 text-xs underline hover:text-amber-300">
                      Continue without location →
                    </button>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #a855f7, #06b6d4)' }}
                  animate={{ width: `${(nameOk ? 50 : 0) + (geoOk ? 50 : 0)}%` }}
                  transition={{ type: 'spring', stiffness: 200 }}
                />
              </div>

              {/* Access button */}
              <motion.button
                whileHover={canEnter ? { scale: 1.02 } : {}}
                whileTap={canEnter ? { scale: 0.98 } : {}}
                onClick={canEnter ? grantAccess : undefined}
                disabled={!canEnter}
                className="w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: canEnter
                    ? 'linear-gradient(135deg, #7c3aed, #a855f7, #6366f1)'
                    : 'rgba(30,41,59,0.6)',
                  color: canEnter ? '#fff' : '#475569',
                  cursor: canEnter ? 'pointer' : 'not-allowed',
                  boxShadow: canEnter ? '0 0 24px rgba(168,85,247,0.25)' : 'none',
                }}>
                {canEnter ? <Zap className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {canEnter ? 'Grant Secure Access' : 'Complete steps above to continue'}
                {canEnter && <ChevronRight className="w-4 h-4" />}
              </motion.button>
            </div>
          </motion.div>

          {/* DNA info footer */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="mt-4 flex items-center justify-center gap-4 flex-wrap">
            {[
              { icon: <Shield className="w-3 h-3" />, label: `${device.type} · ${device.os}` },
              { icon: <Globe className="w-3 h-3" />, label: device.browser },
              { icon: <Activity className="w-3 h-3" />, label: 'Session monitored' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                {icon}{label}
              </div>
            ))}
          </motion.div>

          <p className="text-center text-slate-700 text-[10px] mt-3 max-w-sm mx-auto">
            Your name, location, device &amp; browser are recorded for security purposes. By proceeding you consent to this monitoring.
          </p>
        </div>
      </div>
    );
  }

  // ─── DOWNLOAD SENT ────────────────────────────────────────────────────────

  if (phase === 'dl-sent') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#030712' }}>
        <GridBg />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 max-w-sm w-full rounded-2xl p-8 text-center border"
          style={{ background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)' }}>
            <Check className="w-10 h-10 text-emerald-400" />
          </motion.div>
          <h2 className="text-white font-black text-xl mb-2">Request Sent!</h2>
          <p className="text-slate-400 text-sm mb-6">
            Your download request has been sent to the document owner. They will approve or reject it.
          </p>
          <button onClick={() => setPhase('viewing')}
            className="w-full py-3 rounded-xl font-semibold text-sm border transition-all"
            style={{ background: 'rgba(30,41,59,0.8)', borderColor: 'rgba(71,85,105,0.4)', color: '#94a3b8' }}>
            Back to Document
          </button>
        </motion.div>
      </div>
    );
  }

  // ─── SECURE VIEWER ────────────────────────────────────────────────────────

  if (phase === 'viewing' || phase === 'forward-modal') {
    const forwardModalOpen = phase === 'forward-modal';
    const downloadsRemaining = shareRow?.download_limit
      ? Math.max(0, shareRow.download_limit - (shareRow.downloads_used || 0))
      : null;

    return (
      <div className="min-h-screen flex flex-col select-none" style={{ background: '#030712', userSelect: 'none' }}
        ref={contentRef}>

        {/* ── Top header bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-3 pt-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between rounded-2xl px-4 py-2.5 border"
            style={{ background: 'rgba(15,23,42,0.98)', borderColor: 'rgba(255,255,255,0.06)' }}>

            {/* Left: Brand + visitor */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
                <Fingerprint className="w-4 h-4 text-fuchsia-400" />
                <span className="text-fuchsia-300 text-xs font-black tracking-widest hidden sm:block uppercase">PINIT DNA</span>
              </div>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <User className="w-3 h-3" />
                <span className="truncate max-w-[100px] font-medium text-slate-300">{visitorName}</span>
              </div>
            </div>

            {/* Right: Status indicators */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                <Shield className="w-3 h-3" />
                <span className="hidden sm:block">Secured</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-mono text-xs"
                style={{ background: 'rgba(30,41,59,0.8)', color: '#64748b' }}>
                <Clock className="w-3 h-3" />
                {sessionLabel}
              </div>
              <button
                onClick={() => setShowDnaPanel(!showDnaPanel)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: showDnaPanel ? 'rgba(139,92,246,0.2)' : 'rgba(30,41,59,0.6)',
                  color: showDnaPanel ? '#c084fc' : '#64748b',
                  border: `1px solid ${showDnaPanel ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
                }}>
                <Radio className="w-3 h-3" />
                <span className="hidden sm:block">DNA</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── DNA info panel (collapsible) ────────────────────────────────── */}
        <AnimatePresence>
          {showDnaPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden px-3 pt-2"
            >
              <div className="max-w-2xl mx-auto rounded-2xl p-4 border"
                style={{ background: 'rgba(15,23,42,0.98)', borderColor: 'rgba(139,92,246,0.15)' }}>
                <p className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest mb-3">Viewer DNA Record</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { label: 'Device', value: `${device.type} · ${device.os}` },
                    { label: 'Browser', value: device.browser },
                    { label: 'Screen', value: device.screenResolution },
                    { label: 'Network', value: device.timezone },
                    ...(geo ? [
                      { label: 'Country', value: `${flagEmoji(geo.countryCode)} ${geo.country}` },
                      { label: 'State', value: geo.state },
                      { label: 'City', value: geo.city },
                      { label: 'Area', value: geo.area !== 'Unknown' ? geo.area : geo.district },
                    ] : [{ label: 'Location', value: 'Not captured' }]),
                    { label: 'Session', value: fmt(new Date(sessionStart)) },
                    { label: 'Visitor ID', value: visitorId.slice(0, 12) + '…' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg px-2.5 py-2"
                      style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      <p className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</p>
                      <p className="text-slate-300 text-[11px] font-semibold truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content area ────────────────────────────────────────────────── */}
        <div className="flex-1 px-3 py-3">
          <div className="max-w-2xl mx-auto h-full">
            <div className="rounded-2xl overflow-hidden border"
              style={{ background: 'rgba(10,15,28,0.98)', borderColor: 'rgba(255,255,255,0.05)' }}>

              {/* File header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b"
                style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.1)' }}>
                <Shield className="w-3.5 h-3.5 text-fuchsia-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-fuchsia-300 uppercase tracking-wide">PINIT DNA Protected</span>
                <span className="ml-auto text-[10px] text-slate-600 font-mono truncate max-w-[160px]">
                  #{token?.slice(-14)}
                </span>
              </div>

              {/* PDF viewer */}
              {isPdf && contentUrl && (
                <div onClick={(e) => e.stopPropagation()}>
                  <SecurePdfViewer
                    pdfData={contentUrl}
                    fileName={shareRow?.image_name || 'document.pdf'}
                    downloadEnabled={false}
                    activityUserId={shareRow?.user_id || ''}
                    activityShareId={token}
                  />
                </div>
              )}

              {/* Image viewer — also handles JPEG thumbnails for video/PDF previews */}
              {isImage && contentUrl && (
                <div className="relative flex items-center justify-center min-h-64 overflow-hidden"
                  style={{ background: 'rgba(5,10,20,0.98)' }}>
                  <img
                    src={contentUrl}
                    alt={shareRow?.image_name || 'Secure Document'}
                    className="max-w-full max-h-[65vh] object-contain"
                    onError={() => setImgError(true)}
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                    style={
                      isVideoFile || isPdfFile
                        ? { filter: 'blur(14px)', transform: 'scale(1.1)', WebkitUserDrag: 'none' } as React.CSSProperties
                        : { WebkitUserDrag: 'none' } as React.CSSProperties
                    }
                  />
                  {(isVideoFile || isPdfFile) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                      style={{ background: 'rgba(5,10,20,0.52)' }}>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        {isVideoFile
                          ? <Play className="w-6 h-6 text-purple-400" />
                          : <FileText className="w-6 h-6 text-purple-400" />}
                      </div>
                      <p className="text-slate-300 text-sm font-semibold text-center px-8 leading-snug">
                        {shareRow?.image_name || (isVideoFile ? 'Video' : 'Document')}
                      </p>
                      <p className="text-slate-500 text-xs">
                        {isVideoFile ? 'Request download to view full video' : 'Request download to access document'}
                      </p>
                    </div>
                  )}
                  <Watermark name={visitorName} />
                </div>
              )}

              {/* Video preview (blurred) */}
              {isVideo && contentUrl && (
                <div className="relative flex items-center justify-center overflow-hidden"
                  style={{ background: 'rgba(5,10,20,0.98)', minHeight: 220 }}>
                  <video
                    src={contentUrl}
                    preload="metadata"
                    muted
                    playsInline
                    className="max-w-full max-h-[55vh] object-contain"
                    style={{ filter: 'blur(14px)', transform: 'scale(1.08)', pointerEvents: 'none' }}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                    style={{ background: 'rgba(5,10,20,0.5)' }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <Lock className="w-6 h-6 text-purple-400" />
                    </div>
                    <p className="text-slate-300 text-sm font-semibold text-center px-8 leading-snug">
                      {shareRow?.image_name || 'Video'}
                    </p>
                    <p className="text-slate-500 text-xs">Request download to view full video</p>
                  </div>
                  <Watermark name={visitorName} />
                </div>
              )}

              {/* No content */}
              {!hasContent && (
                <div className="flex flex-col items-center justify-center p-12 gap-4"
                  style={{ background: 'rgba(5,10,20,0.98)', minHeight: 200 }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <Lock className="w-7 h-7 text-slate-700" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 text-sm font-semibold">{shareRow?.image_name || 'Secure Document'}</p>
                    <p className="text-slate-600 text-xs mt-1">Contact the owner for direct access</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Viewer info bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-3 pb-2">
          <div className="max-w-2xl mx-auto rounded-xl px-4 py-2.5 border flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ background: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.04)' }}>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <DeviceIcon type={device.type} />
              {device.os} · {device.browser}
            </span>
            {geo ? (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <MapPin className="w-3 h-3" />
                {flagEmoji(geo.countryCode)} {geo.city}{geo.state !== 'Unknown' ? `, ${geo.state}` : ''}, {geo.country}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Globe className="w-3 h-3" />
                Location not captured
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-slate-700 hidden sm:block">
              {fmt(new Date(sessionStart))}
            </span>
          </div>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-3 pb-3">
          <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={dlSent ? undefined : handleRequestDownload}
              disabled={dlSent || dlLoading || (downloadsRemaining !== null && downloadsRemaining <= 0)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all"
              style={{
                background: dlSent
                  ? 'rgba(16,185,129,0.1)'
                  : downloadsRemaining === 0
                  ? 'rgba(30,41,59,0.4)'
                  : 'rgba(37,99,235,0.1)',
                borderColor: dlSent
                  ? 'rgba(16,185,129,0.25)'
                  : downloadsRemaining === 0
                  ? 'rgba(71,85,105,0.3)'
                  : 'rgba(37,99,235,0.3)',
                color: dlSent ? '#34d399' : downloadsRemaining === 0 ? '#475569' : '#93c5fd',
              }}>
              <Download className="w-4 h-4" />
              {dlSent ? 'Requested ✓' : dlLoading ? 'Sending…' : downloadsRemaining === 0 ? 'Limit Reached' : 'Request Download'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setPhase('forward-modal')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all"
              style={{
                background: 'rgba(139,92,246,0.1)',
                borderColor: 'rgba(139,92,246,0.3)',
                color: '#c084fc',
              }}>
              <Send className="w-4 h-4" />
              Forward Link
            </motion.button>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 pb-4 text-center">
          <p className="text-slate-700 text-[10px]">
            🔒 Secured by PINIT DNA · Right-click disabled · All activity monitored
          </p>
        </div>

        {/* ── Toast notifications (top-right) ─────────────────────────────── */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
          </AnimatePresence>
        </div>

        {/* ── Forward modal ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {forwardModalOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
              onClick={() => { if (!forwardLink) { setPhase('viewing'); setForwardRecipient(''); } }}>
              <motion.div
                initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
                className="max-w-sm w-full rounded-2xl p-6 border"
                style={{ background: 'rgba(15,23,42,0.99)', borderColor: 'rgba(139,92,246,0.2)' }}
                onClick={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
                      <Send className="w-4 h-4 text-fuchsia-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-black text-sm">Forward DNA Link</h3>
                      <p className="text-slate-500 text-[10px]">Creates a unique tracked link</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setPhase('viewing'); setForwardRecipient(''); setForwardLink(''); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(30,41,59,0.8)', color: '#64748b' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="rounded-xl p-3 mb-4 border"
                  style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.15)' }}>
                  <p className="text-fuchsia-200/80 text-xs">
                    <Fingerprint className="w-3 h-3 inline mr-1 text-fuchsia-400" />
                    Each forward creates a <strong>new DNA-linked URL</strong>. The owner tracks the full chain: you → recipient.
                  </p>
                </div>

                {!forwardLink ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Recipient name or email"
                        value={forwardRecipient}
                        onChange={(e) => setForwardRecipient(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none border transition-all"
                        style={{ background: 'rgba(30,41,59,0.8)', borderColor: 'rgba(71,85,105,0.5)' }}
                      />
                    </div>
                    <motion.button
                      whileHover={forwardRecipient.trim() ? { scale: 1.02 } : {}}
                      whileTap={forwardRecipient.trim() ? { scale: 0.98 } : {}}
                      onClick={handleGenerateForward}
                      disabled={!forwardRecipient.trim() || forwardLoading}
                      className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                      style={{
                        background: forwardRecipient.trim()
                          ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                          : 'rgba(30,41,59,0.6)',
                        color: forwardRecipient.trim() ? '#fff' : '#475569',
                        cursor: forwardRecipient.trim() ? 'pointer' : 'not-allowed',
                      }}>
                      {forwardLoading ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                          className="w-4 h-4 rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />
                      ) : <Zap className="w-4 h-4" />}
                      {forwardLoading ? 'Generating DNA link…' : 'Generate Unique Link'}
                    </motion.button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl p-3 border flex items-start gap-2"
                      style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }}>
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="text-emerald-300 text-xs">New DNA link generated for <strong>{forwardRecipient}</strong></p>
                    </div>
                    <div className="rounded-xl p-3 border"
                      style={{ background: 'rgba(30,41,59,0.8)', borderColor: 'rgba(71,85,105,0.3)' }}>
                      <p className="text-[10px] text-slate-600 mb-1 uppercase tracking-wide">New DNA Share URL</p>
                      <p className="text-xs text-slate-300 font-mono break-all">{forwardLink}</p>
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={copyForwardLink}
                      className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all"
                      style={{
                        background: 'rgba(139,92,246,0.1)',
                        borderColor: 'rgba(139,92,246,0.3)',
                        color: '#c084fc',
                      }}>
                      <Copy className="w-4 h-4" />
                      {copied ? 'Copied!' : 'Copy Link'}
                    </motion.button>
                    <button onClick={() => { setForwardLink(''); setForwardRecipient(''); setPhase('viewing'); }}
                      className="w-full py-2 text-slate-600 text-xs hover:text-slate-400 transition-colors">
                      Done
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return <PINITLoader label="Preparing…" />;
};

export default SecureShareGate;
