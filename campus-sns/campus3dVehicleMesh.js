// 乗り物（campus3dVehicles）の形：自転車（26 インチのママチャリ）・車（右ハンドルの小さな 5 ドア）・ドローン（4 枚羽根）と、乗る人・操縦する人。
// ローカルの座標（前 x・左 y・上 z、m。乗り物の基準の点が原点）で部品ごとに三角形を作っておき（はじめの 1 回）、毎フレーム、向き・傾き・
// 車輪の回り・ハンドル・羽根を当てて描く座標（worldOf と標高 m）に書く。色のアルファ 0.5 は光を受けない（点いたライト）。
// 描くのは campus3dLayer の createVehiclesLayer：solid（ふつう）・glass（車の窓。濃い半透明）・screen（前かごの網・回る羽根。薄い半透明）・glow（光のにじみ）
import earcut from "earcut";
import { GlowMesh, worldOf } from "./campus3dMesh.js";
import { BIKE, CAR, DRONE } from "./campus3dVehicles.js";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
// ── ベクトル ──
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const basis = (ax) => {
  const t = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit(cross(ax, t));
  return [u, cross(ax, u)];
};
// 3×3（行ごと）
const rotAxis = (ax, a) => {
  const [x, y, z] = unit(ax);
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
const mm = (A, B) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
};
const mv = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// 点 p のまわりに回す（v → R(v − p) + p）
const about = (R, p) => ({ R, t: sub(p, mv(R, p)) });
const compose = (A, B) => ({ R: mm(A.R, B.R), t: add(mv(A.R, B.t), A.t) }); // A のあとに B を先に当てる：v → A(B v)
const ID = { R: I3, t: [0, 0, 0] };

// ── 部品：ローカルの三角形 ──
class Part {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
  }

  tri(a, b, c, col, nrm = null, ref = null) {
    let n = nrm || unit(cross(sub(b, a), sub(c, a)));
    if (ref && dot(n, sub(add(add(a, b), c).map((v) => v / 3), ref)) < 0) n = mul(n, -1);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      this.n.push(n[0], n[1], n[2]);
      this.c.push(col[0], col[1], col[2], col[3] ?? 1);
    }
  }

  // 四角形 a→b→c→d。ref（中の点）があれば法線をそこから離れる向きに
  quad(a, b, c, d, col, ref = null, nrm = null) {
    let n = nrm || unit(cross(sub(c, a), sub(d, b)));
    if (ref && dot(n, sub(lerp3(a, c, 0.5), ref)) < 0) n = mul(n, -1);
    this.tri(a, b, c, col, n);
    this.tri(a, c, d, col, n);
  }

  // 両面の四角形（薄い板：裏から見ても光の当たり方が合う）
  quad2(a, b, c, d, col, nrm = null) {
    const n = nrm || unit(cross(sub(c, a), sub(d, b)));
    this.tri(a, b, c, col, n);
    this.tri(a, c, d, col, n);
    const m = mul(n, -1);
    this.tri(a, c, b, col, m);
    this.tri(a, d, c, col, m);
  }

  freeze() {
    this.P = new Float32Array(this.p);
    this.N = new Float32Array(this.n);
    this.C = new Float32Array(this.c);
    this.count = this.p.length / 3;
    this.p = this.n = this.c = null;
    return this;
  }
}

// 筒（a → b、半径 r）
function tube(P, a, b, r, col, sides = 6, caps = false) {
  const ax = unit(sub(b, a));
  const [u, v] = basis(ax);
  const d = (k) => add(mul(u, Math.cos((k / sides) * TAU)), mul(v, Math.sin((k / sides) * TAU)));
  for (let k = 0; k < sides; k++) {
    const d0 = d(k), d1 = d(k + 1);
    P.quad(add(a, mul(d0, r)), add(b, mul(d0, r)), add(b, mul(d1, r)), add(a, mul(d1, r)), col, null, unit(add(d0, d1)));
  }
  if (caps) {
    for (const [c, s] of [[a, -1], [b, 1]]) for (let k = 0; k < sides; k++) P.tri(c, add(c, mul(d(k), r)), add(c, mul(d(k + 1), r)), col, mul(ax, s));
  }
}
// 折れ線に沿った筒
const tubes = (P, pts, r, col, sides = 6) => {
  for (let i = 0; i + 1 < pts.length; i++) tube(P, pts[i], pts[i + 1], r, col, sides, false);
};
// 輪（タイヤ）：中心 c・軸 ax のまわりの半径 R、太さ r
function torus(P, c, ax, R, r, col, seg = 24, sides = 6) {
  const A = unit(ax);
  const [u, v] = basis(A);
  const pt = (i, j) => {
    const ph = (i / seg) * TAU, ps = (j / sides) * TAU;
    const rho = add(mul(u, Math.cos(ph)), mul(v, Math.sin(ph)));
    const n = add(mul(rho, Math.cos(ps)), mul(A, Math.sin(ps)));
    return [add(add(c, mul(rho, R)), mul(n, r)), n];
  };
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < sides; j++) {
      const [p00, n00] = pt(i, j), [p10, n10] = pt(i + 1, j), [p11, n11] = pt(i + 1, j + 1), [p01, n01] = pt(i, j + 1);
      P.quad(p00, p10, p11, p01, col, null, unit(add(add(n00, n10), add(n11, n01))));
    }
  }
}
// 円板（両面）
function disc(P, c, ax, R, col, seg = 20, r0 = 0) {
  const A = unit(ax);
  const [u, v] = basis(A);
  const at = (k, r) => add(c, add(mul(u, Math.cos((k / seg) * TAU) * r), mul(v, Math.sin((k / seg) * TAU) * r)));
  for (let k = 0; k < seg; k++) {
    if (r0 > 0) P.quad2(at(k, r0), at(k, R), at(k + 1, R), at(k + 1, r0), col, A);
    else {
      P.tri(c, at(k, R), at(k + 1, R), col, A);
      P.tri(c, at(k + 1, R), at(k, R), col, mul(A, -1));
    }
  }
}
// 円柱（まん中 c・軸 ax・長さ h）
function cyl(P, c, ax, R, h, col, seg = 12, caps = true, capCol = col) {
  const A = unit(ax);
  const a = add(c, mul(A, -h / 2)), b = add(c, mul(A, h / 2));
  tube(P, a, b, R, col, seg, false);
  if (caps) {
    const [u, v] = basis(A);
    const at = (o, k) => add(o, add(mul(u, Math.cos((k / seg) * TAU) * R), mul(v, Math.sin((k / seg) * TAU) * R)));
    for (let k = 0; k < seg; k++) {
      P.tri(b, at(b, k), at(b, k + 1), capCol, A);
      P.tri(a, at(a, k + 1), at(a, k), capCol, mul(A, -1));
    }
  }
}
// 箱（まん中 c・軸ごとの大きさ s）。cols は [横, 上, 下] か 1 色
function box(P, c, s, col, top = col, bottom = col) {
  const [x, y, z] = c;
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const v = (i, j, k) => [x + i * hx, y + j * hy, z + k * hz];
  P.quad(v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1), col, null, [1, 0, 0]);
  P.quad(v(-1, 1, -1), v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), col, null, [-1, 0, 0]);
  P.quad(v(1, 1, -1), v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), col, null, [0, 1, 0]);
  P.quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), col, null, [0, -1, 0]);
  P.quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), top, null, [0, 0, 1]);
  P.quad(v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1), v(-1, -1, -1), bottom, null, [0, 0, -1]);
}
// 向きのある箱（まん中 c・軸 ex, ey, ez（単位）・半分の大きさ h）
function obox(P, c, ex, ey, ez, h, col) {
  const v = (i, j, k) => add(c, add(add(mul(ex, i * h[0]), mul(ey, j * h[1])), mul(ez, k * h[2])));
  const f = (a, b, cc, d, n) => P.quad(a, b, cc, d, col, null, n);
  f(v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1), ex);
  f(v(-1, 1, -1), v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), mul(ex, -1));
  f(v(1, 1, -1), v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), ey);
  f(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), mul(ey, -1));
  f(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), ez);
  f(v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1), v(-1, -1, -1), mul(ez, -1));
}
// 2 点のあいだの、向きのある箱（太さ w × d。体の手足・板）
function limb(P, a, b, w, d, col, side = [0, 0, 1]) {
  const ez = unit(sub(b, a));
  let ex = unit(cross(side, ez));
  if (!Number.isFinite(ex[0]) || Math.hypot(...cross(side, ez)) < 1e-4) ex = basis(ez)[0];
  const ey = cross(ez, ex);
  obox(P, lerp3(a, b, 0.5), ex, ey, ez, [w / 2, d / 2, Math.hypot(...sub(b, a)) / 2], col);
}
// だ円体（頭・サドル）
function ellipsoid(P, c, r, col, seg = 10, rings = 6) {
  const pt = (i, j) => {
    const th = (i / seg) * TAU, ph = -Math.PI / 2 + (j / rings) * Math.PI;
    const n = [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)];
    return [[c[0] + n[0] * r[0], c[1] + n[1] * r[1], c[2] + n[2] * r[2]], unit([n[0] / r[0], n[1] / r[1], n[2] / r[2]])];
  };
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rings; j++) {
      const [a, na] = pt(i, j), [b, nb] = pt(i + 1, j), [cc, nc] = pt(i + 1, j + 1), [d, nd] = pt(i, j + 1);
      P.quad(a, b, cc, d, col, null, unit(add(add(na, nb), add(nc, nd))));
    }
  }
}
// 円弧の帯（どろよけ）：車軸 c（xz の面）のまわり、半径 R・幅 w（y）・角度 a0〜a1（x から z へ、度）
function arcStrip(P, c, R, w, a0, a1, col, seg = 14, y0 = 0) {
  for (let i = 0; i < seg; i++) {
    const t0 = (a0 + ((a1 - a0) * i) / seg) * DEG, t1 = (a0 + ((a1 - a0) * (i + 1)) / seg) * DEG;
    const p = (t, y, r) => [c[0] + Math.cos(t) * r, y0 + y, c[2] + Math.sin(t) * r];
    const n = unit([Math.cos((t0 + t1) / 2), 0, Math.sin((t0 + t1) / 2)]);
    P.quad(p(t0, -w / 2, R), p(t1, -w / 2, R), p(t1, w / 2, R), p(t0, w / 2, R), col, null, n);
    P.quad(p(t0, w / 2, R - 0.006), p(t1, w / 2, R - 0.006), p(t1, -w / 2, R - 0.006), p(t0, -w / 2, R - 0.006), col, null, mul(n, -1));
    // ふちの返し
    for (const s of [1, -1]) P.quad(p(t0, (s * w) / 2, R), p(t1, (s * w) / 2, R), p(t1, (s * w) / 2, R - 0.022), p(t0, (s * w) / 2, R - 0.022), col, null, [0, s, 0]);
  }
}
// 横から見た形（x・z の多角形、反時計回り）を y の向きに押し出す。half(x, z) は半分の幅（場所で変わる：角を丸く・上ほど内へ）。
// edgeCol(i) は i 番目の辺の面の色（null なら描かない）、sideCol は両わきの面の色
function extrude(P, prof, half, sideCol, edgeCol) {
  const flat = [];
  prof.forEach((p) => flat.push(p[0], p[1]));
  const idx = earcut(flat);
  for (const s of [1, -1]) {
    for (let i = 0; i < idx.length; i += 3) {
      const q = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [prof[k][0], s * half(prof[k][0], prof[k][1]), prof[k][1]]);
      const n = unit(cross(sub(q[1], q[0]), sub(q[2], q[0])));
      P.tri(q[0], q[1], q[2], sideCol, n[1] * s >= 0 ? n : mul(n, -1));
    }
  }
  for (let i = 0; i < prof.length; i++) {
    const col = edgeCol(i);
    if (!col) continue;
    const a = prof[i], b = prof[(i + 1) % prof.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    const n = [dz / L, 0, -dx / L]; // 反時計回りの外向き
    const A = (p, s) => [p[0], s * half(p[0], p[1]), p[1]];
    P.quad(A(a, -1), A(b, -1), A(b, 1), A(a, 1), col, null, n);
  }
}
// 横の面（y = ±half(x, z) の曲がった面）に貼る四角（x, z の 4 点。少し外へ浮かせる）
function sidePatch(P, pts, half, s, col, lift = 0.004) {
  const q = pts.map(([x, z]) => [x, s * (half(x, z) + lift), z]);
  const n = unit(cross(sub(q[2], q[0]), sub(q[3], q[1])));
  P.quad(q[0], q[1], q[2], q[3], col, null, n[1] * s >= 0 ? n : mul(n, -1));
}

