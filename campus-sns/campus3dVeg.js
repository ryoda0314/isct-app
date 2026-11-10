// 木のレイヤー（デジタルツインの芯 3 の描き方。2026-11-10）：季節（campus3dEnv の樹種の暦）と風で変わる木を、MapLibre の独自レイヤーで描く。
// 形は地物の木（features の tree）から作り、季節の色・葉の量・花・揺れはシェーダーで計算する（日付・風を変えても作り直さない）。
//  ・落葉樹（イチョウ・ソメイヨシノ・ケヤキ）は枝ぶり（冬の裸の木）と、小さな葉の塊。塊ごとに乱数を持ち、葉の量がその乱数を下回ると消える
//    （落葉は葉の量の多い順にではなく塊ごとにばらばら）。色づき・若葉も塊ごとに数日ずれる
//  ・木ごとに季節の日を spread 日ずらす（日当たり・個体差。推定）。イチョウの半分を雌（ギンナンが落ちる。雌雄は不明なので推定）
//  ・根もとの円盤に落ち葉（落葉が進むと増え、数週間で減る）・散ったサクラの花びら・ギンナン
//  ・風で上ほど大きく揺れる（吹いていく向きに傾き、ゆれる。葉はさらに細かく）
//  ・夜・夕方・くもりの色は campus3dSky の toneOf と同じ式（建物と同じ見え方）。雪は上を向いた面が白い
import { SPECIES, SPECIES_ORDER, speciesOf } from "./campus3dEnv.js";
import { ICO0, ICO1, TREE_CLEAR, addBlob, addCone, addLimb, hashStr, seeded, trunkRadius, worldOf } from "./campus3dMesh.js";
import { toLngLat, toXY } from "./campus3dFeatures.js";
import { PER_M, compile, lightVector, matrixFor } from "./campus3dLayer.js";

export const VEG_LAYER_ID = "cb-veg";
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const ROLE = { trunk: 0, branch: 1, leaf: 2, litter: 3 };
const rgb = (hex) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const BARK = [...rgb("#6e5f52"), 1];
const BARK_CHERRY = [...rgb("#4b4039"), 1];
const BARK_GINKGO = [...rgb("#6b6157"), 1];

// 三角形（addBlob・addLimb・addCone がそのまま使える vert(xy, z, n, c)）に、木の情報（役目・樹種・塊の乱数・揺れ・木ごとのずれ・雌・位相・選択）をつける
class VegMesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.veg = [];
    this.tre = [];
    this.role = 0;
    this.species = 0;
    this.rand = 0;
    this.base = 0;
    this.tr = [0, 0, 0, 0];
  }
  vert(xy, z, n, c) {
    const [x, y] = worldOf(xy);
    this.pos.push(x, y, z);
    this.nrm.push(n[0], -n[1], n[2]); // 描く側は y が南向き
    this.col.push(c[0], c[1], c[2], c[3]);
    // 揺れ：根もとから 25m で 1（幹は弱く）
    const sw = Math.min(1, Math.max(0, (z - this.base) / 25)) * (this.role === ROLE.trunk ? 0.25 : 1);
    this.veg.push(this.role, this.species, this.rand, sw);
    this.tre.push(...this.tr);
  }
  part(role, rand = 0) {
    this.role = role;
    this.rand = rand;
  }
  // 1 頂点 28 バイト：位置 float×3・法線 int8×4・色 uint8×4・木 uint8×4（役目・樹種・乱数・揺れ）・木ごと uint8×4（ずれ・雌・位相・選択）
  pack() {
    const n = this.pos.length / 3;
    const buf = new ArrayBuffer(n * 28);
    const f32 = new Float32Array(buf);
    const i8 = new Int8Array(buf);
    const u8 = new Uint8Array(buf);
    const b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let i = 0; i < n; i++) {
      const o = i * 28;
      f32[o / 4] = this.pos[i * 3];
      f32[o / 4 + 1] = this.pos[i * 3 + 1];
      f32[o / 4 + 2] = this.pos[i * 3 + 2];
      for (let k = 0; k < 3; k++) i8[o + 12 + k] = Math.max(-127, Math.min(127, Math.round(this.nrm[i * 3 + k] * 127)));
      for (let k = 0; k < 4; k++) u8[o + 16 + k] = b(this.col[i * 4 + k]);
      u8[o + 20] = this.veg[i * 4];
      u8[o + 21] = this.veg[i * 4 + 1];
      u8[o + 22] = b(this.veg[i * 4 + 2]);
      u8[o + 23] = b(this.veg[i * 4 + 3]);
      u8[o + 24] = b((this.tre[i * 4] + 1) / 2);
      u8[o + 25] = b(this.tre[i * 4 + 1]);
      u8[o + 26] = b(this.tre[i * 4 + 2]);
      u8[o + 27] = b(this.tre[i * 4 + 3]);
    }
    return { buf, count: n };
  }
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ── 樹種ごとの形（高さ h・枝の広がり w（直径）・葉の始まる高さ cb・てっぺん top）──
// 葉の塊：乱数 rnd() を塊ごとに。shade は下ほど暗く（木の中の影）。半径 1.1m からは丸い球（80 面。小さい塊は 20 面）
function cluster(V, c, r, shade, rnd, sphere = null, lump = null) {
  V.part(ROLE.leaf, rnd());
  const big = r[0] >= 1.1;
  addBlob(V, c, r, [1, 1, 1, 1], rnd, { shade, lump: lump ?? (big ? 0.12 : 0.16), sphere: sphere || (big ? ICO1 : ICO0) });
}

