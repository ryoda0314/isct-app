import puppeteer from 'puppeteer-core';
import { generateTOTP } from './totp.js';
import {
  LMS_BASE,
  LMS_LOGIN_URL,
  LMS_MOBILE_LAUNCH,
  MOODLE_SERVICE
} from '../config.js';

const NAV_TIMEOUT = 30_000;
const SEL_TIMEOUT = 15_000;
const DEBUG = process.env.SSO_DEBUG === '1';

async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Serverless: use @sparticuz/chromium
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
  // Local: use system-installed Chrome
  const { executablePath } = await import('puppeteer');
  return puppeteer.launch({
    headless: 'new',
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

let _ssoLogForce = false;
function log(...args) {
  if (DEBUG || _ssoLogForce) console.log('[SSO]', ...args);
}

/**
 * Perform SSO login through ISCT Portal → LMS and obtain a Moodle wstoken.
 *
 * Flow:
 *   1. Navigate to LMS login → ISCT Portal SSO redirect
 *   2. Enter Science Tokyo ID (username)
 *   3. Enter password
 *   4. Enter TOTP code (2FA)
 *   5. SSO redirect back to LMS
 *   6. Obtain wstoken via Moodle mobile launch URL
 *
 * NOTE: Form selectors below are best-effort estimates based on ISCT Portal patterns.
 *       Run `npm run trace-sso` to verify and update selectors if login fails.
 */
export async function performSSOLogin({ userId, password, totpSecret, target }) {
  // Support custom target LMS (e.g. T2SCHOLA) — defaults to ISCT LMS
  const tgtLoginUrl = target?.loginUrl || LMS_LOGIN_URL;
  const tgtMobileLaunch = target?.mobileLaunch || LMS_MOBILE_LAUNCH;
  const tgtDomain = target?.domain || 'lms.s.isct.ac.jp';
  const tgtBase = target?.base || LMS_BASE;

  // Force logging for non-default targets (T2SCHOLA debug)
  if (target) _ssoLogForce = true;
  console.log(`[SSO] performSSOLogin target=${tgtDomain}, loginUrl=${tgtLoginUrl}`);

  let browser;
  try {
    browser = await getBrowser();
    log('Browser launched');

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(SEL_TIMEOUT);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Navigate to LMS → triggers SSO redirect to ISCT Portal
    log('Navigating to LMS login...');
    await page.goto(tgtLoginUrl, { waitUntil: 'networkidle2' });
    log(`Landed on: ${page.url()}`);

    // Disable WebAuthn to prevent passkey dialog from blocking
    const cdp = await page.createCDPSession();
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: false, hasUserVerification: false }
    });

    // Step 2: Enter username and password, then submit the form directly
    await page.waitForSelector('input#identifier', { visible: true });
    await page.type('input#identifier', userId, { delay: 30 });

    // Make password field visible and fill it
    await page.evaluate(() => {
      const pw = document.querySelector('input#password');
      if (pw) {
        pw.style.display = '';
        pw.style.visibility = 'visible';
        pw.removeAttribute('hidden');
        pw.closest('div[style*="display: none"], div[style*="display:none"], .hidden')
          ?.style && (pw.closest('div[style*="display"]').style.display = '');
      }
    });
    await page.type('input#password', password, { delay: 30 });

    // Submit the form containing identifier+password directly (bypasses WebAuthn JS)
    log('Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('input#identifier')?.closest('form');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));
    log(`After login submit, URL: ${page.url()}`);

    // Step 4: TOTP - wait for the input to appear after login page transition
    const totpCode = generateTOTP(totpSecret);
    log(`Waiting for TOTP input...`);

    // Wait for TOTP input to exist in DOM (may be hidden)
    await page.waitForSelector('input#totp', { timeout: SEL_TIMEOUT });

    // Make the input and its parent containers visible
    await page.evaluate(() => {
      const totp = document.querySelector('input#totp');
      if (totp) {
        totp.style.display = '';
        totp.style.visibility = 'visible';
        totp.removeAttribute('hidden');
        let el = totp.parentElement;
        while (el && el !== document.body) {
          el.style.display = '';
          el.style.visibility = 'visible';
          el = el.parentElement;
        }
      }
    });

    // Use page.type() to dispatch proper key events (not just .value)
    await page.type('input#totp', totpCode, { delay: 30 });
    log('TOTP entered, submitting...');

    // Submit the form containing the totp input
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('input#totp')?.closest('form');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Handle SAML assertion page — IdP returns a form that must auto-submit to SP
    if (page.url().includes('saml') || page.url().includes('assertion')) {
      log('On SAML assertion page, submitting...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {}),
        page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        })
      ]);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Wait for potential additional redirects
    let attempts = 0;
    while (!page.url().includes(tgtDomain) && attempts < 5) {
      log(`Waiting for LMS redirect... attempt ${attempts + 1}`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => {});
      attempts++;
    }

    if (!page.url().includes(tgtDomain)) {
      throw new Error(`SSO did not redirect to ${tgtDomain}`);
    }

    console.log('[SSO] Reached LMS, obtaining token...');
    console.log('[SSO] Current URL before token step:', page.url());

    // Step 6: Obtain wstoken via Moodle mobile app launch
    const passport = Date.now().toString();
    const launchUrl = `${tgtMobileLaunch}?service=${MOODLE_SERVICE}&passport=${passport}`;
    console.log('[SSO] Mobile launch URL:', launchUrl);

    // Intercept the redirect that contains the token
    // The launch page redirects to moodlemobile:// scheme which causes ERR_ABORTED
    let tokenUrl = null;
    page.on('request', req => {
      const url = req.url();
      console.log('[SSO] Request intercepted:', url.substring(0, 200));
      if (url.includes('token=') || url.includes('moodlemobile://')) {
        tokenUrl = url;
      }
    });

    // Catch ERR_ABORTED which is expected when redirecting to moodlemobile:// scheme
    try {
      await page.goto(launchUrl, { waitUntil: 'networkidle2' });
      console.log('[SSO] After mobile launch, URL:', page.url());
    } catch (e) {
      console.log('[SSO] Mobile launch navigation error:', e.message);
    }

    if (!tokenUrl) {
      tokenUrl = page.url();
      console.log('[SSO] No token in intercepted requests, using page URL:', tokenUrl?.substring(0, 200));
    } else {
      console.log('[SSO] Token URL intercepted:', tokenUrl.substring(0, 200));
    }

    // Try to extract token from the URL
    let wstoken = null;

    // Moodle mobile launch returns: moodlemobile://token=<base64>
    // Base64 decodes to: <siteid>:::<wstoken>:::<privatetoken>
    const b64Match = tokenUrl?.match(/token=([A-Za-z0-9+/=]+)/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
        console.log('[SSO] Token decoded, parts count:', decoded.split(':::').length);
        const parts = decoded.split(':::');
        if (parts[1] && /^[a-f0-9]{32}$/.test(parts[1])) {
          wstoken = parts[1];
        } else {
          console.log('[SSO] Token format mismatch, part[1]:', parts[1]?.substring(0, 10) || '(empty)');
        }
      } catch (e) {
        console.log('[SSO] Token decode error:', e.message);
      }
    } else {
      console.log('[SSO] No token= found in URL');
    }

    // Fallback: try to get token from page content
    if (!wstoken) {
      const content = await page.content();
      console.log('[SSO] Page content length:', content.length, '| snippet:', content.substring(0, 500).replace(/\s+/g, ' '));
      const contentMatch = content.match(/token['":\s]+([a-f0-9]{32})/);
      if (contentMatch) {
        wstoken = contentMatch[1];
      } else {
        console.log('[SSO] No token in page content');
      }
    }

    // Fallback 2: try login/token.php via POST (avoids credentials in URL)
    if (!wstoken) {
      console.log('[SSO] Trying token.php fallback (POST)...');
      const tokenPageContent = await page.evaluate(
        async (url, user, pass, svc) => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&service=${encodeURIComponent(svc)}`,
          });
          return resp.text();
        },
        `${tgtBase}/login/token.php`, userId, password, MOODLE_SERVICE
      );
      console.log('[SSO] token.php response:', tokenPageContent?.substring(0, 300));
      try {
        const tokenData = JSON.parse(tokenPageContent);
        if (tokenData.token) {
          wstoken = tokenData.token;
        }
      } catch {}
    }

    // Get MoodleSession cookie as additional fallback
    const cookies = await page.cookies();
    const moodleSession = cookies.find(c =>
      c.name === 'MoodleSession' && (c.domain.includes(tgtDomain) || c.domain.includes('isct'))
    );

    await browser.close();
    browser = null;

    if (!wstoken) {
      throw new Error('Failed to obtain wstoken');
    }

    console.log('[SSO] Login successful');
    return { wstoken, moodleSession: moodleSession?.value || null };

  } catch (error) {
    console.error(`[SSO] Login failed for ${tgtDomain}:`, error.message, error.stack);
    throw new Error(`SSO login failed (${tgtDomain}): ${error.message}`);
  } finally {
    if (target) _ssoLogForce = false;
    if (browser) {
      await browser.close();
    }
  }
}