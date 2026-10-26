// 路面の塗りと路面標示（交差点を作る）。手で描いた「道路」「路面」「白線」「横断歩道」を、地面に貼る多角形（GeoJSON）にする。
// 3D表示では MapLibre の fill レイヤーが地形に貼って描く（坂でも地面に沿う）。寸法は日本の路面標示に合わせる：
//   横断歩道 … 縞の幅 45cm・すき間 45cm、縞の長さ＝横断歩道の幅（既定 4m）。描く線は「渡る向き」（歩道から歩道へ）
//   停止線 45cm、車線の線・中央線 15cm、破線は 5m 引いて 5m あける、導流帯（ゼブラ）は縁 15cm＋45° の縞 45cm を 1.5m おき
// 道路は中心線と幅で持ち、交差点は自動：車道は重ねて1つにし、内へ折れる角を半径 CORNER_R で丸める。歩道は車道を除いたところ。
//   中央線・車線境界線・外側線は、交わる道の車道＋CORNER_R の手前と、横断歩道の上で切る。T字路の突き当たる側の道は、
//   相手の車道へ 1m だけ入るとして切る（相手の中央線は通したまま、外側線だけ切れる）。まっすぐ続く道どうしは切らない
// 道路の重ね合わせ（union・difference）には polygon-clipping を使う（paintFeatures に渡す。なければ道路は描かない）
import { cumulative, offsetLine, ringArea, toLngLat, toXY } from "./campus3dFeatures.js";

// 路面の種類（塗る色は明るい地図・暗い地図それぞれ）
export const SURFACE_KINDS = {
  road: { label: "車道", light: "#8d959d", dark: "#3a4149" },
  walk: { label: "歩道", light: "#e6e8e3", dark: "#4a5058" },
  plaza: { label: "広場", light: "#cdb49a", dark: "#5f5245" },
  red: { label: "カラー舗装", light: "#b9665b", dark: "#7a3f39" },
  green: { label: "植え込み", light: "#a9cf95", dark: "#3f5a39" },
  zebra: { label: "導流帯", light: "#8d959d", dark: "#3a4149" },
};
export const SURFACE_ORDER = ["road", "zebra", "red", "plaza", "walk", "green"];
// 白線の種類：幅（m）・色・破線
export const MARKING_KINDS = {
  solid: { label: "白線", width: 0.15, color: "white" },
  dashed: { label: "白の破線", width: 0.15, color: "white", dash: [5, 5] },
  stop: { label: "停止線", width: 0.45, color: "white" },
  yellow: { label: "黄線", width: 0.15, color: "yellow" },
  wide: { label: "太い白線", width: 0.3, color: "white" },
};
// 道路の中央線
export const CENTER_KINDS = { dashed: "白の破線", solid: "白線", yellow: "黄線", none: "なし" };
// 地図の道（OSM の種類）から取り込むときの道路の設定
export const ROAD_PRESETS = {
  major: { width: 12, lanes: 4, center: "yellow", edge: true, walk: [3.5, 3.5] },
  mid: { width: 7, lanes: 2, center: "dashed", edge: true, walk: [2.5, 2.5] },
  minor: { width: 5, lanes: 1, center: "none", edge: true, walk: [0, 0] },
  ped: { width: 4, lanes: 1, center: "none", edge: false, walk: [0, 0] },
};
const PAINT = { white: { light: "#ffffff", dark: "#d9dde2" }, yellow: { light: "#f2b705", dark: "#c99a12" } };
// 歩道のふち（縁石）の線の色。3D表示の cb-pave-edge が描く
export const CURB = { light: "#b9bdb6", dark: "#5d646c" };

const BAR = 0.45; // 横断歩道・導流帯の縞の幅
const GAP = 0.45; // 横断歩道の縞のすき間
const ZEBRA_STEP = 1.5; // 導流帯の縞の間隔
const EDGE = 0.15; // 導流帯の縁の線
const LINE_W = 0.15; // 道路の中央線・車線境界線・外側線
const DASH = [5, 5];
export const CORNER_R = 3; // 交差点の角の丸み（m）
const INTO = 1; // T字路で、突き当たる道が相手の車道へ入るとみなす長さ（相手の外側線を切る）
const ARC_STEP = Math.PI / 12; // 丸めの細かさ（15°）
const DEG = Math.PI / 180;

