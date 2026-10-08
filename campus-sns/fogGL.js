// 水曇りの描画。fogSim.js の bytes（マスごとの曇り・縁の水・拭いた跡）と水滴を、結露の質感つきで描く。
// 出力は premultiplied alpha。WebGL が使えないときは createFogRenderer2D（白い膜と水滴だけ）。

// ── 質感テクスチャ（初回だけ CPU で作って使い回す） ──
const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 繰り返せる value noise。R: 大きなむら、G: 中くらい、B: 細かい、A: ばらばら
function makeNoise(size) {
  const rnd = mulberry32(11);
  const chan = (base, octaves) => {
    const out = new Float32Array(size * size);
    for (let o = 0, amp = 1; o < octaves; o++, amp *= 0.5) {
      const p = base << o, lat = new Float32Array(p * p), s = p / size;
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
        const j0 = (y0 % p) * p, j1 = ((y0 + 1) % p) * p;
        for (let x = 0; x < size; x++) {
          const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const i0 = x0 % p, i1 = (x0 + 1) % p;
          const a = lat[j0 + i0], b = lat[j0 + i1], c = lat[j1 + i0], d = lat[j1 + i1];
          out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
    return out;
  };
  const ch = [chan(4, 4), chan(8, 3), chan(32, 2), chan(size, 1)];
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 4; c++) px[i * 4 + c] = ch[c][i] * 255 + 0.5;
  return px;
}

// 結露の粒を敷き詰めたタイル（端はつながる）。R,G: 法線、B: 高さ、A: その粒が現れる曇りの濃さ（粒のない所は 1）
function makeDroplets(size) {
  const rnd = mulberry32(7);
  const N = size * size;
  const H = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), TH = new Float32Array(N).fill(1);
  const B = 32, nb = size / B, bucket = Array.from({ length: nb * nb }, () => []);
  for (let k = 0; k < 30000; k++) {
    const u = rnd(), r = 1.5 + 9 * u * u * u, x = rnd() * size, y = rnd() * size;
    const bx = Math.floor(x / B), by = Math.floor(y / B);
    let ok = true;
    for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) {
      for (const o of bucket[((by + j + nb) % nb) * nb + ((bx + i + nb) % nb)]) {
        let dx = Math.abs(o.x - x), dy = Math.abs(o.y - y);
        if (dx > size / 2) dx = size - dx;
        if (dy > size / 2) dy = size - dy;
        const m = (o.r + r) * 0.95 + 0.6;
        if (dx * dx + dy * dy < m * m) { ok = false; break; }
      }
    }
    if (!ok) continue;
    bucket[by * nb + bx].push({ x, y, r });
    // 小さい粒ほど薄い曇りで現れ、大きい粒は濃くなってから現れる
    const th = Math.min(0.97, Math.max(0.04, 0.05 + 0.55 * rnd() + (0.35 * (r - 1.5)) / 9));
    const ri = Math.ceil(r), cx = Math.floor(x), cy = Math.floor(y);
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const ox = cx + dx + 0.5 - x, oy = cy + dy + 0.5 - y, d2 = (ox * ox + oy * oy) / (r * r);
      if (d2 >= 1) continue;
      const n = ((cy + dy + size) % size) * size + ((cx + dx + size) % size), hh = Math.sqrt(1 - d2);
      if (hh > H[n]) { H[n] = hh; NX[n] = ox / r; NY[n] = oy / r; TH[n] = th; }
    }
  }
  const px = new Uint8Array(N * 4);
  for (let n = 0; n < N; n++) {
    px[n * 4] = (NX[n] * 0.5 + 0.5) * 255 + 0.5;
    px[n * 4 + 1] = (NY[n] * 0.5 + 0.5) * 255 + 0.5;
    px[n * 4 + 2] = H[n] * 255 + 0.5;
    px[n * 4 + 3] = TH[n] * 255 + 0.5;
  }
  return px;
}

let TEX = null;
const NOISE_SIZE = 128, DROP_SIZE = 512;
const textures = () => (TEX ||= { noise: makeNoise(NOISE_SIZE), drops: makeDroplets(DROP_SIZE) });

