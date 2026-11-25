// MapLibre の独自レイヤー（WebGL）で、手で足した構造物（壁・橋など）と、橋の上を通るルート、電車、夜の街灯を描く。
// 形は campus3dMesh.js。地形と同じ「海抜の標高(m)」で置くので、地面や建物とのかぶり方（奥行き）も正しくなる
import { MERC_SCALE, ORIGIN, worldOf } from "./campus3dMesh.js";
import { SURFACE_PRINT_IMAGES } from "./campus3dFeatures.js";
import { createBookRenderer } from "./campus3dBookLayer.js";
import { createMarketRenderer } from "./campus3dMarketLayer.js";
import { createCoupeRenderer } from "./campus3dCoupeRenderer.js";
import { TSUBAME_ATLAS } from "./campus3dTsubameMenu.js";
import { tsubameMenuPixels } from "./campus3dTsubameMenuArt.js";
import { ceilingLightPixels, createFloorTexture, insideLightPlan, signPrintPixels, uploadFloorTexture } from "./campus3dFloorMaterials.js";
import { deckStampPixels, pavingStampName } from "./campus3dPavingTiles.js";
import { interiorPalette } from "./campus3dInterior.js";
import { chunkTriangles, chunkRanges, frustumOf } from "./campus3dChunks.js";

export const EXTRAS_LAYER_ID = "cb-extras";
const GLASS_ALPHA = 0.3; // ガラスの手すりの板の濃さ
const SCREEN_ALPHA = 0.85; // 穴あきの金属板の濃さ（穴から向こうが透ける）
const HAZE_ALPHA = 0.12; // 金網の柵の網の面の濃さ（針金が遠くで見えなくなっても網の濃さが残る）
const VEIL_ALPHA = 0.55; // 詳細モードの建物の中の白い格子の手すりの濃さ

// 光の当て方は MapLibre の fill-extrusion と同じ式（建物と同じ見え方にする）
const VS_SOLID = `
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
uniform float u_alpha;
uniform vec4 u_metalEye;
varying vec4 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  vec4 color = a_color;
  float colorvalue = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color += vec4(0.03, 0.03, 0.03, 1.0);
  float directional = clamp(dot(a_normal, u_lightpos), 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  // 店の明かり・中から光る看板（色のアルファを 0.5 にした面。campus3dMesh.js の glow）は光を受けず、そのままの明るさ（夜も明るい）
  vec3 lit = a_color.a < 0.75 ? a_color.rgb : clamp(color.rgb * directional * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0));
  // Cast metal reflects the cool sky, warm canopy lamps and narrow louvre highlights.
  if (a_color.a > 0.620 && a_color.a < 0.630) {
    vec3 E = normalize(vec3((u_metalEye.xy-a_pos.xy)*u_metalEye.w,u_metalEye.z-a_pos.z));
    vec3 R = reflect(-E,normalize(a_normal));
    float sky = smoothstep(-0.25,0.65,R.z);
    float beam = smoothstep(.68,.98,cos(13.0*R.x+4.0*R.y))*smoothstep(.13,.84,R.z);
    float lamp = pow(max(0.0,dot(R,normalize(vec3(-.44,.31,.84)))),16.);
    vec3 env = mix(vec3(.75,.72,.66),vec3(.95,1.02,1.09),sky)+beam*.30;
    lit = clamp(a_color.rgb*env*(.91+.12*directional)+vec3(1.,.90,.72)*(.40*lamp+.10*beam),0.,1.);
  }
  // 半透明（u_alpha < 1）は透明度を掛けた色で出す
  v_color = vec4(lit * u_alpha, u_alpha);
}`;
const FS_SOLID = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;
const VS_FLOOR = `
attribute vec3 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform mat4 u_matrix;
varying highp vec2 v_uv;
varying highp vec3 v_floorPos;
varying lowp vec4 v_highlight;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  v_uv = a_uv;
  v_floorPos = a_pos;
  v_highlight = a_color;
}`;
const FS_FLOOR = `
precision highp float;
uniform sampler2D u_finish;
uniform bool u_stamp;
uniform sampler2D u_ceilingLights;
uniform vec3 u_lightMap;
uniform vec3 u_lampHeights;
uniform vec3 u_eye;
uniform float u_floorZ;
uniform float u_sheen;
varying highp vec2 v_uv;
varying highp vec3 v_floorPos;
varying lowp vec4 v_highlight;
float reflected(float height, vec3 channel) {
  if (height <= 0.0) return 0.0;
  vec2 p = v_floorPos.xy + (v_floorPos.xy-u_eye.xy)*height/max(.1,u_eye.z-u_floorZ);
  vec2 uv = (p-u_lightMap.xy)*u_lightMap.z;
  if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return 0.0;
  return dot(texture2D(u_ceilingLights,uv).rgb,channel);
}
void main() {
  vec4 texel = texture2D(u_finish, v_uv);
  vec3 color = u_stamp ? texel.rgb + v_highlight.rgb * (1.0 - texel.a) : mix(texel.rgb, v_highlight.rgb, v_highlight.a);
  if (u_sheen > 0.0 && abs(v_floorPos.z - u_floorZ) < 0.025) {
    float light = reflected(u_lampHeights.x,vec3(1,0,0)) + reflected(u_lampHeights.y,vec3(0,1,0)) + reflected(u_lampHeights.z,vec3(0,0,1));
    color += vec3(1.0, 0.98, 0.92) * min(light,1.0) * u_sheen * (1.0 - v_highlight.a);
  }
  gl_FragColor = vec4(color, 1.0);
}`;
// 詳細モードで歩いて見るときの建物の殻：カメラから見て裏を向く面（面の向きとカメラからの向きが同じ側）は描かない＝建物の中からは見えない。
// u_cam はカメラの位置（描く座標）、u_kxy は描く座標の 1 が何 m か（x, y。z は m）
const VS_CULL = VS_SOLID.replace("varying vec4 v_color;", "varying vec4 v_color;\nuniform vec3 u_cam;\nuniform float u_kxy;\nvarying float v_back;")
  .replace("gl_Position = u_matrix * vec4(a_pos, 1.0);", "gl_Position = u_matrix * vec4(a_pos, 1.0);\n  v_back = dot(a_normal, vec3((a_pos.xy - u_cam.xy) * u_kxy, a_pos.z - u_cam.z));");