// イチョウ：まっすぐな幹から、段ごとに斜め上へ枝（上ほど短く急）。輪郭は下が太い卵形
function ginkgo(V, T) {
  const { at, g, h, w, cb, ch, top, tr, rnd, jit, shade, bark } = T;
  const lean = [jit(0.25), jit(0.25)];
  const trunkTop = at(lean[0], lean[1], top - ch * 0.05);
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), trunkTop, tr, tr * 0.28, bark, 8);
  const tiers = Math.max(4, Math.min(9, Math.round(ch / 2)));
  const prof = (t) => Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.7) * (1 - 0.32 * t);
  let az = rnd() * TAU;
  for (let k = 0; k < tiers; k++) {
    const t = (k + 0.4) / tiers;
    const z = cb + ch * t * 0.88;
    const R = Math.max(0.8, (w / 2) * prof(t));
    const base = lerp3(at(0, 0, g), trunkTop, (z - g) / Math.max(0.1, trunkTop[2] - g));
    const nb = 2 + (rnd() < 0.45 ? 1 : 0);
    for (let j = 0; j < nb; j++) {
      az += 2.39996 + jit(0.35); // 黄金角
      const reach = R * (0.82 + rnd() * 0.2);
      const rise = reach * (0.45 + 0.4 * t + rnd() * 0.15);
      const tip = [base[0] + Math.cos(az) * reach, base[1] + Math.sin(az) * reach, Math.min(top - 0.4, z + rise)];
      const rl = tr * (0.4 - 0.22 * t);
      V.part(ROLE.branch);
      addLimb(V, base, tip, rl, rl * 0.3, bark, 5);
      // 小枝（冬の枝先）
      for (let q = 0; q < 2; q++) {
        const a2 = az + (q ? 0.5 : -0.5) + jit(0.2);
        const s0 = lerp3(base, tip, 0.6 + q * 0.2);
        const tw = [s0[0] + Math.cos(a2) * reach * 0.35, s0[1] + Math.sin(a2) * reach * 0.35, Math.min(top - 0.3, s0[2] + reach * 0.35)];
        addLimb(V, s0, tw, rl * 0.3, rl * 0.12, bark, 4);
      }
      // 葉：枝先と枝のなかほど
      const cr = Math.max(0.7, R * 0.38);
      cluster(V, tip, [cr, cr, cr * 0.85], shade, rnd, ICO0);
      cluster(V, lerp3(base, tip, 0.55), [cr * 0.8, cr * 0.8, cr * 0.7], shade, rnd, ICO0);
    }
  }
  // てっぺん
  for (let k = 0; k < 3; k++) {
    const r = Math.max(0.6, (w / 2) * 0.24);
    cluster(V, at(lean[0] + jit(r * 0.6), lean[1] + jit(r * 0.6), top - ch * (0.08 + k * 0.1)), [r, r, r * 0.9], shade, rnd, ICO0);
  }
}

// ケヤキ：低いところで太い枝が何本も斜め上へ扇のように広がり、傘の形の枝先に葉
function zelkova(V, T) {
  const { at, g, w, cb, ch, top, tr, rnd, jit, shade, bark } = T;
  const fork = Math.max(g + 1.6, cb - ch * 0.08);
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.15), jit(0.15), fork), tr, tr * 0.8, bark, 8);
  const m = 5 + (rnd() < 0.4 ? 1 : 0);
  const a0 = rnd() * TAU;
  const forkP = at(0, 0, fork - 0.1);
  for (let i = 0; i < m; i++) {
    const az = a0 + (i / m) * TAU + jit(0.3);
    const p1 = at(Math.cos(az) * w * 0.17, Math.sin(az) * w * 0.17, fork + ch * (0.3 + rnd() * 0.1));
    V.part(ROLE.branch);
    addLimb(V, forkP, p1, tr * 0.55, tr * 0.36, bark, 6);
    const ns = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let j = 0; j < ns; j++) {
      const a2 = az + (j - (ns - 1) / 2) * 0.45 + jit(0.15);
      const rr = (w / 2) * (0.72 + rnd() * 0.22);
      const tip = at(Math.cos(a2) * rr, Math.sin(a2) * rr, cb + ch * (0.55 + rnd() * 0.3));
      V.part(ROLE.branch);
      addLimb(V, p1, tip, tr * 0.32, tr * 0.1, bark, 5);
      for (let q = 0; q < 2; q++) {
        const a3 = a2 + (q ? 0.4 : -0.4);
        const s0 = lerp3(p1, tip, 0.7);
        const tw = [s0[0] + Math.cos(a3) * w * 0.12, s0[1] + Math.sin(a3) * w * 0.12, Math.min(top - 0.3, s0[2] + ch * 0.12)];
        addLimb(V, s0, tw, tr * 0.1, tr * 0.04, bark, 4);
      }
      const cr = Math.max(0.8, w * 0.16);
      cluster(V, tip, [cr, cr, cr * 0.75], shade, rnd);
      cluster(V, lerp3(p1, tip, 0.55), [cr * 0.85, cr * 0.85, cr * 0.7], shade, rnd);
    }
  }
  for (let k = 0; k < 3; k++) {
    const cr = Math.max(0.9, w * 0.2);
    cluster(V, at(jit(w * 0.1), jit(w * 0.1), cb + ch * (0.62 + k * 0.12)), [cr, cr, cr * 0.7], shade, rnd);
  }
}