// ── シェーダー ──
const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
vec4 over(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }
`;

const VS_FULL = `attribute vec2 aPos;
uniform vec2 uView;
varying vec2 vPx;
void main() {
  vPx = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5) * uView;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS_FOG = HEAD + `
uniform sampler2D uField;
uniform sampler2D uNoise;
uniform sampler2D uDrop;
uniform vec2 uView;      // 画面（CSS px）
uniform vec2 uFieldPx;   // マス目全体（CSS px）
uniform vec2 uTexel;     // マス 1 つ（uv）
uniform vec2 uLight;     // 光の来る向き（画面上、y は下向き）
uniform float uOpacity;
varying vec2 vPx;
const vec3 FOG = vec3(0.935, 0.952, 0.97);
const vec3 SHADE = vec3(0.28, 0.34, 0.43);

// 粒 1 つの見た目。光の側にきらめき、反対の縁が暗く、内側に集まった光
vec4 bead(vec4 D, float k, float big) {
  vec2 n = D.rg * 2.0 - 1.0;
  float h = D.b;
  float face = dot(n, uLight);
  vec3 N = normalize(vec3(n, 0.3 + 1.5 * h));
  vec3 H = normalize(vec3(uLight, 1.6));
  float spec = pow(max(dot(N, H), 0.0), mix(60.0, 110.0, big)) * smoothstep(0.08, 0.35, h);
  float ring = smoothstep(0.55, 0.1, h) * smoothstep(0.0, 0.08, h);
  float dark = ring * (0.3 + 0.7 * max(-face, 0.0)) * mix(0.38, 0.6, big);
  float caus = smoothstep(0.1, 0.8, -face) * smoothstep(0.2, 0.5, h) * (1.0 - smoothstep(0.6, 0.95, h)) * mix(0.18, 0.38, big);
  vec4 c = vec4(SHADE * dark, dark);
  c = over(vec4(vec3(caus), caus), c);
  c = over(vec4(vec3(spec), spec), c);
  return c * k;
}

void main() {
  vec2 uv = vPx / uFieldPx;
  vec4 F = texture2D(uField, uv);
  float fog = F.r;
  float ex = texture2D(uField, uv + vec2(uTexel.x, 0.0)).r - fog;
  float ey = texture2D(uField, uv + vec2(0.0, uTexel.y)).r - fog;
  float edge = clamp(length(vec2(ex, ey)) * 4.0, 0.0, 1.0);

  // 縁をぎざぎざに（中くらいの濃さの所だけ揺らす）、むらと画面の端ほど濃い
  float blot = texture2D(uNoise, vPx / 760.0).r * 0.6 + texture2D(uNoise, vPx / 190.0 + vec2(0.31, 0.67)).g * 0.4;
  float fine = texture2D(uNoise, vPx / 24.0 + vec2(0.13, 0.41)).b;
  float d = clamp(fog + (fine - 0.5) * 2.0 * fog * (1.0 - fog), 0.0, 1.0);
  vec2 q = vPx / uView - vec2(0.5, 0.45);
  float vign = smoothstep(0.35, 0.85, length(q * vec2(1.25, 1.0)));
  d = clamp(d * (0.86 + 0.24 * blot + 0.1 * vign), 0.0, 1.0);

  // 細かい粒（2 枚を重ねて繰り返しを隠す。拭いた跡はひと回り細かい粒で曇り直す）
  float sc = 1.0 + 0.6 * F.b;
  vec4 D1 = texture2D(uDrop, vPx * sc / 230.0);
  vec4 D2 = texture2D(uDrop, mat2(0.8, -0.6, 0.6, 0.8) * vPx * sc / 160.0 + 0.5);
  vec4 D = D1.b > D2.b ? D1 : D2;
  float vis = smoothstep(D.a - 0.12, D.a, d) * smoothstep(0.0, 0.12, D.b);

  float haze = min(d * uOpacity * (1.0 - 0.12 * F.b) * (1.0 - 0.3 * vis * D.b), 0.97);
  vec4 col = vec4(FOG * haze, haze);
  col = over(bead(D, vis * (0.55 + 0.45 * d), 0.0), col);

  // 拭いた縁に押し寄せた大粒（粒の中は曇りが薄い）
  vec4 R = texture2D(uDrop, vPx / 500.0 + vec2(0.23, 0.71));
  float rimAmt = clamp(F.g * 1.5 + edge * fog * 0.8, 0.0, 1.0);
  float rimVis = smoothstep(R.a - 0.1, R.a + 0.05, rimAmt) * smoothstep(0.0, 0.15, R.b);
  col *= 1.0 - rimVis * smoothstep(0.1, 0.6, R.b) * 0.55;
  col = over(bead(R, rimVis, 1.0), col);

  // 拭いた直後の濡れたつや（縦に流れるすじ）
  float wet = F.b * (1.0 - d);
  float streak = texture2D(uNoise, vec2(vPx.x / 7.0, vPx.y / 150.0)).g;
  float sheen = wet * (0.01 + 0.035 * smoothstep(0.6, 0.9, streak));
  col = over(vec4(vec3(sheen), sheen), col);
  gl_FragColor = col;
}`;

