import { MarketModel as SolidModel } from "./campus3dMarketGeometry.js";

import earcut from "earcut";
import { ticketMachine, ticketNotices } from "./campus3dStationTickets.js";
const metal = "#adb4b3",
  edge = "#d3d7d2",
  rubber = "#303338",
  ivory = "#f1f0e7";
const models = new Map();

function seat(m, indoor) {
  // Continuous moulded shell with a dished seat, rolled front lip and curved back.
  const profile = [
    [-0.45, 0.46],
    [-0.42, 0.49],
    [-0.32, 0.51],
    [-0.1, 0.482],
    [0.14, 0.451],
    [0.24, 0.472],
    [0.29, 0.53],
    [0.31, 0.67],
    [0.35, 0.86],
    [0.4, 0.969],
    [0.445, 0.976],
    [0.46, 0.949],
    [0.41, 0.8],
    [0.375, 0.57],
    [0.34, 0.47],
    [0.26, 0.415],
    [0.1, 0.409],
    [-0.16, 0.444],
    [-0.4, 0.441]
  ];
  const widths = [-0.46, -0.41, -0.26, 0, 0.26, 0.41, 0.46];
  const strips = widths.map((x) => profile.map(([y, z]) => [x, y, z + 0.033 * Math.pow(Math.abs(x) / 0.46, 2)]));
  for (let i = 0; i < strips.length - 1; i++)
    for (let j = 0; j < profile.length; j++) {
      const k = (j + 1) % profile.length;
      m.face([strips[i][j], strips[i][k], strips[i + 1][k], strips[i + 1][j]], 1, [
        0,
        profile[j][1] - profile[k][1],
        profile[k][0] - profile[j][0]
      ]);
    }
  for (const x of [-0.46, 0.46]) {
    const outline = profile.map(([y, z]) => [x, y, z + 0.033]);
    const cap = earcut(profile.flat());
    for (let j = 0; j < cap.length; j += 3)
      m.face(
        cap.slice(j, j + 3).map((k) => outline[k]),
        1,
        [Math.sign(x), 0, 0]
      );
    outline.push(outline[0]);
    m.tube(outline, 0.013, indoor ? "#5f625c" : edge, 5);
  }
  m.box(0, 0.13, 0.334, 0.68, 0.42, 0.063, rubber);
  if (m.detail) {
    m.tube(
      [
        [-0.31, 0.31, 0.517],
        [-0.31, 0.34, 0.74],
        [-0.31, 0.37, 0.89]
      ],
      0.009,
      2,
      5
    );
    m.tube(
      [
        [0.31, 0.31, 0.517],
        [0.31, 0.34, 0.74],
        [0.31, 0.37, 0.89]
      ],
      0.009,
      2,
      5
    );
  }
}