// ソメイヨシノ：太く短い幹が低いところで 3〜4 本の太い枝に分かれ、横へ低く長く伸びる。枝先は少し垂れる。葉・花は横に広い平たい傘
function cherry(V, T) {
  const { at, g, h, w, cb, ch, tr, rnd, jit, shade, bark } = T;
  const fork = g + Math.min(2.2, h * 0.22);
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.25), jit(0.25), fork), tr, tr * 0.8, bark, 8);
  const a0 = rnd() * TAU;
  const nb = 3 + (rnd() < 0.5 ? 1 : 0);
  const forkP = at(0, 0, fork - 0.2);
  for (let k = 0; k < nb; k++) {
    const t = a0 + (k / nb) * TAU + jit(0.45);
    const r = w * (0.3 + jit(0.06));
    const tip = at(Math.cos(t) * r, Math.sin(t) * r, cb + ch * (0.3 + rnd() * 0.15));
    const mid = at(Math.cos(t) * r * 0.45, Math.sin(t) * r * 0.45, fork + (tip[2] - fork) * 0.65);
    V.part(ROLE.branch);
    addLimb(V, forkP, mid, tr * 0.62, tr * 0.42, bark, 6);
    addLimb(V, mid, tip, tr * 0.42, tr * 0.2, bark, 5);
    const cr = Math.max(0.7, w * 0.15);
    cluster(V, tip, [cr, cr, cr * 0.6], shade, rnd);
    cluster(V, mid, [cr * 0.85, cr * 0.85, cr * 0.55], shade, rnd);
    // 枝先から外へ 2 本（先が少し垂れる）
    for (let j = 0; j < 2; j++) {
      const a2 = t + (j ? 0.42 : -0.42) + jit(0.12);
      const rr = w * (0.44 + rnd() * 0.06);
      const end = at(Math.cos(a2) * rr, Math.sin(a2) * rr, cb + ch * (0.32 + rnd() * 0.12));
      const knee = lerp3(tip, end, 0.5);
      knee[2] += ch * 0.06;
      addLimb(V, tip, knee, tr * 0.2, tr * 0.11, bark, 4);
      addLimb(V, knee, end, tr * 0.11, tr * 0.04, bark, 4);
      // 冬に見える細い枝先
      for (const q of [-0.35, 0.35]) {
        const tw = [end[0] + Math.cos(a2 + q) * w * 0.07, end[1] + Math.sin(a2 + q) * w * 0.07, end[2] + ch * 0.05];
        addLimb(V, end, tw, tr * 0.04, tr * 0.02, bark, 3);
      }
      cluster(V, lerp3(knee, end, 0.6), [cr * 1.05, cr * 1.05, cr * 0.6], shade, rnd);
    }
  }
  const cr = Math.max(0.9, w * 0.22);
  cluster(V, at(jit(w * 0.04), jit(w * 0.04), cb + ch * 0.62), [cr, cr, cr * 0.55], shade, rnd);
}

// 常緑の広葉樹（クスノキなど・丸い木）：大きな塊に、まわりの塊（葉は落ちない）
function evergreen(V, T) {
  const { at, g, w, cb, ch, tr, rnd, jit, shade, bark } = T;
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.2), jit(0.2), cb + ch * 0.45), tr, tr * 0.55, bark, 7);
  V.part(ROLE.leaf, rnd());
  addBlob(V, at(0, 0, cb + ch * 0.5), [w * 0.42, w * 0.42, ch * 0.5], [1, 1, 1, 1], rnd, { shade, sphere: ICO1 });
  const a0 = rnd() * TAU;
  for (let k = 0; k < 6; k++) {
    const t = a0 + (k / 6) * TAU + jit(0.35);
    const r = w * (0.25 + jit(0.04));
    cluster(V, at(Math.cos(t) * r, Math.sin(t) * r, cb + ch * (0.38 + rnd() * 0.2)), [w * 0.24, w * 0.24, ch * 0.3], shade, rnd, ICO1, 0.14);
  }
}

// ヒマラヤスギ：高い幹から、横に長く張り出す枝の層（平たい塊）が上へ小さく重なる
function cedar(V, T) {
  const { at, g, w, cb, ch, top, tr, rnd, jit, shade, bark } = T;
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.2), jit(0.2), top - ch * 0.12), tr, tr * 0.3, bark, 7);
  for (let k = 0; k < 4; k++) {
    const z = cb + ch * (0.1 + 0.25 * k);
    const r = (w / 2) * (1 - 0.21 * k);
    V.part(ROLE.leaf, rnd());
    addBlob(V, at(jit(0.3), jit(0.3), z), [r * 0.62, r * 0.62, ch * 0.11], [1, 1, 1, 1], rnd, { shade, lump: 0.18 });
    const a0 = rnd() * TAU;
    const nb = 5 - Math.min(2, k);
    for (let j = 0; j < nb; j++) {
      const t = a0 + (j / nb) * TAU + jit(0.35);
      const rr = r * (0.58 + jit(0.08));
      V.part(ROLE.leaf, rnd());
      addBlob(V, at(Math.cos(t) * rr, Math.sin(t) * rr, z - ch * (0.02 + rnd() * 0.04)), [r * 0.42, r * 0.42, ch * 0.08], [1, 1, 1, 1], rnd, { shade, lump: 0.2 });
    }
  }
}

// 針葉樹（kind conifer）：重ねた円すい
function conifer(V, T) {
  const { at, g, w, cb, ch, tr, rnd, jit, shade, bark } = T;
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.2), jit(0.2), cb + ch * 0.8), tr, tr * 0.55, bark, 7);
  for (let k = 0; k < 3; k++) {
    V.part(ROLE.leaf, rnd());
    addCone(V, at(jit(0.1), jit(0.1), cb + ch * k * 0.27), (w / 2) * (1 - 0.27 * k), ch * (k === 2 ? 0.46 : 0.42), [1, 1, 1, 1], shade, rnd);
  }
}

