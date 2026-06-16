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
  if (!isNative()) { console.log('[nativePush] skip: not native'); return; }
  if (registered) { console.log('[nativePush] skip: already registered'); return; }
  if (!notifEnabled()) { console.log('[nativePush] skip: notifications disabled in settings'); return; }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    console.log('[nativePush] current permission:', perm.receive);
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
      console.log('[nativePush] after request:', perm.receive);
    }
    if (perm.receive !== 'granted') {
      console.warn('[nativePush] permission not granted:', perm.receive);
      return;
    }

    // APNs device token → send to backend.
    PushNotifications.addListener('registration', async (token) => {
      currentToken = token.value;
      console.log('[nativePush] APNs token received:', token.value.slice(0, 12) + '…');
      try {
        const r = await fetch('/api/push/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value, platform: 'ios' }),
        });
        console.log('[nativePush] token POST /api/push/device →', r.status);
      } catch (e) { console.warn('[nativePush] token POST failed', e); }
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
    console.log('[nativePush] register() called — waiting for APNs token');
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
