// キャンパスロワイヤルの形：光の弾を撃つ SF のブラスター（本物の銃の写しにしない）・物資・パラシュート・輸送機。
// ローカルの座標（前 x・左 y・上 z、m）で Part に書く。人の手に持たせる（campus3dVehicleMesh の peopleMeshes）・地面に置く（campus3dRoyaleMesh）の両方で使う。
// 色のアルファ（campus3dLayer の FS_VEHICLE が読む）：1 ふつう（つやなし）、0.5 自分で光る、0.4 未満は半透明（その値が不透明度。screen に入れる）、
// 0.80 削り出しの金属（空が映る）、0.87 クリア塗装（つやと細い光）、0.93 ガラス。
// ブラスターとパラシュートの傘は、はじめの 1 回だけ三角形を作って持っておき、呼ばれるたびに位置をずらして足す（毎フレーム・人ごとに呼ばれるため）。
import { DEG, TAU, Part, add, sub, mul, cross, unit, basis, box, obox, limb, rgb } from "./campus3dVehicleGeometry.js";

const A_ALLOY = 0.8, A_COAT = 0.87, A_GLASS = 0.93, A_GLOW = 0.5;
const W3 = [1, 1, 1], B3 = [0, 0, 0];
const mixC = (c, d, t, a = c[3] ?? 1) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t, a];
const hexOk = (h) => /^#[0-9a-fA-F]{6}$/.test(h || "");

// ブラスターの体：濃い灰 3 段（下・胴・上）、面取りの明るい縁（hi）、はめこみの板、つやなしの握り、削り出しの金具、穴の奥、レンズ
const K = {
  dk: rgb("#1f2328", A_COAT), body: rgb("#2b3138", A_COAT), lt: rgb("#3b424b", A_COAT), hi: rgb("#58626d", A_COAT), panel: rgb("#5f6975", A_COAT),
  grip: rgb("#191c20"), gripTx: rgb("#2a2e34"), steel: rgb("#5a636e", A_ALLOY), steelDk: rgb("#383e46", A_ALLOY),
  hole: rgb("#0a0c0f"), lens: rgb("#13233a", A_GLASS),
};
// 光る色：edge その色、core 少し白へ寄せた芯、hot 白に近い点、dim 穴の奥のにぶい光
function glowOf(hex) {
  const c = rgb(hex);
  return { edge: [c[0], c[1], c[2], A_GLOW], core: mixC(c, W3, 0.22, A_GLOW), hot: mixC(c, W3, 0.6, A_GLOW), dim: [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, A_GLOW] };
}
const UP = { up: K.lt, lo: K.body, top: K.lt, ct: K.hi }; // 上の胴の色（上は明るく、下の半分は胴の色）

// 装備の見た目：光の色（HUD も使う）。名前はここでは持たない（i18n の roy.w.*）
export const BLASTER = {
  pistol: { col: "#ff8f45" },
  smg: { col: "#22c4b0" },
  ar: { col: "#4a88ff" },
  shotgun: { col: "#f0525a" },
  sniper: { col: "#9a6cff" },
};
// 光の弾の色（撃った線）
export const TRACER = { fist: "#ffffff", pistol: "#ffb877", smg: "#6eeedd", ar: "#9cc2ff", shotgun: "#ff9ca0", sniper: "#cdb5ff" };
// 物資の種類の色（足もとの輪・光の柱）
export const CAT_COL = { weapon: "#ff9f1a", ammo: "#b7c0c9", heal: "#2fbf71", helmet: "#ffd23f" };
const AMMO_COL = { light: "#f2c14e", medium: "#6aa7ff", shell: "#ff6b6b", heavy: "#b48cff" };

// ── 形の道具 ──
// 面積のない三角形は書かない
function tri(P, a, b, c, col, n) {
  const e = cross(sub(b, a), sub(c, a));
  if (e[0] * e[0] + e[1] * e[1] + e[2] * e[2] < 1e-18) return;
  P.tri(a, b, c, col, n);
}
const quad = (P, a, b, c, d, col, n) => { tri(P, a, b, c, col, n); tri(P, a, c, d, col, n); };
// 頂点ごとに法線のちがう三角形（なめらかな面）
function triV(P, a, b, c, na, nb, nc, col) {
  const e = cross(sub(b, a), sub(c, a));
  if (e[0] * e[0] + e[1] * e[1] + e[2] * e[2] < 1e-18) return;
  P.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  P.n.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  for (let i = 0; i < 3; i++) P.c.push(col[0], col[1], col[2], col[3] ?? 1);
}
// 頂点ごとに色のちがう三角形（上へうすくなる光の柱・やわらかい輪）
function triC(P, a, b, c, ca, cb, cc, n) {
  P.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < 3; i++) P.n.push(n[0], n[1], n[2]);
  P.c.push(...ca, ...cb, ...cc);
}

// 面取りした棒（断面をつなぐ）。F = { o, ex（のびる向き）, ey（左）, ez（上） }（右手系）。
// 断面 st[i] = { t（ex に沿う位置）, hw 上の半幅, hwb 下の半幅, zb 下・zt 上, cb・ct 下・上の面取り, zs 横の色の分かれ目, cols（その区間だけの色） }。
// 色 { up 横の上, lo 横の下, top 上, bot 下, ct・cb 面取り, cap 端 }（side は横の両方）。caps：1 はじめの端、2 終わりの端
const LOFT_KEYS = ["cb", "lo", "up", "ct", "top", "ct", "up", "lo", "cb", "bot"];
function section(s) {
  const hw = s.hw, hwb = s.hwb ?? hw, cb = s.cb ?? 0, ct = s.ct ?? 0, zb = s.zb, zt = s.zt;
  const z0 = zb + cb, z1 = zt - ct;
  const zs = Math.min(z1, Math.max(z0, s.zs ?? (z0 + z1) / 2));
  const hs = hwb + (hw - hwb) * (z1 > z0 ? (zs - z0) / (z1 - z0) : 0.5);
  return [[hwb - cb, zb], [hwb, z0], [hs, zs], [hw, z1], [hw - ct, zt], [-(hw - ct), zt], [-hw, z1], [-hs, zs], [-hwb, z0], [-(hwb - cb), zb]];
}
function colsOf(c) {
  const side = c.side ?? c.up ?? c.lo;
  const up = c.up ?? side, lo = c.lo ?? side, top = c.top ?? up;
  return { up, lo, top, bot: c.bot ?? lo, ct: c.ct ?? top, cb: c.cb ?? lo, cap: c.cap ?? up };
}
const at = (F, t, z = 0, y = 0) => add(F.o, add(mul(F.ex, t), add(mul(F.ey, y), mul(F.ez, z))));
function loft(P, F, st, cols, caps = 3) {
  const rows = st.map((s) => section(s).map(([y, z]) => at(F, s.t, z, y)));
  const base = colsOf(cols);
  const segCols = (i) => (st[i]?.cols ? colsOf({ ...cols, ...st[i].cols }) : base);
  for (let i = 0; i + 1 < rows.length; i++) {
    const A = rows[i], B = rows[i + 1], C = segCols(i);
    for (let j = 0; j < 10; j++) {
      const j1 = (j + 1) % 10, a = A[j], b = B[j], c = B[j1], d = A[j1];
      const n = cross(sub(d, b), sub(c, a)), L = Math.hypot(n[0], n[1], n[2]);
      if (L < 1e-12) continue;
      quad(P, a, b, c, d, C[LOFT_KEYS[j]], [n[0] / L, n[1] / L, n[2] / L]);
    }
  }
  const cap = (R, s, col) => {
    const m = R.reduce((acc, p) => add(acc, mul(p, 0.1)), [0, 0, 0]);
    for (let j = 0; j < 10; j++) tri(P, m, R[j], R[(j + 1) % 10], col, mul(F.ex, s));
  };
  if (caps & 1) cap(rows[0], -1, segCols(0).cap);
  if (caps & 2) cap(rows[rows.length - 1], 1, segCols(Math.max(0, rows.length - 2)).cap);
}
const X = { o: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
// 下へのびる棒（握り・弾倉）の向き。rake は下の端を後ろへ倒す角（度。負なら前へ）。断面の「上」は前
function down(o, rake) {
  const r = rake * DEG;
  const ex = [-Math.sin(r), 0, -Math.cos(r)], ez = [Math.cos(r), 0, -Math.sin(r)];
  return { o, ex, ey: cross(ez, ex), ez };
}

// 単純な多角形の三角形分け（耳を切る。点は数十まで）
function earcut2(pts) {
  const n = pts.length, idx = pts.map((_, i) => i), out = [];
  let A = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const s = A > 0 ? 1 : -1;
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cr(a, b, p) * s > 1e-12 && cr(b, c, p) * s > 1e-12 && cr(c, a, p) * s > 1e-12;
  for (let guard = 0; idx.length > 3 && guard < 500; guard++) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      if (cr(pts[ia], pts[ib], pts[ic]) * s <= 1e-12) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], pts[ia], pts[ib], pts[ic]))) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return { tris: out, ccw: s > 0 };
}
// 横から見た形（x, z の多角形）を y0..y1 に押し出した板。face は横の面、edge はまわりの面
function slab(P, poly, y0, y1, face, edge = face) {
  const { tris, ccw } = earcut2(poly);
  for (const [i, j, k] of tris) {
    const a = poly[i], b = poly[j], c = poly[k];
    tri(P, [a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], face, [0, 1, 0]);
    tri(P, [a[0], y0, a[1]], [c[0], y0, c[1]], [b[0], y0, b[1]], face, [0, -1, 0]);
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]);
    if (!ccw) { nx = -nx; nz = -nz; }
    const L = Math.hypot(nx, nz);
    if (L < 1e-9) continue;
    quad(P, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], edge, [nx / L, 0, nz / L]);
  }
}
// 筒（a → b、半径 r → r2。rot で角の向きを回す：8 角なら上が平ら）。caps 1 / 2 で端をふさぐ
function tubeR(P, a, b, r, col, sides = 8, caps = 0, r2 = r, capCol = col, rot = Math.PI / sides) {
  const ax = unit(sub(b, a)), [u, v] = basis(ax), L = Math.hypot(...sub(b, a));
  const d = (k) => { const t = rot + (k / sides) * TAU; return add(mul(u, Math.cos(t)), mul(v, Math.sin(t))); };
  const tilt = (r - r2) / L;
  for (let k = 0; k < sides; k++) {
    const d0 = d(k), d1 = d(k + 1);
    quad(P, add(a, mul(d0, r)), add(b, mul(d0, r2)), add(b, mul(d1, r2)), add(a, mul(d1, r)), col, unit(add(unit(add(d0, d1)), mul(ax, tilt))));
  }
  for (let k = 0; k < sides; k++) {
    if (caps & 1) tri(P, a, add(a, mul(d(k + 1), r)), add(a, mul(d(k), r)), capCol, mul(ax, -1));
    if (caps & 2) tri(P, b, add(b, mul(d(k), r2)), add(b, mul(d(k + 1), r2)), capCol, ax);
  }
}
// 片面の円板・輪（光る口・レンズ・照準の輪）
function fan(P, c, ax, R, col, seg = 8, rot = Math.PI / seg) {
  const A = unit(ax), [u, v] = basis(A);
  const p = (k) => { const t = rot + (k / seg) * TAU; return add(c, add(mul(u, Math.cos(t) * R), mul(v, Math.sin(t) * R))); };
  for (let k = 0; k < seg; k++) tri(P, c, p(k), p(k + 1), col, A);
}
function ring(P, c, ax, r0, r1, col, seg = 12, rot = 0) {
  const A = unit(ax), [u, v] = basis(A);
  const p = (k, r) => { const t = rot + (k / seg) * TAU; return add(c, add(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r))); };
  for (let k = 0; k < seg; k++) quad(P, p(k, r0), p(k, r1), p(k + 1, r1), p(k + 1, r0), col, A);
}
// 横の面（y = ±y）に貼る四角（x0..x1、z0..z1）。sides は 2（両側）か 1（左）か -1（右）。sk は上の辺を前へずらす（斜めの穴）
function side(P, x0, x1, z0, z1, y, col, sides = 2, sk = 0) {
  for (const s of sides === 2 ? [1, -1] : [sides]) {
    const Y = s * y;
    quad(P, [x0, Y, z0], [x1, Y, z0], [x1 + sk, Y, z1], [x0 + sk, Y, z1], col, [0, s, 0]);
  }
}
// 横の面に貼る 4 点の板（[x, z] × 4）
function sidePoly(P, pts, y, col, sides = 2) {
  for (const s of sides === 2 ? [1, -1] : [sides]) {
    const q = pts.map(([x, z]) => [x, s * y, z]);
    quad(P, q[0], q[1], q[2], q[3], col, [0, s, 0]);
  }
}
const topRect = (P, x0, x1, y0, y1, z, col) => quad(P, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, [0, 0, 1]);
// 棒の向き F の横の面（ey 方向 ±y）に貼る四角（t0..t1、断面の z0..z1）
function fside(P, F, t0, t1, z0, z1, y, col) {
  for (const s of [1, -1]) quad(P, at(F, t0, z0, s * y), at(F, t1, z0, s * y), at(F, t1, z1, s * y), at(F, t0, z1, s * y), col, mul(F.ey, s));
}
// 回転体（軸 ax・中心 c、断面 prof = [[軸に沿う位置, 半径], …]、位置は増える順）。cols は帯ごとの色か 1 色。smooth はまわりをなめらかに
function lathe(P, c, ax, prof, seg, cols, { rot = 0, smooth = true } = {}) {
  const A = unit(ax), [u, v] = basis(A);
  const dir = (k) => { const t = rot + (k / seg) * TAU; return add(mul(u, Math.cos(t)), mul(v, Math.sin(t))); };
  for (let i = 0; i + 1 < prof.length; i++) {
    const [h0, r0] = prof[i], [h1, r1] = prof[i + 1];
    const col = typeof cols[0] === "number" ? cols : cols[Math.min(i, cols.length - 1)];
    const dh = h1 - h0, dr = r1 - r0, L = Math.hypot(dh, dr);
    if (L < 1e-9) continue;
    const nh = -dr / L, nr = dh / L;
    for (let k = 0; k < seg; k++) {
      const d0 = dir(k), d1 = dir(k + 1);
      const p00 = add(c, add(mul(A, h0), mul(d0, r0))), p01 = add(c, add(mul(A, h0), mul(d1, r0)));
      const p10 = add(c, add(mul(A, h1), mul(d0, r1))), p11 = add(c, add(mul(A, h1), mul(d1, r1)));
      if (smooth) {
        const n0 = unit(add(mul(A, nh), mul(d0, nr))), n1 = unit(add(mul(A, nh), mul(d1, nr)));
        triV(P, p00, p10, p11, n0, n0, n1, col);
        triV(P, p00, p11, p01, n0, n1, n1, col);
      } else quad(P, p00, p10, p11, p01, col, unit(add(mul(A, nh), mul(unit(add(d0, d1)), nr))));
    }
  }
}
// 格子の面（rows[i][j]）。法線は ref（中の点か (i, j) → 点）から離れる向きにそろえ、smooth なら角ごとにならす
// （"j" なら j の向きだけならし、i の向きは面ごとに折れる）。wrap は j が一周する
function grid(P, rows, colAt, { wrap = false, smooth = true, ref = null } = {}) {
  const I = rows.length, J = rows[0].length, Jq = wrap ? J : J - 1;
  const fn = [];
  for (let i = 0; i + 1 < I; i++) {
    const row = [];
    for (let j = 0; j < Jq; j++) {
      const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][(j + 1) % J], d = rows[i][(j + 1) % J];
      let n = cross(sub(c, a), sub(d, b));
      const L = Math.hypot(n[0], n[1], n[2]);
      n = L > 1e-12 ? mul(n, 1 / L) : [0, 0, 0];
      if (ref) {
        const r = typeof ref === "function" ? ref(i, j) : ref;
        const m = mul(add(add(a, b), add(c, d)), 0.25);
        if ((m[0] - r[0]) * n[0] + (m[1] - r[1]) * n[1] + (m[2] - r[2]) * n[2] < 0) n = mul(n, -1);
      }
      row.push(n);
    }
    fn.push(row);
  }
  const vn = (i, j, row = -1) => {
    let s = [0, 0, 0];
    for (const ii of row >= 0 ? [row] : [i - 1, i]) {
      if (ii < 0 || ii >= I - 1) continue;
      for (const jj of [j - 1, j]) {
        const k = wrap ? (jj + Jq) % Jq : jj;
        if (k < 0 || k >= Jq) continue;
        s = add(s, fn[ii][k]);
      }
    }
    return unit(s);
  };
  for (let i = 0; i + 1 < I; i++) {
    for (let j = 0; j < Jq; j++) {
      const j1 = (j + 1) % J, col = colAt(i, j);
      const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j1], d = rows[i][j1];
      if (smooth) {
        const r = smooth === "j" ? i : -1;
        const na = vn(i, j, r), nb = vn(i + 1, j, r), nc = vn(i + 1, j + 1, r), nd = vn(i, j + 1, r);
        triV(P, a, b, c, na, nb, nc, col);
        triV(P, a, c, d, na, nc, nd, col);
      } else quad(P, a, b, c, d, col, fn[i][j]);
    }
  }
}

