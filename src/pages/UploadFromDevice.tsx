import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  AlertCircle,
  Check,
  Loader,
} from "lucide-react";
import { encryptFile } from "@/lib/encryptionUtils";
import { addDocumentToVault } from "@/lib/vaultService";
import { appStorage } from "@/lib/storage";
import { logActivityEvent } from "@/lib/activityService";

interface UploadFromDeviceProps {
  onBack: () => void;
  onSuccess: () => void; // Navigate to vault after success
}

export default function UploadFromDevice({
  onBack,
  onSuccess,
}: UploadFromDeviceProps) {
  const [document, setDocument] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const validateFile = (file: File): boolean => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`File type not supported. Allowed: PDF, DOCX, XLSX, Images`);
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size: 50MB`);
      return false;
    }

    return true;
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    setMessage("");

    if (!validateFile(file)) {
      return;
    }

    setDocument(file);
    setMessage(`✅ File selected: ${file.name}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUploadAndEncrypt = async () => {
    if (!document) {
      setError("Please select a file first");
      return;
    }

    setIsProcessing(true);
    setMessage("📖 Reading file...");

    try {
      // Read file as base64
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const fileBase64 = reader.result as string;

          setMessage("🔐 Encrypting document...");

          // Encrypt the file
          const { encrypted, key } = encryptFile(fileBase64);

          setMessage("💾 Saving to vault...");

          // Get userId so document goes to the right user's vault
          let userId: string | null = null;
          try { userId = await appStorage.getItem("biovault_userId"); } catch {}
          if (!userId) userId = localStorage.getItem("biovault_userId");

          if (!userId) {
            setMessage("❌ Not logged in. Please login first.");
            setIsProcessing(false);
            return;
          }

          const newDocument = {
            id: `doc_${Date.now()}`,
            name: document.name,
            encryptedData: encrypted,
            // No encryptedImage for non-image file types
            encryptedImage: document.type.startsWith('image/')
              ? (fileBase64 as string)   // use original for preview
              : undefined,
            metadata: {
              timestamp: Date.now(),
              original_name: document.name,
              // Use the actual File.size (bytes) — NOT the base64 string length
              size: document.size,
              // XOR key — REQUIRED for later decryption
              checksum: key,
              encrypted: true,
              ownerId: userId,
              mimeType: document.type,
            },
            createdAt: new Date().toISOString(),
          };

          await addDocumentToVault(userId, newDocument);

          logActivityEvent({
            userId,
            type: 'upload',
            fileName: document.name,
            fileType: document.type.includes('pdf') ? 'pdf' : 'image',
            status: 'success',
            skipGeo: true,
          }).catch(() => {});

          setMessage(`✅ File uploaded and encrypted: ${document.name}`);

          console.log("✅ Document saved:", {
            id: newDocument.id,
            name: newDocument.name,
            size: newDocument.metadata.size,
            encrypted: newDocument.metadata.encrypted,
          });

          // Navigate to vault
          setTimeout(() => {
            onSuccess();
          }, 2000);
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          setMessage(`❌ Error: ${error}`);
          console.error("Upload error:", err);
        } finally {
          setIsProcessing(false);
        }
      };

      reader.onerror = () => {
        setMessage("❌ Failed to read file");
        setIsProcessing(false);
      };

      reader.readAsDataURL(document);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setMessage(`❌ Error: ${error}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-4 mb-8"
        >
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <h1 className="text-3xl font-bold text-white">📤 Upload File</h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Upload Area */}
          {!document ? (
            <motion.div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              whileHover={{ borderColor: "#06b6d4" }}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition ${
                isDragging
                  ? "border-cyan-400 bg-cyan-900/20"
                  : "border-slateate-600 bg-slate-800/50"
              }`}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-6xl mb-6"
              >
                📂
              </motion.div>

              <h3 className="text-2xl font-bold text-white mb-3">
                Drop your file here
              </h3>

              <p className="text-gray-400 mb-8">
                or click to browse your device
              </p>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-8 py-4 rounded-lg font-semibold transition transform hover:scale-105"
              >
                <Upload className="w-5 h-5 inline-block mr-2" />
                Choose File
              </button>

              <p className="text-gray-500 text-sm mt-8">
                Supported: PDF, DOCX, XLSX, Images (Max 50MB)
              </p>

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleInputChange}
                accept={ALLOWED_TYPES.join(",")}
                className="hidden"
              />
            </motion.div>
          ) : (
            // File Selected
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/50 rounded-2xl p-8 space-y-6"
            >
              {/* File Info */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">
                  ✅ File Selected
                </h3>

                <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">File Name</span>
                    <span className="text-white font-semibold truncate max-w-xs">
                      {document.name}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">File Size</span>
                    <span className="text-white font-semibold">
                      {(document.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">File Type</span>
                    <span className="text-white font-semibold">
                      {document.type.split("/")[1].toUpperCase() ||
                        document.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {message && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`p-4 rounded-lg flex items-start gap-3 ${
                    message.includes("❌")
                      ? "bg-red-900/30 text-red-300 border border-red-500/50"
                      : message.includes("✅") || message.includes("Saving")
                      ? "bg-green-900/30 text-green-300 border border-green-500/50"
                      : "bg-blue-900/30 text-blue-300 border border-blue-500/50"
                  }`}
                >
                  {message.includes("Saving") || message.includes("Reading") || message.includes("Encrypting") ? (
                    <Loader className="w-5 h-5 animate-spin flex-shrink-0 mt-0.5" />
                  ) : message.includes("✅") ? (
                    <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm">{message}</p>
                </motion.div>
              )}

              {/* Encryption Info */}
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4 space-y-2">
                <h4 className="text-white font-semibold flex items-center gap-2">
                  🔐 What Happens Next
                </h4>

                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">1.</span>
                    <span>File will be read and encrypted</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">2.</span>
                    <span>Encrypted data stored in your vault</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">3.</span>
                    <span>Encryption key saved securely</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">4.</span>
                    <span>You redirected to vault to manage</span>
                  </li>
                </ul>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setDocument(null);
                    setMessage("");
                  }}
                  disabled={isProcessing}
                  className="py-3 px-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold rounded-lg transition"
                >
                  ← Choose Different
                </button>

                <button
                  onClick={handleUploadAndEncrypt}
                  disabled={isProcessing}
                  className="py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition transform hover:scale-105"
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-5 h-5 inline-block mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 inline-block mr-2" />
                      Upload & Encrypt
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-full py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition"
          >
            ← Back
          </button>
        </motion.div>
      </div>
    </div>
  );
}
