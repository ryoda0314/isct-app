// 雨・雪（デジタルツインの芯 3 の描き方。2026-11-10）：MapLibre の独自レイヤーで、カメラのまわりの箱の中に粒を降らせる。
// 粒は世界に固定した位置（箱の大きさでくり返す）なので、カメラを動かしても粒はついてこない。雨は落ちる向き（風で斜め）に伸びた細い線、
// 雪はゆれながら落ちる小さな丸。屋根の高さの地図（buildCoverMap：歩くときの当たり判定 walkWorld の coverAt）より下には描かない
// ＝屋根・ひさし・橋の下には降らない。強さ（mm/h）で粒の数、風で斜め・流れ。
// 2026-11-10 斜めすぎを直す：粒ごとに大きさ（Marshall–Palmer の中央の直径のまわり）→ 落ちる速さ（Atlas の式。大きい粒ほど速くまっすぐ）、
// 横は地面近くの風（天気の風は開けた高いところの値。キャンパスの中の目の高さでは 0.45 倍ほど＝推定。高いほど強い）＋突風（演出）
import { PER_M, cameraOf, compile, matrixFor } from "./campus3dLayer.js";

export const PRECIP_LAYER_ID = "cb-precip";
const N_MAX = 18000;
const DEG = Math.PI / 180;

// 雨の強さ R（mm/h）の粒の大きさ：体積の中央の直径（mm。Marshall–Palmer 分布 Λ = 4.1 R^-0.21 → D0 = 3.67/Λ）
export const dropSize = (R) => 0.895 * Math.max(0.05, R) ** 0.21;
// 直径 D（mm）の雨粒の落ちる速さ（m/s。Atlas ほか 1973）
export const dropSpeed = (D) => Math.max(0.6, 9.65 - 10.3 * Math.exp(-0.6 * D));
// 高さ h（m。地面から）の風：天気の風 U（開けた高いところ）を、建物・木のあるキャンパスの中の風に（べき 0.27、目の高さ 2m で 0.45 倍。推定）
export const windAt = (U, h) => U * Math.min(1, 0.45 * (Math.max(2, h) / 2) ** 0.27);
// 突風：平均のまわりで 0.6〜1.4 倍ほど（いくつかの周期を足す。演出）。t は秒
export const gustAt = (t) => 1 + 0.2 * Math.sin(0.37 * t) + 0.12 * Math.sin(0.93 * t + 1.7) + 0.06 * Math.sin(2.3 * t + 0.4);
// 雨粒が鉛直から傾く角（度）：横の風 u（m/s）と落ちる速さ
export const rainTilt = (u, v) => (Math.atan2(u, v) * 180) / Math.PI;

/**
 * 屋根の高さの地図：walkWorld の coverAt を step m の升目で。画面を止めないよう chunk 升ずつ計算して onDone(cover)。
 * cover = { x0, y0, step, nx, ny, base, data（RGBA：基準 base からの高さ 5cm 単位の上位・下位、a は屋根があれば 255）, H（高さ。なければ -Infinity） }
 * @returns やめる関数
 */
export function buildCoverMap(world, [x0, y0, x1, y1], step = 2, { chunk = 15000, onDone, onProgress } = {}) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const ny = Math.max(1, Math.ceil((y1 - y0) / step));
  const H = new Float32Array(nx * ny).fill(-Infinity);
  let i = 0;
  let stop = false;
  const run = () => {
    if (stop) return;
    const end = Math.min(nx * ny, i + chunk);
    for (; i < end; i++) {
      const gx = i % nx;
      const gy = Math.floor(i / nx);
      H[i] = world.coverAt(x0 + (gx + 0.5) * step, y0 + (gy + 0.5) * step);
    }
    if (i < nx * ny) {
      onProgress?.(i / (nx * ny));
      setTimeout(run, 0);
      return;
    }
    let base = Infinity;
    for (const h of H) if (Number.isFinite(h) && h < base) base = h;
    base = Number.isFinite(base) ? base - 1 : 0;
    const data = new Uint8Array(nx * ny * 4);
    for (let k = 0; k < H.length; k++) {
      const h = H[k];
      if (!Number.isFinite(h)) continue;
      const v = Math.max(0, Math.min(65535, Math.round((h - base) / 0.05)));
      data[k * 4] = v >> 8;
      data[k * 4 + 1] = v & 255;
      data[k * 4 + 3] = 255;
    }
    onDone?.({ x0, y0, step, nx, ny, base, data, H });
  };
  setTimeout(run, 0);
  return () => {
    stop = true;
  };
}
// 地図の点（m）の屋根の高さ（なければ -Infinity）
export function coverHeight(cover, x, y) {
  if (!cover) return -Infinity;
  const gx = Math.floor((x - cover.x0) / cover.step);
  const gy = Math.floor((y - cover.y0) / cover.step);
  if (gx < 0 || gy < 0 || gx >= cover.nx || gy >= cover.ny) return -Infinity;
  return cover.H[gy * cover.nx + gx];
}

