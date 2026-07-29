import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PagePreview from "./PagePreview";

interface ScannedPage {
  id: string;
  imageData: string; // base64
  timestamp: number;
}

export default function ScanDocument({ onBack }: { onBack: () => void }) {
  const [scannedPages, setScannedPages] = useState<ScannedPage[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Initialize camera with fallback constraints
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access not supported on this device");
      }

      let stream: MediaStream | null = null;
      const constraintsList = [
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        },
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { video: true },
      ];

      // Try constraints in order
      for (const constraints of constraintsList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
        }
      }

      if (!stream) {
        throw new Error("Could not access camera with any resolution");
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        const playVideo = () => {
          try {
            videoRef.current?.play().catch((playErr) => {
              setError("Could not play camera stream");
            });
            setIsCameraReady(true);
          } catch (playErr) {
            console.error("Play error:", playErr);
            setError("Camera stream error");
          }
        };

        videoRef.current.onloadedmetadata = playVideo;

        // Timeout if metadata doesn't load
        const timeoutId = setTimeout(() => {
          if (!isCameraReady) {
            setError("Camera timeout - please check permissions");
          }
        }, 5000);

        return () => clearTimeout(timeoutId);
      }

      setCameraActive(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access camera";
      setError(`Camera Error: ${message}. Please enable camera permissions.`);
      console.error("Camera error:", err);
      setCameraActive(false);
    }
  }, [isCameraReady]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    setCameraActive(false);
    setIsCameraReady(false);
  }, []);

  // Capture page
  const capturePage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady) return;

    const context = canvasRef.current.getContext("2d");
    if (!context) return;

    // Set canvas size to match video
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;

    // Draw video frame to canvas
    context.drawImage(videoRef.current, 0, 0);

    // Get base64 image data
    const imageData = canvasRef.current.toDataURL("image/jpeg", 0.8);

    // Add to scanned pages
    const newPage: ScannedPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      imageData,
      timestamp: Date.now(),
    };

    setScannedPages((prev) => [...prev, newPage]);
  }, [isCameraReady]);

  // Remove page from pocket
  const removePage = useCallback((pageId: string) => {
    setScannedPages((prev) => prev.filter((p) => p.id !== pageId));
  }, []);

  // Clear all pages
  const clearAll = useCallback(() => {
    if (window.confirm("Are you sure you want to clear all scanned pages?")) {
      setScannedPages([]);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-300 hover:text-white transition"
      >
        ← Back to Document Hub
      </button>

      {/* Camera View */}
      {!showPreview && (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
          <div className="relative bg-black aspect-video flex items-center justify-center">
            {cameraActive && isCameraReady ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
              />
            ) : (
              <div className="text-center">
                <p className="text-gray-400 mb-4">Camera not active</p>
                {error && <p className="text-red-400 text-sm">{error}</p>}
              </div>
            )}

            {/* Camera Grid Overlay */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 border-2 border-blue-400 opacity-50"></div>
                <div className="absolute top-1/3 left-1/3 right-1/3 bottom-1/3 border-2 border-green-400"></div>
              </div>
            )}

            {/* Page Count Badge */}
            {scannedPages.length > 0 && (
              <div className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full font-bold">
                📄 {scannedPages.length} page{scannedPages.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Canvas for capture (hidden) */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="bg-slate-900 p-4 flex gap-3 justify-center flex-wrap">
            {!cameraActive ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                📷 Open Camera
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={capturePage}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
                >
                  📸 Capture Page
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopCamera}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
                >
                  ⏹️ Close Camera
                </motion.button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Scanned Pages Pocket */}
      {scannedPages.length > 0 && !showPreview && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            📁 Pocket ({scannedPages.length} page{scannedPages.length !== 1 ? "s" : ""})
          </h3>

          {/* Thumbnail Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <AnimatePresence>
              {scannedPages.map((page, idx) => (
                <motion.div
                  key={page.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => removePage(page.id)}
                  className="relative group cursor-pointer"
                >
                  <img
                    src={page.imageData}
                    alt={`Page ${idx + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border-2 border-slate-600 group-hover:border-red-500 transition"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition">
                      ❌ Remove
                    </span>
                  </div>
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                    Page {idx + 1}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center flex-wrap">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPreview(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
            >
              👁️ Preview & Save
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={clearAll}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
            >
              🗑️ Clear All
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Preview Mode */}
      {showPreview && scannedPages.length > 0 && (
        <PagePreview
          pages={scannedPages}
          onBack={() => setShowPreview(false)}
          type="scan"
        />
      )}

      {/* Empty State */}
      {scannedPages.length === 0 && !showPreview && !cameraActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 bg-slate-800 rounded-xl border-2 border-dashed border-slate-600"
        >
          <p className="text-gray-400">No pages scanned yet</p>
          <p className="text-gray-500 text-sm mt-2">Open camera and start scanning</p>
        </motion.div>
      )}
    </motion.div>
  );
}
