import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera as CameraIcon, Copy, Check } from "lucide-react";

interface ScanDocumentFlowProps {
  onSuccess: (pages: string[]) => void; // Pass base64 images to review page
  onBack: () => void;
}

export default function ScanDocumentFlow({
  onSuccess,
  onBack,
}: ScanDocumentFlowProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start Camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setStatus(" Opening camera...");

      // Check if mediaDevices is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not supported on this device");
      }

      // Request camera permissions first
      setStatus(" Requesting camera permissions...");
      
      // Try different camera configurations with better error handling
      const constraints = [
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
          },
        },
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
          },
        },
        {
          video: {
            facingMode: "user", // Try front camera as fallback
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { video: true }, // Last resort
      ];

      let stream: MediaStream | null = null;
      let lastError: Error | null = null;

      for (let i = 0; i < constraints.length; i++) {
        try {
          setStatus(` Trying camera config ${i + 1}...`);
          
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Camera access failed");
          
          // If it's the last attempt, don't continue
          if (i === constraints.length - 1) {
            throw lastError;
          }
        }
      }

      if (!stream) {
        throw lastError || new Error("Could not access camera");
      }

      streamRef.current = stream;

      // Wait for video to be ready
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to start playing
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video loading timeout"));
          }, 5000);
          
          videoRef.current!.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          
          videoRef.current!.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Video loading failed"));
          };
        });

        setIsCameraReady(true);
        setCameraActive(true);
        setStatus(" Camera ready - Position document");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Camera error";
      
      // Provide more specific error messages
      let userMessage = message;
      if (message.includes('Permission denied')) {
        userMessage = "Camera permission denied. Please allow camera access in your browser settings.";
      } else if (message.includes('NotFoundError')) {
        userMessage = "No camera found. Please ensure your device has a working camera.";
      } else if (message.includes('NotReadableError')) {
        userMessage = "Camera is already in use by another application.";
      } else if (message.includes('NotAllowedError')) {
        userMessage = "Camera access was blocked. Please allow camera access and try again.";
      }
      
      setError(` ${userMessage}`);
      console.error("Camera error:", err);
    }
  }, []);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setIsCameraReady(false);
  }, []);

  // Capture Page
  const capturePage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");

      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.9);

      setPages([...pages, imageData]);
      setStatus(`✅ Page ${pages.length + 1} captured!`);

      // Reset status after 2 seconds
      setTimeout(() => {
        setStatus("Ready for next page");
      }, 2000);
    } catch (err) {
      setError("Failed to capture page");
      console.error("Capture error:", err);
    }
  }, [pages]);

  // Finish Scanning
  const finishScanning = useCallback(() => {
    if (pages.length === 0) {
      setError("Please capture at least one page");
      return;
    }

    stopCamera();
    onSuccess(pages);
  }, [pages, onSuccess, stopCamera]);

  // Delete last page
  const deletePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mb-8"
        >
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <h1 className="text-2xl font-bold text-white">
            📷 Scan Document: Pocket #{pages.length > 0 ? "📦 Full" : "📭 Empty"}
          </h1>

          <div className="text-right">
            <p className="text-sm text-gray-400">Pages captured</p>
            <p className="text-2xl font-bold text-cyan-400">{pages.length}</p>
          </div>
        </motion.div>

        {!cameraActive ? (
          // Start Camera Screen
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="aspect-video bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-2xl border-2 border-dashed border-blue-500/50 flex items-center justify-center">
              <div className="text-center">
                <CameraIcon className="w-16 h-16 text-blue-400 mx-auto mb-4 opacity-50" />
                <p className="text-gray-400">Camera will appear here</p>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300"
              >
                {error}
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-lg transition-all transform hover:scale-105"
              >
                <CameraIcon className="w-6 h-6 inline-block mr-2" />
                Open Camera
              </button>

              <button
                onClick={onBack}
                className="py-4 px-6 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold rounded-lg transition-all"
              >
                ← Go Back
              </button>
            </div>
          </motion.div>
        ) : (
          // Camera Active
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Video Feed */}
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border-2 border-cyan-500">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Overlay Grid */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20 border border-cyan-400">
                  {Array(9)
                    .fill(0)
                    .map((_, i) => (
                      <div key={i} className="border border-cyan-400/30" />
                    ))}
                </div>
              </div>

              {/* Status Badge */}
              <div className="absolute top-4 right-4 bg-black/70 px-4 py-2 rounded-full text-cyan-400 text-sm font-semibold">
                {status || "Ready"}
              </div>
            </div>

            {/* Canvas (hidden) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Controls */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={capturePage}
                className="py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg transition-all transform hover:scale-105 text-lg"
              >
                📸 Capture Page
              </button>

              <button
                onClick={() => {
                  stopCamera();
                  startCamera();
                }}
                className="py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-lg transition-all"
              >
                🔄 Restart
              </button>

              <button
                onClick={finishScanning}
                disabled={pages.length === 0}
                className="py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all transform hover:scale-105"
              >
                ✅ Done ({pages.length})
              </button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300"
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Pages Preview */}
        {pages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12"
          >
            <h2 className="text-xl font-bold text-white mb-6">
              📦 Pocket Contents ({pages.length} pages)
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {pages.map((page, idx) => (
                  <motion.div
                    key={`${idx}-${page.length}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group"
                  >
                    <img
                      src={page}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-32 object-cover rounded-lg border-2 border-cyan-500/50 group-hover:border-cyan-400"
                    />

                    <div className="absolute -top-3 -right-3 bg-cyan-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </div>

                    <button
                      onClick={() => deletePage(idx)}
                      className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity"
                    >
                      <span className="text-white text-2xl">🗑️</span>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
