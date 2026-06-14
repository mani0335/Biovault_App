import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, User, Calendar, Download, Eye } from "lucide-react";

const PortfolioViewPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("=== PORTFOLIO VIEW DEBUG START ===");
    console.log("VIEW ID from URL:", id);
    console.log("VIEW ID type:", typeof id);
    
    if (!id) {
      console.log("ERROR: No ID found in URL params");
      setLoading(false);
      return;
    }
    
    // Fetch portfolio from localStorage
    const rawData = localStorage.getItem("portfolios");
    console.log("Raw localStorage data:", rawData);
    
    if (!rawData) {
      console.log("ERROR: No portfolios found in localStorage");
      setLoading(false);
      return;
    }
    
    const data = JSON.parse(rawData);
    console.log("Parsed portfolios array:", data);
    console.log("Number of portfolios:", data.length);
    
    // Log each portfolio ID for debugging
    data.forEach((p: any, index: number) => {
      console.log(`Portfolio ${index}: ID=${p.id}, Type=${typeof p.id}, Name=${p.name}`);
    });
    
    const found = data.find((p: any) => String(p.id) === String(id));
    console.log("FOUND portfolio:", found);
    console.log("Comparison used: String(p.id) === String(id)");
    console.log("=== PORTFOLIO VIEW DEBUG END ===");
    
    setPortfolio(found);
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
          <p className="mt-4 text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="page">
        <div className="page-content">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Portfolio not found</h2>
              <p className="text-gray-600 mb-4">The portfolio you're looking for doesn't exist.</p>
              <button
                onClick={() => navigate("/portfolio")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Portfolios
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/portfolio")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Portfolios
            </button>
            <h1 className="text-xl font-bold text-gray-900">{portfolio.name}</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-content">
        {/* Portfolio Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <User className="w-4 h-4" />
                <span className="text-sm">Type</span>
              </div>
              <p className="font-semibold text-gray-900">{portfolio.type}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Created</span>
              </div>
              <p className="font-semibold text-gray-900">
                {portfolio.createdAt ? new Date(portfolio.createdAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Status</span>
              </div>
              <p className="font-semibold text-gray-900">{portfolio.status || 'Active'}</p>
            </div>
          </div>
        </div>

        {/* Profile Information */}
        {portfolio.profile && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {portfolio.profile.fullName && (
                <div>
                  <span className="text-sm text-gray-600">Full Name</span>
                  <p className="font-medium text-gray-900">{portfolio.profile.fullName}</p>
                </div>
              )}
              {portfolio.profile.email && (
                <div>
                  <span className="text-sm text-gray-600">Email</span>
                  <p className="font-medium text-gray-900">{portfolio.profile.email}</p>
                </div>
              )}
              {portfolio.profile.phone && (
                <div>
                  <span className="text-sm text-gray-600">Phone</span>
                  <p className="font-medium text-gray-900">{portfolio.profile.phone}</p>
                </div>
              )}
              {portfolio.profile.role && (
                <div>
                  <span className="text-sm text-gray-600">Role</span>
                  <p className="font-medium text-gray-900">{portfolio.profile.role}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
          {portfolio.sections && portfolio.sections.length > 0 ? (
            <div className="space-y-6">
              {portfolio.sections.map((section: any, sectionIndex: number) => (
                <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3 capitalize">
                    {section.title.replace(/([A-Z])/g, ' $1').trim()}
                  </h3>
                  
                  {section.documents && section.documents.length > 0 ? (
                    <div className="space-y-2">
                      {section.documents.map((doc: any, docIndex: number) => (
                        <div key={docIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900">{doc.name}</p>
                            <p className="text-sm text-gray-600">{doc.type || 'Document'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                if (doc.url) {
                                  window.open(doc.url, '_blank');
                                }
                              }}
                              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                              title="View document"
                            >
                              <Eye className="w-4 h-4 text-gray-700" />
                            </button>
                            <button 
                              onClick={() => {
                                if (doc.url) {
                                  const link = document.createElement('a');
                                  link.href = doc.url;
                                  link.download = doc.name;
                                  link.click();
                                }
                              }}
                              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                              title="Download document"
                            >
                              <Download className="w-4 h-4 text-gray-700" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No documents in this section</p>
                  )}
                </div>
              ))}
            </div>
          ) : portfolio.selectedDocuments && Object.keys(portfolio.selectedDocuments).length > 0 ? (
            // Fallback to old format for backward compatibility
            <div className="space-y-4">
              {Object.entries(portfolio.selectedDocuments).map(([field, doc]: [string, any]) => (
                <div key={field} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 capitalize">{field}</h3>
                      <p className="text-sm text-gray-600">{doc.name}</p>
                      <p className="text-xs text-gray-500">{doc.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                        <Eye className="w-4 h-4 text-gray-700" />
                      </button>
                      <button className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                        <Download className="w-4 h-4 text-gray-700" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents</h3>
              <p className="text-gray-600">This portfolio doesn't have any documents yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioViewPage;
