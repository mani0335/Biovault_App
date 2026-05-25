/**
 * PortfolioShare.tsx
 * Advanced portfolio sharing UI — Supabase-backed clean token architecture.
 * Tokens: portfolio_{timestamp}_{rand6}   URL: /share/{token}
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, Link2, Copy, CheckCircle, Loader2,
  Globe, Lock, Clock, Download, Eye, Droplets, AlertCircle,
  MessageCircle, Mail, X, Smartphone, Camera, Shield, Trash2,
  RotateCcw, ChevronDown, ChevronUp, Users, Filter, MapPin,
} from 'lucide-react';
import { getPortfolioById } from '../../lib/portfolioService';
import {
  createShare,
  getOwnerShares,
  revokeShare,
  restoreShare,
  deleteShareRecord,
  type ExtendedShareSettings,
  type ShareRecord,
} from '../../lib/portfolioShareService';
import type { Portfolio } from '../../types/Portfolio';

/* ─── EXPIRY OPTIONS ─────────────────────────────────── */
const EXPIRY_OPTIONS = [
  { label: '1 hr',   hours: 1   },
  { label: '24 hr',  hours: 24  },
  { label: '7 days', hours: 168 },
  { label: '30 days',hours: 720 },
  { label: 'Never',  hours: 0   },
];

/* ─── COUNTRY LIST ───────────────────────────────────── */
const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'UAE' },
  { code: 'JP', name: 'Japan' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'IR', name: 'Ireland' },
];

/* ─── DEFAULT SETTINGS ───────────────────────────────── */
const DEFAULT_SETTINGS: ExtendedShareSettings = {
  mode:                'entire',
  selectedSections:    [],
  accessMode:          'view-only',
  expiryHours:         24,
  viewLimit:           null,
  watermark:           false,
  watermarkText:       'Confidential Shared Copy',
  screenshotProtection:false,
  deviceBound:         false,
  allowedCountry:      '',
};

