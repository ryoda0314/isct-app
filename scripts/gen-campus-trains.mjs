// キャンパスの3D地図に電車を走らせるためのデータを作る。
//   実行: node scripts/gen-campus-trains.mjs
//   出力: public/map-3d/trains.json（3D表示を開いたときに読む）
//
// 線路: OpenStreetMap の路線（route relation、PTv2）。東急目黒線・大井町線の上り・下りそれぞれの線路を、
//       急行の止まる駅まで（目黒線は田園調布〜武蔵小山、大井町線は九品仏〜旗の台）切り出す。トンネルの区間も持つ。
// ダイヤ: 目黒線・大井町線は lib/data/static-timetables.generated.json（駅探から作った大岡山発の時刻表）。列車ごとに、大岡山の
//       発車時刻と「大岡山から各駅まで何分」の型。大岡山より前の駅は、反対向きの同じ種別の所要分（中央値）から逆算する。
//       池上線・東横線は lib/data/campus-train-timetables.generated.json（scripts/gen-campus-train-timetables.mjs、石川台・自由が丘発）。
//       こちらは前後の駅の着・発がそろっている。
// 出典: 線路 © OpenStreetMap contributors（ODbL）。時刻表は駅探から作ったもの（scripts/gen-tokyu-timetable.mjs）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'map-3d', 'trains.json');
const TIMETABLE = path.join(ROOT, 'lib', 'data', 'static-timetables.generated.json');
const EXTRA = path.join(ROOT, 'lib', 'data', 'campus-train-timetables.generated.json');
const UA = 'isct-campus-app-trains-builder/1.0';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 線路（向きごと）。from/to は切り出す端の駅（急行の止まる駅まで）
const ROUTES = [
  { key: 'MG-meguro', rel: 5375680, line: '目黒線', dir: '目黒方面', from: '田園調布', to: '武蔵小山' },
  { key: 'MG-hiyoshi', rel: 9340969, line: '目黒線', dir: '日吉方面', from: '武蔵小山', to: '田園調布' },
  { key: 'OM-oimachi', rel: 9341649, line: '大井町線', dir: '大井町方面', from: '九品仏', to: '旗の台' },
  { key: 'OM-mizonokuchi', rel: 9341647, line: '大井町線', dir: '溝の口方面', from: '旗の台', to: '九品仏' },
  { key: 'IK-gotanda', rel: 9342007, line: '池上線', dir: '五反田方面', from: '雪が谷大塚', to: '長原' },
  { key: 'IK-kamata', rel: 9342008, line: '池上線', dir: '蒲田方面', from: '長原', to: '雪が谷大塚' },
  { key: 'TY-shibuya', rel: 1947536, line: '東横線', dir: '渋谷方面', from: '田園調布', to: '都立大学' },
  { key: 'TY-yokohama', rel: 9288982, line: '東横線', dir: '横浜方面', from: '都立大学', to: '田園調布' },
];
const OPPOSITE = { '目黒方面': '日吉方面', '日吉方面': '目黒方面', '大井町方面': '溝の口方面', '溝の口方面': '大井町方面' };
// 車両：目黒線は 20m×8両、大井町線は各停 18m×5両・急行 20m×7両、池上線は 18m×3両、東横線は各停 20m×8両・急行など 20m×10両
const CARS = { '目黒線|各停': [8, 20], '目黒線|急行': [8, 20], '大井町線|各停': [5, 18], '大井町線|急行': [7, 20], '池上線|各停': [3, 18], '東横線|各停': [8, 20], '東横線|急行': [10, 20] };
const MARGIN = 300; // 端の駅の先に残す線路（m）

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
      if (res.ok) return await res.json();
      console.warn(`overpass ${res.status} at ${url}`);
    } catch (e) {
      console.warn(`overpass error at ${url}: ${e.message}`);
    }
    await sleep(4000 * (attempt + 1));
  }
  throw new Error('overpass failed');
}

// 緯度経度 ↔ キャンパスのあたりの平面（m）。距離と間引きにだけ使う
const LAT0 = 35.6048;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110950;
const xy = ([lat, lng]) => [lng * KX, lat * KY];
const dist = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.hypot(ax - bx, ay - by); };
const same = (a, b) => dist(a, b) < 0.05;
const normName = (s) => String(s || '').replace(/\s+/g, '').replace(/[（(][^）)]*[）)]$/, '').replace(/駅$/, '');