const ring = (pts) => [...pts, pts[0]].map(toLngLat);
const poly = (pts, props) => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring(pts)] } });
// polygon-clipping の MultiPolygon（平面の m）を GeoJSON に
const multi = (mp, props) => ({ type: "Feature", properties: props, geometry: { type: "MultiPolygon", coordinates: mp.map((p) => p.map((r) => r.map(toLngLat))) } });
const closed = (pts) => [[...pts, pts[0]]];
// 2点 a→b を、幅 w の帯（四角）に
const bar = (a, b, w) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
};

// 横断歩道：a→b（渡る向き）に沿って縞を並べる。縞は渡る向きに直角で、長さ width
export function crosswalkBars(a, b, width) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < BAR) return [];
  const ux = dx / len, uy = dy / len;
  const n = Math.max(1, Math.floor((len + GAP) / (BAR + GAP)));
  const start = (len - (n * BAR + (n - 1) * GAP)) / 2; // まん中にそろえる
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = start + i * (BAR + GAP) + BAR / 2;
    const c = [a[0] + ux * s, a[1] + uy * s];
    // 縞の向きは渡る向きに直角（長さ width、幅 BAR）
    const p = [c[0] - uy * (width / 2), c[1] + ux * (width / 2)], q = [c[0] + uy * (width / 2), c[1] - ux * (width / 2)];
    out.push(bar(p, q, BAR));
  }
  return out;
}

// 折れ線を幅 w の帯（区間ごとの四角）に。dash = [引く, あける] なら破線
export function lineBars(pts, w, dash) {
  const out = [];
  if (pts.length < 2) return out;
  if (!dash) {
    const L = offsetLine(pts, w / 2), R = offsetLine(pts, -w / 2);
    for (let i = 0; i + 1 < pts.length; i++) out.push([L[i], L[i + 1], R[i + 1], R[i]]);
    return out;
  }
  const cum = cumulative(pts), total = cum[cum.length - 1];
  const at = (s) => { let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
  for (let s = 0; s < total; s += dash[0] + dash[1]) {
    const e = Math.min(total, s + dash[0]);
    // 曲がり角をまたぐ破線は、角の点も通す
    const seg = [at(s)];
    for (let i = 1; i < pts.length - 1; i++) if (cum[i] > s && cum[i] < e) seg.push(pts[i]);
    seg.push(at(e));
    out.push(...lineBars(seg, w));
  }
  return out;
}

// 多角形の中を、角度 deg の縞（幅 BAR、間隔 ZEBRA_STEP）で埋める。縞の両端は多角形のふちに沿って斜めに切る
export function hatchBars(pts, deg = 45) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // 縞が横（y 一定）になるように回した座標
  const rot = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  const back = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const R = pts.map(rot);
  const ys = R.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const cross = (y) => {
    const xs = [];
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    return xs.sort((p, q) => p - q);
  };
  const out = [];
  for (let y = lo + ZEBRA_STEP / 2; y < hi; y += ZEBRA_STEP) {
    const y0 = Math.max(lo + 0.01, y - BAR / 2), y1 = Math.min(hi - 0.01, y + BAR / 2);
    const A = cross(y0), B = cross(y1), M = cross(y);
    for (let k = 0; k + 1 < M.length; k += 2) {
      const same = A.length === M.length && B.length === M.length;
      const quad = same
        ? [[A[k], y0], [A[k + 1], y0], [B[k + 1], y1], [B[k], y1]]
        : [[M[k], y0], [M[k + 1], y0], [M[k + 1], y1], [M[k], y1]];
      out.push(quad.map(back));
    }
  }
  return out;
}

/* ── 道路 ── */

// polygon-clipping の演算（union / difference / intersection）。浮動小数の誤差で落ちることがある（"Unable to find segment"）ので、
// 座標を 1mm の升目にそろえてから。それでも落ちたら粗くしてやり直す
// 升目にそろえると、ほとんど面積のないかけらが出るので除く（0.01 m² 未満）
const grid = (g, q) => g.map((pg) => pg.map((r) => r.map(([x, y]) => [Math.round(x / q) * q, Math.round(y / q) * q])));
function clip(pc, op, ...geoms) {
  for (const q of [1e-3, 1e-2, 5e-2]) {
    try {
      return pc[op](...geoms.map((g) => grid(g, q))).filter((pg) => Math.abs(ringArea(pg[0].slice(0, -1))) >= 0.01);
    } catch {
      // 次の升目で
    }
  }
  return [];
}

