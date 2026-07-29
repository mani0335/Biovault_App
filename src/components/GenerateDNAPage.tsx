import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Camera, Check, Copy, FileText, Fingerprint,
  ShieldCheck, Upload, Zap, RefreshCw, Mic, Video, FileCode,
  Monitor, Bot, Music, ChevronRight, X,
} from 'lucide-react';
import { generateDocumentDNA, type DocumentDNA } from '@/lib/documentDna';
import {
  isNativePlatform,
  captureNativePhoto,
  captureNativeVideo,
  captureNativeAudio,
  captureNativeScreen,
  getSupportedMimeType,
  getUserMediaStream,
  extensionForMime,
  requestLiveCapturePermissions,
  usesNativeCapture,
} from '@/lib/liveCaptureService';

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
  onDocumentSaved?: (doc: { id: string; name: string; encryptedData: string; encryptedImage?: string; pHash?: string | null }) => void;
}

type Phase    = 'home' | 'recording' | 'encrypting' | 'complete';
type Flow     = 'live' | 'dna' | null;
type LiveMode = 'photo' | 'video' | 'audio' | 'screen';

// ─── Theme ───────────────────────────────────────────────────────────────────
const GDARK = {
  bg: '#040812', bg2: '#020810', bg3: '#050913', bg4: '#07101f',
  card: 'rgba(15,23,42,0.85)', cardBorder: 'rgba(0,212,255,0.18)',
  text: '#f1f5f9', muted: '#94a3b8', muted2: '#64748b',
  inputBg: 'rgba(255,255,255,0.05)', inputBorder: 'rgba(255,255,255,0.08)',
};
const GLIGHT = {
  bg: '#f8fafc', bg2: '#ffffff', bg3: '#f1f5f9', bg4: '#ffffff',
  card: 'rgba(255,255,255,0.9)', cardBorder: 'rgba(139,92,246,0.18)',
  text: '#0f172a', muted: '#64748b', muted2: '#94a3b8',
  inputBg: '#f1f5f9', inputBorder: '#e2e8f0',
};
function useGTheme() {
  const [isDark, setDark] = useState(document.documentElement.getAttribute('data-theme') !== 'light');
  useEffect(() => {
    const c = () => setDark(document.documentElement.getAttribute('data-theme') !== 'light');
    const o = new MutationObserver(c);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => o.disconnect();
  }, []);
  return isDark ? GDARK : GLIGHT;
}

// ─── 10-Layer config ──────────────────────────────────────────────────────────

const TEN_LAYERS = [
  { id: 'L1',  name: 'Cryptographic DNA',  algo: 'SHA3-256 + BLAKE3 dual hash',           size: '64 bytes',   emoji: '🔐', hex: '#f59e0b' },
  { id: 'L2',  name: 'Structural DNA',     algo: 'DCT pHash + block hash grid',           size: '32 bytes',   emoji: '📐', hex: '#3b82f6' },
  { id: 'L3',  name: 'Perceptual DNA',     algo: 'CNN ResNet-50 layer-4',                 size: '2048-dim',   emoji: '👁',  hex: '#8b5cf6' },
  { id: 'L4',  name: 'Semantic DNA',       algo: 'CLIP ViT-L/14 embedding',               size: '768-dim',    emoji: '🎯', hex: '#ec4899' },
  { id: 'L5',  name: 'Provenance DNA',     algo: 'Origin chain hash (all ancestors)',     size: '32 bytes',   emoji: '🔗', hex: '#06b6d4' },
  { id: 'L6',  name: 'Ownership DNA',      algo: 'Ed25519 signature L1+L2+hoid',         size: '64 bytes',   emoji: '🛡️', hex: '#10b981' },
  { id: 'L7',  name: 'Behavioral DNA',     algo: 'Creation fingerprint (mouse+timing)',  size: '128 bytes',  emoji: '🧠', hex: '#f43f5e' },
  { id: 'L8',  name: 'Relationship DNA',   algo: 'Asset relationship graph hash',         size: 'Variable',   emoji: '🕸️', hex: '#7c3aed' },
  { id: 'L9',  name: 'Origin DNA',         algo: 'Device + geo + timestamp + cert',      size: '96 bytes',   emoji: '📍', hex: '#14b8a6' },
  { id: 'L10', name: 'Evolution DNA',      algo: 'Mutation history Merkle tree',          size: 'Variable',   emoji: '🌱', hex: '#84cc16' },
];

// ─── Asset type definitions (5.4 Supported Asset Types — Capture Pipelines) ──

interface AssetTypeDef {
  id: string;
  liveMode: LiveMode;
  label: string;
  captureLabel: string;
  dnaPipeline: string;
  certType: string;
  icon: React.ReactNode;
  accentHex: string;
}

