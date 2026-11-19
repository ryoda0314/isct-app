import { MarketModel, unit } from "./campus3dMarketGeometry.js";

const caseLabels = [
  "カットフルーツ",
  "サラダ野菜",
  "葉物野菜",
  "豆腐・納豆",
  "豚肉",
  "牛肉",
  "牛乳",
  "果汁飲料",
  "ヨーグルト"
];

export const MARKET_ART = new Set([
  "vegetablesSign",
  "meatSign",
  "drinkSign",
  "fishSign",
  "fishEmblem",
  "bakerySign",
  "bakeryIllustration",
  "fishingFlag",
  "checkoutSign",
  "selfArrow",
  "staffedArrow",
  "marketMonitor",
  "fishMural",
  "fishWindow",
  "seasoningAisle",
  "snacksAisle",
  "householdAisle",
  "frozenAisle",
  "pointsSale",
  "entranceWordmark",
  "facadeWordmark",
  "deliLetters",
  "produceFascia",
  "meatFascia",
  ...caseLabels.map((_, i) => "caseLabel" + i)
]);
const cache = new Map(),
  ivory = "#fff4d9",
  ink = "#343436",
  cedar = "#ab8864",
  gold = "#e5be7f";
const panel = (m, col, y = -0.05) => m.box(0, y, 0, 1, 0.1, 1, col);
function outlinedFish(m, x, y, z, w, h, col) {
  m.oval(x, y, z, w * 0.34, 0.45, h * 0.3, col, 12, 6);
  m.face(
    [
      [x + w * 0.25, y, z],
      [x + w * 0.47, y - 0.11, z + h * 0.32],
      [x + w * 0.41, y - 0.24, z],
      [x + w * 0.47, y - 0.11, z - h * 0.28]
    ],
    col,
    [0, -1, 0]
  );
  m.oval(x - w * 0.2, y - 0.36, z + h * 0.06, w * 0.035, 0.09, h * 0.043, ivory, 7, 4);
}
function badge(m, x, z, size, bg, fg) {
  // The two heads and the linking ribbon sit above the square and the circular rim.
  m.box(x, -0.16, z - size * 0.49, size * 0.98, 0.2, size * 0.98, bg);
  const pts = Array.from({ length: 33 }, (_, i) => [
    x + size * 0.39 * Math.cos((i * Math.PI) / 16),
    -0.33,
    z + size * 0.39 * Math.sin((i * Math.PI) / 16)
  ]);
  m.tube(pts, size * 0.031, fg, 6);
  for (const d of [-0.15, 0.15])
    m.oval(x + d * size, -0.36, z + 0.13 * size, 0.09 * size, 0.08, 0.09 * size, fg, 10, 5);
  m.tube(
    [
      [x - size * 0.31, -0.35, z + size * 0.01],
      [x - size * 0.15, -0.36, z - size * 0.14],
      [x, -0.37, z - size * 0.25],
      [x + size * 0.17, -0.36, z - size * 0.1],
      [x + size * 0.31, -0.35, z + size * 0.01]
    ],
    size * 0.045,
    fg,
    6
  );
}
function artModel(name, night, aspect) {
  const key = name + (night ? ":night" : "") + ":" + aspect.toFixed(2);
  if (cache.has(key)) return cache.get(key);
  const m = new MarketModel();
  const text = (s, x, y, z, w, h, c, d = 0.16, style = "sans") => {
    // Font outlines are in em. Work in height units before fitting to this particular board width.
    const start = m.v.length;
    m.text(s, x * aspect, y, z, w * aspect, h, c, d, style);
    for (let i = start; i < m.v.length; i += 10) m.v[i] /= aspect;
  };
  if (["vegetablesSign", "meatSign", "drinkSign", "fishSign"].includes(name)) {
    const word = { vegetablesSign: "VEGETABLES", meatSign: "MEAT", drinkSign: "DRINK", fishSign: "FISH" }[name];
    if (name !== "drinkSign") panel(m, name === "fishSign" ? "#eeebe6" : "#bdab91");
    text(word, 0.005, -0.16, 0.161, 0.94, 0.67, "#746957", 0.18);
    text(word, 0, -0.37, 0.19, 0.94, 0.67, name === "drinkSign" ? ivory : "#343235", 0.22);
  } else if (name === "produceFascia" || name === "meatFascia") {
    // Carved leaves and seed sections along the pale timber face above the cases.
    panel(m, "#c5b59a");
    for (let j = 0; j < 4; j++) {
      const x = -0.37 + j * 0.245;
      const pts = Array.from({ length: 19 }, (_, i) => {
        const a = (i * Math.PI) / 9;
        return [x + 0.105 * Math.cos(a), -0.2, 0.49 + 0.31 * Math.sin(a)];
      });
      m.tube(pts, 0.012, "#ac967a", 5);
      m.tube(
        [
          [x - 0.085, -0.21, 0.31],
          [x, -0.24, 0.47],
          [x + 0.075, -0.21, 0.74]
        ],
        0.011,
        "#ab967a",
        5
      );
    }
  } else if (name === "deliLetters") {
    text("DELICATESSEN", 0, -0.1, 0.115, 0.97, 0.76, "#af8754", 0.26);
  } else if (name.startsWith("caseLabel")) {
    text(caseLabels[Number(name.slice(9))], 0, -0.14, 0.13, 0.93, 0.72, ivory, 0.12);
  } else if (name === "queueRed" || name === "queueGrey") {
    const disk = (x, z, rx, rz, y, c) => m.oval(x, y, z, rx, 0.1, rz, c, 20, 5);
    disk(0, 0.5, 0.498, 0.497, -0.1, ivory);
    disk(0, 0.5, 0.465, 0.465, -0.25, name === "queueRed" ? "#ad5440" : "#535651");
    for (const x of [-0.14, 0.14]) {
      disk(x, 0.54, 0.08, 0.19, -0.4, ivory);
      disk(x, 0.3, 0.075, 0.069, -0.4, ivory);
    }
  } else if (name === "facadeWordmark" || name === "entranceWordmark") {
    const upper = name === "facadeWordmark",
      col = upper && night ? "#ff983e" : "#ae332b";
    if (!upper) panel(m, "#fff1d9");
    const ratio = 1 / aspect;
    // Use a square for the physical trademark on a wide transom.
    const start = m.v.length;
    badge(m, 0, 0.51, 0.87, col, upper && night ? "#fff5cc" : "#fff1da");
    for (let i = start; i < m.v.length; i += 10) m.v[i] = -0.397 + m.v[i] * ratio;
    text("Tokyu Store", 0.074, -0.28, 0.203, 0.785, 0.678, col, 0.48, "serif");
  } else if (name === "bakerySign") {
    panel(m, "#8d755b");
    for (let i = 0; i < 16; i++)
      m.box(-0.47 + i * 0.062, -0.13, 0.016, 0.054, 0.16, 0.964, i % 3 === 0 ? "#b39872" : "#c4a882");
    text("Bakery", 0, -0.36, 0.24, 0.95, 0.57, ivory, 0.34, "script");
  } else if (name === "bakeryIllustration") {
    panel(m, "#dfd9cc");
    // Raised wire bakery motif: a baguette, a round roll and a sliced tin loaf.
    const line = (points, c) =>
      m.tube(
        points.map(([x, z]) => [x, -0.27, z]),
        0.012,
        c,
        7
      );
    line(
      [
        [-0.47, 0.37],
        [-0.43, 0.58],
        [-0.35, 0.7],
        [-0.26, 0.64],
        [-0.25, 0.46],
        [-0.34, 0.32],
        [-0.45, 0.32],
        [-0.47, 0.37]
      ],
      "#84786b"
    );
    for (let i = 0; i < 3; i++)
      line(
        [
          [-0.425 + i * 0.048, 0.41],
          [-0.405 + i * 0.048, 0.53]
        ],
        cedar
      );
    line(
      [
        [-0.18, 0.28],
        [-0.21, 0.4],
        [-0.17, 0.51],
        [-0.09, 0.58],
        [0.015, 0.58],
        [0.07, 0.49],
        [0.075, 0.31],
        [-0.18, 0.28]
      ],
      "#867b6e"
    );
    line(
      [
        [0.13, 0.3],
        [0.12, 0.64],
        [0.18, 0.73],
        [0.24, 0.69],
        [0.27, 0.73],
        [0.36, 0.74],
        [0.44, 0.64],
        [0.45, 0.31],
        [0.13, 0.3]
      ],
      "#84786b"
    );
    line(
      [
        [0.15, 0.32],
        [0.2, 0.42],
        [0.44, 0.44]
      ],
      cedar
    );
  } else if (name === "fishWindow" || name === "fishEmblem" || name === "fishMural") {
    panel(m, name === "fishWindow" ? "#314a68" : name === "fishEmblem" ? "#d6c29b" : "#acb6b5");
    if (name === "fishEmblem") {
      for (let k = 0; k < 18; k++)
        m.box(-0.477 + k * 0.055, -0.13, 0, 0.03, 0.14, 0.995, k % 2 ? "#bda27b" : "#c7ad88");
      outlinedFish(m, 0.05, -0.37, 0.56, 0.71, 0.77, "#668ea1");
      text("FISH", 0, -0.5, 0.1, 0.72, 0.2, "#49687b");
    } else {
      const count = name === "fishWindow" ? 25 : 10;
      for (let k = 0; k < count; k++) {
        const x = -0.43 + (((k * 37) % 97) / 97) * 0.86,
          z = 0.14 + (((k * 29) % 53) / 53) * 0.72;
        outlinedFish(
          m,
          x,
          -0.2 - (k % 4) * 0.24,
          z,
          0.071 + 0.008 * (k % 5),
          0.09 + 0.013 * (k % 4),
          ["#456e86", "#72909b", "#9aaeb0", "#547987"][k % 4]
        );
      }
    }
  } else if (name === "fishingFlag") {
    // Cloth buckles between its supports. The sun, rays, waves and glyphs follow the fold.
    const cloth = "#f5d782",
      front = -0.12,
      back = -0.045;
    for (let j = 0; j < 7; j++)
      for (let i = 0; i < 22; i++) {
        const a = -0.5 + i / 22,
          b = a + 1 / 22,
          z = j / 7,
          t = (j + 1) / 7;
        m.face(
          [
            [a, front, z],
            [b, front, z],
            [b, front, t],
            [a, front, t]
          ],
          cloth,
          [0, -1, 0]
        );
        m.face(
          [
            [a, back, t],
            [b, back, t],
            [b, back, z],
            [a, back, z]
          ],
          cloth,
          [0, 1, 0]
        );
        if (j === 0 || j === 6) {
          const edge = j === 0 ? z : t;
          m.face(
            [
              [a, back, edge],
              [b, back, edge],
              [b, front, edge],
              [a, front, edge]
            ],
            cloth
          );
        }
        if (i === 0 || i === 21) {
          const edge = i === 0 ? a : b;
          m.face(
            [
              [edge, front, z],
              [edge, back, z],
              [edge, back, t],
              [edge, front, t]
            ],
            cloth
          );
        }
      }
    const sun = "#c94f36";
    for (let i = 0; i < 8; i++) {
      const x = -0.5 + i * 0.131;
      for (let j = 0; j < 10; j++) {
        const a = j / 10,
          b = (j + 1) / 10;
        const at = (f, tip) => [0.11 + f * (tip - 0.11), -0.21, 0.52 + 0.48 * f];
        m.face([at(a, x), at(b, x), at(b, x + 0.072), at(a, x + 0.072)], sun, [0, -1, 0]);
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = Array.from({ length: 24 }, (_, j) => [
        -0.49 + j * 0.0422,
        -0.28,
        0.07 + i * 0.062 + 0.046 * Math.sin(j * 0.78 + i)
      ]);
      m.tube(p, 0.023, i % 2 ? ivory : "#395d88", 6);
    }
    text("大", -0.17, -0.41, 0.4, 0.6, 0.43, ink, 0.16);
    text("漁", 0.17, -0.41, 0.16, 0.62, 0.4, ink, 0.16);
    for (let i = 0; i < m.v.length; i += 10) m.v[i + 1] += 0.14 * (Math.sin(9 * m.v[i] + 1.1 * m.v[i + 2]) - 1.2);
  } else if (name.startsWith("lane")) {
    text(name.slice(4), 0, -0.13, 0.12, 0.85, 0.78, ivory, 0.25);
  } else if (name === "checkoutSign") {
    panel(m, "#e8d2a9");
    text("セルフレジ", 0, -0.17, 0.43, 0.89, 0.43, ink);
    text("Self checkout", 0, -0.17, 0.15, 0.63, 0.14, ink, 0.08);
  } else if (name === "selfArrow" || name === "staffedArrow") {
    panel(m, name === "selfArrow" ? "#a63d31" : "#414246");
    text(name === "selfArrow" ? "セルフレジ" : "有人レジ", 0, -0.16, 0.63, 0.9, 0.24, ivory, 0.08);
    m.box(0, -0.23, 0.19, 0.13, 0.1, 0.3, ivory);
    m.face(
      [
        [-0.22, -0.3, 0.36],
        [0, -0.3, 0.56],
        [0.22, -0.3, 0.36]
      ],
      ivory,
      [0, -1, 0]
    );
  } else if (name === "saleScreen" || name === "marketMonitor" || name === "pointsSale") {
    panel(m, name === "marketMonitor" ? "#322d34" : "#f5e4b5");
    m.box(0, -0.14, 0.71, 0.94, 0.09, 0.238, name === "marketMonitor" ? "#5e4473" : "#ae3f30");
    text(name === "marketMonitor" ? "東急ストア" : "TOKYU CARD", 0, -0.23, 0.766, 0.89, 0.1, ivory, 0.1);
    text("ポイント", 0, -0.16, 0.47, 0.87, 0.2, ink);
    text("10倍", 0, -0.18, 0.095, 0.86, 0.32, "#ad412b");
  } else if (name.endsWith("Aisle")) {
    panel(m, "#333539");
    const labels = {
      seasoningAisle: "調味料",
      snacksAisle: "お菓子",
      householdAisle: "日用品",
      frozenAisle: "冷凍食品"
    };
    text(labels[name], 0, -0.15, 0.48, 0.9, 0.27, ivory);
    text(String(Object.keys(labels).indexOf(name) + 1), 0, -0.16, 0.09, 0.42, 0.3, ivory);
  } else if (name === "terminalScreen") {
    panel(m, "#d9e9e4");
    m.box(0, -0.13, 0.84, 0.97, 0.07, 0.14, "#2c5963");
    text("お支払い方法", 0, -0.2, 0.61, 0.88, 0.15, ink, 0.06);
    text("選んでください", 0, -0.2, 0.46, 0.84, 0.095, ink, 0.06);
    for (let k = 0; k < 3; k++) {
      const x = -0.318 + k * 0.318;
      m.box(x, -0.17, 0.085, 0.28, 0.12, 0.25, ["#526b83", "#b06b3f", "#60846c"][k]);
      text(["現金", "カード", "電子マネー"][k], x, -0.27, 0.16, 0.26, 0.085, ivory, 0.055);
    }
  } else if (name === "ceilingFlorals") {
    panel(m, "#c0aa84");
    for (let k = 0; k < 18; k++)
      m.box(-0.484 + k * 0.055, -0.12, 0.005, 0.051, 0.085, 0.99, ["#c5ae8d", "#cfb997", "#d3c1a2", "#c8b191"][k % 4]);
    for (let k = 0; k < 3; k++) {
      const x = -0.26 + k * 0.25,
        z = 0.3 + 0.14 * Math.sin(k * 3);
      for (let j = 0; j < 7; j++) {
        const a = (j * Math.PI * 2) / 7,
          px = x + 0.072 * Math.cos(a),
          pz = z + 0.124 * Math.sin(a);
        m.oval(px, -0.245, pz, 0.051, 0.14, 0.07, "#897258", 9, 4);
      }
      m.oval(x, -0.27, z, 0.037, 0.11, 0.052, "#725f4d", 9, 4);
    }
    for (let k = 0; k < 5; k++) {
      const x = -0.43 + k * 0.17,
        z = 0.45 + 0.06 * Math.sin(k * 3);
      m.tube(
        [
          [x, -0.21, z],
          [x + 0.055, -0.22, z + 0.17],
          [x + 0.087, -0.22, z + 0.39]
        ],
        0.007,
        "#927858",
        5
      );
      for (const side of [-1, 1])
        m.oval(x + 0.056 + side * 0.037, -0.25, z + 0.2 + side * 0.065, 0.048, 0.07, 0.085, "#a08768", 8, 4);
    }
  }
  const out = m.finish();
  cache.set(key, out);
  return out;
}

// Project a solid relief onto its actual wall, sloping terminal, mat or ceiling.
// The same transform is applied to front, back and edge vertices, including glyph counters.
export function addMarketArt(mesh, name, corners, normal, tint = (c) => c, night = false) {
  const xyz = ([p, z]) => [p[0], p[1], z],
    A = xyz(corners[0]),
    B = xyz(corners[1]),
    D = xyz(corners[3]);
  const X = B.map((v, i) => v - A[i]),
    Z = D.map((v, i) => v - A[i]),
    w = Math.hypot(...X),
    h = Math.hypot(...Z);
  if (w < 0.001 || h < 0.001) return;
  const relief =
    name.endsWith("Arrow") || name.startsWith("queue")
      ? 0.003
      : name === "terminalScreen"
        ? 0.01
        : name === "ceilingFlorals"
          ? 0.026
          : Math.min(0.14, Math.max(0.032, h * 0.115));
  const Y = normal.map((n) => -n * relief),
    out = artModel(name, night, w / h),
    vv = out.vertices;
  const V = new Array(vv.length / 10);
  for (let i = 0; i < V.length; i++) {
    const j = i * 10,
      x = vv[j] + 0.5,
      y = vv[j + 1],
      z = vv[j + 2];
    const p = A.map((a, k) => a + X[k] * x + Y[k] * y + Z[k] * z);
    const n = unit(
      A.map(
        (_, k) => (X[k] * vv[j + 3]) / (w * w) + (Y[k] * vv[j + 4]) / (relief * relief) + (Z[k] * vv[j + 5]) / (h * h)
      )
    );
    const lit = 0.87 + 0.11 * Math.abs(n[2]) + 0.04 * Math.max(-n[0], 0);
    const c = tint([vv[j + 6] * lit, vv[j + 7] * lit, vv[j + 8] * lit, 1]);
    V[i] = [[p[0], p[1]], p[2], n, c];
  }
  for (const i of out.indices) mesh.vert(...V[i]);
}