// ── 色 ──
const rgb = (hex, a = 1) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
const C = {
  frame: rgb("#8fb2c8"), // 自転車の車体（灰色がかった水色）
  tire: rgb("#1b1c1e"), rim: rgb("#c9cdd1"), spoke: rgb("#b4b9be"), hub: rgb("#8c9196"), chrome: rgb("#cfd3d6"),
  saddle: rgb("#2a2422"), grip: rgb("#2b2c2e"), basket: rgb("#26282b"), guard: rgb("#4b5560"), lampBody: rgb("#d7d9db"), lens: rgb("#e9e4cf"),
  reflector: rgb("#c62b22"), pedal: rgb("#2f3134"), stand: rgb("#9da2a7"),
  car: rgb("#2c5f8f"), carDark: rgb("#16181b"), trim: rgb("#202326"), glass: rgb("#121a22"), glassTop: rgb("#5d7385"), interior: rgb("#3a3c40"), seat: rgb("#2f3236"), roofIn: rgb("#b8b6b0"),
  carTire: rgb("#141516"), carWall: rgb("#232427"), wheel: rgb("#b9bec3"), wheelDark: rgb("#4a4f55"), plate: rgb("#eef0ec"), plateText: rgb("#2f6b3c"),
  head: rgb("#dfe3e6"), tail: rgb("#8a1c17"), grille: rgb("#1d2023"), mirror: rgb("#2c5f8f"),
  drone: rgb("#3b3e43"), droneTop: rgb("#5b5f66"), droneDark: rgb("#1d1f22"), prop: rgb("#9ea3a8"), lensDark: rgb("#0d1420"),
  skin: rgb("#d9ad8c"), hair: rgb("#1f1a17"), shirt: rgb("#2f4867"), pants: rgb("#2b2f36"), shoe: rgb("#e6e4de"), controller: rgb("#2a2c30"),
};
const lit = (c, k = 1) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k), 0.5]; // 光を受けない（自分で光る）

