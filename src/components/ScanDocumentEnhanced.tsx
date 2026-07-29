import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PagePreview from "./PagePreview";

interface ScannedPage {
  id: string;
  imageData: string;
  originalImageData: string;
  timestamp: number;
  corners?: { x: number; y: number }[];
}

export default function ScanDocumentEnhanced({ onBack }: { onBack: () => void }) {
  const [scannedPages, setScannedPages] = useState<ScannedPage[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showFormatSelection, setShowFormatSelection] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "doc">("pdf");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string>("");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  // Initialize camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setDetectionStatus("📷 Opening camera...");

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
            setDetectionStatus("✅ Camera ready - Position document in view");
          } catch (playErr) {
            console.error("Play error:", playErr);
            setError("Camera stream error");
          }
        };

        videoRef.current.onloadedmetadata = playVideo;

        const timeoutId = setTimeout(() => {
          if (!isCameraReady) {
            setError("Camera timeout - please check permissions");
          }
        }, 5000);

        return () => clearTimeout(timeoutId);
      }

      setCameraActive(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to access camera";
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
    setDetectionStatus("");
  }, []);

  // Simple edge detection and auto-crop
  const detectAndCropDocument = (imageData: ImageData): ImageData => {
    const { data, width, height } = imageData;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;
    let foundEdge = false;

    // Detect edges (simplified)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Light colors (document background)
      if (r > 150 && g > 150 && b > 150) {
        const pixelIndex = i / 4;
        const y = Math.floor(pixelIndex / width);
        const x = pixelIndex % width;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        foundEdge = true;
      }
    }

    if (!foundEdge) {
      return imageData; // Return original if no document detected
    }

    // Add padding
    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width, maxX + padding);
    maxY = Math.min(height, maxY + padding);

    // Crop and return
    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;
    const croppedData = new ImageData(cropWidth, cropHeight);

    for (let y = 0; y < cropHeight; y++) {
      for (let x = 0; x < cropWidth; x++) {
        const srcIdx = ((minY + y) * width + (minX + x)) * 4;
        const dstIdx = (y * cropWidth + x) * 4;

        croppedData.data[dstIdx] = data[srcIdx];
        croppedData.data[dstIdx + 1] = data[srcIdx + 1];
        croppedData.data[dstIdx + 2] = data[srcIdx + 2];
        croppedData.data[dstIdx + 3] = data[srcIdx + 3];
      }
    }

    return croppedData;
  };

  // Apply brightness and contrast
  const enhanceImage = (
    imageData: ImageData,
    brightnessValue: number,
    contrastValue: number
  ): ImageData => {
    const { data } = imageData;
    const brightnessAdjust = brightnessValue / 100;
    const contrastAdjust = contrastValue / 100;

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast
      let r = (data[i] - 128) * contrastAdjust + 128;
      let g = (data[i + 1] - 128) * contrastAdjust + 128;
      let b = (data[i + 2] - 128) * contrastAdjust + 128;

      // Apply brightness
      r = r * brightnessAdjust;
      g = g * brightnessAdjust;
      b = b * brightnessAdjust;

      // Clamp values
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    return imageData;
  };

  // Capture and process page
  const capturePage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady) return;

    try {
      setDetectionStatus("🔍 Detecting document...");
      const context = canvasRef.current.getContext("2d");
      if (!context) return;

      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;

      context.drawImage(videoRef.current, 0, 0);

      // Get original image data
      const originalImageData = context.getImageData(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );

      // Detect and crop
      setDetectionStatus("✂️ Auto-cropping...");
      const croppedImageData = detectAndCropDocument(originalImageData);

      // Enhance
      setDetectionStatus("🎨 Enhancing...");
      const enhancedImageData = enhanceImage(croppedImageData, brightness, contrast);

      // Create temporary canvas for enhanced image
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = enhancedImageData.width;
      tempCanvas.height = enhancedImageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.putImageData(enhancedImageData, 0, 0);

      const enhancedImageBase64 = tempCanvas.toDataURL("image/jpeg", 0.95);
      const originalImageBase64 = canvasRef.current.toDataURL("image/jpeg", 0.8);

      const newPage: ScannedPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        imageData: enhancedImageBase64,
        originalImageData: originalImageBase64,
        timestamp: Date.now(),
      };

      setScannedPages((prev) => [...prev, newPage]);
      setDetectionStatus(`✅ Page captured! (${scannedPages.length + 1} pages)`);

      setTimeout(() => setDetectionStatus(""), 2000);
    } catch (err) {
      setError("Failed to capture page");
      console.error(err);
    }
  }, [isCameraReady, brightness, contrast, scannedPages.length]);

  // Remove page
  const removePage = useCallback((pageId: string) => {
    setScannedPages((prev) => prev.filter((p) => p.id !== pageId));
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    if (window.confirm("Clear all scanned pages?")) {
      setScannedPages([]);
    }
  }, []);

  // Reorder pages
  const reorderPages = (fromIndex: number, toIndex: number) => {
    const newPages = [...scannedPages];
    const [movedPage] = newPages.splice(fromIndex, 1);
    newPages.splice(toIndex, 0, movedPage);
    setScannedPages(newPages);
  };

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

      {!showFormatSelection && !showPreview && (
        <>
          {/* Camera View */}
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

              {/* Detection Grid Overlay */}
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border-2 border-blue-400 opacity-30"></div>
                  <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4">
                    <div className="w-full h-full border-3 border-green-400 rounded-lg animate-pulse"></div>
                  </div>
                </div>
              )}

              {/* Detection Status */}
              {detectionStatus && (
                <div className="absolute top-4 left-4 bg-blue-600/90 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                  {detectionStatus}
                </div>
              )}

              {/* Page Count */}
              {scannedPages.length > 0 && (
                <div className="absolute top-4 right-4 bg-green-600/90 text-white px-4 py-2 rounded-lg font-bold">
                  📄 {scannedPages.length}
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Enhancement Controls */}
            {cameraActive && (
              <div className="bg-slate-900 p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Brightness: {brightness}%</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400">Contrast: {contrast}%</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            )}

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

          {/* Scanned Pages Pocket Grid */}
          {scannedPages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800 rounded-xl p-6 border border-slate-700"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                📁 Pocket ({scannedPages.length} page{scannedPages.length !== 1 ? "s" : ""})
              </h3>

              {/* Thumbnail Grid with Reorder */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <AnimatePresence>
                  {scannedPages.map((page, idx) => (
                    <motion.div
                      key={page.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group cursor-pointer"
                    >
                      <img
                        src={page.imageData}
                        alt={`Page ${idx + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border-2 border-slate-600 group-hover:border-blue-500 transition"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition rounded-lg flex flex-col items-center justify-center gap-2">
                        <div className="opacity-0 group-hover:opacity-100 transition space-y-1 text-center">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reorderPages(idx, idx - 1);
                              }}
                              className="text-white text-xs bg-blue-600 px-2 py-1 rounded w-full hover:bg-blue-700"
                            >
                              ↑ Move Up
                            </button>
                          )}
                          {idx < scannedPages.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reorderPages(idx, idx + 1);
                              }}
                              className="text-white text-xs bg-blue-600 px-2 py-1 rounded w-full hover:bg-blue-700"
                            >
                              ↓ Move Down
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removePage(page.id);
                            }}
                            className="text-white text-xs bg-red-600 px-2 py-1 rounded w-full hover:bg-red-700"
                          >
                            ❌ Delete
                          </button>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                        {idx + 1}
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
                  onClick={() => setShowFormatSelection(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
                >
                  📄 Convert & Save
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
        </>
      )}

      {/* Format Selection */}
      {showFormatSelection && !showPreview && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center"
        >
          <h3 className="text-2xl font-bold text-white mb-6">📋 Select Format</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedFormat("pdf");
                setShowPreview(true);
              }}
              className={`p-6 rounded-lg font-semibold transition ${
                selectedFormat === "pdf"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-gray-300 hover:bg-slate-600"
              }`}
            >
              <div className="text-4xl mb-2">📕</div>
              <div>Convert to PDF</div>
              <div className="text-xs mt-2 opacity-75">Multi-page document</div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedFormat("doc");
                setShowPreview(true);
              }}
              className={`p-6 rounded-lg font-semibold transition ${
                selectedFormat === "doc"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-gray-300 hover:bg-slate-600"
              }`}
            >
              <div className="text-4xl mb-2">📘</div>
              <div>Convert to DOC</div>
              <div className="text-xs mt-2 opacity-75">Word document</div>
            </motion.button>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFormatSelection(false)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold"
          >
            ← Back
          </motion.button>
        </motion.div>
      )}

      {/* Preview with Encryption */}
      {showPreview && (
        <PagePreview
          pages={scannedPages}
          onBack={() => setShowPreview(false)}
          type="scan"
          format={selectedFormat}
        />
      )}
    </motion.div>
  );
}
