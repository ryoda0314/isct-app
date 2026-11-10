// 詳細モード（建物の中）：建物の階（構造物の type "floor"。campus3dFeatures.js）を描く三角形と、歩く世界（campus3dWalk.js）の立体・壁。
// 位置は平面の m（toXY）、高さは標高 m。階の高さ z は groundRef の地面（掘る前の地面＝dem.groundAt）から。
// 内装は昼の色のまま、光を受けない色（アルファ 0.5。campus3dLayer.js の VS_SOLID）で描き、面の向きで少し陰をつける（照明のある屋内。夜も明るい）。
// 描くのは：床（穴＝吹き抜け・階段の口）と床の下の面（下の階の天井）・部屋の床の色・壁（扉の口とまぐさ）・ガラス（枠）・格子の手すり・
// 家具など・階段（段・裏の面・手すり）・地下の上を覆う地面の高さの床（lids）。歩いて見るとき（全部の階）は、建物の屋根の下の天井と梁（addRoofCeiling）。
// 地下の階の下を掘ったふち（dig）の帯は addDigBand
import polygonClipping from "polygon-clipping";
import { LIFT_DOOR_H, LIFT_DOOR_W, LIFT_WALL, WALL_CAP, WALL_T, buildingRoof, offsetRingBy, pointInRing, ringArea, roofSlab, toLngLat, toXY } from "./campus3dFeatures.js";

const hex = (h, a = 0.5) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
// 内装の色（昼の色。アルファ 0.5＝光を受けない）
const PAL = {
  oak: "#d6c19d", concrete: "#c2beb7", tile: "#cfcbc3", carpet: "#959ba2", stone: "#b2ada4", white: "#ebe9e4", plaza: "#c9c5bc", gravel: "#9a968e", dark: "#55575b",
  wall: "#f1efeb", wallEdge: "#d9d6d0", ceiling: "#ecebe7", slabEdge: "#d4d1cb", roofCeil: "#57534e", beam: "#f4f4f2", beamLit: "#fdf8ec", riser: "#f0f0ee", tubeIn: "#2e3136",
  glass: "#dfeaf0", mullion: "#e3e6e8", mullionDark: "#6d7277", mesh: "#f2f2f0", rail: "#c9cdd1",
  wood: "#cfb48b", woodDark: "#8d6c4a", birch: "#e3d0aa", slatGap: "#7d6650", whiteItem: "#efeeea", darkItem: "#33363b", grey: "#9ea2a6", sofa: "#c0b9ab", seat: "#4d6d8f", green: "#5f7f45",
  screen: "#1e2127", glow: "#cfe2ee", counter: "#dcc59d", platform: "#d9c4a1", platformSide: "#a7a29a", kitchen: "#f3f2ef", vending: "#f6f6f3",
  piano: "#17181b", red: "#b9473d", orange: "#df8a2e", art: "#c7a36c", core: "#eeede9", lift: "#e9e8e4", toilet: "#e5e3de",
  walnut: "#7a5a3c", chalk: "#26292b", lamp: "#4a4d50", bentwood: "#c79f6b", mat: "#5d6064", // カフェ（カウンターの前板・メニューの黒板・ペンダントの照明・曲げ木の椅子）・入口のマット
  // 畳の小上がり（琉球畳の 2 つの色・灰色の石の台）、エレベーターのステンレス（扉・枠）と扉の合わせ目（2026-11-10）
  tatamiA: "#d2cb9c", tatamiB: "#c6bf8d", tatamiSide: "#77767a", steel: "#c4c9cd", steelEdge: "#8f969c",
  // 両側に座れるテントの形のソファー（灰色の布・背もたれの裏・細い金属の脚。写真 S__47226944・動画 IMG_0723 の t042〜t081）
  tentsofa: "#bdbbb6", tentsofaBack: "#b1afaa", sofaLeg: "#8c9196",
  stairWood: "#cdb38a", stairWhite: "#efeeea", stairStone: "#b6b2aa", stairEdge: "#9f9a91",
};
const COL = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));
const GLASS = hex(PAL.glass, 0.5);
const MESH = hex(PAL.mesh, 0.5);
// 面の向きで陰（上 1・下 0.8・横は向きで少しずつ）
const shade = (c, n) => {
  const k = n[2] > 0.7 ? 1 : n[2] < -0.7 ? 0.8 : 0.86 + 0.07 * n[0] + 0.03 * n[1];
  return [c[0] * k, c[1] * k, c[2] * k, c[3]];
};
const FINISH_COL = { oak: "oak", concrete: "concrete", tile: "tile", carpet: "carpet", stone: "stone", white: "white", plaza: "plaza", gravel: "gravel", dark: "dark" };
const ITEM_COL = {
  box: "whiteItem", wood: "wood", white: "whiteItem", dark: "darkItem", grey: "grey", sofa: "sofa", seat: "seat", green: "green", screen: "screen", glow: "glow",
  counter: "counter", layered: "counter", slats: "birch", platform: "platform", table: "wood", shelf: "whiteItem", kitchen: "kitchen", vending: "vending", piano: "piano",
  red: "red", orange: "orange", art: "art", core: "core", lift: "lift", toilet: "toilet", walnut: "walnut", chalk: "chalk", lamp: "lamp", bentwood: "bentwood", mat: "mat",
  tatami: "tatamiA", steel: "steel", liftdoor: "steel", tentsofa: "tentsofa",
};
const TATAMI = 0.88; // 畳（半畳の琉球畳）の目の大きさ（m）
const STAIR_COL = { wood: "stairWood", white: "stairWhite", stone: "stairStone" };
const DOOR_H = 2.2; // 扉の口の高さ（上はまぐさ）
const GLAZED_TOL = 0.25; // 平地の中の見えるガラスの面と「同じ線」とみなす、ガラスの壁の線からの距離（m）
const SOFFIT = 0.45; // 階段の段の角から裏の面まで
export const ROOF_CEIL_DROP = 0.6; // 屋根の板の上の面から天井（暗い灰色の板）まで

// ── 形の小さな道具 ──
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const centroid = (ring) => ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
// 四角形（[[x, y], z] × 4）を、向き n・色 c（陰をつける）で
const face = (m, p, n, c) => m.quad(p, n, shade(c, n));
// 平らな多角形の柱（ring、z0〜z1）。上の面・横の面（下の面は bottom なら）。sideCol があれば横はその色
function prismPoly(m, ring, z0, z1, c, { bottom = false, sideCol = null, top = true } = {}) {
  if (ring.length < 3 || !(z1 > z0)) return;
  if (top) m.polygon([ring], z1, [0, 0, 1], shade(c, [0, 0, 1]));
  if (bottom) m.polygon([ring], z0, [0, 0, -1], shade(c, [0, 0, -1]));
  const out = ringArea(ring) > 0 ? 1 : -1;
  const sc = sideCol || c;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const L = len(sub(b, a));
    if (L < 1e-6) return;
    const n = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out, 0];
    face(m, [[a, z0], [b, z0], [b, z1], [a, z1]], n, sc);
  });
}

// 両側に座れるテントの形のソファー（物 tentsofa の四角 r。1 本目の辺が長さ＝背のてっぺんの線、z0〜z1 がてっぺん）：細い金属の脚 4 本、
// 両側に座面（角を落とした厚いクッション）、まん中に 2 枚の背もたれが寄りかかり合った三角の形（写真 S__47226944：背の端が「Λ」に見える）
function addTentSofa(m, r, z0, z1, T) {
  const L = len(sub(r[1], r[0])), W = len(sub(r[2], r[1]));
  if (L < 0.3 || W < 0.3) return;
  const u = [(r[1][0] - r[0][0]) / L, (r[1][1] - r[0][1]) / L];
  const v = [(r[2][0] - r[1][0]) / W, (r[2][1] - r[1][1]) / W];
  const ce = centroid(r);
  const P = (x, y) => [ce[0] + u[0] * x + v[0] * y, ce[1] + u[1] * x + v[1] * y];
  const seatC = T("tentsofa"), backC = T("tentsofaBack"), legC = T("sofaLeg");
  const hx = L / 2, hy = W / 2;
  const zSeat0 = z0 + 0.1, zSeat1 = z0 + 0.38;
  // 脚と、座面の下の細い枠
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bar(m, [P(sx * (hx - 0.12), sy * (hy - 0.12)), z0], [P(sx * (hx - 0.12), sy * (hy - 0.12)), zSeat0 + 0.01], 0.025, legC);
  for (const sy of [-1, 1]) bar(m, [P(-hx + 0.12, sy * (hy - 0.12)), zSeat0 - 0.01], [P(hx - 0.12, sy * (hy - 0.12)), zSeat0 - 0.01], 0.025, legC);
  // 座面：両側。角を 0.06 落とした厚いクッション
  const ch = 0.06;
  for (const sy of [-1, 1]) {
    const y0 = sy * 0.1, y1 = sy * (hy - 0.01);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const ring = [P(-hx + ch, ya), P(hx - ch, ya), P(hx, ya + ch), P(hx, yb - ch), P(hx - ch, yb), P(-hx + ch, yb), P(-hx, yb - ch), P(-hx, ya + ch)];
    prismPoly(m, ring, zSeat0, zSeat1, seatC, { bottom: true });
  }
  // 背もたれ：(y, z) の四角を長さの向きに押し出す（両側。てっぺん z1 で寄りかかり合う）
  const zt = Math.max(z1, zSeat1 + 0.25);
  for (const sy of [-1, 1]) {
    const sec = [[0.34, zSeat1 - 0.02], [0.07, zt], [0.0, zt - 0.03], [0.12, zSeat1 - 0.02]].map(([y, z]) => [y * sy, z]);
    const x0 = -hx + 0.03, x1 = hx - 0.03;
    for (let k = 0; k < sec.length; k++) {
      const [ya, za] = sec[k], [yb, zb] = sec[(k + 1) % sec.length];
      // 面の外向き：(y, z) の辺の外向き（多角形の向きで）を 3 次元に
      const ny = (zb - za), nz = -(yb - ya);
      const nl = Math.hypot(ny, nz) || 1;
      const sgn = sy > 0 ? 1 : -1;
      const n = [v[0] * (ny / nl) * sgn, v[1] * (ny / nl) * sgn, (nz / nl) * sgn];
      face(m, [[P(x0, ya), za], [P(x1, ya), za], [P(x1, yb), zb], [P(x0, yb), zb]], n, k === 0 ? seatC : backC);
    }
    // 両端の面（「Λ」の片側）
    for (const [x, nx] of [[x0, -1], [x1, 1]]) {
      const pts = sec.map(([y, z]) => [P(x, y), z]);
      face(m, [pts[0], pts[1], pts[2], pts[3]], [u[0] * nx, u[1] * nx, 0], backC);
    }
  }
}

// エレベーターの昇降路（物 lift の四角 r。1 本目の辺が扉の面）：4 面の壁（厚さ LIFT_WALL、四角の中へ）。扉の面のまん中に口（LIFT_DOOR_W × LIFT_DOOR_H。
// 扉・かごは campus3dLift）。外から見て口の右に、細いステンレスの呼びボタンの板（動画 IMG_0723 の 2 階の写真）
export function liftSides(r) {
  const c = r.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  return r.map((a, k) => {
    const b = r[(k + 1) % 4];
    const L = len(sub(b, a)) || 1;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let n = [-u[1], u[0]];
    const mid = lerp2(a, b, 0.5);
    if ((c[0] - mid[0]) * n[0] + (c[1] - mid[1]) * n[1] < 0) n = [-n[0], -n[1]]; // 中向き
    const inn = (p) => [p[0] + n[0] * (LIFT_WALL / 2), p[1] + n[1] * (LIFT_WALL / 2)];
    // 扉の面は口の両わきの 2 本と口の上（まぐさ）
    const s0 = (L - LIFT_DOOR_W) / 2, s1 = (L + LIFT_DOOR_W) / 2;
    return { a, b, L, u, n, inn, door: k === 0, s0, s1 };
  });
}
function addLiftShaft(m, r, z0, z1, c, steel) {
  for (const sd of liftSides(r)) {
    const { a, b, u, inn } = sd;
    const P = (s) => [a[0] + u[0] * s, a[1] + u[1] * s];
    if (!sd.door) {
      segBox(m, inn(a), inn(b), LIFT_WALL, z0, z0, z1, z1, c, { ends: false });
      continue;
    }
    segBox(m, inn(a), inn(P(sd.s0)), LIFT_WALL, z0, z0, z1, z1, c);
    segBox(m, inn(P(sd.s1)), inn(b), LIFT_WALL, z0, z0, z1, z1, c);
    if (z1 > z0 + LIFT_DOOR_H + 0.02) segBox(m, inn(P(sd.s0)), inn(P(sd.s1)), LIFT_WALL, z0 + LIFT_DOOR_H, z0 + LIFT_DOOR_H, z1, z1, c, { ends: false, bottom: true });
    // 呼びボタンの板：外から見て右（外向き −n に向いて右手）、口の端から 0.2m、高さ 1.0〜1.3
    const out = [-sd.n[0], -sd.n[1]];
    const right = [-out[1], out[0]]; // 扉に向いて（向き d = −out）立った人の右手 = (d[1], −d[0])
    const rs = (right[0] * u[0] + right[1] * u[1]) >= 0 ? sd.s1 + 0.2 : sd.s0 - 0.2;
    const pc = P(rs);
    const q = (s, d) => [pc[0] + u[0] * s + out[0] * d, pc[1] + u[1] * s + out[1] * d];
    prismPoly(m, [q(-0.035, 0), q(0.035, 0), q(0.035, 0.015), q(-0.035, 0.015)], z0 + 1.0, z0 + 1.3, steel, { sideCol: steel });
  }
}

