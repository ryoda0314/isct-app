import earcut from "earcut";
import { addLimb, hashStr, seeded } from "./campus3dMesh.js";
import {
  densify,
  distToRing,
  offsetLine,
  offsetRingBy,
  pointInRing,
  railGround,
  ringArea,
  roofBoards,
  toLngLat,
  toXY,
} from "./campus3dFeatures.js";
import { roofCeiling } from "./campus3dInterior.js";

// Site references in campus-reconstruction: wood-deck S__47104047–59 (forks/supports),
// library S__47112225–29 (clipped slope), and taki-plaza S__47112196 (roof planting).
export const PLANT_PART = { trunk: 0, branch: 1, leaf: 2, litter: 3, shrub: 4, herb: 5, panicle: 6 };
const TAU = Math.PI * 2;
const BARK = [0.32, 0.285, 0.23, 1],
  CHERRY_BARK = [0.225, 0.215, 0.184, 1];
const mix = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
const radial = (p, az, r, dz) => [p[0] + r * Math.cos(az), p[1] + r * Math.sin(az), p[2] + dz];
const unit = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Consecutive segments share each ring. Old cherry scaffolds bend and taper continuously.
function bough(m, pts, radii, color, sides = 7) {
  if (sides >= 8 && radii[0] > 0.12) {
    const path = [pts[0]],
      widths = [radii[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i],
        a = pts[i - 1],
        b = pts[i + 1];
      const near = (q) => Math.min(0.26, (1.6 * radii[i]) / (Math.hypot(...q.map((v, k) => v - p[k])) || 1));
      const incoming = near(a),
        outgoing = near(b);
      const left = mix(p, a, incoming),
        right = mix(p, b, outgoing);
      path.push(left, mix(p, mix(left, right, 0.5), 0.5), right);
      widths.push(
        radii[i] + (radii[i - 1] - radii[i]) * incoming,
        radii[i],
        radii[i] + (radii[i + 1] - radii[i]) * outgoing,
      );
    }
    pts = [...path, pts.at(-1)];
    radii = [...widths, radii.at(-1)];
  }
  const direction = unit(pts.at(-1).map((v, j) => v - pts[0][j]));
  const ref = Math.abs(direction[0]) < 0.72 ? [1, 0, 0] : [0, 1, 0];
  const rings = pts.map((p, i) => {
    const before = pts[Math.max(0, i - 1)],
      after = pts[Math.min(pts.length - 1, i + 1)];
    const axis = unit(after.map((v, j) => v - before[j])),
      u = unit(cross(axis, ref)),
      v = cross(axis, u);
    return Array.from({ length: sides }, (_, k) => {
      const a = (k * TAU) / sides,
        normal = u.map((x, j) => x * Math.cos(a) + v[j] * Math.sin(a));
      const radius = radii[i] * (1 + 0.075 * Math.sin(3 * a + i * 0.3) + 0.05 * Math.cos(5 * a));
      return { p: p.map((x, j) => x + radius * normal[j]), normal };
    });
  });
  for (let i = 1; i < rings.length; i++)
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides,
        a = rings[i - 1],
        b = rings[i];
      for (const v of [a[k], a[n], b[n], a[k], b[n], b[k]]) m.vert(v.p, v.p[2], v.normal, color);
    }
  for (const [index, sign] of [
    [0, -1],
    [rings.length - 1, 1],
  ]) {
    const normal = unit(subtractAlong(pts, index)).map((x) => sign * x),
      rim = rings[index];
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      for (const point of [pts[index], rim[sign > 0 ? k : next].p, rim[sign > 0 ? next : k].p])
        m.vert(point, point[2], normal, color);
    }
  }
}

function subtractAlong(points, index) {
  const a = points[Math.max(0, index - 1)],
    b = points[Math.min(points.length - 1, index + 1)];
  return b.map((v, i) => v - a[i]);
}

