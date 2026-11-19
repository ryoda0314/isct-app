import { MarketModel } from "./campus3dMarketGeometry.js";

const cream = "#f4e9cf",
  paper = "#f6f2dd",
  ink = "#283c44",
  silver = "#c4cbca",
  leaf = "#446548",
  crust = "#c4854c";
const tau = Math.PI * 2;
const cache = new Map();
export const MARKET_SHELF_LABELS = {
  shelfDressing: "ドレッシング",
  shelfSpice: "香辛料",
  shelfSauce: "ソース",
  shelfCanned: "缶詰",
  shelfNoodles: "パスタ",
  shelfRice: "米・雑穀",
  shelfTea: "日本茶",
  shelfCoffee: "コーヒー",
  shelfDrinks: "飲料",
  shelfSnacks: "お菓子",
  shelfHousehold: "日用品",
  shelfBakery: "食パン"
};
export const MARKET_GOODS = [
  "milkCarton",
  "juiceCarton",
  "petBottle",
  "teaBottle",
  "sauceBottle",
  "jar",
  "can",
  "cereal",
  "teaBox",
  "pastaBag",
  "snackBag",
  "refill",
  "pump",
  "yogurt",
  "iceTub",
  "frozenBox",
  "tofuPack",
  "eggPack",
  "cutFruit",
  "tomatoPack",
  "mushrooms",
  "greens",
  "orange",
  "apple",
  "cabbage",
  "banana",
  "carrots",
  "grapes",
  "leek",
  "salmonTray",
  "porkTray",
  "beefTray",
  "wholeFish",
  "sushi",
  "bento",
  "croquettes",
  "baguette",
  "croissant",
  "melonpan",
  "loaf",
  "bouquet"
];
function frontLabel(m, title, small = false) {
  m.box(0, -0.487, 0.3, 0.79, 0.03, 0.31, paper);
  m.box(0, -0.508, 0.32, 0.64, 0.012, 0.027, 2);
  if (m.detail) m.text(title, 0, -0.51, 0.39, 0.68, small ? 0.115 : 0.15, 1, 0.007);
}
function carton(m, juice) {
  m.loft([m.rect(0, 0, 0.012, 0.9, 0.9), m.rect(0, 0, 0.76, 0.92, 0.92), m.rect(0, 0, 0.94, 0.92, 0.08)], paper);
  m.box(0, 0, 0.938, 0.92, 0.087, 0.062, 1);
  m.box(0, -0.462, 0.042, 0.89, 0.014, 0.18, 1);
  m.box(0, 0.462, 0.05, 0.88, 0.012, 0.16, 1);
  m.box(-0.465, 0, 0.04, 0.012, 0.88, 0.175, 1);
  m.box(0.465, 0, 0.04, 0.012, 0.88, 0.175, 1);
  m.box(0, -0.468, 0.605, 0.88, 0.014, 0.057, 2);
  if (m.detail) {
    m.text(juice ? "果汁" : "牛乳", 0, -0.474, 0.35, 0.78, 0.24, 1, 0.007);
    m.text(juice ? "JUICE" : "MILK", 0, -0.474, 0.255, 0.49, 0.068, 1, 0.005);
    m.face(
      [
        [-0.42, -0.463, 0.762],
        [0, -0.04, 0.936],
        [0.42, -0.463, 0.762]
      ],
      "#dfdacb"
    );
    m.box(0.463, 0.06, 0.39, 0.012, 0.44, 0.025, 2);
  } else m.box(0, -0.468, 0.38, 0.51, 0.012, 0.108, 1);
}
function bottle(m, type) {
  const sauce = type === "sauceBottle",
    tea = type === "teaBottle";
  const profile = [
    [0.015, 0.32],
    [0.042, 0.437],
    [0.1, 0.45],
    [0.18, 0.434],
    [0.22, 0.455],
    [0.59, 0.455],
    [0.69, 0.433],
    [0.77, 0.373],
    [0.844, 0.195],
    [0.88, 0.166]
  ];
  m.turned(0, 0, profile, sauce ? "#704329" : tea ? "#c4ad59" : "#cad9d4");
  m.turned(
    0,
    0,
    [
      [0.27, 0.457],
      [0.32, 0.461],
      [0.58, 0.461],
      [0.62, 0.444]
    ],
    1
  );
  m.turned(
    0,
    0,
    [
      [0.27, 0.46],
      [0.304, 0.463]
    ],
    paper
  );
  m.turned(
    0,
    0,
    [
      [0.535, 0.464],
      [0.575, 0.464]
    ],
    2
  );
  m.turned(
    0,
    0,
    [
      [0.872, 0.17],
      [0.902, 0.207],
      [0.983, 0.202],
      [0.997, 0.17]
    ],
    tea ? "#e2dec4" : sauce ? "#b64a35" : 2
  );
  if (m.detail) {
    for (const z of [0.114, 0.174, 0.686])
      m.turned(
        0,
        0,
        [
          [z, 0.447],
          [z + 0.014, 0.45]
        ],
        sauce ? "#83563b" : tea ? "#a89653" : "#aebfbc"
      );
    m.box(0, -0.445, 0.339, 0.54, 0.04, 0.15, cream);
    m.text(sauce ? "醤油" : tea ? "緑茶" : "水", 0, -0.468, 0.358, 0.42, 0.11, ink, 0.006);
  }
}
function boxed(m, name) {
  m.box(0, 0, 0.014, 0.94, 0.91, 0.97, 1);
  m.box(0, -0.458, 0.08, 0.92, 0.014, 0.13, 2);
  m.box(0, 0.0, 0.975, 0.89, 0.83, 0.022, paper);
  frontLabel(m, { cereal: "穀物", teaBox: "日本茶", frozenBox: "冷凍食品" }[name], true);
  if (m.detail) {
    if (name === "teaBox") {
      m.tube(
        [
          [-0.23, -0.477, 0.63],
          [-0.03, -0.477, 0.75],
          [0.2, -0.477, 0.85]
        ],
        0.013,
        cream,
        5
      );
      for (let i = 0; i < 4; i++) {
        const x = -0.19 + i * 0.1,
          z = 0.663 + i * 0.051,
          side = i % 2 ? 1 : -1;
        m.face(
          [
            [x, -0.477, z],
            [x + 0.025, -0.49, z + side * 0.076],
            [x + 0.13, -0.48, z + side * 0.087],
            [x + 0.086, -0.484, z + side * 0.02]
          ],
          2,
          [0, -1, 0]
        );
      }
    } else if (name === "cereal") {
      m.tube(
        [
          [-0.07, -0.479, 0.61],
          [0.01, -0.479, 0.83],
          [0.05, -0.479, 0.87]
        ],
        0.01,
        cream,
        5
      );
      for (let i = 0; i < 5; i++)
        m.oval(-0.052 + i * 0.016 + (i % 2 ? 0.036 : -0.035), -0.481, 0.65 + i * 0.04, 0.043, 0.013, 0.046, 2, 7, 4);
    } else {
      m.oval(0, -0.475, 0.76, 0.25, 0.021, 0.108, cream, 12, 5);
      for (let i = 0; i < 3; i++) m.oval(-0.115 + i * 0.105, -0.498, 0.765, 0.066, 0.016, 0.054, 2, 7, 4);
    }
    for (let i = 0; i < 5; i++) m.box(0.473, -0.22 + i * 0.068, 0.26, 0.009, 0.026, 0.2, i % 2 ? ink : cream);
  }
}
function pouch(m, name) {
  const r = (z, w, d, off = 0) => m.rect(off, 0, z, w, d);
  m.loft(
    [
      r(0.035, 0.73, 0.57),
      r(0.105, 0.9, 0.9),
      r(0.41, 0.96, 0.974),
      r(0.74, 0.85, 0.77, 0.018),
      r(0.917, 0.73, 0.19, -0.023)
    ],
    1
  );
  m.box(-0.023, 0, 0.913, 0.79, 0.21, 0.073, 2);
  m.box(0, 0, 0.025, 0.8, 0.62, 0.046, 2);
  m.box(0.002, -0.481, 0.3, 0.69, 0.022, 0.26, paper);
  if (m.detail) {
    m.text(
      name === "refill" ? "つめかえ" : name === "pastaBag" ? "パスタ" : "お菓子",
      0,
      -0.497,
      0.375,
      0.6,
      0.11,
      1,
      0.005
    );
    for (let j = 0; j < 5; j++) m.box(-0.28 + j * 0.137, -0.114, 0.932, 0.022, 0.014, 0.041, paper);
    m.face(
      [
        [-0.45, -0.44, 0.15],
        [-0.27, -0.473, 0.27],
        [-0.39, -0.39, 0.6]
      ],
      2
    );
    if (name === "pastaBag") {
      for (let i = 0; i < 7; i++) {
        const x = -0.135 + i * 0.046;
        m.tube(
          [
            [x - 0.025, -0.466, 0.545],
            [x + 0.003, -0.436, 0.649],
            [x + 0.02, -0.392, 0.751]
          ],
          0.011,
          i % 3 ? "#dbc17f" : "#f0d79b",
          5
        );
      }
    } else if (name === "snackBag") {
      for (let k = 0; k < 3; k++)
        m.oval(-0.18 + k * 0.15, -0.437, 0.635 + (k % 2) * 0.035, 0.101, 0.019, 0.052, k % 2 ? 2 : "#e9c58c", 8, 4);
    } else {
      m.face(
        [
          [-0.07, -0.436, 0.64],
          [0.055, -0.422, 0.72],
          [0.11, -0.395, 0.77],
          [0.17, -0.439, 0.65],
          [0.047, -0.455, 0.58]
        ],
        2,
        [0, -1, 0]
      );
    }
  }
}
function tub(m, name) {
  const jar = name === "jar",
    can = name === "can";
  const body = jar ? "#a2733e" : can ? silver : paper;
  m.turned(
    0,
    0,
    [
      [0.02, 0.34],
      [0.06, 0.395],
      [0.16, 0.4],
      [0.78, 0.47],
      [0.87, 0.46],
      [0.91, 0.39]
    ],
    body
  );
  m.turned(
    0,
    0,
    [
      [0.21, 0.418],
      [0.7, 0.47]
    ],
    1
  );
  m.turned(
    0,
    0,
    [
      [0.26, 0.428],
      [0.33, 0.435]
    ],
    2
  );
  m.turned(
    0,
    0,
    [
      [0.87, 0.47],
      [0.91, 0.5],
      [0.978, 0.49],
      [0.994, 0.44]
    ],
    can ? silver : 2
  );
  if (m.detail) {
    if (can) {
      m.oval(0, -0.075, 0.997, 0.13, 0.23, 0.011, "#969d99", 10, 4);
      m.oval(0, -0.065, 1.006, 0.06, 0.092, 0.012, ink, 9, 4);
    } else {
      m.turned(
        0,
        0,
        [
          [0.995, 0.32],
          [1.002, 0.32]
        ],
        cream,
        12
      );
      m.oval(0.036, 0.015, 1.005, 0.13, 0.13, 0.01, 1, 8, 4);
    }
    m.box(0, -0.438, 0.405, 0.56, 0.025, 0.2, cream);
    m.text(jar ? "JAM" : can ? "COFFEE" : name === "yogurt" ? "YOGURT" : "ICE", 0, -0.456, 0.461, 0.49, 0.1, 1, 0.005);
  }
}
function pump(m) {
  m.loft(
    [
      m.rect(0, 0, 0.02, 0.64, 0.68),
      m.rect(0, 0, 0.1, 0.89, 0.84),
      m.rect(0, 0, 0.64, 0.89, 0.84),
      m.rect(0, 0, 0.77, 0.55, 0.46)
    ],
    1
  );
  m.turned(
    0,
    0,
    [
      [0.76, 0.18],
      [0.82, 0.2],
      [0.86, 0.145],
      [0.936, 0.075]
    ],
    paper
  );
  m.box(0.11, 0, 0.925, 0.47, 0.2, 0.073, 2);
  m.box(0.3, 0, 0.89, 0.095, 0.19, 0.065, 2);
  m.box(0, -0.425, 0.22, 0.7, 0.018, 0.28, paper);
  if (m.detail) m.text("SOAP", 0, -0.439, 0.315, 0.6, 0.11, 1, 0.006);
}
function leafBlade(m, base, tip, width, mat, bend = 0) {
  const [x, y, z] = base,
    [X, Y, Z] = tip,
    dx = X - x,
    dy = Y - y,
    len = Math.hypot(dx, dy) || 1;
  const mid = [x + dx * 0.52, y + dy * 0.52, z + (Z - z) * 0.5 + bend],
    ex = (-dy * width) / len,
    ey = (dx * width) / len;
  const left = [mid[0] + ex, mid[1] + ey, mid[2]],
    right = [mid[0] - ex, mid[1] - ey, mid[2]],
    rib = [mid[0], mid[1], mid[2] + 0.045];
  for (const polygon of [
    [base, left, rib],
    [left, tip, rib],
    [tip, right, rib],
    [right, base, rib]
  ])
    m.face(polygon, mat, [0, 0, 1]);
}
function produce(m, name) {
  if (name === "orange" || name === "apple") {
    const apple = name === "apple";
    m.oval(0, 0, 0.46, 0.47, 0.46, apple ? 0.422 : 0.45, 1, m.detail ? 14 : 8, m.detail ? 9 : 5);
    if (apple)
      for (let k = 0; k < (m.detail ? 5 : 3); k++) {
        const a = (tau * k) / (m.detail ? 5 : 3);
        m.oval(0.21 * Math.cos(a), 0.21 * Math.sin(a), 0.69, 0.21, 0.21, 0.19, 1, 8, 4);
      }
    if (m.detail) {
      m.turned(
        0,
        0,
        [
          [0.874, 0.06],
          [0.885, 0.065],
          [0.895, 0.032]
        ],
        "#6e713e",
        6
      );
      if (apple)
        m.tube(
          [
            [0, 0, 0.82],
            [0.02, 0.014, 0.92],
            [0.085, 0.05, 0.981]
          ],
          [0.026, 0.022, 0.016],
          "#695239",
          6
        );
      leafBlade(m, [0.018, 0.002, 0.881], [0.24, 0.16, 0.915], 0.057, apple ? "#768148" : "#5f7938", 0.013);
    }
    return;
  }
  if (name === "cabbage") {
    m.oval(0, 0, 0.43, 0.43, 0.42, 0.39, 1);
    const leaves = m.detail ? 9 : 5;
    for (let k = 0; k < leaves; k++) {
      const a = (tau * k) / leaves + 0.35,
        x = Math.cos(a),
        y = Math.sin(a),
        mid = [0.47 * x, 0.47 * y, 0.47];
      const A = [0.12 * x, 0.12 * y, 0.06],
        B = [0.33 * x - 0.24 * y, 0.33 * y + 0.24 * x, 0.59],
        C = [0.26 * x, 0.26 * y, 0.85 + 0.07 * Math.sin(k * 2)],
        D = [0.33 * x + 0.24 * y, 0.33 * y - 0.24 * x, 0.59];
      for (const p of [
        [A, B, mid],
        [B, C, mid],
        [C, D, mid],
        [D, A, mid]
      ])
        m.face(p, k % 3 ? 1 : 2, [x, y, 0.34]);
      if (m.detail) m.tube([A, mid, C], [0.016, 0.012, 0.006], "#cad49f", 4);
    }
    return;
  }
  if (name === "banana") {
    for (let j = 0; j < 4; j++) {
      const y = -0.31 + j * 0.195;
      m.tube(
        [
          [-0.37, y, 0.72],
          [-0.3, y - 0.035, 0.38],
          [-0.04, y - 0.053, 0.22],
          [0.21, y, 0.34],
          [0.392, y + 0.043, 0.64]
        ],
        [0.061, 0.122, 0.133, 0.11, 0.045],
        j % 2 ? 1 : 2,
        m.detail ? 8 : 5
      );
    }
    m.tube(
      [
        [-0.35, -0.06, 0.63],
        [-0.4, -0.045, 0.79],
        [-0.36, 0.025, 0.94]
      ],
      [0.12, 0.09, 0.07],
      "#868344",
      6
    );
    return;
  }
  if (name === "grapes" || name === "tomatoPack" || name === "cutFruit" || name === "eggPack" || name === "mushrooms") {
    if (name !== "grapes") tray(m, name === "eggPack" ? "#c5ba9f" : "#cfdbd3", 0.2);
    const berries = name === "grapes",
      eggs = name === "eggPack",
      shroom = name === "mushrooms";
    for (let j = 0; j < (berries ? 4 : 2); j++)
      for (let i = 0; i < (berries ? 4 : 3); i++) {
        const x = (i - (berries ? 1.5 : 1)) * (berries ? 0.207 : 0.278) + (j % 2) * 0.025,
          y = (j - (berries ? 1.5 : 0.5)) * (berries ? 0.2 : 0.37);
        if (shroom) {
          m.turned(
            x,
            y,
            [
              [0.16, 0.052],
              [0.59, 0.07]
            ],
            "#e5dac2",
            6
          );
          m.oval(x, y, 0.61, 0.129, 0.16, 0.18, "#ad8967", 9, 5);
        } else
          m.oval(
            x,
            y,
            berries ? 0.35 : eggs ? 0.52 : 0.45,
            berries ? 0.135 : 0.139,
            berries ? 0.13 : 0.19,
            berries ? 0.28 : eggs ? 0.4 : 0.32,
            (i + j) % 3 ? 1 : 2
          );
        if (name === "tomatoPack" && m.detail) leafBlade(m, [x, y, 0.74], [x + 0.06, y + 0.07, 0.78], 0.032, leaf);
      }
    if (berries) {
      m.tube(
        [
          [-0.24, 0, 0.57],
          [0.015, -0.04, 0.77],
          [0.27, 0.05, 0.94]
        ],
        [0.024, 0.021, 0.014],
        "#708247"
      );
    } else if (m.detail) {
      lid(m, 0.935);
      m.box(0.3, 0, 0.937, 0.15, 0.58, 0.012, paper);
      m.box(0.3, 0.08, 0.951, 0.1, 0.17, 0.006, 2);
    }
    return;
  }
  if (name === "carrots" || name === "leek" || name === "greens") {
    const count = name === "greens" ? 7 : 4;
    for (let k = 0; k < count; k++) {
      const x = -0.34 + (k * 0.67) / (count - 1),
        y = 0.39 - (k % 2) * 0.065;
      if (name === "carrots") {
        m.tube(
          [
            [x, y, 0.46],
            [x - 0.018, 0.24, 0.49],
            [x + 0.015, -0.12, 0.32],
            [x + 0.08, -0.45, 0.18]
          ],
          [0.074, 0.104, 0.075, 0.012],
          1
        );
        leafBlade(m, [x, y, 0.46], [x + 0.074, 0.47, 0.73], 0.047, leaf);
      } else {
        m.tube(
          [
            [x, -0.45, 0.17],
            [x, -0.12, 0.32],
            [x, y, 0.64]
          ],
          [0.035, 0.051, 0.033],
          name === "leek" ? paper : "#adc388",
          6
        );
        leafBlade(m, [x, -0.12, 0.3], [x + 0.13, y, 0.93], name === "leek" ? 0.041 : 0.12, 1, 0.07);
        leafBlade(m, [x, -0.08, 0.33], [x - 0.11, y - 0.07, 0.81], name === "leek" ? 0.04 : 0.125, 2, 0.045);
      }
    }
    return;
  }
}
function tray(m, col, h = 0.22) {
  const ring = (w, d, z) => [
    [-w + 0.055, -d, z],
    [w - 0.055, -d, z],
    [w, -d + 0.06, z],
    [w, d - 0.06, z],
    [w - 0.055, d, z],
    [-w + 0.055, d, z],
    [-w, d - 0.06, z],
    [-w, -d + 0.06, z]
  ];
  m.loft([ring(0.397, 0.391, 0.014), ring(0.485, 0.479, h)], col);
  m.loft([ring(0.482, 0.477, h), ring(0.484, 0.478, h + 0.042)], col);
  m.loft([ring(0.438, 0.424, h + 0.041), ring(0.43, 0.412, h + 0.045)], col === "#333f40" ? "#455153" : "#eadfce");
}
function lid(m, top) {
  m.loft(
    [m.rect(0, 0, 0.225, 0.968, 0.954), m.rect(0, 0, top - 0.07, 0.899, 0.885), m.rect(0, 0, top, 0.83, 0.807)],
    "clear"
  );
}
function fish(m, col, scale = 1, oy = 0, oz = 0) {
  const p = (x, y, z) => [x * scale, y * scale + oy, z * scale + oz];
  const n = m.detail ? 12 : 7;
  const rings = [
    [-0.468, 0.018, 0.065, 0.44],
    [-0.34, 0.155, 0.25, 0.47],
    [-0.14, 0.204, 0.32, 0.5],
    [0.1, 0.191, 0.28, 0.49],
    [0.32, 0.077, 0.11, 0.45],
    [0.37, 0.039, 0.076, 0.45]
  ].map(([x, w, h, z]) =>
    Array.from({ length: n }, (_, i) => p(x, w * Math.cos((tau * i) / n), z + h * Math.sin((tau * i) / n)))
  );
  for (let j = 1; j < rings.length; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n,
        angle = (tau * (i + 0.5)) / n;
      m.face(
        [rings[j - 1][i], rings[j][i], rings[j][k], rings[j - 1][k]],
        Math.sin(angle) > 0.39 ? col : Math.sin(angle) < -0.3 ? "#d6d5c2" : "#acb9aa",
        [0, Math.cos(angle), Math.sin(angle)]
      );
    }
  m.face(rings[0], col, [-1, 0, 0]);
  m.face(rings.at(-1), col, [1, 0, 0]);
  for (const side of [-1, 1])
    m.face([p(0.31, 0, 0.46), p(0.489, side * 0.15, 0.7), p(0.45, side * 0.07, 0.44), p(0.49, side * 0.12, 0.2)], col, [
      0,
      side,
      1
    ]);
  m.face([p(-0.1, 0, 0.79), p(0.02, 0, 0.97), p(0.18, 0, 0.7)], col, [0, -1, 0]);
  if (m.detail)
    for (const side of [-1, 1]) {
      const a = p(-0.309, side * 0.135, 0.568);
      m.oval(...a, 0.044 * scale, 0.025 * scale, 0.066 * scale, "#ddce8f", 8, 4);
      m.oval(
        a[0] - 0.006 * scale,
        a[1] + side * 0.019 * scale,
        a[2],
        0.022 * scale,
        0.012 * scale,
        0.033 * scale,
        ink,
        8,
        4
      );
    }
}
function prepared(m, name) {
  if (name === "wholeFish") {
    fish(m, 1);
    return;
  }
  const dark = name === "sushi" || name === "bento";
  tray(m, dark ? "#333f40" : name === "beefTray" ? "#b38d5c" : "#f2e7d2", 0.17);
  if (name === "salmonTray" || name === "beefTray" || name === "porkTray") {
    const salmon = name === "salmonTray";
    for (let i = 0; i < 3; i++) {
      const x = -0.24 + i * 0.235;
      m.loft([m.rect(x, 0.0, 0.215, 0.29, 0.6), m.rect(x + 0.013, 0.018, 0.53 + i * 0.042, 0.27, 0.56)], 1);
      for (let k = 0; k < (m.detail ? 4 : 2); k++) {
        const y = -0.193 + k * 0.105,
          z = 0.535 + i * 0.042;
        m.face(
          [
            [x - 0.119, y, z],
            [x + 0.122, y + 0.076, z],
            [x + 0.126, y + 0.102, z + 0.006],
            [x - 0.113, y + 0.022, z + 0.006]
          ],
          salmon ? "#f5d2a8" : "#ecc8b3",
          [0, 0, 1]
        );
      }
      if (salmon) m.box(x, 0.286, 0.31, 0.25, 0.028, 0.21, "#686d61");
    }
  } else if (name === "tofuPack") {
    m.box(0, 0, 0.22, 0.75, 0.71, 0.48, "#ece1b6");
    m.box(0, -0.08, 0.707, 0.78, 0.22, 0.023, 2);
  } else if (name === "croquettes") {
    for (let i = 0; i < 4; i++)
      m.oval(((i % 2) - 0.5) * 0.39, (Math.floor(i / 2) - 0.5) * 0.39, 0.48, 0.185, 0.165, 0.244, i % 2 ? 1 : 2);
  } else if (name === "sushi") {
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 0.27,
        y = (Math.floor(i / 3) - 0.5) * 0.34;
      m.oval(x, y, 0.37, 0.111, 0.155, 0.15, "#f3ead3");
      m.oval(x, y, 0.539, 0.129, 0.17, 0.105, i % 3 === 0 ? "#d77d57" : i % 3 === 1 ? "#bd5752" : "#e2b35d");
    }
  } else if (name === "bento") {
    m.box(-0.2, 0, 0.225, 0.37, 0.74, 0.25, "#eae1c5");
    m.box(-0.18, 0.02, 0.487, 0.23, 0.39, 0.025, "#485644");
    for (let k = 0; k < 4; k++)
      m.oval(
        0.11 + (k % 2) * 0.193,
        (Math.floor(k / 2) - 0.5) * 0.33,
        0.41,
        0.105,
        0.14,
        0.18,
        [1, 2, "#87a45f", "#c9984e"][k]
      );
  }
  if (m.detail) {
    lid(m, 0.78);
    m.box(0.265, -0.24, 0.783, 0.25, 0.16, 0.012, "#efe8ce");
    m.box(0.263, -0.29, 0.797, 0.18, 0.027, 0.01, "#a24a38");
  }
}
function bread(m, name) {
  if (name === "croissant") {
    const pts = [
      [-0.44, -0.17, 0.22],
      [-0.35, 0.02, 0.34],
      [-0.23, 0.16, 0.48],
      [0, 0.2, 0.51],
      [0.23, 0.16, 0.48],
      [0.35, 0.02, 0.34],
      [0.44, -0.17, 0.22]
    ];
    m.tube(pts, [0.045, 0.102, 0.158, 0.21, 0.158, 0.102, 0.045], 1, m.detail ? 12 : 7);
    for (let j = 1; j < pts.length - 1; j++) {
      const p = pts[j],
        r = 0.095 + 0.045 * (3 - Math.abs(j - 3));
      m.oval(...p, r, r * 1.23, r * 1.3, j % 2 ? 1 : 2);
    }
  } else if (name === "loaf") {
    const section = [
      [-0.39, 0.04],
      [-0.445, 0.11],
      [-0.45, 0.54],
      [-0.42, 0.69],
      [-0.34, 0.82],
      [-0.19, 0.9],
      [0, 0.935],
      [0.19, 0.9],
      [0.34, 0.82],
      [0.42, 0.69],
      [0.45, 0.54],
      [0.445, 0.11],
      [0.39, 0.04]
    ];
    const rings = Array.from({ length: 13 }, (_, j) => {
      const y = -0.45 + 0.075 * j,
        end = j === 0 || j === 12 ? 0.91 : 1,
        crown = 0.047 * Math.cos((j * Math.PI) / 2);
      return section.map(([x, z]) => [x * end, y, z + (z > 0.57 ? crown : 0)]);
    });
    for (let j = 1; j < rings.length; j++)
      for (let i = 0; i < section.length; i++) {
        const k = (i + 1) % section.length;
        m.face([rings[j - 1][i], rings[j][i], rings[j][k], rings[j - 1][k]], i > 2 && i < 9 ? 1 : crust, [
          section[i][0],
          0,
          section[i][1] - 0.44
        ]);
      }
    m.face(rings[0], "#d0a16b", [0, -1, 0]);
    m.face(rings.at(-1), crust, [0, 1, 0]);
    if (m.detail) {
      m.loft(
        [m.rect(0, 0, 0.02, 0.913, 0.925), m.rect(0, 0, 0.69, 0.92, 0.94), m.rect(0, 0, 0.94, 0.76, 0.91)],
        "clear"
      );
      m.box(0.15, -0.46, 0.31, 0.26, 0.019, 0.28, paper);
      m.box(0.15, -0.476, 0.51, 0.26, 0.012, 0.045, 2);
    }
  } else {
    m.oval(0, 0, 0.43, 0.475, 0.457, 0.406, 1);
    if (name === "baguette") {
      const surface = (x, y) => [
        x,
        y,
        0.435 + 0.406 * Math.sqrt(Math.max(0.01, 1 - (x / 0.475) ** 2 - (y / 0.457) ** 2))
      ];
      for (let i = -2; i <= 2; i++) {
        const x = i * 0.14,
          a = surface(x - 0.049, -0.2),
          b = surface(x - 0.023, -0.028),
          c = surface(x + 0.054, 0.207),
          d = surface(x + 0.024, 0.021);
        m.face([a, b, d], "#e8c58a", [0, 0, 1]);
        m.face([b, c, d], "#efcf95", [0, 0, 1]);
      }
    } else if (m.detail)
      for (let i = -1; i <= 1; i++) {
        const s = i * 0.15;
        m.tube(
          [
            [-0.29, s - 0.15, 0.64],
            [-0.07, s, 0.805],
            [0.12, s + 0.12, 0.77],
            [0.26, s + 0.18, 0.66]
          ],
          0.013,
          2,
          5
        );
        m.tube(
          [
            [-0.25, s + 0.16, 0.65],
            [-0.06, s + 0.04, 0.809],
            [0.13, s - 0.08, 0.757],
            [0.25, s - 0.16, 0.66]
          ],
          0.012,
          2,
          5
        );
      }
  }
}
function bouquet(m) {
  m.turned(
    0,
    0,
    [
      [0, 0.27],
      [0.25, 0.38],
      [0.29, 0.39]
    ],
    "#515e59"
  );
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39,
      x = 0.32 * Math.cos(a),
      y = 0.32 * Math.sin(a),
      z = 0.66 + 0.25 * (0.5 + 0.5 * Math.sin(4 * i));
    m.tube(
      [
        [0, 0, 0.15],
        [x * 0.6, y * 0.6, 0.47],
        [x, y, z]
      ],
      0.015,
      leaf,
      5
    );
    leafBlade(m, [x * 0.42, y * 0.42, 0.38], [x + 0.11, y + 0.06, 0.68], 0.08, leaf);
    for (let j = 0; j < 5; j++)
      m.oval(
        x + 0.068 * Math.cos((j * tau) / 5),
        y + 0.068 * Math.sin((j * tau) / 5),
        z,
        0.069,
        0.07,
        0.06,
        i % 2 ? 1 : 2,
        7,
        4
      );
    m.oval(x, y, z + 0.04, 0.042, 0.042, 0.042, "#e2b656", 7, 4);
  }
}

