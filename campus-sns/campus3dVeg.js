import { SPECIES, SPECIES_ORDER, phenology, speciesOf } from "./campus3dEnv.js";
import { TREE_CLEAR, hashStr, seeded, trunkRadius, worldOf } from "./campus3dMesh.js";
import { PLANT_PART as ROLE, plantingModel, treeModel } from "./campus3dPlantModels.js";
import { CHERRY_SHOOT_BOUNDS, shootGeometry } from "./campus3dShoots.js";
import { overLids, terraceLid, toLngLat, toXY } from "./campus3dFeatures.js";
import { PER_M, cameraOf, compile, lightVector, matrixFor } from "./campus3dLayer.js";

export const VEG_LAYER_ID = "cb-veg";
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const rgb = (hex) => {
  if (!/^#[\da-f]{6}$/i.test(hex)) return [1, 1, 1];
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// Write directly into GPU-format chunks. The entire campus can stay resident while walking.
const STRIDE = 28,
  CHUNK_VERTICES = 16384;
const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const signed = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
class VegMesh {
  constructor(instances) {
    this.instances = instances;
    this.chunks = [];
    this.count = 0;
    this.role = 0;
    this.species = 0;
    this.rand = 0;
    this.base = 0;
    this.tr = [0, 0, 0, 0];
  }
  set tr(value) {
    this.treeBytes = [byte((value[0] + 1) / 2), byte(value[1]), byte(value[2]), byte(value[3])];
  }
  shoot(...args) {
    this.instances.add(...args);
  }
  part(role, rand = 0) {
    this.role = role;
    this.rand = rand;
  }
  vert(xy, z, n, c) {
    const index = this.count % CHUNK_VERTICES;
    if (index === 0) {
      this.bytes = new Uint8Array(CHUNK_VERTICES * STRIDE);
      this.floats = new Float32Array(this.bytes.buffer);
      this.chunks.push(this.bytes);
    }
    const o = index * STRIDE,
      data = this.bytes;
    const [x, y] = worldOf(xy);
    this.floats[o / 4] = x;
    this.floats[o / 4 + 1] = y;
    this.floats[o / 4 + 2] = z;
    data[o + 12] = signed(n[0]);
    data[o + 13] = signed(-n[1]); // Mercator y points south.
    data[o + 14] = signed(n[2]);
    for (let k = 0; k < 4; k++) data[o + 16 + k] = byte(c[k]);
    data[o + 20] = this.role;
    data[o + 21] = this.species;
    data[o + 22] = byte(this.rand);
    data[o + 23] =
      this.role === ROLE.shrub
        ? 0
        : byte(Math.max(0, (z - this.base) / 25) * (this.role === ROLE.trunk ? 0.25 : 1));
    data.set(this.treeBytes, o + 24);
    this.count++;
  }
  pack() {
    const bytes = new Uint8Array(this.count * STRIDE);
    let offset = 0;
    for (const chunk of this.chunks) {
      const size = Math.min(chunk.length, bytes.length - offset);
      bytes.set(chunk.subarray(0, size), offset);
      offset += size;
    }
    this.chunks.length = 0;
    return { buf: bytes.buffer, count: this.count };
  }
}

const perM = Math.hypot(...PER_M.e);
const RECORD = 12;
const emptyBounds = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
function includeShoot(b, x, y, low, high, pad) {
  b[0] = Math.min(b[0], x - pad);
  b[3] = Math.max(b[3], x + pad);
  b[1] = Math.min(b[1], y - pad);
  b[4] = Math.max(b[4], y + pad);
  b[2] = Math.min(b[2], low);
  b[5] = Math.max(b[5], high);
}

// A crown or long planted bed can straddle the camera. Keep nearby shoots in
// spatial batches so the branches behind the walker do not incur close-up detail.
function packShootCells(group) {
  const values = group.values,
    bins = new Map();
  for (let i = 0; i < values.length; i += RECORD) {
    const x = values[i],
      y = values[i + 1],
      z = values[i + 2];
    const cell = Math.floor(x / (3.2 * perM)) + "," + Math.floor(y / (3.2 * perM)) + "," + Math.floor(z / 3.2);
    let bin = bins.get(cell);
    if (!bin) {
      bin = { offsets: [], bounds: emptyBounds(), size: 0 };
      bins.set(cell, bin);
    }
    const size = Math.max(values[i + 8], values[i + 9], values[i + 10]),
      radius = 1.55 * size;
    includeShoot(bin.bounds, x, y, z - radius, z + radius, radius * perM);
    bin.size += size;
    bin.offsets.push(i);
  }
  const sorted = new Float32Array(values.length);
  group.blocks = [];
  let start = 0;
  for (const bin of bins.values()) {
    const count = bin.offsets.length;
    group.blocks.push({ start, count, bounds: bin.bounds, size: bin.size / count });
    for (const i of bin.offsets) {
      sorted.set(values.subarray(i, i + RECORD), start * RECORD);
      start++;
    }
  }
  group.values = sorted;
}

// Eye-level views can intersect a cell although most of its blossoms are several
// metres above or behind the camera. Bound each instanced shoot after its rotation.
function cherryBounds(values) {
  const spheres = new Float32Array((values.length / RECORD) * 4);
  for (let i = 0, o = 0; i < values.length; i += RECORD, o += 4) {
    const x = CHERRY_SHOOT_BOUNDS.x * values[i + 8],
      z = CHERRY_SHOOT_BOUNDS.z * values[i + 10];
    const qx = values[i + 4],
      qy = values[i + 5],
      qz = values[i + 6],
      qw = values[i + 7];
    const tx = 2 * qy * z,
      ty = 2 * (qz * x - qx * z),
      tz = -2 * qy * x;
    spheres[o] = values[i] + perM * (x + qw * tx + qy * tz - qz * ty);
    spheres[o + 1] = values[i + 1] - perM * (qw * ty + qz * tx - qx * tz);
    spheres[o + 2] = values[i + 2] + z + qw * tz + qx * ty - qy * tx;
    spheres[o + 3] = CHERRY_SHOOT_BOUNDS.radius * Math.max(values[i + 8], values[i + 9], values[i + 10]);
  }
  return spheres;
}

class ShootInstances {
  constructor() {
    this.groups = [];
    this.count = 0;
  }
  begin(tree) {
    this.tree = tree;
    this.parts = new Map();
  }
  add(kind, at, az, pitch, roll, length, width, height, shade, seed, effect = "crown") {
    const key = kind + "/" + effect;
    let group = this.parts.get(key);
    if (!group) {
      group = { ...this.tree, kind, effect, bounds: emptyBounds(), size: 0, values: [] };
      this.parts.set(key, group);
    }
    const [x, y] = worldOf(at),
      z = at[2];
    const cy = Math.cos(az / 2),
      sy = Math.sin(az / 2),
      cp = Math.cos(pitch / 2),
      sp = -Math.sin(pitch / 2);
    const cr = Math.cos(roll / 2),
      sr = Math.sin(roll / 2);
    group.values.push(
      x,
      y,
      z,
      shade,
      cy * cp * sr - sy * sp * cr,
      cy * sp * cr + sy * cp * sr,
      sy * cp * cr - cy * sp * sr,
      cy * cp * cr + sy * sp * sr,
      length,
      width,
      height,
      seed,
    );
    const size = Math.max(length, width, height),
      radius = 1.55 * size;
    const drifting = effect === "drift" || effect === "driftingPetals",
      xyPad = (radius + (drifting ? 27 : 0)) * perM;
    includeShoot(group.bounds, x, y, (drifting ? this.tree.base : z) - radius, z + radius, xyPad);
    group.size += size;
  }
  end() {
    for (const group of this.parts.values()) {
      const values = new Float32Array(group.values);
      group.values = values;
      group.count = values.length / RECORD;
      group.size /= group.count;
      if (group.effect === "crown" && group.count > 80) packShootCells(group);
      if (group.kind === "cherry" && group.effect === "crown") group.spheres = cherryBounds(group.values);
      this.count += group.count;
      this.groups.push(group);
    }
  }
  pack() {
    const data = new Float32Array(this.count * RECORD);
    let start = 0;
    this.groups.sort((a, b) => a.kind.localeCompare(b.kind));
    for (const group of this.groups) {
      data.set(group.values, start * RECORD);
      delete group.values;
      group.start = start;
      if (group.blocks) for (const b of group.blocks) b.start += start;
      start += group.count;
    }
    return { buf: data.buffer, count: this.count, groups: this.groups };
  }
}

// Independent curled leaves, petals and nuts rest at their own terrain samples.
function fallenPieces(inst, f, p, groundAt, species, female, base, radius) {
  const rnd = seeded(hashStr(f.id + "/fallen"));
  const leafKind = species === "ginkgo" ? "fallenFan" : "fallenLeaf";
  const count = Math.min(330, Math.max(24, Math.round(Math.PI * radius * radius * 1.7)));
  const slopes = new Map(),
    meterGround = (q) => groundAt(toLngLat(q));
  for (let i = 0; i < count; i++) {
    const a = TAU * rnd(),
      r = radius * Math.sqrt(rnd());
    const x = p[0] + r * Math.cos(a),
      y = p[1] + r * Math.sin(a),
      ground = meterGround([x, y]);
    if (!Number.isFinite(ground)) continue;
    const ix = Math.floor(x / 1.4),
      iy = Math.floor(y / 1.4),
      key = ix + "," + iy;
    if (!slopes.has(key)) {
      const cx = (ix + 0.5) * 1.4,
        cy = (iy + 0.5) * 1.4;
      const gradient = (u, v) => Math.max(-0.8, Math.min(0.8, (u - v) / 0.8)) || 0;
      slopes.set(key, [
        gradient(meterGround([cx + 0.4, cy]), meterGround([cx - 0.4, cy])),
        gradient(meterGround([cx, cy + 0.4]), meterGround([cx, cy - 0.4])),
      ]);
    }
    const [dx, dy] = slopes.get(key),
      az = TAU * rnd(),
      cs = Math.cos(az),
      sn = Math.sin(az);
    const pitch = Math.atan(dx * cs + dy * sn),
      roll = Math.atan(-dx * sn + dy * cs);
    const root = [x, y, ground + 0.014],
      size = 0.074 + 0.061 * rnd();
    inst.add(leafKind, root, az, pitch, roll, size, size, size, 0.83 + 0.16 * rnd(), rnd(), "litter");
    if (species === "cherry")
      inst.add("fallenPetal", root, az, pitch, roll, 0.031, 0.032, 0.033, 0.98, rnd(), "petals");
    if (female && i % 5 === 0) inst.add("nut", root, az, 0, 0, 0.031, 0.031, 0.034, 1, rnd(), "nuts");
  }
  for (let i = 0; i < 24; i++) {
    const a = TAU * rnd(),
      r = radius * Math.sqrt(rnd());
    const root = [p[0] + r * Math.cos(a), p[1] + r * Math.sin(a), base + f.height * (0.43 + 0.55 * rnd())];
    const seed = rnd(),
      size = 0.11;
    inst.add(leafKind, root, a, 0.2, a, size, size, size, 0.92, seed, "drift");
    if (species === "cherry")
      inst.add("fallenPetal", root, a, 0.4, -a, 0.032, 0.032, 0.032, 1, seed, "driftingPetals");
  }
}

export function buildVeg(features, groundAt, { selectedId = null } = {}) {
  const instances = new ShootInstances();
  const V = new VegMesh(instances);
  const shadows = [];
  let trees = 0;
  const groundXY = (x, y) => groundAt(toLngLat([x, y]));
  const lids = features
    .filter((f) => f.type === "terrace" && f.ceiling > 0 && !(f.side > 0) && f.coords?.length > 2)
    .map((f) => terraceLid(f, f.coords.map(toXY), f.elev, groundXY))
    .filter(Boolean);
  const wallAt = overLids(groundAt, lids);
  const cells = new Map();
  for (const f of features) {
    if (!f.coords?.length) continue;
    if (
      !(
        (f.type === "tree" && f.height > 0) ||
        (f.type === "surface" && f.kind === "shrubs") ||
        (f.type === "wall" && f.kind === "hedge") ||
        (f.type === "building" && f.boards?.some((b) => b.kind === "green"))
      )
    )
      continue;
    const [x, y] = toXY(f.coords[0]);
    const key = Math.floor(x / 34) + "," + Math.floor(y / 34);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(f);
  }
  const ranges = [];
  const drawPlant = (f) => {
    if (f.type !== "tree") {
      V.species = SPECIES_ORDER.indexOf("evergreen");
      V.libraryBed = f.type === "surface" && f.id.startsWith("libx-shrub-");
      const phase = seeded(hashStr(f.id))();
      V.tr = [0, V.libraryBed ? 1 : 0, phase, f.id === selectedId ? 1 : 0];
      instances.begin({
        species: "evergreen",
        off: 0,
        phase,
        selected: f.id === selectedId,
        base: groundAt(f.coords[0]) || 0,
        libraryBed: V.libraryBed,
      });
      plantingModel(V, f, groundAt, wallAt);
      instances.end();
      return;
    }
    const g = groundAt(f.coords[0]);
    if (!Number.isFinite(g)) return;
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
    const anchor = [...worldOf(p), g + f.height * 0.65];
    const treeLOD =
      sp === "palm"
        ? null
        : { anchor, size: Math.max(0.35, Math.min(f.height * 0.16, (f.crown || f.height * 0.6) * 0.125)) };
    instances.begin({ species: sp, off, phase, selected: !!sel, base: g, treeLOD });
    V.shade = f.height >= 3 ? { x:p[0], y:p[1], base:g, h:f.height, spread:f.crown || f.height*.7, radius:trunkRadius(f), species:sp, limbs:[], crowns:[] } : null;
    treeModel(V, f, p, g, sp, TREE_CLEAR[kind], trunkRadius(f), rnd);
    if (V.shade) shadows.push(V.shade);
    V.shade = null;
    trees++;
    if (SPECIES[sp]?.deciduous)
      fallenPieces(instances, f, p, groundAt, sp, female, g, Math.max(1.5, (f.crown || f.height * 0.6) * 0.575));
    instances.end();
  };
  for (const group of cells.values()) {
    const start = V.count;
    group.forEach(drawPlant);
    if (V.count > start) ranges.push({ start, count: V.count - start });
  }
  const solid = V.pack();
  const positions = new Float32Array(solid.buf);
  for (const range of ranges) {
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const end = (range.start + range.count) * 7;
    for (let i = range.start * 7; i < end; i += 7) {
      for (let k = 0; k < 3; k++) {
        bounds[k] = Math.min(bounds[k], positions[i + k]);
        bounds[k + 3] = Math.max(bounds[k + 3], positions[i + k]);
      }
    }
    range.bounds = bounds;
  }
  solid.ranges = ranges;
  return { solid, shoots: instances.pack(), trees, shadows };
}

// Use the actual crown/bed bounds, including branches across cell borders. Merge adjacent draws.
function plantFrustum(matrix, windPad) {
  const planes = [];
  for (let row = 0; row < 3; row++)
    for (const sign of [-1, 1]) {
      const plane = [0, 4, 8, 12].map((col) => matrix[col + 3] + sign * matrix[col + row]);
      plane[3] += (Math.abs(plane[0]) + Math.abs(plane[1])) * windPad;
      plane.push(Math.hypot(plane[0] * perM, plane[1] * perM, plane[2]));
      planes.push(plane);
    }
  return planes;
}
const inView = (b, planes) =>
  !planes.some(([x, y, z, w]) => x * b[x < 0 ? 0 : 3] + y * b[y < 0 ? 1 : 4] + z * b[z < 0 ? 2 : 5] + w < 0);
function rangesInView(planes, ranges) {
  const visible = [];
  for (const { bounds: b, start, count } of ranges) {
    if (!inView(b, planes)) continue;
    const prev = visible[visible.length - 1];
    if (prev && prev.start + prev.count === start) prev.count += count;
    else visible.push({ start, count });
  }
  return visible;
}

function shootBatches(group, planes, matrix, focal, debris, proxy, flowerCamera) {
  const spans = [];
  const append = (start, count, detail) => {
    const prev = spans.at(-1);
    if (prev && prev.detail === detail && prev.start + prev.count === start) prev.count += count;
    else spans.push({ start, count, detail });
  };
  for (const cell of group.blocks || [group]) {
    const b = cell.bounds;
    if (group.blocks && !inView(b, planes)) continue;
    const depth = Math.max(
      1,
      matrix[15] + 0.5 * (matrix[3] * (b[0] + b[3]) + matrix[7] * (b[1] + b[4]) + matrix[11] * (b[2] + b[5])),
    );
    const pixels = (cell.size * focal) / depth;
    if ((debris && pixels < 0.6) || (group.kind === "shrub" && pixels < 2.4)) continue;
    if (flowerCamera && group.spheres && pixels > 85) {
      const { eye, lens } = flowerCamera,
        s = group.spheres;
      for (let i = cell.start; i < cell.start + cell.count; i++) {
        const j = (i - group.start) * 4,
          x = s[j],
          y = s[j + 1],
          z = s[j + 2],
          r = s[j + 3];
        if (planes.some((p) => p[0] * x + p[1] * y + p[2] * z + p[3] + p[4] * r < 0)) continue;
        const distance = Math.hypot((x - eye[0]) / perM, (y - eye[1]) / perM, z - eye[2]);
        const flowerPixels = (0.04 * lens) / Math.max(0.05, distance - r);
        append(i, 1, flowerPixels > 40 ? 3 : flowerPixels > 8 ? 2 : 1);
      }
    } else append(cell.start, cell.count, debris || proxy ? 0 : pixels > 185 ? 2 : pixels > 20 ? 1 : 0);
  }
  return spans;
}

// ── シェーダー ──
export const visiblePlantRanges = (matrix, ranges, windPad) => rangesInView(plantFrustum(matrix, windPad), ranges);

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

const LIGHT = `
uniform mat4 u_matrix;
uniform vec3 u_lightpos, u_lightcolor, u_accent;
uniform float u_lightintensity, u_perM;
uniform vec2 u_snowWet;
uniform vec4 u_wind;
${TONE}
vec2 windOffset(float sway, float phase) {
  float speed = u_wind.z;
  float amp = sway * (0.025*speed + 0.0018*speed*speed);
  float t = u_wind.w;
  float osc = 0.52 + 0.45*sin(t*(0.9+speed*0.06)+phase) + 0.12*sin(t*2.7+phase*3.1);
  return amp*(u_wind.xy*osc + vec2(-u_wind.y,u_wind.x)*0.18*sin(t*1.9+phase*1.7));
}
vec3 litPlant(vec3 col, vec3 n, float soft, float selected) {
  float daylight = max(0.0,dot(n,u_lightpos));
  float diffuse = mix(0.73+0.20*n.z, 1.15, daylight);
  diffuse = mix(diffuse, 0.89+0.21*abs(dot(n,u_lightpos)), soft*0.48);
  col *= mix(1.0,diffuse,clamp(0.55+u_lightintensity,0.0,1.0));
  col = mix(col, vec3(0.89,0.92,0.95),u_snowWet.x*smoothstep(0.3,0.90,n.z)*0.88);
  col *= 1.0-0.12*u_snowWet.y;
  return toneOf(mix(col,u_accent,selected*0.53))*max(u_lightcolor,vec3(0.49));
}
vec3 clippedColor(vec2 p,float libraryBed) {
  float k = sin(dot(p,vec2(0.47,0.23)))*0.52 + cos(dot(p,vec2(-0.36,0.65)))*0.32;
  vec3 c = mix(vec3(0.24,0.315,0.125), vec3(0.455,0.49,0.209), smoothstep(-0.65,0.59,k));
  c=mix(c,vec3(0.36,0.31,0.215),smoothstep(0.48,0.85,k));
  if(libraryBed>0.5) {
    // Pale shoot clusters on the downslope side of the library skylight (S__47112228).
    float dist=min(length((p-vec2(76.3,-190.0))*vec2(0.75,1.12)),length((p-vec2(84.2,-195.5))*vec2(0.9,1.24)));
    dist+=0.23*sin(p.x*3.7+p.y*2.1)+0.16*cos(p.y*3.8);
    c=mix(c,vec3(0.64,0.68,0.34),1.0-smoothstep(0.25,1.65,dist));
  }
  return c;
}`;
const VS_WOOD = `
attribute vec3 a_pos;
attribute vec4 a_nrm, a_col, a_veg, a_tre;
uniform float u_doy;
varying vec3 v_color, v_site;
varying float v_role;
${LIGHT}
void main() {
  vec3 pos = a_pos;
  v_role = a_veg.x;
  v_site = vec3(pos.xy/u_perM,pos.z);
  pos.xy += windOffset(a_veg.w/255.0,a_tre.z*6.2832)*u_perM;
  gl_Position = u_matrix*vec4(pos,1.0);
  vec3 col = a_col.rgb;
  if (v_role > 3.5 && v_role < 4.5) col = clippedColor(v_site.xy,a_tre.y)*a_col.r;
  if (v_role > 4.5) {
    float fresh = smoothstep(78.0,133.0,u_doy)*(1.0-smoothstep(300.0,349.0,u_doy));
    if (v_role < 5.5) col = mix(vec3(0.47,0.40,0.28),col,fresh);
    else {
      float gold = smoothstep(245.0,282.0,u_doy)*(1.0-smoothstep(316.0,344.0,u_doy));
      col = mix(mix(vec3(0.50,0.44,0.32),vec3(0.39,0.47,0.22),fresh),col,gold);
      if (u_doy > 65.0 && u_doy < 218.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
    }
  }
  v_color = litPlant(col,a_nrm.xyz,step(3.5,v_role),a_tre.w);
}`;
const FS_WOOD = `
precision highp float;
varying vec3 v_color, v_site;
varying float v_role;
uniform float u_focal;
float grain(vec3 q) {
  vec3 i=floor(q), f=fract(q); f=f*f*(3.0-2.0*f);
  vec4 h=dot(i,vec3(17.0,71.0,37.0))+vec4(0.0,17.0,71.0,88.0);
  vec4 a=mix(fract(sin(h)*9273.7),fract(sin(h+37.0)*9273.7),f.z);
  return mix(mix(a.x,a.y,f.x),mix(a.z,a.w,f.x),f.y);
}
void main() {
  float v=1.0;
  float pixels=u_focal*gl_FragCoord.w;
  if (v_role<1.5) {
    float wood=grain(v_site*vec3(3.1,3.1,1.7));
    vec3 ridge=v_site*vec3(23.,23.,2.2)+wood*1.9;
    float cut=grain(ridge), edge=grain(ridge+vec3(.18,-.16,.06));
    float furrow=grain(v_site*vec3(59.0,59.0,5.8)+wood*2.1);
    v = .88+.24*wood;
    v += (.29*(edge-cut)+.065-.29*smoothstep(.49,.83,cut))*smoothstep(11.,48.,pixels);
    v += (.09-.21*smoothstep(.54,.82,furrow))*smoothstep(34.,100.,pixels);
  } else if (v_role<4.5) {
    v = 0.90+0.19*grain(v_site*2.8)+(grain(v_site*22.0)-0.5)*0.25*smoothstep(12.0,48.0,pixels);
  }
  gl_FragColor=vec4(v_color*v,1.0);
}`;
const VS_SHOOT = `
attribute vec3 a_pos, a_nrm;
attribute vec2 a_blade;
attribute vec4 a_traits;
attribute vec4 a_joint;
attribute vec4 a_origin, a_rotation, a_dims;
uniform vec4 u_growth, u_tree;
uniform vec3 u_colorA, u_colorB;
uniform float u_focal;
varying vec3 v_color, v_blade;
${LIGHT}
vec3 rotated(vec4 q,vec3 p) { return p + 2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p); }
void main() {
  float mat=a_traits.x, seed=a_dims.w, mode=u_tree.y;
  v_blade=vec3(a_blade,0.0);
  float rank=fract(seed+a_traits.z*0.7831);
  float wood=1.0-step(0.5,mat), bloom=step(1.5,mat)*(1.0-step(4.5,mat));
  float amount=mix(u_growth.x,u_growth.y,bloom);
  if (wood<0.5 && (amount<=0.0 || rank>amount)) {
    gl_Position=vec4(2.0,2.0,2.0,1.0); v_color=vec3(0.0); return;
  }
  float scale=1.0;
  if(a_joint.w>0.0) {
    float size=max(a_dims.x,max(a_dims.y,a_dims.z));
    float pixels=u_focal*size/max(1.0,(u_matrix*vec4(a_origin.xyz,1.0)).w);
    scale=mix(1.0,min(1.0,a_joint.w/size),smoothstep(32.0,185.0,pixels));
  }
  v_blade.z=0.18*a_dims.x*scale;
  vec3 local=rotated(a_rotation,(a_joint.xyz+(a_pos-a_joint.xyz)*scale)*a_dims.xyz);
  vec3 n=normalize(rotated(a_rotation,a_nrm/max(a_dims.xyz,vec3(0.0001))));
  vec3 pos=a_origin.xyz;
  if(mode>1.5) {
    float duration=max(1.5,(pos.z-u_tree.x)/(u_tree.w>0.5?0.43:0.83));
    float f=fract(u_wind.w/duration+seed);
    float turn=6.2832*(seed+f*(u_tree.w>0.5?3.0:2.0));
    mat2 spin=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
    local.yz=spin*local.yz; n.yz=spin*n.yz;
    local.xy=spin*local.xy; n.xy=spin*n.xy;
    pos.xy+=u_perM*(u_wind.xy*min(24.0,u_wind.z*0.5*f*duration)+0.35*vec2(sin(turn),cos(turn)));
    pos.z=mix(pos.z,u_tree.x,f);
  }
  pos+=vec3(local.x*u_perM,-local.y*u_perM,local.z);
  if(mode<0.5) {
    float sway=u_tree.z>0.5?0.023:clamp((pos.z-u_tree.x)/25.0,0.0,1.0);
    pos.xy+=u_perM*windOffset(sway,6.2832*u_growth.z);
    pos.xy+=u_perM*a_pos.x*sway*u_wind.z*0.006*vec2(sin(2.9*u_wind.w+seed*19.0),cos(2.3*u_wind.w+seed*27.0));
  }
  gl_Position=u_matrix*vec4(pos,1.0);
  n.y=-n.y;
  vec3 col=mix(u_colorA,u_colorB,fract(seed*2.27+a_traits.z*1.73));
  if (u_tree.z>0.5) col=clippedColor(a_origin.xy/u_perM,u_tree.z-1.0)*mix(vec3(0.92,0.95,0.84),vec3(1.33,1.24,1.055),rank);
  if(mat<0.5) col=vec3(0.30,0.244,0.179);
  else if(mat<1.5) {
    col*=mix(vec3(0.85,0.93,0.85),vec3(1.12,1.05,0.94),rank);
    col*=mix(vec3(0.94,0.96,0.90),vec3(1.055,1.04,0.99),a_traits.w);
  }
  else if(mat<2.5) col=mix(vec3(0.91,0.72,0.75),vec3(0.998,0.955,0.955),clamp(0.53+a_traits.w*0.51,0.0,1.0));
  else if(mat<3.5) col=vec3(0.94,0.75,0.38);
  else if(mat<4.5) col=vec3(0.57,0.32,0.30);
  else col=vec3(0.80,0.62,0.30);
  float shade=a_origin.w;
  if(mat>1.5&&mat<2.5)shade=mix(shade,1.0,0.35);
  v_color=litPlant(col*a_traits.y*shade,n,1.0-wood,u_growth.w);
}`;
const FS_SHOOT = `
precision highp float;
varying vec3 v_color, v_blade;
uniform float u_focal, u_fan;
void main() {
  vec3 c=v_color;
  if(v_blade.x>=0.0) {
    float u=v_blade.x, v=abs(v_blade.y);
    float fade=smoothstep(6.0,26.0,u_focal*gl_FragCoord.w*v_blade.z);
    float rib=(1.0-smoothstep(0.013,0.054,v))*(1.0-0.75*u);
    float phase=mix((u-0.30*v-0.08*v*v)*6.7, atan(v,u+0.065)*13.0,u_fan);
    float veins=1.0-smoothstep(0.018,0.092,abs(fract(phase+0.5)-0.5));
    c*=1.0+fade*(rib*0.24+veins*0.105*(1.0-v));
  }
  gl_FragColor=vec4(c,1.0);
}`;

const mixRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ramp = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const palettes = Object.fromEntries(
  Object.entries(SPECIES).map(([key, s]) => [
    key,
    {
      green: rgb(s.green),
      young: rgb(s.young),
      autumn: rgb(s.autumn || s.green),
      alt: rgb(s.autumn2 || s.green),
      brown: rgb(s.brown || s.autumn || s.green),
      petal: rgb(s.blossom || "#f6d9e2"),
    },
  ]),
);

function appearance(group, day, wind) {
  const { species, effect } = group,
    spec = SPECIES[species],
    c = palettes[species],
    d = day + group.off * spec.spread;
  const state = phenology(species, d),
    fresh = mixRGB(c.green, c.young, state.young * 0.84);
  const aging = spec.deciduous ? 0.38 * ramp(spec.fall[0] - 4, spec.fall[1], d) : 0;
  let a = mixRGB(mixRGB(fresh, c.autumn, state.autumn), c.brown, aging);
  let b = mixRGB(mixRGB(fresh, c.alt, state.autumn), c.brown, aging),
    cover = state.leaf;
  const canopy = effect === "crown" || effect === "cover";
  if (!canopy) {
    a = mixRGB(c.autumn, c.brown, 0.44);
    b = c.alt;
    if (effect === "litter") cover = state.litter;
    else if (effect === "nuts") cover = state.nuts;
    else if (effect === "drift")
      cover = ramp(spec.fall[0] - 5, spec.fall[0] + 4, d) * (1 - ramp(spec.fall[1] - 3, spec.fall[1] + 5, d));
    else {
      a = c.petal;
      b = [0.98, 0.92, 0.92];
      cover = state.petals;
    }
    if (effect === "drift" || effect === "driftingPetals") cover *= 0.3 + 0.7 * clamp01(wind / 7);
  }
  return { a, b, cover, bloom: canopy ? state.bloom : 0 };
}

function program(gl, vs, fs, attributes, uniforms) {
  const p = compile(gl, vs, fs);
  const locations = (names, find) => Object.fromEntries(names.split(" ").map((n) => [n, find(n)]));
  return {
    p: p.p,
    a: locations(attributes, p.att),
    u: locations(
      "u_matrix u_perM u_wind u_tone u_lightpos u_lightcolor u_accent u_snowWet u_lightintensity " + uniforms,
      p.loc,
    ),
  };
}

export function createVegLayer({ exaggeration = 1, lite = false } = {}) {
  let map,
    gl,
    wood,
    shoot,
    vao,
    solidBuffer,
    instancesBuffer,
    latest = null,
    dirty = true;
  const templates = new Map(),
    states = new WeakMap(),
    coarseTrees = new WeakMap();
  let st = {
    doy: 180,
    tone: [0, 0, 0, 0],
    light: { pos: [0, 0, 1], intensity: 0.4, color: [1, 1, 1] },
    wind: [1, 0, 0],
    snow: 0,
    wet: 0,
    accent: [0.16, 0.78, 0.4],
  };
  const upload = (target, data) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buffer;
  };
  return {
    id: VEG_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, g) {
      map = m;
      gl = g;
      vao = gl.createVertexArray();
      const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(vao);
      wood = program(gl, VS_WOOD, FS_WOOD, "a_pos a_nrm a_col a_veg a_tre", "u_doy u_focal");
      shoot = program(
        gl,
        VS_SHOOT,
        FS_SHOOT,
        "a_pos a_nrm a_traits a_blade a_joint a_origin a_rotation a_dims",
        "u_tree u_colorA u_colorB u_growth u_focal u_fan",
      );
      for (const kind of [
        "cherry",
        "zelkova",
        "ginkgo",
        "evergreen",
        "cedar",
        "palm",
        "shrub",
        "fallenLeaf",
        "fallenFan",
        "fallenPetal",
        "nut",
      ]) {
        const pieces = kind.startsWith("fallen") || kind === "nut";
        const levels = [];
        for (let i = 0; i < (pieces ? 1 : kind === "cherry" ? 4 : 3); i++) {
          const shape = shootGeometry(kind, i);
          levels.push({
            wood: shape.wood,
            leaves: shape.leaves,
            flowers: shape.flowers,
            v: upload(gl.ARRAY_BUFFER, shape.vertices),
            joints: upload(gl.ARRAY_BUFFER, shape.joints),
            idx: upload(gl.ELEMENT_ARRAY_BUFFER, shape.indices),
          });
        }
        templates.set(kind, levels);
      }
      gl.bindVertexArray(prev);
      dirty = true;
    },
    onRemove() {
      if (!gl) return;
      for (const levels of templates.values())
        for (const t of levels) {
          gl.deleteBuffer(t.v);
          gl.deleteBuffer(t.joints);
          gl.deleteBuffer(t.idx);
        }
      templates.clear();
      gl.deleteBuffer(solidBuffer);
      gl.deleteBuffer(instancesBuffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(wood.p);
      gl.deleteProgram(shoot.p);
      solidBuffer = null;
      instancesBuffer = null;
      map = null;
      gl = null;
    },
    setTrees(data) {
      latest = data;
      dirty = true;
      map?.triggerRepaint();
    },
    setEnv(env, look, accent) {
      const w = env?.weather || {},
        known = w.src !== "unknown",
        to = ((Number(w.windDir) || 0) + 180) * DEG;
      st = {
        doy: env?.doy ?? st.doy,
        tone: look ? [look.f.warm || 0, look.f.twilight || 0, look.f.night || 0, look.f.gloom || 0] : st.tone,
        light: look
          ? { pos: lightVector(look.light.position), intensity: look.light.intensity, color: rgb(look.light.color) }
          : st.light,
        wind: [Math.sin(to), -Math.cos(to), known ? Math.max(0, Number(w.wind) || 0) : 1],
        snow: known ? clamp01(w.snowCover || 0) : 0,
        wet: known ? clamp01(w.wet || 0) : 0,
        accent: accent ? rgb(accent) : st.accent,
      };
      map?.triggerRepaint();
    },
    render(g, args) {
      if (!latest || !gl) return;
      const prev = gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        cull = gl.isEnabled(gl.CULL_FACE);
      gl.bindVertexArray(vao);
      if (dirty) {
        gl.deleteBuffer(solidBuffer);
        gl.deleteBuffer(instancesBuffer);
        solidBuffer = upload(gl.ARRAY_BUFFER, latest.solid.buf);
        instancesBuffer = upload(gl.ARRAY_BUFFER, latest.shoots.buf);
        dirty = false;
      }
      const matrix = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      const focal = 0.5 * gl.drawingBufferWidth * perM * Math.hypot(matrix[0], matrix[4]);
      const detailFocal = lite ? focal * 0.52 : focal;
      const eye = cameraOf(matrix);
      const flowerCamera = eye && {
        eye,
        lens: ((0.5 * gl.drawingBufferHeight) / Math.tan(map.transform.fovInRadians / 2)) * (lite ? 0.65 : 1),
      };
      const wind = st.wind[2],
        planes = plantFrustum(matrix, perM * (0.25 + 1.6 * (0.025 * wind + 0.0018 * wind * wind)));
      const common = (p) => {
        const u = p.u;
        gl.useProgram(p.p);
        gl.uniformMatrix4fv(u.u_matrix, false, matrix);
        gl.uniform1f(u.u_perM, perM);
        gl.uniform3fv(u.u_lightpos, st.light.pos);
        gl.uniform3fv(u.u_lightcolor, st.light.color);
        gl.uniform1f(u.u_lightintensity, st.light.intensity);
        gl.uniform2f(u.u_snowWet, st.snow, st.wet);
        gl.uniform4fv(u.u_tone, st.tone);
        gl.uniform3fv(u.u_accent, st.accent);
        gl.uniform4f(u.u_wind, st.wind[0], st.wind[1], wind, (performance.now() / 1000) % 3600);
      };
      const attr = (loc, size, type, norm, stride, offset, divisor = 0) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, type, norm, stride, offset);
        gl.vertexAttribDivisor(loc, divisor);
      };
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      common(wood);
      gl.uniform1f(wood.u.u_doy, st.doy);
      gl.uniform1f(wood.u.u_focal, focal);
      gl.bindBuffer(gl.ARRAY_BUFFER, solidBuffer);
      attr(wood.a.a_pos, 3, gl.FLOAT, false, 28, 0);
      attr(wood.a.a_nrm, 4, gl.BYTE, true, 28, 12);
      attr(wood.a.a_col, 4, gl.UNSIGNED_BYTE, true, 28, 16);
      attr(wood.a.a_veg, 4, gl.UNSIGNED_BYTE, false, 28, 20);
      attr(wood.a.a_tre, 4, gl.UNSIGNED_BYTE, true, 28, 24);
      for (const span of rangesInView(planes, latest.solid.ranges))
        gl.drawArrays(gl.TRIANGLES, span.start, span.count);
      for (const loc of Object.values(wood.a)) gl.disableVertexAttribArray(loc);
      common(shoot);
      gl.uniform1f(shoot.u.u_focal, focal);
      let current = null;
      for (const group of latest.shoots.groups) {
        const b = group.bounds;
        if (!inView(b, planes)) continue;
        let state = states.get(group);
        if (!state || state.day !== st.doy || state.wind !== wind) {
          state = { ...appearance(group, st.doy, wind), day: st.doy, wind };
          states.set(group, state);
        }
        const proxy = group.effect === "cover",
          debris = !proxy && group.effect !== "crown",
          drift = group.effect === "drift" || group.effect === "driftingPetals";
        if (debris && state.cover < 0.001) continue;
        if (!debris && group.treeLOD) {
          const lod = group.treeLOD,
            [x, y, z] = lod.anchor;
          const treeDepth = Math.max(1, matrix[15] + matrix[3] * x + matrix[7] * y + matrix[11] * z);
          // Keep intermediate blossom sprays until the gaps between them
          // are small on screen, even when the leaf detail budget is lower.
          const crownFocal = lite && state.bloom > 0.001 ? focal * 0.8 : detailFocal;
          const apparent = (crownFocal * lod.size) / treeDepth,
            previous = coarseTrees.get(lod);
          const coarse = apparent < (previous === true ? 27 : previous === false ? 21 : 24);
          coarseTrees.set(lod, coarse);
          if (proxy !== coarse) continue;
        }
        const spans = shootBatches(
          group,
          planes,
          matrix,
          detailFocal,
          debris,
          proxy,
          state.bloom > 0.001 ? flowerCamera : null,
        );
        if (!spans.length) continue;
        gl.uniform3fv(shoot.u.u_colorA, state.a);
        gl.uniform3fv(shoot.u.u_colorB, state.b);
        gl.uniform4f(shoot.u.u_growth, debris ? 1 : state.cover, state.bloom, group.phase, group.selected ? 1 : 0);
        gl.uniform1f(shoot.u.u_fan, group.species === "ginkgo" ? 1 : 0);
        gl.uniform4f(
          shoot.u.u_tree,
          group.base,
          drift ? 2 : debris ? 1 : 0,
          group.kind === "shrub" ? (group.libraryBed ? 2 : 1) : 0,
          group.kind === "fallenPetal" ? 1 : 0,
        );
        for (const span of spans) {
          const t = templates.get(group.kind)[span.detail];
          const baseCount = t.wood + (state.cover > 0.001 ? t.leaves : 0);
          if (!baseCount && !(state.bloom > 0.001 && t.flowers)) continue;
          if (current !== t) {
            current = t;
            gl.bindBuffer(gl.ARRAY_BUFFER, t.v);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, t.idx);
            attr(shoot.a.a_pos, 3, gl.FLOAT, false, 48, 0);
            attr(shoot.a.a_nrm, 3, gl.FLOAT, false, 48, 12);
            attr(shoot.a.a_traits, 4, gl.FLOAT, false, 48, 24);
            attr(shoot.a.a_blade, 2, gl.FLOAT, false, 48, 40);
            gl.bindBuffer(gl.ARRAY_BUFFER, t.joints);
            attr(shoot.a.a_joint, 4, gl.FLOAT, false, 0, 0);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, instancesBuffer);
          const offset = span.start * RECORD * 4;
          attr(shoot.a.a_origin, 4, gl.FLOAT, false, 48, offset, 1);
          attr(shoot.a.a_rotation, 4, gl.FLOAT, false, 48, offset + 16, 1);
          attr(shoot.a.a_dims, 4, gl.FLOAT, false, 48, offset + 32, 1);
          const count = debris ? Math.ceil(state.cover * span.count) : span.count;
          if (baseCount) gl.drawElementsInstanced(gl.TRIANGLES, baseCount, gl.UNSIGNED_SHORT, 0, count);
          if (t.flowers && state.bloom > 0.001)
            gl.drawElementsInstanced(
              gl.TRIANGLES,
              t.flowers,
              gl.UNSIGNED_SHORT,
              (t.wood + t.leaves) * 2,
              span.count,
            );
        }
      }
      for (const loc of Object.values(shoot.a)) {
        gl.disableVertexAttribArray(loc);
        gl.vertexAttribDivisor(loc, 0);
      }
      gl.bindVertexArray(prev);
      if (cull) gl.enable(gl.CULL_FACE);
    },
  };
}
