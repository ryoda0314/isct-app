import { modelFrame, scale, sub, unit } from "./campus3dKuramaeGeometry.js";
import { raisedLine } from "./campus3dKuramaeType.js";
import { preparePaving, toXY, toLngLat } from "./campus3dFeatures.js";

const timber = ["#a67544", "#af8150", "#b88853", "#aa7845", "#bd9161"];
const rgb = (s, alpha) => [...s.match(/\w\w/g).map((n) => parseInt(n, 16) / 255), alpha];
const steel = rgb("a4aaab", 0.625),
  trim = rgb("73797a", 0.625),
  charcoal = rgb("494644", 1);
function bistroTable(g, w, d, h, T) {
  const radius = Math.min(w, d) / 2;
  g.turned(
    0,
    0,
    [
      [0.012, radius * 0.47],
      [0.023, radius * 0.61],
      [0.054, radius * 0.59],
      [0.068, radius * 0.3],
      [0.078, 0.053],
    ],
    charcoal,
    24,
  );
  g.turned(
    0,
    0,
    [
      [0.069, 0.049],
      [0.086, 0.052],
      [0.091, 0.038],
      [h - 0.054, 0.038],
      [h - 0.045, 0.105],
      [h - 0.03, 0.118],
    ],
    steel,
  );
  g.turned(
    0,
    0,
    [
      [h - 0.033, radius - 0.01],
      [h - 0.027, radius],
      [h - 0.006, radius],
      [h - 0.001, radius - 0.006],
    ],
    steel,
    32,
  );
  g.turned(
    0,
    0,
    [
      [h - 0.004, radius - 0.007],
      [h, radius - 0.013],
    ],
    T("#c4a478"),
    32,
  );
}
function cafeChair(g, w, d, h, T) {
  const X = w / 2 - 0.023,
    back = -d / 2 + 0.031,
    front = d / 2 - 0.034,
    seat = Math.min(0.45, h * 0.56) - 0.01;
  for (const sign of [-1, 1]) {
    const x = sign * X;
    g.tube(
      [
        [x * 1.07, front + 0.033, 0.01],
        [x, front - 0.026, seat - 0.025],
        [x, front - 0.033, seat + 0.093],
        [x, front - 0.058, seat + 0.168],
        [x, front - 0.103, seat + 0.187],
        [x, back + 0.051, seat + 0.193],
        [x, back + 0.004, seat + 0.169],
      ],
      0.0135,
      steel,
      9,
    );
    g.tube(
      [
        [x * 1.05, back - 0.034, 0.01],
        [x, back + 0.054, seat - 0.034],
        [x, back + 0.055, seat + 0.075],
        [x, back + 0.022, seat + 0.19],
        [x, back - 0.045, h - 0.015],
      ],
      0.014,
      steel,
      9,
    );
    g.tube(
      [
        [x, back + 0.043, seat - 0.036],
        [x, front - 0.023, seat - 0.036],
      ],
      0.0145,
      trim,
    );
    g.tube(
      [
        [x, front + 0.03, 0.009],
        [x, front + 0.029, 0.03],
      ],
      0.015,
      charcoal,
      8,
    );
    g.tube(
      [
        [x, back - 0.033, 0.009],
        [x, back - 0.029, 0.03],
      ],
      0.015,
      charcoal,
      8,
    );
  }
  for (const y of [back + 0.077, front - 0.049])
    g.tube(
      [
        [-X, y, seat - 0.028],
        [X, y, seat - 0.028],
      ],
      0.012,
      trim,
      8,
    );
  for (let i = 0; i < 5; i++) {
    const y = back + 0.057 + ((front - back - 0.036) * i) / 5,
      step = (front - back - 0.036) / 5;
    g.box(-X + 0.013, y, seat - 0.012, X - 0.013, y + step - 0.011, seat + 0.01, T(timber[i]));
  }
  // Boards follow the back rake; each has its own front, back, four edges and two rivets.
  for (let i = 0; i < 4; i++) {
    const b = seat + 0.107 + (i * (h - seat - 0.12)) / 4,
      t = b + (h - seat - 0.12) / 4 - 0.016;
    const y = (z) => back + 0.074 - (0.122 * (z - seat)) / (h - seat);
    const a = [
      [-X + 0.009, y(b), b],
      [X - 0.009, y(b), b],
      [X - 0.009, y(t), t],
      [-X + 0.009, y(t), t],
    ];
    const e = a.map(([x, v, z]) => [x, v - 0.02, z]),
      wood = T(timber[(i + 1) % 5]);
    g.face([...a].reverse(), wood);
    g.face(e, wood);
    for (let j = 0; j < 4; j++) g.face([a[j], a[(j + 1) % 4], e[(j + 1) % 4], e[j]], wood);
    for (const x of [-X + 0.026, X - 0.026])
      g.tube(
        [
          [x, y((t + b) / 2), (t + b) / 2],
          [x, y((t + b) / 2) + 0.003, (t + b) / 2],
        ],
        0.005,
        trim,
        7,
      );
  }
}
function cafeLetters(g, w, d, h, T, twoLines) {
  const backing = T("#373b56"),
    blue = T("#4844d0"),
    glow = T("#b3bbff");
  g.box(-w / 2, -d / 2 + 0.018, 0, w / 2, d / 2, h, backing);
  const line = (text, span, bottom, height) => {
    const at = (x, z, depth) => [-span / 2 + x, -d / 2 - depth, bottom + z];
    raisedLine(g, text, at, span, height, 0.024, glow, blue);
  };
  if (twoLines) {
    line("EXCELSIOR", w * 0.9, h * 0.55, h * 0.33);
    line("CAFFÉ", w * 0.53, h * 0.1, h * 0.33);
  } else line("EXCELSIOR CAFFÉ", w * 0.91, h * 0.25, h * 0.5);
}
function menuStand(g, w, d, h, T, directory, lunch = false) {
  const black = T("#333435"),
    paper = T("#e6dfc9"),
    mark = T("#64503f");
  const x = w / 2 - 0.033,
    b = directory ? 0.12 : h * 0.22,
    top = h - 0.055;
  if (directory) {
    g.box(-w * 0.52, -d * 0.6, 0, w * 0.52, d * 0.6, 0.062, trim);
    g.box(-x, -0.025, 0.055, x, 0.045, h, black);
    for (const sign of [-1, 1]) g.box(sign * x - 0.015, -0.039, 0.059, sign * x + 0.015, 0.05, h, steel);
  } else {
    for (const s of [-1, 1]) {
      g.tube(
        [
          [s * x, -d * 0.5, 0.018],
          [s * x, -0.02, top],
          [s * x, 0.02, top],
          [s * x, d * 0.5, 0.018],
        ],
        0.018,
        black,
      );
      g.tube(
        [
          [s * x, -d * 0.37, h * 0.27],
          [s * x, d * 0.37, h * 0.27],
        ],
        0.01,
        trim,
      );
    }
    g.box(-x, -d * 0.55, 0.008, x, d * 0.52, 0.084, black);
  }
  const depth = (z) => (directory ? -0.041 : -0.019 - ((top - z) * d * 0.46) / top);
  const plate = (a, c, y, z, offset, col) => {
    const p = [
      [a, depth(y) - offset, y],
      [c, depth(y) - offset, y],
      [c, depth(z) - offset, z],
      [a, depth(z) - offset, z],
    ];
    g.face([...p].reverse(), col);
  };
  plate(-x, x, b, top, 0.001, black);
  plate(-x + 0.023, x - 0.023, b + 0.025, top - 0.028, 0.004, paper);
  if (directory) {
    for (let i = 0; i < 5; i++) {
      const z = top - 0.16 - i * h * 0.103;
      plate(-x + 0.047, x - 0.044, z - 0.022, z, 0.01, i === 0 ? T("#40546b") : mark);
      plate(-x + 0.05, x * 0.48, z - 0.054, z - 0.046, 0.01, mark);
    }
  } else {
    const z = b + (top - b) * 0.53;
    // Extruded outline of a cup, saucer and handle on the printed menu side.
    const path = (pts) => pts.map(([u, v]) => [u * w, depth(z + v * h) - 0.009, z + v * h]);
    if (lunch) {
      const rim = Array.from({ length: 25 }, (_, i) => [
        0.28 * Math.cos((i * Math.PI) / 12),
        0.099 * Math.sin((i * Math.PI) / 12),
      ]);
      g.tube(path(rim), 0.005, T("#955743"));
      for (let i = 0; i < 3; i++) {
        const strand = Array.from({ length: 19 }, (_, j) => {
          const t = j / 18;
          return [(t - 0.5) * 0.36, 0.02 * (i - 1) + 0.019 * Math.sin(t * 10 + i)];
        });
        g.tube(path(strand), 0.006, T("#ad793c"));
      }
    } else {
      g.tube(
        path([
          [-0.19, 0.069],
          [-0.14, -0.03],
          [-0.1, -0.05],
          [0.08, -0.05],
          [0.14, -0.025],
          [0.17, 0.069],
          [-0.19, 0.069],
        ]),
        0.007,
        mark,
      );
      g.tube(
        path([
          [0.164, 0.042],
          [0.223, 0.042],
          [0.239, 0.017],
          [0.208, -0.004],
          [0.142, -0.012],
        ]),
        0.006,
        mark,
      );
      g.tube(
        path([
          [-0.22, -0.072],
          [0.2, -0.072],
        ]),
        0.006,
        mark,
      );
    }
    for (const [u, v, length] of [
      [-0.3, 0.17, 0.6],
      [-0.26, -0.13, 0.52],
      [-0.22, -0.164, 0.44],
      [-0.19, -0.201, 0.38],
    ])
      plate(u * w, (u + length) * w, z + v * h, z + v * h + 0.008, 0.009, mark);
  }
}
function pendant(g, w, d, h, T) {
  const R = Math.min(w, d) * 0.5;
  g.turned(
    0,
    0,
    [
      [h - 0.024, 0.052],
      [h, 0.052],
    ],
    trim,
    12,
  );
  g.tube(
    [
      [0, 0, 0.13],
      [0, 0, h - 0.012],
    ],
    0.007,
    charcoal,
    7,
  );
  g.turned(
    0,
    0,
    [
      [0.015, R],
      [0.036, R],
      [0.079, R * 0.61],
      [0.141, R * 0.24],
      [0.155, R * 0.16],
    ],
    T("#bf945d"),
    20,
  );
  g.turned(
    0,
    0,
    [
      [0.005, R * 0.59],
      [0.009, R * 0.85],
      [0.017, R * 0.88],
    ],
    T("#fff0bc"),
    20,
  );
}
function espressoBar(g, w, d, h, T) {
  g.box(-w / 2, -d / 2, 0, w / 2, d / 2, 0.045, trim);
  g.box(-w / 2, d * 0.12, 0.045, w / 2, d / 2, h * 0.91, steel);
  g.box(-w / 2, -d * 0.43, h * 0.63, w / 2, d / 2, h, trim);
  for (let i = 0; i < 9; i++)
    g.box(-w * 0.45, -d * 0.39 + i * d * 0.05, 0.046, w * 0.45, -d * 0.39 + i * d * 0.05 + 0.009, 0.054, steel);
  for (const x of [-w * 0.235, w * 0.235]) {
    g.turned(
      x,
      0,
      [
        [h * 0.51, 0.031],
        [h * 0.54, 0.047],
        [h * 0.64, 0.047],
      ],
      steel,
      14,
    );
    g.tube(
      [
        [x, -0.015, h * 0.55],
        [x + 0.018, -d * 0.32, h * 0.54],
      ],
      0.012,
      charcoal,
    );
    g.turned(
      x,
      -0.006,
      [
        [0.055, 0.025],
        [0.083, 0.032],
        [0.125, 0.037],
      ],
      T("#ebe8dc"),
      13,
    );
  }
}
function cafeSquare(g, w, d, h, T) {
  const radius = 0.032;
  const rim = (z, inset) => {
    const ring = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2,
        cx = (i === 0 || i === 3 ? 1 : -1) * (w / 2 - radius - inset);
      const cy = (i < 2 ? 1 : -1) * (d / 2 - radius - inset);
      for (let j = 0; j <= 4; j++) {
        const a = angle + (j * Math.PI) / 8;
        ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a), z]);
      }
    }
    return ring;
  };
  g.rings([rim(h - 0.031, 0.004), rim(h - 0.026, 0), rim(h - 0.005, 0), rim(h, 0.004)], T("#bc9771"));
  const black = T("#47413c");
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      const a = [x * (w / 2 - 0.069), y * (d / 2 - 0.069), 0.008],
        b = [x * (w / 2 - 0.09), y * (d / 2 - 0.09), h - 0.032];
      g.tube([a, b], 0.013, black);
    }
  for (const y of [-1, 1])
    g.box(
      -w / 2 + 0.085,
      y * (d / 2 - 0.09) - 0.009,
      h - 0.061,
      w / 2 - 0.085,
      y * (d / 2 - 0.09) + 0.009,
      h - 0.032,
      black,
    );
}
function timberWall(g, w, d, h, T) {
  const n = Math.ceil(w / 0.29),
    step = w / n;
  const veneer = ["#a97c57", "#af825d", "#a77b59", "#ad805c", "#aa805a"];
  g.box(-w / 2, -d / 2 + 0.012, 0, w / 2, d / 2, h, T("#79634e"));
  for (let i = 0; i < n; i++)
    g.box(
      -w / 2 + i * step + 0.003,
      -d / 2,
      0.068,
      -w / 2 + (i + 1) * step - 0.003,
      -d / 2 + 0.014,
      h - 0.018,
      T(veneer[i % veneer.length]),
    );
  g.box(-w / 2, -d / 2 - 0.01, 0, w / 2, d / 2, 0.07, T("#655744"));
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w * 0.255,
      size = Math.min(0.71, w * 0.15);
    g.box(x - size / 2, -d / 2 - 0.034, h * 0.48, x + size / 2, -d / 2, h * 0.82, T("#5d534a"));
    g.box(
      x - size * 0.46,
      -d / 2 - 0.037,
      h * 0.48 + 0.028,
      x + size * 0.46,
      -d / 2 - 0.034,
      h * 0.82 - 0.028,
      T("#e7dfc9"),
    );
    const paperY = -d / 2 - 0.04,
      ink = T(["#77503e", "#5a5946", "#a56b44"][i]);
    const at = (u, v) => [x + u * size, paperY, h * 0.66 + v * size];
    const stroke = (points, r = 0.008) =>
      g.tube(
        points.map(([u, v]) => at(u, v)),
        r,
        ink,
        8,
      );
    if (i === 0) {
      stroke([
        [-0.26, 0.12],
        [-0.19, -0.08],
        [-0.12, -0.13],
        [0.08, -0.13],
        [0.14, -0.08],
        [0.19, 0.12],
        [-0.26, 0.12],
      ]);
      stroke([
        [0.18, 0.09],
        [0.26, 0.11],
        [0.29, 0.07],
        [0.27, 0.01],
        [0.15, -0.02],
      ]);
      stroke([
        [-0.28, -0.17],
        [0.26, -0.17],
      ]);
    } else if (i === 1) {
      for (const [ox, oz] of [
        [-0.11, -0.03],
        [0.11, 0.09],
      ]) {
        const outline = Array.from({ length: 25 }, (_, j) => {
          const a = (j * Math.PI) / 12;
          return [ox + 0.1 * Math.cos(a) + 0.05 * Math.sin(a), oz + 0.14 * Math.sin(a)];
        });
        stroke(outline);
        stroke(
          [
            [ox - 0.05, oz - 0.12],
            [ox + 0.018, oz - 0.03],
            [ox - 0.01, oz + 0.04],
            [ox + 0.05, oz + 0.12],
          ],
          0.006,
        );
      }
    } else {
      for (const radius of [0.25, 0.19])
        stroke(
          Array.from({ length: 25 }, (_, j) => [
            radius * Math.cos((j * Math.PI) / 12),
            radius * 0.55 * Math.sin((j * Math.PI) / 12),
          ]),
        );
      stroke([
        [-0.13, 0.01],
        [-0.08, 0.04],
        [-0.018, -0.018],
        [0.06, 0.035],
        [0.13, 0.01],
      ]);
    }
    raisedLine(
      g,
      "CAFFÉ",
      (xx, zz, depth) => [x - size * 0.275 + xx, paperY - depth, h * 0.755 + zz],
      size * 0.55,
      0.054,
      0.003,
      ink,
      ink,
    );
    for (let j = 0; j < 2; j++)
      g.box(
        x - size * (0.29 - j * 0.05),
        paperY - 0.001,
        h * (0.565 - 0.018 * j),
        x + size * (0.29 - j * 0.05),
        paperY,
        h * (0.569 - 0.018 * j),
        ink,
      );
  }
}
function foldedGate(g, w, d, h) {
  const x = w / 2 - 0.04,
    n = 7;
  for (let i = 0; i <= n; i++) {
    const xx = -x + (2 * x * i) / n;
    for (const s of [-1, 1]) {
      g.tube(
        [
          [xx, s * d * 0.32, 0.09],
          [xx, s * d * 0.32, h - 0.017],
        ],
        0.012,
        steel,
        7,
      );
      if (i < n)
        for (const flip of [false, true])
          g.tube(
            [
              [xx, s * d * 0.32, flip ? 0.18 : h - 0.1],
              [xx + (2 * x) / n, s * d * 0.32, flip ? h - 0.1 : 0.18],
            ],
            0.01,
            trim,
            7,
          );
    }
    g.tube(
      [
        [xx, -d * 0.32, h - 0.02],
        [xx, d * 0.32, h - 0.02],
      ],
      0.012,
      steel,
      7,
    );
    if (i % 3 === 0)
      g.turned(
        xx,
        0,
        [
          [0.006, 0.032],
          [0.08, 0.032],
        ],
        charcoal,
        10,
      );
  }
}
function blockShade(p, lights, night, tone) {
  const pool = lights.reduce((bright, q) => Math.max(bright, Math.exp(-((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2) / 6)), 0);
  return tone + 0.73 - night * (0.53 - 0.4 * pool);
}
function furnitureShadows(items, lamps) {
  const shadows = [];
  for (const it of items) {
    if (it.style !== "cafeSlat" && it.style !== "bistro") continue;
    const r = it.coords.map(toXY),
      center = scale(
        r.reduce((a, b) => [a[0] + b[0], a[1] + b[1]]),
        0.25,
      );
    const u = unit(sub(r[1], r[0])),
      v = unit(sub(r[3], r[0]));
    const lamp = lamps.reduce(
      (near, q) => (!near || Math.hypot(...sub(q, center)) < Math.hypot(...sub(near, center)) ? q : near),
      null,
    );
    if (!lamp) continue;
    const table = it.style === "bistro",
      height = table ? it.z1 : 0.45;
    const dx = ((center[0] - lamp[0]) * height) / (6.9 - height),
      dy = ((center[1] - lamp[1]) * height) / (6.9 - height);
    shadows.push({
      x: center[0] + dx,
      y: center[1] + dy,
      u,
      v,
      rx: Math.hypot(...sub(r[1], r[0])) * 0.51,
      ry: Math.hypot(...sub(r[3], r[0])) * 0.47,
      table,
    });
  }
  return (p) => {
    let shadow = 0;
    for (const s of shadows) {
      const x = p[0] - s.x,
        y = p[1] - s.y;
      if (Math.abs(x) > 0.7 || Math.abs(y) > 0.7) continue;
      const u = (x * s.u[0] + y * s.u[1]) / s.rx,
        v = (x * s.v[0] + y * s.v[1]) / s.ry;
      const dist = s.table ? Math.hypot(u, v) : Math.max(Math.abs(u), Math.abs(v));
      shadow = Math.max(shadow, Math.min(1, Math.max(0, (1.27 - dist) * 3.8)) * (s.table ? 0.21 : 0.17));
    }
    return shadow;
  };
}
function plazaPavers(g, w, d, h, T, at, ctx, items) {
  const pitch = 0.3,
    length = 0.96,
    rows = Math.max(1, Math.round(d / pitch)),
    tileD = d / rows;
  // The 3 mm recessed joints remain visible in grazing views along the passage.
  g.box(-w / 2, -d / 2, h - 0.01, w / 2, d / 2, h - 0.004, rgb("77756e", 0.5));
  const lamps = ctx.plazaLights || [],
    night = ctx.deckTint?.[3] || 0;
  const shadow = furnitureShadows(items, lamps);
  for (let i = 0; i < rows; i++) {
    let x = -w / 2 - ((i % 3) * length) / 3;
    for (let j = 0; x < w / 2; x += length, j++) {
      const a = Math.max(-w / 2, x) + 0.0025,
        b = Math.min(w / 2, x + length) - 0.0025;
      if (b <= a) continue;
      const y = -d / 2 + i * tileD + 0.0025;
      const variance = (((i * 7 + j * 13) % 9) - 4) * 0.002;
      const corner = (x, y) => {
        const p = at(x, y),
          shade = blockShade(p, lamps, night, variance) - shadow(p);
        return [
          [x, y, h],
          [0, 0, 1],
          [shade + 0.014, shade + 0.012, shade - 0.011, 0.5],
        ];
      };
      const divisions = Math.ceil((b - a) / 0.15);
      const rows = Array.from({ length: 3 }, (_, iy) =>
        Array.from({ length: divisions + 1 }, (_, ix) =>
          corner(a + ((b - a) * ix) / divisions, y + ((tileD - 0.005) * iy) / 2),
        ),
      );
      for (let iy = 0; iy < 2; iy++)
        for (let ix = 0; ix < divisions; ix++) {
          const a = rows[iy][ix],
            b = rows[iy][ix + 1],
            c = rows[iy + 1][ix + 1],
            d = rows[iy + 1][ix];
          for (const v of [a, b, c, a, c, d]) g.vertex(...v);
        }
    }
  }
}
function ventGrate(g, w, d, h) {
  g.box(-w / 2, -d / 2, 0, w / 2, d / 2, h - 0.005, charcoal);
  for (let x = -w / 2 + 0.013; x < w / 2; x += 0.035) g.box(x, -d / 2 + 0.013, h - 0.008, x + 0.012, d / 2 - 0.013, h, trim);
  for (const s of [-1, 1]) g.box(-w / 2, (s * d) / 2 - 0.009, h - 0.008, w / 2, (s * d) / 2 + 0.009, h, steel);
}
const fixtures = {
  bistro: bistroTable,
  cafeSquare,
  cafeSlat: cafeChair,
  cafeMenu: (...a) => menuStand(...a, false),
  cafeLunch: (...a) => menuStand(...a, false, true),
  plazaDirectory: (...a) => menuStand(...a, true),
  cafeName: (...a) => cafeLetters(...a, false),
  cafeDoorName: (...a) => cafeLetters(...a, true),
  cafePendant: pendant,
  cafeTimber: timberWall,
  espressoBar,
  foldedGate,
  arcadePavers: plazaPavers,
  plazaDrain: ventGrate,
};
export function drawKuramaeItem(m, it, r, z0, z1, T, ctx = {}, items = []) {
  const draw = Object.hasOwn(fixtures, it.style) && fixtures[it.style];
  if (!draw || r.length !== 4) return false;
  const x = sub(r[1], r[0]),
    y = sub(r[3], r[0]),
    origin = scale(
      r.reduce((a, p) => [a[0] + p[0], a[1] + p[1]]),
      0.25,
    );
  const u = unit(x),
    v = unit(y),
    g = modelFrame(m, origin, u, v, z0);
  const w = Math.hypot(...x),
    d = Math.hypot(...y);
  if (draw === plazaPavers)
    plazaPavers(
      g,
      w,
      d,
      z1 - z0,
      T,
      (a, b) => [origin[0] + a * u[0] + b * v[0], origin[1] + a * u[1] + b * v[1]],
      ctx,
      items,
    );
  else draw(g, w, d, z1 - z0, T);
  return true;
}

export function drawPlazaDirectory(m, f, groundAt, tint) {
  const r = f.coords.map(toXY),
    T = (s) => tint(rgb(s.slice(1), 1)),
    z = groundAt(f.groundRef);
  if (Number.isFinite(z)) drawKuramaeItem(m, { style: f.streetFixture }, r, z, z + f.height, T);
}

// The forecourt slopes towards the station. Each block sits on the same terrain as the walk model.
export function drawPlazaCourses(m, f, groundAt, tint, night, lights) {
  const r = f.coords.map(toXY),
    edge = sub(r[1], r[0]),
    depth = sub(r[3], r[0]);
  const w = Math.hypot(...edge),
    d = Math.hypot(...depth),
    grade = f.grade && preparePaving(f);
  const xy = (x, y) =>
    r[0].map((_, k) => (1 - y / d) * (r[0][k] + (x / w) * edge[k]) + (y / d) * (r[3][k] + (x / w) * (r[2][k] - r[3][k])));
  const nx = Math.ceil(w / 0.43),
    ny = Math.ceil(d / 0.43),
    dx = w / nx,
    dy = d / ny;
  const grid = Array.from({ length: ny + 1 }, (_, j) =>
    Array.from({ length: nx + 1 }, (_, i) => {
      const p = xy(i * dx, j * dy);
      if (!grade) return groundAt(toLngLat(p));
      return grade.heightAt(
        ...xy(Math.max(0.001, Math.min(w - 0.001, i * dx)), Math.max(0.001, Math.min(d - 0.001, j * dy))),
      );
    }),
  );
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const ll = xy((i + 0.5) * dx, (j + 0.5) * dy),
        tone = (((i * 7 + j * 13) % 9) - 4) * 0.003;
      const shade = blockShade(ll, lights, night, tone);
      const zs = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      if (!zs.every(Number.isFinite)) continue;
      const corners = [
        [i * dx, j * dy],
        [(i + 1) * dx, j * dy],
        [(i + 1) * dx, (j + 1) * dy],
        [i * dx, (j + 1) * dy],
      ];
      const mortar = corners.map(([x, y], k) => [xy(x, y), zs[k] + 0.016]);
      const face = corners.map(([x, y], k) => [
        xy(x + (k === 0 || k === 3 ? 0.0025 : -0.0025), y + (k < 2 ? 0.0025 : -0.0025)),
        zs[k] + 0.023,
      ]);
      m.quad(mortar, null, tint([shade * 0.75, shade * 0.75, shade * 0.73, 0.5]));
      const cs = face.map(([p]) => {
        const s = blockShade(p, lights, night, tone);
        return tint([s + 0.014, s + 0.012, s - 0.011, 0.5]);
      });
      m.quadColors(face, [0, 0, 1], cs);
    }
}

