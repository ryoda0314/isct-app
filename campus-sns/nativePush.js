/**
 * Native push registration (APNs / iOS via @capacitor/push-notifications).
 *
 * iOS runs inside a WKWebView (server.url = sciencetokyo.app) where the Web
 * Push API is unavailable, so the web subscribePush() path is a no-op there.
 * This module registers the device with APNs instead and POSTs the resulting
 * token to /api/push/device. On the web it does nothing (isNative() is false).
 */
import { isNative } from './capacitor.js';

let registered = false;
let currentToken = null;

// Mirror the web side: the global toggle lives in localStorage as `notifEnabled`.
function notifEnabled() {
  try { return JSON.parse(localStorage.getItem('notifEnabled') ?? 'true') !== false; }
  catch { return true; }
}

export async function registerNativePush() {
  if (!isNative() || registered || !notifEnabled()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // APNs device token → send to backend.
    PushNotifications.addListener('registration', async (token) => {
      currentToken = token.value;
      try {
        await fetch('/api/push/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value, platform: 'ios' }),
        });
      } catch {}
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[nativePush] registration error', err);
    });

    // Notification tapped → deep-link to the url carried in the payload.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification?.data?.url;
      if (url) {
        try {
          const dest = new URL(url, window.location.origin);
          if (dest.origin === window.location.origin) window.location.href = dest.href;
        } catch {}
      }
    });

    await PushNotifications.register();
    registered = true;
  } catch (e) {
    console.warn('[nativePush] register failed', e);
  }
}

// Unregister this device's token (logout / notifications disabled).
export async function unregisterNativePush() {
  if (!isNative() || !currentToken) return;
  try {
    await fetch('/api/push/device', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken }),
    });
  } catch {}
  currentToken = null;
  registered = false;
}