// ── 自転車 ──
const B = {
  rear: [-0.56, 0, BIKE.wheelR], front: [0.56, 0, BIKE.wheelR], bb: [-0.04, 0, 0.27],
  headLo: [0.46, 0, 0.66], headHi: [0.37, 0, 0.92], seat: [-0.31, 0, 0.9],
  grips: [0.3, 0.27, 1.03], crank: 0.165,
};
const STEER_AX = unit(sub(B.headHi, B.headLo));
function wheelPart(c, R, tireR, spokes = 32) {
  const P = new Part();
  torus(P, c, [0, 1, 0], R - 0.016, 0.022, C.tire, 30, 6);
  torus(P, c, [0, 1, 0], R - 0.045, 0.01, C.rim, 30, 4);
  cyl(P, c, [0, 1, 0], 0.03, 0.11, C.hub, 10);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU;
    const side = k % 2 ? 0.035 : -0.035;
    const h = [c[0] + Math.cos(a + 0.12) * 0.03, c[1] + side, c[2] + Math.sin(a + 0.12) * 0.03];
    const r = [c[0] + Math.cos(a) * (R - 0.05), c[1] + side * 0.15, c[2] + Math.sin(a) * (R - 0.05)];
    tube(P, h, r, 0.0028, C.spoke, 3);
  }
  void tireR;
  return P.freeze();
}
let BIKE_PARTS = null;
function bikeParts() {
  if (BIKE_PARTS) return BIKE_PARTS;
  const R = BIKE.wheelR;
  const frame = new Part();
  const f = C.frame;
  tube(frame, B.headLo, B.headHi, 0.024, f, 8, true);
  // 低いまたぎの U 字の下パイプと、もう 1 本（ママチャリのダブルの下パイプ）
  tubes(frame, [[0.44, 0, 0.74], [0.36, 0, 0.6], [0.24, 0, 0.44], [0.1, 0, 0.33], B.bb], 0.024, f, 8);
  tubes(frame, [[0.42, 0, 0.84], [0.3, 0, 0.66], [0.12, 0, 0.5], [-0.08, 0, 0.42], [-0.2, 0, 0.58]], 0.014, f, 6);
  tube(frame, B.bb, [-0.27, 0, 0.8], 0.019, f, 8);
  tube(frame, [-0.27, 0, 0.8], [-0.3, 0, 0.885], 0.013, C.chrome, 6);
  for (const s of [1, -1]) {
    tube(frame, [B.bb[0], s * 0.03, B.bb[2]], [B.rear[0], s * 0.065, B.rear[2]], 0.011, f, 6);
    tube(frame, [-0.25, s * 0.03, 0.76], [B.rear[0], s * 0.065, B.rear[2]], 0.01, f, 6);
    // 荷台
    tube(frame, [-0.3, s * 0.075, 0.8], [-0.9, s * 0.075, 0.8], 0.006, C.chrome, 4);
    tube(frame, [-0.86, s * 0.075, 0.8], [B.rear[0] - 0.01, s * 0.075, B.rear[2] + 0.02], 0.007, C.chrome, 4);
    tube(frame, [-0.62, s * 0.075, 0.8], [B.rear[0], s * 0.07, B.rear[2] + 0.05], 0.006, C.chrome, 4);
  }
  for (const x of [-0.42, -0.6, -0.78, -0.9]) tube(frame, [x, 0.075, 0.8], [x, -0.075, 0.8], 0.005, C.chrome, 4);
  // サドル（ばねつきの幅の広い座面）
  ellipsoid(frame, [B.seat[0] - 0.01, 0, B.seat[2] + 0.025], [0.14, 0.11, 0.04], C.saddle, 10, 5);
  for (const s of [1, -1]) tube(frame, [-0.36, s * 0.05, 0.895], [-0.36, s * 0.05, 0.86], 0.012, C.chrome, 5);
  // 後ろのどろよけ・反射板・チェーンケース（右）
  arcStrip(frame, B.rear, R + 0.03, 0.07, 40, 205, C.chrome, 16);
  box(frame, [-0.905, 0, 0.6], [0.012, 0.05, 0.07], C.reflector);
  const guard = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + (k / 10) * Math.PI; guard.push([B.rear[0] + Math.cos(a) * 0.075, B.rear[2] + Math.sin(a) * 0.075]); }
  for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + (k / 12) * Math.PI; guard.push([B.bb[0] + Math.cos(a) * 0.12, B.bb[2] + Math.sin(a) * 0.12]); }
  const gflat = [];
  guard.forEach((p) => gflat.push(p[0], p[1]));
  const gi = earcut(gflat);
  for (const y of [-0.09, -0.075]) for (let i = 0; i < gi.length; i += 3) {
    const q = [gi[i], gi[i + 1], gi[i + 2]].map((k) => [guard[k][0], y, guard[k][1]]);
    frame.tri(q[0], q[1], q[2], C.guard, [0, y < -0.08 ? -1 : 1, 0]);
  }
  for (let i = 0; i < guard.length; i++) {
    const a = guard[i], b2 = guard[(i + 1) % guard.length];
    frame.quad([a[0], -0.09, a[1]], [b2[0], -0.09, b2[1]], [b2[0], -0.075, b2[1]], [a[0], -0.075, a[1]], C.guard, [-0.3, -0.0825, 0.3]);
  }
  // 両立スタンド（止めているときだけ）
  const stand = new Part();
  for (const s of [1, -1]) tube(stand, [B.rear[0], s * 0.07, B.rear[2] - 0.02], [B.rear[0] - 0.1, s * 0.15, 0.012], 0.009, C.stand, 5);
  tube(stand, [B.rear[0] - 0.1, 0.15, 0.012], [B.rear[0] - 0.1, -0.15, 0.012], 0.009, C.stand, 5);
  // ハンドルまわり（ハンドルの軸で回る）：前のフォーク・ハンドル・グリップ・ベル・前かご・ライト・前のどろよけ
  const fr = new Part();
  for (const s of [1, -1]) tubes(fr, [[B.headLo[0] + 0.01, s * 0.045, B.headLo[2] - 0.02], [0.53, s * 0.05, 0.5], [B.front[0], s * 0.055, B.front[2]]], 0.012, C.chrome, 6);
  tube(fr, B.headHi, [0.38, 0, 1.02], 0.014, C.chrome, 6);
  for (const s of [1, -1]) {
    tubes(fr, [[0.38, 0, 1.02], [0.39, s * 0.12, 1.035], [0.35, s * 0.22, 1.04], [B.grips[0] + 0.03, s * B.grips[1], B.grips[2]]], 0.011, C.chrome, 6);
    tube(fr, [B.grips[0] + 0.05, s * (B.grips[1] - 0.03), B.grips[2]], [B.grips[0] - 0.05, s * (B.grips[1] + 0.03), B.grips[2] - 0.01], 0.017, C.grip, 8, true);
    // ブレーキのレバー
    tube(fr, [B.grips[0] + 0.07, s * (B.grips[1] - 0.04), B.grips[2] + 0.005], [B.grips[0] + 0.02, s * (B.grips[1] + 0.06), B.grips[2] - 0.03], 0.005, C.chrome, 4);
  }
  cyl(fr, [0.37, 0.17, 1.065], [0, 0, 1], 0.022, 0.018, C.chrome, 10);
  // 前かご（針金の網）：まわりの枠と、網の面（screen）
  const K = { x0: 0.57, x1: 0.92, y: 0.17, z0: 0.74, z1: 1.0 };
  const kc = [[K.x0, -K.y], [K.x1, -K.y], [K.x1, K.y], [K.x0, K.y]];
  for (const z of [K.z0, K.z1, (K.z0 + K.z1) / 2]) for (let i = 0; i < 4; i++) tube(fr, [kc[i][0], kc[i][1], z], [kc[(i + 1) % 4][0], kc[(i + 1) % 4][1], z], z === K.z1 ? 0.006 : 0.0035, C.basket, 4);
  for (const [x, y] of kc) tube(fr, [x, y, K.z0], [x, y, K.z1], 0.004, C.basket, 4);
  for (let k = 1; k < 5; k++) {
    const x = K.x0 + ((K.x1 - K.x0) * k) / 5;
    for (const s of [1, -1]) tube(fr, [x, s * K.y, K.z0], [x, s * K.y, K.z1], 0.0022, C.basket, 3);
    tube(fr, [x, -K.y, K.z0], [x, K.y, K.z0], 0.0022, C.basket, 3);
  }
  for (let k = 1; k < 4; k++) {
    const y = -K.y + (2 * K.y * k) / 4;
    for (const x of [K.x0, K.x1]) tube(fr, [x, y, K.z0], [x, y, K.z1], 0.0022, C.basket, 3);
  }
  for (const s of [1, -1]) tube(fr, [K.x0 + 0.06, s * 0.08, K.z0], [B.front[0] + 0.02, s * 0.055, B.front[2] + 0.02], 0.006, C.chrome, 4);
  tube(fr, [K.x0, 0, K.z1 - 0.02], [0.4, 0, 1.0], 0.007, C.chrome, 4);
  const net = new Part();
  const nc = (x, y, z) => [x, y, z];
  net.quad2(nc(K.x0, -K.y, K.z0), nc(K.x1, -K.y, K.z0), nc(K.x1, -K.y, K.z1), nc(K.x0, -K.y, K.z1), C.basket, [0, -1, 0]);
  net.quad2(nc(K.x1, K.y, K.z0), nc(K.x0, K.y, K.z0), nc(K.x0, K.y, K.z1), nc(K.x1, K.y, K.z1), C.basket, [0, 1, 0]);
  net.quad2(nc(K.x1, -K.y, K.z0), nc(K.x1, K.y, K.z0), nc(K.x1, K.y, K.z1), nc(K.x1, -K.y, K.z1), C.basket, [1, 0, 0]);
  net.quad2(nc(K.x0, K.y, K.z0), nc(K.x0, -K.y, K.z0), nc(K.x0, -K.y, K.z1), nc(K.x0, K.y, K.z1), C.basket, [-1, 0, 0]);
  net.quad2(nc(K.x0, -K.y, K.z0), nc(K.x0, K.y, K.z0), nc(K.x1, K.y, K.z0), nc(K.x1, -K.y, K.z0), C.basket, [0, 0, -1]);
  // ライト（前かごの下）と、前のどろよけ
  cyl(fr, [0.66, 0, 0.66], [1, 0, 0], 0.032, 0.07, C.lampBody, 12, true, C.lampBody);
  arcStrip(fr, B.front, R + 0.03, 0.07, -15, 140, C.chrome, 14);
  BIKE_PARTS = { frame: frame.freeze(), stand: stand.freeze(), front: fr.freeze(), net: net.freeze(), rearWheel: wheelPart(B.rear, R), frontWheel: wheelPart(B.front, R) };
  return BIKE_PARTS;
}

