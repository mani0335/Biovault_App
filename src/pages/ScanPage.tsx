import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, X } from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

interface ScannedImage {
  id: string;
  base64: string;
  timestamp: number;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const [scannedPages, setScannedPages] = useState<ScannedImage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture photo from camera
  const capturePhoto = useCallback(async () => {
    try {
      setIsCapturing(true);
      setError(null);

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        promptLabelHeader: "Scan Document",
        promptLabelPhoto: "Choose from Gallery",
        promptLabelPicture: "Take Photo",
      });

      if (photo.base64String) {
        const newPage: ScannedImage = {
          id: `page_${Date.now()}`,
          base64: photo.base64String,
          timestamp: Date.now(),
        };
        setScannedPages((prev) => [...prev, newPage]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture photo");
      console.error("Camera error:", err);
    } finally {
      setIsCapturing(false);
    }
  }, [scannedPages.length]);

  // Delete a page
  const deletePage = (id: string) => {
    setScannedPages((prev) => prev.filter((page) => page.id !== id));
  };

  // Proceed to review
  const goToReview = () => {
    if (scannedPages.length === 0) {
      setError("Please scan at least one page");
      return;
    }
    // Store pages in session storage for review page
    sessionStorage.setItem("scanned_pages", JSON.stringify(scannedPages));
    navigate("/review");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <button
            onClick={() => navigate("/upload")}
            className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-cyan-400" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-white">Scan Document</h1>
            <p className="text-gray-400 mt-2">
              Capture pages continuously. You can add as many pages as needed.
            </p>
          </div>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 bg-red-900/50 border border-red-500/50 rounded-lg p-4 text-red-200"
          >
            {error}
          </motion.div>
        )}

        {/* Capture Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex gap-4"
        >
          <button
            onClick={capturePhoto}
            disabled={isCapturing}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Camera className="w-6 h-6" />
            {isCapturing ? "Capturing..." : "📸 Capture Page"}
          </button>

          {scannedPages.length > 0 && (
            <button
              onClick={goToReview}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-xl transition-all"
            >
              Done ({scannedPages.length})
            </button>
          )}
        </motion.div>

        {/* Pages Grid */}
        <div className="space-y-6">
          {scannedPages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 text-center"
            >
              <div className="text-5xl mb-3">📄</div>
              <p className="text-gray-400">
                No pages captured yet. Click "Capture Page" to start scanning.
              </p>
            </motion.div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white">
                Pages Captured: {scannedPages.length}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {scannedPages.map((page, idx) => (
                  <motion.div
                    key={page.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group"
                  >
                    <div className="aspect-[3/4] bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                      <img
                        src={`data:image/jpeg;base64,${page.base64}`}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white font-bold">Page {idx + 1}</span>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => deletePage(page.id)}
                      className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Page Number */}
                    <div className="mt-2 text-sm text-gray-400">
                      Page {idx + 1}
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-10 bg-slate-800/50 rounded-xl p-6 border border-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-white mb-2">💡 Tips</h3>
          <ul className="space-y-1 text-gray-300 text-sm">
            <li>✓ Ensure good lighting for clear scans</li>
            <li>✓ Keep the document flat in the camera frame</li>
            <li>✓ Click "Done" when finished to review all pages</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
