/**
 * SharedPortfolioPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a publicly-shared portfolio fetched from Supabase via clean token.
 * URL: /share/portfolio_{timestamp}_{rand6}
 *
 * Supports:
 *   • Expiry validation         • View-limit enforcement
 *   • Revocation check          • Device-bound access
 *   • Geo-country restriction   • Watermark overlay
 *   • Screenshot-blur protection • Section filtering
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, Lock, Clock, AlertTriangle,
  FileText, Image, File, ChevronDown, ChevronUp,
  User, GraduationCap, Briefcase, Award, BookOpen,
  FolderOpen, Star, CreditCard, Target, Globe,
  DollarSign, MoreHorizontal, BookMarked, Camera, Phone,
  Layers, MapPin, Smartphone, Droplets,
} from 'lucide-react';
import {
  loadShare, checkGeoAccess,
  type ShareRecord,
} from '../../lib/portfolioShareService';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPE HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/** Runtime section shape (includes content even though TS type omits it) */
interface RichSection {
  title: string;
  content?: string;
  documents?: string[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */

const TYPE_META: Record<string, {
  label: string; gradient: string; glow: string; border: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}> = {
  personal:     { label: 'Personal Portfolio',                 gradient: 'linear-gradient(135deg,#06b6d4,#3b82f6)', glow: 'rgba(6,182,212,0.3)',   border: 'rgba(6,182,212,0.4)',   icon: User         },
  academic:     { label: 'Academic Portfolio',                 gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', glow: 'rgba(139,92,246,0.3)',  border: 'rgba(139,92,246,0.45)', icon: GraduationCap},
  professional: { label: 'Professional / Placement Portfolio', gradient: 'linear-gradient(135deg,#10b981,#14b8a6)', glow: 'rgba(16,185,129,0.3)',  border: 'rgba(16,185,129,0.4)',  icon: Briefcase    },
  placement:    { label: 'Placement Portfolio',                gradient: 'linear-gradient(135deg,#10b981,#14b8a6)', glow: 'rgba(16,185,129,0.3)',  border: 'rgba(16,185,129,0.4)',  icon: Briefcase    },
  masters:      { label: 'Masters Portfolio',                  gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', glow: 'rgba(245,158,11,0.3)',  border: 'rgba(245,158,11,0.4)',  icon: Award        },
};

const SECTION_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  'About Me': User, 'Professional Summary': User, 'Skills': Star,
  'Projects': FolderOpen, 'Achievements': Award, 'Publications': Layers,
  'Experience': Briefcase, 'Work Experience': Briefcase, 'Education': GraduationCap,
  'Research Interests': BookOpen, 'Research': BookOpen, 'Contact Info': Phone,
  'Resume': FileText, 'Resume / CV': FileText, 'Certifications': Award,
  'Certificates': Award, 'Personal Documents': FolderOpen, 'Documents': FolderOpen,
  'Others If Any': MoreHorizontal, 'Others': MoreHorizontal,
  'Offer Letters': BookMarked, 'Internship Documents': Briefcase, 'Internships': Briefcase,
  'Work Proof Images': Camera, 'Personal Proofs': CreditCard,
  'Academic': BookMarked, 'Main Entrance Exams': Target,
  'Language Entrance Tests': Globe, 'Financial': DollarSign,
};
const SECTION_COLOR: Record<string, string> = {
  'About Me': '#38bdf8', 'Professional Summary': '#38bdf8',
  'Skills': '#a78bfa', 'Projects': '#34d399', 'Achievements': '#fbbf24',
  'Publications': '#60a5fa', 'Experience': '#34d399', 'Work Experience': '#34d399',
  'Education': '#a78bfa', 'Research Interests': '#34d399', 'Research': '#34d399',
  'Contact Info': '#60a5fa', 'Resume': '#fb923c', 'Resume / CV': '#f472b6',
  'Certifications': '#fbbf24', 'Certificates': '#fbbf24',
  'Personal Documents': '#818cf8', 'Documents': '#818cf8',
  'Offer Letters': '#818cf8', 'Internship Documents': '#34d399', 'Internships': '#34d399',
  'Work Proof Images': '#fb923c', 'Personal Proofs': '#60a5fa',
  'Academic': '#818cf8', 'Main Entrance Exams': '#ef4444',
  'Language Entrance Tests': '#06b6d4', 'Financial': '#fbbf24',
  'Others If Any': '#9ca3af', 'Others': '#9ca3af',
};

function getSectionIcon(title: string) {
  return SECTION_ICON[title] ?? FileText;
}
function getSectionColor(title: string) {
  return SECTION_COLOR[title] ?? '#8b5cf6';
}

/* ═══════════════════════════════════════════════════════════════════════════
   WATERMARK
═══════════════════════════════════════════════════════════════════════════ */
function WatermarkOverlay({ text }: { text: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden', userSelect: 'none' }} aria-hidden>
      {Array.from({ length: 7 }, (_, row) =>
        Array.from({ length: 4 }, (__, col) => (
          <div
            key={`${row}-${col}`}
            style={{
              position: 'absolute',
              top: `${row * 15}%`,
              left: `${col * 28}%`,
              transform: 'rotate(-30deg)',
              color: 'rgba(255,255,255,0.04)',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
            }}
          >
            {text}
          </div>
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREENSHOT PROTECTION HOOK
═══════════════════════════════════════════════════════════════════════════ */
function useScreenshotProtection(enabled: boolean) {
  const [blurred, setBlurred] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) { setBlurred(true); setTimeout(() => setBlurred(false), 2500); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key))
      ) { setBlurred(true); setTimeout(() => setBlurred(false), 3000); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
  return blurred;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION RENDERER
═══════════════════════════════════════════════════════════════════════════ */
function SectionCard({ section, viewOnly, idx }: { section: RichSection; viewOnly: boolean; idx: number }) {
  const [open, setOpen] = useState(true);
  const Icon = getSectionIcon(section.title);
  const color = getSectionColor(section.title);
  const hasContent = section.content && section.content.trim();
  const hasDocs = (section.documents?.length ?? 0) > 0;

  // Smart render: if content has \n-separated lines → list, otherwise paragraph
  const contentLines = hasContent
    ? section.content!.split('\n').map(l => l.trim()).filter(Boolean)
    : [];
  const isListContent = contentLines.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + idx * 0.03 }}
      style={{
        background: 'linear-gradient(135deg,rgba(20,8,55,0.85),rgba(13,5,32,0.92))',
        border: `1px solid ${open ? `${color}33` : 'rgba(139,92,246,0.15)'}`,
        borderRadius: 16, overflow: 'hidden', marginBottom: 10,
        boxShadow: open ? `0 0 20px ${color}10` : 'none',
        transition: 'border-color 0.2s',
      }}
    >
      {/* header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1e`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14 }}>{section.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasDocs && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f472b6', background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.22)', borderRadius: 20, padding: '2px 7px' }}>
              {section.documents!.length} doc{section.documents!.length > 1 ? 's' : ''}
            </span>
          )}
          {contentLines.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: 20, padding: '2px 7px' }}>
              {isListContent ? `${contentLines.length} items` : 'text'}
            </span>
          )}
          {open ? <ChevronUp size={15} color="#6b7280" /> : <ChevronDown size={15} color="#6b7280" />}
        </div>
      </button>

      {/* body */}
      <AnimatePresence>
        {open && (hasContent || hasDocs) && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(139,92,246,0.1)' }}>

              {/* Text / List content */}
              {hasContent && !isListContent && (
                <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.7, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>
                  {section.content!.trim()}
                </p>
              )}
              {hasContent && isListContent && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contentLines.map((line, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: `${color}0d`, border: `1px solid ${color}22`, borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, marginTop: 7, flexShrink: 0 }} />
                      <span style={{ color: '#e5e7eb', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{line}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Vault documents indicator */}
              {hasDocs && (
                <div style={{ marginTop: hasContent ? 12 : 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(244,114,182,0.06)', border: '1px dashed rgba(244,114,182,0.3)', borderRadius: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(244,114,182,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {viewOnly ? <Eye size={15} color="#f472b6" /> : <FileText size={15} color="#f472b6" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#f9a8d4', fontSize: 13, fontWeight: 700, margin: 0 }}>
                        {section.documents!.length} Secure Document{section.documents!.length > 1 ? 's' : ''} Attached
                      </p>
                      <p style={{ color: '#9ca3af', fontSize: 11, margin: '2px 0 0' }}>
                        {viewOnly ? 'View-only access — protected by owner' : 'Stored in encrypted vault'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty section */}
              {!hasContent && !hasDocs && (
                <p style={{ color: '#4b5563', fontSize: 13, margin: '12px 0 0', fontStyle: 'italic' }}>No content in this section</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ERROR SCREEN
═══════════════════════════════════════════════════════════════════════════ */
function ErrorScreen({ icon: Icon, title, message, color }: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string; message: string; color: string;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#07031a,#0d0520)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: `${color}18`, border: `1.5px solid ${color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon size={32} color={color} />
        </div>
        <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>{title}</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{message}</p>
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Shield size={12} color="#4b5563" />
          <span style={{ color: '#4b5563', fontSize: 11 }}>Secured by BioVault sharing system</span>
        </div>
      </motion.div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
type PageState = 'loading' | 'geo_checking' | 'loaded' | 'error';
type ErrorKind = 'expired' | 'revoked' | 'view_limit' | 'device_mismatch' | 'geo' | 'invalid';

export default function SharedPortfolioPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [record, setRecord] = useState<ShareRecord | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('invalid');
  const [errorMsg, setErrorMsg] = useState('');
  const deviceFingerprintRef = useRef('');

  /* ── screenshot protection ── */
  const isBlurred = useScreenshotProtection(
    record?.settings.screenshotProtection ?? false
  );

  /* ── build device fingerprint on mount ── */
  useEffect(() => {
    const parts = [
      navigator.userAgent, navigator.language,
      screen.width, screen.height, screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ];
    let hash = 0;
    const str = parts.join('|');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    deviceFingerprintRef.current = Math.abs(hash).toString(36);
  }, []);

  /* ── main load flow ── */
  useEffect(() => {
    if (!token) { setErrorKind('invalid'); setErrorMsg('Invalid share link.'); setState('error'); return; }

    let cancelled = false;

    async function doLoad() {
      const result = await loadShare(token!);
      if (cancelled) return;

      if (result.status !== 'ok') {
        setErrorKind(result.status as ErrorKind);
        setErrorMsg(result.message);
        setRecord(result.record);
        setState('error');
        return;
      }

      const rec = result.record!;

      // Geo check
      if (rec.settings.allowedCountry) {
        setState('geo_checking');
        const allowed = await checkGeoAccess(rec.settings.allowedCountry);
        if (cancelled) return;
        if (!allowed) {
          setErrorKind('geo');
          setErrorMsg(`This portfolio is restricted to viewers in ${rec.settings.allowedCountry}. Access denied from your current location.`);
          setState('error');
        } else {
          setRecord(rec);
          setState('loaded');
        }
      } else {
        setRecord(rec);
        setState('loaded');
      }
    }

    doLoad();
    return () => { cancelled = true; };
  }, [token]);

  /* ─────────────────────── LOADING ─────────────────────── */
  if (state === 'loading' || state === 'geo_checking') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#07031a,#0d0520)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(139,92,246,0.2)', borderTop: '3px solid #8b5cf6', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontSize: 14 }}>
          {state === 'geo_checking' ? 'Verifying location access…' : 'Loading shared portfolio…'}
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  /* ─────────────────────── ERRORS ─────────────────────── */
  if (state === 'error') {
    const configs: Record<ErrorKind, { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; color: string }> = {
      expired:        { icon: Clock,         title: 'Link Expired',        color: '#fbbf24' },
      revoked:        { icon: Lock,          title: 'Access Revoked',      color: '#f87171' },
      view_limit:     { icon: Eye,           title: 'View Limit Reached',  color: '#fb923c' },
      device_mismatch:{ icon: Smartphone,    title: 'Device Restricted',   color: '#fb923c' },
      geo:            { icon: MapPin,        title: 'Location Restricted', color: '#f87171' },
      invalid:        { icon: AlertTriangle, title: 'Invalid Link',        color: '#9ca3af' },
    };
    const cfg = configs[errorKind];
    return <ErrorScreen icon={cfg.icon} title={cfg.title} message={errorMsg} color={cfg.color} />;
  }

  /* ─────────────────────── LOADED ─────────────────────── */
  if (!record) return null;

  const { portfolio, settings, ownerName, expiresAt } = record;
  const meta = TYPE_META[portfolio.type] ?? TYPE_META.personal;
  const TypeIcon = meta.icon;
  const sections = (portfolio.sections ?? []) as unknown as RichSection[];
  const viewOnly = settings.accessMode === 'view-only';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#07031a 0%,#0d0520 35%,#130833 65%,#0d0520 100%)',
      filter: isBlurred ? 'blur(24px)' : 'none',
      transition: 'filter 0.3s',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.3);border-radius:2px}`}</style>

      {/* Screenshot-protection overlay */}
      {isBlurred && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <Shield size={40} color="#8b5cf6" />
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Screenshot Protection Active</p>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Content is secured by the owner</p>
        </div>
      )}

      {/* Watermark */}
      {settings.watermark && (
        <WatermarkOverlay text={settings.watermarkText || 'Confidential — Shared Copy'} />
      )}

      {/* ambient blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle,${meta.glow},transparent 70%)`, filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -30, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.10),transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      {/* ── STICKY HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(7,3,26,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(139,92,246,0.15)', padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color="#8b5cf6" />
            <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {portfolio.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {viewOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 20 }}>
                <Eye size={10} color="#60a5fa" />
                <span style={{ color: '#93c5fd', fontSize: 10, fontWeight: 700 }}>View Only</span>
              </div>
            )}
            {settings.watermark && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 20 }}>
                <Droplets size={10} color="#38bdf8" />
                <span style={{ color: '#7dd3fc', fontSize: 10, fontWeight: 700 }}>Protected</span>
              </div>
            )}
            {settings.screenshotProtection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(244,114,182,0.10)', border: '1px solid rgba(244,114,182,0.25)', borderRadius: 20 }}>
                <Camera size={10} color="#f472b6" />
                <span style={{ color: '#f9a8d4', fontSize: 10, fontWeight: 700 }}>Screen Lock</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 640, margin: '0 auto', padding: '20px 16px 100px' }}>

        {/* Portfolio hero card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: `linear-gradient(135deg,rgba(20,8,55,0.9),rgba(13,5,32,0.95))`, border: `1.5px solid ${meta.border}`, borderRadius: 20, padding: '18px 16px', marginBottom: 20, boxShadow: `0 0 40px ${meta.glow}` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: meta.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 20px ${meta.glow}` }}>
              <TypeIcon size={24} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 2px', fontWeight: 600, letterSpacing: 0.5 }}>PORTFOLIO</p>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 18, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{portfolio.name}</p>
              <p style={{ color: '#9ca3af', fontSize: 12, margin: '3px 0 0' }}>Shared by <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{ownerName}</span></p>
            </div>
          </div>

          {/* Type & security badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 20, padding: '3px 10px', textTransform: 'capitalize' }}>
              {meta.label}
            </span>
            {expiresAt && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#fde68a', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '3px 10px' }}>
                <Clock size={9} color="#fbbf24" /> Expires {new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {settings.mode === 'selected' && settings.selectedSections.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 20, padding: '3px 10px' }}>
                {settings.selectedSections.length} sections shared
              </span>
            )}
            {settings.deviceBound && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 20, padding: '3px 10px' }}>
                <Smartphone size={9} /> Device-bound
              </span>
            )}
            {settings.allowedCountry && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 20, padding: '3px 10px' }}>
                <Globe size={9} /> {settings.allowedCountry} only
              </span>
            )}
          </div>
        </motion.div>

        {/* Section count label */}
        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, margin: '0 0 10px', letterSpacing: 0.8 }}>
          PORTFOLIO SECTIONS ({sections.length})
        </p>

        {/* Sections */}
        {sections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <FileText size={40} color="#374151" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ color: '#6b7280', fontSize: 14 }}>No sections available in this share</p>
          </div>
        ) : (
          sections.map((section, idx) => (
            <SectionCard key={section.title} section={section} viewOnly={viewOnly} idx={idx} />
          ))
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={12} color="#374151" />
            <span style={{ color: '#374151', fontSize: 11, fontWeight: 600 }}>Secured by BioVault · End-to-end encrypted sharing</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {viewOnly && <span style={{ color: '#1f2937', fontSize: 10 }}>🔒 View-only access</span>}
            {settings.watermark && <span style={{ color: '#1f2937', fontSize: 10 }}>💧 Watermarked</span>}
            {settings.screenshotProtection && <span style={{ color: '#1f2937', fontSize: 10 }}>📵 Screenshot protected</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