// ── 車（右ハンドルの 5 ドアのハッチバック）──
const CW = CAR.wheelbase / 2;
const ARCH = 0.37;
function carProfile() {
  const pts = [];
  const kinds = [];
  const push = (x, z, k) => {
    pts.push([x, z]);
    kinds.push(k);
  };
  push(-1.9, 0.3, "under");
  push(-1.72, 0.235, "under");
  const arch = (xc) => {
    push(xc - ARCH - 0.02, 0.235, "arch");
    for (let i = 0; i <= 10; i++) {
      const a = (192 - (i / 10) * 204) * DEG;
      push(xc + Math.cos(a) * ARCH, CAR.wheelR + Math.sin(a) * ARCH, i === 10 ? "under" : "arch");
    }
  };
  arch(-CW);
  push(-CW + ARCH + 0.02, 0.235, "under");
  push(CW - ARCH - 0.04, 0.235, "under");
  arch(CW);
  push(1.72, 0.245, "under");
  push(1.92, 0.33, "front");
  push(1.975, 0.43, "front");
  push(1.975, 0.62, "front");
  push(1.95, 0.72, "front");
  push(1.86, 0.8, "hood");
  push(1.5, 0.87, "hood");
  push(1.1, 0.915, "hood");
  push(0.82, 0.94, "open"); // ここから後ろはドアの上（車内は開けて、ドアの上のふちと車内を別に描く）
  push(-1.84, 0.97, "rear");
  push(-1.93, 0.95, "rear");
  push(-1.975, 0.8, "rear");
  push(-1.975, 0.45, "rear");
  push(-1.945, 0.33, "under");
  return { pts, kinds };
}
const bodyHalf = (x, z) => {
  const ax = Math.abs(x);
  const t = ax > 1.45 ? 1 - 0.15 * ((ax - 1.45) / 0.525) ** 2 : 1;
  return CAR.width / 2 * t - (z > 0.82 ? (z - 0.82) * 0.3 : 0) - (z < 0.3 ? (0.3 - z) * 0.4 : 0);
};
const CABIN = [[-1.84, 0.97], [0.82, 0.94], [-0.02, 1.47], [-0.22, 1.5], [-1.3, 1.5], [-1.46, 1.465], [-1.86, 1.04]];
const cabinHalf = (x, z) => {
  const t = clamp01((z - 0.94) / 0.56);
  const front = x > 0.3 ? 1 - ((x - 0.3) / 0.52) * 0.05 : 1;
  return (0.8 - 0.19 * t) * front;
};
function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
// 横の窓の面の上での、窓の縁に沿った帯（柱）の 4 点：a→b の線から内へ w（x・z の面で、線の左＝窓の中の側）
const pillarStrip = (a, b, w) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz) || 1;
  const n = [-dz / L, dx / L];
  return [a, b, [b[0] + n[0] * w, b[1] + n[1] * w], [a[0] + n[0] * w, a[1] + n[1] * w]];
};
let CAR_PARTS = null;
function carParts() {
  if (CAR_PARTS) return CAR_PARTS;
  const body = new Part();
  const { pts, kinds } = carProfile();
  extrude(body, pts, bodyHalf, C.car, (i) => (kinds[i] === "under" ? C.carDark : kinds[i] === "arch" ? C.carDark : kinds[i] === "open" ? null : C.car));
  // ドアの上のふち（車内の両わき）と、車内（床・ドアの内張り・後ろの座席の背・荷室）
  for (const s of [1, -1]) {
    const q = (x, z, d) => [x, s * (bodyHalf(x, z) - d), z];
    body.quad(q(0.82, 0.94, 0), q(-1.84, 0.97, 0), q(-1.84, 0.97, 0.07), q(0.82, 0.94, 0.07), C.car, null, [0, 0, 1]);
    body.quad(q(0.82, 0.94, 0.07), q(-1.84, 0.97, 0.07), q(-1.84, 0.4, 0.07), q(0.82, 0.4, 0.07), C.interior, null, [0, -s, 0]);
  }
  body.quad([0.82, 0.78, 0.4], [-1.84, 0.78, 0.4], [-1.84, -0.78, 0.4], [0.82, -0.78, 0.4], C.interior, null, [0, 0, 1]);
  body.quad([-1.84, 0.78, 0.4], [-1.84, 0.78, 0.97], [-1.84, -0.78, 0.97], [-1.84, -0.78, 0.4], C.interior, null, [1, 0, 0]);
  // 前の面：ライト・グリル・下の口・ナンバー。後ろの面：テールランプ・ナンバー・バンパーの黒
  const fx = 1.976;
  const fpatch = (y0, y1, z0, z1, col, x = fx + 0.004) => body.quad([x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1], col, null, [1, 0, 0]);
  fpatch(-0.36, 0.36, 0.5, 0.66, C.grille);
  fpatch(-0.55, 0.55, 0.3, 0.42, C.grille);
  fpatch(-0.165, 0.165, 0.43, 0.5, C.plate, fx + 0.008);
  fpatch(-0.15, -0.06, 0.455, 0.475, C.plateText, fx + 0.011);
  fpatch(0.0, 0.14, 0.455, 0.475, C.plateText, fx + 0.011);
  const rx = -1.976;
  const rpatch = (y0, y1, z0, z1, col, x = rx - 0.004) => body.quad([x, y1, z0], [x, y0, z0], [x, y0, z1], [x, y1, z1], col, null, [-1, 0, 0]);
  rpatch(-0.165, 0.165, 0.6, 0.7, C.plate, rx - 0.008);
  rpatch(-0.15, -0.06, 0.625, 0.645, C.plateText, rx - 0.011);
  rpatch(0.0, 0.14, 0.625, 0.645, C.plateText, rx - 0.011);
  rpatch(-0.72, 0.72, 0.32, 0.43, C.trim);
  // 横：ドアのすき間・取っ手・サイドの黒い帯（すそ）
  for (const s of [1, -1]) {
    for (const x of [0.66, -0.5, -1.38]) sidePatch(body, [[x - 0.006, 0.3], [x + 0.006, 0.3], [x + 0.006, 0.94], [x - 0.006, 0.94]], bodyHalf, s, C.trim, 0.003);
    for (const x of [0.02, -1.0]) sidePatch(body, [[x - 0.07, 0.8], [x + 0.07, 0.8], [x + 0.07, 0.83], [x - 0.07, 0.83]], bodyHalf, s, C.trim, 0.006);
    sidePatch(body, [[-1.6, 0.27], [1.6, 0.27], [1.6, 0.31], [-1.6, 0.31]], bodyHalf, s, C.trim, 0.003);
  }
  // 窓：横の窓（面）・前の窓・後ろの窓はガラス。屋根・柱は車体の色
  const glass = new Part();
  for (const s of [1, -1]) {
    const flat = [];
    CABIN.forEach((p) => flat.push(p[0], p[1]));
    const idx = earcut(flat);
    for (let i = 0; i < idx.length; i += 3) {
      const q = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [CABIN[k][0], s * cabinHalf(CABIN[k][0], CABIN[k][1]), CABIN[k][1]]);
      glass.tri(q[0], q[1], q[2], C.glass, unit([0, s, 0.25]));
    }
  }
  const edgeQuad = (P, a, b, col) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    const A = (p, s) => [p[0], s * cabinHalf(p[0], p[1]), p[1]];
    P.quad(A(a, -1), A(b, -1), A(b, 1), A(a, 1), col, null, [dz / L, 0, -dx / L]);
  };
  edgeQuad(glass, CABIN[1], CABIN[2], C.glass); // 前の窓
  edgeQuad(glass, CABIN[5], CABIN[6], C.glass); // 後ろの窓
  edgeQuad(glass, CABIN[6], CABIN[0], C.glass);
  edgeQuad(body, CABIN[2], CABIN[3], C.car);
  edgeQuad(body, CABIN[3], CABIN[4], C.car);
  edgeQuad(body, CABIN[4], CABIN[5], C.car);
  // 屋根の裏（車内から見上げたとき）
  for (const [a, b] of [[CABIN[2], CABIN[3]], [CABIN[3], CABIN[4]], [CABIN[4], CABIN[5]]]) {
    const A = (p, s) => [p[0], s * (cabinHalf(p[0], p[1]) - 0.03), p[1] - 0.03];
    body.quad(A(a, 1), A(b, 1), A(b, -1), A(a, -1), C.roofIn, null, [0, 0, -1]);
  }
  // 柱（前の窓のわき・まん中・後ろ）と、窓の上・下の縁
  for (const s of [1, -1]) {
    const sp = (q, col = C.car) => sidePatch(body, q, cabinHalf, s, col, 0.005);
    sp(pillarStrip(CABIN[1], CABIN[2], 0.075));
    sp([[-0.52, 0.95], [-0.42, 0.95], [-0.46, 1.48], [-0.56, 1.48]], C.trim);
    sp(pillarStrip(CABIN[5], CABIN[6], 0.3));
    sp([[CABIN[6][0], 0.975], [CABIN[6][0] + 0.12, 0.975], [CABIN[6][0] + 0.12, 1.1], [CABIN[6][0], 1.04]]);
    sp([[-1.46, 1.43], [-0.02, 1.43], [-0.22, 1.5], [-1.3, 1.5]]);
    sp([[-1.84, 0.95], [0.82, 0.93], [0.82, 0.975], [-1.84, 0.99]], C.trim);
  }
  // ドアミラー
  for (const s of [1, -1]) {
    box(body, [0.6, s * 0.93, 1.0], [0.1, 0.13, 0.09], C.mirror);
    tube(body, [0.62, s * 0.82, 0.96], [0.62, s * 0.88, 0.99], 0.012, C.trim, 5);
  }
  // 車内：ダッシュボード・座席（前 2・後ろ）
  const inside = new Part();
  box(inside, [0.66, 0, 0.81], [0.3, 1.5, 0.18], C.interior);
  box(inside, [0.58, 0, 0.905], [0.14, 1.42, 0.03], C.carDark);
  box(inside, [0.52, -0.36, 0.935], [0.13, 0.34, 0.05], C.carDark); // メーターのひさし
  for (const s of [1, -1]) {
    box(inside, [-0.3, s * 0.36, 0.52], [0.5, 0.48, 0.14], C.seat);
    obox(inside, [-0.58, s * 0.36, 0.86], unit([0.95, 0, 0.3]), [0, 1, 0], unit([-0.3, 0, 0.95]), [0.06, 0.24, 0.3], C.seat);
    box(inside, [-0.66, s * 0.36, 1.24], [0.08, 0.24, 0.16], C.seat);
  }
  box(inside, [-1.2, 0, 0.5], [0.5, 1.3, 0.14], C.seat);
  obox(inside, [-1.47, 0, 0.82], unit([0.96, 0, 0.25]), [0, 1, 0], unit([-0.25, 0, 0.96]), [0.06, 0.65, 0.28], C.seat);
  // ハンドル（運転席の前。ハンドルの切れで回す）
  const wheelC = [0.3, -0.36, 0.86];
  const WAX = unit([-0.8, 0, 0.6]);
  const sw = new Part();
  torus(sw, wheelC, WAX, 0.18, 0.016, C.carDark, 20, 5);
  const [su, sv] = basis(WAX);
  for (const a of [0, 2.3, 4.0]) tube(sw, wheelC, add(wheelC, add(mul(su, Math.cos(a) * 0.17), mul(sv, Math.sin(a) * 0.17))), 0.012, C.carDark, 4);
  cyl(sw, wheelC, WAX, 0.05, 0.05, C.carDark, 10);
  // 車輪（4 つ。前の 2 つはハンドルで向きが変わる）
  const wheels = [];
  for (const [x, s] of [[CW, 1], [CW, -1], [-CW, 1], [-CW, -1]]) {
    const P = new Part();
    const c = [x, s * (CAR.track / 2), CAR.wheelR];
    const ax = [0, 1, 0];
    cyl(P, c, ax, CAR.wheelR, 0.19, C.carTire, 22, false);
    const face = add(c, [0, s * 0.096, 0]);
    disc(P, face, ax, CAR.wheelR - 0.005, C.carWall, 22, 0.215);
    disc(P, add(face, [0, s * 0.004, 0]), ax, 0.212, C.wheel, 20);
    // 5 本のスポークのすき間（暗い穴）
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * TAU + 0.3, a1 = a0 + 0.62;
      const at = (a, r) => add(face, [Math.cos(a) * r, s * 0.007, Math.sin(a) * r]);
      for (let j = 0; j < 3; j++) {
        const t0 = a0 + ((a1 - a0) * j) / 3, t1 = a0 + ((a1 - a0) * (j + 1)) / 3;
        P.quad2(at(t0, 0.08), at(t0, 0.19), at(t1, 0.19), at(t1, 0.08), C.wheelDark, [0, s, 0]);
      }
    }
    disc(P, add(face, [0, s * 0.009, 0]), ax, 0.045, C.wheelDark, 10);
    P.freeze();
    wheels.push({ P, c, front: x > 0 });
  }
  // 窓の色：下は暗く、上は空を映して明るく（建物のガラスの glassLo → glassHi と同じ考え）
  const gl0 = C.glass, gl1 = C.glassTop;
  for (let i = 0; i < glass.c.length / 4; i++) {
    const k = Math.min(1, Math.max(0, (glass.p[i * 3 + 2] - 0.95) / 0.55));
    for (let j = 0; j < 3; j++) glass.c[i * 4 + j] = gl0[j] + (gl1[j] - gl0[j]) * k;
  }
  CAR_PARTS = { body: body.freeze(), glass: glass.freeze(), inside: inside.freeze(), wheelPart: sw.freeze(), wheelC, WAX, wheels };
  return CAR_PARTS;
}

