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
const rgb = (hex, a = 1) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};

export { DEG, TAU, add, sub, mul, dot, cross, unit, lerp3, basis, rotAxis, mm, mv, I3, about, compose, ID, Part, tube, tubes, torus, disc, cyl, box, obox, limb, ellipsoid, rgb };
