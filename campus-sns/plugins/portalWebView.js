/**
 * Portal Auto-Login — Native Capacitor Plugin Bridge
 *
 * On native (Android/iOS), opens the portal in a dedicated WebView Activity
 * that automatically fills in credentials + matrix authentication.
 * On web, falls back to the server-side Puppeteer proxy.
 */

import { isNative } from '../capacitor.js';

let Portal = null;

/**
 * Ensure the Portal plugin is initialized.
 * IMPORTANT: Do NOT return the Capacitor Proxy from an async function.
 * JS Promise resolution calls .then() on resolved values, and the
 * Capacitor Proxy intercepts .then() as a plugin method call, causing
 * "Portal.then() is not implemented" errors.
 */
async function ensurePortalPlugin() {
  if (Portal) return;
  if (!isNative()) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    Portal = registerPlugin('Portal');
  } catch {}
}

/**
 * Open the portal with auto-login.
 *
 * @param {Object} credentials
 * @param {string} credentials.userId - Portal account ID
 * @param {string} credentials.password - Portal password
 * @param {Object} credentials.matrix - { A: { 1: 'G', ... }, B: { ... }, ... }
 */
export async function openPortal({ userId, password, matrix, sidebarWidth = 0 }) {
  if (!isNative()) {
    // Web: use existing server-side proxy
    window.location.href = '/api/portal/page';
    return;
  }

  await ensurePortalPlugin();
  if (Portal) {
    await Portal.openPortal({
      userId,
      password,
      matrixJson: JSON.stringify(matrix),
      sidebarWidth,
    });
  } else {
    // Fallback: open in system browser (no auto-login)
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: 'https://portal.nap.gsic.titech.ac.jp/' });
  }
}

/**
 * Open the ISCT portal with SSO auto-login.
 *
 * @param {Object} credentials
 * @param {string} credentials.userId - Science Tokyo ID
 * @param {string} credentials.password - ISCT password
 * @param {string} credentials.totpCode - TOTP code (generated server-side)
 */
export async function openIsctPortal({ userId, password, totpCode, sidebarWidth = 0 }) {
  if (!isNative()) {
    window.open('https://isct.ex-tic.com/auth/session', '_blank');
    return;
  }

  await ensurePortalPlugin();
  if (Portal) {
    await Portal.openIsctPortal({ userId, password, totpCode, sidebarWidth });
  } else {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: 'https://isct.ex-tic.com/auth/session' });
  }
}

/**
 * Open an LMS page with SSO auto-login.
 * On native, uses the portal WebView with ISCT SSO.
 * On web, opens the URL in a new tab.
 *
 * @param {string} url - LMS page URL
 * @param {Object} credentials - { userId, password, totpCode }
 */
export async function openLmsPage(url, { userId, password, totpCode, sidebarWidth = 0 }) {
  if (!isNative()) {
    window.open(url, '_blank');
    return;
  }

  await ensurePortalPlugin();
  if (Portal) {
    await Portal.openLmsPage({ url, userId, password, totpCode, sidebarWidth });
  } else {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  }
}

/**
 * Check if the native portal WebView is available.
 */
export function isNativePortalAvailable() {
  return isNative();
}