const FS_CULL = `
precision mediump float;
varying vec4 v_color;
varying float v_back;
void main() { if (v_back > 0.0) discard; gl_FragColor = v_color; }`;
// 行列 M（描く座標 → クリップ座標）から、カメラの位置（クリップの x・y・w が 0 になる点）
export function cameraOf(M) {
  const r = [0, 1, 3].map((i) => [M[i], M[4 + i], M[8 + i], -M[12 + i]]);
  const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const D = det(r[0], r[1], r[2]);
  if (Math.abs(D) < 1e-20) return null;
  const col = (k) => r.map((q) => { const x = q.slice(0, 3); x[k] = q[3]; return x; });
  return [0, 1, 2].map((k) => { const [a, b, c] = col(k); return det(a, b, c) / D; });
}
// 橋の上のルート：画面上で決まった太さ（u_half）の帯
const VS_RIBBON = `
attribute vec3 a_pos;
attribute vec2 a_off;
uniform mat4 u_matrix;
uniform float u_half;
void main() { gl_Position = u_matrix * vec4(a_pos.xy + a_off * u_half, a_pos.z, 1.0); }`;
const FS_RIBBON = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;
// 光のにじみ（足し算で重ねる）：画面に向く丸（a_bill の角を u_right・u_up へ。画面で a_bill.w px より小さくしない。
// a_bill.z m だけカメラへ寄せる）と、地面に置く四角（a_bill が 0）。明るさの形は a_uv.z：0 丸（芯と、まわりのにじみ）、
// 1 前照灯の帯（x 横 -1〜1、y 前へ 0〜1）、2 窓あかりの帯（x 車体から外へ 0〜1、y 車両に沿って 0〜1）
const VS_GLOW = `
attribute vec3 a_pos;
attribute vec4 a_bill;
attribute vec3 a_uv;
attribute vec3 a_color;
uniform mat4 u_matrix;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_tocam;
uniform float u_mpp;
uniform float u_gain;
varying vec3 v_uv;
varying vec3 v_color;
void main() {
  vec2 b = a_bill.xy;
  float r = max(abs(b.x), abs(b.y));
  if (r > 0.0) b *= max(r, a_bill.w * u_mpp) / r;
  gl_Position = u_matrix * vec4(a_pos + u_right * b.x + u_up * b.y + u_tocam * a_bill.z, 1.0);
  v_uv = a_uv;
  v_color = a_color * u_gain;
}`;
const FS_GLOW = `
precision mediump float;
varying vec3 v_uv;
varying vec3 v_color;
void main() {
  float f;
  if (v_uv.z < 0.5) {
    float d2 = dot(v_uv.xy, v_uv.xy);
    f = (exp(-d2 * 12.0) * 0.7 + exp(-d2 * 3.2) * 0.3) * (1.0 - smoothstep(0.7, 1.0, sqrt(d2)));
  } else if (v_uv.z < 1.5) {
    float t = 1.0 - clamp(v_uv.y, 0.0, 1.0);
    f = t * t * exp(-3.0 * v_uv.x * v_uv.x) * smoothstep(0.0, 0.06, v_uv.y);
  } else {
    float t = 1.0 - clamp(v_uv.x, 0.0, 1.0);
    f = t * t * smoothstep(0.0, 0.1, v_uv.y) * (1.0 - smoothstep(0.9, 1.0, v_uv.y));
  }
  gl_FragColor = vec4(v_color * f, 0.0);
}`;
// 街灯の柱と灯具：光の当て方は VS_SOLID と同じ。色のアルファが 0.5 の面（灯具）は、昼は灰色、夜（u_glow）は灯具の色で光る
const VS_LAMP = `
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
uniform float u_glow;
varying vec4 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  bool lamp = a_color.a < 0.75;
  vec4 color = lamp ? vec4(0.78, 0.8, 0.82, 1.0) : a_color;
  float colorvalue = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color += vec4(0.03, 0.03, 0.03, 1.0);
  float directional = clamp(dot(a_normal, u_lightpos), 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  vec3 lit = clamp(color.rgb * directional * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0));
  if (lamp) lit = mix(lit, a_color.rgb, u_glow);
  v_color = vec4(lit, 1.0);
}`;

export function compile(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program link failed");
  const loc = (name) => gl.getUniformLocation(p, name);
  const att = (name) => gl.getAttribLocation(p, name);
  return { p, loc, att };
}

// 光の色（"#rrggbb"。なければ白）を [r, g, b] に
const lightRgb = (hex) => {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}/i.test(hex)) return [1, 1, 1];
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// 光（スタイルの light と同じ値）を、シェーダーに渡す形に。時刻の見え方で差し替える（setLight）
const lightState = (light) => ({ pos: lightVector(light.position), intensity: light.intensity, color: lightRgb(light.color) });

// MapLibre の光（position: [r, 方位, 仰角]）を、地図に固定した向きのベクトルにする（MapLibre と同じ変換）
export function lightVector([r, azimuthal, polar]) {
  const az = ((azimuthal + 90) * Math.PI) / 180;
  const po = (polar * Math.PI) / 180;
  return [r * Math.cos(az) * Math.sin(po), r * Math.sin(az) * Math.sin(po), r * Math.cos(po)];
}

// MapLibre の行列（x, y はワールドの px、z は標高 m）に、こちらの座標（中心からの差 × MERC_SCALE）を合わせる。
// 大きな数どうしの引き算を float64 で済ませてから float32 にする
export function matrixFor(m, worldSize, exaggeration) {
  const sx = worldSize / MERC_SCALE;
  const tx = ORIGIN[0] * worldSize;
  const ty = ORIGIN[1] * worldSize;
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * sx;
    out[4 + r] = m[4 + r] * sx;
    out[8 + r] = m[8 + r] * exaggeration;
    out[12 + r] = m[r] * tx + m[4 + r] * ty + m[12 + r];
  }
  return out;
}

