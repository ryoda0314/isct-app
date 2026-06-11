/**
 * 医歯学系（お茶の水・国府台）図書館の月間開館カレンダーを Puppeteer で取得。
 *
 * ufinity(NetCommons) のカレンダーは月グリッドを JS で描画し、各日の開館時間は
 * 「セルの背景色」で符号化される（凡例: 色→時刻）。御茶ノ水/国府台はタブ切替。
 * 操作用 JS:
 *   calendarCls["_NNN"].opac_changeDispArea("L1"|"L2")   // 館切替（L1=御茶ノ水, L2=国府台）
 *   calendarCls["_NNN"].opac_changeCalendar("YYYYMM",null) // 月移動
 * 各セル td.calendar_date の背景色を凡例(色→"H:MM-H:MM"/閉館)で逆引きして開閉を得る。
 *
 * 重いので library-hours の12hキャッシュ更新時のみ実行（失敗時は今日/明日のみのフォールバック）。
 */

import { getBrowser } from './portal-session.js';

const CAL_PAGE = 'https://www01s.ufinity.jp/tmdu_lib/?page_id=16&lang=japanese';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const pad2 = (n) => String(n).padStart(2, '0');
const DOW = '日月火水木金土';

// page.evaluate 内：凡例(色→時刻)と月グリッドのセルを読む（表示中の館のみ）
function scrapeGridInPage() {
  const norm = (s) => (s || '').replace(/：/g, ':').replace(/[－―−〜～]/g, '-').replace(/\s+/g, '').trim();
  const isColor = (bg) => /^rgb\(/.test(bg) && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(bg) && bg !== 'rgb(255, 255, 255)';
  const visible = (el) => !!(el && el.offsetParent !== null);
  // 表示中の月グリッド（td.calendar_date を持つ・ネスト無し・可視のテーブル）
  const tb = [...document.querySelectorAll('table')].filter((t) => visible(t) && !t.querySelector('table') && [...t.querySelectorAll('td.calendar_date')].length >= 20)[0];
  if (!tb) return { colorMap: {}, days: [] };
  // 凡例は表示中グリッドと同じ館コンテナ内のものを使う（隠れた他館の凡例を拾わない）
  let container = tb;
  for (let i = 0; i < 6 && container.parentElement; i++) container = container.parentElement;
  const colorMap = {};
  for (const el of container.querySelectorAll('span,td,div,font,p,li')) {
    if (!visible(el)) continue;
    const t = norm(el.textContent || '');
    const m = t.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    const closed = t === '閉館';
    if (!m && !closed) continue;
    let bg = '';
    const prev = el.previousElementSibling;
    if (prev && isColor(getComputedStyle(prev).backgroundColor)) bg = getComputedStyle(prev).backgroundColor;
    if (!bg) { const p = el.parentElement; if (p) { for (const c of p.children) { if (c !== el && isColor(getComputedStyle(c).backgroundColor)) { bg = getComputedStyle(c).backgroundColor; break; } } } }
    if (!bg && isColor(getComputedStyle(el).backgroundColor)) bg = getComputedStyle(el).backgroundColor;
    if (!bg) continue;
    if (!colorMap[bg]) colorMap[bg] = closed ? { closed: true } : { open: m[1], close: m[2], closed: false };
  }
  const days = [...tb.querySelectorAll('td.calendar_date')].map((td) => {
    const dm = (td.innerText.match(/\d{1,2}/) || [])[0];
    return { day: dm ? Number(dm) : null, bg: getComputedStyle(td).backgroundColor, closedText: /臨時|閉館/.test(td.innerText) };
  });
  return { colorMap, days };
}

const hhmm = (s) => { const [h, m] = s.split(':'); return `${pad2(h)}:${m}`; };

/**
 * @param {string[]} months "YYYYMM" の配列（当月＋数ヶ月先）
 * @returns {{ochanomizu:Array,kohnodai:Array}|null}
 */
export async function scrapeTmduMonthGrids(months) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(40000);
    page.setDefaultTimeout(20000);
    await page.setUserAgent(UA);
    await page.goto(CAL_PAGE, { waitUntil: 'networkidle2' });
    // カレンダーウィジェット初期化待ち
    // 月グリッドのコントロール(タブ/月送り)の onclick から正しいインスタンスキーを取得
    // （複数の calendarCls インスタンスがあり、日次ウィジェットとは別物のため）
    await page.waitForFunction(
      () => [...document.querySelectorAll('a[onclick]')].some((x) => /opac_changeDispArea|opac_changeCalendar/.test(x.getAttribute('onclick') || '')),
      { timeout: 15000 },
    );
    const calKey = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[onclick]')].find((x) => /opac_changeDispArea|opac_changeCalendar/.test(x.getAttribute('onclick') || ''));
      const m = a && (a.getAttribute('onclick') || '').match(/calendarCls\[["']?([\w]+)["']?\]/);
      return m ? m[1] : null;
    });
    if (!calKey || !(await page.evaluate((k) => !!(window.calendarCls && window.calendarCls[k]), calKey))) throw new Error('calendar instance not found');

    const acc = { ochanomizu: {}, kohnodai: {} };
    for (const [area, campus] of [['L1', 'ochanomizu'], ['L2', 'kohnodai']]) {
      for (const ym of months) {
        await page.evaluate((k, a) => window.calendarCls[k].opac_changeDispArea(a), calKey, area);
        await page.evaluate((k, m) => window.calendarCls[k].opac_changeCalendar(m, null), calKey, ym);
        await new Promise((r) => setTimeout(r, 1500));
        const { colorMap, days } = await page.evaluate(scrapeGridInPage);
        const y = ym.slice(0, 4), mo = ym.slice(4, 6);
        for (const c of days) {
          if (!c.day) continue;
          const date = `${y}-${mo}-${pad2(c.day)}`;
          let rec = null;
          if (c.closedText) rec = { open: null, close: null, closed: true };
          else if (colorMap[c.bg]) { const h = colorMap[c.bg]; rec = h.closed ? { open: null, close: null, closed: true } : { open: hhmm(h.open), close: hhmm(h.close), closed: false }; }
          if (rec) acc[campus][date] = rec; // 後勝ち（同月再訪時も上書きで可）
        }
      }
    }
    const toArr = (obj) => Object.keys(obj).sort().map((date) => {
      const [yy, mm, dd] = date.split('-').map(Number);
      return { date, dow: DOW[new Date(yy, mm - 1, dd).getDay()], ...obj[date] };
    });
    const out = { ochanomizu: toArr(acc.ochanomizu), kohnodai: toArr(acc.kohnodai) };
    if (!out.ochanomizu.length && !out.kohnodai.length) return null;
    return out;
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