// シュロ：幹の先の付け根から、柄の長い扇の葉が四方へ
function palm(V, T) {
  const { at, g, w, cb, ch, tr, rnd, jit, shade, bark } = T;
  V.part(ROLE.trunk);
  addLimb(V, at(0, 0, g - 0.3), at(jit(0.2), jit(0.2), cb + ch * 0.45), tr, tr * 0.55, bark, 7);
  const z0 = cb + ch * 0.45;
  const hub = at(0, 0, z0);
  V.part(ROLE.branch);
  addBlob(V, at(0, 0, z0 - ch * 0.12), [tr * 1.6, tr * 1.6, ch * 0.18], bark, rnd, { shade, lump: 0.2 });
  const a0 = rnd() * TAU;
  for (let k = 0; k < 12; k++) {
    const t = a0 + (k / 12) * TAU + jit(0.22);
    const up = k % 3 === 0;
    const r = (w / 2) * (0.78 + rnd() * 0.22);
    const mid = at(Math.cos(t) * r * 0.42, Math.sin(t) * r * 0.42, z0 + ch * (up ? 0.42 : 0.2));
    const tip = at(Math.cos(t) * r * 0.85, Math.sin(t) * r * 0.85, z0 + ch * (up ? 0.38 : -0.12 - rnd() * 0.12));
    V.part(ROLE.leaf, rnd());
    addLimb(V, hub, mid, 0.04, 0.03, [1, 1, 1, 1], 4);
    addBlob(V, [(mid[0] + tip[0]) / 2, (mid[1] + tip[1]) / 2, (mid[2] + tip[2]) / 2], [r * 0.3, r * 0.3, ch * 0.1], [1, 1, 1, 1], rnd, { shade, lump: 0.28 });
  }
}

const SHAPE = { ginkgo, cherry, zelkova, evergreen, cedar, palm };

// 根もとの落ち葉の円盤（落葉樹）：中心から外へ v（0〜1）。地面の高さに沿う
function litterDisc(L, p, R, groundAt) {
  const n = 24;
  const ring = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const q = [p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R];
    const z = groundAt(toLngLat(q));
    ring.push([q, Number.isFinite(z) ? z + 0.05 : null]);
  }
  const zc = groundAt(toLngLat(p));
  if (!Number.isFinite(zc)) return;
  for (let k = 0; k < n; k++) {
    const [a, za] = ring[k];
    const [b, zb] = ring[k + 1];
    const z1 = za ?? zc + 0.05;
    const z2 = zb ?? zc + 0.05;
    L.rand = 0;
    L.vert(p, zc + 0.05, [0, 0, 1], [1, 1, 1, 1]);
    L.rand = 1;
    L.vert(a, z1, [0, 0, 1], [1, 1, 1, 1]);
    L.vert(b, z2, [0, 0, 1], [1, 1, 1, 1]);
  }
}
// 舞う落ち葉・花びらの粒：木ごと K 粒。1 粒 6 頂点、1 頂点 14 個：木の根もと（描く座標 3）・葉の始まり・てっぺん（根もとからの m）・
// 枝の広がりの半径（m）・樹種・木のずれ・粒の乱数 4（場所 u v・位相・出る順）・角 2
const FALL_K = 24;
function addFall(out, ctr, cbH, topH, R, si, off, rnd) {
  const C = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < FALL_K; k++) {
    let u = 0;
    let v = 0;
    do {
      u = rnd() * 2 - 1;
      v = rnd() * 2 - 1;
    } while (u * u + v * v > 1);
    const ph = rnd();
    const r = rnd();
    for (const c of C) out.push(ctr[0], ctr[1], ctr[2], cbH, topH, R, si, off, u, v, ph, r, c[0], c[1]);
  }
}

/**
 * 地物の木から、木のレイヤーの形（solid：幹・枝・葉、litter：根もとの落ち葉の円盤、fall：舞う落ち葉の粒）。groundAt は [lng, lat] → 地面の標高
 */
export function buildVeg(features, groundAt, { selectedId = null } = {}) {
  const V = new VegMesh();
  const L = new VegMesh();
  L.role = ROLE.litter;
  let trees = 0;
  const fall = [];
  for (const f of features) {
    if (f.type !== "tree" || !f.coords?.length || !(f.height > 0)) continue;
    const g = groundAt(f.coords[0]);
    if (!Number.isFinite(g)) continue;
    const sp = speciesOf(f);
    const si = SPECIES_ORDER.indexOf(sp);
    const rnd = seeded(hashStr(f.id));
    const off = rnd() * 2 - 1;
    const female = sp === "ginkgo" && (hashStr(`${f.id}:sex`) & 1) === 1 ? 1 : 0;
    const phase = rnd();
    const sel = f.id === selectedId ? 1 : 0;
    V.tr = [off, female, phase, sel];
    V.base = g;
    V.species = si;
    const p = toXY(f.coords[0]);
    const kind = TREE_CLEAR[f.kind] != null ? f.kind : "broad";
    const h = f.height;
    const w = f.crown || h * 0.6;
    const cb = g + h * TREE_CLEAR[kind];
    const top = g + h;
    const ch = top - cb;
    const shade = (z) => 0.62 + 0.38 * Math.min(1, Math.max(0, (z - cb) / Math.max(0.1, ch)));
    const T = {
      at: (dx, dy, z) => [p[0] + dx, p[1] + dy, z],
      g, h, w, cb, ch, top, tr: trunkRadius(f), rnd, shade,
      jit: (a) => (rnd() - 0.5) * 2 * a,
      bark: sp === "cherry" ? BARK_CHERRY : sp === "ginkgo" ? BARK_GINKGO : BARK,
    };
    const shape = f.kind === "conifer" ? conifer : SHAPE[sp] || evergreen;
    shape(V, T);
    trees++;
    if (SPECIES[sp]?.deciduous) {
      L.tr = [off, female, phase, sel];
      L.species = si;
      L.base = g;
      litterDisc(L, p, Math.max(1.5, (w / 2) * 1.15), groundAt);
      const c = worldOf(p);
      addFall(fall, [c[0], c[1], g], cb - g, top - g, w / 2, si, off, rnd);
    }
  }
  const fb = new Float32Array(fall);
  return { solid: V.pack(), litter: L.pack(), fall: { buf: fb.buffer, count: fb.length / 14 }, trees };
}

// ── シェーダー ──
const TONE = `
const vec3 SUNSET = vec3(1.0, 0.604, 0.341);
const vec3 DUSK = vec3(0.416, 0.353, 0.659);
const vec3 NAVY = vec3(0.051, 0.102, 0.2);
uniform vec4 u_tone; // 夕日の色づき・日没後の紫・夜・くもりの暗さ（campus3dSky の lookFor の f）
vec3 toneOf(vec3 day) {
  float gl = u_tone.w;
  vec3 night = day * vec3(0.27, 0.30, 0.34);
  vec3 c = mix(day, SUNSET, 0.16 * u_tone.x * (1.0 - gl));
  c = mix(c, vec3(0.0), 0.06 * u_tone.x);
  c = mix(c, DUSK, 0.28 * u_tone.y * (1.0 - 0.7 * gl));
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(y), 0.35 * gl);
  c = mix(c, vec3(0.0), 0.16 * gl);
  return mix(c, mix(night, NAVY, 0.25), u_tone.z);
}`;
const SPECIES_UNIFORMS = `
uniform float u_doy;
uniform vec4 u_spA[6]; // 芽吹き o0 o1・色づき c0 c1
uniform vec4 u_spB[6]; // 落葉 f0 f1・落ち葉が残る日数・木ごとのずれの幅
uniform vec4 u_spC[6]; // 開花 b0・満開 b1・散る b2・落葉樹なら 1
uniform vec4 u_spD[6]; // 新芽（常緑）・ギンナン n0 n1
uniform vec3 u_cG[6];
uniform vec3 u_cY[6];
uniform vec3 u_cA[6];
uniform vec3 u_cA2[6]; // 色づいた葉のもうひとつの色（葉の塊ごとにまぜる）
uniform vec3 u_cBr[6]; // 落ちる前の茶色
uniform vec3 u_cB[6];
float sm(float a, float b, float x) { return smoothstep(a, b, x); }
// 色づいた葉の色：塊ごと（k）に autumn と autumn2 をまぜる。色づきはじめ（autumn が小さい）は autumn2（黄・橙）寄り
vec3 autumnCol(int si, float k, float autumn) {
  return mix(u_cA[si], u_cA2[si], clamp(k * k + (1.0 - autumn) * 0.5, 0.0, 1.0));
}`;
const VS = `
attribute vec3 a_pos;
attribute vec4 a_nrm;
attribute vec4 a_col;
attribute vec4 a_veg;
attribute vec4 a_tre;
uniform mat4 u_matrix;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
uniform vec4 u_wind;   // 吹いていく向き（描く座標）・風速 m/s・時間 s
uniform float u_perM;  // 描く座標で 1m
uniform vec2 u_snowWet;
uniform vec3 u_accent;
varying vec4 v_color;
${SPECIES_UNIFORMS}
${TONE}
void main() {
  int si = int(a_veg.y + 0.5);
  float role = a_veg.x;
  float rnd = a_veg.z / 255.0;
  float sway = a_veg.w / 255.0;
  vec4 A = u_spA[si];
  vec4 B = u_spB[si];
  vec4 C = u_spC[si];
  vec4 D = u_spD[si];
  float d = u_doy + (a_tre.x * 2.0 - 1.0) * B.w;
  vec3 col = a_col.rgb;
  bool hide = false;
  float flower = 0.0;
  if (role > 1.5) {
    // 葉：塊ごとに色づき・若葉が少しずれ、葉の量が塊の乱数を下回ると消える
    float dc = d + (rnd - 0.5) * 8.0;
    float leaf = 1.0;
    float young = 0.0;
    float autumn = 0.0;
    float bloom = 0.0;
    if (C.w > 0.5) {
      leaf = min(sm(A.x, A.y, d), 1.0 - sm(B.x, B.y, d));
      young = leaf > 0.0 ? 1.0 - sm(A.y - 4.0, A.y + 18.0, dc) : 0.0;
      autumn = sm(A.z, A.w, dc);
      if (C.x > 0.5) bloom = sm(C.x - 2.0, C.y, d) * (1.0 - sm(C.y + 2.0, C.z, d));
    } else if (D.y > D.x) {
      young = sm(D.x, D.x + 10.0, dc) * (1.0 - sm(D.y - 8.0, D.y + 6.0, dc));
    }
    if (rnd > max(leaf, bloom) || max(leaf, bloom) < 0.002) hide = true;
    vec3 c = mix(u_cG[si], u_cY[si], young);
    c = mix(c, autumnCol(si, fract(rnd * 5.17 + a_tre.z * 2.31), autumn), autumn);
    // 落ちる前は茶色がかる（イチョウは茶色＝黄色のまま）
    if (C.w > 0.5) c = mix(c, u_cBr[si], 0.45 * sm(B.x - 4.0, B.y, dc));
    flower = bloom * (1.0 - leaf * 0.7);
    c = mix(c, u_cB[si], flower);
    // 花は薄く光を通して明るい：塊の下の陰を弱く
    col = c * mix(a_col.r, 1.0, flower * 0.8);
  }
  if (hide) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_color = vec4(0.0);
    return;
  }
  vec3 pos = a_pos;
  // 風：上ほど大きく、吹いていく向きへ傾いてゆれる。葉はさらに細かく
  float w = u_wind.z;
  if (w > 0.05 && sway > 0.0) {
    float t = u_wind.w;
    float ph = a_tre.z * 6.2832;
    float amp = sway * (0.025 * w + 0.0018 * w * w);
    float osc = 0.55 + 0.45 * sin(t * (0.9 + 0.06 * w) + ph) + 0.15 * sin(t * 2.7 + ph * 3.1);
    vec2 dir = u_wind.xy;
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 dm = dir * amp * osc + perp * amp * 0.18 * sin(t * 1.9 + ph * 1.7);
    if (role > 1.5) dm += (dir + perp) * amp * 0.12 * sin(t * (4.0 + rnd * 3.0) + rnd * 40.0);
    pos.xy += dm * u_perM;
  }
  gl_Position = u_matrix * vec4(pos, 1.0);
  vec3 n = a_nrm.xyz;
  // 雪：上を向いた面が白い。濡れると少し暗い
  col = mix(col, vec3(0.93, 0.95, 0.97), u_snowWet.x * sm(0.3, 0.85, n.z) * (role > 1.5 ? 0.9 : 0.6));
  col *= 1.0 - 0.12 * u_snowWet.y;
  if (a_tre.w > 0.5) col = mix(col, u_accent, 0.55);
  vec3 c = toneOf(col);
  float colorvalue = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float directional = clamp(dot(n, u_lightpos), 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  // 下限は木の色みのまま（MapLibre の建物の式 mix(0, 0.3, 1 - 光の色) は、青い夜の光で下限が赤茶になり、雨の夜の木が赤く見えた）
  vec3 lit = clamp((c + 0.03) * directional * u_lightcolor, (c + 0.03) * 0.45, vec3(1.0));
  // 花：光の当たらない側でも色が残る（透けて明るい）
  lit = mix(lit, max(lit, c * 0.93 * u_lightcolor), flower * 0.7);
  v_color = vec4(lit, 1.0);
}`;
const FS = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;
// 落ち葉の円盤
const VS_LIT = `
attribute vec3 a_pos;
attribute vec4 a_veg;
attribute vec4 a_tre;
uniform mat4 u_matrix;
uniform float u_perM;
varying vec2 v_m;
varying float v_r;
varying float v_lit;
varying float v_pet;
varying float v_nut;
varying vec3 v_leafCol;
varying vec3 v_leafCol2;
varying vec3 v_petCol;
${SPECIES_UNIFORMS}
void main() {
  int si = int(a_veg.y + 0.5);
  vec4 B = u_spB[si];
  vec4 C = u_spC[si];
  vec4 D = u_spD[si];
  float d = u_doy + (a_tre.x * 2.0 - 1.0) * B.w;
  float fallen = sm(B.x - 6.0, B.y, d);
  v_lit = fallen * (1.0 - sm(B.y, B.y + B.z, d));
  v_pet = C.x > 0.5 ? sm(C.y, C.y + 5.0, d) * (1.0 - sm(C.z, C.z + 8.0, d)) : 0.0;
  v_nut = (a_tre.y > 0.5 && D.w > D.z) ? sm(D.z, D.z + 20.0, d) * (1.0 - sm(D.w, D.w + 14.0, d)) : 0.0;
  v_leafCol = mix(autumnCol(si, a_veg.z / 255.0, 1.0), u_cBr[si], 0.35);
  v_leafCol2 = u_cA2[si];
  v_petCol = u_cB[si];
  v_r = a_veg.z / 255.0;
  v_m = a_pos.xy / u_perM;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;
const FS_LIT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_noise;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
uniform vec2 u_snowWet;
varying vec2 v_m;
varying float v_r;
varying float v_lit;
varying float v_pet;
varying float v_nut;
varying vec3 v_leafCol;
varying vec3 v_leafCol2;
varying vec3 v_petCol;
${TONE}
float nz(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return texture2D(u_noise, (i + f + 0.5) / 256.0).r;
}
void main() {
  float edge = 1.0 - smoothstep(0.55, 1.0, v_r);
  float n1 = nz(v_m * 3.1);
  float n2 = nz(v_m * 7.3 + 17.0);
  float dens = clamp(v_lit * edge * 1.1, 0.0, 1.0);
  float nn = n1 * 0.65 + n2 * 0.35;
  float a = smoothstep(1.0 - dens * 0.95, 1.0 - dens * 0.95 + 0.08, nn + 0.12 * dens);
  // 落ち葉：色のちがう葉がまだらにまざる
  vec3 col = mix(v_leafCol, v_leafCol2, 0.6 * smoothstep(0.45, 0.8, nz(v_m * 1.7 + 5.0))) * (0.78 + 0.4 * n2);
  if (v_pet > 0.01) {
    float n3 = nz(v_m * 13.0 + 41.0);
    float p = v_pet * edge;
    float ap = smoothstep(1.0 - p * 0.55, 1.0 - p * 0.55 + 0.06, n3);
    col = mix(col, v_petCol, ap);
    a = max(a, ap);
  }
  if (v_nut > 0.01) {
    float n4 = nz(v_m * 21.0 + 73.0);
    float an = smoothstep(0.93 - v_nut * 0.05, 0.95 - v_nut * 0.05, n4) * edge;
    col = mix(col, vec3(0.86, 0.66, 0.32), an);
    a = max(a, an);
  }
  a *= 1.0 - 0.85 * u_snowWet.x;
  if (a < 0.01) discard;
  vec3 c = toneOf(col * (1.0 - 0.2 * u_snowWet.y));
  float colorvalue = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float directional = clamp(u_lightpos.z, 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  vec3 lit = clamp((c + 0.03) * directional * u_lightcolor, (c + 0.03) * 0.45, vec3(1.0));
  gl_FragColor = vec4(lit * a, a);
}`;

