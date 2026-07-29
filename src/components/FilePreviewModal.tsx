import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileText, Music, Video, File, AlertCircle, Loader2 } from "lucide-react";
import { SecurePdfViewer } from "@/components/SecurePdfViewer";

interface FilePreviewModalProps {
  url: string;
  fileName: string;
  onClose: () => void;
  onDownload: () => void;
}

function detectType(url: string, fileName: string): string {
  // Filename extension takes priority — data: URL MIME can be mis-detected
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["txt", "md", "csv", "json", "xml"].includes(ext)) return "text";
  if (["docx", "doc"].includes(ext)) return "docx";
  if (["pptx", "ppt"].includes(ext)) return "pptx";
  if (["xlsx", "xls"].includes(ext)) return "xlsx";
  // Fall back to MIME type from data: URL
  if (url.startsWith("data:image/")) return "image";
  if (url.startsWith("data:application/pdf")) return "pdf";
  if (url.startsWith("data:video/")) return "video";
  if (url.startsWith("data:audio/")) return "audio";
  if (url.startsWith("data:text/")) return "text";
  return "unknown";
}

function TextViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (url.startsWith("data:")) {
      try {
        const b64 = url.split(",")[1];
        setText(atob(b64));
      } catch {
        setText("Could not decode text content.");
      }
    } else {
      fetch(url).then(r => r.text()).then(setText).catch(() => setText("Could not load text."));
    }
  }, [url]);
  if (!text) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" /></div>;
  return (
    <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[60vh] overflow-y-auto p-4 bg-slate-900/60 rounded-xl border border-slate-700/40">
      {text}
    </pre>
  );
}

function UnsupportedViewer({ type, fileName, onDownload }: { type: string; fileName: string; onDownload: () => void }) {
  const icons: Record<string, React.ElementType> = {
    docx: FileText, pptx: FileText, xlsx: FileText, unknown: File,
  };
  const Icon = icons[type] || File;
  const labels: Record<string, string> = {
    docx: "Word Document", pptx: "PowerPoint Presentation", xlsx: "Excel Spreadsheet", unknown: "File",
  };
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-600/30 to-violet-600/30 border border-fuchsia-500/30 flex items-center justify-center">
        <Icon className="w-8 h-8 text-fuchsia-300" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{fileName}</p>
        <p className="text-xs text-slate-400 mt-1">{labels[type] || "Binary file"}</p>
      </div>
      <p className="text-xs text-slate-500 max-w-xs">In-app preview is not available for this format. Download to open it in the appropriate application.</p>
      <button
        onClick={onDownload}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-sm font-semibold hover:from-fuchsia-500 hover:to-violet-500 transition-all"
      >
        <Download className="w-4 h-4" />
        Download to view
      </button>
    </div>
  );
}

export function FilePreviewModal({ url, fileName, onClose, onDownload }: FilePreviewModalProps) {
  const type = detectType(url, fileName);
  const [imgError, setImgError] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/95 flex flex-col"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-fuchsia-600/30 flex items-center justify-center flex-shrink-0">
              {type === "image" && <span className="text-sm">🖼️</span>}
              {type === "pdf" && <span className="text-sm">📄</span>}
              {type === "video" && <Video className="w-3.5 h-3.5 text-fuchsia-300" />}
              {type === "audio" && <Music className="w-3.5 h-3.5 text-fuchsia-300" />}
              {type === "text" && <FileText className="w-3.5 h-3.5 text-fuchsia-300" />}
              {!["image","pdf","video","audio","text"].includes(type) && <File className="w-3.5 h-3.5 text-fuchsia-300" />}
            </div>
            <p className="text-sm font-semibold text-white truncate">{fileName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onDownload}
              className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {type === "image" && !imgError && (
            <img
              src={url}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onError={() => setImgError(true)}
            />
          )}
          {type === "image" && imgError && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm">Could not render image</p>
            </div>
          )}
          {type === "pdf" && (
            <div className="w-full h-full">
              <SecurePdfViewer
                pdfData={url}
                fileName={fileName}
                downloadEnabled={true}
                onClose={onClose}
              />
            </div>
          )}
          {type === "video" && (
            <video
              src={url}
              controls
              controlsList="nodownload"
              className="max-w-full max-h-full rounded-lg shadow-2xl"
            />
          )}
          {type === "audio" && (
            <div className="flex flex-col items-center gap-6 py-10">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-700 flex items-center justify-center shadow-xl shadow-fuchsia-500/30">
                <Music className="w-10 h-10 text-white" />
              </div>
              <p className="text-sm font-semibold text-white">{fileName}</p>
              <audio src={url} controls className="w-72" />
            </div>
          )}
          {type === "text" && (
            <div className="w-full max-w-2xl">
              <TextViewer url={url} />
            </div>
          )}
          {["docx", "pptx", "xlsx", "unknown"].includes(type) && (
            <UnsupportedViewer type={type} fileName={fileName} onDownload={onDownload} />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
