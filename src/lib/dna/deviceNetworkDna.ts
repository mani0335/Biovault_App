import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { getViewerGeoInfo } from '@/lib/activityService';
import type { DeviceNetworkDna } from './types';

async function sha256Short(input: string): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const arr = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex.slice(0, 32).toUpperCase();
  } catch { return null; }
}

// Cache last GPS fix — reuse if acquired within 5 minutes
let _gpsCache: { lat: number; lng: number; accuracy: number; ts: number } | null = null;
const GPS_CACHE_TTL_MS = 5 * 60 * 1000;

function getGps(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  // Return cached fix if still fresh
  if (_gpsCache && Date.now() - _gpsCache.ts < GPS_CACHE_TTL_MS) {
    return Promise.resolve({ lat: _gpsCache.lat, lng: _gpsCache.lng, accuracy: _gpsCache.accuracy });
  }

  return new Promise((resolve) => {
    if (!navigator?.geolocation) { resolve(null); return; }

    // Fire a quick probe to trigger the Android WebView permission dialog before
    // the high-accuracy watchPosition starts, giving the user time to approve.
    navigator.geolocation.getCurrentPosition(
      () => { /* permission granted */ },
      () => { /* denied or unavailable — watchPosition will handle gracefully */ },
      { timeout: 1500, maximumAge: Infinity, enableHighAccuracy: false },
    );

    let best: { lat: number; lng: number; accuracy: number } | null = null;
    let watchId: number | null = null;

    const finish = (result: typeof best) => {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      clearTimeout(tid);
      if (result) _gpsCache = { ...result, ts: Date.now() };
      resolve(result);
    };

    const tid = setTimeout(() => finish(best), timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!best || accuracy < best.accuracy) best = { lat, lng, accuracy };
        if (accuracy <= 20) finish(best);
      },
      () => finish(best),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * Mandatory GPS for encryption — throws if permission denied or device has no GPS.
 * Accepts any fix (even low accuracy) after timeoutMs; only fails on hard denial.
 */
export function getMandatoryGps(timeoutMs = 20000): Promise<{ lat: number; lng: number; accuracy: number }> {
  // Return cached fix if still fresh
  if (_gpsCache && Date.now() - _gpsCache.ts < GPS_CACHE_TTL_MS) {
    return Promise.resolve({ lat: _gpsCache.lat, lng: _gpsCache.lng, accuracy: _gpsCache.accuracy });
  }

  if (!navigator?.geolocation) {
    return Promise.reject(new Error('This device does not support GPS. Enable location services and try again.'));
  }

  return new Promise((resolve, reject) => {
    let best: { lat: number; lng: number; accuracy: number } | null = null;
    let watchId: number | null = null;
    let settled = false;

    const finish = (result: typeof best, err?: string) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      clearTimeout(tid);
      if (result) {
        _gpsCache = { ...result, ts: Date.now() };
        resolve(result);
      } else {
        reject(new Error(err ?? 'Could not get GPS location. Enable location permissions and try again.'));
      }
    };

    // Timeout: accept whatever we have, or fail
    const tid = setTimeout(() => {
      if (best) {
        finish(best);
      } else {
        finish(null, 'GPS timed out. Move to an open area or check that location is enabled, then try again.');
      }
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!best || accuracy < best.accuracy) best = { lat, lng, accuracy };
        // Accept immediately if accuracy ≤ 50m; otherwise keep improving until timeout
        if (accuracy <= 50) finish(best);
      },
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) {
          finish(null, 'Location permission denied. GPS is required to encrypt files. Enable location in Settings and try again.');
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT — resolve with best if we have one
          finish(best, 'GPS unavailable. Enable location services and try again.');
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

interface ReverseGeoResult {
  address: string | null;
  village: string | null;
  area: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoResult> {
  const empty: ReverseGeoResult = { address: null, village: null, area: null, road: null, city: null, state: null, country: null };
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`,
      { signal: controller.signal, headers: { 'Accept-Language': 'en' } },
    );
    clearTimeout(tid);
    const d = await res.json();
    const addr = d.address || {};
    return {
      address: d.display_name || null,
      village: addr.village || addr.hamlet || addr.suburb || null,
      area: addr.county || addr.district || addr.neighbourhood || null,
      road: addr.road || addr.pedestrian || addr.street || null,
      city: addr.city || addr.town || addr.municipality || null,
      state: addr.state || addr.province || null,
      country: addr.country || null,
    };
  } catch { return empty; }
}

export async function captureDeviceNetworkDna(): Promise<DeviceNetworkDna> {
  const now = new Date().toISOString();
  let manufacturer: string | null = null;
  let model: string | null = null;
  let os: string | null = null;
  let osVersion: string | null = null;
  let platform: string | null = null;

  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      manufacturer = info.manufacturer || null;
      model = info.model || null;
      os = info.operatingSystem || null;
      osVersion = info.osVersion || null;
      platform = info.platform || null;
    } catch { /* not available */ }
  } else {
    platform = 'web';
    os = navigator.platform || null;
  }

  const browserVersion = navigator.userAgent || null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;

  const [geo, gps] = await Promise.all([
    getViewerGeoInfo().catch(() => null),
    getGps(20000),
  ]);

  // Reverse geocode GPS to get full address
  let addrInfo: ReverseGeoResult = { address: null, village: null, area: null, road: null, city: null, state: null, country: null };
  if (gps) {
    addrInfo = await reverseGeocode(gps.lat, gps.lng);
  }

  const fpInput = [manufacturer, model, os, tz, screen?.width, screen?.height].filter(Boolean).join('|');
  const fingerprint = await sha256Short(fpInput);

  return {
    manufacturer,
    model,
    operatingSystem: os,
    osVersion,
    platform,
    browserVersion,
    deviceFingerprint: fingerprint,
    publicIp: geo?.ip ?? null,
    gpsLat: gps?.lat ?? null,
    gpsLng: gps?.lng ?? null,
    address: addrInfo.address,
    village: addrInfo.village,
    area: addrInfo.area,
    road: addrInfo.road,
    city: addrInfo.city ?? geo?.city ?? null,
    state: addrInfo.state,
    country: addrInfo.country ?? geo?.country ?? null,
    timeZone: tz,
    capturedAt: now,
  };
}