// ── ブラスターの部品 ──
// 引き金の囲い（横から見た U の形）。xr 握りの前、xf 前の柱の外、zTop 前の柱の上（胴の下）、zBar 下の棒の下
function guard(B, xr, xf, zTop, zBar) {
  const th = 0.0055, pt = 0.0065, r = 0.007;
  slab(B, [
    [xr - 0.006, zBar + th + 0.010], [xr - 0.004, zBar + 0.003], [xr + 0.004, zBar], [xf - r, zBar], [xf - 0.0015, zBar + 0.0025], [xf, zBar + r],
    [xf, zTop], [xf - pt, zTop], [xf - pt, zBar + th + r * 0.7], [xf - pt - r * 0.6, zBar + th], [xr + 0.006, zBar + th], [xr + 0.001, zBar + th + 0.005],
  ], -0.0055, 0.0055, K.dk, K.body);
}
// 引き金（少し前へ反った細い板）
function trigger(B, x, z) {
  const ez = unit([0.28, 0, 1]);
  obox(B, [x, 0, z], unit([1, 0, -0.28]), [0, 1, 0], ez, [0.0021, 0.0032, 0.0085], K.steel);
}
// 光るエネルギーセル（弾倉）。F の o が差しこみ口、len 長さ、hw 横の半幅、hd 前後の半分。横は光る芯、前後は黒い枠、角は光、下は金具
function cell(M, F, len, hw, hd, g, bands = 2) {
  const ch = Math.min(hw, hd) * 0.3;
  loft(M, F, [
    { t: -0.006, hw, zb: -hd, zt: hd, cb: ch, ct: ch },
    { t: len, hw, zb: -hd, zt: hd, cb: ch, ct: ch, cols: { side: K.steelDk, top: K.steelDk, bot: K.steelDk, ct: K.steel, cb: K.steel, cap: K.steelDk } },
    { t: len + 0.011, hw: hw + 0.0008, zb: -hd - 0.0008, zt: hd + 0.0008, cb: ch, ct: ch },
  ], { side: g.core, top: K.dk, bot: K.dk, ct: g.edge, cb: g.edge, cap: K.dk });
  for (let i = 1; i <= bands; i++) {
    const t = (len * i) / (bands + 1);
    fside(M, F, t - 0.0025, t + 0.0025, -hd + ch * 0.4, hd - ch * 0.4, hw + 0.0006, K.dk);
  }
}

