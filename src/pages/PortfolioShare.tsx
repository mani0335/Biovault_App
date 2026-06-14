import { useParams } from "react-router-dom";
import { useState } from "react";

const PortfolioShare = () => {
  const { id } = useParams();

  const [viewOnly, setViewOnly] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [expiry, setExpiry] = useState("7d");
  const [maxViews, setMaxViews] = useState(10);
  const [generatedLink, setGeneratedLink] = useState("");

  const generateLink = () => {
    const link = `${window.location.origin}/p/${id}`;

    const config = {
      viewOnly,
      allowDownload,
      expiry,
      maxViews,
      views: 0,
      revoked: false,
      createdAt: Date.now()
    };

    localStorage.setItem(`share_${id}`, JSON.stringify(config));
    setGeneratedLink(link);
    navigator.clipboard.writeText(link);
  };

  return (
    <div className="p-5 max-w-md mx-auto space-y-5">
      <h1 className="text-xl font-bold">Share Portfolio</h1>

      {/* Share methods */}
      <div className="grid grid-cols-3 gap-3">
        <button className="p-3 bg-blue-100 rounded">Link</button>
        <button className="p-3 bg-purple-100 rounded">QR</button>
        <button className="p-3 bg-green-100 rounded">Email</button>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <label>
          <input 
            type="checkbox" 
            checked={viewOnly} 
            onChange={() => setViewOnly(!viewOnly)} 
          />
          View Only
        </label>

        <label>
          <input 
            type="checkbox" 
            checked={allowDownload} 
            onChange={() => setAllowDownload(!allowDownload)} 
          />
          Allow Download
        </label>
      </div>

      {/* Expiry */}
      <div>
        <p>Expiry</p>
        <div className="flex gap-2">
          {["24h", "7d", "30d"].map(e => (
            <button 
              key={e} 
              onClick={() => setExpiry(e)} 
              className={`px-3 py-1 rounded ${
                expiry === e ? "bg-blue-600 text-white" : "bg-gray-200"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      <div>
        <p>Max Views</p>
        <input
          type="number"
          value={maxViews}
          onChange={(e) => setMaxViews(Number(e.target.value))}
          className="border p-2 w-full"
        />
      </div>

      {/* Generate */}
      <button
        onClick={generateLink}
        className="w-full bg-blue-600 text-white p-3 rounded"
      >
        Generate Link
      </button>

      {generatedLink && (
        <div className="bg-green-100 p-2 rounded text-sm break-all">
          <p className="font-medium mb-2">Generated Link:</p>
          <p className="text-gray-700">{generatedLink}</p>
          <button
            onClick={() => navigator.clipboard.writeText(generatedLink)}
            className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm"
          >
            Copy Link
          </button>
        </div>
      )}
    </div>
  );
};

export default PortfolioShare;
