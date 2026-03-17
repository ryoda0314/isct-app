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

function toCookieHeader(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

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

  try {
    /* ════════════════════════════════════════════════
       MODE A: Proxy a specific URL (link click)
       ════════════════════════════════════════════════ */
    if (targetUrl) {
      const cookies = await ensurePortalCookies(session.loginId, creds);
      const res = await fetch(targetUrl, {
        headers: { 'Cookie': toCookieHeader(cookies), 'User-Agent': UA },
        redirect: 'follow',
      });

      const ct = res.headers.get('content-type') || '';

      // Non-HTML resources (images, CSS, JS) — pass through
      if (!ct.includes('text/html')) {
        const body = await res.arrayBuffer();
        return new NextResponse(body, {
          headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
        });
      }

      // HTML — add <base> tag and inject link interception
      let html = await res.text();
      const origin = new URL(targetUrl).origin;

      // Inject <base> for relative URLs (images, CSS)
      const baseTag = `<base href="${origin}/">`;
      html = html.replace(/<head[^>]*>/i, m => m + baseTag);

      // Inject viewport meta for mobile
      const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1">';
      html = html.replace(/<head[^>]*>/i, m => m + viewport);

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

      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    /* ════════════════════════════════════════════════
       MODE B: Initial load — login + extract sections
       ════════════════════════════════════════════════ */
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

      // Cache cookies for subsequent proxy requests
      const puppeteerCookies = await page.cookies();
      portalCookieCache.set(session.loginId, { cookies: puppeteerCookies, ts: Date.now() });

      // Extract structured data
      const data = await page.evaluate(() => {
        const sections = [];
        const body = document.body;
        if (!body) return { sections: [] };

        const allElements = Array.from(body.querySelectorAll('*'));
        let currentSection = null;

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
            const headerText = el.innerText?.trim() || text;
            if (!currentSection || currentSection.title !== headerText) {
              currentSection = { title: headerText, links: [] };
              sections.push(currentSection);
            }
            continue;
          }

          if (tag === 'A' && el.href && currentSection) {
            const label = el.innerText?.trim() || el.textContent?.trim();
            if (label && label.length > 1 && el.href !== '#' && !el.href.startsWith('javascript:')) {
              if (!currentSection.links.some(l => l.label === label)) {
                currentSection.links.push({ label, url: el.href });
              }
            }
          }
        }

        return { sections: sections.filter(s => s.links.length > 0) };
      });

      await browser.close();
      browser = null;

      console.log(`[Portal] Extracted ${data.sections.length} sections, cookies cached`);
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    } finally {
      if (browser) await browser.close();
    }
  } catch (err) {
    console.error('[Portal Page] Error:', err.message, err.stack);
    return NextResponse.json({ error: `Portal: ${err.message}` }, { status: 500 });
  }
}