/// それぞれのブラスター：B に体、M に弾倉（セル）を書き、照準などの位置を返す（握り＝右手が原点）
const BUILD = {
  pistol(B, M, g) {
    const hb = 0.058;
    loft(B, X, [ // フレーム（下）。前の下は上がる
      { t: -0.042, hw: 0.0135, zb: 0.019, zt: 0.0415, cb: 0.003 },
      { t: 0.149, hw: 0.0135, zb: 0.026, zt: 0.0415, cb: 0.003 },
    ], { side: K.dk, cb: K.body });
    loft(B, X, [ // スライド（上）。前は斜めに落とす
      { t: -0.050, hw: 0.0145, zb: 0.0405, zt: 0.0785, ct: 0.0055, cb: 0.0015, zs: 0.0535 },
      { t: 0.126, hw: 0.0145, zb: 0.0405, zt: 0.0785, ct: 0.0055, cb: 0.0015, zs: 0.0535 },
      { t: 0.163, hw: 0.0128, zb: 0.0415, zt: 0.0665, ct: 0.006, cb: 0.0015, zs: 0.0535 },
    ], UP);
    sidePoly(B, [[0.058, 0.0553], [0.123, 0.0553], [0.123, 0.0722], [0.074, 0.0722]], 0.0153, K.panel); // 前半の明るい板
    side(B, -0.032, 0.122, 0.0518, 0.0552, 0.0153, g.edge); // 光る線
    for (let i = 0; i < 4; i++) side(B, -0.046 + i * 0.0046, -0.0441 + i * 0.0046, 0.0565, 0.0715, 0.0153, K.hole); // 後ろの溝
    quad(B, [-0.0506, 0.004, 0.061], [-0.0506, -0.004, 0.061], [-0.0506, -0.004, 0.068], [-0.0506, 0.004, 0.068], g.core, [-1, 0, 0]); // 後ろの充電の灯
    tubeR(B, [0.162, 0, hb], [0.1695, 0, hb], 0.0078, K.steel, 8, 2); // 光の出口
    fan(B, [0.1699, 0, hb], [1, 0, 0], 0.0056, g.core, 8);
    for (const s of [1, -1]) box(B, [-0.040, s * 0.0062, 0.0815], [0.009, 0.0045, 0.006], K.dk); // 後ろの照準
    box(B, [0.118, 0, 0.08225], [0.006, 0.0036, 0.0075], K.dk); // 前の照準（後ろ向きに光る点）
    quad(B, [0.1148, -0.0012, 0.0824], [0.1148, 0.0012, 0.0824], [0.1148, 0.0012, 0.0846], [0.1148, -0.0012, 0.0846], g.hot, [-1, 0, 0]);
    guard(B, 0.008, 0.0745, 0.024, -0.0085);
    trigger(B, 0.034, 0.008);
    box(B, [0.120, 0, 0.0235], [0.046, 0.019, 0.006], K.steelDk); // 前の下のレール
    const F = down([-0.003, 0, 0.026], 17);
    loft(B, F, [
      { t: 0, hw: 0.0138, zb: -0.0175, zt: 0.0165, cb: 0.006, ct: 0.0045 },
      { t: 0.103, hw: 0.0146, zb: -0.0185, zt: 0.016, cb: 0.0065, ct: 0.0045 },
    ], { side: K.grip }, 2);
    fside(B, F, 0.024, 0.090, -0.0135, 0.0030, 0.0154, K.gripTx);
    fside(B, F, 0.030, 0.086, 0.0045, 0.0105, 0.0154, K.hole); // セルの窓（抜くと暗い）
    // 弾倉：握りの中のセル（ふだんは見えない）・横の窓の光・下の板
    loft(M, F, [
      { t: 0.022, hw: 0.0112, zb: -0.0150, zt: 0.0135, cb: 0.003, ct: 0.003 },
      { t: 0.101, hw: 0.0117, zb: -0.0155, zt: 0.0135, cb: 0.003, ct: 0.003 },
    ], { side: g.core, top: K.dk, bot: K.dk, ct: g.edge, cb: g.edge, cap: K.dk }, 1);
    loft(M, F, [
      { t: 0.101, hw: 0.0153, zb: -0.0196, zt: 0.0168, cb: 0.005, ct: 0.004 },
      { t: 0.110, hw: 0.0153, zb: -0.0196, zt: 0.0168, cb: 0.005, ct: 0.004 },
    ], { side: K.steelDk, cap: K.steelDk });
    fside(M, F, 0.033, 0.083, 0.0055, 0.0095, 0.0158, g.core);
    return { muzzle: [0.1702, 0, hb], sight: [-0.040, 0, 0.0835], mag: at(F, 0.103), magDir: F.ex, fore: [0.0, 0.032, -0.022] };
  },

  smg(B, M, g) {
    const hb = 0.062;
    loft(B, X, [ // 上の胴（後ろの上を落とす）
      { t: -0.090, hw: 0.0185, zb: 0.040, zt: 0.081, ct: 0.005, cb: 0.002, zs: 0.0655 },
      { t: -0.076, hw: 0.0185, zb: 0.040, zt: 0.090, ct: 0.0075, cb: 0.002, zs: 0.0655 },
      { t: 0.150, hw: 0.0185, zb: 0.040, zt: 0.090, ct: 0.0075, cb: 0.002, zs: 0.0655 },
    ], UP);
    sidePoly(B, [[0.084, 0.0677], [0.146, 0.0677], [0.146, 0.0818], [0.097, 0.0818]], 0.0193, K.panel);
    loft(B, X, [ // 下の胴
      { t: -0.080, hw: 0.017, zb: 0.010, zt: 0.0415, cb: 0.004 },
      { t: 0.142, hw: 0.017, zb: 0.006, zt: 0.0415, cb: 0.004 },
    ], { side: K.dk, cb: K.body });
    loft(B, X, [ // 弾倉の差しこみ口（下が広がる。下の縁は前が低い）
      { t: 0.060, hw: 0.018, hwb: 0.0192, zb: -0.008, zt: 0.012, cb: 0.003 },
      { t: 0.120, hw: 0.018, hwb: 0.0192, zb: -0.013, zt: 0.012, cb: 0.003 },
    ], { side: K.dk, cb: K.body });
    loft(B, X, [ // 八角の覆い
      { t: 0.150, hw: 0.0175, zb: 0.041, zt: 0.083, ct: 0.009, cb: 0.009, zs: 0.062 },
      { t: 0.236, hw: 0.0175, zb: 0.042, zt: 0.082, ct: 0.0088, cb: 0.0088, zs: 0.062 },
    ], { up: K.body, lo: K.dk, top: K.body, ct: K.hi, cb: K.body }, 2);
    for (let i = 0; i < 3; i++) {
      const x = 0.160 + i * 0.024;
      side(B, x, x + 0.016, 0.0640, 0.0718, 0.0183, K.hole, 2, 0.003);
      side(B, x + 0.003, x + 0.013, 0.0655, 0.0703, 0.0187, g.dim, 2, 0.003);
    }
    tubeR(B, [0.236, 0, hb], [0.252, 0, hb], 0.0105, K.steel, 8);
    loft(B, X, [ // 先の金具
      { t: 0.250, hw: 0.013, zb: 0.049, zt: 0.075, ct: 0.0042, cb: 0.0042 },
      { t: 0.283, hw: 0.013, zb: 0.049, zt: 0.075, ct: 0.0042, cb: 0.0042 },
    ], { side: K.steel });
    for (const x of [0.257, 0.268]) side(B, x, x + 0.007, 0.0555, 0.0685, 0.0138, K.hole);
    fan(B, [0.2836, 0, hb], [1, 0, 0], 0.0058, g.core, 8);
    const FG = down([0.200, 0, 0.0445], 7); // 縦の前の握り
    loft(B, FG, [
      { t: 0, hw: 0.0105, zb: -0.0118, zt: 0.0118, cb: 0.0038, ct: 0.0038 },
      { t: 0.064, hw: 0.011, zb: -0.0124, zt: 0.0124, cb: 0.004, ct: 0.004, cols: { side: K.steelDk, cap: K.steelDk } },
      { t: 0.076, hw: 0.0118, zb: -0.0132, zt: 0.0132, cb: 0.0042, ct: 0.0042 },
    ], { side: K.grip }, 2);
    fside(B, FG, 0.052, 0.0575, -0.0122, 0.0122, 0.0117, g.edge);
    const F = down([-0.002, 0, 0.022], 18);
    loft(B, F, [
      { t: 0, hw: 0.0142, zb: -0.018, zt: 0.0168, cb: 0.006, ct: 0.0045 },
      { t: 0.098, hw: 0.015, zb: -0.019, zt: 0.0162, cb: 0.0065, ct: 0.0045 },
    ], { side: K.grip }, 2);
    fside(B, F, 0.020, 0.086, -0.0145, 0.0115, 0.0158, K.gripTx);
    guard(B, 0.003, 0.0625, 0.012, -0.0215);
    trigger(B, 0.028, -0.002);
    loft(B, X, [ // 台尻の上の棒
      { t: -0.206, hw: 0.0085, zb: 0.064, zt: 0.081, ct: 0.003, cb: 0.002 },
      { t: -0.088, hw: 0.009, zb: 0.064, zt: 0.0795, ct: 0.003, cb: 0.002 },
    ], { side: K.body, top: K.lt, ct: K.hi }, 0);
    side(B, -0.196, -0.098, 0.0705, 0.0739, 0.0097, g.edge);
    limb(B, [-0.078, 0, 0.020], [-0.204, 0, -0.006], 0.012, 0.016, K.dk, [0, 1, 0]);
    slab(B, [[-0.219, 0.088], [-0.204, 0.088], [-0.201, 0.060], [-0.202, -0.004], [-0.207, -0.020], [-0.219, -0.020], [-0.222, 0.030]], -0.0165, 0.0165, K.grip, K.dk);
    box(B, [0.033, 0, 0.0928], [0.194, 0.019, 0.0056], K.steelDk); // レール
    for (let i = 0; i < 4; i++) topRect(B, 0.052 + i * 0.022, 0.059 + i * 0.022, -0.0096, 0.0096, 0.0962, K.hole);
    // 小さな照準器：台・斜めに落とした覆い・照準の点・後ろの光る枠
    box(B, [0.020, 0, 0.0995], [0.044, 0.025, 0.008], K.dk);
    const hood = [[0.004, 0.1033], [0.044, 0.1033], [0.044, 0.124], [0.038, 0.1315], [0.012, 0.1315], [0.004, 0.126]];
    slab(B, hood, 0.0105, 0.0132, K.lt, K.hi);
    slab(B, hood, -0.0132, -0.0105, K.lt, K.hi);
    box(B, [0.025, 0, 0.130], [0.026, 0.0264, 0.003], K.lt);
    quad(B, [0.040, 0, 0.1149], [0.040, 0.0016, 0.1165], [0.040, 0, 0.1181], [0.040, -0.0016, 0.1165], g.hot, [-1, 0, 0]);
    const fx = 0.0037;
    quad(B, [fx, 0.0092, 0.1045], [fx, 0.0105, 0.1045], [fx, 0.0105, 0.1250], [fx, 0.0092, 0.1250], g.edge, [-1, 0, 0]);
    quad(B, [fx, -0.0105, 0.1045], [fx, -0.0092, 0.1045], [fx, -0.0092, 0.1250], [fx, -0.0105, 0.1250], g.edge, [-1, 0, 0]);
    quad(B, [fx, -0.0105, 0.1036], [fx, 0.0105, 0.1036], [fx, 0.0105, 0.1047], [fx, -0.0105, 0.1047], g.edge, [-1, 0, 0]);
    side(B, 0.035, 0.072, 0.0675, 0.0815, 0.0193, K.hole, -1); // 排気口（右）
    box(B, [-0.062, 0.0215, 0.076], [0.022, 0.006, 0.008], K.steel); // 引く取っ手（左）
    side(B, -0.075, 0.140, 0.0638, 0.0672, 0.0193, g.edge);
    const MF = down([0.090, 0, -0.011], -4);
    cell(M, MF, 0.128, 0.0122, 0.0158, g);
    return { muzzle: [0.2838, 0, hb], sight: [0.004, 0, 0.1165], mag: MF.o, magDir: MF.ex, fore: at(FG, 0.032) };
  },

  ar(B, M, g) {
    const hb = 0.064;
    loft(B, X, [ // 上の胴（後ろの上を落とす）
      { t: -0.080, hw: 0.0195, zb: 0.040, zt: 0.0835, ct: 0.006, cb: 0.002, zs: 0.0665 },
      { t: -0.064, hw: 0.0195, zb: 0.040, zt: 0.093, ct: 0.008, cb: 0.002, zs: 0.0665 },
      { t: 0.152, hw: 0.0195, zb: 0.040, zt: 0.093, ct: 0.008, cb: 0.002, zs: 0.0665 },
    ], UP);
    loft(B, X, [ // 下の胴（前の下は上がる）
      { t: -0.072, hw: 0.018, zb: 0.013, zt: 0.0415, cb: 0.004 },
      { t: 0.148, hw: 0.018, zb: 0.019, zt: 0.0415, cb: 0.004 },
    ], { side: K.dk, cb: K.body });
    loft(B, X, [ // 弾倉の差しこみ口（下の縁は前が低い）
      { t: 0.083, hw: 0.0186, hwb: 0.0198, zb: -0.003, zt: 0.017, cb: 0.003 },
      { t: 0.138, hw: 0.0186, hwb: 0.0198, zb: -0.010, zt: 0.017, cb: 0.003 },
    ], { side: K.dk, cb: K.body });
    loft(B, X, [ // 長い覆い（角ばった六角。先は細くなる）
      { t: 0.152, hw: 0.0205, zb: 0.031, zt: 0.0935, ct: 0.0125, cb: 0.0105, zs: 0.0585 },
      { t: 0.400, hw: 0.0205, zb: 0.034, zt: 0.0915, ct: 0.0118, cb: 0.0098, zs: 0.059 },
      { t: 0.420, hw: 0.0172, zb: 0.042, zt: 0.0865, ct: 0.009, cb: 0.008, zs: 0.060 },
    ], { up: K.body, lo: K.dk, top: K.body, ct: K.hi, cb: K.body }, 2);
    sidePoly(B, [[0.170, 0.0600], [0.392, 0.0600], [0.384, 0.0780], [0.184, 0.0795]], 0.0212, K.panel);
    for (let i = 0; i < 4; i++) {
      const x = 0.196 + i * 0.046;
      side(B, x, x + 0.026, 0.0628, 0.0745, 0.0217, K.hole, 2, 0.005);
      side(B, x + 0.004, x + 0.022, 0.0643, 0.0730, 0.0221, g.dim, 2, 0.005);
    }
    side(B, 0.160, 0.398, 0.0562, 0.0597, 0.0212, g.edge);
    tubeR(B, [0.418, 0, hb], [0.520, 0, hb], 0.0112, K.steel, 8);
    loft(B, X, [ // 先の金具
      { t: 0.518, hw: 0.0155, zb: 0.0485, zt: 0.0795, ct: 0.005, cb: 0.005 },
      { t: 0.574, hw: 0.0155, zb: 0.0485, zt: 0.0795, ct: 0.005, cb: 0.005 },
    ], { side: K.steel });
    for (const x of [0.527, 0.545]) side(B, x, x + 0.011, 0.0555, 0.0725, 0.0163, K.hole);
    topRect(B, 0.530, 0.560, -0.004, 0.004, 0.0803, K.hole);
    fan(B, [0.5746, 0, hb], [1, 0, 0], 0.0068, g.core, 8);
    loft(B, X, [ // 台尻の上の梁（後ろへ少し上がる）
      { t: -0.284, hw: 0.015, zb: 0.050, zt: 0.0985, ct: 0.006, cb: 0.003, zs: 0.074 },
      { t: -0.080, hw: 0.0155, zb: 0.052, zt: 0.0835, ct: 0.006, cb: 0.003, zs: 0.071 },
    ], UP, 0);
    sidePoly(B, [[-0.272, 0.0722], [-0.094, 0.0693], [-0.094, 0.0727], [-0.272, 0.0757]], 0.0163, g.edge);
    limb(B, [-0.070, 0, 0.022], [-0.281, 0, -0.024], 0.013, 0.018, K.dk, [0, 1, 0]);
    const BF = down([-0.2925, 0, 0.1005], -4); // 床尾（ゴム。上が少し後ろ）
    loft(B, BF, [
      { t: 0, hw: 0.0172, zb: -0.0085, zt: 0.0085, cb: 0.004, ct: 0.004 },
      { t: 0.137, hw: 0.0172, zb: -0.0085, zt: 0.0085, cb: 0.004, ct: 0.004 },
    ], { side: K.grip, top: K.dk, ct: K.body });
    const F = down([-0.002, 0, 0.026], 20);
    loft(B, F, [
      { t: 0, hw: 0.0148, zb: -0.0185, zt: 0.017, cb: 0.006, ct: 0.0045 },
      { t: 0.104, hw: 0.0156, zb: -0.0195, zt: 0.0164, cb: 0.0065, ct: 0.0045 },
    ], { side: K.grip }, 2);
    fside(B, F, 0.022, 0.092, -0.015, 0.0115, 0.0164, K.gripTx);
    guard(B, 0.0015, 0.0845, 0.018, -0.0195);
    trigger(B, 0.030, 0.001);
    box(B, [0.043, 0, 0.0958], [0.218, 0.019, 0.0056], K.steelDk); // レール（胴の上だけ）
    for (const x of [-0.058, -0.044, -0.030, -0.016, 0.098, 0.112, 0.126, 0.140]) topRect(B, x, x + 0.007, -0.0096, 0.0096, 0.0994, K.hole);
    // ホロ照準器：台・斜めに落とした覆い・横の光る線・照準の輪と点・後ろの光る枠・光を出す窓
    box(B, [0.043, 0, 0.104], [0.086, 0.032, 0.011], K.dk);
    const wall = [[0.016, 0.1093], [0.086, 0.1093], [0.086, 0.1505], [0.078, 0.1588], [0.026, 0.1588], [0.016, 0.1485]];
    slab(B, wall, 0.015, 0.0186, K.lt, K.hi);
    slab(B, wall, -0.0186, -0.015, K.lt, K.hi);
    box(B, [0.052, 0, 0.1565], [0.052, 0.0372, 0.0046], K.lt);
    side(B, 0.024, 0.080, 0.1288, 0.1312, 0.0192, g.edge);
    ring(B, [0.080, 0, 0.132], [1, 0, 0], 0.006, 0.0072, g.hot, 12);
    fan(B, [0.080, 0, 0.132], [1, 0, 0], 0.0011, g.hot, 4);
    const fx = 0.0157;
    quad(B, [fx, 0.0136, 0.1100], [fx, 0.0150, 0.1100], [fx, 0.0150, 0.1475], [fx, 0.0136, 0.1475], g.edge, [-1, 0, 0]);
    quad(B, [fx, -0.0150, 0.1100], [fx, -0.0136, 0.1100], [fx, -0.0136, 0.1475], [fx, -0.0150, 0.1475], g.edge, [-1, 0, 0]);
    quad(B, [fx, -0.0150, 0.1096], [fx, 0.0150, 0.1096], [fx, 0.0150, 0.1110], [fx, -0.0150, 0.1110], g.edge, [-1, 0, 0]);
    topRect(B, 0.068, 0.084, -0.011, 0.011, 0.1098, g.dim);
    side(B, 0.040, 0.085, 0.070, 0.084, 0.0203, K.hole, -1); // 排気口（右）
    for (let i = 0; i < 3; i++) side(B, -0.058 + i * 0.0085, -0.0525 + i * 0.0085, 0.0745, 0.0795, 0.0203, g.core, 1); // 充電の灯（左）
    side(B, -0.064, 0.148, 0.0648, 0.0682, 0.0203, g.edge);
    const MF = down([0.110, 0, -0.007], -12);
    cell(M, MF, 0.120, 0.0135, 0.0185, g);
    return { muzzle: [0.5748, 0, hb], sight: [0.016, 0, 0.132], mag: MF.o, magDir: MF.ex, fore: [0.300, 0, 0.026] };
  },

  shotgun(B, M, g) {
    const hb = 0.073;
    loft(B, X, [ // 太い胴（後ろの上・前の下を斜めに）
      { t: -0.082, hw: 0.026, zb: 0.010, zt: 0.100, ct: 0.009, cb: 0.006, zs: 0.0585 },
      { t: -0.060, hw: 0.026, zb: 0.010, zt: 0.1055, ct: 0.0115, cb: 0.006, zs: 0.0585 },
      { t: 0.150, hw: 0.026, zb: 0.010, zt: 0.1055, ct: 0.0115, cb: 0.006, zs: 0.0585 },
      { t: 0.198, hw: 0.026, zb: 0.036, zt: 0.1055, ct: 0.0115, cb: 0.006, zs: 0.0605 },
    ], { up: K.lt, lo: K.dk, top: K.lt, ct: K.hi, cb: K.body });
    loft(B, X, [ // 太い八角の覆い
      { t: 0.198, hw: 0.0265, zb: 0.043, zt: 0.103, ct: 0.0115, cb: 0.0115, zs: 0.073 },
      { t: 0.498, hw: 0.0265, zb: 0.043, zt: 0.103, ct: 0.0115, cb: 0.0115, zs: 0.073 },
    ], { up: K.body, lo: K.dk, top: K.body, ct: K.hi, cb: K.body }, 0);
    for (let i = 0; i < 4; i++) {
      const x = 0.300 + i * 0.044;
      side(B, x, x + 0.028, 0.0760, 0.0885, 0.0273, K.hole);
      side(B, x + 0.004, x + 0.024, 0.0775, 0.0870, 0.0277, g.dim);
    }
    loft(B, X, [ // 前後に動かす握り
      { t: 0.250, hw: 0.0258, zb: -0.005, zt: 0.046, cb: 0.011, ct: 0.005 },
      { t: 0.404, hw: 0.0258, zb: -0.005, zt: 0.046, cb: 0.011, ct: 0.005 },
    ], { side: K.grip, cap: K.dk });
    for (let i = 0; i < 6; i++) side(B, 0.268 + i * 0.022, 0.273 + i * 0.022, 0.004, 0.036, 0.0266, K.hole);
    tubeR(B, [0.404, 0, 0.021], [0.478, 0, 0.021], 0.015, K.steel, 8, 2);
    box(B, [0.484, 0, 0.040], [0.012, 0.040, 0.050], K.dk);
    loft(B, X, [ // 広い口
      { t: 0.498, hw: 0.0265, zb: 0.043, zt: 0.103, ct: 0.0115, cb: 0.0115 },
      { t: 0.512, hw: 0.033, zb: 0.039, zt: 0.107, ct: 0.0125, cb: 0.0125 },
      { t: 0.546, hw: 0.036, zb: 0.040, zt: 0.106, ct: 0.0125, cb: 0.0125 },
    ], { side: K.steel, cap: K.hole }, 2);
    for (const y of [-0.0205, 0, 0.0205]) fan(B, [0.5468, y, hb], [1, 0, 0], 0.0085, g.core, 8);
    box(B, [0.348, 0, 0.105], [0.296, 0.007, 0.004], K.steelDk); // 照準の細い板
    box(B, [0.488, 0, 0.1095], [0.0045, 0.0045, 0.0045], g.hot);
    for (const s of [1, -1]) box(B, [0.126, s * 0.0062, 0.110], [0.008, 0.0042, 0.009], K.dk);
    loft(B, X, [ // 台尻（太い）
      { t: -0.282, hw: 0.0205, zb: -0.034, zt: 0.100, ct: 0.008, cb: 0.006, zs: 0.040 },
      { t: -0.150, hw: 0.021, zb: -0.004, zt: 0.100, ct: 0.0085, cb: 0.006, zs: 0.052 },
      { t: -0.082, hw: 0.0215, zb: 0.014, zt: 0.100, ct: 0.009, cb: 0.006, zs: 0.058 },
    ], { up: K.lt, lo: K.dk, top: K.lt, ct: K.hi, cb: K.body }, 0);
    sidePoly(B, [[-0.262, 0.0458], [-0.150, 0.0556], [-0.150, 0.0850], [-0.262, 0.0850]], 0.0219, K.panel);
    sidePoly(B, [[-0.270, 0.0400], [-0.150, 0.0505], [-0.150, 0.0540], [-0.270, 0.0435]], 0.0218, g.edge);
    sidePoly(B, [[-0.150, 0.0505], [-0.092, 0.0560], [-0.092, 0.0595], [-0.150, 0.0540]], 0.0223, g.edge);
    loft(B, X, [ // 床尾
      { t: -0.296, hw: 0.0218, zb: -0.040, zt: 0.104, ct: 0.007, cb: 0.007 },
      { t: -0.282, hw: 0.0218, zb: -0.040, zt: 0.104, ct: 0.007, cb: 0.007 },
    ], { side: K.grip, cap: K.grip });
    const F = down([-0.001, 0, 0.022], 21);
    loft(B, F, [
      { t: 0, hw: 0.0155, zb: -0.019, zt: 0.0175, cb: 0.0065, ct: 0.005 },
      { t: 0.100, hw: 0.0163, zb: -0.020, zt: 0.017, cb: 0.007, ct: 0.005 },
    ], { side: K.grip }, 2);
    fside(B, F, 0.020, 0.088, -0.0155, 0.012, 0.0171, K.gripTx);
    guard(B, 0.004, 0.091, 0.012, -0.0205);
    trigger(B, 0.034, -0.001);
    loft(B, X, [ // セルの差しこみ口
      { t: 0.090, hw: 0.0255, hwb: 0.0262, zb: -0.008, zt: 0.012, cb: 0.004 },
      { t: 0.150, hw: 0.0255, hwb: 0.0262, zb: -0.008, zt: 0.012, cb: 0.004 },
    ], { side: K.dk, cb: K.body });
    for (let i = 0; i < 5; i++) side(B, 0.020 + i * 0.009, 0.026 + i * 0.009, 0.044, 0.050, 0.0268, g.core, 1); // 残りの灯（左）
    side(B, 0.060, 0.125, 0.064, 0.088, 0.0268, K.hole, -1); // こめる口（右）
    side(B, 0.066, 0.119, 0.068, 0.084, 0.0272, g.dim, -1);
    side(B, -0.058, 0.190, 0.0568, 0.0602, 0.0268, g.edge);
    const MF = down([0.120, 0, -0.008], 0);
    cell(M, MF, 0.058, 0.0215, 0.0235, g, 1);
    return { muzzle: [0.547, 0, hb], sight: [0.122, 0, 0.1095], mag: MF.o, magDir: MF.ex, fore: [0.327, 0, 0.020] };
  },

  sniper(B, M, g) {
    const hb = 0.060, sz = 0.141;
    loft(B, X, [ // 胴（一体。後ろの上を落とす。上は明るく下は濃い）
      { t: -0.090, hw: 0.019, zb: 0.008, zt: 0.080, ct: 0.005, cb: 0.004, zs: 0.040 },
      { t: -0.074, hw: 0.019, zb: 0.008, zt: 0.0875, ct: 0.007, cb: 0.004, zs: 0.040 },
      { t: 0.250, hw: 0.019, zb: 0.008, zt: 0.0875, ct: 0.007, cb: 0.004, zs: 0.040 },
    ], { up: K.lt, lo: K.dk, top: K.lt, ct: K.hi, cb: K.body });
    sidePoly(B, [[0.060, 0.0445], [0.236, 0.0445], [0.236, 0.0740], [0.082, 0.0740]], 0.0197, K.panel);
    side(B, -0.084, 0.244, 0.0383, 0.0418, 0.0197, g.edge);
    loft(B, X, [ // 長い覆い
      { t: 0.250, hw: 0.0195, zb: 0.026, zt: 0.0865, ct: 0.013, cb: 0.011, zs: 0.057 },
      { t: 0.545, hw: 0.0195, zb: 0.032, zt: 0.0835, ct: 0.012, cb: 0.010, zs: 0.058 },
    ], { up: K.body, lo: K.dk, top: K.body, ct: K.hi, cb: K.body }, 2);
    for (const [x0, x1] of [[0.285, 0.385], [0.400, 0.500]]) {
      side(B, x0, x1, 0.0610, 0.0705, 0.0203, K.hole);
      side(B, x0 + 0.004, x1 - 0.004, 0.0625, 0.0690, 0.0207, g.dim);
    }
    tubeR(B, [0.545, 0, hb], [0.808, 0, hb], 0.012, K.steel, 8);
    for (const x of [0.752, 0.772]) tubeR(B, [x, 0, hb], [x + 0.008, 0, hb], 0.0136, g.edge, 6);
    loft(B, X, [ // 先の金具（横に穴）
      { t: 0.806, hw: 0.0195, zb: 0.0455, zt: 0.0745, ct: 0.003, cb: 0.003 },
      { t: 0.866, hw: 0.0195, zb: 0.0455, zt: 0.0745, ct: 0.003, cb: 0.003 },
    ], { side: K.steel }, 2);
    for (const x of [0.814, 0.831, 0.848]) side(B, x, x + 0.010, 0.0505, 0.0695, 0.0203, K.hole);
    fan(B, [0.8666, 0, hb], [1, 0, 0], 0.0068, g.core, 8);
    // スコープ：レール・2 つの輪・筒（後ろの接眼・前の太い対物）・つまみ・光る縁のレンズ
    box(B, [0.100, 0, 0.0905], [0.250, 0.019, 0.006], K.steelDk);
    for (const x of [0.022, 0.172]) {
      box(B, [x, 0, 0.1093], [0.015, 0.020, 0.0316], K.dk);
      tubeR(B, [x - 0.0065, 0, sz], [x + 0.0065, 0, sz], 0.0185, K.dk, 8);
    }
    lathe(B, [0, 0, sz], [1, 0, 0], [[-0.074, 0.0172], [-0.068, 0.021], [-0.030, 0.021], [-0.014, 0.0162], [0.200, 0.0162], [0.238, 0.0262], [0.302, 0.0262]], 8,
      [K.grip, K.dk, K.dk, K.body, K.body, K.dk], { rot: Math.PI / 8, smooth: false });
    fan(B, [0.3025, 0, sz], [1, 0, 0], 0.0215, K.lens, 8);
    ring(B, [0.3023, 0, sz], [1, 0, 0], 0.0215, 0.0262, g.edge, 8, Math.PI / 8);
    fan(B, [-0.0745, 0, sz], [-1, 0, 0], 0.015, K.lens, 6);
    box(B, [0.095, 0, sz], [0.036, 0.038, 0.030], K.dk);
    tubeR(B, [0.095, 0, sz + 0.015], [0.095, 0, sz + 0.031], 0.0095, K.steel, 6, 2);
    tubeR(B, [0.095, -0.019, sz], [0.095, -0.035, sz], 0.009, K.steel, 6, 2);
    loft(B, X, [ // 台尻の梁
      { t: -0.320, hw: 0.017, zb: 0.040, zt: 0.092, ct: 0.006, cb: 0.003, zs: 0.066 },
      { t: -0.090, hw: 0.0175, zb: 0.044, zt: 0.080, ct: 0.006, cb: 0.003, zs: 0.064 },
    ], UP, 0);
    sidePoly(B, [[-0.306, 0.0647], [-0.100, 0.0629], [-0.100, 0.0663], [-0.306, 0.0681]], 0.0183, g.edge);
    loft(B, X, [ // ほおを当てる台
      { t: -0.245, hw: 0.0125, zb: 0.084, zt: 0.1035, ct: 0.004 },
      { t: -0.135, hw: 0.0125, zb: 0.081, zt: 0.1035, ct: 0.004 },
    ], { side: K.lt, top: K.lt, ct: K.hi, cap: K.body });
    limb(B, [-0.080, 0, 0.016], [-0.300, 0, -0.030], 0.014, 0.020, K.dk, [0, 1, 0]);
    box(B, [-0.330, 0, 0.031], [0.020, 0.038, 0.140], K.grip); // 床尾
    const F = down([-0.001, 0, 0.016], 14);
    loft(B, F, [
      { t: 0, hw: 0.0148, zb: -0.0185, zt: 0.017, cb: 0.006, ct: 0.0045 },
      { t: 0.100, hw: 0.0156, zb: -0.0195, zt: 0.0165, cb: 0.0065, ct: 0.0045 },
    ], { side: K.grip }, 2);
    fside(B, F, 0.020, 0.088, -0.015, 0.0115, 0.0164, K.gripTx);
    guard(B, 0.008, 0.083, 0.010, -0.023);
    trigger(B, 0.034, -0.004);
    limb(B, [0.020, -0.018, 0.069], [0.004, -0.037, 0.064], 0.011, 0.009, K.steel); // 充てんのレバー（右）
    const MF = down([0.107, 0, 0.008], 0);
    cell(M, MF, 0.055, 0.0135, 0.0215, g, 1);
    return { muzzle: [0.8668, 0, hb], sight: [-0.0745, 0, sz], mag: MF.o, magDir: MF.ex, fore: [0.420, 0, 0.022] };
  },
};

