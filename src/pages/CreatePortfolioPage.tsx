import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PORTFOLIOS_STORAGE_KEY,
  type PortfolioFlowDraft,
  type PortfolioItem,
  type PortfolioTypeOption,
  readJsonArray,
  writeFlowDraft,
} from "../utils/portfolioFlow";

const typeOptions: PortfolioTypeOption[] = ["Placement", "Masters", "Professional"];

const CreatePortfolioPage = () => {
  const navigate = useNavigate();
  const [portfolioName, setPortfolioName] = useState("");
  const [selectedType, setSelectedType] = useState<PortfolioTypeOption>("Placement");

  const handleNext = () => {
    const trimmedName = portfolioName.trim();
    if (!trimmedName) {
      alert("Portfolio Name is required.");
      return;
    }

    const nowIso = new Date().toISOString();
    const newPortfolio: PortfolioItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedName,
      type: selectedType,
      time: "Just now",
      docs: 0,
      views: 0,
      status: "Active",
      createdAt: nowIso,
    };

    const existing = readJsonArray<PortfolioItem>(PORTFOLIOS_STORAGE_KEY);
    localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify([newPortfolio, ...existing]));

    const flowDraft: PortfolioFlowDraft = {
      portfolio: newPortfolio,
      selectedDocumentIds: [],
      selectedTemplate: null,
      includeTableOfContents: false,
    };
    writeFlowDraft(flowDraft);

    window.dispatchEvent(new Event("storage"));
    navigate("/portfolio/select-documents", {
      state: {
        portfolioName: trimmedName,
        portfolioType: selectedType,
      },
    });
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#0b1220] via-[#111827] to-[#030712] text-white -mx-4 -mt-4 flex flex-col">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <h1 className="text-2xl font-bold mb-6">Create Portfolio</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="rounded-2xl bg-white/10 border border-white/15 p-4">
          <h2 className="text-lg font-semibold mb-4">Portfolio Basics</h2>

          <div className="mb-5">
            <label htmlFor="portfolio-name" className="block text-sm text-white/80 mb-2">
              Portfolio Name
            </label>
            <input
              id="portfolio-name"
              type="text"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              placeholder="e.g. Summer Internship 2024"
              className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <p className="text-sm text-white/80 mb-2">Select Portfolio Type</p>
            <div className="grid grid-cols-1 gap-2">
              {typeOptions.map((option) => {
                const isSelected = selectedType === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedType(option)}
                    className={`text-left rounded-xl px-4 py-3 border transition-colors ${
                      isSelected
                        ? "bg-blue-500/25 border-blue-400 text-white"
                        : "bg-white/5 border-white/15 text-white/80"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 bg-[#0b1220]/95 border-t border-white/10 px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate(-1)}
            className="py-3 rounded-xl border border-white/20 text-white/80"
          >
            Cancel
          </button>
          <button
            onClick={handleNext}
            className="py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePortfolioPage;
