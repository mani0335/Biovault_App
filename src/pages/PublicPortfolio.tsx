import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

const PublicPortfolio = () => {
  const { id } = useParams();
  const [config, setConfig] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Read config from localStorage
    const shareConfig = JSON.parse(localStorage.getItem(`share_${id}`) || "null");
    
    if (!shareConfig) {
      setError("Access denied");
      setLoading(false);
      return;
    }

    // Validate config
    const now = Date.now();
    const created = shareConfig.createdAt;

    // Check if revoked
    if (shareConfig.revoked) {
      setError("Access revoked");
      setLoading(false);
      return;
    }

    // Check expiry
    const limits = {
      "24h": 86400000,
      "7d": 604800000,
      "30d": 2592000000
    };

    const expiryLimit = limits[shareConfig.expiry as keyof typeof limits];
    if (expiryLimit && now - created > expiryLimit) {
      setError("Link expired");
      setLoading(false);
      return;
    }

    // Check views exceeded
    if (shareConfig.views >= shareConfig.maxViews) {
      setError("View limit exceeded");
      setLoading(false);
      return;
    }

    // If valid, increase views and save
    shareConfig.views += 1;
    localStorage.setItem(`share_${id}`, JSON.stringify(shareConfig));
    setConfig(shareConfig);

    // Load portfolio data
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: any) => p.id === id);
    
    if (foundPortfolio) {
      setPortfolio(foundPortfolio);
    } else {
      setError("Portfolio not found");
    }
    
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">{error}</h2>
          <p className="text-gray-600">This link is no longer accessible.</p>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Portfolio Not Found</h2>
          <p className="text-gray-600">The requested portfolio does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{portfolio.name}</h1>
          <p className="text-gray-600 capitalize">{portfolio.type} Portfolio</p>
          
          {/* Share info */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>Views: {config.views}/{config.maxViews}</span>
              <span>•</span>
              <span className={config.viewOnly ? "text-orange-600" : "text-green-600"}>
                {config.viewOnly ? "View Only" : "Download Allowed"}
              </span>
              <span>•</span>
              <span>Expires: {config.expiry}</span>
            </div>
          </div>
        </div>

        {/* Portfolio Content */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Contents</h2>
          
          {portfolio.sections && portfolio.sections.length > 0 ? (
            <div className="space-y-6">
              {portfolio.sections.map((section: any, index: number) => (
                <div key={index} className="border-b border-gray-200 pb-4 last:border-0">
                  <h3 className="font-medium text-gray-900 mb-3">{section.title}</h3>
                  
                  {section.documents && section.documents.length > 0 ? (
                    <div className="space-y-2">
                      {section.documents.map((doc: any, docIndex: number) => {
                        // Handle both old format (docId string) and new format (doc object)
                        const docObj = typeof doc === 'string' 
                          ? JSON.parse(localStorage.getItem('vaultFiles') || '[]')
                              .find((d: any) => d.id === doc)
                          : doc;
                        
                        return docObj ? (
                          <div key={docIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{docObj.name}</p>
                              <p className="text-sm text-gray-600">{docObj.type || 'Document'}</p>
                            </div>
                            
                            {!config.viewOnly && config.allowDownload && (
                              <button
                                onClick={() => {
                                  // Handle both base64 URL and file data
                                  const downloadUrl = docObj.url || docObj.data;
                                  if (downloadUrl) {
                                    const link = document.createElement('a');
                                    link.href = downloadUrl;
                                    link.download = docObj.name;
                                    link.click();
                                  }
                                }}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No documents in this section</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No sections in this portfolio</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicPortfolio;