// 種類ごとに 1 回だけ作る（体・弾倉・寸法）
const GUN = new Map();
const pack = (P) => ({ p: Float32Array.from(P.p), n: Float32Array.from(P.n), c: Float32Array.from(P.c), count: P.p.length / 3 });
function gunOf(kind) {
  let G = GUN.get(kind);
  if (G) return G;
  const B = new Part(), M = new Part();
  const d = BUILD[kind](B, M, glowOf(BLASTER[kind].col));
  const body = pack(B), mag = pack(M);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of [body.p, mag.p]) for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
  }
  const r4 = (v) => v.map((n) => Math.round(n * 10000) / 10000);
  G = { body, mag, dims: { muzzle: r4(d.muzzle), sight: r4(d.sight), mag: r4(d.mag), magDir: r4(d.magDir), fore: r4(d.fore), length: Math.round((x1 - x0) * 1000) / 1000 }, box: [x0, x1, z0, z1] };
  GUN.set(kind, G);
  return G;
}
function put(P, G, o) {
  const { p, n, c } = G;
  for (let i = 0; i < p.length; i += 3) P.p.push(p[i] + o[0], p[i + 1] + o[1], p[i + 2] + o[2]);
  for (let i = 0; i < n.length; i++) P.n.push(n[i]);
  for (let i = 0; i < c.length; i++) P.c.push(c[i]);
}

