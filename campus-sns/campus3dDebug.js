// 3D 地図のデバッグ用の目印（DOM も MapLibre も使わない計算だけ。画面と保存は components/MapDebugMarks.jsx）。
// - 描く座標（campus3dMesh の worldOf：x・y はメルカトルを MERC_SCALE 倍、z は標高 m）と画面の px のあいだを、描いたときの行列
//   （campus3dLayer の extras レイヤーの matrix）で行き来する
// - 画面の点からの光線が、描いた三角形（buildMesh の結果。殻の段は裏を向く面を捨てる）と地形のどちらに先に当たるか
// - 目印の点の近くの構造物（id・種類・名前。階の壁・家具・階段、建物の屋根の板の番号も）
// - 書き出す JSON
import { ORIGIN, MERC_SCALE, worldOf } from "./campus3dMesh.js";
import { isArea, isPoint, pointInRing, toLngLat, toXY } from "./campus3dFeatures.js";
import { floorG0, stairGeom } from "./campus3dInterior.js";

export const MARKS_KEY = "cb3DebugMarks"; // localStorage：目印の並び
export const MARKS_VERSION = 1;

// 描く座標の 1 が何 m か（x・y。この緯度で約 38m）
const PER_UNIT = (() => {
  const o = worldOf([0, 0]);
  const e = worldOf([1, 0]);
  return 1 / Math.hypot(e[0] - o[0], e[1] - o[1]);
})();

// 4×4 の行列（列の順）の逆。逆がなければ null
export function invert4(m) {
  const a = Array.from(m);
  const inv = new Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (!det || !Number.isFinite(det)) return null;
  return inv.map((v) => v / det);
}
const mul4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);

// 描く座標の点 p（[X, Y, z]）→ 画面の px（W×H の CSS px）。カメラの後ろなら null
export function projectPoint(M, p, W, H) {
  if (!M) return null;
  const c = mul4(M, [p[0], p[1], p[2], 1]);
  if (!(c[3] > 1e-9)) return null;
  return { x: ((c[0] / c[3] + 1) / 2) * W, y: ((1 - c[1] / c[3]) / 2) * H, depth: c[2] / c[3] };
}
// 画面の px（sx, sy）を通る光線：{ o（近い面の点）, d（遠い面へ向き。長さは近い面から遠い面まで） }（描く座標）
export function screenRay(M, sx, sy, W, H) {
  const inv = M && invert4(M);
  if (!inv) return null;
  const nx = (2 * sx) / W - 1;
  const ny = 1 - (2 * sy) / H;
  const a = mul4(inv, [nx, ny, -1, 1]);
  const b = mul4(inv, [nx, ny, 1, 1]);
  if (!a[3] || !b[3]) return null;
  const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  const f = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  return { o, d: [f[0] - o[0], f[1] - o[1], f[2] - o[2]] };
}

// 光線と三角形（Möller–Trumbore）。光線の t（0〜1：近い面〜遠い面）か null
function hitTri(o, d, P, i) {
  const ax = P[i], ay = P[i + 1], az = P[i + 2];
  const e1x = P[i + 3] - ax, e1y = P[i + 4] - ay, e1z = P[i + 5] - az;
  const e2x = P[i + 6] - ax, e2y = P[i + 7] - ay, e2z = P[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-18) return null;
  const inv = 1 / det;
  const sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0 ? t : null;
}
// 描いた三角形（buildMesh の結果）のうち、光線がいちばん近くで当たるもの：{ t, pass, tri, normal（東・北・上） } か null。
// 殻の段（cull）は描くときと同じく、カメラから見て裏を向く面は当たらない。passes で段をしぼれる
export const MESH_PASSES = ["", "cull", "thin", "glass", "veil", "screen", "haze"];
export function raycastMesh(mesh, ray, passes = MESH_PASSES) {
  if (!mesh || !ray) return null;
  const { o, d } = ray;
  const dm = [d[0] * PER_UNIT, d[1] * PER_UNIT, d[2]]; // m の向き（y は南が +）
  let best = null;
  for (const pass of passes) {
    const m = pass ? mesh[pass] : mesh;
    if (!m?.count) continue;
    const P = m.pos;
    const N = m.nrm;
    for (let i = 0; i + 8 < m.count * 3; i += 9) {
      if (pass === "cull" && N && N[i] * dm[0] + N[i + 1] * dm[1] + N[i + 2] * dm[2] > 0) continue;
      const t = hitTri(o, d, P, i);
      if (t != null && (!best || t < best.t)) best = { t, pass, tri: i / 9, normal: N ? [N[i], -N[i + 1], N[i + 2]] : null };
    }
  }
  return best;
}
export const pointOnRay = (ray, t) => [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t];
// 光線の上で、描く座標の点 p にいちばん近いところの t
export const tOnRay = (ray, p) => {
  const dm = [ray.d[0] * PER_UNIT, ray.d[1] * PER_UNIT, ray.d[2]];
  const v = [(p[0] - ray.o[0]) * PER_UNIT, (p[1] - ray.o[1]) * PER_UNIT, p[2] - ray.o[2]];
  return (v[0] * dm[0] + v[1] * dm[1] + v[2] * dm[2]) / (dm[0] * dm[0] + dm[1] * dm[1] + dm[2] * dm[2]);
};
// 光線が表示の地面（surfaceAt：掘ったあとの地面）に当たる t（tMax より先・maxM m より先は見ない）。0.25m ずつ進んで、越えたら半分ずつ詰める
export function terrainHit(ray, surfaceAt, tMax = 1, { stepM = 0.25, maxM = 600 } = {}) {
  const Lm = Math.hypot(ray.d[0] * PER_UNIT, ray.d[1] * PER_UNIT, ray.d[2]);
  if (!(Lm > 0)) return null;
  const tEnd = Math.min(tMax, maxM / Lm);
  const dt = stepM / Lm;
  const below = (t) => {
    const p = pointOnRay(ray, t);
    const w = fromWorld(p);
    const g = surfaceAt(toLngLat([w.x, w.y]));
    return Number.isFinite(g) && p[2] <= g;
  };
  let prev = 0;
  for (let t = dt; t <= tEnd + 1e-12; t += dt) {
    if (below(t)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prev = t;
  }
  return null;
}
// 描く座標 → { lng, lat, x, y（平面の m）, z（標高） }
export function fromWorld(p) {
  const lng = (p[0] / MERC_SCALE + ORIGIN[0]) * 360 - 180;
  const my = p[1] / MERC_SCALE + ORIGIN[1];
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
  const [x, y] = toXY([lng, lat]);
  return { lng, lat, x, y, z: p[2] };
}
export const toWorld = (x, y, z) => [...worldOf([x, y]), z];

// ── 近くの構造物 ──
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
};
const lineDist = (p, pts, closed = false) => {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(p, pts[i], pts[i + 1]));
  if (closed && pts.length > 2) d = Math.min(d, segDist(p, pts[pts.length - 1], pts[0]));
  return d;
};
const areaDist = (p, ring) => (pointInRing(p[0], p[1], ring) ? 0 : lineDist(p, ring, true));
const r2 = (v) => Math.round(v * 100) / 100;
/**
 * 点（平面の x, y と標高 z）の近く（within m 以内）の構造物：[{ id, type, kind, name, dist, part }]（近い順、max 個まで）。
 * 階（floor）は、z がその階の床〜天井にかかるときだけ、中の壁（walls[i]）・家具（items[i]）・階段（stairs[i]）も。
 * 屋根の板（buildings の boards）は、点を含んで上の面が z に近い板の番号も
 */
