import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import puppeteer from 'puppeteer-core';

export const maxDuration = 60;

/* ── Per-user cache: cookies + sections (10 min TTL) ── */
const portalCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const loginPromises = new Map();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PORTAL_LOGIN_URL =
  'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&GAREASONCODE=-1&GARESOURCEID=resourcelistID2&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList&Reason=-1&APPID=resourcelistID2&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

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

function lookupMatrix(matrix, label) {
  const match = label.match(/\[?([A-J]),\s*(\d)\]?/i);
  if (!match) throw new Error(`Cannot parse matrix label: ${label}`);
  return matrix[match[1].toUpperCase()]?.[match[2]] || '';
}

/* ── Login + extract sections in a single Puppeteer session ── */
async function loginAndExtract({ portalUserId, portalPassword, matrix }) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
    await page.setUserAgent(UA);

    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="usr_name"]', { visible: true });
    await page.type('input[name="usr_name"]', portalUserId, { delay: 20 });
    await page.type('input[name="usr_password"]', portalPassword, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    await page.waitForSelector('input[name="message3"]', { visible: true });
    const matrixLabels = await page.evaluate(() => {
      const labels = [];
      for (const cell of document.querySelectorAll('td, th')) {
        const t = cell.textContent?.trim();
        if (t && /^\[[A-J],\s*\d\]$/i.test(t)) labels.push(t);
      }
      return labels;
    });
    if (matrixLabels.length < 3) throw new Error('Matrix labels not found');

    const inputNames = ['message3', 'message4', 'message5'];
    for (let i = 0; i < 3; i++) {
      await page.type(`input[name="${inputNames[i]}"]`, lookupMatrix(matrix, matrixLabels[i]), { delay: 20 });
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    // Extract cookies + sections from the resource list page
    const cookies = await page.cookies();
    const sections = await page.evaluate(() => {
      const secs = [];
      const body = document.body;
      if (!body) return secs;
      const allElements = Array.from(body.querySelectorAll('*'));
      let cur = null;
      for (const el of allElements) {
        const tag = el.tagName;
        const text = el.textContent?.trim();
        if (!text) continue;
        const isBold = tag === 'B' || tag === 'STRONG' ||
          (tag === 'FONT' && (el.getAttribute('size') === '+1' || el.getAttribute('size') === '+2')) ||
          (tag === 'FONT' && el.querySelector('b'));
        const isHeader = isBold && !el.closest('a') && text.length > 2 && text.length < 50 &&
          !el.querySelector('a') && el.children.length <= 2;
        if (isHeader) {
          const h = el.innerText?.trim() || text;
          if (!cur || cur.title !== h) { cur = { title: h, links: [] }; secs.push(cur); }
          continue;
        }
        if (tag === 'A' && el.href && cur) {
          const label = el.innerText?.trim() || el.textContent?.trim();
          if (label && label.length > 1 && el.href !== '#' && !el.href.startsWith('javascript:')) {
            if (!cur.links.some(l => l.label === label)) {
              cur.links.push({ label, url: el.href });
            }
          }
        }
      }
      return secs.filter(s => s.links.length > 0);
    });

    await browser.close();
    browser = null;
    console.log(`[Portal] Login OK, ${sections.length} sections extracted`);
    return { cookies, sections };
  } finally {
    if (browser) await browser.close();
  }
}

/* ── Deduplicated login: prevents concurrent Puppeteer sessions ── */
async function ensurePortalData(loginId, creds) {
  const cached = portalCache.get(loginId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  const existing = loginPromises.get(loginId);
  if (existing) return existing;

  const promise = loginAndExtract(creds).then(data => {
    const entry = { ...data, ts: Date.now() };
    portalCache.set(loginId, entry);
    loginPromises.delete(loginId);
    return entry;
  }).catch(err => {
    loginPromises.delete(loginId);
    throw err;
  });

  loginPromises.set(loginId, promise);
  return promise;
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
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let creds;
  try { creds = await loadCredentials(session.loginId); }
  catch { return NextResponse.json({ error: 'Credentials not found' }, { status: 400 }); }

  const { portalUserId, portalPassword, matrix } = creds;
  if (!portalUserId || !portalPassword || !matrix)
    return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const warmup = searchParams.get('warmup');

  try {
    /* ── Warmup: background login + section extraction ── */
    if (warmup) {
      await ensurePortalData(session.loginId, creds);
      return NextResponse.json({ ok: true });
    }

    /* ── Sections list (no url param) ── */
    if (!targetUrl) {
      const data = await ensurePortalData(session.loginId, creds);
      return NextResponse.json({ sections: data.sections }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    /* ── Proxy: fetch a specific URL as HTML for iframe ── */
    const data = await ensurePortalData(session.loginId, creds);
    let browser;
    try {
      browser = await getBrowser();
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(15000);
      await page.setUserAgent(UA);

      await page.setCookie(...data.cookies);

      await page.evaluateOnNewDocument(() => {
        window.open = function(url) { if (url) window.location.href = url; return window; };
      });

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 1500));

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

      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } finally {
      if (browser) await browser.close();
    }
  } catch (err) {
    console.error('[Portal Page] Error:', err.message, err.stack);
    return NextResponse.json({ error: `Portal: ${err.message}` }, { status: 500 });
  }
}