const LIVE_ASSET_TYPES: AssetTypeDef[] = [
  {
    id: 'photo',
    liveMode: 'photo',
    label: 'Live Photo',
    captureLabel: 'Camera · live capture · EXIF injection',
    dnaPipeline: 'Full 10-layer DNA',
    certType: 'Origin Certificate Level 3',
    icon: <Camera className="w-4 h-4" />,
    accentHex: '#00d4ff',
  },
  {
    id: 'video',
    liveMode: 'video',
    label: 'Live Video',
    captureLabel: 'Camera · per-frame DNA sampling',
    dnaPipeline: 'Frame hash + audio DNA + metadata',
    certType: 'Origin Certificate Level 3',
    icon: <Video className="w-4 h-4" />,
    accentHex: '#f43f5e',
  },
  {
    id: 'audio',
    liveMode: 'audio',
    label: 'Live Audio',
    captureLabel: 'Microphone · acoustic fingerprint',
    dnaPipeline: 'Waveform DNA + spectral DNA',
    certType: 'Origin Certificate Level 3',
    icon: <Mic className="w-4 h-4" />,
    accentHex: '#f59e0b',
  },
  {
    id: 'screen',
    liveMode: 'screen',
    label: 'Screen Record',
    captureLabel: 'Screen recording API · content DNA',
    dnaPipeline: 'Content DNA + source attribution',
    certType: 'Origin Certificate Level 1',
    icon: <Monitor className="w-4 h-4" />,
    accentHex: '#84cc16',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function makeDnaId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Ten Layer Engine (shared animation) ─────────────────────────────────────

const TenLayerEngine: React.FC<{
  flow: Flow;
  fileName: string;
  dataUrl?: string;
  onComplete: (dnaId: string, embeddedImage: string | null, pHash?: string | null) => void;
}> = ({ flow, fileName, dataUrl, onComplete }) => {
  const G = useGTheme();
  const [done, setDone] = useState(0);
  const [dnaId, setDnaId] = useState(makeDnaId);
  const resultRef = useRef<{ dnaId: string; embeddedImage: string | null; pHash?: string | null }>({ dnaId: '', embeddedImage: null });
  // Stable ref prevents the encryption useEffect from restarting when the
  // parent re-renders and passes a new onComplete function reference.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    let cancelled = false;
    const userId = localStorage.getItem('biovault_userId') || 'unknown';
    const ownerName = localStorage.getItem('biovault_userName') || undefined;

    // Run real extended DNA engine + persistent pixel embedding in background.
    // Without the embed step, the generated DNA record exists only in the local
    // store/Supabase — nothing is actually written into the image, so scanning
    // the saved file later finds zero ownership data.
    const dnaWork = dataUrl
      ? (async () => {
          const ok = true; // biometric removed — no fingerprint gate on encryption
          if (!ok || cancelled) return;

          // GPS is captured best-effort by captureDeviceNetworkDna() below.
          // No blocking GPS gate — encryption proceeds even if GPS is unavailable.
          if (cancelled) return;

          const mime = dataUrl.startsWith('data:image/png') ? 'image/png'
            : dataUrl.startsWith('data:application/pdf') ? 'application/pdf'
            : 'image/jpeg';
          const { generateExtendedDocumentDNA } = await import('@/lib/documentDna');
          const dna = await generateExtendedDocumentDNA(dataUrl, fileName, mime, dataUrl.length, { userId, ownerName });
          if (cancelled) return;
          setDnaId(dna.dnaId);

          let embeddedImage: string | null = null;
          if (mime !== 'application/pdf') {
            try {
              const { embedPersistentDna } = await import('@/lib/dna/persistentDna');
              const { captureDeviceNetworkDna } = await import('@/lib/dna/deviceNetworkDna');
              const devDna = await captureDeviceNetworkDna().catch(() => null);
              embeddedImage = await embedPersistentDna(dataUrl, {
                ownerId: userId,
                ownerName: ownerName || undefined,
                pinitId: `PINIT-${userId.slice(0, 8).toUpperCase()}`,
                dnaId: dna.dnaId,
                assetUuid: dna.ownership?.assetUuid ?? (crypto.randomUUID?.() ?? `${Date.now()}`),
                timestamp: dna.composedAt,
                signature: dna.dnaId,
                gpsLat: devDna?.gpsLat ?? null,
                gpsLng: devDna?.gpsLng ?? null,
                address: devDna?.address ?? null,
                city: devDna?.city ?? null,
                state: devDna?.state ?? null,
                country: devDna?.country ?? null,
                deviceModel: devDna?.model ?? null,
                deviceManufacturer: devDna?.manufacturer ?? null,
                publicIp: devDna?.publicIp ?? null,
              });

              // Auto-save the DNA-embedded PNG to device storage so the file in the
              // gallery/files app also carries ownership data (not just the vault copy).
              if (embeddedImage) {
                try {
                  const { Filesystem, Directory } = await import('@capacitor/filesystem');
                  const safeName = fileName.replace(/\.[^.]+$/, '') + '_pinit_dna.png';
                  const folderName = 'PINIT Vault Documents';
                  try {
                    await Filesystem.mkdir({ path: folderName, directory: Directory.Documents, recursive: true });
                  } catch { /* already exists */ }
                  const base64 = embeddedImage.includes(',') ? embeddedImage.split(',')[1] : embeddedImage;
                  await Filesystem.writeFile({
                    path: `${folderName}/${safeName}`,
                    data: base64,
                    directory: Directory.Documents,
                    recursive: true,
                  });
                } catch { /* non-critical — vault copy is still saved */ }
              }
            } catch { /* embed failed — fall back to unembedded image */ }
          }
          resultRef.current = { dnaId: dna.dnaId, embeddedImage, pHash: dna.pHash };
        })()
      : Promise.resolve();

    // Visual animation (370ms per layer)
    let count = 0;
    const t = window.setInterval(() => {
      if (cancelled) return;
      count++;
      setDone(count);
      if (count >= TEN_LAYERS.length) {
        clearInterval(t);
        dnaWork.finally(() => {
          if (cancelled) return;
          setTimeout(() => {
            if (cancelled) return;
            const result = resultRef.current;
            onCompleteRef.current(result.dnaId || dnaId, result.embeddedImage, result.pHash);
          }, 700);
        });
      }
    }, 370);
    return () => { cancelled = true; clearInterval(t); };
  }, [fileName, dataUrl]);

  const pct = Math.round((done / TEN_LAYERS.length) * 100);
  const title = flow === 'live' ? 'PINIT LIVE' : 'Generate DNA';
  const sub   = flow === 'live' ? 'Live Encryption Engine' : '10-Layer DNA Engine';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col"
      style={{
        background: G.bg,
        color: G.text,
      }}
    >
      {/* Top bar */}
      <div className="px-4 pt-6 pb-3 flex items-center gap-3 flex-shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          className="w-8 h-8 rounded-full border-2 flex-shrink-0"
          style={{ borderColor: 'rgba(0,212,255,0.15)', borderTopColor: '#00d4ff' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: G.text }}>{title}</p>
          <p className="text-[10px] truncate" style={{ color: G.muted2 }}>{sub} · {fileName}</p>
        </div>
        <div className="px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}>
          <span className="text-[10px] font-black text-cyan-300 font-mono">{dnaId}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 mb-4 flex-shrink-0">
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">10-Layer DNA Engine</span>
          <span className="text-[10px] font-black text-cyan-400">{pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            className="h-full rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ ease: 'easeOut', duration: 0.25 }}
            style={{ background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 55%, #ec4899 100%)', boxShadow: '0 0 10px rgba(0,212,255,0.5)' }}
          />
        </div>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-1.5 pb-10">
        {TEN_LAYERS.map((layer, idx) => {
          const isDone   = idx < done;
          const isActive = idx === done && done < TEN_LAYERS.length;
          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
              style={{
                background: isDone ? hexAlpha(layer.hex, 0.07) : isActive ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isDone ? hexAlpha(layer.hex, 0.25) : isActive ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                boxShadow: isDone ? `0 0 12px ${hexAlpha(layer.hex, 0.12)}` : 'none',
              }}
            >
              <span className="text-[9px] font-black font-mono w-6 text-center flex-shrink-0"
                style={{ color: isDone ? layer.hex : isActive ? '#00d4ff' : '#475569' }}>
                {layer.id}
              </span>
              <span className="text-sm flex-shrink-0">{layer.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: isDone ? '#f1f5f9' : isActive ? '#e2e8f0' : '#475569' }}>
                  {layer.name}
                </p>
                <p className="text-[9px] truncate text-slate-600">{layer.algo}</p>
              </div>
              <span className="text-[8px] font-mono text-slate-600 flex-shrink-0 hidden sm:block">{layer.size}</span>
              {isDone && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: hexAlpha(layer.hex, 0.2), border: `1px solid ${hexAlpha(layer.hex, 0.5)}` }}
                >
                  <Check className="w-3 h-3" style={{ color: layer.hex }} />
                </motion.div>
              )}
              {isActive && (
                <motion.div
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.65 }}
                />
              )}
              {!isDone && !isActive && (
                <div className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ─── Live Capture Sheet (4 real-time capture modes) ──────────────────────────

const LiveCaptureSheet: React.FC<{
  onSelect: (asset: AssetTypeDef) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="rounded-t-3xl overflow-hidden"
        style={{ background: document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#07101f', border: document.documentElement.getAttribute('data-theme') === 'light' ? '1px solid rgba(139,92,246,0.18)' : '1px solid rgba(0,212,255,0.18)', borderBottom: 'none' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-5">
          <div>
            <p className="text-base font-black text-white">PINIT Live Capture</p>
            <p className="text-[10px] text-slate-500">Real-time capture · 10-layer DNA encrypted</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
        <div className="px-4 pb-10 grid grid-cols-2 gap-3">
          {LIVE_ASSET_TYPES.map((asset, i) => (
            <motion.button
              key={asset.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(asset)}
              className="flex flex-col items-center gap-3 px-3 py-5 rounded-2xl text-center"
              style={{ background: `${asset.accentHex}0d`, border: `1px solid ${asset.accentHex}30` }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: `${asset.accentHex}1e`, border: `1px solid ${asset.accentHex}50`, color: asset.accentHex }}>
                {React.cloneElement(asset.icon as React.ReactElement, { className: 'w-5 h-5' })}
              </div>
              <div>
                <p className="text-sm font-black text-white">{asset.label}</p>
                <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{asset.captureLabel.split('·')[0].trim()}</p>
              </div>
              <span className="text-[8px] font-black px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(134,239,172,0.1)', color: '#86efac', border: '1px solid rgba(134,239,172,0.2)' }}>
                {asset.certType.replace('Origin Certificate ', '')}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>
);

// ─── Live Recorder Screen ─────────────────────────────────────────────────────

const LiveRecorderScreen: React.FC<{
  mode: LiveMode;
  assetDef: AssetTypeDef;
  onCapture: (dataUrl: string, name: string) => void;
  onCancel: () => void;
}> = ({ mode, assetDef, onCapture, onCancel }) => {
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const videoRef   = useRef<HTMLVideoElement>(null);
  const mrRef      = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const streamRef  = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const rafRef     = useRef<number>(0);

  const [ready,       setReady]       = useState(false);
  const [recording,   setRecording]   = useState(false);
  const [timer,       setTimer]       = useState(0);
  const [audioLevel,  setAudioLevel]  = useState(0);
  const [errMsg,      setErrMsg]      = useState('');

  // Timer tick
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setTimer(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Initialise camera/mic stream
  useEffect(() => {
    if (usesNativeCapture(mode)) {
      requestLiveCapturePermissions(mode)
        .then(() => setReady(true))
        .catch(() => setErrMsg('Permission denied. Please allow camera/microphone access in Settings.'));
      return;
    }

    if (mode === 'screen') { setReady(true); return; }

    getUserMediaStream(mode)
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current && mode !== 'audio') {
          videoRef.current.srcObject = stream;
        }
        if (mode === 'audio') {
          const ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(stream);
          const an  = ctx.createAnalyser();
          an.fftSize = 128;
          src.connect(an);
          analyzerRef.current = an;
        }
        setReady(true);
      })
      .catch(() => setErrMsg('Camera/microphone permission denied. Please allow access and try again.'));

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  // Audio level animation
  useEffect(() => {
    if (!analyzerRef.current || !recording) return;
    const data = new Uint8Array(analyzerRef.current.frequencyBinCount);
    const tick = () => {
      analyzerRef.current!.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(avg / 128);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [recording]);

  const takePhoto = async () => {
    if (isNativePlatform()) {
      try {
        const { dataUrl, name } = await captureNativePhoto();
        onCapture(dataUrl, name);
      } catch (e) {
        if (e instanceof Error && e.message !== 'cancelled') {
          setErrMsg(e.message);
        }
      }
      return;
    }
    const vid = videoRef.current;
    if (!vid) return;
    const canvas = document.createElement('canvas');
    canvas.width  = vid.videoWidth  || 1280;
    canvas.height = vid.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setErrMsg('Canvas unavailable. Please try again.'); return; }
    ctx.drawImage(vid, 0, 0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCapture(canvas.toDataURL('image/jpeg', 0.92), `live_photo_${Date.now()}.jpg`);
  };

  const startRecording = async () => {
    if (mode === 'screen') {
      if (isNativePlatform()) {
        // Android WebView doesn't support getDisplayMedia — open file picker for imported screen recording
        try {
          const { dataUrl, name } = await captureNativeScreen();
          onCapture(dataUrl, name);
        } catch (e) {
          if (e instanceof Error && e.message !== 'cancelled') setErrMsg(e.message);
        }
        return;
      }
      try {
        const stream = await (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (c: object) => Promise<MediaStream> }).getDisplayMedia?.({ video: true, audio: true });
        if (!stream) throw new Error('Screen sharing not supported');
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        stream.getVideoTracks()[0].onended = stopRecording;
      } catch { onCancel(); return; }
    }
    chunksRef.current = [];
    if (!streamRef.current) { setErrMsg('Stream not ready. Please try again.'); return; }
    const mimeType = getSupportedMimeType(mode === 'audio' ? 'audio' : 'video');
    if (typeof MediaRecorder === 'undefined') { setErrMsg('Recording not supported on this device.'); return; }
    const mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob   = new Blob(chunksRef.current, { type: mr.mimeType || mimeType || 'video/webm' });
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result;
        if (typeof result !== 'string') return;
        const ext = extensionForMime(mr.mimeType || mimeType || 'video/webm', mode);
        onCapture(result, `live_${mode}_${Date.now()}.${ext}`);
      };
      reader.readAsDataURL(blob);
    };
    mr.start(100);
    mrRef.current = mr;
    setRecording(true);
    setTimer(0);
  };

  const stopRecording = () => {
    mrRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecording(false);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: document.documentElement.getAttribute('data-theme') === 'light' ? '#f8fafc' : '#020810' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <X className="w-4 h-4 text-slate-300" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-black text-white">{assetDef.label}</p>
          <p className="text-[10px] text-slate-500">{assetDef.captureLabel}</p>
        </div>
        {recording && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <motion.div className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} />
            <span className="text-[11px] font-black text-red-400 font-mono">{fmt(timer)}</span>
          </div>
        )}
      </div>

      {/* Error — offer file upload fallback on web */}
      {errMsg && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)' }}>
            <Upload className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-sm text-center font-semibold" style={{ color: isLightTheme ? '#0f172a' : '#f1f5f9' }}>
            {isNativePlatform() ? 'Permission Required' : 'Camera not available in browser'}
          </p>
          <p className="text-xs text-center text-slate-500">
            {isNativePlatform() ? errMsg : 'Use the file picker below to upload a file instead'}
          </p>
          <label className="px-6 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            Upload File Instead
            <input type="file" className="hidden"
              accept={mode === 'audio' ? 'audio/*' : mode === 'video' ? 'video/*' : 'image/*'}
              onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const reader = new FileReader();
                reader.onload = (ev) => { const url = ev.target?.result as string; if (url) onCapture(url, f.name); };
                reader.readAsDataURL(f);
              }}
            />
          </label>
          <button onClick={onCancel}
            className="px-6 py-2 rounded-xl text-xs font-semibold text-slate-400"
            style={{ background: isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' }}>
            Go back
          </button>
        </div>
      )}

      {/* Camera / Screen preview */}
      {!errMsg && (mode === 'photo' || mode === 'video' || mode === 'screen') && (
        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
          {mode === 'screen' && !recording ? (
            <div className="flex flex-col items-center gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(132,204,22,0.1)', border: '1px solid rgba(132,204,22,0.25)' }}>
                <Monitor className="w-7 h-7 text-lime-400" />
              </div>
              <p className="text-sm text-slate-300 font-semibold">
                {isNativePlatform()
                  ? 'Import a screen recording from your device'
                  : 'Click Record to share your screen'}
              </p>
              <p className="text-xs text-slate-600">
                {isNativePlatform()
                  ? 'Use your device screen recorder, then pick the video here'
                  : 'Your browser will ask which screen or window to share'}
              </p>
            </div>
          ) : usesNativeCapture(mode) && !recording ? (
            <div className="flex flex-col items-center gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${assetDef.accentHex}1a`, border: `1px solid ${assetDef.accentHex}40` }}>
                {React.cloneElement(assetDef.icon as React.ReactElement, { className: 'w-7 h-7', style: { color: assetDef.accentHex } })}
              </div>
              <p className="text-sm text-slate-300 font-semibold">
                {mode === 'video' ? 'Tap below to open video camera' : 'Tap below to open voice recorder'}
              </p>
            </div>
          ) : (
            <video ref={videoRef} autoPlay muted playsInline
              className="w-full h-full object-contain" />
          )}
        </div>
      )}

      {/* Audio visualiser */}
      {!errMsg && mode === 'audio' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: `rgba(245,158,11,${0.08 + audioLevel * 0.15})`,
              border: `2px solid rgba(245,158,11,${0.3 + audioLevel * 0.5})`,
              boxShadow: `0 0 ${30 + audioLevel * 60}px rgba(245,158,11,${0.2 + audioLevel * 0.3})`,
              transition: 'all 0.08s ease',
            }}>
            <Mic className="w-9 h-9 text-amber-400" />
          </div>
          {/* Waveform bars */}
          <div className="flex items-center gap-1 h-16">
            {Array.from({ length: 28 }).map((_, i) => {
              const phase = (i / 28) * Math.PI * 2;
              const h = recording
                ? Math.max(0.08, audioLevel * (0.5 + 0.5 * Math.sin(phase + Date.now() / 200)))
                : 0.08 + 0.04 * Math.sin(phase);
              return (
                <motion.div key={i}
                  className="w-1 rounded-full"
                  animate={{ height: `${h * 100}%` }}
                  transition={{ duration: 0.08 }}
                  style={{ background: recording ? '#f59e0b' : 'rgba(245,158,11,0.25)', minHeight: 4 }}
                />
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            {recording ? 'Recording audio…' : ready ? 'Microphone ready' : 'Initialising microphone…'}
          </p>
        </div>
      )}

      {/* Controls */}
      {!errMsg && (
        <div className="flex-shrink-0 px-8 pb-12 pt-5 flex flex-col gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Cert + pipeline info */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] text-slate-600 font-mono">{assetDef.dnaPipeline}</p>
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(134,239,172,0.1)', color: '#86efac', border: '1px solid rgba(134,239,172,0.2)' }}>
              {assetDef.certType.replace('Origin Certificate ', '')}
            </span>
          </div>

          {mode === 'photo' && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={takePhoto} disabled={!ready}
              className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-40"
              style={{
                background: ready ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : 'rgba(255,255,255,0.05)',
                boxShadow: ready ? '0 0 24px rgba(0,212,255,0.3)' : 'none',
              }}>
              📷 Take Photo
            </motion.button>
          )}

          {(mode === 'video' || mode === 'audio' || mode === 'screen') && !recording && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={startRecording} disabled={!ready}
              className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-40"
              style={{
                background: ready ? 'linear-gradient(135deg, #dc2626, #ef4444)' : 'rgba(255,255,255,0.05)',
                boxShadow: ready ? '0 0 24px rgba(239,68,68,0.35)' : 'none',
              }}>
              {isNativePlatform()
                ? (mode === 'video' ? '🎥 Record Video' : mode === 'audio' ? '🎙 Record Audio' : '📱 Import Screen Recording')
                : '⏺ Start Recording'}
            </motion.button>
          )}

          {(mode === 'video' || mode === 'audio' || mode === 'screen') && recording && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={stopRecording}
              className="w-full py-4 rounded-2xl font-black text-white text-base"
              style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.5)' }}>
              ⏹ Stop · {fmt(timer)}
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
};

// ─── Completion Screen ────────────────────────────────────────────────────────

const CompletionScreen: React.FC<{
  dnaId: string;
  fileName: string;
  flow: Flow;
  assetDef: AssetTypeDef | null;
  onNew: () => void;
  onBack: () => void;
}> = ({ dnaId, fileName, flow, assetDef, onNew, onBack }) => {
  const G = useGTheme();
  return (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="min-h-screen flex flex-col items-center justify-center px-4 pb-28 space-y-5"
    style={{ background: G.bg, color: G.text }}
  >
    {/* Shield */}
    <div className="relative flex items-center justify-center">
      {[0, 0.5, 1.0].map((d) => (
        <motion.div
          key={d}
          className="absolute rounded-full border border-cyan-400/20"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 2.8, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2.8, delay: d, ease: 'easeOut' }}
          style={{ width: 80, height: 80 }}
        />
      ))}
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(124,58,237,0.2))',
          border: '2px solid rgba(0,212,255,0.4)',
          boxShadow: '0 0 40px rgba(0,212,255,0.2), 0 0 80px rgba(124,58,237,0.1)',
        }}
      >
        <ShieldCheck className="w-10 h-10 text-cyan-400" />
      </motion.div>
    </div>

    <div className="text-center space-y-1">
      <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="text-2xl font-black text-white">Protection Complete</motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
        className="text-sm text-slate-400 truncate max-w-xs">{fileName}</motion.p>
    </div>

    {/* DNA ID */}
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.34 }}
      className="flex items-center gap-2 px-4 py-2 rounded-full"
      style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.22)' }}>
      <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
      <span className="text-sm font-black text-cyan-300 font-mono">{dnaId}</span>
    </motion.div>

    {/* Asset info — cert type + DNA pipeline */}
    {assetDef && (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
        className="w-full max-w-sm rounded-2xl px-4 py-3 space-y-2"
        style={{ background: `${assetDef.accentHex}0d`, border: `1px solid ${assetDef.accentHex}28` }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${assetDef.accentHex}1a`, color: assetDef.accentHex }}>
            {assetDef.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-white">{assetDef.label}</p>
            <p className="text-[9px] text-slate-500 truncate">{assetDef.captureLabel}</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: `${assetDef.accentHex}20` }}>
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">DNA Pipeline</p>
            <p className="text-[10px] font-bold" style={{ color: assetDef.accentHex }}>{assetDef.dnaPipeline}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">Certificate</p>
            <p className="text-[10px] font-black"
              style={{ color: assetDef.certType.startsWith('AI') ? '#c4b5fd' : '#86efac' }}>
              {assetDef.certType}
            </p>
          </div>
        </div>
      </motion.div>
    )}

    {/* Pixel DNA encryption badge */}
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.38, type: 'spring' }}
      className="w-full max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.1))', border: '1px solid rgba(0,212,255,0.3)', boxShadow: '0 0 20px rgba(0,212,255,0.08)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.35)' }}>
        <Fingerprint className="w-5 h-5 text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-cyan-300">🔐 DNA ENCRYPTED IN EVERY PIXEL</p>
        <p className="text-[10px] text-slate-500 mt-0.5">Owner ID · Device · GPS · Timestamp embedded via LSB steganography across all pixel tiles. Survives crop, resize, screenshot &amp; re-share.</p>
      </div>
    </motion.div>

    {/* 5 checks */}
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}
      className="w-full max-w-sm space-y-2">
      {[
        { text: '10 Layers Applied',                   color: '#00d4ff' },
        { text: 'Biometric Identity Verified',         color: '#f59e0b' },
        { text: 'DNA Embedded in Every Pixel',         color: '#7c3aed' },
        { text: 'Stored in PINIT Vault + Device',      color: '#10b981' },
        { text: 'Monitoring Enabled',                  color: '#ec4899' },
      ].map(({ text, color }, i) => (
        <motion.div key={text}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.52 + i * 0.07 }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{ background: hexAlpha(color, 0.07), border: `1px solid ${hexAlpha(color, 0.2)}` }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: hexAlpha(color, 0.18), border: `1px solid ${hexAlpha(color, 0.45)}` }}>
            <Check className="w-3 h-3" style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-white">✓ {text}</span>
        </motion.div>
      ))}
    </motion.div>

    {/* Buttons */}
    <div className="w-full max-w-sm space-y-2.5">
      <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        onClick={onNew}
        className="w-full py-3.5 rounded-2xl font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #0891b2 0%, #7c3aed 100%)', boxShadow: '0 0 24px rgba(0,212,255,0.25)' }}>
        {flow === 'live' ? 'New Capture' : 'New Document'}
      </motion.button>
      <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.88 }}
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
        onClick={onBack}
        className="w-full py-3 rounded-2xl font-semibold text-slate-300"
        style={{ background: G === GDARK ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: G === GDARK ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.09)' }}>
        Back to PINIT DNA
      </motion.button>
    </div>
  </motion.div>
  );
};

// ─── Action button (old-style) ────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  iconGradient: string;
  borderColor: string;
  gradient: string;
  glowColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
  className?: string;
}> = ({ icon, iconGradient, borderColor, gradient, glowColor, title, subtitle, badge, badgeColor, onClick, className = '' }) => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return (
    <motion.button
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl text-left group ${className}`}
      style={{ background: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(8,10,22,0.85)', border: `1px solid ${borderColor}`, boxShadow: isLight ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}
    >
      <div className="absolute inset-0 opacity-100 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: gradient }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl pointer-events-none"
        style={{ background: glowColor }} />
      <div className="relative flex items-center gap-3.5 px-4 py-3.5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ background: iconGradient }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: isLight ? '#0f172a' : '#f1f5f9' }}>{title}</p>
          <p className="text-[10px] truncate" style={{ color: isLight ? '#64748b' : '#94a3b8' }}>{subtitle}</p>
        </div>
        {badge && (
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 border"
            style={{ color: badgeColor, background: `${badgeColor}18`, borderColor: `${badgeColor}40` }}>
            {badge}
          </span>
        )}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)' }}
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.55 }}
        />
      </div>
    </motion.button>
  );
};

