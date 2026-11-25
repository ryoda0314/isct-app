import { compile } from "./campus3dLayer.js";
import { toXY } from "./campus3dFeatures.js";

// Near the pedestrian, resolve eaves at one metre and sample the actual walking surface.
// An eight-metre move reuses the overlapping tiles. The paving mask follows the same
// polygons, ordering and tree wells as the dry map, at eight texels per metre.
const TILE = 8,
  SIDE = 64,
  STEP = 2,
  ROW = SIDE / STEP + 1;
const MATERIAL = {
  asphalt: 1,
  campusAsphalt: 1,
  road: 1,
  zebra: 1,
  blueTile: 0.94,
  blue: 0.94,
  granite: 0.88,
  tile: 0.88,
  slab: 0.83,
  herring: 0.72,
  avenueHerring: 0.72,
  clayHerring: 0.72,
  walkBond: 0.72,
  lawnBrick: 0.72,
  memorialBrick: 0.72,
  running: 0.72,
  basketweave: 0.72,
  brick: 0.72,
  redbrick: 0.72,
  darkbrick: 0.72,
  plazaBlock: 0.75,
  stationSetts: 0.76,
  gateAshlar: 0.75,
  plaza: 0.75,
  walk: 0.67,
  apronConcrete: 0.67,
  roughStone: 0.56,
  roseFlags: 0.83,
  exposedFlags: 0.60,
  arcadeBrick: 0.74,
  lightDeck: 0.46,
  aggregate: 0.52,
  red: 0.65,
  deckComposite: 0.47,
  deckTimber: 0.36,
  deck: 0.47,
  wood: 0.36,
};
export const rainMaterial = ({ paving, kind }) => MATERIAL[paving || kind] || 0;

// The fine map includes the terrain. Outside it the campus-wide roof map still clips rain.
export const RAIN_COVER = `
uniform sampler2D u_cover, u_near;
uniform vec4 u_coverRect;
uniform vec2 u_coverBase;
uniform vec3 u_patch;
float readHeight(vec4 c, float base) {
  return c.a > 0.5 ? base + 0.05 * dot(floor(c.rg * 255.0 + 0.5), vec2(256.0,1.0)) : -10000.0;
}
float rainTop(vec2 p) {
  vec2 uv = (p - u_patch.xy) / ${SIDE}.0;
  if (u_patch.z > 0.5 && all(greaterThanEqual(uv,vec2(0.0))) && all(lessThan(uv,vec2(1.0))))
    return readHeight(texture2D(u_near,uv),-256.0);
  uv = (p - u_coverRect.xy) / u_coverRect.zw;
  if (u_coverBase.y > 0.5 && all(greaterThanEqual(uv,vec2(0.0))) && all(lessThan(uv,vec2(1.0))))
    return readHeight(texture2D(u_cover,uv),u_coverBase.x);
  return -10000.0;
}`;

function pathsFor(collection) {
  const paths = [];
  for (const { geometry, properties } of collection?.features || []) {
    for (const polygon of geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      function path(rings) {
        const result = new Path2D();
        for (const ring of rings) {
          for (const [i, ll] of ring.entries()) {
            const [x, y] = toXY(ll);
            if (i) result.lineTo(x, y);
            else result.moveTo(x, y);
            bounds[0] = Math.min(bounds[0], x);
            bounds[1] = Math.min(bounds[1], y);
            bounds[2] = Math.max(bounds[2], x);
            bounds[3] = Math.max(bounds[3], y);
          }
          result.closePath();
        }
        return result;
      }
      paths.push({
        shape: path(polygon),
        holes: properties.pavingHoles?.length ? path(properties.pavingHoles) : null,
        bounds,
        value: Math.round(255 * rainMaterial(properties)),
      });
    }
  }
  return paths;
}