/** ブラスターを P に書く。o は握り（右手）の位置、+x が前。mag: false なら弾倉（光るセル）を書かない（リロードの動き） */
export function addBlaster(P, kind, o = [0, 0, 0], { mag = true } = {}) {
  if (!BLASTER[kind]) return;
  const G = gunOf(kind);
  put(P, G.body, o);
  if (mag) put(P, G.mag, o);
}
/** 弾倉（光るセル）だけを、差した位置に書く（o は addBlaster と同じ握りの位置） */
export function addMag(P, kind, o = [0, 0, 0]) {
  if (!BLASTER[kind]) return;
  put(P, gunOf(kind).mag, o);
}
/**
 * 寸法（握りからの位置、m）。知らない種類（"fist" など）は null。
 * @returns { muzzle 銃口の先, sight 照準の線の後ろの点（スコープは接眼の中心。ここから +x へ見ると照準の点・前の柱に重なる）,
 *            mag 弾倉の差しこみ口, magDir 弾倉を抜く向き（単位）, fore 左手を添える点, length 全長 }
 */
export function blasterDims(kind) {
  if (!BLASTER[kind]) return null;
  const d = gunOf(kind).dims;
  return { muzzle: [...d.muzzle], sight: [...d.sight], mag: [...d.mag], magDir: [...d.magDir], fore: [...d.fore], length: d.length };
}

