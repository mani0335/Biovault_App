import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SecurePdfViewer } from "@/components/SecurePdfViewer";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Trash2,
  Eye,
  Download,
  Lock,
  Clock,
  FileText,
  AlertCircle,
  Shield,
  Share2,
} from "lucide-react";
import {
  getAllDocuments,
  deleteDocumentFromVault,
  saveVaultState,
  initializeVault,
  VaultDocument,
} from "@/lib/vaultManager";
import { decryptFile } from "@/lib/encryptionUtils";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

interface VaultPageProps {
  onBack?: () => void;
}

export default function VaultPage({ onBack }: VaultPageProps) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate("/dashboard", { replace: true }));
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [fullscreenPreview, setFullscreenPreview] = useState<{ dataUrl: string; name: string } | null>(null);
  const [message, setMessage] = useState<string>("");
  const [autoDeleteMessage, setAutoDeleteMessage] = useState<string>("");
  const [showDigitalIdentities, setShowDigitalIdentities] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Load documents on mount
  useEffect(() => {
    const vault = initializeVault();
    const docs = getAllDocuments(vault);
    setDocuments(docs);
    console.log(`📦 Loaded ${docs.length} documents from vault`);
  }, []);

  // Safe helper — handles both 'fileName' (vaultManager) and legacy 'name' field
  const getDocName = (doc: VaultDocument): string =>
    (doc as any).fileName || (doc as any).name || 'Unknown Document';

  const safeDate = (val: unknown): Date => {
    try { return new Date(val as any); } catch { return new Date(); }
  };

  // Count digital identity documents
  const digitalIdentityCount = documents.filter(doc => {
    const n = getDocName(doc).toLowerCase();
    return n.includes('aadhaar') || n.includes('pan') || n.includes('passport') ||
           n.includes('license') || n.includes('voter') || n.includes('id');
  }).length;

  // Filter digital identity documents
  const digitalIdentityDocuments = documents.filter(doc => {
    const n = getDocName(doc).toLowerCase();
    return n.includes('aadhaar') || n.includes('pan') || n.includes('passport') ||
           n.includes('license') || n.includes('voter') || n.includes('id');
  });

  // Handle Digital Identity button click
  const handleDigitalIdentitiesClick = () => {
    setShowDigitalIdentities(!showDigitalIdentities);
  };

  // Share document — write to temp file then share via native sheet
  const handleShareDocument = async (doc: VaultDocument) => {
    setIsSharing(true);
    setMessage("📤 Preparing share...");
    try {
      let dataToShare = doc.fileData;
      if (doc.isEncrypted && doc.encryptionKey) {
        setMessage("🔓 Decrypting for share...");
        dataToShare = decryptFile(doc.fileData, doc.encryptionKey);
      }

      if (Capacitor.isNativePlatform()) {
        // Extract base64 payload (strip data URI prefix if present)
        const base64 = dataToShare.includes(",") ? dataToShare.split(",")[1] : dataToShare;
        const written = await Filesystem.writeFile({
          path: doc.fileName,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: doc.fileName,
          url: written.uri,
          dialogTitle: "Share document",
        });
      } else {
        await Share.share({
          title: doc.fileName,
          text: `Sharing: ${doc.fileName} from PINIT Vault`,
          dialogTitle: "Share document",
        });
      }
      setMessage("✅ Share dialog opened");
    } catch (err: any) {
      if (err?.message?.includes("cancel") || err?.message?.includes("Cancel")) {
        setMessage("");
      } else {
        setMessage("❌ Sharing not supported on this device");
        console.error("Share error:", err);
      }
    } finally {
      setIsSharing(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  // Delete document
  const handleDeleteDocument = (doc: VaultDocument) => {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;

    const vault = initializeVault();
    const updatedVault = deleteDocumentFromVault(vault, doc.id);
    saveVaultState(updatedVault);

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc(null);
      setPreviewMode(false);
    }

    setAutoDeleteMessage(`✅ "${doc.fileName}" deleted from vault`);
    setTimeout(() => setAutoDeleteMessage(""), 3000);
  };

  // Preview document
  const handlePreviewDocument = async (doc: VaultDocument) => {
    setSelectedDoc(doc);
    setMessage("🔓 Decrypting...");

    try {
      if (doc.isEncrypted && doc.encryptionKey) {
        const decrypted = decryptFile(doc.fileData, doc.encryptionKey);
        setDecryptedContent(decrypted);
        console.log("✅ Document decrypted");
      } else {
        setDecryptedContent(doc.fileData);
      }

      setMessage("✅ Ready to preview");
      setPreviewMode(true);
    } catch (err) {
      setMessage("❌ Failed to decrypt document");
      console.error("Decrypt error:", err);
    }
  };

  // Download document — write to Cache then share so user can save anywhere
  const handleDownloadDocument = async (doc: VaultDocument) => {
    try {
      setMessage("📥 Preparing download...");

      let dataToDownload = doc.fileData;

      if (doc.isEncrypted && doc.encryptionKey) {
        setMessage("🔓 Decrypting...");
        dataToDownload = decryptFile(doc.fileData, doc.encryptionKey);
      }

      if (Capacitor.isNativePlatform()) {
        // Strip data URI prefix to get raw base64
        const base64 = dataToDownload.includes(",")
          ? dataToDownload.split(",")[1]
          : dataToDownload;

        // Write to Cache (no permissions needed) then share → user saves to Downloads/Files
        setMessage("📤 Opening save dialog...");
        const written = await Filesystem.writeFile({
          path: doc.fileName,
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        await Share.share({
          title: doc.fileName,
          url: written.uri,
          dialogTitle: `Save "${doc.fileName}" to your device`,
        });
        setMessage(`✅ Share dialog opened — choose Save to Files/Downloads`);
      } else {
        // Web: blob download
        const mime = dataToDownload.startsWith("data:")
          ? dataToDownload.split(";")[0].slice(5)
          : "application/octet-stream";
        const base64Part = dataToDownload.includes(",")
          ? dataToDownload
          : `data:${mime};base64,${dataToDownload}`;
        const link = document.createElement("a");
        link.href = base64Part;
        link.download = doc.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage(`✅ Downloaded: ${doc.fileName}`);
      }

      setTimeout(() => setMessage(""), 5000);
    } catch (err: any) {
      if (err?.message?.includes("cancel") || err?.message?.includes("Cancel")) {
        setMessage(""); // user cancelled share sheet — not an error
      } else {
        setMessage("❌ Download failed");
        console.error("Download error:", err);
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  };

  // ── Open PDF natively (Android) or in new tab (web) ───────────────────────
  const openPdfNatively = async (dataUrl: string, name: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const written = await Filesystem.writeFile({
          path: name,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({ title: name, url: written.uri, dialogTitle: 'Open PDF with…' });
      } else {
        const blob = await fetch(dataUrl).then(r => r.blob());
        window.open(URL.createObjectURL(blob), '_blank');
      }
    } catch (err) {
      console.error('PDF open error:', err);
    }
  };

  // ── Full-screen document preview portal ────────────────────────────────────
  const FullscreenPreview = fullscreenPreview
    ? createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' }}
          onClick={() => setFullscreenPreview(null)}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: 12 }} onClick={e => e.stopPropagation()}>
            <p style={{ color: 'white', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullscreenPreview.name}</p>
            <button
              onClick={() => setFullscreenPreview(null)}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <span style={{ color: 'white', fontSize: 18 }}>✕</span>
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            {fullscreenPreview.dataUrl.startsWith('data:image') ? (
              /* ── Image ── */
              <img
                src={fullscreenPreview.dataUrl}
                alt={fullscreenPreview.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 0 60px rgba(0,0,0,0.9)' }}
              />
            ) : (
              /* ── PDF / document — inline SecurePdfViewer ── */
              <div style={{ width: '100%', height: '100%', minHeight: '70vh' }} onClick={e => e.stopPropagation()}>
                <SecurePdfViewer
                  pdfData={fullscreenPreview.dataUrl}
                  fileName={fullscreenPreview.name}
                  downloadEnabled={true}
                  onClose={() => setFullscreenPreview(null)}
                />
              </div>
            )}
          </div>
        </motion.div>,
        document.body
      )
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6" style={{ paddingBottom: 72 }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mb-8"
        >
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <h1 className="text-3xl font-bold text-white">🗄️ My Vault</h1>

          <div className="flex gap-4">
            <button
              onClick={handleDigitalIdentitiesClick}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white hover:from-purple-700 hover:to-pink-700 transition"
            >
              <Shield className="w-5 h-5" />
              <span>Digital Identities</span>
              <span className="bg-white text-purple-600 text-xs font-bold rounded-full px-2 py-0.5">{digitalIdentityCount}</span>
            </button>
            <div className="text-right">
              <p className="text-sm text-gray-400">Documents stored</p>
              <p className="text-2xl font-bold text-cyan-400">{documents.length}</p>
            </div>
          </div>
        </motion.div>

        {/* Digital Identity Documents List */}
        {showDigitalIdentities && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Digital Identity Documents
            </h3>
            {digitalIdentityDocuments.length === 0 ? (
              <p className="text-gray-400 text-sm">No digital identity documents found</p>
            ) : (
              <div className="space-y-2">
                {digitalIdentityDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition cursor-pointer"
                    onClick={() => handlePreviewDocument(doc)}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-purple-400" />
                      <div>
                        <p className="text-white font-medium">{getDocName(doc)}</p>
                        <p className="text-gray-400 text-xs">{safeDate(doc.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewDocument(doc);
                        }}
                        className="p-2 hover:bg-slate-600 rounded-lg transition"
                      >
                        <Eye className="w-4 h-4 text-cyan-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc);
                        }}
                        className="p-2 hover:bg-slate-600 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Auto-Delete Message */}
        {autoDeleteMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-green-900/30 border border-green-500/50 rounded-lg text-green-300"
          >
            {autoDeleteMessage}
          </motion.div>
        )}

        {/* Content */}
        {documents.length === 0 ? (
          // Empty State
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Your vault is empty
            </h2>
            <p className="text-gray-300 mb-8">
              Upload or scan documents to fill your vault
            </p>
            <button
              onClick={handleBack}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg transition"
            >
              ← Go Back
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Documents List */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="lg:col-span-1 space-y-4"
            >
              <h2 className="text-xl font-bold text-white">📋 Documents</h2>

              <AnimatePresence mode="wait">
                {documents.map((doc) => (
                  <motion.div
                    key={doc.id}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={() => handlePreviewDocument(doc)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDoc?.id === doc.id
                        ? "border-cyan-400 bg-cyan-900/20"
                        : "border-gray-600 hover:border-cyan-400 bg-gray-800/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-cyan-400 mt-1 flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate text-sm">
                          {getDocName(doc)}
                        </p>

                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          {doc.isEncrypted && (
                            <span className="flex items-center gap-1 bg-purple-900/50 px-2 py-1 rounded">
                              <Lock className="w-3 h-3" />
                              Encrypted
                            </span>
                          )}

                          <span className="text-gray-500">{doc.fileSize || 'unknown'}</span>
                        </div>

                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {safeDate(doc.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Document Details */}
            {selectedDoc && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-2 space-y-6"
              >
                {/* Preview Section */}
                <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/50 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4">
                    📄 {getDocName(selectedDoc)}
                  </h3>

                  {message && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-4 rounded-lg mb-4 flex items-start gap-3 ${
                        message.includes("❌")
                          ? "bg-red-900/30 text-red-300 border border-red-500/50"
                          : message.includes("✅")
                          ? "bg-green-900/30 text-green-300 border border-green-500/50"
                          : "bg-blue-900/30 text-blue-300 border border-blue-500/50"
                      }`}
                    >
                      {message.includes("❌") ? (
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 mt-0.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      )}
                      <p className="text-sm">{message}</p>
                    </motion.div>
                  )}

                  {/* Document Info */}
                  <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div>
                      <p className="text-gray-400">File Type</p>
                      <p className="text-white font-semibold capitalize">
                        {selectedDoc.fileType}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-400">File Size</p>
                      <p className="text-white font-semibold">
                        {selectedDoc.fileSize}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-400">Created</p>
                      <p className="text-white font-semibold">
                        {safeDate(selectedDoc.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-400">Encryption</p>
                      <p className="text-white font-semibold">
                        {selectedDoc.isEncrypted ? "🔒 Encrypted" : "🔓 Open"}
                      </p>
                    </div>
                  </div>

                  {/* Preview */}
                  {previewMode && (
                    <div className="mb-6 bg-black/30 rounded-lg overflow-hidden">
                      {/* Determine if content is an image */}
                      {(selectedDoc.fileType === "image" || decryptedContent?.startsWith('data:image')) && decryptedContent ? (
                        <div className="relative">
                          <img
                            src={decryptedContent}
                            alt={getDocName(selectedDoc)}
                            className="w-full h-auto rounded-lg cursor-pointer"
                            style={{ maxHeight: 300, objectFit: 'contain' }}
                            onClick={() => setFullscreenPreview({ dataUrl: decryptedContent, name: getDocName(selectedDoc) })}
                          />
                          <button
                            onClick={() => setFullscreenPreview({ dataUrl: decryptedContent, name: getDocName(selectedDoc) })}
                            className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20"
                          >
                            <Eye className="w-3.5 h-3.5" /> Full Preview
                          </button>
                        </div>
                      ) : (selectedDoc.fileType === "pdf" || decryptedContent?.startsWith('data:application/pdf') || decryptedContent) ? (
                        <div className="p-6 text-center">
                          <p className="text-4xl mb-2">📄</p>
                          <p className="text-gray-300 font-medium">{getDocName(selectedDoc)}</p>
                          <p className="text-gray-500 text-xs mt-1 mb-3">
                            {selectedDoc.fileType === "pdf" || decryptedContent?.startsWith('data:application/pdf')
                              ? 'PDF — tap Preview to open with your PDF app'
                              : 'Tap Preview to open this file'}
                          </p>
                          <button
                            onClick={() => decryptedContent && openPdfNatively(decryptedContent, getDocName(selectedDoc))}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition"
                          >
                            📂 Open with device app
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleDownloadDocument(selectedDoc)}
                      className="py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download
                    </button>

                    <button
                      onClick={() => {
                        if (decryptedContent) {
                          setFullscreenPreview({ dataUrl: decryptedContent, name: getDocName(selectedDoc) });
                        }
                      }}
                      disabled={!decryptedContent}
                      className="py-3 px-4 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:opacity-40 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      Preview
                    </button>

                    <button
                      onClick={() => handleShareDocument(selectedDoc)}
                      disabled={isSharing}
                      className="py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-5 h-5" />
                      Share
                    </button>

                    <button
                      onClick={() => handleDeleteDocument(selectedDoc)}
                      className="py-3 px-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Security Info */}
                <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3">
                    🔐 Security Information
                  </h4>

                  <ul className="space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>All documents are encrypted locally</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Stored securely in your vault</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Only you can access your documents</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Decryption key stored securely</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
      <BottomNav />
      {/* Full-screen image preview portal — renders above everything */}
      {FullscreenPreview}
    </div>
  );
}