function gate(m) {
  const outline = (z, x, y, cut) => [
    [-x + cut, -y, z],
    [x - cut, -y, z],
    [x, -y * 0.59, z],
    [x, y * 0.59, z],
    [x - cut, y, z],
    [-x + cut, y, z],
    [-x, y * 0.59, z],
    [-x, -y * 0.59, z]
  ];
  m.loft([outline(0.015, 0.445, 0.415, 0.035), outline(0.095, 0.464, 0.448, 0.035)], rubber);
  m.loft(
    [
      outline(0.095, 0.45, 0.44, 0.031),
      outline(0.23, 0.473, 0.47, 0.04),
      outline(0.76, 0.493, 0.495, 0.042),
      outline(0.885, 0.492, 0.485, 0.049)
    ],
    metal
  );
  for (const side of [-1, 1]) {
    m.box(0, side * 0.476, 0.185, 0.823, 0.039, 0.525, 1);
    m.box(0, side * 0.496, 0.699, 0.823, 0.017, 0.027, edge);
    for (const x of [-0.288, 0.292]) m.box(x, side * 0.497, 0.23, 0.004, 0.012, 0.42, "#727c80");
    m.box(0, side * 0.494, 0.31, 0.043, 0.02, 0.48, rubber);
  }
  m.loft(
    [outline(0.878, 0.495, 0.498, 0.042), outline(0.927, 0.496, 0.5, 0.041), outline(0.957, 0.458, 0.448, 0.036)],
    rubber
  );
  for (const end of [-1, 1]) {
    const x = end * 0.322;
    m.oval(x, 0, 0.956, 0.061, 0.353, 0.025, "#4874a2", 14, 5);
    m.oval(x, 0, 0.973, 0.048, 0.272, 0.016, "#68adf0", 14, 5);
    m.oval(x, 0, 0.987, 0.026, 0.14, 0.007, "#d9edf3", 10, 4);
    m.box(end * 0.199, 0, 0.945, 0.078, 0.66, 0.065, "#262f38");
    m.box(end * 0.198, 0, 1.008, 0.054, 0.5, 0.009, "#9cb6a1");
    m.box(end * 0.478, 0, 0.739, 0.039, 0.68, 0.102, rubber);
    // Green passage arrow on the end face.
    const p = (y, z) => [end * 0.499, y, z];
    m.face([p(-0.13, 0.778), p(0.032, 0.778), p(0.032, 0.807), p(-0.13, 0.807)], "#79c695", [end, 0, 0]);
    m.face([p(0.03, 0.752), p(0.145, 0.794), p(0.03, 0.831)], "#79c695", [end, 0, 0]);
    if (m.detail) for (const side of [-1, 1]) m.box(end * 0.3, side * 0.503, 0.547, 0.06, 0.018, 0.045, rubber);
  }
}

