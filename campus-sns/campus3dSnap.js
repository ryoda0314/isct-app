// 3D構造物エディタ（/editor/3d）で、置く点を既存の道に合わせる（スナップ）。
// 道・通路・線路の線を平面の m 座標で持ち、近くの「線の頂点（交差点・曲がり角・端）」と「線の上でいちばん近い点」を探す
import { toLngLat, toXY } from "./campus3dFeatures.js";

const CELL = 40; // 探す範囲をしぼる升目（m）
const cellKey = (cx, cy) => `${cx},${cy}`;

/**
 * @param lines  [{ k: 種類, pts: [[lat, lng], ...] }]
 */
export function buildSnapIndex(lines) {
  const segs = [];
  const grid = new Map();
  lines.forEach(({ k, pts }) => {
    const xy = pts.map(([lat, lng]) => toXY([lng, lat]));
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1];
      const b = xy[i];
      const id = segs.push({ a, b, aLL: [pts[i - 1][1], pts[i - 1][0]], bLL: [pts[i][1], pts[i][0]], k }) - 1;
      const cx0 = Math.floor(Math.min(a[0], b[0]) / CELL);
      const cx1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const cy0 = Math.floor(Math.min(a[1], b[1]) / CELL);
      const cy1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = cellKey(cx, cy);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(id);
        }
      }
    }
  });
  return { segs, grid };
}

// 平面の点 p から r m の範囲にかかる線分
function segmentsNear(index, p, r) {
  const ids = new Set();
  for (let cx = Math.floor((p[0] - r) / CELL); cx <= Math.floor((p[0] + r) / CELL); cx++) {
    for (let cy = Math.floor((p[1] - r) / CELL); cy <= Math.floor((p[1] + r) / CELL); cy++) {
      (index.grid.get(cellKey(cx, cy)) || []).forEach((id) => ids.add(id));
    }
  }
  return [...ids].map((id) => index.segs[id]);
}

const ALIGN = Math.cos((35 * Math.PI) / 180);
/**
 * 折れ線（[[lng, lat]...]）の各点を、近く（maxDist m 以内）の線に合わせる。
 * 線の頂点が 2.5m 以内ならその頂点へ。でなければ、向きのそろった（35°以内）線の延長上へ垂直に寄せる（垂直に交わる線には引っぱられない）
 * @returns { coords, moved（動かした点の数） }
 */
export function alignToLines(index, coords, maxDist = 8) {
  const xy = coords.map(toXY);
  let moved = 0;
  const out = coords.map((c, i) => {
    const p = xy[i];
    const a = xy[Math.max(0, i - 1)];
    const b = xy[Math.min(xy.length - 1, i + 1)];
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
    let best = null;
    for (const s of segmentsNear(index, p, maxDist)) {
      [[s.a, s.aLL], [s.b, s.bLL]].forEach(([q, qLL]) => {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d <= 2.5 && (!best || !best.vertex || d < best.d)) best = { vertex: true, d, ll: qLL };
      });
      const ux = s.b[0] - s.a[0];
      const uy = s.b[1] - s.a[1];
      const L = Math.hypot(ux, uy);
      if (L < 1e-6 || Math.abs((ux * dir[0] + uy * dir[1]) / L) < ALIGN) continue;
      const t = ((p[0] - s.a[0]) * ux + (p[1] - s.a[1]) * uy) / (L * L);
      const q = [s.a[0] + ux * t, s.a[1] + uy * t];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= maxDist && (!best || (!best.vertex && d < best.d))) best = { vertex: false, d, ll: toLngLat(q) };
    }
    if (!best) return c;
    moved++;
    return best.ll;
  });
  return { coords: out, moved };
}

/**
 * ll（[lng, lat]）から r m 以内で、いちばん近い頂点と、いちばん近い線の上の点。
 * @returns { vertex: { ll, d, k } | null, edge: { ll, d, k, seg: [[lng, lat], [lng, lat]] } | null }
 */
export function nearestOnRoads(index, ll, r) {
  const p = toXY(ll);
  const ids = new Set();
  for (let cx = Math.floor((p[0] - r) / CELL); cx <= Math.floor((p[0] + r) / CELL); cx++) {
    for (let cy = Math.floor((p[1] - r) / CELL); cy <= Math.floor((p[1] + r) / CELL); cy++) {
      (index.grid.get(cellKey(cx, cy)) || []).forEach((id) => ids.add(id));
    }
  }
  let vertex = null;
  let edge = null;
  ids.forEach((id) => {
    const s = index.segs[id];
    [[s.a, s.aLL], [s.b, s.bLL]].forEach(([q, qLL]) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= r && (!vertex || d < vertex.d)) vertex = { ll: qLL, d, k: s.k };
    });
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return;
    const t = Math.min(1, Math.max(0, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2));
    const q = [s.a[0] + dx * t, s.a[1] + dy * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= r && (!edge || d < edge.d)) edge = { ll: toLngLat(q), d, k: s.k, seg: [s.aLL, s.bLL] };
  });
  return { vertex, edge };
}
