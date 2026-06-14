/**
 * useViewerTracking — live engagement tracking for shared-asset viewers.
 *
 * Attaches pointer/touch/scroll/visibility listeners and streams events to the
 * owner via activityService (localStorage + Supabase Realtime):
 *   • session_start  — recipient opened the asset
 *   • engagement     — periodic heartbeat with mouse position, dwell, scroll %
 *   • session_end    — recipient left (with total dwell time)
 *
 * Mouse movement is throttled to a heartbeat (default 5s) so we never spam.
 */

import { useEffect, useRef } from 'react';
import { logActivityEvent, type ActivityEvent } from './activityService';
import { getGpsOnce } from './shareTrace';

export interface ViewerTrackingOptions {
  userId: string;                       // asset owner's id
  shareId?: string;
  fileName: string;
  fileType?: ActivityEvent['fileType'];
  recipientName?: string;
  recipientEmail?: string;
  enabled?: boolean;                    // default true
  heartbeatMs?: number;                 // default 5000
}

export function useViewerTracking(opts: ViewerTrackingOptions): void {
  const start = useRef(Date.now());
  const moves = useRef(0);
  const maxScroll = useRef(0);
  const lastBeat = useRef(0);
  const lastXY = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const active = useRef(true);
  const gps = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (opts.enabled === false || !opts.fileName) return;
    const beatMs = opts.heartbeatMs ?? 5000;
    start.current = Date.now();
    moves.current = 0;
    maxScroll.current = 0;
    lastBeat.current = 0;

    const base = {
      userId: opts.userId,
      shareId: opts.shareId,
      fileName: opts.fileName,
      fileType: opts.fileType,
      recipientName: opts.recipientName,
      recipientEmail: opts.recipientEmail,
    };

    // Request precise GPS once (recipient is prompted to allow). Falls back to
    // IP-based geo if denied — captured automatically by logActivityEvent.
    getGpsOnce().then((g) => {
      gps.current = g;
      if (g) {
        logActivityEvent({
          ...base,
          type: 'engagement',
          skipGeo: true,
          metadata: { gpsLat: g.lat, gpsLng: g.lng, gpsFix: true, dwellSeconds: Math.round((Date.now() - start.current) / 1000) },
        }).catch(() => {});
      }
    }).catch(() => {});

    // session start (one geo lookup)
    logActivityEvent({ ...base, type: 'session_start' }).catch(() => {});

    const sendBeat = () => {
      const dwell = Math.round((Date.now() - start.current) / 1000);
      logActivityEvent({
        ...base,
        type: 'engagement',
        skipGeo: true,
        metadata: {
          dwellSeconds: dwell,
          mouseMoves: moves.current,
          maxScrollPct: maxScroll.current,
          x: lastXY.current.x,
          y: lastXY.current.y,
          vw: window.innerWidth,
          vh: window.innerHeight,
          gpsLat: gps.current?.lat ?? null,
          gpsLng: gps.current?.lng ?? null,
        },
      }).catch(() => {});
    };

    const onMove = (e: PointerEvent | TouchEvent) => {
      moves.current++;
      const p = 'touches' in e ? e.touches[0] : (e as PointerEvent);
      if (p) lastXY.current = { x: Math.round((p as any).clientX || 0), y: Math.round((p as any).clientY || 0) };
      const now = Date.now();
      if (now - lastBeat.current > beatMs) { lastBeat.current = now; sendBeat(); }
    };

    const onScroll = () => {
      const el = (document.scrollingElement || document.documentElement);
      const range = el.scrollHeight - el.clientHeight;
      const pct = range > 0 ? Math.round((el.scrollTop / range) * 100) : 0;
      if (pct > maxScroll.current) maxScroll.current = Math.min(100, pct);
    };

    const endSession = () => {
      const dwell = Math.round((Date.now() - start.current) / 1000);
      logActivityEvent({
        ...base,
        type: 'session_end',
        sessionDuration: dwell,
        skipGeo: true,
        metadata: { mouseMoves: moves.current, maxScrollPct: maxScroll.current },
      }).catch(() => {});
    };

    const onVis = () => {
      if (document.hidden) { active.current = false; endSession(); }
      else { active.current = true; start.current = Date.now(); }
    };

    window.addEventListener('pointermove', onMove as EventListener, { passive: true });
    window.addEventListener('touchmove', onMove as EventListener, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    // periodic heartbeat even without new movement (keeps "viewing now" alive)
    const interval = window.setInterval(() => {
      if (active.current && moves.current > 0) sendBeat();
    }, Math.max(beatMs, 5000));

    return () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('touchmove', onMove as EventListener);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(interval);
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.userId, opts.shareId, opts.fileName, opts.enabled]);
}
