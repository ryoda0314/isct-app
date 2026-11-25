// 形（三角形の並び）を地面の升目ごとに並べかえ、見えている升目だけを描く（2026-11-24。スマホでもなめらかに）。
// 今まで cb-extras はキャンパス全体（スマホでも 200 万〜300 万枚）を毎フレーム全部描いていた（後ろの建物も、遠くの小物も）。
// ・升目は平面で CHUNK_CELL_M m 四方。三角形の重心で升目を決める。升目は Z 字の順（となりの升目が並びでも近くなり、続けて描ける）
// ・升目の中は「大きい（いちばん長い辺 2 m 以上）→ 中くらい → 小さい（0.5 m 未満）→ 建物の中（interior）」の順
// ・描くとき：画面（視錐台）の外の升目は描かない。遠い升目は、小さい三角形・建物の中を描かない（drawLimits）
// ・並べかえは配列をその場で入れかえる（写しを作らない。スマホのメモリ）。並べかえるのは描く順だけで、形は変わらない
export const CHUNK_CELL_M = 32;
export const CHUNK_CLASSES = 4; // 0 大きい・1 中くらい・2 小さい・3 建物の中

// 2 つの整数（0〜65535）を Z 字の順の番号に
const spread = (v) => {
  v &= 0xffff;
  v = (v | (v << 8)) & 0x00ff00ff;
  v = (v | (v << 4)) & 0x0f0f0f0f;
  v = (v | (v << 2)) & 0x33333333;
  v = (v | (v << 1)) & 0x55555555;
  return v >>> 0;
};
const morton = (x, y) => (spread(x) | (spread(y) << 1)) >>> 0;

/**
 * 三角形を升目・大きさの順に並べかえる（data の配列をその場で書きかえる）。
 * @param data   { pos: Float32Array（頂点ごとに 3）, count: 頂点の数, ...ほかの配列 }
 * @param arrays [[配列, 頂点ごとの数], ...]：pos も含めて、いっしょに並べかえる配列
 * @param opts   { kxy: 描く座標の 1 m（x, y）, cellM, interior: [[頂点の始め, 終わり], ...]（建物の中の範囲）, smallM, bigM }
 * @returns { start: Uint32Array（升目の始めの頂点）, ends: Uint32Array（升目 × 4 つの大きさの終わりの頂点）, box: Float32Array（升目 × 6）, n: 升目の数, stats }
 */