// ── ドローン ──
const ROTORS = [[0.115, 0.14, 1], [0.115, -0.14, -1], [-0.115, 0.14, -1], [-0.115, -0.14, 1]]; // 前左・前右・後ろ左・後ろ右と回る向き
let DRONE_PARTS = null;
function droneParts() {
  if (DRONE_PARTS) return DRONE_PARTS;
  const body = new Part();
  box(body, [0, 0, 0], [0.17, 0.085, 0.05], C.drone, C.droneTop);
  box(body, [0.095, 0, -0.004], [0.04, 0.06, 0.036], C.drone, C.droneTop);
  box(body, [-0.07, 0, 0.032], [0.06, 0.06, 0.012], C.droneDark);
  for (const [x, y] of ROTORS) {
    tube(body, [Math.sign(x) * 0.05, Math.sign(y) * 0.035, 0.004], [x, y, 0.01], 0.009, C.drone, 6, true);
    cyl(body, [x, y, 0.02], [0, 0, 1], 0.017, 0.024, C.droneDark, 10);
    tube(body, [x, y, 0.005], [x, y, -DRONE.legs + 0.004], 0.004, C.droneDark, 4, true);
    box(body, [x, y, -DRONE.legs + 0.004], [0.03, 0.012, 0.006], C.droneDark);
  }
  const gimbal = new Part();
  box(gimbal, [0.118, 0, -0.03], [0.032, 0.036, 0.03], C.droneDark);
  disc(gimbal, [0.1345, 0, -0.03], [1, 0, 0], 0.0095, C.lensDark, 10);
  const blade = new Part();
  for (const s of [1, -1]) {
    const tip = [s * 0.076, 0, 0];
    blade.quad2([0, -0.006, 0.0005], [tip[0], -0.009 * s, 0.0025], [tip[0], 0.006 * s, 0.002], [0, 0.007, 0], C.prop, [0, 0, 1]);
  }
  const blur = new Part();
  disc(blur, [0, 0, 0], [0, 0, 1], 0.08, C.prop, 18, 0.012);
  DRONE_PARTS = { body: body.freeze(), gimbal: gimbal.freeze(), blade: blade.freeze(), blur: blur.freeze() };
  return DRONE_PARTS;
}

