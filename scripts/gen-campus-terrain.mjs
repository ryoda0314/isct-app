// キャンパスナビの3D表示で使う「地形（標高）」のタイルを、国土地理院の標高タイルから作る。
//   実行: node scripts/gen-campus-terrain.mjs（先に gen-campus-basemap.mjs で地図データを作っておく）
//   出力: public/map-dem/{z}/{x}/{y}.png（Terrarium 形式の raster-dem。自動生成。手で編集しない）
//         campus-sns/campusTerrain.js（タイルの範囲とズーム。自動生成）
//
// 元データ: 基盤地図情報 数値標高モデル 5mメッシュ（DEM5A、航空レーザ測量。建物・木を除いた地面の高さ）。
// 出典: 国土地理院の標高タイルを加工して作成 — 地図上に出典を表示すること。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'map-dem');
const OUT_JS = path.join(ROOT, 'campus-sns', 'campusTerrain.js');
const SRC = 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png';
const UA = 'isct-campus-app-terrain-builder/1.0';
const Z = 15; // 元データ（DEM5A）のいちばん細かいズーム。1px ≒ 3.9m
const MIN_Z = 11;
const MARGIN_M = 400; // 地図データの外側もこれだけ地形を用意する（傾けたとき奥が見えるので）
const QUANT = 16; // 高さを 1/16 m に丸める（PNG を小さくするため）

// ── 地図データ（campusBasemapData.js）の範囲 ──
const bm = fs.readFileSync(path.join(ROOT, 'campus-sns', 'campusBasemapData.js'), 'utf8');
const m = bm.match(/"region":\[\[([\d.]+),([\d.]+)\],\[([\d.]+),([\d.]+)\]\]/);
if (!m) throw new Error('campusBasemapData.js に region がありません');
const [S0, W0, N0, E0] = m.slice(1).map(Number);
const lat0 = (S0 + N0) / 2;
const dLat = MARGIN_M / 110950;
const dLng = MARGIN_M / (111320 * Math.cos((lat0 * Math.PI) / 180));
const EXT = { s: S0 - dLat, w: W0 - dLng, n: N0 + dLat, e: E0 + dLng };

const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const tilesAt = (z) => ({ x0: tileX(EXT.w, z), x1: tileX(EXT.e, z), y0: tileY(EXT.n, z), y1: tileY(EXT.s, z) });

// ── 元データを取ってきて、1枚の大きな標高の格子（ズーム 15 の px 単位）にする ──
const T15 = tilesAt(Z);
const MW = (T15.x1 - T15.x0 + 1) * 256;
const MH = (T15.y1 - T15.y0 + 1) * 256;
const grid = new Float32Array(MW * MH).fill(NaN);

async function fetchTile(x, y) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${SRC}/${Z}/${x}/${y}.png`, { headers: { 'User-Agent': UA } });
      if (res.status === 404) return null; // データの無いところ（海など）
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      console.warn(`  ${x}/${y}: ${res.status}`);
    } catch (e) {
      console.warn(`  ${x}/${y}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`標高タイル ${Z}/${x}/${y} を取得できませんでした`);
}

console.log(`元データ: ズーム ${Z} の ${(T15.x1 - T15.x0 + 1) * (T15.y1 - T15.y0 + 1)} 枚`);
for (let ty = T15.y0; ty <= T15.y1; ty++) {
  for (let tx = T15.x0; tx <= T15.x1; tx++) {
    const buf = await fetchTile(tx, ty);
    if (!buf) continue;
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const ox = (tx - T15.x0) * 256;
    const oy = (ty - T15.y0) * 256;
    for (let py = 0; py < 256; py++) {
      for (let px = 0; px < 256; px++) {
        const i = (py * info.width + px) * info.channels;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r === 128 && g === 0 && b === 0) continue; // 値なし（建物の陰・水面など）
        let v = r * 65536 + g * 256 + b;
        if (v >= 2 ** 23) v -= 2 ** 24;
        grid[(oy + py) * MW + ox + px] = v * 0.01;
      }
    }
  }
}

