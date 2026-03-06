import { NextResponse } from 'next/server';

// M4: In-memory rate limiter (fixed window)
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 120;

// Periodic cleanup every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (now - v.s > WINDOW_MS) hits.delete(k);
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip) {
  const now = Date.now();
  let rec = hits.get(ip);
  if (!rec || now - rec.s > WINDOW_MS) {
    rec = { s: now, c: 0 };
    hits.set(ip, rec);
  }
  rec.c++;
  return rec.c <= MAX_HITS;
}

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');

  // M4: Rate limit API endpoints
  if (isApi) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  // M3: CSRF — verify Origin header for mutating API requests
  if (isApi && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const host = request.headers.get('host');
        if (originHost !== host) {
          return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
      }
    }
  }

  const res = NextResponse.next();

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // M2: HSTS
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  // M1: Content-Security-Policy
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://lms.s.isct.ac.jp",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // L4: Removed deprecated X-XSS-Protection header

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons|favicon.ico).*)'],
};
