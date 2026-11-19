// Local, indexed botany in metres relative to a terminal shoot. One instance starts
// at a woody node. Organ pivots keep the size of a blossom independent of the size of its tree.
const TAU = Math.PI * 2;
// The branch, its foliage and blossom groups fit inside this local sphere at every detail level.
export const CHERRY_SHOOT_BOUNDS = { x: 0.53, z: 0.07, radius: 0.8 };
const WOOD = 0,
  LEAF = 1,
  PETAL = 2,
  POLLEN = 3,
  CALYX = 4,
  NUT = 5;
const add = (p, v, s = 1) => p.map((x, i) => x + s * v[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const lerp = (a, b, t) => add(a, sub(b, a), t);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const n = Math.hypot(...a) || 1;
  return a.map((x) => x / n);
};
const direction = (az, pitch) => [Math.cos(az) * Math.cos(pitch), Math.sin(az) * Math.cos(pitch), Math.sin(pitch)];
const noise = (i) => {
  const f = Math.sin(i * 12.9898 + 2.31) * 43758.5453;
  return f - Math.floor(f);
};

class Geometry {
  constructor() {
    this.vertices = [];
    this.joints = [];
    this.joint = null;
    this.sections = [[], [], []]; // persistent wood, foliage, flowers
  }
  point(p, material, shade, age, tip = 0, u = -2, v = 0) {
    this.vertices.push(...p, 0, 0, 0, material, shade, age, tip, u, v);
    if (this.joint) this.joints.push(...this.joint);
    else this.joints.push(0, 0, 0, 0);
    return this.vertices.length / 12 - 1;
  }
  tri(a, b, c, section) {
    this.sections[section].push(a, b, c);
    const v = this.vertices,
      i = a * 12,
      j = b * 12,
      k = c * 12;
    const n = cross(
      [v[j] - v[i], v[j + 1] - v[i + 1], v[j + 2] - v[i + 2]],
      [v[k] - v[i], v[k + 1] - v[i + 1], v[k + 2] - v[i + 2]],
    );
    for (const o of [i, j, k]) for (let d = 0; d < 3; d++) v[o + 3 + d] += n[d];
  }
  // A shared rim closes the upper and lower surfaces. Their different ridges give
  // every blade and petal a finite cross-section even when viewed along its edge.
  shell(rim, upper, lower, material, shade, age, section = 1) {
    const r = rim.map((p, i) =>
      this.point(p, material, shade * (0.94 + (0.08 * i) / rim.length), age, i / rim.length),
    );
    const front = this.point(upper, material, shade * 1.06, age, 0.85);
    const back = this.point(lower, material, shade * 0.79, age, 0.18);
    for (let i = 0; i < r.length; i++) {
      const j = (i + 1) % r.length;
      this.tri(front, r[i], r[j], section);
      this.tri(back, r[j], r[i], section);
    }
  }
  stem(a, b, ra, rb, material = WOOD, section = 0, shade = 1, age = 0) {
    const axis = unit(sub(b, a)),
      u = unit(cross(axis, Math.abs(axis[2]) < 0.85 ? [0, 0, 1] : [0, 1, 0])),
      v = cross(axis, u);
    const lo = [],
      hi = [];
    for (let k = 0; k < 3; k++) {
      const angle = (TAU * k) / 3,
        radial = add(
          u.map((x) => x * Math.cos(angle)),
          v,
          Math.sin(angle),
        );
      lo.push(this.point(add(a, radial, ra), material, shade, age));
      hi.push(this.point(add(b, radial, rb), material, shade, age));
    }
    this.tri(lo[2], lo[1], lo[0], section);
    this.tri(hi[0], hi[1], hi[2], section);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      this.tri(lo[i], lo[j], hi[j], section);
      this.tri(lo[i], hi[j], hi[i], section);
    }
  }
  finish() {
    const v = this.vertices;
    for (let i = 0; i < v.length; i += 12) {
      const n = unit(v.slice(i + 3, i + 6));
      v[i + 3] = n[0];
      v[i + 4] = n[1];
      v[i + 5] = n[2];
    }
    const [wood, leaves, flowers] = this.sections.map((s) => s.length);
    return {
      vertices: new Float32Array(v),
      joints: new Float32Array(this.joints),
      indices: new Uint16Array(this.sections.flat()),
      wood,
      leaves,
      flowers,
    };
  }
}