// A terminal shoot grows directly out of a scaffold or a side twig. The shared
// mesh contains its woody axes, petioles and individual three-dimensional blades.
function foliage(m, end, radius, depth, tree, density, parent = end) {
  const { rnd, kind, base, h, p } = tree;
  const outward = Math.atan2(end[1] - p[1], end[0] - p[0]);
  const phase = rnd() * TAU;
  const count = Math.max(3, Math.ceil(density * 0.63));
  for (let k = 0; k < count; k++) {
    const angle = phase + k * 2.39996 + (rnd() - 0.5) * 0.58;
    const az = outward + Math.atan2(Math.sin(angle), Math.cos(angle) + 0.34);
    const root = mix(end, parent, (k / count) * 0.51);
    const pitch = kind === "cedar" ? -0.36 + rnd() * 0.47 : -0.48 + 1.43 * rnd();
    const size = radius * (0.85 + 0.46 * rnd());
    const shade = Math.min(1.09, 0.61 + (0.34 * (root[2] - base)) / h + 0.13 * rnd());
    const roll = (rnd() - 0.5) * 1.32,
      width = size * (0.82 + 0.36 * rnd()),
      height = Math.min(size * 1.12, depth * 1.38),
      seed = rnd();
    m.shoot(kind, root, az, pitch, roll, size, width, height, shade, seed);
    if (k === 0 || k === Math.floor(count / 2) || (count >= 8 && k === count - 2))
      m.shoot(kind, root, az, pitch, roll, size * 1.05, width * 1.24, height * 1.17, shade, seed, "cover");
  }
}

function shrubShoot(m, root, az, tilt, w, h, shade, rnd) {
  const length = Math.min(w * 0.64, h * 1.1);
  m.shoot("shrub", root, az, tilt, (rnd() - 0.5) * 0.74, length, w * 0.51, h * 0.56, shade, rnd());
}

function twigFork(m, a, b, radius, az, t) {
  const { rnd, bark } = t,
    length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  m.part(PLANT_PART.branch);
  addLimb(m, a, b, radius, Math.max(0.008, radius * 0.25), bark, 4);
  for (const side of [-1, 1]) {
    const start = mix(a, b, 0.5 + rnd() * 0.3);
    addLimb(
      m,
      start,
      radial(start, az + side * (0.4 + rnd() * 0.5), length * 0.37, length * (0.15 + rnd() * 0.22)),
      radius * 0.4,
      0.009,
      bark,
      3,
    );
  }
}

