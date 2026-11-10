// 空（デジタルツインの芯 3 の描き方。2026-11-10）：MapLibre の独自レイヤーで、いちばん下に画面いっぱいの空を描く（地形・建物はその上）。
// 空の色＝大気の 1 回散乱（レイリー・ミー・オゾン）を JS で計算した表（見る高さ × 太陽からの方位の差）。太陽の高さが変わったら作り直す。
// その上に、太陽（大気を通った色・まわりの光）、月（太陽の向きから満ち欠け）、星（地球の回転どおりに回る。並びは作りもの）、
// 雲（量・暗さ・種類・風で流れる）、霧（見通し）、稲光。夜は街の明かりで空の下のほうと雲の底が明るい（東京）。
// 状態は campus3dEnv の envAt（setEnv）。DOM は使わない
import { PER_M, compile, matrixFor } from "./campus3dLayer.js";
import { BOLT_SEGS, dirOf, lightningCreate, lightningStep } from "./campus3dEnv.js";

export const SKY_LAYER_ID = "cb-sky";
const DEG = Math.PI / 180;

// ── 大気（地上 40m から見る）──
const R_E = 6360e3;
const R_A = 6460e3;
const OBS = 40;
const H_R = 8000;
const H_M = 1200;
const B_R = [5.802e-6, 13.558e-6, 33.1e-6]; // レイリー散乱（m⁻¹）
// オゾンの吸収（薄明の天頂の青）。赤は 3 色の幅の中にシャピュイ帯の山（600nm あたり）が入るので 0.65 → 1.6 に（−2〜−6° の天頂が紫でなく紺になる）
const B_O = [1.6e-6, 1.881e-6, 0.085e-6];
const MIE_S = 3.996e-6; // ミー散乱（にごり 1 のとき）
const MIE_E = 4.4e-6;
const G = 0.8; // ミーの前方散乱
const E_SUN = 22; // 太陽の明るさ（色を出すときの目安）
const dens = (h) => [Math.exp(-h / H_R), Math.exp(-h / H_M), Math.max(0, 1 - Math.abs(h - 25000) / 15000)];

// 透過率の表：高さ h（0〜100km。2 乗で下を細かく）× 太陽の天頂角の cos mu（-0.25〜1）
const TH = 40;
const TMU = 80;
const MU0 = -0.25;
function buildTrans(turb) {
  const T = new Float32Array(TH * TMU * 3);
  for (let i = 0; i < TH; i++) {
    const h = ((i / (TH - 1)) ** 2) * (R_A - R_E);
    const r = R_E + h;
    for (let j = 0; j < TMU; j++) {
      const mu = MU0 + ((1 - MU0) * j) / (TMU - 1);
      // 地面に当たる向きは 0
      const disc = r * r * (mu * mu - 1) + R_E * R_E;
      const o = (i * TMU + j) * 3;
      if (mu < 0 && disc > 0) {
        T[o] = T[o + 1] = T[o + 2] = 0;
        continue;
      }
      const b = r * mu;
      const L = -b + Math.sqrt(Math.max(0, b * b - (r * r - R_A * R_A)));
      const N = 24;
      let tr = 0;
      let tm = 0;
      let to = 0;
      for (let k = 0; k < N; k++) {
        const t = ((k + 0.5) / N) * L;
        const hh = Math.sqrt(r * r + t * t + 2 * r * t * mu) - R_E;
        const d = dens(Math.max(0, hh));
        tr += d[0];
        tm += d[1];
        to += d[2];
      }
      const ds = L / N;
      for (let c = 0; c < 3; c++) T[o + c] = Math.exp(-(B_R[c] * tr + MIE_E * turb * tm + B_O[c] * to) * ds);
    }
  }
  return T;
}
function transAt(T, h, mu) {
  const fi = Math.sqrt(Math.min(1, Math.max(0, h / (R_A - R_E)))) * (TH - 1);
  const fj = ((Math.min(1, Math.max(MU0, mu)) - MU0) / (1 - MU0)) * (TMU - 1);
  const i0 = Math.min(TH - 2, Math.floor(fi));
  const j0 = Math.min(TMU - 2, Math.floor(fj));
  const a = fi - i0;
  const b = fj - j0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v00 = T[(i0 * TMU + j0) * 3 + c];
    const v01 = T[(i0 * TMU + j0 + 1) * 3 + c];
    const v10 = T[((i0 + 1) * TMU + j0) * 3 + c];
    const v11 = T[((i0 + 1) * TMU + j0 + 1) * 3 + c];
    out[c] = (v00 * (1 - b) + v01 * b) * (1 - a) + (v10 * (1 - b) + v11 * b) * a;
  }
  return out;
}

