import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, Eye, Share2, Plus, MoreVertical, Trash2 } from "lucide-react";
import { type PortfolioItem } from "../utils/portfolioFlow";

type PortfolioStatus = "Active" | "Shared" | "Draft";
type PortfolioTab = "All" | "Active" | "Shared" | "Draft";

const PORTFOLIOS_STORAGE_KEY = "portfolios";

const samplePortfolios: PortfolioItem[] = [
  {
    id: "pf-1",
    title: "Summer Internship 2024",
    type: "Placement",
    time: "2h ago",
    docs: 8,
    views: 12,
    status: "Active",
    createdAt: "2026-04-17T08:10:00.000Z",
  },
  {
    id: "pf-2",
    title: "Product Designer Profile",
    type: "Professional",
    time: "Yesterday",
    docs: 11,
    views: 24,
    status: "Shared",
    createdAt: "2026-04-16T10:20:00.000Z",
  },
  {
    id: "pf-3",
    title: "Backend Engineer Portfolio Draft",
    type: "Professional",
    time: "3 days ago",
    docs: 6,
    views: 4,
    status: "Draft",
    createdAt: "2026-04-14T13:45:00.000Z",
  },
];

const PortfolioPage = () => {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([]);
  const [activeTab, setActiveTab] = useState<PortfolioTab>("All");
  const [sortDesc, setSortDesc] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");

  const readPortfolios = (): PortfolioItem[] => {
    try {
      const raw = localStorage.getItem(PORTFOLIOS_STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify(samplePortfolios));
        return samplePortfolios;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify(samplePortfolios));
        return samplePortfolios;
      }

      return parsed;
    } catch {
      localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify(samplePortfolios));
      return samplePortfolios;
    }
  };

  useEffect(() => {
    setPortfolios(readPortfolios());

    const syncPortfolios = () => setPortfolios(readPortfolios());
    window.addEventListener("storage", syncPortfolios);

    return () => {
      window.removeEventListener("storage", syncPortfolios);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const filteredPortfolios = useMemo(() => {
    const tabToStatus: Record<Exclude<PortfolioTab, "All">, PortfolioStatus> = {
      Active: "Active",
      Shared: "Shared",
      Draft: "Draft",
    };

    const baseList =
      activeTab === "All"
        ? portfolios
        : portfolios.filter((item) => item.status === tabToStatus[activeTab]);

    return [...baseList].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortDesc ? bTime - aTime : aTime - bTime;
    });
  }, [activeTab, portfolios, sortDesc]);

  const getBadgeClass = (status: PortfolioStatus) => {
    if (status === "Active") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    if (status === "Shared") return "bg-sky-500/20 text-sky-300 border border-sky-500/30";
    return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  };

  const tabs: PortfolioTab[] = ["All", "Active", "Shared", "Draft"];

  const handleSharePortfolio = async (portfolioId: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portfolio/view/${portfolioId}`);
      setToastMessage("Portfolio link copied");
    } catch {
      setToastMessage("Unable to copy link");
    }
    setOpenMenuId(null);
  };

  const handleDeletePortfolio = () => {
    if (!deleteTargetId) return;
    const updated = portfolios.filter((p) => p.id !== deleteTargetId);
    setPortfolios(updated);
    localStorage.setItem(PORTFOLIOS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("storage"));
    setDeleteTargetId(null);
    setOpenMenuId(null);
    setToastMessage("Portfolio deleted");
  };

  return (
    <div className="relative min-h-full bg-gradient-to-b from-[#0b1220] via-[#111827] to-[#030712] text-white px-4 py-6 pb-24">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Your Portfolios</h1>
          <button
            onClick={() => setSortDesc((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm text-white/90"
          >
            <ArrowUpDown className="w-4 h-4" />
            Sort
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-5">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/70 border border-white/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-3 pb-24">
          {filteredPortfolios.map((portfolio) => (
            <div key={portfolio.id} className="relative rounded-2xl bg-white/10 border border-white/15 p-4 shadow-lg">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{portfolio.title}</p>
                  <p className="text-sm text-white/70">
                    {portfolio.type} · {portfolio.time}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${getBadgeClass(portfolio.status)}`}>
                    {portfolio.status}
                  </span>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === portfolio.id ? null : portfolio.id)}
                    className="p-1.5 rounded-lg bg-white/10 border border-white/10"
                  >
                    <MoreVertical className="w-4 h-4 text-white/80" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-white/70 mb-3">
                <span>{portfolio.docs} Docs</span>
                <span>{portfolio.views} Views</span>
              </div>

              {openMenuId === portfolio.id && (
                <div className="absolute right-4 top-14 z-20 w-36 rounded-xl border border-white/10 bg-[#0b1220] p-1 shadow-xl">
                  <button
                    onClick={() => {
                      navigate(`/portfolio/view/${portfolio.id}`);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm hover:bg-white/10 inline-flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <button
                    onClick={() => handleSharePortfolio(portfolio.id)}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm hover:bg-white/10 inline-flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button
                    onClick={() => setDeleteTargetId(portfolio.id)}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-red-300 hover:bg-red-500/15 inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}

              <button
                onClick={() => navigate(`/portfolio/view/${portfolio.id}`)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-sm inline-flex items-center justify-center gap-1"
              >
                <Eye className="w-4 h-4" />
                View Portfolio
              </button>
            </div>
          ))}

          {filteredPortfolios.length === 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-white/70">
              No portfolios in this tab yet.
            </div>
          )}
        </div>
      </div>

      {deleteTargetId && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full rounded-2xl border border-white/15 bg-[#0b1220] p-4">
            <p className="text-base font-semibold mb-2">Delete Portfolio</p>
            <p className="text-sm text-white/70 mb-4">
              Are you sure you want to delete this portfolio?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="py-2.5 rounded-lg border border-white/20 text-white/80"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePortfolio}
                className="py-2.5 rounded-lg bg-red-500 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-black/80 text-white text-sm border border-white/15">
          {toastMessage}
        </div>
      )}

      <div className="absolute bottom-6 right-4">
        <button
          onClick={() => navigate("/portfolio/create")}
          className="h-14 w-14 rounded-full bg-blue-500 text-white shadow-xl hover:bg-blue-600 transition-colors flex items-center justify-center"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
};

export default PortfolioPage;
