// アプリの実際の動き（スクロール・タップ・画面の切り替え・3D地図のカメラ）を、1コマずつ時間を進めて撮る道具。
//
// timeweb（capture/vendor/timeweb.js・BSD-3-Clause）でページの時間を仮想にする：
// setTimeout・requestAnimationFrame・performance.now・Date・CSS のアニメーションとトランジションが、
// 実時間ではなく timeweb.goTo(ms) で進めた時間で動く。読み込み中は実時間に合わせて進め（startRealtimeSimulation）、
// 撮影に入ったら止めて 1/30 秒ずつ進めながら撮るので、重い場面でもコマ落ちしない。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, hideDevOverlay, sleep } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMEWEB = readFileSync(join(__dirname, 'vendor', 'timeweb.js'), 'utf8');
export const FPS = 30;

export async function openRecorder(browser, { view = 'home', time, geo, width = 390, height = 770, dsf = 2, mobile = true, storage = {}, init, boot = 7000 } = {}) {
  const context = await browser.createBrowserContext();
  if (geo) await context.overridePermissions(BASE, ['geolocation']);
  const page = await context.newPage();
  await page.emulateTimezone('Asia/Tokyo');
  await page.setViewport({ width, height, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile });
  if (geo) await page.setGeolocation({ accuracy: 8, ...geo });
  // 1) 起動時に開く画面・言語などと、端末の日付
  await page.evaluateOnNewDocument((v, iso, extra) => {
    try {
      localStorage.setItem('lastView', v);
      localStorage.setItem('langPref', 'ja');
      localStorage.setItem('mapLocConsent', 'granted');
      for (const [k, val] of Object.entries(extra)) localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
    } catch {}
    if (iso) {
      const RealDate = Date;
      const offset = new RealDate(iso).getTime() - RealDate.now();
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
        static now() { return RealDate.now() + offset; }
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      window.Date = FakeDate;
    }
  }, view, time || null, storage);
  // 2) 時間を仮想に（読み込み中は実時間に合わせて進める）
  await page.evaluateOnNewDocument(`${TIMEWEB}\n;window.timeweb.startRealtimeSimulation();`);
  // 3) 現在地：仮想時間の下ではブラウザの位置の取り直しが時間切れになるので、撮影のときだけ決まった位置をすぐ返す
  if (geo) {
    await page.evaluateOnNewDocument((g) => {
      const pos = () => ({ coords: { latitude: g.latitude, longitude: g.longitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
      let wid = 1;
      const geo = navigator.geolocation;
      geo.getCurrentPosition = (ok) => { setTimeout(() => ok(pos()), 40); };
      geo.watchPosition = (ok) => { setTimeout(() => ok(pos()), 40); return wid++; };
      geo.clearWatch = () => {};
    }, geo);
  }
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(`${BASE}/#demo`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await sleep(boot);
  await hideDevOverlay(page);
  return { page, context };
}

// 表示中で、テキストを含むいちばん内側の押せる要素の中心
export async function centerOf(page, text, { exact = false, within } = {}) {
  return page.evaluate((t, ex, within) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const root = within ? document.querySelector(within) || document : document;
    const c = [...root.querySelectorAll('button,a,[role=button],div,span,label')].filter((e) => vis(e) && (ex ? (e.textContent || '').trim() === t : (e.textContent || '').includes(t)));
    c.sort((a, b) => (a.textContent.trim() === t ? 0 : 1) - (b.textContent.trim() === t ? 0 : 1) || a.textContent.trim().length - b.textContent.trim().length);
    if (!c.length) return null;
    const el = c[0].closest('button,[role=button],a') || c[0];
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, text, exact, within || null);
}

// タップ（マウスのクリック）。押した位置を返す（動画の側でタップの印を出す）
export async function tap(page, target, opts) {
  const p = typeof target === 'string' ? await centerOf(page, target, opts) : target;
  if (!p) throw new Error(`タップする場所が見つかりません: ${target}`);
  await page.mouse.click(p.x, p.y);
  return { tap: [p.x, p.y] };
}

// いちばん大きいスクロール領域の位置
export async function scrollMainTo(page, y) {
  return page.evaluate((y) => {
    const els = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 40; });
    els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    if (els[0]) els[0].scrollTop = y;
    return els[0] ? els[0].scrollTop : null;
  }, y);
}

// なめらかなスクロール（iOS の慣性スクロールに近い、ゆっくり止まる動き）を from〜to フレームに割り付ける。
// ease = 'inout' はゆっくり動き出してゆっくり止まる（長い時間をかけて流すとき）
export const easeScroll = (a, b, y0, y1, ease = 'out') => {
  const out = {};
  for (let i = a; i <= b; i++) {
    const t = (i - a) / Math.max(1, b - a);
    const e = ease === 'inout' ? (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) : 1 - (1 - t) ** 3;
    out[i] = (page) => scrollMainTo(page, Math.round(y0 + (y1 - y0) * e)).then(() => null);
  }
  return out;
};

// 撮影：frames 枚を 30fps で撮る。actions: { [フレーム]: async (page) => 記録したいこと | null }
// 各フレームで「操作 → 時間を 1/30 秒進める → 描画を待つ → 撮る」。操作の記録（タップの位置など）を JSON に残す
export async function record(page, outDir, { frames, actions = {}, quality = 90, meta = {}, each }) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const t0 = await page.evaluate(() => { window.timeweb.stopRealtimeSimulation(); return performance.now(); });
  const log = [];
  const merged = {};
  for (const [k, fn] of Object.entries(actions)) (merged[k] = merged[k] || []).push(fn);
  for (let i = 0; i < frames; i++) {
    for (const fn of merged[i] || []) {
      const r = await fn(page);
      if (r) log.push({ f: i, ...r });
    }
    await page.evaluate((t) => window.timeweb.goTo(t), t0 + (i * 1000) / FPS);
    // React の更新（MessageChannel）や画像の読み込みを、実時間でひと呼吸待ってから撮る
    await page.evaluate(() => new Promise((r) => window.timeweb.realtime.requestAnimationFrame(() => window.timeweb.realtime.setTimeout(r, 0))));
    if (each) await each(page, i);
    await page.screenshot({ path: join(outDir, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality });
  }
  writeFileSync(join(outDir, 'log.json'), JSON.stringify({ frames, fps: FPS, ...meta, log }));
  return log;
}

export const merge = (...objs) => {
  const out = {};
  for (const o of objs) for (const [k, v] of Object.entries(o)) out[k] = out[k] ? [].concat(out[k], v) : v;
  // 同じフレームに複数の操作があれば順に実行する
  for (const k of Object.keys(out)) if (Array.isArray(out[k])) { const list = out[k]; out[k] = async (page) => { let last = null; for (const fn of list) { const r = await fn(page); if (r) last = r; } return last; }; }
  return out;
};

// いちばん手前のモーダル（z-index 10000 以上の固定表示）の中の、文字を含むボタンを押す
export const tapModal = (text, { nth = 0 } = {}) => async (page) => {
  const p = await page.evaluate((t, nth) => {
    const roots = [...document.querySelectorAll('div')].filter((d) => { const s = getComputedStyle(d); return s.position === 'fixed' && +s.zIndex >= 10000; });
    const root = roots[roots.length - 1] || document;
    const b = [...root.querySelectorAll('button')].filter((x) => (x.textContent || '').includes(t));
    b.sort((x, y) => x.textContent.length - y.textContent.length);
    const r = b[nth]?.getBoundingClientRect();
    return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  }, text, nth);
  if (!p) throw new Error(`モーダルの中に見つかりません: ${text}`);
  await page.mouse.click(p.x, p.y);
  return { tap: [p.x, p.y] };
};
// モーダルを閉じる（見出しの × ＝ モーダルの中の最初のボタン）
export const closeModal = async (page) => {
  const p = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('div')].filter((d) => { const s = getComputedStyle(d); return s.position === 'fixed' && +s.zIndex >= 10000; });
    const b = roots[roots.length - 1]?.querySelector('button');
    const r = b?.getBoundingClientRect();
    return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  });
  if (!p) throw new Error('モーダルの閉じるボタンが見つかりません');
  await page.mouse.click(p.x, p.y);
  return { tap: [p.x, p.y] };
};
// アプリの設定（App.jsx の useState）を、設定の画面を出さずに直接変える（撮影だけ。テーマや言語が拍ごとに切り替わる場面用）。
// App.jsx では themePref・accentPref・langPref・sitelenPref の useState がこの順に並んでいるので、
// いまのテーマ（localStorage の themePref）と同じ値を持ついちばん外側の useState を App のテーマとみなし、そこから数えて探す。
// アプリの切り替えはタップしたときと同じ（同じ state を変えるだけ）。log には { mark: 値 } を残す（映像の側で効果音を合わせる）
const APP_STATE = { themePref: 0, accentPref: 1, langPref: 2, sitelenPref: 3 };
export const setAppState = (name, value) => async (page) => {
  const ok = await page.evaluate((offset, value) => {
    const cur = localStorage.getItem('themePref') || 'tsubame';
    for (const el of document.body.querySelectorAll('*')) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (!key) continue;
      let theme = null;
      for (let fiber = el[key]; fiber; fiber = fiber.return) {
        for (let h = fiber.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
          if (h.queue && typeof h.queue.dispatch === 'function' && h.memoizedState === cur) theme = h;
        }
      }
      if (!theme) continue;
      let h = theme;
      for (let i = 0; i < offset; i++) h = h.next;
      h.queue.dispatch(value);
      return true;
    }
    return false;
  }, APP_STATE[name], value);
  if (!ok) throw new Error(`アプリの ${name} が見つかりません`);
  // React の更新は実時間で進むので、ひと呼吸待ってから次のコマへ
  await new Promise((r) => setTimeout(r, 120));
  return { mark: `${name}=${value}` };
};

// 画面の中のカード（角丸で背景のある箱）の位置を記録する（分解図で、画面から浮かせる用）
export const logCards = async (page) => {
  const cards = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect();
      if (r.width < 100 || r.height < 30 || r.height > 560 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(e);
      const rad = parseFloat(cs.borderTopLeftRadius) || 0;
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const hasBd = parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none';
      if (rad < 6 || !(hasBg || hasBd)) continue;
      const t = (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      if (t) out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), t });
    }
    return out;
  });
  return { cards };
};
