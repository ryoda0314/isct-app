import { toXY } from "./campus3dFeatures.js";
import { add, cross, modelFrame, scale, sub, unit } from "./campus3dKuramaeGeometry.js";
import { raisedLine } from "./campus3dKuramaeType.js";

const TAU = 2 * Math.PI;
const metal = (r, g, b) => [r, g, b, 0.625];
const bronze = metal(0.67, 0.59, 0.43),
  patina = metal(0.17, 0.24, 0.34);

// Interpolate both the centre line and the elliptical section at a series of anatomical landmarks.
function sample(stations, t) {
  const n = stations.length - 1,
    q = Math.min(n, t * n),
    i = Math.min(n - 1, Math.floor(q)),
    s = q - i;
  const a = stations[Math.max(0, i - 1)],
    b = stations[i],
    c = stations[i + 1],
    d = stations[Math.min(n, i + 2)];
  return b.map(
    (v, k) => v + 0.5 * s * (c[k] - a[k] + s * (2 * a[k] - 5 * v + 4 * c[k] - d[k] + s * (3 * v - 3 * c[k] + d[k] - a[k]))),
  );
}
function loft(g, stations, guide, color, rings = 22, sides = 16) {
  const rows = Array.from({ length: rings + 1 }, (_, i) => {
    const t = i / rings,
      p = sample(stations, t),
      before = sample(stations, Math.max(0, t - 0.004)),
      after = sample(stations, Math.min(1, t + 0.004));
    const axis = unit(sub(after.slice(0, 3), before.slice(0, 3)));
    const lateral = unit(
      sub(
        guide,
        scale(
          axis,
          guide.reduce((s, x, k) => s + x * axis[k], 0),
        ),
      ),
    );
    const normal = cross(axis, lateral),
      width = Math.max(0.0007, p[3]),
      depth = Math.max(0.0007, p[4]);
    return Array.from({ length: sides }, (_, j) => {
      const a = (TAU * j) / sides;
      return add(p.slice(0, 3), add(scale(lateral, width * Math.cos(a)), scale(normal, depth * Math.sin(a))));
    });
  });
  g.rings(rows, color);
}
function mottling(tint, seed, body = true) {
  return (p, n) => {
    const [x, y, z] = p;
    const streak = Math.sin(26 * x + 13 * y + 6 * z + seed + 1.8 * Math.sin(13 * y - 6 * z)) * 0.5 + 0.5;
    const grain = 0.5 + 0.5 * Math.sin(44 * x - 29 * y + 22 * z + 2.5 * Math.sin(12 * z + seed));
    const gold = Math.max(0, (0.65 * streak + 0.35 * grain - 0.65) * 2.0),
      fade = body ? 0.11 : 0.24;
    return tint(
      metal(0.73 + gold * 0.3 - fade * grain, 0.78 + gold * 0.16 - fade * grain, 0.76 - gold * 0.22 - fade * grain),
    );
  };
}