export function drawArcadeBlade(m, p, g0, lamps = [], daylight = 1) {
  const [a, b] = p.coords.slice(0, 2).map(toXY),
    u = unit(sub(b, a)),
    v = [-u[1], u[0]];
  const g = modelFrame(m, a, u, v, g0),
    length = Math.hypot(...sub(b, a)),
    half = p.thickness * 0.5;
  const [lo, , hi] = p.zs,
    steps = Math.ceil(length / 0.65);
  function color(x, face) {
    const q = [a[0] + x * u[0], a[1] + x * u[1]];
    const lamp = lamps.reduce((best, l) => Math.max(best, Math.exp(-((q[0] - l[0]) ** 2 + (q[1] - l[1]) ** 2) / 2.3)), 0);
    const value = 0.23 + 0.3 * daylight + face + 0.2 * lamp;
    return [value + 0.024 * lamp, value + 0.013 * lamp, value + 0.007, 0.5];
  }
  for (let i = 0; i < steps; i++) {
    const x = (i * length) / steps,
      r = ((i + 1) * length) / steps;
    for (const s of [-1, 1]) {
      const n = [0, s, 0],
        side = s === 1 ? 0.03 : -0.027;
      for (const [x0, z] of [
        [x, lo],
        [r, lo],
        [r, hi],
        [x, lo],
        [r, hi],
        [x, hi],
      ])
        g.vertex([x0, half * s, z], n, color(x0, side + (z === lo ? 0.05 : -0.035)));
    }
    g.face(
      [
        [x, -half, lo],
        [x, half, lo],
        [r, half, lo],
        [r, -half, lo],
      ],
      color((x + r) * 0.5, 0.105),
    );
    g.face(
      [
        [x, -half, hi],
        [r, -half, hi],
        [r, half, hi],
        [x, half, hi],
      ],
      color((x + r) * 0.5, 0.095),
    );
  }
  for (const x of [0, length])
    g.face(
      [
        [x, -half, lo],
        [x, half, lo],
        [x, half, hi],
        [x, -half, hi],
      ],
      color(x, 0.015),
      [x === 0 ? -1 : 1, 0, 0],
    );
}
