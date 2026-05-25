/**
 * SecurePdfViewer — in-app PDF rendering using PDF.js
 *
 * Security features:
 *  • Renders into HTML5 <canvas> — file bytes never touch a URL / external app
 *  • onContextMenu blocked  → long-press save disabled
 *  • user-select: none       → text cannot be selected / copied
 *  • Print blocked via beforeprint event + CSS @media print { display:none }
 *  • Download disabled       → no Save-As link, no native share for PDF
 */

import { useState, useEffect, useRef, useCallback } from "react";
// Vite resolves this at build time and emits the worker file into the assets directory.
// The ?url suffix returns a string URL that pdf.js can use as its worker source.
// @ts-expect-error — pdfjs-dist worker URL import (Vite-specific)
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader, AlertCircle } from "lucide-react";

interface SecurePdfViewerProps {
  /** Raw base64 string (no data: prefix) or a full  data:application/pdf;base64,…  URL */
  pdfData: string;
  /** Original file name shown in the header */
  fileName?: string;
  /** If false the user cannot save / share the file */
  downloadEnabled?: boolean;
  onClose?: () => void;
}

export function SecurePdfViewer({
  pdfData,
  fileName = "document.pdf",
  downloadEnabled = false,
  onClose,
}: SecurePdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // ── Block print ────────────────────────────────────────────────────────────
  useEffect(() => {
    const blockPrint = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      alert("🔒 Printing is not allowed for this protected document.");
    };
    window.addEventListener("beforeprint", blockPrint);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        alert("🔒 Printing is not allowed.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("beforeprint", blockPrint);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // ── Load PDF.js and parse document ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Dynamically import pdfjs-dist so it only loads when needed
        const pdfjs = await import("pdfjs-dist");

        // Point the worker to the bundled worker file
        // Vite copies the file into /assets automatically via the ?url import
        const workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).href;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

        // Build a Uint8Array from base64
        const raw = pdfData.startsWith("data:")
          ? pdfData.split(",")[1]
          : pdfData;
        const binary = atob(raw);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) { doc.destroy(); return; }

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load PDF"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // ── Render the current page onto the canvas ────────────────────────────────
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF render error:", err);
      }
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const goToPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3.5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 16,
          color: "white",
        }}
      >
        <Loader size={36} className="animate-spin text-cyan-400" />
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Loading document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          color: "white",
          padding: 32,
          textAlign: "center",
        }}
      >
        <AlertCircle size={40} className="text-red-400" />
        <p style={{ fontWeight: 700, fontSize: 16 }}>Cannot display PDF</p>
        <p style={{ color: "#94a3b8", fontSize: 13, maxWidth: 280 }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f172a" }}
      onContextMenu={(e) => e.preventDefault()} // block long-press save
    >
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "rgba(15,23,42,0.95)",
          borderBottom: "1px solid rgba(139,92,246,0.3)",
          flexShrink: 0,
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 8,
              padding: "6px 12px",
              color: "white",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back
          </button>
        )}

        <div style={{ flex: 1, overflow: "hidden" }}>
          <p
            style={{
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            🔒 {fileName}
          </p>
          <p style={{ color: "#94a3b8", fontSize: 11 }}>
            Page {currentPage} / {totalPages}
          </p>
        </div>

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          disabled={scale <= 0.5}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 8,
            padding: 6,
            color: "white",
            cursor: "pointer",
            display: "flex",
            opacity: scale <= 0.5 ? 0.4 : 1,
          }}
        >
          <ZoomOut size={16} />
        </button>
        <span style={{ color: "#94a3b8", fontSize: 12, minWidth: 40, textAlign: "center" }}>
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={scale >= 3.5}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 8,
            padding: 6,
            color: "white",
            cursor: "pointer",
            display: "flex",
            opacity: scale >= 3.5 ? 0.4 : 1,
          }}
        >
          <ZoomIn size={16} />
        </button>

        {/* Security badge */}
        <div
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 6,
            padding: "3px 8px",
            color: "#fca5a5",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          🔒 SECURE
        </div>
      </div>

      {/* ── Canvas scroll area ────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "12px 8px",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: "100%",
            boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
            borderRadius: 4,
            display: "block",
          }}
        />
      </div>

      {/* ── Page navigation bar ───────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "12px 16px",
            background: "rgba(15,23,42,0.95)",
            borderTop: "1px solid rgba(139,92,246,0.3)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={goToPrev}
            disabled={currentPage <= 1}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background:
                currentPage <= 1
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(139,92,246,0.25)",
              border: `1px solid ${currentPage <= 1 ? "rgba(255,255,255,0.1)" : "rgba(139,92,246,0.5)"}`,
              borderRadius: 10,
              padding: "8px 16px",
              color: currentPage <= 1 ? "#64748b" : "white",
              cursor: currentPage <= 1 ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <ChevronLeft size={16} />
            Prev
          </button>

          <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={goToNext}
            disabled={currentPage >= totalPages}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background:
                currentPage >= totalPages
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(139,92,246,0.25)",
              border: `1px solid ${currentPage >= totalPages ? "rgba(255,255,255,0.1)" : "rgba(139,92,246,0.5)"}`,
              borderRadius: 10,
              padding: "8px 16px",
              color: currentPage >= totalPages ? "#64748b" : "white",
              cursor: currentPage >= totalPages ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Download-disabled notice ──────────────────────────────────────── */}
      {!downloadEnabled && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(239,68,68,0.1)",
            borderTop: "1px solid rgba(239,68,68,0.2)",
            color: "#fca5a5",
            fontSize: 11,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          🔒 Download & print are disabled for this protected document.
        </div>
      )}

      {/* ── Print-block CSS ────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { display: none !important; }
        }
      `}</style>
    </div>
  );
}
