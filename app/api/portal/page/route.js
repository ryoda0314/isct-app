import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { performPortalLogin } from '../../../../lib/auth/portal-login.js';
import puppeteer from 'puppeteer-core';

export const maxDuration = 60;

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
    // Perform portal login and get cookies
    const { cookies } = await performPortalLogin({
      userId: portalUserId,
      password: portalPassword,
      matrix,
    });

    // Open a new browser with those cookies to capture the portal page
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set the authenticated cookies
    await page.setCookie(...cookies);

    // Navigate to the portal resource list
    await page.goto(
      'https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList',
      { waitUntil: 'networkidle2' }
    );

    // Capture the page HTML
    const html = await page.content();

    await browser.close();
    browser = null;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[Portal Page] Error:', err.message);
    return NextResponse.json({ error: 'Portal login failed' }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
