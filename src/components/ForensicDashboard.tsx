import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Shield, ShieldCheck, ShieldAlert, AlertTriangle,
  User, Smartphone, MapPin, Clock, Fingerprint, FileText,
  ChevronDown, ChevronUp, Activity, Eye, Download, Share2,
  Lock, Globe, CheckCircle, XCircle, Loader2, Star,
} from 'lucide-react';
import { runForensicScan, type VaultDocHint } from '@/lib/dna/forensicIntelligence';
import type { ForensicReport, ForensicVerdict, CustodyEvent, AssetStatus, OwnerRecoverySource } from '@/lib/dna/types';
import { generateOwnershipCertificate } from '@/lib/dna/ownershipCertificate';

interface ForensicDashboardProps {
  scannedImage: string;
  fileName: string;
  onBack: () => void;
  vaultDocHints?: VaultDocHint[];
}

const VERDICT_CONFIG: Record<ForensicVerdict, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
  authentic: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', icon: <ShieldCheck className="w-8 h-8" />, label: 'AUTHENTIC' },
  'minor-edit': { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: <ShieldAlert className="w-8 h-8" />, label: 'MINOR EDIT' },
  tampered: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: <AlertTriangle className="w-8 h-8" />, label: 'TAMPERED' },
  unknown: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', icon: <Shield className="w-8 h-8" />, label: 'UNKNOWN' },
};

const ASSET_STATUS_CONFIG: Record<AssetStatus, { color: string; bg: string; label: string; emoji: string }> = {
  original:   { color: '#10b981', bg: 'rgba(16,185,129,0.15)',  label: 'ORIGINAL FILE',      emoji: '✓' },
  shared:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  label: 'SHARED COPY',        emoji: '→' },
  screenshot: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: 'SCREENSHOT',          emoji: '📸' },
  cropped:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: 'CROPPED',             emoji: '✂' },
  resized:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', label: 'RESIZED',             emoji: '⊡' },
  modified:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  label: 'MODIFIED/EDITED',     emoji: '!' },
  unknown:    { color: '#64748b', bg: 'rgba(100,116,139,0.15)','label': 'STATUS UNKNOWN',    emoji: '?' },
};

const RECOVERY_SOURCE_LABEL: Record<OwnerRecoverySource, string> = {
  'exact-hash':       'DNA Record Store (Exact Hash)',
  'persistent-dna':   'Pixel DNA (Every Pixel Tile)',
  'perceptual-hash':  'Visual Fingerprint (pHash)',
  'watermark':        'Legacy Watermark',
  'none':             'Not Recovered',
};

const CUSTODY_ICONS: Record<string, React.ReactNode> = {
  created: <FileText className="w-3 h-3" />,
  captured: <Eye className="w-3 h-3" />,
  encrypted: <Lock className="w-3 h-3" />,
  shared: <Share2 className="w-3 h-3" />,
  downloaded: <Download className="w-3 h-3" />,
  verified: <ShieldCheck className="w-3 h-3" />,
  viewed: <Eye className="w-3 h-3" />,
};

function ScoreGauge({ value, label, color }: { value: number | null; label: string; color: string }) {
  const pct = value ?? 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * pct) / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={84} height={84} viewBox="0 0 84 84">
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <motion.circle
          cx={42} cy={42} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          transform="rotate(-90 42 42)"
        />
        <text x={42} y={42} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={18} fontWeight={900} fontFamily="monospace">
          {value !== null ? `${pct}` : '—'}
        </text>
      </svg>
      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.6)', border: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <span style={{ color: '#7c3aed' }}>{icon}</span>
        <span className="flex-1 text-xs font-bold" style={{ color: isLight ? '#0f172a' : '#f1f5f9' }}>{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] font-bold text-right max-w-[60%] break-all" style={{ color: highlight ? '#a78bfa' : isLight ? '#0f172a' : '#e2e8f0' }}>{value || 'Not Available'}</span>
    </div>
  );
}

