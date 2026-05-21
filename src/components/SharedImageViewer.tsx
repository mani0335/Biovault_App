import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Lock, AlertCircle, Loader, Shield, Image, Calendar,
  Eye, FileText, Printer, Smartphone, Globe, Clock, Send,
  CheckCircle, RefreshCw, MapPin, Monitor, XCircle, Bell,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ShareConfig {
  share_id: string;
  user_id: string;
  share_link: string;
  vault_image_id: string | null;
  image_name: string | null;
  download_limit: number | null;
  downloads_used: number;
  password: string | null;
  include_cert: boolean;
  is_active: boolean;
  access_count: number;
  created_by: string;
  expiry_date: string | null;
  created_at: string;
  // Access control columns (added via SQL migration)
  print_blocked: boolean | null;
  device_restriction: string | null;  // 'mobile' | 'desktop' | null
  geo_restriction: string | null;     // JSON array string e.g. '["IN","US"]'
}

type ErrorType = 'general' | 'expired' | 'download_limit' | 'device_blocked' | 'geo_blocked';

export const SharedImageViewer: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [shareData, setShareData] = useState<ShareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>('general');
  const [passwordInput, setPasswordInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Print block modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Download request
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Background
  useEffect(() => {
    document.body.style.background = 'linear-gradient(to bottom, #0f172a, #1e293b)';
    return () => { document.body.style.background = ''; };
  }, []);

  // Print blocking — intercept Ctrl+P and beforeprint event
  useEffect(() => {
    if (!shareData?.print_blocked) return;

    const handleBeforePrint = (e: Event) => {
      e.preventDefault();
      setShowPrintModal(true);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowPrintModal(true);
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shareData?.print_blocked]);

  // Fetch share data
  useEffect(() => {
    if (!token) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    const fetchShareData = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('share_configs')
          .select('share_id,user_id,share_link,vault_image_id,image_name,download_limit,downloads_used,include_cert,is_active,access_count,created_by,expiry_date,created_at,password,print_blocked,device_restriction,geo_restriction')
          .eq('share_id', token)
          .maybeSingle();

        if (dbError) {
          console.error('❌ Supabase error:', dbError);
          setError('Could not load the share link. It may have been deleted.');
          setLoading(false);
          return;
        }

        if (!data) {
          setError('Share link not found. The link may have expired or been deleted.');
          setLoading(false);
          return;
        }

        const row = data as ShareConfig;

        if (!row.is_active) {
          setError('This share link has been disabled by the owner.');
          setLoading(false);
          return;
        }

        // ── 1. Expiry check ──────────────────────────────────────────────
        if (row.expiry_date && new Date(row.expiry_date) < new Date()) {
          setErrorType('expired');
          setError('This share link has expired.');
          setShareData(row);
          setLoading(false);
          return;
        }

        // ── 2. Device restriction check ──────────────────────────────────
        if (row.device_restriction) {
          const ua = navigator.userAgent;
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
          if (row.device_restriction === 'desktop' && isMobile) {
            setErrorType('device_blocked');
            setError('This document is only accessible from a desktop or laptop device.');
            setShareData(row);
            setLoading(false);
            return;
          }
          if (row.device_restriction === 'mobile' && !isMobile) {
            setErrorType('device_blocked');
            setError('This document is only accessible from a mobile device.');
            setShareData(row);
            setLoading(false);
            return;
          }
        }

        // ── 3. Geo restriction check ─────────────────────────────────────
        if (row.geo_restriction) {
          try {
            const allowedCountries = (JSON.parse(row.geo_restriction) as string[])
              .map(c => c.trim().toUpperCase())
              .filter(Boolean);
            if (allowedCountries.length > 0) {
              const res = await fetch('https://ipapi.co/country_code/');
              const cc = (await res.text()).trim().toUpperCase();
              if (!allowedCountries.includes(cc)) {
                setErrorType('geo_blocked');
                setError(`This document is not available in your region (${cc}).`);
                setShareData(row);
                setLoading(false);
                return;
              }
            }
          } catch {
            // If geo check fails, allow access (don't block on API error)
          }
        }

        // ── 4. Download limit check ──────────────────────────────────────
        if (row.download_limit !== null && row.downloads_used >= row.download_limit) {
          setErrorType('download_limit');
          setError(`Download limit of ${row.download_limit} has been reached.`);
          setShareData(row);
          setLoading(false);
          return;
        }

        // Increment view count (fire-and-forget)
        supabase
          .from('share_configs')
          .update({ access_count: (row.access_count || 0) + 1 })
          .eq('share_id', token)
          .then(() => {});

        setShareData(row);
      } catch (err) {
        console.error('❌ SharedImageViewer crash:', err);
        setError('Something went wrong while loading this share.');
      } finally {
        setLoading(false);
      }
    };

    fetchShareData();
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareData || !token) return;
    const { data } = await supabase
      .from('share_configs')
      .select('share_id')
      .eq('share_id', token)
      .eq('password', passwordInput)
      .maybeSingle();
    if (data) {
      setUnlocked(true);
    } else {
      alert('❌ Incorrect password. Please try again.');
    }
  };

  const handleDownload = async () => {
    if (!shareData?.vault_image_id || downloading) return;

    // Re-check limit with fresh DB value before every download
    if (shareData.download_limit !== null) {
      const { data: fresh } = await supabase
        .from('share_configs')
        .select('downloads_used')
        .eq('share_id', token || '')
        .maybeSingle();
      const usedNow = fresh?.downloads_used ?? shareData.downloads_used;
      if (usedNow >= shareData.download_limit) {
        setErrorType('download_limit');
        setError(`Download limit of ${shareData.download_limit} has been reached.`);
        setShareData(prev => prev ? { ...prev, downloads_used: usedNow } : prev);
        return;
      }
    }

    setDownloading(true);
    try {
      const dataUrl = shareData.vault_image_id;
      const isPdf = dataUrl.startsWith('data:application/pdf');
      const filename = shareData.image_name || (isPdf ? 'document.pdf' : 'pinit-shared-image.jpg');

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.click();

      const newUsed = (shareData.downloads_used || 0) + 1;
      supabase
        .from('share_configs')
        .update({ downloads_used: newUsed })
        .eq('share_id', token || '')
        .then(() => {});

      setShareData(prev => prev ? { ...prev, downloads_used: newUsed } : prev);

      if (shareData.download_limit && newUsed >= shareData.download_limit) {
        setErrorType('download_limit');
        setError(`Download limit of ${shareData.download_limit} has been reached.`);
      }
    } finally {
      setDownloading(false);
    }
  };

  const openPdf = () => {
    if (!shareData?.vault_image_id) return;
    const byteStr = atob(shareData.vault_image_id.split(',')[1]);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // Send download request to owner
  const handleRequestDownload = async () => {
    if (!requestName.trim() || !shareData || !token) return;
    setSubmittingRequest(true);
    try {
      const { error: insertErr } = await supabase.from('download_requests').insert({
        share_id: token,
        requester_name: requestName.trim(),
        requester_message: requestMessage.trim() || null,
        requester_device: navigator.userAgent.substring(0, 200),
        owner_user_id: shareData.user_id,
        status: 'pending',
      });
      if (insertErr) throw insertErr;
      setRequestSent(true);
      setShowRequestForm(false);
    } catch (err) {
      console.error('❌ Request failed:', err);
      alert('❌ Failed to send request. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Check if owner has approved the request (re-fetches share to see if download_limit changed)
  const checkDownloadStatus = async () => {
    if (!token) return;
    setCheckingStatus(true);
    try {
      const { data: fresh } = await supabase
        .from('share_configs')
        .select('download_limit,downloads_used')
        .eq('share_id', token)
        .maybeSingle();
      if (fresh && fresh.download_limit !== null) {
        // Owner approved → update local state so download button appears
        setShareData(prev => prev
          ? { ...prev, download_limit: fresh.download_limit, downloads_used: fresh.downloads_used }
          : prev);
        setRequestSent(false);
      }
    } finally {
      setCheckingStatus(false);
    }
  };

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm font-mono">Loading secure share...</p>
        </div>
      </div>
    );
  }

  // ─── LINK EXPIRED ─────────────────────────────────────────────────────────
  if (errorType === 'expired' && shareData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-red-700/60 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center">
              <Clock className="w-10 h-10 text-red-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-red-300 text-center mb-1">Link Expired</h2>
          <p className="text-red-200/60 text-center text-sm mb-5">This share link has passed its expiry date</p>
          <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 space-y-2 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Shared by</p>
            <p className="text-white font-semibold">{shareData.created_by || 'PINIT User'}</p>
            {shareData.expiry_date && (
              <p className="text-red-400 text-xs">
                ⏰ Expired: {new Date(shareData.expiry_date).toLocaleString()}
              </p>
            )}
            <p className="text-slate-500 text-xs mt-2">
              Contact the owner to request a new share link.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── DOWNLOAD LIMIT REACHED ────────────────────────────────────────────────
  if (errorType === 'download_limit' && shareData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-amber-700/60 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-amber-900/30 border border-amber-700/40 flex items-center justify-center">
              <Download className="w-10 h-10 text-amber-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-amber-300 text-center mb-1">One-Time Access Limit Reached</h2>
          <p className="text-amber-200/60 text-center text-sm mb-5">
            The maximum number of downloads for this document has been reached.
          </p>
          <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 text-center mb-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Shared by</p>
            <p className="text-white font-semibold mt-1">{shareData.created_by || 'PINIT User'}</p>
            <p className="text-slate-500 text-xs mt-2">Request additional access below.</p>
          </div>

          {!requestSent ? (
            <div className="space-y-3">
              <p className="text-slate-300 text-sm font-semibold text-center">Request More Access</p>
              <input type="text" placeholder="Your name *"
                value={requestName} onChange={e => setRequestName(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500" />
              <textarea placeholder="Why do you need access? (optional)"
                value={requestMessage} onChange={e => setRequestMessage(e.target.value)} rows={2}
                className="w-full bg-slate-700 border border-slate-600 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500 resize-none" />
              <button onClick={handleRequestDownload} disabled={!requestName.trim() || submittingRequest}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />
                {submittingRequest ? 'Sending Request...' : 'Request Access'}
              </button>
            </div>
          ) : (
            <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-5 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-green-300 font-bold text-base">Request Sent!</p>
              <p className="text-slate-400 text-sm mt-1">
                The owner has been notified. Check back here once they approve.
              </p>
              <button onClick={checkDownloadStatus} disabled={checkingStatus}
                className="mt-4 flex items-center gap-2 text-cyan-400 text-sm mx-auto hover:text-cyan-300 transition-colors">
                <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                {checkingStatus ? 'Checking...' : 'Check if approved'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── DEVICE BLOCKED ────────────────────────────────────────────────────────
  if (errorType === 'device_blocked' && shareData) {
    const isMobileUser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-orange-700/60 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-orange-900/30 border border-orange-700/40 flex items-center justify-center">
              {isMobileUser ? <Smartphone className="w-10 h-10 text-orange-400" /> : <Monitor className="w-10 h-10 text-orange-400" />}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-orange-300 text-center mb-1">Access Denied</h2>
          <p className="text-orange-200/60 text-center text-sm mb-2">Device Restriction Active</p>
          <p className="text-slate-400 text-center text-sm mb-5">{error}</p>
          <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Shared by</p>
            <p className="text-white font-semibold mt-1">{shareData.created_by || 'PINIT User'}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {shareData.device_restriction === 'desktop'
                ? <Monitor className="w-4 h-4 text-orange-400" />
                : <Smartphone className="w-4 h-4 text-orange-400" />}
              <p className="text-orange-300 text-xs">
                {shareData.device_restriction === 'desktop'
                  ? 'Please open this link on a desktop or laptop'
                  : 'Please open this link on a mobile device'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── GEO BLOCKED ──────────────────────────────────────────────────────────
  if (errorType === 'geo_blocked' && shareData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-purple-700/60 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-purple-900/30 border border-purple-700/40 flex items-center justify-center">
              <Globe className="w-10 h-10 text-purple-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-purple-300 text-center mb-1">Access Denied</h2>
          <p className="text-purple-200/60 text-center text-sm mb-2">Geographic Restriction Active</p>
          <p className="text-slate-400 text-center text-sm mb-5">
            This document is not available in your current region.<br />
            Try again from an allowed region.
          </p>
          <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Shared by</p>
            <p className="text-white font-semibold mt-1">{shareData.created_by || 'PINIT User'}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <MapPin className="w-4 h-4 text-purple-400" />
              <p className="text-purple-300 text-xs">Access Denied – Try again from an allowed region</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── GENERAL ERROR ─────────────────────────────────────────────────────────
  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-red-700/60 p-8 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-red-300">Share Not Available</h2>
              <p className="text-red-200/70 mt-2 text-sm">{error || 'This share link is not available.'}</p>
              <p className="text-slate-500 text-xs mt-4">
                Links can expire, be disabled by the owner, or reach their access limit.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── PASSWORD GATE ─────────────────────────────────────────────────────────
  if (shareData.password !== null && shareData.password !== undefined && shareData.password !== '' && !unlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-2xl border border-cyan-700/60 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-4">
            <Lock className="w-10 h-10 text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-white text-center mb-1">Password Required</h2>
          <p className="text-slate-400 text-center mb-6 text-sm">This share is password protected</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input type="password" placeholder="Enter password"
              value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-500" />
            <button type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 rounded-xl transition-all">
              Unlock
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Content type detection ────────────────────────────────────────────────
  const contentUrl = shareData.vault_image_id || null;
  const isPdfContent = !!contentUrl && contentUrl.startsWith('data:application/pdf');
  const isImageContent = !!contentUrl && contentUrl.startsWith('data:image') && !imgError;
  const hasContent = isPdfContent || isImageContent;

  // download_limit === null → downloads DISABLED (view only) → show Request button
  // download_limit !== null → downloads ENABLED up to limit
  const downloadsEnabled = shareData.download_limit !== null;
  const downloadsRemaining = downloadsEnabled
    ? Math.max(0, shareData.download_limit! - (shareData.downloads_used || 0))
    : null;
  const limitReached = downloadsEnabled && (shareData.downloads_used || 0) >= shareData.download_limit!;

  // ─── MAIN VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">

      {/* ── Print blocked modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPrintModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowPrintModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl border border-red-700/60 p-8 max-w-sm w-full text-center"
              onClick={e => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
                <Printer className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-red-300 mb-1">Print Blocked</h2>
              <p className="text-red-200/60 text-sm mb-2">Ctrl + P — Access Blocked</p>
              <p className="text-slate-400 text-sm mb-6">
                Printing is disabled for this protected document by the owner.
              </p>
              <button onClick={() => setShowPrintModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-all">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-6 pt-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-7 h-7 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white">PINIT Vault</h1>
          </div>
          <p className="text-slate-400 text-sm">Secure document shared with you</p>

          {/* Access control badge row */}
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {!downloadsEnabled && (
              <span className="text-xs bg-blue-900/40 border border-blue-700/40 text-blue-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Eye className="w-3 h-3" /> View Only
              </span>
            )}
            {shareData.print_blocked && (
              <span className="text-xs bg-red-900/40 border border-red-700/40 text-red-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Printer className="w-3 h-3" /> Print Blocked
              </span>
            )}
            {shareData.device_restriction && (
              <span className="text-xs bg-orange-900/40 border border-orange-700/40 text-orange-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                {shareData.device_restriction === 'mobile'
                  ? <Smartphone className="w-3 h-3" />
                  : <Monitor className="w-3 h-3" />}
                {shareData.device_restriction === 'mobile' ? 'Mobile Only' : 'Desktop Only'}
              </span>
            )}
            {shareData.geo_restriction && (
              <span className="text-xs bg-purple-900/40 border border-purple-700/40 text-purple-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Globe className="w-3 h-3" /> Geo Restricted
              </span>
            )}
          </div>
        </div>

        {/* ── PDF PREVIEW ──────────────────────────────────────────────────── */}
        {isPdfContent && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden mb-4">
            <div className="bg-green-900/30 border-b border-green-700/40 px-4 py-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-sm font-medium">✅ Verified PINIT Share</span>
            </div>
            <div className="bg-slate-900 flex flex-col items-center justify-center p-8 min-h-48 gap-4">
              <div className="w-20 h-20 rounded-2xl bg-red-900/40 border border-red-700/40 flex items-center justify-center">
                <FileText className="w-10 h-10 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-base">{shareData.image_name || 'PDF Document'}</p>
                <p className="text-slate-400 text-sm mt-1">PDF Document</p>
              </div>
              <button onClick={openPdf}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2">
                <FileText className="w-4 h-4" /> Open PDF
              </button>
            </div>
            <div className="px-4 py-3 flex items-center justify-between border-t border-slate-700">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <FileText className="w-4 h-4" />
                <span className="truncate max-w-[160px]">{shareData.image_name || 'PDF Document'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Eye className="w-3.5 h-3.5" />
                <span>{shareData.access_count || 1} view{(shareData.access_count || 1) !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── IMAGE PREVIEW ─────────────────────────────────────────────────── */}
        {isImageContent && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden mb-4">
            <div className="bg-green-900/30 border-b border-green-700/40 px-4 py-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-sm font-medium">✅ Verified PINIT Share</span>
            </div>
            <div className="bg-slate-900 flex items-center justify-center p-2 min-h-48">
              <img src={contentUrl!} alt={shareData.image_name || 'Shared Image'}
                className="max-w-full max-h-[70vh] rounded-lg object-contain"
                onError={() => setImgError(true)} />
            </div>
            <div className="px-4 py-3 flex items-center justify-between border-t border-slate-700">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Image className="w-4 h-4" />
                <span className="truncate max-w-[160px]">{shareData.image_name || 'Shared Image'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Eye className="w-3.5 h-3.5" />
                <span>{shareData.access_count || 1} view{(shareData.access_count || 1) !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── NO PREVIEW FALLBACK ───────────────────────────────────────────── */}
        {!hasContent && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-4 text-center">
            <Image className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Preview not available.</p>
            <p className="text-slate-500 text-xs mt-1">The sender may need to re-share this file.</p>
          </motion.div>
        )}

        {/* ── METADATA CARD ─────────────────────────────────────────────────── */}
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-700/40 rounded-xl p-3 border border-slate-600">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Shared By</p>
              <p className="text-slate-200 font-medium text-sm truncate">{shareData.created_by || 'PINIT User'}</p>
            </div>
            <div className="bg-slate-700/40 rounded-xl p-3 border border-slate-600">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Views</p>
              <p className="text-slate-200 font-semibold text-lg">{shareData.access_count || 0}</p>
            </div>
          </div>

          {/* Download status */}
          {downloadsEnabled && (
            <div className={`rounded-xl p-3 mt-3 flex items-center gap-2 ${
              limitReached
                ? 'bg-red-900/20 border border-red-700/40'
                : 'bg-slate-700/40 border border-slate-600'
            }`}>
              <Download className={`w-4 h-4 flex-shrink-0 ${limitReached ? 'text-red-400' : 'text-slate-400'}`} />
              <p className={`text-xs ${limitReached ? 'text-red-300' : 'text-slate-400'}`}>
                {limitReached
                  ? `Download limit reached (${shareData.download_limit}/${shareData.download_limit}).`
                  : `${shareData.downloads_used || 0} of ${shareData.download_limit} downloads used`}
              </p>
            </div>
          )}

          {!downloadsEnabled && (
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-3 mt-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-blue-300 text-xs">View only — downloads are disabled by the owner</p>
            </div>
          )}

          {shareData.expiry_date && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 mt-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs">
                Expires {new Date(shareData.expiry_date).toLocaleString()}
              </p>
            </div>
          )}

          {shareData.include_cert && (
            <div className="bg-purple-900/20 border border-purple-700/40 rounded-xl p-3 mt-3">
              <p className="text-purple-300 text-xs">
                📜 <span className="font-medium">Certificate Included</span> — This share includes an authorship certificate
              </p>
            </div>
          )}
        </motion.div>

        {/* ── DOWNLOAD / VIEW-ONLY / REQUEST SECTION ───────────────────────── */}
        {hasContent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>

            {/* Downloads enabled and limit not reached → show download button */}
            {downloadsEnabled && !limitReached && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleDownload} disabled={downloading}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mb-4">
                <Download className="w-5 h-5" />
                {downloading ? 'Downloading...'
                  : downloadsRemaining !== null
                  ? `Download (${downloadsRemaining} left)`
                  : isPdfContent ? 'Download PDF' : 'Download Image'}
              </motion.button>
            )}

            {/* Downloads disabled (no limit set) → View Only mode + Request Download */}
            {!downloadsEnabled && (
              <div className="mb-4 space-y-3">
                {/* View-only notice */}
                <div className="bg-blue-900/20 border border-blue-700/40 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-blue-400" />
                    <p className="text-blue-300 font-semibold text-sm">View Only — Download Disabled</p>
                  </div>
                  <p className="text-slate-400 text-xs">
                    The owner has not enabled downloads. You can request permission below.
                  </p>
                </div>

                {/* Request form / sent state */}
                {!requestSent ? (
                  <>
                    {!showRequestForm ? (
                      <button onClick={() => setShowRequestForm(true)}
                        className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                        <Send className="w-5 h-5" />
                        Request Download Access
                      </button>
                    ) : (
                      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Bell className="w-4 h-4 text-cyan-400" />
                          <p className="text-white font-semibold text-sm">Request Download Permission</p>
                        </div>
                        <input type="text" placeholder="Your name *"
                          value={requestName} onChange={e => setRequestName(e.target.value)}
                          className="w-full bg-slate-700 border border-slate-600 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-cyan-500" />
                        <textarea placeholder="Why do you need this document? (optional)"
                          value={requestMessage} onChange={e => setRequestMessage(e.target.value)} rows={2}
                          className="w-full bg-slate-700 border border-slate-600 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-cyan-500 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => setShowRequestForm(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm transition-all">
                            Cancel
                          </button>
                          <button onClick={handleRequestDownload}
                            disabled={!requestName.trim() || submittingRequest}
                            className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 transition-all">
                            <Send className="w-4 h-4" />
                            {submittingRequest ? 'Sending...' : 'Send Request'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-green-900/20 border border-green-700/40 rounded-2xl p-5 text-center">
                    <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                    <p className="text-green-300 font-bold text-base">Request Sent!</p>
                    <p className="text-slate-400 text-sm mt-1">
                      The document owner has been notified. Once they approve, you'll be able to download.
                    </p>
                    <button onClick={checkDownloadStatus} disabled={checkingStatus}
                      className="mt-4 flex items-center gap-2 text-cyan-400 text-sm mx-auto hover:text-cyan-300 transition-colors">
                      <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                      {checkingStatus ? 'Checking status...' : 'Check if approved'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        <p className="text-center text-slate-600 text-xs pb-6">
          Secured by PINIT Vault • End-to-end encrypted
        </p>
      </motion.div>
    </div>
  );
};

export default SharedImageViewer;