// Each animal has a curved spine and separately cast, biconvex appendages. The local frame
// rotates around the sculpture, so both the silhouette and the openings change as one walks.
function figure(g, tail, head, azimuth, width, bird, tint, seed) {
  const angle = (azimuth * Math.PI) / 180,
    side = [Math.cos(angle), Math.sin(angle), 0];
  const forward = [-side[1], side[0], 0],
    axis = sub(head, tail);
  const pos = (t, across = 0, ahead = 0) => add(add(tail, scale(axis, t)), add(scale(side, across), scale(forward, ahead)));
  const cast = mottling(tint, seed);
  const bulge = bird ? 0.028 : 0.072;
  const station = (t, across, ahead, w, d) => [...pos(t, across, ahead), width * w, width * d];
  const spine = bird
    ? [
        station(0, 0, -0.02, 0.045, 0.06),
        station(0.22, 0.008, -0.01, 0.39, 0.38),
        station(0.53, 0, bulge, 1, 0.8),
        station(0.78, 0, 0.025, 0.84, 0.76),
        station(0.91, 0, 0.038, 0.48, 0.47),
        station(1, 0, 0.052, 0.012, 0.015),
      ]
    : [
        station(0, 0, 0, 0.25, 0.14),
        station(0.13, 0, 0.015, 0.32, 0.3),
        station(0.33, 0.012, bulge, 0.67, 0.61),
        station(0.55, 0.016, bulge * 1.2, 1, 0.83),
        station(0.72, 0.006, bulge, 0.96, 0.82),
        station(0.82, 0, 0.053, 0.72, 0.66),
        station(0.87, 0, 0.057, 0.44, 0.38),
        station(0.93, 0, 0.075, 0.24, 0.22),
        station(1, 0, 0.083, 0.03, 0.035),
      ];
  loft(g, spine, side, cast, 25, 18);
  for (const sign of [-1, 1]) {
    const S = (t, w, d, r, s) => [...pos(t, sign * w, d), r, s];
    if (bird) {
      // Scimitar primaries curl down on either side; the two tail streamers end separately.
      loft(
        g,
        [
          S(0.72, 0.025, 0.018, 0.044, 0.027),
          S(0.62, width * 1.28, 0.022, 0.067, 0.021),
          S(0.49, width * 2.22, -0.003, 0.06, 0.013),
          S(0.29, width * 2.85, -0.036, 0.037, 0.009),
          S(0.065, width * 3.03, -0.083, 0.002, 0.002),
        ],
        forward,
        cast,
        15,
        9,
      );
      loft(
        g,
        [
          S(0.33, 0.008, 0, 0.035, 0.022),
          S(0.13, width * 0.51, -0.02, 0.035, 0.012),
          S(-0.08, width * 0.92, -0.044, 0.016, 0.008),
          S(-0.19, width * 1.3, -0.052, 0.002, 0.002),
        ],
        forward,
        cast,
        12,
        8,
      );
    } else {
      loft(
        g,
        [
          S(0.035, 0.005, 0, 0.069, 0.029),
          S(0.006, width * 0.76, -0.017, 0.109, 0.025),
          S(-0.006, width * 1.53, -0.039, 0.088, 0.018),
          S(0.027, width * 2.25, -0.063, 0.036, 0.009),
          S(0.059, width * 2.47, -0.085, 0.002, 0.002),
        ],
        forward,
        cast,
        14,
        10,
      );
      loft(
        g,
        [
          S(0.666, width * 0.58, 0.041, 0.042, 0.024),
          S(0.61, width * 1.07, 0.031, 0.066, 0.022),
          S(0.52, width * 1.62, -0.004, 0.046, 0.014),
          S(0.416, width * 1.98, -0.045, 0.019, 0.008),
          S(0.349, width * 2.11, -0.062, 0.002, 0.002),
        ],
        forward,
        cast,
        14,
        10,
      );
    }
  }
  if (!bird) {
    loft(
      g,
      [
        station(0.57, 0, -width * 0.12, 0.044, 0.055),
        station(0.5, 0, -width * 0.75, 0.033, 0.06),
        station(0.45, 0, -width * 1.43, 0.016, 0.032),
        station(0.39, 0, -width * 1.72, 0.003, 0.003),
      ],
      side,
      cast,
      12,
      9,
    );
  }
}
function breakingWave(g, tint) {
  const sides = 80,
    layers = 18;
  const wave = (t, j) => {
    const a = (TAU * j) / sides;
    const flutes = 6 * a - 4.4 * t + 0.53 * Math.sin(3 * a + 1.6 * t);
    const broad = 0.046 * Math.cos(4 * a + 0.3) + 0.027 * Math.sin(7 * a - 2 * t);
    const radius = (0.588 + (0.054 + 0.046 * t) * Math.cos(flutes) + broad) * (1 - 0.63 * t ** 1.52);
    const crest = 0.49 + 0.068 * Math.sin(3 * a + 1.2) + 0.042 * Math.cos(5 * a - 1.4);
    const x = radius * Math.cos(a) + 0.058 * t,
      y = radius * Math.sin(a) - 0.028 * t;
    return [x, y, 0.011 + t * crest + 0.012 * Math.sin(3 * a) * Math.sin(Math.PI * t)];
  };
  // Close the crown inside the clustered tail roots.
  const rows = Array.from({ length: layers + 1 }, (_, i) => Array.from({ length: sides }, (_, j) => wave(i / layers, j)));
  rows.push(rows.at(-1).map(([x, y, z]) => [x * 0.5 + 0.022, y * 0.5 - 0.014, z + 0.007]));
  rows.push(rows.at(-1).map(([x, y, z]) => [x * 0.09, y * 0.09, 0.49 + 0.03 * (z - 0.49)]));
  g.rings(rows, (p, n, i, j) => {
    const t = Math.min(1, i / layers),
      a = (TAU * j) / sides;
    const ribs = 0.5 + 0.5 * Math.cos(6 * a - 4.4 * t + 0.53 * Math.sin(3 * a + 1.6 * t));
    const streak = 0.5 + 0.5 * Math.sin(48 * a - 15 * t + 2 * Math.sin(5 * a)),
      gleam = Math.min(1, 0.06 + 0.43 * t + 0.56 * ribs ** 2 + 0.13 * streak);
    return tint(metal(0.085 + 0.86 * gleam, 0.15 + 0.79 * gleam, 0.255 + 0.675 * gleam));
  });
  // Three overlapping breakers curl out under the flukes and carry the lower figures.
  for (const [x, y, h] of [
    [0.34, -0.31, 0.39],
    [-0.39, -0.16, 0.38],
    [-0.045, 0.43, 0.42],
  ]) {
    const tangent = unit([-y, x, 0]);
    const stations = [
      [0.55, 0.23, 0.024, 0.19, 0.07],
      [0.82, 0.2, 0.12, 0.17, 0.085],
      [0.91, 0.12, 0.24, 0.14, 0.079],
      [0.96, 0.047, h - 0.055, 0.109, 0.069],
      [1, 0, h + 0.045, 0.074, 0.048],
      [0.96, -0.035, h + 0.075, 0.017, 0.012],
    ].map(([r, s, z, w, d]) => [r * x + tangent[0] * s, r * y + tangent[1] * s, z, w, d]);
    loft(
      g,
      stations,
      tangent,
      (p, n) => {
        const grain = 0.5 + 0.5 * Math.sin(58 * p[0] - 35 * p[1] + 17 * p[2]);
        const shine = Math.min(1, 0.19 + p[2] + 0.33 * Math.max(0, n[2]) + 0.1 * grain);
        return tint(metal(0.13 + 0.81 * shine, 0.19 + 0.76 * shine, 0.29 + 0.63 * shine));
      },
      18,
      12,
    );
  }
}
function pedestal(g, half, h, tint) {
  const foot = tint(patina),
    top = tint(metal(0.87, 0.85, 0.74));
  g.box(-half + 0.015, -half + 0.015, 0.006, half - 0.015, half - 0.015, 0.049, foot);
  const ring = (s, z) => [
    [-s, -s, z],
    [s, -s, z],
    [s, s, z],
    [-s, s, z],
  ];
  const bottom = ring(half - 0.006, 0.049),
    shoulder = ring(half, h - 0.015),
    lid = ring(half - 0.012, h);
  for (let j = 0; j < 4; j++) {
    const k = (j + 1) % 4;
    // Broad, brushed silver panels pick up the warm paving and the horizontal band of the eaves.
    const at = (u, t) =>
      add(
        scale(add(scale(bottom[j], 1 - u), scale(bottom[k], u)), 1 - t),
        scale(add(scale(shoulder[j], 1 - u), scale(shoulder[k], u)), t),
      );
    const normal = unit(cross(sub(bottom[k], bottom[j]), sub(shoulder[j], bottom[j])));
    const swatch = (u, t) => {
      const wash =
        0.23 * Math.exp(-(((t - 0.28) / 0.43) ** 2)) + 0.046 * Math.sin(2.5 * u + 0.81 * j) + 0.015 * Math.cos(4.8 * t);
      return tint(metal(0.66 + wash, 0.65 + wash, 0.59 + wash * 0.85));
    };
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 4; col++) {
        const a = col / 4,
          b = (col + 1) / 4,
          c = row / 10,
          d = (row + 1) / 10;
        for (const [u, t] of [
          [a, c],
          [b, c],
          [b, d],
          [a, c],
          [b, d],
          [a, d],
        ])
          g.vertex(at(u, t), normal, swatch(u, t));
      }
    g.face([shoulder[j], shoulder[k], lid[k], lid[j]], top);
  }
  g.face(lid, top);
  const w = half * 0.46,
    z = h * 0.74,
    ph = w * 0.72,
    depth = 0.012;
  g.box(half - 0.002, -w / 2, z - ph / 2, half + depth, w / 2, z + ph / 2, tint(metal(0.92, 0.92, 0.85)));
  const ink = tint([0.14, 0.13, 0.14, 1]);
  const line = (text, ww, y, size) =>
    raisedLine(g, text, (x, v, d) => [half + depth + d, -ww / 2 + x, y + v], ww, size, 0.0018, ink, ink, 480);
  line("飛翔", w * 0.7, z + 0.002, ph * 0.42);
  line("宮田亮平", w * 0.46, z - ph * 0.33, ph * 0.14);
  for (const y of [-0.44 * w, 0.44 * w])
    for (const zz of [-0.4 * ph, 0.4 * ph])
      g.tube(
        [
          [half + depth, y, z + zz],
          [half + depth + 0.0025, y, z + zz],
        ],
        0.004,
        tint(bronze),
        7,
      );
}
export function addHisho(m, f, groundAt, tint) {
  const ring = f.coords.map(toXY),
    center = scale(ring.reduce(add), 1 / ring.length);
  const x = unit(sub(ring[1], ring[0])),
    y = [-x[1], x[0]];
  const ground = groundAt(f.groundRef || f.coords[0]);
  if (!Number.isFinite(ground)) return;
  const g = modelFrame(m, center, x, y, ground + (f.base || 0));
  if (f.sculpture === "hishoBase") {
    pedestal(g, Math.hypot(...sub(ring[1], ring[0])) * 0.5, f.height, tint);
    return;
  }
  breakingWave(g, tint);
  figure(g, [0.34, -0.31, 0.39], [0.11, -0.12, 1.48], 48, 0.129, false, tint, 2);
  figure(g, [-0.39, -0.16, 0.38], [-0.14, 0.065, 1.41], -55, 0.127, false, tint, 5);
  figure(g, [-0.045, 0.43, 0.42], [0.115, 0.16, 1.52], 151, 0.116, false, tint, 8);
  figure(g, [0.22, 0.145, 1.08], [-0.03, 0.06, 1.93], 126, 0.105, false, tint, 13);
  figure(g, [-0.184, -0.13, 1.05], [0.025, -0.065, 1.98], -58, 0.102, false, tint, 16);
  figure(g, [0.102, -0.062, 1.57], [-0.044, 0.025, 2.18], 48, 0.09, true, tint, 10);
  figure(g, [-0.118, 0.068, 1.62], [0.03, -0.014, 2.2], 143, 0.08, true, tint, 19);
  figure(g, [0.005, 0.01, 1.96], [-0.015, 0.0, f.height - (f.base || 0) - 0.001], 55, 0.061, true, tint, 23);
}