function shelfDivider(m, words) {
  // These two-sided signs project from the shelf edge into the aisle. Their
  // dimensions are 0.15 × 0.014 × 0.56 m, so keep the characters square in metres.
  m.box(0, 0, 0.008, 0.96, 0.56, 0.98, "#333636");
  m.box(0, 0, 0.945, 0.965, 0.62, 0.026, "#b59a69");
  if (!m.detail) return;
  const step = Math.min(0.22, 0.83 / words.length),
    cap = step * 0.78;
  for (const side of [1, -1]) {
    for (const [index, letter] of [...words].entries()) {
      const z = 0.895 - step * (index + 0.86);
      if (letter === "ー") {
        m.box(0, -side * 0.312, z, 0.055, 0.058, cap, "#f5f1e3");
        continue;
      }
      const first = m.v.length;
      m.text(letter, 0, -0.32, z, 0.215, cap, "#f5f1e3", 0.04);
      for (let i = first; i < m.v.length; i += 10) {
        m.v[i] *= (side * 0.56) / 0.15;
        m.v[i + 1] *= side;
        m.v[i + 3] *= side;
        m.v[i + 4] *= side;
      }
    }
  }
}

function distantProduct(m, name) {
  if (name === "milkCarton" || name === "juiceCarton") {
    m.loft(
      [
        [0, 0.9, 0.9],
        [0.13, 0.92, 0.92],
        [0.63, 0.92, 0.92],
        [0.7, 0.92, 0.92],
        [0.77, 0.92, 0.92],
        [0.94, 0.92, 0.085],
        [1, 0.92, 0.085]
      ].map(([z, w, d]) => m.rect(0, 0, z, w, d)),
      [1, paper, 2, paper, paper, 1]
    );
    return;
  }
  if (["petBottle", "teaBottle", "sauceBottle"].includes(name)) {
    const col = name === "teaBottle" ? "#c4b064" : name === "sauceBottle" ? "#805238" : "#c4d3d0";
    m.loft(
      [
        [0.02, 0.34],
        [0.1, 0.45],
        [0.23, 0.45],
        [0.49, 0.45],
        [0.58, 0.45],
        [0.71, 0.43],
        [0.86, 0.17],
        [0.9, 0.19],
        [0.99, 0.19]
      ].map(([z, r]) => m.ring(0, 0, z, r, r, 6)),
      [col, col, 1, paper, 1, col, col, 2]
    );
    return;
  }
  if (["jar", "can", "yogurt", "iceTub"].includes(name)) {
    m.loft(
      [
        [0.02, 0.36],
        [0.16, 0.39],
        [0.31, 0.42],
        [0.72, 0.46],
        [0.88, 0.47],
        [0.98, 0.46]
      ].map(([z, r]) => m.ring(0, 0, z, r, r, 7)),
      [paper, 2, 1, paper, name === "can" ? silver : 2]
    );
    return;
  }
  if (["cereal", "teaBox", "frozenBox", "snackBag", "pastaBag", "refill", "pump"].includes(name)) {
    const pouch = ["snackBag", "pastaBag", "refill"].includes(name);
    m.loft(
      [
        [0.02, 0.84, 0.79],
        [0.13, 0.92, 0.88],
        [0.31, 0.94, 0.9],
        [0.54, 0.94, 0.9],
        [0.77, 0.9, 0.86],
        [0.94, 0.82, pouch ? 0.17 : 0.84],
        [1, 0.83, pouch ? 0.2 : 0.84]
      ].map(([z, w, d]) => m.rect(0, 0, z, w, d)),
      [1, 2, 1, paper, 1, 2]
    );
    return;
  }
  if (
    [
      "porkTray",
      "beefTray",
      "salmonTray",
      "tofuPack",
      "eggPack",
      "cutFruit",
      "tomatoPack",
      "mushrooms",
      "sushi",
      "bento",
      "croquettes"
    ].includes(name)
  ) {
    m.loft(
      [m.rect(0, 0, 0.02, 0.82, 0.78), m.rect(0, 0, 0.19, 0.96, 0.94)],
      name === "sushi" || name === "bento" ? "#3c4743" : paper
    );
    if (name === "tofuPack") {
      m.box(0, 0, 0.19, 0.72, 0.69, 0.43, "#e5dab3");
      m.box(0, 0, 0.62, 0.75, 0.18, 0.025, 2);
    } else
      for (let i = 0; i < 4; i++)
        m.oval(((i % 2) - 0.5) * 0.38, (Math.floor(i / 2) - 0.5) * 0.39, 0.42, 0.196, 0.19, 0.22, i % 3 ? 1 : 2, 5, 3);
    return;
  }
  if (["orange", "apple", "melonpan", "loaf", "baguette", "cabbage", "grapes"].includes(name)) {
    m.oval(0, 0, 0.46, 0.49, 0.46, 0.43, 1, 8, 4);
    if (name === "grapes" || name === "cabbage")
      for (let i = 0; i < 3; i++)
        m.oval(0.22 * Math.cos(i * 2), 0.22 * Math.sin(i * 2), 0.56, 0.23, 0.22, 0.24, 2, 5, 3);
    return;
  }
  if (name === "wholeFish") {
    fish(m, 1);
    return;
  }
  if (name === "croissant") {
    bread(m, name);
    return;
  }
  if (name === "bouquet") {
    bouquet(m);
    return;
  }
  produce(m, name);
}
export function marketProductModel(name, detail) {
  const key = name + Number(detail);
  if (cache.has(key)) return cache.get(key);
  const m = new MarketModel(detail);
  if (MARKET_SHELF_LABELS[name]) {
    shelfDivider(m, MARKET_SHELF_LABELS[name]);
  } else if (name === "iceBed") {
    m.loft([m.rect(0, 0, 0.02, 0.98, 0.97), m.rect(0, 0, 0.31, 0.99, 0.98)], "#d4dfdc");
    for (let j = 0; j < (detail ? 4 : 2); j++)
      for (let i = 0; i < (detail ? 6 : 4); i++) {
        const n = detail ? 6 : 4,
          rows = detail ? 4 : 2,
          x = -0.475 + ((i + 0.5) * 0.95) / n,
          y = -0.46 + ((j + 0.5) * 0.92) / rows;
        const h = 0.38 + 0.43 * (0.5 + 0.5 * Math.sin(i * 71 + j * 23));
        m.loft(
          [
            m.ring(x, y, 0.29, 0.53 / n, 0.52 / rows, 5, i),
            m.ring(x + 0.009, y + 0.012, h, 0.24 / n, 0.3 / rows, 5, i + 0.3)
          ],
          ["#e0e8e3", "#bfcfcf", "#f1f2e7", "#cfdddd"][(i + j * 3) % 4]
        );
      }
  } else if (name.startsWith("price")) {
    m.box(0, 0, 0.015, 0.98, 0.63, 0.96, "#efe6c9");
    m.box(0, -0.34, 0.76, 0.96, 0.06, 0.16, 2);
    if (detail) {
      m.text(name.slice(5), -0.02, -0.38, 0.13, 0.75, 0.55, 1, 0.06);
      for (let i = 0; i < 6; i++) m.box(0.3 + i * 0.025, -0.36, 0.08, 0.012, 0.045, 0.125, ink);
    } else m.box(0, -0.34, 0.25, 0.47, 0.04, 0.17, 1);
  } else if (!detail) distantProduct(m, name);
  else if (name === "milkCarton" || name === "juiceCarton") carton(m, name === "juiceCarton");
  else if (["petBottle", "teaBottle", "sauceBottle"].includes(name)) bottle(m, name);
  else if (["jar", "can", "yogurt", "iceTub"].includes(name)) tub(m, name);
  else if (["cereal", "teaBox", "frozenBox"].includes(name)) boxed(m, name);
  else if (["pastaBag", "snackBag", "refill"].includes(name)) pouch(m, name);
  else if (name === "pump") pump(m);
  else if (
    ["tofuPack", "salmonTray", "porkTray", "beefTray", "wholeFish", "sushi", "bento", "croquettes"].includes(name)
  )
    prepared(m, name);
  else if (["croissant", "melonpan", "baguette", "loaf"].includes(name)) bread(m, name);
  else if (name === "bouquet") bouquet(m);
  else produce(m, name);
  const model = m.finish();
  cache.set(key, model);
  return model;
}
