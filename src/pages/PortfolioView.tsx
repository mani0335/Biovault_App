import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, Download, Eye, Edit, Trash2, FileText, Users, BarChart3 } from 'lucide-react';
import Header from '../components/Header';
import type { Portfolio } from '../types/Portfolio';

interface VaultDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  uploadedAt: string;
}

const PortfolioView = () => {
  const navigate = useNavigate();
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Portfolio>>({});

  useEffect(() => {
    // Load portfolio from localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: Portfolio) => p.id === portfolioId);
    
    if (foundPortfolio) {
      setPortfolio(foundPortfolio);
      setEditData(foundPortfolio);
    } else {
      navigate('/portfolios');
    }
  }, [portfolioId, navigate]);

  const getDocumentDetails = (docId: string) => {
    return JSON.parse(localStorage.getItem('vaultFiles') || '[]').find((d: any) => d.id === docId);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!portfolio) return;

    const updatedPortfolio = { ...portfolio, ...editData, updatedAt: new Date().toISOString() };
    
    // Update in localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const updatedPortfolios = portfolios.map((p: Portfolio) => 
      p.id === portfolioId ? updatedPortfolio : p
    );
    localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

    setPortfolio(updatedPortfolio);
    setIsEditing(false);
    alert('Portfolio updated successfully!');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleShare = () => {
    if (!portfolio) return;

    // Generate secure share link
    const shareToken = btoa(`${portfolio.id}:${Date.now()}`);
    const shareLink = `${window.location.origin}/portfolio/${portfolio.id}?token=${shareToken}`;
    
    // Update portfolio with share token and expiry
    const updatedPortfolio = {
      ...portfolio,
      shareToken,
      shareExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };

    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const updatedPortfolios = portfolios.map((p: Portfolio) => 
      p.id === portfolioId ? updatedPortfolio : p
    );
    localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

    setPortfolio(updatedPortfolio);

    // Copy to clipboard
    navigator.clipboard.writeText(shareLink);
    alert('Share link copied to clipboard!');
  };

  const handleDelete = () => {
    if (!portfolio) return;

    if (confirm('Are you sure you want to delete this portfolio? This action cannot be undone.')) {
      // Remove from localStorage
      const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
      const updatedPortfolios = portfolios.filter((p: Portfolio) => p.id !== portfolioId);
      localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

      // Log access
      const accessLog = JSON.parse(localStorage.getItem('portfolioAccessLogs') || '[]');
      const newLog = {
        id: Date.now().toString(),
        portfolioId,
        timestamp: new Date().toISOString(),
        device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
        ipAddress: 'Unknown', // In production, you'd get this from server
        action: 'Deleted'
      };
      localStorage.setItem('portfolioAccessLogs', JSON.stringify([newLog, ...accessLog]));

      alert('Portfolio deleted successfully!');
      navigate('/portfolios');
    }
  };

  const handleDownloadPortfolio = () => {
    if (!portfolio) return;

    // Generate PDF (simplified version)
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${portfolio.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .section { margin-bottom: 30px; page-break-inside: avoid; }
              .section h2 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .section-content { margin-bottom: 20px; }
              .document-item { margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; }
            </style>
          </head>
          <body>
            <h1>${portfolio.name}</h1>
            <p><strong>Type:</strong> ${portfolio.type}</p>
            <p><strong>Created:</strong> ${new Date(portfolio.createdAt).toLocaleDateString()}</p>
            ${portfolio.sections.map(section => `
              <div class="section">
                <h2>${section.title}</h2>
                <div class="section-content">
                  ${section.documents.map(docId => {
                    const doc = JSON.parse(localStorage.getItem('vaultFiles') || '[]').find((d: any) => d.id === docId);
                    return doc ? `<div class="document-item">
                      <strong>${doc.name}</strong><br>
                      <small>${doc.type} • ${Math.round(doc.size / 1024)}KB</small>
                    </div>` : '';
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const getDocumentIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('video')) return '🎥';
    return '📄';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
          <p className="mt-4 text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showWelcome={false} />
      
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/portfolios')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{portfolio.name}</h1>
          
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={handleEdit}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <button
                  onClick={handleDownloadPortfolio}
                  className="p-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
            
            {isEditing && (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Info */}
        <div className="bg-white rounded-2xl shadow-sm">
          {/* Portfolio Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio Name</label>
                      <input
                        type="text"
                        value={editData.name || portfolio.name}
                        onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                      <select
                        value={editData.type || portfolio.type}
                        onChange={(e) => setEditData(prev => ({ ...prev, type: e.target.value as Portfolio['type'] }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="academic">Academic</option>
                        <option value="placement">Placement</option>
                        <option value="masters">Masters</option>
                        <option value="personal">Personal</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-1">{portfolio.name}</h2>
                    <p className="text-sm text-gray-600 mb-1">{portfolio.type} Portfolio</p>
                    <p className="text-xs text-gray-500">
                      Created: {new Date(portfolio.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <BarChart3 className="w-4 h-4" />
                  <span>{portfolio.views || 0} views</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{portfolio.uniqueViewers || 0} viewers</span>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Sections */}
          <div className="p-6">
            {portfolio.sections.map((section, index) => (
              <div key={index} className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  {section.title}
                </h3>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  {section.documents.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-gray-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">No documents in this section</h4>
                      <p className="text-gray-600">
                        Add documents to this section to showcase your work
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.documents.map((docId) => {
                        const doc = getDocumentDetails(docId);
                        return doc ? (
                          <div key={docId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <span className="text-lg">{getDocumentIcon(doc.type)}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-gray-900">{doc.name}</h4>
                                    <p className="text-sm text-gray-600">
                                      {doc.type} • {formatFileSize(doc.size)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    const win = window.open();
                                    if (win) {
                                      win.document.write(`
                                        <iframe src="${doc.data}" width="100%" height="100%"></iframe>
                                      `);
                                    }
                                  }}
                                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-4 h-4 text-gray-700" />
                                </button>
                                
                                <button
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = doc.data;
                                    link.download = doc.name;
                                    link.click();
                                  }}
                                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                  title="Download document"
                                >
                                  <Download className="w-4 h-4 text-gray-700" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioView;
