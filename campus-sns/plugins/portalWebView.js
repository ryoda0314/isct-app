/**
 * Portal Auto-Login WebView Plugin
 *
 * Opens the university portal in a native WebView and automatically
 * fills in credentials + matrix authentication.  This replaces the
 * server-side Puppeteer flow when running as a Capacitor native app.
 *
 * Usage:
 *   import { openPortal } from './plugins/portalWebView.js';
 *   await openPortal({ userId, password, matrix });
 */

import { isNative } from '../capacitor.js';

const PORTAL_LOGIN_URL =
  'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login' +
  '?Template=userpass_key&AUTHMETHOD=UserPassword' +
  '&GAREASONCODE=-1&GARESOURCEID=resourcelistID2' +
  '&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList' +
  '&Reason=-1&APPID=resourcelistID2' +
  '&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

/**
 * Look up a matrix value by [Column, Row] label.
 * Same logic as lib/auth/portal-login.js lookupMatrix.
 */
function lookupMatrix(matrix, label) {
  const match = label.match(/\[?([A-J]),\s*(\d)\]?/i);
  if (!match) return '';
  const col = match[1].toUpperCase();
  const row = match[2];
  return matrix[col]?.[row] || '';
}

/**
 * JS to inject into the login page (Step 1: ID + Password).
 */
function loginScript(userId, password) {
  return `
    (function() {
      var u = document.querySelector('input[name="usr_name"]');
      var p = document.querySelector('input[name="usr_password"]');
      var ok = document.querySelector('input[name="OK"]');
      if (u && p && ok) {
        u.value = ${JSON.stringify(userId)};
        p.value = ${JSON.stringify(password)};
        ok.click();
      }
    })();
  `;
}

/**
 * JS to inject into the matrix auth page (Step 2).
 * Reads the matrix position labels from the DOM, looks up values,
 * fills in the inputs, and submits.
 */
function matrixScript(matrix) {
  return `
    (function() {
      var inputs = ['message3', 'message4', 'message5'];
      var labels = [];
      var cells = document.querySelectorAll('td, th');
      for (var i = 0; i < cells.length; i++) {
        var t = cells[i].textContent.trim();
        if (/^\\[[A-J],\\s*\\d\\]$/i.test(t)) labels.push(t);
      }
      if (labels.length < 3) return;
      var matrix = ${JSON.stringify(matrix)};
      for (var j = 0; j < 3; j++) {
        var m = labels[j].match(/\\[?([A-J]),\\s*(\\d)\\]?/i);
        if (!m) continue;
        var val = matrix[m[1].toUpperCase()] && matrix[m[1].toUpperCase()][m[2]] || '';
        var inp = document.querySelector('input[name="' + inputs[j] + '"]');
        if (inp) inp.value = val;
      }
      var ok = document.querySelector('input[name="OK"]');
      if (ok) ok.click();
    })();
  `;
}

/**
 * Open the portal with auto-login using the Capacitor InAppBrowser
 * or @capacitor/browser as a fallback.
 *
 * @param {Object} credentials
 * @param {string} credentials.userId
 * @param {string} credentials.password
 * @param {Object} credentials.matrix - { A: { 1: 'G', ... }, B: { ... }, ... }
 */
export async function openPortal({ userId, password, matrix }) {
  if (!isNative()) {
    // Web fallback: use existing server-side proxy
    window.location.href = '/api/portal/page';
    return;
  }

  try {
    // Try CapacitorCustomWebView (custom plugin) first
    const { CapacitorCustomWebView } = await import('@nickvdende/capacitor-inappbrowser')
      .catch(() => ({}));

    if (CapacitorCustomWebView) {
      return openWithInAppBrowser(CapacitorCustomWebView, { userId, password, matrix });
    }
  } catch {
    // Fallback below
  }

  // Fallback: use @capacitor/browser (no auto-login, but opens the portal)
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: PORTAL_LOGIN_URL });
}

/**
 * InAppBrowser implementation with script injection for auto-login.
 */
async function openWithInAppBrowser(InAppBrowser, { userId, password, matrix }) {
  let loginDone = false;
  let matrixDone = false;

  await InAppBrowser.openWebView({
    url: PORTAL_LOGIN_URL,
    title: 'ポータル',
    toolbarColor: '#0d1117',
    showArrow: true,
  });

  // Listen for page load events to inject scripts
  InAppBrowser.addListener('urlChangeEvent', async (event) => {
    const url = event.url || '';

    // Step 1: Login page — auto-fill credentials
    if (url.includes('Login') && !loginDone) {
      loginDone = true;
      // Small delay for DOM to be ready
      setTimeout(async () => {
        await InAppBrowser.executeScript({ code: loginScript(userId, password) });
      }, 500);
    }

    // Step 2: Matrix auth page — auto-fill matrix values
    if (url.includes('GetAccess') && loginDone && !matrixDone) {
      matrixDone = true;
      setTimeout(async () => {
        await InAppBrowser.executeScript({ code: matrixScript(matrix) });
      }, 500);
    }
  });
}

/**
 * Check if the native portal WebView is available.
 */
export function isNativePortalAvailable() {
  return isNative();
}