// The same heights stop airborne drops and keep the ripple film below an awning dry.
export function rainTile(x0, y0, groundAt, roofAt) {
  const row = TILE / STEP + 1,
    ground = new Float32Array(row * row);
  for (let y = 0; y < row; y++)
    for (let x = 0; x < row; x++) ground[y * row + x] = groundAt(x0 + x * STEP, y0 + y * STEP);
  const heights = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const i = Math.floor(y / STEP) * row + Math.floor(x / STEP);
      const u = ((x % STEP) + 0.5) / STEP,
        v = ((y % STEP) + 0.5) / STEP;
      const g =
        (1 - v) * ((1 - u) * ground[i] + u * ground[i + 1]) +
        v * ((1 - u) * ground[i + row] + u * ground[i + row + 1]);
      const roof = roofAt(x0 + x + 0.5, y0 + y + 0.5);
      const h = Math.max(Number.isFinite(g) ? g : -Infinity, roof);
      if (!Number.isFinite(h)) continue;
      const z = Math.max(0, Math.min(65535, Math.round((h + 256) / 0.05))),
        o = 4 * (y * TILE + x);
      heights[o] = z >> 8;
      heights[o + 1] = z & 255;
      heights[o + 3] = 255;
    }
  return { ground, heights };
}

const VS = `
attribute vec3 a_pos;
attribute vec2 a_slope;
uniform mat4 u_matrix;
uniform vec2 u_perM;
varying vec3 v_m, v_n;
void main() {
  v_m = a_pos; v_n = vec3(-a_slope,1.0);
  gl_Position = u_matrix * vec4(a_pos.x*u_perM.x,-a_pos.y*u_perM.y,a_pos.z+0.015,1.0);
}`;
const FS = `
precision highp float;
${RAIN_COVER}
uniform sampler2D u_material;
uniform vec3 u_eye, u_sky;
uniform vec4 u_water; // wetness, rain rate response, time, inverse focal length
varying vec3 v_m, v_n;
float hash(vec2 p) {
  vec3 a=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); a+=dot(a,a.yzx+33.33);
  return fract((a.x+a.y)*a.z);
}
float noise(vec2 p) {
  vec2 i=floor(p), t=fract(p); t=t*t*(3.0-2.0*t);
  return mix(mix(hash(i),hash(i+vec2(1,0)),t.x),mix(hash(i+vec2(0,1)),hash(i+1.0),t.x),t.y);
}
// Each impact has its own position and clock. Two travelling crests disturb only the surface film.
float ripple(vec2 p, float pixel) {
  vec2 cell=floor(p), uv=fract(p);
  float rate=(0.43+1.9*u_water.y)*(0.8+0.4*hash(cell));
  float t=u_water.z*rate+hash(cell+3.71), event=floor(t), age=fract(t)/rate;
  vec2 seed=cell+vec2(event*0.71,event*0.43);
  vec2 center=0.24+0.52*vec2(hash(seed+4.7),hash(seed-15.1));
  vec2 delta=uv-center;
  float d=length(delta)*0.49, r=0.010+age*0.22, w=0.006+min(0.014,pixel*0.6);
  float crest=1.0-smoothstep(w*0.25,w*1.65,abs(d-r));
  float trough=1.0-smoothstep(w*0.25,w*1.5,abs(d-r+0.014));
  return (crest-0.68*trough)*(0.58+0.42*dot(delta/max(length(delta),0.001),vec2(-0.6,0.8)))*
    smoothstep(0.0,0.045,age)*(1.0-smoothstep(0.12,0.43,age))*(1.0-smoothstep(0.008,0.034,pixel));
}
void main() {
  vec2 uv=(v_m.xy-u_patch.xy)/${SIDE}.0;
  float mat=texture2D(u_material,uv).r;
  vec2 fromEye=abs(v_m.xy-u_eye.xy);
  float edge=1.0-smoothstep(19.0,27.5,max(fromEye.x,fromEye.y));
  if(mat<0.04 || edge<0.01 || rainTop(v_m.xy)>v_m.z+0.22) discard;
  vec3 n=normalize(v_n), eye=normalize(u_eye-v_m);
  float facing=clamp(dot(n,eye),0.0,1.0), wet=u_water.x*edge;
  float basin=0.60*noise(v_m.xy*0.44)+0.27*noise(v_m.xy*1.12+4.9)+0.13*noise(v_m.xy*3.6);
  float pooled=smoothstep(0.75-0.30*wet,0.97-0.29*wet,basin)*smoothstep(0.965,0.999,n.z)*mat;
  float pixel=length(u_eye-v_m)*u_water.w/max(0.18,facing);
  float impact=u_water.y>0.001 ? ripple(v_m.xy/0.49,pixel)*sqrt(u_water.y) : 0.0;
  vec3 reflected=reflect(-eye,n);
  float sky=1.0;
  for(int i=1;i<=4;i++) {
    float t=float(i*i)*1.9; vec3 ray=v_m+t*reflected;
    sky-=0.19*smoothstep(0.18,2.3,rainTop(ray.xy)-ray.z);
  }
  float fresnel=0.06+0.76*pow(1.0-facing,3.0);
  float sheen=wet*(0.15*mat+1.23*pooled)*fresnel;
  float absorb=wet*(0.08+0.11*mat+0.19*pooled);
  // Blend a darkened substrate with reflected sky. The paving grain and the markings remain visible.
  float glint=wet*max(0.0,impact)*(0.14+0.45*pooled);
  float reflectedLight=min(0.82,sheen+glint);
  float substrate=absorb*(1.0-reflectedLight), alpha=substrate+reflectedLight;
  vec3 reflection=min(vec3(1.0),u_sky*1.12)*mix(0.27,1.0,sky);
  vec3 rgb=vec3(0.043,0.053,0.059)*substrate+reflection*reflectedLight;
  gl_FragColor=vec4(rgb*max(0.75,1.0+min(0.0,impact)*0.23),alpha);
}`;

