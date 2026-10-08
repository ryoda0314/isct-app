// キャンパスナビの「イラスト地図」用ベースマップを OpenStreetMap から生成する。
//   実行: node scripts/gen-campus-basemap.mjs
//   出力: campus-sns/campusBasemapData.js（自動生成。手で編集しない）
//
// 中身: キャンパス内の建物外形（アプリのスポットIDと対応付け・ラベル位置つき）、
//       緑地・水面・周辺道路・線路・駅。キャンパス内の通路はアプリの WAYPOINTS/EDGES を描くので含めない。
// 出典: © OpenStreetMap contributors（ODbL）。地図上に出典表記を出すこと。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'campus-sns', 'campusBasemapData.js');
const UA = 'isct-campus-app-basemap-builder/1.0';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── アプリ側のキャンパスデータ（境界・スポット）を読む ──
const src = fs.readFileSync(path.join(ROOT, 'campus-sns', 'hooks', 'useLocationSharing.js'), 'utf8');
const { CAMPUS_BOUNDARY, SPOTS } = new Function(`${src.replace(/^export /gm, '')}\nreturn { CAMPUS_BOUNDARY, SPOTS };`)();

const lats = CAMPUS_BOUNDARY.map((p) => p[0]);
const lngs = CAMPUS_BOUNDARY.map((p) => p[1]);
const CAMPUS_BOX = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
// 周辺の道路・緑地・線路・駅を描く範囲（建物はキャンパスの中だけ）。3D表示でキャンパス全体を見渡したとき、
// 横長の画面でも外側の何も無いところが見えないよう、東西に約900m・南北に約310m広げる
const M_LAT = 0.0028;
const M_LNG = 0.01;
const REGION = [CAMPUS_BOX[0] - M_LAT, CAMPUS_BOX[1] - M_LNG, CAMPUS_BOX[2] + M_LAT, CAMPUS_BOX[3] + M_LNG];
const bboxStr = (b) => b.map((v) => v.toFixed(5)).join(',');

async function overpass(query) {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
          body: `data=${encodeURIComponent(query)}`,
        });
        const text = await res.text();
        if (text.trim().startsWith('{')) return JSON.parse(text);
        console.warn(`  ${url}: ${(text.match(/Error<\/strong>: ([^<]*)/) || [])[1]?.slice(0, 90) || res.status}`);
      } catch (e) {
        console.warn(`  ${url}: ${e.message}`);
      }
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('Overpass API に接続できませんでした');
}

// ── 幾何ユーティリティ（局所平面に投影してメートルで計算）──
// 原点を地域の中心に置く（絶対座標のままだと面積・重心の計算で桁落ちする）
const LAT0 = (REGION[0] + REGION[2]) / 2;
const LNG0 = (REGION[1] + REGION[3]) / 2;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const KY = 110540;
const toXY = ([lat, lng]) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
const fromXY = ([x, y]) => [y / KY + LAT0, x / KX + LNG0];
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const r6 = (pts) => pts.map(([a, b]) => [round6(a), round6(b)]);
const samePt = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

function simplify(pts, tolM) {
  if (pts.length <= 3) return pts;
  const xy = pts.map(toXY);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = xy[i];
    const [bx, by] = xy[j];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let best = -1;
    let bestD = 0;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((xy[k][0] - ax) * dy - (xy[k][1] - ay) * dx) / len;
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0 && bestD > tolM) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

function pointInRing([lat, lng], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  const xy = ring.map(toXY);
  let a = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
  return Math.abs(a / 2);
}

