import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import puppeteer from 'puppeteer-core';

export const maxDuration = 60;

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
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let creds;
  try {
    creds = await loadCredentials(session.loginId);
  } catch {
    return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
  }

  const { portalUserId, portalPassword, matrix } = creds;
  if (!portalUserId || !portalPassword || !matrix) {
    return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Login
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="usr_name"]', { visible: true });
    await page.type('input[name="usr_name"]', portalUserId, { delay: 20 });
    await page.type('input[name="usr_password"]', portalPassword, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    // Step 2: Matrix auth
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

    // Step 3: Extract structured data from ResourceList page
    const data = await page.evaluate(() => {
      const sections = [];
      // The portal page uses nested tables. Section headers are in larger font / bold.
      // Look for patterns: header elements or bold/large text followed by links.
      const body = document.body;
      if (!body) return { sections: [] };

      // Strategy: walk through all elements and identify section headers and links
      const allElements = Array.from(body.querySelectorAll('*'));
      let currentSection = null;

      for (const el of allElements) {
        const tag = el.tagName;
        const text = el.textContent?.trim();
        if (!text) continue;

        // Detect section headers: typically bold text not inside an anchor
        // Portal uses font tags with size or b/strong tags for headers
        const isBold = tag === 'B' || tag === 'STRONG' ||
          (tag === 'FONT' && (el.getAttribute('size') === '+1' || el.getAttribute('size') === '+2')) ||
          (tag === 'FONT' && el.querySelector('b'));
        const isHeader = isBold && !el.closest('a') && text.length > 2 && text.length < 50 &&
          !el.querySelector('a') && el.children.length <= 2;

        if (isHeader) {
          const headerText = el.innerText?.trim() || text;
          // Avoid duplicate sections
          if (!currentSection || currentSection.title !== headerText) {
            currentSection = { title: headerText, links: [] };
            sections.push(currentSection);
          }
          continue;
        }

        // Detect links
        if (tag === 'A' && el.href && currentSection) {
          const label = el.innerText?.trim() || el.textContent?.trim();
          if (label && label.length > 1 && el.href !== '#' && !el.href.startsWith('javascript:')) {
            // Avoid duplicates
            if (!currentSection.links.some(l => l.label === label)) {
              currentSection.links.push({ label, url: el.href });
            }
          }
        }
      }

      // Remove empty sections and clean up
      return {
        sections: sections.filter(s => s.links.length > 0),
      };
    });

    await browser.close();
    browser = null;

    console.log(`[Portal] Extracted ${data.sections.length} sections`);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[Portal Page] Error:', err.message);
    return NextResponse.json({ error: 'Portal login failed' }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