export function nearFeatures(features, x, y, z, groundAt, { within = 1.5, max = 10 } = {}) {
  const p = [x, y];
  const out = [];
  const add = (f, dist, part = null, extra = {}) => out.push({ id: f.id, type: f.type, kind: f.kind || null, name: f.name || null, dist: r2(dist), ...(part ? { part } : {}), ...extra });
  for (const f of features) {
    if (!f?.coords?.length) continue;
    const pts = f.coords.map(toXY);
    if (f.type === "floor") {
      const g0 = floorG0(f, groundAt);
      if (!Number.isFinite(g0)) continue;
      const zf = g0 + f.z;
      if (z < zf - f.slab - 0.5 || z > zf + f.height + 0.5) continue;
      const d0 = areaDist(p, pts);
      if (d0 > within) continue;
      add(f, d0, null, { level: f.level, floorZ: r2(zf) });
      (f.walls || []).forEach((w, i) => {
        const d = lineDist(p, w.coords.map(toXY));
        if (d <= 1) add(f, d, `walls[${i}]`, { partKind: w.kind });
      });
      (f.items || []).forEach((it, i) => {
        const d = areaDist(p, it.coords.map(toXY));
        if (d <= 0.6) add(f, d, `items[${i}]`, { partKind: it.kind });
      });
      (f.stairs || []).forEach((s, i) => {
        const G = stairGeom(s, zf);
        const d = areaDist(p, G.ring);
        if (d <= 0.6) add(f, d, `stairs[${i}]`, { partKind: s.kind || null });
      });
      continue;
    }
    let d;
    if (isPoint(f.type)) d = Math.hypot(pts[0][0] - x, pts[0][1] - y);
    else if (isArea(f.type)) d = areaDist(p, pts);
    else d = Math.max(0, lineDist(p, pts) - (f.width || f.thickness || 0) / 2);
    if (d > within) continue;
    add(f, d);
    // 屋根の板：点を含む板のうち、上の面（地面から top）がいちばん z に近いもの
    if (f.type === "building" && Array.isArray(f.boards) && f.boards.length) {
      const g = groundAt(f.groundRef || toLngLat(pts[0]));
      let bestB = null;
      f.boards.forEach((b, i) => {
        const r = b.coords.map(toXY);
        if (!pointInRing(x, y, r) || !Number.isFinite(g)) return;
        const dz = Math.abs(g + b.top - z);
        if (!bestB || dz < bestB.dz) bestB = { i, dz, top: b.top, kind: b.kind || null };
      });
      if (bestB && bestB.dz < 1.5) add(f, d, `boards[${bestB.i}]`, { partKind: bestB.kind, boardTop: bestB.top });
    }
  }
  out.sort((a, b) => a.dist - b.dist || (a.part ? 1 : 0) - (b.part ? 1 : 0));
  return out.slice(0, max);
}

// 書き出す JSON（目印の並びと、そのときのページ）。画像（image）は入れるかどうか選べる
export function marksJSON(marks, { page = "", images = true } = {}) {
  const now = new Date();
  return JSON.stringify({
    kind: "campus-map-3d-debug-marks",
    version: MARKS_VERSION,
    exported: now.toISOString(),
    page,
    note: "x, y は平面の m（campus3dFeatures の toXY）、z は標高 m。ground は地面（掘る前）、surface は表示の地面（掘ったあと）",
    marks: marks.map((m) => (images ? m : { ...m, image: undefined })),
  }, null, 1);
}
// 読み込んだ JSON から目印の並び（形がおかしいものは捨てる）
export function parseMarks(text) {
  const d = JSON.parse(text);
  const list = Array.isArray(d) ? d : d?.marks;
  if (!Array.isArray(list)) throw new Error("目印の並びがない");
  return list.filter((m) => m && m.at && Number.isFinite(+m.at.x) && Number.isFinite(+m.at.y) && Number.isFinite(+m.at.z));
}