// 多重散乱（Hillaire 2020 の近似）：高さ h × 太陽の天頂角の cos mu ごとに、何度も散った光（等方とみなす）の量 Ψ。
// 1 回散乱だけだと夕暮れ（太陽が -2〜-8°）の空が暗すぎる。地面（都市、反射 0.2）で返る光も入れる
const MH = 20;
const MMU = 28;
const MMU0 = -0.35;
const ALBEDO = 0.2;
const FIB = (() => {
  const n = 48;
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([Math.cos(i * ga) * r, Math.sin(i * ga) * r, z]);
  }
  return out;
})();
function buildMulti(T, turb) {
  const out = new Float32Array(MH * MMU * 3);
  const NS = 12;
  for (let i = 0; i < MH; i++) {
    const h = ((i / (MH - 1)) ** 2) * (R_A - R_E);
    const r = R_E + h;
    for (let j = 0; j < MMU; j++) {
      const mu = MMU0 + ((1 - MMU0) * j) / (MMU - 1);
      const sd = [Math.sqrt(Math.max(0, 1 - mu * mu)), 0, mu];
      const L2 = [0, 0, 0];
      const fms = [0, 0, 0];
      for (const w of FIB) {
        const b = r * w[2];
        const dg = b * b - (r * r - R_E * R_E);
        const ground = w[2] < 0 && dg > 0;
        const tmax = ground ? -b - Math.sqrt(dg) : -b + Math.sqrt(Math.max(0, b * b - (r * r - R_A * R_A)));
        const ds = tmax / NS;
        const tau = [0, 0, 0];
        for (let k = 0; k < NS; k++) {
          const t = (k + 0.5) * ds;
          const p = [w[0] * t, w[1] * t, r + w[2] * t];
          const rp = Math.hypot(p[0], p[1], p[2]);
          const hp = Math.max(0, rp - R_E);
          const d = dens(hp);
          const mus = (p[0] * sd[0] + p[2] * sd[2]) / rp;
          const ts = transAt(T, hp, mus);
          for (let c = 0; c < 3; c++) {
            const ss = B_R[c] * d[0] + MIE_S * turb * d[1];
            const se = B_R[c] * d[0] + MIE_E * turb * d[1] + B_O[c] * d[2];
            const tr = Math.exp(-(tau[c] + (se * ds) / 2));
            L2[c] += (tr * ss * ts[c] * ds) / (4 * Math.PI);
            fms[c] += tr * ss * ds;
            tau[c] += se * ds;
          }
        }
        if (ground) {
          const gp = [w[0] * tmax, w[1] * tmax, r + w[2] * tmax];
          const gr = Math.hypot(gp[0], gp[1], gp[2]);
          const mug = (gp[0] * sd[0] + gp[2] * sd[2]) / gr;
          if (mug > 0) {
            const tg = transAt(T, 0, mug);
            for (let c = 0; c < 3; c++) L2[c] += (Math.exp(-tau[c]) * tg[c] * mug * ALBEDO) / Math.PI;
          }
        }
      }
      const o = (i * MMU + j) * 3;
      for (let c = 0; c < 3; c++) {
        // 球の積分（等方の位相 1/4π × 1 本あたり 4π/本数）。何度でも散る分は 1/(1 - f) の等比級数
        const l2 = L2[c] / FIB.length;
        const f = fms[c] / FIB.length;
        out[o + c] = l2 / Math.max(0.05, 1 - f);
      }
    }
  }
  return out;
}
function multiAt(Mt, h, mu) {
  const fi = Math.sqrt(Math.min(1, Math.max(0, h / (R_A - R_E)))) * (MH - 1);
  const fj = ((Math.min(1, Math.max(MMU0, mu)) - MMU0) / (1 - MMU0)) * (MMU - 1);
  const i0 = Math.min(MH - 2, Math.floor(fi));
  const j0 = Math.min(MMU - 2, Math.floor(fj));
  const a = fi - i0;
  const b = fj - j0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v00 = Mt[(i0 * MMU + j0) * 3 + c];
    const v01 = Mt[(i0 * MMU + j0 + 1) * 3 + c];
    const v10 = Mt[((i0 + 1) * MMU + j0) * 3 + c];
    const v11 = Mt[((i0 + 1) * MMU + j0 + 1) * 3 + c];
    out[c] = (v00 * (1 - b) + v01 * b) * (1 - a) + (v10 * (1 - b) + v11 * b) * a;
  }
  return out;
}

const SW = 64; // 太陽からの方位の差 0〜180°
const SH = 48; // 見る高さ 0〜90°（平方根で地平線の近くを細かく）
const PHASE_R = (c) => (3 / (16 * Math.PI)) * (1 + c * c);
const PHASE_M = (c) => ((3 / (8 * Math.PI)) * ((1 - G * G) * (1 + c * c))) / ((2 + G * G) * Math.pow(1 + G * G - 2 * G * c, 1.5));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 目の慣れ（太陽が沈むほど明るく見せる）：薄明の空は昼の 1 万分の 1 ほどの明るさ。太陽の高さ（度）ごとの log10 の露出を直線でつなぐ
const EXPOSURE = [[90, 0], [8, 0], [0, 0.35], [-3, 1.1], [-6, 1.8], [-9, 2.3], [-12, 2.6], [-90, 2.6]];
export function exposureAt(el) {
  for (let i = 0; i < EXPOSURE.length - 1; i++) {
    const [a, la] = EXPOSURE[i];
    const [b, lb] = EXPOSURE[i + 1];
    if (el <= a && el >= b) return 10 ** (la + ((lb - la) * (el - a)) / (b - a));
  }
  return 10 ** EXPOSURE[el > 0 ? 0 : EXPOSURE.length - 1][1];
}
// 夜の街の明かり（東京の空。地平線のほうが明るい茶色）。見る高さ e（度）。sRGB 0〜1。演出（推定）
export function cityGlow(e) {
  const k = Math.exp(-Math.max(0, e) / 14);
  return [0.07 + 0.17 * k, 0.075 + 0.12 * k, 0.11 + 0.07 * k];
}
const toneMap = (x, ex) => 1 - Math.exp(-x * ex);
const toSrgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/**
 * 太陽の高さ sunEl（度）の空の表（RGBA 8bit、SW × SH）と、太陽の色（地上で）・天頂・地平線の平均の色（sRGB 0〜1）
 */
