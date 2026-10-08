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
// init: ページの読み込み前に実行する関数（撮影用のフックなど）
export async function openApp(browser, { view = 'home', time, geo, width = VW, height = VH, dsf = 3, mobile = true, storage = {}, init } = {}) {
  const context = await browser.createBrowserContext();
  if (geo) await context.overridePermissions(BASE, ['geolocation']);
  const page = await context.newPage();
  if (init) await page.evaluateOnNewDocument(init);
  await page.emulateTimezone('Asia/Tokyo');
  await page.setViewport({ width, height, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile });
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

// デモの課題データに配点がなく「undefined点」と出るので消す（撮影時だけ・アプリのデータは変えない）
export async function fixUndefinedPoints(page) {
  await page.evaluate(() => {
    const walk = (n) => {
      if (n.nodeType === 3) {
        if (n.textContent.includes('undefined')) n.textContent = n.textContent.replace(/undefined点\s*・?\s*/g, '').replace(/undefined/g, '');
      } else n.childNodes.forEach(walk);
    };
    walk(document.body);
  });
}

// 工大祭のデモ出店の【テスト】・TEST の印を外し、架空の団体名にする（動画では「出店はサンプル」と注記する）
export const FEST_ORGS = {
  A: '料理サークル', B: 'ロボット研究室', C: 'ティー同好会', D: '軽音部',
  E: '縁日サークル', F: 'イラスト研究会', G: 'スイーツ同好会', H: '学生相談ボランティア',
};
export async function cleanFestival(page, { wait = 300 } = {}) {
  await page.evaluate((orgs) => {
    const walk = (n) => {
      if (n.nodeType === 3) {
        let s = n.textContent;
        if (!/テスト|ダミー/.test(s)) return;
        s = s.replace(/【テスト】/g, '')
          .replace(/テスト団体([A-H])（[^）]*）/g, (_, k) => orgs[k])
          .replace(/テスト(?:団体|研究室)([A-H])/g, (_, k) => orgs[k])
          .replace(/※これはテスト用のダミーデータです。実在の出店ではありません。/g, '')
          .replace(/（テスト）/g, '');
        n.textContent = s;
      } else n.childNodes.forEach(walk);
    };
    walk(document.body);
    // 「あなたの申請」欄（出店の申請をした人にだけ出る。デモでは見送りの申請も入っている）は隠す
    for (const el of document.querySelectorAll('div')) {
      const first = el.firstElementChild;
      if (first && first.textContent.trim() === 'あなたの申請' && el.getBoundingClientRect().height < 500) el.style.display = 'none';
    }
    // ポスター画像（SVG）の TEST の帯を外す
    document.querySelectorAll('img').forEach((img) => {
      if (!img.src.startsWith('data:image/svg+xml')) return;
      const i = img.src.indexOf(',');
      let svg = decodeURIComponent(img.src.slice(i + 1));
      svg = svg.replace(/<rect x="490" y="108"[^>]*\/>\s*<text[^>]*>TEST<\/text>/, '');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }, FEST_ORGS);
  if (wait) await sleep(wait);
}

// 読み込み前に仕込む：MapLibre の地図が作られるたびに window.__maps に入れる
// （開発時は React の StrictMode で1回作って捨てるので、使うときは生きている地図を選ぶ）
export function hookMap() {
  let ml;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => ml,
    set: (v) => {
      ml = v;
      const on = v.Map.prototype.on;
      v.Map.prototype.on = function (...a) {
        window.__maps = window.__maps || [];
        if (!window.__maps.includes(this)) window.__maps.push(this);
        return on.apply(this, a);
      };
    },
  });
}
