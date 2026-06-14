import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  ArrowLeft, Camera, Check, ChevronRight, Copy, FileText,
  Fingerprint, Image, Loader2, RefreshCw, Shield, Sparkles, Upload,
} from 'lucide-react';
import { generateDocumentDNA, type DocumentDNA, type DnaLayerResult } from '@/lib/documentDna';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultDoc {
  id: string;
  name?: string;
  fileName?: string;
  encryptedData?: string;
  fileData?: string;
  fileType?: string;
}

interface GenerateDNAPageProps {
  documents: VaultDoc[];
  onBack: () => void;
  onDNAGenerated?: (docId: string, dna: DocumentDNA) => void;
  onScanClick?: () => void;
  onDocumentSaved?: (doc: { id: string; name: string; encryptedData: string }) => void;
}

type Phase = 'pick' | 'processing' | 'result';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docName(d: VaultDoc): string {
  return d.name || d.fileName || 'Untitled';
}

function docDataUrl(d: VaultDoc): string {
  const raw = d.encryptedData || d.fileData || '';
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  const mime = d.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg';
  return `data:${mime};base64,${raw}`;
}

function mimeFromDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return 'application/octet-stream';
  const end = dataUrl.indexOf(';');
  return end > 5 ? dataUrl.slice(5, end) : 'application/octet-stream';
}

function fileSize(dataUrl: string): number {
  try {
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? Math.round((dataUrl.length - comma - 1) * 0.75) : 0;
  } catch { return 0; }
}

function isPdf(name: string, dataUrl: string): boolean {
  return name.toLowerCase().endsWith('.pdf') || dataUrl.startsWith('data:application/pdf');
}

// ─── Animated pulse ring ──────────────────────────────────────────────────────

const PulseRing: React.FC<{ delay: number; color: string }> = ({ delay, color }) => (
  <motion.div
    className={`absolute inset-0 rounded-full border ${color}`}
    initial={{ scale: 0.8, opacity: 0.8 }}
    animate={{ scale: 1.6, opacity: 0 }}
    transition={{ repeat: Infinity, duration: 2.4, delay, ease: 'easeOut' }}
  />
);

// ─── DNA Hero with animated fingerprint ──────────────────────────────────────

const DNAHero: React.FC = () => (
  <div className="relative flex flex-col items-center py-6">
    {/* Glowing backdrop */}
    <div className="absolute inset-0 bg-gradient-radial from-fuchsia-600/15 via-violet-600/5 to-transparent rounded-3xl" />

    {/* Animated icon cluster */}
    <div className="relative w-24 h-24 mb-5">
      <PulseRing delay={0} color="border-fuchsia-500/40" />
      <PulseRing delay={0.8} color="border-violet-500/30" />
      <PulseRing delay={1.6} color="border-purple-500/20" />

      {/* Icon container */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-purple-700 flex items-center justify-center shadow-2xl shadow-fuchsia-900/50"
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
      >
        <Fingerprint className="w-11 h-11 text-white drop-shadow-lg" strokeWidth={1.5} />
      </motion.div>
    </div>

    {/* Title */}
    <motion.h1
      className="text-2xl font-extrabold text-white tracking-tight mb-1"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      PINIT DNA
    </motion.h1>
    <motion.p
      className="text-sm text-slate-300 text-center max-w-[260px] leading-relaxed"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      Generate a cryptographic fingerprint from any document or image — all on‑device.
    </motion.p>

    {/* Layer chips */}
    <motion.div
      className="flex flex-wrap justify-center gap-2 mt-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.28 }}
    >
      {[
        { label: 'Crypto', icon: '🔐' },
        { label: 'Structure', icon: '📐' },
        { label: 'Perceptual', icon: '👁' },
        { label: 'Colour', icon: '🎨' },
        { label: 'Metadata', icon: '📋' },
        { label: 'HMAC', icon: '🔏' },
      ].map((c) => (
        <span
          key={c.label}
          className="flex items-center gap-1 text-[11px] font-semibold bg-white/5 border border-white/10 rounded-full px-3 py-1 text-slate-200"
        >
          <span>{c.icon}</span> {c.label}
        </span>
      ))}
    </motion.div>
  </div>
);

// ─── Action button card ───────────────────────────────────────────────────────

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  gradient: string;
  borderColor: string;
  glowColor: string;
  badge?: string;
  onClick: () => void;
  delay?: number;
}