/* ═══════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════ */
export default function PortfolioShare() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id }   = useParams<{ id: string }>();
  const userId   = localStorage.getItem('biovault_userId') ?? '';
  const userName = localStorage.getItem('biovault_userName')
    ?? JSON.parse(localStorage.getItem('userProfile') || '{}').name
    ?? 'Portfolio Owner';

  const [portfolio,        setPortfolio]        = useState<Portfolio | null>(
    (location.state as { portfolio?: Portfolio } | null)?.portfolio ?? null,
  );
  const [loadingPortfolio, setLoadingPortfolio] = useState(!portfolio);
  const [settings,         setSettings]         = useState<ExtendedShareSettings>(DEFAULT_SETTINGS);

  /* view limit custom input */
  const [viewLimitInput, setViewLimitInput] = useState('');
  const [viewLimitErr,   setViewLimitErr]   = useState('');

  /* custom expiry */
  const [customExpiry,   setCustomExpiry]   = useState('');

  /* generation state */
  const [generating,  setGenerating]  = useState(false);
  const [shareLink,   setShareLink]   = useState('');
  const [genError,    setGenError]    = useState('');
  const [copied,      setCopied]      = useState(false);
  const [toast,       setToast]       = useState('');

  /* active shares panel */
  const [myShares,       setMyShares]       = useState<ShareRecord[]>([]);
  const [showPanel,      setShowPanel]      = useState(false);
  const [loadingShares,  setLoadingShares]  = useState(false);
  const [deletingId,     setDeletingId]     = useState('');

  /* section filter panel */
  const [showSections,   setShowSections]   = useState(false);

  /* country dropdown */
  const [showCountries,  setShowCountries]  = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  /* ── load portfolio ── */
  useEffect(() => {
    if (portfolio || !id || !userId) { setLoadingPortfolio(false); return; }
    getPortfolioById(userId, id)
      .then(p => { if (p) setPortfolio(p); })
      .catch(() => {})
      .finally(() => setLoadingPortfolio(false));
  }, [id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── close country dropdown on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setShowCountries(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── load active shares ── */
  const loadShares = async () => {
    setLoadingShares(true);
    try {
      const shares = await getOwnerShares(userId);
      setMyShares(shares);
    } catch {
      // keep existing state on error
    } finally {
      setLoadingShares(false);
    }
  };

  useEffect(() => {
    if (showPanel) { loadShares(); }
  }, [showPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── compute the public-facing base URL (avoids localhost on Android WebView) ── */
  const getPublicBaseUrl = (): string => {
    const env = (import.meta as unknown as { env: Record<string, string> }).env;
    // VITE_PUBLIC_URL is preferred; skip if it points to the backend API
    const publicUrl = env?.VITE_PUBLIC_URL;
    if (publicUrl && !publicUrl.includes('onrender.com')) {
      return publicUrl.replace(/\/$/, '');
    }
    const origin = window.location.origin;
    // Android WebView / Capacitor — localhost is not shareable externally
    if (
      origin === 'http://localhost' ||
      origin === 'https://localhost' ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('file://')
    ) {
      // Fall back to backend domain — backend may serve frontend too
      return (env?.VITE_BACKEND_URL ?? 'https://biovault-backend-d13a.onrender.com').replace(/\/$/, '');
    }
    return origin;
  };

  /* ── generate share link ── */
  const handleGenerate = async () => {
    if (!portfolio || !userId) return;
    setGenerating(true);
    setGenError('');
    setShareLink('');

    try {
      const finalSettings: ExtendedShareSettings = {
        ...settings,
        selectedSections: settings.mode === 'entire' ? [] : settings.selectedSections,
      };
      // createShare() returns the full share URL (saved to Supabase)
      const link = await createShare(userId, userName, portfolio, finalSettings);
      setShareLink(link);
      await loadShares(); // refresh active shares list
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate link. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  /* ── copy link ── */
  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      snack('Link copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      snack('Long-press to copy manually');
    }
  };

  const handleWhatsApp = () => {
    if (!shareLink || !portfolio) return;
    const text = encodeURIComponent(`Check out my portfolio: ${portfolio.name}\n${shareLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmail = () => {
    if (!shareLink || !portfolio) return;
    const subject = encodeURIComponent(`Portfolio: ${portfolio.name}`);
    const body    = encodeURIComponent(`Hi,\n\nI'd like to share my portfolio with you.\n\nView here: ${shareLink}\n\nThanks!`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  /* ── active shares actions ── */
  const handleRevoke = async (shareId: string) => {
    await revokeShare(shareId);
    await loadShares();
    snack('Link revoked — recipients can no longer access it');
  };

  const handleRestore = async (shareId: string) => {
    await restoreShare(shareId);
    await loadShares();
    snack('Link restored');
  };

  const handleDelete = (shareId: string) => {
    setDeletingId(shareId);
    setTimeout(async () => {
      await deleteShareRecord(shareId);
      await loadShares();
      setDeletingId('');
      snack('Share record deleted');
    }, 300);
  };

  const handleCopyExisting = async (record: ShareRecord) => {
    // record.token is the clean share_id; build the share URL
    const base = getPublicBaseUrl();
    const link = `${base}/share/${record.token}`;
    try {
      await navigator.clipboard.writeText(link);
      snack('Link copied!');
    } catch {
      snack('Long-press to copy manually');
    }
  };

  /* ── section toggle ── */
  const toggleSection = (title: string) => {
    setSettings(s => ({
      ...s,
      selectedSections: s.selectedSections.includes(title)
        ? s.selectedSections.filter(t => t !== title)
        : [...s.selectedSections, title],
    }));
  };

  const snack = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  /* ── helpers ── */
  const expiryLabel = () => {
    if (settings.expiryHours === 0) return 'Never';
    const opt = EXPIRY_OPTIONS.find(o => o.hours === settings.expiryHours);
    return opt ? opt.label : `${settings.expiryHours}h`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return 'Never';
    return fmtDate(iso);
  };

  /* ── loading state ── */
  if (loadingPortfolio) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#07031a,#0d0520)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexDirection: 'column' }}>
        <Loader2 size={40} color="#8b5cf6" style={{ animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontSize: 15 }}>Loading portfolio…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#07031a,#0d0520)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <AlertCircle size={48} color="#f87171" />
        <p style={{ color: '#f87171', fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Portfolio not found</p>
        <button onClick={() => navigate('/portfolio')} style={{ padding: '10px 24px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 12, color: '#c4b5fd', fontWeight: 700, cursor: 'pointer' }}>
          Back to Portfolios
        </button>
      </div>
    );
  }

  /* ═══════════════════════════════════ RENDER ══ */
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#07031a 0%,#0d0520 35%,#130833 65%,#0d0520 100%)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* ambient glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -80, right: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.13) 0%,transparent 70%)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.10) 0%,transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      {/* ── HEADER ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', padding: '52px 16px 16px', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={20} color="#c4b5fd" />
        </button>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: 0, flex: 1, textAlign: 'center' }}>Share Portfolio</h1>
        <button
          onClick={() => setShowPanel(p => !p)}
          style={{ width: 42, height: 42, borderRadius: 13, background: showPanel ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.12)', border: `1px solid ${showPanel ? 'rgba(16,185,129,0.45)' : 'rgba(139,92,246,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title="Active shares"
        >
          <Users size={18} color={showPanel ? '#34d399' : '#c4b5fd'} />
        </button>
      </div>

      <div style={{ position: 'relative', zIndex: 10, padding: '0 16px 100px' }}>

        {/* ── PORTFOLIO INFO CARD ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(6,182,212,0.06))', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 18, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(135deg,#10b981,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}>
            <Share2 size={21} color="#fff" />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <p style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>SHARING</p>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{portfolio.name}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 20, padding: '3px 10px', flexShrink: 0, textTransform: 'capitalize' }}>
            {portfolio.type}
          </span>
        </motion.div>

        {/* ═══════════════ ACTIVE SHARES PANEL ═══════════════ */}
        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: 20 }}
            >
              <div style={{ background: 'linear-gradient(135deg,rgba(20,8,55,0.9),rgba(13,5,32,0.95))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 18, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={14} color="#34d399" />
                  </div>
                  <span style={{ color: '#d1fae5', fontWeight: 800, fontSize: 14 }}>Active Shares</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '2px 8px' }}>
                    {myShares.filter(s => s.portfolioId === portfolio.id).length}
                  </span>
                </div>

                {loadingShares ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                    <Loader2 size={22} color="#6b7280" style={{ animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : myShares.filter(s => s.portfolioId === portfolio.id).length === 0 ? (
                  <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: '16px 0', margin: 0 }}>No active shares for this portfolio</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {myShares
                      .filter(s => s.portfolioId === portfolio.id)
                      .map(rec => (
                        <motion.div
                          key={rec.shareId}
                          animate={deletingId === rec.shareId ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }}
                          style={{ background: rec.isRevoked ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${rec.isRevoked ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)'}`, borderRadius: 14, padding: '12px 14px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: rec.isRevoked ? '#f87171' : (rec.expiresAt && new Date(rec.expiresAt) < new Date() ? '#fbbf24' : '#34d399'), flexShrink: 0 }} />
                            <span style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 700, flex: 1 }}>
                              {rec.isRevoked ? 'REVOKED' : (rec.expiresAt && new Date(rec.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE')}
                            </span>
                            <span style={{ color: '#6b7280', fontSize: 11 }}>
                              Created {fmtDate(rec.createdAt)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                            <MiniTag color="#60a5fa">{rec.settings.accessMode === 'download' ? 'Download OK' : 'View-only'}</MiniTag>
                            <MiniTag color="#fbbf24">Expires: {fmtExpiry(rec.expiresAt)}</MiniTag>
                            {rec.settings.viewLimit !== null && <MiniTag color="#a78bfa">{rec.settings.viewLimit} view limit</MiniTag>}
                            {rec.settings.deviceBound && <MiniTag color="#fb923c">Device-bound</MiniTag>}
                            {rec.settings.allowedCountry && <MiniTag color="#34d399">{rec.settings.allowedCountry} only</MiniTag>}
                            {rec.settings.mode === 'selected' && <MiniTag color="#818cf8">{rec.settings.selectedSections.length} sections</MiniTag>}
                          </div>

                          <div style={{ display: 'flex', gap: 6 }}>
                            {!rec.isRevoked && (
                              <button
                                onClick={() => handleCopyExisting(rec)}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 9, color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                <Copy size={11} /> Copy Link
                              </button>
                            )}
                            {!rec.isRevoked ? (
                              <button
                                onClick={() => handleRevoke(rec.shareId)}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                <Lock size={11} /> Revoke
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestore(rec.shareId)}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 9, color: '#34d399', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                <RotateCcw size={11} /> Restore
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(rec.shareId)}
                              style={{ width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 0', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 9, color: '#f87171', fontSize: 11, cursor: 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </motion.div>
                      ))
                    }
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═════════════ SECTION LABEL ══════════════ */}
        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, margin: '0 0 10px', letterSpacing: 0.8 }}>CONFIGURE NEW SHARE LINK</p>

        {/* ─── SCOPE: Entire / Selected ─── */}
        <SettingCard icon={Filter} iconColor="#a78bfa" label="What to Share" description="Entire portfolio or specific sections only">
          <div style={{ display: 'flex', gap: 8, marginBottom: settings.mode === 'selected' ? 12 : 0 }}>
            {(['entire', 'selected'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSettings(s => ({ ...s, mode: m }))}
                style={{ flex: 1, padding: '8px 0', background: settings.mode === m ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${settings.mode === m ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 11, color: settings.mode === m ? '#c4b5fd' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize' }}
              >
                {m === 'entire' ? '📄 Entire Portfolio' : '🔍 Selected Sections'}
              </button>
            ))}
          </div>

          {/* section checkboxes */}
          <AnimatePresence>
            {settings.mode === 'selected' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div>
                  <button
                    onClick={() => setShowSections(p => !p)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(167,139,250,0.06)', border: '1px dashed rgba(167,139,250,0.3)', borderRadius: 10, cursor: 'pointer', color: '#a78bfa', fontSize: 13, fontWeight: 600 }}
                  >
                    <span>
                      {settings.selectedSections.length === 0
                        ? 'Tap to select sections'
                        : `${settings.selectedSections.length} section${settings.selectedSections.length > 1 ? 's' : ''} selected`}
                    </span>
                    {showSections ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  <AnimatePresence>
                    {showSections && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {portfolio.sections.map(s => {
                            const isChecked = settings.selectedSections.includes(s.title);
                            return (
                              <button
                                key={s.title}
                                onClick={() => toggleSection(s.title)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: isChecked ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isChecked ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: 5, background: isChecked ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${isChecked ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {isChecked && <CheckCircle size={11} color="#fff" />}
                                </div>
                                <span style={{ color: isChecked ? '#c4b5fd' : '#9ca3af', fontSize: 13, fontWeight: 600, flex: 1 }}>{s.title}</span>
                                {(s.documents?.length > 0 || s.content) && (
                                  <span style={{ fontSize: 10, color: '#6b7280' }}>
                                    {s.documents?.length > 0 ? `${s.documents.length} docs` : 'text'}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SettingCard>

        {/* ─── ACCESS MODE ─── */}
        <SettingCard icon={Download} iconColor="#34d399" label="Access Mode" description="What the recipient can do with your portfolio">
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'view-only' as const, label: '👁 View Only', desc: 'No download' },
              { value: 'download'  as const, label: '⬇ Download OK', desc: 'Full access' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setSettings(s => ({ ...s, accessMode: opt.value }))}
                style={{ flex: 1, padding: '9px 4px', background: settings.accessMode === opt.value ? (opt.value === 'download' ? 'rgba(52,211,153,0.18)' : 'rgba(96,165,250,0.15)') : 'rgba(255,255,255,0.04)', border: `1.5px solid ${settings.accessMode === opt.value ? (opt.value === 'download' ? 'rgba(52,211,153,0.5)' : 'rgba(96,165,250,0.5)') : 'rgba(255,255,255,0.1)'}`, borderRadius: 11, cursor: 'pointer', transition: 'all 0.15s' }}
              >
                <p style={{ color: settings.accessMode === opt.value ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 700, margin: 0 }}>{opt.label}</p>
                <p style={{ color: settings.accessMode === opt.value ? '#9ca3af' : '#4b5563', fontSize: 11, margin: '2px 0 0' }}>{opt.desc}</p>
              </button>
            ))}
          </div>
        </SettingCard>

        {/* ─── EXPIRY ─── */}
        <SettingCard icon={Clock} iconColor="#60a5fa" label="Link Expires" description="Auto-expire after a duration">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXPIRY_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => { setSettings(s => ({ ...s, expiryHours: opt.hours })); setCustomExpiry(''); }}
                style={{ padding: '6px 12px', background: settings.expiryHours === opt.hours && !customExpiry ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${settings.expiryHours === opt.hours && !customExpiry ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, color: settings.expiryHours === opt.hours && !customExpiry ? '#93c5fd' : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {opt.label}
              </button>
            ))}
            {/* Custom hours input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input
                type="number"
                min="1"
                placeholder="Custom hr"
                value={customExpiry}
                onChange={e => {
                  setCustomExpiry(e.target.value);
                  const h = parseInt(e.target.value, 10);
                  if (!isNaN(h) && h > 0) setSettings(s => ({ ...s, expiryHours: h }));
                }}
                style={{ width: 76, padding: '5px 8px', background: customExpiry ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${customExpiry ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, color: customExpiry ? '#93c5fd' : '#6b7280', fontSize: 12, fontWeight: 700, outline: 'none', textAlign: 'center' }}
              />
            </div>
          </div>
        </SettingCard>

        {/* ─── VIEW LIMIT ─── */}
        <SettingCard icon={Eye} iconColor="#fbbf24" label="View Limit" description="Max number of times this link can be opened">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ToggleSwitch
                on={settings.viewLimit === null}
                onLabel="Unlimited"
                offLabel="Custom limit"
                onChange={v => {
                  if (v) { setSettings(s => ({ ...s, viewLimit: null })); setViewLimitInput(''); setViewLimitErr(''); }
                  else { setSettings(s => ({ ...s, viewLimit: 10 })); setViewLimitInput('10'); }
                }}
                onColor="#fbbf24"
              />
            </div>

            {settings.viewLimit !== null && (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number" min="1" placeholder="e.g. 20"
                    value={viewLimitInput}
                    onChange={e => {
                      const raw = e.target.value;
                      setViewLimitInput(raw);
                      const num = parseInt(raw, 10);
                      if (!raw) { setViewLimitErr('Enter a number'); }
                      else if (isNaN(num) || num < 1) { setViewLimitErr('Must be ≥ 1'); }
                      else { setViewLimitErr(''); setSettings(s => ({ ...s, viewLimit: num })); }
                    }}
                    style={{ flex: 1, background: 'rgba(251,191,36,0.07)', border: `1.5px solid ${viewLimitErr ? 'rgba(239,68,68,0.5)' : 'rgba(251,191,36,0.35)'}`, borderRadius: 10, padding: '9px 12px', color: '#fde68a', fontSize: 15, fontWeight: 700, outline: 'none' }}
                  />
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>views</span>
                </div>
                {viewLimitErr
                  ? <p style={{ color: '#f87171', fontSize: 12, margin: '5px 0 0', fontWeight: 600 }}>{viewLimitErr}</p>
                  : settings.viewLimit && !viewLimitErr
                    ? <p style={{ color: '#6b7280', fontSize: 12, margin: '5px 0 0' }}>Link stops after <b style={{ color: '#fde68a' }}>{settings.viewLimit}</b> view{settings.viewLimit > 1 ? 's' : ''}</p>
                    : null
                }
              </div>
            )}
          </div>
        </SettingCard>

        {/* ─── GEO RESTRICTION ─── */}
        <SettingCard icon={MapPin} iconColor="#34d399" label="Location Restriction" description="Restrict access to a specific country">
          <div ref={countryRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCountries(p => !p)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: settings.allowedCountry ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${settings.allowedCountry ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, cursor: 'pointer', color: settings.allowedCountry ? '#6ee7b7' : '#6b7280', fontSize: 13, fontWeight: 700 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={14} color={settings.allowedCountry ? '#34d399' : '#6b7280'} />
                {settings.allowedCountry
                  ? `${COUNTRIES.find(c => c.code === settings.allowedCountry)?.name ?? settings.allowedCountry} only`
                  : 'No restriction (worldwide)'}
              </div>
              {showCountries ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <AnimatePresence>
              {showCountries && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'rgba(13,5,40,0.98)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 14, overflow: 'hidden', zIndex: 50, maxHeight: 240, overflowY: 'auto' }}
                >
                  <button
                    onClick={() => { setSettings(s => ({ ...s, allowedCountry: '' })); setShowCountries(false); }}
                    style={{ width: '100%', padding: '10px 14px', background: !settings.allowedCountry ? 'rgba(52,211,153,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', color: '#34d399', fontSize: 13, fontWeight: 700, textAlign: 'left' }}
                  >
                    🌍 No restriction (worldwide)
                  </button>
                  {COUNTRIES.map(c => (
                    <button
                      key={c.code}
                      onClick={() => { setSettings(s => ({ ...s, allowedCountry: c.code })); setShowCountries(false); }}
                      style={{ width: '100%', padding: '10px 14px', background: settings.allowedCountry === c.code ? 'rgba(52,211,153,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: settings.allowedCountry === c.code ? '#6ee7b7' : '#9ca3af', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
                    >
                      {c.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SettingCard>

        {/* ─── DEVICE BOUND ─── */}
        <SettingCard icon={Smartphone} iconColor="#fb923c" label="Device-Bound Access" description="Link works only on the first device that opens it">
          <ToggleSwitch
            on={settings.deviceBound}
            onLabel="Enabled — 1 device only"
            offLabel="Any device"
            onChange={v => setSettings(s => ({ ...s, deviceBound: v }))}
            onColor="#fb923c"
          />
          {settings.deviceBound && (
            <p style={{ color: '#78350f', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
              ⚠️ The first person to open this link will bind it to their device. Others will be blocked.
            </p>
          )}
        </SettingCard>

        {/* ─── SCREENSHOT PROTECTION ─── */}
        <SettingCard icon={Camera} iconColor="#f472b6" label="Screenshot Protection" description="Blur the portfolio when the app loses focus">
          <ToggleSwitch
            on={settings.screenshotProtection}
            onLabel="On — content blurs on exit"
            offLabel="Off"
            onChange={v => setSettings(s => ({ ...s, screenshotProtection: v }))}
            onColor="#f472b6"
          />
        </SettingCard>

        {/* ─── WATERMARK ─── */}
        <SettingCard icon={Droplets} iconColor="#38bdf8" label="Watermark Protection" description="Overlay text watermark on the shared portfolio">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleSwitch
              on={settings.watermark}
              onLabel="Watermark On"
              offLabel="No Watermark"
              onChange={v => setSettings(s => ({ ...s, watermark: v }))}
              onColor="#38bdf8"
            />
            {settings.watermark && (
              <input
                type="text"
                placeholder="Watermark text…"
                value={settings.watermarkText}
                onChange={e => setSettings(s => ({ ...s, watermarkText: e.target.value }))}
                style={{ padding: '9px 14px', background: 'rgba(56,189,248,0.07)', border: '1.5px solid rgba(56,189,248,0.35)', borderRadius: 10, color: '#bae6fd', fontSize: 13, fontWeight: 600, outline: 'none' }}
              />
            )}
          </div>
        </SettingCard>

        {/* ═════════════ GENERATE BUTTON ═════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginTop: 22 }}>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleGenerate}
            disabled={generating || (settings.mode === 'selected' && settings.selectedSections.length === 0)}
            style={{ width: '100%', padding: '17px 0', background: generating ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#10b981,#06b6d4)', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 800, fontSize: 17, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: generating ? 'none' : '0 0 32px rgba(16,185,129,0.4),0 4px 16px rgba(0,0,0,0.4)', transition: 'all 0.2s', opacity: (settings.mode === 'selected' && settings.selectedSections.length === 0) ? 0.5 : 1 }}
          >
            {generating
              ? <><Loader2 size={20} color="#fff" style={{ animation: 'spin 0.8s linear infinite' }} /> Generating Link…</>
              : <><Link2 size={20} color="#fff" /> Generate Secure Link</>
            }
          </motion.button>
          {settings.mode === 'selected' && settings.selectedSections.length === 0 && (
            <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', margin: '8px 0 0' }}>Select at least one section above</p>
          )}
        </motion.div>

        {/* ── GENERATION ERROR ── */}
        <AnimatePresence>
          {genError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}
            >
              <AlertCircle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>Generation failed</p>
                <p style={{ color: '#f87171', fontSize: 12, margin: 0, lineHeight: 1.5 }}>{genError}</p>
              </div>
              <button onClick={() => setGenError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <X size={14} color="#f87171" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SHARE LINK RESULT ── */}
        <AnimatePresence>
          {shareLink && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ marginTop: 20 }}
            >
              {/* link box */}
              <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(6,182,212,0.06))', border: '1.5px solid rgba(16,185,129,0.35)', borderRadius: 18, padding: '16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <CheckCircle size={16} color="#34d399" />
                  <p style={{ color: '#34d399', fontSize: 13, fontWeight: 700, margin: 0 }}>Secure link generated!</p>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Link2 size={13} color="#6b7280" style={{ flexShrink: 0 }} />
                  <p style={{ color: '#9ca3af', fontSize: 11, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {shareLink}
                  </p>
                </div>

                {/* summary badges */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <Badge color="#60a5fa"><Clock size={9} /> {expiryLabel()}</Badge>
                  <Badge color={settings.accessMode === 'download' ? '#34d399' : '#60a5fa'}>
                    {settings.accessMode === 'download' ? '⬇ Download OK' : '👁 View-only'}
                  </Badge>
                  {settings.viewLimit !== null && <Badge color="#fbbf24"><Eye size={9} /> {settings.viewLimit} views</Badge>}
                  {settings.watermark && <Badge color="#38bdf8"><Droplets size={9} /> Watermark</Badge>}
                  {settings.screenshotProtection && <Badge color="#f472b6"><Camera size={9} /> Screenshot lock</Badge>}
                  {settings.deviceBound && <Badge color="#fb923c"><Smartphone size={9} /> Device-bound</Badge>}
                  {settings.allowedCountry && <Badge color="#34d399"><MapPin size={9} /> {settings.allowedCountry} only</Badge>}
                  {settings.mode === 'selected' && <Badge color="#a78bfa"><Filter size={9} /> {settings.selectedSections.length} sections</Badge>}
                </div>
              </div>

              {/* share action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <ActionShareBtn icon={copied ? CheckCircle : Copy} label={copied ? 'Copied!' : 'Copy Link'} color={copied ? '#34d399' : '#60a5fa'} bg={copied ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.10)'} border={copied ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.3)'} onClick={handleCopy} />
                <ActionShareBtn icon={MessageCircle} label="WhatsApp" color="#34d399" bg="rgba(16,185,129,0.10)" border="rgba(16,185,129,0.3)" onClick={handleWhatsApp} />
                <ActionShareBtn icon={Mail} label="Email" color="#a78bfa" bg="rgba(139,92,246,0.10)" border="rgba(139,92,246,0.3)" onClick={handleEmail} />
              </div>

              {/* security note */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
                <Shield size={12} color="#6b7280" />
                <span style={{ color: '#4b5563', fontSize: 11 }}>Secured by BioVault · Cloud-backed token · Globally accessible</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.9)', backdropFilter: 'blur(12px)', borderRadius: 30, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 700, zIndex: 300, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════ SUB-COMPONENTS ══════════════════════ */

function SettingCard({
  icon: Icon, iconColor, label, description, children,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  iconColor: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(20,8,55,0.85),rgba(13,5,32,0.9))', border: '1px solid rgba(139,92,246,0.14)', borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${iconColor}16`, border: `1px solid ${iconColor}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={iconColor} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14, margin: 0 }}>{label}</p>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0' }}>{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({
  on, onLabel, offLabel, onChange, onColor = '#10b981',
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onChange: (v: boolean) => void;
  onColor?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={() => onChange(!on)}
        style={{ width: 52, height: 28, borderRadius: 14, background: on ? `linear-gradient(135deg,${onColor},${onColor}cc)` : 'rgba(255,255,255,0.1)', border: `1.5px solid ${on ? onColor + '80' : 'rgba(255,255,255,0.15)'}`, position: 'relative', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 3, left: on ? 26 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
      </button>
      <span style={{ color: on ? onColor : '#6b7280', fontSize: 13, fontWeight: 700 }}>
        {on ? onLabel : offLabel}
      </span>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color, background: `${color}16`, border: `1px solid ${color}30`, borderRadius: 20, padding: '3px 8px' }}>
      {children}
    </span>
  );
}

function MiniTag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, color, background: `${color}14`, border: `1px solid ${color}28`, borderRadius: 20, padding: '2px 7px' }}>
      {children}
    </span>
  );
}

function ActionShareBtn({
  icon: Icon, label, color, bg, border, onClick,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px', background: bg, border: `1.5px solid ${border}`, borderRadius: 14, cursor: 'pointer' }}
    >
      <Icon size={18} color={color} />
      <span style={{ color, fontSize: 11, fontWeight: 700 }}>{label}</span>
    </motion.button>
  );
}
