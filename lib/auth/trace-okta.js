/**
 * Okta Flow Tracer — headful ブラウザで Okta サインインの構造とネットワークを記録する。
 *
 * 使い方:
 *   npm run trace-okta
 *   （任意）別テナント/別ブックマークを見るとき:
 *     OKTA_TARGET_URL="https://xxx.okta.com/app/bookmark/xxxx/login" npm run trace-okta
 *
 * 動作モード: 完全マニュアル。
 *   - ブラウザが開いたら「アカウント本人」が手で ID / パスワード / MFA を入力する。
 *   - このツールは資格情報を一切受け取らない。ページ遷移とネットワークを観測して記録するだけ。
 *   - 記録時に password / passcode / answer / *token / cookie 等は自動マスクするので、
 *     出力ファイルに平文の秘密は残らない（構造・形だけが残る）。
 *
 * 目的（Okta 版の分岐を確定するため）:
 *   1. エンジン判定    … Classic(/api/v1/authn) か OIE(/idp/idx/*) か
 *   2. MFA の種類      … okta_verify(push/totp) / google_authenticator / sms / なし
 *   3. フォームセレクタ … username / password / submit の実際の name/id（React widget）
 *   4. 成功時の着地     … サインインドメインを抜けてブックマーク先へ着くまでのURL連鎖
 *
 * 出力: data/okta-trace/run-<timestamp>/
 *   - network.jsonl   … リクエスト/レスポンス(マスク済み)を1行ずつ
 *   - NN-<label>.png / .html … 各遷移のDOMスナップショット
 *   - okta-config.json … OktaUtil ウィジェット設定(マスク済み)＋エンジンヒント
 *   - REPORT.md       … 最後にまとめる判定サマリ（Ctrl+C で確定書き出し）
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_URL =
  process.env.OKTA_TARGET_URL ||
  'https://keio.okta.com/app/bookmark/0oa1r62pot1KTvsob1d8/login';

// ---- 出力ディレクトリ ----
const RUN_DIR = path.join(
  process.cwd(),
  'data',
  'okta-trace',
  `run-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
fs.mkdirSync(RUN_DIR, { recursive: true });
const NET_LOG = path.join(RUN_DIR, 'network.jsonl');

// ============================================================
//  秘密情報のマスキング（ディスクに平文を書かないため）
// ============================================================
// 完全に伏せるキー（値そのものが秘密）
const SECRET_KEYS = /^(password|passcode|answer|securityAnswer|oldPassword|newPassword|credentials|clientSecret)$/i;
// トークン系（存在と長さだけ残す。先頭数文字は突合用に許容）
const TOKEN_KEYS = /(token|stateHandle|sessionToken|stateToken|interactionHandle|interaction_code|access_token|id_token|refresh_token|authorization|cookie|secret|jwt|assertion|SAMLResponse|signature)/i;

function maskString(v) {
  return `[${v.length}ch:${v.slice(0, 6)}…]`;
}

function maskDeep(obj, depth = 0) {
  if (depth > 8) return '[…deep…]';
  if (Array.isArray(obj)) return obj.map((v) => maskDeep(v, depth + 1));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SECRET_KEYS.test(k)) out[k] = '[REDACTED]';
      else if (TOKEN_KEYS.test(k) && typeof v === 'string') out[k] = maskString(v);
      else out[k] = maskDeep(v, depth + 1);
    }
    return out;
  }
  return obj;
}

// URL のクエリに載る token/code/state 系をマスク
function maskUrl(u) {
  try {
    const url = new URL(u);
    for (const key of [...url.searchParams.keys()]) {
      if (TOKEN_KEYS.test(key) || /^(code|token|sessionToken|stateToken)$/i.test(key)) {
        const val = url.searchParams.get(key) || '';
        url.searchParams.set(key, maskString(val));
      }
    }
    return url.toString();
  } catch {
    return u;
  }
}

// リクエストボディ（JSON or form-encoded）をマスク
function maskBody(body, contentType = '') {
  if (!body) return null;
  // JSON
  if (/json/i.test(contentType) || /^[\s]*[{[]/.test(body)) {
    try {
      return maskDeep(JSON.parse(body));
    } catch {
      /* fallthrough */
    }
  }
  // form-encoded: password=..&passcode=..&answer=..
  let masked = body.replace(
    /((?:^|&)(?:password|passcode|answer|securityAnswer)=)[^&]*/gi,
    '$1[REDACTED]'
  );
  masked = masked.replace(
    /((?:^|&)(?:[\w.]*token|code|sessionToken|stateToken)=)([^&]*)/gi,
    (_, p, v) => `${p}[${v.length}ch]`
  );
  return masked.length > 2000 ? masked.slice(0, 2000) + '…' : masked;
}

