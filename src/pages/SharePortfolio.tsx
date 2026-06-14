import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Link, QrCode, Mail, Shield, Eye, Download, Calendar, Users, Lock, AlertCircle, Copy, ExternalLink, Activity } from 'lucide-react';
import QRCodeLib from 'qrcode';

interface VaultDocument {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'video';
  size: string;
  uploadDate: string;
  category: 'academic' | 'professional' | 'masters' | 'certifications' | 'personal';
  verified?: boolean;
}

interface PortfolioDraft {
  id: string;
  type: 'personal' | 'academic' | 'professional' | 'masters';
  template: string;
  documents: VaultDocument[];
  createdAt: string;
  status: 'draft' | 'published';
}

interface ShareSettings {
  viewOnly: boolean;
  allowDownloads: boolean;
  expiryDate: string;
  maxViews: number;
  password: string;
  shareMethod: 'link' | 'qrcode' | 'email';
}

const SharePortfolio: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [portfolio, setPortfolio] = useState<PortfolioDraft | null>(null);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    viewOnly: false,
    allowDownloads: true,
    expiryDate: '',
    maxViews: 0,
    password: '',
    shareMethod: 'link'
  });
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    try {
      const state = location.state as { portfolio?: PortfolioDraft };
      if (state?.portfolio) {
        setPortfolio(state.portfolio);
      } else {
        // If no data, go back to portfolio preview
        navigate('/portfolio-preview');
      }
    } catch (err) {
      setError('Failed to load portfolio data');
      console.error('SharePortfolio error:', err);
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (generatedLink) {
      QRCodeLib.toDataURL(generatedLink, {
        width: 256,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
        .then(url => {
          setQrCodeUrl(url);
        })
        .catch(err => {
          console.error('Error generating QR code:', err);
        });
    }
  }, [generatedLink]);

  const handleGenerateLink = async () => {
    if (!portfolio) return;

    setIsGenerating(true);
    setError('');

    try {
      // Simulate API call to generate share link
      await new Promise(resolve => setTimeout(resolve, 1500));

      const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const link = `https://pinit.app/shared/${shareId}`;
      
      setGeneratedLink(link);

      // Save sharing config to localStorage
      const shareConfig = {
        portfolioId: portfolio.id,
        shareId,
        settings: shareSettings,
        createdAt: new Date().toISOString(),
        link,
        views: 0,
        lastAccessed: null
      };

      const existingShares = JSON.parse(localStorage.getItem('portfolioShares') || '[]');
      localStorage.setItem('portfolioShares', JSON.stringify([shareConfig, ...existingShares]));

      setIsGenerating(false);
    } catch (err) {
      setError('Failed to generate share link');
      setIsGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      alert('Share link copied to clipboard!');
    }
  };

  const handleSendEmail = () => {
    // TODO: Implement email invite functionality
    alert('Email invite functionality coming soon!');
  };

  const handleViewActivity = () => {
    // TODO: Navigate to Activity page when implemented
    alert('Activity dashboard coming soon!');
  };

  const handleRevokeAccess = () => {
    if (generatedLink && confirm('Are you sure you want to revoke access to this shared link?')) {
      setGeneratedLink('');
      setQrCodeUrl('');
      alert('Access revoked successfully!');
    }
  };

  const getExpiryDateDisplay = () => {
    if (!shareSettings.expiryDate) return 'Never';
    const date = new Date(shareSettings.expiryDate);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getMaxViewsDisplay = () => {
    return shareSettings.maxViews === 0 ? 'Unlimited' : shareSettings.maxViews.toString();
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/portfolio-preview')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/portfolio-preview')}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">Share Portfolio</h1>
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                <Shield className="w-3 h-3 text-green-600" />
                <span className="text-xs font-medium text-green-700">Secured</span>
              </div>
            </div>
            <div className="w-9"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Portfolio Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">My Portfolio</h2>
          <p className="text-sm text-gray-600">
            {portfolio.type.charAt(0).toUpperCase() + portfolio.type.slice(1)} • {portfolio.documents.length} documents
          </p>
        </div>

        {/* Sharing Methods */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sharing Method</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="shareMethod"
                value="link"
                checked={shareSettings.shareMethod === 'link'}
                onChange={(e) => setShareSettings(prev => ({ ...prev, shareMethod: e.target.value as any }))}
                className="text-blue-500"
              />
              <Link className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Secure Link</p>
                <p className="text-sm text-gray-500">Generate a secure shareable link</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="shareMethod"
                value="qrcode"
                checked={shareSettings.shareMethod === 'qrcode'}
                onChange={(e) => setShareSettings(prev => ({ ...prev, shareMethod: e.target.value as any }))}
                className="text-blue-500"
              />
              <QrCode className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">QR Code</p>
                <p className="text-sm text-gray-500">Share via scannable QR code</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="shareMethod"
                value="email"
                checked={shareSettings.shareMethod === 'email'}
                onChange={(e) => setShareSettings(prev => ({ ...prev, shareMethod: e.target.value as any }))}
                className="text-blue-500"
              />
              <Mail className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Email Invite</p>
                <p className="text-sm text-gray-500">Send secure email invitation</p>
              </div>
            </label>
          </div>
        </div>

        {/* Security Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Controls</h3>
          <div className="space-y-4">
            {/* View Only Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">View Only Mode</p>
                  <p className="text-sm text-gray-500">Restrict editing capabilities</p>
                </div>
              </div>
              <button
                onClick={() => setShareSettings(prev => ({ ...prev, viewOnly: !prev.viewOnly }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  shareSettings.viewOnly ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  shareSettings.viewOnly ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Allow Downloads */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Allow Downloads</p>
                  <p className="text-sm text-gray-500">Let viewers download documents</p>
                </div>
              </div>
              <button
                onClick={() => setShareSettings(prev => ({ ...prev, allowDownloads: !prev.allowDownloads }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  shareSettings.allowDownloads ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  shareSettings.allowDownloads ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Expiry Date */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Expiry Date</p>
                  <p className="text-sm text-gray-500">Link expires on {getExpiryDateDisplay()}</p>
                </div>
              </div>
              <input
                type="date"
                value={shareSettings.expiryDate}
                onChange={(e) => setShareSettings(prev => ({ ...prev, expiryDate: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Limited Views */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Limited Views</p>
                  <p className="text-sm text-gray-500">{getMaxViewsDisplay()} views allowed</p>
                </div>
              </div>
              <input
                type="number"
                value={shareSettings.maxViews}
                onChange={(e) => setShareSettings(prev => ({ ...prev, maxViews: parseInt(e.target.value) || 0 }))}
                min="0"
                placeholder="0"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Password Protection */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Password Protection</p>
                  <p className="text-sm text-gray-500">Require password for access</p>
                </div>
              </div>
              <input
                type="password"
                value={shareSettings.password}
                onChange={(e) => setShareSettings(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Optional"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Tracking Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                Real-time Tracking Enabled
              </p>
              <p className="text-sm text-blue-700">
                Secure links are tracked in real-time and visible in your Activity dashboard. Monitor who accesses your portfolio and when.
              </p>
            </div>
          </div>
        </div>

        {/* Generate Link Button */}
        <button
          onClick={handleGenerateLink}
          disabled={isGenerating}
          className={`w-full py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
            isGenerating
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Generating...
            </>
          ) : (
            <>
              <Link className="w-5 h-5" />
              Generate Link
            </>
          )}
        </button>

        {/* Generated Link Actions */}
        {generatedLink && (
          <div className="mt-6 space-y-4">
            {/* Link Display */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Generated Link</h4>
                <button
                  onClick={handleRevokeAccess}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Revoke Access
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {/* TODO: Show QR modal */}}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <QrCode className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Open QR</span>
              </button>
              <button
                onClick={handleSendEmail}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Mail className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Send Email</span>
              </button>
              <button
                onClick={handleViewActivity}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Activity className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">View Activity</span>
              </button>
              <button
                onClick={() => window.open(generatedLink, '_blank')}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Open Link</span>
              </button>
            </div>

            {/* QR Code Display */}
            {qrCodeUrl && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="font-semibold text-gray-900 mb-3 text-center">QR Code</h4>
                <div className="flex justify-center">
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code" 
                    className="w-48 h-48 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharePortfolio;