// 畳の目（四角の r の上の面 z に、TATAMI m の升目のうち 1 つおきを色 c で重ねる）。升目は平面の原点から辺の向きにとる
function addTatamiTiles(m, r, z, c) {
  const ex = sub(r[1], r[0]);
  const ey = sub(r[3], r[0]);
  const lx = len(ex) || 1, ly = len(ey) || 1;
  const u = [ex[0] / lx, ex[1] / lx], v = [ey[0] / ly, ey[1] / ly];
  const S = (p) => p[0] * u[0] + p[1] * u[1];
  const Tt = (p) => p[0] * v[0] + p[1] * v[1];
  const s0 = S(r[0]), s1 = s0 + lx, t0 = Tt(r[0]), t1 = t0 + ly;
  const P = (s, t) => [r[0][0] + u[0] * (s - s0) + v[0] * (t - t0), r[0][1] + u[1] * (s - s0) + v[1] * (t - t0)];
  for (let i = Math.floor(s0 / TATAMI); i * TATAMI < s1 - 1e-6; i++) {
    for (let k = Math.floor(t0 / TATAMI); k * TATAMI < t1 - 1e-6; k++) {
      if ((((i + k) % 2) + 2) % 2 === 0) continue;
      const a0 = Math.max(s0, i * TATAMI), a1 = Math.min(s1, (i + 1) * TATAMI);
      const b0 = Math.max(t0, k * TATAMI), b1 = Math.min(t1, (k + 1) * TATAMI);
      if (a1 - a0 < 0.02 || b1 - b0 < 0.02) continue;
      m.quad([[P(a0, b0), z], [P(a1, b0), z], [P(a1, b1), z], [P(a0, b1), z]], [0, 0, 1], c);
    }
  }
}
// 線分 a→b に沿った厚さ t の箱。下と上の高さは端ごと（za0・zb0、za1・zb1）
function segBox(m, a, b, t, za0, zb0, za1, zb1, c, { ends = true, bottom = false } = {}) {
  const d = sub(b, a);
  const L = len(d);
  if (L < 1e-4) return;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1] * t / 2, u[0] * t / 2];
  const A1 = [a[0] + n[0], a[1] + n[1]], A2 = [a[0] - n[0], a[1] - n[1]];
  const B1 = [b[0] + n[0], b[1] + n[1]], B2 = [b[0] - n[0], b[1] - n[1]];
  const nl = [-u[1], u[0], 0];
  face(m, [[A2, za0], [B2, zb0], [B2, zb1], [A2, za1]], [-nl[0], -nl[1], 0], c);
  face(m, [[B1, zb0], [A1, za0], [A1, za1], [B1, zb1]], nl, c);
  face(m, [[A1, za1], [A2, za1], [B2, zb1], [B1, zb1]], [0, 0, 1], c);
  if (bottom) face(m, [[A1, za0], [B1, zb0], [B2, zb0], [A2, za0]], [0, 0, -1], c);
  if (ends) {
    face(m, [[A1, za0], [A2, za0], [A2, za1], [A1, za1]], [-u[0], -u[1], 0], c);
    face(m, [[B2, zb0], [B1, zb0], [B1, zb1], [B2, zb1]], [u[0], u[1], 0], c);
  }
}
// 細い角材（a・b は [[x, y], z]）
function bar(m, a, b, w, c) {
  const d = [b[0][0] - a[0][0], b[0][1] - a[0][1]];
  const L = len(d);
  if (L < 1e-4) {
    segBox(m, [a[0][0] - w / 2, a[0][1]], [a[0][0] + w / 2, a[0][1]], w, a[1], a[1], b[1], b[1], c);
    return;
  }
  segBox(m, a[0], b[0], w, a[1] - w / 2, b[1] - w / 2, a[1] + w / 2, b[1] + w / 2, c);
}
// 折れ線 pts を、距離の区間（doors）で分ける：[{ a, b, s0, s1, door }]（各区間は 1 本の線分の上）
export function wallPieces(pts, doors = [], wins = []) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  const cuts = new Set([...cum]);
  for (const [d0, d1] of [...doors, ...wins]) {
    if (d0 > 0 && d0 < total) cuts.add(d0);
    if (d1 > 0 && d1 < total) cuts.add(d1);
  }
  const ss = [...cuts].sort((x, y) => x - y);
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const L = cum[i] - cum[i - 1] || 1;
    return lerp2(pts[i - 1], pts[i], Math.min(1, Math.max(0, (s - cum[i - 1]) / L)));
  };
  const out = [];
  for (let k = 0; k + 1 < ss.length; k++) {
    const s0 = ss[k], s1 = ss[k + 1];
    if (s1 - s0 < 1e-4) continue;
    const mid = (s0 + s1) / 2;
    const door = doors.some(([d0, d1]) => mid > d0 && mid < d1);
    out.push({ a: at(s0), b: at(s1), s0, s1, door, win: door ? null : wins.find(([d0, d1]) => mid > d0 && mid < d1) || null });
  }
  return out;
}

// 階の高さの基準（掘る前の地面）
export const floorG0 = (f, groundAt) => {
  const ring = f.coords.map(toXY);
  return groundAt(f.groundRef || toLngLat(centroid(ring)));
};
// 壁の既定の高さ（次の階の床の下の面より少し上まで＝床にもぐる）
const wallTop = (f, w) => (w.h != null ? w.h : w.kind === "mesh" ? 1.1 : w.kind === "rail" ? 0.95 : w.kind === "low" ? 1.1 : f.height - f.slab + 0.05 - (w.z0 || 0));
const wallT = (w) => (w.t != null ? w.t : w.kind === "ext" ? 0.25 : w.kind === "glass" || w.kind === "curtain" ? 0.08 : w.kind === "mesh" || w.kind === "rail" ? 0.06 : 0.15);
// 壁の下の端・上の端（標高。点 → 標高）：始まりの点で z0・z0 + 高さ（wallTop）、終わりの点で z02・z02 + h2（なければ始まりと同じ）、
// あいだは折れ線に沿った長さで線形。上の端は cutTop まで。any：どこかで上の端が下の端より上
function wallSlope(f, w, pts, zf, cutTop = Infinity) {
  const h0 = wallTop(f, w);
  const b0 = w.z0 || 0;
  if (w.h2 == null && w.z02 == null) {
    const bot = zf + b0;
    const top = Math.min(bot + h0, cutTop);
    return { bot: () => bot, top: () => top, any: top > bot + 0.02 };
  }
  const b1 = w.z02 != null ? w.z02 : b0;
  const h1 = w.h2 != null ? w.h2 : h0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1] || 1;
  // 折れ線の上（か近く）の点の、始めからの長さの割合
  const kOf = (p) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const u = sub(pts[i], a);
      const L2 = u[0] * u[0] + u[1] * u[1] || 1;
      const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]) / L2));
      const d = len(sub(p, [a[0] + u[0] * tt, a[1] + u[1] * tt]));
      if (d < bd) {
        bd = d;
        best = (cum[i - 1] + tt * Math.sqrt(L2)) / total;
      }
    }
    return best;
  };
  const bot = (p) => zf + b0 + (b1 - b0) * kOf(p);
  const top = (p) => {
    const k = kOf(p);
    return Math.min(zf + b0 + (b1 - b0) * k + h0 + (h1 - h0) * k, cutTop);
  };
  return { bot, top, any: [pts[0], pts[pts.length - 1]].some((p) => top(p) > bot(p) + 0.02) };
}
// 階段の形：下の端 A（低い）・上の端 B、段数 N・蹴上げ・踏面
export function stairGeom(s, zf) {
  let [A, B] = s.coords.map(toXY);
  let zA = zf + (s.z0 || 0);
  let R = s.rise;
  if (R < 0) {
    [A, B] = [B, A];
    zA += R;
    R = -R;
  }
  const d = sub(B, A);
  const L = len(d) || 1e-3;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  // 蹴上げの数 N（steps か rise ÷ 0.17）。flush なら上の端は蹴上げで終わり（その先は上の階の床）、踏面は N − 1 枚。
  // ふつうは一番上の踏面が上の階の高さで、帯の中に N 枚
  const N = s.steps >= 1 ? Math.round(s.steps) : Math.max(1, Math.round(R / 0.17));
  const nT = s.flush && N >= 2 ? N - 1 : N;
  const riser = R / N;
  const tread = L / nT;
  const hw = s.width / 2;
  // skew：上るにつれて帯が左へずれる（下の端から上の端へ。rise がマイナスで入れかえたときは向きも逆）
  const sk = (s.skew || 0) * (s.rise < 0 ? -1 : 1);
  const P = (sv, lv) => [A[0] + u[0] * sv + n[0] * (lv + sk * sv), A[1] + u[1] * sv + n[1] * (lv + sk * sv)];
  // 点 (x, y) の段の上の面（帯の外は null）
  const topAt = (x, y) => {
    const sv = (x - A[0]) * u[0] + (y - A[1]) * u[1];
    const lv = (x - A[0]) * n[0] + (y - A[1]) * n[1] - sk * sv;
    if (sv < -1e-6 || sv > L + 1e-6 || Math.abs(lv) > hw + 1e-6) return null;
    const k = Math.min(nT - 1, Math.max(0, Math.floor(sv / tread)));
    return zA + (k + 1) * riser;
  };
  return { A, B, zA, R, L, u, n, N, nT, riser, tread, hw, P, topAt, ring: [P(0, -hw), P(L, -hw), P(L, hw), P(0, hw)] };
}

/**
 * 階 f を描く。M は { m（ふつう）, glassy（ガラス。半透明で重ねる）, veil（格子の手すり。半透明） }。
 * ctx：groundAt（掘る前の地面）, tint（選んだものの色）, ceilAt（点 → 屋根の下の天井の標高。屋根のある建物の上の階の壁はそこまで。なければ null）,
 * paintAt（点 → 地面に貼った路面の色。lids の色）, cutTop（切り取った階を上から見るとき、この標高より上は描かない）
 */
// 横向きの円柱：軸 A0 → A1（平面の点）、高さ zc、半径 R。open なら A1 の端は中が暗い穴（筒の内の面）、ちがえば平らなふた
function addCylinder(m, A0, A1, zc, R, c, inner, open) {
  const d = sub(A1, A0);
  const L = len(d);
  if (L < 1e-3 || !(R > 0)) return;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  const SEG = 14;
  const P = (p, ang, r = R) => [[p[0] + n[0] * Math.cos(ang) * r, p[1] + n[1] * Math.cos(ang) * r], zc + Math.sin(ang) * r];
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * 2 * Math.PI, a1 = ((k + 1) / SEG) * 2 * Math.PI, am = (a0 + a1) / 2;
    const nn = [n[0] * Math.cos(am), n[1] * Math.cos(am), Math.sin(am)];
    face(m, [P(A0, a0), P(A1, a0), P(A1, a1), P(A0, a1)], nn, c);
    // 端：A0 はふた、A1 は open なら輪と暗い穴、ちがえばふた
    const cA0 = [A0, zc], cA1 = [A1, zc];
    m.quad([cA0, P(A0, a1), P(A0, a0), cA0], [-u[0], -u[1], 0], shade(c, [-u[0], -u[1], 0]));
    if (open) {
      face(m, [P(A1, a0, R * 0.78), P(A1, a0), P(A1, a1), P(A1, a1, R * 0.78)], [u[0], u[1], 0], c);
      const back = [A1[0] - u[0] * L * 0.6, A1[1] - u[1] * L * 0.6];
      m.quad([[back, zc], P(back, a0, R * 0.78), P(back, a1, R * 0.78), [back, zc]], [u[0], u[1], 0], inner);
      face(m, [P(back, a0, R * 0.78), P(A1, a0, R * 0.78), P(A1, a1, R * 0.78), P(back, a1, R * 0.78)], [-nn[0], -nn[1], -nn[2]], inner);
    } else m.quad([cA1, P(A1, a0), P(A1, a1), cA1], [u[0], u[1], 0], shade(c, [u[0], u[1], 0]));
  }
}

