import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Eye, Download, Calendar, Clock, Monitor, Smartphone } from 'lucide-react';
import Header from '../components/Header';
import type { Portfolio, PortfolioAccessLog } from '../types/Portfolio';

const PortfolioTracking = () => {
  const navigate = useNavigate();
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [accessLogs, setAccessLogs] = useState<PortfolioAccessLog[]>([]);

  useEffect(() => {
    // Load portfolio and access logs from localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: Portfolio) => p.id === portfolioId);
    
    if (foundPortfolio) {
      setPortfolio(foundPortfolio);
    } else {
      navigate('/portfolios');
    }

    const logs = JSON.parse(localStorage.getItem('portfolioAccessLogs') || '[]');
    const portfolioLogs = logs.filter((log: PortfolioAccessLog) => log.portfolioId === portfolioId);
    setAccessLogs(portfolioLogs);
  }, [portfolioId, navigate]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDeviceIcon = (device: string) => {
    return device.includes('Mobile') ? (
      <Smartphone className="w-4 h-4" />
    ) : (
      <Monitor className="w-4 h-4" />
    );
  };

  const getActionIcon = (action: PortfolioAccessLog['action']) => {
    switch (action) {
      case 'view':
        return <Eye className="w-4 h-4 text-blue-500" />;
      case 'download':
        return <Download className="w-4 h-4 text-green-500" />;
      case 'share':
        return <Users className="w-4 h-4 text-purple-500" />;
      default:
        return <Eye className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActionColor = (action: PortfolioAccessLog['action']) => {
    switch (action) {
      case 'view':
        return 'text-blue-500';
      case 'download':
        return 'text-green-500';
      case 'share':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  const uniqueViewers = [...new Set(accessLogs.map(log => log.ipAddress))].length;

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
          <p className="mt-4 text-gray-600">Loading portfolio tracking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showWelcome={false} />
      
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate(`/portfolio/${portfolioId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Portfolio Analytics</h1>
        </div>

        {/* Portfolio Overview */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{portfolio.name}</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
                <Eye className="w-6 h-6" />
                <span className="text-2xl font-bold">{portfolio.views || 0}</span>
              </div>
              <p className="text-sm text-blue-700">Total Views</p>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-center gap-2 text-green-600 mb-2">
                <Users className="w-6 h-6" />
                <span className="text-2xl font-bold">{uniqueViewers}</span>
              </div>
              <p className="text-sm text-green-700">Unique Viewers</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Created: {new Date(portfolio.createdAt).toLocaleDateString()}</span>
              <span>Type: {portfolio.type}</span>
            </div>
          </div>
        </div>

        {/* Access Logs */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Access Logs</h3>
              <span className="text-sm text-gray-600">
                {accessLogs.length} total access events
              </span>
            </div>
          </div>

          <div className="p-4">
            {accessLogs.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-gray-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Access Yet</h4>
                <p className="text-gray-600">
                  Share your portfolio to start tracking views and downloads
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {accessLogs.map((log, index) => (
                  <div key={log.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getActionColor(log.action)}`}>
                          {getActionIcon(log.action)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 capitalize">{log.action}</p>
                          <p className="text-sm text-gray-600">
                            {formatDate(log.timestamp)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        {getDeviceIcon(log.device || 'Desktop')}
                        <span>{log.device || 'Desktop'}</span>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        IP: {log.ipAddress}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Access Events:</span>
              <span className="text-sm font-semibold text-gray-900">{accessLogs.length}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Most Recent Access:</span>
              <span className="text-sm font-semibold text-gray-900">
                {accessLogs.length > 0 ? formatDate(accessLogs[0].timestamp) : 'None'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Share Link Status:</span>
              <span className={`text-sm font-semibold ${
                portfolio.shareToken && portfolio.shareExpiry && new Date(portfolio.shareExpiry) > new Date()
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {portfolio.shareToken && portfolio.shareExpiry && new Date(portfolio.shareExpiry) > new Date()
                  ? 'Active'
                  : 'Inactive'
                }
              </span>
            </div>
            
            {portfolio.shareExpiry && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Link Expires:</span>
                <span className="text-sm font-semibold text-gray-900">
                  {new Date(portfolio.shareExpiry).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioTracking;
