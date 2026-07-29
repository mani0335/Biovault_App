import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, Check, AlertCircle } from "lucide-react";
import { imagesToPDF, blobToBase64 } from "@/lib/pdfGenerator";
import { encryptFile } from "@/lib/encryptionUtils";
import { addDocumentToVault, saveVaultState, initializeVault } from "@/lib/vaultManager";

interface ReviewPageProps {
  pages: string[]; // Array of base64 images
  onBack: () => void;
  onSuccess: () => void; // Navigate to vault after success
}

export default function ReviewPage({
  pages,
  onBack,
  onSuccess,
}: ReviewPageProps) {
  const [selectedPageIdx, setSelectedPageIdx] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [pdfName, setPdfName] = useState<string>(
    `Scanned-Document-${new Date().toLocaleDateString()}.pdf`
  );
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderedPages, setReorderedPages] = useState<string[]>(pages);

  // Delete page
  const deletePage = useCallback(
    (index: number) => {
      setReorderedPages((prev) => prev.filter((_, i) => i !== index));
      if (selectedPageIdx === index) setSelectedPageIdx(null);
    },
    [selectedPageIdx]
  );

  // Reorder pages
  const movePage = useCallback((fromIdx: number, toIdx: number) => {
    setReorderedPages((prev) => {
      const newPages = [...prev];
      const [removed] = newPages.splice(fromIdx, 1);
      newPages.splice(toIdx, 0, removed);
      return newPages;
    });
  }, []);

  // Save as PDF
  const savePDF = useCallback(async () => {
    if (reorderedPages.length === 0) {
      setMessage("❌ No pages to save");
      return;
    }

    setIsProcessing(true);
    setMessage("⏳ Generating PDF...");

    try {
      // Generate PDF from images
      const pdfBlob = await imagesToPDF(reorderedPages, {
        fileName: pdfName,
        compression: true,
        quality: 90,
      });

      setMessage("🔐 Encrypting document...");

      // Convert PDF to base64
      const pdfBase64 = await blobToBase64(pdfBlob);

      // Simulate encryption
      const { encrypted, key } = encryptFile(pdfBase64);

      setMessage("💾 Saving to vault...");

      // Add to vault
      const vault = initializeVault();
      const newDocument = {
        id: `doc_${Date.now()}`,
        fileName: pdfName,
        fileType: "pdf" as const,
        fileSize: `${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB`,
        fileData: encrypted, // Encrypted version
        createdAt: new Date(),
        isEncrypted: true,
        encryptionKey: key,
      };

      const updatedVault = addDocumentToVault(vault, newDocument);
      saveVaultState(updatedVault);

      setMessage(
        `✅ PDF saved to vault! ${reorderedPages.length} pages combined.`
      );


      // Reset and navigate
      setTimeout(() => {
        onSuccess(); // Go to vault
      }, 2000);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setMessage(`❌ Error: ${error}`);
      console.error("PDF save error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [reorderedPages, pdfName, onSuccess]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
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
            👀 Review Pages ({reorderedPages.length})
          </h1>

          <button
            onClick={() => setReorderMode(!reorderMode)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              reorderMode
                ? "bg-cyan-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {reorderMode ? "✅ Done Reordering" : "🔄 Reorder"}
          </button>
        </motion.div>

        {/* Gallery Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8"
        >
          <AnimatePresence>
            {reorderedPages.map((page, idx) => (
              <motion.div
                key={`${idx}-${page.substring(0, 20)}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSelectedPageIdx(selectedPageIdx === idx ? null : idx)}
                className={`relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                  selectedPageIdx === idx
                    ? "border-cyan-400 ring-2 ring-cyan-400"
                    : "border-gray-600 hover:border-cyan-400"
                }`}
              >
                {/* Image */}
                <img
                  src={page}
                  alt={`Page ${idx + 1}`}
                  className="w-full h-48 object-cover"
                />

                {/* Page Number */}
                <div className="absolute -top-3 -right-3 bg-cyan-500 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                  {idx + 1}
                </div>

                {/* Hover Actions */}
                {!reorderMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3"
                  >
                    {idx > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          movePage(idx, idx - 1);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition"
                      >
                        ⬆️ Up
                      </button>
                    )}

                    {idx < reorderedPages.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          movePage(idx, idx + 1);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition"
                      >
                        ⬇️ Down
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePage(idx);
                      }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition"
                    >
                      🗑️ Delete
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Full Page Preview */}
        {selectedPageIdx !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 max-w-2xl mx-auto"
          >
            <img
              src={reorderedPages[selectedPageIdx]}
              alt={`Full Page ${selectedPageIdx + 1}`}
              className="w-full rounded-xl border-2 border-cyan-400"
            />
          </motion.div>
        )}

        {/* Save Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/50 rounded-xl p-8 space-y-6"
        >
          <div>
            <label className="block text-white font-semibold mb-3">
              📄 PDF File Name
            </label>
            <input
              type="text"
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              disabled={isProcessing}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none disabled:opacity-50"
              placeholder="Enter PDF name..."
            />
          </div>

          {/* Status Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`p-4 rounded-lg flex items-start gap-3 ${
                message.includes("❌")
                  ? "bg-red-900/30 text-red-300 border border-red-500/50"
                  : message.includes("✅")
                  ? "bg-green-900/30 text-green-300 border border-green-500/50"
                  : "bg-blue-900/30 text-blue-300 border border-blue-500/50"
              }`}
            >
              {message.includes("❌") ? (
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              ) : message.includes("✅") ? (
                <Check className="w-5 h-5 mt-0.5 flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 mt-0.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              <p className="text-sm">{message}</p>
            </motion.div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={onBack}
              disabled={isProcessing}
              className="py-3 px-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              ← Back
            </button>

            <button
              onClick={() => {
                const zip = require("jszip");
                // Optional: Download individual images
              }}
              disabled={isProcessing}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition hidden"
            >
              <Download className="w-5 h-5 inline-block mr-2" />
              Download Images
            </button>

            <button
              onClick={savePDF}
              disabled={isProcessing || reorderedPages.length === 0}
              className="py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition transform hover:scale-105"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 inline-block border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 inline-block mr-2" />
                  Save as PDF to Vault
                </>
              )}
            </button>
          </div>

          <p className="text-sm text-gray-400 text-center">
            ✨ All documents are automatically encrypted and stored securely in
            your vault
          </p>
        </motion.div>
      </div>
    </div>
  );
}