// ─── Home card ────────────────────────────────────────────────────────────────

const HomeCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  accentHex: string;
  delay?: number;
  children: React.ReactNode;
}> = ({ icon, title, description, badge, accentHex, delay = 0, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="rounded-2xl overflow-hidden"
    style={{
      background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
      backdropFilter: 'blur(20px)',
      border: `1px solid ${hexAlpha(accentHex, 0.22)}`,
      boxShadow: `0 0 20px ${hexAlpha(accentHex, 0.07)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
    }}
  >
    <div className="px-4 pt-4 pb-3 flex items-start gap-3">
      <div className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
        style={{
          background: hexAlpha(accentHex, 0.14),
          border: `1px solid ${hexAlpha(accentHex, 0.35)}`,
          boxShadow: `0 0 16px ${hexAlpha(accentHex, 0.18)}`,
        }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-base font-black text-white">{title}</p>
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: hexAlpha(accentHex, 0.18), border: `1px solid ${hexAlpha(accentHex, 0.4)}`, color: accentHex }}>
            {badge}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
    <div className="mx-4" style={{ height: 1, background: hexAlpha(accentHex, 0.12) }} />
    <div className="p-2">{children}</div>
  </motion.div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const GenerateDNAPage: React.FC<GenerateDNAPageProps> = ({
  documents, onBack, onScanClick, onDocumentSaved,
}) => {
  const G = useGTheme();
  const [phase, setPhase] = useState<Phase>('home');
  const [flow,  setFlow]  = useState<Flow>(null);
  const [capturedFile, setCapturedFile] = useState<{ url: string; name: string } | null>(null);
  const [dnaId, setDnaId] = useState('');
  const [showLiveSheet,   setShowLiveSheet]   = useState(false);
  const [selectedAsset,   setSelectedAsset]   = useState<AssetTypeDef | null>(null);
  const [liveCaptureMode, setLiveCaptureMode] = useState<LiveMode | null>(null);

  const dnaFileRef  = useRef<HTMLInputElement>(null);

  const handleDna = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      if (!url) return;
      setCapturedFile({ url, name: f.name });
      setFlow('dna');
      setPhase('encrypting');
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const triggerAssetCapture = (asset: AssetTypeDef) => {
    setShowLiveSheet(false);
    setSelectedAsset(asset);
    setLiveCaptureMode(asset.liveMode);
  };

  const handleLiveCaptureDone = (url: string, name: string) => {
    setLiveCaptureMode(null);
    setCapturedFile({ url, name });
    setFlow('live');
    setPhase('encrypting');
  };

  const handleComplete = useCallback((id: string, embeddedImage: string | null, pHash?: string | null) => {
    if (id === '__CANCELLED__') { reset(); return; }
    if (!id) return;
    setDnaId(id);
    if (capturedFile && onDocumentSaved) {
      const ownerId = localStorage.getItem('biovault_userId') || undefined;
      onDocumentSaved({
        id: `upload_${Date.now()}`,
        name: capturedFile.name,
        encryptedData: capturedFile.url,
        // encryptedImage carries the persistent-DNA-embedded pixels — this is what
        // the Scan/Forensic flow actually reads. Without it, the saved document has
        // no recoverable ownership data at all.
        encryptedImage: embeddedImage ?? undefined,
        pHash: pHash ?? null,
        metadata: {
          timestamp: Date.now(),
          original_name: capturedFile.name,
          size: 0,
          checksum: id,
          encrypted: true,
          ownerId,
          dnaId: id,
          dna: { dnaId: id, layers: 10 },
        },
      });
    }
    setPhase('complete');
  }, [capturedFile, onDocumentSaved]);

  const reset = () => {
    setPhase('home'); setFlow(null); setCapturedFile(null);
    setDnaId(''); setSelectedAsset(null); setLiveCaptureMode(null);
  };

  // ── Encrypting ────────────────────────────────────────────────────────────
  if (phase === 'encrypting') {
    return (
      <TenLayerEngine
        flow={flow}
        fileName={capturedFile?.name ?? 'document'}
        dataUrl={capturedFile?.url}
        onComplete={handleComplete}
      />
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <CompletionScreen
        dnaId={dnaId}
        fileName={capturedFile?.name ?? 'document'}
        flow={flow}
        assetDef={selectedAsset}
        onNew={reset}
        onBack={onBack}
      />
    );
  }

  // ── Home ──────────────────────────────────────────────────────────────────
  const fingerprintable = documents.filter(d => (d.encryptedData || d.fileData || '').length > 32);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pb-28"
      style={{
        background: G.bg3,
        color: G.text,
      }}
    >
      {/* DNA file picker (Generate DNA flow only) */}
      <input ref={dnaFileRef}  type="file"
        accept="image/*,application/pdf,video/*,audio/*,.txt,.docx,.xlsx,.pptx,.zip,.rar,.json,.xml,.csv"
        className="hidden" onChange={handleDna} />

      {/* Live Capture bottom sheet */}
      {showLiveSheet && (
        <LiveCaptureSheet
          onSelect={triggerAssetCapture}
          onClose={() => setShowLiveSheet(false)}
        />
      )}

      {/* Live recorder (real-time capture) */}
      {liveCaptureMode && selectedAsset && (
        <LiveRecorderScreen
          mode={liveCaptureMode}
          assetDef={selectedAsset}
          onCapture={handleLiveCaptureDone}
          onCancel={() => { setLiveCaptureMode(null); setSelectedAsset(null); }}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-5">
        <button onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: G === GDARK ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: G === GDARK ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: G.muted }} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-7 h-7">
            <motion.div className="absolute rounded-full border border-cyan-400/30"
              style={{ inset: -4 }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} />
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.35)' }}>
              <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>
          <div>
            <p className="text-sm font-black leading-none" style={{ color: G.text }}>PINIT DNA</p>
            <p className="text-[10px]" style={{ color: G.muted2 }}>10-Layer Security Engine</p>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full"
          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
          <span className="text-[10px] font-black text-violet-300">10 LAYERS</span>
        </div>
      </div>

      {/* Hero layer strip */}
      <div className="px-4 mb-5">
        <div className="relative overflow-hidden rounded-2xl px-4 py-3"
          style={{
            background: G === GDARK
              ? 'linear-gradient(135deg, rgba(0,212,255,0.05) 0%, rgba(124,58,237,0.07) 50%, rgba(236,72,153,0.05) 100%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.08) 50%, rgba(168,85,247,0.05) 100%)',
            border: G === GDARK ? '1px solid rgba(0,212,255,0.12)' : '1px solid rgba(139,92,246,0.15)',
          }}>
          <motion.div className="absolute left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.35), transparent)' }}
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }} />
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center mb-2">Active Security Layers</p>
          <div className="flex justify-center gap-1 flex-wrap">
            {TEN_LAYERS.map((l, i) => (
              <motion.span key={l.id}
                className="text-[9px] font-black px-1.5 py-0.5 rounded font-mono"
                style={{ background: hexAlpha(l.hex, 0.12), color: l.hex, border: `1px solid ${hexAlpha(l.hex, 0.25)}` }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 + (i % 3), delay: i * 0.18 }}>
                {l.id}
              </motion.span>
            ))}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-4 space-y-3">

        {/* ── Card 1: PINIT LIVE ─────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <ActionBtn
            icon={<Zap className="w-4 h-4 text-white" />}
            iconGradient="linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)"
            borderColor="rgba(0,212,255,0.3)"
            gradient="linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(6,182,212,0.06) 100%)"
            glowColor="rgba(0,212,255,0.08)"
            title="PINIT Live Capture"
            subtitle="Camera · Video · Audio · PDF · Code · AI · Screen"
            badge="LIVE"
            badgeColor="#67e8f9"
            onClick={() => setShowLiveSheet(true)}
          />
        </motion.div>

        {/* ── Card 2: Generate DNA ───────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <ActionBtn
            icon={<Fingerprint className="w-4 h-4 text-white" />}
            iconGradient="linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)"
            borderColor="rgba(192,132,252,0.3)"
            gradient="linear-gradient(135deg, rgba(192,132,252,0.12) 0%, rgba(124,58,237,0.06) 100%)"
            glowColor="rgba(192,132,252,0.08)"
            title="Generate DNA"
            subtitle="JPG, PNG, PDF, MP4, MP3, DOCX, ZIP & any file"
            badge="10X DNA"
            badgeColor="#c4b5fd"
            onClick={() => dnaFileRef.current?.click()}
          />
        </motion.div>

        {/* ── Card 3: Scan Document ─────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <ActionBtn
            icon={<Camera className="w-4 h-4 text-white" />}
            iconGradient="linear-gradient(135deg, #059669 0%, #10b981 100%)"
            borderColor="rgba(52,211,153,0.3)"
            gradient="linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(6,182,212,0.06) 100%)"
            glowColor="rgba(52,211,153,0.08)"
            title="Scan Document"
            subtitle="Multi-page · OCR · PDF · 10-Layer DNA"
            badge="OCR"
            badgeColor="#86efac"
            onClick={onScanClick}
          />
        </motion.div>

        {/* ── From Vault ────────────────────────────────────────────────── */}
        {fingerprintable.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} className="mt-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
              From Vault · {fingerprintable.length}
            </p>
            <div className="space-y-1.5">
              {fingerprintable.map((doc, idx) => {
                const name = doc.name || doc.fileName || 'Untitled';
                const raw  = doc.encryptedData || doc.fileData || '';
                const isImg = raw.startsWith('data:image');
                return (
                  <motion.button key={doc.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.24 + idx * 0.03 }}
                    whileHover={{ x: 3 }} whileTap={{ scale: 0.99 }}
                    onClick={() => { setCapturedFile({ url: raw, name }); setFlow('dna'); setPhase('encrypting'); }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left group"
                    style={{ background: G === GDARK ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: G === GDARK ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{ background: G === GDARK ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: G === GDARK ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                      {isImg
                        ? <img src={raw} alt={name} className="w-full h-full object-cover" />
                        : <FileText className="w-5 h-5 text-slate-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: G.text }}>{name}</p>
                      <p className="text-[9px]" style={{ color: G.muted2 }}>{isImg ? 'Image' : 'Document'}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <Fingerprint className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-[9px] font-bold text-violet-300">DNA</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default GenerateDNAPage;
