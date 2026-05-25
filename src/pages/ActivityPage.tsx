/**
 * Activity Page — Enterprise-level monitoring dashboard
 * Tracks all shared documents, security events, and smart link analytics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Share2, Download, Eye, Shield, AlertTriangle, XCircle,
  Link2Off, RefreshCw, Trash2, Globe, Smartphone, Monitor, Clock,
  FileText, Image, File, Camera, Printer, Copy, Lock, Wifi,
  TrendingUp, BarChart2, MapPin, ChevronDown, ChevronUp, Search,
  Bell, CheckCircle, Ban, Play, Zap, Users, Filter,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import {
  ActivityEvent, ActivityEventType, ShareAnalytics,
  getEventsByCategory, getAllShareAnalytics,
  getActivityStats, revokeShareLink, clearAllActivity,
  formatRelativeTime, getRiskLevel, getEventLabel, logActivityEvent,
  syncFromSupabase,
} from '@/lib/activityService';

// ─── Theme ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1e',
  bgCard: 'rgba(17,24,39,0.95)',
  bgCard2: 'rgba(10,15,30,0.98)',
  border: 'rgba(139,92,246,0.2)',
  borderBright: 'rgba(139,92,246,0.45)',
  purple: '#a855f7',
  cyan: '#06b6d4',
  text: '#f1f5f9',
  muted: '#64748b',
  muted2: '#94a3b8',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  orange: '#f97316',
  blue: '#3b82f6',
};

// ─── Seed demo data ───────────────────────────────────────────────────────────

function seedDemoData(userId: string) {
  const existing = localStorage.getItem('pinit_activity_events_v2');
  const parsed = existing ? JSON.parse(existing) : [];
  // Don't seed if user already has data
  if (parsed.some((e: ActivityEvent) => e.userId === userId)) return;

  const now = Date.now();
  const min = 60000;
  const hr = 3600000;

  const demos: ActivityEvent[] = [
    {
      id: `demo_1_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 'shared',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      timestamp: new Date(now - 2 * hr).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
      deviceType: 'mobile',
      ipAddress: '203.192.18.45',
      geoLocation: 'Pune, India',
      geoCountry: 'India',
      geoCity: 'Pune',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 1,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_2_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 'opened',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'john.doe@zensar.com',
      recipientName: 'John Doe',
      timestamp: new Date(now - 90 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
      deviceType: 'desktop',
      ipAddress: '103.47.12.88',
      geoLocation: 'Mumbai, India',
      geoCountry: 'India',
      geoCity: 'Mumbai',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 1,
      downloadAttempts: 0,
      screenshotAttempts: 0,
      sessionDuration: 245,
    },
    {
      id: `demo_3_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 'viewed',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'john.doe@zensar.com',
      recipientName: 'John Doe',
      timestamp: new Date(now - 85 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
      deviceType: 'desktop',
      ipAddress: '103.47.12.88',
      geoLocation: 'Mumbai, India',
      geoCountry: 'India',
      geoCity: 'Mumbai',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 3,
      downloadAttempts: 0,
      screenshotAttempts: 0,
      sessionDuration: 320,
    },
    {
      id: `demo_4_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 'print_attempted',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'john.doe@zensar.com',
      recipientName: 'John Doe',
      timestamp: new Date(now - 80 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
      deviceType: 'desktop',
      ipAddress: '103.47.12.88',
      geoLocation: 'Mumbai, India',
      geoCountry: 'India',
      geoCity: 'Mumbai',
      riskScore: 10,
      status: 'warning',
      securityEvents: ['print_attempted'],
      viewCount: 0,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_5_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 'screenshot_attempted',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'john.doe@zensar.com',
      recipientName: 'John Doe',
      timestamp: new Date(now - 75 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
      deviceType: 'desktop',
      ipAddress: '103.47.12.88',
      geoLocation: 'Mumbai, India',
      geoCountry: 'India',
      geoCity: 'Mumbai',
      riskScore: 30,
      status: 'warning',
      securityEvents: ['screenshot_attempted'],
      viewCount: 0,
      downloadAttempts: 0,
      screenshotAttempts: 1,
    },
    {
      id: `demo_6_${userId}`,
      userId,
      shareId: `share_demo_def456`,
      type: 'shared',
      fileName: 'Confidential Report Q4 2024.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      timestamp: new Date(now - 5 * hr).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 13; Samsung SM-G998B)',
      deviceType: 'mobile',
      ipAddress: '115.187.45.22',
      geoLocation: 'Bangalore, India',
      geoCountry: 'India',
      geoCity: 'Bangalore',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 1,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_7_${userId}`,
      userId,
      shareId: `share_demo_def456`,
      type: 'access_denied',
      fileName: 'Confidential Report Q4 2024.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'unknown@gmail.com',
      timestamp: new Date(now - 4 * hr).toISOString(),
      deviceInfo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      deviceType: 'mobile',
      ipAddress: '45.123.67.189',
      geoLocation: 'Chicago, USA',
      geoCountry: 'United States',
      geoCity: 'Chicago',
      riskScore: 20,
      status: 'denied',
      securityEvents: ['geo_blocked'],
      viewCount: 0,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_8_${userId}`,
      userId,
      shareId: `share_demo_def456`,
      type: 'downloaded',
      fileName: 'Confidential Report Q4 2024.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientEmail: 'manager@company.com',
      recipientName: 'Sarah Manager',
      timestamp: new Date(now - 3 * hr).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      deviceType: 'desktop',
      ipAddress: '115.187.45.90',
      geoLocation: 'Bangalore, India',
      geoCountry: 'India',
      geoCity: 'Bangalore',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 2,
      downloadAttempts: 1,
      screenshotAttempts: 0,
      sessionDuration: 180,
    },
    {
      id: `demo_9_${userId}`,
      userId,
      shareId: `share_demo_ghi789`,
      type: 'shared',
      fileName: 'Employee ID Card.png',
      fileType: 'image',
      sharedBy: userId,
      timestamp: new Date(now - 1 * hr).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      deviceType: 'mobile',
      ipAddress: '203.192.18.45',
      geoLocation: 'Pune, India',
      geoCountry: 'India',
      geoCity: 'Pune',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 1,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_10_${userId}`,
      userId,
      shareId: `share_demo_ghi789`,
      type: 'suspicious_activity',
      fileName: 'Employee ID Card.png',
      fileType: 'image',
      sharedBy: userId,
      timestamp: new Date(now - 30 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 12; Redmi Note 10)',
      deviceType: 'mobile',
      ipAddress: '45.77.183.12',
      geoLocation: 'Unknown, VPN',
      geoCountry: 'Unknown',
      geoCity: 'VPN',
      riskScore: 75,
      status: 'warning',
      securityEvents: ['vpn_detected', 'rapid_scroll', 'copy_attempted'],
      viewCount: 8,
      downloadAttempts: 3,
      screenshotAttempts: 2,
    },
    {
      id: `demo_11_${userId}`,
      userId,
      shareId: `share_demo_ghi789`,
      type: 'session_blocked',
      fileName: 'Employee ID Card.png',
      fileType: 'image',
      sharedBy: userId,
      timestamp: new Date(now - 25 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 12; Redmi Note 10)',
      deviceType: 'mobile',
      ipAddress: '45.77.183.12',
      geoLocation: 'Unknown, VPN',
      geoCountry: 'Unknown',
      geoCity: 'VPN',
      riskScore: 90,
      status: 'blocked',
      securityEvents: ['vpn_detected', 'session_blocked', 'suspicious_activity'],
      viewCount: 0,
      downloadAttempts: 0,
      screenshotAttempts: 0,
    },
    {
      id: `demo_12_${userId}`,
      userId,
      shareId: `share_demo_abc123`,
      type: 're_accessed',
      fileName: 'Zensar POSH Policy India.pdf',
      fileType: 'pdf',
      sharedBy: userId,
      recipientName: 'Priya Sharma',
      timestamp: new Date(now - 10 * min).toISOString(),
      deviceInfo: 'Mozilla/5.0 (Linux; Android 13; OnePlus 11)',
      deviceType: 'mobile',
      ipAddress: '223.186.45.12',
      geoLocation: 'Hyderabad, India',
      geoCountry: 'India',
      geoCity: 'Hyderabad',
      riskScore: 0,
      status: 'success',
      securityEvents: [],
      viewCount: 5,
      downloadAttempts: 0,
      screenshotAttempts: 0,
      sessionDuration: 412,
    },
  ];

  const merged = [...demos, ...parsed].slice(0, 2000);
  localStorage.setItem('pinit_activity_events_v2', JSON.stringify(merged));
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',        label: 'All',         icon: Activity      },
  { id: 'shared',     label: 'Shared',      icon: Share2        },
  { id: 'downloads',  label: 'Downloads',   icon: Download      },
  { id: 'views',      label: 'Views',       icon: Eye           },
  { id: 'security',   label: 'Security',    icon: Shield        },
  { id: 'suspicious', label: 'Suspicious',  icon: AlertTriangle },
  { id: 'blocked',    label: 'Blocked',     icon: Ban           },
  { id: 'revoked',    label: 'Revoked',     icon: Link2Off      },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventColor(type: ActivityEventType): string {
  const security = ['print_attempted','screenshot_attempted','screen_recording_detected','vpn_detected','suspicious_activity','copy_attempted','rapid_scroll','tab_switch','security_alert'];
  const denied   = ['link_revoked','link_expired','access_denied','session_blocked','download_denied','password_failed','download_limit_reached'];
  const ok       = ['shared','uploaded','verified','session_start','downloaded'];
  const info     = ['opened','viewed','preview','link_accessed','re_accessed','session_end'];
  if (security.includes(type)) return C.warning;
  if (denied.includes(type))   return C.danger;
  if (ok.includes(type))       return C.success;
  if (info.includes(type))     return C.cyan;
  return C.purple;
}

function eventIcon(type: ActivityEventType, size = 15) {
  const map: Partial<Record<ActivityEventType, React.ReactNode>> = {
    shared:                    <Share2 size={size} />,
    opened:                    <Eye size={size} />,
    viewed:                    <Eye size={size} />,
    downloaded:                <Download size={size} />,
    download_denied:           <XCircle size={size} />,
    preview:                   <Eye size={size} />,
    upload:                    <File size={size} />,
    print_attempted:           <Printer size={size} />,
    screenshot_attempted:      <Camera size={size} />,
    screen_recording_detected: <Play size={size} />,
    link_accessed:             <Globe size={size} />,
    link_revoked:              <Link2Off size={size} />,
    link_expired:              <Clock size={size} />,
    access_denied:             <Ban size={size} />,
    session_blocked:           <Shield size={size} />,
    password_failed:           <Lock size={size} />,
    download_limit_reached:    <AlertTriangle size={size} />,
    security_alert:            <AlertTriangle size={size} />,
    vpn_detected:              <Wifi size={size} />,
    suspicious_activity:       <AlertTriangle size={size} />,
    tab_switch:                <Monitor size={size} />,
    copy_attempted:            <Copy size={size} />,
    verified:                  <CheckCircle size={size} />,
    session_start:             <Zap size={size} />,
    session_end:               <Clock size={size} />,
    re_accessed:               <RefreshCw size={size} />,
    rapid_scroll:              <TrendingUp size={size} />,
  };
  return map[type] ?? <Activity size={size} />;
}

function statusChip(status: string) {
  const map: Record<string, [string, string]> = {
    success: [C.success, 'SUCCESS'],
    blocked: [C.danger,  'BLOCKED'],
    denied:  [C.danger,  'DENIED'],
    warning: [C.warning, 'WARNING'],
    pending: [C.orange,  'PENDING'],
  };
  const [color, label] = map[status] ?? [C.muted2, status.toUpperCase()];
  return (
    <span style={{
      background: color + '22', border: `1px solid ${color}55`,
      color, fontSize: 9, fontWeight: 800, padding: '2px 7px',
      borderRadius: 5, letterSpacing: 0.5,
    }}>{label}</span>
  );
}

// ─── ActivityCard ─────────────────────────────────────────────────────────────

const ActivityCard: React.FC<{ event: ActivityEvent; expanded: boolean; onToggle: () => void }> = ({
  event, expanded, onToggle,
}) => {
  const color = eventColor(event.type);
  const risk  = getRiskLevel(event.riskScore);

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: C.bgCard, border: `1px solid ${expanded ? C.borderBright : C.border}`, borderRadius: 14, marginBottom: 8, overflow: 'hidden' }}>

      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {/* Icon */}
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: color + '1a', border: `1.5px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {eventIcon(event.type)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{getEventLabel(event.type)}</span>
            {statusChip(event.status)}
            {event.riskScore > 0 && (
              <span style={{ background: risk.color + '22', border: `1px solid ${risk.color}55`, color: risk.color, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>
                RISK {event.riskScore}
              </span>
            )}
          </div>
          {/* File name */}
          <div style={{ color: C.muted2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.fileType === 'pdf' ? <FileText size={11} style={{ display: 'inline', marginRight: 4, color: '#f87171' }} />
              : event.fileType === 'image' ? <Image size={11} style={{ display: 'inline', marginRight: 4, color: C.cyan }} />
              : <File size={11} style={{ display: 'inline', marginRight: 4 }} />}
            {event.fileName}
          </div>
          {/* Meta row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={9} /> {formatRelativeTime(event.timestamp)}
            </span>
            {event.ipAddress !== 'Unknown' && (
              <span style={{ color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Globe size={9} /> {event.ipAddress}
              </span>
            )}
            <span style={{ color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
              {event.deviceType === 'mobile' ? <Smartphone size={9} /> : <Monitor size={9} />} {event.deviceType}
            </span>
            {event.geoCountry && event.geoCountry !== 'Unknown' && (
              <span style={{ color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={9} /> {event.geoCity}, {event.geoCountry}
              </span>
            )}
          </div>
        </div>

        <div style={{ color: C.muted, flexShrink: 0 }}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
      </button>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 14px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                <D label="File Name"      value={event.fileName} />
                <D label="File Type"      value={event.fileType.toUpperCase()} />
                <D label="Shared By"      value={event.sharedBy || 'You'} />
                {event.recipientName  && <D label="Recipient Name"  value={event.recipientName} />}
                {event.recipientEmail && <D label="Recipient Email" value={event.recipientEmail} />}
                <D label="Date & Time"    value={new Date(event.timestamp).toLocaleString()} />
                <D label="IP Address"     value={event.ipAddress} />
                <D label="Location"       value={event.geoLocation} />
                <D label="Country"        value={event.geoCountry} />
                <D label="Device Type"    value={event.deviceType} />
                <D label="Views"          value={String(event.viewCount)} />
                <D label="Downloads"      value={String(event.downloadAttempts)} />
                <D label="Screenshots"    value={String(event.screenshotAttempts)} />
                {event.sessionDuration !== undefined && (
                  <D label="Session Time" value={`${event.sessionDuration}s (${Math.round(event.sessionDuration / 60)}m)`} />
                )}
                <D label="Risk Score"     value={`${event.riskScore}/100 — ${getRiskLevel(event.riskScore).label}`} />
                {event.shareId && <D label="Share ID" value={event.shareId.slice(0, 22) + '...'} />}
              </div>

              {event.securityEvents.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Security Events</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {event.securityEvents.map((se, i) => (
                      <span key={i} style={{ background: C.warning + '22', border: `1px solid ${C.warning}55`, color: C.warning, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                        {se.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Device info */}
              <div style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, color: '#475569', fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>
                {event.deviceInfo.slice(0, 120)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const D: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
    <div style={{ color: C.text, fontSize: 12, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
  </div>
);

// ─── Analytics card ───────────────────────────────────────────────────────────

const AnalyticsCard: React.FC<{ a: ShareAnalytics; onRevoke: (id: string, name: string) => void; revoking: string | null }> = ({
  a, onRevoke, revoking,
}) => {
  const [open, setOpen] = useState(false);
  const riskColors: Record<string, string> = { low: C.success, medium: C.warning, high: C.orange, critical: C.danger };
  const rc = riskColors[a.riskLevel] || C.muted2;

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${a.isRevoked ? C.danger + '44' : C.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{a.fileName}</span>
            {a.isRevoked && <span style={{ background: C.danger + '22', border: `1px solid ${C.danger}55`, color: C.danger, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>REVOKED</span>}
            <span style={{ background: rc + '22', border: `1px solid ${rc}55`, color: rc, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>{a.riskLevel.toUpperCase()} RISK</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Metric icon={<Eye size={10} />} label={`${a.totalViews} views`} />
            <Metric icon={<Users size={10} />} label={`${a.uniqueViewers.length} unique`} />
            <Metric icon={<Download size={10} />} label={`${a.totalDownloads} downloads`} />
            {a.screenshotAttempts > 0 && <Metric icon={<Camera size={10} />} label={`${a.screenshotAttempts} screenshots`} color={C.danger} />}
            {a.printAttempts > 0 && <Metric icon={<Printer size={10} />} label={`${a.printAttempts} print attempts`} color={C.warning} />}
          </div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} /> Last: {formatRelativeTime(a.lastActivity)}
          </div>
        </div>
        <div style={{ color: C.muted }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '13px 14px' }}>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  ['Total Views',    a.totalViews,              C.cyan],
                  ['Unique Viewers', a.uniqueViewers.length,    C.purple],
                  ['Avg View Time',  `${a.avgViewingTime}s`,    C.success],
                  ['Downloads',      a.totalDownloads,          C.blue],
                  ['DL Attempts',    a.downloadAttempts,        C.warning],
                  ['Screenshots',    a.screenshotAttempts,      C.danger],
                ].map(([lbl, val, col]) => (
                  <div key={String(lbl)} style={{ background: (col as string) + '15', border: `1px solid ${col as string}33`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ color: col as string, fontSize: 18, fontWeight: 800 }}>{val}</div>
                    <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{lbl}</div>
                  </div>
                ))}
              </div>

              {/* Geo breakdown */}
              {Object.keys(a.geoBreakdown).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>GEO BREAKDOWN</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(a.geoBreakdown).map(([c, n]) => (
                      <span key={c} style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 8, padding: '3px 9px', fontSize: 11, color: C.cyan }}>
                        <MapPin size={9} style={{ display: 'inline', marginRight: 3 }} />{c}: {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Device breakdown */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>DEVICE BREAKDOWN</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([['Mobile', a.deviceBreakdown.mobile, C.purple], ['Desktop', a.deviceBreakdown.desktop, C.cyan], ['Tablet', a.deviceBreakdown.tablet, C.success]] as [string, number, string][]).map(([lbl, cnt, col]) => {
                    const pct = a.events.length > 0 ? Math.round((cnt / a.events.length) * 100) : 0;
                    return (
                      <div key={lbl} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ color: col, fontSize: 14, fontWeight: 800 }}>{pct}%</div>
                        <div style={{ background: '#1e293b', borderRadius: 3, height: 4, margin: '4px 0' }}>
                          <div style={{ background: col, height: 4, borderRadius: 3, width: `${pct}%` }} />
                        </div>
                        <div style={{ color: C.muted, fontSize: 10 }}>{lbl} ({cnt})</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Access timeline */}
              {a.accessTimeline.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>ACCESS TIMELINE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                    {a.accessTimeline.slice(-8).reverse().map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{ color: eventColor(t.type), minWidth: 6, height: 6, borderRadius: '50%', background: eventColor(t.type), flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ color: C.muted2 }}>{getEventLabel(t.type)}</span>
                        <span style={{ color: C.muted, marginLeft: 'auto', fontSize: 10 }}>{formatRelativeTime(t.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin controls */}
              {!a.isRevoked && (
                <button
                  onClick={e => { e.stopPropagation(); if (window.confirm(`Revoke share for "${a.fileName}"?\n\nRecipients will lose access immediately.`)) onRevoke(a.shareId, a.fileName); }}
                  disabled={revoking === a.shareId}
                  style={{ width: '100%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, color: '#fca5a5', fontSize: 13, fontWeight: 700, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: revoking === a.shareId ? 0.5 : 1 }}
                >
                  <Link2Off size={14} /> {revoking === a.shareId ? 'Revoking...' : 'Revoke Access'}
                </button>
              )}
              {a.isRevoked && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px', textAlign: 'center', color: '#fca5a5', fontSize: 12 }}>
                  ✅ Access has been revoked
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; color?: string }> = ({ icon, label, color }) => (
  <span style={{ color: color || C.muted2, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
    {icon} {label}
  </span>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const ActivityPage: React.FC = () => {
  const userId = localStorage.getItem('biovault_userId') || 'preview-user-001';

  const [activeTab, setActiveTab]   = useState<TabId>('all');
  const [events, setEvents]         = useState<ActivityEvent[]>([]);
  const [analytics, setAnalytics]   = useState<ShareAnalytics[]>([]);
  const [stats, setStats]           = useState({ total: 0, shares: 0, views: 0, downloads: 0, securityAlerts: 0, blocked: 0, highRisk: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [revoking, setRevoking]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const loadData = useCallback(() => {
    if (!userId) return;
    seedDemoData(userId);  // no-op if data already exists
    const evts  = getEventsByCategory(userId, activeTab);
    const all   = getAllShareAnalytics(userId);
    const s     = getActivityStats(userId);
    setEvents(evts);
    setAnalytics(all);
    setStats(s);
    setLastRefresh(Date.now());
  }, [userId, activeTab]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sync from Supabase on first mount so events logged by external share-link
  // viewers (on their own devices) appear for the document owner.
  useEffect(() => {
    syncFromSupabase(userId).then(() => loadData());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const h = () => loadData();
    window.addEventListener('pinit_activity_update', h);
    window.addEventListener('storage', h);
    const t = setInterval(loadData, 8000);
    return () => { window.removeEventListener('pinit_activity_update', h); window.removeEventListener('storage', h); clearInterval(t); };
  }, [loadData]);

  const filtered = events.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.fileName.toLowerCase().includes(q) || e.type.includes(q) || e.geoCountry.toLowerCase().includes(q) || (e.recipientEmail || '').toLowerCase().includes(q) || e.ipAddress.includes(q) || (e.recipientName || '').toLowerCase().includes(q);
  });

  const handleRevoke = async (shareId: string, fileName: string) => {
    setRevoking(shareId);
    await revokeShareLink(shareId, userId, fileName);
    setRevoking(null);
    loadData();
  };

  const securityCount = stats.securityAlerts;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 90 }}>

      {/* ── Sticky header ── */}
      <div style={{ background: C.bgCard2, borderBottom: `1px solid ${C.border}`, padding: '14px 14px 0', position: 'sticky', top: 0, zIndex: 30 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.purple }}>
              <Activity size={18} />
            </div>
            <div>
              <h1 style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Activity Monitor</h1>
              <p style={{ color: C.muted, fontSize: 10, margin: 0 }}>Updated {new Date(lastRefresh).toLocaleTimeString()}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={loadData} style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 8, padding: '6px 10px', color: C.cyan, cursor: 'pointer' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setShowAnalytics(v => !v)} style={{ background: showAnalytics ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.07)', border: `1px solid ${showAnalytics ? C.purple + '88' : C.border}`, borderRadius: 8, padding: '6px 11px', color: C.purple, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <BarChart2 size={14} /> Analytics
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search file, IP, country, recipient..."
            style={{ width: '100%', background: 'rgba(30,41,59,0.7)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px 8px 30px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 10 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setExpandedId(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: active ? 'rgba(168,85,247,0.18)' : 'rgba(30,41,59,0.5)', border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.05)', color: active ? C.purple : C.muted2, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Icon size={12} />{tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '12px 14px 0' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
          {[
            { label: 'Total',    value: stats.total,          icon: <Activity size={16} />,    color: C.purple },
            { label: 'Security', value: securityCount,        icon: <Shield size={16} />,      color: C.danger },
            { label: 'Downloads',value: stats.downloads,      icon: <Download size={16} />,    color: C.cyan },
            { label: 'High Risk',value: stats.highRisk,       icon: <AlertTriangle size={16}/>,color: C.orange },
          ].map(({ label, value, icon, color }) => (
            <div key={label} style={{ background: color + '13', border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ color, opacity: 0.8, display: 'flex', justifyContent: 'center', marginBottom: 3 }}>{icon}</div>
              <div style={{ color, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Security alert banner */}
        {securityCount > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, padding: '10px 13px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={15} color={C.danger} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 13 }}>{securityCount} Security Event{securityCount !== 1 ? 's' : ''} Detected</div>
              <div style={{ color: C.muted2, fontSize: 11 }}>{stats.highRisk} high-risk. Tap Security tab to review.</div>
            </div>
            <button onClick={() => setActiveTab('security')}
              style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 7, padding: '4px 10px', color: '#fca5a5', cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              Review
            </button>
          </motion.div>
        )}

        {/* Analytics panel */}
        <AnimatePresence>
          {showAnalytics && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.borderBright}`, borderRadius: 14, padding: '13px 13px 3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <BarChart2 size={15} color={C.purple} />
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Smart Link Analytics</span>
                  <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 11 }}>{analytics.length} link{analytics.length !== 1 ? 's' : ''}</span>
                </div>
                {analytics.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 13 }}>
                    Share a file from your Vault to see analytics here.
                  </div>
                ) : analytics.map(a => (
                  <AnalyticsCard key={a.shareId} a={a} onRevoke={handleRevoke} revoking={revoking} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ color: C.muted2, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Filter size={12} />
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </div>
          {events.length > 0 && (
            <button onClick={() => { if (window.confirm('Clear all activity logs? This cannot be undone.')) { clearAllActivity(userId); loadData(); } }}
              style={{ background: 'none', border: 'none', color: C.danger, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, opacity: 0.65 }}>
              <Trash2 size={11} /> Clear All
            </button>
          )}
        </div>

        {/* Events list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 24px', color: C.muted }}>
            <Activity size={44} style={{ opacity: 0.25, margin: '0 auto 16px', display: 'block' }} />
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: C.muted2 }}>
              {activeTab === 'all' ? 'No activity yet' : `No ${activeTab} events`}
            </p>
            <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>
              Activity appears here as you share files and recipients interact with them.
            </p>
          </div>
        ) : (
          filtered.map(event => (
            <ActivityCard
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId(id => id === event.id ? null : event.id)}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default ActivityPage;