// Three tilted luminous cases above the machines, with separate diagram lines,
// station dots and extruded type. Coordinates are local to the display bank.
function ticketDisplays(m) {
  m.box(0, 0, 0.005, 0.998, 0.92, 0.99, "#47433e");
  for (const [x, w] of [
    [-0.395, 0.192],
    [-0.194, 0.196],
    [0.199, 0.575]
  ]) {
    m.box(x, -0.474, 0.038, w, 0.052, 0.91, "#b4afa1");
    m.box(x, -0.513, 0.068, w - 0.01, 0.025, 0.848, "lit:#e9e9f0");
  }
  const ink = "#283341",
    blue = "#358aaf",
    orange = "#e08a55",
    purple = "#9a74a5",
    red = "#c5646e";
  const ratio = 0.16; // Local height divided by the width of the complete light box.
  function words(value, x, z, width, height, color = ink) {
    const from = m.v.length;
    m.text(value, x, -0.567, z, width / ratio, height, color, 0.002);
    for (let i = from; i < m.v.length; i += 10) m.v[i] = x + (m.v[i] - x) * ratio;
  }
  function line(points, col, width = 0.0015) {
    // The raised printing has a front and four narrow edges on the luminous substrate.
    for (let i = 1; i < points.length; i++) {
      const [x, z] = points[i - 1],
        [X, Z] = points[i];
      const dx = X - x,
        dz = Z - z,
        mag = Math.hypot(dx, dz * ratio);
      const a = (-dz * ratio * width) / mag,
        b = (dx * width) / (mag * ratio);
      const corner = [
        [x + a, z + b],
        [X + a, Z + b],
        [X - a, Z - b],
        [x - a, z - b]
      ];
      const rim = corner.map(([u, v]) => [u, -0.539, v]);
      const base = corner.map(([u, v]) => [u, -0.536, v]);
      m.face(rim, col, [0, -1, 0]);
      for (let k = 0; k < 4; k++) m.face([rim[k], rim[(k + 1) % 4], base[(k + 1) % 4], base[k]], col);
    }
  }
  function dot(x, z, transfer = false) {
    const rx = transfer ? 0.0036 : 0.00245,
      rz = rx / ratio;
    const points = (r, y) =>
      Array.from({ length: 10 }, (_, i) => {
        const t = (i * Math.PI) / 5;
        return [x + Math.cos(t) * rx * r, y, z + Math.sin(t) * rz * r];
      });
    m.face(points(1, -0.545), ink, [0, -1, 0]);
    m.face(points(0.65, -0.548), "lit:#f8f7f0", [0, -1, 0]);
  }
  // Left panel: the IC service mark, coloured service pictograms and captions.
  m.box(-0.452, -0.54, 0.691, 0.025, 0.012, 0.111, "#cb5a64");
  words("IC", -0.452, 0.711, 0.023, 0.048, "#ffffff");
  words("交通系ICカード", -0.38, 0.724, 0.107, 0.038);
  words("PASMO", -0.383, 0.672, 0.08, 0.034, red);
  m.box(-0.395, -0.54, 0.597, 0.166, 0.009, 0.032, "#35485b");
  const services = [
    ["きっぷ", "TK", blue],
    ["定期券", "P", red],
    ["チャージ", "IC", "#639c83"],
    ["カード", "IC", "#8b77a5"],
    ["日本語", "JP", "#548897"],
    ["精算", "FA", "#a7854c"]
  ];
  for (const [i, [caption, symbol, color]] of services.entries()) {
    const x = -0.45 + (i % 3) * 0.055,
      z = 0.455 - Math.floor(i / 3) * 0.19;
    m.box(x, -0.54, z, 0.021, 0.014, 0.084, color);
    words(symbol, x, z + 0.017, 0.016, 0.033, "#ffffff");
    if (m.detail) words(caption, x, z - 0.05, 0.049, 0.023);
  }
  // Middle panel: two horizontal station lists in the line colours, as in the hall.
  m.box(-0.246, -0.54, 0.778, 0.066, 0.013, 0.06, ink);
  words("路線案内", -0.246, 0.793, 0.06, 0.026, "#ffffff");
  const strips = [
    [0.484, blue, "目黒線", ["奥沢", "大岡山", "洗足", "西小山", "目黒"]],
    [0.211, orange, "大井町線", ["自由が丘", "緑が丘", "大岡山", "北千束", "旗の台"]]
  ];
  for (const [z, color, title, stops] of strips) {
    words(title, -0.252, z + 0.118, 0.062, 0.038);
    line(
      [
        [-0.278, z],
        [-0.109, z]
      ],
      color,
      0.0017
    );
    for (let i = 0; i < stops.length; i++) {
      const x = -0.266 + i * 0.036;
      dot(x, z, stops[i] === "大岡山");
      if (m.detail) words(stops[i], x, z + 0.044, 0.035, 0.019);
    }
  }
  // Right panel: local service diagram with real interchanges and no invented fares.
  words("東急線路線図", 0.012, 0.821, 0.139, 0.048);
  words("TOKYU RAILWAYS", 0.155, 0.832, 0.112, 0.024, ink);
  const mg = [
    [-0.05, 0.331, "田園調布"],
    [0.038, 0.331, "奥沢"],
    [0.149, 0.491, "大岡山"],
    [0.218, 0.633, "洗足"],
    [0.273, 0.677, "西小山"],
    [0.329, 0.677, "武蔵小山"],
    [0.389, 0.677, "不動前"],
    [0.445, 0.677, "目黒"]
  ];
  const om = [
    [-0.051, 0.716, ""],
    [0.015, 0.716, "自由が丘"],
    [0.088, 0.605, "緑が丘"],
    [0.149, 0.491, "大岡山"],
    [0.213, 0.375, "北千束"],
    [0.272, 0.285, "旗の台"],
    [0.316, 0.285, "荏原町"],
    [0.359, 0.285, "中延"],
    [0.403, 0.285, "下神明"],
    [0.451, 0.285, "大井町"]
  ];
  line(
    [
      [-0.062, 0.205],
      [-0.05, 0.331],
      [-0.021, 0.49],
      [0.015, 0.716],
      [0.042, 0.781]
    ],
    red,
    0.0014
  );
  line(
    [
      [0.223, 0.14],
      [0.272, 0.285],
      [0.321, 0.427],
      [0.396, 0.427]
    ],
    purple,
    0.0014
  );
  line(mg, blue, 0.00235);
  line(om, orange, 0.00235);
  for (const [stations, offset] of [
    [mg, -0.064],
    [om, 0.04]
  ]) {
    for (const [x, z, name] of stations) {
      if (!name || name === "大岡山") continue;
      dot(x, z, ["自由が丘", "旗の台", "田園調布"].includes(name));
      if (m.detail) words(name, x, z + offset, 0.047, 0.021);
    }
  }
  dot(0.149, 0.491, true);
  m.box(0.151, -0.552, 0.36, 0.049, 0.012, 0.061, "#b24d57");
  words("大岡山", 0.151, 0.372, 0.045, 0.036, "#ffffff");
  for (const [j, [name, col]] of [
    ["目黒線", blue],
    ["大井町線", orange],
    ["東横線", red],
    ["池上線", purple]
  ].entries()) {
    const x = -0.044 + j * 0.101;
    line(
      [
        [x, 0.118],
        [x + 0.013, 0.118]
      ],
      col,
      0.0013
    );
    words(name, x + 0.044, 0.102, 0.056, 0.022);
  }
  // Lean the display bank back into its alcove. Correct the normals for the same shear.
  for (let i = 0; i < m.v.length; i += 10) {
    m.v[i + 1] += 0.43 * (m.v[i + 2] - 0.5);
    m.v[i + 5] -= 0.43 * m.v[i + 4];
    const n = Math.hypot(m.v[i + 3], m.v[i + 4], m.v[i + 5]) || 1;
    for (let k = 3; k <= 5; k++) m.v[i + k] /= n;
  }
}