// 壁の区間 pc を、屋根の下の天井より上へ出ないように上の端で区切る：{ a, b, ta, tb } の並び（区間の中で上の端はまっすぐ）。
// 上の端がまっすぐ続くあいだ（あいだの点が直線から CEIL_RUN_TOL 以内）は 1 つ（斜めの壁・なめらかな天井でも細かく区切らない＝
// ガラスの縦の枠が区切りごとに並ばない）。跳び（となりの点と CEIL_JUMP 以上ちがう）は二分してその位置で区切る。
// zTop・z0 は数か、点 → 標高の関数（斜めの壁）
const CEIL_RUN_TOL = 0.02;
const CEIL_JUMP = 0.2;
function ceilRuns(pc, zTop, z0, ceilAt) {
  const L = len(sub(pc.b, pc.a));
  const topOf = typeof zTop === "function" ? zTop : () => zTop;
  const botOf = typeof z0 === "function" ? z0 : () => z0;
  const val = (t) => {
    const q = lerp2(pc.a, pc.b, t);
    const c = ceilAt(q);
    const zt = topOf(q);
    return Math.max(botOf(q) + 0.3, Math.min(zt, Number.isFinite(c) ? c : zt));
  };
  if (L < 1e-3) return [{ ...pc, ta: val(0), tb: val(0) }];
  const n = Math.max(1, Math.ceil(L / 0.25));
  const eps = Math.min(0.25, 0.002 / L);
  // 0.25m ごとの点（両端は少し内）
  const T = [];
  const V = [];
  for (let k = 0; k <= n; k++) {
    T.push(k / n);
    V.push(val(k === 0 ? eps : k === n ? 1 - eps : k / n));
  }
  const out = [];
  let tS = 0;
  let vS = V[0];
  let i0 = 0;
  const close = (tE, vE) => {
    if (tE - tS > 1e-4) out.push({ ...pc, a: lerp2(pc.a, pc.b, tS), b: lerp2(pc.a, pc.b, tE), ta: vS, tb: vE });
  };
  for (let k = 1; k <= n; k++) {
    if (Math.abs(V[k] - V[k - 1]) > CEIL_JUMP) {
      // 跳び：前の点の高さが続くところと次の高さのあいだを二分
      let lo = T[k - 1] + eps;
      let hi = T[k] - eps;
      for (let it = 0; it < 14; it++) {
        const md = (lo + hi) / 2;
        if (Math.abs(val(md) - V[k - 1]) <= CEIL_RUN_TOL + Math.abs(V[k - 1] - (k >= 2 ? V[k - 2] : V[k - 1]))) lo = md;
        else hi = md;
      }
      close(lo, val(lo));
      tS = hi;
      vS = val(Math.min(1, hi + eps));
      i0 = k;
      continue;
    }
    // あいだの点が直線（区間の始まり → この点）から離れたら、ひとつ前の点で区切る
    for (let j = i0 + 1; j < k; j++) {
      const z = vS + ((V[k] - vS) * (T[j] - tS)) / (T[k] - tS || 1);
      if (Math.abs(V[j] - z) > CEIL_RUN_TOL) {
        close(T[k - 1], V[k - 1]);
        tS = T[k - 1];
        vS = V[k - 1];
        i0 = k - 1;
        break;
      }
    }
  }
  close(1, V[n]);
  return out;
}

// 板を重ねた壁（受付のカウンターなど）。r は上の外のふち（閉じた形）。厚さ SLAT_T の板を SLAT_PITCH ごとに重ね（あいだは奥まった暗い
// 板）、下の板ほど形の内へ入る（いちばん下で lean m。上ほど外へ張り出す。壁の外の面も中の面も斜め）。壁の厚さ w、いちばん上は天板。
// gaps（r の 1 点目からふちに沿った距離 [s0, s1]）は壁がない（入口）、plain の区間は板を重ねない平らな壁
const SLAT_T = 0.032;
const SLAT_PITCH = 0.064;
const SLAT_TOP = 0.045;
function addSlats(m, it, r0, z0, z1, T) {
  const ccw = ringArea(r0) > 0;
  const ring = ccw ? r0 : r0.slice().reverse();
  const P = ring.length;
  const Ls = ring.map((p, i) => len(sub(ring[(i + 1) % P], p)));
  const per = Ls.reduce((a, b) => a + b, 0);
  // 点の向きを逆にしたら、距離も逆から
  const conv = (rs) => (rs || []).map(([s0, s1]) => (ccw ? [s0, s1] : [per - s1, per - s0]));
  const gaps = conv(it.gaps);
  const plain = conv(it.plain);
  const w = it.w ?? 0.45;
  const lean = it.lean ?? 0;
  const S0 = [];
  let acc = 0;
  for (const L of Ls) {
    S0.push(acc);
    acc += L;
  }
  // 辺 i の区間（0〜1）：gaps は除き、plain は印をつける
  const spans = ring.map((_, i) => {
    const cuts = new Set([0, 1]);
    for (const [g0, g1] of [...gaps, ...plain]) {
      for (const g of [g0, g1]) {
        const t = (g - S0[i]) / (Ls[i] || 1);
        if (t > 1e-4 && t < 1 - 1e-4) cuts.add(t);
      }
    }
    const ts = [...cuts].sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const sm = S0[i] + ((ts[k] + ts[k + 1]) / 2) * Ls[i];
      if (gaps.some(([g0, g1]) => sm > g0 && sm < g1)) continue;
      out.push({ t0: ts[k], t1: ts[k + 1], plain: plain.some(([g0, g1]) => sm > g0 && sm < g1) });
    }
    return out;
  });
  // 外のふちから d0〜d1 内の帯の、辺 i の区間の四角
  const band = (d0, d1) => ({ O: offsetRingBy(ring, ring.map(() => -d0)), I: offsetRingBy(ring, ring.map(() => -d1)) });
  const quad = ({ O, I }, i, t0, t1) => {
    const j = (i + 1) % P;
    return [lerp2(O[i], O[j], t0), lerp2(O[i], O[j], t1), lerp2(I[i], I[j], t1), lerp2(I[i], I[j], t0)];
  };
  const light = T("birch");
  const dark = T("slatGap");
  const hTot = z1 - SLAT_TOP - z0;
  if (hTot <= 0.05) return;
  const N = Math.max(3, Math.round(hTot / SLAT_PITCH));
  const pitch = hTot / N;
  for (let k = 0; k < N; k++) {
    const d = lean * (1 - (k + 1) / N);
    const zA = z0 + k * pitch;
    const bS = band(d, d + w);
    const bD = band(d + 0.025, d + w - 0.025);
    ring.forEach((_, i) => {
      for (const sp of spans[i]) {
        if (sp.plain) continue;
        prismPoly(m, quad(bS, i, sp.t0, sp.t1), zA + pitch - SLAT_T, zA + pitch, light, { bottom: true });
        prismPoly(m, quad(bD, i, sp.t0, sp.t1), zA, zA + pitch - SLAT_T, dark, { top: false });
      }
    });
  }
  const b0 = band(0, w);
  ring.forEach((_, i) => {
    for (const sp of spans[i]) {
      if (sp.plain) prismPoly(m, quad(b0, i, sp.t0, sp.t1), z0, z1 - SLAT_TOP, light);
      prismPoly(m, quad(b0, i, sp.t0, sp.t1), z1 - SLAT_TOP, z1, light, { bottom: true });
    }
  });
}

