/**
 * 東京科学大学 附属図書館 OPAC（蔵書検索）のサーバー側プロキシ。
 *
 * OPAC (https://topics.libra.titech.ac.jp, Drupal6 + XC モジュール) は CORS を
 * 返さないためクライアントから直接叩けない。ここでサーバー側から検索ページを
 * fetch し、結果 HTML を正規表現でパースする（cheerio 無し。library-hours.js と同方式）。
 *
 * フロー:
 *   1. GET /xc/search?keys=...&page=...&rows=... → 書誌一覧 HTML
 *      - 各レコード: <tr  class="result-row ...">（<tr の後スペース2個）
 *      - Drupal.settings.xc_search に token / multi_ncip_url / ncip_info が埋め込まれる
 *   2. 所蔵・貸出状況は非同期ロード（HTML 上は「所蔵情報: loading…」）。
 *      NCIP 一括 API を 1 回呼ぶ:
 *        GET multi_ncip_url?ncip_id&bib_id=<csv>&token&node_id=<csv>
 *        → JSON { "<bibid>": { availability:"<html>", count:N } }
 *      availability をタグ除去すると「貸出可 , 大岡山図書館B1F-一般図書, 411.3/B」。
 */

const OPAC_BASE = 'https://topics.libra.titech.ac.jp';
const SEARCH_URL = `${OPAC_BASE}/xc/search`;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
};

// 検索語は多様なので軽量メモリ LRU（クエリ単位・10分・最大50件）。
const SEARCH_TTL = 10 * 60 * 1000;
const SEARCH_MAX = 50;
if (!globalThis.__libSearchCache) globalThis.__libSearchCache = new Map();
const searchCache = globalThis.__libSearchCache;

const ALLOWED_ROWS = [10, 20, 50, 100];
const clampRows = (n) => (ALLOWED_ROWS.includes(Number(n)) ? Number(n) : 20);
// 制御文字のみ除去（空白・ハイフンは検索語として残す）。charCode で判定し、
// ソースに制御バイトを置かない。
const sanitize = (s) => String(s || '')
  .split('')
  .filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; })
  .join('')
  .trim()
  .slice(0, 100);
const stripTags = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/\s+/g, ' ').trim();

const FORMAT_KEYS = { Book: 'Book', Journal: 'Journal', eJournal: 'eJournal', eBook: 'eBook', Thesis: 'Thesis/Dissertation', AudioVisual: 'Audio Visual', Microform: 'Microform' };
const LOCATION_KEYS = { ookayama: 'Ookayama', suzukakedai: 'Suzukakedai' };
const JW_KEYS = { japanese: 'Japanese Books', foreign: 'Foreign Books' };

/** OPAC 検索 URL を組み立てる */
function buildSearchUrl(params) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('keys', params.q);
  if (params.title) sp.set('title', params.title);
  if (params.author) sp.set('auth', params.author);
  if (params.isbn) sp.set('isbn', params.isbn);
  if (params.publisher) sp.set('pub', params.publisher);
  if (params.yearFrom) sp.set('pubYearFrom', params.yearFrom);
  if (params.yearTo) sp.set('pubYearTo', params.yearTo);
  for (const f of params.formats || []) if (FORMAT_KEYS[f]) sp.append(`format[${FORMAT_KEYS[f]}]`, FORMAT_KEYS[f]);
  for (const l of params.locations || []) if (LOCATION_KEYS[l]) sp.append(`location[${LOCATION_KEYS[l]}]`, LOCATION_KEYS[l]);
  for (const j of params.japaneseWestern || []) if (JW_KEYS[j]) sp.append(`japaneseWestern[${JW_KEYS[j]}]`, JW_KEYS[j]);
  sp.set('page', String(params.page ?? 0));
  sp.set('rows', String(params.rows ?? 20));
  return `${SEARCH_URL}?${sp.toString()}`;
}