// 垂れる水滴・止まった粒（1 粒 = 四角 1 枚）。座標は x = 横、y = 重力の向き
const VS_DROP = `attribute vec2 aCorner;
attribute vec4 aDrop;    // x, y, 半径, 不透明度
attribute float aTail;   // 動いている水滴の尾の長さ（半径の何倍か）
uniform vec2 uView;
uniform vec2 uGrav;
varying vec2 vQ;
varying float vA;
varying float vR;
varying float vTail;
void main() {
  vec2 side = vec2(-uGrav.y, uGrav.x);
  vec2 q = vec2(aCorner.x * 1.3, aCorner.y > 0.0 ? 1.3 : -1.3 - aTail);
  vec2 p = aDrop.xy + (side * q.x + uGrav * q.y) * aDrop.z;
  vQ = q; vA = aDrop.w; vR = aDrop.z; vTail = aTail;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FS_DROP = HEAD + `
uniform vec2 uLightG;    // 光の来る向き（水滴の座標系）
uniform float uScale;    // 1 CSS px が何デバイス px か
varying vec2 vQ;
varying float vA;
varying float vR;
varying float vTail;
const vec3 SHADE = vec3(0.24, 0.3, 0.38);
void main() {
  vec2 q = vQ;
  // 下ぶくれ。動いているときは後ろ（上）に細く伸びる
  q.y = q.y < 0.0 ? q.y / (1.0 + vTail) : q.y * 1.06;
  float r = length(q);
  float aa = 1.6 / max(vR * uScale, 1.0);
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (inside <= 0.0) discard;
  float h = sqrt(max(1.0 - r * r, 0.0));
  float face = dot(q, uLightG);
  vec3 N = normalize(vec3(q, 0.25 + 1.3 * h));
  float spec = pow(max(dot(N, normalize(vec3(uLightG, 1.5))), 0.0), 90.0);
  spec += pow(max(dot(N, normalize(vec3(-uLightG * 0.6, 1.5))), 0.0), 40.0) * 0.22;
  float dark = smoothstep(0.62, 0.92, r) * (0.42 + 0.45 * max(-face, 0.0));
  float caus = smoothstep(0.1, 0.8, -face) * smoothstep(0.35, 0.65, r) * (1.0 - smoothstep(0.7, 0.9, r)) * 0.45;
  vec4 c = vec4(vec3(0.9, 0.94, 0.98) * 0.06, 0.06);
  c = over(vec4(SHADE * dark, dark), c);
  c = over(vec4(vec3(caus), caus), c);
  c = over(vec4(vec3(spec), min(spec, 1.0)), c);
  gl_FragColor = c * inside * vA;
}`;

const FLOATS_PER_VERT = 7;
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]];

// onRestore: GPU のリセットから戻ったとき（描き直してもらう）
export function createFogRenderer(canvas, { onRestore } = {}) {
  const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" };
  const gl = canvas.getContext("webgl2", opts) || canvas.getContext("webgl", opts);
  if (!gl) return null;
  let res = null, lost = false;
  let size = { w: 1, h: 1, scale: 1, gw: 1, gh: 1, cell: 1 }, field = null, fieldNew = false;
  let dropBuf = new Float32Array(64 * 6 * FLOATS_PER_VERT);

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const program = (vs, fs, attrs, unis) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const a = {}, u = {};
    for (const n of attrs) a[n] = gl.getAttribLocation(p, n);
    for (const n of unis) u[n] = gl.getUniformLocation(p, n);
    return { p, a, u };
  };
  const texture = (w, h, data, repeat) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  };

  const init = () => {
    const { noise, drops } = textures();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    res = {
      fog: program(VS_FULL, FS_FOG, ["aPos"], ["uField", "uNoise", "uDrop", "uView", "uFieldPx", "uTexel", "uLight", "uOpacity"]),
      drop: program(VS_DROP, FS_DROP, ["aCorner", "aDrop", "aTail"], ["uView", "uGrav", "uLightG", "uScale"]),
      quad: gl.createBuffer(),
      drops: gl.createBuffer(),
      noise: texture(NOISE_SIZE, NOISE_SIZE, noise, true),
      dropTex: texture(DROP_SIZE, DROP_SIZE, drops, true),
      field: null,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, res.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    fieldNew = true;
  };
  try { init(); } catch (e) { console.warn("[fog] WebGL init failed:", e?.message || e); return null; }

  // 失われている間は canvas を隠す（Chrome は失われた canvas に絵を出すことがある）
  const onLost = (e) => { e.preventDefault(); lost = true; canvas.style.visibility = "hidden"; };
  const onRestored = () => {
    try { init(); } catch { return; }
    lost = false;
    canvas.style.visibility = "";
    onRestore?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    resize(w, h, scale, gw, gh, cell) {
      size = { w, h, scale, gw, gh, cell };
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      fieldNew = true;
    },
    upload(bytes) {
      field = bytes;
      if (fieldNew || !res?.field || lost) return;  // 次の render で作り直す
      gl.bindTexture(gl.TEXTURE_2D, res.field);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size.gw, size.gh, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    },
    // drops: fogSim の水滴、light: 光の来る向き（画面）、grav: 重力の向き（単位ベクトル）
    render(drops, light, grav, opacity) {
      if (lost || !res || !field) return;
      if (fieldNew) {
        if (res.field) gl.deleteTexture(res.field);
        res.field = texture(size.gw, size.gh, field, false);
        fieldNew = false;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const f = res.fog;
      gl.disable(gl.BLEND);
      gl.useProgram(f.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.field);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.noise);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, res.dropTex);
      gl.uniform1i(f.u.uField, 0); gl.uniform1i(f.u.uNoise, 1); gl.uniform1i(f.u.uDrop, 2);
      gl.uniform2f(f.u.uView, size.w, size.h);
      gl.uniform2f(f.u.uFieldPx, size.gw * size.cell, size.gh * size.cell);
      gl.uniform2f(f.u.uTexel, 1 / size.gw, 1 / size.gh);
      gl.uniform2f(f.u.uLight, light.x, light.y);
      gl.uniform1f(f.u.uOpacity, opacity);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.quad);
      gl.enableVertexAttribArray(f.a.aPos);
      gl.vertexAttribPointer(f.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(f.a.aPos);

      if (!drops.length) return;
      const need = drops.length * 6 * FLOATS_PER_VERT;
      if (dropBuf.length < need) dropBuf = new Float32Array(need * 2);
      let o = 0;
      for (const d of drops) {
        const g = d.grow < 1 ? 1 - (1 - d.grow) * (1 - d.grow) : 1;
        const r = d.r * (0.45 + 0.55 * g), a = d.dying ? Math.max(0, d.alpha) : Math.min(1, 0.3 + g);
        const tail = d.moving && d.stuck <= 0 ? Math.min(0.7, d.v / 110) : 0;
        for (const [cx, cy] of CORNERS) {
          dropBuf[o++] = cx; dropBuf[o++] = cy;
          dropBuf[o++] = d.x; dropBuf[o++] = d.y; dropBuf[o++] = r; dropBuf[o++] = a;
          dropBuf[o++] = tail;
        }
      }
      const p = res.drop, stride = FLOATS_PER_VERT * 4;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(p.p);
      gl.uniform2f(p.u.uView, size.w, size.h);
      gl.uniform2f(p.u.uGrav, grav.x, grav.y);
      // 光を水滴の座標系（x = 横、y = 重力の向き）に直す
      gl.uniform2f(p.u.uLightG, light.x * -grav.y + light.y * grav.x, light.x * grav.x + light.y * grav.y);
      gl.uniform1f(p.u.uScale, size.scale);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.drops);
      gl.bufferData(gl.ARRAY_BUFFER, dropBuf.subarray(0, o), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(p.a.aCorner);
      gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(p.a.aDrop);
      gl.vertexAttribPointer(p.a.aDrop, 4, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(p.a.aTail);
      gl.vertexAttribPointer(p.a.aTail, 1, gl.FLOAT, false, stride, 24);
      gl.drawArrays(gl.TRIANGLES, 0, o / FLOATS_PER_VERT);
      gl.disableVertexAttribArray(p.a.aCorner);
      gl.disableVertexAttribArray(p.a.aDrop);
      gl.disableVertexAttribArray(p.a.aTail);
    },
    destroy() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

// WebGL がないとき：白い膜（マス目を拡大して描く）と水滴だけ
export function createFogRenderer2D(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const small = document.createElement("canvas"), sctx = small.getContext("2d");
  let size = { w: 1, h: 1, gw: 1, gh: 1, cell: 1 }, img = null, field = null;
  return {
    resize(w, h, _scale, gw, gh, cell) {
      size = { w, h, gw, gh, cell };
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      small.width = gw;
      small.height = gh;
      img = sctx.createImageData(gw, gh);
    },
    upload(bytes) { field = bytes; },
    render(drops, _light, _grav, opacity) {
      if (!field || !img) return;
      const d = img.data;
      for (let n = 0, N = size.gw * size.gh; n < N; n++) {
        d[n * 4] = 238; d[n * 4 + 1] = 242; d[n * 4 + 2] = 247;
        d[n * 4 + 3] = field[n * 4] * opacity;
      }
      sctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, size.gw * size.cell, size.gh * size.cell);
      for (const p of drops) {
        const r = p.r * (0.45 + 0.55 * Math.min(1, p.grow)), a = p.dying ? Math.max(0, p.alpha) : 1;
        if (r <= 0.5 || a <= 0) continue;
        const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,255,255,${0.75 * a})`);
        g.addColorStop(0.35, `rgba(255,255,255,${0.08 * a})`);
        g.addColorStop(0.8, `rgba(70,85,105,${0.12 * a})`);
        g.addColorStop(1, `rgba(70,85,105,${0.35 * a})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    destroy() {},
  };
}