// ── 書き出し（毎フレーム。大きな Float32Array に直接書く）──
class Out {
  constructor() {
    this.n = 0;
    this.cap = 0;
    this.grow(8192);
  }

  grow(need) {
    const cap = Math.max(need, this.cap * 2);
    const pos = new Float32Array(cap * 3), nrm = new Float32Array(cap * 3), col = new Float32Array(cap * 4);
    if (this.pos) {
      pos.set(this.pos);
      nrm.set(this.nrm);
      col.set(this.col);
    }
    Object.assign(this, { cap, pos, nrm, col });
  }

  result() {
    return { pos: this.pos.subarray(0, this.n * 3), nrm: this.nrm.subarray(0, this.n * 3), col: this.col.subarray(0, this.n * 4), count: this.n };
  }
}
const POOL = { solid: new Out(), glass: new Out(), screen: new Out() };

// 乗り物の置き方：平面の位置 (x, y)・標高 z・向き yaw・前後の傾き pitch（前が上がると +）・左右の傾き roll（右へ倒れると +）→ ローカル → ENU（東・北・上の m）
function poseOf(x, y, z, yaw, pitch = 0, roll = 0) {
  const b = yaw * DEG;
  const f = [Math.sin(b), Math.cos(b), 0], l = [-Math.cos(b), Math.sin(b), 0];
  const Ry = [f[0], l[0], 0, f[1], l[1], 0, 0, 0, 1];
  const p = pitch * DEG, r = roll * DEG;
  const Rp = [Math.cos(p), 0, -Math.sin(p), 0, 1, 0, Math.sin(p), 0, Math.cos(p)];
  // roll + で右が下がる（左 y が上がる）。前は符号が逆で、ドローンが左へ動くと右へ、自転車が曲がると外へ傾いていた（2026-11-18）
  const Rr = [1, 0, 0, 0, Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r)];
  const W0 = worldOf([x, y]);
  const We = worldOf([x + 1, y]), Wn = worldOf([x, y + 1]);
  return { R: mm(Ry, mm(Rp, Rr)), x, y, z, W0, e: [We[0] - W0[0], We[1] - W0[1]], n: [Wn[0] - W0[0], Wn[1] - W0[1]] };
}
// 部品 P を、部品の変換 A（ローカルの中）と置き方 pose で書く。col があれば色を差しかえる
function emit(out, P, A, pose, col = null) {
  const R = mm(pose.R, A.R);
  const t = mv(pose.R, A.t);
  const need = out.n + P.count;
  if (need > out.cap) out.grow(need);
  const { pos, nrm } = out;
  const cOut = out.col;
  const { W0, e, n: nv, z } = pose;
  const Pp = P.P, Pn = P.N, Pc = P.C;
  for (let i = 0; i < P.count; i++) {
    const px = Pp[i * 3], py = Pp[i * 3 + 1], pz = Pp[i * 3 + 2];
    const E = R[0] * px + R[1] * py + R[2] * pz + t[0];
    const N = R[3] * px + R[4] * py + R[5] * pz + t[1];
    const U = R[6] * px + R[7] * py + R[8] * pz + t[2];
    const k = out.n + i;
    pos[k * 3] = W0[0] + e[0] * E + nv[0] * N;
    pos[k * 3 + 1] = W0[1] + e[1] * E + nv[1] * N;
    pos[k * 3 + 2] = z + U;
    const nx = Pn[i * 3], ny = Pn[i * 3 + 1], nz = Pn[i * 3 + 2];
    nrm[k * 3] = R[0] * nx + R[1] * ny + R[2] * nz;
    nrm[k * 3 + 1] = -(R[3] * nx + R[4] * ny + R[5] * nz); // 描く側は y が南向き
    nrm[k * 3 + 2] = R[6] * nx + R[7] * ny + R[8] * nz;
    if (col) {
      cOut[k * 4] = col[0];
      cOut[k * 4 + 1] = col[1];
      cOut[k * 4 + 2] = col[2];
      cOut[k * 4 + 3] = col[3] ?? 1;
    } else {
      cOut[k * 4] = Pc[i * 4];
      cOut[k * 4 + 1] = Pc[i * 4 + 1];
      cOut[k * 4 + 2] = Pc[i * 4 + 2];
      cOut[k * 4 + 3] = Pc[i * 4 + 3];
    }
  }
  out.n = need;
}
// ローカルの点 → 描く座標（光のにじみの位置）
const worldPt = (pose, A, p) => {
  const q = add(mv(pose.R, add(mv(A.R, p), A.t)), [0, 0, 0]);
  return [pose.W0[0] + pose.e[0] * q[0] + pose.n[0] * q[1], pose.W0[1] + pose.e[1] * q[0] + pose.n[1] * q[1], pose.z + q[2]];
};