export function skyTable(sunEl, { turbidity = 1.6, T = null, Mt = null, gain = 1, exposure = null } = {}) {
  const Tt = T || buildTrans(turbidity);
  const Mm = Mt || buildMulti(Tt, turbidity);
  const night = smooth(-6, -16, sunEl);
  const ex = (exposure ?? exposureAt(sunEl)) * gain;
  const s = [0, Math.cos(sunEl * DEG), Math.sin(sunEl * DEG)];
  const P0 = [0, 0, R_E + OBS];
  const data = new Uint8Array(SW * SH * 4);
  const lin = new Float32Array(SW * SH * 3);
  const N = 22;
  for (let yi = 0; yi < SH; yi++) {
    const e = ((yi / (SH - 1)) ** 2) * 90 * DEG;
    for (let xi = 0; xi < SW; xi++) {
      const ph = (xi / (SW - 1)) * Math.PI;
      const v = [Math.cos(e) * Math.sin(ph), Math.cos(e) * Math.cos(ph), Math.sin(e)];
      const b = P0[2] * v[2];
      const L = -b + Math.sqrt(b * b - (P0[2] * P0[2] - R_A * R_A));
      const cth = v[0] * s[0] + v[1] * s[1] + v[2] * s[2];
      const pr = PHASE_R(cth);
      const pm = PHASE_M(cth);
      let tr = 0;
      let tm = 0;
      let to = 0;
      const acc = [0, 0, 0];
      for (let k = 0; k < N; k++) {
        const ta = L * (k / N) ** 2;
        const tb = L * ((k + 1) / N) ** 2;
        const ds = tb - ta;
        const t = (ta + tb) / 2;
        const p = [v[0] * t, v[1] * t, P0[2] + v[2] * t];
        const r = Math.hypot(p[0], p[1], p[2]);
        const h = Math.max(0, r - R_E);
        const d = dens(h);
        tr += d[0] * ds;
        tm += d[1] * ds;
        to += d[2] * ds;
        const mus = (p[0] * s[0] + p[1] * s[1] + p[2] * s[2]) / r;
        const ts = transAt(Tt, h, mus);
        const ms = multiAt(Mm, h, mus);
        for (let c = 0; c < 3; c++) {
          const tv = Math.exp(-(B_R[c] * tr + MIE_E * turbidity * tm + B_O[c] * to));
          const sr = B_R[c] * d[0];
          const sm = MIE_S * turbidity * d[1];
          acc[c] += tv * (ts[c] * (sr * pr + sm * pm) + (sr + sm) * ms[c]) * ds;
        }
      }
      const o = (yi * SW + xi) * 3;
      for (let c = 0; c < 3; c++) lin[o + c] = acc[c] * E_SUN;
    }
  }
  // 色（目の慣れ → sRGB）＋夜の街の明かり
  let zen = [0, 0, 0];
  let hor = [0, 0, 0];
  for (let yi = 0; yi < SH; yi++) {
    const e = ((yi / (SH - 1)) ** 2) * 90;
    const glow = cityGlow(e);
    for (let xi = 0; xi < SW; xi++) {
      const o = (yi * SW + xi) * 3;
      const q = (yi * SW + xi) * 4;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(1, toSrgb(toneMap(lin[o + c], ex)) + glow[c] * night);
        data[q + c] = Math.round(v * 255);
        if (yi === SH - 1) zen[c] += v / SW;
        if (yi <= 2) hor[c] += v / (SW * 3);
      }
      data[q + 3] = 255;
    }
  }
  // 地上での太陽の色（大気を通ったあと）
  const ts = transAt(Tt, OBS, Math.sin(sunEl * DEG));
  const mx = Math.max(ts[0], ts[1], ts[2], 1e-6);
  const sunColor = ts.map((v) => toSrgb(Math.min(1, v / mx)));
  const sunPower = Math.min(1, (ts[0] + ts[1] + ts[2]) / 3 / 0.75); // 白いほど強い（沈むと 0）
  return { data, W: SW, H: SH, sunColor, sunPower, zenith: zen, horizon: hor, T: Tt, Mt: Mm };
}
// にごり（ミー散乱の多さ）ごとの表（透過率・多重散乱）
export function atmosphere(turbidity) {
  const T = buildTrans(turbidity);
  return { T, Mt: buildMulti(T, turbidity), turbidity };
}

