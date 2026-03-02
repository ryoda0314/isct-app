/**
 * SSO Flow Tracer - headless:false でブラウザを開き、
 * SSOリダイレクトの各段階をコンソールに出力する。
 *
 * 使い方: npm run trace-sso
 *
 * 目的:
 * - Exticログインフォームのセレクタを特定する
 * - リダイレクトチェーンを把握する
 * - TOTP入力画面の構造を確認する
 */
import puppeteer from 'puppeteer';
import { T2SCHOLA_LOGIN_URL } from '../config.js';

async function trace() {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
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

  console.log(`\n=== SSO Flow Trace ===`);
  console.log(`Starting URL: ${T2SCHOLA_LOGIN_URL}\n`);

  await page.goto(T2SCHOLA_LOGIN_URL, { waitUntil: 'networkidle2' });

  console.log(`\n[LANDED] ${page.url()}`);
  console.log(`[TITLE] ${await page.title()}`);

  // Dump all form inputs on the current page
  const inputs = await page.$$eval('input', els =>
    els.map(el => ({
      name: el.name,
      type: el.type,
      id: el.id,
      placeholder: el.placeholder,
      className: el.className
    }))
  );
  console.log('\n[FORM INPUTS]', JSON.stringify(inputs, null, 2));

  // Dump all buttons
  const buttons = await page.$$eval('button, input[type="submit"]', els =>
    els.map(el => ({
      tag: el.tagName,
      type: el.type,
      text: el.textContent?.trim(),
      id: el.id,
      className: el.className
    }))
  );
  console.log('\n[BUTTONS]', JSON.stringify(buttons, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'data/trace-step1.png', fullPage: true });
  console.log('\n[SCREENSHOT] data/trace-step1.png saved');

  console.log('\n=== Manual login required ===');
  console.log('Please login manually in the browser window.');
  console.log('The script will log each navigation step.');
  console.log('Press Ctrl+C when done.\n');

  // Keep running to observe manual login flow
  await new Promise(() => {});
}

trace().catch(err => {
  console.error('Trace failed:', err);
  process.exit(1);
});