export function addFloor(M, f, ctx) {
  const { m, glassy, veil } = M;
  const cull = M.cull || m; // 外の壁（ext）は中から見える面だけ（外からは殻が見える）
  const g0 = floorG0(f, ctx.groundAt);
  if (!Number.isFinite(g0)) return;
  const tint = ctx.tint || ((c) => c);
  const T = (k) => tint(COL[k]);
  const zf = g0 + f.z;
  const cutTop = ctx.cutTop ?? Infinity;
  const ceilAt = ctx.ceilAt || null;
  const ring = f.coords.map(toXY);
  const holes = (f.holes || []).map((h) => h.coords.map(toXY));
  // 床：上の面（仕上げの色）・下の面（下の階の天井）・ふちの面
  const top = T(FINISH_COL[f.finish] || "oak");
  m.polygon([ring, ...holes], zf, [0, 0, 1], shade(top, [0, 0, 1]));
  m.polygon([ring, ...holes], zf - f.slab, [0, 0, -1], shade(T(f.under ? FINISH_COL[f.under] : "ceiling"), [0, 0, -1]));
  for (const r of [ring, ...holes]) {
    const out = (ringArea(r) > 0 ? 1 : -1) * (r === ring ? 1 : -1);
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      const L = len(sub(b, a));
      if (L < 1e-6) return;
      const n = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out, 0];
      face(m, [[a, zf - f.slab], [b, zf - f.slab], [b, zf], [a, zf]], n, T("slabEdge"));
    });
  }
  // 部屋の床の色
  for (const r of f.rooms || []) {
    if (!r.finish || r.finish === f.finish) continue;
    m.polygon([r.coords.map(toXY)], zf + 0.012, [0, 0, 1], shade(T(FINISH_COL[r.finish]), [0, 0, 1]));
  }
  // 平地の中の見えるガラスの面（ctx.glazed：[p, q]。明かり取りのガラスなど）と同じ線のガラスの壁は描かない（ガラスと桟が二重になる）
  const glazed = ctx.glazed || [];
  const offGlazed = (pc) => {
    const L = len(sub(pc.b, pc.a));
    if (!glazed.length || L < 1e-6) return [pc];
    const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
    const cov = [];
    for (const [p, q] of glazed) {
      const d = (x) => Math.abs((x[0] - pc.a[0]) * u[1] - (x[1] - pc.a[1]) * u[0]);
      if (d(p) > GLAZED_TOL || d(q) > GLAZED_TOL) continue;
      const s0 = (p[0] - pc.a[0]) * u[0] + (p[1] - pc.a[1]) * u[1];
      const s1 = (q[0] - pc.a[0]) * u[0] + (q[1] - pc.a[1]) * u[1];
      const lo = Math.max(0, Math.min(s0, s1) - 0.05), hi = Math.min(L, Math.max(s0, s1) + 0.05);
      if (hi > lo) cov.push([lo, hi]);
    }
    if (!cov.length) return [pc];
    cov.sort((x, y) => x[0] - y[0]);
    const out = [];
    let s = 0;
    for (const [lo, hi] of cov) {
      if (lo > s + 0.05) out.push([s, lo]);
      s = Math.max(s, hi);
    }
    if (L > s + 0.05) out.push([s, L]);
    return out.map(([s0, s1]) => ({ ...pc, a: lerp2(pc.a, pc.b, s0 / L), b: lerp2(pc.a, pc.b, s1 / L) }));
  };
  // 壁・ガラス・手すり。斜めの壁（h2・z02：折れ線の終わりの点の高さ・下の端。始まりは h・z0、あいだは折れ線に沿った長さで線形）は、
  // 区間ごとに両端の下の端（ba・bb）と上の端（ta・tb）で
  for (const w of f.walls || []) {
    const pts = w.coords.map(toXY);
    const t = wallT(w);
    const S = wallSlope(f, w, pts, zf, cutTop);
    if (!S.any) continue;
    // 自動ドア（w.auto）：扉の口ごとに、campus3dDoors の自動ドアのレイヤーが板を描く（ctx.doors に足す）。口の上の板の側に、戸を動かす箱
    if (w.auto && ctx.doors) {
      for (const pc of wallPieces(pts, w.doors || [])) {
        if (!pc.door) continue;
        const L = len(sub(pc.b, pc.a));
        if (L < 0.4) continue;
        const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
        const nl = [-u[1], u[0]];
        const z0 = S.bot(lerp2(pc.a, pc.b, 0.5));
        const kind = L >= 1.5 ? "bi" : "single";
        ctx.doors.push({ a: pc.a, b: pc.b, z0, z1: z0 + DOOR_H, n: nl, off: 0.08, kind });
        const ext = kind === "bi" ? L / 2 : L;
        const A = [pc.a[0] - u[0] * ext + nl[0] * 0.08, pc.a[1] - u[1] * ext + nl[1] * 0.08];
        const B = [pc.b[0] + u[0] * (kind === "bi" ? ext : 0) + nl[0] * 0.08, pc.b[1] + u[1] * (kind === "bi" ? ext : 0) + nl[1] * 0.08];
        segBox(m, A, B, 0.14, z0 + DOOR_H, z0 + DOOR_H, z0 + DOOR_H + 0.18, z0 + DOOR_H + 0.18, T("mullion"), { bottom: true });
      }
    }
    // 屋根の下の天井より上へは出さない（天井の高さが変わるところで区切る）
    const cutByCeil = ceilAt && (w.kind === "wall" || w.kind === "ext" || w.kind === "glass" || w.kind === "curtain");
    const runs = (pc) => (cutByCeil ? ceilRuns(pc, S.top, S.bot, ceilAt) : [{ ...pc, ta: S.top(pc.a), tb: S.top(pc.b) }]);
    const glassy0 = w.kind === "glass" || w.kind === "curtain";
    for (const pc of wallPieces(pts, w.doors || [], w.wins || []).flatMap((pc) => (glassy0 ? offGlazed(pc) : [pc])).flatMap(runs)) {
      const { ta, tb } = pc;
      const ba = S.bot(pc.a), bb = S.bot(pc.b);
      if (!(ta > ba + 0.02 || tb > bb + 0.02)) continue;
      if (w.kind === "ext") {
        // 外の壁：床の形の中を向く 1 枚の面（殻の内側。外からは裏になって見えない）。窓のところは腰と上だけ、ガラスは中側に
        const L = len(sub(pc.b, pc.a)) || 1;
        const nl = [-(pc.b[1] - pc.a[1]) / L, (pc.b[0] - pc.a[0]) / L];
        const mid = lerp2(pc.a, pc.b, 0.5);
        const sg = pointInRing(mid[0] + nl[0] * 0.3, mid[1] + nl[1] * 0.3, ring) ? 1 : -1;
        const off = (t / 2) * sg;
        const A = [pc.a[0] + nl[0] * off, pc.a[1] + nl[1] * off], B = [pc.b[0] + nl[0] * off, pc.b[1] + nl[1] * off];
        const nIn = [nl[0] * sg, nl[1] * sg, 0];
        const c = T("wall");
        // 面の向きが中を向くように点の順をそろえる（quad は渡した向き n で描く）
        const quadIn = (za0, zb0, za1, zb1) => cull.quad([[A, za0], [B, zb0], [B, zb1], [A, za1]], nIn, shade(c, nIn));
        if (pc.door) {
          if (Math.min(ta - ba, tb - bb) > DOOR_H + 0.1) quadIn(ba + DOOR_H, bb + DOOR_H, ta, tb);
        } else if (pc.win) {
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) quadIn(ba, bb, loA, loB);
          if (Math.min(ta - hiA, tb - hiB) > 0.02) quadIn(hiA, hiB, ta, tb);
          if (Math.min(hiA - loA, hiB - loB) > 0.05) glassy.quad([[A, loA], [B, loB], [B, hiB], [A, hiA]], nIn, tint(GLASS));
        } else quadIn(ba, bb, ta, tb);
      } else if (w.kind === "wall" || w.kind === "low") {
        const c = T("wall");
        if (pc.win) {
          // 窓：下の腰の壁・ガラス・上の壁（まぐさ）と枠
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) segBox(m, pc.a, pc.b, t, ba, bb, loA, loB, c, { ends: false });
          if (Math.min(ta - hiA, tb - hiB) > 0.02) segBox(m, pc.a, pc.b, t, hiA, hiB, ta, tb, c, { ends: false, bottom: true });
          if (Math.min(hiA - loA, hiB - loB) > 0.05) {
            const L = len(sub(pc.b, pc.a)) || 1;
            glassy.quad([[pc.a, loA], [pc.b, loB], [pc.b, hiB], [pc.a, hiA]], [-(pc.b[1] - pc.a[1]) / L, (pc.b[0] - pc.a[0]) / L, 0], tint(GLASS));
            const fc = T("mullion");
            bar(m, [pc.a, loA], [pc.a, hiA], 0.06, fc);
            bar(m, [pc.b, loB], [pc.b, hiB], 0.06, fc);
            bar(m, [pc.a, loA], [pc.b, loB], 0.06, fc);
            bar(m, [pc.a, hiA], [pc.b, hiB], 0.06, fc);
          }
        } else if (!pc.door) segBox(m, pc.a, pc.b, t, ba, bb, ta, tb, c);
        else if (w.kind !== "low" && Math.min(ta - ba, tb - bb) > DOOR_H + 0.1) segBox(m, pc.a, pc.b, t, ba + DOOR_H, bb + DOOR_H, ta, tb, c, { bottom: true });
      } else if (w.kind === "glass" || w.kind === "curtain") {
        const frameC = T(w.kind === "curtain" ? "mullionDark" : "mullion");
        const fw = w.kind === "curtain" ? 0.07 : 0.05;
        const pitch = w.kind === "curtain" ? 1.25 : 1.5;
        const L = len(sub(pc.b, pc.a));
        const gA = pc.door ? ba + DOOR_H + 0.05 : ba + 0.02, gB = pc.door ? bb + DOOR_H + 0.05 : bb + 0.02;
        if (Math.min(ta - gA, tb - gB) > 0.05) {
          glassy.quad([[pc.a, gA], [pc.b, gB], [pc.b, tb], [pc.a, ta]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(GLASS));
        }
        // 縦の枠（区間の両端と、間隔ごと）・下と上の枠・扉の上の横の枠。1 枚のガラス（pane）は途中の縦の枠・横の枠なしで、縦の枠は
        // 壁の折れ線の両端だけ（天井で区切った区間の境には枠を描かない）
        const n = w.pane ? 1 : Math.max(1, Math.round(L / pitch));
        const atEnd = (q) => len(sub(q, pts[0])) < 1e-6 || len(sub(q, pts[pts.length - 1])) < 1e-6;
        for (let k = 0; k <= n; k++) {
          const p = lerp2(pc.a, pc.b, k / n);
          const tp = ta + ((tb - ta) * k) / n;
          const bp = ba + ((bb - ba) * k) / n;
          if (pc.door && k > 0 && k < n) continue;
          if (w.pane && !pc.door && !atEnd(p)) continue;
          bar(m, [p, bp], [p, tp], pc.door && (k === 0 || k === n) ? fw * 1.4 : fw, frameC);
        }
        if (!pc.door) bar(m, [pc.a, ba + 0.03], [pc.b, bb + 0.03], fw, frameC);
        bar(m, [pc.a, ta - 0.02], [pc.b, tb - 0.02], fw, frameC);
        if (pc.door || (w.kind === "curtain" && !w.pane)) {
          const dz = DOOR_H + (pc.door ? 0.02 : 0.6);
          if (Math.min(ta - ba, tb - bb) > dz + 0.1) bar(m, [pc.a, ba + dz], [pc.b, bb + dz], fw, frameC);
        }
      } else if (w.kind === "mesh" || w.kind === "rail") {
        if (pc.door) continue;
        const railC = T("rail");
        const L = len(sub(pc.b, pc.a));
        if (w.kind === "mesh") veil.quad([[pc.a, ba + 0.03], [pc.b, bb + 0.03], [pc.b, tb - 0.04], [pc.a, ta - 0.04]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(MESH));
        bar(m, [pc.a, ta], [pc.b, tb], 0.05, T(w.kind === "mesh" ? "mesh" : "rail"));
        if (w.kind === "rail") bar(m, [pc.a, ba + (ta - ba) * 0.5], [pc.b, bb + (tb - bb) * 0.5], 0.03, railC);
        else bar(m, [pc.a, ba + 0.03], [pc.b, bb + 0.03], 0.04, T("mesh"));
        const n = Math.max(1, Math.round(L / 1.5));
        for (let k = 0; k <= n; k++) {
          const p = lerp2(pc.a, pc.b, k / n);
          bar(m, [p, ba + ((bb - ba) * k) / n], [p, ta + ((tb - ta) * k) / n], 0.04, w.kind === "mesh" ? T("mesh") : railC);
        }
      }
    }
  }
  // 家具など
  for (const it of f.items || []) {
    const r = it.coords.map(toXY);
    const z0 = zf + it.z0;
    // 屋根の下の天井より上へは出さない（柱は天井まで）
    const z1 = Math.min(zf + it.z1, cutTop, ceilAt ? ceilAt(centroid(r)) : Infinity);
    if (!(z1 > z0 + 0.005)) continue;
    // 切り取った階を上から見るときは、天井の近くの物（照明・ダクト・上の床の板）は描かない（下の部屋が見えるように）
    if (Number.isFinite(cutTop) && z0 > cutTop - 0.9) continue;
    const c = T(ITEM_COL[it.kind] || "whiteItem");
    if (it.kind === "table" && z1 - z0 > 0.2) {
      prismPoly(m, r, z1 - 0.035, z1, c, { bottom: true });
      // 脚：角ごと（4 点の形なら角から 0.06m 内）、ほかはまん中に 1 本
      const legC = T("grey");
      if (r.length === 4) {
        const ce = centroid(r);
        for (const p of r) {
          const q = lerp2(p, ce, Math.min(0.45, 0.08 / (len(sub(ce, p)) || 1)));
          bar(m, [q, z0], [q, z1 - 0.035], 0.035, legC);
        }
      } else {
        const ce = centroid(r);
        bar(m, [ce, z0], [ce, z1 - 0.035], 0.06, legC);
      }
    } else if (it.kind === "layered") {
      // 板を重ねたカウンター：厚さ 0.035 の板を 0.02 のすき間で、板ごとに少し内へ（溝が見える）
      const n = Math.max(2, Math.round((z1 - z0) / 0.055));
      const h = (z1 - z0) / n;
      const ce = centroid(r);
      for (let k = 0; k < n; k++) {
        const inset = k % 2 ? 0.012 : 0;
        const rr = inset ? r.map((p) => lerp2(p, ce, inset / (len(sub(ce, p)) || 1))) : r;
        prismPoly(m, rr, z0 + k * h, z0 + (k + 1) * h - (k === n - 1 ? 0 : 0.012), c, { sideCol: k % 2 ? T("woodDark") : c });
      }
    } else if (it.kind === "slats") {
      addSlats(m, it, r, z0, z1, T);
    } else if (it.kind === "platform") {
      prismPoly(m, r, z0, z1, T("platform"), { sideCol: T("platformSide") });
    } else if (it.kind === "tatami") {
      // 畳の小上がり：灰色の石の台に、半畳の琉球畳を目ごとに 2 つの色で（目は平面の原点からの升目＝となりの小上がりと目がそろう）
      prismPoly(m, r, z0, z1, T("tatamiA"), { sideCol: T("tatamiSide") });
      if (r.length === 4) addTatamiTiles(m, r, z1 + 0.003, T("tatamiB"));
    } else if (it.kind === "tentsofa" && r.length === 4) {
      addTentSofa(m, r, z0, z1, T);
    } else if (it.kind === "lift" && r.length === 4) {
      addLiftShaft(m, r, z0, z1, c, T("steel"));
    } else if (it.kind === "liftdoor") {
      // エレベーターの扉（ステンレスの板）：前の面も縦の面なので、縦の面ぜんぶ板の色（合わせ目はデータの暗い細い板）
      prismPoly(m, r, z0, z1, c, { sideCol: c });
    } else if ((it.kind === "tube" || it.kind === "disc") && r.length >= 4) {
      // 軸：1 点目 → 2 点目の向き（形の両はしのまん中どうし）。直径は z1 − z0
      const A0 = lerp2(r[0], r[3], 0.5), A1 = lerp2(r[1], r[2], 0.5);
      addCylinder(m, A0, A1, (zf + it.z0 + zf + it.z1) / 2, (it.z1 - it.z0) / 2, it.kind === "tube" ? T("beam") : c, it.kind === "tube" ? T("tubeIn") : c, it.kind === "tube");
    } else {
      prismPoly(m, r, z0, z1, c, { bottom: z0 > zf + 0.05 });
    }
  }
  // 階段
  for (const s of f.stairs || []) addFloorStairs(M, s, zf, T, tint, cutTop);
  // 地下の上を覆う、地面の高さの床（広場・通路の下）：掘る前の地面の高さ、色は地面に貼った路面の色
  for (const l of f.noLid ? [] : f.lids || []) {
    const r = l.coords.map(toXY);
    const zAt = lidGround(r, ctx.groundAt, zf);
    const col = (ctx.paintAt && ctx.paintAt(centroid(r))) || T("plaza");
    m.polygon([r], zAt, [0, 0, 1], col);
    m.polygon([r], (p) => zAt(p) - 0.35, [0, 0, -1], shade(T("ceiling"), [0, 0, -1]));
  }
}

// ふた（lids の形 r）の上の面の高さ（点 → 掘る前の地面 + 0.03）。ふたは角の点の高さの平面の三角形なので、ふちの点で地面を測ると、
// となりの掘り下げた平地（明かり取りの床など）の高さを拾って、ふたが大きく傾いた板になる（広場の下の大階段の上に垂れ下がっていた）。
// 掘り下げた平地の外の地面は、ふちから壁の帯の中（0.9m ほど）まで低い（段差を壁の中に置くため）ので、点のまわり 0.3〜3.5m（16 の向き）の
// ふたの中の点の地面のいちばん高いところ（ふたの中に点がなければ、その点の地面）。細いくさびの角（明かり取りのふちと建物の線の角）でも
// 段差の帯の外の点が入るように
const LID_PROBE = [0.3, 0.8, 1.5, 2.5, 3.5];
export function lidGround(r, groundAt, zf) {
  const memo = new Map();
  return (p) => {
    const k = `${p[0]},${p[1]}`;
    if (memo.has(k)) return memo.get(k);
    let g = -Infinity;
    for (const d of LID_PROBE) {
      for (let a = 0; a < 16; a++) {
        const q = [p[0] + Math.cos((a * Math.PI) / 8) * d, p[1] + Math.sin((a * Math.PI) / 8) * d];
        if (!pointInRing(q[0], q[1], r)) continue;
        const v = groundAt(toLngLat(q));
        if (Number.isFinite(v)) g = Math.max(g, v);
      }
    }
    if (!Number.isFinite(g)) g = groundAt(toLngLat(p));
    const z = (Number.isFinite(g) ? g : zf) + 0.03;
    memo.set(k, z);
    return z;
  };
}