// ── シェーダー ──
const VS = `
attribute vec2 a_ndc;
attribute vec3 a_dir;
varying vec3 v_dir;
void main() { v_dir = a_dir; gl_Position = vec4(a_ndc, 0.9999, 1.0); }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 v_dir;
uniform sampler2D u_lut;
uniform vec2 u_lutSize;
uniform vec3 u_sun;
uniform vec3 u_sunCol;
uniform float u_sunPow;
uniform vec3 u_moon;
uniform float u_moonVis;
uniform float u_night;
uniform mat3 u_starM;
uniform float u_pix;
uniform vec4 u_cloud;   // 量・暗さ・種類（0 積雲 1 層雲 2 巻雲 3 積乱雲）・雲の底の高さ（km）
uniform vec2 u_wind;    // 雲の流れた量（km）
uniform vec3 u_ambient; // 雲を下から照らす空の色
uniform vec3 u_glow;    // 夜の街の明かり（雲の底）
uniform vec3 u_fog;     // 霧・もやの色
uniform float u_fogAmt; // 空全体の霧（見通しが短いほど 1）
uniform float u_haze;   // 地平線のもや
uniform float u_flash;  // 稲光の明るさ（0〜1.6）
uniform vec4 u_flashDir; // 光った向き（東・北・上）・照らす広がり（ラジアン。近いほど空いっぱい）
uniform vec4 u_flashPos; // 光ったところ（東・北 km）・雲の底を照らす広がりの高さ（km。雲の中の光は広い）・雲の明るさの倍率
uniform vec4 u_bolt;     // 落雷の光の道：方位（ラジアン）・明るさ・幹の線の本数・太さ（画素。近いほど太い）
uniform vec4 u_boltBox;  // 光の道のある範囲：横の角の最小・最大、高さの角の最小・最大（ラジアン）
uniform vec4 u_seg[${BOLT_SEGS}]; // 光の道の線（横の角・高さの角の 2 点）
uniform float u_starCut; // これより暗い星は見えない（月・街の明かり）
const float PI = 3.14159265;
uniform sampler2D u_noise; // 乱数（256×256、くり返し）
float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
// 値のノイズ：乱数のテクスチャを、升の中はなめらか（smoothstep）に補間して引く（式で作る乱数は大きな座標で桁が落ち、雲に直線のずれが出た）
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return texture2D(u_noise, (i + f + 0.5) / 256.0).r;
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
// 星：天球に固定した向き q を立方体の面の升目に分け、升ごとに星をひとつ（明るさ・色は升で決まる）
vec3 stars(vec3 q) {
  vec3 a = abs(q);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = q.yz / a.x; face = q.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = q.xz / a.y; face = q.y > 0.0 ? 2.0 : 3.0; }
  else { uv = q.xy / a.z; face = q.z > 0.0 ? 4.0 : 5.0; }
  float N = 70.0;
  vec2 g = (uv * 0.5 + 0.5) * N;
  vec2 cell = floor(g);
  float h = hash3(vec3(cell, face));
  if (h > 0.34) return vec3(0.0);
  vec2 c = cell + 0.2 + 0.6 * vec2(hash3(vec3(cell, face + 7.0)), hash3(vec3(cell, face + 13.0)));
  float px = u_pix * N * 0.5 * max(a.x, max(a.y, a.z)); // 1 画素が升でいくつか
  float d = length(g - c) / max(px, 1e-4);
  float mag = pow(hash3(vec3(cell, face + 3.0)), 6.0); // 明るい星は少ない
  float b = exp(-d * d * 0.9) * max(0.0, mag * 2.2 - u_starCut) / (1.0 - u_starCut * 0.4);
  float t = hash3(vec3(cell, face + 21.0));
  vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), t);
  return col * b;
}
void main() {
  vec3 d = normalize(v_dir);
  float el = asin(clamp(d.z, -1.0, 1.0));
  // 空の表
  vec2 hz = d.xy + vec2(1e-6, 0.0);
  vec2 sh = u_sun.xy + vec2(1e-6, 0.0);
  float rel = acos(clamp(dot(normalize(hz), normalize(sh)), -1.0, 1.0)) / PI;
  float ev = sqrt(clamp(el, 0.0, PI * 0.5) / (PI * 0.5));
  vec2 uv = (vec2(rel, ev) * (u_lutSize - 1.0) + 0.5) / u_lutSize;
  vec3 sky = texture2D(u_lut, uv).rgb;
  // 地平線より下（地形の外の遠く）：もやの色へ
  sky = mix(sky, u_fog, smoothstep(0.0, -0.06, d.z));
  // 地平線のもや（見通しが短いほど高くまで）
  sky = mix(sky, u_fog, u_haze * exp(-max(d.z, 0.0) * 9.0));
  // 星（夜。雲・霧で消える）
  if (u_night > 0.02) sky += stars(u_starM * d) * u_night * (1.0 - u_fogAmt) * (1.0 - u_cloud.x);
  // 月（太陽の向きから明るい側。昼は淡く）
  float mr = 0.0046;
  float mc = dot(d, u_moon);
  if (mc > cos(mr * 3.0) && u_moonVis > 0.0) {
    vec3 up = abs(u_moon.z) < 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 rt = normalize(cross(u_moon, up));
    vec3 u2 = cross(rt, u_moon);
    vec2 o = vec2(dot(d, rt), dot(d, u2)) / tan(mr);
    float r2 = dot(o, o);
    if (r2 < 1.0) {
      vec3 n = rt * o.x + u2 * o.y - u_moon * sqrt(1.0 - r2);
      float lit = clamp(dot(n, u_sun) * 1.4 + 0.05, 0.0, 1.0);
      float edge = smoothstep(1.0, 0.92, r2);
      vec3 mcol = vec3(0.96, 0.94, 0.88) * (0.04 + 0.96 * lit) * (0.9 + 0.1 * noise(o * 4.0 + 3.0));
      sky = mix(sky, max(sky, mcol), edge * u_moonVis);
    }
    sky += vec3(0.6, 0.65, 0.75) * exp(-acos(clamp(mc, -1.0, 1.0)) * 40.0) * 0.12 * u_moonVis * u_night;
  }
  // 太陽（円盤・まわりの光）
  float sc = dot(d, u_sun);
  float sa = acos(clamp(sc, -1.0, 1.0));
  float sr = 0.00465;
  float disc = smoothstep(sr + u_pix, sr - u_pix, sa);
  float limb = 1.0 - 0.55 * (1.0 - sqrt(max(0.0, 1.0 - (sa / sr) * (sa / sr))));
  float above = smoothstep(-0.01, 0.004, u_sun.z);
  vec3 sunDisc = mix(u_sunCol, vec3(1.0, 0.98, 0.92), u_sunPow * 0.6) * limb * 1.6;
  vec3 halo = u_sunCol * (exp(-sa * 55.0) * 0.45 + exp(-sa * 9.0) * 0.12) * above * (0.4 + 0.6 * u_sunPow);
  sky = mix(sky, sunDisc, disc * above);
  sky += halo;
  // 稲光：光った向きのまわりほど明るい（近い雷は空いっぱい、遠い雷は地平線の一部）
  // fg：空気（雨・もや）の光は向きのまわり。cgl：雲の底（1.2km）の、その向きに見える点が、光ったところからどれだけ近いか（近い雷なら頭の上も明るい）
  float fg = 0.0;
  float cgl = 0.0;
  if (u_flash > 0.001) {
    float fa = acos(clamp(dot(d, u_flashDir.xyz), -1.0, 1.0));
    fg = exp(-fa * fa / (2.0 * u_flashDir.w * u_flashDir.w));
    float hz = length(d.xy) + 1e-5;
    vec2 P = d.xy / hz * (1.2 / max(d.z / hz, 0.03));
    vec2 dp = P - u_flashPos.xy;
    float s2 = u_flashPos.z * u_flashPos.z;
    cgl = pow(s2 / (dot(dp, dp) + s2), 0.6) * u_flashPos.w;
  }
  // 雲
  float dens = 0.0;
  if (u_cloud.x > 0.001 && d.z > -0.02) {
    float zz = max(d.z, 0.035);
    vec2 p = d.xy * (u_cloud.w / zz) + u_wind;
    // 地平線の近くは雲の面がつぶれてノイズが縦に伸びる（縦じま）ので、平均の濃さに寄せる
    float low = smoothstep(0.012, 0.09, d.z);
    float n = mix(0.5, fbm(p * 0.55), low);
    float type = u_cloud.z;
    float cover = u_cloud.x;
    if (type < 0.5) {
      float thr = mix(0.74, 0.3, cover);
      dens = smoothstep(thr, thr + 0.16, n);
    }
    else if (type < 1.5) dens = clamp(cover * (0.86 + 0.42 * (n - 0.5)), 0.0, 1.0);
    else if (type < 2.5) {
      float n2 = fbm(vec2(p.x * 0.22, p.y * 1.5) * 0.45 + 5.0);
      float thr = mix(0.72, 0.36, cover);
      dens = smoothstep(thr, thr + 0.3, n2) * 0.6;
    } else dens = clamp(smoothstep(mix(0.62, 0.3, cover), 0.7, n) * 0.6 + cover * 0.45, 0.0, 1.0);
    // 遠く（地平線の近く）の雲は空の色に溶ける。量が多い（くもり）なら地平線まで
    float far = smoothstep(0.0, 0.16, d.z);
    dens *= mix(cover * cover, 1.0, far) * smoothstep(-0.012, 0.012, d.z);
    // 光：太陽の側は明るく（縁が光る）、太陽へ向かって雲が濃いところは陰。下からは空の色、夜は街の明かり
    float n2s = mix(0.5, fbm((p + u_sun.xy * 0.45) * 0.55), low);
    float self = clamp(1.0 - (n2s - n) * 2.8, 0.35, 1.25);
    float toward = max(sc, 0.0);
    float silver = pow(toward, 10.0) * 1.4 * (1.0 - u_cloud.y);
    float sunUp = smoothstep(-0.05, 0.08, u_sun.z);
    vec3 lit = u_sunCol * (0.72 * self + silver) * sunUp * mix(0.35, 1.0, u_sunPow) + u_ambient * 0.8;
    vec3 col = mix(lit, lit * vec3(0.33, 0.34, 0.37), u_cloud.y) + u_glow * u_night * 1.1;
    // 稲光：雲の中から照らす（雲の濃さのむらで明るさもむら）
    col += vec3(0.8, 0.84, 1.0) * u_flash * (0.04 + 0.6 * cgl) * (0.5 + 0.5 * dens) * (0.7 + 0.6 * n);
    sky = mix(sky, col, dens);
  }
  // 落雷の光の道（雲の底から地面まで。下のほうは建物・地形が上に描かれて隠れる）
  if (u_bolt.y > 0.003) {
    float bel = asin(clamp(d.z, -1.0, 1.0));
    float bx = mod(atan(d.x, d.y) - u_bolt.x + PI, 2.0 * PI) - PI;
    bx *= cos(bel);
    if (bx > u_boltBox.x && bx < u_boltBox.y && bel > u_boltBox.z && bel < u_boltBox.w) {
      vec2 q = vec2(bx, bel);
      float core = 0.0;
      float glow = 0.0;
      for (int i = 0; i < ${BOLT_SEGS}; i++) {
        vec4 s = u_seg[i];
        vec2 ab = s.zw - s.xy;
        float h = clamp(dot(q - s.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
        float dd = length(q - s.xy - ab * h);
        float w = float(i) < u_bolt.z ? 1.0 : 0.5;
        float cw = u_pix * u_bolt.w;
        core = max(core, w * exp(-dd * dd / (cw * cw * 0.9)));
        glow = max(glow, w * exp(-dd / (cw * 5.0)));
      }
      sky += vec3(0.88, 0.88, 1.0) * u_bolt.y * (core * 1.5 + glow * 0.35);
    }
  }
  // 霧（見通しが短いと空全体が霧の色。太陽はぼんやり）
  sky = mix(sky, u_fog + u_sunCol * exp(-sa * 6.0) * 0.25 * above * u_sunPow, u_fogAmt);
  // 稲光が雨・霧の空気を照らす
  sky += vec3(0.75, 0.78, 0.95) * u_flash * mix(0.02 + 0.12 * fg, 0.3, u_fogAmt);
  gl_FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}`;

