/**
 * SSO Flow Tracer - ステップバイステップでExticログインを検証する
 *
 * 使い方:
 *   npm run trace-sso
 *   → ブラウザが開き、各ステップでページ状態をダンプ＆スクリーンショット保存
 *   → 自分のアカウントで .env.local に以下を設定:
 *      SSO_TEST_USER=xxxxx
 *      SSO_TEST_PASS=xxxxx
 *      SSO_TEST_TOTP=xxxxx  (TOTP secret)
 *
 *   設定がなければ手動ログインモードで起動（従来と同じ）
 */
import puppeteer from 'puppeteer';
import { generateTOTP } from './totp.js';
import { LMS_LOGIN_URL } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

// .env.local を手動で読み込む (dotenv 不要)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch {}

const USER = process.env.SSO_TEST_USER;
const PASS = process.env.SSO_TEST_PASS;
const TOTP_SECRET = process.env.SSO_TEST_TOTP;
const AUTO_MODE = !!(USER && PASS && TOTP_SECRET);

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function screenshot(page, name) {
  const file = path.join(DATA_DIR, `trace-${name}.png`);
  return page.screenshot({ path: file, fullPage: true })
    .then(() => console.log(`  [SCREENSHOT] ${file}`))
    .catch(e => console.log(`  [SCREENSHOT FAIL] ${e.message}`));
}

async function dumpPage(page, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  STEP: ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  URL:   ${page.url()}`);
  console.log(`  Title: ${await page.title()}`);

  // フォーム構造
  const formInfo = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    return forms.map((form, i) => ({
      index: i,
      action: form.action,
      method: form.method,
      id: form.id,
      inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
        tag: el.tagName, id: el.id, name: el.name, type: el.type,
        visible: el.offsetParent !== null,
        value: el.type === 'hidden' ? el.value.substring(0, 60) : '(omitted)',
      })),
      buttons: Array.from(form.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]')).map(el => ({
        tag: el.tagName, type: el.type, id: el.id,
        text: el.textContent?.trim().substring(0, 60),
        className: el.className?.substring(0, 80),
        visible: el.offsetParent !== null,
        disabled: el.disabled,
      })),
    }));
  });
  console.log(`  Forms: ${formInfo.length}`);
  for (const f of formInfo) {
    console.log(`\n  [Form #${f.index}] action=${f.action} method=${f.method} id="${f.id}"`);
    console.log(`    Inputs:`);
    for (const inp of f.inputs) {
      console.log(`      ${inp.tag} #${inp.id} name="${inp.name}" type=${inp.type} visible=${inp.visible}${inp.type === 'hidden' ? ` value="${inp.value}"` : ''}`);
    }
    console.log(`    Buttons:`);
    for (const btn of f.buttons) {
      console.log(`      ${btn.tag} #${btn.id} type=${btn.type} text="${btn.text}" visible=${btn.visible} disabled=${btn.disabled} class="${btn.className}"`);
    }
  }

  // エラーメッセージ
  const errors = await page.evaluate(() => {
    const els = document.querySelectorAll('.alert-danger, .alert-warning, .error, .invalid-feedback, [role="alert"], .field_with_errors');
    return Array.from(els).map(e => e.textContent?.trim().substring(0, 200));
  });
  if (errors.length) {
    console.log(`\n  [ERRORS ON PAGE]`);
    errors.forEach(e => console.log(`    - ${e}`));
  }

  // WebAuthn対応状況
  const webauthn = await page.evaluate(() => ({
    hasPublicKeyCredential: typeof window.PublicKeyCredential !== 'undefined',
    hasCredentials: typeof navigator.credentials !== 'undefined',
  }));
  console.log(`\n  WebAuthn: PublicKeyCredential=${webauthn.hasPublicKeyCredential}, navigator.credentials=${webauthn.hasCredentials}`);
}

