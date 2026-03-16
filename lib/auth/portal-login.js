import puppeteer from 'puppeteer-core';

const PORTAL_LOGIN_URL =
  'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&GAREASONCODE=-1&GARESOURCEID=resourcelistID2&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList&Reason=-1&APPID=resourcelistID2&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

const NAV_TIMEOUT = 30_000;
const SEL_TIMEOUT = 15_000;
const DEBUG = process.env.PORTAL_DEBUG === '1';

function log(...args) {
  if (DEBUG) console.log('[Portal]', ...args);
}

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

/**
 * Look up a matrix value by [Column, Row] label.
 * @param {Object} matrix - { A: { 1: 'G', 2: 'P', ... }, B: { ... }, ... }
 * @param {string} label - e.g. "[B,2]" or "[B, 2]"
 * @returns {string} the character at that position
 */
function lookupMatrix(matrix, label) {
  const match = label.match(/\[?([A-J]),\s*(\d)\]?/i);
  if (!match) throw new Error(`Cannot parse matrix label: ${label}`);
  const col = match[1].toUpperCase();
  const row = match[2];
  const value = matrix[col]?.[row];
  if (!value) throw new Error(`Matrix position [${col},${row}] not found`);
  return value;
}

/**
 * Perform portal login with username/password + matrix authentication.
 *
 * @param {Object} params
 * @param {string} params.userId - Portal account ID
 * @param {string} params.password - Portal password
 * @param {Object} params.matrix - Matrix card data: { A: { 1: 'G', ... }, ... }
 * @returns {Object} { cookies, success }
 */
export async function performPortalLogin({ userId, password, matrix }) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(SEL_TIMEOUT);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Navigate to portal login page
    log('Navigating to portal login...');
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });
    log(`Landed on: ${page.url()}`);

    // Step 2: Fill Account + Password
    await page.waitForSelector('input[name="usr_name"]', { visible: true });
    await page.type('input[name="usr_name"]', userId, { delay: 30 });
    await page.type('input[name="usr_password"]', password, { delay: 30 });
    log('Filled account and password');

    // Submit login form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }),
      page.click('input[name="OK"]'),
    ]);
    log(`After login submit: ${page.url()}`);

    // Step 3: Matrix Authentication
    // The matrix page has labels like [C,6], [J,2], [J,4] in td/th elements
    // and inputs named message3, message4, message5 (type="password")
    await page.waitForSelector('input[name="message3"]', { visible: true });

    // Read the matrix position labels
    const matrixLabels = await page.evaluate(() => {
      const labels = [];
      const cells = document.querySelectorAll('td, th');
      for (const cell of cells) {
        const text = cell.textContent?.trim();
        if (text && /^\[[A-J],\s*\d\]$/i.test(text)) {
          labels.push(text);
        }
      }
      return labels;
    });

    log('Matrix positions requested:', matrixLabels);

    if (matrixLabels.length < 3) {
      throw new Error(`Expected 3 matrix labels, found ${matrixLabels.length}`);
    }

    // Map labels to input fields: message3, message4, message5
    const inputNames = ['message3', 'message4', 'message5'];
    for (let i = 0; i < 3; i++) {
      const value = lookupMatrix(matrix, matrixLabels[i]);
      await page.type(`input[name="${inputNames[i]}"]`, value, { delay: 30 });
      log(`Matrix ${matrixLabels[i]} -> ${value}`);
    }

    // Submit matrix form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }),
      page.click('input[name="OK"]'),
    ]);
    log(`After matrix submit: ${page.url()}`);

    // Verify we reached the resource list
    const finalUrl = page.url();
    if (!finalUrl.includes('ResourceList')) {
      throw new Error(`Portal login may have failed. Final URL: ${finalUrl}`);
    }

    // Collect all cookies for authenticated session
    const cookies = await page.cookies();
    log(`Login successful. ${cookies.length} cookies obtained.`);

    await browser.close();
    browser = null;

    console.log('[Portal] Login successful');
    return { success: true, cookies };

  } catch (error) {
    console.error('[Portal] Login failed:', error.message);
    throw new Error(`Portal login failed: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}