// 4×4 の逆行列（列優先。float64 で）
function invert4(m) {
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
  if (Math.abs(det) < 1e-30) return null;
  return inv.map((v) => v / det);
}
const xform = (m, v) => [0, 1, 2, 3].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]);
// 描く座標の向き（x, y はメルカトルの差 × MERC_SCALE、z は m）→ 東・北・上（m）
const PM_DET = PER_M.e[0] * PER_M.n[1] - PER_M.e[1] * PER_M.n[0];
const toENU = (dx, dy, dz) => [(dx * PER_M.n[1] - dy * PER_M.n[0]) / PM_DET, (PER_M.e[0] * dy - PER_M.e[1] * dx) / PM_DET, dz];
// 画面の点（NDC）を通る視線（東・北・上。手前の面から奥の面までの差＝長さはそろえない）。この差は画面の上で直線的に変わるので、
// 三角形の角に置いて補間できる（長さを 1 にした向きを補間すると、まん中の向きがゆがむ）
export function rayVec(inv, x, y) {
  const a = xform(inv, [x, y, -1, 1]);
  const b = xform(inv, [x, y, 1, 1]);
  const pa = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  const pb = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  return toENU(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
}
// 画面の点を通る視線の向き（長さ 1）
export function rayDir(inv, x, y) {
  const d = rayVec(inv, x, y);
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return d.map((v) => v / l);
}

const CLOUD_TYPE = { cumulus: 0, stratus: 1, cirrus: 2, cumulonimbus: 3 };
const hexRgb = (h) => {
  const n = parseInt(String(h).slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * 空のレイヤー。setEnv(env) で状態（campus3dEnv の envAt）を渡す。いちばん下に足す（地形・建物がその上）
 */
export function createSkyLayer() {
  let map = null;
  let gl = null;
  let prog = null;
  let tex = null;
  let noiseTex = null;
  let ndcBuf = null;
  let dirBuf = null;
  let env = null;
  let table = null;
  let tableKey = "";
  let T = null;
  let dirty = true;
  const wind = [0, 0];
  let lastT = 0;
  // 雷（campus3dEnv の lightningStep）。光の道の線は使わない分を遠くに置く
  const L = lightningCreate();
  const segBuf = new Float32Array(BOLT_SEGS * 4).fill(10);
  let segOf = null;
  const NDC = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const layer = {
    id: SKY_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS, FS);
      ndcBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ndcBuf);
      gl.bufferData(gl.ARRAY_BUFFER, NDC, gl.STATIC_DRAW);
      dirBuf = gl.createBuffer();
      tex = gl.createTexture();
      // 雲の乱数のテクスチャ（毎回同じ乱数）
      noiseTex = gl.createTexture();
      const N = new Uint8Array(256 * 256 * 4);
      let seed = 12345;
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
      dirty = true;
    },
    onRemove() {
      if (gl) {
        if (prog) gl.deleteProgram(prog.p);
        if (ndcBuf) gl.deleteBuffer(ndcBuf);
        if (dirBuf) gl.deleteBuffer(dirBuf);
        if (tex) gl.deleteTexture(tex);
        if (noiseTex) gl.deleteTexture(noiseTex);
      }
      map = null;
      gl = null;
    },
    render(g, args) {
      if (!env || !table || !map) return;
      // 雷は空が見えないとき（真上から見ている）も進める（建物の光に使う）
      const now = performance.now();
      const W = env.weather || {};
      lightningStep(L, W, now);
      layer.flash = L.level;
      layer.strike = L.strike ? { kind: L.strike.kind, az: L.strike.az, el: L.strike.el, dist: L.strike.dist } : null;
      layer.lightning = L;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, 1);
      const inv = invert4(M);
      if (!inv) return;
      const corners = [[-1, -1], [3, -1], [-1, 3]];
      const raw = corners.map(([x, y]) => rayVec(inv, x, y));
      const k = 1 / (Math.max(...raw.map((d) => Math.hypot(d[0], d[1], d[2]))) || 1); // 大きさだけそろえる（向きの比はそのまま）
      const dirs = raw.map((d) => d.map((v) => v * k));
      // 画面の上の端がずっと地平線より下（真上から見ている）なら空は見えない
      const top = [rayDir(inv, -1, 1), rayDir(inv, 1, 1), rayDir(inv, 0, 1)];
      layer.visible = top.some((d) => d[2] > -0.08);
      if (!layer.visible) return;
      if (dirty) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, table.W, table.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        dirty = false;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, dirBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dirs.flat()), gl.DYNAMIC_DRAW);
      // 雲の流れ（時間で進める）
      const dt = lastT ? Math.min(0.2, (now - lastT) / 1000) : 0;
      lastT = now;
      const wv = Number(W.wind) || 0;
      const wd = ((Number(W.windDir) || 0) + 180) * DEG; // 吹いていく向き
      const sp = (wv * 2.2 * dt) / 1000; // 上空は地上より速い（km）
      wind[0] = (wind[0] + Math.sin(wd) * sp) % 1000;
      wind[1] = (wind[1] + Math.cos(wd) * sp) % 1000;
      // 稲光：光った向き・広がり、落雷なら光の道（霧・雨の見通しで遠いほど見えにくい）
      const S = L.strike;
      const flashDir = S ? [...dirOf({ elevation: S.el, azimuth: S.az }), Math.atan2(4, S.dist)] : [0, 0, 1, 1];
      const flashPos = S ? [S.dist * Math.sin(S.az * DEG), S.dist * Math.cos(S.az * DEG), S.kind === "ic" ? 2.5 : 1.2, S.kind === "ic" ? 1.3 : 1] : [0, 0, 1, 0];
      let bolt = [0, 0, 0, 0];
      let box = [0, 0, 0, 0];
      if (S && S.segs && L.channel > 0.003) {
        if (segOf !== S) {
          segOf = S;
          segBuf.fill(10);
          S.segs.slice(0, BOLT_SEGS).forEach((s, i) => segBuf.set(s, i * 4));
        }
        const xs = S.segs.flatMap((s) => [s[0], s[2]]);
        const ys = S.segs.flatMap((s) => [s[1], s[3]]);
        const pad = 0.03;
        box = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
        const vis = Math.max(100, Number(W.fog) || 30000) / 1000;
        const seen = Math.exp(-S.dist / (4 * vis)) * Math.min(1, Math.sqrt(6 / S.dist));
        bolt = [S.az * DEG, L.channel * seen, S.mainN, Math.min(3, Math.max(1, 6 / S.dist))];
      }
      const p = prog;
      gl.useProgram(p.p);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(p.loc("u_lut"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      gl.uniform1i(p.loc("u_noise"), 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(p.loc("u_lutSize"), table.W, table.H);
      const u = layer.uniforms;
      gl.uniform3fv(p.loc("u_sun"), u.sun);
      gl.uniform3fv(p.loc("u_sunCol"), u.sunCol);
      gl.uniform1f(p.loc("u_sunPow"), u.sunPow);
      gl.uniform3fv(p.loc("u_moon"), u.moon);
      gl.uniform1f(p.loc("u_moonVis"), u.moonVis);
      gl.uniform1f(p.loc("u_night"), u.night);
      gl.uniformMatrix3fv(p.loc("u_starM"), false, u.starM);
      gl.uniform1f(p.loc("u_pix"), ((map.transform.fov || 37) * DEG) / Math.max(1, map.getCanvas().clientHeight));
      gl.uniform4fv(p.loc("u_cloud"), u.cloud);
      gl.uniform2f(p.loc("u_wind"), wind[0], wind[1]);
      gl.uniform3fv(p.loc("u_ambient"), u.ambient);
      gl.uniform3fv(p.loc("u_glow"), u.glow);
      gl.uniform3fv(p.loc("u_fog"), u.fog);
      gl.uniform1f(p.loc("u_fogAmt"), u.fogAmt);
      gl.uniform1f(p.loc("u_haze"), u.haze);
      gl.uniform1f(p.loc("u_flash"), L.level);
      gl.uniform4fv(p.loc("u_flashDir"), flashDir);
      gl.uniform4fv(p.loc("u_flashPos"), flashPos);
      gl.uniform4fv(p.loc("u_bolt"), bolt);
      gl.uniform4fv(p.loc("u_boltBox"), box);
      gl.uniform4fv(p.loc("u_seg[0]"), segBuf);
      gl.uniform1f(p.loc("u_starCut"), u.starCut);
      const an = p.att("a_ndc");
      const ad = p.att("a_dir");
      gl.bindBuffer(gl.ARRAY_BUFFER, ndcBuf);
      gl.enableVertexAttribArray(an);
      gl.vertexAttribPointer(an, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dirBuf);
      gl.enableVertexAttribArray(ad);
      gl.vertexAttribPointer(ad, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(an);
      gl.disableVertexAttribArray(ad);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    },
  };
  // 状態を渡す。太陽の高さが 0.15° 変わるか、にごりが変わったら空の表を作り直す
  layer.setEnv = (e) => {
    env = e;
    const W = e.weather || {};
    const fogM = Number(W.fog) || 30000;
    // にごり：晴れて見通しがよいと 1.5、もや・霧ほど大きい（0.25 ずつ。変わると表を作り直す 80ms ほど）
    const turb = Math.round((1.5 + 2.5 * Math.min(1, Math.max(0, (20000 - fogM) / 18000))) * 4) / 4;
    const key = `${Math.round(e.sun.elevation / 0.15)}|${turb}`;
    if (key !== tableKey) {
      if (!T || T.turbidity !== turb) T = atmosphere(turb);
      table = skyTable(e.sun.elevation, { turbidity: turb, T: T.T, Mt: T.Mt });
      tableKey = key;
      dirty = true;
    }
    const sunEl = e.sun.elevation;
    const night = smooth(-4, -14, sunEl);
    const cloud = Math.min(1, Math.max(0, Number(W.cloud) || 0));
    const dark = Math.min(1, Math.max(0, Number(W.dark) || 0));
    // 霧：見通し fog m（1km より短いと空全体）
    const vis = fogM;
    const fogAmt = Math.min(1, Math.max(0, (1500 - vis) / 1300)) ** 0.8;
    const haze = Math.min(1, Math.max(0, 1 - Math.log10(Math.max(vis, 100)) / 4.4)) * 0.9;
    // 霧・もやの色：昼は白っぽい灰色（雲が暗いほど暗い）、夕方は地平線の色、夜は街の明かりの色
    const dayFog = lerp3([0.8, 0.82, 0.84], [0.5, 0.52, 0.55], dark);
    let fog = lerp3(dayFog, table.horizon, 0.35);
    fog = lerp3(fog, lerp3(table.horizon, [0.95, 0.75, 0.6], 0.2), smooth(12, 0, sunEl) * (1 - night));
    fog = lerp3(fog, [0.16, 0.15, 0.16], night);
    // 雲を下から照らす空の色：くもりほど灰色
    const ambient = lerp3(table.zenith, [0.62, 0.64, 0.67], cloud * 0.6).map((v) => v * (1 - 0.55 * night));
    const glow = [0.33, 0.25, 0.2]; // 夜の雲の底（街の明かり）
    const moonUp = smooth(-1, 3, e.moon.elevation);
    layer.uniforms = {
      sun: e.sun.dir,
      sunCol: table.sunColor,
      sunPow: table.sunPower * (1 - 0.85 * cloud * (W.type === "cirrus" ? 0.4 : 1)),
      moon: e.moon.dir,
      moonVis: moonUp * (0.35 + 0.65 * night) * Math.min(1, 0.2 + e.moon.lit),
      night,
      starM: new Float32Array([e.stars[0][0], e.stars[1][0], e.stars[2][0], e.stars[0][1], e.stars[1][1], e.stars[2][1], e.stars[0][2], e.stars[1][2], e.stars[2][2]]),
      cloud: [cloud, dark, CLOUD_TYPE[W.type] ?? 0, W.type === "cirrus" ? 7 : W.type === "cumulonimbus" ? 1.2 : 1.6],
      ambient, glow, fog, fogAmt, haze,
      // 東京の夜：見える星は 3〜4 等まで。月が出ていると、さらに少ない
      starCut: 0.32 + 0.45 * moonUp * e.moon.lit,
    };
    // 地図の霧・もや（MapLibre の sky）と、ほかのレイヤーの光に使う色
    layer.colors = {
      zenith: lerp3(table.zenith, fog, fogAmt),
      horizon: lerp3(lerp3(table.horizon, fog, Math.max(haze, cloud * 0.5)), fog, fogAmt),
      fog,
      sunColor: table.sunColor,
      sunPower: layer.uniforms.sunPow,
    };
    map?.triggerRepaint();
  };
  layer.uniforms = null;
  layer.colors = null;
  layer.visible = false;
  layer.flash = 0;
  layer.strike = null;
  layer.lightning = L;
  return layer;
}

// 色（[0〜1] の rgb）を "#rrggbb" に
export const rgbHex = (c) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
export { hexRgb };
