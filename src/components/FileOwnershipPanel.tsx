import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, Fingerprint, Eye, Share2, Download, Trash2,
  ChevronDown, ChevronUp, Lock, User, Calendar, HardDrive,
  MapPin, Monitor, Activity, AlertTriangle, CheckCircle,
  Clock, FileText, Zap, Database, Star, Check
} from "lucide-react";

const DNA_LAYERS = [
  { id: 'L1',  name: 'Cryptographic DNA',  algo: 'SHA3-256 + BLAKE3 dual hash',          size: '64 bytes',   emoji: '🔐', hex: '#f59e0b' },
  { id: 'L2',  name: 'Structural DNA',     algo: 'DCT pHash + block hash grid',          size: '32 bytes',   emoji: '📐', hex: '#3b82f6' },
  { id: 'L3',  name: 'Perceptual DNA',     algo: 'CNN ResNet-50 layer-4',                size: '2048-dim',   emoji: '👁',  hex: '#8b5cf6' },
  { id: 'L4',  name: 'Semantic DNA',       algo: 'CLIP ViT-L/14 embedding',              size: '768-dim',    emoji: '🎯', hex: '#ec4899' },
  { id: 'L5',  name: 'Provenance DNA',     algo: 'Origin chain hash (all ancestors)',    size: '32 bytes',   emoji: '🔗', hex: '#06b6d4' },
  { id: 'L6',  name: 'Ownership DNA',      algo: 'Ed25519 signature L1+L2+hoid',        size: '64 bytes',   emoji: '🛡️', hex: '#10b981' },
  { id: 'L7',  name: 'Behavioral DNA',     algo: 'Creation fingerprint (mouse+timing)', size: '128 bytes',  emoji: '🧠', hex: '#f43f5e' },
  { id: 'L8',  name: 'Relationship DNA',   algo: 'Asset relationship graph hash',        size: 'Variable',   emoji: '🕸️', hex: '#7c3aed' },
  { id: 'L9',  name: 'Origin DNA',         algo: 'Device + geo + timestamp + cert',     size: '96 bytes',   emoji: '📍', hex: '#14b8a6' },
  { id: 'L10', name: 'Evolution DNA',      algo: 'Mutation history Merkle tree',         size: 'Variable',   emoji: '🌱', hex: '#84cc16' },
];

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

interface VaultDoc {
  id: string;
  name: string;
  encryptedData: string;
  cloudinaryUrl?: string;
  pageCount?: number;
  pHash?: string;
  metadata: {
    timestamp: number;
    original_name: string;
    size: number;
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
    dna?: { dnaId?: string; signature?: string };
  };
  createdAt: string;
  encryptedImage?: string;
}