// ============================================================
//  記録用の状態（最後の判定サマリに使う）
// ============================================================
const findings = {
  target: TARGET_URL,
  startedAt: new Date().toISOString(),
  sawAuthnV1: false, // Classic Engine の証拠
  sawIdx: false, // OIE の証拠
  authEndpoints: new Set(),
  factorTypes: new Set(), // MFA 種別
  authenticatorKeys: new Set(), // OIE の authenticator.key
  navChain: [], // mainframe の URL 遷移
  leftOktaAt: null, // サインインドメインを抜けた最初のURL
  oktaHost: null,
};

function appendNet(entry) {
  fs.appendFileSync(NET_LOG, JSON.stringify(entry) + '\n');
}

// レスポンス body から MFA 情報を拾う（Classic/OIE 両対応の best-effort）
function harvestFactors(json) {
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.factorType === 'string') findings.factorTypes.add(o.factorType);
    if (o.authenticator && typeof o.authenticator.key === 'string')
      findings.authenticatorKeys.add(o.authenticator.key);
    if (typeof o.key === 'string' && /verify|password|phone|email|security|google|okta/i.test(o.key))
      findings.authenticatorKeys.add(o.key);
    for (const v of Object.values(o)) walk(v);
  };
  walk(json);
}

// ============================================================
//  DOM スナップショット
// ============================================================
let stepNum = 0;

async function dumpPage(page, label) {
  stepNum++;
  const prefix = String(stepNum).padStart(2, '0');
  const url = page.url();
  console.log(`\n=== [${prefix}] ${label} ===`);
  console.log(`[URL]   ${maskUrl(url)}`);
  try {
    console.log(`[TITLE] ${await page.title()}`);
  } catch {}

  let dom;
  try {
    dom = await page.evaluate(() => {
      const vis = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
      const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
        name: el.name,
        id: el.id,
        type: el.type,
        autocomplete: el.getAttribute('autocomplete'),
        placeholder: el.placeholder,
        className: el.className?.slice(0, 80),
        visible: vis(el),
      }));
      const buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"], [role="button"]')
      ).map((el) => ({
        tag: el.tagName,
        type: el.type,
        id: el.id,
        text: (el.textContent || el.value || '').trim().slice(0, 60),
        className: el.className?.slice(0, 80),
        visible: vis(el),
        disabled: !!el.disabled,
      }));
      const forms = Array.from(document.querySelectorAll('form')).map((f) => ({
        id: f.id,
        name: f.name,
        action: f.action,
        method: f.method,
      }));
      // Okta widget 固有の目印
      const oktaText = Array.from(
        document.querySelectorAll(
          '.okta-form-title, .siebar, h1, h2, .okta-form-subtitle, [data-se="o-form-error-container"], .okta-form-infobox-error, .infobox-error'
        )
      )
        .map((e) => e.textContent?.trim())
        .filter(Boolean)
        .slice(0, 12);
      const widgetPresent = !!document.querySelector('#okta-sign-in, #okta-signin-widget, #signin-container, [data-se="auth-container"]');
      // ページ内の可視な選択肢（MFA選択画面の「Select」ボタンやオーセンティケータ名）
      const authOptions = Array.from(
        document.querySelectorAll('[data-se], .authenticator-label, .authenticator-row, .select-factor')
      )
        .map((e) => e.textContent?.trim())
        .filter((t) => t && t.length < 60)
        .slice(0, 20);
      return { inputs, buttons, forms, oktaText, widgetPresent, authOptions };
    });
  } catch (e) {
    console.log(`[DOM ERROR] ${e.message}`);
    return;
  }

  console.log(`[WIDGET] okta sign-in widget present: ${dom.widgetPresent}`);
  if (dom.oktaText.length) console.log(`[TEXT]   ${JSON.stringify(dom.oktaText)}`);
  if (dom.inputs.length) console.log(`[INPUTS] ${JSON.stringify(dom.inputs)}`);
  if (dom.buttons.length) console.log(`[BUTTONS]${JSON.stringify(dom.buttons)}`);
  if (dom.forms.length) console.log(`[FORMS]  ${JSON.stringify(dom.forms)}`);
  if (dom.authOptions.length) console.log(`[OPTS]   ${JSON.stringify(dom.authOptions)}`);

  // スクショ + HTML
  try {
    await page.screenshot({ path: path.join(RUN_DIR, `${prefix}-${label}.png`), fullPage: true });
    fs.writeFileSync(path.join(RUN_DIR, `${prefix}-${label}.html`), await page.content(), 'utf8');
  } catch (e) {
    console.log(`[SNAP FAIL] ${e.message}`);
  }
}

