import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import {
  PORTFOLIO_FLOW_DRAFT_KEY,
  PORTFOLIOS_STORAGE_KEY,
  type PortfolioItem,
  type VaultFileRecord,
  readFlowDraft,
  readJsonArray,
} from "../utils/portfolioFlow";

const PortfolioFlowPreviewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = readFlowDraft();
  const navState = (location.state as {
    portfolioName?: string;
    portfolioType?: string;
    selectedDocs?: VaultFileRecord[];
    selectedTemplate?: string;
  } | null) ?? null;

  const allVaultDocs = readJsonArray<VaultFileRecord>("vaultFiles");
  const draftDocs = useMemo(
    () => (draft ? allVaultDocs.filter((doc) => draft.selectedDocumentIds.includes(doc.id)) : []),
    [allVaultDocs, draft],
  );

  const portfolioName = navState?.portfolioName || draft?.portfolio.title || "";
  const portfolioType = navState?.portfolioType || draft?.portfolio.type || "";
  const selectedTemplate = navState?.selectedTemplate || (draft?.selectedTemplate === "Card-based Modern" ? "card" : "clean");
  const selectedDocs = (navState?.selectedDocs && Array.isArray(navState.selectedDocs) ? navState.selectedDocs : draftDocs) ?? [];
  const hasRequiredData = Boolean(portfolioName && portfolioType);

  useEffect(() => {
    if (!hasRequiredData && !draft) {
      console.warn("Portfolio preview missing required data:", location.state);
    }
  }, [hasRequiredData, draft, location.state]);

  const handlePublish = () => {
    if (!draft) {
      navigate("/portfolio");
      return;
    }
    const existing = readJsonArray<PortfolioItem>(PORTFOLIOS_STORAGE_KEY);
    const updated = existing.map((item) => {
      if (item.id !== draft.portfolio.id) return item;
      return {
        ...item,
        docs: draft.selectedDocumentIds.length,
        template: draft.selectedTemplate ?? undefined,
        includeTableOfContents: draft.includeTableOfContents,
        selectedDocumentIds: draft.selectedDocumentIds,
        time: "Just now",
        status: "Active" as const,
      };
    });
    localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify(updated));
    localStorage.removeItem(PORTFOLIO_FLOW_DRAFT_KEY);
    window.dispatchEvent(new Event("storage"));
    navigate("/portfolio");
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#0b1220] via-[#111827] to-[#030712] text-white -mx-4 -mt-4 flex flex-col">
      <div className="px-4 pt-5 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/portfolio/templates")} className="p-2 rounded-lg bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">Portfolio Preview</h1>
          <span className="text-xs text-white/70">{portfolioType}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {!hasRequiredData ? (
          <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-center text-white/80">
            <p className="mb-4">No portfolio data found.</p>
            <button
              onClick={() => navigate("/portfolio/create")}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white"
            >
              Go to Create Portfolio
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xl font-bold">{portfolioName}</p>
              <p className="text-sm text-white/70 mt-1">
                {portfolioType} · Template: {selectedTemplate}
              </p>
            </div>

            {selectedDocs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-center text-white/70">
                No documents selected for preview.
              </div>
            ) : selectedTemplate === "card" ? (
              <div className="grid grid-cols-2 gap-3">
                {selectedDocs.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-white/10 bg-white/10 p-3">
                    <div className="h-24 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center bg-black/20 mb-2">
                      {doc.type.includes("image") ? (
                        <img src={doc.data} alt={doc.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-white/70 uppercase">{doc.type.includes("pdf") ? "PDF" : "DOC"}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-white/60">
                      {doc.type.includes("image") ? "Image" : "PDF"} · {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDocs.map((doc) => (
                  <div key={doc.id} className="rounded-xl bg-white/10 border border-white/10 p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center bg-black/20">
                        {doc.type.includes("image") ? (
                          <img src={doc.data} alt={doc.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-white/70 uppercase">{doc.type.includes("pdf") ? "PDF" : "DOC"}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-white/60">
                          {doc.type.includes("image") ? "Image" : "PDF"} · {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 px-4 py-4 pb-24 border-t border-white/10 bg-[#0b1220]/90">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate("/portfolio/templates")}
            className="py-3 rounded-xl border border-white/20 text-white/80"
          >
            Back
          </button>
          <button
            onClick={handlePublish}
            className="py-3 rounded-xl bg-blue-500 text-white inline-flex items-center justify-center gap-1"
          >
            <Save className="w-4 h-4" />
            Generate / Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortfolioFlowPreviewPage;
