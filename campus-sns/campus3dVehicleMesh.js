// 乗り物と乗員をキャンパスの描画座標へ変換する。クーペとジェット機の部品は campus3dMotorModels。
// ローカルの座標（前 x・左 y・上 z、m。乗り物の基準の点が原点）で部品ごとに三角形を作っておき（はじめの 1 回）、毎フレーム、向き・傾き・
// 車輪の回り・ハンドル・羽根を当てて描く座標（worldOf と標高 m）に書く。色のアルファ 0.5 は光を受けない（点いたライト）。
// 描くのは campus3dLayer の createVehiclesLayer：solid（ふつう）・glass（車の窓。濃い半透明）・screen（前かごの網・回る羽根。薄い半透明）・glow（光のにじみ）
import earcut from "earcut";
import { GlowMesh, worldOf } from "./campus3dMesh.js";
import { BIKE, CAR, DRONE } from "./campus3dVehicles.js";

import { DEG, TAU, add, sub, mul, dot, unit, rotAxis, mm, mv, I3, about, compose, ID, Part, tube, tubes, torus, disc, cyl, box, obox, limb, ellipsoid, rgb } from "./campus3dVehicleGeometry.js";
import { carParts, dentedShell, jetParts } from "./campus3dMotorModels.js";
import { BLASTER, addBlaster, addCanopy } from "./campus3dRoyaleModels.js";

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
const C = {
  frame: rgb("#8fb2c8"), // 自転車の車体（灰色がかった水色）
  tire: rgb("#1b1c1e"), rim: rgb("#c9cdd1"), spoke: rgb("#b4b9be"), hub: rgb("#8c9196"), chrome: rgb("#cfd3d6"),
  saddle: rgb("#2a2422"), grip: rgb("#2b2c2e"), basket: rgb("#26282b"), guard: rgb("#4b5560"), lampBody: rgb("#d7d9db"), lens: rgb("#e9e4cf"),
  reflector: rgb("#c62b22"), pedal: rgb("#2f3134"), stand: rgb("#9da2a7"),
  trim: rgb("#202326"),
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
function personParts(P, j, { head = true, torso = true, shirt = C.shirt } = {}) {
  // j：pelvis, neck, head, shoulders [L, R], elbows, hands, hips, knees, ankles, toes。shirt は服の色（ほかの人はその人の色）
  if (torso) {
    limb(P, j.pelvis, j.neck, 0.2, 0.34, shirt, [0, 1, 0]);
    limb(P, add(j.pelvis, [0, 0, -0.04]), add(j.pelvis, [0, 0, 0.08]), 0.21, 0.32, C.pants, [0, 1, 0]);
  }
  if (head) {
    limb(P, j.neck, add(j.neck, [0, 0, 0.07]), 0.08, 0.08, C.skin, [0, 1, 0]);
    ellipsoid(P, j.head, [0.095, 0.085, 0.11], C.skin, 10, 6);
    ellipsoid(P, add(j.head, [-0.012, 0, 0.03]), [0.1, 0.09, 0.09], C.hair, 10, 5);
  }
  for (let s = 0; s < 2; s++) {
    limb(P, j.shoulders[s], j.elbows[s], 0.09, 0.09, shirt);
    limb(P, j.elbows[s], j.hands[s], 0.075, 0.075, shirt);
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
export function vehicleMeshes(list, { pilot = null, glow = 0, now = 0, pool = POOL, detailedCar = false } = {}) {
  const solid = pool.solid, glass = pool.glass, screen = pool.screen;
  solid.n = glass.n = screen.n = 0;
  const light = new GlowMesh();
  const cars = [];
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
      if (!fp) {
        const floor=s.zr ?? s.z, pitch=s.roadPitch ?? s.pitch ?? 0, roll=s.roadRoll ?? s.roll ?? 0;
        const road=poseOf(s.x,s.y,floor,s.yaw,pitch,-roll);
        emit(screen,CP.shadow,ID,road);
        if(!s.air) for(const [i,w] of CP.wheels.entries()){
          const [x,y]=w.c,plane=floor+x*Math.sin(pitch*DEG)-y*Math.sin(roll*DEG);
          emit(screen,CP.tireShadow,{R:I3,t:[x,y,.009+((s.heights?.[i]??plane)-plane)]},road);
        }
      }
      const steer = s.steer || 0;
      const on = it.rider && night > .05, brake = it.rider && s.braking;
      cars.push({s,pose,fp,night,on,brake,reverse:it.rider && s.reverse});
      if (!detailedCar) {
        const shell = part => dentedShell(part,s.dents);
        emit(solid,shell(CP.body),ID,pose);
        emit(solid,CP.inside,ID,pose);
        if (!fp) emit(glass,CP.glass,ID,pose);
        emit(solid,CP.wheelPart,about(rotAxis(CP.WAX,steer*3*DEG),CP.wheelC),pose);
        for (const [i,w] of CP.wheels.entries()) {
          const hub=about(rotAxis([0,0,1],w.front ? steer*DEG : 0),w.c);
          if(s.heights){
            const plane=s.z+w.c[0]*Math.sin((s.pitch||0)*DEG)-w.c[1]*Math.sin((s.roll||0)*DEG);
            hub.t[2]+=Math.max(-.18,Math.min(.19,s.heights[i]-plane));
          }
          emit(solid,w.caliper,hub,pose);
          emit(solid,w.P,compose(hub,about(rotAxis([0,1,0],s.wheel||0),w.c)),pose);
        }
        emit(solid,shell(CP.head),ID,pose,on ? lit([.97,.96,.82]) : null);
        emit(solid,shell(CP.brake),ID,pose,brake ? lit([1,.09,.045]) : on ? lit([.82,.13,.08]) : null);
        if(s.reverse && it.rider) emit(solid,shell(CP.reverse),ID,pose,lit([.98,.98,.9]));
      }
      if (it.rider === "tp") {
        const P = new Part();
        personParts(P, driverJoints(steer));
        emit(solid, P.freeze(), { R: I3, t: detailedCar ? [.50,.36,-.27] : [0,-.03,-.12] }, pose);
      }
      // ライト：前照灯（夜）・尾灯（夜は点く、ブレーキで明るく）・後退灯
      if (on) {
        for (const side of [-1,1]) light.sprite(worldPt(pose,ID,detailedCar ? [2.02,side*.52,.65] : [2.17,side*.67,.59]), .37, [night,.95*night,.84*night], 2.5, .14);
        groundBeam(light, pose, ID, [2.16,0,0], 24, .9, 5.6, .52*night);
      }
      if (on || brake) for (const side of [-1,1]) light.sprite(worldPt(pose,ID,detailedCar ? [-1.61,side*.48,.95] : [-2.24,side*.66,.72]), brake ? .35 : .22, [brake ? .9 : .45*night,.045,.025], 2, .13);
      if (it.rider) drawRoadEffects(s, screen, solid, light);
    } else if (it.kind === "jet") {
      const J = jetParts(), pose = poseOf(s.x,s.y,s.z,s.yaw,s.pitch || 0,s.bank || 0);
      emit(solid, J.cockpit, ID, pose);
      if (it.view !== "fp") {
        emit(solid, J.body, ID, pose);
        emit(glass, J.glass, ID, pose);
        for (const control of J.controls) {
          const deflection = control.side ? -control.side*(s.aileron || 0)*17 : (s.elevator || 0)*13;
          emit(solid,control.part,about(rotAxis(control.axis,deflection*DEG),control.hinge),pose);
        }
        for (const fan of J.fans) emit(solid,fan.part,about(rotAxis([1,0,0],s.fanAngle || 0),fan.hub),pose);
        const gear = s.gearDown ?? 1;
        if (gear > .03) emit(solid, J.gear, { R: I3, t: [0,0,(1-gear)*.86] }, pose);
        for (const side of [-1,1]) light.sprite(worldPt(pose, ID, [-1.86,side*4.56,1.32]), .14, side>0 ? [.9,.03,.03] : [.04,.82,.30], 3,.07);
        if (now%1450 < 110) light.sprite(worldPt(pose, ID, [-4.65,0,3.70]), .24, [1,.96,.82], 3,.08);
      }
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
  return { solid: solid.result(), glass: glass.result(), screen: screen.result(), glow: light.result(), cars };
}

function drawRoadEffects(s, screen, solid, light) {
  if (s.marks?.length) {
    const tread = new Part();
    for (const mark of s.marks) for (let i=0;i<2;i++) {
      const a=mark.from[i], b=mark.to[i], dx=b[0]-a[0], dy=b[1]-a[1], w=.095/(Math.hypot(dx,dy)||1);
      const p=(v,sd)=>[v[0]-s.x-sd*dy*w,v[1]-s.y+sd*dx*w,v[2]-s.z];
      tread.quad(p(a,1),p(b,1),p(b,-1),p(a,-1),C.tire,null,[0,0,1]);
    }
    emit(screen,tread.freeze(),ID,poseOf(s.x,s.y,s.z,90));
  }
  const q=s.contact, age=s.fxAge;
  if (!q || age>=.58) return;
  const pose=poseOf(q.x,q.y,q.z,90), P=new Part();
  for (let i=0;i<9;i++) {
    const angle=i*2.40, speed=(2.1+(i%4)*1.25)*q.force;
    const dx=q.ax*1.6+Math.cos(angle)*speed, dy=q.ay*1.6+Math.sin(angle)*speed;
    const z=(1.3+i%3)*q.force*age-6.3*age*age;
    if (z < -.48) continue;
    const end=[dx*age,dy*age,z];
    const start=[end[0]-dx*.031,end[1]-dy*.031,z-.034];
    tube(P,start,end,i%3===0?.023:.012,i%3===0?C.trim:lit([1,.66,.23]),4);
  }
  if (P.p.length) emit(solid,P.freeze(),ID,pose);
  if (age<.10) light.sprite(worldPt(pose,ID,[q.ax*.09,q.ay*.09,0]),q.force*.48,[.88,.47,.19],2,.07);
}

// ── ほかの人（バーチャルキャンパス。campus3dPeers の peers() の結果）。歩く・走る速さで手足を振る、座る、手を振る・跳ねる・拍手の合図 ──
const POOL_PEOPLE = { solid: new Out(), glass: new Out(), screen: new Out() };
// 立つ・歩く人の関節。ph は歩みの位相（rad）、amp は振りの大きさ（0＝立つ、1＝歩く、1.5＝走る）、wave は手を振る合図の位相（なければ null）、
// clap は拍手の位相、sit は座る、hold はブラスターを両手で前に構える（キャンパスロワイヤル）
function walkJoints(ph, amp, { wave = null, clap = null, sit = false, hold = false } = {}) {
  const sw = Math.sin(ph) * 0.32 * amp, lift = (v) => Math.max(0, v) * 0.12 * amp;
  const drop = sit ? 0.42 : 0, fwd = sit ? 0.38 : 0;
  const hips = [[0, 0.1, 0.92 - drop], [0, -0.1, 0.92 - drop]];
  const ankles = sit ? [[fwd + 0.05, 0.11, 0.08], [fwd + 0.05, -0.11, 0.08]] : [[sw, 0.11, 0.08 + lift(Math.cos(ph))], [-sw, -0.11, 0.08 + lift(-Math.cos(ph))]];
  const knees = [0, 1].map((s) => (sit ? [fwd, s ? -0.1 : 0.1, 0.52] : ik(hips[s], ankles[s], 0.43, 0.43, [1, 0, 0.15])));
  const toes = ankles.map((a) => [a[0] + 0.15, a[1] + (a[1] > 0 ? 0.01 : -0.01), a[2] - 0.03]);
  const shoulders = [[0, 0.19, 1.42 - drop], [0, -0.19, 1.42 - drop]];
  const hands = [[-sw * 0.8 + 0.04, 0.24, 0.88 - drop + Math.abs(sw) * 0.25], [sw * 0.8 + 0.04, -0.24, 0.88 - drop + Math.abs(sw) * 0.25]];
  if (sit) { hands[0] = [fwd - 0.05, 0.14, 0.58]; hands[1] = [fwd - 0.05, -0.14, 0.58]; }
  if (hold) { hands[1] = [0.34, -0.06, 1.2 - drop]; hands[0] = [0.5, 0.0, 1.22 - drop]; }
  if (wave != null) hands[1] = [0.1, -0.34 - Math.sin(wave) * 0.13, 1.78 - drop];
  if (clap != null) { const g = 0.05 + Math.abs(Math.sin(clap)) * 0.1; hands[0] = [0.3, g, 1.25 - drop]; hands[1] = [0.3, -g, 1.25 - drop]; }
  const elbows = [0, 1].map((s) => ik(shoulders[s], hands[s], 0.29, 0.28, [-0.4, s ? -1 : 1, -0.6]));
  return { pelvis: [0, 0, 0.95 - drop], neck: [0, 0, 1.45 - drop], head: [0.01, 0, 1.6 - drop], shoulders, elbows, hands, hips, knees, ankles, toes };
}
// 空の人（キャンパスロワイヤル）：落下中は手足を広げる（体は poseOf の pitch −90 で腹ばいにする）、パラシュートは手を上げてひもを持つ
function skyJoints(chute, t) {
  if (chute) {
    const s = Math.sin(t * 2.1) * 0.04;
    const hips = [[0, 0.1, 0.92], [0, -0.1, 0.92]];
    const ankles = [[0.12 + s, 0.13, 0.12], [0.1 - s, -0.13, 0.1]];
    const knees = [0, 1].map((k) => ik(hips[k], ankles[k], 0.43, 0.43, [1, 0, 0.15]));
    const toes = ankles.map((a) => [a[0] + 0.15, a[1], a[2] - 0.05]);
    const shoulders = [[0, 0.19, 1.42], [0, -0.19, 1.42]];
    const hands = [[0.06, 0.27, 2.02], [0.06, -0.27, 2.02]];
    const elbows = [0, 1].map((k) => ik(shoulders[k], hands[k], 0.29, 0.28, [0, k ? -1 : 1, 0]));
    return { pelvis: [0, 0, 0.95], neck: [0, 0, 1.45], head: [0.02, 0, 1.6], shoulders, elbows, hands, hips, knees, ankles, toes };
  }
  const f = Math.sin(t * 9) * 0.03;
  const hips = [[0, 0.1, 0.92], [0, -0.1, 0.92]];
  const ankles = [[-0.18, 0.32 + f, 0.16], [-0.18, -0.32 - f, 0.16]];
  const knees = [0, 1].map((k) => ik(hips[k], ankles[k], 0.43, 0.43, [-1, k ? -0.4 : 0.4, 0]));
  const toes = ankles.map((a) => [a[0] - 0.12, a[1], a[2] - 0.02]);
  const shoulders = [[0, 0.19, 1.42], [0, -0.19, 1.42]];
  const hands = [[0.08, 0.62, 1.66 + f], [0.08, -0.62, 1.66 - f]];
  const elbows = [0, 1].map((k) => ik(shoulders[k], hands[k], 0.29, 0.28, [-0.5, k ? -1 : 1, 0]));
  return { pelvis: [0, 0, 0.95], neck: [0, 0, 1.45], head: [0.03, 0, 1.6], shoulders, elbows, hands, hips, knees, ankles, toes };
}
/**
 * ほかの人の形（毎フレーム）。people は [{ id, x, y, z, yaw, st（0 歩く 1 走る 2 座る … 8 落下 9 パラシュート）, speed（m/s）, col（#rrggbb）,
 * emote（0 手を振る 1 跳ねる 2 拍手）, emoteAt, hold（キャンパスロワイヤルで手に持つ装備の id。"fist" か無しなら素手） }]、now は ms、
 * pool は書き出す先（既定はバーチャルキャンパスのほかの人。キャンパスロワイヤルの自分の体は別の入れ物）
 * @returns { solid, glass, screen, glow }（乗り物のレイヤーと同じ形）
 */
export function peopleMeshes(people, { now = 0, pool = POOL_PEOPLE, viewer = null } = {}) {
  const { solid, glass, screen } = pool;
  solid.n = glass.n = screen.n = 0;
  for (const q of people) {
    if (![q.x, q.y, q.z, q.yaw].every(Number.isFinite)) continue;
    const shirt = /^#[0-9a-fA-F]{6}$/.test(q.col || "") ? rgb(q.col) : C.shirt;
    // 近い人（30 m 以内・見る人が分からなければ近い扱い）は丸みのある形、遠い人は軽い箱の形
    const nearBy = !viewer || Math.hypot(q.x - viewer.x, q.y - viewer.y) < 30;
    const body = (P, j) => (nearBy ? smoothPersonParts(P, j, { shirt, pack: !!q.hold, dummy: !!q.dummy }) : personParts(P, j, { shirt }));
    if (q.st === 8 || q.st === 9) {
      // 空の人：落下は腹ばい（へそのところで回す）、パラシュートは立った姿で傘の下
      const chute = q.st === 9;
      const j = skyJoints(chute, now / 1000 + (q.id || 0));
      const P = new Part();
      body(P, j);
      if (chute) addCanopy(P, q.col, j.hands);
      if (chute) emit(solid, P.freeze(), ID, poseOf(q.x, q.y, q.z, q.yaw));
      else emit(solid, P.freeze(), { R: I3, t: [0, 0, -0.95] }, poseOf(q.x, q.y, q.z + 0.95, q.yaw, -82));
      continue;
    }
    const sp = Math.max(0, q.speed || 0), amp = Math.min(1.5, sp / 1.3);
    const ph = (now / 1000) * (4.2 + sp * 1.6) + (q.id || 0) * 1.7; // 歩みの速さは進む速さで。人ごとに位相をずらす
    const te = q.emote != null ? (now - (q.emoteAt || now)) / 1000 : null;
    const hop = q.emote === 1 && te != null ? Math.max(0, Math.sin(Math.min(1, te / 0.5) * Math.PI)) * 0.35 : 0;
    const hold = !!(q.hold && BLASTER[q.hold] && q.st !== 2);
    const j = walkJoints(ph, amp, { wave: q.emote === 0 ? (te || 0) * 9 : null, clap: q.emote === 2 ? (te || 0) * 14 : null, sit: q.st === 2, hold });
    const P = new Part();
    body(P, j);
    if (hold) addBlaster(P, q.hold, j.hands[1]);
    emit(solid, P.freeze(), ID, poseOf(q.x, q.y, q.z + hop, q.yaw));
  }
  return { solid: solid.result(), glass: glass.result(), screen: screen.result(), glow: new GlowMesh().result() };
}

// 丸みのある人（バーチャルキャンパス・キャンパスロワイヤルの近くの人。2026-11-25「安っぽい」）：
// 胴は楕円の輪をつないだ筒（腰・胸・肩）、手足は先の細い筒、関節は球、靴は丸い箱、顔に小さな目。pack は背中のバッグ、dummy は練習の的（胸に的の印）
const SKIN2 = rgb("#d9ad8c"), SHOE2 = rgb("#ecebe6"), SOLE = rgb("#3a3c40"), PACK = rgb("#30353c"), STRAP = rgb("#22262b"), EYE = rgb("#1b1d20");
function taper(P, a, b, ra, rb, col, sides = 8) {
  const ax = unit(sub(b, a));
  const t0 = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit([ax[1] * t0[2] - ax[2] * t0[1], ax[2] * t0[0] - ax[0] * t0[2], ax[0] * t0[1] - ax[1] * t0[0]]);
  const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const ring = (c, r, k) => { const a1 = (k / sides) * Math.PI * 2; return add(c, add(mul(u, Math.cos(a1) * r), mul(v, Math.sin(a1) * r))); };
  for (let k = 0; k < sides; k++) {
    const n = unit(add(mul(u, Math.cos(((k + 0.5) / sides) * Math.PI * 2)), mul(v, Math.sin(((k + 0.5) / sides) * Math.PI * 2))));
    P.quad(ring(a, ra, k), ring(b, rb, k), ring(b, rb, k + 1), ring(a, ra, k + 1), col, null, n);
  }
}
function smoothPersonParts(P, j, { shirt = C.shirt, pack = false, dummy = false } = {}) {
  const pants = C.pants;
  // 胴：腰（幅 0.32・厚み 0.2）→ 胸 → 肩 → 首の付け根。輪は胴の軸に直角
  const up = unit(sub(j.neck, j.pelvis));
  const fwd = unit(sub([1, 0, 0], mul(up, dot([1, 0, 0], up))));
  const left = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];
  const L = Math.hypot(...sub(j.neck, j.pelvis));
  const rings = [[-0.06, 0.16, 0.105, pants], [0.08, 0.165, 0.105, pants], [0.1, 0.165, 0.11, shirt], [0.55, 0.18, 0.12, shirt], [0.86, 0.2, 0.11, shirt], [1.0, 0.085, 0.07, shirt]];
  const N = 12;
  const pt = (h, w, d, k) => { const a = (k / N) * Math.PI * 2; return add(add(j.pelvis, mul(up, h * L)), add(mul(fwd, Math.cos(a) * d), mul(left, Math.sin(a) * w))); };
  for (let r = 0; r + 1 < rings.length; r++) {
    const [h0, w0, d0] = rings[r], [h1, w1, d1, c1] = rings[r + 1];
    if (r === 1) continue; // 腰と服の境目（同じ高さの近く）は輪を重ねるだけ
    for (let k = 0; k < N; k++) {
      const n = unit(add(mul(fwd, Math.cos(((k + 0.5) / N) * Math.PI * 2)), mul(left, Math.sin(((k + 0.5) / N) * Math.PI * 2))));
      P.quad(pt(h0, w0, d0, k), pt(h1, w1, d1, k), pt(h1, w1, d1, k + 1), pt(h0, w0, d0, k + 1), r === 0 ? pants : c1, null, n);
    }
  }
  // 腰の下のふた
  for (let k = 0; k < N; k++) P.tri(add(j.pelvis, mul(up, -0.06 * L)), pt(-0.06, 0.16, 0.105, k + 1), pt(-0.06, 0.16, 0.105, k), pants, mul(up, -1));
  // 首と頭（髪、小さな目）
  taper(P, j.neck, add(j.neck, mul(up, 0.08)), 0.045, 0.042, SKIN2, 8);
  ellipsoid(P, j.head, [0.098, 0.088, 0.112], SKIN2, 12, 7);
  ellipsoid(P, add(j.head, add(mul(fwd, -0.014), mul(up, 0.028))), [0.104, 0.094, 0.094], C.hair, 12, 6);
  for (const s of [1, -1]) ellipsoid(P, add(j.head, add(add(mul(fwd, 0.088), mul(left, s * 0.034)), mul(up, 0.008))), [0.008, 0.012, 0.014], EYE, 6, 4);
  // 腕（袖は服の色・手は肌）・脚（ズボン）・靴
  for (let s = 0; s < 2; s++) {
    ellipsoid(P, j.shoulders[s], [0.068, 0.068, 0.066], shirt, 8, 5);
    taper(P, j.shoulders[s], j.elbows[s], 0.058, 0.047, shirt, 8);
    ellipsoid(P, j.elbows[s], [0.047, 0.047, 0.047], shirt, 8, 4);
    taper(P, j.elbows[s], j.hands[s], 0.045, 0.036, shirt, 8);
    ellipsoid(P, j.hands[s], [0.048, 0.036, 0.046], SKIN2, 8, 5);
    taper(P, j.hips[s], j.knees[s], 0.078, 0.062, pants, 8);
    ellipsoid(P, j.knees[s], [0.062, 0.062, 0.06], pants, 8, 4);
    taper(P, j.knees[s], j.ankles[s], 0.06, 0.046, pants, 8);
    const toe = j.toes[s], ank = j.ankles[s];
    const mid = [(toe[0] + ank[0]) / 2, (toe[1] + ank[1]) / 2, Math.min(toe[2], ank[2]) + 0.0];
    ellipsoid(P, add(mid, [0.01, 0, -0.005]), [0.13, 0.055, 0.045], SHOE2, 10, 5);
    box(P, add(mid, [0.01, 0, -0.04]), [0.25, 0.1, 0.018], SOLE);
  }
  // 背中のバッグ（試合中）と肩ひも
  if (pack) {
    const c = add(add(j.pelvis, mul(up, 0.55 * L)), mul(fwd, -0.19));
    obox(P, c, fwd, left, up, [0.075, 0.15, 0.19], PACK);
    obox(P, add(c, mul(up, -0.13)), fwd, left, up, [0.085, 0.13, 0.06], STRAP);
    for (const s of [1, -1]) taper(P, add(add(j.pelvis, mul(up, 0.95 * L)), add(mul(left, s * 0.1), mul(fwd, -0.04))), add(add(j.pelvis, mul(up, 0.35 * L)), add(mul(left, s * 0.12), mul(fwd, 0.1))), 0.016, 0.016, STRAP, 4);
  }
  // 練習の的：胸に白と赤の的
  if (dummy) {
    const c = add(add(j.pelvis, mul(up, 0.6 * L)), mul(fwd, 0.123));
    disc(P, c, fwd, 0.1, rgb("#f4f4f2"), 16);
    disc(P, add(c, mul(fwd, 0.002)), fwd, 0.066, rgb("#d64545"), 16);
    disc(P, add(c, mul(fwd, 0.004)), fwd, 0.033, rgb("#f4f4f2"), 12);
  }
}

// 歩いて見るあいだの毎フレームの形（乗り物のレイヤーへ）。2 つの群に分ける：
// - park：止めてある乗り物（乗っていない自転車・車）。置き場所・向き・ハンドルなどが変わったときだけ作り直して版（ver）を上げる。レイヤーは同じ版なら GPU へ送らない
// - move：動いているもの（乗っている 1 台・ドローン・操縦する人）。毎フレーム作って送る（ver: null）
// 止めてある乗り物の形は夜の明るさ・時刻によらない（灯は乗っているときだけ）
const POOL_PARK = { solid: new Out(), glass: new Out(), screen: new Out() };
const PEER_MOTORS = { solid: new Out(), glass: new Out(), screen: new Out() };
export function peerFrameMeshes(list, now, glow, viewer, detailedCar = false) {
  const people = [], vehicles = [];
  for (const p of list) {
    const kind = p.st === 5 ? "car" : p.st === 7 ? "jet" : p.st === 4 ? "bike" : null;
    if (!kind) { people.push(p); continue; }
    if (Math.hypot(p.x-viewer.x, p.y-viewer.y) > (kind === "jet" ? 500 : 210)) continue;
    const s = { ...p, v: p.speed, wheel: now*.001*p.speed/(kind === "car" ? CAR.wheelR : .33) };
    if (kind === "jet") {
      s.pitch = Math.max(-25, Math.min(25, p.flightPitch || 0));
      s.bank = Math.max(-51, Math.min(51, p.turnRate || 0));
      s.gearDown = p.speed < 22 && p.z-(viewer.world.floorBelow(p.x,p.y,p.z+1)?.z ?? p.z) < 9 ? 1 : 0;
    }
    vehicles.push({kind, s, rider:"tp", view:"tp"});
  }
  const groups = [];
  if (people.length) groups.push({ id:"people", ver:null, ...peopleMeshes(people,{now, viewer}) });
  if (vehicles.length) groups.push({ id:"motors", ver:null, ...vehicleMeshes(vehicles,{glow,now,pool:PEER_MOTORS,detailedCar}) });
  return { groups };
}
const PARK = { key: null, mesh: null, ver: 0 };
const parkKeyOf = (it) => {
  const s = it.s;
  return [it.kind, s.x, s.y, s.z, s.yaw, s.pitch || 0, s.lean || 0, s.roll || 0, s.parkSteer ?? 14, s.steer || 0, s.wheel || 0, s.crank || 0, ...(s.dents || [])].join(",");
};
export function vehicleFrameMeshes(list, { pilot = null, glow = 0, now = 0, detailedCar = false } = {}) {
  const parked = [];
  const moving = [];
  for (const it of list) {
    if (!it?.s) continue;
    (!it.rider && !it.view && it.kind !== "drone" ? parked : moving).push(it);
  }
  const key = detailedCar + ":" + parked.map(parkKeyOf).join(";");
  if (key !== PARK.key) {
    PARK.key = key;
    PARK.mesh = parked.length ? vehicleMeshes(parked, { pool: POOL_PARK, detailedCar }) : null;
    PARK.ver++;
  }
  const groups = [];
  if (PARK.mesh) groups.push({ id: "park", ver: PARK.ver, ...PARK.mesh,
    cars:PARK.mesh.cars.map(c=>({...c,night:Math.max(0,Math.min(1,glow))})) });
  if (moving.length || pilot) groups.push({ id: "move", ver: null, ...vehicleMeshes(moving, { pilot, glow, now, detailedCar }) });
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
    jet: Object.fromEntries(["body","glass","gear","cockpit"].map(k => [k, jetParts()[k].count])),
    bike: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.count])),
    car: { body: c.body.count, glass: c.glass.count, inside: c.inside.count, wheel: c.wheels[0].P.count },
    drone: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.count])),
  };
}

// キャンパスロワイヤルの形（campus3dRoyaleMesh.js）が同じ書き出し方を使う
export { Out, poseOf, emit, worldPt };
