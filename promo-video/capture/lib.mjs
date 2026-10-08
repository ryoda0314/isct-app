// ver2 用：アプリの実画面をデモモード（#demo = スクショ用ペルソナ・認証/通信なし）で撮るための道具。
// 端末の「時刻」と「現在地」を差し替えられる。撮影は 390x770（ステータスバー 54px とホームインジケータ 20px を除いた iPhone の表示域）の3倍。
import puppeteer from 'puppeteer';

export const BASE = process.env.APP_URL || 'http://localhost:3123';
export const VW = 390;
export const VH = 770;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({ headless: 'new', args: ['--lang=ja-JP', '--font-render-hinting=none'] });
}

// view: localStorage.lastView で起動直後に開く画面。time: 端末の時刻（ISO）。geo: {latitude, longitude}
export async function openApp(browser, { view = 'home', time, geo, height = VH, dsf = 3, storage = {} } = {}) {
  const context = await browser.createBrowserContext();
  if (geo) await context.overridePermissions(BASE, ['geolocation']);
  const page = await context.newPage();
  await page.emulateTimezone('Asia/Tokyo');
  await page.setViewport({ width: VW, height, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  if (geo) await page.setGeolocation({ accuracy: 8, ...geo });
  await page.evaluateOnNewDocument((v, iso, extra) => {
    try {
      localStorage.setItem('lastView', v);
      localStorage.setItem('langPref', 'ja');
      localStorage.setItem('mapLocConsent', 'granted');
      for (const [k, val] of Object.entries(extra)) localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
    } catch {}
    if (iso) {
      // 時計だけずらす（タイマーやアニメーションは実時間のまま）
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
  await page.goto(`${BASE}/#demo`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await sleep(Number(process.env.BOOT_WAIT || 6500));
  await hideDevOverlay(page);
  return { page, context };
}

export async function hideDevOverlay(page) {
  await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-toast],[data-next-badge-root],[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important;visibility:hidden!important}' }).catch(() => {});
}

// 表示中で、テキストを含む最も内側のクリック可能要素を押す
export async function clickText(page, text, { exact = false } = {}) {
  return page.evaluate((t, ex) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const c = [...document.querySelectorAll('button,a,[role=button],div,span')].filter((e) => vis(e) && (ex ? (e.textContent || '').trim() === t : (e.textContent || '').trim().includes(t)));
    c.sort((a, b) => (a.textContent.trim() === t ? 0 : 1) - (b.textContent.trim() === t ? 0 : 1) || a.textContent.trim().length - b.textContent.trim().length);
    if (!c.length) return false;
    (c[0].closest('button,[role=button],a') || c[0]).click();
    return true;
  }, text, exact);
}

// いちばん大きいスクロール領域を y まで動かす
export async function scrollMain(page, y) {
  return page.evaluate((y) => {
    const els = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 40; });
    els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    if (els[0]) { els[0].scrollTop = y; return { top: els[0].scrollTop, max: els[0].scrollHeight - els[0].clientHeight }; }
    return null;
  }, y);
}

export async function shot(page, path) {
  await page.screenshot({ path });
  console.log('  saved', path.split(/[\/]/).pop());
}
