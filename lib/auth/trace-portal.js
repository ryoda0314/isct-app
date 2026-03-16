/**
 * Portal Flow Tracer - headless:false でブラウザを開き、
 * ポータルログインの各段階をコンソールに出力する。
 *
 * 使い方: node lib/auth/trace-portal.js
 *
 * 目的:
 * - ポータルログインフォームのセレクタを特定する
 * - マトリクス認証画面の構造を確認する
 * - リダイレクトチェーンを把握する
 */
import puppeteer from 'puppeteer';

const PORTAL_LOGIN_URL =
  'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&GAREASONCODE=-1&GARESOURCEID=resourcelistID2&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList&Reason=-1&APPID=resourcelistID2&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

let stepNum = 0;

async function dumpPage(page, label) {
  stepNum++;
  const prefix = `step${stepNum}`;
  console.log(`\n=== ${label} (${prefix}) ===`);
  console.log(`[URL] ${page.url()}`);
  console.log(`[TITLE] ${await page.title()}`);

  // Dump all form inputs
  const inputs = await page.$$eval('input', els =>
    els.map(el => ({
      name: el.name,
      type: el.type,
      id: el.id,
      placeholder: el.placeholder,
      className: el.className,
      visible: el.offsetParent !== null
    }))
  );
  console.log(`\n[FORM INPUTS]`, JSON.stringify(inputs, null, 2));

  // Dump all selects
  const selects = await page.$$eval('select', els =>
    els.map(el => ({
      name: el.name,
      id: el.id,
      options: [...el.options].map(o => ({ value: o.value, text: o.text }))
    }))
  );
  if (selects.length) {
    console.log(`\n[SELECTS]`, JSON.stringify(selects, null, 2));
  }

  // Dump all buttons and submit inputs
  const buttons = await page.$$eval('button, input[type="submit"], input[type="button"]', els =>
    els.map(el => ({
      tag: el.tagName,
      type: el.type,
      text: el.textContent?.trim() || el.value,
      id: el.id,
      name: el.name,
      className: el.className
    }))
  );
  console.log(`\n[BUTTONS]`, JSON.stringify(buttons, null, 2));

  // Dump all forms
  const forms = await page.$$eval('form', els =>
    els.map(el => ({
      action: el.action,
      method: el.method,
      id: el.id,
      name: el.name
    }))
  );
  console.log(`\n[FORMS]`, JSON.stringify(forms, null, 2));

  // Dump labels (useful for matrix auth)
  const labels = await page.$$eval('label, td, th', els =>
    els
      .map(el => el.textContent?.trim())
      .filter(t => t && t.length < 100)
      .slice(0, 30)
  );
  console.log(`\n[LABELS/TEXT]`, JSON.stringify(labels, null, 2));

  // Take screenshot
  const ssPath = `data/trace-portal-${prefix}.png`;
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`\n[SCREENSHOT] ${ssPath} saved`);
}

async function trace() {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--start-maximized'],
    defaultViewport: null
  });

  const page = await browser.newPage();

  // Log all navigation events
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`[NAV] ${frame.url()}`);
    }
  });

  page.on('response', resp => {
    if (resp.status() >= 300 && resp.status() < 400) {
      console.log(`[REDIRECT ${resp.status()}] ${resp.url()} -> ${resp.headers()['location']}`);
    }
  });

  console.log(`\n=== Portal Login Flow Trace ===`);
  console.log(`Starting URL: ${PORTAL_LOGIN_URL}\n`);

  await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });

  await dumpPage(page, 'Login Page');

  console.log('\n=== Manual login required ===');
  console.log('Please login manually in the browser window.');
  console.log('After each step (password submit, matrix submit), the script');
  console.log('will automatically dump the new page structure.');
  console.log('Press Ctrl+C when done.\n');

  // Watch for navigation and dump each new page
  page.on('framenavigated', async frame => {
    if (frame === page.mainFrame()) {
      // Wait for content to settle
      await new Promise(r => setTimeout(r, 2000));
      try {
        await dumpPage(page, 'After Navigation');
      } catch (e) {
        console.log(`[DUMP ERROR] ${e.message}`);
      }
    }
  });

  // Keep running
  await new Promise(() => {});
}

trace().catch(err => {
  console.error('Trace failed:', err);
  process.exit(1);
});
