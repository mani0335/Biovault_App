import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, LayoutTemplate } from "lucide-react";
import {
  type PortfolioFlowDraft,
  type VaultFileRecord,
  readFlowDraft,
  readJsonArray,
  writeFlowDraft,
} from "../utils/portfolioFlow";

type TemplateName = "Clean Professional" | "Card-based Modern" | "Minimal Resume";

const templates: Array<{ id: TemplateName; category: "Corporate" | "Creative"; previewClass: string }> = [
  { id: "Clean Professional", category: "Corporate", previewClass: "from-blue-400 to-blue-600" },
  { id: "Card-based Modern", category: "Creative", previewClass: "from-violet-400 to-indigo-600" },
  { id: "Minimal Resume", category: "Corporate", previewClass: "from-slate-400 to-slate-600" },
];

const ChoosePortfolioTemplatePage = () => {
  const navigate = useNavigate();
  const draft = readFlowDraft();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName | null>(
    (draft?.selectedTemplate as TemplateName | null) ?? null,
  );
  const [includeToc, setIncludeToc] = useState(draft?.includeTableOfContents ?? false);

  useEffect(() => {
    if (!draft) navigate("/portfolio/create");
  }, [draft, navigate]);

  if (!draft) return null;

  const handleNext = () => {
    if (!selectedTemplate) return;
    const updatedDraft: PortfolioFlowDraft = {
      ...draft,
      selectedTemplate,
      includeTableOfContents: includeToc,
    };
    writeFlowDraft(updatedDraft);
    window.dispatchEvent(new Event("storage"));
    const allDocs = readJsonArray<VaultFileRecord>("vaultFiles");
    const selectedDocs = allDocs.filter((doc) => draft.selectedDocumentIds.includes(doc.id));
    const templateKey = selectedTemplate === "Card-based Modern" ? "card" : "clean";

    navigate("/portfolio/preview", {
      state: {
        portfolioName: draft.portfolio.title,
        portfolioType: draft.portfolio.type,
        selectedDocs,
        selectedTemplate: templateKey,
      },
    });
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#0b1220] via-[#111827] to-[#030712] text-white -mx-4 -mt-4 flex flex-col">
      <div className="px-4 pt-5 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/portfolio/select-documents")} className="p-2 rounded-lg bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">Choose Template</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {templates.map((template) => {
          const isSelected = selectedTemplate === template.id;
          return (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`w-full rounded-2xl border p-3 text-left ${
                isSelected ? "border-blue-400 bg-blue-500/15" : "border-white/10 bg-white/10"
              }`}
            >
              <div className="relative h-24 rounded-xl overflow-hidden border border-white/10 mb-3">
                <div className={`absolute inset-0 bg-gradient-to-r ${template.previewClass} opacity-70`} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <LayoutTemplate className="w-8 h-8 text-white" />
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <p className="font-semibold">{template.id}</p>
              <p className="text-xs text-white/70 mt-1">{template.category}</p>
            </button>
          );
        })}

        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 p-3">
          <span className="text-sm">Include Table of Contents</span>
          <input
            type="checkbox"
            checked={includeToc}
            onChange={(e) => setIncludeToc(e.target.checked)}
            className="h-4 w-4 accent-blue-500"
          />
        </label>
      </div>

      <div className="shrink-0 px-4 py-4 pb-24 border-t border-white/10 bg-[#0b1220]/90">
        <button
          onClick={handleNext}
          disabled={!selectedTemplate}
          className={`w-full py-3 rounded-xl font-medium ${
            selectedTemplate ? "bg-blue-500 text-white" : "bg-white/15 text-white/40 cursor-not-allowed"
          }`}
        >
          Next → Preview
        </button>
      </div>
    </div>
  );
};

export default ChoosePortfolioTemplatePage;
