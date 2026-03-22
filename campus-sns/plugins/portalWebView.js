/**
 * Portal Auto-Login — Native Capacitor Plugin Bridge
 *
 * On native (Android/iOS), opens the portal in a dedicated WebView Activity
 * that automatically fills in credentials + matrix authentication.
 * On web, falls back to the server-side Puppeteer proxy.
 */

import { isNative } from '../capacitor.js';

let Portal = null;

async function getPortalPlugin() {
  if (Portal) return Portal;
  if (!isNative()) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    Portal = registerPlugin('Portal');
    return Portal;
  } catch {
    return null;
  }
}

/**
 * Open the portal with auto-login.
 *
 * @param {Object} credentials
 * @param {string} credentials.userId - Portal account ID
 * @param {string} credentials.password - Portal password
 * @param {Object} credentials.matrix - { A: { 1: 'G', ... }, B: { ... }, ... }
 */
export async function openPortal({ userId, password, matrix }) {
  if (!isNative()) {
    // Web: use existing server-side proxy
    window.location.href = '/api/portal/page';
    return;
  }

  const plugin = await getPortalPlugin();
  if (plugin) {
    await plugin.openPortal({
      userId,
      password,
      matrixJson: JSON.stringify(matrix),
    });
  } else {
    // Fallback: open in system browser (no auto-login)
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: 'https://portal.nap.gsic.titech.ac.jp/' });
  }
}

/**
 * Check if the native portal WebView is available.
 */
export function isNativePortalAvailable() {
  return isNative();
}
