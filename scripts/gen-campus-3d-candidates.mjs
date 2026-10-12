// 3D表示のエディタ（/editor/3d）で「OSM の候補」として出す、橋・階段・建物の通り抜け・壁/擁壁を OpenStreetMap から取り出す。
//   実行: node scripts/gen-campus-3d-candidates.mjs（先に gen-campus-basemap.mjs で地図データを作っておく）
//   出力: public/map-3d/osm-candidates.json（自動生成。手で編集しない）
// 候補はそのままでは地図に出ない。エディタで選んで「取り込む」と、public/map-3d/features.json に入る。
// 出典: © OpenStreetMap contributors（ODbL）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'map-3d', 'osm-candidates.json');
const UA = 'isct-campus-app-3d-candidates/1.0';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bm = fs.readFileSync(path.join(ROOT, 'campus-sns', 'campusBasemapData.js'), 'utf8');
const m = bm.match(/"region":\[\[([\d.]+),([\d.]+)\],\[([\d.]+),([\d.]+)\]\]/);
if (!m) throw new Error('campusBasemapData.js に region がありません');
const bbox = m.slice(1).map(Number).join(',');

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

const query = `[out:json][timeout:90];(
  way["highway"]["bridge"]["bridge"!="no"](${bbox});
  way["railway"~"^(rail|subway|light_rail)$"]["bridge"]["bridge"!="no"](${bbox});
  way["tunnel"="building_passage"](${bbox});
  way["highway"="steps"](${bbox});
  way["barrier"~"^(wall|retaining_wall)$"](${bbox});
);out tags geom;`;

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const WALK = /^(footway|path|steps|pedestrian|cycleway|corridor)$/;
// 道の種類ごとの幅の目安（m）。OSM に width があればそちら
const widthOf = (t) => num(t.width) || (t.railway ? 4.5 : WALK.test(t.highway) ? (t.highway === 'pedestrian' ? 4 : 3) : t.highway === 'service' ? 5 : /^(tertiary|secondary|primary)/.test(t.highway) ? 8 : 6);
const round7 = (v) => Math.round(v * 1e7) / 1e7;
const KEEP = ['name', 'bridge:name', 'highway', 'railway', 'bridge', 'tunnel', 'layer', 'level', 'width', 'height', 'maxheight', 'barrier'];

console.log('OSM から橋・階段・通り抜け・壁を取得中…');
const json = await overpass(query);
const candidates = [];
for (const e of json.elements) {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const t = e.tags || {};
  const coords = e.geometry.map((p) => [round7(p.lon), round7(p.lat)]);
  const base = { osm: `way/${e.id}`, name: t.name || t['bridge:name'] || '', coords, tags: Object.fromEntries(KEEP.filter((k) => t[k] != null).map((k) => [k, t[k]])) };
  if (t.tunnel === 'building_passage') {
    candidates.push({ ...base, type: 'passage', width: num(t.width) || (WALK.test(t.highway) ? 3 : 4), height: num(t.maxheight) || num(t.height) || 3 });
  } else if (t.barrier) {
    candidates.push({ ...base, type: 'wall', height: num(t.height) || (t.barrier === 'retaining_wall' ? 1.2 : 1.8) });
  } else if (t.bridge) {
    const layer = parseInt(t.layer, 10) || 1;
    // layer 2 以上は、地面から浮いた渡り廊下など（各点を 4m × (layer-1) の高さに）。1 は両端が地面
    const z = layer >= 2 ? coords.map(() => 4 * (layer - 1)) : coords.map(() => null);
    candidates.push({ ...base, type: 'bridge', width: widthOf(t), surface: t.railway ? 'rail' : WALK.test(t.highway) ? 'walk' : 'street', z });
  } else if (t.highway === 'steps') {
    candidates.push({ ...base, type: 'stairs', width: num(t.width) || 2 });
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), attribution: '© OpenStreetMap contributors', candidates })}\n`);
const count = (k) => candidates.filter((c) => c.type === k).length;
console.log(`出力: ${path.relative(ROOT, OUT)}（橋 ${count('bridge')} / 階段 ${count('stairs')} / 通り抜け ${count('passage')} / 壁 ${count('wall')}）`);