function tactile(m, bars) {
  m.box(0, 0, 0, 0.985, 0.981, 0.22, 1);
  if (bars) {
    for (let j = 0; j < 4; j++)
      m.loft(
        [m.rect(0, (j - 1.5) * 0.236, 0.21, 0.89, 0.086), m.rect(0, (j - 1.5) * 0.236, 0.91, 0.856, 0.061)],
        2
      );
  } else {
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.19,
          y = (j - 2) * 0.19;
        m.loft(
          [m.ring(x, y, 0.2, 0.053, 0.053, m.detail ? 8 : 4), m.ring(x, y, 0.89, 0.034, 0.034, m.detail ? 8 : 4)],
          2
        );
      }
  }
}

function threshold(m) {
  m.box(0, 0, 0.02, 0.99, 0.99, 0.21, "#747873");
  for (let r = 0; r < 4; r++)
    for (let x = 0; x < 2; x++) m.box((x - 0.5) * 0.49, (r - 1.5) * 0.232, 0.23, 0.459, 0.125, 0.55, "#b5b8ae");
  m.box(0, 0.342, 0.79, 0.168, 0.16, 0.15, ivory);
}

function leafBand(m) {
  m.tube(
    [
      [-0.5, 0, 0.46],
      [-0.28, 0, 0.56],
      [0, 0, 0.43],
      [0.3, 0, 0.56],
      [0.5, 0, 0.46]
    ],
    0.014,
    1,
    5
  );
  for (let j = 0; j < 6; j++) {
    const x = -0.42 + j * 0.16,
      z = 0.485 + 0.062 * Math.sin(j * 1.7),
      dz = j % 2 ? 0.265 : -0.24;
    const shape = [
      [x, 0, z],
      [x + 0.031, 0, z + dz * 0.62],
      [x + 0.102, 0, z + dz],
      [x + 0.085, 0, z + dz * 0.39]
    ];
    m.face(shape, 1, [0, -1, 0]);
    m.face(
      shape.map((p) => [p[0], 0.045, p[2]]),
      1,
      [0, 1, 0]
    );
  }
}