// ── 人（乗る人・操縦する人）。毎フレーム形を作る（手足の向きが変わる）──
// 2 本の骨の関節（根 a・先 c・長さ l1, l2・曲がる向き pole）
function ik(a, c, l1, l2, pole) {
  const d = sub(c, a);
  let L = Math.hypot(...d);
  const u = unit(d);
  L = Math.min(L, l1 + l2 - 1e-4);
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = unit(sub(pole, mul(u, dot(pole, u))));
  return add(add(a, mul(u, x)), mul(p, h));
}
function personParts(P, j, { head = true, torso = true } = {}) {
  // j：pelvis, neck, head, shoulders [L, R], elbows, hands, hips, knees, ankles, toes
  if (torso) {
    limb(P, j.pelvis, j.neck, 0.2, 0.34, C.shirt, [0, 1, 0]);
    limb(P, add(j.pelvis, [0, 0, -0.04]), add(j.pelvis, [0, 0, 0.08]), 0.21, 0.32, C.pants, [0, 1, 0]);
  }
  if (head) {
    limb(P, j.neck, add(j.neck, [0, 0, 0.07]), 0.08, 0.08, C.skin, [0, 1, 0]);
    ellipsoid(P, j.head, [0.095, 0.085, 0.11], C.skin, 10, 6);
    ellipsoid(P, add(j.head, [-0.012, 0, 0.03]), [0.1, 0.09, 0.09], C.hair, 10, 5);
  }
  for (let s = 0; s < 2; s++) {
    limb(P, j.shoulders[s], j.elbows[s], 0.09, 0.09, C.shirt);
    limb(P, j.elbows[s], j.hands[s], 0.075, 0.075, C.shirt);
    ellipsoid(P, j.hands[s], [0.045, 0.035, 0.04], C.skin, 6, 4);
    limb(P, j.hips[s], j.knees[s], 0.13, 0.13, C.pants);
    limb(P, j.knees[s], j.ankles[s], 0.1, 0.1, C.pants);
    limb(P, add(j.ankles[s], [0, 0, -0.03]), add(j.toes[s], [0, 0, -0.03]), 0.09, 0.07, C.shoe, [0, 0, 1]);
  }
}
// 自転車に乗る人（ローカル：自転車の座標）。ペダルの角度 crank で足が回る
function riderJoints(crank, steer) {
  const pelvis = [-0.3, 0, 0.99];
  const neck = [-0.2, 0, 1.42];
  const head = [-0.16, 0, 1.56];
  const sr = rotAxis(STEER_AX, steer * DEG);
  const grip = (s) => add(mv(sr, sub([B.grips[0], s * B.grips[1], B.grips[2] + 0.01], B.headLo)), B.headLo);
  const shoulders = [[-0.18, 0.19, 1.37], [-0.18, -0.19, 1.37]];
  const hands = [grip(1), grip(-1)];
  const elbows = [0, 1].map((s) => ik(shoulders[s], hands[s], 0.31, 0.3, [0.2, s ? -1 : 1, -0.6]));
  const hips = [[-0.3, 0.1, 0.98], [-0.3, -0.1, 0.98]];
  const pedal = (a, s) => [B.bb[0] + Math.cos(a) * B.crank, s * 0.11, B.bb[2] + Math.sin(a) * B.crank];
  const ankles = [pedal(crank + Math.PI, 1), pedal(crank, -1)].map((p) => add(p, [-0.03, 0, 0.07]));
  const knees = [0, 1].map((s) => ik(hips[s], ankles[s], 0.44, 0.44, [1, 0, 0.4]));
  const toes = ankles.map((a) => add(a, [0.13, 0, -0.04]));
  return { pelvis, neck, head, shoulders, elbows, hands, hips, knees, ankles, toes };
}
// 立っている人（ローカル：足もとが原点・前 x）。手は胸の前でコントローラーを持つ
function standJoints() {
  const hips = [[0, 0.1, 0.92], [0, -0.1, 0.92]];
  const knees = [[0.02, 0.1, 0.5], [0.02, -0.1, 0.5]];
  const ankles = [[0, 0.11, 0.08], [0, -0.11, 0.08]];
  const toes = [[0.15, 0.12, 0.05], [0.15, -0.12, 0.05]];
  const shoulders = [[0, 0.19, 1.42], [0, -0.19, 1.42]];
  const hands = [[0.3, 0.09, 1.12], [0.3, -0.09, 1.12]];
  const elbows = [0, 1].map((s) => ik(shoulders[s], hands[s], 0.29, 0.28, [-0.3, s ? -1 : 1, -1]));
  return { pelvis: [0, 0, 0.95], neck: [0, 0, 1.45], head: [0.01, 0, 1.6], shoulders, elbows, hands, hips, knees, ankles, toes };
}
// 運転する人（ローカル：車の座標）
function driverJoints(steer) {
  const s0 = -0.36;
  const pelvis = [-0.42, s0, 0.62];
  const neck = [-0.47, s0, 1.12];
  const head = [-0.43, s0, 1.25];
  const shoulders = [[-0.46, s0 + 0.19, 1.07], [-0.46, s0 - 0.19, 1.07]];
  const R = rotAxis([-0.8, 0, 0.6], steer * 3 * DEG);
  const hands = [[0, 0.17], [0, -0.17]].map(([, y]) => add(mv(R, [0.02, y, 0.07]), [0.28, s0, 0.85]));
  const elbows = [0, 1].map((s) => ik(shoulders[s], hands[s], 0.29, 0.28, [0, s ? -1 : 1, -1]));
  const hips = [[-0.42, s0 + 0.1, 0.6], [-0.42, s0 - 0.1, 0.6]];
  const knees = [[0.0, s0 + 0.11, 0.66], [0.0, s0 - 0.11, 0.66]];
  const ankles = [[0.3, s0 + 0.12, 0.38], [0.3, s0 - 0.12, 0.38]];
  const toes = ankles.map((a) => add(a, [0.13, 0, -0.03]));
  return { pelvis, neck, head, shoulders, elbows, hands, hips, knees, ankles, toes };
}

/**
 * 乗り物の形の毎フレームの書き出し。list は [{ kind, s（乗り物の状態）, rider: null | "fp" | "tp"（乗っている人を描くか。fp は頭と胴を描かない）,
 * view（"fp" ならその乗り物の中から見ている：車の窓のガラス・屋根の外を描かない） }]、pilot は { x, y, z, yaw } か null（ドローンを操縦する人）。
 * glow は夜の明るさ（0〜1）、now は ms（ドローンの点滅）、pool は書き出す先（既定は毎フレーム用。止めてある乗り物は別の入れ物）
 * @returns { solid, glass, screen（Mesh の結果と同じ形）, glow（GlowMesh の結果） }
 */
