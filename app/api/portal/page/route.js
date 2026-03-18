import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { performPortalLogin } from '../../../../lib/auth/portal-login.js';
import puppeteer from 'puppeteer-core';

export const maxDuration = 60;

/* ── In-memory portal cookie cache (per user, 10 min TTL) ── */
const portalCookieCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

async function ensurePortalCookies(loginId, creds) {
  const cached = portalCookieCache.get(loginId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.cookies;
  const { cookies } = await performPortalLogin({
    userId: creds.portalUserId,
    password: creds.portalPassword,
    matrix: creds.matrix,
  });
  portalCookieCache.set(loginId, { cookies, ts: Date.now() });
  return cookies;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PORTAL_TOP = 'https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  const { executablePath } = await import('puppeteer');
  return puppeteer.launch({
    headless: 'new',
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

function htmlError(msg) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}` +
    `.c{text-align:center;padding:24px}.err{font-size:15px;color:#f85149;margin:0 0 8px}.hint{font-size:12px;color:#8b949e}</style>` +
    `</head><body><div class="c"><p class="err">${msg}</p><p class="hint">戻るボタンで閉じてください</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) return htmlError('認証されていません');

  let creds;
  try { creds = await loadCredentials(session.loginId); }
  catch { return htmlError('認証情報が見つかりません'); }

  const { portalUserId, portalPassword, matrix } = creds;
  if (!portalUserId || !portalPassword || !matrix)
    return htmlError('ポータル認証情報が未設定です');

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const warmup = searchParams.get('warmup');

  try {
    /* ── Warmup: login + cache cookies only ── */
    if (warmup) {
      await ensurePortalCookies(session.loginId, creds);
      return NextResponse.json({ ok: true });
    }

    /* ── Proxy: fetch target URL or portal top page ── */
    const fetchUrl = targetUrl || PORTAL_TOP;
    const cookies = await ensurePortalCookies(session.loginId, creds);

    let browser;
    try {
      browser = await getBrowser();
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(15000);
      await page.setUserAgent(UA);

      await page.setCookie(...cookies);

      // Override window.open so SSO stays in same tab
      await page.evaluateOnNewDocument(() => {
        window.open = function(url) { if (url) window.location.href = url; return window; };
      });

      await page.goto(fetchUrl, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 1500));

      // Check if SSO opened a new tab
      const allPages = await browser.pages();
      let activePage = page;
      if (allPages.length > 1) {
        for (const p of allPages) {
          const u = p.url();
          if (u !== 'about:blank' && u !== page.url()) { activePage = p; break; }
        }
      }

      const finalUrl = activePage.url();
      const origin = new URL(finalUrl).origin;
      let html = await activePage.content();

      await browser.close();
      browser = null;

      // Inject <base>, viewport, mobile CSS
      const baseTag = `<base href="${origin}/">`;
      const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1">';
      const mobileCSS = `<style>
body{max-width:100vw!important;overflow-x:hidden!important;padding:8px!important;font-size:14px!important;word-break:break-word!important}
table{max-width:100%!important;width:100%!important;table-layout:fixed!important;border-collapse:collapse!important}
td,th{word-break:break-word!important;padding:4px!important}
img{max-width:100%!important;height:auto!important}
pre{white-space:pre-wrap!important;max-width:100%!important}
a{word-break:break-all!important}
</style>`;
      html = html.replace(/<head[^>]*>/i, m => m + baseTag + viewport + mobileCSS);

      // Inject JS: intercept link clicks → route through proxy
      const proxyScript = `<script>
document.addEventListener('click',function(e){
  var a=e.target.closest('a');
  if(!a||!a.href||a.href.indexOf('javascript:')===0)return;
  e.preventDefault();
  e.stopPropagation();
  window.location.href='/api/portal/page?url='+encodeURIComponent(a.href);
},true);
</script>`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', proxyScript + '</body>');
      } else {
        html += proxyScript;
      }

      console.log(`[Portal] Proxied ${fetchUrl}`);
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } finally {
      if (browser) await browser.close();
    }
  } catch (err) {
    console.error('[Portal Page] Error:', err.message, err.stack);
    return htmlError(`ポータル: ${err.message}`);
  }
}