function branchingTree(m, t, cherry) {
  const { p, base, h, w, tr, rnd, bark } = t,
    young = w < 5;
  const root = [...p, base],
    az0 = rnd() * TAU;
  const fork = radial(
    root,
    az0,
    tr * (cherry ? 0.8 : 0.3),
    t.forkHeight ?? h * (cherry ? (young ? 0.3 : 0.19) : 0.33),
  );
  m.part(PLANT_PART.trunk);
  bough(
    m,
    [[...p, base - 0.13], radial(root, az0, tr * 0.15, h * 0.055), fork, radial(fork, az0, tr * 0.63, tr * 0.97)],
    [tr * 1.45, tr * 1.04, tr * 0.89, tr * 0.12],
    bark,
    young ? 8 : 18,
  );
  if (cherry && !young) {
    // The old wood above the bench has swollen collars and short, healed pruning cuts.
    for (let k = 0; k < 3; k++) {
      const a = az0 + k * 2.19 + rnd() * 0.37,
        at = mix(root, fork, 0.4 + 0.15 * k);
      const base = radial(at, a, tr * 0.64, 0);
      bough(
        m,
        [base, radial(base, a, tr * 0.44, tr * 0.17), radial(base, a, tr * 0.65, tr * 0.32)],
        [tr * 0.53, tr * 0.41, tr * 0.19],
        bark,
        11,
      );
    }
  }
  if (!young)
    for (let i = 0; i < 5; i++) {
      const a = az0 + (i * TAU) / 5 + rnd() * 0.55;
      bough(
        m,
        [
          radial(root, a, tr * 1.8, -0.04),
          radial(root, a, tr * 0.86, tr * 0.4),
          radial(root, a, tr * 0.55, tr * 1.5),
        ],
        [tr * 0.14, tr * 0.3, tr * 0.23],
        bark,
        5,
      );
    }
  const n = young ? 5 : cherry ? 6 : 7;
  for (let k = 0; k < n; k++) {
    const az = az0 + (k * TAU) / n + (rnd() - 0.5) * 0.55,
      leader = k < 2;
    const reach = w * (leader ? 0.12 + rnd() * 0.09 : 0.31 + rnd() * 0.07);
    const endZ = h * (leader ? 0.81 + rnd() * 0.045 : (cherry ? 0.43 : 0.62) + rnd() * 0.13);
    const start = mix(root, fork, 0.75 + 0.25 * rnd());
    const elbow = radial(
      start,
      az + (rnd() - 0.5) * (cherry ? 1.1 : 0.6),
      reach * 0.39,
      (base + endZ - start[2]) * (cherry ? 0.6 : 0.4),
    );
    const end = radial(root, az, reach, endZ);
    const r0 = tr * (young ? 0.42 : 0.54 + rnd() * 0.17);
    m.part(PLANT_PART.branch);
    const tip = radial(end, az + 0.27, Math.min(w * 0.068, reach * 0.32), h * (leader ? 0.09 : 0.065));
    bough(m, [start, elbow, end, tip], [r0, r0 * 0.67, r0 * 0.25, 0.013], bark, young ? 5 : 8);
    const radius = Math.min(w * 0.135, h * 0.21) * (0.85 + rnd() * 0.2);
    foliage(m, end, radius, radius * (cherry ? 0.73 : 0.96), t, young ? 6 : 15, elbow);
    const forks = young ? 3 : 5;
    for (let j = 0; j < forks; j++) {
      const a = az + (j / (forks - 1) - 0.5) * 1.85 + (rnd() - 0.5) * 0.25,
        from = mix(elbow, end, 0.18 + (j / (forks + 1)) * 0.77);
      const tip = radial(
        from,
        a,
        Math.min(w * 0.16, reach * 0.65) * (0.6 + rnd() * 0.52),
        h * (leader ? 0.08 : 0.08 + rnd() * 0.13),
      );
      twigFork(m, from, tip, r0 * 0.25, a, t);
      foliage(m, tip, radius * (0.66 + rnd() * 0.29), radius * 0.63, t, young ? 4 : 9, from);
    }
  }
}

function tieredTree(m, t, sp) {
  const { p, base, h, w, tr, rnd, bark } = t,
    root = [...p, base],
    top = radial(root, rnd() * TAU, tr * 0.75, h * 0.97);
  m.part(PLANT_PART.trunk);
  bough(
    m,
    [[...p, base - 0.15], mix(root, top, 0.1), mix(root, top, 0.55), top],
    [tr * 1.34, tr * 0.97, tr * 0.6, tr * 0.08],
    bark,
    9,
  );
  const conifer = sp === "cedar",
    ginkgo = sp === "ginkgo",
    tiers = conifer ? 8 : ginkgo ? 7 : 6,
    clear = conifer ? t.clear : ginkgo ? 0.22 : 0.3;
  for (let k = 0; k < tiers; k++) {
    const u = (k + 0.25) / tiers,
      z = clear + u * (0.95 - clear);
    const width = conifer
      ? 1 - 0.86 * u
      : (ginkgo ? Math.pow(1 - u, 0.65) : Math.sin(Math.PI * (0.17 + u * 0.76))) * (ginkgo ? 1 : 1.05);
    const count = conifer ? 6 : ginkgo ? 4 : 5,
      phase = rnd() * TAU;
    for (let i = 0; i < count; i++) {
      const a = phase + (i * TAU) / count + (rnd() - 0.5) * 0.5,
        start = mix(root, top, z);
      const r = w * 0.38 * width * (0.83 + 0.18 * rnd()),
        rise = conifer ? 0.04 * h : (ginkgo ? 0.13 : 0.09) * h * (1 - 0.55 * u);
      const end = radial(start, a, r, rise),
        mid = radial(start, a + 0.13, r * 0.52, rise + (conifer ? 0.025 * h : -0.05 * h));
      m.part(PLANT_PART.branch);
      bough(m, [start, mid, end], [tr * (0.37 - 0.2 * u), tr * (0.19 - 0.09 * u), 0.021], bark, 5);
      const cr = Math.max(w * 0.045, w * (conifer ? 0.15 : ginkgo ? 0.14 : 0.2) * width);
      foliage(m, end, cr, conifer ? cr * 0.48 : cr * 1.05, t, conifer ? 10 : ginkgo ? 12 : 17, mid);
      foliage(m, mid, cr * 0.83, conifer ? cr * 0.45 : cr * 0.82, t, conifer ? 6 : 8, start);
    }
  }
  foliage(m, mix(root, top, 0.93), w * 0.08, h * 0.08, t, 8);
}

