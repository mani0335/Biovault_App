import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, FileText, FolderKanban, GraduationCap, Award, FileBadge2 } from "lucide-react";
import {
  type PortfolioFlowDraft,
  type VaultFileRecord,
  readFlowDraft,
  readJsonArray,
  writeFlowDraft,
} from "../utils/portfolioFlow";

type FilterTab = "All" | "Resume" | "Projects" | "Internships" | "Certificates";

interface DocWithTag extends VaultFileRecord {
  tag: Exclude<FilterTab, "All">;
}

const SelectDocumentsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialDraft = readFlowDraft();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialDraft?.selectedDocumentIds ?? []);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const portfolioName = (location.state as { portfolioName?: string } | null)?.portfolioName || "";
  const portfolioType = (location.state as { portfolioType?: string } | null)?.portfolioType || "";

  useEffect(() => {
    // Temporary debug logs for navigation state visibility.
    console.log("SelectDocuments location.state:", location.state);
  }, [location.state]);

  const shouldShowFallback = !initialDraft && (!portfolioName || !portfolioType);

  const vaultFiles = readJsonArray<VaultFileRecord>("vaultFiles");

  const classifyTag = (name: string): Exclude<FilterTab, "All"> => {
    const lower = name.toLowerCase();
    if (lower.includes("resume") || lower.includes("cv")) return "Resume";
    if (lower.includes("intern")) return "Internships";
    if (lower.includes("certificate") || lower.includes("certification")) return "Certificates";
    return "Projects";
  };

  const docs: DocWithTag[] = vaultFiles.map((file) => ({
    ...file,
    tag: classifyTag(file.name),
  }));

  const filteredDocs = useMemo(() => {
    if (activeTab === "All") return docs;
    return docs.filter((doc) => doc.tag === activeTab);
  }, [activeTab, docs]);

  const tabs: FilterTab[] = ["All", "Resume", "Projects", "Internships", "Certificates"];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]));
  };

  const clearAll = () => setSelectedIds([]);

  const handleNext = () => {
    if (!initialDraft) {
      navigate("/portfolio/create");
      return;
    }

    const updatedDraft: PortfolioFlowDraft = {
      ...initialDraft,
      selectedDocumentIds: selectedIds,
    };
    writeFlowDraft(updatedDraft);
    window.dispatchEvent(new Event("storage"));
    navigate("/portfolio/choose-template");
  };

  const getTagIcon = (tag: Exclude<FilterTab, "All">) => {
    if (tag === "Resume") return FileBadge2;
    if (tag === "Projects") return FolderKanban;
    if (tag === "Internships") return GraduationCap;
    return Award;
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#0b1220] via-[#111827] to-[#030712] text-white -mx-4 -mt-4 flex flex-col">
      <div className="px-4 pt-2 text-[11px] text-white/60 shrink-0 truncate">
        {JSON.stringify(location.state)}
      </div>

      {shouldShowFallback ? (
        <div className="flex-1 min-h-0 px-4 py-6 flex flex-col items-center justify-center gap-4">
          <p className="text-white/80 text-center">No portfolio data found.</p>
          <button
            onClick={() => navigate("/portfolio/create")}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white"
          >
            Back to Create Portfolio
          </button>
        </div>
      ) : (
        <>
      <div className="px-4 pt-5 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate("/portfolio/create")} className="p-2 rounded-lg bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">Select Documents</h1>
          <button onClick={clearAll} className="text-sm text-blue-300">
            Clear All
          </button>
        </div>
        <p className="text-sm text-white/70">
          {selectedIds.length} Documents Selected
          {portfolioName ? ` · ${portfolioName}` : ""}
          {portfolioType ? ` (${portfolioType})` : ""}
        </p>
      </div>

      <div className="px-4 py-3 overflow-x-auto shrink-0">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-full text-xs whitespace-nowrap ${
                activeTab === tab ? "bg-blue-500 text-white" : "bg-white/10 text-white/70 border border-white/15"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredDocs.map((doc) => {
            const isSelected = selectedIds.includes(doc.id);
            const TagIcon = getTagIcon(doc.tag);
            return (
              <button
                key={doc.id}
                onClick={() => toggleSelect(doc.id)}
                className={`relative rounded-2xl border p-3 text-left transition-colors ${
                  isSelected ? "bg-blue-500/20 border-blue-400" : "bg-white/10 border-white/10"
                }`}
              >
                <div className="absolute top-2 right-2">
                  <span
                    className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                      isSelected ? "bg-blue-500 border-blue-400" : "border-white/50"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </span>
                </div>

                <div className="h-20 rounded-xl bg-black/20 border border-white/10 mb-3 overflow-hidden flex items-center justify-center">
                  {doc.type.includes("image") ? (
                    <img src={doc.data} alt={doc.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-8 h-8 text-white/70" />
                  )}
                </div>

                <p className="text-sm font-medium truncate">{doc.name}</p>
                <div className="text-xs text-white/60 mt-1 flex items-center gap-1">
                  <TagIcon className="w-3 h-3" />
                  <span>{doc.tag}</span>
                </div>
                <p className="text-xs text-white/50 mt-1">{new Date(doc.uploadedAt).toLocaleDateString()}</p>
              </button>
            );
          })}
        </div>

        {filteredDocs.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-white/70">
            No documents found in Vault for this filter.
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-4 pb-24 border-t border-white/10 bg-[#0b1220]/90">
        <button
          onClick={handleNext}
          disabled={selectedIds.length === 0}
          className={`w-full py-3 rounded-xl font-medium ${
            selectedIds.length > 0 ? "bg-blue-500 text-white" : "bg-white/15 text-white/40 cursor-not-allowed"
          }`}
        >
          Next → Choose Template
        </button>
      </div>
      </>
      )}
    </div>
  );
};

export default SelectDocumentsPage;