function ringCentroid(ring) {
  const xy = ring.map(toXY);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const f = xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
    a += f;
    cx += (xy[j][0] + xy[i][0]) * f;
    cy += (xy[j][1] + xy[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return ring[0];
  return fromXY([cx / (3 * a), cy / (3 * a)]);
}

function distToRingM(p, ring) {
  const [px, py] = toXY(p);
  const xy = ring.map(toXY);
  let best = Infinity;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const [ax, ay] = xy[j];
    const [bx, by] = xy[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

// 建物の「見た目の中心」（辺から最も遠い内部点）。L字や中庭のある建物でも外にはみ出さない。
function visualCenter(rings) {
  const outer = rings[0];
  const inside = (p) => pointInRing(p, outer) && !rings.slice(1).some((h) => pointInRing(p, h));
  const score = (p) => (inside(p) ? Math.min(...rings.map((r) => distToRingM(p, r))) : -1);
  const la = outer.map((p) => p[0]);
  const ln = outer.map((p) => p[1]);
  let box = [Math.min(...la), Math.min(...ln), Math.max(...la), Math.max(...ln)];
  let best = ringCentroid(outer);
  let bestS = score(best);
  for (let iter = 0; iter < 4; iter++) {
    const n = 14;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p = [box[0] + ((box[2] - box[0]) * i) / n, box[1] + ((box[3] - box[1]) * j) / n];
        const s = score(p);
        if (s > bestS) { bestS = s; best = p; }
      }
    }
    const h = (box[2] - box[0]) / 5;
    const w = (box[3] - box[1]) / 5;
    box = [best[0] - h, best[1] - w, best[0] + h, best[1] + w];
  }
  return { p: best, r: bestS };
}

// 経路の線分を地域の矩形でクリップ（はみ出した線路などを切る）
function clipLine(pts, [s, w, n, e]) {
  const parts = [];
  let cur = [];
  const inBox = ([a, b]) => a >= s && a <= n && b >= w && b <= e;
  const lerpToEdge = (a, b) => {
    // a: 内側, b: 外側。b 側の境界との交点を返す
    let t = 1;
    const dLat = b[0] - a[0];
    const dLng = b[1] - a[1];
    if (b[0] < s) t = Math.min(t, (s - a[0]) / dLat);
    if (b[0] > n) t = Math.min(t, (n - a[0]) / dLat);
    if (b[1] < w) t = Math.min(t, (w - a[1]) / dLng);
    if (b[1] > e) t = Math.min(t, (e - a[1]) / dLng);
    return [a[0] + dLat * t, a[1] + dLng * t];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    if (inBox(p)) {
      if (prev && !inBox(prev)) cur.push(lerpToEdge(p, prev));
      cur.push(p);
    } else if (prev && inBox(prev)) {
      cur.push(lerpToEdge(prev, p));
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length) parts.push(cur);
  return parts.filter((pp) => pp.length >= 2);
}

function clipPolygon(ring, [s, w, n, e]) {
  const edges = [
    [(p) => p[0] >= s, (a, b) => { const t = (s - a[0]) / (b[0] - a[0]); return [s, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= n, (a, b) => { const t = (n - a[0]) / (b[0] - a[0]); return [n, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= w, (a, b) => { const t = (w - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, w]; }],
    [(p) => p[1] <= e, (a, b) => { const t = (e - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, e]; }],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (!out.length) return null;
  }
  return out.length >= 3 ? out : null;
}

// マルチポリゴンのメンバー（複数のウェイ）をつないでリングにする
function assembleRings(lines) {
  const segs = lines.map((l) => l.slice());
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let progressed = true;
    while (!samePt(ring[0], ring[ring.length - 1]) && progressed) {
      progressed = false;
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i];
        const last = ring[ring.length - 1];
        if (samePt(last, sg[0])) ring = ring.concat(sg.slice(1));
        else if (samePt(last, sg[sg.length - 1])) ring = ring.concat(sg.slice(0, -1).reverse());
        else if (samePt(ring[0], sg[sg.length - 1])) ring = sg.slice(0, -1).concat(ring);
        else if (samePt(ring[0], sg[0])) ring = sg.slice(1).reverse().concat(ring);
        else continue;
        segs.splice(i, 1);
        progressed = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

const geomOf = (g) => (g || []).map((p) => [p.lat, p.lon]);
const openRing = (r) => (samePt(r[0], r[r.length - 1]) ? r.slice(0, -1) : r);

// ── 取得 ──
console.log('OSM から周辺の地物を取得中…');
const B = bboxStr(REGION);
const features = await overpass(`[out:json][timeout:90];(
  way["railway"~"^(rail|subway|light_rail|platform)$"](${B});
  way["landuse"~"^(grass|forest|recreation_ground|meadow|village_green)$"](${B});
  way["leisure"~"^(park|pitch|garden|track|playground)$"](${B});
  way["natural"~"^(wood|scrub|grassland|water)$"](${B});
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"](${B});
  node["railway"="station"](${B});
);out geom;`);
await sleep(2000);
console.log('OSM からキャンパスの建物を取得中…');
const CB = bboxStr([CAMPUS_BOX[0] - 0.0003, CAMPUS_BOX[1] - 0.0003, CAMPUS_BOX[2] + 0.0003, CAMPUS_BOX[3] + 0.0003]);
const bld = await overpass(`[out:json][timeout:90];(way["building"](${CB});relation["building"](${CB}););out geom;`);

// ── 建物（キャンパス境界の内側だけ）──
// 高さ(m)：OSM の height、無ければ building:levels × 3.6（3D表示で使う。どちらも無ければ null）
const heightOf = (t = {}) => {
  const h = parseFloat(String(t.height || '').replace(/[^\d.]/g, ''));
  if (h > 0) return h;
  const lv = parseFloat(t['building:levels']);
  return lv > 0 ? lv * 3.6 : null;
};
const buildings = [];
for (const el of bld.elements) {
  let rings = [];
  if (el.type === 'way') {
    rings = [openRing(geomOf(el.geometry))];
  } else if (el.type === 'relation') {
    const outer = assembleRings(el.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => geomOf(m.geometry)));
    const inner = assembleRings(el.members.filter((m) => m.type === 'way' && m.role === 'inner').map((m) => geomOf(m.geometry)));
    if (!outer.length) continue;
    // 外周が複数ある場合は個別の建物として扱う（穴は含まれる外周に付ける）
    for (const o of outer) {
      const holes = inner.filter((h) => pointInRing(h[0], o)).map(openRing);
      buildings.push({ rings: [openRing(o), ...holes], name: el.tags?.name || null, id: `r${el.id}`, z: heightOf(el.tags) });
    }
    continue;
  }
  if (rings[0].length < 3) continue;
  buildings.push({ rings, name: el.tags?.name || null, id: `w${el.id}`, z: heightOf(el.tags) });
}
const campusBuildings = buildings
  .filter((b) => pointInRing(ringCentroid(b.rings[0]), CAMPUS_BOUNDARY))
  .map((b) => ({ ...b, area: ringArea(b.rings[0]) }))
  .filter((b) => b.area >= 8); // 物置など極小のものは省く

// ── スポットとの対応付け ──
const BUILDING_CATS = new Set(['central', 'west', 'south', 'eastnorth', 'midori', 'ishikawa', 'facility']);
const PRIMARY_CATS = new Set(['central', 'west', 'south', 'eastnorth', 'midori', 'ishikawa']);
const norm = (s) => (s || '').normalize('NFKC').replace(/\s+/g, '').replace(/^大岡山/, '').replace(/[（(].*?[）)]/g, '');
const buildingSpots = SPOTS.filter((s) => s.id && s.lat != null && BUILDING_CATS.has(s.cat));
const spotsOf = new Map(); // building index -> [spot]
const assign = (bi, spot) => {
  if (!spotsOf.has(bi)) spotsOf.set(bi, []);
  if (!spotsOf.get(bi).includes(spot)) spotsOf.get(bi).push(spot);
};
const unmatched = [];
for (const s of buildingSpots) {
  // 1) スポットの座標を含む建物（重なっていれば小さい方）
  const hits = campusBuildings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => pointInRing([s.lat, s.lng], b.rings[0]))
    .sort((a, b) => a.b.area - b.b.area);
  if (hits.length) { assign(hits[0].i, s); continue; }
  // 2) 建物名の一致（「西5号館・つばめテラス」⇔「大岡山西5号館」など）
  const label = norm(s.label);
  const byName = campusBuildings.findIndex((b) => b.name && (label.startsWith(norm(b.name)) || norm(b.name) === label));
  if (byName >= 0) { assign(byName, s); continue; }
  // 3) 25m 以内で一番近い建物
  let best = -1;
  let bestD = 25;
  campusBuildings.forEach((b, i) => {
    const d = distToRingM([s.lat, s.lng], b.rings[0]);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) assign(best, s);
  else unmatched.push(`${s.id}:${s.label}`);
}
// 名前は一致するがスポット座標が別棟にある建物（西8号館の東棟/西棟など）も同じスポットに寄せる
campusBuildings.forEach((b, i) => {
  if (spotsOf.has(i) || !b.name) return;
  const s = buildingSpots.find((sp) => norm(sp.label) === norm(b.name));
  if (s) assign(i, s);
});

// ── 出力用に整形 ──
const outBuildings = [];
const labeledSpots = new Set();
const order = campusBuildings.map((b, i) => i).sort((a, b) => campusBuildings[b].area - campusBuildings[a].area);
for (const i of order) {
  const b = campusBuildings[i];
  const sp = (spotsOf.get(i) || []).sort((a, c) => (PRIMARY_CATS.has(c.cat) ? 1 : 0) - (PRIMARY_CATS.has(a.cat) ? 1 : 0));
  const rings = b.rings.map((r) => simplify(r, 0.3)).filter((r) => r.length >= 3);
  if (!rings.length) continue;
  const vc = visualCenter(rings);
  const entry = { p: r6(rings[0]) };
  if (rings.length > 1) entry.h = rings.slice(1).map(r6);
  if (sp.length) {
    entry.s = sp[0].id;
    if (sp.length > 1) entry.o = sp.slice(1).map((x) => x.id);
    if (!labeledSpots.has(sp[0].id)) { entry.l = 1; labeledSpots.add(sp[0].id); }
  } else if (b.name) {
    entry.n = b.name.normalize('NFKC').replace(/^大岡山/, '');
    entry.l = 1;
  }
  entry.c = r6([vc.p])[0];
  entry.r = Math.round(vc.r * 10) / 10; // ラベルを置ける半径(m)。小さい建物は高ズームでだけ文字を出す
  if (b.z) entry.z = Math.round(b.z * 10) / 10;
  outBuildings.push(entry);
}

const green = [];
const water = [];
const streets = { major: [], mid: [], minor: [], ped: [] };
const rail = { surface: [], tunnel: [] };
const platforms = [];
const stations = [];
const GREEN_KIND = (t) => {
  if (t.leisure === 'pitch') return 'pitch';
  if (t.leisure === 'track') return 'track';
  if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') return 'wood';
  return 'park';
};
for (const el of features.elements) {
  const t = el.tags || {};
  if (el.type === 'node') {
    if (t.railway === 'station' && t.name) stations.push({ name: t.name.replace(/駅$/, ''), lat: el.lat, lng: el.lon });
    continue;
  }
  const g = geomOf(el.geometry);
  if (g.length < 2) continue;
  if (t.railway === 'platform') {
    const c = clipPolygon(openRing(g), REGION);
    if (c) platforms.push(r6(simplify(c, 0.5)));
  } else if (t.railway) {
    const under = t.tunnel === 'yes' || t.covered === 'yes';
    for (const part of clipLine(g, REGION)) (under ? rail.tunnel : rail.surface).push(r6(simplify(part, 0.8)));
  } else if (t.highway) {
    const cls = /primary|secondary/.test(t.highway) ? 'major' : t.highway === 'tertiary' ? 'mid' : t.highway === 'pedestrian' ? 'ped' : 'minor';
    if (t.area === 'yes') continue;
    for (const part of clipLine(g, REGION)) streets[cls].push(r6(simplify(part, 0.8)));
  } else if (t.natural === 'water') {
    const c = clipPolygon(openRing(g), REGION);
    if (c) water.push(r6(simplify(c, 0.6)));
  } else if (samePt(g[0], g[g.length - 1])) {
    const c = clipPolygon(openRing(g), REGION);
    if (c) green.push({ k: GREEN_KIND(t), p: r6(simplify(c, 0.6)) });
  }
}

// 同じ駅が路線ごとに別の点で入っていることがある（自由が丘など）。名前でまとめて真ん中に置く
const stationList = Object.values(stations.reduce((acc, st) => {
  const a = (acc[st.name] ||= { name: st.name, lat: 0, lng: 0, n: 0 });
  a.lat += st.lat;
  a.lng += st.lng;
  a.n += 1;
  return acc;
}, {})).map((a) => ({ name: a.name, lat: round6(a.lat / a.n), lng: round6(a.lng / a.n) }));

const BASEMAP = {
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors',
  region: [[round6(REGION[0]), round6(REGION[1])], [round6(REGION[2]), round6(REGION[3])]],
  buildings: outBuildings,
  green,
  water,
  streets,
  rail,
  platforms,
  stations: stationList,
};

const header = `// 自動生成ファイル: node scripts/gen-campus-basemap.mjs で再生成する（手で編集しない）
// キャンパスナビのイラスト地図用。出典: © OpenStreetMap contributors（ODbL）— 地図上に出典を表示すること。
// buildings: p=外周 h=中庭などの穴 s=スポットID o=同じ建物に入る他のスポット n=スポットのない建物の名前
//            l=この建物にラベルを出す c=ラベル位置 r=ラベルを置ける半径(m) z=高さ(m)（OSM に階数・高さがある建物だけ）
`;
fs.writeFileSync(OUT, `${header}export const BASEMAP = ${JSON.stringify(BASEMAP)};\n`);

const mapped = new Set(outBuildings.flatMap((b) => [b.s, ...(b.o || [])].filter(Boolean)));
console.log(`建物 ${outBuildings.length}件（スポット対応 ${outBuildings.filter((b) => b.s).length}件 / スポット ${mapped.size}件 / 高さあり ${outBuildings.filter((b) => b.z).length}件）`);
console.log(`緑地 ${green.length} / 水面 ${water.length} / 道路 ${Object.values(streets).reduce((a, v) => a + v.length, 0)} / 線路 ${rail.surface.length}+${rail.tunnel.length} / ホーム ${platforms.length} / 駅 ${stationList.map((s) => s.name).join('・')}`);
console.log(`建物に対応付けできなかったスポット: ${unmatched.length ? unmatched.join(', ') : 'なし'}`);
console.log(`出力: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