// 描く座標で東・北へ 1m のベクトル
export const PER_M = (() => {
  const o = worldOf([0, 0]);
  const e = worldOf([1, 0]);
  const n = worldOf([0, 1]);
  return { e: [e[0] - o[0], e[1] - o[1]], n: [n[0] - o[0], n[1] - o[1]] };
})();
// いまのカメラでの、画面の右・上（光のにじみの丸を画面に向ける）とカメラへの向き（どれも描く座標で 1m ぶん）と、画面のまん中の 1px が何 m か
function glowBasis(map) {
  const th = (map.getBearing() * Math.PI) / 180;
  const ph = (map.getPitch() * Math.PI) / 180;
  const w = (east, north) => [east * PER_M.e[0] + north * PER_M.n[0], east * PER_M.e[1] + north * PER_M.n[1]];
  const r = w(Math.cos(th), -Math.sin(th)); // 画面の右
  const f = w(Math.sin(th), Math.cos(th)); // 画面の上（地面の上で奥へ）
  const cp = Math.cos(ph);
  const sp = Math.sin(ph);
  return {
    right: [r[0], r[1], 0],
    up: [f[0] * cp, f[1] * cp, sp],
    tocam: [-f[0] * sp, -f[1] * sp, cp],
    mpp: (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / map.transform.worldSize,
  };
}

// バッファに入れた配列の型を覚えておき、つなぐときにその型で読む（2026-11-17）：Mesh は法線を Int8・色を Uint8 に詰めることがある
// （campus3dMesh の setMeshPacking。スマホのメモリを半分に）。詰めた値は 0〜1・−1〜1 に直して読む（normalized）。小数の配列は今までどおり
const noteType = (gl, buf, data) => {
  buf.cbType = data instanceof Int8Array ? gl.BYTE : data instanceof Uint8Array || data instanceof Uint8ClampedArray ? gl.UNSIGNED_BYTE : gl.FLOAT;
};
const pointAttr = (gl, a, size, buf) => {
  const t = buf?.cbType || gl.FLOAT;
  gl.vertexAttribPointer(a, size, t, t !== gl.FLOAT, 0, 0);
};
const GLOW_KEYS = [["pos", "a_pos", 3], ["bill", "a_bill", 4], ["uv", "a_uv", 3], ["col", "a_color", 3]];
const SOLID_KEYS = [["pos", "a_pos", 3], ["nrm", "a_normal", 3], ["col", "a_color", 4]];
// 三角形のデータ（GlowMesh・Mesh の結果）を GL のバッファへ。usage は STATIC_DRAW か DYNAMIC_DRAW
function uploadTo(gl, data, keys, out = {}, usage = gl.STATIC_DRAW) {
  out.count = data.count;
  for (const [k] of keys) {
    out[k] ||= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out[k]);
    gl.bufferData(gl.ARRAY_BUFFER, data[k], usage);
    noteType(gl, out[k], data[k]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return out;
}
const freeBufs = (gl, b, keys) => b && keys.forEach(([k]) => b[k] && gl.deleteBuffer(b[k]));
// バッファ b を prog の属性につないで描く
function drawBufs(gl, prog, b, keys) {
  const on = [];
  for (const [k, name, size] of keys) {
    const a = prog.att(name);
    if (a < 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, b[k]);
    gl.enableVertexAttribArray(a);
    pointAttr(gl, a, size, b[k]);
    on.push(a);
  }
  gl.drawArrays(gl.TRIANGLES, 0, b.count);
  on.forEach((a) => gl.disableVertexAttribArray(a));
}
// 光のにじみを足し算で描く。奥行きは見るだけ（建物・車体・地面の陰には隠れ、ほかのにじみは隠さない）
function drawGlow(gl, prog, b, M, basis, gain) {
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
  gl.uniform3fv(prog.loc("u_right"), basis.right);
  gl.uniform3fv(prog.loc("u_up"), basis.up);
  gl.uniform3fv(prog.loc("u_tocam"), basis.tocam);
  gl.uniform1f(prog.loc("u_mpp"), basis.mpp);
  gl.uniform1f(prog.loc("u_gain"), gain);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  gl.depthFunc(gl.LEQUAL);
  drawBufs(gl, prog, b, GLOW_KEYS);
  gl.depthMask(true);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

/**
 * @param light  { position: [r, 方位, 仰角], intensity, color }（スタイルの light と同じ値。setLight で差し替える）
 * @param route  { width: (zoom) => px, casing: (zoom) => px, color, casingColor }
 */
export function createExtrasLayer({ light, route, exaggeration = 1, skyColors }) {
  let map = null;
  let gl = null;
  let solid = null;
  let ribbon = null;
  let culler = null;
  let floorProg = null;
  let books = null, hasBooks = false;
  let market = null, hasMarket = false;
  const floorTextures = new Map();
  let lightPlans = [], activeLightPlan = null, reflectionTexture = null;
  const readyStamps = new Map();
  const failedStamps = new Set();
  const buf = { mesh: null, floors: null, thin: null, glass: null, screen: null, haze: null, veil: null, cull: null, portal: null, under: null, rib: null };
  // 升目ごとに並べかえて、見えている升目だけ描く（campus3dChunks）。drawLimits は小さい三角形・建物の中を描く距離（m）
  let drawLimits = { mid: Infinity, small: Infinity, inside: Infinity };
  const KXY = Math.hypot(PER_M.e[0], PER_M.e[1]);
  const withChunks = (d, inter) => {
    const t0 = performance.now();
    const ch = d.chunks !== undefined ? d.chunks : typeof window !== "undefined" && window.__cbNoChunks ? null : chunkTriangles(d, [["pos", 3], ["nrm", 3], ["col", 4]], { kxy: KXY, interior: inter || null });
    if (ch && typeof window !== "undefined") (window.__cbChunkLog ||= []).push({ tris: d.count / 3, cells: ch.n, stats: ch.stats, ms: Math.round(performance.now() - t0) });
    const b = upload(d, ["pos", "nrm", "col"]);
    b.ch = ch;
    b.ranges = [];
    return b;
  };
  let mesh = null;
  let rib = null;
  let lt = lightState(light);

  const upload = (data, keys) => {
    const out = { count: data.count };
    keys.forEach((k) => {
      out[k] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, out[k]);
      gl.bufferData(gl.ARRAY_BUFFER, data[k], gl.STATIC_DRAW);
      noteType(gl, out[k], data[k]);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return out;
  };
  const free = (b, keys) => b && keys.forEach((k) => b[k] && gl.deleteBuffer(b[k]));
  const bindAttr = (prog, name, b, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(a);
    pointAttr(gl, a, size, b);
    return a;
  };
  // 掘らない地下の階へのガラスの面（mesh.portal。campus3dMesh の addCovered）：形を描く前に、その面が見えている画素（いままでに描いた
  // 地形・地図の建物より手前）だけ奥行きを最も遠くにする。地形は掘らない地下の階の上で掘っていないので、ガラスのすぐ向こうに地形の斜面が
  // あり、地上から見るとガラスの奥が灰色にふさがって見えた（附属図書館の入口の自動ドア）。ガラスより手前の地形・形はそのまま前に描かれる。
  // ステンシルは MapLibre がタイルの切り抜きに使うので、使ったあと次の層に描き直させる（currentStencilSource）
  const punchPortals = (b, M) => {
    gl.useProgram(solid.p);
    gl.uniformMatrix4fv(solid.loc("u_matrix"), false, M);
    const a = bindAttr(solid, "a_pos", b.pos, 3);
    const range = gl.getParameter(gl.DEPTH_RANGE);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    // 1. ガラスの面がいまの奥行きより手前の画素に 1
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.drawArrays(gl.TRIANGLES, 0, b.count);
    // 2. その画素の奥行きを最も遠く（1）に
    gl.depthMask(true);
    gl.depthFunc(gl.ALWAYS);
    gl.depthRange(1, 1);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.drawArrays(gl.TRIANGLES, 0, b.count);
    gl.depthRange(range[0], range[1]);
    gl.depthFunc(gl.LEQUAL);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);
    if (a >= 0) gl.disableVertexAttribArray(a);
    if (map.painter) map.painter.currentStencilSource = undefined;
  };

  const layer = {
    id: EXTRAS_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      solid = compile(gl, VS_SOLID, FS_SOLID);
      ribbon = compile(gl, VS_RIBBON, FS_RIBBON);
      culler = compile(gl, VS_CULL, FS_CULL);
      floorProg = compile(gl, VS_FLOOR, FS_FLOOR);
    },
    onRemove() {
      free(buf.mesh, ["pos", "nrm", "col"]);
      free(buf.floors, ["pos", "uv", "col"]);
      free(buf.thin, ["pos", "nrm", "col"]);
      free(buf.glass, ["pos", "nrm", "col"]);
      free(buf.screen, ["pos", "nrm", "col"]);
      free(buf.haze, ["pos", "nrm", "col"]);
      free(buf.veil, ["pos", "nrm", "col"]);
      free(buf.cull, ["pos", "nrm", "col"]);
      free(buf.portal, ["pos", "nrm", "col"]);
      free(buf.under, ["pos", "nrm", "col"]);
      free(buf.rib, ["pos", "off"]);
      buf.veil = null;
      buf.cull = null;
      buf.portal = null;
      buf.under = null;
      buf.mesh = null;
      buf.floors = null;
      buf.thin = null;
      buf.glass = null;
      buf.screen = null;
      buf.haze = null;
      buf.rib = null;
      if (gl) {
        if (solid) gl.deleteProgram(solid.p);
        if (ribbon) gl.deleteProgram(ribbon.p);
        if (culler) gl.deleteProgram(culler.p);
        if (floorProg) gl.deleteProgram(floorProg.p);
        market?.remove();
        market = null; hasMarket = false;
        books?.remove();
        books = null;
        hasBooks = false;
        for (const texture of floorTextures.values()) gl.deleteTexture(texture);
        if (reflectionTexture) gl.deleteTexture(reflectionTexture);
        reflectionTexture = activeLightPlan = null;
        lightPlans = [];
        floorTextures.clear();
        readyStamps.clear();
        failedStamps.clear();
      }
      map = null;
    },
    render(g, args) {
      if (mesh) {
        free(buf.mesh, ["pos", "nrm", "col"]);
        free(buf.floors, ["pos", "uv", "col"]);
        free(buf.thin, ["pos", "nrm", "col"]);
        free(buf.glass, ["pos", "nrm", "col"]);
        free(buf.screen, ["pos", "nrm", "col"]);
        free(buf.haze, ["pos", "nrm", "col"]);
        free(buf.veil, ["pos", "nrm", "col"]);
        free(buf.cull, ["pos", "nrm", "col"]);
        free(buf.portal, ["pos", "nrm", "col"]);
        free(buf.under, ["pos", "nrm", "col"]);
        buf.veil = mesh.veil?.count ? withChunks(mesh.veil, mesh.interior?.veil) : null;
        buf.cull = mesh.cull?.count ? withChunks(mesh.cull, mesh.interior?.cull) : null;
        buf.portal = mesh.portal?.count ? upload(mesh.portal, ["pos", "nrm", "col"]) : null;
        buf.under = mesh.under?.count ? upload(mesh.under, ["pos", "nrm", "col"]) : null;
        buf.mesh = mesh.count ? withChunks(mesh, mesh.interior?.m) : null;
        buf.floors = mesh.floors?.count ? upload(mesh.floors, ["pos", "uv", "col"]) : null;
        lightPlans = mesh.lightPlans || [];
        hasBooks = Boolean(mesh.bookRacks?.length);
        if (hasBooks && !books) books = createBookRenderer(gl, compile);
        books?.set(mesh.bookRacks);
        hasMarket = Boolean(mesh.marketStock?.chunks.length);
        if (hasMarket && !market) market = createMarketRenderer(gl,compile);
        market?.set(mesh.marketStock);
        if (buf.floors) {
          buf.floors.batches = mesh.floors.batches;
          gl.activeTexture(gl.TEXTURE0);
          for (const { finish } of buf.floors.batches) {
            if (floorTextures.has(finish) && !failedStamps.delete(finish)) continue;
            const print = SURFACE_PRINT_IMAGES[finish];
            const isMenu = finish === TSUBAME_ATLAS;
            const paving = pavingStampName(finish);
            if (isMenu || print || paving || finish === "terraceBoards") {
              const initial = isMenu || print ? [239, 237, 229, 255] : finish === "terraceBoards" ? [167, 166, 164, 255] : [0, 0, 0, 0];
              const texture = floorTextures.get(finish) || uploadFloorTexture(gl, 1, new Uint8Array(initial));
              floorTextures.set(finish, texture);
              const pixelsReady = isMenu ? tsubameMenuPixels() : print ? signPrintPixels(print) : deckStampPixels(paving || finish);
              pixelsReady.then(pixels => {
                if (floorTextures.get(finish) !== texture) return;
                readyStamps.set(finish, pixels);
                map?.triggerRepaint();
              }).catch(() => {
                if (floorTextures.get(finish) === texture) failedStamps.add(finish);
              });
            } else {
              floorTextures.set(finish, createFloorTexture(gl, finish, interiorPalette));
            }
          }
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
        buf.thin = mesh.thin?.count ? withChunks(mesh.thin, mesh.interior?.thin) : null;
        buf.glass = mesh.glass?.count ? withChunks(mesh.glass, mesh.interior?.glass) : null;
        buf.screen = mesh.screen?.count ? withChunks(mesh.screen, mesh.interior?.screen) : null;
        buf.haze = mesh.haze?.count ? withChunks(mesh.haze, mesh.interior?.haze) : null;
        mesh = null;
      }
      if (rib) {
        free(buf.rib, ["pos", "off"]);
        buf.rib = rib.count ? upload(rib, ["pos", "off"]) : null;
        rib = null;
      }
      const ws = map.transform.worldSize;
      const M = matrixFor(args.modelViewProjectionMatrix, ws, exaggeration);
      // いま描いた行列（描く座標 → クリップ座標）：目印（campus3dDebug.js）が 3D の点を画面へ・画面の点を光線へ直すのに使う
      layer.matrix = M;
      for (const [finish, { size, data }] of readyStamps) uploadFloorTexture(gl, size, data, floorTextures.get(finish));
      readyStamps.clear();
      if (!buf.mesh && !buf.floors && !buf.thin && !buf.glass && !buf.screen && !buf.haze && !buf.veil && !buf.cull && !buf.rib && !buf.under) return;
      const enabled = [];

      // 形（壁・段・橋）。手すり（thin）は奥行きを書かずに描く：段や壁には隠れるが、あとで描くルートの線を支柱で途切れさせない。
      // 穴あきの金属板（screen）・金網の網の面（haze）・ガラスの手すりの板（glass）は最後に半透明で重ねる（奥行きは書かない）
      // 詳細モードの殻（cull）は形と同じく奥行きを書く（中からは裏の面になって描かれない）。白い格子の手すり（veil）は半透明
      const cam = cameraOf(M);
      const planes = frustumOf(M);
      const lim = (typeof window !== "undefined" && window.__cbLimits) || drawLimits;
      if (buf.portal && map.terrain) punchPortals(buf.portal, M);
      // 天井のない平地の床（mesh.under）：地形を外しているとき（地面の下を歩くとき）だけ。ふだんは地形が床
      [[map.terrain ? null : buf.under, true, 1], [buf.floors, true, 1], [buf.mesh, true, 1], [cam ? buf.cull : null, true, 1, true], [hasBooks ? books : null, true, 1], [hasMarket ? market : null, true, 1], [buf.thin, false, 1], [buf.screen, false, SCREEN_ALPHA], [buf.veil, false, VEIL_ALPHA], [buf.haze, false, HAZE_ALPHA], [buf.glass, false, GLASS_ALPHA]].forEach(([b, writeDepth, alpha, culled]) => {
        if (!b) return;
        if (b === books) { books.draw(M, cam); return; }
        if (b === market) { market.draw(M, cam, skyColors?.()); return; }
        if (b === buf.floors) {
          gl.useProgram(floorProg.p);
          gl.uniformMatrix4fv(floorProg.loc("u_matrix"), false, M);
          gl.uniform1i(floorProg.loc("u_finish"), 0);
          const plan = cam && lightPlans.find(p => insideLightPlan(p,cam));
          gl.uniform1i(floorProg.loc("u_ceilingLights"), plan ? 1 : 0);
          if (plan) {
            gl.activeTexture(gl.TEXTURE1);
            if (activeLightPlan !== plan) {
              const pixels = ceilingLightPixels(plan);
              reflectionTexture = uploadFloorTexture(gl, pixels.width, pixels.data, reflectionTexture || gl.createTexture());
              activeLightPlan = plan;
            }
            gl.bindTexture(gl.TEXTURE_2D, reflectionTexture);
            gl.uniform3f(floorProg.loc("u_lightMap"), plan.x, plan.y, 1/plan.span);
            gl.uniform3fv(floorProg.loc("u_lampHeights"),plan.heights);
            gl.uniform3fv(floorProg.loc("u_eye"), cam);
            gl.uniform1f(floorProg.loc("u_floorZ"), plan.z);
          }
          gl.activeTexture(gl.TEXTURE0);
          gl.depthMask(true);
          const attrs = [bindAttr(floorProg, "a_pos", b.pos, 3), bindAttr(floorProg, "a_uv", b.uv, 2), bindAttr(floorProg, "a_color", b.col, 4)];
          for (const { finish, first, count } of b.batches) {
            const sheen = finish === "cvs" ? 0.48 : finish === "rubber" ? 0.34 : finish === "studdedRubber" ? 0.24
              : finish === "marketVinyl" ? 0.24 : finish === "marketPlanks" ? 0.10 : 0;
            gl.uniform1f(floorProg.loc("u_sheen"), plan ? sheen : 0);
            gl.uniform1i(floorProg.loc("u_stamp"), pavingStampName(finish) ? 1 : 0);
            gl.bindTexture(gl.TEXTURE_2D, floorTextures.get(finish));
            gl.drawArrays(gl.TRIANGLES, first, count);
          }
          attrs.forEach((a) => gl.disableVertexAttribArray(a));
          gl.bindTexture(gl.TEXTURE_2D, null);
          if (plan) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE0);
          }
          return;
        }
        const prog = culled ? culler : solid;
        gl.useProgram(prog.p);
        gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
        gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
        gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
        gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
        gl.uniform1f(prog.loc("u_alpha"), alpha);
        if (cam) gl.uniform4f(prog.loc("u_metalEye"), cam[0], cam[1], cam[2], 1 / Math.hypot(PER_M.e[0], PER_M.e[1]));
        if (culled) {
          gl.uniform3fv(prog.loc("u_cam"), cam);
          gl.uniform1f(prog.loc("u_kxy"), 1 / Math.hypot(PER_M.e[0], PER_M.e[1]));
        }
        enabled.push(bindAttr(prog, "a_pos", b.pos, 3), bindAttr(prog, "a_normal", b.nrm, 3), bindAttr(prog, "a_color", b.col, 4));
        if (alpha < 1) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.depthMask(writeDepth);
        if (b.ch) {
          const r = chunkRanges(b.ch, planes, cam, KXY, lim, b.ranges);
          for (let i = 0; i < r.length; i += 2) gl.drawArrays(gl.TRIANGLES, r[i], r[i + 1]);
        } else gl.drawArrays(gl.TRIANGLES, 0, b.count);
        gl.depthMask(true);
        enabled.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
        enabled.length = 0;
      });

      if (buf.rib) {
        const z = map.getZoom();
        const perPx = MERC_SCALE / ws; // 1px がこちらの座標でいくつか
        gl.useProgram(ribbon.p);
        gl.uniformMatrix4fv(ribbon.loc("u_matrix"), false, M);
        enabled.push(bindAttr(ribbon, "a_pos", buf.rib.pos, 3), bindAttr(ribbon, "a_off", buf.rib.off, 2));
        const draw = (px, color) => {
          gl.uniform1f(ribbon.loc("u_half"), (px / 2) * perPx);
          gl.uniform4fv(ribbon.loc("u_color"), color);
          gl.drawArrays(gl.TRIANGLES, 0, buf.rib.count);
        };
        // 建物などの陰に入ったところは、半透明で透けて見せる
        gl.depthMask(false);
        gl.depthFunc(gl.GREATER);
        draw(route.width(z), route.color.map((v) => v * 0.45));
        // 手前に見えるところ：白い縁 → 青。どちらも奥行きは書かない（坂や階段で線が上り下りすると、つなぎ目で次の区間の縁が
        // 手前になり、青を隠して点線のように途切れるため。建物・段・地面には今までどおり隠れる）
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -4);
        draw(route.casing(z), route.casingColor);
        gl.polygonOffset(-2, -8);
        draw(route.width(z), route.color);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.depthMask(true);
        enabled.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
  // 形を差し替える（GL への転送は次に描くとき）
  layer.setMesh = (m) => {
    mesh = m;
    map?.triggerRepaint();
  };
  layer.setDrawLimits = (l) => {
    drawLimits = { ...drawLimits, ...l };
    map?.triggerRepaint();
  };
  layer.setRibbons = (r) => {
    rib = r;
    map?.triggerRepaint();
  };
  // 光を差し替える（時刻の見え方）
  layer.setLight = (l) => {
    lt = lightState(l);
    map?.triggerRepaint();
  };
  return layer;
}

// ── 電車（campus3dTrains.js）。形は毎フレーム作り直す ──
export const TRAINS_LAYER_ID = "cb-trains";
// 建物と同じ光。u_alpha で薄くする（色はあらかじめ透明度を掛けた形で出す）
const VS_TRAIN = `
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
uniform float u_alpha;
varying vec4 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  vec4 color = a_color;
  float colorvalue = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color += vec4(0.03, 0.03, 0.03, 1.0);
  float directional = clamp(dot(a_normal, u_lightpos), 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  // 窓あかり（色のアルファを 0.5 にした面）は光を受けず、そのままの明るさ
  vec3 lit = a_color.a < 0.75 ? a_color.rgb : clamp(color.rgb * directional * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0));
  v_color = vec4(lit * u_alpha, u_alpha);
}`;

/**
 * @param frame  ({ zoom, bounds }) => { surface, tunnel, glow, count }（いまの車両の形。surface は地上、tunnel はトンネルの中、
 *               glow は前照灯・尾灯・窓あかりのにじみ（GlowMesh）、count は走っている列車の数）
 */
export function createTrainsLayer({ light, exaggeration = 1, frame }) {
  let map = null;
  let gl = null;
  let prog = null;
  let glowProg = null;
  const glowBuf = {};
  let timer = 0;
  let xray = true; // トンネルの中の列車を地面ごしに透かして見せる（目の高さで歩くときは見せない）
  const bufs = {};
  let lt = lightState(light);
  const put = (key, data) => {
    if (!bufs[key]) bufs[key] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    noteType(gl, bufs[key], data);
  };
  const bind = (key, name, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.enableVertexAttribArray(a);
    pointAttr(gl, a, size, bufs[key]);
    return a;
  };
  // 地図が止まっていても動かし続ける：走っている列車があれば 1 秒に 20 回、なければ 2 秒ごとに描き直す
  const later = (ms) => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      map?.triggerRepaint();
    }, ms);
  };
  return {
    id: TRAINS_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    // 光を差し替える（時刻の見え方）
    setLight(l) {
      lt = lightState(l);
      map?.triggerRepaint();
    },
    setXray(v) {
      xray = v;
      map?.triggerRepaint();
    },
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS_TRAIN, FS_SOLID);
      glowProg = compile(gl, VS_GLOW, FS_GLOW);
    },
    onRemove() {
      clearTimeout(timer);
      timer = 0;
      if (gl) {
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b));
        freeBufs(gl, glowBuf, GLOW_KEYS);
        if (prog) gl.deleteProgram(prog.p);
        if (glowProg) gl.deleteProgram(glowProg.p);
      }
      map = null;
    },
    render(g, args) {
      const b = map.getBounds();
      const f = frame({ zoom: map.getZoom(), bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
      later(f?.count ? 50 : 2000);
      if (!f || (!f.surface.count && !f.tunnel.count)) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
      gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
      gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
      gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
      const draw = (mesh, key, alpha) => {
        const on = [bind(key + "p", "a_pos", 3), bind(key + "n", "a_normal", 3), bind(key + "c", "a_color", 4)];
        gl.uniform1f(prog.loc("u_alpha"), alpha);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        on.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
      };
      ["surface", "tunnel"].forEach((k) => {
        const mesh = f[k];
        if (!mesh.count) return;
        put(k + "p", mesh.pos);
        put(k + "n", mesh.nrm);
        put(k + "c", mesh.col);
      });
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      if (f.surface.count) draw(f.surface, "surface", 1);
      if (f.tunnel.count) {
        // トンネルの中：入口のあたりで地面より上に出ているところはそのまま。地面の下は透かして薄く（駅に止まっているのも見える）
        draw(f.tunnel, "tunnel", 1);
        if (xray) {
          gl.depthMask(false);
          gl.depthFunc(gl.GREATER);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          draw(f.tunnel, "tunnel", 0.38);
          gl.depthFunc(gl.LEQUAL);
          gl.depthMask(true);
        }
      }
      // 前照灯・尾灯のにじみと、線路に落ちる光（足し算）
      if (f.glow?.count) drawGlow(gl, glowProg, uploadTo(gl, f.glow, GLOW_KEYS, glowBuf, gl.DYNAMIC_DRAW), M, glowBasis(map), 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
}

// ── 自動ドアの板（campus3dDoors.js）。形は毎フレーム作り直す ──
export const DOORS_LAYER_ID = "cb-doors";
export const LIFT_LAYER_ID = "cb-lift"; // エレベーターのかご・扉（campus3dLift の liftMeshes を createDoorsLayer で）
/**
 * @param frame  () => { solid, glass }、その配列、または null。各組は独立して更新する。
 */
export function createDoorsLayer({ id = DOORS_LAYER_ID, light, exaggeration = 1, frame }) {
  let map = null;
  let gl = null;
  let prog = null;
  const bufs = {};
  // 前に送った配列（key ごと）。同じ配列なら送り直さない（2026-11-17）：frame() は形が変わったときだけ新しい Mesh.result() を返し、
  // 変わらないフレームは同じものを返す。毎フレーム送っていて、エレベーター（31 万頂点）で 1 フレーム 12 MB、発車標で 6 MB だった。
  // 配列の中身を書きかえて使い回す形を渡すときは、新しい配列にすること
  const sent = {};
  let batchCount = 0;
  let lt = lightState(light);
  const put = (key, data) => {
    if (!bufs[key]) bufs[key] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    noteType(gl, bufs[key], data);
  };
  const bind = (key, name, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.enableVertexAttribArray(a);
    pointAttr(gl, a, size, bufs[key]);
    return a;
  };
  return {
    id, // 自動ドア（cb-doors）と同じ描き方で、エレベーターのかご・扉（LIFT_LAYER_ID）も
    type: "custom",
    renderingMode: "3d",
    setLight(l) {
      lt = lightState(l);
      map?.triggerRepaint();
    },
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS_TRAIN, FS_SOLID);
    },
    onRemove() {
      if (gl) {
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b));
        Object.keys(bufs).forEach((k) => delete bufs[k]);
        Object.keys(sent).forEach((k) => delete sent[k]);
        if (prog) gl.deleteProgram(prog.p);
      }
      map = null;
    },
    render(g, args) {
      const f = frame();
      const batches = f ? (Array.isArray(f) ? f : [f]) : [];
      for (let i = batches.length; i < batchCount; i++) {
        for (const kind of ["s", "g"]) {
          const key = kind + i;
          delete sent[key];
          for (const attr of ["p", "n", "c"]) {
            if (bufs[key + attr]) gl.deleteBuffer(bufs[key + attr]);
            delete bufs[key + attr];
          }
        }
      }
      batchCount = batches.length;
      if (!batches.some(batch => batch.solid.count || batch.glass.count)) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
      gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
      gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
      gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
      const draw = (mesh, key, alpha) => {
        if (sent[key] !== mesh.pos) {
          put(key + "p", mesh.pos);
          put(key + "n", mesh.nrm);
          put(key + "c", mesh.col);
          sent[key] = mesh.pos;
        }
        const on = [bind(key + "p", "a_pos", 3), bind(key + "n", "a_normal", 3), bind(key + "c", "a_color", 4)];
        gl.uniform1f(prog.loc("u_alpha"), alpha);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        on.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
      };
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      for (const [i, batch] of batches.entries()) if (batch.solid.count) draw(batch.solid, "s" + i, 1);
      // ガラスは半透明で重ねる（奥行きは書かない。建物のガラスと同じ濃さ）
      if (batches.some(batch => batch.glass.count)) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const [i, batch] of batches.entries()) if (batch.glass.count) draw(batch.glass, "g" + i, GLASS_ALPHA);
        gl.depthMask(true);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
}

