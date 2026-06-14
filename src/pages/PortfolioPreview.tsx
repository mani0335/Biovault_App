import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Users, BarChart3, Eye, Download, Edit, Trash2, Share2, Plus, Briefcase, User, Mail, Phone, Globe } from 'lucide-react';
import Header from '../components/Header';
import type { Portfolio, ProfileData } from '../types/Portfolio';
import { getProfileData } from '../types/Portfolio';

interface VaultDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  uploadedAt: string;
}

const PortfolioPreview = () => {
  const navigate = useNavigate();
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);

  useEffect(() => {
    // Fetch portfolio by ID from localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: Portfolio) => p.id === portfolioId);
    
    if (foundPortfolio) {
      setPortfolio(foundPortfolio);
    } else {
      // Portfolio not found, redirect to portfolios list
      navigate('/portfolios');
      return;
    }

    // Load vault documents for document details
    const documents = JSON.parse(localStorage.getItem('vaultFiles') || '[]');
    setVaultDocuments(documents);
  }, [portfolioId, navigate]);

  // Helper function to find document by ID
  const getDocumentDetails = (docId: string): VaultDocument | undefined => {
    return vaultDocuments.find(doc => doc.id === docId);
  };

  // Helper function to get document icon
  const getDocumentIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('video')) return '🎥';
    return '📄';
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Handle edit portfolio
  const handleEditPortfolio = () => {
    if (!portfolio) return;
    navigate(`/portfolio/${portfolio.id}`);
  };

  // Handle share portfolio
  const handleSharePortfolio = () => {
    if (!portfolio) return;

    const shareToken = btoa(`${portfolio.id}:${Date.now()}`);
    const shareLink = `${window.location.origin}/portfolio/${portfolio.id}?token=${shareToken}`;
    
    navigator.clipboard.writeText(shareLink);
    alert('Share link copied to clipboard!');
  };

  // Handle download portfolio
  const handleDownloadPortfolio = () => {
    if (!portfolio) return;

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
              .document-item { margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; }
            </style>
          </head>
          <body>
            <h1>${portfolio.name}</h1>
            <p><strong>Type:</strong> ${portfolio.type}</p>
            <p><strong>Created:</strong> ${formatDate(portfolio.createdAt)}</p>
            ${portfolio.sections.map(section => `
              <div class="section">
                <h2>${section.title}</h2>
                ${section.documents.map(docId => {
                  const doc = getDocumentDetails(docId);
                  return doc ? `<div class="document-item">
                    <strong>${doc.name}</strong><br>
                    <small>${doc.type} • ${formatFileSize(doc.size)} • ${formatDate(doc.uploadedAt)}</small>
                  </div>` : '';
                }).join('')}
              </div>
            `).join('')}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Handle delete portfolio
  const handleDeletePortfolio = () => {
    if (!portfolio) return;

    if (confirm('Are you sure you want to delete this portfolio? This action cannot be undone.')) {
      const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
      const updatedPortfolios = portfolios.filter((p: Portfolio) => p.id !== portfolio.id);
      localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

      // Log access
      const accessLog = JSON.parse(localStorage.getItem('portfolioAccessLogs') || '[]');
      const newLog = {
        id: Date.now().toString(),
        portfolioId: portfolio.id,
        timestamp: new Date().toISOString(),
        device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
        ipAddress: 'Unknown',
        action: 'Deleted'
      };
      localStorage.setItem('portfolioAccessLogs', JSON.stringify([newLog, ...accessLog]));

      alert('Portfolio deleted successfully!');
      navigate('/portfolios');
    }
  };

  // Helper function to sort sections (with documents first)
  const getSortedSections = (sections: Portfolio['sections']) => {
    return [...sections].sort((a, b) => {
      // Sections with documents come first
      const aHasDocs = a.documents.length > 0;
      const bHasDocs = b.documents.length > 0;
      
      if (aHasDocs && !bHasDocs) return -1;
      if (!aHasDocs && bHasDocs) return 1;
      return 0;
    });
  };

  // Loading state
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

  // Safety check for sections
  if (!portfolio.sections || !Array.isArray(portfolio.sections)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Portfolio Structure Error</h2>
          <p className="text-gray-600">This portfolio has an invalid structure.</p>
          <button
            onClick={() => navigate('/portfolios')}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Portfolios
          </button>
        </div>
      </div>
    );
  }

  const sortedSections = getSortedSections(portfolio.sections);
  const profileData = getProfileData();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showWelcome={false} />
      
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/portfolios')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Portfolio Preview</h1>
            <div className="text-sm text-gray-600">
              {sortedSections.length} sections
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSharePortfolio}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={handleDownloadPortfolio}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleDeletePortfolio}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Portfolio Info */}
        <div className="bg-white rounded-2xl shadow-sm mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{portfolio.name}</h2>
                <p className="text-sm text-gray-600 mb-1">{portfolio.type} Portfolio</p>
                <p className="text-xs text-gray-500">
                  Created: {formatDate(portfolio.createdAt)}
                </p>
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

            {/* Profile Section */}
            {profileData.name && (
              <div className="p-6 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <User className="w-8 h-8 text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900">Profile</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profileData.email && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Email</p>
                        <p className="text-sm text-gray-600">{profileData.email}</p>
                      </div>
                    </div>
                  )}
                  
                  {profileData.phone && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Phone</p>
                        <p className="text-sm text-gray-600">{profileData.phone}</p>
                      </div>
                    </div>
                  )}
                  
                  {profileData.linkedin && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">LinkedIn</p>
                        <p className="text-sm text-gray-600">{profileData.linkedin}</p>
                      </div>
                    </div>
                  )}
                  
                  {profileData.github && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">GitHub</p>
                        <p className="text-sm text-gray-600">{profileData.github}</p>
                      </div>
                    </div>
                  )}
                  
                  {profileData.portfolio && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Portfolio</p>
                        <p className="text-sm text-gray-600">{profileData.portfolio}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STRUCTURED SECTIONS DISPLAY */}
        <div className="space-y-6">
          {portfolio.sections.map((section, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Section Header */}
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-500" />
                  {section.title}
                  <span className="text-sm font-normal text-gray-500">
                    ({section.documents.length} documents)
                  </span>
                </h3>
              </div>

              {/* Section Content */}
              <div className="p-4">
                {section.documents.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">No documents added</h4>
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
                                    {doc.type} {formatFileSize(doc.size)} {formatDate(doc.uploadedAt)}
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

        {/* Action Buttons */}
        <div className="bg-white rounded-2xl shadow-sm mt-6">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => navigate(`/portfolio/select-documents/${portfolio.id}`)}
                className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Documents
              </button>
              
              <button
                onClick={() => navigate(`/portfolio/create`)}
                className="px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4" />
                New Portfolio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioPreview;