// slug 化（ファイル名用）
function slug(s) {
  return s.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
}

// ============================================================
//  メイン
// ============================================================
async function trace() {
  console.log('\n=== Okta Flow Trace ===');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Output: ${RUN_DIR}`);
  try {
    findings.oktaHost = new URL(TARGET_URL).host;
  } catch {}

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 30,
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  const page = (await browser.pages())[0] || (await browser.newPage());

  // ---- ネットワーク観測（interception はしない。ただ見るだけ）----
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    // 認証系だけ詳しく記録（静的アセットは URL のみ）
    const isAuth = /\/api\/v1\/authn|\/idp\/idx\/|\/oauth2\/|\/sso\/|\/login\/|sessionCookieRedirect/.test(url);
    if (/\/api\/v1\/authn/.test(url)) {
      findings.sawAuthnV1 = true;
      findings.authEndpoints.add(new URL(url).pathname);
    }
    if (/\/idp\/idx\//.test(url)) {
      findings.sawIdx = true;
      findings.authEndpoints.add(new URL(url).pathname);
    }
    const entry = { t: Date.now(), kind: 'req', method, url: maskUrl(url), restype: req.resourceType() };
    if (isAuth && (method === 'POST' || method === 'PUT')) {
      const ct = req.headers()['content-type'] || '';
      entry.body = maskBody(req.postData(), ct);
    }
    appendNet(entry);
    if (isAuth) console.log(`  [REQ] ${method} ${maskUrl(url)}`);
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    const status = resp.status();
    const isAuth = /\/api\/v1\/authn|\/idp\/idx\/|sessionCookieRedirect|\/oauth2\//.test(url);
    const entry = { t: Date.now(), kind: 'res', status, url: maskUrl(url) };
    const loc = resp.headers()['location'];
    if (loc) entry.location = maskUrl(loc);
    // 認証系 JSON のみ body を読む（HTML/静的は読まない）
    const ct = resp.headers()['content-type'] || '';
    if (isAuth && /json/i.test(ct)) {
      try {
        const raw = await resp.text();
        const json = JSON.parse(raw);
        harvestFactors(json);
        entry.body = maskDeep(json);
        if (json.status) entry.authStatus = json.status; // Classic: MFA_REQUIRED / SUCCESS 等
      } catch {}
    }
    if (isAuth || (status >= 300 && status < 400)) {
      appendNet(entry);
      console.log(`  [RES ${status}] ${maskUrl(url)}${loc ? ` -> ${maskUrl(loc)}` : ''}${entry.authStatus ? ` (status=${entry.authStatus})` : ''}`);
    }
  });

  // ---- 遷移ごとにスナップショット ----
  let settleTimer = null;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    findings.navChain.push({ t: Date.now(), url: maskUrl(url) });
    console.log(`[NAV] ${maskUrl(url)}`);
    // サインインドメインを抜けたら記録（=ブックマーク先へ到達）
    try {
      const host = new URL(url).host;
      if (findings.oktaHost && host && host !== findings.oktaHost && !url.startsWith('about:')) {
        if (!findings.leftOktaAt) {
          findings.leftOktaAt = maskUrl(url);
          console.log(`  [★] サインインドメインを抜けた（着地）: ${maskUrl(url)}`);
        }
      }
    } catch {}
    // 連続遷移が落ち着いてからダンプ
    clearTimeout(settleTimer);
    settleTimer = setTimeout(async () => {
      try {
        // OktaUtil 設定は最初のサインインページで拾う
        await captureOktaConfig(page);
        await dumpPage(page, `nav-${slug(safeHost(page.url()))}`);
      } catch (e) {
        console.log(`[DUMP ERR] ${e.message}`);
      }
    }, 1500);
  });

  // ---- 初期ロード ----
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' }).catch((e) => {
    console.log(`[GOTO WARN] ${e.message}`);
  });
  await ensureLoginForm(page);
  await captureOktaConfig(page);
  await dumpPage(page, 'landed');

  console.log('\n────────────────────────────────────────────────────');
  console.log(' マニュアルモード: ブラウザで「本人が」ログインしてください。');
  console.log(' - ID / パスワード / MFA を手入力');
  console.log(' - 各遷移で自動的に構造とネットワークを記録します');
  console.log(' - 完了したら（またはブックマーク先に着いたら）このターミナルで Ctrl+C');
  console.log('────────────────────────────────────────────────────\n');

  await new Promise(() => {}); // Ctrl+C まで待機
}

// サインイン欄が出るまで待つ。app-embed の中継画面で widget が描画されないことが
// あるので、未検出ならリロード→それでもダメなら組織のサインインページ(fromURI付き)へ。
const FORM_SEL =
  'input[name="identifier"], input[name="username"], input[type="password"], #okta-sign-in input';

async function waitForForm(page, ms) {
  try {
    await page.waitForSelector(FORM_SEL, { visible: true, timeout: ms });
    return true;
  } catch {
    return false;
  }
}

async function ensureLoginForm(page) {
  await new Promise((r) => setTimeout(r, 1500));
  if (await waitForForm(page, 8000)) {
    console.log('[FORM] サインイン欄を検出');
    return;
  }
  console.log('[FORM] 未検出 → リロードして再試行…');
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  if (await waitForForm(page, 8000)) {
    console.log('[FORM] リロード後に検出');
    return;
  }
  // フォールバック: 組織のサインインページを直接開くと widget が確実に描画される。
  // 認証後は fromURI（=元のブックマーク先）へ戻るので着地判定もそのまま効く。
  try {
    const origin = new URL(TARGET_URL).origin;
    const fallback = `${origin}/login/login.htm?fromURI=${encodeURIComponent(TARGET_URL)}`;
    console.log(`[FORM] フォールバック: ${fallback}`);
    await page.goto(fallback, { waitUntil: 'domcontentloaded' }).catch(() => {});
    if (await waitForForm(page, 10000)) {
      console.log('[FORM] フォールバックで検出');
      return;
    }
  } catch (e) {
    console.log(`[FORM] フォールバック失敗: ${e.message}`);
  }
  console.log('[FORM] まだ未検出。手動でリロード/操作してOK（遷移は記録されます）。');
}

let oktaConfigCaptured = false;
async function captureOktaConfig(page) {
  if (oktaConfigCaptured) return;
  let info;
  try {
    info = await page.evaluate(() => {
      const out = { hasOktaUtil: false };
      try {
        out.hasOktaUtil = typeof window.OktaUtil !== 'undefined';
        const cfg = (window.OktaUtil && window.OktaUtil.getSignInWidgetConfig
          ? window.OktaUtil.getSignInWidgetConfig()
          : null) || {};
        // エンジンヒント（値は伏せ、存在有無だけ）
        out.pipeline = cfg.pipeline || null; // 'idx'=OIE / 'v1'=Classic（新しめのwidgetにある）
        out.hasStateToken = !!cfg.stateToken; // OIE ブートストラップの目印
        out.hasInteractionHandle = !!cfg.interactionHandle;
        out.baseUrl = cfg.baseUrl || null;
        out.clientId = cfg.clientId || null;
        out.redirectUri = cfg.redirectUri || null;
        out.authScheme = cfg.authScheme || null;
        out.oktaVersion = (window.OktaUtil && window.OktaUtil.getRequestContext) ? 'has-request-context' : null;
        // 生 config はトークンを含むので Node 側でマスクして保存
        out._rawConfig = cfg;
      } catch (e) {
        out.err = e.message;
      }
      return out;
    });
  } catch {
    return;
  }
  if (!info || !info.hasOktaUtil) return;

  const raw = info._rawConfig;
  delete info._rawConfig;
  const payload = { ...info, config: maskDeep(raw) };
  fs.writeFileSync(path.join(RUN_DIR, 'okta-config.json'), JSON.stringify(payload, null, 2), 'utf8');
  oktaConfigCaptured = true;

  const engine =
    info.pipeline === 'idx' || info.hasStateToken || info.hasInteractionHandle
      ? 'OIE (Identity Engine)'
      : info.pipeline === 'v1'
      ? 'Classic Engine'
      : '不明（ネットワークで確定する）';
  console.log(`\n[OKTA CONFIG] pipeline=${info.pipeline} stateToken=${info.hasStateToken} → 推定エンジン: ${engine}`);
}

function safeHost(u) {
  try {
    return new URL(u).host + new URL(u).pathname;
  } catch {
    return 'page';
  }
}

// ============================================================
//  Ctrl+C で判定サマリを書き出して終了
// ============================================================
function writeReport() {
  const engine = findings.sawIdx
    ? 'OIE (Identity Engine) — /idp/idx/* を確認'
    : findings.sawAuthnV1
    ? 'Classic Engine — /api/v1/authn を確認'
    : '不明（認証リクエストを観測できず。ログイン前に停止した可能性）';

  const factors = [...findings.factorTypes];
  const authenticators = [...findings.authenticatorKeys];
  const mfaKnown = factors.length || authenticators.length;

  const recommend = findings.sawIdx
    ? [
        '→ OIE。DOM注入（WebView）方式を推奨。PortalPlugin に `keio` モードを追加し、',
        '  ISCT の inject 関数を Okta widget 用（React: native setter + input dispatch + 本物のボタン .click()）に差し替える。',
      ]
    : findings.sawAuthnV1
    ? [
        '→ Classic。API方式が最短。POST /api/v1/authn → sessionToken →',
        '  GET /login/sessionCookieRedirect?token=…&redirectUrl=<ブックマーク先> でセッション確立。',
        '  lib/auth/okta-login.js として sso-login.js の隣に実装できる。',
      ]
    : ['→ エンジン未確定。もう一度実行し、実際にログインを完了させて再取得。'];

  const md = `# Okta Trace Report

- Target: \`${findings.target}\`
- Started: ${findings.startedAt}
- Okta host: \`${findings.oktaHost}\`

## 1. エンジン判定
**${engine}**

- \`/api/v1/authn\` 観測: ${findings.sawAuthnV1 ? 'あり' : 'なし'}
- \`/idp/idx/*\` 観測: ${findings.sawIdx ? 'あり' : 'なし'}
- 認証エンドポイント: ${[...findings.authEndpoints].map((p) => `\`${p}\``).join(', ') || '(なし)'}

