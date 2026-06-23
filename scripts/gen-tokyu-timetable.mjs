// 大岡山を出発駅とした「目的地で選ぶ」型の静的時刻表を駅探(ekitan)から生成する。
//   ODPT が東急の鉄道時刻表を未配信のための代替。個人利用前提。
//   実行: node scripts/gen-tokyu-timetable.mjs
//   出力: lib/data/static-timetables.generated.json
//
// 仕組み:
//  1) 大岡山の各方面ページ(目黒線/大井町線 ×2方面) を 平日/土曜/休日(?dw=) で取得し、発車一覧を抽出。
//  2) (方面,種別,終着) ごとに代表列車1本の詳細ページを取得し、停車駅＋所要(分)を得る。
//  3) これにより「選んだ目的地に実際に停車する列車だけ」を所要時間付きで出せる。
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const ORIGIN_EK = '1689';                 // 大岡山 の ekitan 駅ID
const sid = (ek) => `static.Station:ek${ek}`;
const ORIGIN = sid(ORIGIN_EK);

// 大岡山の方面ページ（dirCode = href 内 d= の値）
const DIRECTIONS = [
  { pageUrl: 'https://ekitan.com/timetable/railway/line-station/215-5/d1', dirCode: '1', name: '目黒線 目黒方面' },
  { pageUrl: 'https://ekitan.com/timetable/railway/line-station/215-5/d2', dirCode: '2', name: '目黒線 日吉方面' },
  { pageUrl: 'https://ekitan.com/timetable/railway/line-station/218-7/d1', dirCode: '1', name: '大井町線 大井町方面' },
  { pageUrl: 'https://ekitan.com/timetable/railway/line-station/218-7/d2', dirCode: '2', name: '大井町線 溝の口方面' },
];
const DW_SUFFIX = { weekday: '', saturday: '?dw=1', holiday: '?dw=2' };

const reItem = /data-tr-type="([^"]*)"\s+data-dest="([^"]*)"\s+data-kind_palette="(t\d+)"[^>]*>\s*<a href="([^"]*)"/g;