// ── 物資 ──
// 足もとのやわらかい輪（内から外へ濃くなり、ふちは明るく、外はぼける）と、ブラスターだけ上へうすくなる光の柱
function lootGlow(T, hex, beam) {
  const c = rgb(hex), A = (a) => [c[0], c[1], c[2], a];
  const seg = 24, z = 0.025;
  const band = (r0, r1, a0, a1) => {
    for (let k = 0; k < seg; k++) {
      const t0 = (k / seg) * TAU, t1 = ((k + 1) / seg) * TAU;
      const p = (t, r) => [Math.cos(t) * r, Math.sin(t) * r, z];
      triC(T, p(t0, r0), p(t0, r1), p(t1, r1), A(a0), A(a1), A(a1), [0, 0, 1]);
      if (r0 > 0) triC(T, p(t0, r0), p(t1, r1), p(t1, r0), A(a0), A(a1), A(a0), [0, 0, 1]);
    }
  };
  band(0.0, 0.37, 0.05, 0.15);
  band(0.37, 0.42, 0.34, 0.36);
  band(0.42, 0.56, 0.2, 0.0);
  if (!beam) return;
  // 3 枚の縦の板。真ん中の線だけ濃く、横の端と上下の端は 0（下から立ちのぼって上で消える）
  const none = A(0), rows = [[0.04, none], [0.3, A(0.3)], [0.95, A(0.12)], [2.2, none]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, d = [Math.cos(a), Math.sin(a), 0], n = [-d[1], d[0], 0], w = 0.2;
    for (const s of [1, -1]) {
      const p = (h, edge) => [edge ? d[0] * w * s : 0, edge ? d[1] * w * s : 0, h];
      for (let i = 0; i + 1 < rows.length; i++) {
        const [h0, c0] = rows[i], [h1, c1] = rows[i + 1];
        triC(T, p(h0, 0), p(h0, 1), p(h1, 1), c0, none, none, n);
        triC(T, p(h0, 0), p(h1, 1), p(h1, 0), c0, none, c1, n);
      }
    }
  }
}
// 弾の箱：角を落とした黒い箱・その弾の色の帯・持ち手・種類の灯（light 1、medium 2、heavy 3 本）。shell は赤い弾の並んだ浅い箱
function ammoModel(S, kind) {
  const hex = AMMO_COL[kind] || "#cccccc", c = rgb(hex, A_COAT), g = glowOf(hex);
  if (kind === "shell") {
    loft(S, X, [
      { t: -0.135, hw: 0.092, zb: 0.03, zt: 0.085, cb: 0.008, ct: 0.004, zs: 0.07 },
      { t: 0.135, hw: 0.092, zb: 0.03, zt: 0.085, cb: 0.008, ct: 0.004, zs: 0.07 },
    ], { up: c, lo: K.dk, top: K.body });
    topRect(S, -0.124, 0.124, -0.082, 0.082, 0.0856, K.hole);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      const x = -0.096 + i * 0.048, y = -0.034 + j * 0.068, r = 0.021;
      tubeR(S, [x, y, 0.07], [x, y, 0.105], r + 0.0015, K.steel, 6, 0);
      tubeR(S, [x, y, 0.105], [x, y, 0.16], r, c, 6, 2, r * 0.92, g.core);
    }
    side(S, -0.11, 0.11, 0.045, 0.052, 0.0928, g.edge);
    return;
  }
  const D = { light: [0.25, 0.17, 0.11, 1], medium: [0.27, 0.18, 0.14, 2], heavy: [0.34, 0.19, 0.15, 3] }[kind] || [0.26, 0.17, 0.12, 1];
  const [L, Wd, H, pips] = D, z0 = 0.03, z1 = z0 + H, hw = Wd / 2;
  loft(S, X, [
    { t: -L / 2, hw, zb: z0, zt: z1, cb: 0.014, ct: 0.016, zs: z0 + H * 0.68 },
    { t: L / 2, hw, zb: z0, zt: z1, cb: 0.014, ct: 0.016, zs: z0 + H * 0.68 },
  ], { up: K.lt, lo: K.body, top: K.lt, cap: K.body });
  loft(S, X, [ // 色の帯（ふたの上から両横へ）
    { t: -0.03, hw: hw + 0.0015, zb: z0 + 0.012, zt: z1 + 0.0015, cb: 0.014, ct: 0.0165 },
    { t: 0.03, hw: hw + 0.0015, zb: z0 + 0.012, zt: z1 + 0.0015, cb: 0.014, ct: 0.0165 },
  ], { side: c, top: c, bot: c }, 0);
  side(S, -L / 2 + 0.014, -0.03, z0 + H * 0.68 - 0.0015, z0 + H * 0.68 + 0.0015, hw + 0.0008, K.hole);
  side(S, 0.03, L / 2 - 0.014, z0 + H * 0.68 - 0.0015, z0 + H * 0.68 + 0.0015, hw + 0.0008, K.hole);
  for (let i = 0; i < pips; i++) {
    const x = L / 2 - 0.035 - i * 0.016;
    side(S, x - 0.005, x + 0.005, z0 + H * 0.24, z0 + H * 0.52, hw + 0.0008, g.core);
  }
  slab(S, [[-0.07, z1 - 0.002], [-0.06, z1 - 0.002], [-0.05, z1 + 0.022], [0.05, z1 + 0.022], [0.06, z1 - 0.002], [0.07, z1 - 0.002], [0.062, z1 + 0.034], [-0.062, z1 + 0.034]], -0.011, 0.011, K.dk, K.steelDk);
  for (const s of [1, -1]) box(S, [s * (L / 2 - 0.012), 0, z0 + H * 0.68], [0.012, Wd * 0.4, 0.018], K.steel); // 留め金
}
function bottle(S) {
  // 緑茶のペットボトル（少し大きく）：お茶の色の胴・緑のラベル・白いふた
  const tea = rgb("#a9a548", A_COAT), label = rgb("#1f6d3e", A_COAT), cream = rgb("#efe9d2", A_COAT), cap = rgb("#f2f4f5", A_COAT);
  lathe(S, [0, 0, 0.02], [0, 0, 1], [[0, 0], [0, 0.036], [0.008, 0.044], [0.07, 0.044], [0.07, 0.0448], [0.185, 0.0448], [0.185, 0.044], [0.205, 0.042], [0.245, 0.024], [0.262, 0.0175], [0.268, 0.0175]], 14,
    [tea, tea, tea, tea, label, label, tea, tea, tea, tea]);
  lathe(S, [0, 0, 0.02], [0, 0, 1], [[0.268, 0.021], [0.272, 0.0215], [0.298, 0.0215], [0.302, 0.0195], [0.302, 0]], 14, cap);
  for (const s of [1, -1]) {
    const pts = [[-0.017, 0.105], [0.017, 0.105], [0.017, 0.188], [-0.017, 0.188]].map(([u, z]) => [s * 0.0452, s * u, z + 0.02]);
    quad(S, pts[0], pts[1], pts[2], pts[3], cream, [s, 0, 0]);
    quad(S, [s * 0.0454, -0.011, 0.155], [s * 0.0454, 0.011, 0.155], [s * 0.0454, 0.011, 0.175], [s * 0.0454, -0.011, 0.175], label, [s, 0, 0]);
  }
}
function can(S, kind) {
  if (kind === "coffee") {
    // 缶コーヒー（短い缶）：茶色・クリームの帯・紺の上、銀のふた
    const brown = rgb("#5a3a26", A_COAT), cream = rgb("#e8dcc4", A_COAT), navy = rgb("#1d2a44", A_COAT), tin = rgb("#b9c0c7", A_ALLOY);
    lathe(S, [0, 0, 0.02], [0, 0, 1], [[0, 0.03], [0.004, 0.036], [0.012, 0.0405], [0.06, 0.0405], [0.095, 0.0405], [0.13, 0.0405], [0.146, 0.034], [0.152, 0.034], [0.152, 0.0305], [0.149, 0.03], [0.149, 0]], 14,
      [tin, tin, brown, cream, brown, navy, tin, tin, tin, tin]);
    box(S, [0.012, 0, 0.1705], [0.022, 0.012, 0.003], K.steel);
    return;
  }
  // エナジードリンク（細長い缶）：黒・明るい黄緑の帯と稲妻、銀の上
  const black = rgb("#16191d", A_COAT), lime = rgb("#c6f02e", A_COAT), tin = rgb("#c4cad0", A_ALLOY);
  lathe(S, [0, 0, 0.02], [0, 0, 1], [[0, 0.029], [0.004, 0.034], [0.012, 0.037], [0.05, 0.037], [0.062, 0.037], [0.165, 0.037], [0.18, 0.032], [0.186, 0.032], [0.186, 0.029], [0.183, 0.0285], [0.183, 0]], 14,
    [tin, tin, black, lime, black, tin, tin, tin, tin, tin]);
  for (const s of [1, -1]) {
    const bolt = [[-0.004, 0.17], [0.012, 0.17], [0.0, 0.128], [0.012, 0.128], [-0.012, 0.075], [0.0, 0.115], [-0.012, 0.115]];
    const P3 = bolt.map(([u, z]) => [s * 0.0373, s * u, z]);
    const tris = earcut2(bolt).tris;
    for (const [i, j, k] of tris) tri(S, P3[i], P3[j], P3[k], lime, [s, 0, 0]);
  }
  box(S, [0.012, 0, 0.2045], [0.02, 0.011, 0.003], K.steel);
}
// 弁当：黒い器・赤いふち・おかず（半透明のふたは screen）・紙の帯
function bento(S, T) {
  const tray = rgb("#1d1f23", A_COAT), red = rgb("#c8322b", A_COAT), rice = rgb("#f4f2ea"), salmon = rgb("#f08a66", A_COAT), egg = rgb("#f6cf45", A_COAT);
  const green = rgb("#3f8f3a"), brown = rgb("#8a4a22", A_COAT), ume = rgb("#b5202a", A_COAT), band = rgb("#2f7d55", A_COAT), white = rgb("#f2efe6");
  const L = 0.27, Wd = 0.19, z0 = 0.02, zt = 0.072;
  loft(S, X, [
    { t: -L / 2, hw: Wd / 2, hwb: Wd / 2 - 0.006, zb: z0, zt, cb: 0.008, ct: 0.002, zs: zt - 0.008 },
    { t: L / 2, hw: Wd / 2, hwb: Wd / 2 - 0.006, zb: z0, zt, cb: 0.008, ct: 0.002, zs: zt - 0.008 },
  ], { up: red, lo: tray, top: red, cap: tray });
  topRect(S, -L / 2 + 0.008, L / 2 - 0.008, -Wd / 2 + 0.008, Wd / 2 - 0.008, zt - 0.004, tray);
  box(S, [-0.06, 0, zt - 0.006], [0.13, 0.17, 0.018], rice);
  box(S, [-0.06, 0.03, zt + 0.0035], [0.03, 0.03, 0.002], ume);
  box(S, [0.06, 0.045, zt - 0.003], [0.11, 0.07, 0.02], salmon);
  for (let i = 0; i < 2; i++) box(S, [0.035 + i * 0.05, -0.045, zt - 0.002], [0.042, 0.06, 0.024], egg);
  for (const [x, y, r, col] of [[0.09, -0.04, 0.02, green], [0.115, -0.065, 0.016, green], [0.1, 0.06, 0.02, brown]]) {
    lathe(S, [x, y, zt - 0.006], [0, 0, 1], [[0, r * 0.9], [r * 0.7, r], [r * 1.25, r * 0.55], [r * 1.4, 0]], 6, col, { smooth: false });
  }
  // ふた（半透明）
  const lid = rgb("#e6f0f7", 0.2), lt = L / 2 + 0.003, wt = Wd / 2 + 0.003, h = zt + 0.026;
  topRect(T, -lt + 0.01, lt - 0.01, -wt + 0.01, wt - 0.01, h, lid);
  for (const s of [1, -1]) {
    quad(T, [-lt, s * wt, zt - 0.004], [lt, s * wt, zt - 0.004], [lt - 0.01, s * (wt - 0.01), h], [-lt + 0.01, s * (wt - 0.01), h], lid, [0, s, 0]);
    quad(T, [s * lt, -wt, zt - 0.004], [s * lt, wt, zt - 0.004], [s * (lt - 0.01), wt - 0.01, h], [s * (lt - 0.01), -wt + 0.01, h], lid, [s, 0, 0]);
  }
  // 紙の帯（ふたの上と両横）
  const bw = 0.025;
  topRect(S, -bw, bw, -wt + 0.009, wt - 0.009, h + 0.0012, band);
  topRect(S, -bw + 0.004, bw - 0.004, -0.03, 0.03, h + 0.0022, white);
  for (const s of [1, -1]) quad(S, [-bw, s * (wt + 0.0012), z0 + 0.012], [bw, s * (wt + 0.0012), z0 + 0.012], [bw, s * (wt - 0.0085), h + 0.0012], [-bw, s * (wt - 0.0085), h + 0.0012], band, unit([0, s, 0.2]));
}
// 工事用の黄色いヘルメット：前後に通る稜線のある殻・ひさし・緑十字のしるし・中の黒い帯
function helmet(S) {
  const yel = rgb("#f6c21c", A_COAT), dark = rgb("#24272b"), green = rgb("#1f9a4d", A_COAT), whiteC = rgb("#f4f4f2", A_COAT);
  const Lh = 0.135, Wh = 0.112, Hh = 0.13, z0 = 0.085;
  const N = 10, xs = [], rows = [];
  for (let i = 0; i <= N; i++) xs.push(Math.cos(Math.PI * (1 - i / N)) * Lh);
  const prof = [[1, 0], [0.97, 0.3], [0.87, 0.6], [0.66, 0.85], [0.34, 0.97], [0.075, 1.0], [0.07, 1.06], [-0.07, 1.06], [-0.075, 1.0], [-0.34, 0.97], [-0.66, 0.85], [-0.87, 0.6], [-0.97, 0.3], [-1, 0]];
  for (const x of xs) {
    const f = Math.sqrt(Math.max(0, 1 - (x / Lh) ** 2)), w = Wh * Math.max(f, 0.02), hz = Hh * Math.max(f, 0.02);
    rows.push(prof.map(([u, v]) => [x, u * w, z0 + hz * (v > 1 ? 1 + (v - 1) * f : v)]));
  }
  grid(S, rows, () => yel, { ref: [0, 0, z0 - 0.02] });
  // ひさし：前は長く、横と後ろは短い
  const seg = 18, inner = [], outer = [];
  for (let k = 0; k <= seg; k++) {
    const t = (k / seg) * TAU, cx = Math.cos(t), sy = Math.sin(t);
    const ext = 0.012 + 0.05 * Math.max(0, cx) ** 2 + 0.008 * Math.max(0, -cx);
    inner.push([cx * Lh * 0.99, sy * Wh * 0.99, z0 + 0.002]);
    outer.push([cx * (Lh + ext), sy * (Wh + ext * 0.5), z0 - 0.004 - 0.008 * Math.max(0, cx)]);
  }
  for (let k = 0; k < seg; k++) {
    quad(S, inner[k], outer[k], outer[k + 1], inner[k + 1], yel, [0, 0, 1]);
    quad(S, inner[k], inner[k + 1], add(outer[k + 1], [0, 0, -0.006]), add(outer[k], [0, 0, -0.006]), mixC(yel, B3, 0.25), [0, 0, -1]);
    const o0 = outer[k], o1 = outer[k + 1], n = unit([o0[0] + o1[0], (o0[1] + o1[1]) * 1.2, 0]);
    quad(S, o0, o1, add(o1, [0, 0, -0.006]), add(o0, [0, 0, -0.006]), yel, n);
  }
  for (let k = 0; k < seg; k++) tri(S, [0, 0, z0 - 0.002], [Math.cos(((k + 1) / seg) * TAU) * Lh * 0.97, Math.sin(((k + 1) / seg) * TAU) * Wh * 0.97, z0 - 0.002], [Math.cos((k / seg) * TAU) * Lh * 0.97, Math.sin((k / seg) * TAU) * Wh * 0.97, z0 - 0.002], dark, [0, 0, -1]);
  // 前の緑十字（白い地）。殻の前の面（だ円体に近い）に沿って少し浮かせる
  // 殻の前の面の x（高さ z・横 y の点）：断面の弓形（prof）の高さが z になる x を二分法で探す
  const archV = (au) => { for (let i = 1; i < 6; i++) if (prof[i][0] <= au) { const [u0, v0] = prof[i - 1], [u1, v1] = prof[i]; return v0 + ((v1 - v0) * (u0 - au)) / (u0 - u1); } return 1; };
  const fx = (y, z) => {
    let lo = 0, hi = Lh;
    for (let it = 0; it < 30; it++) {
      const x = (lo + hi) / 2, f = Math.sqrt(Math.max(0, 1 - (x / Lh) ** 2)), au = Math.abs(y) / (Wh * Math.max(f, 1e-6));
      if (au < 1 && z0 + Hh * f * archV(au) > z) lo = x; else hi = x;
    }
    return lo + 0.003;
  };
  const zc = z0 + 0.05, pl = (y0, y1, za, zb, col, off) => quad(S, [fx(y0, za) + off, y0, za], [fx(y1, za) + off, y1, za], [fx(y1, zb) + off, y1, zb], [fx(y0, zb) + off, y0, zb], col, unit([1, 0, 0.45]));
  pl(-0.024, 0.024, zc - 0.022, zc + 0.022, whiteC, 0);
  pl(-0.017, 0.017, zc - 0.005, zc + 0.005, green, 0.0012);
  pl(-0.005, 0.005, zc - 0.017, zc + 0.017, green, 0.0012);
}

const LOOT = new Map();
/**
 * 地面に置く物資の形（種類ごとに 1 回だけ作る）。cat は weapon / ammo / heal / helmet
 * @returns { solid: Part, screen: Part }（どちらも freeze 済み。原点は足もとの床）
 */
export function lootModel(kind, cat) {
  const key = `${cat}:${kind}`;
  if (LOOT.has(key)) return LOOT.get(key);
  const S = new Part(), T = new Part();
  const weapon = cat === "weapon" && !!BLASTER[kind];
  // 足もとの輪の色：ブラスターはその光の色、弾はその弾の色、ほかは種類の色
  lootGlow(T, weapon ? BLASTER[kind].col : cat === "ammo" ? AMMO_COL[kind] || CAT_COL.ammo : CAT_COL[cat] || "#ffffff", weapon);
  const t0 = T.p.length;
  if (weapon) {
    // 真ん中が原点の上に来るように、少し浮かせて置く
    const [x0, x1, z0, z1] = gunOf(kind).box;
    addBlaster(S, kind, [-(x0 + x1) / 2, 0, 0.5 - (z0 + z1) / 2]);
  } else if (cat === "ammo") ammoModel(S, kind);
  else if (kind === "tea") bottle(S);
  else if (kind === "coffee" || kind === "energy") can(S, kind);
  else if (kind === "bento") bento(S, T);
  else if (cat === "helmet") helmet(S);
  // 小さな回復の品は遠くからも見えるよう少し大きく（原点＝床のまわり）
  const k = { tea: 1.12, coffee: 1.4, energy: 1.2, bento: 1.15 }[kind] || 1;
  if (cat === "heal" && k !== 1) {
    for (let i = 0; i < S.p.length; i++) S.p[i] *= k;
    for (let i = t0; i < T.p.length; i++) T.p[i] *= k;
  }
  S.freeze();
  T.freeze();
  const m = { solid: S, screen: T };
  LOOT.set(key, m);
  return m;
}

