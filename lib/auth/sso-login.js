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

async function getBrowser(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        // Serverless: use @sparticuz/chromium
        const chromium = (await import('@sparticuz/chromium')).default;
        chromium.setHeadlessMode = true;
        chromium.setGraphicsMode = false;
        // Ensure binary extraction completes before launch
        const execPath = await chromium.executablePath();
        return await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: execPath,
          headless: chromium.headless,
        });
      }
      // Local: use system-installed Chrome
      const { executablePath } = await import('puppeteer');
      return await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      // ETXTBSY: Chromium binary is still being written by another invocation
      if (err.message.includes('ETXTBSY') && attempt < retries) {
        console.log(`[SSO] Browser launch ETXTBSY, retrying (${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      throw err;
    }
  }
}

let _ssoLogForce = false;
function log(...args) {
  if (DEBUG || _ssoLogForce) console.log('[SSO]', ...args);
}

/**
 * Perform SSO login through ISCT Portal → LMS and obtain a Moodle wstoken.
 *
 * Extic SSO flow (verified 2026-04-11 via trace-sso):
 *   1. Navigate to LMS login → redirect to Extic /auth/session
 *   2. Form#login: Enter identifier + password, form.submit()
 *      (NOTE: "Next" button triggers JS/WebAuthn — use form.submit() to bypass)
 *   3. → /auth/session/second_factor (2FA selector page)
 *   4. Click "#totp-form-selector" to select OTP authentication
 *   5. Form#totp-form: Enter TOTP code, form.submit()
 *   6. → SAML assertion → LMS redirect
 *   7. Obtain wstoken via Moodle mobile launch URL
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
    console.log('[SSO] Navigating to LMS login...');
    const t0 = Date.now();
    const inflight = new Map(); // url -> startMs
    page.on('request', req => {
      inflight.set(req.url(), Date.now());
      console.log(`[SSO][+${Date.now() - t0}ms] REQ ${req.resourceType()} ${req.method()} ${req.url().substring(0, 160)}`);
    });
    page.on('requestfinished', req => {
      const start = inflight.get(req.url());
      const dur = start ? Date.now() - start : '?';
      inflight.delete(req.url());
      console.log(`[SSO][+${Date.now() - t0}ms] FIN (${dur}ms) ${req.url().substring(0, 160)}`);
    });
    page.on('requestfailed', req => {
      inflight.delete(req.url());
      console.log(`[SSO][+${Date.now() - t0}ms] FAIL ${req.failure()?.errorText} ${req.url().substring(0, 160)}`);
    });
    page.on('response', resp => {
      console.log(`[SSO][+${Date.now() - t0}ms] RES ${resp.status()} ${resp.url().substring(0, 160)}`);
    });
    page.on('framenavigated', f => {
      if (f === page.mainFrame()) console.log(`[SSO][+${Date.now() - t0}ms] NAV ${f.url().substring(0, 160)}`);
    });
    // Periodic dump of in-flight requests so we can see what's hanging
    const stuckTimer = setInterval(() => {
      const now = Date.now();
      const pending = [...inflight.entries()]
        .filter(([, start]) => now - start > 2000)
        .map(([url, start]) => `  ${now - start}ms: ${url.substring(0, 160)}`);
      if (pending.length) console.log(`[SSO][+${now - t0}ms] STILL IN-FLIGHT (${pending.length}):\n${pending.join('\n')}`);
    }, 5000);

    try {
      await page.goto(tgtLoginUrl, { waitUntil: 'networkidle2' });
    } finally {
      clearInterval(stuckTimer);
    }
    console.log(`[SSO][+${Date.now() - t0}ms] Landed on: ${page.url()}`);

    // Step 2: Fill identifier + password on Form#login, then submit directly
    // NOTE: The "Next" button triggers JS that switches to WebAuthn/fido2 form.
    //       form.submit() bypasses JS and POSTs credentials to the server.
    await page.waitForSelector('input#identifier', { visible: true });
    await page.type('input#identifier', userId, { delay: 30 });
    await page.type('input#password', password, { delay: 30 });

    console.log('[SSO] Submitting login form (form.submit)...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('form#login');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 1000));
    console.log(`[SSO] After login submit, URL: ${page.url()}`);

    // Step 3: 2FA selector page (/auth/session/second_factor)
    // Click "OTP (App) Authentication" to reveal the TOTP form
    console.log('[SSO] Selecting OTP authentication...');
    const totpSelectorBtn = await page.$('button#totp-form-selector');
    if (totpSelectorBtn) {
      await totpSelectorBtn.click();
      await new Promise(r => setTimeout(r, 500));
      console.log('[SSO] OTP selector clicked');
    } else {
      console.log('[SSO] No #totp-form-selector found, TOTP form may already be visible');
    }

    // Step 4: Fill and submit TOTP
    const totpCode = generateTOTP(totpSecret);
    console.log('[SSO] Entering TOTP...');

    // Wait for TOTP input to be visible (after selector click reveals it)
    await page.waitForSelector('input#totp', { visible: true, timeout: SEL_TIMEOUT });
    await page.type('input#totp', totpCode, { delay: 30 });

    console.log('[SSO] Submitting TOTP (form.submit)...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('form#totp-form');
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

    if (!wstoken) {
      await browser.close();
      browser = null;
      throw new Error('Failed to obtain wstoken');
    }

    // Validate token and get site info via Puppeteer (server-side fetch gets 403)
    let siteInfo = null;
    try {
      const apiUrl = `${tgtBase}/webservice/rest/server.php`;
      siteInfo = await page.evaluate(async (url, token) => {
        const resp = await fetch(`${url}?wstoken=${token}&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`);
        const data = await resp.json();
        if (data.exception) return null;
        return { userid: data.userid, fullname: data.fullname || '' };
      }, apiUrl, wstoken);
      console.log('[SSO] Site info obtained via browser:', JSON.stringify(siteInfo));
    } catch (e) {
      console.log('[SSO] Site info fetch failed in browser:', e.message);
    }

    await browser.close();
    browser = null;

    console.log('[SSO] Login successful');
    return { wstoken, siteInfo, moodleSession: moodleSession?.value || null };

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