function palm(m, t) {
  const { p, base, h, w, tr, rnd, bark } = t,
    root = [...p, base],
    hub = radial(root, rnd() * TAU, tr * 1.3, h * 0.82);
  m.part(PLANT_PART.trunk);
  bough(m, [[...p, base - 0.12], mix(root, hub, 0.6), hub], [tr * 1.15, tr * 0.86, tr * 1.12], bark, 9);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4 + rnd() * 0.23,
      high = i % 3 === 0,
      length = w * (high ? 0.18 : 0.38);
    const mid = radial(hub, a, length * 0.63, h * (high ? 0.08 : 0.035)),
      tip = radial(hub, a, length, h * (high ? 0.11 : -0.015));
    m.part(PLANT_PART.branch);
    addLimb(m, hub, mid, tr * 0.11, 0.018, bark, 4);
    m.part(PLANT_PART.branch);
    addLimb(m, mid, tip, 0.018, 0.012, bark, 5);
    m.shoot(
      "palm",
      tip,
      a,
      high ? 0.67 : -0.22,
      (rnd() - 0.5) * 0.52,
      w * 0.27,
      w * 0.31,
      w * 0.31,
      0.84 + 0.18 * rnd(),
      rnd(),
    );
  }
}

export function treeModel(m, f, p, g, sp, clear, tr, rnd) {
  const t = {
    p,
    base: g,
    h: f.height,
    w: f.crown || f.height * 0.6,
    tr,
    clear,
    rnd,
    kind: sp,
    forkHeight: f.forkHeight,
    bark: sp === "cherry" ? CHERRY_BARK : BARK,
  };
  if (f.kind === "conifer") {
    t.kind = "cedar";
    t.clear = 0.1;
    tieredTree(m, t, "cedar");
  } else if (sp === "cherry" || sp === "zelkova") branchingTree(m, t, sp === "cherry");
  else if (sp === "palm") palm(m, t);
  else tieredTree(m, t, sp);
  if (f.staked) {
    const tan = [0.51, 0.39, 0.24, 1],
      hub = [p[0], p[1], g + Math.min(1.45, t.h * 0.35)];
    m.part(PLANT_PART.branch);
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 + 0.4;
      addLimb(m, radial([...p, g], a, 0.55, -0.02), radial(hub, a, 0.09, 0.09), 0.045, 0.038, tan, 6);
    }
    const wrap = [0.61, 0.54, 0.41, 1];
    addLimb(m, [p[0], p[1], hub[2] - 0.07], [p[0], p[1], hub[2] + 0.1], tr * 1.12, tr * 1.08, wrap, 9);
  }
}