// 階段：段（踏面・蹴上げ・両わきの段の形）・裏の斜めの面・手すり（rails）
function addFloorStairs(M, s, zf, T, tint, cutTop) {
  const { m, glassy, veil } = M;
  const G = stairGeom(s, zf);
  const { zA, nT, riser, tread, hw, P, u, n, L, R } = G;
  const c = T(STAIR_COL[s.kind] || "stairWhite");
  const edge = T("stairEdge");
  const soff = (sv) => Math.max(zA - 0.01, zA + (R * sv) / L - SOFFIT);
  // 踏面 nT 枚（flush なら一番上の蹴上げは上の階の床のふちの面）
  for (let k = 0; k < nT; k++) {
    const s0 = k * tread, s1 = (k + 1) * tread;
    const zt = zA + (k + 1) * riser;
    if (zt > cutTop + 1e-6) break;
    face(m, [[P(s0, -hw), zt], [P(s1, -hw), zt], [P(s1, hw), zt], [P(s0, hw), zt]], [0, 0, 1], c);
    face(m, [[P(s0, hw), zt - riser], [P(s0, -hw), zt - riser], [P(s0, -hw), zt], [P(s0, hw), zt]], [-u[0], -u[1], 0], k ? c : edge);
    face(m, [[P(s0, hw), soff(s0)], [P(s1, hw), soff(s1)], [P(s1, hw), zt], [P(s0, hw), zt]], [n[0], n[1], 0], edge);
    face(m, [[P(s1, -hw), soff(s1)], [P(s0, -hw), soff(s0)], [P(s0, -hw), zt], [P(s1, -hw), zt]], [-n[0], -n[1], 0], edge);
  }
  const sTop = Math.min(L, Math.max(0, ((Math.min(cutTop, zA + R) - zA) / R) * L));
  if (sTop > 0.05) {
    const sl = Math.hypot(R, L);
    face(m, [[P(0, -hw), soff(0)], [P(sTop, -hw), soff(sTop)], [P(sTop, hw), soff(sTop)], [P(0, hw), soff(0)]], [(-R / sl) * u[0] * 0, 0, -1], T("ceiling"));
  }
  // 手すり（左・右）：段の角の線から 1.0m 上に手すり、格子・ガラスはその下の面
  (s.rails || []).forEach((k, i) => {
    if (!k) return;
    const lv = i === 0 ? hw : -hw;
    const a = P(0, lv), b = P(sTop, lv);
    const za = zA + riser, zb = zA + (R * sTop) / L + riser * 0.5;
    if (sTop < 0.05) return;
    const nn = [n[0] * (i === 0 ? 1 : -1), n[1] * (i === 0 ? 1 : -1), 0];
    if (k === "mesh") veil.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(MESH));
    if (k === "glass") glassy.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(GLASS));
    bar(m, [a, za + 1.0], [b, zb + 1.0], 0.05, T(k === "mesh" ? "mesh" : "rail"));
    if (k !== "rail") bar(m, [a, za - 0.08], [b, zb - 0.08], 0.05, T(k === "mesh" ? "mesh" : "rail"));
    const np = Math.max(1, Math.round(sTop / 1.6));
    for (let j = 0; j <= np; j++) {
      const p = lerp2(a, b, j / np);
      const z = za + ((zb - za) * j) / np;
      bar(m, [p, z - 0.1], [p, z + 1.0], 0.04, T(k === "mesh" ? "mesh" : "rail"));
    }
  });
}