function normType(trType) {
  // 「各駅停車：二子新地、高津通過」等の注記(：以降, 括弧)を落として基本種別だけにする
  const base = trType.replace(/[：:（(].*$/, '').trim();
  const ja = base.replace('各駅停車', '各停');
  let id = 'Local';
  if (base.includes('通勤急行')) id = 'CommuterExpress';
  else if (base.includes('通勤特急')) id = 'CommuterLtdExpress';
  else if (base.includes('特急')) id = 'LtdExpress';
  else if (base.includes('急行')) id = 'Express';
  return { id: `static.TrainType:Tokyu.${id}`, ja };
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// 詳細ページから停車駅(ek駅ID+名前)と時刻を順に取り出す
function parseTrainDetail(htmlText) {
  const names = [];
  const reName = /<td class="td-station-name"><a href="\/timetable\/railway\/station\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = reName.exec(htmlText)) !== null) names.push({ ek: m[1], name: unescapeHtml(m[2]).trim() });
  const times = [];
  const reTime = /<td class="td-dep-and-arr-time">([\s\S]*?)<\/td>/g;
  while ((m = reTime.exec(htmlText)) !== null) {
    const t = /(\d{1,2}):(\d{2})/.exec(m[1]);
    times.push(t ? `${t[1].padStart(2, '0')}:${t[2]}` : null);
  }
  const n = Math.min(names.length, times.length);
  const stops = [];
  for (let i = 0; i < n; i++) stops.push({ ek: names[i].ek, name: names[i].name, time: times[i] });
  return stops;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.text();
}

async function run() {
  const out = {
    origin: { station: ORIGIN, title: { ja: '大岡山', en: 'Ookayama' } },
    source: 'ekitan.com',
    generatedAt: new Date().toISOString(),
    stations: { [ORIGIN]: { ja: '大岡山', en: 'Ookayama' } },
    trainTypes: {},
    departures: { weekday: [], saturday: [], holiday: [] },
    patterns: {}, // key -> { stops: { [stationId]: offsetMin } }
  };

  // 1) 発車一覧（方面×曜日）
  const repHref = new Map(); // patternKey -> 代表href
  for (const dir of DIRECTIONS) {
    for (const day of Object.keys(DW_SUFFIX)) {
      const htmlText = await fetchText(`${dir.pageUrl}${DW_SUFFIX[day]}`);
      reItem.lastIndex = 0;
      let m;
      const seen = new Set();
      while ((m = reItem.exec(htmlText)) !== null) {
        const [, trType, dest, , href] = m;
        const h = unescapeHtml(href);
        const dep = /departure=(\d{3,4})/.exec(h);
        const d = /[?&]d=(\d)/.exec(h);
        if (!dep || !d || d[1] !== dir.dirCode) continue;
        const hhmm = dep[1].padStart(4, '0');
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        const { id: typeId, ja: typeJa } = normType(trType);
        out.trainTypes[typeId] = { ja: typeJa };
        // パターンは raw 種別(注記込み)で分け、停車駅バリアントの取りこぼしを防ぐ
        const patternKey = `${dir.name}|${trType}|${dest}`;
        const dedupKey = `${day}|${time}|${patternKey}`;
        if (seen.has(dedupKey)) continue; seen.add(dedupKey);
        out.departures[day].push({ time, type: typeId, terminus: dest, pattern: patternKey });
        if (!repHref.has(patternKey)) repHref.set(patternKey, `https://ekitan.com${h}`);
      }
      await sleep(120);
    }
    console.log(`[${dir.name}] done`);
  }

  // 2) パターンごとに代表列車の停車駅＋所要を取得
  console.log(`patterns: ${repHref.size} (詳細ページ取得)`);
  let i = 0;
  for (const [patternKey, href] of repHref) {
    const htmlText = await fetchText(href);
    const stops = parseTrainDetail(htmlText);
    const oi = stops.findIndex((s) => s.ek === ORIGIN_EK);
    if (oi < 0 || !stops[oi].time) { console.warn('  origin not found in', patternKey); continue; }
    const originMin = toMin(stops[oi].time);
    const map = {};
    for (let k = oi + 1; k < stops.length; k++) {
      const s = stops[k];
      if (!s.time) continue;
      let off = toMin(s.time) - originMin;
      if (off < 0) off += 24 * 60; // 日跨ぎ
      map[sid(s.ek)] = off;
      if (!out.stations[sid(s.ek)]) out.stations[sid(s.ek)] = { ja: s.name };
    }
    out.patterns[patternKey] = { stops: map };
    if (++i % 10 === 0) console.log(`  ${i}/${repHref.size}`);
    await sleep(120);
  }

  for (const day of Object.keys(out.departures)) {
    out.departures[day].sort((a, b) => a.time.localeCompare(b.time));
  }

  const outPath = path.join(process.cwd(), 'lib', 'data', 'static-timetables.generated.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  const nDest = Object.keys(out.stations).length - 1;
  console.log(`\nwrote ${outPath}`);
  console.log(`reachable destinations: ${nDest}, patterns: ${Object.keys(out.patterns).length}`);
  console.log(`departures weekday=${out.departures.weekday.length} sat=${out.departures.saturday.length} hol=${out.departures.holiday.length}`);
  // サニティ: 目黒(ek?) に停まる平日の電車を数本
  const meguro = Object.entries(out.stations).find(([, t]) => t.ja === '目黒');
  if (meguro) {
    const [mid] = meguro;
    const hit = out.departures.weekday.filter((d) => out.patterns[d.pattern]?.stops[mid] != null);
    console.log(`目黒(${mid}) 停車 平日 ${hit.length}本。例:`, hit.slice(0, 4).map((d) => `${d.time} ${out.trainTypes[d.type].ja} 所要${out.patterns[d.pattern].stops[mid]}分`));
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