const ActionCard: React.FC<ActionCardProps> = ({
  icon, title, subtitle, gradient, borderColor, glowColor, badge, onClick, delay = 0,
}) => (
  <motion.button
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ scale: 1.025, y: -2 }}
    whileTap={{ scale: 0.975 }}
    onClick={onClick}
    className={`relative w-full overflow-hidden rounded-2xl border ${borderColor} text-left group`}
    style={{ background: 'rgba(15,15,30,0.8)' }}
  >
    {/* Gradient fill */}
    <div className={`absolute inset-0 ${gradient} opacity-30 group-hover:opacity-50 transition-opacity duration-300`} />

    {/* Glow on hover */}
    <div className={`absolute inset-0 ${glowColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl`} />

    <div className="relative flex items-center gap-4 p-5">
      {/* Icon */}
      <div className={`w-14 h-14 rounded-2xl ${gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-base font-bold text-white">{title}</p>
          {badge && (
            <span className="text-[10px] font-bold bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-500/40 rounded-full px-2 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-300">{subtitle}</p>
      </div>

      {/* Arrow */}
      <motion.div
        className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
        whileHover={{ x: 3 }}
      >
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </motion.div>
    </div>

    {/* Animated shine */}
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none"
      initial={{ x: '-150%' }}
      whileHover={{ x: '150%' }}
      transition={{ duration: 0.6 }}
    />
  </motion.button>
);

// ─── Layer status row (processing) ────────────────────────────────────────────

const LAYER_META: Record<string, { icon: string; color: string }> = {
  cryptographic: { icon: '🔐', color: 'text-amber-300' },
  structural:    { icon: '📐', color: 'text-blue-300' },
  perceptual:    { icon: '👁',  color: 'text-purple-300' },
  semantic:      { icon: '🎨', color: 'text-pink-300' },
  metadata:      { icon: '📋', color: 'text-cyan-300' },
  hmac:          { icon: '🔏', color: 'text-emerald-300' },
};

const LayerRow: React.FC<{ layer: DnaLayerResult; active: boolean; idx: number }> = ({ layer, active, idx }) => {
  const meta = LAYER_META[layer.key] || { icon: '🔬', color: 'text-slate-300' };

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.06 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
        layer.status === 'complete'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : layer.status === 'failed'
          ? 'bg-red-500/10 border-red-500/30'
          : active
          ? 'bg-fuchsia-500/15 border-fuchsia-400/40 shadow-sm shadow-fuchsia-500/20'
          : 'bg-slate-800/30 border-slate-700/30'
      }`}
    >
      <span className="text-lg w-7 text-center select-none">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${layer.status === 'complete' ? 'text-emerald-200' : active ? 'text-fuchsia-200' : 'text-slate-200'}`}>
          {layer.name}
        </p>
        <p className="text-xs text-slate-400 truncate">{layer.detail}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {layer.status === 'complete' && (
          <>
            <span className="text-xs text-emerald-400 font-mono">{layer.durationMs}ms</span>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-6 h-6 rounded-full bg-emerald-500/25 border border-emerald-500/50 flex items-center justify-center"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            </motion.div>
          </>
        )}
        {layer.status === 'failed' && (
          <div className="w-6 h-6 rounded-full bg-red-500/25 border border-red-500/50 flex items-center justify-center">
            <span className="text-red-400 text-xs font-bold">✕</span>
          </div>
        )}
        {layer.status !== 'complete' && layer.status !== 'failed' && active && (
          <Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" />
        )}
        {layer.status !== 'complete' && layer.status !== 'failed' && !active && (
          <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
        )}
      </div>
    </motion.div>
  );
};

// ─── DNA result card ──────────────────────────────────────────────────────────

const DNAResultCard: React.FC<{ dna: DocumentDNA; fileName: string }> = ({ dna, fileName }) => {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(dna.dnaId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const completedLayers = dna.layers.filter((l) => l.status === 'complete').length;
  const quality = Math.round((completedLayers / Math.max(dna.layerCount, 1)) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* DNA ID hero */}
      <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-900/40 via-violet-900/30 to-purple-900/20 p-6 text-center">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent" />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring' }}
          className="flex items-center justify-center gap-2 mb-3"
        >
          <div className="w-8 h-8 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center">
            <Fingerprint className="w-4 h-4 text-fuchsia-300" />
          </div>
          <span className="text-sm font-bold text-fuchsia-200 uppercase tracking-widest">DNA Generated</span>
        </motion.div>
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="font-mono text-3xl font-black text-white tracking-wider">{dna.dnaId}</span>
          <button
            onClick={copyId}
            className="p-2 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/25 transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="font-mono text-xs text-slate-300 break-all leading-relaxed px-2">{dna.signature}</p>
        <p className="text-xs text-slate-400 mt-2 truncate">{fileName}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: `${completedLayers}/${dna.layerCount}`, label: 'Layers', color: 'text-fuchsia-300' },
          { value: `${quality}%`, label: 'Quality', color: quality >= 80 ? 'text-emerald-300' : quality >= 50 ? 'text-amber-300' : 'text-red-300' },
          { value: `${dna.totalMs}ms`, label: 'Time', color: 'text-cyan-300' },
        ].map(({ value, label, color }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center"
          >
            <div className={`text-xl font-black ${color}`}>{value}</div>
            <div className="text-xs text-slate-400 font-semibold mt-0.5">{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Layer breakdown */}
      <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-3">Layer Breakdown</p>
        {dna.layers.map((layer) => {
          const meta = LAYER_META[layer.key] || { icon: '🔬', color: 'text-slate-300' };
          return (
            <div key={layer.id} className="flex items-center gap-2.5 py-1 border-b border-slate-800 last:border-0">
              <span className="text-xs text-slate-500 font-mono w-5">{layer.id}</span>
              <span className="text-sm">{meta.icon}</span>
              <span className="text-sm text-slate-200 flex-1 font-medium">{layer.name}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                layer.status === 'complete'
                  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                  : layer.status === 'failed'
                  ? 'text-red-300 bg-red-500/15 border-red-500/30'
                  : 'text-slate-400 bg-slate-700/40 border-slate-600/30'
              }`}>
                {layer.status}
              </span>
              <span className="text-xs text-slate-500 font-mono w-14 text-right">{layer.durationMs}ms</span>
            </div>
          );
        })}
      </div>

      {/* SHA-256 */}
      {dna.sha256 && (
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-2">L1 · SHA-256 Hash</p>
          <p className="font-mono text-xs text-slate-300 break-all leading-relaxed">{dna.sha256}</p>
        </div>
      )}

      {/* Dominant colours */}
      {dna.dominantColors && dna.dominantColors.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">L4 · Dominant Colors</p>
          <div className="flex gap-3 flex-wrap">
            {dna.dominantColors.slice(0, 6).map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg border border-white/20 shadow-inner" style={{ background: c }} />
                <span className="font-mono text-xs text-slate-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-200">Fingerprint Secured</p>
          <p className="text-xs text-emerald-400/80">{new Date(dna.composedAt).toLocaleString()}</p>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Vault document item ──────────────────────────────────────────────────────

const VaultDocItem: React.FC<{ doc: VaultDoc; idx: number; onRun: () => void }> = ({ doc, idx, onRun }) => {
  const name = docName(doc);
  const dataUrl = docDataUrl(doc);
  const pdf = isPdf(name, dataUrl);

  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * idx }}
      whileHover={{ scale: 1.02, x: 4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onRun}
      className="w-full flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 hover:border-fuchsia-500/50 hover:bg-slate-800/80 rounded-2xl p-3.5 text-left transition-all group"
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-slate-700 bg-slate-900 flex items-center justify-center">
        {!pdf && dataUrl.startsWith('data:image') ? (
          <img src={dataUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <FileText className={`w-6 h-6 ${pdf ? 'text-red-400' : 'text-slate-500'}`} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{name}</p>
        <p className="text-xs text-slate-400">{pdf ? 'PDF Document' : 'Image file'}</p>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
        <Fingerprint className="w-4 h-4 text-fuchsia-400" />
        <span className="text-xs font-bold text-fuchsia-300">Scan</span>
      </div>
    </motion.button>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const GenerateDNAPage: React.FC<GenerateDNAPageProps> = ({ documents, onBack, onDNAGenerated, onScanClick, onDocumentSaved }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [selectedName, setSelectedName] = useState('');
  const [completedLayers, setCompletedLayers] = useState<DnaLayerResult[]>([]);
  const [activeLayerIdx, setActiveLayerIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [dna, setDna] = useState<DocumentDNA | null>(null);
  const [error, setError] = useState('');
  const [savedToVault, setSavedToVault] = useState(false);
  const pendingUploadRef = useRef<{ dataUrl: string; name: string; docId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const LAYER_SKELETON = [
    { id: 'L1', key: 'cryptographic', name: 'Cryptographic Hash', detail: 'SHA-256 of raw bytes' },
    { id: 'L2', key: 'structural', name: 'Structural Signature', detail: 'Edge / byte histogram' },
    { id: 'L3', key: 'perceptual', name: 'Perceptual Hash', detail: 'DCT pHash + aHash + dHash' },
    { id: 'L4', key: 'semantic', name: 'Semantic Colour', detail: 'RGB histogram + dominant colours' },
    { id: 'L5', key: 'metadata', name: 'Metadata Digest', detail: 'EXIF / file provenance' },
    { id: 'L6', key: 'hmac', name: 'HMAC Seal', detail: 'Integrity + origin seal' },
  ];

  const runDNA = async (dataUrl: string, name: string, docId: string) => {
    if (!dataUrl) { setError('No file data available.'); return; }
    setSelectedName(name);
    setCompletedLayers([]);
    setActiveLayerIdx(0);
    setProgress(0);
    setSavedToVault(false);
    setPhase('processing');
    setError('');

    try {
      const mime = mimeFromDataUrl(dataUrl);
      const size = fileSize(dataUrl);

      let animIdx = 0;
      const animTimer = window.setInterval(() => {
        animIdx = Math.min(animIdx + 1, LAYER_SKELETON.length - 1);
        setActiveLayerIdx(animIdx);
        setProgress(Math.round(((animIdx + 1) / LAYER_SKELETON.length) * 85));
      }, 600);

      const result = await generateDocumentDNA(dataUrl, name, mime, size);

      window.clearInterval(animTimer);
      setActiveLayerIdx(-1);
      setProgress(100);
      setCompletedLayers(result.layers);
      setDna(result);

      // Save to vault if this was a new upload (not an existing vault doc)
      const pending = pendingUploadRef.current;
      if (pending && pending.docId === docId && onDocumentSaved) {
        onDocumentSaved({ id: docId, name, encryptedData: dataUrl });
        setSavedToVault(true);
        pendingUploadRef.current = null;
      }

      setTimeout(() => setPhase('result'), 400);
      if (docId && onDNAGenerated) onDNAGenerated(docId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DNA generation failed.');
      setPhase('pick');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const docId = `upload_${Date.now()}`;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        pendingUploadRef.current = { dataUrl, name: file.name, docId };
        runDNA(dataUrl, file.name, docId);
      }
    };
    reader.readAsDataURL(file);
  };

  const fingerprintable = documents.filter((d) => (d.encryptedData || d.fileData || '').length > 32);

  // ── PROCESSING ──────────────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#080b14] px-4 pt-8 pb-28 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-fuchsia-300" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">Generating DNA</h1>
            <p className="text-xs text-slate-400 truncate max-w-[230px]">{selectedName}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Processing…</span>
            <span className="text-xs font-bold text-fuchsia-300">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-fuchsia-600 via-violet-500 to-purple-500 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-slate-900/80 border border-fuchsia-500/20 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
              className="w-5 h-5 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-400"
            />
            <span className="text-sm font-bold text-fuchsia-200">Running 6-Layer DNA Engine</span>
          </div>
          {LAYER_SKELETON.map((layer, idx) => {
            const done = completedLayers.find((l) => l.id === layer.id);
            if (done) return <LayerRow key={layer.id} layer={done} active={false} idx={idx} />;
            const placeholder: DnaLayerResult = { ...layer, status: 'skipped', durationMs: 0 };
            return <LayerRow key={layer.id} layer={placeholder} active={idx === activeLayerIdx} idx={idx} />;
          })}
        </div>

        <p className="text-center text-slate-500 text-xs">
          All computation runs on‑device · Nothing sent to any server
        </p>
      </motion.div>
    );
  }

  // ── RESULT ───────────────────────────────────────────────────────────────────
  if (phase === 'result' && dna) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen bg-[#080b14] px-4 pt-6 pb-28 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-slate-200" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Fingerprint className="w-5 h-5 text-fuchsia-400" />
            <h1 className="text-lg font-black text-white">DNA Result</h1>
            {savedToVault && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full px-2 py-0.5">
                <Check className="w-2.5 h-2.5" /> Saved to Vault
              </span>
            )}
          </div>
          <button
            onClick={() => { setPhase('pick'); setDna(null); }}
            className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-fuchsia-500/50 rounded-full px-3 py-1.5 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-xs font-semibold text-slate-300">New Scan</span>
          </button>
        </div>

        <DNAResultCard dna={dna} fileName={selectedName} />
      </motion.div>
    );
  }

  // ── PICK ─────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-[#080b14] pb-28"
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-slate-200" />
        </button>
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-fuchsia-400" />
          <span className="text-sm font-bold text-white">PINIT DNA</span>
        </div>
        <span className="ml-auto text-[10px] text-slate-500 font-mono">6-Layer Engine</span>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2"
          >
            <p className="text-xs text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Action buttons — compact */}
      <div className="px-4 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Choose Method</p>

        {/* Upload */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-orange-600/20 to-fuchsia-600/15 border border-orange-500/30 hover:border-orange-400/60 rounded-xl px-4 py-3 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Fingerprint className="w-4 h-4 text-white" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-white">Generate DNA</p>
            <p className="text-[10px] text-slate-400">Pick JPG, PNG or PDF · Saves to vault</p>
          </div>
          <span className="text-[10px] font-bold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 rounded-full px-2 py-0.5">DNA</span>
        </motion.button>

        {/* Scan */}
        {onScanClick && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={onScanClick}
            className="w-full flex items-center gap-3 bg-gradient-to-r from-cyan-600/20 to-violet-600/15 border border-cyan-500/30 hover:border-cyan-400/60 rounded-xl px-4 py-3 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-bold text-white">Scan Document</p>
              <p className="text-[10px] text-slate-400">Use camera to capture pages</p>
            </div>
            <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-2 py-0.5">Camera</span>
          </motion.button>
        )}
      </div>

      {/* Vault section */}
      {fingerprintable.length > 0 && (
        <div className="px-4 mt-5 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            From Vault · {fingerprintable.length}
          </p>
          <div className="space-y-1.5">
            {fingerprintable.map((doc, idx) => (
              <VaultDocItem
                key={doc.id}
                doc={doc}
                idx={idx}
                onRun={() => runDNA(docDataUrl(doc), docName(doc), doc.id)}
              />
            ))}
          </div>
        </div>
      )}

      {fingerprintable.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mx-4 mt-4 bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 text-center space-y-1.5"
        >
          <Image className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No vault documents yet</p>
          <p className="text-xs text-slate-500">Upload a file above to get started</p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default GenerateDNAPage;
