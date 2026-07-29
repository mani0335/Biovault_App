import type { CustodyEvent, CustodyEventType } from './types';
import { appendCustodyToRecord, getDnaRecord } from './dnaRecordStore';
import { captureDeviceNetworkDna } from './deviceNetworkDna';

function makeId(): string {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function appendCustodyEvent(
  dnaId: string,
  eventType: CustodyEventType,
  userId: string,
): Promise<CustodyEvent> {
  let deviceInfo: string | null = null;
  let location: string | null = null;
  let networkInfo: string | null = null;

  try {
    const dev = await captureDeviceNetworkDna();
    deviceInfo = [dev.manufacturer, dev.model, dev.operatingSystem, dev.osVersion].filter(Boolean).join(' · ') || null;
    location = [dev.city, dev.country].filter(Boolean).join(', ') || null;
    networkInfo = dev.publicIp ?? null;
  } catch { /* device capture failed — proceed with nulls */ }

  const event: CustodyEvent = {
    id: makeId(),
    dnaId,
    eventType,
    timestamp: new Date().toISOString(),
    userId,
    deviceInfo,
    location,
    networkInfo,
  };

  appendCustodyToRecord(dnaId, event);
  return event;
}

export function getCustodyTimeline(dnaId: string): CustodyEvent[] {
  const record = getDnaRecord(dnaId);
  if (!record?.custody) return [];
  return [...record.custody].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export async function computeCustodyAnchor(events: CustodyEvent[]): Promise<string | null> {
  if (!events.length) return null;
  try {
    if (!crypto?.subtle) return null;
    const chain = events.map((e) => `${e.id}|${e.eventType}|${e.timestamp}|${e.userId}`).join('>>');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chain));
    const arr = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex.slice(0, 32).toUpperCase();
  } catch { return null; }
}