const VS = `
attribute vec4 a_seed;   // 箱の中の位置（0〜1）・乱数
attribute vec2 a_corner; // 横（-1・1）・頭から尾（0〜1）
uniform mat4 u_matrix;
uniform vec3 u_camM;     // カメラ（東・北・上 m。描く座標の原点から）
uniform vec2 u_perM;     // 描く座標で東へ 1m・北へ 1m
uniform vec3 u_box;      // 箱の大きさ（m）
uniform vec2 u_drift;    // 風で流れた量（東・北 m。突風も積んだもの）
uniform vec2 u_windNow;  // いまの横の風（東・北 m/s）
uniform float u_time;
uniform vec2 u_drop;     // 雨：粒の中央の直径（mm）・雪：落ちる速さ（m/s）
uniform float u_blur;    // 雨の線の長さ＝速さ × u_blur（秒。目・カメラのぶれ）
uniform float u_len;     // 雪の大きさ（m）
uniform float u_mode;    // 0 雨・1 雪
uniform float u_count;   // 見せる粒の割合（強さ）
varying vec3 v_m;
varying float v_a;
varying vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  if (a_seed.w > u_count) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_m = vec3(0.0);
    v_a = 0.0;
    return;
  }
  // 粒ごとの大きさ → 落ちる速さ（小さい粒は遅く、風に流されて斜め。大きい粒は速くまっすぐ・明るい）
  float r2 = fract(a_seed.x * 97.31 + a_seed.y * 41.17 + a_seed.z * 13.73 + a_seed.w * 7.19);
  float vz;
  float bright = 1.0;
  if (u_mode < 0.5) {
    float D = u_drop.x * (0.45 + 1.1 * r2);
    vz = max(0.6, 9.65 - 10.3 * exp(-0.6 * D));
    bright = clamp(0.45 + 0.55 * D / max(u_drop.x, 0.1), 0.45, 1.3);
  } else vz = u_drop.y * (0.7 + 0.7 * r2);
  vec3 S = u_box;
  vec3 p0 = a_seed.xyz * S + vec3(u_drift, -vz * u_time);
  vec3 local = fract((p0 - u_camM) / S + 0.5) * S - 0.5 * S;
  if (u_mode > 0.5) {
    float ph = a_seed.w * 40.0;
    local.x += sin(u_time * 0.9 + ph) * 0.35;
    local.y += cos(u_time * 0.7 + ph * 1.3) * 0.35;
  }
  vec3 p = u_camM + local;
  float dist = max(0.3, length(local));
  vec3 toCam = -local / dist;
  vec3 q;
  if (u_mode < 0.5) {
    vec3 vel = vec3(u_windNow, -vz);
    vec3 dirS = normalize(vel);
    vec3 side = normalize(cross(dirS, toCam) + vec3(1e-5, 0.0, 0.0));
    float w = max(0.005, dist * 0.0011);
    q = p - dirS * (length(vel) * u_blur) * a_corner.y + side * w * a_corner.x;
    v_a = (1.0 - 0.75 * a_corner.y) * bright;
  } else {
    vec3 side = normalize(cross(vec3(0.0, 0.0, 1.0), toCam) + vec3(1e-5, 0.0, 0.0));
    vec3 up2 = cross(toCam, side);
    float sz = max(u_len, dist * 0.0016);
    q = p + side * sz * a_corner.x + up2 * sz * (a_corner.y * 2.0 - 1.0);
    v_uv = vec2(a_corner.x, a_corner.y * 2.0 - 1.0);
    v_a = 1.0;
  }
  // 箱のふちで薄く（くり返しの境目を見せない）。目のすぐ前の粒も薄く（大きな線・丸に見える）
  vec3 r = abs(local) / S;
  v_a *= (1.0 - smoothstep(0.32, 0.5, max(r.x, max(r.y, r.z)))) * smoothstep(0.8, 2.2, dist);
  v_m = q;
  gl_Position = u_matrix * vec4(q.x * u_perM.x, -q.y * u_perM.y, q.z, 1.0);
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_cover;
uniform vec4 u_coverRect; // 西端・南端・幅・高さ（m）
uniform vec2 u_coverBase; // 基準の高さ・地図があるか
uniform vec4 u_color;
uniform float u_mode;
varying vec3 v_m;
varying float v_a;
varying vec2 v_uv;
void main() {
  if (u_coverBase.y > 0.5) {
    vec2 uv = (v_m.xy - u_coverRect.xy) / u_coverRect.zw;
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec4 c = texture2D(u_cover, uv);
      if (c.a > 0.5) {
        float h = (floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5)) * 0.05 + u_coverBase.x;
        if (v_m.z < h + 0.05) discard;
      }
    }
  }
  float a = u_color.a * v_a;
  if (u_mode > 0.5) a *= smoothstep(1.0, 0.35, length(v_uv));
  if (a < 0.004) discard;
  gl_FragColor = vec4(u_color.rgb * a, a);
}`;