const pointed = [
  [0, 0],
  [0.25, -0.73],
  [0.53, -1],
  [0.77, -0.63],
  [1, 0],
  [0.72, 0.74],
  [0.46, 0.95],
  [0.19, 0.64],
];
const serrated = [
  [0, 0],
  [0.23, -0.74],
  [0.42, -1],
  [0.45, -0.84],
  [0.61, -0.94],
  [0.62, -0.71],
  [0.78, -0.67],
  [1, 0],
  [0.77, 0.63],
  [0.7, 0.62],
  [0.56, 0.93],
  [0.5, 0.84],
  [0.36, 0.97],
  [0.18, 0.66],
];
const fan = [
  [0, 0],
  [0.4, -0.5],
  [0.7, -1],
  [0.89, -0.88],
  [1, -0.53],
  [0.97, -0.21],
  [0.76, -0.015],
  [0.97, 0.13],
  [1, 0.44],
  [0.92, 0.8],
  [0.72, 1],
  [0.4, 0.5],
];
const petal = [
  [0, 0],
  [0.31, -0.6],
  [0.68, -1],
  [0.91, -0.87],
  [1, -0.38],
  [0.86, 0],
  [0.99, 0.31],
  [0.94, 0.74],
  [0.72, 1],
  [0.32, 0.67],
];
const coarse = [
  [0, 0],
  [0.4, -1],
  [1, 0],
  [0.48, 1],
];
const fanCoarse = [
  [0, 0],
  [0.72, -1],
  [1, -0.44],
  [0.78, 0],
  [1, 0.47],
  [0.72, 1],
];

function blade(m, at, az, pitch, roll, length, width, shape, material, age, shade, cup = -0.1) {
  const x = direction(az, pitch),
    side = [-Math.sin(az), Math.cos(az), 0],
    vertical = cross(x, side);
  const y = add(
      side.map((v) => v * Math.cos(roll)),
      vertical,
      Math.sin(roll),
    ),
    z = cross(x, y);
  const pos = (u, v, relief) =>
    add(
      add(add(at, x, u * length), y, v * width),
      z,
      (relief + (age - 0.5) * 0.53 * u * v) * width + cup * length * u * u,
    );
  if (material === LEAF && (shape === pointed || shape === serrated)) {
    const root = m.point(at, material, shade, age, 0, 0, 0);
    let previous;
    for (const [i, u] of [0.1, 0.27, 0.44, 0.59, 0.74, 0.88, 0.95].entries()) {
      const w = Math.pow(Math.sin(u * Math.PI), 0.86) * (1.09 - 0.19 * u);
      const tooth = shape === serrated ? (i % 2 ? 0.041 : -0.023) : 0;
      const bend = 0.105 * Math.sin(Math.PI * u);
      // Cross-sections follow the arched midrib, with a convex upper blade and a
      // thinner underside. The margins roll back and the pointed tip droops.
      const ring = [
        m.point(pos(u + tooth * 0.35, -w - tooth, -0.035 * w), material, shade * 0.93, age, u, u, -1),
        m.point(pos(u, 0, bend - 0.105 * w), material, shade * 0.82, age, u, u, 0),
        m.point(pos(u + tooth * 0.21, w * 0.98 + tooth, 0.05 * w), material, shade * 0.98, age, u, u, 1),
        m.point(pos(u, 0, bend + 0.16 * w), material, shade * 1.045, age, u, u, 0),
      ];
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        if (previous) {
          m.tri(previous[k], previous[j], ring[j], 1);
          m.tri(previous[k], ring[j], ring[k], 1);
        } else m.tri(root, ring[j], ring[k], 1);
      }
      previous = ring;
    }
    const tip = m.point(pos(1, 0, -0.14), material, shade, age, 1, 1, 0);
    for (let k = 0; k < 4; k++) m.tri(previous[k], previous[(k + 1) % 4], tip, 1);
    return;
  }
  if (material === LEAF && shape === fan) {
    const root = m.point(at, LEAF, shade, age, 0, 0, 0),
      rim = [],
      pleats = [],
      under = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 5 - 1,
        a = t * 0.91,
        radius = 1 - 0.18 * Math.exp((-t * t) / 0.011) - 0.06 * t * t;
      const u = radius * Math.cos(a),
        v = radius * Math.sin(a) * 1.34;
      rim.push(m.point(pos(u, v, 0.09 + 0.07 * (j % 2)), LEAF, shade, age, u, u, t));
      pleats.push(
        m.point(
          pos(u * 0.55, v * 0.55, 0.1 + 0.1 * (j % 2)),
          LEAF,
          shade * (0.94 + 0.08 * (j % 2)),
          age,
          u,
          u * 0.55,
          t * 0.55,
        ),
      );
      under.push(m.point(pos(u * 0.55, v * 0.55, -0.055), LEAF, shade * 0.86, age, u, u * 0.55, t * 0.55));
      if (j) {
        const k = j - 1;
        m.tri(root, pleats[k], pleats[j], 1);
        m.tri(pleats[k], rim[k], rim[j], 1);
        m.tri(pleats[k], rim[j], pleats[j], 1);
        m.tri(root, under[j], under[k], 1);
        m.tri(under[k], rim[j], rim[k], 1);
        m.tri(under[k], under[j], rim[j], 1);
      }
    }
    for (const j of [0, 10]) {
      const a = j ? under[j] : pleats[j],
        b = j ? pleats[j] : under[j];
      m.tri(root, b, a, 1);
      m.tri(a, b, rim[j], 1);
    }
    return;
  }
  const rim = shape.map(([u, v]) => pos(u, v, 0.1 * v * v + 0.09 * u * v));
  m.shell(rim, pos(0.52, 0, 0.23), pos(0.48, 0, -0.14), material, shade, age, material === PETAL ? 2 : 1);
}

