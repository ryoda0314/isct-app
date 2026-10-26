// キャンパスの3D地図の電車（池上線・東横線）の時刻表を駅探(ekitan)から作る。目黒線・大井町線は大岡山の時刻表
// （scripts/gen-tokyu-timetable.mjs）を使うので、ここでは地図に入るほかの2路線だけ。ODPT が東急の時刻表を配信していないための代替。個人利用前提。
//   実行: node scripts/gen-campus-train-timetables.mjs   （そのあと node scripts/gen-campus-trains.mjs）
//   出力: lib/data/campus-train-timetables.generated.json
//
// 仕組み: 基準の駅（池上線は石川台、東横線は自由が丘）の方面ごとの発車一覧を平日/土曜/休日で取り、
// （方面, 種別, 行き先）ごとに代表の1本の詳しいページから、始発から終点までの各駅の着・発の時刻を「基準の駅を出る時刻から何分」で持つ
// （前の駅はマイナス）。待ち合わせで長く止まる駅は、着と発がちがう。
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const normName = (s) => String(s || '').replace(/\s+/g, '').replace(/[（(][^）)]*[）)]$/, '').replace(/駅$/, '');

const LINES = [
  { anchor: '石川台', dirs: [
    { url: 'https://ekitan.com/timetable/railway/line-station/217-7/d1', code: '1', name: '池上線 五反田方面' },
    { url: 'https://ekitan.com/timetable/railway/line-station/217-7/d2', code: '2', name: '池上線 蒲田方面' },
  ] },
  { anchor: '自由が丘', dirs: [
    { url: 'https://ekitan.com/timetable/railway/line-station/216-6/d1', code: '1', name: '東横線 渋谷方面' },
    { url: 'https://ekitan.com/timetable/railway/line-station/216-6/d2', code: '2', name: '東横線 横浜方面' },
  ] },
];
const DW_SUFFIX = { weekday: '', saturday: '?dw=1', holiday: '?dw=2' };
const reItem = /data-tr-type="([^"]*)"\s+data-dest="([^"]*)"\s+data-kind_palette="(t\d+)"[^>]*>\s*<a href="([^"]*)"/g;
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

async function fetchText(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.text();
    await sleep(1500 * (i + 1));
  }
  throw new Error(`fetch ${url} failed`);
}

// 詳しいページ：停車駅と、着（arr）・発（dep）の時刻を順に（欄は「05:51着<br> 05:51発」。始発は発だけ、終点は着だけ）
function parseTrainDetail(htmlText) {
  const names = [];
  const reName = /<td class="td-station-name"><a href="\/timetable\/railway\/station\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = reName.exec(htmlText)) !== null) names.push(unescapeHtml(m[2]).trim());
  const cells = [];
  const reTime = /<td class="td-dep-and-arr-time">([\s\S]*?)<\/td>/g;
  while ((m = reTime.exec(htmlText)) !== null) {
    const pick = (kind) => { const t = new RegExp(`(\\d{1,2}):(\\d{2})${kind}`).exec(m[1]); return t ? `${t[1].padStart(2, '0')}:${t[2]}` : null; };
    cells.push({ arr: pick('着'), dep: pick('発') });
  }
  return names.slice(0, Math.min(names.length, cells.length)).map((name, i) => ({ name: normName(name), ...cells[i] }));
}

const out = { source: 'ekitan.com', generatedAt: new Date().toISOString(), lines: {}, patterns: {} };
const rep = new Map(); // patternKey -> 代表の詳しいページ
for (const line of LINES) {
  for (const dir of line.dirs) {
    const deps = { weekday: [], saturday: [], holiday: [] };
    for (const day of Object.keys(DW_SUFFIX)) {
      const html = await fetchText(dir.url + DW_SUFFIX[day]);
      const seen = new Set();
      reItem.lastIndex = 0;
      let m;
      while ((m = reItem.exec(html)) !== null) {
        const [, trType, dest, , href] = m;
        const h = unescapeHtml(href);
        const dep = /departure=(\d{3,4})/.exec(h);
        const d = /[?&]d=(\d)/.exec(h);
        if (!dep || !d || d[1] !== dir.code) continue;
        const hhmm = dep[1].padStart(4, '0');
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        const key = `${dir.name}|${trType.replace(/[：:].*$/, '')}|${normName(dest)}`;
        if (seen.has(time + key)) continue;
        seen.add(time + key);
        deps[day].push([time, key]);
        if (!rep.has(key)) rep.set(key, `https://ekitan.com${h}`);
      }
      deps[day].sort((a, b) => a[0].localeCompare(b[0]));
      await sleep(150);
    }
    out.lines[dir.name] = { anchor: line.anchor, departures: deps };
    console.log(`${dir.name}: weekday ${deps.weekday.length}, saturday ${deps.saturday.length}, holiday ${deps.holiday.length}`);
  }
}
console.log(`patterns: ${rep.size}`);
for (const [key, href] of rep) {
  const anchor = out.lines[key.split('|')[0]].anchor;
  const stops = parseTrainDetail(await fetchText(href));
  const ai = stops.findIndex((s) => s.name === anchor && (s.dep || s.arr));
  if (ai < 0) { console.warn('  anchor not found:', key); continue; }
  const t0 = toMin(stops[ai].dep || stops[ai].arr);
  const off = (hhmm) => { let d = toMin(hhmm) - t0; if (d > 720) d -= 1440; if (d < -720) d += 1440; return d; };
  const rel = []; // [駅, 着の分, 発の分]
  for (const s of stops) {
    if (!s.arr && !s.dep) continue;
    rel.push([s.name, off(s.arr || s.dep), off(s.dep || s.arr)]);
  }
  out.patterns[key] = { stops: rel, origin: stops[0]?.name, terminus: stops[stops.length - 1]?.name };
  await sleep(150);
}
const OUT = path.join(process.cwd(), 'lib', 'data', 'campus-train-timetables.generated.json');
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