/**
 * 雨・雪のレイヤー。setEnv(env, look)・setCover(屋根の高さの地図) で状態を渡す。地図の中の座標（m）は描く座標を東・北それぞれ 1m の長さで割ったもの
 * （campus3dFeatures の toXY とほぼ同じ。キャンパスの端で数十 cm）
 */
export function createPrecipLayer() {
  let map = null;
  let gl = null;
  let prog = null;
  let pbuf = null;
  let coverTex = null;
  let cover = null;
  let coverDirty = false;
  let st = null;
  // 風で流れた量（m）と、いまの横の風（m/s）。時間が 1800 秒で戻るときに 0 に戻す
  const drift = [0, 0];
  const windNow = [0, 0];
  let lastTime = 0;
  let lastNow = 0;
  // 描く座標の東へ 1m・北へ 1m の長さ（地図の m＝campus3dFeatures の toXY と同じ向き・大きさにそろえる）
  const perM = [Math.hypot(PER_M.e[0], PER_M.e[1]), Math.hypot(PER_M.n[0], PER_M.n[1])];
  const layer = {
    id: PRECIP_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS, FS);
      // 粒：1 粒 6 頂点（頭・尾の帯の四角）。位置は乱数で決まった並び
      const data = new Float32Array(N_MAX * 6 * 6);
      let seed = 4242;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const C = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
      for (let i = 0; i < N_MAX; i++) {
        const s = [rnd(), rnd(), rnd(), rnd()];
        for (let k = 0; k < 6; k++) data.set([...s, ...C[k]], (i * 6 + k) * 6);
      }
      pbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      coverTex = gl.createTexture();
      coverDirty = !!cover;
    },
    onRemove() {
      if (gl) {
        if (pbuf) gl.deleteBuffer(pbuf);
        if (coverTex) gl.deleteTexture(coverTex);
        if (prog) gl.deleteProgram(prog.p);
      }
      map = null;
      gl = null;
    },
    render(g, args) {
      if (!st || !st.count || !map) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, 1);
      const cam = cameraOf(M);
      if (!cam) return;
      const camM = [cam[0] / perM[0], -cam[1] / perM[1], cam[2]];
      if (coverDirty && cover) {
        gl.bindTexture(gl.TEXTURE_2D, coverTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cover.nx, cover.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, cover.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        coverDirty = false;
      }
      // 箱：カメラが高いほど大きく（上から見ているときも降って見える）
      const alt = Math.max(0, cam[2] - (st.ground ?? cam[2] - 1.6));
      const sxy = Math.min(500, Math.max(46, alt * 1.4));
      const sz = Math.min(400, Math.max(30, alt * 1.1));
      // 横の風：カメラの高さの風（目の高さは弱い）× 突風、向きも少しゆれる。流れた量を積む
      const nowS = performance.now() / 1000;
      const time = nowS % 1800;
      if (time < lastTime) drift[0] = drift[1] = 0;
      const dt = lastNow ? Math.min(0.1, Math.max(0, nowS - lastNow)) : 0;
      lastTime = time;
      lastNow = nowS;
      const U = windAt(st.wind, alt) * (st.wind > 0 ? gustAt(nowS) : 0);
      const ang = st.windTo + 0.1 * Math.sin(0.21 * nowS + 0.5);
      windNow[0] = Math.sin(ang) * U;
      windNow[1] = Math.cos(ang) * U;
      drift[0] += windNow[0] * dt;
      drift[1] += windNow[1] * dt;
      const p = prog;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(p.loc("u_matrix"), false, M);
      gl.uniform3fv(p.loc("u_camM"), camM);
      gl.uniform2f(p.loc("u_perM"), perM[0], perM[1]);
      gl.uniform3f(p.loc("u_box"), sxy, sxy, sz);
      gl.uniform2fv(p.loc("u_drift"), drift);
      gl.uniform2fv(p.loc("u_windNow"), windNow);
      gl.uniform1f(p.loc("u_time"), time);
      gl.uniform2fv(p.loc("u_drop"), st.drop);
      gl.uniform1f(p.loc("u_blur"), 0.1 * (1 + alt / 120));
      gl.uniform1f(p.loc("u_len"), st.len * (1 + alt / 120));
      gl.uniform1f(p.loc("u_mode"), st.mode);
      gl.uniform1f(p.loc("u_count"), st.count);
      gl.uniform4fv(p.loc("u_color"), st.color);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.uniform1i(p.loc("u_cover"), 0);
      if (cover) {
        gl.uniform4f(p.loc("u_coverRect"), cover.x0, cover.y0, cover.nx * cover.step, cover.ny * cover.step);
        gl.uniform2f(p.loc("u_coverBase"), cover.base, 1);
      } else gl.uniform2f(p.loc("u_coverBase"), 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
      const as = p.att("a_seed");
      const ac = p.att("a_corner");
      gl.enableVertexAttribArray(as);
      gl.vertexAttribPointer(as, 4, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ac, 2, gl.FLOAT, false, 24, 16);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, N_MAX * 6);
      gl.depthMask(true);
      gl.disableVertexAttribArray(as);
      gl.disableVertexAttribArray(ac);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
  // 状態：env（campus3dEnv）・look（campus3dSky。夜は暗い粒）・ground（カメラの下の地面の高さ。なければカメラ − 1.6m）
  layer.setEnv = (env, look, ground = null) => {
    const W = env?.weather || {};
    const known = W && W.src !== "unknown";
    const rain = known ? Math.max(0, Number(W.rain) || 0) : 0;
    const snow = known ? Math.max(0, Number(W.snow) || 0) : 0;
    const to = (((Number(W.windDir) || 0) + 180) % 360) * DEG;
    const wind = known ? Math.max(0, Number(W.wind) || 0) : 0;
    const night = look?.f?.night || 0;
    if (rain <= 0.02 && snow <= 0.02) {
      st = null;
      return;
    }
    // 風（wind：天気の風 m/s、windTo：吹いていく向き）は描くときにカメラの高さの風・突風にする
    if (snow > rain) {
      st = {
        mode: 1, ground, wind, windTo: to,
        drop: [0, 1.0], // 雪片の落ちる速さ 1m/s ほど（粒ごとに 0.7〜1.4 倍）
        len: 0.018,
        count: Math.min(1, 0.12 + snow / 4),
        color: [0.97 - 0.45 * night, 0.98 - 0.45 * night, 1 - 0.4 * night, 0.85],
      };
    } else {
      st = {
        mode: 0, ground, wind, windTo: to,
        drop: [dropSize(rain), 0],
        len: 0,
        count: Math.min(1, 0.07 + rain / 35),
        color: [0.78 - 0.3 * night, 0.82 - 0.3 * night, 0.9 - 0.28 * night, 0.32 + Math.min(0.2, rain / 150)],
      };
    }
    map?.triggerRepaint();
  };
  layer.setCover = (c) => {
    cover = c;
    coverDirty = true;
    map?.triggerRepaint();
  };
  layer.cover = () => cover;
  return layer;
}
