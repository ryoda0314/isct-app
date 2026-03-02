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
    console.log('[SSO] Navigating to LMS login...');
    console.log(`[SSO] Target URL: ${LMS_LOGIN_URL}`);
    await page.goto(LMS_LOGIN_URL, { waitUntil: 'networkidle2' });
    console.log(`[SSO] Landed on: ${page.url()}`);
    console.log(`[SSO] Page title: ${await page.title()}`);

    // Dump all inputs and buttons on the page for debugging
    const debugInputs = await page.$$eval('input', els =>
      els.map(el => ({ tag: 'input', name: el.name, type: el.type, id: el.id, placeholder: el.placeholder }))
    );
    console.log(`[SSO] Page inputs: ${JSON.stringify(debugInputs)}`);

    const debugButtons = await page.$$eval('button, input[type="submit"], a.btn, [role="button"]', els =>
      els.map(el => ({ tag: el.tagName, type: el.type, id: el.id, text: (el.textContent || '').trim().slice(0, 50) }))
    );
    console.log(`[SSO] Page buttons: ${JSON.stringify(debugButtons)}`);

    // Save screenshot for debugging
    try {
      await page.screenshot({ path: 'data/sso-debug-step1.png', fullPage: true });
      console.log('[SSO] Screenshot saved: data/sso-debug-step1.png');
    } catch (e) {
      console.log('[SSO] Screenshot failed:', e.message);
    }

    // Disable WebAuthn to prevent passkey dialog from blocking
    const cdp = await page.createCDPSession();
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: false, hasUserVerification: false }
    });
    console.log('[SSO] WebAuthn disabled (virtual authenticator)');

    // Step 2: Enter username and password, then submit the form directly
    console.log('[SSO] Waiting for login form...');
    await page.waitForSelector('input#identifier', { visible: true });
    await page.type('input#identifier', userId, { delay: 30 });
    console.log('[SSO] Username entered');

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
    console.log('[SSO] Password entered');

    // Submit the form containing identifier+password directly (bypasses WebAuthn JS)
    console.log('[SSO] Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('input#identifier')?.closest('form');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));
    console.log(`[SSO] After login submit, URL: ${page.url()}`);

    // Step 4: 2FA - Select "OTP (Email) Authentication" then enter code
    console.log('[SSO] 2FA method selection page...');

    try {
      await page.screenshot({ path: 'data/sso-debug-2fa-select.png', fullPage: true });
    } catch (e) {}

    // Step 4: TOTP - input#totp exists in DOM but is hidden
    // Make it visible, fill the code, and submit the form directly
    const totpCode = generateTOTP(totpSecret);
    console.log(`[SSO] Generated TOTP code: ${totpCode}`);

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
    console.log('[SSO] TOTP code set');

    // Submit the form containing the totp input
    console.log('[SSO] Submitting TOTP form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('input#totp')?.closest('form');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Step 5: Verify we reached LMS
    console.log(`[SSO] After 2FA, URL: ${page.url()}`);

    // Handle SAML assertion page — IdP returns a form that must auto-submit to SP
    if (page.url().includes('saml') || page.url().includes('assertion')) {
      console.log('[SSO] On SAML assertion page, submitting SAML form...');
      try {
        await page.screenshot({ path: 'data/sso-debug-saml.png', fullPage: true });
      } catch (e) {}
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {}),
        page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        })
      ]);
      await new Promise(r => setTimeout(r, 2000));
      console.log(`[SSO] After SAML submit, URL: ${page.url()}`);
    }

    // Wait for potential additional redirects
    let attempts = 0;
    while (!page.url().includes('lms.s.isct.ac.jp') && attempts < 5) {
      console.log(`[SSO] Waiting for LMS redirect... attempt ${attempts + 1}, URL: ${page.url()}`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => {});
      attempts++;
    }

    if (!page.url().includes('lms.s.isct.ac.jp')) {
      throw new Error(`SSO did not redirect to LMS. Current URL: ${page.url()}`);
    }

    console.log('[SSO] Successfully reached LMS');

    // Step 6: Obtain wstoken via Moodle mobile app launch
    const passport = Date.now().toString();
    const launchUrl = `${LMS_MOBILE_LAUNCH}?service=${MOODLE_SERVICE}&passport=${passport}`;

    console.log('[SSO] Requesting wstoken via mobile launch...');

    // Intercept the redirect that contains the token
    // The launch page redirects to moodlemobile:// scheme which causes ERR_ABORTED
    let tokenUrl = null;
    page.on('request', req => {
      const url = req.url();
      if (url.includes('token=') || url.includes('moodlemobile://')) {
        console.log(`[SSO] Captured token URL: ${url}`);
        tokenUrl = url;
      }
    });

    // Catch ERR_ABORTED which is expected when redirecting to moodlemobile:// scheme
    try {
      await page.goto(launchUrl, { waitUntil: 'networkidle2' });
    } catch (e) {
      console.log(`[SSO] Mobile launch navigation: ${e.message}`);
    }

    if (!tokenUrl) {
      tokenUrl = page.url();
    }
    console.log(`[SSO] Token URL: ${tokenUrl}`);

    // Try to extract token from the URL
    let wstoken = null;

    // Moodle mobile launch returns: moodlemobile://token=<base64>
    // Base64 decodes to: <wstoken>:::<privatetoken>
    const b64Match = tokenUrl?.match(/token=([A-Za-z0-9+/=]+)/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
        console.log(`[SSO] Decoded token: ${decoded}`);
        // Format: siteid:::token:::privatetoken
        const parts = decoded.split(':::');
        if (parts[1] && /^[a-f0-9]{32}$/.test(parts[1])) {
          wstoken = parts[1];
        }
      } catch (e) {
        console.log(`[SSO] Token decode error: ${e.message}`);
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
      console.log('[SSO] Mobile launch did not yield token, trying token.php...');
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
      throw new Error('Failed to obtain wstoken. MoodleSession: ' + (moodleSession ? 'obtained' : 'missing'));
    }

    console.log('[SSO] wstoken obtained successfully');
    return { wstoken, moodleSession: moodleSession?.value || null };

  } catch (error) {
    console.error('[SSO] Login failed:', error.message);
    throw new Error(`SSO login failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