// 舞う落ち葉・花びら：落葉の時期（花が散る時期）に、風が強いほど多く・遠くまで。くるくる回りながら落ちる（演出：時期と風は状態どおり）
const VS_FALL = `
attribute vec3 a_ctr;
attribute vec4 a_cr;   // 葉の始まり・てっぺん（根もとからの m）・半径・樹種
attribute vec4 a_s0;   // 木のずれ・場所 u v・位相
attribute vec3 a_s1;   // 出る順・角 x y
uniform mat4 u_matrix;
uniform vec4 u_wind;
uniform float u_perM;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
varying vec4 v_color;
${SPECIES_UNIFORMS}
${TONE}
void main() {
  int si = int(a_cr.w + 0.5);
  vec4 B = u_spB[si];
  vec4 C = u_spC[si];
  float d = u_doy + a_s0.x * B.w;
  float rate = sm(B.x - 5.0, B.x + 4.0, d) * (1.0 - sm(B.y - 3.0, B.y + 5.0, d));
  float pet = C.x > 0.5 ? sm(C.y - 1.0, C.y + 3.0, d) * (1.0 - sm(C.z - 2.0, C.z + 5.0, d)) : 0.0;
  float w = u_wind.z;
  float show = max(rate, pet) * (0.3 + 0.7 * clamp(w / 7.0, 0.0, 1.0));
  if (a_s1.x > show) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_color = vec4(0.0);
    return;
  }
  bool petal = pet > rate;
  float vs = petal ? 0.45 : 0.85;
  float H = a_cr.y;
  float T = max(2.0, H / vs);
  float ph = a_s0.w;
  float t = fract(u_wind.w / T + ph);
  float tt = t * T;
  float z0 = a_cr.x + (a_cr.y - a_cr.x) * fract(ph * 7.31);
  float z = z0 * (1.0 - t);
  vec2 start = a_s0.yz * a_cr.z;
  vec2 drift = u_wind.xy * min(w * 0.55 * tt, 25.0) + vec2(sin(tt * 2.1 + ph * 30.0), cos(tt * 1.7 + ph * 20.0)) * 0.45;
  vec2 m = start + vec2(drift.x, -drift.y);
  float ang = tt * (petal ? 6.0 : 4.0) + ph * 10.0;
  float sz = petal ? 0.035 : 0.06;
  vec2 c = a_s1.yz * sz;
  vec3 offs = vec3(cos(ang) * c.x, sin(ang) * c.x, c.y * (0.4 + 0.6 * abs(sin(ang * 0.7))));
  vec3 pm = vec3(m, z) + offs;
  gl_Position = u_matrix * vec4(a_ctr.x + pm.x * u_perM, a_ctr.y - pm.y * u_perM, a_ctr.z + pm.z, 1.0);
  vec3 col = petal ? u_cB[si] : mix(autumnCol(si, fract(ph * 13.7), 1.0), u_cBr[si], 0.3) * (0.85 + 0.3 * fract(ph * 29.3));
  vec3 cc = toneOf(col);
  float colorvalue = dot(cc, vec3(0.2126, 0.7152, 0.0722));
  float directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), 0.6);
  v_color = vec4(clamp((cc + 0.03) * directional * u_lightcolor, (cc + 0.03) * 0.45, vec3(1.0)), 1.0);
}`;