function floorGuide(m, code) {
  m.box(0, 0, 0, 0.994, 0.982, 0.26, 1);
  if (code === "queue") {
    // Painted path has a thin raised surface, visible from either side.
    m.box(0, -0.465, 0.27, 0.99, 0.033, 0.23, 2);
    m.box(0, 0.465, 0.27, 0.99, 0.033, 0.23, 2);
  } else {
    const arrow = [
      [-0.3, -0.33],
      [-0.18, -0.33],
      [0.19, 0],
      [-0.18, 0.33],
      [-0.3, 0.33],
      [0.06, 0]
    ];
    const verts = arrow.map(([x, y]) => [x, y, 0.58]);
    m.face([verts[0], verts[1], verts[2], verts[5]], 2, [0, 0, 1]);
    m.face([verts[5], verts[2], verts[3], verts[4]], 2, [0, 0, 1]);
    for (let i = 0; i < arrow.length; i++) {
      const j = (i + 1) % arrow.length;
      m.face([verts[i], verts[j], [...arrow[j], 0.27], [...arrow[i], 0.27]], 2);
    }
  }
}

function positionPlate(m) {
  m.box(0, 0, 0, 0.99, 0.68, 0.99, "#2b3034");
  for (let i = 0; i < 2; i++) {
    const z = 0.05 + i * 0.46;
    m.box(-0.322, -0.352, z, 0.326, 0.045, 0.368, i ? "#698ca8" : "#716899");
    m.box(0.155, -0.352, z + 0.24, 0.616, 0.045, 0.125, ivory);
    m.text(i ? "8" : "6", -0.32, -0.384, z + 0.061, 0.234, 0.2, ivory, 0.016);
  }
}

function pocket(m) {
  // Service hatch, top and bottom gaskets, a safety sticker and two recessed locks.
  for (const x of [-0.488, 0.488]) m.box(x, -0.08, 0.018, 0.007, 0.07, 0.965, "#90928b");
  m.box(0, -0.08, 0.018, 0.98, 0.07, 0.008, "#8c8e88");
  m.box(0, -0.08, 0.963, 0.98, 0.07, 0.008, "#8c8e88");
  for (const x of [-0.35, 0.36]) {
    m.oval(x, -0.15, 0.919, 0.014, 0.14, 0.012, metal);
    m.box(x, -0.29, 0.917, 0.009, 0.04, 0.002, rubber);
  }
  m.box(0.125, -0.114, 0.34, 0.205, 0.075, 0.19, "#dfdfd5");
  for (let j = 0; j < 4; j++) m.box(0.115, -0.16, 0.375 + j * 0.031, 0.16 - j * 0.012, 0.025, 0.008, "#999d97");
}

function boardingArrow(m) {
  m.box(0, 0, 0, 0.98, 0.98, 0.2, "#424650");
  m.box(-0.08, 0, 0.22, 0.5, 0.145, 0.27, ivory);
  m.face(
    [
      [0.1, -0.28, 0.52],
      [0.37, 0, 0.52],
      [0.1, 0.28, 0.52]
    ],
    ivory,
    [0, 0, 1]
  );
}