// Interlocking clipped crowns carry terminal shoots around their upper edges.
function shrub(m, p, z, r, h, rnd, groundSlope) {
  m.base = z;
  const tint = 0.78 + rnd() * 0.25,
    slope = (x, y) => groundSlope[0] * x + groundSlope[1] * y,
    n = 8,
    phase = rnd() * TAU;
  const patch = (k, scale, height) => {
    const az = phase + (k * TAU) / n,
      x = r * scale * Math.cos(az),
      y = r * scale * Math.sin(az);
    return [
      [p[0] + x, p[1] + y],
      z + h * height + slope(x, y),
      unit([Math.cos(az) * scale, Math.sin(az) * scale, height + 0.12]),
      [tint * (0.76 + 0.23 * height), 0, 0, 1],
    ];
  };
  m.part(PLANT_PART.shrub);
  for (let k = 0; k < n; k++) {
    const a = patch(k, 0.83, 0),
      b = patch(k + 1, 0.83, 0),
      c = patch(k + 1, 0.92, 0.48),
      d = patch(k, 0.92, 0.48);
    const e = patch(k, 0.48, 0.8),
      f = patch(k + 1, 0.48, 0.8),
      top = patch(k, 0, 0.9);
    for (const v of [a, b, c, a, c, d, d, c, f, d, f, e, e, f, top]) m.vert(...v);
  }
  for (let k = 0; k < 10; k++) {
    const az = k * 2.4 + phase,
      off = k < 7 ? 0.58 : 0.29,
      dx = r * off * Math.cos(az),
      dy = r * off * Math.sin(az);
    const c = [p[0] + dx, p[1] + dy, z + slope(dx, dy) + h * (k < 7 ? 0.64 : 0.87)];
    shrubShoot(
      m,
      c,
      az + 0.5,
      0.32 + rnd() * 0.88,
      r * (0.4 + 0.12 * rnd()),
      Math.min(r * 0.55, h * 0.53),
      tint * (0.8 + 0.17 * rnd()),
      rnd,
    );
  }
}

// Clipped beds form a continuous canopy on the library slope and on each planted Taki roof step.
// Split the polygon's own triangles, so neither stairs nor the skylight can acquire leaves.
function continuousCover(m, ring, heightAt, h) {
  const step = Math.min(0.78, h * 1.18);
  const limit = step * step;
  const spacing = h * 2.65,
    crowns = new Map();
  const crownAt = (i, j) => {
    const key = (i + 32768) * 65536 + j + 32768;
    if (!crowns.has(key)) {
      const rnd = seeded(hashStr(i + "/" + j));
      crowns.set(key, [
        (i + 0.18 + 0.64 * rnd()) * spacing,
        (j + 0.18 + 0.64 * rnd()) * spacing,
        1 / (spacing * (0.68 + 0.32 * rnd())),
        1 / (spacing * (0.64 + 0.28 * rnd())),
        0.73 + 0.37 * rnd(),
      ]);
    }
    return crowns.get(key);
  };
  const topAt = (p) => {
    const edge = Math.min(1, distToRing(...p, ring) / (h * 0.6));
    const rounded = edge * (2 - edge);
    const cx = Math.floor(p[0] / spacing),
      cy = Math.floor(p[1] / spacing);
    let top = 0;
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cy - 1; j <= cy + 1; j++) {
        const [x, y, rx, ry, height] = crownAt(i, j);
        const profile = 1 - ((p[0] - x) * rx) ** 2 - ((p[1] - y) * ry) ** 2;
        if (profile > 0) top = Math.max(top, height * Math.sqrt(profile));
      }
    return heightAt(p) + h * (0.26 + top * (0.32 + 0.48 * rounded));
  };
  const cache = new Map();
  const sample = (p) => {
    const key = Math.round(p[0] * 1000) + "," + Math.round(p[1] * 1000);
    if (cache.has(key)) return cache.get(key);
    const z = topAt(p),
      d = 0.16;
    const dx = (topAt([p[0] + d, p[1]]) - topAt([p[0] - d, p[1]])) / (2 * d);
    const dy = (topAt([p[0], p[1] + d]) - topAt([p[0], p[1] - d])) / (2 * d);
    const v = [p, z, unit([Number.isFinite(dx) ? -dx : 0, Number.isFinite(dy) ? -dy : 0, 1]), [0.91, 0, 0, 1]];
    cache.set(key, v);
    return v;
  };
  const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const triangle = (a, b, c) => {
    const ab = distance2(a, b),
      bc = distance2(b, c),
      ca = distance2(c, a);
    if (Math.max(ab, bc, ca) > limit) {
      if (bc >= ab && bc >= ca) [a, b, c] = [b, c, a];
      else if (ca >= ab) [a, b, c] = [c, a, b];
      const mid = mix(a, b, 0.5);
      triangle(a, mid, c);
      triangle(mid, b, c);
      return;
    }
    const vertices = [sample(a), sample(b), sample(c)];
    if (vertices.every((v) => Number.isFinite(v[1]))) {
      for (const v of vertices) {
        m.base = v[1] - h;
        m.vert(...v);
      }
    }
  };
  m.part(PLANT_PART.shrub);
  const indices = earcut(ring.flat());
  for (let i = 0; i < indices.length; i += 3)
    triangle(ring[indices[i]], ring[indices[i + 1]], ring[indices[i + 2]]);
  const sign = ringArea(ring) >= 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const pieces = 2 ** Math.max(0, Math.ceil(Math.log2(Math.sqrt(distance2(a, b)) / step)));
    const normal = unit([sign * (b[1] - a[1]), sign * (a[0] - b[0]), 0.12]);
    let p = a;
    for (let j = 1; j <= pieces; j++) {
      const q = mix(a, b, j / pieces);
      const zp = sample(p)[1],
        zq = sample(q)[1],
        gp = heightAt(p),
        gq = heightAt(q);
      if ([zp, zq, gp, gq].every(Number.isFinite)) {
        m.base = (gp + gq) / 2;
        for (const [xy, z] of [
          [p, gp],
          [q, gq],
          [q, zq],
          [p, gp],
          [q, zq],
          [p, zp],
        ])
          m.vert(xy, z, normal, [0.74, 0, 0, 1]);
      }
      p = q;
    }
  }
  return topAt;
}

