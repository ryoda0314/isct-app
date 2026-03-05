import puppeteer from 'puppeteer';
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

function log(...args) {
  if (DEBUG) console.log('[SSO]', ...args);
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
export async function performSSOLogin({ userId, password, totpSecret }) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(SEL_TIMEOUT);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Navigate to LMS → triggers SSO redirect to ISCT Portal
    log('Navigating to LMS login...');
    await page.goto(LMS_LOGIN_URL, { waitUntil: 'networkidle2' });
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

    // Step 4: TOTP - input#totp exists in DOM but is hidden
    // Make it visible, fill the code, and submit the form directly
    const totpCode = generateTOTP(totpSecret);

    await page.evaluate((code) => {
      const totp = document.querySelector('input#totp');
      if (totp) {
        // Make the input and its parent containers visible
        totp.style.display = '';
        totp.style.visibility = 'visible';
        let el = totp.parentElement;
        while (el) {
          el.style.display = '';
          el.style.visibility = 'visible';
          el = el.parentElement;
          if (el === document.body) break;
        }
        totp.value = code;
      }
    }, totpCode);

    // Submit the form containing the totp input
    log('Submitting TOTP form...');
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
    while (!page.url().includes('lms.s.isct.ac.jp') && attempts < 5) {
      log(`Waiting for LMS redirect... attempt ${attempts + 1}`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => {});
      attempts++;
    }

    if (!page.url().includes('lms.s.isct.ac.jp')) {
      throw new Error('SSO did not redirect to LMS');
    }

    console.log('[SSO] Reached LMS, obtaining token...');

    // Step 6: Obtain wstoken via Moodle mobile app launch
    const passport = Date.now().toString();
    const launchUrl = `${LMS_MOBILE_LAUNCH}?service=${MOODLE_SERVICE}&passport=${passport}`;

    // Intercept the redirect that contains the token
    // The launch page redirects to moodlemobile:// scheme which causes ERR_ABORTED
    let tokenUrl = null;
    page.on('request', req => {
      const url = req.url();
      if (url.includes('token=') || url.includes('moodlemobile://')) {
        tokenUrl = url;
      }
    });

    // Catch ERR_ABORTED which is expected when redirecting to moodlemobile:// scheme
    try {
      await page.goto(launchUrl, { waitUntil: 'networkidle2' });
    } catch (e) {
      log(`Mobile launch navigation: ${e.message}`);
    }

    if (!tokenUrl) {
      tokenUrl = page.url();
    }

    // Try to extract token from the URL
    let wstoken = null;

    // Moodle mobile launch returns: moodlemobile://token=<base64>
    // Base64 decodes to: <siteid>:::<wstoken>:::<privatetoken>
    const b64Match = tokenUrl?.match(/token=([A-Za-z0-9+/=]+)/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
        const parts = decoded.split(':::');
        if (parts[1] && /^[a-f0-9]{32}$/.test(parts[1])) {
          wstoken = parts[1];
        }
      } catch (e) {
        log(`Token decode error: ${e.message}`);
      }
    }

    // Fallback: try to get token from page content
    if (!wstoken) {
      const content = await page.content();
      const contentMatch = content.match(/token['":\s]+([a-f0-9]{32})/);
      if (contentMatch) {
        wstoken = contentMatch[1];
      }
    }

    // Fallback 2: try login/token.php directly using cookies
    if (!wstoken) {
      log('Trying token.php fallback...');
      const tokenPageUrl = `${LMS_BASE}/login/token.php?username=${encodeURIComponent(userId)}&password=${encodeURIComponent(password)}&service=${MOODLE_SERVICE}`;
      await page.goto(tokenPageUrl, { waitUntil: 'networkidle2' });
      const tokenPageContent = await page.evaluate(() => document.body.textContent);
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
      c.name === 'MoodleSession' && c.domain.includes('isct')
    );

    await browser.close();
    browser = null;

    if (!wstoken) {
      throw new Error('Failed to obtain wstoken');
    }

    console.log('[SSO] Login successful');
    return { wstoken, moodleSession: moodleSession?.value || null };

  } catch (error) {
    console.error('[SSO] Login failed');
    throw new Error(`SSO login failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}