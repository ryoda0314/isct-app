/**
 * Capacitor integration utilities.
 *
 * When running as a native Capacitor app, API calls need to reach
 * the Vercel backend. This module patches global fetch so that
 * requests to "/api/..." are transparently redirected to the remote
 * server.  On the web the file is a no-op.
 */

export function isNative() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

/**
 * Clear all cookies in the native WebView.
 * Call this on logout to ensure session cookies are fully removed.
 * On web this is a no-op (the Set-Cookie header handles deletion).
 */
export async function clearNativeCookies() {
  if (!isNative()) return;
  try {
    const { CapacitorCookies } = await import('@capacitor/core');
    await CapacitorCookies.clearAllCookies();
    console.log('[Capacitor] Cookies cleared');
  } catch (e) {
    // Fallback: try clearing via document.cookie
    try {
      document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim();
        if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
      console.log('[Capacitor] Cookies cleared (fallback)');
    } catch {}
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

/**
 * Update the native status bar color to match the current theme.
 * Call this whenever the theme changes.
 *
 * @param {string} bg2 - The theme's bg2 color (header background)
 */
export async function updateStatusBarTheme(bg2) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: bg2 });
    // Use light icons on dark backgrounds, dark icons on light backgrounds
    const isDark = isColorDark(bg2);
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch {}
}

function isColorDark(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export function installFetchInterceptor() {
  if (!isNative() || !API_BASE) return;

  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = API_BASE + input;
      init = { ...init, credentials: 'include' };
    } else if (input instanceof Request && new URL(input.url).pathname.startsWith('/api/')) {
      const url = API_BASE + new URL(input.url).pathname + new URL(input.url).search;
      input = new Request(url, input);
      init = { ...init, credentials: 'include' };
    }
    return _fetch(input, init);
  };
}
