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
  // Allow Capacitor native origins (capacitor://localhost, https://localhost)
  const CAPACITOR_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
  if (isApi && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && !CAPACITOR_ORIGINS.includes(origin)) {
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

  // CORS: Allow Capacitor native app origins
  const reqOrigin = request.headers.get('origin');
  const isCapacitorOrigin = reqOrigin && CAPACITOR_ORIGINS.includes(reqOrigin);
  if (isCapacitorOrigin && isApi) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': reqOrigin,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
  }

  const res = NextResponse.next();

  // Add CORS headers for Capacitor native app
  if (isCapacitorOrigin && isApi) {
    res.headers.set('Access-Control-Allow-Origin', reqOrigin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // Portal proxy pages are displayed inside a same-origin iframe
  const isPortalPage = pathname.startsWith('/api/portal/page') || pathname.startsWith('/api/portal/proxy');
  res.headers.set('X-Frame-Options', isPortalPage ? 'SAMEORIGIN' : 'DENY');

  // M2: HSTS
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  // M1: Content-Security-Policy
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' https: data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://lms.s.isct.ac.jp https://api.open-meteo.com https://geocoding-api.open-meteo.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com https://server.arcgisonline.com https://tile.openstreetmap.org",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      isPortalPage ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
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