function corolla(m, base, center, size, az, pitch, age, separatePetals) {
  // Face each flower away from its pedicel; the bowl and its five notched petals
  // are visible from below as well as above.
  const normal = direction(az, pitch),
    side = [-Math.sin(az), Math.cos(az), 0],
    across = cross(normal, side);
  const polar = (a, r, lift) => add(add(add(center, side, r * Math.cos(a)), across, r * Math.sin(a)), normal, lift);
  if (!separatePetals) {
    const rim = [];
    for (let i = 0; i < 5; i++)
      for (const [da, r] of [
        [-0.46, 0.78],
        [0.07, 1],
      ])
        rim.push(polar(((i + da) * TAU) / 5, size * r, size * (0.24 + 0.1 * r)));
    m.shell(rim, add(center, normal, size * 0.08), base, PETAL, 0.96, age, 2);
    return;
  }
  m.stem(base, center, 0.003, 0.002, CALYX, 2, 1, age);
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 + 0.12 * age;
    const axis = add(
      side.map((v) => v * Math.cos(a)),
      across,
      Math.sin(a),
    );
    const transverse = cross(normal, axis);
    const at = (u, v, d) =>
      add(add(add(center, axis, u * size), transverse, v * size * 0.48), normal, size * (0.32 * u * u + d));
    m.shell(
      petal.map(([u, v]) => at(u, v, 0.07 * v * v)),
      at(0.56, 0, 0.055),
      at(0.53, 0, -0.085),
      PETAL,
      0.93 + 0.12 * noise(age + i),
      age,
      2,
    );
  }
  const ring = Array.from({ length: 5 }, (_, i) => polar((i * TAU) / 5, size * 0.19, size * 0.095));
  m.shell(ring, add(center, normal, size * 0.21), center, POLLEN, 1, age, 2);
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + age,
      base = polar(a, size * 0.09, size * 0.09),
      head = polar(a, size * 0.28, size * (0.26 + 0.07 * (i % 2)));
    m.stem(base, head, size * 0.026, size * 0.043, POLLEN, 2, 1.13, age);
  }
}

