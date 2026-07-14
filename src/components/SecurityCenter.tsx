import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  AlertTriangle,
  Eye,
  Link2,
  Trash2,
  Copy,
  Download,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Search,
  ArrowLeft,
  RefreshCw,
  FileText,
  Upload,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { generateDmcaNotice } from '@/lib/dmca/dmcaGenerator';
import { runForensicScan } from '@/lib/dna/forensicIntelligence';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

const RECOVERY_SOURCE_LABELS: Record<string, string> = {
  'exact-hash':     'SHA-256 Exact Hash Match',
  'persistent-dna': 'Pixel DNA Watermark (Every Tile)',
  'perceptual-hash':'Visual Perceptual Fingerprint (pHash)',
  'watermark':      'Legacy LSB Watermark',
  'none':           'No Match Found',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SecurityCenterProps {
  userId: string | null;
  onBack: () => void;
}

interface ShareConfig {
  share_id: string;
  user_id: string;
  share_link: string;
  image_name: string;
  download_limit: number | null;
  downloads_used: number;
  access_count: number;
  is_active: boolean;
  expiry_date: string | null;
  created_at: string;
  password: string | null;
  include_cert: boolean;
}

type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface SecurityAlert {
  id: string;
  shareId: string;
  imageName: string;
  shareLink: string;
  severity: AlertSeverity;
  title: string;
  description: string;
}

type ThreatLevel = 'GREEN' | 'AMBER' | 'RED';
type Tab = 'overview' | 'alerts' | 'shares' | 'takedown';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

function buildAlerts(shares: ShareConfig[]): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];

  for (const s of shares) {
    // CRITICAL: download limit exceeded
    if (s.download_limit !== null && s.downloads_used >= s.download_limit) {
      alerts.push({
        id: `${s.share_id}-limit`,
        shareId: s.share_id,
        imageName: s.image_name,
        shareLink: s.share_link,
        severity: 'CRITICAL',
        title: 'Download limit exceeded',
        description: `${s.downloads_used}/${s.download_limit} downloads used on this share.`,
      });
    }
    // HIGH: expired share still active
    if (s.is_active && s.expiry_date && isExpired(s.expiry_date)) {
      alerts.push({
        id: `${s.share_id}-expired`,
        shareId: s.share_id,
        imageName: s.image_name,
        shareLink: s.share_link,
        severity: 'HIGH',
        title: 'Expired share still active',
        description: `Share expired on ${new Date(s.expiry_date).toLocaleDateString()} but is still active.`,
      });
    }
    // HIGH: high access volume
    if (s.access_count > 50) {
      alerts.push({
        id: `${s.share_id}-highaccess`,
        shareId: s.share_id,
        imageName: s.image_name,
        shareLink: s.share_link,
        severity: 'HIGH',
        title: 'High access volume detected',
        description: `${s.access_count} access events recorded — potential unauthorized distribution.`,
      });
    }
    // MEDIUM: unlimited share with high traffic
    if (s.download_limit === null && s.access_count > 20) {
      alerts.push({
        id: `${s.share_id}-unlimitedtraffic`,
        shareId: s.share_id,
        imageName: s.image_name,
        shareLink: s.share_link,
        severity: 'MEDIUM',
        title: 'Unlimited share with high traffic',
        description: `${s.access_count} accesses on an unlimited share — consider setting a download cap.`,
      });
    }
  }

  // Sort: CRITICAL → HIGH → MEDIUM → LOW
  const order: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

function computeThreatLevel(shares: ShareConfig[], alerts: SecurityAlert[]): ThreatLevel {
  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL');
  const hasHighExpiredActive = shares.some((s) => s.is_active && s.expiry_date && isExpired(s.expiry_date));
  if (hasCritical || hasHighExpiredActive) return 'RED';
  const hasHigh = alerts.some((a) => a.severity === 'HIGH');
  if (hasHigh) return 'AMBER';
  return 'GREEN';
}

// ── Sub-components ────────────────────────────────────────────────────────────