/** 書誌一覧 HTML から各レコードと NCIP 設定をパース */
function parseSearchHtml(html) {
  // 検索結果: <span class="total">2464</span> 件
  const totalM = html.match(/検索結果[\s\S]{0,40}?class="total">\s*([\d,]+)/)
    || html.match(/検索結果[:：]?\s*([\d,]+)\s*件/);
  const total = totalM ? Number(totalM[1].replace(/,/g, '')) : null;

  const records = [];
  // <tr の後にスペースが複数入る点に注意（\s+）
  for (const row of html.split(/<tr\s+class="result-row/).slice(1)) {
    const bibid = (row.match(/recordID\/catalog\.bib\/([A-Za-z0-9]+)/) || [])[1];
    if (!bibid) continue;
    const type = stripTags((row.match(/result-key"><p>([^<]*)/) || [])[1]);
    let title = stripTags((row.match(/xc-title[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    title = title.replace(/^\d+\.\s*/, ''); // 先頭の連番を除去
    const author = stripTags((row.match(/xc-creator">([\s\S]*?)<\/div>/) || [])[1]);
    let cover = (row.match(/spCovImg[\s\S]*?<img src="([^"]+)"/) || [])[1] || null;
    if (cover) cover = cover.replace(/&amp;/g, '&');
    if (cover && /blank_cover/.test(cover)) cover = null;
    const published = stripTags((row.match(/xc-published">([\s\S]*?)<\/tr>/) || [])[1]).replace(/^出版情報[:：]?\s*/, '');
    records.push({
      bibid,
      type,
      title,
      author,
      cover,
      published,
      detailUrl: `${OPAC_BASE}/recordID/catalog.bib/${bibid}`,
      holdings: null,
    });
  }

  // Drupal.settings.xc_search（コロン後スペース有り）
  const token = (html.match(/"token":\s*"([^"]+)"/) || [])[1] || null;
  let multiNcipUrl = (html.match(/"multi_ncip_url":\s*"([^"]+)"/) || [])[1] || null;
  if (multiNcipUrl) { try { multiNcipUrl = JSON.parse(`"${multiNcipUrl}"`); } catch { /* keep raw */ } }
  let ncipInfo = null;
  const niStr = (html.match(/"ncip_info":\s*(\{[\s\S]*?\})\s*,\s*"[a-z_]+":/) || [])[1];
  if (niStr) { try { ncipInfo = JSON.parse(niStr); } catch { ncipInfo = null; } }

  return { total, records, token, multiNcipUrl, ncipInfo };
}

/**
 * NCIP の availability テキストを構造化。
 * 形式は可変: 「貸出可 , 場所, 請求記号」/「貸出中 , 巻号, 場所, 請求記号」など。
 *  - status   = 先頭（貸出可 / 貸出中 …）
 *  - location = 「図書館/室/書庫/閲覧/集密」を含む部分
 *  - volume   = status と location の間（巻号 例「下」）
 *  - callNumber = 末尾（請求記号）
 */
function parseAvailability(availHtml, count) {
  const text = stripTags(availHtml);
  if (!text || /not\s*available/i.test(text)) return { status: null, location: null, volume: null, callNumber: null, count: count ?? 0, raw: text };
  const parts = text.split(/\s*[,，]\s*/).map((s) => s.trim()).filter(Boolean);
  const status = parts[0] || null;
  let locIdx = parts.findIndex((p, i) => i > 0 && /図書館|室|書庫|分館|閲覧|集密|資料/.test(p));
  if (locIdx < 0) locIdx = parts.length > 1 ? 1 : -1;
  const location = locIdx >= 0 ? parts[locIdx] : null;
  const callNumber = (locIdx >= 0 && parts.length - 1 > locIdx) ? parts[parts.length - 1] : null;
  const volume = locIdx > 1 ? parts.slice(1, locIdx).join(' ') : null;
  return { status, location, volume, callNumber, count: count ?? null, raw: text };
}

/** NCIP 一括取得で全レコードの所蔵を埋める（失敗しても致命的にしない） */
async function enrichHoldings(parsed) {
  const { records, token, multiNcipUrl, ncipInfo } = parsed;
  if (!token || !multiNcipUrl || !ncipInfo) return;
  try {
    const provider = Object.keys(ncipInfo)[0];
    if (!provider) return;
    const pairs = ncipInfo[provider].flatMap((o) => Object.entries(o)); // [ [node_id, [bibid]], ... ]
    if (!pairs.length) return;
    const q = new URLSearchParams({
      ncip_id: provider,
      bib_id: pairs.map((p) => p[1][0]).join(','),
      token,
      node_id: pairs.map((p) => p[0]).join(','),
    });
    const res = await fetch(`${multiNcipUrl}?${q.toString()}`, {
      headers: { ...FETCH_HEADERS, 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) return;
    const data = JSON.parse(await res.text()); // { bibid: { availability, count } }
    const byBib = new Map(records.map((r) => [r.bibid, r]));
    for (const [bibid, info] of Object.entries(data)) {
      const rec = byBib.get(bibid);
      if (rec) rec.holdings = parseAvailability(info?.availability, info?.count);
    }
  } catch {
    // 所蔵欠損のまま続行
  }
}

/**
 * OPAC 蔵書検索。検索語が無ければ空結果。10分メモリキャッシュ。
 * 返り値: { total, page, rows, hasMore, records:[...] } / 失敗時 { error:true }
 */
export async function searchLibraryCatalog(input = {}) {
  const params = {
    q: sanitize(input.q),
    title: sanitize(input.title),
    author: sanitize(input.author),
    isbn: sanitize(input.isbn).replace(/[^0-9Xx-]/g, ''),
    publisher: sanitize(input.publisher),
    yearFrom: String(input.yearFrom || '').replace(/\D/g, '').slice(0, 4),
    yearTo: String(input.yearTo || '').replace(/\D/g, '').slice(0, 4),
    formats: Array.isArray(input.formats) ? input.formats : [],
    locations: Array.isArray(input.locations) ? input.locations : [],
    japaneseWestern: Array.isArray(input.japaneseWestern) ? input.japaneseWestern : [],
    page: Math.max(0, Number(input.page) || 0),
    rows: clampRows(input.rows),
  };

  const hasQuery = params.q || params.title || params.author || params.isbn || params.publisher;
  if (!hasQuery) return { total: 0, page: params.page, rows: params.rows, hasMore: false, records: [] };

  const cacheKey = JSON.stringify(params);
  const hit = searchCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < SEARCH_TTL) {
    searchCache.delete(cacheKey); searchCache.set(cacheKey, hit); // LRU touch
    return { ...hit.data, cached: true };
  }

  try {
    const res = await fetch(buildSearchUrl(params), { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parseSearchHtml(html);
    await enrichHoldings(parsed);

    const total = parsed.total;
    const fetched = (params.page + 1) * params.rows;
    const data = {
      total,
      page: params.page,
      rows: params.rows,
      hasMore: total != null ? fetched < total : parsed.records.length >= params.rows,
      records: parsed.records,
    };

    searchCache.set(cacheKey, { ts: Date.now(), data });
    while (searchCache.size > SEARCH_MAX) searchCache.delete(searchCache.keys().next().value);
    return data;
  } catch (err) {
    return { error: true, message: err.message };
  }
}