function simplify(pts, tol, keep) {
  if (pts.length < 3) return pts.map((_, i) => i);
  const P = pts.map(xy);
  const k = new Uint8Array(pts.length);
  k[0] = k[pts.length - 1] = 1;
  keep.forEach((i) => { k[i] = 1; });
  const anchors = [...k.keys()].filter((i) => k[i]);
  for (let a = 0; a + 1 < anchors.length; a++) {
    const st = [[anchors[a], anchors[a + 1]]];
    while (st.length) {
      const [i, j] = st.pop();
      let best = -1, bd = tol;
      const [ax, ay] = P[i], [bx, by] = P[j];
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
      for (let m = i + 1; m < j; m++) {
        const t = Math.max(0, Math.min(1, ((P[m][0] - ax) * (bx - ax) + (P[m][1] - ay) * (by - ay)) / L2));
        const d = Math.hypot(P[m][0] - ax - (bx - ax) * t, P[m][1] - ay - (by - ay) * t);
        if (d > bd) { bd = d; best = m; }
      }
      if (best >= 0) { k[best] = 1; st.push([i, best], [best, j]); }
    }
  }
  return [...k.keys()].filter((i) => k[i]);
}

// ── 線路を取ってくる ──
const ids = ROUTES.map((r) => r.rel).join(',');
const data = await overpass(`[out:json][timeout:120];relation(id:${ids})->.rels;.rels out body;way(r.rels);out geom;node(r.rels);out body;`);
const rels = new Map(), ways = new Map(), nodes = new Map();
for (const el of data.elements) {
  if (el.type === 'relation') rels.set(el.id, el);
  else if (el.type === 'way') ways.set(el.id, el);
  else if (el.type === 'node') nodes.set(el.id, el);
}