function column(m) {
  const count = 40,
    tau = Math.PI * 2;
  m.turned(
    0,
    0,
    [
      [0, 0.492],
      [1, 0.492]
    ],
    "#878275",
    count
  );
  const bands = [
    [0, 0.394, 6, "#ae805c"],
    [0.394, 0.464, 1, null],
    [0.464, 0.534, 1, null],
    [0.534, 1, 7, "#ded9c5"]
  ];
  for (let b = 0; b < bands.length; b++) {
    const [bottom, top, rows, color] = bands[b],
      step = (top - bottom) / rows;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < count; i++) {
        const a = ((i + 0.023) * tau) / count,
          end = ((i + 0.977) * tau) / count;
        const lo = bottom + j * step + 0.0007,
          hi = bottom + (j + 1) * step - 0.0007;
        const pt = (u, z, r = 0.5) => [r * Math.cos(u), r * Math.sin(u), z];
        const normal = [Math.cos((a + end) / 2), Math.sin((a + end) / 2), 0];
        const tone = color || ((i + b) % 2 ? "#c9b674" : "#ab805d");
        m.face([pt(a, lo), pt(end, lo), pt(end, hi), pt(a, hi)], tone, normal);
        if (m.detail)
          m.face(
            [pt(a, hi), pt(end, hi), pt(end, hi + 0.0006, 0.492), pt(a, hi + 0.0006, 0.492)],
            tone,
            [0, 0, 1]
          );
      }
  }
}

function waitingSign(m) {
  m.box(0, 0, 0, 0.99, 0.8, 0.99, edge);
  m.box(0, -0.41, 0.046, 0.9, 0.07, 0.91, "#353739");
  m.tube(
    [
      [-0.35, -0.46, 0.72],
      [0, -0.46, 0.88],
      [0.35, -0.46, 0.72]
    ],
    0.025,
    ivory,
    7
  );
  m.oval(-0.09, -0.49, 0.66, 0.071, 0.038, 0.072, ivory);
  m.tube(
    [
      [-0.1, -0.49, 0.54],
      [-0.065, -0.49, 0.38],
      [0.15, -0.49, 0.39],
      [0.22, -0.49, 0.2]
    ],
    0.043,
    ivory,
    7
  );
  m.tube(
    [
      [-0.24, -0.49, 0.57],
      [-0.21, -0.49, 0.3],
      [0.1, -0.49, 0.3]
    ],
    0.025,
    ivory,
    7
  );
  m.text("WAITING ROOM", 0, -0.5, 0.057, 0.76, 0.071, ivory, 0.012);
}

export function stationModel(name, detail) {
  const key = name + Number(detail);
  if (models.has(key)) return models.get(key);
  const m = new SolidModel(detail),
    part = name.slice(8);
  if (part === "gate") gate(m);
  else if (part === "ticketNotices") ticketNotices(m);
  else if (["ticket", "charge", "fare", "ticketPanel"].includes(part)) ticketMachine(m, part);
  else if (part === "seat" || part === "waitingSeat") seat(m, part === "waitingSeat");
  else if (part === "dots" || part === "ribs") tactile(m, part === "ribs");
  else if (part === "threshold") threshold(m);
  else if (part === "frost") leafBand(m);
  else if (part === "position") positionPlate(m);
  else if (part === "pocket") pocket(m);
  else if (part === "boardingArrow") boardingArrow(m);
  else if (part === "ticketDisplays") ticketDisplays(m);
  else if (part.startsWith("number")) m.text(part.slice(6), 0, -0.46, 0.02, 0.9, 0.87, "#292f31", 0.06);
  else if (part === "column") column(m);
  else if (part === "cap")
    m.turned(
      0,
      0,
      [
        [0.01, 0.42],
        [0.14, 0.472],
        [0.72, 0.5],
        [0.97, 0.495]
      ],
      "#eeece2",
      48
    );
  else if (part === "waitingSign") waitingSign(m);
  else if (part === "arrow" || part === "queue") floorGuide(m, part);
  else if (part === "tile")
    m.loft([m.rect(0, 0, 0, 1, 1), m.rect(0, 0, 0.7, 1, 1), m.rect(0, 0, 1, 0.996, 0.996)], 1);
  else if (part.startsWith("digit")) m.text(part.slice(5), 0, -0.37, 0.025, 0.96, 0.89, ivory, 0.05);
  else throw Error("Unknown station model " + name);
  const out = m.finish();
  models.set(key, out);
  return out;
}