async function trace() {
  console.log('\n=== SSO Flow Trace ===');
  console.log(`Mode: ${AUTO_MODE ? 'AUTO (credentials from env)' : 'MANUAL (login in browser)'}`);
  console.log(`Target: ${LMS_LOGIN_URL}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // ナビゲーションログ
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`  [NAV] ${frame.url()}`);
    }
  });

  // ------ Step 1: LMS → Extic SSO リダイレクト ------
  await page.goto(LMS_LOGIN_URL, { waitUntil: 'networkidle2' });
  await dumpPage(page, '1. Landed on SSO page');
  await screenshot(page, '01-landed');

  if (!AUTO_MODE) {
    console.log('\n=== Manual mode ===');
    console.log('Login manually in the browser. Press Ctrl+C when done.\n');
    await new Promise(() => {});
    return;
  }

  // ------ Step 2: identifier 入力 ------
  console.log('\n>>> Typing identifier...');
  await page.waitForSelector('input#identifier', { visible: true });
  await page.type('input#identifier', USER, { delay: 30 });
  await dumpPage(page, '2. After identifier input');
  await screenshot(page, '02-identifier');

  // ------ Step 3: password 入力 (同じページにあれば) ------
  const hasPw = await page.evaluate(() => !!document.querySelector('input#password'));
  if (hasPw) {
    console.log('\n>>> Password field found on same page, typing...');
    await page.evaluate(() => {
      const pw = document.querySelector('input#password');
      if (pw) {
        pw.style.display = '';
        pw.style.visibility = 'visible';
        pw.removeAttribute('hidden');
        let el = pw.parentElement;
        while (el && el !== document.body) {
          el.style.display = '';
          el.style.visibility = 'visible';
          el = el.parentElement;
        }
      }
    });
    await page.type('input#password', PASS, { delay: 30 });
  } else {
    console.log('\n>>> No password field yet (multi-step flow)');
  }
  await dumpPage(page, '3. After password input');
  await screenshot(page, '03-password');

  // ------ Step 4: フォーム送信 ------
  console.log('\n>>> Submitting form...');

  // 送信前のURL
  const urlBefore = page.url();

  // 方法A: ボタンクリック
  const clickResult = await page.evaluate(() => {
    const form = document.querySelector('input#identifier')?.closest('form');
    if (!form) return 'no-form';
    const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"])');
    if (btn) {
      btn.click();
      return `clicked: ${btn.tagName}#${btn.id} "${btn.textContent?.trim().substring(0, 40)}"`;
    }
    return 'no-button-found';
  });
  console.log(`  Click result: ${clickResult}`);

  // ナビゲーション待ち (短めに)
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {
    console.log('  (No navigation within 10s)');
  });
  await new Promise(r => setTimeout(r, 2000));

  const urlAfter = page.url();
  console.log(`  URL changed: ${urlBefore !== urlAfter} (${urlBefore} → ${urlAfter})`);

  await dumpPage(page, '4. After form submit (button click)');
  await screenshot(page, '04-after-submit');

  // ボタンクリックで変化なし → form.submit() を試す
  if (urlBefore === urlAfter) {
    console.log('\n>>> Button click had no effect. Trying form.submit()...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {
        console.log('  (No navigation from form.submit either)');
      }),
      page.evaluate(() => {
        const form = document.querySelector('input#identifier')?.closest('form');
        if (form) form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));

    console.log(`  URL after form.submit(): ${page.url()}`);
    await dumpPage(page, '4b. After form.submit()');
    await screenshot(page, '04b-after-form-submit');
  }

  // パスワードが別ページの場合
  if (!hasPw) {
    console.log('\n>>> Waiting for password field on new page...');
    try {
      await page.waitForSelector('input#password', { visible: true, timeout: 10_000 });
      await page.type('input#password', PASS, { delay: 30 });
      console.log('  Password entered on new page');

      // 再送信
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
        page.evaluate(() => {
          const form = document.querySelector('input#password')?.closest('form');
          if (!form) return;
          const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"])');
          if (btn) btn.click(); else form.submit();
        })
      ]);
      await new Promise(r => setTimeout(r, 2000));
      await dumpPage(page, '4c. After password submit');
      await screenshot(page, '04c-after-password');
    } catch {
      console.log('  Password field did not appear');
    }
  }

  // ------ Step 5: TOTP ------
  console.log('\n>>> Checking for TOTP...');
  const hasTotp = await page.evaluate(() => !!document.querySelector('input#totp'));
  console.log(`  input#totp exists: ${hasTotp}`);
  await dumpPage(page, '5. Before TOTP');
  await screenshot(page, '05-before-totp');

  if (hasTotp) {
    const code = generateTOTP(TOTP_SECRET);
    console.log(`\n>>> Entering TOTP: ${code}`);
    await page.evaluate(() => {
      const totp = document.querySelector('input#totp');
      if (totp) {
        totp.style.display = '';
        totp.style.visibility = 'visible';
        let el = totp.parentElement;
        while (el && el !== document.body) { el.style.display = ''; el.style.visibility = 'visible'; el = el.parentElement; }
      }
    });
    await page.type('input#totp', code, { delay: 30 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {}),
      page.evaluate(() => {
        const form = document.querySelector('input#totp')?.closest('form');
        if (!form) return;
        const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"])');
        if (btn) btn.click(); else form.submit();
      })
    ]);
    await new Promise(r => setTimeout(r, 2000));
    await dumpPage(page, '6. After TOTP submit');
    await screenshot(page, '06-after-totp');
  } else {
    console.log('\n  !!! input#totp NOT FOUND — this is the problem !!!');
    console.log('  Check screenshot and page dump above to understand what page we are on.');
  }

  console.log('\n\n=== Trace complete ===');
  console.log('Screenshots saved in data/trace-*.png');
  console.log('Browser will stay open. Press Ctrl+C to exit.\n');

  await new Promise(() => {});
}

trace().catch(err => {
  console.error('Trace failed:', err);
  process.exit(1);
});