// Once the corollas project to only a few pixels, their overlapping rims form
// one scalloped, closed volume. Its underside is visible from the avenue.
function blossomCluster(m, center, az, tilt, radius, length, depth, age) {
  const normal = direction(az, tilt),
    side = [-Math.sin(az), Math.cos(az), 0],
    across = cross(normal, side);
  const rim = Array.from({ length: 6 }, (_, i) => {
    const a = (i * TAU) / 6 + age,
      r = (i % 3 === 1 ? 0.8 : 1) * (0.92 + 0.12 * noise(i + age));
    return add(
      add(add(center, side, radius * r * Math.cos(a)), across, length * r * Math.sin(a)),
      normal,
      depth * (0.15 + 0.24 * Math.sin(3 * a)),
    );
  });
  m.shell(rim, add(center, normal, depth * 0.72), add(center, normal, -depth), PETAL, 0.91 + 0.13 * age, age, 2);
}

// Flower buds alternate along the wood. A short spur carries a fan of stalks
// pointing in different directions. Bud spacing and blossom diameter are independent.
function cherrySpurs(m, start, end, az, branch, count, detail) {
  for (let j = 0; j < count; j++) {
    const id = branch * 19 + j,
      variation = noise(id + 43);
    const node = lerp(start, end, (j + 0.3 + 0.48 * variation) / count);
    const a = az + (j % 2 ? -1 : 1) * (0.57 + 0.94 * noise(id + 17));
    const pitch = -0.52 + 1.22 * noise(id + 37),
      outward = direction(a, pitch);
    const side = [-Math.sin(a), Math.cos(a), 0],
      across = cross(outward, side);
    if (detail === 1) {
      m.joint = [...node, 1.14];
      const r = 0.062 + 0.027 * variation,
        bud = add(node, outward, r * 0.87);
      // Two interleaved groups retain the gap and different facing directions
      // between flowers even when their petal tips are smaller than a pixel.
      for (const sign of [-1, 1]) {
        const center = add(bud, side, sign * r * 0.64);
        blossomCluster(
          m,
          center,
          a + sign * 0.69,
          pitch + sign * 0.32,
          r,
          r * 0.83,
          r * 0.62,
          noise(id * 2 + sign + 57),
        );
      }
    } else {
      m.joint = [...node, 0.53];
      const bud = add(node, outward, 0.051 + 0.039 * variation);
      const flowers = 4 + (variation > 0.52 ? 1 : 0);
      m.stem(node, bud, 0.005, 0.004, WOOD, 2, 0.95, variation);
      for (let i = 0; i < flowers; i++) {
        const s = id * 7 + i,
          turn = TAU * (i / flowers + variation) + (noise(s + 14) - 0.5) * 0.42;
        const lateral = add(
          side.map((v) => v * Math.cos(turn)),
          across,
          Math.sin(turn),
        );
        const axis = unit(add(lateral, outward, 0.22 + 0.75 * noise(s + 30)));
        const head = add(bud, axis, 0.065 + 0.036 * noise(s + 19));
        const age = noise(s + 197);
        corolla(
          m,
          bud,
          head,
          0.035 + 0.008 * noise(s + 6),
          Math.atan2(axis[1], axis[0]),
          Math.asin(axis[2]) + 0.09,
          age,
          detail === 3,
        );
      }
    }
    m.joint = null;
  }
}