function bed(m, ring, heightAt, pitch, h, rnd, dense = false) {
  // On the library curb the clipped face has short live tips all the way down.
  // Recess the woody core so those tips can sit outside it, within the planting boundary.
  const edgeDepth = 0.14;
  const inset = dense
    ? offsetRingBy(
        ring,
        ring.map(() => -edgeDepth),
      )
    : null;
  const hasMargin =
    inset &&
    inset.every(
      (p, i) => pointInRing(...p, ring) && Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]) < edgeDepth * 4,
    );
  const topAt = continuousCover(m, hasMargin ? inset : ring, heightAt, h);
  if (hasMargin) {
    const winding = Math.sign(ringArea(ring));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        az = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const inward = az + (winding * Math.PI) / 2;
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.19);
      for (let k = 0; k < steps; k++) {
        const xy = mix(a, b, (k + 0.5) / steps);
        const p = [xy[0] + edgeDepth * Math.cos(inward), xy[1] + edgeDepth * Math.sin(inward)];
        if (!pointInRing(...p, ring)) continue;
        const margin = Math.min(edgeDepth, distToRing(...p, ring)),
          base = heightAt(p),
          rise = topAt(p) - base;
        if (!Number.isFinite(rise) || margin < 0.05) continue;
        for (const tier of [0.36, 0.78]) {
          const root = [...p, base + (tier + 0.12 * rnd()) * rise];
          shrubShoot(
            m,
            root,
            inward + Math.PI + (rnd() - 0.5) * 1.6,
            0.2 + 0.75 * rnd(),
            margin,
            margin,
            0.86 + 0.25 * rnd(),
            rnd,
          );
        }
      }
    }
  }
  const xs = ring.map((p) => p[0]),
    ys = ring.map((p) => p[1]),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const plantAt = (p) => {
    if (!pointInRing(...p, ring)) return false;
    const radius = Math.min(pitch * (0.7 + 0.22 * rnd()), distToRing(...p, ring));
    if (radius < 0.12) return false;
    const z = heightAt(p),
      zx = heightAt([p[0] + radius * 0.4, p[1]]),
      zy = heightAt([p[0], p[1] + radius * 0.4]);
    if (![z, zx, zy].every(Number.isFinite)) return false;
    const slopes = [zx - z, zy - z].map((d) => Math.max(-0.85, Math.min(0.85, d / (radius * 0.4))));
    if (rnd() < 0.065) {
      shrub(m, p, z, radius, Math.min(radius * 1.55, h * (0.83 + 0.34 * rnd())), rnd, slopes);
    } else {
      m.base = z;
      const crown = [...p, topAt(p) - 0.045 * h];
      const az = rnd() * TAU;
      for (let i = 0; i < 4; i++)
        shrubShoot(
          m,
          crown,
          az + i * 2.4,
          0.41 + rnd() * 0.53,
          radius * (0.58 + 0.16 * rnd()),
          Math.min(radius * 0.63, h * (0.23 + 0.09 * rnd())),
          0.82 + rnd() * 0.26,
          rnd,
        );
    }
    return true;
  };
  let planted = false;
  const spacing = pitch * (dense ? 0.35 : 0.59);
  for (let row = 0, y = y0 + spacing * 0.23; y < y1; y += spacing * 0.84, row++) {
    for (let x = x0 + spacing * (row % 2 ? 0.64 : 0.16); x < x1; x += spacing) {
      if (plantAt([x + (rnd() - 0.5) * spacing * 0.66, y + (rnd() - 0.5) * spacing * 0.66])) planted = true;
    }
  }
  // A narrow isolated green board can fall entirely between two rows.
  if (!planted) plantAt(ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]));
}

