/**
 * 東京科学大学 附属図書館（大岡山 / すずかけ台）の開館カレンダー取得。
 *
 * 公式の印刷用カレンダー (https://www.libra.titech.ac.jp/calendar/print) は
 * ポータル認証不要の静的 HTML で、当月〜3ヶ月先・両館分が 1 ページに含まれる。
 * cheerio 等の HTML パーサは入っていないため、syllabus-med.js と同様に
 * fetch + 正規表現でパースする。
 *
 * ページ構造（Drupal view-calendar）:
 *   <h2 class="section__title">大岡山</h2>          ← 館見出し（この後に4テーブル）
 *     <table class="table table-bordered table-condensed">
 *       <caption>2026年6月</caption>               ← 年月
 *       <tr>
 *         <td class="view-calendar__day-j ...">1</td>            ← 日付番号
 *         <td class="view-calendar-print__day-d ...">月</td>     ← 曜日
 *         <td class="view-calendar-print__opening-hour ...">8:45 - 23:00</td>  ← 開館時間 or 休館
 *       </tr> ...
 *   <h2 class="section__title">すずかけ台</h2> ...
 */

import { getSupabaseAdmin } from '../supabase/server.js';

const CAL_URL = 'https://www.libra.titech.ac.jp/calendar/print';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
};

// 2層キャッシュ:
//   L1 (in-memory) — ウォームインスタンスでは DB すら叩かない。
//   L2 (Supabase library_hours_cache) — サーバーレスのコールドスタートをまたいで保持。
// カレンダーは月単位でしか変わらないので、スクレイプは L2 が古い時のみ。
const MEM_TTL = 60 * 60 * 1000;       // 1h — L1
const DB_TTL = 12 * 60 * 60 * 1000;   // 12h — L2（これより古ければ再スクレイプ）
if (!globalThis.__libCalCache) globalThis.__libCalCache = { data: null, ts: 0 };
const libCalCache = globalThis.__libCalCache;

async function readDbCache() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('library_hours_cache')
      .select('data, fetched_at')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data.data, fetchedAt: data.fetched_at, _ts: new Date(data.fetched_at).getTime() };
  } catch {
    return null;
  }
}

async function writeDbCache(parsed) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('library_hours_cache').upsert(
      { id: 1, data: { ookayama: parsed.ookayama, suzukakedai: parsed.suzukakedai }, fetched_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  } catch {
    // 保存失敗は致命的でない（次回再試行）。
  }
}

const pad2 = (n) => String(n).padStart(2, '0');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "8:45 - 23:00" → { open:"08:45", close:"23:00" } / 休館 → closed */
function parseHours(text) {
  const t = stripTags(text);
  if (!t || /休館|閉館/.test(t)) return { open: null, close: null, closed: true };
  const m = t.match(/(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/);
  if (!m) return { open: null, close: null, closed: true };
  return {
    open: `${pad2(m[1])}:${m[2]}`,
    close: `${pad2(m[3])}:${m[4]}`,
    closed: false,
  };
}

/** 1テーブル（=1ヶ月×1館）の <tr> を走査して日次配列を返す */
function parseTable(tableHtml) {
  const cap = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/);
  const ym = cap && stripTags(cap[1]).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (!ym) return [];
  const year = Number(ym[1]);
  const month = Number(ym[2]);

  const out = [];
  for (const row of tableHtml.split(/<tr[^>]*>/).slice(1)) {
    const dayM = row.match(/view-calendar__day-j[^>]*>\s*(\d{1,2})/);
    const dowM = row.match(/view-calendar-print__day-d[^>]*>\s*([日月火水木金土])/);
    const hourM = row.match(/view-calendar-print__opening-hour[^>]*>([\s\S]*?)<\/td>/);
    if (!dayM || !hourM) continue;
    const day = Number(dayM[1]);
    const { open, close, closed } = parseHours(hourM[1]);
    out.push({
      date: `${year}-${pad2(month)}-${pad2(day)}`,
      dow: dowM ? dowM[1] : '',
      open,
      close,
      closed,
    });
  }
  return out;
}

