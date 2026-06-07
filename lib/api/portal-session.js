import puppeteer from 'puppeteer-core';

/**
 * Shared TiTech portal login + cookie cache infrastructure.
 *
 * Extracted from app/api/portal/page/route.js so multiple routes (portal page
 * proxy, 教務 facility reservations, etc.) can reuse the same Puppeteer login,
 * cookie cache, and SSRF allowlist without duplicating the matrix-auth flow.
 */

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// H5: SSRF protection — only allow portal-related domains
export const ALLOWED_HOSTS = [
  'portal.nap.gsic.titech.ac.jp',
  'portal.isct.ac.jp',
  'www.ocw.titech.ac.jp',
  'kyomu.gakumu.titech.ac.jp',
  'kyomu0.gakumu.titech.ac.jp',
];

export function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    return ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch { return false; }
}

export const PORTAL_LOGIN_URL =
  'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&GAREASONCODE=-1&GARESOURCEID=resourcelistID2&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList&Reason=-1&APPID=resourcelistID2&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

/* ── Per-user cache: cookies + sections (10 min TTL) ── */
if (!globalThis.__portalCache) globalThis.__portalCache = new Map();
export const portalCache = globalThis.__portalCache;
const CACHE_TTL = 10 * 60 * 1000;
const loginPromises = new Map();

export async function getBrowser() {
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

    try {
      await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });
      await page.waitForSelector('input[name="usr_name"]', { visible: true });
    } catch (e) {
      e.failedStep = 'connect';
      throw e;
    }
    await page.type('input[name="usr_name"]', portalUserId, { delay: 20 });
    await page.type('input[name="usr_password"]', portalPassword, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    try {
      await page.waitForSelector('input[name="message3"]', { visible: true });
    } catch (e) {
      const url = page.url();
      const stillOnLogin = url.includes('Login') || url.includes('userpass_key');
      e.failedStep = stillOnLogin ? 'password' : 'network';
      throw e;
    }
    const matrixLabels = await page.evaluate(() => {
      const labels = [];
      for (const cell of document.querySelectorAll('td, th')) {
        const t = cell.textContent?.trim();
        if (t && /^\[[A-J],\s*\d\]$/i.test(t)) labels.push(t);
      }
      return labels;
    });
    if (matrixLabels.length < 3) {
      const err = new Error('Matrix labels not found');
      err.failedStep = 'matrix';
      throw err;
    }

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
export async function ensurePortalData(loginId, creds) {
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
