import { NextResponse } from 'next/server';

// M4: In-memory tiered rate limiter (fixed window)
// WARNING: In-memory rate limiting is ineffective on Vercel serverless.
// Each cold start creates a fresh Map, so attackers can bypass limits by
// waiting for instance recycling or hitting different edge functions.
// TODO: Migrate to Vercel KV, Upstash Redis, or Supabase-based rate limiting
// for production-grade protection. The login brute force protection in
// auth/login/route.js has the same limitation.
const hits = new Map();
const TIERS = {
  auth:   { window: 60_000, max: 10 },   // 認証系: 10 req/min
  token:  { window: 60_000, max: 20 },   // トークン取得: 20 req/min（10分キャッシュ前提。複数タブ/リロード/StrictModeでも詰まらない値）
  write:  { window: 60_000, max: 40 },   // 書き込み系: 40 req/min
  global: { window: 60_000, max: 120 },  // 全API: 120 req/min
};

// Periodic cleanup every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (now - v.s > TIERS[v.t]?.window ?? 60_000) hits.delete(k);
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip, tier) {
  const cfg = TIERS[tier];
  const key = `${ip}:${tier}`;
  const now = Date.now();
  let rec = hits.get(key);
  if (!rec || now - rec.s > cfg.window) {
    rec = { s: now, c: 0, t: tier };
    hits.set(key, rec);
  }
  rec.c++;
  return rec.c <= cfg.max;
}

function getTier(pathname, method) {
  if (pathname === '/api/auth/token' || pathname === '/api/auth/token/refresh') return 'token'; // トークン取得は厳しく制限
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return 'write';
  return null;
}

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');
  // Portal proxy pages are displayed inside a same-origin iframe
  const isPortalPage = pathname.startsWith('/api/portal/page') || pathname.startsWith('/api/portal/proxy');
  // /embed/* は機能紹介ページ(/features)内に同一オリジン限定で埋め込むデモ専用ルート。
  // frame-ancestors 'self' なので外部サイトからの clickjacking は不可。本体(/)の DENY は据え置き。
  const isFramablePage = isPortalPage || pathname.startsWith('/embed');

  // M4: Rate limit API endpoints (tiered)
  // 開発環境ではスキップ（ローカルは攻撃対象でなく、HMR/StrictMode二重実行/頻繁な
  // リロードで token 等の制限を即枯渇させて開発を妨げるため）。
  if (isApi && process.env.NODE_ENV !== 'development') {
    // H11: Prefer x-real-ip (set by Vercel/trusted proxy, not spoofable)
    const ip = request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || '127.0.0.1';
    // Check global limit first
    if (!checkRateLimit(ip, 'global')) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    // Check tier-specific limit (auth / write)
    const tier = getTier(pathname, request.method);
    if (tier && !checkRateLimit(ip, tier)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  // M3: CSRF — verify Origin header for mutating API requests
  // Allow Capacitor native origins (capacitor://localhost, https://localhost)
  const CAPACITOR_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
  if (isApi && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (!origin) {
      // Reject requests without Origin header to prevent CSRF via form submissions
      // or other mechanisms that may strip the Origin header.
      // Exception: allow same-origin requests without Origin (some browsers on same-site navigations)
      const secFetchSite = request.headers.get('sec-fetch-site');
      if (secFetchSite && secFetchSite !== 'same-origin') {
        return NextResponse.json({ error: 'Origin header required' }, { status: 403 });
      }
    } else if (!CAPACITOR_ORIGINS.includes(origin)) {
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

  // Generate nonce for CSP (allows Next.js inline scripts)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // M1: Content-Security-Policy with nonce for inline scripts
  const cspValue = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "img-src 'self' https: data: blob:",
    // 音楽機能: Supabase Storage の署名URLから音声を再生（media-src 未指定だと default-src にフォールバックしてブロックされる）
    "media-src 'self' blob: data: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://lms.s.isct.ac.jp https://api.open-meteo.com https://geocoding-api.open-meteo.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com https://server.arcgisonline.com https://tile.openstreetmap.org",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    isFramablePage ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Pass nonce + CSP to Next.js via request headers.
  // Setting the CSP on the *request* header is what makes Next.js (1) inject the
  // nonce into all its <script> tags and (2) render the route dynamically, so the
  // per-request nonce matches in production builds (static pages would otherwise
  // ship without a nonce and be blocked by 'strict-dynamic'). x-nonce is kept for
  // any Server Component that wants to read it directly.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspValue);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Add CORS headers for Capacitor native app
  if (isCapacitorOrigin && isApi) {
    res.headers.set('Access-Control-Allow-Origin', reqOrigin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // ユーザー固有データのキャッシュ防止（CDN/Edge で他人のレスポンスが配信されるのを防ぐ）
  if (isApi) {
    res.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.headers.set('Vary', 'Cookie');
  }

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  res.headers.set('X-Frame-Options', isFramablePage ? 'SAMEORIGIN' : 'DENY');

  // M2: HSTS
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  // M1: Content-Security-Policy with nonce (same value set on the request headers above)
  res.headers.set('Content-Security-Policy', cspValue);

  // L4: Removed deprecated X-XSS-Protection header

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons|favicon.ico).*)'],
};