// ── 屋根の下の天井（作り直し 2026-11-09）──
// ユーザーの写真（S__47235147＝真下から・S__47235150＝斜めから・動画）とアイソメ図の骨組み：屋根は斜めの RC の面（campus3dFeatures の
// roofSlab＝屋根の板をならした面。木の板はその上に段々に浮いている）。天井はその下の面（SLAB_T 下）で暗い灰色の吸音の板。
// 白い小梁（幅 BEAM_W・天井から BEAM_D 下）が斜面に直角に等間隔（大きくならした面の等高線を BEAM_DH ごと＝扇の段といっしょに回る）、
// 白い大梁（幅 GIRDER_W・天井から GIRDER_D 下）が柱（cols）を通って斜面の向きに。梁は下の階の床から頭の高さ（BEAM_HEAD・GIRDER_HEAD）
// より上だけ。上まで抜けたくり抜き（テラス）の中は描かない（天井の高さも Infinity）。ならした面のないところ（板から遠い）は前の決まり
// （屋根の高さ − ROOF_CEIL_DROP）。殻（detailShell）に描く板は上から見えるところだけ（visByIndex：高い板の下にもぐる部分は描かない）
const SLAB_T = 0.2;
const BEAM_W = 0.22;
const BEAM_D = 0.5;
const BEAM_DH = 0.35;
const BEAM_HEAD = 2.1;
const GIRDER_W = 0.5;
const GIRDER_D = 0.8;
const GIRDER_HEAD = 2.4;
const BEAM_INSET = 0.08;
const BEAM_WALL_GAP = 0.25;
const CEIL_EDGE_TOL = 0.3;
const CEIL_CELL = 1;
// 屋根の骨組み（建物の roofFrame。2026-11-10 作り直し、ユーザー「なんでこんなに天井がゆがんでるの？規則的にしたんじゃないの？」）：
// 前は小梁を「大きくならした面の等高線」・大梁を「柱ごとの斜面の向き」で引いていたので、梁が曲がって扇に開き、間隔もばらばらだった。
// 設計事務所のアイソメ図（大梁 500×1000・小梁 220×700）と写真では、大梁は南北にまっすぐ平行（柱の列 a = 7.1・13.88・20.6・27.5・34.45）、
// 小梁は南の緩い屋根で東西に 2.28m おき、北の急な斜面では水平な直線が扇に並ぶ（西で 1.0m・東で 1.85m おき。北西のふちも扇の 1 本）。
// 天井＝格子の点（大梁 × 小梁）の RC の面の高さを結んだ面（小梁に沿って大梁のあいだは直線、小梁のあいだは b の向きに直線）。
// 小梁の点は、ずれが FRAME_FIT 以下なら本物の大梁の点を 1 本の直線にそろえる（水平な小梁がまっすぐ通る）
const FRAME_FIT = 0.15;
const FRAME_STEP = 0.5; // 梁の折れ線の点の間隔（頭の高さで切るため。点はみな梁の直線の上）
const FRAME_WALL = GIRDER_W / 2 + 0.3; // 大梁が外の壁とほぼ平行にこの距離（m）より近いところが半分以上なら描かない（壁が受ける）
const ceilCache = new WeakMap();
const closeR = (r) => [...r, r[0]];
const openR = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
const inPoly = (q, poly) => pointInRing(q[0], q[1], poly[0]) && !poly.slice(1).some((h) => pointInRing(q[0], q[1], h));
const clipOp = (op, ...gs) => {
  try {
    return polygonClipping[op](...gs);
  } catch {
    return null;
  }
};
const boxOf = (r) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
};
const boxHit = (A, B) => A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1];
// 凸な形どうしが重なるか（分離軸）。板は四角なので、これで重なる板だけと引き算する
const convexHit = (A, B) => {
  for (const R of [A, B]) {
    for (let i = 0; i < R.length; i++) {
      const p = R[i], q = R[(i + 1) % R.length];
      const n = [q[1] - p[1], p[0] - q[0]];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v[0] * n[0] + v[1] * n[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of B) { const d = v[0] * n[0] + v[1] * n[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  }
  return true;
};
// 屋根の骨組み（f.roofFrame）の格子：{ toAB, fromAB, G（大梁の a。最初と最後は建物の外の仮の線）, R（小梁 { c, d }：b = c + d·a。最初と
// 最後は仮の線）, Z（格子の点の RC の上の面の標高 [小梁][大梁]）, top(q)（格子の点を結んだ面の標高） }。slabAbs(q) は RC の面の標高（なければ null）
function roofFrameGrid(f, ring, slabAbs, isOpen = () => false) {
  const rf = f.roofFrame;
  if (!rf || !(rf.ribs?.length >= 2)) return null;
  const O = toXY(rf.origin);
  const th = (rf.angle * Math.PI) / 180;
  const E = [Math.cos(th), Math.sin(th)], N = [-Math.sin(th), Math.cos(th)];
  const toAB = (q) => {
    const dx = q[0] - O[0], dy = q[1] - O[1];
    return [dx * E[0] + dy * E[1], dx * N[0] + dy * N[1]];
  };
  const fromAB = (a, b) => [O[0] + E[0] * a + N[0] * b, O[1] + E[1] * a + N[1] * b];
  const ab = ring.map(toAB);
  const a0 = Math.min(...ab.map((p) => p[0])) - 1, a1 = Math.max(...ab.map((p) => p[0])) + 1;
  const b0 = Math.min(...ab.map((p) => p[1])) - 1, b1 = Math.max(...ab.map((p) => p[1])) + 1;
  const G = [a0, ...rf.girders.filter((a) => a > a0 + 0.3 && a < a1 - 0.3), a1];
  const bAt = (r, a) => r.c + r.d * a;
  const am = (a0 + a1) / 2;
  const rs = rf.ribs.map(([c, d]) => ({ c, d })).sort((p, q) => bAt(p, am) - bAt(q, am));
  const first = rs[0], last = rs[rs.length - 1];
  const kS = Math.max(1, Math.max(bAt(first, a0), bAt(first, a1)) - b0 + 1);
  const kN = Math.max(1, b1 - Math.min(bAt(last, a0), bAt(last, a1)) + 1);
  const R = [{ c: first.c - kS, d: first.d, virt: true }, ...rs, { c: last.c + kN, d: last.d, virt: true }];
  const inside = (q) => pointInRing(q[0], q[1], ring);
  // 本物の小梁 × 本物の大梁の点だけ RC の面から取る（建物の外の仮の線の点は、外の地面へ下がる板の面を拾うので使わない）
  const Z = R.map((r, ri) => G.map((a, gi) => (ri > 0 && ri < R.length - 1 && gi > 0 && gi < G.length - 1 ? slabAbs(fromAB(a, bAt(r, a))) : null)));
  // 本物の小梁：建物の中の点を直線にそろえる（ずれが FRAME_FIT 以下のとき。小梁の上の本物の点はみなその直線に）
  for (let ri = 1; ri < R.length - 1; ri++) {
    const pts = [];
    for (let gi = 1; gi < G.length - 1; gi++) if (Z[ri][gi] != null && inside(fromAB(G[gi], bAt(R[ri], G[gi])))) pts.push([G[gi], Z[ri][gi]]);
    if (pts.length < 2) continue;
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const den = n * sxx - sx * sx;
    const k1 = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
    const k0 = (sy - k1 * sx) / n;
    // 扇の小梁（d ≠ 0）は図面で水平な直線なので、いつもそろえる（RC の面のでこぼこは板の段をならした名残り）
    if (!(Math.abs(R[ri].d) > 1e-9) && pts.some((p) => Math.abs(k0 + k1 * p[0] - p[1]) > FRAME_FIT)) continue;
    for (let gi = 1; gi < G.length - 1; gi++) Z[ri][gi] = k0 + k1 * G[gi];
  }
  // 本物の点で高さのないもの：同じ大梁の上の前後の小梁から（b の向きに直線で）、それもなければ同じ小梁の隣の点
  for (let gi = 1; gi < G.length - 1; gi++) {
    const col = R.map((r, ri) => ({ b: bAt(r, G[gi]), z: Z[ri][gi] }));
    const known = col.map((p, ri) => (p.z != null && ri > 0 && ri < R.length - 1 ? ri : -1)).filter((ri) => ri >= 0);
    if (!known.length) continue;
    for (let ri = 1; ri < R.length - 1; ri++) {
      if (Z[ri][gi] != null) continue;
      const lo = known.filter((k) => k < ri), hi = known.filter((k) => k > ri);
      const A = lo.length ? lo[lo.length - 1] : hi[0], B = hi.length ? hi[0] : lo.length > 1 ? lo[lo.length - 2] : null;
      if (B == null || col[A].b === col[B].b) Z[ri][gi] = col[A].z;
      else Z[ri][gi] = col[A].z + ((col[B].z - col[A].z) * (col[ri].b - col[A].b)) / (col[B].b - col[A].b);
    }
  }
  for (let ri = 1; ri < R.length - 1; ri++) {
    for (let gi = 1; gi < G.length - 1; gi++) {
      if (Z[ri][gi] != null) continue;
      let k = gi;
      while (k < G.length - 1 && Z[ri][k] == null) k++;
      if (Z[ri][k] == null) {
        k = gi;
        while (k > 0 && Z[ri][k] == null) k--;
      }
      Z[ri][gi] = Z[ri][k] ?? 0;
    }
  }
  // 仮の大梁の点：小梁に沿って、いちばん外の本物の大梁から外の壁までのあいだ（建物の中・天井のある所）の RC の面に、その大梁の点を
  // 通る直線をあてはめた傾き（壁ぎわで屋根が下がるところも小梁はまっすぐ。足りない分は天井の頭打ちで）。点が 4 つ未満なら水平
  const edgeZ = (ri, gEdge, gIn) => {
    const r = R[ri];
    const aIn = G[gIn];
    const zIn = Z[ri][gIn];
    const step = Math.sign(G[gEdge] - aIn) * 0.25;
    let sxx = 0, sxy = 0, n = 0;
    for (let a = aIn + step; (a - G[gEdge]) * step < 0; a += step) {
      const q = fromAB(a, bAt(r, a));
      if (!inside(q) || isOpen(q)) continue;
      const zs = slabAbs(q);
      if (zs == null) continue;
      sxx += (a - aIn) ** 2;
      sxy += (a - aIn) * (zs - zIn);
      n++;
    }
    return n >= 4 && sxx > 1e-9 ? zIn + (sxy / sxx) * (G[gEdge] - aIn) : zIn;
  };
  for (let ri = 1; ri < R.length - 1; ri++) {
    Z[ri][0] = edgeZ(ri, 0, 1);
    Z[ri][G.length - 1] = edgeZ(ri, G.length - 1, G.length - 2);
  }
  Z[0] = Z[1].slice();
  Z[R.length - 1] = Z[R.length - 2].slice();
  const top = (q) => {
    const [a, b] = toAB(q);
    let gi = 0;
    while (gi < G.length - 2 && a > G[gi + 1]) gi++;
    const u = (a - G[gi]) / (G[gi + 1] - G[gi]);
    let ri = 0;
    while (ri < R.length - 2 && b > bAt(R[ri + 1], a)) ri++;
    const zr = (k) => Z[k][gi] + (Z[k][gi + 1] - Z[k][gi]) * u;
    const bA = bAt(R[ri], a), bB = bAt(R[ri + 1], a);
    const v = bB - bA > 1e-6 ? (b - bA) / (bB - bA) : 0;
    return zr(ri) + (zr(ri + 1) - zr(ri)) * v;
  };
  return { toAB, fromAB, G, R, Z, bAt, top };
}
// 建物 f の屋根の下の天井：{ ring, g0, roof, slab, pieces（天井のある範囲 [{ poly（[外, 穴...]）, box, zAt }]）, pieceAt, at（点 → 天井の標高）,
// slabTop（点 → RC の屋根の上の面の標高）, isOpen, visByIndex }。同じ f には同じもの
export function roofCeiling(f, groundAt) {
  const key = f.coords;
  if (ceilCache.has(key)) return ceilCache.get(key);
  const ring0 = f.coords.map(toXY);
  const ring = ringArea(ring0) > 0 ? ring0 : ring0.slice().reverse();
  const g0 = groundAt(f.groundRef || toLngLat(centroid(ring)));
  const roof = buildingRoof(f);
  const slab = roofSlab(f);
  const open = (f.carves || []).filter((cv) => cv.top == null).map((cv) => cv.coords.map(toXY));
  const isOpen = (q) => open.some((o) => pointInRing(q[0], q[1], o));
  const openG = open.map((o) => [closeR(o)]);
  const ringG = [closeR(ring)];
  const rbox = boxOf(ring);
  // 殻に描く板の見えるところ（本当の高さで高い板から順に、板の形のまま。高い板と重なるところ・くり抜きは除く）
  const boards0 = roof.boards.list.map((b, i) => {
    const r = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
    return { i, r, rbox: boxOf(r), key: b.zAt(centroid(b.ring)) };
  }).filter((B) => boxHit(B.rbox, rbox));
  const sorted = boards0.slice().sort((p, q) => q.key - p.key || p.i - q.i);
  const visByIndex = new Map();
  sorted.forEach((B, k) => {
    let vis = clipOp("intersection", [closeR(B.r)], ringG);
    if (!vis?.length) return;
    const higher = [];
    for (let j = 0; j < k; j++) if (boxHit(sorted[j].rbox, B.rbox) && convexHit(sorted[j].r, B.r)) higher.push([closeR(sorted[j].r)]);
    if (higher.length) vis = clipOp("difference", vis, ...higher);
    if (vis?.length && openG.length) vis = clipOp("difference", vis, ...openG);
    if (vis?.length) visByIndex.set(B.i, vis.map((poly) => poly.map(openR).filter((r) => r.length >= 3)).filter((pg) => pg.length));
  });
  // 天井のある範囲（建物の形 − 上まで抜けたくり抜き）
  const region = (openG.length ? clipOp("difference", ringG, ...openG) : [ringG]) || [ringG];
  const slabTop = (q) => {
    const z = slab ? slab.at(q) : null;
    return z != null ? g0 + z : g0 + roof.hAt(q) - ROOF_CEIL_DROP + SLAB_T;
  };
  // 建物の形の外（ふちから CEIL_EDGE_TOL m より外）・上まで抜けたくり抜きの中は Infinity。ふちのすぐ外は形の中と同じ（外の壁と同じ線の
  // 階の壁が、天井で切られずに屋根の上まで伸びない）
  const nearRing = (q) => ring.some((p, i) => {
    const b = ring[(i + 1) % ring.length];
    const u = sub(b, p);
    const uu = u[0] * u[0] + u[1] * u[1];
    if (uu < 1e-12) return false;
    const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / uu));
    return len(sub(q, [p[0] + u[0] * t, p[1] + u[1] * t])) < CEIL_EDGE_TOL;
  });
  // 天井の面（RC の面の SLAB_T 下）。骨組み（roofFrame）があれば格子の点を結んだ面（RC の面より 0.05m 以上は上へ出さない）
  const frame = slab ? roofFrameGrid(f, ring, (q) => {
    const z = slab.at(q);
    return z == null ? null : g0 + z;
  }, isOpen) : null;
  const soffit = frame
    ? (q) => {
        const zf = frame.top(q) - SLAB_T;
        const zs = slab.at(q);
        return zs == null ? zf : Math.min(zf, g0 + zs - 0.05);
      }
    : (q) => slabTop(q) - SLAB_T;
  const at = (q) => ((!pointInRing(q[0], q[1], ring) && !nearRing(q)) || isOpen(q) ? Infinity : soffit(q));
  const pieces = region
    .map((poly) => poly.map(openR).filter((r) => r.length >= 3))
    .filter((pg) => pg.length && Math.abs(ringArea(pg[0])) > 1e-3)
    .map((pg) => ({ poly: pg, box: boxOf(pg[0]), zAt: at }));
  const pieceAt = (q) => pieces.find((pc) => q[0] >= pc.box[0] && q[0] <= pc.box[2] && q[1] >= pc.box[1] && q[1] <= pc.box[3] && inPoly(q, pc.poly)) || null;
  const out = { ring, g0, roof, slab, pieces, pieceAt, at, slabTop, soffit, frame, isOpen, visByIndex };
  ceilCache.set(key, out);
  return out;
}
// 等高線（四角の升目の値 G（nx × ny、点 (x0 + i·cell, y0 + j·cell)、NaN はなし）を、step ごとの高さで）：折れ線の並び [[x, y], ...]
function contourLines(G, step, box) {
  const { x0, y0, cell, nx, ny, coarse: V } = G;
  const i0 = Math.max(0, Math.floor((box[0] - x0) / cell) - 1), i1 = Math.min(nx - 2, Math.ceil((box[2] - x0) / cell) + 1);
  const j0 = Math.max(0, Math.floor((box[1] - y0) / cell) - 1), j1 = Math.min(ny - 2, Math.ceil((box[3] - y0) / cell) + 1);
  let lo = Infinity, hi = -Infinity;
  for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) {
    const v = V[j * nx + i];
    if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  if (!(hi > lo)) return [];
  const out = [];
  const val = (i, j) => V[j * nx + i];
  const P = (i, j) => [x0 + i * cell, y0 + j * cell];
  for (let k = Math.ceil(lo / step); k * step <= hi; k++) {
    const L = k * step + 1e-6;
    // 升ごとの線分（端は升の辺の上の点。辺の名前でつなぐ）
    const segs = [];
    const pt = new Map();
    const edge = (ia, ja, ib, jb) => {
      const key = `${ia},${ja},${ib},${jb}`;
      if (!pt.has(key)) {
        const va = val(ia, ja), vb = val(ib, jb);
        const t = (L - va) / (vb - va);
        const a = P(ia, ja), b = P(ib, jb);
        pt.set(key, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      return key;
    };
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = [val(i, j), val(i + 1, j), val(i + 1, j + 1), val(i, j + 1)];
        if (!v.every(Number.isFinite)) continue;
        const c = v.map((x) => (x > L ? 1 : 0));
        const idx = c[0] | (c[1] << 1) | (c[2] << 2) | (c[3] << 3);
        if (idx === 0 || idx === 15) continue;
        const e = [edge(i, j, i + 1, j), edge(i + 1, j, i + 1, j + 1), edge(i, j + 1, i + 1, j + 1), edge(i, j, i, j + 1)]; // 下・右・上・左
        const add = (a, b) => segs.push([e[a], e[b]]);
        switch (idx) {
          case 1: case 14: add(3, 0); break;
          case 2: case 13: add(0, 1); break;
          case 3: case 12: add(3, 1); break;
          case 4: case 11: add(1, 2); break;
          case 6: case 9: add(0, 2); break;
          case 7: case 8: add(3, 2); break;
          case 5: case 10: {
            const mid = (v[0] + v[1] + v[2] + v[3]) / 4 > L;
            if ((idx === 5) === mid) { add(3, 2); add(0, 1); } else { add(3, 0); add(1, 2); }
            break;
          }
        }
      }
    }
    // つなぐ
    const ends = new Map();
    segs.forEach((s, si) => s.forEach((key) => { if (!ends.has(key)) ends.set(key, []); ends.get(key).push(si); }));
    const used = new Uint8Array(segs.length);
    const walk = (si, from) => {
      const line = [from];
      let cur = si, at = from;
      while (cur != null && !used[cur]) {
        used[cur] = 1;
        const nxt = segs[cur][0] === at ? segs[cur][1] : segs[cur][0];
        line.push(nxt);
        at = nxt;
        cur = (ends.get(at) || []).find((x) => !used[x]) ?? null;
      }
      return line;
    };
    for (let si = 0; si < segs.length; si++) {
      if (used[si]) continue;
      // 端（つながりが 1 つの点）から始める。輪ならどこからでも
      let start = segs[si][0];
      let cur = si;
      const seen = new Set();
      while (!seen.has(cur)) {
        seen.add(cur);
        const other = (ends.get(start) || []).find((x) => x !== cur && !used[x]);
        if (other == null) break;
        start = segs[other][0] === start ? segs[other][1] : segs[other][0];
        cur = other;
      }
      const line = walk(cur, segs[cur][0] === start ? segs[cur][0] : segs[cur][1]);
      if (line.length >= 2) out.push(line.map((key) => pt.get(key)));
    }
  }
  return out;
}
// 線分 a→b と線分 c→d の交わる位置（a→b の上の割合 t。交わらなければ null）
function segT(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : null;
}
// 折れ線を、形（[外, 穴...] の並び）の中の部分だけに切る（ふちとの交わりで切る）。ふちの壁から BEAM_WALL_GAP m 以内を壁とほぼ平行に
// 走るところも除く（壁にぴったり沿う梁は描かない）。端は壁の線から、幅 w の角材の角が壁から出ないだけ手前で止める（壁に斜めに当たる
// ほど長く。壁の面と梁の端の面が重なってちらつかない）
function clipLine(pts, polys, w = 0) {
  const edges = [];
  for (const pg of polys) for (const r of pg) r.forEach((p, i) => edges.push([p, r[(i + 1) % r.length]]));
  const hugs = (p0, p1) => {
    const mid = lerp2(p0, p1, 0.5);
    const d = sub(p1, p0);
    const dl = len(d) || 1;
    return edges.some(([c, e]) => {
      const u = sub(e, c);
      const ul = len(u);
      if (ul < 1e-9) return false;
      const t = Math.max(0, Math.min(1, ((mid[0] - c[0]) * u[0] + (mid[1] - c[1]) * u[1]) / (ul * ul)));
      const dist = len(sub(mid, [c[0] + u[0] * t, c[1] + u[1] * t]));
      return dist < BEAM_WALL_GAP && Math.abs((d[0] * u[0] + d[1] * u[1]) / (dl * ul)) > 0.9;
    });
  };
  const inside = (q) => polys.some((pg) => inPoly(q, pg));
  // 端の手前の長さ：線の向き d が壁（向き u）に当たる角度から
  const insetFor = (d, wall) => {
    if (!wall) return BEAM_INSET;
    const u = sub(wall[1], wall[0]);
    const ul = len(u) || 1;
    const dl = len(d) || 1;
    const along = Math.abs((d[0] * u[0] + d[1] * u[1]) / (dl * ul)); // 壁の線と同じ向きの成分（＝角が出る割合）
    const across = Math.sqrt(Math.max(1e-6, 1 - along * along));
    return Math.min(2, BEAM_INSET + ((w / 2) * along) / across);
  };
  const out = [];
  let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const ts = [[0, null], [1, null]];
    for (const ed of edges) {
      const t = segT(a, b, ed[0], ed[1]);
      if (t != null) ts.push([t, ed]);
    }
    ts.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1][0] - ts[k][0] < 1e-9) continue;
      const p0 = lerp2(a, b, ts[k][0]), p1 = lerp2(a, b, ts[k + 1][0]);
      if (inside(lerp2(p0, p1, 0.5)) && !hugs(p0, p1)) {
        if (!cur) cur = { pts: [p0], w0: ts[k][1] };
        cur.pts.push(p1);
        cur.w1 = ts[k + 1][1];
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
    }
  }
  if (cur) out.push(cur);
  // 端から長さ rest を切り詰める（端の区間が短ければ、その先の区間までさかのぼる）
  const trimEnd = (l, rest) => {
    const o = l.slice();
    while (o.length >= 2) {
      const a = o[o.length - 1], b = o[o.length - 2];
      const L = len(sub(b, a));
      if (L > rest + 1e-6) {
        o[o.length - 1] = lerp2(a, b, rest / L);
        return o;
      }
      rest -= L;
      o.pop();
    }
    return o;
  };
  return out
    .filter((c) => c.pts.length >= 2)
    .map((c) => {
      const l = c.pts;
      const n = l.length;
      const r1 = insetFor(sub(l[n - 1], l[n - 2]), c.w1);
      const r0 = insetFor(sub(l[1], l[0]), c.w0);
      return trimEnd(trimEnd(l, r1).reverse(), r0).reverse();
    })
    .filter((l) => l.length >= 2 && l.reduce((s, p, i) => (i ? s + len(sub(p, l[i - 1])) : 0), 0) > 0.3);
}
// 折れ線に沿った角材（幅 w、上 top(点)・下 bot(点)）：下の面・両わきの面・両端の面。外向きの面だけ（片面で描く段でもよい）
function beamAlong(m, pts, w, top, bot, c) {
  const n = pts.length;
  if (n < 2) return;
  const segN = [];
  for (let i = 0; i + 1 < n; i++) {
    const d = sub(pts[i + 1], pts[i]);
    const L = len(d) || 1;
    segN.push([-d[1] / L, d[0] / L]); // 左
  }
  const off = pts.map((p, i) => {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)];
    let v = [a[0] + b[0], a[1] + b[1]];
    const vl = len(v) || 1;
    v = [v[0] / vl, v[1] / vl];
    const k = Math.min(3, 1 / Math.max(0.33, v[0] * b[0] + v[1] * b[1]));
    return [v[0] * k * (w / 2), v[1] * k * (w / 2)];
  });
  const Lp = pts.map((p, i) => [p[0] + off[i][0], p[1] + off[i][1]]);
  const Rp = pts.map((p, i) => [p[0] - off[i][0], p[1] - off[i][1]]);
  const zt = pts.map(top);
  const zb = pts.map(bot);
  for (let i = 0; i + 1 < n; i++) {
    const nl = [segN[i][0], segN[i][1], 0];
    const nr = [-segN[i][0], -segN[i][1], 0];
    face(m, [[Lp[i], zb[i]], [Rp[i], zb[i]], [Rp[i + 1], zb[i + 1]], [Lp[i + 1], zb[i + 1]]], [0, 0, -1], c);
    face(m, [[Lp[i + 1], zb[i + 1]], [Lp[i + 1], zt[i + 1]], [Lp[i], zt[i]], [Lp[i], zb[i]]], nl, c);
    face(m, [[Rp[i], zb[i]], [Rp[i], zt[i]], [Rp[i + 1], zt[i + 1]], [Rp[i + 1], zb[i + 1]]], nr, c);
  }
  const t0 = sub(pts[0], pts[1]);
  const t1 = sub(pts[n - 1], pts[n - 2]);
  const l0 = len(t0) || 1, l1 = len(t1) || 1;
  face(m, [[Rp[0], zb[0]], [Lp[0], zb[0]], [Lp[0], zt[0]], [Rp[0], zt[0]]], [t0[0] / l0, t0[1] / l0, 0], c);
  face(m, [[Lp[n - 1], zb[n - 1]], [Rp[n - 1], zb[n - 1]], [Rp[n - 1], zt[n - 1]], [Lp[n - 1], zt[n - 1]]], [t1[0] / l1, t1[1] / l1, 0], c);
}
// 角材を、下の端が床から head より上のところだけに分けて（下が上より 5cm 以上下のところ）
function beamRuns(m, pts, w, top, bot, c) {
  let run = [];
  const flush = () => {
    if (run.length >= 2) beamAlong(m, run, w, top, bot, c);
    run = [];
  };
  for (const p of pts) {
    if (top(p) - bot(p) > 0.05) run.push(p);
    else flush();
  }
  flush();
}
// RC の屋根の面の向き（sg 1 は上の面＝上向き、-1 は下の面＝天井＝下向き）。斜面の傾き（slab.grad）から
function slabNormal(C, q, sg) {
  const g = C.slab ? C.slab.grad(q) : null;
  if (!g) return [0, 0, sg];
  const l = Math.hypot(g[0], g[1], 1);
  return sg > 0 ? [-g[0] / l, -g[1] / l, 1 / l] : [g[0] / l, g[1] / l, -1 / l];
}
// 形（pieces：[{ poly, box }]）を CEIL_CELL m の升目で張る面（高さ zFn(点)、向き n＝数の並びか点 → 向き（升ごとに、升のまん中で）、色 c）。
// 形のふちが通る升は形で切る
function surfaceCells(m, pieces, zFn, n, c) {
  const nAt = typeof n === "function" ? n : () => n;
  for (const pc of pieces) {
    const edgeCells = new Set();
    for (const r of pc.poly) {
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        const k = Math.max(1, Math.ceil(len(sub(b, a)) / (CEIL_CELL * 0.2)));
        for (let s = 0; s <= k; s++) {
          const q = lerp2(a, b, s / k);
          for (const dx of [-1e-6, 1e-6]) for (const dy of [-1e-6, 1e-6]) edgeCells.add(`${Math.floor((q[0] + dx) / CEIL_CELL)},${Math.floor((q[1] + dy) / CEIL_CELL)}`);
        }
      });
    }
    const polyC = pc.poly.map(closeR);
    for (let gx = Math.floor(pc.box[0] / CEIL_CELL); gx * CEIL_CELL < pc.box[2]; gx++) {
      for (let gy = Math.floor(pc.box[1] / CEIL_CELL); gy * CEIL_CELL < pc.box[3]; gy++) {
        const x0 = gx * CEIL_CELL, y0 = gy * CEIL_CELL, x1 = x0 + CEIL_CELL, y1 = y0 + CEIL_CELL;
        const sq = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        if (edgeCells.has(`${gx},${gy}`)) {
          for (const pg of clipOp("intersection", [closeR(sq)], polyC) || []) {
            const pp = pg.map(openR).filter((r) => r.length >= 3);
            if (pp.length) m.polygon(pp, zFn, nAt(centroid(pp[0])), c);
          }
        } else if (inPoly([x0 + CEIL_CELL / 2, y0 + CEIL_CELL / 2], pc.poly)) m.polygon([sq], zFn, nAt([x0 + CEIL_CELL / 2, y0 + CEIL_CELL / 2]), c);
      }
    }
  }
}
// RC の屋根の上の面（板のすき間の下に見える暗い面。上向き）。屋根の板のある建物の殻から。地面より下には描かない（北の端は屋根の板が
// 地面まで下がり、ならした面は地面の下＝地下の階の中に入る）
export function addRoofSlabTop(m, f, groundAt, col) {
  const C = roofCeiling(f, groundAt);
  if (!Number.isFinite(C.g0) || !C.slab) return;
  surfaceCells(m, C.pieces, (q) => Math.max(C.slabTop(q), C.g0 + 0.02), (q) => slabNormal(C, q, 1), col);
}
// 屋根の下の天井と梁を描く。opts：cols（屋根の下まで届く柱の点。大梁がそこを通る）、floorAt（点 → その下のいちばん上の床の標高）。
// m は片面で描く段（cull）がよい（天井は下からだけ見える）
export function addRoofCeiling(m, f, groundAt, tint = (c) => c, { cols = [], floorAt = null } = {}) {
  const C = roofCeiling(f, groundAt);
  if (!Number.isFinite(C.g0) || !C.pieces.length) return;
  const panel = shade(tint(COL.roofCeil), [0, 0, -1]);
  const beamC = tint(COL.beam);
  const zc = C.soffit;
  const floorZ = (q) => {
    const z = floorAt ? floorAt(q) : -Infinity;
    return Number.isFinite(z) ? z : C.g0;
  };
  // 天井の面の下向きの法線（骨組みの面は格子の点を結んだ面なので、その傾きから）
  const soffitNormal = (q) => {
    const e = 0.25;
    const gx = (zc([q[0] + e, q[1]]) - zc([q[0] - e, q[1]])) / (2 * e);
    const gy = (zc([q[0], q[1] + e]) - zc([q[0], q[1] - e])) / (2 * e);
    const l = Math.hypot(gx, gy, 1);
    return Number.isFinite(l) ? [gx / l, gy / l, -1 / l] : [0, 0, -1];
  };
  // 1) 天井の板：CEIL_CELL m の升目ごと（形のふちが通る升は形で切る）。高さは点ごと（なめらかな斜面）
  surfaceCells(m, C.pieces, zc, C.frame ? soffitNormal : (q) => slabNormal(C, q, -1), panel);
  const S = C.slab;
  if (!S) return;
  const polys = C.pieces.map((pc) => pc.poly);
  if (C.frame) {
    addFrameBeams(m, C, polys, floorZ, beamC);
    return;
  }
  // 2) 小梁：大きくならした面の等高線（BEAM_DH ごと）。下の端は下の階の床から BEAM_HEAD より上
  const box = boxOf(C.ring);
  for (const line of contourLines(S.grid, BEAM_DH, box)) {
    for (const part of clipLine(line, polys, BEAM_W)) {
      beamRuns(m, part, BEAM_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - BEAM_D, floorZ(q) + BEAM_HEAD), beamC);
    }
  }
  // 3) 大梁：柱ごとに、大きくならした面の斜面の向き（ほぼ同じ線の上の柱は 1 本に）。柱から両向きに、天井のある範囲を出るまで
  const seen = [];
  for (const c of cols) {
    if (!Number.isFinite(C.at(c))) continue;
    const g = S.gradC(c);
    const gl = g ? Math.hypot(g[0], g[1]) : 0;
    if (gl < 1e-3) continue;
    const d = [g[0] / gl, g[1] / gl];
    if (seen.some((o) => Math.abs(d[0] * o.d[0] + d[1] * o.d[1]) > 0.985 && Math.abs((c[0] - o.c[0]) * -o.d[1] + (c[1] - o.c[1]) * o.d[0]) < 1.0)) continue;
    seen.push({ c, d });
    const STEP = 0.5;
    const pts = [c];
    for (const sg of [1, -1]) {
      for (let s = STEP; s < 150; s += STEP) {
        const q = [c[0] + d[0] * s * sg, c[1] + d[1] * s * sg];
        if (!Number.isFinite(C.at(q))) break;
        if (sg > 0) pts.push(q);
        else pts.unshift(q);
      }
    }
    const line = [[pts[0][0] - d[0] * STEP, pts[0][1] - d[1] * STEP], ...pts, [pts[pts.length - 1][0] + d[0] * STEP, pts[pts.length - 1][1] + d[1] * STEP]];
    for (const part of clipLine(line, polys, GIRDER_W)) {
      beamRuns(m, part, GIRDER_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - GIRDER_D, floorZ(q) + GIRDER_HEAD), beamC);
    }
  }
}
// 骨組み（roofFrame）の梁：本物の小梁は建物の幅いっぱいの直線（大梁のところと FRAME_STEP ごとに点）、本物の大梁は奥行きいっぱいの直線
// （小梁と交わるところと FRAME_STEP ごとに点）を、天井のある範囲（polys）で切って、天井から下げる（下の端は下の階の床から頭の高さより上）。
// 外の壁とほぼ平行に FRAME_WALL m より近い大梁は描かない（壁が受ける。梁の面が壁の外へ出ない）
function addFrameBeams(m, C, polys, floorZ, beamC) {
  const Fr = C.frame;
  const zc = C.soffit;
  const dense = (vals) => {
    const out = [];
    for (let k = 0; k + 1 < vals.length; k++) {
      const n = Math.max(1, Math.ceil((vals[k + 1] - vals[k]) / FRAME_STEP));
      for (let j = 0; j < n; j++) out.push(vals[k] + ((vals[k + 1] - vals[k]) * j) / n);
    }
    out.push(vals[vals.length - 1]);
    return out;
  };
  for (let ri = 1; ri < Fr.R.length - 1; ri++) {
    const r = Fr.R[ri];
    const line = dense(Fr.G).map((a) => Fr.fromAB(a, Fr.bAt(r, a)));
    for (const part of clipLine(line, polys, BEAM_W)) {
      beamRuns(m, part, BEAM_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - BEAM_D, floorZ(q) + BEAM_HEAD), beamC);
    }
  }
  const ring = C.ring;
  const wallNear = (q, dir) => ring.some((p, i) => {
    const b = ring[(i + 1) % ring.length];
    const u = sub(b, p);
    const ul = len(u);
    if (ul < 1e-9 || Math.abs((u[0] * dir[0] + u[1] * dir[1]) / ul) < 0.95) return false;
    const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / (ul * ul)));
    return len(sub(q, [p[0] + u[0] * t, p[1] + u[1] * t])) < FRAME_WALL;
  });
  for (let gi = 1; gi < Fr.G.length - 1; gi++) {
    const a = Fr.G[gi];
    const bs = Fr.R.map((r) => Fr.bAt(r, a)).sort((x, y) => x - y);
    const line = dense(bs).map((b) => Fr.fromAB(a, b));
    const parts = clipLine(line, polys, GIRDER_W);
    const dir = sub(Fr.fromAB(a, 1), Fr.fromAB(a, 0));
    const pts = parts.flat();
    if (pts.length && pts.filter((q) => wallNear(q, dir)).length > pts.length / 2) continue;
    for (const part of parts) {
      beamRuns(m, part, GIRDER_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - GIRDER_D, floorZ(q) + GIRDER_HEAD), beamC);
    }
  }
}
// 天井の高さ（点 → 標高）：建物 f の屋根の下の天井
export function roofCeilAt(f, groundAt) {
  const C = roofCeiling(f, groundAt);
  return (q) => C.at(q);
}

