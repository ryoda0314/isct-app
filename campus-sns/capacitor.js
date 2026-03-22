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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

/**
 * Call once at app startup (e.g. in App.jsx).
 * Rewrites relative `/api/…` fetches to the remote backend when
 * running inside a Capacitor native shell.
 */
/**
 * Configure the native status bar for edge-to-edge display.
 * Makes the status bar transparent and overlays content beneath it.
 */
export async function configureStatusBar() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch {}
}

export function installFetchInterceptor() {
  if (!isNative() || !API_BASE) return;

  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = API_BASE + input;
      // Ensure cookies / credentials travel cross-origin
      init = { ...init, credentials: 'include' };
    } else if (input instanceof Request && new URL(input.url).pathname.startsWith('/api/')) {
      const url = API_BASE + new URL(input.url).pathname + new URL(input.url).search;
      input = new Request(url, input);
      init = { ...init, credentials: 'include' };
    }
    return _fetch(input, init);
  };
}