// 重なった点（5cm 以内）を除いた中心線（平面の m）
const centerline = (f) => f.coords.map(toXY).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05);

// 中心線 xy の帯（左へ dl、右へ dr）の輪郭を1つの輪で（[多角形] の形で返す）。角は留め継ぎ、両端は平らに切る。
// 区間ごとの四角と継ぎ目に分けると、重なる辺が多すぎて polygon-clipping が落ちる
export function bandPolys(xy, dl, dr) {
  const L = offsetLine(xy, dl), R = offsetLine(xy, -dr).reverse();
  return [closed([...L, ...R])];
}

// 重ねた車道（polygon-clipping の MultiPolygon。外の輪は反時計回り、穴は時計回り＝中はいつも進む向きの左）の、
// 中へ凹んだ角（右へ折れる角）を半径 r で丸めるための扇形。両どなりの辺が短いときは、辺の 45% までにおさめる。
// 辺にぴったり接すると丸めの誤差で離れたかけらになるので、車道の側へ 5cm 食い込ませる
export function cornerFillets(mp, r) {
  const out = [];
  for (const pg of mp) for (const rg of pg) {
    const R = rg.slice(0, -1);
    const n = R.length;
    for (let i = 0; i < n; i++) {
      const a = R[(i - 1 + n) % n], p = R[i], b = R[(i + 1) % n];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      if (la < 1e-6 || lb < 1e-6) continue;
      const u = [(p[0] - a[0]) / la, (p[1] - a[1]) / la], v = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
      const phi = Math.atan2(-(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1]); // 右へ折れる角度
      if (phi < 5 * DEG || phi > 175 * DEG) continue;
      // 外のすき間（くさび）の角は π−φ。丸めの円が両方の辺に接する点までの長さ t
      const half = (Math.PI - phi) / 2;
      const t = Math.min(r / Math.tan(half), 0.45 * Math.min(la, lb));
      const rr = t * Math.tan(half);
      if (t < 0.05) continue; // ゆるい曲がりの内側は丸めるほどでない
      const t1 = [p[0] - u[0] * t, p[1] - u[1] * t], t2 = [p[0] + v[0] * t, p[1] + v[1] * t];
      // 円の中心は、くさびの二等分線の上
      let wx = v[0] - u[0], wy = v[1] - u[1];
      const wl = Math.hypot(wx, wy) || 1;
      wx /= wl;
      wy /= wl;
      const c = [p[0] + (wx * rr) / Math.sin(half), p[1] + (wy * rr) / Math.sin(half)];
      const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
      let da = Math.atan2(t2[1] - c[1], t2[0] - c[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.max(2, Math.ceil(Math.abs(da) / ARC_STEP));
      const arc = [];
      for (let j = 0; j <= k; j++) arc.push([c[0] + rr * Math.cos(a0 + (da * j) / k), c[1] + rr * Math.sin(a0 + (da * j) / k)]);
      const e = 0.05, nu = [-u[1] * e, u[0] * e], nv = [-v[1] * e, v[0] * e]; // 中（左）へ
      out.push(closed([[p[0] + nu[0] + nv[0], p[1] + nu[1] + nv[1]], [t1[0] + nu[0], t1[1] + nu[1]], ...arc, [t2[0] + nv[0], t2[1] + nv[1]]]));
    }
  }
  return out;
}

// 点 p から折れ線 xy までの距離
function distTo(xy, p) {
  let best = Infinity;
  for (let i = 0; i + 1 < xy.length; i++) {
    const a = xy[i], b = xy[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return best;
}
// 折れ線の始まりを cut m 短くする
function trimStart(xy, cut) {
  if (cut <= 0) return xy;
  const cum = cumulative(xy);
  if (cut >= cum[cum.length - 1] - 0.05) return [];
  let i = 1;
  while (cum[i] <= cut) i++;
  const k = (cut - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return [[xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * k, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * k], ...xy.slice(i)];
}
// 端から離れる向き（端から 5m 以上先の点へ。短い区間の向きのぶれを避ける）
function leaving(xy) {
  for (let i = 1; i < xy.length; i++) {
    const dx = xy[i][0] - xy[0][0], dy = xy[i][1] - xy[0][1], L = Math.hypot(dx, dy);
    if (L >= 5 || i === xy.length - 1) return L > 1e-6 ? [dx / L, dy / L] : [1, 0];
  }
  return [1, 0];
}
// 道 a と b が、端どうしでまっすぐ（35°以内）続いているか（そこでは標示を切らない）
function continues(a, b) {
  const ends = (xy) => [[xy[0], leaving(xy)], [xy[xy.length - 1], leaving([...xy].reverse())]];
  return ends(a).some(([p, u]) => ends(b).some(([q, v]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1 && u[0] * v[0] + u[1] * v[1] < -Math.cos(35 * DEG)));
}
// 道 j が道 i の標示を切る範囲：j の車道＋CORNER_R。j の端が i の車道の中（T字路の突き当たり）なら、i の車道へは INTO m だけ入る
function cutBy(ri, rj) {
  let xy = rj.xy;
  const cut = (p) => Math.max(0, ri.hw - INTO - distTo(ri.xy, p));
  xy = trimStart(xy, cut(xy[0]));
  if (xy.length >= 2) xy = trimStart([...xy].reverse(), cut(xy[xy.length - 1])).reverse();
  return xy.length >= 2 ? bandPolys(xy, rj.hw + CORNER_R, rj.hw + CORNER_R) : [];
}
// 道の線（外側線・車線境界線・中央線）：[{ pts, dash, color }]
function roadLines(r) {
  const { f, xy, hw } = r;
  const out = [];
  const ei = hw >= 2 ? 0.5 : 0.25; // 外側線は車道のふちからこれだけ内側
  if (f.edge) out.push({ pts: offsetLine(xy, hw - ei), color: "white" }, { pts: offsetLine(xy, -(hw - ei)), color: "white" });
  const n = f.lanes || 1;
  const inner = hw - (f.edge ? ei : 0);
  for (let k = 1; k < n; k++) {
    const o = -inner + (2 * inner * k) / n;
    if (n % 2 === 0 && k === n / 2) {
      // まん中の線が中央線（車線が偶数のとき）
      if (f.center === "none") continue;
      out.push({ pts: offsetLine(xy, o), dash: f.center === "dashed" ? DASH : null, color: f.center === "yellow" ? "yellow" : "white" });
    } else out.push({ pts: offsetLine(xy, o), dash: DASH, color: "white" });
  }
  return out;
}

/**
 * 道路の車道・歩道・標示。pc は polygon-clipping
 * @returns { carriage, sidewalk, lines: [{ color, mp }] }（どれも平面の m の MultiPolygon）
 */
export function roadGeometry(roads, crosswalks, pc) {
  const rs = roads.map((f) => ({ f, xy: centerline(f), hw: f.width / 2 })).filter((r) => r.xy.length >= 2);
  if (!rs.length) return null;
  const C0 = clip(pc, "union", rs.flatMap((r) => bandPolys(r.xy, r.hw, r.hw)));
  const fil = cornerFillets(C0, CORNER_R);
  const carriage = fil.length ? clip(pc, "union", C0, fil) : C0;
  const walks = rs.filter((r) => r.f.walk[0] > 0 || r.f.walk[1] > 0).flatMap((r) => bandPolys(r.xy, r.hw + r.f.walk[0], r.hw + r.f.walk[1]));
  const sidewalk = walks.length ? clip(pc, "difference", clip(pc, "union", walks), carriage) : [];
  // 横断歩道の上は標示を切る（縞の長さ＋前後 0.5m）
  const xz = crosswalks.map(([a, b, w]) => closed(bar(a, b, w + 1)));
  const lines = { white: [], yellow: [] };
  rs.forEach((r, i) => {
    const cut = [...xz];
    rs.forEach((o, j) => { if (j !== i && !continues(r.xy, o.xy)) cut.push(...cutBy(r, o)); });
    const by = { white: [], yellow: [] };
    for (const l of roadLines(r)) for (const q of lineBars(l.pts, LINE_W, l.dash)) by[l.color].push(closed(q));
    for (const c of ["white", "yellow"]) {
      if (!by[c].length) continue;
      const mp = cut.length ? clip(pc, "difference", by[c], cut) : clip(pc, "union", by[c]);
      if (mp.length) lines[c].push(mp);
    }
  });
  return { carriage, sidewalk, lines: Object.entries(lines).flatMap(([color, l]) => l.map((mp) => ({ color, mp }))) };
}

// 道路の上の点 ll（[lng, lat]）を通って、道を直角に渡る横断歩道の2点（車道のふちからふちへ）。道路の上でなければ null
export function crosswalkAcross(features, ll) {
  const p = toXY(ll);
  let best = null;
  for (const f of features) {
    if (f.type !== "road") continue;
    const xy = centerline(f), hw = f.width / 2;
    for (let i = 0; i + 1 < xy.length; i++) {
      const a = xy[i], b = xy[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L)));
      const q = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d <= hw && (!best || d < best.d)) best = { d, q, n: [-dy / L, dx / L], hw };
    }
  }
  if (!best) return null;
  const { q, n, hw } = best;
  return [toLngLat([q[0] + n[0] * hw, q[1] + n[1] * hw]), toLngLat([q[0] - n[0] * hw, q[1] - n[1] * hw])];
}

/**
 * 手で描いた道路・路面・白線・横断歩道を GeoJSON に。pc（polygon-clipping）がなければ道路は描かない
 * @returns { surfaces, paint }  surfaces は路面の塗り（色は properties.color、歩道のふちの線を引くものは edge: 1）、paint は白線・縞（同じく color）
 */
// dark は true/false か、時刻の見え方（campus3dSky.js の lookFor。tone(昼の色, 夜の色) でいまの色）
export function paintFeatures(features, dark = false, pc = null) {
  const tone = (k) => (typeof dark?.tone === "function" ? dark.tone(k.light, k.dark) : dark ? k.dark : k.light);
  const layers = Object.fromEntries(SURFACE_ORDER.map((k) => [k, []]));
  const paint = [];
  const roads = features.filter((f) => f.type === "road");
  const crosswalks = features.filter((f) => f.type === "crosswalk" && f.coords.length >= 2).map((f) => [toXY(f.coords[0]), toXY(f.coords[1]), f.width || 4]);
  const rg = pc && roads.length ? roadGeometry(roads, crosswalks, pc) : null;
  if (rg) {
    if (rg.carriage.length) layers.road.push(multi(rg.carriage, { color: tone(SURFACE_KINDS.road) }));
    if (rg.sidewalk.length) layers.walk.push(multi(rg.sidewalk, { color: tone(SURFACE_KINDS.walk), edge: 1, curb: tone(CURB) }));
    for (const { color, mp } of rg.lines) paint.push(multi(mp, { color: tone(PAINT[color]) }));
  }
  for (const f of features) {
    if (f.type !== "surface") continue;
    const pts = f.coords.map(toXY);
    if (pts.length < 3) continue;
    const k = SURFACE_KINDS[f.kind] || SURFACE_KINDS.road;
    (layers[f.kind] || layers.road).push(poly(pts, { id: f.id, color: tone(k) }));
    if (f.kind === "zebra") {
      const white = tone(PAINT.white);
      for (let i = 0; i < pts.length; i++) paint.push(poly(bar(pts[i], pts[(i + 1) % pts.length], EDGE), { id: f.id, color: white }));
      for (const q of hatchBars(pts, f.angle ?? 45)) paint.push(poly(q, { id: f.id, color: white }));
    }
  }
  for (const f of features) {
    if (f.type === "marking") {
      const k = MARKING_KINDS[f.kind] || MARKING_KINDS.solid;
      const color = tone(PAINT[k.color]);
      for (const q of lineBars(f.coords.map(toXY), f.width || k.width, k.dash)) paint.push(poly(q, { id: f.id, color }));
    } else if (f.type === "crosswalk" && f.coords.length >= 2) {
      const [a, b] = f.coords.map(toXY);
      const color = tone(PAINT.white);
      for (const q of crosswalkBars(a, b, f.width || 4)) paint.push(poly(q, { id: f.id, color }));
    }
  }
  return { surfaces: { type: "FeatureCollection", features: SURFACE_ORDER.flatMap((k) => layers[k]) }, paint: { type: "FeatureCollection", features: paint } };
}
