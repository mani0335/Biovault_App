/**
 * Push Notification Service
 *
 * Registers the device FCM token with Supabase on startup.
 * Handles incoming foreground notifications (shows in-app toast).
 *
 * Requires:
 *  - android/app/google-services.json (Firebase project setup)
 *  - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

let _registered = false;

export async function registerPushNotifications(userId: string): Promise<void> {
  if (_registered) return;
  if (!Capacitor.isNativePlatform()) return; // FCM only on Android/iOS

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') return;

    // Register with FCM
    await PushNotifications.register();

    // Save token to Supabase when received
    PushNotifications.addListener('registration', async (token) => {
      await saveFcmToken(userId, token.value);
    });

    // Show in-app notification for foreground pushes
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      showInAppNotification(
        notification.title ?? 'PINIT DNA',
        notification.body ?? 'Someone scanned your image.',
        (notification.data as Record<string, string> | undefined) ?? {},
      );
    });

    // Handle tap on background notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification.data as Record<string, string> | undefined) ?? {};
      if (data.type === 'scan_event') {
        // Navigate to activity page — dispatch custom event so the app can react
        window.dispatchEvent(new CustomEvent('pinit:open-activity'));
      }
    });

    _registered = true;
  } catch {
    // FCM not available (simulator, web) — silent fail
  }
}

async function saveFcmToken(userId: string, token: string): Promise<void> {
  try {
    await supabase.from('fcm_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Capacitor.getPlatform(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } catch {
    // Table may not exist yet — silent fail
  }
}

// ── In-app notification banner ────────────────────────────────────────────────

export function showInAppNotification(
  title: string,
  body: string,
  data: Record<string, string>,
): void {
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999',
    'max-width:340px;width:calc(100% - 32px)',
    'background:#1e1b4b;border:1px solid rgba(139,92,246,0.5)',
    'border-radius:16px;padding:14px 16px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
    'display:flex;align-items:flex-start;gap:12px',
    'animation:pinit-slide-in 0.3s ease',
  ].join(';');

  banner.innerHTML = `
    <style>
      @keyframes pinit-slide-in { from { opacity:0;transform:translateX(-50%) translateY(-20px); } to { opacity:1;transform:translateX(-50%) translateY(0); } }
    </style>
    <div style="width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">🔍</div>
    <div style="flex:1;min-width:0">
      <p style="margin:0;font-size:13px;font-weight:700;color:#e2e8f0;">${escHtml(title)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;line-height:1.4;">${escHtml(body)}</p>
    </div>
    <button onclick="this.closest('[data-pinit-banner]').remove()" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">×</button>
  `;
  banner.setAttribute('data-pinit-banner', '1');

  if (data.type === 'scan_event') {
    banner.style.cursor = 'pointer';
    banner.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        window.dispatchEvent(new CustomEvent('pinit:open-activity'));
        banner.remove();
      }
    });
  }

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 6000);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