export function createRainGround(gl) {
  const program = compile(gl, VS, FS),
    vao = gl.createVertexArray(),
    vertices = gl.createBuffer(),
    indices = gl.createBuffer();
  const p = program.p,
    u = Object.fromEntries(
      ["matrix", "perM", "eye", "sky", "water", "material", "cover", "near", "coverRect", "coverBase", "patch"].map(
        (name) => [name, program.loc("u_" + name)],
      ),
    );
  const old = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  for (const [name, size, offset] of [
    ["a_pos", 3, 0],
    ["a_slope", 2, 12],
  ]) {
    const at = program.att(name);
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, 20, offset);
  }
  gl.bindVertexArray(old);
  const nearTex = gl.createTexture(),
    materialTex = gl.createTexture(),
    cache = new Map();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE * 8;
  const ctx = canvas.getContext("2d");
  let x0 = null,
    y0 = null,
    count = 0,
    source,
    paths = [],
    groundFn,
    roofFn;
  function texture(unit, tex, filter, upload) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    upload();
  }
  return {
    refreshTerrain() {
      cache.clear();
      x0 = null;
    },
    update(eye, groundAt, roofAt, paving) {
      if (groundFn !== groundAt || roofFn !== roofAt) {
        cache.clear();
        x0 = null;
        groundFn = groundAt;
        roofFn = roofAt;
      }
      if (source !== paving) {
        paths = pathsFor(paving);
        source = paving;
        x0 = null;
      }
      const left = Math.round(eye[0] / TILE) * TILE - SIDE / 2,
        bottom = Math.round(eye[1] / TILE) * TILE - SIDE / 2;
      if (x0 === left && y0 === bottom) return;
      x0 = left;
      y0 = bottom;
      const z = new Float32Array(ROW * ROW),
        heightBytes = new Uint8Array(SIDE * SIDE * 4),
        used = new Set();
      for (let j = 0; j < SIDE; j += TILE)
        for (let i = 0; i < SIDE; i += TILE) {
          const x = x0 + i,
            y = y0 + j,
            key = x + "," + y;
          used.add(key);
          let tile = cache.get(key);
          if (!tile) {
            tile = rainTile(x, y, groundAt, roofAt);
            cache.set(key, tile);
          }
          for (let a = 0; a < TILE; a++)
            heightBytes.set(tile.heights.subarray(4 * a * TILE, 4 * (a + 1) * TILE), 4 * ((j + a) * SIDE + i));
          const row = TILE / STEP + 1;
          for (let a = 0; a < row; a++)
            z.set(tile.ground.subarray(a * row, (a + 1) * row), (j / STEP + a) * ROW + i / STEP);
        }
      for (const k of cache.keys()) if (!used.has(k)) cache.delete(k);
      const buf = new Float32Array(ROW * ROW * 5),
        faces = [];
      for (let j = 0; j < ROW; j++)
        for (let i = 0; i < ROW; i++) {
          const k = j * ROW + i,
            h = z[k],
            dx = (z[k + (i < ROW - 1 ? 1 : 0)] - z[k - (i ? 1 : 0)]) / (i && i < ROW - 1 ? 2 * STEP : STEP);
          const dy = (z[k + (j < ROW - 1 ? ROW : 0)] - z[k - (j ? ROW : 0)]) / (j && j < ROW - 1 ? 2 * STEP : STEP);
          buf.set([x0 + i * STEP, y0 + j * STEP, h || 0, dx || 0, dy || 0], k * 5);
          if (i === ROW - 1 || j === ROW - 1) continue;
          const hh = [h, z[k + 1], z[k + ROW], z[k + ROW + 1]];
          if (Math.max(...hh) - Math.min(...hh) < 1.1) faces.push(k, k + 1, k + ROW, k + ROW, k + 1, k + ROW + 1);
        }
      const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(faces), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(prev);
      count = faces.length;
      ctx.setTransform(8, 0, 0, 8, -x0 * 8, -y0 * 8);
      ctx.fillStyle = "#000";
      ctx.fillRect(x0, y0, SIDE, SIDE);
      for (const { bounds: b, shape, holes, value } of paths) {
        if (b[0] > x0 + SIDE || b[2] < x0 || b[1] > y0 + SIDE || b[3] < y0) continue;
        ctx.fillStyle = "rgb(" + value + ",0,0)";
        ctx.fill(shape, "evenodd");
        if (holes) {
          ctx.save();
          ctx.clip(shape, "evenodd");
          ctx.fillStyle = "#000";
          ctx.fill(holes, "evenodd");
          ctx.restore();
        }
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      texture(gl.TEXTURE1, nearTex, gl.NEAREST, () =>
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIDE, SIDE, 0, gl.RGBA, gl.UNSIGNED_BYTE, heightBytes),
      );
      texture(gl.TEXTURE2, materialTex, gl.LINEAR, () =>
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas),
      );
    },
    bindNear(loc) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, nearTex);
      gl.uniform3f(loc, x0, y0, 1);
    },
    draw(matrix, perM, eye, sky, wet, rate, time, lens, bindCover) {
      if (!count || !paths.length) return;
      gl.useProgram(p);
      gl.bindVertexArray(vao);
      bindCover(u);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, materialTex);
      gl.uniform1i(u.material, 2);
      gl.uniformMatrix4fv(u.matrix, false, matrix);
      gl.uniform2fv(u.perM, perM);
      gl.uniform3fv(u.eye, eye);
      gl.uniform3fv(u.sky, sky);
      gl.uniform4f(u.water, wet, rate, time, 1 / lens);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    },
    remove() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vertices);
      gl.deleteBuffer(indices);
      gl.deleteTexture(nearTex);
      gl.deleteTexture(materialTex);
      gl.deleteProgram(p);
    },
  };
}
