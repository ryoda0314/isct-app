/**
 * 医歯学系（旧 TMDU）図書館 OPAC の蔵書検索 — お茶の水 / 国府台。
 *
 * この OPAC は ufinity(NetCommons) + 富士通 WebOPAC の JS 駆動・セッション/トークン
 * 必須システムで、単純 fetch では検索結果を取得できない（空のモジュール枠しか返らない）。
 * そのためヘッドレスブラウザ(Puppeteer)で実際に画面を操作して結果を取得する。
 * 重いので「ユーザーがボタンを押した時だけ」呼ぶ前提（クライアント側で制御）＋10分キャッシュ。
 *
 * 取得フロー（全て 1 ブラウザセッション内）:
 *   1. 検索ページを開き input[name=words] に検索語 → Enter → 結果一覧が描画される
 *   2. 一覧から各書誌の {bibid, title, 著者/出版} を抽出（最大 LIST_MAX 件）
 *   3. 先頭の書誌をクリックして「詳細URL（op_param + #catdbl-<bibid>）」テンプレートを得る
 *   4. 上位 ENRICH 件は詳細URL(bibid 差し替え)へ並列 goto し、所蔵一覧から
 *      所蔵館(御茶ノ水/国府台) と請求記号をパース
 *   5. 残りは詳細URLリンクのみ（公式ページで所蔵確認）
 */

import { getBrowser } from './portal-session.js';

const SEARCH_PAGE = 'https://www01s.ufinity.jp/tmdu_lib/?page_id=13&lang=japanese';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const LIST_MAX = 20;   // 一覧で返す最大件数
const ENRICH = 6;      // 所蔵を詳細から取得する上位件数

const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 30;
if (!globalThis.__libMedCache) globalThis.__libMedCache = new Map();
const cache = globalThis.__libMedCache;

const sanitize = (s) => String(s || '').split('').filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; }).join('').trim().slice(0, 100);

// 御茶ノ水 / 湯島 → お茶の水、国府台 → 国府台
function normCampus(raw) {
  if (!raw) return null;
  if (/御茶ノ水|お茶の水|湯島/.test(raw)) return 'ochanomizu';
  if (/国府台/.test(raw)) return 'kohnodai';
  return null;
}

// ページ内で「所蔵一覧」セクション（〜書誌詳細）から所蔵館・配架・請求記号を読む（page.evaluate 用）
function evalHoldings() {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const i = t.indexOf('所蔵一覧');
  if (i < 0) return null;
  let seg = t.slice(i, i + 800);
  const bd = seg.indexOf('書誌詳細');
  if (bd > 0) seg = seg.slice(0, bd); // 書誌詳細以降（著者ヨミ等）を除外
  const cm = seg.match(/(御茶ノ水|国府台|湯島)\s+(\S+)/);
  if (!cm) return null;
  const campus = cm[1];
  const location = cm[2];
  const electronic = /電子/.test(seg);
  // 請求記号: NLM/LC風 (英字+数字, || 区切りあり)。電子資料は請求記号なし
  let call = null;
  if (!electronic) {
    const c = seg.match(/[A-Z]{1,3}[0-9][^\s|]*(?:\|\|[^\s|]+)*/);
    if (c) call = c[0].replace(/\|\|/g, ' ');
  }
  return { campus, location, electronic, call };
}

function bibFromList() {
  const cont = document.querySelector('[id^="search_page"]');
  if (!cont) return [];
  const links = [...cont.querySelectorAll('a[id^="link"]')].filter((a) => a.innerText.trim().length > 3);
  return links.map((a) => {
    const bib = (a.getAttribute('href') || '').replace('#catdbl-', '');
    const title = a.innerText.replace(/\s+/g, ' ').trim();
    // 著者/出版情報: タイトル直後の兄弟テキスト or 親コンテナのテキスト差分
    let info = '';
    let probe = a.closest('div,li,dd,td') || a.parentElement;
    let p = probe;
    for (let i = 0; i < 5 && p; i++) { p = p.nextElementSibling; if (p && p.innerText.trim()) { info = p.innerText.trim(); break; } }
    if (!info) { const c = a.closest('div,li') || a.parentElement; info = (c ? c.innerText : '').replace(a.innerText, '').trim(); }
    return { bib, title, info: info.replace(/\s+/g, ' ').slice(0, 160), linkId: a.id };
  }).filter((b) => b.bib);
}