function buildRoute(R) {
  const rel = rels.get(R.rel);
  if (!rel) throw new Error(`relation ${R.rel} missing`);
  // 線路の way を順につなぐ（向きは前の way の終わりに合わせる）。点ごとにトンネルかどうか
  const pts = [], tun = [], brg = [];
  for (const m of rel.members) {
    if (m.type !== 'way' || (m.role && m.role !== '')) continue;
    const w = ways.get(m.ref);
    if (!w?.geometry) continue;
    let g = w.geometry.map((p) => [p.lat, p.lon]);
    const t = w.tags || {};
    const under = t.tunnel === 'yes' || t.tunnel === 'building_passage' || t.covered === 'yes' || Number(t.layer) < 0;
    const over = !!t.bridge && t.bridge !== 'no' ? Math.max(1, Number(t.layer) || 1) : 0;
    if (pts.length) {
      const end = pts[pts.length - 1];
      if (same(end, g[g.length - 1]) && !same(end, g[0])) g = g.reverse();
      else if (!same(end, g[0]) && !same(end, g[g.length - 1])) {
        // 最初の way の向きが逆だった
        if (same(pts[0], g[0]) || same(pts[0], g[g.length - 1])) {
          pts.reverse(); tun.reverse(); brg.reverse();
          if (same(pts[pts.length - 1], g[g.length - 1])) g = g.reverse();
        }
      }
      if (same(pts[pts.length - 1], g[0])) { g = g.slice(1); tun[tun.length - 1] = tun[tun.length - 1] || under; brg[brg.length - 1] = Math.max(brg[brg.length - 1], over); }
    }
    g.forEach((p) => { pts.push(p); tun.push(under); brg.push(over); });
  }
  // 停車位置（stop）を線路の上に
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const project = (p) => {
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = xy(pts[i]), [bx, by] = xy(pts[i + 1]), [px, py] = xy(p);
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2));
      const d = Math.hypot(px - ax - (bx - ax) * t, py - ay - (by - ay) * t);
      if (d < best.d) best = { d, s: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
  };
  const stops = [];
  for (const m of rel.members) {
    if (m.type !== 'node' || !/^stop/.test(m.role || '')) continue;
    const n = nodes.get(m.ref);
    if (!n) continue;
    const name = normName(n.tags?.name || n.tags?.['name:ja']);
    const pr = project([n.lat, n.lon]);
    if (pr.d < 40 && name && !stops.some((s) => s.name === name)) stops.push({ name, s: pr.s });
  }
  stops.sort((a, b) => a.s - b.s);
  const a = stops.find((s) => s.name === R.from), b = stops.find((s) => s.name === R.to);
  if (!a || !b) throw new Error(`${R.key}: stops ${R.from}/${R.to} not found in ${stops.map((s) => s.name).join(',')}`);
  const s0 = Math.max(0, a.s - MARGIN), s1 = Math.min(cum[cum.length - 1], b.s + MARGIN);
  // 切り出して間引く（端と停車位置の近くの点は残す）
  const at = (s) => {
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const idx = [];
  for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) idx.push(i);
  const cut = [at(s0), ...idx.map((i) => pts[i]), at(s1)];
  const cutTun = [tun[Math.max(0, idx[0] - 1)] && tun[idx[0]], ...idx.map((i) => tun[i]), tun[idx[idx.length - 1]] && tun[Math.min(pts.length - 1, idx[idx.length - 1] + 1)]];
  const cutBrg = [Math.min(brg[Math.max(0, idx[0] - 1)], brg[idx[0]]), ...idx.map((i) => brg[i]), Math.min(brg[idx[idx.length - 1]], brg[Math.min(pts.length - 1, idx[idx.length - 1] + 1)])];
  // トンネルの区間（区切りは間引いても残す）
  const keep = [];
  for (let i = 1; i < cutTun.length; i++) if (cutTun[i] !== cutTun[i - 1] || cutBrg[i] !== cutBrg[i - 1]) keep.push(i - 1, i);
  const kept = simplify(cut, 0.6, keep);
  const line = kept.map((i) => cut[i]);
  const lcum = [0];
  for (let i = 1; i < line.length; i++) lcum.push(lcum[i - 1] + dist(line[i - 1], line[i]));
  const tunnels = [];
  for (let k = 0; k + 1 < kept.length; k++) {
    const under = cutTun[kept[k]] && cutTun[kept[k + 1]];
    const last = tunnels[tunnels.length - 1];
    if (under) { if (last && Math.abs(last[1] - lcum[k]) < 0.01) last[1] = lcum[k + 1]; else tunnels.push([lcum[k], lcum[k + 1]]); }
  }
  // 橋の区間 [始め, 終わり, layer]
  const bridges = [];
  for (let k = 0; k + 1 < kept.length; k++) {
    const lv = Math.min(cutBrg[kept[k]], cutBrg[kept[k + 1]]);
    const last = bridges[bridges.length - 1];
    if (lv) { if (last && Math.abs(last[1] - lcum[k]) < 0.01 && last[2] === lv) last[1] = lcum[k + 1]; else bridges.push([lcum[k], lcum[k + 1], lv]); }
  }
  const inside = stops.filter((st) => st.s >= a.s - 1 && st.s <= b.s + 1).map((st) => ({ name: st.name, s: +(st.s - s0).toFixed(1) }));
  return {
    key: R.key, line: R.line, dir: R.dir, name: rel.tags?.name, colour: rel.tags?.colour || '#888888',
    pts: line.map(([la, ln]) => [+ln.toFixed(6), +la.toFixed(6)]),
    len: +lcum[lcum.length - 1].toFixed(1),
    tunnels: tunnels.map(([p, q]) => [+p.toFixed(1), +q.toFixed(1)]),
    bridges: bridges.map(([p, q, lv]) => [+p.toFixed(1), +q.toFixed(1), lv]),
    stops: inside,
  };
}

const routes = ROUTES.map(buildRoute);
for (const r of routes) console.log(`${r.key}: ${r.len} m, ${r.pts.length} pts, stops ${r.stops.map((s) => `${s.name}@${Math.round(s.s)}`).join(' ')}, tunnels ${r.tunnels.map(([a, b]) => `${Math.round(a)}-${Math.round(b)}`).join(' ') || '-'}, bridges ${r.bridges.map(([a, b, l]) => `${Math.round(a)}-${Math.round(b)}(L${l})`).join(' ') || '-'}`);