const SeverityBadge: React.FC<{ severity: AlertSeverity }> = ({ severity }) => {
  const styles: Record<AlertSeverity, string> = {
    CRITICAL: 'bg-red-600 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-slate-900',
    LOW: 'bg-slate-500 text-white',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles[severity]}`}>
      {severity}
    </span>
  );
};

const ThreatIndicator: React.FC<{ level: ThreatLevel }> = ({ level }) => {
  const config: Record<ThreatLevel, { color: string; label: string; bg: string }> = {
    GREEN: { color: 'text-green-400', label: 'All Clear', bg: 'bg-green-400/20 border-green-400/40' },
    AMBER: { color: 'text-amber-400', label: 'Elevated Risk', bg: 'bg-amber-400/20 border-amber-400/40' },
    RED: { color: 'text-red-400', label: 'Critical Threat', bg: 'bg-red-400/20 border-red-400/40' },
  };
  const c = config[level];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${c.bg}`}>
      <div className={`w-3 h-3 rounded-full animate-pulse ${level === 'GREEN' ? 'bg-green-400' : level === 'AMBER' ? 'bg-amber-400' : 'bg-red-400'}`} />
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wider">Threat Level</p>
        <p className={`font-bold text-lg ${c.color}`}>{level} — {c.label}</p>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const SecurityCenter: React.FC<SecurityCenterProps> = ({ userId, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [shares, setShares] = useState<ShareConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [dmcaUrl, setDmcaUrl] = useState('');
  const [generatingDmca, setGeneratingDmca] = useState<string | null>(null);

  // Scan flow — used for Scenario 2, 3 and 4
  const [reportMode, setReportMode] = useState<'platform-upload' | 'private-group'>('platform-upload');
  const [reportedBy, setReportedBy] = useState('');
  const [scenario2File, setScenario2File] = useState<File | null>(null);
  const [scenario2Scanning, setScenario2Scanning] = useState(false);
  const [scenario2Result, setScenario2Result] = useState<{
    verdict: string;
    confidence: number;
    source: string;
    dnaId?: string;
    sha256?: string;
    visualSimilarity?: number | null;
    isScenario3?: boolean;
    ownerName?: string;
    registeredAt?: string;
  } | null>(null);
  const [scenario2Error, setScenario2Error] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchShares = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await (supabase as any)
        .from('share_configs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (fetchErr) throw new Error(fetchErr.message);
      setShares((data as ShareConfig[]) ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load share data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const alerts = buildAlerts(shares);
  const threatLevel = computeThreatLevel(shares, alerts);
  const activeShares = shares.filter((s) => s.is_active);
  const totalAccessCount = shares.reduce((sum, s) => sum + s.access_count, 0);
  const nearLimitShares = shares.filter(
    (s) => s.download_limit !== null && s.downloads_used >= s.download_limit * 0.8
  );
  const expiredActiveShares = shares.filter(
    (s) => s.is_active && s.expiry_date && isExpired(s.expiry_date)
  );

  // ── Actions ─────────────────────────────────────────────────────────────────

  const revokeShare = async (shareId: string) => {
    if (!userId) return;
    setRevoking((prev) => ({ ...prev, [shareId]: true }));
    try {
      await (supabase as any)
        .from('share_configs')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('share_id', shareId);
      setShares((prev) =>
        prev.map((s) => (s.share_id === shareId ? { ...s, is_active: false } : s))
      );
    } catch {
      // silently fail — UI will show the share unchanged
    } finally {
      setRevoking((prev) => ({ ...prev, [shareId]: false }));
    }
  };

  const copyLink = async (link: string, shareId: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied((prev) => ({ ...prev, [shareId]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [shareId]: false })), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleGenerateDmca = async (share: ShareConfig, infringingUrl?: string) => {
    setGeneratingDmca(share.share_id);
    try {
      const dataUri = await generateDmcaNotice({
        ownerName: 'Rights Holder',
        contentTitle: share.image_name,
        dnaId: share.share_id,
        shareId: share.share_id,
        createdAt: new Date(share.created_at).toLocaleDateString(),
        shareLink: share.share_link,
        infringingUrl: infringingUrl,
      });

      if (Capacitor.isNativePlatform()) {
        const base64 = dataUri.split(',')[1];
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const fileName = `DMCA_${share.image_name.replace(/\s/g, '_')}_${Date.now()}.pdf`;
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        await Share.share({ title: 'DMCA Notice', url: uri, dialogTitle: 'Share DMCA Notice' });
      } else {
        const a = document.createElement('a');
        a.href = dataUri;
        a.download = `DMCA_${share.image_name.replace(/\s/g, '_')}_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // ignore generation errors
    } finally {
      setGeneratingDmca(null);
    }
  };

  const handleScenario2Scan = async () => {
    if (!scenario2File) return;
    setScenario2Scanning(true);
    setScenario2Result(null);
    setScenario2Error(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(scenario2File);
      });

      const report = await runForensicScan(
        dataUrl,
        scenario2File.name,
        scenario2File.type,
        scenario2File.size,
      );

      const sourceConfidence: Record<string, number> = {
        'exact-hash': 100,
        'persistent-dna': 97,
        'watermark': 85,
        'perceptual-hash': report.visualSimilarity ?? 70,
        'none': 0,
      };
      const confidence = sourceConfidence[report.ownerRecoverySource ?? 'none'] ?? 0;

      // Scenario 3 pattern: watermark fired (persistent-dna) but pHash didn't match
      // (visualSimilarity null or low means the image was re-encoded/filtered)
      const isScenario3 =
        report.ownerRecoverySource === 'persistent-dna' &&
        (report.visualSimilarity === null || (report.visualSimilarity !== null && report.visualSimilarity < 55));

      setScenario2Result({
        verdict: report.verdict,
        confidence,
        source: report.ownerRecoverySource ?? 'none',
        dnaId: report.dnaId,
        sha256: report.sha256 ?? undefined,
        visualSimilarity: report.visualSimilarity,
        isScenario3,
        ownerName: report.originalOwner?.ownerName ?? report.originalOwner?.pinitOwnerId ?? undefined,
        registeredAt: report.originalOwner?.encryptionTimestamp ?? undefined,
      });
    } catch (err: unknown) {
      setScenario2Error(err instanceof Error ? err.message : 'Scan failed — try a different image');
    } finally {
      setScenario2Scanning(false);
    }
  };

  const handleScenario2Evidence = async () => {
    if (!scenario2Result) return;
    setGeneratingDmca('scenario2');
    try {
      const distributionMode =
        reportMode === 'private-group'
          ? 'private-group'
          : scenario2Result.isScenario3
          ? 'screen-recorded'
          : 'native-upload';
      const shareLink =
        distributionMode === 'screen-recorded'
          ? 'N/A — Screen-Recorded Distribution'
          : distributionMode === 'private-group'
          ? 'N/A — Private Group (Telegram/Discord)'
          : 'N/A — Native Platform Upload';
      const dataUri = await generateDmcaNotice({
        ownerName: scenario2Result.ownerName ?? 'Rights Holder',
        contentTitle: scenario2File?.name ?? 'Unknown Asset',
        dnaId: scenario2Result.dnaId ?? 'N/A',
        sha256: scenario2Result.sha256,
        createdAt: scenario2Result.registeredAt
          ? new Date(scenario2Result.registeredAt).toLocaleDateString()
          : new Date().toLocaleDateString(),
        shareLink,
        distributionMode,
        matchConfidence: scenario2Result.confidence,
        reportedBy: reportMode === 'private-group' && reportedBy ? reportedBy : undefined,
      });

      if (Capacitor.isNativePlatform()) {
        const base64 = dataUri.split(',')[1];
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const fileName = `DNA_Evidence_Package_${Date.now()}.pdf`;
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        await Share.share({ title: 'DNA Evidence Package', url: uri, dialogTitle: 'Share Evidence Package' });
      } else {
        const a = document.createElement('a');
        a.href = dataUri;
        a.download = `DNA_Evidence_Package_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // ignore generation errors
    } finally {
      setGeneratingDmca(null);
    }
  };

  const openSearch = (engine: string, link: string) => {
    const encodedLink = encodeURIComponent(link);
    const urls: Record<string, string> = {
      google: `https://lens.google.com/uploadbyurl?url=${encodedLink}`,
      tineye: `https://tineye.com/search?url=${encodedLink}`,
      bing: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodedLink}`,
      yandex: `https://yandex.com/images/search?url=${encodedLink}&rpt=imageview`,
    };
    const url = urls[engine];
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Tab content ─────────────────────────────────────────────────────────────

  const tabVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
  };

  const renderOverview = () => (
    <motion.div key="overview" variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="space-y-4">
      <ThreatIndicator level={threatLevel} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Shield className="w-5 h-5 text-purple-400" />} label="Active Shares" value={activeShares.length} />
        <StatCard icon={<Eye className="w-5 h-5 text-blue-400" />} label="Total Access" value={totalAccessCount} />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
          label="Near/Over Limit"
          value={nearLimitShares.length}
          highlight={nearLimitShares.length > 0}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-red-400" />}
          label="Expired Active"
          value={expiredActiveShares.length}
          highlight={expiredActiveShares.length > 0}
        />
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <p className="text-slate-400 text-sm mb-2">Security Summary</p>
        <ul className="space-y-2 text-sm">
          <SummaryRow ok={alerts.filter((a) => a.severity === 'CRITICAL').length === 0} label={`${alerts.filter((a) => a.severity === 'CRITICAL').length} critical alerts`} />
          <SummaryRow ok={expiredActiveShares.length === 0} label={`${expiredActiveShares.length} expired shares still active`} />
          <SummaryRow ok={nearLimitShares.length === 0} label={`${nearLimitShares.length} shares near download limit`} />
          <SummaryRow ok={alerts.length === 0} label={`${alerts.length} total alerts detected`} />
        </ul>
      </div>

      {alerts.length > 0 && (
        <button
          onClick={() => setActiveTab('alerts')}
          className="w-full bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3 text-red-400 text-sm font-medium flex items-center justify-between hover:bg-red-900/50 transition-colors"
        >
          <span>{alerts.length} alert{alerts.length !== 1 ? 's' : ''} require attention</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );

  const renderAlerts = () => (
    <motion.div key="alerts" variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="space-y-4">
      {alerts.length === 0 ? (
        <EmptyState icon={<CheckCircle className="w-10 h-10 text-green-400" />} message="No alerts detected" sub="All shares are within normal parameters." />
      ) : (
        alerts.map((alert) => (
          <motion.div
            key={alert.id}
            layout
            className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={alert.severity} />
                </div>
                <p className="text-white font-semibold text-sm">{alert.title}</p>
                <p className="text-slate-400 text-xs mt-0.5">{alert.description}</p>
                <p className="text-purple-400 text-xs mt-1 truncate">{alert.imageName}</p>
              </div>
            </div>

            {/* Piracy scan */}
            <div className="bg-slate-900/60 rounded-lg p-3">
              <p className="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1">
                <Search className="w-3 h-3" /> Scan for Piracy
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'google', label: 'Google Image' },
                  { key: 'tineye', label: 'TinEye' },
                  { key: 'bing', label: 'Bing Visual' },
                  { key: 'yandex', label: 'Yandex Images' },
                ].map((engine) => (
                  <button
                    key={engine.key}
                    onClick={() => openSearch(engine.key, alert.shareLink)}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 transition-colors"
                  >
                    <Globe className="w-3 h-3 text-purple-400 shrink-0" />
                    {engine.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              variant="destructive"
              disabled={revoking[alert.shareId]}
              onClick={() => revokeShare(alert.shareId)}
              className="w-full bg-red-900/60 border border-red-500/60 text-red-300 hover:bg-red-900 text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              {revoking[alert.shareId] ? 'Revoking…' : 'Revoke Share'}
            </Button>
          </motion.div>
        ))
      )}
    </motion.div>
  );

  const renderShares = () => (
    <motion.div key="shares" variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="space-y-3">
      {shares.length === 0 ? (
        <EmptyState icon={<Link2 className="w-10 h-10 text-slate-500" />} message="No shares found" sub="Create a share link to start tracking." />
      ) : (
        shares.map((share) => {
          const expired = isExpired(share.expiry_date ?? null);
          const status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' = !share.is_active ? 'REVOKED' : expired ? 'EXPIRED' : 'ACTIVE';
          const progressMax = share.download_limit ?? 100;
          const progressPct = Math.min((share.downloads_used / progressMax) * 100, 100);
          const daysLeft = share.expiry_date ? daysUntil(share.expiry_date) : null;

          return (
            <motion.div
              key={share.share_id}
              layout
              className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{share.image_name}</p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{share.share_link}</p>
                </div>
                <StatusBadge status={status} />
              </div>

              {/* Access progress */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{share.access_count} accesses</span>
                  <span>
                    {share.downloads_used}/{share.download_limit ?? '∞'} downloads
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${progressPct >= 100 ? 'bg-red-500' : progressPct >= 80 ? 'bg-amber-500' : 'bg-purple-500'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Created {new Date(share.created_at).toLocaleDateString()}</span>
                {share.expiry_date && (
                  <span
                    className={
                      expired ? 'text-red-400' : daysLeft !== null && daysLeft < 7 ? 'text-amber-400' : 'text-slate-400'
                    }
                  >
                    {expired
                      ? 'Expired'
                      : daysLeft !== null
                      ? `Expires in ${daysLeft}d`
                      : ''}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyLink(share.share_link, share.share_id)}
                  className="text-xs border border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {copied[share.share_id] ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span className="ml-1">{copied[share.share_id] ? 'Copied' : 'Copy'}</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={generatingDmca === share.share_id}
                  onClick={() => handleGenerateDmca(share)}
                  className="text-xs border border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Download className="w-3 h-3" />
                  <span className="ml-1">DMCA</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!share.is_active || revoking[share.share_id]}
                  onClick={() => revokeShare(share.share_id)}
                  className="text-xs border border-red-800/60 text-red-400 hover:bg-red-900/30 disabled:opacity-40"
                >
                  <XCircle className="w-3 h-3" />
                  <span className="ml-1">{revoking[share.share_id] ? '…' : 'Revoke'}</span>
                </Button>
              </div>
            </motion.div>
          );
        })
      )}
    </motion.div>
  );

  const renderTakedown = () => {
    const platforms = [
      {
        emoji: '▶️',
        name: 'YouTube',
        desc: 'File a copyright complaint for video content',
        url: 'https://www.youtube.com/copyright_complaint_form',
      },
      {
        emoji: '📘',
        name: 'Facebook / Instagram',
        desc: 'Report infringing content on Meta platforms',
        url: 'https://www.facebook.com/help/contact/1758255661104383',
      },
      {
        emoji: '🐦',
        name: 'Twitter / X',
        desc: 'Submit a DMCA request to X Corp',
        url: 'https://help.twitter.com/forms/dmca',
      },
      {
        emoji: '🎵',
        name: 'TikTok',
        desc: "Report copyright issues on TikTok's platform",
        url: 'https://www.tiktok.com/legal/copyright-policy',
      },
      {
        emoji: '✈️',
        name: 'Telegram',
        desc: 'DMCA / abuse report — abuse@telegram.org (Scenario 4: private channels)',
        url: 'https://telegram.org/dmca',
      },
      {
        emoji: '🎮',
        name: 'Discord',
        desc: 'Report copyright infringement — dis.gd/report (Scenario 4: private servers)',
        url: 'https://discord.com/safety/copyright',
      },
      {
        emoji: '🔍',
        name: 'Google',
        desc: 'Remove infringing content from Google search',
        url: 'https://support.google.com/legal/troubleshooter/1114905',
      },
    ];

    return (
      <motion.div key="takedown" variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="space-y-4">

        {/* Scan Stolen File — Scenarios 2, 3 & 4 */}
        <div className="bg-slate-800 border border-blue-700/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            <p className="text-white font-semibold text-sm">Scan Stolen File</p>
            <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full font-bold">
              {reportMode === 'private-group' ? 'SCENARIO 4' : 'SCENARIO 2 / 3'}
            </span>
          </div>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => { setReportMode('platform-upload'); setScenario2Result(null); setScenario2Error(null); }}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                reportMode === 'platform-upload'
                  ? 'bg-blue-700 border-blue-600 text-white font-semibold'
                  : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Public Platform
            </button>
            <button
              onClick={() => { setReportMode('private-group'); setScenario2Result(null); setScenario2Error(null); }}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                reportMode === 'private-group'
                  ? 'bg-purple-700 border-purple-600 text-white font-semibold'
                  : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Private Group (Telegram/Discord)
            </button>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed">
            {reportMode === 'private-group'
              ? 'Content leaked into a closed Telegram channel or Discord server (no public crawl surface). Upload a screenshot from the private group to verify ownership via watermark.'
              : 'Found content on a public piracy site or social media? Upload it here — our DNA cascade detects ownership even through re-encoding and filters.'
            }
          </p>

          {reportMode === 'private-group' && (
            <input
              type="text"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
              placeholder="Reported by (subscriber name or alias) — optional"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) {
                setScenario2File(f);
                setScenario2Result(null);
                setScenario2Error(null);
              }
              e.target.value = '';
            }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-slate-700/60 border border-slate-600 border-dashed rounded-lg px-3 py-3 text-slate-300 text-sm flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors"
          >
            <Upload className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">{scenario2File ? scenario2File.name : 'Choose suspected stolen image…'}</span>
          </button>

          {scenario2File && !scenario2Result && (
            <Button
              size="sm"
              disabled={scenario2Scanning}
              onClick={handleScenario2Scan}
              className="w-full bg-blue-700 hover:bg-blue-600 text-white text-xs"
            >
              {scenario2Scanning ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Scanning 10-layer DNA…</>
              ) : (
                <><Search className="w-3 h-3 mr-1.5" />Run Ownership Scan</>
              )}
            </Button>
          )}

          {scenario2Error && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <XCircle className="w-3 h-3 shrink-0" />{scenario2Error}
            </p>
          )}

          {scenario2Result && (
            <div className={`rounded-lg p-3 border space-y-2 ${
              scenario2Result.confidence >= 80
                ? 'bg-green-900/20 border-green-600/40'
                : scenario2Result.confidence >= 50
                ? 'bg-amber-900/20 border-amber-600/40'
                : 'bg-slate-900/60 border-slate-600/40'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {scenario2Result.confidence >= 80 ? (
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className={`font-bold text-sm ${
                    scenario2Result.confidence >= 95 ? 'text-green-400' :
                    scenario2Result.confidence >= 80 ? 'text-green-300' :
                    scenario2Result.confidence >= 50 ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    {scenario2Result.confidence >= 95 ? 'EXACT MATCH' :
                     scenario2Result.confidence >= 80 ? 'HIGH CONFIDENCE' :
                     scenario2Result.confidence >= 50 ? 'PARTIAL MATCH' : 'NO MATCH'}
                  </span>
                </div>
                <span className="text-2xl font-black text-white leading-none">{scenario2Result.confidence}%</span>
              </div>

              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    scenario2Result.confidence >= 80 ? 'bg-green-500' :
                    scenario2Result.confidence >= 50 ? 'bg-amber-500' : 'bg-slate-500'
                  }`}
                  style={{ width: `${scenario2Result.confidence}%` }}
                />
              </div>

              <div className="space-y-1 text-xs text-slate-400 pt-0.5">
                <p>Detection layer: {RECOVERY_SOURCE_LABELS[scenario2Result.source] ?? scenario2Result.source}</p>
                {reportMode === 'private-group' ? (
                  <div className="bg-purple-900/30 border border-purple-600/40 rounded px-2 py-1.5 space-y-0.5">
                    <p className="text-purple-300 font-bold flex items-center gap-1">
                      <Shield className="w-3 h-3 shrink-0" />
                      PRIVATE GROUP LEAK — Scenario 4
                    </p>
                    <p className="text-purple-400/80">Verified via in-app watermark scan. No public crawl surface — detection was crowd-sourced.</p>
                    {reportedBy && <p className="text-slate-400">Reported by: {reportedBy}</p>}
                    <p className="text-amber-400">Takedown target: Telegram/Discord (slower process — use abuse@ contacts).</p>
                  </div>
                ) : scenario2Result.isScenario3 ? (
                  <div className="bg-orange-900/30 border border-orange-600/40 rounded px-2 py-1.5 space-y-0.5">
                    <p className="text-orange-300 font-bold flex items-center gap-1">
                      <Shield className="w-3 h-3 shrink-0" />
                      SCREEN-RECORD DETECTION — Scenario 3
                    </p>
                    <p className="text-orange-400/80">Watermark survived re-encoding. pHash did NOT match (expected — filters/compression destroyed hash). Probabilistic match.</p>
                    <p className="text-amber-400">Attribution: None — content was screen-recorded from platform player.</p>
                  </div>
                ) : (
                  <p className="text-amber-400 font-medium">Attribution: None — native upload path (Scenario 2)</p>
                )}
                {scenario2Result.visualSimilarity !== null && scenario2Result.visualSimilarity !== undefined && (
                  <p className="text-slate-500">Visual similarity to original: {scenario2Result.visualSimilarity}%</p>
                )}
              </div>

              {scenario2Result.confidence >= 50 && (
                <Button
                  size="sm"
                  disabled={generatingDmca === 'scenario2'}
                  onClick={handleScenario2Evidence}
                  className="w-full bg-purple-700 hover:bg-purple-600 text-white text-xs mt-1"
                >
                  <FileText className="w-3 h-3 mr-1.5" />
                  {generatingDmca === 'scenario2' ? 'Generating…' : 'Generate Evidence Package PDF'}
                </Button>
              )}
            </div>
          )}

          {scenario2Result && (
            <button
              onClick={() => { setScenario2File(null); setScenario2Result(null); setScenario2Error(null); setReportedBy(''); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Scan another file
            </button>
          )}
        </div>

        {/* Auto DMCA generator */}
        <div className="bg-slate-800 border border-purple-700/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <p className="text-white font-semibold text-sm">Generate DMCA Notice</p>
          </div>
          <input
            type="url"
            value={dmcaUrl}
            onChange={(e) => setDmcaUrl(e.target.value)}
            placeholder="Paste infringing URL here…"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
          {shares.length > 0 && (
            <Button
              size="sm"
              disabled={generatingDmca === 'bulk'}
              onClick={async () => {
                setGeneratingDmca('bulk');
                await handleGenerateDmca(shares[0], dmcaUrl || undefined);
                setGeneratingDmca(null);
              }}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white text-xs"
            >
              <Download className="w-3 h-3 mr-1" />
              {generatingDmca === 'bulk' ? 'Generating PDF…' : 'Download DMCA Notice PDF'}
            </Button>
          )}
        </div>

        {/* Scenario 4 — Private group notice */}
        <div className="bg-purple-900/20 border border-purple-700/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400 shrink-0" />
            <p className="text-purple-300 font-semibold text-sm">Scenario 4 — Private Group Leak</p>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Telegram channels and Discord servers have no public crawl surface. Automated detection cannot reach them. Use the <span className="text-purple-300 font-medium">Scan Stolen File → Private Group</span> mode above to verify ownership via watermark after a crowd-sourced report, then use the Telegram / Discord links below to file the takedown.
          </p>
          <p className="text-amber-400/80 text-xs">Timeline: 3–14 days (non-DMCA-compliant platforms have slower, less standardized processes than public hosts).</p>
        </div>

        {/* Platform cards */}
        <div className="space-y-3">
          {platforms.map((p) => (
            <motion.div
              key={p.name}
              whileHover={{ scale: 1.01 }}
              className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4"
            >
              <span className="text-2xl shrink-0">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{p.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">{p.desc}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(p.url, '_blank', 'noopener,noreferrer')}
                className="shrink-0 border border-slate-600 text-slate-300 hover:bg-slate-700 text-xs"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Open
              </Button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <Shield className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle className="w-4 h-4" />, badge: alerts.length },
    { id: 'shares', label: 'Shares', icon: <Link2 className="w-4 h-4" /> },
    { id: 'takedown', label: 'Takedown', icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 px-4 pt-safe-top pb-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors p-1 -ml-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Security Center
            </h1>
            <p className="text-xs text-slate-400">PINIT DNA — Rights Protection</p>
          </div>
          <button
            onClick={fetchShares}
            disabled={loading}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-700 -mx-4 px-4 overflow-x-auto gap-1 no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-slate-400 text-sm">Loading security data…</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-6 text-center">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-300 font-semibold">Failed to load data</p>
            <p className="text-red-400/70 text-sm mt-1">{error}</p>
            <Button size="sm" onClick={fetchShares} className="mt-4 bg-red-700 hover:bg-red-600 text-white text-xs">
              Retry
            </Button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'alerts' && renderAlerts()}
            {activeTab === 'shares' && renderShares()}
            {activeTab === 'takedown' && renderTakedown()}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ── Tiny helper components ────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, highlight }) => (
  <div
    className={`bg-slate-800 border rounded-xl p-4 flex flex-col gap-2 ${
      highlight && value > 0 ? 'border-amber-500/50' : 'border-slate-700'
    }`}
  >
    {icon}
    <p className={`text-2xl font-bold ${highlight && value > 0 ? 'text-amber-400' : 'text-white'}`}>
      {value}
    </p>
    <p className="text-slate-400 text-xs">{label}</p>
  </div>
);

interface SummaryRowProps {
  ok: boolean;
  label: string;
}

const SummaryRow: React.FC<SummaryRowProps> = ({ ok, label }) => (
  <li className="flex items-center gap-2">
    {ok ? (
      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
    ) : (
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    )}
    <span className={ok ? 'text-slate-300' : 'text-amber-300'}>{label}</span>
  </li>
);

interface StatusBadgeProps {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-green-400/20 text-green-400 border-green-400/30',
    REVOKED: 'bg-slate-600/40 text-slate-400 border-slate-500/30',
    EXPIRED: 'bg-red-400/20 text-red-400 border-red-400/30',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {status}
    </span>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  message: string;
  sub: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, message, sub }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    {icon}
    <p className="text-white font-semibold">{message}</p>
    <p className="text-slate-500 text-sm">{sub}</p>
  </div>
);

export default SecurityCenter;
