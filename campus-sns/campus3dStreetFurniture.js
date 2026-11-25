import { filmedProp } from "./campus3dStreetProps.js";
import { pavementMesh } from "./campus3dStreetPavement.js";
const charcoal = "#363b3c",
  metal = "#939b99",
  plinth = "#736751",
  white = "#ebe9df";

function twoSided(m, text, x, y, z, w, h, color, depth) {
  m.text(text, x, y - depth / 2 - 0.003, z, w, h, color, 0.005);
  const start = m.v.length;
  m.text(text, 0, -depth / 2 - 0.003, z, w, h, color, 0.005);
  for (let i = start; i < m.v.length; i += 10) {
    m.v[i] = x - m.v[i];
    m.v[i + 1] = y - m.v[i + 1];
    m.v[i + 3] *= -1;
    m.v[i + 4] *= -1;
  }
}
function lantern(m, x, y, z, s) {
  const ring = (h, r) => m.ring(x, y, z + h * s, r * s, r * s, 10);
  m.loft([ring(0, 0.11), ring(0.08, 0.16), ring(0.42, 0.23), ring(0.48, 0.235), ring(0.55, 0.07)], charcoal);
  m.loft([ring(0.105, 0.158), ring(0.385, 0.219)], "lit:#e9e0bd");
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3,
      c = Math.cos(a),
      sine = Math.sin(a);
    m.tube(
      [
        [x + c * 0.153 * s, y + sine * 0.153 * s, z + 0.09 * s],
        [x + c * 0.22 * s, y + sine * 0.22 * s, z + 0.406 * s]
      ],
      0.012 * s,
      charcoal,
      5
    );
  }
  for (const k of [0.18, 0.3]) m.loft([ring(k, 0.15 + k * 0.17), ring(k + 0.019, 0.15 + k * 0.17)], charcoal);
}
// All dimensions below are in metres. The instance scales are only used for
// culling and carrying these vertices through the shared instanced renderer.
export function streetFurnitureModel(m, type, arg) {
  let dims = [1, 1, 1];
  if (type === "entrance") {
    dims = [2.73, 0.83, 7.05];
    m.box(0, 0, 0, 0.3, 0.31, 0.21, "#746a5e");
    m.box(0, 0, 0.16, 0.218, 0.22, 5.55, "#775643");
    m.box(0, -0.123, 0.23, 0.163, 0.024, 4.99, "#967260");
    for (const y of [-0.1, 0.13]) {
      m.tube(
        [
          [0, y, 4.17],
          [0, y, 7.04],
          [1.02, y, 5.63],
          [0, y, 4.17]
        ],
        0.041,
        "#c7c6b8",
        7
      );
      for (let j = 0; j < 4; j++) {
        const dz = j * 0.31;
        m.tube(
          [
            [0, y, 4.27 + dz],
            [0.19 + dz * 0.64, y, 4.55 + dz]
          ],
          0.024,
          metal,
          5
        );
        m.tube(
          [
            [0, y, 6.88 - dz],
            [0.21 + dz * 0.64, y, 6.6 - dz]
          ],
          0.024,
          "#e0dfd0",
          6
        );
      }
      m.tube(
        [
          [-0.31, y, 5.44],
          [2.59, y, 5.44]
        ],
        0.052,
        "#747571",
        7
      );
    }
    m.box(0.32, 0, 5.47, 1.38, 0.35, 0.45, "#67635b");
    m.box(0.32, 0, 5.51, 1.32, 0.371, 0.375, "#f4f0d8");
    twoSided(m, "大岡山北口", 0.32, 0, 5.565, 1.14, 0.248, "#4f4d40", 0.373);
    for (let j = 0; j < 2; j++) {
      const x = 1.08 + j * 0.66;
      const a = [x, -0.36, 5.45],
        b = [x + 0.53, -0.36, 5.45],
        c = [x + 0.65, 0.17, 5.89],
        d = [x + 0.12, 0.17, 5.89];
      m.face([a, b, c, d], "#bdbbab", [0, -1, 0.8]);
      m.tube([a, b, c, d, a], 0.037, "#777774", 6);
      m.box(x + 0.31, -0.12, 5.385, 0.44, 0.34, 0.075, "#555753");
      m.oval(x + 0.31, -0.18, 5.375, 0.101, 0.081, 0.035, "lit:#f9edc2", 10, 5);
    }
  } else if (type === "leaf") {
    dims = [1, 0.1, 2.22];
    const curry = arg === "curry",
      frame = curry ? "#494640" : "#c6cbbe",
      b = curry ? 0.62 : 0.12;
    for (const x of [-0.474, 0.474]) m.box(x, 0, 0.045, 0.052, 0.092, 2.15, frame);
    for (const z of [0.045, b, 1.76, 2.14]) m.box(0, 0, z, 0.95, 0.088, 0.05, frame);
    m.windowPane(-0.459, 0.459, b + 0.045, 2.135, 0, "#889491");
    if (curry) m.box(0, 0.002, 0.087, 0.92, 0.047, 0.52, "#4a4744");
    const x = curry ? 0.339 : -0.32;
    m.tube(
      [
        [x, -0.049, 0.96],
        [x, -0.093, 0.99],
        [x, -0.093, 1.19],
        [x, -0.049, 1.22]
      ],
      0.017,
      metal,
      7
    );
    for (let j = 0; j < (curry ? 4 : 8); j++) {
      const X = -0.27 + (j % 3) * 0.238,
        Z = 0.72 + Math.floor(j / 3) * 0.37 + (j % 2) * 0.03;
      m.box(X, -0.029, Z, 0.19, 0.016, 0.245, ["#e7ddbc", "#cad6b7", "#dfcdb0", "#c9cbd5"][j % 4]);
      m.box(X, -0.041, Z + 0.19, 0.166, 0.012, 0.035, ["#699b84", "#d5a14e", "#8a9786"][j % 3]);
      m.oval(X, -0.047, Z + 0.105, 0.067, 0.008, 0.048, ["#d09e5e", "#adb374", "#bb8172"][j % 3], 9, 4);
    }
  } else if (type === "prop") {
    dims = filmedProp(m, arg);
  } else if (type === "paving") {
    pavementMesh(m, arg);
  } else if (type === "rail") {
    dims = [1.8, 0.14, 0.85];
    const post = (x) => {
      m.turned(
        x,
        0,
        [
          [0, 0.068],
          [0.78, 0.06],
          [0.82, 0.064],
          [0.85, 0.051]
        ],
        "#504745",
        10
      );
      for (const z of [0.53, 0.793])
        m.turned(
          x,
          0,
          [
            [z, 0.066],
            [z + 0.031, 0.066]
          ],
          "#d8b84e",
          10
        );
    };
    post(0);
    post(1.8);
    for (const z of [0.21, 0.46, 0.69]) {
      m.tube(
        [
          [0, 0, z],
          [1.8, 0, z - 0.007]
        ],
        0.022,
        "#534b47",
        7
      );
      for (let j = 0; j < 3; j++)
        m.tube(
          [
            [0.32 + j * 0.55, 0, z - 0.002],
            [0.38 + j * 0.55, 0, z - 0.002]
          ],
          0.023,
          "#cdb74d",
          6
        );
    }
  } else if (type === "cover") {
    dims = [0.68, 0.95, 0.035];
    m.box(0, 0, 0, 0.68, 0.95, 0.021, "#6e6d62");
    m.box(0, 0, 0.019, 0.62, 0.89, 0.007, "#575950");
    for (let j = 0; j < 21; j++) m.box(0, -0.41 + j * 0.04, 0.026, 0.59, 0.008, 0.006, "#8b897c");
    for (let j = 0; j < 14; j++) m.box(-0.28 + j * 0.043, 0, 0.026, 0.008, 0.85, 0.006, "#817e6f");
  } else if (type === "lamp" && arg === "arcade") {
    dims = [1.54, 0.5, 6.47];
    m.box(0, 0, 0, 0.18, 0.17, 6.41, "#4c4746");
    m.box(0.57, 0, 6.29, 1.27, 0.15, 0.15, "#55514f");
    m.tube(
      [
        [0, 0, 5.93],
        [0.36, 0, 6.31],
        [1.22, 0, 6.31]
      ],
      0.038,
      "#55514f",
      7
    );
    m.box(0.12, -0.08, 1.31, 0.16, 0.14, 0.64, "#464444");
    for (let j = 0; j < 7; j++) {
      const x = 0.6 + 0.34 * Math.sin(j * 2.4),
        y = 0.11 * Math.cos(j * 2.4),
        b = 4.93 + 0.16 * (j % 4);
      m.tube(
        [
          [0.7, 0, 6.37],
          [x, y, 6.28],
          [x, y, b + 0.37]
        ],
        0.012,
        metal,
        5
      );
      m.turned(
        x,
        y,
        [
          [b, 0.05],
          [b + 0.06, 0.061],
          [b + 0.37, 0.061],
          [b + 0.4, 0.043]
        ],
        "#b5b7af",
        10
      );
      m.turned(
        x,
        y,
        [
          [b + 0.036, 0.055],
          [b + 0.23, 0.055]
        ],
        j % 2 ? "lit:#eadfb8" : "#d6cfb4",
        9
      );
    }
  } else if (type === "lamp") {
    dims = [1.68, 1, 5.62];
    m.turned(
      0,
      0,
      [
        [0, 0.13],
        [0.13, 0.16],
        [0.39, 0.115],
        [4.62, 0.079],
        [5.2, 0.064]
      ],
      "#51443b",
      10
    );
    m.box(0, 0.08, 1.2, 0.19, 0.19, 0.59, charcoal);
    if (arg === "lantern") {
      [
        [-0.55, 4.39],
        [0.49, 4.52],
        [-0.16, 3.8]
      ].forEach(([x, z]) => {
        m.tube(
          [
            [0, 0, z + 0.65],
            [x * 0.6, 0, z + 0.61],
            [x, 0, z + 0.53]
          ],
          0.033,
          charcoal,
          6
        );
        lantern(m, x, 0, z, 0.95);
      });
    } else {
      for (let j = 0; j < 5; j++) {
        const x = (j - 2) * 0.193,
          z = 4.43 - Math.abs(j - 2) * 0.11;
        m.tube(
          [
            [0, 0, 5.25],
            [x * 0.55, 0, 5.39],
            [x, 0, 5.15],
            [x, 0, z]
          ],
          0.026,
          metal,
          5
        );
        m.box(x, 0, z - 0.21, 0.098, 0.066, 0.29, j % 2 ? "#c7a97a" : "#dedbc6");
      }
      lantern(m, 0.39, 0.02, 4.0, 0.63);
    }
  } else if (type === "pole") {
    dims = [2.3, 1.25, 9.65];
    m.turned(
      0,
      0,
      [
        [0, 0.202],
        [0.28, 0.213],
        [8.64, 0.124],
        [9.48, 0.095]
      ],
      "#a5a297",
      12
    );
    for (const z of [1.4, 2.83, 4.95, 6.5])
      m.turned(
        0,
        0,
        [
          [z, 0.16 + (9 - z) * 0.006],
          [z + 0.056, 0.16 + (9 - z) * 0.006]
        ],
        "#55574e",
        10
      );
    for (const z of [7.28, 9.16]) {
      m.box(0, 0, z, 1.82, 0.094, 0.11, "#696a62");
      for (const x of [-0.77, -0.06, 0.69])
        m.turned(
          x,
          0,
          [
            [z + 0.11, 0.049],
            [z + 0.19, 0.092],
            [z + 0.23, 0.045],
            [z + 0.3, 0.08],
            [z + 0.36, 0.046]
          ],
          "#d4cbb5",
          8
        );
    }
    m.turned(
      0.39,
      -0.09,
      [
        [6.01, 0.22],
        [6.11, 0.27],
        [6.91, 0.27],
        [6.99, 0.29]
      ],
      "#8d928d",
      10
    );
    m.tube(
      [
        [0.43, -0.09, 7.02],
        [0.46, -0.08, 7.4],
        [0.73, -0.02, 7.67]
      ],
      0.025,
      charcoal,
      5
    );
  } else if (type === "wire") {
    // Unit span. Its z varies with the heights of both attachment points.
    const [cm, rise, sag, diameter] = arg.split("_").map(Number);
    const len = cm / 100,
      dz = rise / 100,
      drop = sag / 100,
      r = diameter / 1000;
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [(t - 0.5) * len, 0, drop + Math.max(0, -dz) + dz * t - 4 * drop * t * (1 - t)];
    });
    m.tube(pts, r, charcoal, 5);
    dims = [len, 0.22, Math.max(0.1, Math.abs(dz) + drop + 0.1)];
  } else if (type === "paver") {
    m.loft([m.rect(0, 0, 0, 1, 1), m.rect(0, 0, 0.78, 1, 1), m.rect(0, 0, 1, 0.976, 0.969)], 1);
  } else if (type === "traffic") {
    dims = [0.52, 0.49, 3.48];
    m.turned(
      0,
      0,
      [
        [0.01, 0.073],
        [0.1, 0.08],
        [3.34, 0.043]
      ],
      metal,
      9
    );
    const disc = (z, r, col, y) => {
      const ring = Array.from({ length: 20 }, (_, i) => [
        Math.cos((i * Math.PI) / 10) * r,
        y,
        z + Math.sin((i * Math.PI) / 10) * r
      ]);
      m.face(ring, col, [0, -1, 0]);
      return ring;
    };
    for (const [z, r, body] of [
      [3.01, 0.24, "#b54f49"],
      [2.35, 0.2, "#437596"]
    ]) {
      const a = disc(z, r, white, -0.07),
        b = disc(z, r, metal, 0.015);
      for (let j = 0; j < a.length; j++) m.face([a[j], a[(j + 1) % a.length], b[(j + 1) % a.length], b[j]], metal);
      disc(z, r * 0.91, body, -0.079);
    }
    m.box(0, -0.089, 2.971, 0.314, 0.018, 0.077, white);
    m.box(0, -0.1, 2.235, 0.043, 0.021, 0.214, white);
    m.face(
      [
        [-0.087, -0.109, 2.4],
        [0, -0.109, 2.5],
        [0.086, -0.109, 2.4]
      ],
      white,
      [0, -1, 0]
    );
    m.box(0, -0.062, 2.6, 0.42, 0.054, 0.13, white);
  } else if (type === "bollard") {
    dims = [0.15, 0.15, 0.93];
    m.turned(
      0,
      0,
      [
        [0, 0.073],
        [0.87, 0.069],
        [0.91, 0.071]
      ],
      "#514b47",
      10
    );
    m.turned(
      0,
      0,
      [
        [0.74, 0.07],
        [0.8, 0.07]
      ],
      "#d7bb54",
      10
    );
  } else if (type === "lid") {
    dims = [0.7, 0.7, 0.035];
    m.turned(
      0,
      0,
      [
        [0, 0.343],
        [0.018, 0.344],
        [0.024, 0.33]
      ],
      "#62666a",
      20
    );
    for (const r of [0.1, 0.22, 0.305])
      m.tube(
        Array.from({ length: 21 }, (_, j) => [
          r * Math.cos((j * Math.PI) / 10),
          r * Math.sin((j * Math.PI) / 10),
          0.025
        ]),
        0.007,
        "#858887",
        4
      );
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      m.tube(
        [
          [Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0.026],
          [Math.cos(a) * 0.202, Math.sin(a) * 0.202, 0.026]
        ],
        0.008,
        charcoal,
        4
      );
    }
  } else if (type === "drain") {
    dims = [0.27, 0.47, 0.026];
    m.box(0, 0, 0, 0.266, 0.46, 0.014, "#555859");
    for (let j = 0; j < 9; j++) m.box(0, (j - 4) * 0.05, 0.014, 0.249, 0.021, 0.012, "#92938b");
  } else if (type === "board") {
    dims = [0.66, 0.55, 1.02];
    for (const x of [-0.29, 0.29]) {
      m.tube(
        [
          [x, -0.23, 0.02],
          [x, -0.01, 0.99],
          [x, 0.24, 0.02]
        ],
        0.024,
        metal,
        5
      );
    }
    m.face(
      [
        [-0.29, -0.23, 0.12],
        [0.29, -0.23, 0.12],
        [0.29, -0.031, 0.93],
        [-0.29, -0.031, 0.93]
      ],
      1,
      [0, -1, 0.17]
    );
    m.box(0, -0.027, 0.94, 0.63, 0.063, 0.046, 2);
    for (let j = 0; j < 3; j++) {
      const z = 0.31 + j * 0.17,
        y = -0.23 + (z - 0.12) * 0.244;
      m.face(
        [
          [-0.19, y - 0.008, z],
          [0.17, y - 0.008, z],
          [0.17, y, z + 0.024],
          [-0.19, y, z + 0.024]
        ],
        2,
        [0, -1, 0.2]
      );
    }
  } else if (type === "cycle") {
    dims = [1.68, 0.52, 1.05];
    for (const x of [-0.51, 0.52]) {
      for (const [r, col, thick] of [
        [0.3, charcoal, 0.031],
        [0.258, metal, 0.012]
      ]) {
        const ring = Array.from({ length: 19 }, (_, j) => [
          x + Math.cos((j * Math.PI) / 9) * r,
          0,
          0.33 + Math.sin((j * Math.PI) / 9) * r
        ]);
        m.tube(ring, thick, col, 5);
      }
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3;
        m.tube(
          [
            [x, 0, 0.33],
            [x + Math.cos(a) * 0.255, 0, 0.33 + Math.sin(a) * 0.255]
          ],
          0.007,
          metal,
          4
        );
      }
    }
    for (const s of [-0.042, 0.042])
      m.tube(
        [
          [-0.51, s, 0.33],
          [-0.11, s, 0.62],
          [0.01, s, 0.32],
          [0.38, s, 0.74],
          [0.52, s, 0.33]
        ],
        0.025,
        1,
        6
      );
    m.tube(
      [
        [-0.51, 0, 0.33],
        [0.01, 0, 0.32],
        [-0.16, 0, 0.77]
      ],
      0.025,
      1,
      6
    );
    m.oval(-0.18, 0, 0.79, 0.123, 0.076, 0.036, charcoal, 9, 5);
    m.tube(
      [
        [0.38, 0, 0.72],
        [0.37, 0, 0.91],
        [0.29, -0.18, 0.96]
      ],
      0.023,
      metal,
      6
    );
    m.tube(
      [
        [0.38, 0, 0.89],
        [0.29, 0.18, 0.96]
      ],
      0.019,
      metal,
      5
    );
    for (const z of [0.64, 0.83])
      m.tube(
        [
          [0.38, -0.145, z],
          [0.68, -0.145, z],
          [0.68, 0.145, z],
          [0.38, 0.145, z],
          [0.38, -0.145, z]
        ],
        0.014,
        metal,
        5
      );
    for (const x of [0.4, 0.53, 0.65])
      for (const y of [-0.145, 0.145]) m.box(x, y, 0.64, 0.009, 0.012, 0.19, metal);
  } else if (type === "planter") {
    dims = [0.55, 0.55, 0.82];
    m.turned(
      0,
      0,
      [
        [0.025, 0.135],
        [0.32, 0.2],
        [0.35, 0.22],
        [0.39, 0.217]
      ],
      1,
      9
    );
    m.turned(
      0,
      0,
      [
        [0.385, 0.19],
        [0.393, 0.185]
      ],
      "#605246",
      8
    );
    for (let j = 0; j < 9; j++) {
      const a = j * 2.4,
        r = (0.15 * (j % 3)) / 2;
      m.oval(
        Math.cos(a) * r,
        Math.sin(a) * r,
        0.49 + 0.09 * (j % 3),
        0.12,
        0.106,
        0.16,
        j % 3 ? "#698055" : "#83935d",
        7,
        4
      );
    }
  } else if (type === "flag") {
    dims = [0.69, 0.43, 1.92];
    m.box(-0.23, 0, 0, 0.29, 0.35, 0.11, "#d9d7c8");
    m.box(-0.23, 0, 0.1, 0.025, 0.026, 1.78, metal);
    m.box(0.015, 0, 1.83, 0.52, 0.024, 0.024, metal);
    m.face(
      [
        [-0.19, 0, 0.46],
        [0.23, -0.045, 0.43],
        [0.28, -0.035, 1.77],
        [-0.19, 0, 1.78]
      ],
      1,
      [0, -1, 0]
    );
    m.face(
      [
        [-0.09, -0.021, 0.7],
        [0.004, -0.029, 0.7],
        [0.05, -0.028, 1.49],
        [-0.08, -0.024, 1.51]
      ],
      2,
      [0, -1, 0]
    );
  } else if (type === "stop") {
    dims = [0.86, 2.91, 0.025];
    ["れ", "ま", "止"].forEach((v, i) => {
      const start = m.v.length;
      m.text(v, 0, 0, -1.4 + i * 0.97, 0.76, 0.7, white, 0.009);
      for (let j = start; j < m.v.length; j += 10) {
        const y = m.v[j + 1],
          z = m.v[j + 2],
          ny = m.v[j + 4],
          nz = m.v[j + 5];
        m.v[j + 1] = z;
        m.v[j + 2] = 0.008 - y;
        m.v[j + 4] = nz;
        m.v[j + 5] = -ny;
      }
    });
  } else throw Error("Unknown street fixture " + type);
  for (let i = 0; i < m.v.length; i += 10)
    for (let j = 0; j < 3; j++) {
      m.v[i + j] /= dims[j];
      m.v[i + 3 + j] *= dims[j];
    }
  return dims;
}