// ── 値の無いところを、まわりの値で埋める（外側へ少しずつ広げる）──
let holes = 0;
for (const v of grid) if (Number.isNaN(v)) holes++;
console.log(`値なし: ${holes} px（${((holes / grid.length) * 100).toFixed(1)}%）を埋める`);
for (let pass = 0; holes > 0; pass++) {
  if (pass > 2000) throw new Error('値なしを埋めきれません（元データがほとんど無い？）');
  const next = grid.slice();
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const k = y * MW + x;
      if (!Number.isNaN(grid[k])) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        const v = grid[yy * MW + xx];
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      if (n) { next[k] = s / n; holes--; }
    }
  }
  grid.set(next);
}

// ── 少しぼかす（建物を取り除いた跡の細かい凸凹で、地面がざらついて見えないように）──
function blur(src, w, h, sigma) {
  const r = Math.ceil(sigma * 2.5);
  const k = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[y * w + cl(x + i, w - 1)] * k[i + r];
    tmp[y * w + x] = s / ks;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[cl(y + i, h - 1) * w + x] * k[i + r];
    out[y * w + x] = s / ks;
  }
  return out;
}
const dem = blur(grid, MW, MH, 2);
let lo = Infinity, hi = -Infinity;
for (const v of dem) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
console.log(`標高: ${lo.toFixed(1)} 〜 ${hi.toFixed(1)} m`);

// ── タイルに切り出す（ズーム 15 はそのまま、それより引いたズームは平均）。範囲の外は端の値を延ばす ──
const at15 = (gx, gy) => {
  const x = Math.min(MW - 1, Math.max(0, gx - T15.x0 * 256));
  const y = Math.min(MH - 1, Math.max(0, gy - T15.y0 * 256));
  return dem[y * MW + x];
};
// Terrarium: 高さ = R*256 + G + B/256 - 32768
const encode = (h) => {
  const v = Math.round((h + 32768) * QUANT) / QUANT;
  return [Math.floor(v / 256), Math.floor(v) % 256, Math.round((v - Math.floor(v)) * 256)];
};

// 前回の出力を消す（fs.rmSync は日本語を含むパスで黙って何もしないことがあるので、1つずつ消す）
const removeTree = (p) => {
  if (!fs.existsSync(p)) return;
  for (const d of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, d.name);
    if (d.isDirectory()) removeTree(q);
    else fs.unlinkSync(q);
  }
  fs.rmdirSync(p);
};
removeTree(OUT_DIR);
let count = 0;
let bytes = 0;
for (let z = MIN_Z; z <= Z; z++) {
  const T = tilesAt(z);
  const f = 2 ** (Z - z);
  for (let tx = T.x0; tx <= T.x1; tx++) {
    for (let ty = T.y0; ty <= T.y1; ty++) {
      const px = Buffer.alloc(256 * 256 * 3);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const gx0 = (tx * 256 + x) * f;
          const gy0 = (ty * 256 + y) * f;
          let s = 0;
          for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += at15(gx0 + i, gy0 + j);
          px.set(encode(s / (f * f)), (y * 256 + x) * 3);
        }
      }
      const dir = path.join(OUT_DIR, String(z), String(tx));
      fs.mkdirSync(dir, { recursive: true });
      const png = await sharp(px, { raw: { width: 256, height: 256, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(path.join(dir, `${ty}.png`), png);
      count++;
      bytes += png.length;
    }
  }
}
console.log(`出力: ${count} 枚 / ${(bytes / 1024).toFixed(0)} KB → ${path.relative(ROOT, OUT_DIR)}`);

const r6 = (v) => Math.round(v * 1e6) / 1e6;
fs.writeFileSync(OUT_JS, `// 自動生成: node scripts/gen-campus-terrain.mjs（手で編集しない）
// 3D表示の地形タイル（public/map-dem）の範囲。出典: 国土地理院の標高タイルを加工して作成
export const TERRAIN = { path: "/map-dem", minzoom: ${MIN_Z}, maxzoom: ${Z}, bounds: [${r6(EXT.w)}, ${r6(EXT.s)}, ${r6(EXT.e)}, ${r6(EXT.n)}], min: ${lo.toFixed(1)}, max: ${hi.toFixed(1)} };
`);
console.log(`出力: ${path.relative(ROOT, OUT_JS)}`);