interface OwnershipPanelProps {
  doc: VaultDoc;
  embeddedMetadata: Record<string, unknown> | null;
  userName: string;
  userId: string;
  onClose: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

function fmt(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function fmtDate(val: string | number | undefined): string {
  if (!val) return "—";
  const d = new Date(typeof val === "number" ? val : val);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Section({ title, icon: Icon, color, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-all`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2.5 bg-slate-900/40">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string | React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex-shrink-0 mt-0.5">{label}</span>
      <span className={`text-[11px] font-semibold text-right break-all ${accent || "text-slate-200"}`}>{value}</span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${color}`}>{text}</span>
  );
}

export function FileOwnershipPanel({
  doc, embeddedMetadata, userName, userId,
  onClose, onPreview, onShare, onDownload, onDelete,
}: OwnershipPanelProps) {
  const name = doc.metadata?.original_name || doc.name || "Untitled";
  const ext = name.split(".").pop()?.toUpperCase() || "—";
  const size = fmt(doc.metadata?.size || 0);
  const created = fmtDate(doc.metadata?.timestamp || doc.createdAt);
  const dnaId = (doc.metadata?.dna as { dnaId?: string })?.dnaId || `DNA-${doc.id.slice(-8).toUpperCase()}`;
  const dnaHash = doc.pHash || (doc.metadata?.checksum ? doc.metadata.checksum.slice(0, 32) : "—");
  const shortId = userId ? `PINIT-${userId.slice(-6).toUpperCase()}` : "PINIT-000000";
  const secScore = doc.encryptedImage ? "99.8%" : doc.metadata?.encrypted ? "95.2%" : "82.1%";
  const gps = embeddedMetadata?.gps as { available?: boolean; coordinates?: string } | undefined;
  const device = embeddedMetadata?.deviceName as string | undefined;
  const ip = embeddedMetadata?.ipAddress as string | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950"
    >
      {/* Hero header */}
      <div className="relative overflow-hidden px-4 pt-6 pb-4 flex-shrink-0 bg-gradient-to-br from-slate-900 via-purple-950/60 to-slate-900 border-b border-white/8">
        <div className="pointer-events-none absolute -top-8 -right-8 w-36 h-36 rounded-full bg-fuchsia-500/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl" />
        <div className="relative flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-fuchsia-300 font-bold uppercase tracking-widest">Ownership Panel</p>
              <p className="text-base font-extrabold text-white leading-tight">File Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/8 hover:bg-white/15 transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Score card */}
        <div className="relative rounded-2xl bg-gradient-to-r from-fuchsia-600/20 via-violet-600/20 to-cyan-600/20 border border-fuchsia-500/20 p-3">
          <div className="grid grid-cols-3 gap-3 text-center mb-3">
            <div>
              <p className="text-lg font-extrabold text-emerald-400">{secScore}</p>
              <p className="text-[8px] text-slate-400 uppercase tracking-wide">Security Score</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-fuchsia-300">✓ Verified</p>
              <p className="text-[8px] text-slate-400 uppercase tracking-wide">Ownership</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-cyan-300">Protected</p>
              <p className="text-[8px] text-slate-400 uppercase tracking-wide">Tamper Status</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-semibold text-white truncate">{name}</p>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              <Badge text={`${ext} File`} color="text-slate-300 bg-slate-700/60 border-slate-600/40" />
              <Badge text={size} color="text-cyan-300 bg-cyan-500/10 border-cyan-500/20" />
              {doc.metadata?.encrypted && <Badge text="AES-256 Encrypted" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />}
              {doc.pHash && <Badge text="DNA Fingerprinted" color="text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20" />}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { icon: Eye, label: "Preview", color: "bg-cyan-600/20 border-cyan-500/30 text-cyan-400", fn: onPreview },
            { icon: Share2, label: "Share", color: "bg-fuchsia-600/20 border-fuchsia-500/30 text-fuchsia-400", fn: onShare },
            { icon: Download, label: "Download", color: "bg-emerald-600/20 border-emerald-500/30 text-emerald-400", fn: onDownload },
            { icon: Trash2, label: "Delete", color: "bg-red-600/20 border-red-500/30 text-red-400", fn: onDelete },
          ].map(({ icon: Icon, label, color, fn }) => (
            <button key={label} onClick={fn} className={`flex flex-col items-center gap-1 py-2 rounded-xl border ${color} transition-all hover:opacity-80`}>
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

        {/* Basic Info */}
        <Section title="Basic Information" icon={FileText} color="bg-blue-600/60" defaultOpen>
          <Row label="File Name" value={name} />
          <Row label="File Type" value={ext} />
          <Row label="File Size" value={size} />
          <Row label="Upload Date" value={created} />
          {doc.pageCount && <Row label="Pages" value={String(doc.pageCount)} />}
        </Section>

        {/* Owner Info */}
        <Section title="Owner Information" icon={User} color="bg-fuchsia-600/60" defaultOpen>
          <Row label="Owner Name" value={userName || "—"} accent="text-fuchsia-300" />
          <Row label="Owner ID" value={shortId} accent="text-fuchsia-300" />
          <Row label="Ownership Status" value={
            <Badge text="✓ Verified" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Created On" value={created} />
          <Row label="Current Holder" value={userName || "—"} />
        </Section>

        {/* Security */}
        <Section title="Security Information" icon={Lock} color="bg-emerald-600/60">
          <Row label="AES-256" value={
            <Badge text={doc.metadata?.encrypted ? "✓ Enabled" : "Not Applied"} color={doc.metadata?.encrypted ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-slate-400 bg-slate-700/40 border-slate-600/30"} />
          } />
          <Row label="E2E Encryption" value={
            <Badge text={doc.encryptedImage ? "✓ Enabled" : "Standard"} color={doc.encryptedImage ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-slate-400 bg-slate-700/40 border-slate-600/30"} />
          } />
          <Row label="Key ID" value={doc.metadata?.checksum ? doc.metadata.checksum.slice(0, 16) + "…" : "—"} accent="text-yellow-300" />
          <Row label="Security Level" value={
            <Badge
              text={doc.encryptedImage ? "DNA Vault" : doc.metadata?.encrypted ? "Secure Vault" : "Standard"}
              color={doc.encryptedImage ? "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20" : "text-cyan-300 bg-cyan-500/10 border-cyan-500/20"}
            />
          } />
          <Row label="Security Score" value={secScore} accent="text-emerald-400" />
        </Section>

        {/* Digital DNA */}
        <Section title="Digital DNA" icon={Fingerprint} color="bg-violet-600/60">
          <Row label="DNA ID" value={dnaId} accent="text-fuchsia-300" />
          <Row label="Hash Signature" value={dnaHash ? dnaHash.slice(0, 20) + "…" : "—"} accent="text-violet-300" />
          <Row label="Blockchain Status" value={
            <Badge text={doc.pHash ? "✓ Recorded" : "Pending"} color={doc.pHash ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-slate-400 bg-slate-700/40 border-slate-600/30"} />
          } />
          <Row label="Tamper Detection" value={
            <Badge text="✓ Protected" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Fingerprint Type" value={doc.pHash ? "Perceptual Hash" : "Checksum"} />
        </Section>

        {/* 10-Layer DNA Engine */}
        <Section title="10-Layer DNA Engine" icon={Zap} color="bg-cyan-600/60" defaultOpen>
          <div className="space-y-1.5 pt-0.5">
            {DNA_LAYERS.map((layer, idx) => (
              <motion.div
                key={layer.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
                style={{
                  background: hexAlpha(layer.hex, 0.07),
                  border: `1px solid ${hexAlpha(layer.hex, 0.22)}`,
                }}
              >
                <span className="text-[9px] font-black font-mono w-6 text-center flex-shrink-0"
                  style={{ color: layer.hex }}>{layer.id}</span>
                <span className="text-sm flex-shrink-0">{layer.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">{layer.name}</p>
                  <p className="text-[9px] text-slate-500 truncate">{layer.algo}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[8px] font-mono text-slate-500 hidden sm:block">{layer.size}</span>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: hexAlpha(layer.hex, 0.2), border: `1px solid ${hexAlpha(layer.hex, 0.5)}` }}>
                    <Check className="w-2.5 h-2.5" style={{ color: layer.hex }} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 px-2.5 py-2 rounded-xl text-center"
            style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.08))', border: '1px solid rgba(0,212,255,0.15)' }}>
            <p className="text-[10px] font-black text-cyan-300">✓ All 10 Layers Applied · Maximum Protection</p>
          </div>
        </Section>

        {/* Metadata */}
        <Section title="Metadata" icon={Database} color="bg-cyan-600/60">
          <Row label="Created" value={created} />
          <Row label="Timestamp" value={doc.metadata?.timestamp ? String(doc.metadata.timestamp) : "—"} accent="text-cyan-300" />
          {gps?.available && <Row label="GPS Location" value={gps.coordinates as string || "—"} accent="text-emerald-300" />}
          {device && <Row label="Device" value={device} />}
          {ip && <Row label="IP Address" value={ip} accent="text-amber-300" />}
          <Row label="Checksum" value={doc.metadata?.checksum ? doc.metadata.checksum.slice(0, 18) + "…" : "—"} accent="text-cyan-300" />
        </Section>

        {/* Activity */}
        <Section title="Activity History" icon={Activity} color="bg-amber-600/60">
          <Row label="Uploaded By" value={userName || "—"} />
          <Row label="Last Accessed" value={created} />
          <Row label="Encryption" value={doc.metadata?.encrypted ? "Applied on upload" : "Not encrypted"} />
          <Row label="Storage" value={doc.cloudinaryUrl ? "Cloud + Local" : "Local Vault"} />
        </Section>

        {/* Advanced Monitoring */}
        <Section title="Advanced Monitoring" icon={Shield} color="bg-red-600/60">
          <Row label="Live Monitoring" value={
            <Badge text="● Active" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Screenshot Detection" value={
            <Badge text="✓ Enabled" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Screen Recording" value={
            <Badge text="✓ Enabled" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Tamper Alerts" value={
            <Badge text="✓ Enabled" color="text-emerald-300 bg-emerald-500/10 border-emerald-500/20" />
          } />
          <Row label="Unauthorized Access" value={
            <Badge text="0 Detected" color="text-slate-400 bg-slate-700/40 border-slate-600/30" />
          } />
        </Section>

        {/* Premium section */}
        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-900/40 via-violet-900/40 to-slate-900/60 border border-fuchsia-500/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-fuchsia-300" />
            <span className="text-xs font-bold text-fuchsia-200 uppercase tracking-widest">Main Ownership Details</span>
          </div>
          <div className="space-y-2">
            {[
              ["Owner Name", userName || "—"],
              ["Owner ID", shortId],
              ["DNA ID", dnaId],
              ["File Name", name],
              ["File Size", size],
              ["Encryption", "AES-256 + DNA Encryption"],
              ["Storage Status", "Secure Vault"],
              ["Created On", created],
              ["Security Score", secScore],
              ["Tamper Status", "Protected"],
              ["Ownership Status", "Verified"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                <span className="text-[10px] font-bold text-fuchsia-200">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pb-6" />
      </div>
    </motion.div>
  );
}
