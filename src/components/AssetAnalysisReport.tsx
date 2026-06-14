/**
 * AssetAnalysisReport — a per-asset report combining:
 *   • the 6-layer DNA fingerprint (generated on demand)
 *   • engagement analytics (views, unique viewers, dwell, scroll, devices, geo)
 *   • security signals (screenshots, tab-switches, risk)
 *   • an activity timeline
 * Exportable to PDF (jsPDF).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Download, Loader2, Fingerprint, Eye, Users, Clock, Camera, ShieldAlert } from 'lucide-react';
import { generateDocumentDNA, type DocumentDNA } from '@/lib/documentDna';
import { getActivityEvents, type ActivityEvent } from '@/lib/activityService';

interface ReportDoc {
  id: string;
  name: string;
  encryptedData?: string;
  metadata?: { size?: number; dna?: DocumentDNA };
}

interface Props {
  doc: ReportDoc;
  userId: string;
  onBack: () => void;
}

interface Summary {
  totalViews: number;
  uniqueViewers: number;
  totalDwellSec: number;
  avgDwellSec: number;
  maxScrollPct: number;
  screenshots: number;
  tabSwitches: number;
  downloads: number;
  maxRisk: number;
  devices: Record<string, number>;
  countries: Record<string, number>;
  timeline: { type: string; time: string; detail: string }[];
}

function mimeOf(doc: ReportDoc): string {
  const d = doc.encryptedData || '';
  if (d.startsWith('data:')) return d.slice(5, d.indexOf(';') >= 0 ? d.indexOf(';') : 5) || 'application/octet-stream';
  if (/\.pdf$/i.test(doc.name)) return 'application/pdf';
  if (/\.(png|jpe?g|webp|gif)$/i.test(doc.name)) return 'image/' + (doc.name.split('.').pop() || 'png');
  return 'application/octet-stream';
}

function summarize(events: ActivityEvent[]): Summary {
  const views = events.filter((e) => ['opened', 'viewed', 'preview', 'session_start'].includes(e.type));
  const dwellEvents = events.filter((e) => e.sessionDuration && e.sessionDuration > 0);
  const totalDwell = dwellEvents.reduce((s, e) => s + (e.sessionDuration || 0), 0);
  const maxScroll = events.reduce((m, e) => Math.max(m, Number((e.metadata as any)?.maxScrollPct || 0)), 0);
  const devices: Record<string, number> = {};
  const countries: Record<string, number> = {};
  for (const e of events) {
    devices[e.deviceType] = (devices[e.deviceType] || 0) + 1;
    if (e.geoCountry && e.geoCountry !== 'Unknown') countries[e.geoCountry] = (countries[e.geoCountry] || 0) + 1;
  }
  const timeline = [...events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12)
    .map((e) => ({ type: e.type, time: new Date(e.timestamp).toLocaleString(), detail: e.geoCity && e.geoCity !== 'Unknown' ? `${e.geoCity}, ${e.geoCountry}` : e.deviceType }));

  return {
    totalViews: views.length,
    uniqueViewers: new Set(views.map((e) => e.recipientName || e.ipAddress)).size,
    totalDwellSec: totalDwell,
    avgDwellSec: dwellEvents.length ? Math.round(totalDwell / dwellEvents.length) : 0,
    maxScrollPct: maxScroll,
    screenshots: events.filter((e) => e.type === 'screenshot_attempted').length,
    tabSwitches: events.filter((e) => e.type === 'tab_switch').length,
    downloads: events.filter((e) => e.type === 'downloaded').length,
    maxRisk: events.reduce((m, e) => Math.max(m, e.riskScore || 0), 0),
    devices,
    countries,
    timeline,
  };
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color?: string }> = ({ icon, label, value, color = '#a855f7' }) => (
  <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center">
    <div className="flex justify-center mb-1" style={{ color }}>{icon}</div>
    <div className="text-lg font-bold text-white">{value}</div>
    <div className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</div>
  </div>
);

export const AssetAnalysisReport: React.FC<Props> = ({ doc, userId, onBack }) => {
  const [dna, setDna] = useState<DocumentDNA | null>(doc.metadata?.dna || null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const events = useMemo(
    () => getActivityEvents(userId).filter((e) => e.fileName === doc.name),
    [userId, doc.name]
  );
  const summary = useMemo(() => summarize(events), [events]);

  useEffect(() => {
    let cancelled = false;
    if (dna) return;
    const url = doc.encryptedData || '';
    if (!url.startsWith('data:')) return;
    setLoading(true);
    generateDocumentDNA(url, doc.name, mimeOf(doc), doc.metadata?.size || url.length)
      .then((d) => { if (!cancelled) setDna(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doc, dna]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const M = 40; let y = 50;
      const line = (t: string, size = 11, bold = false) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
        const wrapped = pdf.splitTextToSize(t, 515);
        pdf.text(wrapped, M, y); y += wrapped.length * (size + 4);
        if (y > 780) { pdf.addPage(); y = 50; }
      };
      pdf.setFillColor(124, 92, 255); pdf.rect(0, 0, 595, 8, 'F');
      line('PINIT Vault — Asset Analysis Report', 18, true); y += 6;
      line(`Asset: ${doc.name}`, 11);
      line(`Generated: ${new Date().toLocaleString()}`, 9); y += 8;

      line('DNA Fingerprint', 14, true);
      if (dna) {
        line(`DNA ID: ${dna.dnaId}   Signature: ${dna.signature}`, 10);
        line(`Layers composed: ${dna.layerCount}/6   (${dna.totalMs}ms)`, 10);
        dna.layers.forEach((l) => line(`  ${l.id} ${l.name}: ${l.status.toUpperCase()} (${l.durationMs}ms)`, 9));
        if (dna.sha256) line(`  SHA-256: ${dna.sha256.slice(0, 48)}…`, 8);
      } else { line('  DNA not available (asset has no readable data).', 10); }
      y += 8;

      line('Engagement Analytics', 14, true);
      line(`Total views: ${summary.totalViews}    Unique viewers: ${summary.uniqueViewers}`, 10);
      line(`Total dwell: ${summary.totalDwellSec}s    Avg dwell: ${summary.avgDwellSec}s    Max scroll: ${summary.maxScrollPct}%`, 10);
      line(`Downloads: ${summary.downloads}`, 10);
      const dev = Object.entries(summary.devices).map(([k, v]) => `${k}:${v}`).join('  ') || 'none';
      const geo = Object.entries(summary.countries).map(([k, v]) => `${k}:${v}`).join('  ') || 'none';
      line(`Devices: ${dev}`, 10);
      line(`Geography: ${geo}`, 10); y += 8;

      line('Security Signals', 14, true);
      line(`Screenshot attempts: ${summary.screenshots}    Tab switches: ${summary.tabSwitches}    Max risk: ${summary.maxRisk}/100`, 10);
      y += 8;

      line('Recent Activity', 14, true);
      if (summary.timeline.length === 0) line('  No activity recorded yet.', 10);
      summary.timeline.forEach((t) => line(`  ${t.time} — ${t.type} (${t.detail})`, 9));

      pdf.save(`PINIT_Report_${doc.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch {
      alert('Could not generate PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="px-4 pt-6 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700"><ArrowLeft className="w-5 h-5 text-slate-300" /></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="w-6 h-6 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white leading-tight">Asset Analysis Report</h1>
            <p className="text-[11px] text-slate-400 truncate">{doc.name}</p>
          </div>
        </div>
        <button onClick={exportPdf} disabled={exporting}
          className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold disabled:opacity-50">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF
        </button>
      </div>

      {/* DNA fingerprint */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
        <div className="flex items-center gap-2 mb-3"><Fingerprint className="w-4 h-4 text-pink-400" /><span className="text-sm font-bold text-white">DNA Fingerprint</span></div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-purple-300"><Loader2 className="w-4 h-4 animate-spin" /> Composing DNA…</div>
        ) : dna ? (
          <>
            <div className="font-mono text-pink-300 text-base font-bold">{dna.dnaId}</div>
            <div className="text-[10px] text-slate-500 mb-3">{dna.layerCount}/6 layers · {dna.totalMs}ms</div>
            <div className="grid grid-cols-2 gap-1.5">
              {dna.layers.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${l.status === 'complete' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="text-slate-300">{l.id} {l.name.replace(' Fingerprint', '').replace(' Analysis', '').replace(' Provenance', '').replace(' Signature Seal', '')}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">DNA unavailable for this asset.</p>
        )}
      </div>

      {/* Engagement */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Eye className="w-4 h-4" />} label="Views" value={summary.totalViews} color="#06b6d4" />
        <Stat icon={<Users className="w-4 h-4" />} label="Unique" value={summary.uniqueViewers} color="#a855f7" />
        <Stat icon={<Clock className="w-4 h-4" />} label="Avg dwell" value={`${summary.avgDwellSec}s`} color="#22c55e" />
        <Stat icon={<Download className="w-4 h-4" />} label="Downloads" value={summary.downloads} color="#3b82f6" />
        <Stat icon={<Camera className="w-4 h-4" />} label="Screenshots" value={summary.screenshots} color="#ef4444" />
        <Stat icon={<ShieldAlert className="w-4 h-4" />} label="Max risk" value={`${summary.maxRisk}`} color="#f59e0b" />
      </div>

      {/* Devices / Geo */}
      {(Object.keys(summary.devices).length > 0 || Object.keys(summary.countries).length > 0) && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-2">
          <span className="text-sm font-bold text-white">Audience</span>
          {Object.keys(summary.devices).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(summary.devices).map(([k, v]) => (
                <span key={k} className="text-[10px] px-2 py-1 rounded-lg bg-slate-700/40 text-slate-200">{k}: {v}</span>
              ))}
            </div>
          )}
          {Object.keys(summary.countries).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(summary.countries).map(([k, v]) => (
                <span key={k} className="text-[10px] px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-300">{k}: {v}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
        <span className="text-sm font-bold text-white">Activity Timeline</span>
        {summary.timeline.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">No activity recorded yet — share this asset to start tracking.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {summary.timeline.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                <span className="text-slate-300 capitalize">{t.type.replace(/_/g, ' ')}</span>
                <span className="text-slate-500 ml-auto">{t.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AssetAnalysisReport;
