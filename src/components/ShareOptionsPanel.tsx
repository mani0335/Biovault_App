/**
 * ShareOptionsPanel.tsx
 * Two-tab share UI shown after a share link is generated.
 *
 * Tab 1 – Share Link: copy button + platform buttons (WhatsApp, Telegram,
 *   Twitter/X, Facebook, LinkedIn, Email, native share), each embedding
 *   ?via={platform} in the URL for tracking.
 *
 * Tab 2 – Share Thumbnail: canvas-rendered branded card with file name,
 *   PINIT badge, and QR-code hint, downloadable as PNG or shared natively.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Download, Image, Link2, Share2, FileImage } from 'lucide-react';

// ─── Platform config ──────────────────────────────────────────────────────────

type PlatformId =
  | 'whatsapp' | 'telegram' | 'twitter' | 'facebook'
  | 'linkedin' | 'email' | 'native';

interface Platform {
  id: PlatformId;
  label: string;
  emoji: string;
  color: string;
  borderColor: string;
  getShareUrl: (trackedLink: string) => string;
  opensNative?: boolean;
}

const PLATFORMS: Platform[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    emoji: '💬',
    color: 'rgba(37,211,102,0.15)',
    borderColor: 'rgba(37,211,102,0.4)',
    getShareUrl: (link) =>
      `https://wa.me/?text=${encodeURIComponent('🔒 Secure PINIT file: ' + link)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    emoji: '✈️',
    color: 'rgba(38,160,218,0.15)',
    borderColor: 'rgba(38,160,218,0.4)',
    getShareUrl: (link) =>
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🔒 View my secure PINIT file')}`,
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    emoji: '𝕏',
    color: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.2)',
    getShareUrl: (link) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent('📄 Sharing a secure PINIT DNA-verified file')}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    emoji: '📘',
    color: 'rgba(66,103,178,0.15)',
    borderColor: 'rgba(66,103,178,0.4)',
    getShareUrl: (link) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    emoji: '💼',
    color: 'rgba(10,102,194,0.15)',
    borderColor: 'rgba(10,102,194,0.4)',
    getShareUrl: (link) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
  },
  {
    id: 'email',
    label: 'Email',
    emoji: '📧',
    color: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.4)',
    getShareUrl: (link) =>
      `mailto:?subject=${encodeURIComponent('Secure PINIT File')}&body=${encodeURIComponent('View this DNA-verified secure file:\n' + link)}`,
  },
];

// ─── Canvas thumbnail generator ───────────────────────────────────────────────

async function generateThumbnailCard(
  fileName: string,
  shareLink: string,
  filePreview?: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 380;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 640, 380);
  bg.addColorStop(0, '#0a0f1e');
  bg.addColorStop(0.6, '#0f172a');
  bg.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, 640, 380, 18);
  ctx.fill();

  // Subtle grid overlay
  ctx.strokeStyle = 'rgba(139,92,246,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 380); ctx.stroke();
  }
  for (let y = 0; y < 380; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
  }

  // Top bar
  const topBar = ctx.createLinearGradient(0, 0, 640, 0);
  topBar.addColorStop(0, 'rgba(139,92,246,0.6)');
  topBar.addColorStop(1, 'rgba(6,182,212,0.4)');
  ctx.fillStyle = topBar;
  ctx.roundRect(0, 0, 640, 48, [18, 18, 0, 0]);
  ctx.fill();

  // PINIT DNA logo text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('🔒 PINIT DNA', 20, 30);

  // "DNA SECURED" badge
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.roundRect(520, 12, 100, 24, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DNA VERIFIED ✓', 570, 28);
  ctx.textAlign = 'left';

  // Left column: file preview
  const previewX = 20;
  const previewY = 68;
  const previewW = 220;
  const previewH = 230;

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(139,92,246,0.3)';
  ctx.lineWidth = 1.5;
  ctx.roundRect(previewX, previewY, previewW, previewH, 12);
  ctx.fill();
  ctx.stroke();

  if (filePreview && filePreview.startsWith('data:image')) {
    await new Promise<void>((res) => {
      const img = new window.Image();
      img.onload = () => {
        // Scale to fit while keeping aspect ratio
        const scale = Math.min(previewW / img.width, previewH / img.height) * 0.9;
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = previewX + (previewW - dw) / 2;
        const dy = previewY + (previewH - dh) / 2;
        ctx.save();
        ctx.roundRect(previewX, previewY, previewW, previewH, 12);
        ctx.clip();
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
        res();
      };
      img.onerror = () => res();
      img.src = filePreview;
    });
  } else {
    // File-type icon placeholder
    ctx.fillStyle = 'rgba(139,92,246,0.3)';
    ctx.font = '64px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('📄', previewX + previewW / 2, previewY + previewH / 2 + 20);
    ctx.textAlign = 'left';
  }

  // Right column: metadata
  const rx = 260;
  let ry = 80;

  // Glow accent
  const glow = ctx.createRadialGradient(rx + 80, 180, 0, rx + 80, 180, 160);
  glow.addColorStop(0, 'rgba(139,92,246,0.12)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(rx, 50, 360, 300);

  // File name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  const nameTrunc = fileName.length > 28 ? fileName.slice(0, 25) + '…' : fileName;
  ctx.fillText(nameTrunc, rx, ry + 20);
  ry += 40;

  // Divider
  ctx.fillStyle = 'rgba(139,92,246,0.4)';
  ctx.fillRect(rx, ry, 350, 1);
  ry += 16;

  // DNA Secured label
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(139,92,246,0.9)';
  ctx.fillText('🔐  Secured with PINIT DNA™', rx, ry + 4);
  ry += 24;

  // Short URL display
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(6,182,212,0.8)';
  const shortUrl = shareLink.length > 50 ? shareLink.slice(0, 47) + '…' : shareLink;
  ctx.fillText(shortUrl, rx, ry + 4);
  ry += 28;

  // Scan QR hint
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('↗  Click link or scan QR to access securely', rx, ry + 4);
  ry += 30;

  // QR code (loaded from external service)
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&bgcolor=000000&color=8b5cf6&data=${encodeURIComponent(shareLink)}`;
    await new Promise<void>((res) => {
      const qr = new window.Image();
      qr.crossOrigin = 'anonymous';
      qr.onload = () => {
        ctx.save();
        ctx.roundRect(rx, ry, 84, 84, 8);
        ctx.clip();
        ctx.drawImage(qr, rx, ry, 84, 84);
        ctx.restore();
        res();
      };
      qr.onerror = () => res();
      qr.src = qrUrl;
    });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px system-ui';
    ctx.fillText('Scan QR code', rx + 92, ry + 30);
    ctx.fillText('to open securely', rx + 92, ry + 44);
  } catch { /* qr loading failed — no big deal */ }
  ry += 100;

  // Bottom branding bar
  const bottomBar = ctx.createLinearGradient(0, 330, 640, 380);
  bottomBar.addColorStop(0, 'rgba(139,92,246,0.25)');
  bottomBar.addColorStop(1, 'rgba(6,182,212,0.15)');
  ctx.fillStyle = bottomBar;
  ctx.fillRect(0, 340, 640, 40);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PINIT VAULT — Human-Origin Identity DNA Protection', 320, 364);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ShareOptionsPanelProps {
  shareLink: string;
  fileName: string;
  filePreview?: string;  // encrypted image data URL — used for both thumbnail preview and direct file share
}

