import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, Image, Zap, Scan, Info } from 'lucide-react';

interface LiveScannerProps {
  onImageCaptured: (dataUrl: string, fileName: string) => void;
  onBack: () => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({ onImageCaptured, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);

  // Start in-app camera via getUserMedia on both web and native Capacitor.
  // We no longer use CapCamera.getPhoto() because it opens a separate Android
  // Activity, which can kill the WebView and wipe the auth session.
  // getUserMedia runs entirely inside the WebView on both platforms.
  useEffect(() => {
    let cancelled = false;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) setError('camera');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try { await video.play(); } catch { /* autoplay handles it */ }
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) setError('camera');
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Snapshot the live video feed → pass to forensic scan.
  // Camera scan is visual-match only (JPEG output) — for pixel DNA use Gallery.
  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    const canvas = document.createElement('canvas');
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onImageCaptured(dataUrl, `camera_scan_${Date.now()}.jpg`);
  }, [onImageCaptured]);

  // Always use a file input for gallery on both native and web.
  // CapCamera.getPhoto({source:Photos}) re-encodes every file as JPEG,
  // destroying the amplitude-8 LSB pixel DNA that only survives in lossless PNG.
  // The system file picker + FileReader reads the original bytes exactly.
  const pickFromGallery = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/*,.pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (url) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onImageCaptured(url, file.name);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [onImageCaptured]);

  const handleBack = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onBack();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-3 z-20 relative">
        <button onClick={handleBack}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-black text-white">PINIT Scanner</p>
          <p className="text-[10px] text-white/50">Point camera at any encrypted asset</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/20 border border-violet-500/40">
          <Zap className="w-3 h-3 text-violet-300" />
          <span className="text-[9px] font-black text-violet-300">FORENSIC</span>
        </div>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative overflow-hidden">
        {/* Live video preview — shown on both web and native */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: cameraReady && !error ? 1 : 0 }}
        />

        {/* Loading spinner while stream starts */}
        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full"
            />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-black">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center">
              <Camera className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-white text-sm font-bold text-center">Camera not available</p>
            <p className="text-white/50 text-xs text-center">Use Gallery to pick a saved image</p>
          </div>
        )}

        {/* Scan overlay frame */}
        {!error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-violet-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-violet-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-violet-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-violet-400 rounded-br-xl" />
              <motion.div
                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent"
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        )}

        {/* Capturing spinner overlay */}
        {isCapturing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full"
            />
          </div>
        )}

        {/* Flash effect */}
        <AnimatePresence>
          {flash && (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white z-30" transition={{ duration: 0.2 }} />
          )}
        </AnimatePresence>
      </div>

      {/* Scenario Tips */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-4 right-4 z-20 rounded-2xl p-3"
            style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(124,58,237,0.4)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-start gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] font-black text-violet-300 uppercase tracking-wide">Best scan method per scenario</p>
              <button onClick={() => setShowTip(false)} className="ml-auto text-white/30 text-[10px]">✕</button>
            </div>
            <div className="space-y-1">
              {[
                { icon: '✅', label: 'Saved PNG file', desc: 'Gallery → pick _pinit_dna.png — 100% ownership detected' },
                { icon: '✅', label: 'Different device / account', desc: 'Gallery → pick PNG — cloud record found via DNA ID' },
                { icon: '⚡', label: 'WhatsApp / Telegram file', desc: 'Gallery → pick downloaded file — DNA may survive' },
                { icon: '⚡', label: 'Instagram / Screenshot', desc: 'Gallery → pick file — visual fingerprint (pHash) matches owner' },
                { icon: '📷', label: 'Camera at screen', desc: 'Tap Camera → visual match only (no pixel DNA)' },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-2">
                  <span className="text-[10px] w-4 flex-shrink-0">{r.icon}</span>
                  <div>
                    <span className="text-[10px] font-bold text-white">{r.label}: </span>
                    <span className="text-[9px] text-white/50">{r.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <div className="relative z-20 px-4 pb-10 pt-5" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.9) 30%)' }}>
        <div className="flex items-center justify-around">
          {/* Gallery */}
          <button onClick={pickFromGallery} disabled={isCapturing}
            className="flex flex-col items-center gap-1 disabled:opacity-40">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
              <Image className="w-6 h-6 text-white" />
            </div>
            <span className="text-[9px] font-black text-violet-300">GALLERY</span>
            <span className="text-[8px] text-white/30">Recommended</span>
          </button>

          {/* Camera capture */}
          <button onClick={captureFromCamera} disabled={isCapturing || !cameraReady}
            className="flex flex-col items-center gap-1 disabled:opacity-40">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 0 20px rgba(255,255,255,0.05)' }}>
              <div className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center">
                <Scan className="w-7 h-7 text-white/70" />
              </div>
            </div>
            <span className="text-[9px] font-bold text-white/50">CAMERA</span>
            <span className="text-[8px] text-white/30">Visual only</span>
          </button>

          {/* Guide toggle */}
          <button onClick={() => setShowTip((v) => !v)}
            className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-white/50" />
            </div>
            <span className="text-[9px] text-white/30">GUIDE</span>
          </button>
        </div>
        <p className="text-center text-[10px] text-white/30 mt-3">Gallery import gives best ownership detection</p>
      </div>
    </motion.div>
  );
};

export default LiveScanner;