// 地下の階の下を掘ったふち（dig）の帯：形の外へ WALL_T + WALL_CAP、下は掘った地面・上は掘る前の地面の少し下（上の面の色は路面）。
// 外がほかの dig でもっと深く掘ってあるところは描かない
// 帯は辺ごとに DIG_BAND_STEP m 以下の区間に分け、区間の両端の上の面の高さは、帯の中ほど（ふちから 3 割）と外のふちの地面の高いほう
// （前は辺の両端の外のふちの地面を直線で結んでいたので、辺の途中から外が掘り下げた平地になると、広場の上で帯が何 m も下がって
// 地下が見える穴になった：Taki の北西の角、ユーザーの目印 13「近くに穴が開いてる」）
const DIG_BAND_STEP = 1;
export function digBandPieces(dig, digs, groundAt) {
  const ring = ringArea(dig.ring) > 0 ? dig.ring : dig.ring.slice().reverse();
  const outer = offsetRingBy(ring, ring.map(() => WALL_T + WALL_CAP));
  const out = [];
  const topAt = (p, o) => {
    const g1 = groundAt(toLngLat(lerp2(p, o, 0.3)));
    const g2 = groundAt(toLngLat(o));
    const g = Math.max(Number.isFinite(g1) ? g1 : -Infinity, Number.isFinite(g2) ? g2 : -Infinity);
    return Number.isFinite(g) ? g - 0.03 : NaN;
  };
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const oa = outer[i], ob = outer[(i + 1) % ring.length];
    const k = Math.max(1, Math.ceil(len(sub(b, a)) / DIG_BAND_STEP));
    for (let j = 0; j < k; j++) {
      const pa = lerp2(a, b, j / k), pb = lerp2(a, b, (j + 1) / k);
      const qa = lerp2(oa, ob, j / k), qb = lerp2(oa, ob, (j + 1) / k);
      const mo = lerp2(qa, qb, 0.5);
      const probe = lerp2(lerp2(pa, pb, 0.5), mo, 0.3);
      // 外のほかの掘った所：同じか深ければ帯はいらない。浅ければ帯はその底まで（上の階の床の下）
      const outer2 = digs.filter((o) => o !== dig && pointInRing(probe[0], probe[1], o.ring) && !o.holes.some((h) => pointInRing(probe[0], probe[1], h)));
      if (outer2.some((o) => o.level <= dig.level + 0.05)) continue;
      const cap = outer2.length ? Math.min(...outer2.map((o) => o.level)) : null;
      const ga = cap ?? topAt(pa, qa), gb = cap ?? topAt(pb, qb);
      if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
      out.push({ a: pa, b: pb, oa: qa, ob: qb, ta: ga, tb: gb, level: dig.level, mo, capped: cap != null });
    }
  });
  return out;
}
// 帯の上の面は、ふちに沿って 1m ごとに、ふちのすぐ外（帯の幅の 1/4）の路面の色（なければ、となりの区切りの色・地面の色）。
// 上の面は、標高タイルの補間で外の地面が帯の上より下がるところだけ見える（明かり取りのガラスの足もとなど）ので、そこの床と同じ色に
// （帯のまん中の 1 点で測ると、明かり取りでは大階段の下で路面がなく、白いぎざぎざが出ていた）
export function addDigBand(m, dig, digs, groundAt, paintAt, ground) {
  for (const p of digBandPieces(dig, digs, groundAt)) {
    if (Math.max(p.ta, p.tb) < p.level + 0.05) continue;
    const L = len(sub(p.b, p.a)) || 1;
    const n = [(p.b[1] - p.a[1]) / L, -(p.b[0] - p.a[0]) / L, 0]; // 外向き（左回りの輪の右）
    face(m, [[p.b, p.level], [p.a, p.level], [p.a, p.ta], [p.b, p.tb]], [-n[0], -n[1], 0], COL.wall);
    const k = Math.max(1, Math.ceil(L / 1));
    const cols = [];
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      cols.push(p.capped ? COL.wall : (paintAt && paintAt(lerp2(lerp2(p.a, p.b, t), lerp2(p.oa, p.ob, t), 0.25))) || null);
    }
    const near = (i) => { for (let d = 1; d < k; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < k && cols[j]) return cols[j]; return null; };
    for (let i = 0; i < k; i++) {
      const t0 = i / k, t1 = (i + 1) / k;
      const col = cols[i] || near(i) || ground || COL.plaza;
      const z0 = p.ta + (p.tb - p.ta) * t0, z1 = p.ta + (p.tb - p.ta) * t1;
      m.quad([[lerp2(p.a, p.b, t0), z0], [lerp2(p.a, p.b, t1), z1], [lerp2(p.oa, p.ob, t1), z1], [lerp2(p.oa, p.ob, t0), z0]], [0, 0, 1], col);
    }
  }
}