// ── パラシュート（ラムエア：小部屋の並んだ翼。上から見て少し弓なり） ──
const CAN = { top: 5.7, R: 5.6, half: 0.5, chord: 2.5, cells: 9, trim: 6 * DEG, x0: 0.32 };
// 翼の断面（弦に対する割合）：u 前から後ろ、上の面、下の面
const FOIL = [[0, 0.028, -0.034], [0.04, 0.086, -0.056], [0.12, 0.124, -0.061], [0.26, 0.136, -0.053], [0.45, 0.122, -0.041], [0.67, 0.084, -0.026], [0.87, 0.04, -0.012], [1, 0.004, -0.004]];
function canopyPoint(s, u, h) {
  const c = CAN.chord * (1 - 0.14 * s * s), xle = CAN.x0 + CAN.chord / 2 - 0.16 * s * s;
  const ct = Math.cos(CAN.trim), st = Math.sin(CAN.trim);
  const x = xle - u * c * ct + h * c * st, hh = u * c * st + h * c * ct;
  const phi = s * CAN.half, R = CAN.R + hh, zc = CAN.top - CAN.R - 0.138 * CAN.chord;
  return [x, R * Math.sin(phi), zc + R * Math.cos(phi)];
}
function canopyShell(hex) {
  const P = new Part();
  const main = rgb(hex, A_COAT), light = mixC(main, W3, 0.68), deep = mixC(main, B3, 0.42);
  const under = mixC(main, B3, 0.3, 1), inner = rgb("#14171b"), stab = rgb("#2a2f36", A_COAT);
  const N = CAN.cells, S2 = N * 2;
  const pattern = ["d", "m", "l", "m", "m", "m", "l", "m", "d"];
  const cellCol = (i) => ({ d: deep, m: main, l: light })[pattern[i]];
  const sOf = (k) => -1 + k / N;
  const top = [];
  // 小部屋のまん中は少しふくらむ（前の縁の近くではふくらまない）
  const pillow = (u, zu, zl) => 0.02 * ((zu - zl) / 0.19) * Math.min(1, u / 0.26) ** 2;
  for (let k = 0; k <= S2; k++) {
    const s = sOf(k), mid = k % 2 === 1;
    top.push(FOIL.map(([u, zu, zl]) => canopyPoint(s, u, zu + (mid ? pillow(u, zu, zl) : 0))));
  }
  grid(P, top, (i) => cellCol(Math.floor(i / 2)), { smooth: "j", ref: (i, j) => canopyPoint(sOf(i + 0.5), FOIL[j][0], -0.5) });
  const bot = [];
  for (let k = 0; k <= S2; k += 2) bot.push(FOIL.slice(1).map(([u, , zl]) => canopyPoint(sOf(k), u, zl)));
  grid(P, bot, () => under, { smooth: "j", ref: (i, j) => canopyPoint(sOf(i * 2 + 1), FOIL[j + 1][0], 1) });
  // 前の口（小部屋の入口）と仕切り
  for (let k = 0; k < S2; k++) {
    const a = canopyPoint(sOf(k), 0, FOIL[0][1]), b = canopyPoint(sOf(k + 1), 0, FOIL[0][1]);
    const c = canopyPoint(sOf(k + 1), FOIL[1][0], FOIL[1][2]), d = canopyPoint(sOf(k), FOIL[1][0], FOIL[1][2]);
    quad(P, a, b, c, d, inner, unit([1, 0, -0.3]));
  }
  for (let k = 0; k <= S2; k += 2) {
    const s = sOf(k), dy = 0.018;
    const a = canopyPoint(s, 0, FOIL[0][1]), d = canopyPoint(s, FOIL[1][0], FOIL[1][2]);
    const e = [0, dy * Math.cos(s * CAN.half), -dy * Math.sin(s * CAN.half)];
    quad(P, add(a, mul(e, -1)), add(a, e), add(d, e), add(d, mul(e, -1)), light, unit([1, 0, -0.2]));
  }
  // 両端の安定板（下へさがる三角）
  for (const s of [-1, 1]) {
    const a = canopyPoint(s, 0.12, FOIL[2][2]), b = canopyPoint(s, 0.8, FOIL[6][2] - 0.004), m = canopyPoint(s, 0.4, -0.2);
    const n = [0, Math.cos(s * CAN.half) * s, -Math.sin(s * CAN.half) * s];
    tri(P, a, m, b, stab, n);
  }
  return pack(P);
}
const CANOPY = new Map();
/**
 * パラシュートの傘とひも（ローカル：足もとが原点）。col はその人の色（"#rrggbb"）、hands は [左手, 右手] の位置（ブレーキのひもを持つ）
 */
export function addCanopy(P, col, hands) {
  const hex = hexOk(col) ? col : "#3d8bfd";
  let shell = CANOPY.get(hex);
  if (!shell) {
    shell = canopyShell(hex);
    if (CANOPY.size > 48) CANOPY.delete(CANOPY.keys().next().value);
    CANOPY.set(hex, shell);
  }
  put(P, shell, [0, 0, 0]);
  // ひも：4 列（A〜D）× 3 本の仕切り → 肩の上の集まる点（前・後ろ）、肩の帯、後ろの縁 → 手（ブレーキ）
  const line = rgb("#dfe3e8"), riser = rgb("#30353c"), brake = rgb("#7a828c");
  const N = CAN.cells, sOf = (k) => -1 + k / N;
  for (const side of [1, -1]) {
    const h = hands?.[side > 0 ? 0 : 1] || [0.06, side * 0.27, 2.02];
    const front = [h[0] + 0.05, h[1] * 0.92, h[2] + 0.3], rear = [h[0] - 0.08, h[1] * 0.92, h[2] + 0.3], shoulder = [0, side * 0.17, 1.42];
    const ribs = side > 0 ? [18, 14, 10] : [0, 4, 8];
    for (const k of ribs) {
      const s = sOf(k);
      for (const [j, to] of [[1, front], [3, front], [5, rear], [6, rear]]) tubeR(P, canopyPoint(s, FOIL[j][0], FOIL[j][2]), to, 0.0075, line, 3);
    }
    tubeR(P, canopyPoint(side, 0.42, -0.35), front, 0.0075, line, 3);
    const casc = [h[0] - 0.3, h[1] * 1.3, h[2] + 1.25];
    for (const k of side > 0 ? [18, 16, 13] : [0, 2, 5]) tubeR(P, canopyPoint(sOf(k), 1, 0), casc, 0.006, brake, 3);
    tubeR(P, casc, h, 0.007, brake, 3);
    tubeR(P, front, shoulder, 0.014, riser, 4);
    tubeR(P, rear, shoulder, 0.014, riser, 4);
  }
}

// ── 輸送機（高い翼・4 つのプロペラ・後ろに荷物の扉。特定の機種の写しにしない）──
// 原点は胴の中心、前 x・左 y・上 z。長さ約 30 m、翼の幅 40 m
const FUS = [
  [15.0, 0.1, -0.3, 0.1], [14.85, 0.55, -0.25, 0.55], [14.55, 0.98, -0.18, 0.98], [14.05, 1.38, -0.1, 1.36], [13.4, 1.72, -0.04, 1.72],
  [12.6, 1.96, 0, 1.95], [11.6, 2.08, 0, 2.05], [10.0, 2.12, 0, 2.08], [6.0, 2.12, 0, 2.08], [2.0, 2.12, 0, 2.08], [-2.0, 2.12, 0, 2.08],
  [-4.4, 2.12, 0, 2.08], [-5.6, 2.1, 0.12, 1.96], [-7.0, 2.02, 0.36, 1.72], [-8.5, 1.86, 0.66, 1.42], [-10.0, 1.62, 0.98, 1.1],
  [-11.5, 1.3, 1.28, 0.8], [-12.8, 0.95, 1.52, 0.55], [-14.0, 0.58, 1.72, 0.34], [-14.8, 0.28, 1.84, 0.18], [-15.2, 0.08, 1.9, 0.06],
];
const SE = 2.5; // 断面の角の丸み（2 でだ円、大きいほど四角）
const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
function fusAt(x) {
  for (let i = 1; i < FUS.length; i++) {
    const a = FUS[i - 1], b = FUS[i];
    if (x <= a[0] && x >= b[0]) { const t = (a[0] - x) / (a[0] - b[0]); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; }
  }
  return x > FUS[0][0] ? FUS[0].slice(1) : FUS[FUS.length - 1].slice(1);
}
// 胴の表面の点（θ：0 が左、90° が上）。off だけ外へ出す
function fusPt(x, th, off = 0) {
  const [w, zc, h] = fusAt(x);
  const c = Math.cos(th), s = Math.sin(th), y = w * sgnPow(c, 2 / SE), z = zc + h * sgnPow(s, 2 / SE);
  const n = unit([0, sgnPow(c, 2 - 2 / SE) / w, sgnPow(s, 2 - 2 / SE) / h]);
  return [x, y + n[1] * off, z + n[2] * off];
}
// 左の横の面で高さ z の点（窓・扉）
function fusSide(x, z, sd, off) {
  const [, zc, h] = fusAt(x);
  const v = Math.max(-0.999, Math.min(0.999, (z - zc) / h));
  const th = Math.sign(v) * Math.asin(Math.abs(v) ** (SE / 2));
  const p = fusPt(x, th, off);
  return [p[0], p[1] * sd, p[2]];
}
// 翼の断面（後ろの上 → 前 → 後ろの下）：[u（前から後ろ）, 弦に対する高さ]
const WING_FOIL = [[1, 0.003], [0.74, 0.04], [0.45, 0.066], [0.2, 0.071], [0.06, 0.05], [0, 0.004], [0.025, -0.024], [0.12, -0.039], [0.35, -0.044], [0.7, -0.026], [1, -0.003]];
function wingRows(stations, foil) {
  // stations：[[y, xLE, xTE, z, 厚みの倍率], …]
  return stations.map(([y, xl, xt, z, th]) => foil.map(([u, v]) => [xl + (xt - xl) * u, y, z + v * (xl - xt) * th]));
}
let PLANE = null;
/**
 * 輸送機の形（1 回だけ作る）。body は胴・翼・尾・エンジンの覆い、prop は原点を中心に +x の軸で回るプロペラ 1 つ（ハブの覆いつき）、
 * blur は回っているときの半透明の円（screen に入れる。使わなくてもよい）、hubs はプロペラの中心（body の座標）
 */
