import { isNative } from './capacitor.js';

/**
 * Open an LMS web page (course page, forum, feedback, quiz…) for the user.
 *
 * The Moodle wstoken only authenticates the webservice API — it does nothing for
 * the `mod/<name>/view.php` pages, which need a real browser session. So:
 *  - Native: hand the URL to the portal WebView plugin together with a one-shot
 *    credential set, which runs the ISCT SSO in the WebView before landing on
 *    the page (otherwise the user sees the login form every time).
 *  - Web: the browser already carries the LMS session cookies (or will prompt
 *    for SSO once), so a plain new tab is enough.
 *
 * @param {string} url  absolute lms.s.isct.ac.jp URL
 */
export async function openLmsUrl(url) {
  if (!url) return;

  if (!isNative()) {
    window.open(url, '_blank', 'noopener');
    return;
  }

  try {
    const r = await fetch('/api/auth/credentials?type=isct', {
      headers: { 'x-app-platform': 'capacitor' },
    });
    if (!r.ok) throw new Error(`credentials ${r.status}`);
    const { userId, password, totpCode } = await r.json();
    const { openLmsPage } = await import('./plugins/portalWebView.js');
    await openLmsPage(url, { userId, password, totpCode });
  } catch (e) {
    // Without credentials the page still loads — the user just has to sign in
    // manually — so falling back beats doing nothing.
    console.error('[openLmsUrl]', e?.message);
    const { openInSystemBrowser } = await import('./openMaterial.js');
    await openInSystemBrowser(url);
  }
}