// ── 歩く世界：階の立体・壁・段（campus3dWalk.js の walkWorld から）──
// add は { solid(outer, holes, spans, piece), edge(a, b, half, spans, stand) }（spans は [[下, 上]...] の標高）、BODY は体の半径
export function floorWalk(f, groundAt, add, BODY) {
  const g0 = floorG0(f, groundAt);
  if (!Number.isFinite(g0)) return;
  const zf = g0 + f.z;
  const ring = f.coords.map(toXY);
  const holes = (f.holes || []).map((h) => h.coords.map(toXY));
  // 床（穴は抜ける）
  add.solid(ring, holes, () => [[zf - f.slab, zf]], 2);
  // 壁・ガラス・手すり：扉の口は通れる（まぐさの下は 2.2m）
  for (const w of f.walls || []) {
    const pts = w.coords.map(toXY);
    const t = wallT(w);
    const S = wallSlope(f, w, pts, zf);
    for (const pc of wallPieces(pts, w.doors || [])) {
      // 斜めの壁（h2・z02）は区間の両端の低い下の端・高い上の端（まっすぐな壁は前と同じ）
      const z0 = Math.min(S.bot(pc.a), S.bot(pc.b));
      const z1 = Math.max(S.top(pc.a), S.top(pc.b));
      const lo = pc.door ? (w.kind === "mesh" || w.kind === "rail" || w.kind === "low" ? null : z0 + DOOR_H) : z0;
      if (lo == null || !(z1 > lo)) continue;
      const stand = w.kind === "low";
      add.edge(pc.a, pc.b, t / 2 + BODY, [[lo, w.kind === "mesh" || w.kind === "rail" ? Math.max(z1, z0 + 1.5) : z1]], stand);
    }
  }
  // 家具など（上に立てる。低いもの＝0.6m までは段として上れる）。エレベーターの昇降路（lift）は中空：4 面の壁の線（扉の面は口をあける。
  // 閉まった扉は campus3dLift の liftBlocked が動く壁としてふさぐ）。中の床は階の床
  for (const it of f.items || []) {
    const r = it.coords.map(toXY);
    const span = [[zf + it.z0, zf + it.z1]];
    if (it.kind === "lift" && r.length === 4) {
      for (const sd of liftSides(r)) {
        const P = (s) => [sd.a[0] + sd.u[0] * s, sd.a[1] + sd.u[1] * s];
        if (!sd.door) add.edge(sd.inn(sd.a), sd.inn(sd.b), LIFT_WALL / 2 + BODY, span, false);
        else {
          add.edge(sd.inn(sd.a), sd.inn(P(sd.s0)), LIFT_WALL / 2 + BODY, span, false);
          add.edge(sd.inn(P(sd.s1)), sd.inn(sd.b), LIFT_WALL / 2 + BODY, span, false);
          if (it.z1 > it.z0 + LIFT_DOOR_H) add.edge(sd.inn(P(sd.s0)), sd.inn(P(sd.s1)), LIFT_WALL / 2 + BODY, [[zf + it.z0 + LIFT_DOOR_H, zf + it.z1]], false);
        }
      }
      continue;
    }
    add.solid(r, [], () => span, 0.5);
  }
  // 階段：段の上の面に立てる（裏は段の角から SOFFIT 下まで）。手すりの側は落ちない
  for (const s of f.stairs || []) {
    const G = stairGeom(s, zf);
    add.solid(G.ring, [], (x, y) => {
      const z = G.topAt(x, y);
      return z == null ? [] : [[Math.max(G.zA - 0.02, z - G.riser - SOFFIT), z]];
    }, 0.5);
    (s.rails || []).forEach((k, i) => {
      if (!k) return;
      const lv = i === 0 ? G.hw : -G.hw;
      for (let j = 0; j < G.nT; j++) {
        const a = G.P(j * G.tread, lv), b = G.P((j + 1) * G.tread, lv);
        const z = G.zA + (j + 1) * G.riser;
        add.edge(a, b, 0.03 + BODY, [[z - G.riser - SOFFIT, z + 1.5]], false);
      }
    });
  }
  // 地面の高さの床（掘る前の地面）。掘り下げた平地のふちのそば（壁の帯の中で地面が低い）でも、描くふた（lidGround の角の点）の
  // いちばん低いところより下げない（明かり取りのふちの壁は外が地下の階なら薄いので、その外はふたの上を歩く）
  for (const l of f.lids || []) {
    const r = l.coords.map(toXY);
    const zl = lidGround(r, groundAt, zf);
    const zMin = Math.min(...r.map(zl)) - 0.03;
    add.solid(r, [], (x, y) => {
      const g = Math.max(groundAt(toLngLat([x, y])), zMin);
      return Number.isFinite(g) ? [[g + 0.03 - 0.35, g + 0.03]] : [];
    }, 2);
  }
}
// 掘ったふちの帯：上は掘る前の地面（上を歩ける）、下は掘った地面
export function digWalk(dig, digs, groundAt, add) {
  for (const p of digBandPieces(dig, digs, groundAt)) {
    add.solid([p.a, p.b, p.ob, p.oa], [], (x, y) => {
      if (p.capped) return [[-Infinity, Math.max(p.ta, p.tb)]];
      const g = groundAt(toLngLat([x, y]));
      return [[-Infinity, Number.isFinite(g) ? g - 0.03 : Math.max(p.ta, p.tb)]];
    }, 0.5);
  }
}

// 部屋の名前を出す点（at か、形の中心）と高さ（床 + 0.3m の標高）：[{ name, xy, z }]
export function floorLabels(f, groundAt) {
  const g0 = floorG0(f, groundAt);
  if (!Number.isFinite(g0)) return [];
  return (f.rooms || []).filter((r) => r.name).map((r) => ({ name: r.name, xy: r.at ? toXY(r.at) : centroid(r.coords.map(toXY)), z: g0 + f.z + 0.3 }));
}