export function vehicleMeshes(list, { pilot = null, glow = 0, now = 0, pool = POOL } = {}) {
  const solid = pool.solid, glass = pool.glass, screen = pool.screen;
  solid.n = glass.n = screen.n = 0;
  const light = new GlowMesh();
  const night = Math.min(1, Math.max(0, glow));
  for (const it of list) {
    const s = it.s;
    if (!s) continue;
    if (it.kind === "bike") {
      const BP = bikeParts();
      const pose = poseOf(s.x, s.y, s.z, s.yaw, s.pitch || 0, s.lean || 0);
      const parked = !it.rider;
      const steer = parked ? (s.parkSteer ?? 14) : s.steer || 0;
      const SA = about(rotAxis(STEER_AX, steer * DEG), B.headLo);
      emit(solid, BP.frame, ID, pose);
      if (parked) emit(solid, BP.stand, ID, pose);
      emit(solid, BP.front, SA, pose);
      emit(screen, BP.net, SA, pose);
      emit(solid, BP.rearWheel, about(rotAxis([0, 1, 0], -(s.wheel || 0)), B.rear), pose);
      emit(solid, BP.frontWheel, compose(SA, about(rotAxis([0, 1, 0], -(s.wheel || 0)), B.front)), pose);
      // ペダルとクランク（毎フレーム）
      const cr = s.crank || 0;
      const P = new Part();
      for (const [a, sd] of [[cr, -1], [cr + Math.PI, 1]]) {
        const pc = [B.bb[0] + Math.cos(a) * B.crank, sd * 0.09, B.bb[2] + Math.sin(a) * B.crank];
        tube(P, [B.bb[0], sd * 0.085, B.bb[2]], pc, 0.009, C.chrome, 5);
        box(P, add(pc, [0, sd * 0.05, 0]), [0.07, 0.09, 0.022], C.pedal);
      }
      if (it.rider) personParts(P, riderJoints(cr, steer), { head: it.rider !== "fp", torso: it.rider !== "fp" });
      emit(solid, P.freeze(), ID, pose);
      // ライト：夜に走っていれば点く（ハブダイナモ）
      const lampOn = night > 0.05 && it.rider && Math.abs(s.v || 0) > 0.6;
      const lens = new Part();
      disc(lens, [0.697, 0, 0.66], [1, 0, 0], 0.026, lampOn ? lit(C.lens, 1.1) : C.lens, 12);
      emit(solid, lens.freeze(), SA, pose);
      if (lampOn) {
        light.sprite(worldPt(pose, SA, [0.72, 0, 0.66]), 0.35, [1 * night, 0.95 * night, 0.82 * night], 2.5, 0.2);
        groundBeam(light, pose, SA, [0.7, 0, 0.0], 9, 0.5, 2.2, 0.32 * night);
      }
    } else if (it.kind === "car") {
      const CP = carParts();
      const pose = poseOf(s.x, s.y, s.z, s.yaw, s.pitch || 0, -(s.roll || 0));
      const fp = it.view === "fp";
      emit(solid, CP.body, ID, pose);
      emit(solid, CP.inside, ID, pose);
      if (!fp) emit(glass, CP.glass, ID, pose);
      const steer = s.steer || 0;
      emit(solid, CP.wheelPart, about(rotAxis(CP.WAX, steer * 3 * DEG), CP.wheelC), pose); // 前輪の切れの 3 倍（見た目）
      for (const w of CP.wheels) {
        let A = about(rotAxis([0, 1, 0], -(s.wheel || 0)), w.c);
        if (w.front) A = compose(about(rotAxis([0, 0, 1], steer * DEG), w.c), A);
        emit(solid, w.P, A, pose);
      }
      if (it.rider === "tp") {
        const P = new Part();
        personParts(P, driverJoints(steer));
        emit(solid, P.freeze(), ID, pose);
      }
      // ライト：前照灯（夜）・尾灯（夜は点く、ブレーキで明るく）・後退灯
      const on = it.rider && night > 0.05;
      const brake = it.rider && s.braking;
      const L = new Part();
      const fx = 1.981, rx = -1.981;
      for (const sd of [1, -1]) {
        const y0 = sd * 0.47, y1 = sd * 0.78;
        L.quad([fx, Math.min(y0, y1), 0.66], [fx, Math.max(y0, y1), 0.66], [fx - 0.06, Math.max(y0, y1) - 0.02, 0.76], [fx - 0.06, Math.min(y0, y1), 0.76], on ? lit(C.head, 1.15) : C.head, null, unit([0.8, 0, 0.6]));
        const t0 = sd * 0.52, t1 = sd * 0.8;
        L.quad([rx, Math.max(t0, t1), 0.8], [rx, Math.min(t0, t1), 0.8], [rx, Math.min(t0, t1), 0.97], [rx, Math.max(t0, t1), 0.97], brake ? lit([1, 0.12, 0.08], 1) : on ? lit([0.8, 0.1, 0.06], 1) : C.tail, null, [-1, 0, 0]);
        if (s.reverse && it.rider) L.quad([rx - 0.002, sd * 0.62, 0.72], [rx - 0.002, sd * 0.52, 0.72], [rx - 0.002, sd * 0.52, 0.79], [rx - 0.002, sd * 0.62, 0.79], lit([1, 1, 0.96], 1), null, [-1, 0, 0]);
      }
      emit(solid, L.freeze(), ID, pose);
      if (on) {
        for (const sd of [1, -1]) light.sprite(worldPt(pose, ID, [2.02, sd * 0.63, 0.71]), 0.55, [night, 0.96 * night, 0.86 * night], 2.5, 0.3);
        groundBeam(light, pose, ID, [2.0, 0, 0], 22, 1.0, 5.5, 0.5 * night);
      }
      if (on || brake) for (const sd of [1, -1]) light.sprite(worldPt(pose, ID, [-2.02, sd * 0.66, 0.88]), brake ? 0.5 : 0.32, brake ? [0.95, 0.12, 0.06] : [0.55 * night, 0.06 * night, 0.04 * night], 2, 0.3);
      if (s.reverse && it.rider) for (const sd of [1, -1]) light.sprite(worldPt(pose, ID, [-2.02, sd * 0.57, 0.75]), 0.22, [0.6, 0.6, 0.56], 2, 0.3);
    } else if (it.kind === "drone") {
      const DP = droneParts();
      const tilt = s.tilt || [0, 0];
      const pose = poseOf(s.x, s.y, s.z, s.yaw, tilt[0], tilt[1]);
      if (it.view === "fp") continue; // ドローンのカメラから見ている：本体は写らない
      emit(solid, DP.body, ID, pose);
      emit(solid, DP.gimbal, about(rotAxis([0, 1, 0], (s.gimbal ?? 0) * DEG), [0.105, 0, -0.03]), pose); // カメラを下へ向けた角度
      const fast = (s.spin || 0) > 0.6;
      ROTORS.forEach(([x, y, dir], i) => {
        const A = compose({ R: I3, t: [x, y, 0.034] }, { R: rotAxis([0, 0, 1], dir * ((s.rotor || 0) + i * 0.7)), t: [0, 0, 0] });
        emit(solid, DP.blade, A, pose);
        if (fast) emit(screen, DP.blur, { R: I3, t: [x, y, 0.034] }, pose);
      });
      // 灯：前左は赤・前右は緑（いつも）、後ろの白は 1 秒に 1 回光る
      const blink = now % 1000 < 90;
      light.sprite(worldPt(pose, ID, [0.115, 0.14, -0.005]), 0.05, [1, 0.12, 0.08], 3.5, 0.02);
      light.sprite(worldPt(pose, ID, [0.115, -0.14, -0.005]), 0.05, [0.1, 1, 0.3], 3.5, 0.02);
      if (blink) light.sprite(worldPt(pose, ID, [-0.1, 0, 0.03]), 0.05, [0.9, 0.9, 0.9], 3, 0.02);
    }
  }
  if (pilot) {
    const pose = poseOf(pilot.x, pilot.y, pilot.z, pilot.yaw);
    const P = new Part();
    const j = standJoints();
    personParts(P, j);
    box(P, [0.33, 0, 1.12], [0.08, 0.17, 0.035], C.controller);
    emit(solid, P.freeze(), ID, pose);
  }
  return { solid: solid.result(), glass: glass.result(), screen: screen.result(), glow: light.result() };
}

// 歩いて見るあいだの毎フレームの形（乗り物のレイヤーへ）。2 つの群に分ける：
// - park：止めてある乗り物（乗っていない自転車・車）。置き場所・向き・ハンドルなどが変わったときだけ作り直して版（ver）を上げる。レイヤーは同じ版なら GPU へ送らない
// - move：動いているもの（乗っている 1 台・ドローン・操縦する人）。毎フレーム作って送る（ver: null）
// 止めてある乗り物の形は夜の明るさ・時刻によらない（灯は乗っているときだけ）
const POOL_PARK = { solid: new Out(), glass: new Out(), screen: new Out() };
const PARK = { key: null, mesh: null, ver: 0 };
const parkKeyOf = (it) => {
  const s = it.s;
  return [it.kind, s.x, s.y, s.z, s.yaw, s.pitch || 0, s.lean || 0, s.roll || 0, s.parkSteer ?? 14, s.steer || 0, s.wheel || 0, s.crank || 0].join(",");
};
export function vehicleFrameMeshes(list, { pilot = null, glow = 0, now = 0 } = {}) {
  const parked = [];
  const moving = [];
  for (const it of list) {
    if (!it?.s) continue;
    (!it.rider && !it.view && it.kind !== "drone" ? parked : moving).push(it);
  }
  const key = parked.map(parkKeyOf).join(";");
  if (key !== PARK.key) {
    PARK.key = key;
    PARK.mesh = parked.length ? vehicleMeshes(parked, { pool: POOL_PARK }) : null;
    PARK.ver++;
  }
  const groups = [];
  if (PARK.mesh) groups.push({ id: "park", ver: PARK.ver, ...PARK.mesh });
  if (moving.length || pilot) groups.push({ id: "move", ver: null, ...vehicleMeshes(moving, { pilot, glow, now }) });
  return groups.length ? { groups } : null;
}

// 地面に落ちる前照灯の光（ローカルの点 p0 から前へ len m、幅 w0 → w1）
function groundBeam(light, pose, A, p0, len, w0, w1, k) {
  let prev = null;
  for (let i = 0; i <= 8; i++) {
    const d = (len * i) / 8;
    const w = w0 + ((w1 - w0) * i) / 8;
    const a = worldPt(pose, A, [p0[0] + d, w, 0.04]);
    const b = worldPt(pose, A, [p0[0] + d, -w, 0.04]);
    const cur = { a, b, v: i / 8 };
    if (prev) light.quad([prev.a, prev.b, cur.b, cur.a], [[-1, prev.v], [1, prev.v], [1, cur.v], [-1, cur.v]], 1, [k, k * 0.96, k * 0.86]);
    prev = cur;
  }
}

// テスト用：部品の三角形の数
export function vehiclePartCounts() {
  const b = bikeParts(), c = carParts(), d = droneParts();
  return {
    bike: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.count])),
    car: { body: c.body.count, glass: c.glass.count, inside: c.inside.count, wheel: c.wheels[0].P.count },
    drone: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.count])),
  };
}