function hedge(m, f, groundAt, rnd) {
  const pts = densify(f.coords.map(toXY), Math.max(0.4, Math.min(0.86, f.thickness * 0.75))).pts,
    hw = f.thickness / 2;
  const left = offsetLine(pts, hw),
    right = offsetLine(pts, -hw),
    rings = [];
  const profile = [
    [-1, -0.04],
    [-0.98, 0.71],
    [-0.72, 0.94],
    [0, 0.98],
    [0.72, 0.94],
    [0.98, 0.71],
    [1, -0.04],
  ];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      nx = (left[i][0] - right[i][0]) / (2 * hw),
      ny = (left[i][1] - right[i][1]) / (2 * hw);
    const g = f.rim ? railGround(groundAt, p, [nx, ny]) : groundAt(toLngLat(p));
    if (!Number.isFinite(g)) return;
    m.base = g;
    const hh = f.height * (0.975 + 0.035 * rnd());
    rings.push(
      profile.map(([side, h]) => [
        [p[0] + side * nx * hw, p[1] + side * ny * hw],
        g + hh * h,
        unit([side * nx, side * ny, 1.01 - Math.abs(side)]),
        [0.73 + 0.22 * h, 0, 0, 1],
      ]),
    );
    if (i > 0) {
      m.part(PLANT_PART.shrub);
      for (let j = 1; j < profile.length; j++) {
        const a = rings[i - 1],
          b = rings[i];
        for (const v of [a[j - 1], b[j - 1], b[j], a[j - 1], b[j], a[j]]) m.vert(...v);
      }
    }
    for (const side of [-0.82, 0, 0.82]) {
      const c = [p[0] + nx * hw * side, p[1] + ny * hw * side, g + hh * (side ? 0.88 : 0.97)];
      shrubShoot(
        m,
        c,
        Math.atan2(ny, nx) + rnd() * 1.3,
        0.3 + rnd() * 0.6,
        Math.min(0.78, hw * 0.84),
        Math.min(0.46, hh * 0.42),
        0.84 + rnd() * 0.18,
        rnd,
      );
    }
  }
  m.part(PLANT_PART.shrub);
  for (const cap of [rings[0], rings.at(-1)])
    for (let j = 1; j < cap.length - 1; j++) for (const v of [cap[0], cap[j], cap[j + 1]]) m.vert(...v);
}