// ── 夜の街灯（campus3dLamps.js）：柱・腕・灯具と、灯具の光のにじみ。道に落ちる光の輪は地形に貼る画像（CampusMap3D）──
export const LIGHTS_LAYER_ID = "cb-lights";
const POLE_ZOOM = 18; // 柱はこれより寄ったときだけ描く（細いので、引くとちらつく）

export function createLightsLayer({ light, exaggeration = 1 }) {
  let map = null;
  let gl = null;
  let solid = null;
  let glowProg = null;
  let pending = null;
  const buf = { solid: null, glow: null };
  let glow = 0;
  let lt = lightState(light);
  const layer = {
    id: LIGHTS_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      solid = compile(gl, VS_LAMP, FS_SOLID);
      glowProg = compile(gl, VS_GLOW, FS_GLOW);
    },
    onRemove() {
      if (gl) {
        freeBufs(gl, buf.solid, SOLID_KEYS);
        freeBufs(gl, buf.glow, GLOW_KEYS);
        if (solid) gl.deleteProgram(solid.p);
        if (glowProg) gl.deleteProgram(glowProg.p);
      }
      buf.solid = null;
      buf.glow = null;
      map = null;
    },
    render(g, args) {
      if (pending) {
        freeBufs(gl, buf.solid, SOLID_KEYS);
        freeBufs(gl, buf.glow, GLOW_KEYS);
        buf.solid = pending.solid.count ? uploadTo(gl, pending.solid, SOLID_KEYS) : null;
        buf.glow = pending.glow.count ? uploadTo(gl, pending.glow, GLOW_KEYS) : null;
        pending = null;
      }
      const poles = buf.solid && map.getZoom() >= POLE_ZOOM;
      const glows = buf.glow && glow > 0.01;
      if (!poles && !glows) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      if (poles) {
        gl.useProgram(solid.p);
        gl.uniformMatrix4fv(solid.loc("u_matrix"), false, M);
        gl.uniform3fv(solid.loc("u_lightpos"), lt.pos);
        gl.uniform1f(solid.loc("u_lightintensity"), lt.intensity);
        gl.uniform3fv(solid.loc("u_lightcolor"), lt.color);
        gl.uniform1f(solid.loc("u_glow"), glow);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        drawBufs(gl, solid, buf.solid, SOLID_KEYS);
      }
      if (glows) drawGlow(gl, glowProg, buf.glow, M, glowBasis(map), glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
  // 街灯の形を差し替える（lampMesh の結果。GL への転送は次に描くとき）
  layer.setLamps = (m) => {
    pending = m;
    map?.triggerRepaint();
  };
  // 夜の明るさ（0〜1。campus3dSky.js の lookFor の lamp）
  layer.setGlow = (v) => {
    glow = v;
    map?.triggerRepaint();
  };
  layer.setLight = (l) => {
    lt = lightState(l);
    map?.triggerRepaint();
  };
  return layer;
}

// ── 乗り物（campus3dVehicles・campus3dVehicleMesh：自転車・車・ドローン。歩いて見るあいだだけ。2026-11-17）──
// 形は群ごと（campus3dVehicleMesh の vehicleFrameMeshes）：止めてある乗り物（park）は版が変わったときだけ GPU へ送る。動いているもの（move、ver: null）は毎フレーム送る
export const VEHICLES_LAYER_ID = "cb-vehicles";
const VS_VEHICLE = `
attribute vec3 a_pos, a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform vec4 u_eye;
varying vec3 v_normal, v_view;
varying vec4 v_paint;
void main(){
  gl_Position = u_matrix * vec4(a_pos,1.);
  v_normal = a_normal;
  v_view = vec3((u_eye.xy-a_pos.xy)*u_eye.w,u_eye.z-a_pos.z);
  v_paint = a_color;
}`;
const FS_VEHICLE = `
precision highp float;
varying vec3 v_normal,v_view;
varying vec4 v_paint;
uniform vec3 u_lightpos,u_lightcolor;
uniform float u_lightintensity,u_alpha;
void main(){
  vec3 n=normalize(v_normal), eye=normalize(v_view), sun=normalize(u_lightpos);
  float diffuse=max(0.,dot(n,sun));
  float level=mix(1.-u_lightintensity,1.10,diffuse);
  vec3 base=v_paint.rgb, lit=(base+.015)*level*u_lightcolor;
  float material=v_paint.a, opacity=u_alpha;
  if(material<.40){
    lit=base; opacity=material;
  } else if(material<.75){
    lit=base;
  } else if(material<.97){
    // Alpha tags distinguish machined alloy, clear-coated paint and glazing.
    vec3 reflection=reflect(-eye,n);
    float sky=smoothstep(-.23,.56,reflection.z);
    float fresnel=pow(1.-clamp(abs(dot(n,eye)),0.,1.),3.);
    float streak=exp(-8.*abs(reflection.z-.14));
    vec3 env=mix(vec3(.105,.126,.13),vec3(.49,.67,.83),sky)+vec3(.20)*streak;
    float spec=pow(max(0.,dot(reflection,sun)),material<.83?32.:68.);
    if(material>.90) lit=mix(base*.68,env,.46+.41*fresnel)*u_lightcolor;
    else lit+=env*(material<.83?.30:.085+.18*fresnel)*u_lightcolor;
    lit+=vec3(1.,.91,.78)*spec*(.18+.54*u_lightintensity)*u_lightcolor;
  }
  gl_FragColor=vec4(clamp(lit,0.,1.)*opacity,opacity);
}`;
const VEH_GLASS_ALPHA = 0.8; // 車の窓（濃い色のガラス。中の座席・運転する人がうっすら見える）
const VEH_SCREEN_ALPHA = 0.32; // 前かごの網・回っている羽根
/**
 * @param frame  () => { groups: [{ id, ver（null なら毎フレーム送る）, solid, glass, screen（Mesh の結果と同じ形）, glow（GlowMesh の結果） }] } か null。
 *               群のない { solid, glass, screen, glow } も受ける（毎フレーム送る）
 */
// id：同じ描き方で別の層を作るとき（バーチャルキャンパスのほかの人 cb-peers）。onMatrix(M, canvas)：描く前に、その回の行列を知らせる
// （名前の札を画面の位置へ置くため。形がない回は呼ばない）
export function createVehiclesLayer({ light, exaggeration = 1, frame, id = VEHICLES_LAYER_ID, onMatrix = null }) {
  let map = null;
  let gl = null;
  let prog = null;
  let glowProg = null;
  let coupe = null;
  const bufs = {};
  const sent = {}; // バッファの名前 → GPU にある形の版（同じ版なら送らない）
  const glowBufs = {}; // 群 → 光のにじみのバッファ
  let lt = lightState(light);
  const put = (key, data) => {
    if (!bufs[key]) bufs[key] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    noteType(gl, bufs[key], data);
  };
  const bind = (key, name, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.enableVertexAttribArray(a);
    pointAttr(gl, a, size, bufs[key]);
    return a;
  };
  return {
    id,
    type: "custom",
    renderingMode: "3d",
    setLight(l) {
      lt = lightState(l);
      map?.triggerRepaint();
    },
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS_VEHICLE, FS_VEHICLE);
      glowProg = compile(gl, VS_GLOW, FS_GLOW);
      coupe = createCoupeRenderer(gl,compile,()=>map?.triggerRepaint());
    },
    onRemove() {
      coupe?.dispose();coupe=null;
      if (gl) {
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b));
        Object.values(glowBufs).forEach((b) => freeBufs(gl, b, GLOW_KEYS));
        if (prog) gl.deleteProgram(prog.p);
        if (glowProg) gl.deleteProgram(glowProg.p);
      }
      for (const o of [bufs, sent, glowBufs]) for (const k of Object.keys(o)) delete o[k]; // 次に足されたときは作り直して送る
      map = null;
    },
    render(g, args) {
      const detailedCar = coupe.ready;
      const f = frame(detailedCar);
      const groups =(f?.groups || (f ? [{ id: "all", ver: null, ...f }] : [])).filter((G) => G.solid.count || G.glass.count || G.screen.count || G.glow?.count || G.cars?.length);
      if (!groups.length) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      if (onMatrix) onMatrix(M, map.getCanvas());
      gl.useProgram(prog.p);
      const eye = cameraOf(M);
      if (eye) gl.uniform4f(prog.loc("u_eye"), eye[0], eye[1], eye[2], 1 / Math.hypot(...PER_M.e));
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
      gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
      gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
      gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
      const draw = (G, part, alpha) => {
        const mesh = G[part];
        if (!mesh?.count) return;
        const key = G.id + ":" + part;
        // 同じ版の形はもう GPU にある（止めてある乗り物）。ver が null の群（動いているもの）は毎フレーム送る
        if (G.ver == null || sent[key] !== G.ver) {
          put(key + "p", mesh.pos);
          put(key + "n", mesh.nrm);
          put(key + "c", mesh.col);
          sent[key] = G.ver;
        }
        const on = [bind(key + "p", "a_pos", 3), bind(key + "n", "a_normal", 3), bind(key + "c", "a_color", 4)];
        gl.uniform1f(prog.loc("u_alpha"), alpha);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        on.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
      };
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      for (const G of groups) draw(G, "solid", 1);
      const cars=groups.flatMap(G=>G.cars||[]);
      if(cars.length){
        if(detailedCar){coupe.draw(cars,M,eye,lt);gl.useProgram(prog.p);}
        else coupe.prepare();
      }
      // 網・回る羽根・窓は半透明で重ねる（奥行きは書かない）
      if (groups.some((G) => G.screen.count || G.glass.count)) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const G of groups) draw(G, "screen", VEH_SCREEN_ALPHA);
        for (const G of groups) draw(G, "glass", VEH_GLASS_ALPHA);
        gl.depthMask(true);
      }
      // 前照灯・尾灯・ドローンの灯のにじみと、地面に落ちる光（足し算。灯は乗っているもの・ドローンだけ）
      for (const G of groups) if (G.glow?.count) drawGlow(gl, glowProg, uploadTo(gl, G.glow, GLOW_KEYS, (glowBufs[G.id] ||= {}), gl.DYNAMIC_DRAW), M, glowBasis(map), 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
}