function broadShoot(m, kind, detail, flowerDetail) {
  const flowering = kind === "cherry",
    ginkgo = kind === "ginkgo",
    shrub = kind === "shrub";
  const arms = detail === 1 ? 4 : shrub ? 5 : 6;
  const joint = [0.45, 0.018, 0.059],
    end = [0.94, 0.058, 0.13];
  m.stem([0, 0, 0], joint, 0.013, 0.008);
  m.stem(joint, end, 0.009, 0.004);
  for (let k = 0; k < arms; k++) {
    const side = k % 2 ? -1 : 1,
      t = (k + 0.2) / arms;
    const start = t < 0.5 ? lerp([0, 0, 0], joint, t * 2) : lerp(joint, end, (t - 0.5) * 2);
    const az = side * (0.78 + 0.48 * noise(k + 4)),
      pitch = -0.27 + 0.73 * noise(k + 8);
    const axis = direction(az, pitch),
      tip = add(start, axis, 0.52 - 0.13 * t);
    m.stem(start, tip, 0.0065, 0.0026);
    const n = detail === 1 ? 5 : ginkgo ? 6 : shrub ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const id = k * 13 + i,
        v = (i + 0.4) / n,
        a = az + (i % 2 ? -1 : 1) * (0.74 + 0.54 * noise(id + 93));
      const at = lerp(start, tip, v),
        lean = -0.42 + 0.87 * noise(id + 27),
        roll = (noise(id + 12) - 0.5) * 1.35;
      const len = (0.15 + 0.061 * noise(id + 9)) * (detail === 1 ? 1.22 : 1) * (shrub ? 0.82 : 1);
      const shape = ginkgo
        ? detail === 2
          ? fan
          : fanCoarse
        : detail === 2
          ? flowering || kind === "zelkova"
            ? serrated
            : pointed
          : coarse;
      const halfWidth = len * (ginkgo ? 0.62 : shrub ? 0.37 : 0.29);
      const petiole = ginkgo ? 0.06 : 0.025,
        base = add(at, direction(a, lean), petiole);
      m.joint = [...at, detail === 2 ? (ginkgo ? 0.48 : shrub ? 0.34 : 0.58) : 1.02];
      if (detail === 2) m.stem(at, base, 0.0026, 0.0018);
      blade(
        m,
        detail === 2 ? base : at,
        a,
        lean,
        roll,
        len,
        halfWidth,
        shape,
        LEAF,
        noise(id + 39),
        0.83 + 0.2 * noise(id + 10),
      );
      m.joint = null;
    }
    if (flowering) cherrySpurs(m, start, tip, az, k, detail === 1 ? 5 : 7, flowerDetail);
  }
  if (flowering) {
    cherrySpurs(m, lerp([0, 0, 0], joint, 0.2), joint, 0.04, 7, detail === 1 ? 2 : 4, flowerDetail);
    cherrySpurs(m, joint, end, 0.09, 8, detail === 1 ? 3 : 5, flowerDetail);
  }
}

// Below leaf resolution the terminal crown is a small lobed volume. It still has
// separate side and underside faces, and the woody scaffold remains visible through gaps.
function distantCrown(m, kind) {
  const needle = kind === "cedar",
    scale = needle ? 0.62 : 1,
    z = needle ? -0.09 : 0.075;
  const rim = [
    [0.02, 0, 0],
    [0.22, -0.27, z],
    [0.36, -0.42 * scale, z],
    [0.49, -0.24, z + 0.04],
    [0.72, -0.36 * scale, z],
    [1.05, -0.06, z - 0.03],
    [0.86, 0.22, z],
    [0.61, 0.32 * scale, z + 0.08],
    [0.44, 0.22, z],
    [0.3, 0.42 * scale, z],
    [0.12, 0.17, z],
  ];
  m.shell(rim, [0.54, 0.04, z + 0.24 * scale], [0.5, -0.02, z - 0.2 * scale], LEAF, 0.91, 0.41);
  if (kind === "cherry") {
    // Keep gaps between adjacent flower sprays in silhouette, including on
    // low-power devices where a whole tree switches to these branches earlier.
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? -1 : 1,
        az = side * (0.55 + 0.44 * noise(i + 35)),
        tilt = -0.34 + 0.8 * noise(i + 53);
      const axis = direction(az, tilt),
        lateral = [-Math.sin(az), Math.cos(az), 0],
        across = cross(axis, lateral);
      const at = [i * 0.105 + 0.08, (0.04 * i) / 7, (0.1 * i) / 7];
      const center = add(at, axis, 0.23 + 0.17 * noise(i + 40));
      for (let j = 0; j < 3; j++) {
        const id = i * 3 + j,
          a = TAU * (j / 3 + noise(i + 28)),
          u = Math.cos(a),
          v = Math.sin(a);
        const spread = 0.14 + 0.04 * noise(id + 45),
          r = 0.126 + 0.035 * noise(id + 6);
        const bud = add(add(center, lateral, spread * u), across, spread * 0.86 * v);
        blossomCluster(m, bud, az + 0.64 * u, tilt + 0.48 * v, r * 1.16, r, r * 0.63, noise(id + 93));
      }
    }
  }
}