/** 館見出し以降〜次見出し（or 末尾）までの HTML 区間内の全テーブルを連結パース */
function parseSection(html, startIdx, endIdx) {
  const section = html.slice(startIdx, endIdx);
  const days = [];
  for (const m of section.matchAll(/<table class="table table-bordered table-condensed">([\s\S]*?)<\/table>/g)) {
    days.push(...parseTable(m[0]));
  }
  // 日付順（念のため）
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

/** 開館カレンダー HTML を { ookayama, suzukakedai } へ */
export function parseLibraryCalendar(html) {
  const headings = [...html.matchAll(/<h2[^>]*class="section__title"[^>]*>\s*([^<]+?)\s*<\/h2>/g)];
  let ookIdx = -1, suzIdx = -1;
  for (const m of headings) {
    if (/大岡山/.test(m[1]) && ookIdx < 0) ookIdx = m.index;
    if (/すずかけ/.test(m[1]) && suzIdx < 0) suzIdx = m.index;
  }
  if (ookIdx < 0 && suzIdx < 0) {
    // 見出しが取れない場合は全体を大岡山扱い（フォールバック）
    return { ookayama: parseSection(html, 0, html.length), suzukakedai: [] };
  }
  // 見出し順に応じて区間を決定
  const ookEnd = suzIdx > ookIdx ? suzIdx : html.length;
  const suzEnd = ookIdx > suzIdx ? ookIdx : html.length;
  return {
    ookayama: ookIdx >= 0 ? parseSection(html, ookIdx, ookEnd) : [],
    suzukakedai: suzIdx >= 0 ? parseSection(html, suzIdx, suzEnd) : [],
  };
}

/** 公式サイトを実際にスクレイプしてパース（失敗時 throw）。 */
async function scrapeLibraryCalendar() {
  const res = await fetch(CAL_URL, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const parsed = parseLibraryCalendar(html);
  if (!parsed.ookayama.length && !parsed.suzukakedai.length) throw new Error('parsed empty');
  return parsed;
}

/**
 * 開館カレンダーを取得。
 *   L1(メモリ 1h) → L2(Supabase 12h) → スクレイプ＋L2へ保存 の順。
 * 毎回スクレイプせず、こちら側（DB＋メモリ）に保持したものを返す。
 * 失敗時は古いキャッシュがあればそれを返し、無ければ { error:true }。
 * force=true で L1/L2 を無視して再スクレイプ（cron からの定期更新用）。
 */
export async function fetchLibraryCalendar({ force = false } = {}) {
  const now = Date.now();

  // L1: メモリ
  if (!force && libCalCache.data && now - libCalCache.ts < MEM_TTL) {
    return { ...libCalCache.data, cached: 'mem' };
  }

  // L2: Supabase
  if (!force) {
    const db = await readDbCache();
    if (db && db._ts && now - db._ts < DB_TTL) {
      const data = { ookayama: db.ookayama || [], suzukakedai: db.suzukakedai || [], fetchedAt: db.fetchedAt };
      libCalCache.data = data;
      libCalCache.ts = now;
      return { ...data, cached: 'db' };
    }
  }

  // スクレイプして両層に保存
  try {
    const parsed = await scrapeLibraryCalendar();
    const data = { ...parsed, fetchedAt: new Date().toISOString() };
    libCalCache.data = data;
    libCalCache.ts = now;
    await writeDbCache(parsed);
    return data;
  } catch (err) {
    // 失敗時フォールバック: メモリ → DB（期限切れでも）
    if (libCalCache.data) return { ...libCalCache.data, stale: true };
    const db = await readDbCache();
    if (db) {
      const data = { ookayama: db.ookayama || [], suzukakedai: db.suzukakedai || [], fetchedAt: db.fetchedAt };
      libCalCache.data = data;
      libCalCache.ts = now;
      return { ...data, stale: true };
    }
    return { error: true, message: err.message };
  }
}
