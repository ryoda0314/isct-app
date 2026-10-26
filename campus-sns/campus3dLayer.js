// MapLibre の独自レイヤー（WebGL）で、手で足した構造物（壁・橋など）と、橋の上を通るルートを描く。
// 形は campus3dMesh.js。地形と同じ「海抜の標高(m)」で置くので、地面や建物とのかぶり方（奥行き）も正しくなる
import { MERC_SCALE, ORIGIN } from "./campus3dMesh.js";

export const EXTRAS_LAYER_ID = "cb-extras";

// 光の当て方は MapLibre の fill-extrusion と同じ式（建物と同じ見え方にする）
const VS_SOLID = `
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform vec3 u_lightpos;
uniform float u_lightintensity;
uniform vec3 u_lightcolor;
varying vec4 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  vec4 color = a_color;
  float colorvalue = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color += vec4(0.03, 0.03, 0.03, 1.0);
  float directional = clamp(dot(a_normal, u_lightpos), 0.0, 1.0);
  directional = mix(1.0 - u_lightintensity, max(1.0 - colorvalue + u_lightintensity, 1.0), directional);
  v_color = vec4(clamp(color.rgb * directional * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0)), 1.0);
}`;
const FS_SOLID = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;
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

function compile(gl, vs, fs) {
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
function matrixFor(m, worldSize, exaggeration) {
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

/**
 * @param light  { position: [r, 方位, 仰角], intensity, color }（スタイルの light と同じ値。setLight で差し替える）
 * @param route  { width: (zoom) => px, casing: (zoom) => px, color, casingColor }
 */
export function createExtrasLayer({ light, route, exaggeration = 1 }) {
  let map = null;
  let gl = null;
  let solid = null;
  let ribbon = null;
  const buf = { mesh: null, thin: null, rib: null };
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
    },
    onRemove() {
      free(buf.mesh, ["pos", "nrm", "col"]);
      free(buf.thin, ["pos", "nrm", "col"]);
      free(buf.rib, ["pos", "off"]);
      buf.mesh = null;
      buf.thin = null;
      buf.rib = null;
      if (gl) {
        if (solid) gl.deleteProgram(solid.p);
        if (ribbon) gl.deleteProgram(ribbon.p);
      }
      map = null;
    },
    render(g, args) {
      if (mesh) {
        free(buf.mesh, ["pos", "nrm", "col"]);
        free(buf.thin, ["pos", "nrm", "col"]);
        buf.mesh = mesh.count ? upload(mesh, ["pos", "nrm", "col"]) : null;
        buf.thin = mesh.thin?.count ? upload(mesh.thin, ["pos", "nrm", "col"]) : null;
        mesh = null;
      }
      if (rib) {
        free(buf.rib, ["pos", "off"]);
        buf.rib = rib.count ? upload(rib, ["pos", "off"]) : null;
        rib = null;
      }
      if (!buf.mesh && !buf.thin && !buf.rib) return;
      const ws = map.transform.worldSize;
      const M = matrixFor(args.modelViewProjectionMatrix, ws, exaggeration);
      const enabled = [];

      // 形（壁・段・橋）。手すり（thin）は奥行きを書かずに描く：段や壁には隠れるが、あとで描くルートの線を支柱で途切れさせない
      [[buf.mesh, true], [buf.thin, false]].forEach(([b, writeDepth]) => {
        if (!b) return;
        gl.useProgram(solid.p);
        gl.uniformMatrix4fv(solid.loc("u_matrix"), false, M);
        gl.uniform3fv(solid.loc("u_lightpos"), lt.pos);
        gl.uniform1f(solid.loc("u_lightintensity"), lt.intensity);
        gl.uniform3fv(solid.loc("u_lightcolor"), lt.color);
        enabled.push(bindAttr(solid, "a_pos", b.pos, 3), bindAttr(solid, "a_normal", b.nrm, 3), bindAttr(solid, "a_color", b.col, 4));
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
 * @param frame  () => { surface, tunnel, count }（いまの車両の形。surface は地上、tunnel はトンネルの中、count は走っている列車の数）
 */
export function createTrainsLayer({ light, exaggeration = 1, frame }) {
  let map = null;
  let gl = null;
  let prog = null;
  let timer = 0;
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
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS_TRAIN, FS_SOLID);
    },
    onRemove() {
      clearTimeout(timer);
      timer = 0;
      if (gl) {
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b));
        if (prog) gl.deleteProgram(prog.p);
      }
      map = null;
    },
    render(g, args) {
      const f = frame();
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
        gl.depthMask(false);
        gl.depthFunc(gl.GREATER);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        draw(f.tunnel, "tunnel", 0.38);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
}
