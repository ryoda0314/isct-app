// 雨粒は地図に固定した二つの範囲を落下する。粒径と風で軌跡が、距離と露光時間で細い雨筋の見え方が変わる。
// 近景は実際の路面・庇の高さで粒を止め、遠景はキャンパス全体の屋根地図と見通しを使う。濡れと波紋は campus3dRainGround。
import { PER_M, cameraOf, compile, matrixFor } from "./campus3dLayer.js";
import { createRainGround, RAIN_COVER } from "./campus3dRainGround.js";

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
export const gustAt = (t) =>
  1 + 0.2 * Math.sin(0.37 * t) + 0.12 * Math.sin(0.93 * t + 1.7) + 0.06 * Math.sin(2.3 * t + 0.4);
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
attribute vec4 a_seed;
attribute vec2 a_corner;
uniform mat4 u_matrix;
uniform vec3 u_eye, u_box;
uniform vec2 u_perM, u_drift, u_wind, u_drop;
uniform float u_time, u_lens, u_mode, u_snowSize, u_opacity;
varying vec3 v_m;
varying vec2 v_uv;
varying float v_a, v_glint;
void main() {
  if(u_mode>1.5) {
    // Integrate scattering along the view ray. Scene depth and roofs stop each interval.
    vec2 clip=vec2(a_corner.x,2.0*a_corner.y-1.0);
    vec3 metre=vec3(u_perM.x,-u_perM.y,1.0);
    vec3 rx=metre*vec3(u_matrix[0].x,u_matrix[1].x,u_matrix[2].x);
    vec3 ry=metre*vec3(u_matrix[0].y,u_matrix[1].y,u_matrix[2].y);
    vec3 rw=metre*vec3(u_matrix[0].w,u_matrix[1].w,u_matrix[2].w);
    vec3 ray=normalize(cross(rx-clip.x*rw,ry-clip.y*rw));
    ray*=sign(dot(ray,rw));
    float oblique=1.0/max(0.25,dot(ray,normalize(rw)));
    v_m=u_eye+ray*(a_seed.x*oblique);
    v_a=(1.0-exp(-a_seed.y*oblique*u_opacity))*(1.0-0.87*smoothstep(-0.04,0.53,ray.z));
    v_glint=0.0; v_uv=vec2(0.0);
    gl_Position=u_matrix*vec4(v_m.x*u_perM.x,-v_m.y*u_perM.y,v_m.z,1.0);
    return;
  }
  float sizeRank=fract(dot(a_seed,vec4(97.31,41.17,13.73,7.19)));
  float D=u_drop.x*(0.45+1.1*sizeRank);
  float speed=u_mode<0.5 ? max(0.6,9.65-10.3*exp(-0.6*D)) : u_drop.y*(0.7+0.7*sizeRank);
  float drag=u_mode<0.5 ? mix(1.10,0.91,sizeRank) : 1.0;
  vec3 track=a_seed.xyz*u_box+vec3(u_drift*drag,-speed*u_time);
  vec3 local=(fract((track-u_eye)/u_box+0.5)-0.5)*u_box;
  float dist=max(0.05,length(local));
  vec3 eyeDir=-local/dist;
  vec3 q=u_eye+local;
  v_uv=a_corner; v_glint=a_seed.w;
  if(u_mode<0.5) {
    vec3 velocity=vec3(u_wind*drag,-speed);
    vec3 across=normalize(cross(normalize(velocity),eyeDir)+vec3(0.00001,0.0,0.0));
    float px=dist/u_lens, diameter=D*0.001;
    float defocus=(1.0-smoothstep(0.75,3.3,dist))*0.003;
    float width=0.55*diameter+0.75*px+defocus;
    // Finite exposure, plus a subpixel coverage estimate. A distant drop gets fainter as its width shrinks.
    float exposure=0.022+0.018*a_seed.w;
    q+=across*width*a_corner.x-velocity*exposure*a_corner.y;
    v_a=u_opacity*min(1.0,(diameter*2.1+0.0011)/width)*(0.72+0.34*sizeRank);
    v_a*=smoothstep(0.48,1.45,dist);
  } else {
    float ph=a_seed.w*40.0;
    q.xy+=vec2(sin(u_time*0.9+ph),cos(u_time*0.7+ph*1.3))*0.35;
    vec3 across=normalize(cross(vec3(0.0,0.0,1.0),eyeDir)+vec3(0.00001,0.0,0.0));
    v_uv=vec2(a_corner.x,a_corner.y*2.0-1.0);
    q+=max(u_snowSize,dist*0.0016)*(across*v_uv.x+cross(eyeDir,across)*v_uv.y);
    v_a=u_opacity*smoothstep(0.8,2.2,dist);
  }
  vec3 edge=abs(local)/u_box;
  v_a*=1.0-smoothstep(0.32,0.50,max(edge.x,max(edge.y,edge.z)));
  v_m=q;
  gl_Position=u_matrix*vec4(q.x*u_perM.x,-q.y*u_perM.y,q.z,1.0);
}`;
const FS = `
precision highp float;
${RAIN_COVER}
uniform vec3 u_color;
uniform float u_mode;
varying vec3 v_m;
varying vec2 v_uv;
varying float v_a, v_glint;
void main() {
  if(v_m.z < rainTop(v_m.xy)+0.015) discard;
  float a=v_a;
  if(u_mode<0.5) {
    float t=v_uv.y;
    float width=(1.0-smoothstep(0.0,1.0,abs(v_uv.x)));
    float ends=smoothstep(0.0,0.15,t)*(1.0-smoothstep(0.62,1.0,t));
    float highlight=1.0-smoothstep(0.0,0.26,abs(t-0.22-0.28*v_glint));
    a*=width*ends*(0.65+0.35*highlight);
  } else if(u_mode<1.5) a*=1.0-smoothstep(0.35,1.0,length(v_uv));
  if(a<0.002) discard;
  gl_FragColor=vec4(u_color*a,a);
}`;

// One ordered random sample per instance lets drizzle submit fewer drops than a downpour.
export const rainAmount = (mm) => 1 - Math.exp(-0.225 * Math.sqrt(Math.max(0, mm)));
const skyRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function createPrecipLayer({ lite = false } = {}) {
  let map,
    gl,
    p,
    u,
    vao,
    mistVao,
    bands,
    seeds,
    corners,
    coverTex,
    near,
    cover = null,
    coverDirty = false;
  let paving = null,
    groundAt = null,
    roofAt = null,
    st = null,
    lastTime = 0,
    lastNow = 0;
  const drift = [0, 0],
    perM = [Math.hypot(...PER_M.e), Math.hypot(...PER_M.n)];
  let terrainPending = false,
    hadTerrain;
  const onTerrainTile = (event) => {
    if (event.sourceId === "cbDem" && event.sourceDataType === "content") terrainPending = true;
  };
  const layer = {
    id: PRECIP_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      map.on("sourcedata", onTerrainTile);
      const program = compile(gl, VS, FS);
      p = program.p;
      u = Object.fromEntries(
        [
          "matrix",
          "eye",
          "box",
          "perM",
          "drift",
          "wind",
          "drop",
          "time",
          "lens",
          "mode",
          "snowSize",
          "opacity",
          "color",
          "cover",
          "near",
          "coverRect",
          "coverBase",
          "patch",
        ].map((k) => [k, program.loc("u_" + k)]),
      );
      let seed = 4242;
      const values = new Float32Array(N_MAX * 4);
      for (let i = 0; i < values.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        values[i] = seed / 4294967296;
      }
      const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      seeds = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, seeds);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
      const at = program.att("a_seed");
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(at, 1);
      corners = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, corners);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const ac = program.att("a_corner");
      gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ac, 2, gl.FLOAT, false, 0, 0);
      mistVao = gl.createVertexArray();
      gl.bindVertexArray(mistVao);
      gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ac, 2, gl.FLOAT, false, 0, 0);
      bands = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bands);
      // Midpoints and lengths of depth intervals in metres, far to near.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([242, 96, 158, 72, 98, 48, 59, 30, 34, 20, 17, 14, 5, 10]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(at, 1);
      gl.bindVertexArray(prev);
      coverTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      coverDirty = !!cover;
    },
    onRemove() {
      map?.off("sourcedata", onTerrainTile);
      if (gl) {
        near?.remove();
        gl.deleteBuffer(seeds);
        gl.deleteBuffer(corners);
        gl.deleteBuffer(bands);
        gl.deleteVertexArray(mistVao);
        gl.deleteVertexArray(vao);
        gl.deleteTexture(coverTex);
        gl.deleteProgram(p);
      }
      near = null;
      map = null;
      gl = null;
    },
    setPaving(collection) {
      paving = collection;
      map?.triggerRepaint();
    },
    setSurface(ground, roof) {
      groundAt = ground;
      roofAt = roof;
    },
    setCover(c) {
      cover = c;
      coverDirty = true;
      map?.triggerRepaint();
    },
    cover: () => cover,
    setEnv(env, look, ground = null, horizon = null) {
      const w = env?.weather;
      if (!w || w.src === "unknown") {
        st = null;
        return;
      }
      const rain = Math.max(0, Number(w.rain) || 0),
        snow = Math.max(0, Number(w.snow) || 0);
      const wet = Math.min(1, Math.max(0, Number(w.wet) || 0)) * (1 - Math.min(1, Math.max(0, w.snowCover || 0)));
      if (rain <= 0.02 && snow <= 0.02 && wet < 0.01) {
        st = null;
        return;
      }
      const flake = snow > 0.02 && snow > rain,
        night = look?.f?.night || 0,
        rate = rain > 0.02 ? rainAmount(rain) : 0;
      const sky = horizon || skyRGB(look?.sky?.horizon || "#aeb9c0");
      st = {
        flake,
        wet: flake ? 0 : wet,
        ground,
        rate,
        extinction: (3.5 * Math.min(1, rate * 1.7)) / Math.max(140, Number(w.fog) || 12000),
        amount: flake ? Math.min(1, 0.12 + snow / 4) : rate,
        drop: flake ? [0, 1] : [dropSize(rain), 0],
        sky,
        wind: Math.max(0, Number(w.wind) || 0),
        to: ((Number(w.windDir) || 0) + 180) * DEG,
        color: flake
          ? [0.97 - 0.45 * night, 0.98 - 0.45 * night, 1 - 0.4 * night]
          : sky.map((v, i) => Math.min(0.99, 0.24 + 0.82 * v + 0.025 * i - 0.14 * night)),
      };
      map?.triggerRepaint();
    },
    render(g, args) {
      if (!st || !map) return;
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, 1),
        cam = cameraOf(M);
      if (!cam) return;
      const eye = [cam[0] / perM[0], -cam[1] / perM[1], cam[2]],
        alt = Math.max(0, cam[2] - (st.ground ?? cam[2] - 1.6));
      const local = !!groundAt && alt < 46 && (!st.flake || !!near),
        wet = st.wet * Math.max(0, Math.min(1, (40 - alt) / 16));
      if (!st.amount && (!local || wet < 0.01)) return;
      const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        active = gl.getParameter(gl.ACTIVE_TEXTURE);
      if (coverDirty && cover) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, coverTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cover.nx, cover.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, cover.data);
        coverDirty = false;
      }
      if (local) {
        near ||= createRainGround(gl);
        const hasTerrain = !!map.terrain;
        if (
          hadTerrain !== hasTerrain ||
          (terrainPending && map.getSource("cbDem") && map.isSourceLoaded("cbDem"))
        ) {
          near.refreshTerrain();
          hadTerrain = hasTerrain;
          terrainPending = false;
        }
        near.update(eye, groundAt, roofAt, paving);
      }
      const bindCover = (loc) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, coverTex);
        gl.uniform1i(loc.cover, 0);
        gl.uniform1i(loc.near, 1);
        if (cover) {
          gl.uniform4f(loc.coverRect, cover.x0, cover.y0, cover.nx * cover.step, cover.ny * cover.step);
          gl.uniform2f(loc.coverBase, cover.base, 1);
        } else {
          gl.uniform4f(loc.coverRect, 0, 0, 1, 1);
          gl.uniform2f(loc.coverBase, 0, 0);
        }
        if (local) near.bindNear(loc.patch);
        else {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, coverTex);
          gl.uniform3f(loc.patch, 0, 0, 0);
        }
      };
      const now = performance.now() / 1000,
        time = now % 1800,
        dt = lastNow ? Math.min(0.25, Math.max(0, now - lastNow)) : 0;
      if (time < lastTime || now - lastNow > 5) drift.fill(0);
      lastTime = time;
      lastNow = now;
      const speed = windAt(st.wind, alt) * gustAt(now),
        ang = st.to + 0.1 * Math.sin(0.21 * now + 0.5);
      const wx = Math.sin(ang) * speed,
        wy = Math.cos(ang) * speed;
      drift[0] += wx * dt;
      drift[1] += wy * dt;
      const lens = gl.drawingBufferHeight / (2 * Math.tan(map.transform.fovInRadians / 2));
      const depthWrite = gl.getParameter(gl.DEPTH_WRITEMASK),
        cull = gl.isEnabled(gl.CULL_FACE),
        blend = gl.isEnabled(gl.BLEND),
        depth = gl.isEnabled(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      if (local && wet >= 0.01) near.draw(M, perM, eye, st.sky, wet, st.rate, time, lens, bindCover);
      if (st.amount > 0) {
        gl.useProgram(p);
        gl.bindVertexArray(vao);
        bindCover(u);
        gl.uniformMatrix4fv(u.matrix, false, M);
        gl.uniform3fv(u.eye, eye);
        gl.uniform2fv(u.perM, perM);
        gl.uniform2f(u.wind, wx, wy);
        gl.uniform2fv(u.drop, st.drop);
        gl.uniform1f(u.time, time);
        gl.uniform1f(u.lens, lens);
        if (!st.flake) {
          gl.bindVertexArray(mistVao);
          gl.uniform1f(u.mode, 2);
          gl.uniform1f(u.opacity, st.extinction);
          gl.uniform3fv(u.color, st.sky);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 7);
          gl.bindVertexArray(vao);
        }
        gl.uniform1f(u.mode, st.flake ? 1 : 0);
        gl.uniform1f(u.snowSize, 0.018 * (1 + alt / 120));
        gl.uniform3fv(u.color, st.color);
        const field = (width, height, offset, max, opacity) => {
          gl.uniform3f(u.box, width, width, height);
          gl.uniform1f(u.opacity, opacity);
          gl.uniform2f(u.drift, drift[0] + offset, drift[1] - offset * 0.71);
          gl.drawArraysInstanced(
            gl.TRIANGLE_STRIP,
            0,
            4,
            Math.round(max * st.amount * (lite && !st.flake ? 0.68 : 1)),
          );
        };
        if (st.flake)
          field(Math.min(500, Math.max(46, alt * 1.4)), Math.min(400, Math.max(30, alt * 1.1)), 0, N_MAX, 0.85);
        else {
          const heightFade = 1 / (1 + Math.max(0, alt - 12) / 58);
          field(24, 17, 0, 5200, 0.68 * heightFade);
          field(59, 38, 17.91, 13600, 0.66 * heightFade);
        }
      }
      gl.depthMask(depthWrite);
      if (cull) gl.enable(gl.CULL_FACE);
      if (!blend) gl.disable(gl.BLEND);
      if (!depth) gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(prev);
      gl.activeTexture(active);
    },
  };
  return layer;
}