// ─── Component ────────────────────────────────────────────────────────────────

const ShareOptionsPanel: React.FC<ShareOptionsPanelProps> = ({
  shareLink,
  fileName,
  filePreview,
}) => {
  const [tab, setTab] = useState<'link' | 'thumbnail'>('link');
  const [copied, setCopied] = useState(false);
  const [sharedPlatforms, setSharedPlatforms] = useState<Set<string>>(new Set());
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [thumbShared, setThumbShared] = useState(false);
  const [fileSharing, setFileSharing] = useState(false);
  const [fileShared, setFileShared] = useState(false);

  const trackedLink = useCallback(
    (platform: PlatformId) => `${shareLink}${shareLink.includes('?') ? '&' : '?'}via=${platform}`,
    [shareLink]
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(trackedLink('native')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [trackedLink]);

  const handleShareEncryptedFile = useCallback(async () => {
    if (!filePreview || fileSharing) return;
    setFileSharing(true);
    try {
      const safeName = fileName.replace(/[^a-z0-9._-]/gi, '_').replace(/\.png$/i, '') + '.png';
      const shareTitle = `PINIT DNA Encrypted — ${fileName}`;
      const shareText = '🔒 This image is encrypted with PINIT DNA. Open it in PINIT Vault to verify ownership.';

      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        // On Android/iOS: save to device cache then share via native intent.
        // navigator.share({ files }) does not trigger the Android Share Intent
        // inside a Capacitor WebView — the Capacitor Share plugin does.
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = filePreview.includes(',') ? filePreview.split(',')[1] : filePreview;
        const tempPath = `pinit_share_${Date.now()}.png`;
        await Filesystem.writeFile({ path: tempPath, data: base64, directory: Directory.Cache, recursive: true });
        const { uri } = await Filesystem.getUri({ path: tempPath, directory: Directory.Cache });
        await Share.share({ title: shareTitle, text: shareText, url: uri, dialogTitle: 'Share Encrypted Image via' });
        try { await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }); } catch { /* ok */ }
      } else {
        // Web fallback: use Web Share API with File object
        const res = await fetch(filePreview);
        const blob = await res.blob();
        const file = new File([blob], safeName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle, text: shareText });
        } else {
          const a = document.createElement('a');
          a.href = filePreview;
          a.download = safeName;
          a.click();
        }
      }
      setFileShared(true);
      setTimeout(() => setFileShared(false), 3000);
    } catch { /* user cancelled */ } finally {
      setFileSharing(false);
    }
  }, [filePreview, fileName, fileSharing]);

  const handlePlatformShare = useCallback(
    async (platform: Platform) => {
      const { Capacitor } = await import('@capacitor/core');
      // On native Android/iOS: if we have the actual encrypted PNG, share it as a file.
      // This sends the real image to WhatsApp/Telegram/etc., not just a URL.
      if (Capacitor.isNativePlatform() && filePreview && !fileSharing) {
        handleShareEncryptedFile();
        setSharedPlatforms((prev) => new Set([...prev, platform.id]));
        return;
      }
      // Web / no file available: fall back to the URL-based share approach.
      const link = trackedLink(platform.id);
      const shareUrl = platform.getShareUrl(link);
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      setSharedPlatforms((prev) => new Set([...prev, platform.id]));
    },
    [trackedLink, filePreview, fileSharing, handleShareEncryptedFile]
  );

  const handleNativeShare = useCallback(async () => {
    const link = trackedLink('native');
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Secure PINIT File: ${fileName}`,
          text: '🔒 View this DNA-verified secure file:',
          url: link,
        });
        setSharedPlatforms((prev) => new Set([...prev, 'native']));
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  }, [trackedLink, fileName, handleCopy]);

  const handleGenerateThumbnail = useCallback(async () => {
    setGenerating(true);
    const dataUrl = await generateThumbnailCard(fileName, shareLink, filePreview);
    setThumbnail(dataUrl);
    setGenerating(false);
  }, [fileName, shareLink, filePreview]);

  const handleDownloadThumbnail = useCallback(async () => {
    if (!thumbnail) return;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = thumbnail.includes(',') ? thumbnail.split(',')[1] : thumbnail;
        const path = `pinit-share-${Date.now()}.png`;
        const result = await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
        await Share.share({ title: `PINIT Share — ${fileName}`, url: result.uri, dialogTitle: 'Save or Share' });
      } else {
        const a = document.createElement('a');
        a.href = thumbnail;
        a.download = `pinit-share-${fileName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
        a.click();
      }
    } catch { /* user cancelled */ }
  }, [thumbnail, fileName]);

  const handleShareThumbnail = useCallback(async () => {
    if (!thumbnail || !navigator.share) return;
    try {
      const res = await fetch(thumbnail);
      const blob = await res.blob();
      const file = new File([blob], `pinit-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `PINIT DNA — ${fileName}` });
        setThumbShared(true);
      }
    } catch { /* user cancelled or not supported */ }
  }, [thumbnail, fileName]);

  return (
    <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-5 pt-5 pb-0">
        <h2 className="text-xl font-bold text-white mb-4">🚀 Share Options</h2>

        {/* ── PRIMARY ACTION: Share the actual encrypted image file ───────────
            This sends the DNA-embedded PNG via the Android/iOS native share
            sheet (WhatsApp, Telegram, Google Drive, Bluetooth, etc.).
            Shown first so users don't accidentally send a URL-only link.      */}
        {filePreview && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-purple-900/60 to-fuchsia-900/40 border border-purple-500/50 shadow-lg shadow-purple-900/20">
            <p className="text-[11px] font-bold text-purple-300 uppercase tracking-widest mb-2">
              ⭐ Primary — Send the Encrypted Image File
            </p>
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Sends the actual DNA-encrypted PNG. The recipient can open it in PINIT Vault on any device to verify your ownership.
            </p>
            <button
              onClick={handleShareEncryptedFile}
              disabled={fileSharing}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base transition-all border ${
                fileShared
                  ? 'bg-emerald-600/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white border-purple-400/30 shadow-lg shadow-purple-900/40 active:scale-95'
              }`}
            >
              {fileSharing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                  className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white"
                />
              ) : fileShared ? (
                <><Check className="w-5 h-5" /> Encrypted Image Shared!</>
              ) : (
                <><FileImage className="w-5 h-5" /> Share Encrypted Image</>
              )}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-slate-700/60" />
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">or share a link</span>
          <div className="flex-1 h-px bg-slate-700/60" />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab('link')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'link'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" /> Smart Link
          </button>
          <button
            onClick={() => {
              setTab('thumbnail');
              if (!thumbnail && !generating) handleGenerateThumbnail();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'thumbnail'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Image className="w-4 h-4" /> Share Card
          </button>
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'link' ? (
          <motion.div
            key="link"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="px-5 pb-5 space-y-4"
          >
            {/* URL display */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Secure Link</p>
              <p className="text-white font-mono text-xs break-all leading-relaxed">
                {shareLink}
              </p>
            </div>

            {/* Copy link button */}
            <button
              onClick={handleCopy}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                copied
                  ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
                  : 'bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white border border-slate-500/30'
              }`}
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy Share Link</>
              )}
            </button>

            {/* Platform grid */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Share via platform — each link is tracked
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((platform) => {
                  const done = sharedPlatforms.has(platform.id);
                  return (
                    <button
                      key={platform.id}
                      onClick={() => handlePlatformShare(platform)}
                      className="relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: platform.color,
                        borderColor: done ? 'rgba(74,222,128,0.5)' : platform.borderColor,
                      }}
                    >
                      {done && (
                        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <span className="text-2xl leading-none">
                        {platform.emoji}
                      </span>
                      <span className="text-[10px] font-semibold text-white/80">
                        {platform.label}
                      </span>
                    </button>
                  );
                })}

                {/* Native share / more */}
                <button
                  onClick={handleNativeShare}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 transition-all hover:scale-105 active:scale-95"
                >
                  <Share2 className="w-6 h-6 text-fuchsia-400" />
                  <span className="text-[10px] font-semibold text-white/80">More…</span>
                </button>
              </div>
            </div>

            {/* Tracking note */}
            <p className="text-[9px] text-slate-600 text-center leading-relaxed">
              Each platform link includes a <code className="text-purple-400">?via=</code> tag so you can see
              exactly which platform brought each viewer in your DNA Monitor.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="thumbnail"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="px-5 pb-5 space-y-4"
          >
            {generating ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-500"
                />
                <p className="text-xs text-slate-400">Rendering share card…</p>
              </div>
            ) : thumbnail ? (
              <>
                {/* Preview */}
                <div className="rounded-xl overflow-hidden border border-purple-500/20">
                  <img src={thumbnail} alt="Share card preview" className="w-full" />
                </div>

                {/* Action row */}
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadThumbnail}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white font-bold text-sm transition-all"
                  >
                    <Download className="w-4 h-4" /> Download PNG
                  </button>
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <button
                      onClick={handleShareThumbnail}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border ${
                        thumbShared
                          ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-purple-600/20 border-purple-500/40 text-purple-200 hover:bg-purple-600/30'
                      }`}
                    >
                      {thumbShared ? (
                        <><Check className="w-4 h-4" /> Shared!</>
                      ) : (
                        <><Share2 className="w-4 h-4" /> Share Image</>
                      )}
                    </button>
                  )}
                </div>

                <button
                  onClick={handleGenerateThumbnail}
                  className="w-full py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ↻ Regenerate card
                </button>
              </>
            ) : null}

            <p className="text-[9px] text-slate-600 text-center leading-relaxed">
              Share this branded card on WhatsApp, Instagram stories, or any platform that supports image sharing.
              Recipients see the file name and QR code to access securely.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShareOptionsPanel;