// ── ダイヤ ──
const tt = JSON.parse(fs.readFileSync(TIMETABLE, 'utf8'));
const stName = (id) => normName(tt.stations[id]?.ja);
const typeOf = (patternKey) => (patternKey.split('|')[1].startsWith('急行') ? '急行' : '各停');
const lineDir = (patternKey) => { const [line, dir] = patternKey.split('|')[0].split(' '); return { line, dir }; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
// 向き・種別ごとに、大岡山から各駅までの所要分（中央値）
const ahead = {};
for (const [k, p] of Object.entries(tt.patterns)) {
  const { line, dir } = lineDir(k);
  const g = (ahead[`${line}|${dir}|${typeOf(k)}`] ||= {});
  for (const [id, m] of Object.entries(p.stops)) (g[stName(id)] ||= []).push(m);
}
const routeIdx = (line, dir) => routes.findIndex((r) => r.line === line && r.dir === dir);
const patterns = [], patternIndex = new Map();
function patternFor(key) {
  if (patternIndex.has(key)) return patternIndex.get(key);
  const p = tt.patterns[key];
  const { line, dir } = lineDir(key);
  const type = typeOf(key);
  const ri = routeIdx(line, dir);
  const r = routes[ri];
  const ookayama = r.stops.findIndex((s) => s.name === '大岡山');
  // 大岡山より後：この型の所要分。前：反対向きの同じ種別の所要分（中央値）を引く
  const after = new Map(Object.entries(p.stops).map(([id, m]) => [stName(id), m]));
  const back = ahead[`${line}|${OPPOSITE[dir]}|${type}`] || {};
  const terminus = normName(key.split('|')[2]);
  const ev = [];
  r.stops.forEach((st, i) => {
    if (i === ookayama) ev.push([i, 0]);
    else if (i > ookayama && after.has(st.name)) ev.push([i, after.get(st.name)]);
    else if (i < ookayama && back[st.name]) ev.push([i, -median(back[st.name])]);
  });
  // 終点が線路の中の駅なら、そこで終わる（その先へは走らない）
  const endsHere = r.stops.some((st) => st.name === terminus);
  const [cars, carLen] = CARS[`${line}|${type}`];
  const out = { route: ri, type, cars, carLen, ev, end: endsHere ? 1 : 0 };
  patternIndex.set(key, patterns.length);
  patterns.push(out);
  return patternIndex.get(key);
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h < 4 ? h + 24 : h) * 60 + m; };
const days = {};
for (const [day, list] of Object.entries(tt.departures)) {
  days[day] = list.map((d) => [patternFor(d.pattern), toMin(d.time)]);
}
// 池上線・東横線：基準の駅（石川台・自由が丘）を出る時刻と、前後の駅の着・発（分）。待ち合わせで着が発より前なら ev に着も持つ。
// 始発・終点が区間の中の駅なら、そこで現れる・消える（start / end）
const extra = JSON.parse(fs.readFileSync(EXTRA, 'utf8'));
function extraPattern(key) {
  if (patternIndex.has(key)) return patternIndex.get(key);
  const p = extra.patterns[key];
  if (!p) return -1;
  const [ld, rawType] = key.split('|');
  const [line, dir] = ld.split(' ');
  const ri = routeIdx(line, dir);
  const r = routes[ri];
  const at = new Map(p.stops.map(([n, a, d]) => [n, [a, d]]));
  const ev = [];
  r.stops.forEach((st, i) => { const t = at.get(st.name); if (t) ev.push(t[0] < t[1] ? [i, t[1], t[0]] : [i, t[1]]); });
  const type = rawType === '各駅停車' ? '各停' : '急行';
  const [cars, carLen] = CARS[`${line}|${type}`];
  const out = { route: ri, type, cars, carLen, ev, end: r.stops.some((st) => st.name === normName(p.terminus)) ? 1 : 0, start: r.stops.some((st) => st.name === normName(p.origin)) ? 1 : 0 };
  patternIndex.set(key, patterns.length);
  patterns.push(out);
  return patternIndex.get(key);
}
let dropped = 0;
for (const line of Object.values(extra.lines)) {
  for (const [day, list] of Object.entries(line.departures)) {
    for (const [time, key] of list) {
      const pi = extraPattern(key);
      if (pi < 0) { dropped++; continue; }
      days[day].push([pi, toMin(time)]);
    }
  }
}
if (dropped) console.log(`dropped ${dropped} departures without a pattern`);
for (const list of Object.values(days)) list.sort((a, b) => a[1] - b[1]);
for (const [i, p] of patterns.entries()) if (/^(IK|TY)/.test(routes[p.route].key) && (i % 4 === 0 || p.start || p.end)) console.log(`pattern ${i}: ${routes[p.route].key} ${p.type} ${p.cars}x${p.carLen}m end=${p.end}${p.start ? ' start' : ''} ev ${p.ev.map(([s, m, a]) => `${routes[p.route].stops[s].name}${m >= 0 ? '+' : ''}${m}${a != null ? `(着${a})` : ''}`).join(' ')}`);

const out = {
  generated: new Date().toISOString().slice(0, 10),
  attribution: '線路 © OpenStreetMap contributors / 時刻表 駅探（大岡山発）',
  dwell: 25, // 駅に止まる秒数（大岡山は 35 秒）
  routes, patterns, days,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB): ${patterns.length} patterns, ${Object.entries(days).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