// IMG_1375 at the West 5 ramp shows upright goldenrod behind the rail. The wall feature
// records the height of the tall central stand, the surface records its lower fringes.
function goldenrod(m, f, groundAt, rnd) {
  const line = f.coords.map(toXY);
  const ring =
    f.type === "surface"
      ? line
      : [...offsetLine(line, f.thickness / 2), ...offsetLine(line, -f.thickness / 2).reverse()];
  const xs = ring.map((p) => p[0]),
    ys = ring.map((p) => p[1]),
    pitch = f.type === "wall" ? 0.34 : 0.4;
  const xmax = Math.max(...xs),
    ymax = Math.max(...ys);
  for (let x = Math.min(...xs); x < xmax; x += pitch)
    for (let y = Math.min(...ys); y < ymax; y += pitch) {
      const p = [x + pitch * rnd(), y + pitch * rnd()];
      if (!pointInRing(...p, ring) || distToRing(...p, ring) < 0.14) continue;
      const z = groundAt(toLngLat(p));
      if (!Number.isFinite(z)) continue;
      m.base = z;
      const h = (f.type === "wall" ? f.height : 0.68) * (0.68 + 0.34 * rnd()),
        a = rnd() * TAU;
      const root = [...p, z],
        top = radial(root, a, h * 0.085, h),
        leaf = [0.35, 0.43, 0.19, 1];
      m.part(PLANT_PART.herb, rnd());
      addLimb(m, root, top, 0.009, 0.004, leaf, 4);
      for (let i = 0; i < 9; i++) {
        const at = mix(root, top, 0.16 + i * 0.079),
          az = a + i * 2.4,
          length = (0.19 - i * 0.009) * h;
        const spine = radial(at, az, length * 0.52, length * 0.25),
          tip = radial(at, az, length, length * 0.12);
        const left = radial(spine, az + Math.PI / 2, 0.017, -0.005),
          right = radial(spine, az - Math.PI / 2, 0.017, -0.005);
        herbBlade(m, [at, right, tip, left], radial(spine, az, 0, 0.007), radial(spine, az, 0, -0.004), leaf);
      }
      m.part(PLANT_PART.panicle, rnd());
      for (let i = 0; i < 9; i++) {
        const az = a + i * 2.4,
          base = mix(root, top, 0.73 + i * 0.029),
          length = h * (0.13 - i * 0.012);
        const head = radial(base, az, length * 0.62, length * 0.53);
        const tip = radial(base, az, length, length * 0.46);
        const left = radial(head, az + Math.PI / 2, h * 0.017, 0);
        const right = radial(head, az - Math.PI / 2, h * 0.017, 0);
        const raised = [head[0], head[1], head[2] + h * 0.021],
          gold = [0.83, 0.67, 0.18, 1];
        herbBlade(m, [base, right, tip, left], raised, radial(head, az, 0, -h * 0.01), gold);
      }
    }
}

function herbBlade(m, rim, top, underside, color) {
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i],
      b = rim[(i + 1) % rim.length];
    for (const tri of [
      [top, a, b],
      [underside, b, a],
    ]) {
      const n = unit(
        cross(
          tri[1].map((v, k) => v - tri[0][k]),
          tri[2].map((v, k) => v - tri[0][k]),
        ),
      );
      for (const p of tri) m.vert(p, p[2], n, color);
    }
  }
}

export function plantingModel(m, f, groundAt, wallAt) {
  const rnd = seeded(hashStr(f.id));
  if (f.plant === "goldenrod") return goldenrod(m, f, groundAt, rnd);
  if (f.type === "wall") return hedge(m, f, wallAt, rnd);
  if (f.type === "surface")
    return bed(m, f.coords.map(toXY), (p) => groundAt(toLngLat(p)), 1.13, 0.84, rnd, m.libraryBed);
  const boards = roofBoards(f).list.filter((b) => b.kind === "green");
  const mean = f.coords.reduce((a, p) => [a[0] + p[0] / f.coords.length, a[1] + p[1] / f.coords.length], [0, 0]);
  const g = groundAt(f.groundRef || mean);
  if (!Number.isFinite(g)) return;
  const ceiling = f.detailShell ? roofCeiling(f, groundAt) : null;
  for (const b of boards)
    bed(
      m,
      b.ring,
      (p) => {
        const top = g + b.zAt(p);
        return ceiling && ceiling.at(p) > top + 0.02 ? NaN : top;
      },
      0.74,
      0.5,
      rnd,
    );
}
