/**
 * ShareTraceGraph — owner-side view of how a shared link spread (A → B → C).
 * Loads hops from Supabase (+ local), builds the forwarding tree, and updates
 * live as the link is forwarded.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, GitBranch, MapPin, Smartphone, Monitor, Clock, Users, Crosshair, RefreshCw, Loader2 } from 'lucide-react';
import { getHops, buildTree, subscribeHops, type TraceNode } from '@/lib/shareTrace';

interface Props {
  shareId: string;
  fileName?: string;
  onBack: () => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const NodeRow: React.FC<{ node: TraceNode; index: number }> = ({ node, index }) => {
  const place = node.gpsLat != null && node.gpsLng != null
    ? `${node.gpsLat.toFixed(3)}, ${node.gpsLng.toFixed(3)}`
    : (node.geoCity && node.geoCity !== 'Unknown' ? `${node.geoCity}, ${node.geoCountry}` : (node.geoCountry || 'Unknown'));
  const isMobile = node.deviceType === 'mobile';
  const label = String.fromCharCode(65 + (index % 26)); // A, B, C…

  return (
    <div style={{ marginLeft: node.depth * 18 }} className="relative">
      {node.depth > 0 && (
        <span className="absolute -left-3 top-5 w-3 h-px bg-purple-500/40" />
      )}
      <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-2.5 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
          node.depth === 0 ? 'bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white' : 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
        }`}>{label}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">{node.depth === 0 ? 'Opened directly' : `Forwarded · hop ${node.depth}`}</span>
            {node.gpsLat != null && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-0.5"><Crosshair className="w-2.5 h-2.5" /> GPS</span>}
            {node.children.length > 0 && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">↳ {node.children.length}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{place}</span>
            <span className="flex items-center gap-1">{isMobile ? <Smartphone className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}{node.deviceType || 'device'}</span>
            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{timeAgo(node.createdAt)}</span>
          </div>
        </div>
      </div>
      {node.children.map((c, i) => <NodeRow key={c.visitorId} node={c} index={index + i + 1} />)}
    </div>
  );
};

export const ShareTraceGraph: React.FC<Props> = ({ shareId, fileName, onBack }) => {
  const [tree, setTree] = useState<TraceNode[] | null>(null);
  const [count, setCount] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useMemo(() => async () => {
    setLoading(true);
    const hops = await getHops(shareId);
    const roots = buildTree(hops);
    setTree(roots);
    setCount(hops.length);
    setMaxDepth(hops.reduce((m, h) => Math.max(m, 0), 0));
    // compute deepest hop
    let md = 0; const walk = (n: TraceNode) => { md = Math.max(md, n.depth); n.children.forEach(walk); };
    roots.forEach(walk); setMaxDepth(md);
    setLoading(false);
  }, [shareId]);

  useEffect(() => {
    load();
    const unsub = subscribeHops(shareId, load);
    const t = window.setInterval(load, 12000);
    return () => { unsub(); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="px-4 pt-6 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700"><ArrowLeft className="w-5 h-5 text-slate-300" /></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GitBranch className="w-6 h-6 text-fuchsia-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white leading-tight">Share Trace Graph</h1>
            <p className="text-[11px] text-slate-400 truncate">{fileName || 'Shared link'} · how it spread</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-slate-800/60"><RefreshCw className="w-4 h-4 text-cyan-300" /></button>
      </div>

      {/* Reach stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center">
          <div className="flex justify-center text-fuchsia-300 mb-1"><Users className="w-4 h-4" /></div>
          <div className="text-lg font-bold text-white">{count}</div>
          <div className="text-[9px] text-slate-400 uppercase">Total reach</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center">
          <div className="flex justify-center text-amber-300 mb-1"><GitBranch className="w-4 h-4" /></div>
          <div className="text-lg font-bold text-white">{maxDepth}</div>
          <div className="text-[9px] text-slate-400 uppercase">Forward depth</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center">
          <div className="flex justify-center text-emerald-300 mb-1"><Crosshair className="w-4 h-4" /></div>
          <div className="text-lg font-bold text-white">{tree ? '●' : '—'}</div>
          <div className="text-[9px] text-slate-400 uppercase">Live</div>
        </div>
      </div>

      {loading && !tree ? (
        <div className="flex items-center gap-2 text-xs text-purple-300"><Loader2 className="w-4 h-4 animate-spin" /> Loading trace…</div>
      ) : !tree || tree.length === 0 ? (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 text-center">
          <GitBranch className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-semibold">No opens yet</p>
          <p className="text-[11px] text-slate-500 mt-1">When someone opens this link — and forwards it — the chain appears here live.</p>
        </div>
      ) : (
        <div className="pl-3">
          {tree.map((root, i) => <NodeRow key={root.visitorId} node={root} index={i} />)}
        </div>
      )}

      <p className="text-[10px] text-slate-500 text-center">Forwarding is traced when recipients use “Forward securely”. Precise GPS appears only if the viewer allowed location.</p>
    </motion.div>
  );
};

export default ShareTraceGraph;