// "著者. -- 版. -- 出版社, 2025." → { author, published, year }
function splitInfo(info) {
  if (!info) return { author: '', published: '', year: null };
  const parts = info.split(/\s*--\s*/);
  const author = (parts[0] || '').replace(/\.$/, '').trim();
  const published = parts.slice(1).join(' / ').replace(/\s*w\.?\s*$/, '').trim();
  const ym = info.match(/(\d{4})/g);
  return { author, published, year: ym ? ym[ym.length - 1] : null };
}

export async function searchMedCatalog(input = {}) {
  const q = sanitize(input.q);
  if (!q) return { total: 0, records: [] };

  const key = q;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) { cache.delete(key); cache.set(key, hit); return { ...hit.data, cached: true }; }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(40000);
    page.setDefaultTimeout(25000);
    await page.setUserAgent(UA);

    await page.goto(SEARCH_PAGE, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="words"]', { visible: true });
    await page.click('input[name="words"]');
    await page.type('input[name="words"]', q, { delay: 12 });
    await page.keyboard.press('Enter');
    // 結果一覧（書誌リンク）が出るまで待つ
    await page.waitForFunction(
      () => { const c = document.querySelector('[id^="search_page"]'); return c && c.querySelectorAll('a[id^="link"]').length > 0; },
      { timeout: 20000 },
    ).catch(() => {});

    const total = await page.evaluate(() => { const m = document.body.innerText.match(/全\s*([\d,]+)\s*件/) || document.body.innerText.match(/（全\s*([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : null; });
    let list = (await page.evaluate(bibFromList)).slice(0, LIST_MAX);

    const detailBase = 'https://www01s.ufinity.jp/tmdu_lib/index.php';
    let tmpl = null; // 詳細URLテンプレート（#catdbl-<bib> を差し替える）
    const holdings = {}; // bib -> {campus, call}

    if (list.length) {
      // 先頭をクリックして詳細URLテンプレートを取得 ＋ 先頭の所蔵
      try {
        await page.click('#' + list[0].linkId);
        await page.waitForFunction(() => /所蔵一覧/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
        const u = page.url();
        if (/#catdbl-/.test(u)) tmpl = (bib) => u.replace(/#catdbl-.*/, '#catdbl-' + bib);
        holdings[list[0].bib] = await page.evaluate(evalHoldings);
      } catch { /* ignore */ }

      // 上位 ENRICH 件の所蔵を並列取得（先頭以外）
      if (tmpl) {
        const targets = list.slice(1, ENRICH).filter((b) => b.bib);
        await Promise.all(targets.map(async (b) => {
          let p;
          try {
            p = await browser.newPage();
            await p.setUserAgent(UA);
            p.setDefaultNavigationTimeout(30000);
            await p.goto(tmpl(b.bib), { waitUntil: 'networkidle2' });
            await p.waitForFunction(() => /所蔵一覧/.test(document.body.innerText), { timeout: 10000 }).catch(() => {});
            holdings[b.bib] = await p.evaluate(evalHoldings);
          } catch { /* ignore */ } finally { if (p) await p.close().catch(() => {}); }
        }));
      }
    }

    const records = list.map((b) => {
      const { author, published, year } = splitInfo(b.info);
      const h = holdings[b.bib];
      const campus = h ? normCampus(h.campus) : undefined; // undefined = 未取得（リンクで確認）, null = 所蔵情報なし
      const detailUrl = tmpl ? tmpl(b.bib) : `${detailBase}?page_id=13&lang=japanese`;
      return {
        bibid: b.bib,
        title: b.title,
        author,
        published,
        year,
        detailUrl,
        holdings: h && campus ? { campus, callNumber: h.call || null, electronic: !!h.electronic } : (h === null ? null : undefined),
      };
    });

    const data = { total: total ?? records.length, records, enriched: Object.keys(holdings).length };
    cache.set(key, { ts: Date.now(), data });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return data;
  } catch (err) {
    return { error: true, message: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