function cedarShoot(m, detail) {
  const joints = [
    [0, 0, 0],
    [0.46, 0.012, 0.05],
    [0.96, 0.03, -0.16],
  ];
  m.stem(joints[0], joints[1], 0.013, 0.008);
  m.stem(joints[1], joints[2], 0.008, 0.002);
  for (let k = 0; k < 7; k++) {
    const t = (k + 0.35) / 7,
      side = k % 2 ? -1 : 1,
      at = t < 0.5 ? lerp(joints[0], joints[1], t * 2) : lerp(joints[1], joints[2], t * 2 - 1);
    const end = add(at, [0.22, side * (0.4 - 0.19 * t), -0.11]);
    m.stem(at, end, 0.004, 0.0017);
    for (let j = 0; j < (detail === 2 ? 4 : 2); j++) {
      const node = lerp(at, end, (j + 0.46) / (detail === 2 ? 4 : 2)),
        n = detail === 2 ? 11 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n + k * 1.17 + j * 0.45,
          id = k * 61 + j * 11 + i,
          len = 0.095 + 0.045 * noise(id);
        blade(
          m,
          node,
          a,
          0.12 + 0.53 * noise(id + 1),
          0.15,
          len,
          len * (detail === 2 ? 0.052 : 0.11),
          coarse,
          LEAF,
          noise(id + 2),
          0.85 + 0.18 * noise(id + 3),
        );
      }
    }
  }
}

function palmShoot(m, detail) {
  const hub = [0.24, 0, 0.08];
  m.stem([0, 0, 0], hub, 0.02, 0.013);
  const n = detail === 2 ? 25 : detail === 1 ? 17 : 9;
  const rays = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n - 0.5) * 2.66,
      d = direction(a, 0),
      len = 0.79 - 0.14 * Math.abs(a);
    return [
      add(add(hub, d, len * 0.47), [0, 0, 1], i % 2 ? 0.14 : 0.07),
      add(add(hub, d, len), [0, 0, 1], -0.075 - 0.075 * Math.abs(a)),
    ];
  });
  for (let i = 0; i < n; i++) {
    const [a, tipA] = rays[i],
      [b, tipB] = rays[i + 1],
      ridge = add(lerp(a, b, 0.5), [0, 0, 1], 0.035);
    const tip = lerp(tipA, tipB, 0.48);
    m.shell([hub, a, tip, b], ridge, add(ridge, [0, 0, -1], 0.06), LEAF, 0.86 + (0.13 * (i % 3)) / 2, i / n);
  }
}

// Ground and airborne pieces share the closed leaf/petal geometry.
export function shootGeometry(kind, detail) {
  const m = new Geometry();
  if (kind === "fallenLeaf" || kind === "fallenFan" || kind === "fallenPetal") {
    const petals = kind === "fallenPetal",
      ginkgo = kind === "fallenFan";
    const shape = petals ? petal : ginkgo ? fan : pointed;
    blade(m, [0, 0, 0], 0, 0, 0, 1, petals ? 0.55 : ginkgo ? 0.57 : 0.33, shape, LEAF, 0, 1, 0.1);
  } else if (kind === "nut") {
    const rim = Array.from({ length: 7 }, (_, i) => [
      Math.cos((i * TAU) / 7) * 0.5,
      Math.sin((i * TAU) / 7) * 0.5,
      0.43,
    ]);
    m.shell(rim, [0, 0, 0.98], [0, 0, 0], NUT, 1, 0);
  } else if (kind === "palm") palmShoot(m, detail);
  else if (detail === 0) distantCrown(m, kind);
  else if (kind === "cedar") cedarShoot(m, detail);
  else broadShoot(m, kind, Math.min(2, detail), detail);
  return m.finish();
}
