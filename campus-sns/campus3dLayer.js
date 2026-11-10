// MapLibre の独自レイヤー（WebGL）で、手で足した構造物（壁・橋など）と、橋の上を通るルート、電車、夜の街灯を描く。
// 形は campus3dMesh.js。地形と同じ「海抜の標高(m)」で置くので、地面や建物とのかぶり方（奥行き）も正しくなる
import { MERC_SCALE, ORIGIN, worldOf } from "./campus3dMesh.js";

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
  // 半透明（u_alpha < 1）は透明度を掛けた色で出す
  v_color = vec4(lit * u_alpha, u_alpha);
}`;
const FS_SOLID = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;
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

const GLOW_KEYS = [["pos", "a_pos", 3], ["bill", "a_bill", 4], ["uv", "a_uv", 3], ["col", "a_color", 3]];
const SOLID_KEYS = [["pos", "a_pos", 3], ["nrm", "a_normal", 3], ["col", "a_color", 4]];
// 三角形のデータ（GlowMesh・Mesh の結果）を GL のバッファへ。usage は STATIC_DRAW か DYNAMIC_DRAW
function uploadTo(gl, data, keys, out = {}, usage = gl.STATIC_DRAW) {
  out.count = data.count;
  for (const [k] of keys) {
    out[k] ||= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out[k]);
    gl.bufferData(gl.ARRAY_BUFFER, data[k], usage);
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
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
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
export function createExtrasLayer({ light, route, exaggeration = 1 }) {
  let map = null;
  let gl = null;
  let solid = null;
  let ribbon = null;
  let culler = null;
  const buf = { mesh: null, thin: null, glass: null, screen: null, haze: null, veil: null, cull: null, rib: null };
  let mesh = null;
  let rib = null;
  let lt = lightState(light);

  const upload = (data, keys) => {
    const out = { count: data.count };
    keys.forEach((k) => {
      out[k] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, out[k]);
      gl.bufferData(gl.ARRAY_BUFFER, data[k], gl.STATIC_DRAW);
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
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
    return a;
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
    },
    onRemove() {
      free(buf.mesh, ["pos", "nrm", "col"]);
      free(buf.thin, ["pos", "nrm", "col"]);
      free(buf.glass, ["pos", "nrm", "col"]);
      free(buf.screen, ["pos", "nrm", "col"]);
      free(buf.haze, ["pos", "nrm", "col"]);
      free(buf.veil, ["pos", "nrm", "col"]);
      free(buf.cull, ["pos", "nrm", "col"]);
      free(buf.rib, ["pos", "off"]);
      buf.veil = null;
      buf.cull = null;
      buf.mesh = null;
      buf.thin = null;
      buf.glass = null;
      buf.screen = null;
      buf.haze = null;
      buf.rib = null;
      if (gl) {
        if (solid) gl.deleteProgram(solid.p);
        if (ribbon) gl.deleteProgram(ribbon.p);
        if (culler) gl.deleteProgram(culler.p);
      }
      map = null;
    },
    render(g, args) {
      if (mesh) {
        free(buf.mesh, ["pos", "nrm", "col"]);
        free(buf.thin, ["pos", "nrm", "col"]);
        free(buf.glass, ["pos", "nrm", "col"]);
        free(buf.screen, ["pos", "nrm", "col"]);
        free(buf.haze, ["pos", "nrm", "col"]);
        free(buf.veil, ["pos", "nrm", "col"]);
        free(buf.cull, ["pos", "nrm", "col"]);
        buf.veil = mesh.veil?.count ? upload(mesh.veil, ["pos", "nrm", "col"]) : null;
        buf.cull = mesh.cull?.count ? upload(mesh.cull, ["pos", "nrm", "col"]) : null;
        buf.mesh = mesh.count ? upload(mesh, ["pos", "nrm", "col"]) : null;
        buf.thin = mesh.thin?.count ? upload(mesh.thin, ["pos", "nrm", "col"]) : null;
        buf.glass = mesh.glass?.count ? upload(mesh.glass, ["pos", "nrm", "col"]) : null;
        buf.screen = mesh.screen?.count ? upload(mesh.screen, ["pos", "nrm", "col"]) : null;
        buf.haze = mesh.haze?.count ? upload(mesh.haze, ["pos", "nrm", "col"]) : null;
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
      if (!buf.mesh && !buf.thin && !buf.glass && !buf.screen && !buf.haze && !buf.veil && !buf.cull && !buf.rib) return;
      const enabled = [];

      // 形（壁・段・橋）。手すり（thin）は奥行きを書かずに描く：段や壁には隠れるが、あとで描くルートの線を支柱で途切れさせない。
      // 穴あきの金属板（screen）・金網の網の面（haze）・ガラスの手すりの板（glass）は最後に半透明で重ねる（奥行きは書かない）
      // 詳細モードの殻（cull）は形と同じく奥行きを書く（中からは裏の面になって描かれない）。白い格子の手すり（veil）は半透明
      const cam = buf.cull ? cameraOf(M) : null;
      [[buf.mesh, true, 1], [cam ? buf.cull : null, true, 1, true], [buf.thin, false, 1], [buf.screen, false, SCREEN_ALPHA], [buf.veil, false, VEIL_ALPHA], [buf.haze, false, HAZE_ALPHA], [buf.glass, false, GLASS_ALPHA]].forEach(([b, writeDepth, alpha, culled]) => {
        if (!b) return;
        const prog = culled ? culler : solid;
        gl.useProgram(prog.p);
        gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
        gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
        gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
        gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
        gl.uniform1f(prog.loc("u_alpha"), alpha);
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
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
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
  };
  const bind = (key, name, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
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
 * @param frame  () => { solid, glass }（いまの扉の板。solid は枠、glass はガラス。どちらも Mesh の result）か null
 */
export function createDoorsLayer({ id = DOORS_LAYER_ID, light, exaggeration = 1, frame }) {
  let map = null;
  let gl = null;
  let prog = null;
  const bufs = {};
  let lt = lightState(light);
  const put = (key, data) => {
    if (!bufs[key]) bufs[key] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  };
  const bind = (key, name, size) => {
    const a = prog.att(name);
    if (a < 0) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key]);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
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
        if (prog) gl.deleteProgram(prog.p);
      }
      map = null;
    },
    render(g, args) {
      const f = frame();
      if (!f || (!f.solid.count && !f.glass.count)) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
      gl.uniform3fv(prog.loc("u_lightpos"), lt.pos);
      gl.uniform1f(prog.loc("u_lightintensity"), lt.intensity);
      gl.uniform3fv(prog.loc("u_lightcolor"), lt.color);
      const draw = (mesh, key, alpha) => {
        put(key + "p", mesh.pos);
        put(key + "n", mesh.nrm);
        put(key + "c", mesh.col);
        const on = [bind(key + "p", "a_pos", 3), bind(key + "n", "a_normal", 3), bind(key + "c", "a_color", 4)];
        gl.uniform1f(prog.loc("u_alpha"), alpha);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        on.forEach((a) => a >= 0 && gl.disableVertexAttribArray(a));
      };
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      if (f.solid.count) draw(f.solid, "s", 1);
      // ガラスは半透明で重ねる（奥行きは書かない。建物のガラスと同じ濃さ）
      if (f.glass.count) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        draw(f.glass, "g", GLASS_ALPHA);
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