## 2. MFA
${mfaKnown ? '' : '- MFA 情報を検出せず（MFA無し／到達前に停止／pushで別経路 の可能性）\n'}${factors.length ? `- factorType: ${factors.map((f) => `\`${f}\``).join(', ')}\n` : ''}${authenticators.length ? `- authenticator: ${authenticators.map((a) => `\`${a}\``).join(', ')}\n` : ''}
## 3. 着地（成功判定に使う）
- サインインドメインを抜けた最初のURL: ${findings.leftOktaAt ? `\`${findings.leftOktaAt}\`` : '(未到達 — ログイン未完了で停止した可能性)'}

## 4. 遷移チェーン (mainframe)
${findings.navChain.map((n) => `- \`${n.url}\``).join('\n')}

## 5. 推奨実装パス
${recommend.join('\n')}

---
- フォームの実セレクタ / ボタン は \`NN-*.html\` と \`network.jsonl\` を参照。
- OktaUtil ウィジェット設定は \`okta-config.json\`（マスク済み）。
- ※ この出力は構造把握用。秘密はマスク済みだが、スクショにIDが写り得るので共有前に確認。
`;

  const p = path.join(RUN_DIR, 'REPORT.md');
  fs.writeFileSync(p, md, 'utf8');
  console.log(`\n\n=== 判定サマリ ===`);
  console.log(md);
  console.log(`\n[REPORT] ${p}`);
}

process.on('SIGINT', () => {
  console.log('\n\n(Ctrl+C) レポートを書き出します…');
  try {
    writeReport();
  } catch (e) {
    console.error('report failed:', e.message);
  }
  process.exit(0);
});

trace().catch((err) => {
  console.error('Trace failed:', err);
  try {
    writeReport();
  } catch {}
  process.exit(1);
});