export function planeParts() {
  if (PLANE) return PLANE;
  const B = new Part();
  const skin = rgb("#c6ccd2", A_COAT), belly = rgb("#b4bbc2", A_COAT), ramp = rgb("#a6adb5", A_COAT), nose = rgb("#8f979f", A_COAT);
  const wingTop = rgb("#8b949d", A_COAT), wingLow = rgb("#7f8891", A_COAT), flap = rgb("#78818a", A_COAT), boot = rgb("#4f565e", A_COAT);
  const nac = rgb("#c0c6cc", A_COAT), dark = rgb("#2b3036"), line = rgb("#6f7780", A_COAT), glass = rgb("#1a2532", A_GLASS);
  const door = rgb("#b5bcc3", A_COAT), antiGlare = rgb("#333a42");
  // 胴（前後の曲がるところは細かく）
  const xs = [];
  for (let i = 0; i + 1 < FUS.length; i++) {
    const a = FUS[i][0], b = FUS[i + 1][0], n = Math.max(1, Math.round((a - b) / (a > 11 || b < -4 ? 0.55 : 2.2)));
    for (let k = 0; k < n; k++) xs.push(a + ((b - a) * k) / n);
  }
  xs.push(FUS[FUS.length - 1][0]);
  const SIDES = 36, ths = Array.from({ length: SIDES }, (_, j) => (j / SIDES) * TAU);
  const rows = xs.map((x) => ths.map((th) => fusPt(x, th)));
  grid(B, rows, (i, j) => {
    const x = (xs[i] + xs[i + 1]) / 2, th = ((j + 0.5) / SIDES) * TAU, s = Math.sin(th);
    if (x > 14.35) return nose;
    if (x < -4.6 && x > -11.2 && s < -0.42) return ramp;
    return s < -0.55 ? belly : skin;
  }, { wrap: true, ref: (i) => { const x = (xs[i] + xs[i + 1]) / 2; return [x, 0, fusAt(x)[1]]; } });
  tri(B, rows[rows.length - 1][0], rows[rows.length - 1][SIDES / 2], rows[rows.length - 1][SIDES / 4], skin, [-1, 0, 0]);
  tri(B, rows[rows.length - 1][0], rows[rows.length - 1][(SIDES * 3) / 4], rows[rows.length - 1][SIDES / 2], skin, [-1, 0, 0]);
  // 翼の付け根の覆い（胴の上）
  const fair = [[5.0, 0.15, 0.02], [4.3, 0.85, 0.2], [3.3, 1.22, 0.4], [0.5, 1.28, 0.46], [-1.3, 1.22, 0.4], [-2.6, 0.85, 0.2], [-3.6, 0.15, 0.02]];
  const fRows = fair.map(([x, w, h]) => Array.from({ length: 13 }, (_, j) => { const t = (j / 12) * Math.PI; return [x, w * Math.cos(t), 2.0 + h * Math.sin(t) ** 0.8]; }));
  grid(B, fRows, () => skin, { ref: (i) => [fair[i][0], 0, 1.6] });
  // 主翼（左右）：前縁は黒いゴム、後ろの 1/4 はフラップ・補助翼の色
  const span = [1.9, 3.0, 5.2, 7.6, 10.0, 13.0, 16.5, 20.0];
  for (const sd of [1, -1]) {
    const st = span.map((y) => [sd * y, 3.2 - 0.9 * (y / 20), -1.3 + 1.3 * (y / 20), 2.3 + 0.012 * y, 1.05 - 0.25 * (y / 20)]);
    const R = wingRows(st, WING_FOIL);
    grid(B, R, (i, j) => (j === 4 || j === 5 ? boot : j === 0 ? flap : j >= 5 ? wingLow : wingTop), { ref: (i) => [(st[i][1] + st[i][2]) / 2, st[i][0], st[i][3]] });
    const tip = R[R.length - 1], tipC = mul(tip.reduce((m, p) => add(m, p), [0, 0, 0]), 1 / tip.length);
    for (let j = 0; j + 1 < tip.length; j++) tri(B, tipC, tip[j], tip[j + 1], wingLow, [0, sd, 0]);
    box(B, [2.3, sd * 20.05, 2.54], [0.3, 0.12, 0.12], sd > 0 ? rgb("#ff3b30", A_GLOW) : rgb("#30d158", A_GLOW)); // 翼端の灯
    for (const y of [3.6, 7.9, 12.2, 15.6]) box(B, [-1.05 + 1.3 * (y / 20) - 0.2, sd * y, 2.08 + 0.012 * y], [1.5, 0.22, 0.26], wingLow); // フラップの溝の覆い
  }
  // エンジンの覆い（プロペラの後ろ）
  const hubs = [[5.35, 10.0, 1.62], [5.57, 5.2, 1.55], [5.57, -5.2, 1.55], [5.35, -10.0, 1.62]];
  const nacSt = [[0, 0.42, 0], [-0.15, 0.52, 0], [-0.6, 0.68, 0.02], [-1.5, 0.75, 0.05], [-3.0, 0.73, 0.12], [-4.6, 0.58, 0.22], [-6.0, 0.26, 0.3]];
  for (const hb of hubs) {
    const NR = nacSt.map(([dx, r, dz]) => Array.from({ length: 16 }, (_, j) => { const t = (j / 16) * TAU; return [hb[0] + dx, hb[1] + Math.cos(t) * r, hb[2] + dz + Math.sin(t) * r * 1.04]; }));
    grid(B, NR, (i) => (i === 0 ? dark : nac), { wrap: true, ref: (i) => [hb[0] + nacSt[i][0], hb[1], hb[2] + nacSt[i][2]] });
    fan(B, [hb[0] - 6.0, hb[1], hb[2] + 0.3], [-1, 0, 0], 0.26, nac, 16);
    box(B, [hb[0] - 0.55, hb[1], hb[2] - 0.66], [0.75, 0.42, 0.2], dark); // 空気の取り入れ口
    const out = Math.sign(hb[1]);
    tubeR(B, [hb[0] - 2.2, hb[1] + out * 0.66, hb[2] + 0.12], [hb[0] - 2.8, hb[1] + out * 0.7, hb[2] + 0.16], 0.13, dark, 8, 2); // 排気
  }
  // 垂直尾翼・方向舵・前のひれ
  const finFoil = [[1, 0], [0.66, 0.6], [0.3, 1], [0.06, 0.62], [0, 0], [0.06, -0.62], [0.3, -1], [0.66, -0.6], [1, 0]];
  const finSt = [[2.0, -8.8, -14.7, 0.27], [5.4, -10.6, -14.95, 0.2], [8.7, -12.3, -15.1, 0.12]];
  const finRows = finSt.map(([z, xl, xt, th]) => finFoil.map(([u, v]) => [xl + (xt - xl) * u, v * th, z]));
  grid(B, finRows, (i, j) => (j === 0 || j === 7 ? flap : skin), { ref: (i) => [(finSt[i][1] + finSt[i][2]) / 2, 0, finSt[i][0]] });
  const ft = finRows[finRows.length - 1], ftc = mul(ft.reduce((m, p) => add(m, p), [0, 0, 0]), 1 / ft.length);
  for (let j = 0; j + 1 < ft.length; j++) tri(B, ftc, ft[j], ft[j + 1], skin, [0, 0, 1]);
  for (const sd of [1, -1]) quad(B, [-6.6, sd * 0.02, 2.05], [-8.8, sd * 0.2, 2.05], [-9.6, sd * 0.12, 3.6], [-9.4, sd * 0.02, 3.6], skin, [0, sd, 0]);
  box(B, [-15.2, 0, 8.55], [0.2, 0.12, 0.12], rgb("#f2f2f2", A_GLOW));
  // 水平尾翼
  for (const sd of [1, -1]) {
    const st = [[sd * 0.5, -11.3, -15.0, 2.02, 0.9], [sd * 4.0, -12.1, -14.98, 2.04, 0.8], [sd * 8.0, -13.0, -14.95, 2.06, 0.7]];
    const R = wingRows(st, WING_FOIL.map(([u, v]) => [u, v * 0.8]));
    grid(B, R, (i, j) => (j === 0 || j === 9 ? flap : j === 4 || j === 5 ? boot : skin), { ref: (i) => [(st[i][1] + st[i][2]) / 2, st[i][0], st[i][3]] });
    const tip = R[R.length - 1], tc = mul(tip.reduce((m, p) => add(m, p), [0, 0, 0]), 1 / tip.length);
    for (let j = 0; j + 1 < tip.length; j++) tri(B, tc, tip[j], tip[j + 1], skin, [0, sd, 0]);
  }
  // 脚の張り出し（胴の下の左右）
  loft(B, X, [
    { t: -3.6, hw: 2.1, zb: -1.86, zt: -0.98, cb: 0.35, ct: 0.3 },
    { t: -2.9, hw: 2.48, zb: -1.98, zt: -0.72, cb: 0.56, ct: 0.46 },
    { t: 2.4, hw: 2.48, zb: -1.98, zt: -0.72, cb: 0.56, ct: 0.46 },
    { t: 3.2, hw: 2.1, zb: -1.86, zt: -0.98, cb: 0.35, ct: 0.3 },
  ], { side: belly, top: skin });
  // 操縦席の窓・前の黒い防眩板（胴の面に沿って小さな四角に分けて貼る）
  const outN = (x, th) => unit(sub(fusPt(x, th, 1), fusPt(x, th, 0)));
  const patch = (x0, x1, t0, t1, col, off = 0.03, nx = 2, nt = 3) => {
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx;
      const ta = (t0 + ((t1 - t0) * j) / nt) * DEG, tb = (t0 + ((t1 - t0) * (j + 1)) / nt) * DEG;
      quad(B, fusPt(xa, ta, off), fusPt(xb, ta, off), fusPt(xb, tb, off), fusPt(xa, tb, off), col, outN((xa + xb) / 2, (ta + tb) / 2));
    }
  };
  for (const [t0, t1] of [[51, 69], [71.5, 88.5], [91.5, 108.5], [111, 129]]) patch(13.12, 13.95, t0, t1, glass);
  for (const [t0, t1] of [[46, 64], [116, 134]]) patch(12.3, 13.02, t0, t1, glass);
  for (const [t0, t1] of [[40, 56], [124, 140]]) patch(11.55, 12.2, t0, t1, glass);
  patch(13.97, 14.5, 60, 120, antiGlare, 0.02, 2, 4);
  // 胴の横の小窓・扉（後ろの扉から飛び降りる）・前の乗り口
  const sideN = (x, z, sd) => unit(sub(fusSide(x, z, sd, 1), fusSide(x, z, sd, 0)));
  const sidePatch = (x0, x1, z0, z1, sd, col, off = 0.03, nz = 1) => {
    for (let i = 0; i < nz; i++) {
      const za = z0 + ((z1 - z0) * i) / nz, zb = z0 + ((z1 - z0) * (i + 1)) / nz;
      quad(B, fusSide(x0, za, sd, off), fusSide(x1, za, sd, off), fusSide(x1, zb, sd, off), fusSide(x0, zb, sd, off), col, sideN((x0 + x1) / 2, (za + zb) / 2, sd));
    }
  };
  for (const sd of [1, -1]) {
    for (const x of [8.4, 6.6, 4.8, 3.0, 1.2, -0.6, -2.4]) sidePatch(x - 0.16, x + 0.16, 0.39, 0.71, sd, glass);
    for (const [x, w, h, z] of [[-5.15, 0.95, 1.85, -0.35], ...(sd > 0 ? [[10.2, 0.85, 1.6, -0.55]] : [])]) {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - h / 2, z1 = z + h / 2, e = 0.05;
      sidePatch(x0, x1, z0, z1, sd, door, 0.025, 4);
      sidePatch(x0 - e, x1 + e, z1, z1 + e, sd, line, 0.03);
      sidePatch(x0 - e, x1 + e, z0 - e, z0, sd, line, 0.03);
      sidePatch(x0 - e, x0, z0, z1, sd, line, 0.03, 4);
      sidePatch(x1, x1 + e, z0, z1, sd, line, 0.03, 4);
      sidePatch(x - 0.15, x + 0.15, z + h * 0.24 - 0.15, z + h * 0.24 + 0.15, sd, glass, 0.035);
    }
  }
  // 後ろの荷物の扉（下の傾斜の板）の線
  const lineAlong = (x0, x1, th) => { for (let i = 0; i < 6; i++) { const xa = x0 + ((x1 - x0) * i) / 6, xb = x0 + ((x1 - x0) * (i + 1)) / 6; quad(B, fusPt(xa, (th - 1.2) * DEG, 0.02), fusPt(xb, (th - 1.2) * DEG, 0.02), fusPt(xb, (th + 1.2) * DEG, 0.02), fusPt(xa, (th + 1.2) * DEG, 0.02), line, unit(sub(fusPt((xa + xb) / 2, th * DEG, 1), fusPt((xa + xb) / 2, th * DEG, 0)))); } };
  const lineAround = (x, t0, t1) => { for (let i = 0; i < 6; i++) { const ta = (t0 + ((t1 - t0) * i) / 6) * DEG, tb = (t0 + ((t1 - t0) * (i + 1)) / 6) * DEG; quad(B, fusPt(x - 0.04, ta, 0.02), fusPt(x - 0.04, tb, 0.02), fusPt(x + 0.04, tb, 0.02), fusPt(x + 0.04, ta, 0.02), line, unit(sub(fusPt(x, (ta + tb) / 2, 1), fusPt(x, (ta + tb) / 2, 0)))); } };
  lineAlong(-4.6, -11.2, -38); lineAlong(-4.6, -11.2, -142); lineAround(-4.6, -142, -38); lineAround(-9.6, -142, -38);
  box(B, [2.0, 0, 2.53], [0.22, 0.16, 0.1], rgb("#ff4a3d", A_GLOW)); // 衝突防止灯
  for (const x of [8.0, -3.4]) box(B, [x, 0, 2.18], [0.42, 0.03, 0.26], dark); // アンテナ
  // プロペラ（原点が中心、+x の軸で回る）：とがったハブの覆い・4 枚の羽根（先は黄色）
  const prop = new Part(), blade = rgb("#2a2f35", A_COAT), tipC = rgb("#e6c229", A_COAT);
  lathe(prop, [0, 0, 0], [1, 0, 0], [[-0.05, 0.43], [0.22, 0.42], [0.5, 0.35], [0.72, 0.24], [0.88, 0.11], [0.97, 0]], 14, nac);
  const rs = [0.3, 0.8, 1.4, 1.85, 2.05], chords = [0.3, 0.38, 0.36, 0.3, 0.17], pitch = [55, 42, 30, 22, 18];
  for (let b = 0; b < 4; b++) {
    const a = (b / 4) * TAU + Math.PI / 4, rho = [0, Math.cos(a), Math.sin(a)], tau = cross([1, 0, 0], rho);
    const edge = rs.map((r, i) => {
      const p = pitch[i] * DEG, cd = add(mul(tau, Math.cos(p)), mul([1, 0, 0], -Math.sin(p))), c = add([0.2, 0, 0], mul(rho, r));
      return [add(c, mul(cd, chords[i] * 0.4)), add(c, mul(cd, -chords[i] * 0.6))];
    });
    for (let i = 0; i + 1 < rs.length; i++) prop.quad2(edge[i][0], edge[i + 1][0], edge[i + 1][1], edge[i][1], i === rs.length - 2 ? tipC : blade);
  }
  const blur = new Part();
  ring(blur, [0.2, 0, 0], [1, 0, 0], 0.45, 1.82, rgb("#3a4048", 0.16), 28);
  ring(blur, [0.2, 0, 0], [1, 0, 0], 1.82, 2.05, rgb("#cfb43a", 0.24), 28);
  PLANE = { body: B.freeze(), prop: prop.freeze(), blur: blur.freeze(), hubs };
  return PLANE;
}