export function chunkTriangles(data, arrays, { kxy, cellM = CHUNK_CELL_M, interior = null, smallM = 0.5, bigM = 2 } = {}) {
  const pos = data.pos;
  const T = Math.floor((data.count || 0) / 3);
  if (!pos || T < 2 || !(kxy > 0)) return null;
  const nv = T * 3;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cell = cellM * kxy;
  const gw = Math.min(65535, Math.floor((maxX - minX) / cell) + 1);
  const gh = Math.min(65535, Math.floor((maxY - minY) / cell) + 1);
  // 三角形ごとの大きさの種類（建物の中は 3）
  const cls = new Uint8Array(T);
  if (interior) for (const [a, b] of interior) cls.fill(3, Math.max(0, Math.floor(a / 3)), Math.min(T, Math.ceil(b / 3)));
  const inv = 1 / kxy, small2 = smallM * smallM, big2 = bigM * bigM;
  const key = new Uint32Array(T);
  let maxKey = 0;
  for (let t = 0; t < T; t++) {
    const o = t * 9;
    const x0 = pos[o], y0 = pos[o + 1], z0 = pos[o + 2];
    const x1 = pos[o + 3], y1 = pos[o + 4], z1 = pos[o + 5];
    const x2 = pos[o + 6], y2 = pos[o + 7], z2 = pos[o + 8];
    if (cls[t] !== 3) {
      const ax = (x1 - x0) * inv, ay = (y1 - y0) * inv, az = z1 - z0;
      const bx = (x2 - x1) * inv, by = (y2 - y1) * inv, bz = z2 - z1;
      const cx = (x0 - x2) * inv, cy = (y0 - y2) * inv, cz = z0 - z2;
      const e = Math.max(ax * ax + ay * ay + az * az, bx * bx + by * by + bz * bz, cx * cx + cy * cy + cz * cz);
      cls[t] = e >= big2 ? 0 : e >= small2 ? 1 : 2;
    }
    let gx = Math.floor(((x0 + x1 + x2) / 3 - minX) / cell);
    let gy = Math.floor(((y0 + y1 + y2) / 3 - minY) / cell);
    gx = gx < 0 ? 0 : gx >= gw ? gw - 1 : gx;
    gy = gy < 0 ? 0 : gy >= gh ? gh - 1 : gy;
    const k = morton(gx, gy) * 4 + cls[t];
    key[t] = k;
    if (k > maxKey) maxKey = k;
  }
  // 数えて並べる（counting sort）：order[新しい番号] = もとの三角形
  const counts = new Uint32Array(maxKey + 2);
  for (let t = 0; t < T; t++) counts[key[t] + 1]++;
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
  const order = new Uint32Array(T);
  const fill = counts.slice(0, maxKey + 1);
  for (let t = 0; t < T; t++) order[fill[key[t]]++] = t;
  // 並べかえ：配列ごとに新しい配列へ集めて（読む側はもとの並びのかたまりごとなので速い）、data の配列を差しかえる。
  // 写しは配列 1 つぶんずつ（集め終わったら古い配列は手放す）
  for (const [name, per] of arrays) {
    const a = data[name];
    if (!a || a.length < nv * per) continue;
    const s = per * 3;
    const b = new a.constructor(a.length);
    for (let j = 0; j < T; j++) {
      const f = order[j] * s, d = j * s;
      if (s === 9) {
        b[d] = a[f]; b[d + 1] = a[f + 1]; b[d + 2] = a[f + 2]; b[d + 3] = a[f + 3]; b[d + 4] = a[f + 4];
        b[d + 5] = a[f + 5]; b[d + 6] = a[f + 6]; b[d + 7] = a[f + 7]; b[d + 8] = a[f + 8];
      } else for (let c = 0; c < s; c++) b[d + c] = a[f + c];
    }
    data[name] = b;
  }
  const pos2 = data.pos;
  // 升目ごとの範囲（頂点の番号）と、囲む箱
  const cellsUsed = [];
  for (let k = 0; k <= maxKey; k += 4) {
    const a = counts[k], b = counts[Math.min(k + 4, maxKey + 1)];
    if (b > a) cellsUsed.push(k);
  }
  const n = cellsUsed.length;
  const start = new Uint32Array(n), ends = new Uint32Array(n * 4), box = new Float32Array(n * 6);
  const stats = [0, 0, 0, 0];
  cellsUsed.forEach((k, ci) => {
    start[ci] = counts[k] * 3;
    for (let c = 0; c < 4; c++) {
      const e = counts[Math.min(k + c + 1, maxKey + 1)];
      ends[ci * 4 + c] = e * 3;
      stats[c] += e - counts[Math.min(k + c, maxKey + 1)];
    }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = start[ci]; v < ends[ci * 4 + 3]; v++) {
      const x = pos2[v * 3], y = pos2[v * 3 + 1], z = pos2[v * 3 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    box.set([x0, y0, z0, x1, y1, z1], ci * 6);
  });
  return { start, ends, box, n, stats };
}

// 行列 M（描く座標 → クリップ座標）から視錐台の 6 面（ax + by + cz + d >= 0 が中）
export function frustumOf(M) {
  const planes = [];
  for (let row = 0; row < 3; row++)
    for (const sign of [-1, 1]) planes.push([0, 4, 8, 12].map((col) => M[col + 3] + sign * M[col + row]));
  return planes;
}
const boxIn = (b, o, planes) => {
  for (const [x, y, z, w] of planes) if (x * b[o + (x < 0 ? 0 : 3)] + y * b[o + (y < 0 ? 1 : 4)] + z * b[o + (z < 0 ? 2 : 5)] + w < 0) return false;
  return true;
};

/**
 * 描く範囲（[始めの頂点, 頂点の数] の並び。となり合うものはつなぐ）。
 * @param ch      chunkTriangles の結果
 * @param planes  frustumOf(M)
 * @param cam     カメラの位置（描く座標。cameraOf(M)）。null なら距離で間引かない
 * @param kxy     描く座標の 1 m
 * @param lim     { mid, small, inside }：中くらい・小さい三角形・建物の中を描く、升目までの距離（m）
 * @param out     使い回す配列
 * @param gap     これより短いすき間（頂点）は続けて描く（描く回数を減らす。すき間の形も描かれるだけ）
 */
export function chunkRanges(ch, planes, cam, kxy, lim, out = [], gap = 3000) {
  out.length = 0;
  if (!ch) return out;
  const { start, ends, box, n } = ch;
  const inv = 1 / kxy;
  let a = -1, b = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    if (!boxIn(box, o, planes)) continue;
    let level = 3;
    if (cam) {
      const dx = Math.max(box[o] - cam[0], 0, cam[0] - box[o + 3]) * inv;
      const dy = Math.max(box[o + 1] - cam[1], 0, cam[1] - box[o + 4]) * inv;
      const dz = Math.max(box[o + 2] - cam[2], 0, cam[2] - box[o + 5]);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      level = d < lim.inside ? 3 : d < lim.small ? 2 : d < lim.mid ? 1 : 0;
    }
    const s = start[i], e = ends[i * 4 + level];
    if (e <= s) continue;
    if (a >= 0 && s - b <= gap) b = Math.max(b, e);
    else {
      if (a >= 0) out.push(a, b - a);
      a = s;
      b = e;
    }
  }
  if (a >= 0) out.push(a, b - a);
  return out;
}
