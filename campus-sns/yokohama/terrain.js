// 国土地理院の標高タイル（DEM5A、航空レーザ測量由来）をキャンパスの座標系へ再標本化。
// https://maps.gsi.go.jp/development/ichiran.html#dem
// 神奈川県「令和4年度 横浜北部、川崎3次元点群データ」も公開されている。
// https://catalog.opendata.pref.kanagawa.jp/dataset/efdc22ca9fc4e3d12b8059824f4b1626
// 配信用には分類済みの地表標高を使い、点群に含まれる屋根・樹冠を地面として扱わない。
import { grid, samples } from "./terrainGrid.js";

export const terrainGrid = grid;
export const elevationDatum = 50; // Absolute elevation in metres represented by scene y = 0.
const heights = new Int16Array(grid.width * grid.depth);
const bytes = atob(samples);
let cursor = 0;
for (let row = 0; row < grid.depth; row++) {
  let absolute = 0;
  for (let col = 0; col < grid.width; col++) {
    let shift = 0, value = 0, byte;
    do {
      byte = bytes.charCodeAt(cursor++);
      value |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    absolute += (value >>> 1) ^ -(value & 1);
    heights[row * grid.width + col] = absolute;
  }
}

export function groundAt(x, z) {
  const gx = Math.max(0, Math.min(grid.width - 1, (x - grid.xMin) / grid.step));
  const gz = Math.max(0, Math.min(grid.depth - 1, (z - grid.zMin) / grid.step));
  const col = Math.min(grid.width - 2, Math.floor(gx));
  const row = Math.min(grid.depth - 2, Math.floor(gz));
  const a = gx - col, b = gz - row, i = row * grid.width + col;
  // Sample the very same two triangles used by the terrain mesh (NW–SE diagonal).
  const diagonal = heights[i + grid.width + 1];
  const h = a > b
    ? heights[i] * (1-a) + heights[i+1] * (a-b) + diagonal*b
    : heights[i] * (1-b) + heights[i+grid.width] * (b-a) + diagonal*a;
  return h * 0.1 - elevationDatum;
}
