import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Download, Share2, Calendar, Users, FileText, Lock, Unlock } from 'lucide-react';
import Header from '../components/Header';
import type { Portfolio, PortfolioAccessLog } from '../types/Portfolio';

const SharedPortfolioView = () => {
  const { portfolioId, token } = useParams<{ portfolioId: string; token?: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [accessLog, setAccessLog] = useState<any>(null);

  useEffect(() => {
    // Verify token and load portfolio
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: Portfolio) => p.id === portfolioId);
    
    if (!foundPortfolio) {
      setIsAuthorized(false);
      return;
    }

    // Check if portfolio has share token and is not expired
    if (foundPortfolio.shareToken && foundPortfolio.shareExpiry) {
      const isExpired = new Date(foundPortfolio.shareExpiry) < new Date();
      
      if (isExpired) {
        setIsAuthorized(false);
        return;
      }

      // Simple token verification (in production, this would be server-side)
      const isValidToken = token === foundPortfolio.shareToken;
      
      if (isValidToken) {
        setPortfolio(foundPortfolio);
        setIsAuthorized(true);
        
        // Log access
        const accessLogs = JSON.parse(localStorage.getItem('portfolioAccessLogs') || '[]');
        const newLog = {
          id: Date.now().toString(),
          portfolioId,
          timestamp: new Date().toISOString(),
          device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
          ipAddress: 'Unknown', // In production, you'd get this from server
          action: 'Viewed'
        };
        localStorage.setItem('portfolioAccessLogs', JSON.stringify([newLog, ...accessLogs]));
        
        // Update view count
        const updatedPortfolio = {
          ...foundPortfolio,
          views: (foundPortfolio.views || 0) + 1,
          uniqueViewers: new Set(accessLogs.map((log: PortfolioAccessLog) => log.ipAddress)).size + 1
        };
        
        const updatedPortfolios = portfolios.map((p: Portfolio) => 
          p.id === portfolioId ? updatedPortfolio : p
        );
        localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));
        
        setAccessLog(newLog);
      } else {
        setIsAuthorized(false);
      }
    } else {
      setIsAuthorized(false);
    }
  }, [portfolioId, token]);

  const getDocumentDetails = (docId: string) => {
    return JSON.parse(localStorage.getItem('vaultFiles') || '[]').find((d: any) => d.id === docId);
  };

  const handleDownloadDocument = (docId: string) => {
    const doc = getDocumentDetails(docId);
    if (doc) {
      // Log download
      const accessLogs = JSON.parse(localStorage.getItem('portfolioAccessLogs') || '[]');
      const newLog = {
        id: Date.now().toString(),
        portfolioId,
        timestamp: new Date().toISOString(),
        device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
        ipAddress: 'Unknown',
        action: 'Downloaded'
      };
      localStorage.setItem('portfolioAccessLogs', JSON.stringify([newLog, ...accessLogs]));

      // Download file
      const link = document.createElement('a');
      link.href = doc.data;
      link.download = doc.name;
      link.click();
    }
  };

  const handleSharePortfolio = () => {
    if (!portfolio) return;
    
    const shareLink = `${window.location.origin}/portfolio/${portfolioId}?token=${token}`;
    navigator.clipboard.writeText(shareLink);
    alert('Share link copied to clipboard!');
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
          <p className="mt-4 text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-red-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              This portfolio is either private, the link has expired, or you don't have permission to view it.
            </p>
            
            <div className="space-y-3 text-left bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700"><strong>Possible reasons:</strong></p>
              <ul className="text-sm text-gray-600 space-y-2 ml-4">
                <li>• The share link has expired</li>
                <li>• The portfolio is set to private</li>
                <li>• Invalid access token</li>
              </ul>
            </div>
            
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold text-gray-900">{portfolio.name}</h1>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-green-600">
              <Unlock className="w-4 h-4" />
              <span className="text-sm font-medium">Public Access</span>
            </div>
            
            <button
              onClick={handleSharePortfolio}
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Share2 className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Portfolio Info */}
        <div className="bg-white rounded-2xl shadow-sm mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{portfolio.name}</h2>
                <p className="text-sm text-gray-600">{portfolio.type} Portfolio</p>
                <p className="text-xs text-gray-500">
                  Created: {new Date(portfolio.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <Eye className="w-4 h-4" />
                  <span>{portfolio.views || 0} views</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{portfolio.uniqueViewers || 0} viewers</span>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p>Shared via secure link</p>
              <p>Expires: {portfolio.shareExpiry ? new Date(portfolio.shareExpiry).toLocaleDateString() : 'Never'}</p>
            </div>
          </div>

          {/* Portfolio Sections */}
          <div className="p-6">
            {portfolio.sections.map((section, index) => (
              <div key={index} className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  {section.title}
                </h3>
                
                <div className="space-y-3">
                  {section.documents.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No documents in this section</p>
                    </div>
                  ) : (
                    section.documents.map((docId) => {
                      const doc = getDocumentDetails(docId);
                      return doc ? (
                        <div key={docId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                  <FileText className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <h4 className="font-medium text-gray-900">{doc.name}</h4>
                                  <p className="text-sm text-gray-600">
                                    {doc.type} • {Math.round(doc.size / 1024)}KB
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
                                onClick={() => handleDownloadDocument(docId)}
                                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                title="Download document"
                              >
                                <Download className="w-4 h-4 text-gray-700" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Access Info */}
        {accessLog && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Access Information</h3>
            
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Access Time:</span>
                <span className="font-medium text-gray-900">
                  {new Date(accessLog.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Device:</span>
                <span className="font-medium text-gray-900">{accessLog.device}</span>
              </div>
              <div className="flex justify-between">
                <span>Action:</span>
                <span className="font-medium text-gray-900 capitalize">{accessLog.action}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedPortfolioView;
