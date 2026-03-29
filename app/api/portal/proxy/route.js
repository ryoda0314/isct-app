import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';

export const maxDuration = 30;

// H5: SSRF protection — only allow portal-related domains
const ALLOWED_HOSTS = [
  'portal.nap.gsic.titech.ac.jp',
  'portal.isct.ac.jp',
  'www.ocw.titech.ac.jp',
  'kyomu.gakumu.titech.ac.jp',
  'kyomu0.gakumu.titech.ac.jp',
];
function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    return ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch { return false; }
}

/* Re-use cookie cache from the page route */
const portalCache = (() => {
  // Access the same cache via a global variable
  if (!globalThis.__portalCache) globalThis.__portalCache = new Map();
  return globalThis.__portalCache;
})();

export async function GET(req) {
  const targetUrl = new URL(req.url).searchParams.get('url');
  if (!targetUrl) {
    return new NextResponse('Missing url', { status: 400 });
  }

  // H5: SSRF protection
  if (!isAllowedUrl(targetUrl)) {
    return new NextResponse('URL not allowed', { status: 403 });
  }

  // Auth check
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const session = cookie ? await verifySession(cookie) : null;
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Get cached cookies
  const cached = portalCache.get(session.loginId);
  if (!cached?.cookies) {
    return new NextResponse('Portal not authenticated. Open portal first.', { status: 403 });
  }

  try {
    // Build cookie header from cached Puppeteer cookies
    const cookieHeader = cached.cookies
      .filter(c => {
        try {
          const u = new URL(targetUrl);
          return u.hostname.endsWith(c.domain.replace(/^\./, ''));
        } catch { return true; }
      })
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    const res = await fetch(targetUrl, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin + '/',
      },
      redirect: 'follow',
    });

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[Portal Proxy]', err.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