function FindingRow({ signal, detected, detail, severity }: { signal: string; detected: boolean; detail: string; severity: string }) {
  const colorMap: Record<string, string> = { info: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };
  const color = colorMap[severity] || '#64748b';
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="mt-0.5 flex-shrink-0">
        {detected ? <XCircle className="w-3.5 h-3.5" style={{ color }} /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold" style={{ color }}>{signal}</p>
        <p className="text-[9px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function CustodyTimeline({ events }: { events: CustodyEvent[] }) {
  if (!events.length) return <p className="text-[10px] text-slate-500 text-center py-2">No custody events recorded</p>;
  return (
    <div className="space-y-0">
      {events.map((evt, i) => (
        <div key={evt.id} className="flex items-start gap-2.5 relative">
          {i < events.length - 1 && (
            <div className="absolute left-[9px] top-5 bottom-0 w-px bg-violet-500/20" />
          )}
          <div className="w-5 h-5 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center flex-shrink-0 z-10" style={{ color: '#7c3aed' }}>
            {CUSTODY_ICONS[evt.eventType] || <Activity className="w-3 h-3" />}
          </div>
          <div className="flex-1 pb-3">
            <p className="text-[10px] font-bold capitalize" style={{ color: '#7c3aed' }}>{evt.eventType.replace('-', ' ')}</p>
            <p className="text-[9px] text-slate-500">{new Date(evt.timestamp).toLocaleString()}</p>
            {evt.deviceInfo && <p className="text-[8px] text-slate-600">{evt.deviceInfo}</p>}
            {evt.location && <p className="text-[8px] text-slate-600">{evt.location}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrustScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  const label = score >= 90 ? 'HIGH CONFIDENCE' : score >= 70 ? 'GOOD CONFIDENCE' : score >= 40 ? 'LOW CONFIDENCE' : 'UNVERIFIED';
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
      <Star className="w-5 h-5 flex-shrink-0" style={{ color }} />
      <div className="flex-1">
        <p className="text-[9px] text-slate-500 uppercase tracking-wide">Ownership Trust Score</p>
        <p className="text-xl font-black" style={{ color }}>{score}/100</p>
        <p className="text-[9px] font-bold" style={{ color }}>{label}</p>
      </div>
      <div className="w-16 h-16 flex-shrink-0">
        <svg viewBox="0 0 64 64">
          <circle cx={32} cy={32} r={28} fill="none" stroke={`${color}30`} strokeWidth={5} />
          <motion.circle
            cx={32} cy={32} r={28} fill="none" stroke={color} strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 28}
            initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - score / 100) }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            transform="rotate(-90 32 32)"
          />
          <text x={32} y={32} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={14} fontWeight={900} fontFamily="monospace">{score}</text>
        </svg>
      </div>
    </div>
  );
}

export const ForensicDashboard: React.FC<ForensicDashboardProps> = ({ scannedImage, fileName, onBack, vaultDocHints }) => {
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [scanning, setScanning] = useState(true);
  const [progress, setProgress] = useState(0);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const handleDownloadCertificate = async () => {
    if (!report) return;
    setGeneratingPdf(true);
    try {
      await generateOwnershipCertificate(report, fileName);
    } catch {
      // silent — jsPDF errors are non-fatal
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Keep a ref so the scan always uses the latest hints without re-triggering on
  // every parent re-render (parent creates a new array reference each render via
  // .map(), which would otherwise re-run the scan and show different results).
  const vaultDocHintsRef = useRef(vaultDocHints);
  vaultDocHintsRef.current = vaultDocHints;

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setScanError(null);
    setScanning(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 92));
    }, 300);

    const mime = scannedImage.startsWith('data:image/png') ? 'image/png'
      : scannedImage.startsWith('data:image/jpeg') ? 'image/jpeg'
      : scannedImage.startsWith('data:application/pdf') ? 'application/pdf'
      : 'image/jpeg';

    // 45-second timeout prevents infinite loading when image decode hangs in low-memory WebViews
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Scan timed out — try a smaller image')), 45000),
    );

    Promise.race([
      runForensicScan(scannedImage, fileName, mime, scannedImage.length, vaultDocHintsRef.current),
      timeout,
    ])
      .then((r) => {
        if (!cancelled) { setReport(r); setProgress(100); setTimeout(() => setScanning(false), 400); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          clearInterval(interval);
          setScanError(err instanceof Error ? err.message : 'Scan failed — please try again');
          setScanning(false);
        }
      });

    return () => { cancelled = true; clearInterval(interval); };
  }, [scannedImage, fileName]); // vaultDocHints excluded — use ref to avoid re-scan on parent re-render

  const vc = report ? VERDICT_CONFIG[report.verdict] : VERDICT_CONFIG.unknown;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="min-h-screen pb-28"
      style={{ background: isLight ? '#f8fafc' : '#050913', color: isLight ? '#0f172a' : '#f1f5f9' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: isLight ? '#64748b' : '#94a3b8' }} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-black">Ownership Forensics</p>
          <p className="text-[10px]" style={{ color: '#64748b' }}>Digital Asset Investigation</p>
        </div>
        <div className="flex items-center gap-2">
          {report?.originalOwner && !scanning && (
            <button
              onClick={handleDownloadCertificate}
              disabled={generatingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black"
              style={{
                background: generatingPdf ? 'rgba(124,58,237,0.2)' : 'linear-gradient(135deg,#7c3aed,#a855f7)',
                color: '#fff',
                border: '1px solid rgba(124,58,237,0.4)',
                opacity: generatingPdf ? 0.7 : 1,
              }}
            >
              {generatingPdf
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                : <><Download className="w-3 h-3" /> Certificate</>}
            </button>
          )}
          <div className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <span className="text-[9px] font-black" style={{ color: '#a78bfa' }}>PINIT FORENSIC</span>
          </div>
        </div>
      </div>

      {/* Scanning animation */}
      {scanning && (
        <div className="px-4 space-y-4 py-8">
          <div className="flex flex-col items-center gap-4">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
              <Loader2 className="w-12 h-12" style={{ color: '#7c3aed' }} />
            </motion.div>
            <div className="text-center">
              <p className="text-sm font-bold">Analyzing Asset...</p>
              <p className="text-[10px] text-slate-500 mt-1">{fileName}</p>
            </div>
          </div>
          <div className="mx-auto max-w-xs">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)' }}>
              <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }}
                animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
            </div>
            <p className="text-[9px] text-slate-500 text-center mt-2">
              {progress < 20 ? 'Extracting pixel-level DNA...'
                : progress < 40 ? 'Running perceptual hash match...'
                : progress < 60 ? 'Comparing DNA layers...'
                : progress < 80 ? 'Running forensic analysis...'
                : 'Generating ownership proof...'}
            </p>
          </div>
        </div>
      )}

      {/* Scan error */}
      {!scanning && !report && scanError && (
        <div className="px-4 py-8 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <Shield className="w-8 h-8" style={{ color: '#ef4444' }} />
          </div>
          <div>
            <p className="text-sm font-black" style={{ color: '#ef4444' }}>SCAN FAILED</p>
            <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{scanError}</p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-full text-xs font-bold"
            style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}
          >
            Go Back
          </button>
        </div>
      )}

      {/* Report */}
      {!scanning && report && (
        <div className="px-4 space-y-3">

          {/* ═══ FILE OWNER CARD — always first, always visible ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: report.originalOwner ? 'linear-gradient(135deg,rgba(16,185,129,0.14),rgba(16,185,129,0.06))' : 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))', border: `1px solid ${report.originalOwner ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.3)'}` }}
          >
            {/* Header bar */}
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: report.originalOwner ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.15)' }}>
              {report.originalOwner
                ? <ShieldCheck className="w-4 h-4" style={{ color: '#10b981' }} />
                : <XCircle className="w-4 h-4" style={{ color: '#ef4444' }} />}
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: report.originalOwner ? '#10b981' : '#ef4444' }}>
                {report.originalOwner ? 'FILE OWNER IDENTIFIED' : 'OWNER NOT FOUND'}
              </span>
            </div>

            <div className="px-4 py-3 space-y-3">
              {report.originalOwner ? (
                <>
                  {/* Owner name — big */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-black"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)', color: '#10b981' }}>
                      {(report.originalOwner.ownerName || report.originalOwner.pinitOwnerId || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-slate-500">Original File Owner</p>
                      <p className="text-base font-black leading-tight" style={{ color: isLight ? '#0f172a' : '#f1f5f9' }}>
                        {report.originalOwner.ownerName || 'Name Not Available'}
                      </p>
                      <p className="text-[10px] font-mono font-bold" style={{ color: '#a78bfa' }}>{report.originalOwner.pinitOwnerId}</p>
                    </div>
                  </div>

                  {/* Owner quick-stats grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Owner / User ID', value: report.originalOwner.userId },
                      { label: 'Vault ID', value: report.originalOwner.vaultId },
                      { label: 'Digital DNA ID', value: report.originalOwner.dnaId },
                      { label: 'Asset UUID', value: report.originalOwner.assetUuid },
                      { label: 'Asset Version', value: `v${report.originalOwner.assetVersion}` },
                      { label: 'Encryption Method', value: 'PINIT 10-Layer DNA' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl px-2.5 py-2" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' }}>
                        <p className="text-[8px] text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className="text-[9px] font-bold break-all leading-snug" style={{ color: isLight ? '#0f172a' : '#e2e8f0' }}>
                          {value && value !== 'Not Available' ? (value.length > 28 ? value.slice(0, 26) + '…' : value) : '—'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Timestamps */}
                  <div className="rounded-xl px-3 py-2.5 space-y-1" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' }}>
                    <p className="text-[8px] text-slate-500 uppercase tracking-wide">DNA Created At (Original Device)</p>
                    <p className="text-[10px] font-bold" style={{ color: isLight ? '#0f172a' : '#e2e8f0' }}>
                      {report.originalOwner.encryptionTimestamp !== 'Not Available'
                        ? new Date(report.originalOwner.encryptionTimestamp).toLocaleString()
                        : '—'}
                    </p>
                    {report.originalOwner.encryptionTimestamp !== 'Not Available' && (
                      <p className="text-[9px] text-slate-400">{new Date(report.originalOwner.encryptionTimestamp).toUTCString()}</p>
                    )}
                  </div>

                  {/* Digital signature */}
                  {report.originalOwner.digitalSignature && report.originalOwner.digitalSignature !== 'Not Available' && (
                    <div className="rounded-xl px-3 py-2" style={{ background: isLight ? 'rgba(124,58,237,0.07)' : 'rgba(124,58,237,0.1)' }}>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wide">Digital Signature (HMAC-SHA256)</p>
                      <p className="text-[9px] font-mono break-all" style={{ color: '#a78bfa' }}>
                        {report.originalOwner.digitalSignature.slice(0, 64)}
                      </p>
                    </div>
                  )}

                  {/* Recovery method */}
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <p className="text-[9px] text-slate-400">
                      Identified via: <span className="font-bold text-emerald-400">{RECOVERY_SOURCE_LABEL[report.ownerRecoverySource]}</span>
                      {report.visualSimilarity !== null && report.ownerRecoverySource === 'perceptual-hash' && ` · ${report.visualSimilarity}% visual match`}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-slate-400 py-2">No PINIT ownership DNA could be recovered from this file.</p>
              )}
            </div>
          </motion.div>

          {/* Verdict */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-4 text-center"
            style={{ background: vc.bg, border: `1px solid ${vc.border}` }}
          >
            <div className="flex justify-center mb-2" style={{ color: vc.color }}>{vc.icon}</div>
            <p className="text-lg font-black tracking-wide" style={{ color: vc.color }}>{vc.label}</p>
            <p className="text-[10px] mt-1" style={{ color: isLight ? '#475569' : '#94a3b8' }}>{report.verdictText}</p>
          </motion.div>

          {/* Asset Status + Trust Score row */}
          {(() => {
            const sc = ASSET_STATUS_CONFIG[report.assetStatus];
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl px-3 py-3 flex flex-col gap-1" style={{ background: sc.bg, border: `1px solid ${sc.color}30` }}>
                  <p className="text-[8px] text-slate-500 uppercase tracking-wide">Asset Status</p>
                  <p className="text-lg">{sc.emoji}</p>
                  <p className="text-[10px] font-black" style={{ color: sc.color }}>{sc.label}</p>
                </div>
                <TrustScoreBadge score={report.trustScore} />
              </div>
            );
          })()}

          {/* Score Gauges */}
          <div className="flex justify-center gap-4">
            <ScoreGauge value={report.visualSimilarity} label="Visual Match" color="#3b82f6" />
            <ScoreGauge value={report.dnaMatchPct} label="DNA Match" color="#7c3aed" />
            <ScoreGauge value={100 - report.tamperingScore} label="Integrity" color={report.tamperingScore > 40 ? '#ef4444' : report.tamperingScore > 10 ? '#f59e0b' : '#10b981'} />
          </div>

          {/* Creator's Device — labelled clearly to avoid confusion with scanner */}
          <Section title="Creator's Device (at time of DNA generation)" icon={<Smartphone className="w-4 h-4" />} defaultOpen={!!report.originalDevice}>
            {report.originalDevice ? (
              <>
                <div className="mb-2 px-2 py-1.5 rounded-xl text-[9px]" style={{ background: 'rgba(124,58,237,0.1)', color: '#a78bfa' }}>
                  This is the device the <strong>file owner</strong> used when generating the DNA — not the scanner's device.
                </div>
                <InfoRow label="Manufacturer" value={report.originalDevice.manufacturer} />
                <InfoRow label="Model" value={report.originalDevice.model} />
                <InfoRow label="OS" value={[report.originalDevice.operatingSystem, report.originalDevice.osVersion].filter(Boolean).join(' ')} />
                <InfoRow label="Platform" value={report.originalDevice.platform} />
                <InfoRow label="Browser Version" value={report.originalDevice.browserVersion} />
                <InfoRow label="Device Fingerprint" value={report.originalDevice.deviceFingerprint ? report.originalDevice.deviceFingerprint.slice(0, 16) + '…' : null} />
                <InfoRow label="DNA Captured At" value={new Date(report.originalDevice.capturedAt).toLocaleString()} />
              </>
            ) : (
              <p className="text-[10px] text-slate-500 text-center py-3">Creator's device info not stored in this DNA record</p>
            )}
          </Section>

          <Section title="Creator's Location (at time of DNA generation)" icon={<MapPin className="w-4 h-4" />} defaultOpen={!!report.originalDevice}>
            {report.originalDevice ? (
              <>
                <div className="mb-2 px-2 py-1.5 rounded-xl text-[9px]" style={{ background: 'rgba(124,58,237,0.1)', color: '#a78bfa' }}>
                  This is where the <strong>file owner</strong> was when the DNA was embedded — not your location.
                </div>
                <InfoRow label="GPS Coordinates" value={report.originalDevice.gpsLat && report.originalDevice.gpsLng ? `${report.originalDevice.gpsLat.toFixed(6)}, ${report.originalDevice.gpsLng.toFixed(6)}` : null} />
                <InfoRow label="Full Address" value={report.originalDevice.address} />
                <InfoRow label="Village / Area" value={[report.originalDevice.village, report.originalDevice.area].filter(Boolean).join(', ') || null} />
                <InfoRow label="Road" value={report.originalDevice.road} />
                <InfoRow label="City" value={report.originalDevice.city} />
                <InfoRow label="State" value={report.originalDevice.state} />
                <InfoRow label="Country" value={report.originalDevice.country} />
                <InfoRow label="Public IP (at creation)" value={report.originalDevice.publicIp} />
                <InfoRow label="Timezone" value={report.originalDevice.timeZone} />
              </>
            ) : (
              <p className="text-[10px] text-slate-500 text-center py-3">Location info not stored in this DNA record</p>
            )}
          </Section>

          {/* File Info */}
          <Section title="File & Encryption Info" icon={<FileText className="w-4 h-4" />} defaultOpen={true}>
            <InfoRow label="File Name" value={fileName} />
            <InfoRow label="File Type" value={scannedImage.startsWith('data:image/png') ? 'PNG Image' : scannedImage.startsWith('data:image/jpeg') ? 'JPEG Image' : scannedImage.startsWith('data:application/pdf') ? 'PDF Document' : 'Unknown'} />
            <InfoRow label="Encryption Method" value="PINIT DNA — 10-Layer Pixel Embedding" />
            <InfoRow label="DNA Embedding Algorithm" value="Amplitude-8 Tiled Pixel Encoding" />
            <InfoRow label="Embedding Strength" value="±8 amplitude per channel (survives JPEG ≥75%)" />
            <InfoRow label="Ownership Verification" value={report.originalOwner ? 'VERIFIED ✓' : 'NOT VERIFIED ✗'} />
            <InfoRow label="File Integrity Status" value={report.tamperingScore === 0 ? 'Intact — Byte Identical' : report.tamperingScore <= 10 ? 'Intact (minor transform only)' : report.tamperingScore <= 40 ? 'Partially Compromised' : 'Compromised'} />
            <InfoRow label="Tampering Score" value={`${report.tamperingScore}/100`} />
            <InfoRow label="Tampering Detection" value={report.tamperingScore > 10 ? 'Tampering Signals Found' : 'No Tampering Detected'} />
            <InfoRow label="Compression Detected" value={report.findings.some((f) => f.detected && f.signal.includes('Compression')) ? 'Yes — file re-encoded' : 'No'} />
            <InfoRow label="Screenshot / Crop / Resize" value={
              report.findings.some((f) => f.detected && f.signal === 'Screenshot Suspected') ? 'Screenshot Detected'
              : report.findings.some((f) => f.detected && f.signal === 'Cropping Detected') ? 'Cropping Detected'
              : report.findings.some((f) => f.detected && f.signal === 'Structural Change') ? 'Resize / Structural Change'
              : 'Not Detected'
            } />
            <InfoRow label="AI-Generated Content" value={report.findings.some((f) => f.detected && f.signal.includes('AI')) ? 'Indicators Found' : 'Not Detected'} />
            <InfoRow label="Metadata / EXIF" value={report.findings.some((f) => f.signal === 'Metadata Present') ? 'Present' : report.findings.some((f) => f.signal === 'Metadata Stripped') ? 'Stripped / Removed' : 'Not Available'} />
            <InfoRow label="Risk Level" value={report.tamperingScore > 50 ? 'HIGH' : report.tamperingScore > 20 ? 'MEDIUM' : 'LOW'} />
            <InfoRow label="Scan Analyzed At" value={new Date(report.analyzedAt).toLocaleString()} />
          </Section>

          {/* Forensic Findings */}
          <Section title="Forensic Analysis Signals" icon={<Fingerprint className="w-4 h-4" />} defaultOpen={true}>
            {report.findings.length > 0 ? (
              report.findings.map((f, i) => <FindingRow key={i} {...f} />)
            ) : (
              <p className="text-[10px] text-slate-500 text-center py-3">No forensic signals detected</p>
            )}
          </Section>

          {/* Chain of Custody */}
          <Section title="Chain of Custody / Ownership History" icon={<Activity className="w-4 h-4" />} defaultOpen={true}>
            <CustodyTimeline events={report.custodyTimeline} />
          </Section>

          {/* Evidence Summary */}
          <Section title="Complete Evidence Summary" icon={<Globe className="w-4 h-4" />} defaultOpen={true}>
            <InfoRow label="File Owner Name" value={report.originalOwner?.ownerName ?? 'Not Identified'} highlight />
            <InfoRow label="Owner PINIT ID" value={report.originalOwner?.pinitOwnerId ?? 'Not Available'} highlight />
            <InfoRow label="Owner User ID" value={report.originalOwner?.userId ?? 'Not Available'} />
            <InfoRow label="Owner Vault ID" value={report.originalOwner?.vaultId ?? 'Not Available'} />
            <InfoRow label="Digital DNA ID" value={report.originalOwner?.dnaId ?? 'Not Available'} />
            <InfoRow label="Asset UUID" value={report.originalOwner?.assetUuid ?? 'Not Available'} />
            <InfoRow label="Asset Version" value={report.originalOwner ? `v${report.originalOwner.assetVersion}` : 'Not Available'} />
            <InfoRow label="DNA Created At" value={report.originalOwner?.encryptionTimestamp && report.originalOwner.encryptionTimestamp !== 'Not Available' ? new Date(report.originalOwner.encryptionTimestamp).toLocaleString() : 'Not Available'} />
            <InfoRow label="Ownership Verification" value={report.originalOwner ? 'VERIFIED ✓' : 'NOT VERIFIED ✗'} />
            <InfoRow label="Recovery Method" value={RECOVERY_SOURCE_LABEL[report.ownerRecoverySource]} />
            <InfoRow label="Visual Similarity" value={report.visualSimilarity !== null ? `${report.visualSimilarity}%` : 'Not Available'} />
            <InfoRow label="DNA Match" value={report.dnaMatchPct !== null ? `${report.dnaMatchPct}%` : 'Not Available'} />
            <InfoRow label="Trust Score" value={`${report.trustScore}/100`} />
            <InfoRow label="Current Asset Status" value={ASSET_STATUS_CONFIG[report.assetStatus].label} />
            <InfoRow label="Verdict" value={vc.label} />
            <InfoRow label="Encryption Status" value={report.originalOwner ? 'PINIT DNA Encrypted' : 'Unknown'} />
            <InfoRow label="Modification Status" value={report.tamperingScore > 10 ? 'Modified / Transformed' : 'Unmodified'} />
            <InfoRow label="Compression Status" value={report.findings.some((f) => f.signal.includes('Compression')) ? 'Compressed / Re-encoded' : 'Original Quality'} />
            <InfoRow label="Screenshot Detection" value={report.findings.some((f) => f.signal.includes('Screenshot')) ? 'Suspected' : 'Not Detected'} />
            <InfoRow label="AI Content Detection" value={report.findings.some((f) => f.signal.includes('AI')) ? 'Indicators Found' : 'Not Detected'} />
            <InfoRow label="Tampering Score" value={`${report.tamperingScore}/100`} />
            <InfoRow label="Risk Level" value={report.tamperingScore > 50 ? 'HIGH' : report.tamperingScore > 20 ? 'MEDIUM' : 'LOW'} />
            {report.originalDevice && <>
              <InfoRow label="Creator's Device" value={[report.originalDevice.manufacturer, report.originalDevice.model].filter(Boolean).join(' ') || 'Not Available'} />
              <InfoRow label="Creator's OS" value={[report.originalDevice.operatingSystem, report.originalDevice.osVersion].filter(Boolean).join(' ') || 'Not Available'} />
              <InfoRow label="Creator's City" value={report.originalDevice.city} />
              <InfoRow label="Creator's Country" value={report.originalDevice.country} />
              <InfoRow label="Creator's IP (at creation)" value={report.originalDevice.publicIp} />
              <InfoRow label="Creator's GPS" value={report.originalDevice.gpsLat && report.originalDevice.gpsLng ? `${report.originalDevice.gpsLat.toFixed(5)}, ${report.originalDevice.gpsLng.toFixed(5)}` : null} />
            </>}
            <InfoRow label="Scan Analyzed At" value={new Date(report.analyzedAt).toLocaleString()} />
          </Section>
        </div>
      )}

      {/* Download certificate — bottom CTA when ownership confirmed */}
      {!scanning && report?.originalOwner && (
        <div className="px-4 mt-2 mb-2">
          <button
            onClick={handleDownloadCertificate}
            disabled={generatingPdf}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black"
            style={{
              background: generatingPdf
                ? 'rgba(124,58,237,0.2)'
                : 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff',
              border: '1px solid rgba(124,58,237,0.4)',
              opacity: generatingPdf ? 0.7 : 1,
            }}
          >
            {generatingPdf ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating Certificate PDF…</>
            ) : (
              <><Download className="w-4 h-4" /> Download Ownership Certificate PDF</>
            )}
          </button>
          <p className="text-[9px] text-slate-500 text-center mt-1.5">
            Includes owner ID, asset UUID, GPS, device info, QR code, and digital signature
          </p>
        </div>
      )}

      {/* No owner found — tips */}
      {!scanning && report && !report.originalOwner && (
        <div className="px-4 mt-2">
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <p className="text-xs font-black text-amber-400">Why is owner not showing?</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {'• '}
              <span className="font-bold text-white">Use Vault → Scan button</span>
              {' on the document (most reliable — reads DNA-embedded PNG directly)\n• '}
              <span className="font-bold text-white">Gallery pick (PNG only)</span>
              {' — select the _pinit_dna.png file in Documents/PINIT Vault Documents\n• '}
              <span className="font-bold text-white">Camera scan</span>
              {' — JPEG re-encoding destroys pixel DNA; use only for visual evidence\n• '}
              <span className="font-bold text-white">WhatsApp/Instagram shared</span>
              {' — apps re-encode to JPEG; pHash matching may still identify owner'}
            </p>
          </div>
        </div>
      )}

      {/* No report */}
      {!scanning && !report && (
        <div className="text-center py-16 px-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-bold">Scan Failed</p>
          <p className="text-[10px] text-slate-500 mt-1">Could not analyze this asset. Please try again.</p>
          <button onClick={onBack} className="mt-4 px-6 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            Go Back
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default ForensicDashboard;
