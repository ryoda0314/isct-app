// 大岡山駅の発車標（3D の地図の改札の内・ホームの吊り下げの発車標）に出す、番線ごとの発車の表を作る。2026-11-12
//   node scripts/gen-campus-departures.mjs
//   入力: lib/data/static-timetables.generated.json（駅探から作った大岡山発の時刻表。scripts/gen-tokyu-timetable.mjs）
//   出力: public/map-3d/departures.json（3D 表示が読む。campus-sns/campus3dDepartures.js）
// 番線：1 目黒線 日吉方面、2 大井町線 溝の口方面、3 大井町線 大井町方面、4 目黒線 目黒方面。
// 時刻は「運行日」の分（4 時で切りかえ。0〜3 時は 24〜27 時として前の日の続き。campus3dTrains の serviceClock と同じ）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'lib', 'data', 'static-timetables.generated.json');
const OUT = path.join(ROOT, 'public', 'map-3d', 'departures.json');
const TRACKS = { 1: '目黒線 日吉方面', 2: '大井町線 溝の口方面', 3: '大井町線 大井町方面', 4: '目黒線 目黒方面' };

const tt = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const types = [];
const termini = [];
const idx = (list, v) => {
  let i = list.indexOf(v);
  if (i < 0) i = list.push(v) - 1;
  return i;
};
const trackOf = (pattern) => Object.keys(TRACKS).find((k) => String(pattern || '').startsWith(TRACKS[k] + '|'));
const days = {};
let skipped = 0;
for (const [day, list] of Object.entries(tt.departures)) {
  const byTrack = { 1: [], 2: [], 3: [], 4: [] };
  for (const d of list) {
    const no = trackOf(d.pattern);
    const m = /^(\d{1,2}):(\d{2})$/.exec(d.time || '');
    if (!no || !m) {
      skipped++;
      continue;
    }
    let min = +m[1] * 60 + +m[2];
    if (min < 240) min += 1440;
    const type = tt.trainTypes?.[d.type]?.ja || '';
    byTrack[no].push([min, idx(types, type), idx(termini, d.terminus || '')]);
  }
  for (const k of Object.keys(byTrack)) byTrack[k].sort((a, b) => a[0] - b[0]);
  days[day] = byTrack;
}
const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: '駅探（lib/data/static-timetables.generated.json、大岡山発）',
  attribution: '時刻表 駅探（大岡山発）',
  tracks: TRACKS,
  types,
  termini,
  days,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
const n = Object.values(days).map((d) => Object.values(d).reduce((a, l) => a + l.length, 0));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(days).join('/')} ${n.join('/')} departures, types ${types.join('・')}, ${termini.length} termini (skipped ${skipped})`);