const lightRgb = (hex) => (typeof hex === "string" && /^#[0-9a-f]{6}/i.test(hex) ? rgb(hex) : [1, 1, 1]);

// 樹種の暦・色の uniform（campus3dEnv の SPECIES の順 SPECIES_ORDER）
function speciesUniforms() {
  const A = [];
  const B = [];
  const C = [];
  const D = [];
  const cG = [];
  const cY = [];
  const cA = [];
  const cA2 = [];
  const cBr = [];
  const cB = [];
  for (const k of SPECIES_ORDER) {
    const s = SPECIES[k];
    A.push(...(s.leafOut || [0, 0]), ...(s.color || [0, 0]));
    B.push(...(s.fall || [0, 0]), s.litterDays || 0, s.spread || 0);
    C.push(...(s.bloom || [0, 0, 0]), s.deciduous ? 1 : 0);
    D.push(...(s.flush || [0, 0]), ...(s.nuts || [0, 0]));
    cG.push(...rgb(s.green));
    cY.push(...rgb(s.young || s.green));
    cA.push(...rgb(s.autumn || s.green));
    cA2.push(...rgb(s.autumn2 || s.autumn || s.green));
    cBr.push(...rgb(s.brown || s.autumn || s.green));
    cB.push(...rgb(s.blossom || s.green));
  }
  return { A: new Float32Array(A), B: new Float32Array(B), C: new Float32Array(C), D: new Float32Array(D), cG: new Float32Array(cG), cY: new Float32Array(cY), cA: new Float32Array(cA), cA2: new Float32Array(cA2), cBr: new Float32Array(cBr), cB: new Float32Array(cB) };
}

/**
 * 木のレイヤー。setTrees(buildVeg の結果)・setEnv(env, look, accent) で形と状態を渡す
 */
export function createVegLayer({ exaggeration = 1 } = {}) {
  let map = null;
  let gl = null;
  let prog = null;
  let progLit = null;
  let progFall = null;
  let noiseTex = null;
  let pending = null;
  const buf = { solid: null, solidN: 0, litter: null, litterN: 0, fall: null, fallN: 0 };
  const U = speciesUniforms();
  let st = { doy: 180, tone: [0, 0, 0, 0], light: { pos: [0, 0, 1], intensity: 0.4, color: [1, 1, 1] }, wind: [1, 0, 0], snow: 0, wet: 0, accent: [0.16, 0.78, 0.4] };
  const perM = Math.hypot(PER_M.e[0], PER_M.e[1]);
  const setSpecies = (p) => {
    gl.uniform1f(p.loc("u_doy"), st.doy);
    gl.uniform4fv(p.loc("u_spA[0]"), U.A);
    gl.uniform4fv(p.loc("u_spB[0]"), U.B);
    gl.uniform4fv(p.loc("u_spC[0]"), U.C);
    gl.uniform4fv(p.loc("u_spD[0]"), U.D);
    gl.uniform3fv(p.loc("u_cG[0]"), U.cG);
    gl.uniform3fv(p.loc("u_cY[0]"), U.cY);
    gl.uniform3fv(p.loc("u_cA[0]"), U.cA);
    gl.uniform3fv(p.loc("u_cA2[0]"), U.cA2);
    gl.uniform3fv(p.loc("u_cBr[0]"), U.cBr);
    gl.uniform3fv(p.loc("u_cB[0]"), U.cB);
  };
  const layer = {
    id: VEG_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS, FS);
      progLit = compile(gl, VS_LIT, FS_LIT);
      progFall = compile(gl, VS_FALL, FS);
      noiseTex = gl.createTexture();
      const N = new Uint8Array(256 * 256 * 4);
      let seed = 777;
      for (let i = 0; i < N.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        N[i] = seed >>> 24;
      }
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, N);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    },
    onRemove() {
      if (gl) {
        if (buf.solid) gl.deleteBuffer(buf.solid);
        if (buf.litter) gl.deleteBuffer(buf.litter);
        if (buf.fall) gl.deleteBuffer(buf.fall);
        if (progFall) gl.deleteProgram(progFall.p);
        if (prog) gl.deleteProgram(prog.p);
        if (progLit) gl.deleteProgram(progLit.p);
        if (noiseTex) gl.deleteTexture(noiseTex);
      }
      map = null;
      gl = null;
    },
    render(g, args) {
      if (pending) {
        for (const k of ["solid", "litter", "fall"]) {
          if (buf[k]) gl.deleteBuffer(buf[k]);
          buf[k] = null;
          buf[`${k}N`] = 0;
          const d = pending[k];
          if (d && d.count) {
            buf[k] = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf[k]);
            gl.bufferData(gl.ARRAY_BUFFER, d.buf, gl.STATIC_DRAW);
            buf[`${k}N`] = d.count;
          }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        pending = null;
      }
      if (!buf.solidN && !buf.litterN && !buf.fallN) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      const t = (performance.now() / 1000) % 3600;
      const on = [];
      const attr = (p, name, size, type, norm, off) => {
        const a = p.att(name);
        if (a < 0) return;
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, size, type, norm, 28, off);
        on.push(a);
      };
      const common = (p) => {
        gl.useProgram(p.p);
        gl.uniformMatrix4fv(p.loc("u_matrix"), false, M);
        gl.uniform3fv(p.loc("u_lightpos"), st.light.pos);
        gl.uniform1f(p.loc("u_lightintensity"), st.light.intensity);
        gl.uniform3fv(p.loc("u_lightcolor"), st.light.color);
        gl.uniform4fv(p.loc("u_tone"), st.tone);
        gl.uniform1f(p.loc("u_perM"), perM);
        gl.uniform2f(p.loc("u_snowWet"), st.snow, st.wet);
        setSpecies(p);
      };
      if (buf.solidN) {
        common(prog);
        gl.uniform4f(prog.loc("u_wind"), st.wind[0], st.wind[1], st.wind[2], t);
        gl.uniform3fv(prog.loc("u_accent"), st.accent);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.solid);
        attr(prog, "a_pos", 3, gl.FLOAT, false, 0);
        attr(prog, "a_nrm", 4, gl.BYTE, true, 12);
        attr(prog, "a_col", 4, gl.UNSIGNED_BYTE, true, 16);
        attr(prog, "a_veg", 4, gl.UNSIGNED_BYTE, false, 20);
        attr(prog, "a_tre", 4, gl.UNSIGNED_BYTE, true, 24);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, 0, buf.solidN);
        on.forEach((a) => gl.disableVertexAttribArray(a));
        on.length = 0;
      }
      if (buf.litterN) {
        common(progLit);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        gl.uniform1i(progLit.loc("u_noise"), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.litter);
        attr(progLit, "a_pos", 3, gl.FLOAT, false, 0);
        attr(progLit, "a_veg", 4, gl.UNSIGNED_BYTE, false, 20);
        attr(progLit, "a_tre", 4, gl.UNSIGNED_BYTE, true, 24);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-2, -6);
        gl.drawArrays(gl.TRIANGLES, 0, buf.litterN);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.depthMask(true);
        on.forEach((a) => gl.disableVertexAttribArray(a));
        on.length = 0;
      }
      // 舞う落ち葉・花びら（風があるときだけ。ないときは落ちる時期でもまっすぐ少し）
      if (buf.fallN) {
        common(progFall);
        gl.uniform4f(progFall.loc("u_wind"), st.wind[0], st.wind[1], st.wind[2], t);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.fall);
        const fa = (name, size, off) => {
          const a = progFall.att(name);
          if (a < 0) return;
          gl.enableVertexAttribArray(a);
          gl.vertexAttribPointer(a, size, gl.FLOAT, false, 56, off);
          on.push(a);
        };
        fa("a_ctr", 3, 0);
        fa("a_cr", 4, 12);
        fa("a_s0", 4, 28);
        fa("a_s1", 3, 44);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, 0, buf.fallN);
        on.forEach((a) => gl.disableVertexAttribArray(a));
        on.length = 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
  layer.setTrees = (v) => {
    pending = v;
    map?.triggerRepaint();
  };
  // 状態：env（campus3dEnv の envAt）・look（campus3dSky の lookFor）・選んだ木の色
  layer.setEnv = (env, look, accent) => {
    const W = env?.weather || {};
    const known = W && W.src !== "unknown";
    const to = (((Number(W.windDir) || 0) + 180) % 360) * DEG; // 吹いていく向き
    st = {
      doy: env?.doy ?? st.doy,
      tone: look ? [look.f.warm || 0, look.f.twilight || 0, look.f.night || 0, look.f.gloom || 0] : st.tone,
      light: look ? { pos: lightVector(look.light.position), intensity: look.light.intensity, color: lightRgb(look.light.color) } : st.light,
      // 風：観測がない（不明）ときも、木はかすかにゆれる（演出。1m/s）
      wind: [Math.sin(to), -Math.cos(to), known ? Math.max(0, Number(W.wind) || 0) : 1],
      snow: known ? Math.min(1, Math.max(0, W.snowCover || 0)) : 0,
      wet: known ? Math.min(1, Math.max(0, W.wet || 0)) : 0,
      accent: accent ? lightRgb(accent) : st.accent,
    };
    map?.triggerRepaint();
  };
  return layer;
}
