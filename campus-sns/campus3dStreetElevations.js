import { drugRack } from "./campus3dStreetProps.js";
// Dimensions are metres in the shopfront frame. The sections below follow the
// November walks, including the offsets between glazing, lettering, eaves and wall.
const steel = "#abaea9",
  ivory = "#f2eee3",
  ink = "#353535",
  black = "#27292b";
function box(m, l, r, b, t, y, depth, mat) {
  if (r - l > 0.005 && t - b > 0.005) m.box((l + r) / 2, y, b, r - l, depth, t - b, mat);
}
function word(m, s, l, r, b, t, y, mat, style = "sans") {
  if (!s || r <= l || t <= b) return;
  const first = m.v.length;
  m.text(s, 0, y, 0, 100, 1, mat, 0.009, style);
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (let i = first; i < m.v.length; i += 10) {
    x0 = Math.min(x0, m.v[i]);
    x1 = Math.max(x1, m.v[i]);
    z0 = Math.min(z0, m.v[i + 2]);
    z1 = Math.max(z1, m.v[i + 2]);
  }
  if (!(x1 > x0 && z1 > z0)) return;
  for (let i = first; i < m.v.length; i += 10) {
    m.v[i] = l + ((m.v[i] - x0) * (r - l)) / (x1 - x0);
    m.v[i + 2] = b + ((m.v[i + 2] - z0) * (t - b)) / (z1 - z0);
  }
}
function glazing(
  m,
  l,
  r,
  b,
  t,
  y,
  divisions = 2,
  frame = "#646963",
  tint = "#788888",
  transom = 0,
  finish = "glass"
) {
  const edge = 0.048;
  const transparent = finish !== "glass";
  if (!transparent) box(m, l, r, b, t, y + 0.066, 0.1, "#434745");
  for (let j = 0; j < divisions; j++) {
    const x0 = l + (j * (r - l)) / divisions,
      x1 = l + ((j + 1) * (r - l)) / divisions;
    if (transparent) m.windowPane(x0 + edge, x1, b + edge, t - edge, y, tint, finish);
    else box(m, x0 + edge, x1 - edge * 0.45, b + edge, t - edge, y, 0.042, "glass:" + tint);
    box(m, x0, x0 + edge, b, t, y - 0.015, 0.093, frame);
  }
  box(m, r - edge, r, b, t, y - 0.015, 0.093, frame);
  for (const z of [b, t - edge, ...(transom ? [transom] : [])]) box(m, l, r, z, z + edge, y - 0.025, 0.1, frame);
  box(m, l - 0.045, r + 0.045, b - 0.038, b + 0.012, y - 0.035, 0.15, steel);
}
function pipe(m, points, r, col = steel) {
  m.tube(points, r, col, 7);
}
function spots(m, l, r, z, y, count) {
  for (let i = 0; i < count; i++) {
    const x = l + ((r - l) * (i + 0.5)) / count;
    pipe(
      m,
      [
        [x, y + 0.28, z + 0.2],
        [x, y + 0.19, z + 0.17],
        [x, y, z + 0.06]
      ],
      0.021,
      black
    );
    m.oval(x, y, z + 0.04, 0.069, 0.075, 0.082, black, 9, 5);
    m.oval(x, y - 0.024, z - 0.005, 0.052, 0.053, 0.028, "lit:#ffe2a1", 9, 5);
  }
}
function canopy(m, l, r, z, reach, col, drop = 0.21) {
  const seam = 0.4,
    nose = z - drop;
  m.face(
    [
      [l, 0.02, z],
      [r, 0.02, z],
      [r, -reach, nose],
      [l, -reach, nose]
    ],
    col,
    [0, -1, 1]
  );
  box(m, l, r, nose - 0.12, nose, -reach, 0.043, col);
  for (const x of [l + 0.05, r - 0.05])
    pipe(
      m,
      [
        [x, 0.02, z - 0.39],
        [x, -reach + 0.02, nose - 0.05],
        [x, -reach + 0.02, nose + 0.015]
      ],
      0.022,
      steel
    );
  for (let x = l + seam; x < r - 0.05; x += seam)
    pipe(
      m,
      [
        [x, 0.0, z + 0.006],
        [x, -reach, nose + 0.009]
      ],
      0.004,
      col
    );
}
function menuDish(m, x, y, z, size, cuisine, variant) {
  const depth = Math.min(0.006, size * 0.05);
  function relief(outline, layer, color) {
    const front = outline.map(([u, v]) => [x + u * size, y - layer * depth, z + v * size]);
    m.face(front, color, [0, -1, 0]);
    for (let i = 0; i < front.length; i++) {
      const a = front[i], b = front[(i + 1) % front.length];
      m.face([a, b, [b[0], b[1] + depth, b[2]], [a[0], a[1] + depth, a[2]]], color);
    }
  }
  if (cuisine === "gyoza") {
    relief([[-1, -0.37], [0.93, -0.36], [1, 0.35], [-0.92, 0.39]], 1, "#d7e3dc");
    for (let i = 0; i < 5; i++) {
      const u = -0.76 + i * 0.32;
      relief([[u, -0.19], [u + 0.25, -0.17], [u + 0.36, 0.04], [u + 0.29, 0.23], [u + 0.14, 0.18]], 2, "#dbb976");
      relief([[u + 0.03, -0.16], [u + 0.23, -0.14], [u + 0.30, -0.04], [u + 0.09, -0.07]], 3, "#b77d43");
    }
  } else if (cuisine === "kebab" && variant % 3 !== 0) {
    relief([[-0.83, -0.27], [-0.62, -0.51], [0.43, -0.17], [0.78, 0.13], [0.47, 0.50], [-0.23, 0.30]], 1, "#dca967");
    relief([[-0.24, 0.23], [0.45, 0.46], [0.72, 0.17], [0.41, -0.04], [-0.22, 0.02]], 2, "#829752");
    relief([[-0.18, 0.11], [0.16, 0.32], [0.49, 0.29], [0.58, 0.12], [0.19, 0.07]], 3, "#a35b32");
    relief([[0.24, 0.29], [0.45, 0.39], [0.56, 0.31], [0.40, 0.23]], 4, "#cb6950");
    relief([[-0.83, -0.27], [-0.62, -0.51], [0.03, -0.31], [-0.26, 0.14]], 3, "#f3e5cd");
  } else {
    m.oval(x, y, z, size, depth, size * 0.61, "#f5f0df", 16, 4);
    relief([[-0.88, -0.10], [-0.62, -0.43], [-0.14, -0.53], [0.24, -0.41], [0.10, -0.10], [0.29, 0.24],
      [-0.13, 0.48], [-0.60, 0.36], [-0.83, 0.15]], 2, variant % 2 ? "#c49246" : "#bb803d");
    relief([[0.11, -0.29], [0.51, -0.34], [0.80, -0.12], [0.80, 0.16], [0.48, 0.33], [0.18, 0.30], [0.04, 0.11]], 2, "#eee3ba");
    if (variant % 3 === 0) {
      for (let i = 0; i < 3; i++) {
        const u = -0.64 + i * 0.23, v = -0.12 + i * 0.065;
        relief([[u, v], [u + 0.13, v - 0.10], [u + 0.31, v + 0.12], [u + 0.20, v + 0.23]], 3, "#dbab61");
      }
    } else {
      relief([[-0.56, -0.13], [-0.39, -0.19], [-0.30, -0.04], [-0.46, 0.02]], 3, "#d6954b");
      relief([[-0.21, 0.18], [-0.08, 0.31], [0.03, 0.19], [-0.05, 0.09]], 3, variant % 2 ? "#7b8b48" : "#ddae60");
    }
  }
}
function tray(m, l, r, b, t, y, cols = 3, rows = 4, glow = true, cuisine = "curry") {
  if (r - l < 0.14) return;
  box(m, l, r, b, t, y, 0.065, "#615d54");
  box(m, l + 0.022, r - 0.022, b + 0.021, t - 0.021, y - 0.041, 0.022, glow ? "lit:#efdfb9" : "#e9e3d2");
  const header = cols > 1 ? Math.min(0.11, (t - b) * 0.10) : 0;
  if (header) {
    box(m, l + 0.04, r - 0.04, t - header - 0.025, t - 0.027, y - 0.055, 0.01, cuisine === "curry" ? "#e0c579" : "#dfcfb2");
    word(m, "MENU", l + 0.055, l + (r - l) * 0.36, t - header - 0.014, t - 0.035, y - 0.062, "#69543e");
  }
  const w = (r - l - 0.06) / cols, h = (t - b - 0.09 - header) / rows;
  for (let i = 0; i < cols * rows; i++) {
    const x = l + 0.03 + ((i % cols) + 0.5) * w,
      z = t - 0.046 - header - (Math.floor(i / cols) + 0.41) * h;
    menuDish(m, x, y - 0.059, z, Math.min(w * 0.43, h * 0.49), cuisine, i);
    box(m, x - w * 0.31, x + w * (0.10 + 0.04 * (i % 3)), z - h * 0.38, z - h * 0.354, y - 0.056, 0.01, "#8b7d69");
    box(m, x + w * 0.19, x + w * 0.31, z - h * 0.38, z - h * 0.35, y - 0.056, 0.01, "#b18a62");
  }
}
function threshold(m, l, r, depth, color) {
  box(m, l, r, 0.055, 0.08, -depth * 0.46, depth, color);
  for (let x = l + 0.15; x < r; x += 0.23)
    box(m, x - 0.005, x + 0.005, 0.079, 0.083, -depth * 0.46, depth, "#816d5d");
}
function shutter(m, l, r, b, t, y, col) {
  box(m, l, r, b, t, y, 0.1, col);
  for (let z = b + 0.07; z < t; z += 0.077) box(m, l, r, z, z + 0.014, y - 0.058, 0.015, "#858882");
}
function balcony(m, l, r, b, t, back = 0.55) {
  box(m, l, r, b, t, back + 0.14, 0.11, "#494b46");
  for (const x of [l, r]) box(m, x - 0.035, x + 0.035, b, t, back * 0.48, back + 0.13, "tile:#cecec4");
  box(m, l, r, t - 0.08, t, -0.02, 0.16, "#5a5a55");
  glazing(m, l + 0.1, r - 0.1, b + 0.1, t - 0.08, back, 2, steel, "#505957");
  box(m, l - 0.055, r + 0.055, b - 0.08, b + 0.48, -0.085, 0.26, "tile:#e6e7df");
  for (const x of [l + 0.07, r - 0.07])
    pipe(
      m,
      [
        [x, -0.14, b + 0.46],
        [x, -0.14, b + 0.8]
      ],
      0.022,
      steel
    );
  pipe(
    m,
    [
      [l, -0.14, b + 0.79],
      [r, -0.14, b + 0.79]
    ],
    0.025,
    steel
  );
}
const upperFinish = {
  kaldi: "tile:#b8b2af",
  housecom: "tile:#b8b2af",
  cocoichi: "brick:#a56954",
  familynorth: "tile:#edeee8",
  basanta: "stucco:#d7d3bb",
  kamio: "stone:#8c8990",
  shibata: "stucco:#d4d2c6",
  cocopharmacy: "stucco:#e2dfd2",
  coco: "tile:#b4afa9",
  constant: "tile:#b4afa9",
  ohsho: "stucco:#e0d3bd"
};
export function filmedUpper(m, shop, L, height) {
  const mat = upperFinish[shop.id];
  if (!mat) return false;
  const { half: h } = L,
    w = h * 2;
  // The first-floor display and the upstairs finish have separate planes.
  if (shop.id === "familynorth") {
    for (const [l, r, b, t] of [
      [-h, h, 3.12, 3.72],
      [-h, -0.84, 3.72, 5.62],
      [h - 0.09, h, 3.72, 5.62],
      [-h, h, 5.62, 6.0],
      [-h, -0.6, 6.0, 7.44],
      [h - 0.14, h, 6.0, 7.44],
      [-h, h, 7.44, height]
    ])
      box(m, l, r, b, t, -0.034, 0.058, mat);
  } else if (shop.id === "basanta") {
    box(m, -h, h, 3.12, 3.45, -0.034, 0.058, mat);
    box(m, -h, -1.08, 3.45, 4.5, -0.034, 0.058, mat);
    box(m, 0.40, h, 3.45, 4.5, -0.034, 0.058, mat);
    box(m, -h, h, 4.5, height, -0.034, 0.058, mat);
  } else box(m, -h, h, 3.12, height, -0.034, 0.058, mat);
  box(m, -h - 0.025, h + 0.025, height - 0.13, height + 0.016, -0.06, 0.15, "#b9b9af");
  if (shop.id === "cocopharmacy") {
    box(m, -h + 0.13, h - 0.65, height, height + 2.62, 2.12, 1.86, "stucco:#b8b7ad");
    glazing(m, -h + 0.37, -h + 1.29, height + 0.74, height + 1.94, 1.09, 1, steel, "#7e8788");
    box(m, -h + 0.04, h - 0.6, height + 2.59, height + 2.73, 2.12, 2.01, "#c1c0b4");
    const X = h - 0.43,
      Y = 1.65;
    pipe(
      m,
      [
        [X, Y, height],
        [X, Y, height + 3.23]
      ],
      0.061,
      steel
    );
    const hand = [];
    for (let j = 0; j < 31; j++) {
      const a = j * 0.327,
        r = 0.66,
        z = height + 0.086 * j;
      const point = (b, R, Z) => [X + Math.cos(b) * R, Y + Math.sin(b) * R, Z];
      m.face(
        [point(a, 0.09, z), point(a, r, z), point(a + 0.34, r, z), point(a + 0.34, 0.09, z)],
        "#888d8a",
        [0, 0, 1]
      );
      if (j % 2 === 0) pipe(m, [point(a, r, z), point(a, r, z + 0.68)], 0.016, steel);
      hand.push(point(a, r, z + 0.67));
    }
    pipe(m, hand, 0.024, steel);
    return true;
  }
  if (shop.id === "shibata") {
    for (let i = 0; i < 4; i++) {
      const z = 3.66 + i * 3.02;
      for (const [l, r, d] of [
        [-h + 0.32, -h + 1.08, 1],
        [-h + 1.93, -0.12, 2],
        [0.39, h - 0.39, 3]
      ])
        glazing(m, l, r, z, z + 1.73, -0.115, d, steel, "#78808a");
    }
    const signs = [
      ["柴田不動産株式会社", "#5888a4", 2.83, 3.68],
      ["Pilates Mirror", "#e7e3d4", 5.56, 6.8],
      ["大岡山メンタルクリニック", "#e4ded2", 8.61, 9.72],
      ["デンタルオフィス", "#68604d", 11.66, 12.7]
    ];
    for (const [i, [s, c, b, t]] of signs.entries()) {
      box(m, 0.19, h - 0.26, b, t, -0.175, 0.26, c);
      word(
        m,
        s,
        0.37,
        h - 0.42,
        b + 0.29,
        t - 0.16,
        -0.319,
        i === 0 || i === 3 ? ivory : i === 2 ? "#a2605d" : "#857d70"
      );
      if (i === 0) word(m, "TEL 03-3723-0100", 0.75, h - 0.65, b + 0.07, b + 0.18, -0.32, ivory);
    }
  } else if (shop.id === "basanta") {
    glazing(m, -1.08, 0.40, 3.45, 4.5, 0.075, 2, "#605c55", "#8392a3", 0, "tintedglass");
    // The video shows cartons stacked at the left of a recessed upstairs storeroom.
    box(m, -1.08, 0.40, 3.45, 4.50, 0.56, 0.06, "#55575e");
    box(m, -1.08, -1.04, 3.45, 4.50, 0.23, 0.59, "#777469");
    box(m, 0.36, 0.40, 3.45, 4.50, 0.23, 0.59, "#66635d");
    box(m, -1.08, 0.40, 4.47, 4.50, 0.23, 0.59, "#54555a");
    box(m, -1.08, 0.40, 3.45, 3.49, 0.23, 0.59, "#878275");
    box(m, -1.04, 0.36, 3.57, 3.61, 0.34, 0.39, "#a39d8e");
    box(m, -1.01, -0.53, 3.61, 3.83, 0.29, 0.26, "#ad9574");
    box(m, -0.82, -0.78, 3.61, 3.83, 0.158, 0.007, "#c2a985");
    box(m, -0.96, -0.56, 3.83, 4.045, 0.31, 0.23, "#b9a486");
    box(m, -0.80, -0.76, 3.83, 4.045, 0.193, 0.007, "#c9b69b");
    m.loft([m.rect(-0.29, 0.29, 3.61, 0.39, 0.25), m.rect(-0.25, 0.30, 3.76, 0.37, 0.22),
      m.rect(-0.22, 0.31, 3.88, 0.25, 0.14)], "#b9b6a9");
    m.loft([m.rect(0.11, 0.33, 3.61, 0.42, 0.27), m.rect(0.13, 0.34, 3.80, 0.34, 0.24),
      m.rect(0.17, 0.35, 3.91, 0.21, 0.13)], "#cfcbc0");
    for (let z = 5.1; z < height - 0.12; z += 0.28) box(m, -h, h, z, z + 0.018, -0.074, 0.02, "#bbb9aa");
  } else if (shop.id === "kaldi" || shop.id === "housecom") {
    for (let z = 4.27; z < height - 0.6; z += 3.1)
      glazing(m, -h + 0.24, h - 0.24, z, z + 1.43, -0.1, 4, steel, "#80919c");
    const labels = shop.id === "kaldi" ? ["明", "光", "義", "塾"] : ["大", "岡", "山", "教", "室"];
    const l = shop.id === "kaldi" ? -1.62 : -h + 0.27,
      r = shop.id === "kaldi" ? 1.83 : h - 0.3,
      b = 4.29,
      t = 5.5,
      bw = (r - l) / labels.length;
    box(m, l, r, b, t, -0.174, 0.09, "#46609b");
    labels.forEach((s, j) => {
      const x = l + j * bw;
      box(m, x + 0.048, x + bw - 0.048, b + 0.26, t - 0.1, -0.233, 0.034, "#e4d55f");
      word(m, s, x + 0.15, x + bw - 0.15, b + 0.39, t - 0.22, -0.258, "#495e96");
      box(m, x, x + 0.029, b, t, -0.232, 0.06, steel);
    });
    word(m, "大岡山教室", l + 0.18, r - 0.24, b + 0.055, b + 0.188, -0.24, "#e0e1bc");
    for (let x = l; x < r; x += 1.52) spots(m, x, x + 0.2, 4.09, -0.19, 1);
  } else if (shop.id === "cocoichi") {
    for (let z = 4.47; z < height - 0.7; z += 3.02)
      glazing(m, -h + 0.075, h - 0.075, z, z + 1.72, -0.111, 4, steel, "#747f82");
    const b = 4.58,
      t = 6.1,
      l = -h + 0.085,
      pw = (w - 0.17) / 4;
    for (let i = 0; i < 4; i++) {
      let x = l + i * pw,
        blue = i === 0 || i === 3;
      box(m, x + 0.019, x + pw - 0.019, b, t, -0.148, 0.065, blue ? "#558abf" : "#e8eddf");
      for (const z of [b + 0.03, t - 0.08])
        box(m, x + 0.022, x + pw - 0.022, z, z + 0.04, -0.188, 0.018, "#639dc6");
      const col = blue ? ivory : "#799a98";
      word(
        m,
        ["個別指導", "マイベスト", "ラーニング", "大岡山教室"][i],
        x + 0.06,
        x + pw - 0.06,
        b + 0.62,
        b + 0.86,
        -0.193,
        col
      );
      if (i === 0 || i === 3) {
        word(m, i ? "0120-" : "テスト対策", x + 0.08, x + pw - 0.09, b + 0.29, b + 0.47, -0.194, "#e4e8db");
      }
    }
  } else if (shop.id === "familynorth") {
    glazing(m, -h + 0.55, -h + 1.67, 4.0, 5.28, -0.105, 2, steel, "#708081");
    glazing(m, -h + 0.58, -h + 1.75, 6.97, 8.22, -0.107, 2, steel, "#778384");
    balcony(m, -0.84, L.edge - 0.11, 3.72, 5.62);
    balcony(m, -0.6, h - 0.14, 6.0, 7.44, 0.69);
    for (let j = 0; j < 7; j++)
      box(m, -0.55, h - 0.18, 6.02 + j * 0.082, 6.054 + j * 0.082, -0.23, 0.075, "#495253");
  } else if (shop.id === "kamio") {
    glazing(m, -h + 0.29, h - 0.29, 3.66, 5.23, -0.12, 5, ink, "#727a79");
    word(m, "神尾歯科医院", -h + 0.38, h - 0.35, 4.0, 4.65, -0.22, "#8bc36c");
    word(m, "03-3778-4422", -0.1, h - 0.38, 3.73, 3.97, -0.22, "#accc92");
    glazing(m, h - 0.87, h - 0.32, 7.08, 8.16, -0.094, 1, steel, "#82898b");
    for (let j = 0; j < 4; j++) box(m, -h, h, 5.46 + j * 0.94, 5.475 + j * 0.94, -0.071, 0.018, "#9d9c9c");
  } else if (shop.id === "coco" || shop.id === "constant") {
    if (shop.id === "coco") {
      glazing(m, -h + 0.22, 0.78, 3.81, 6.16, -0.122, 2, ink, "#797a80", 5.72);
      glazing(m, 0.99, h - 0.19, 3.81, 6.16, -0.126, 1, "#53505b", "#8b8582");
      m.tube(
        [
          [2.37, -0.162, 4.03],
          [2.58, -0.162, 4.73],
          [2.23, -0.162, 4.97],
          [2.25, -0.162, 5.1],
          [2.98, -0.162, 4.55],
          [2.9, -0.162, 4.43],
          [2.54, -0.162, 4.68],
          [2.89, -0.162, 4.99],
          [3.1, -0.162, 5.02]
        ],
        0.033,
        "#9da66d",
        7
      );
    } else glazing(m, -h + 0.23, h - 0.21, 3.81, 5.92, -0.115, 4, ink, "#81858b", 5.34);

    for (let x = -h + 0.14; x < h; x += 0.42)
      pipe(
        m,
        [
          [x, -0.02, height],
          [x, -0.02, height + 0.64]
        ],
        0.015,
        steel
      );
    pipe(
      m,
      [
        [-h, -0.02, height + 0.64],
        [h, -0.02, height + 0.64]
      ],
      0.023,
      steel
    );
  } else if (shop.id === "ohsho") {
    shutter(m, 0.23, h - 0.64, 4.67, 5.81, -0.09, "#aca998");
    for (let z = 6.96; z < height - 0.5; z += 3.0)
      glazing(m, -h + 0.51, h - 0.56, z, z + 1.26, -0.11, 3, steel, "#8c908a");
  }
  return true;
}

function fabricCart(m, x, y) {
  // The indigo delivery cover hangs loosely over a rigid, wheeled frame.
  const w = 0.79,
    d = 0.59,
    top = 1.81,
    col = "canvas:#3e4165";
  for (const a of [-1, 1])
    for (const b of [-1, 1]) m.oval(x + a * 0.32, y + b * 0.22, 0.12, 0.08, 0.045, 0.078, black, 8, 5);
  box(m, x - w / 2, x + w / 2, 0.17, 0.24, y, d, "#494952");
  m.box(x, y, 0.29, w - 0.103, d - 0.116, top - 0.46, col);
  for (let j = 0; j < 12; j++) {
    const panel = (i) => {
      let u = i / 12,
        edge = Math.sin(u * Math.PI);
      return [
        [x + (u - 0.5) * w, y - d * 0.51 - 0.043 * Math.cos(u * Math.PI * 8), 0.31 + 0.041 * edge],
        [x + (u - 0.5) * w, y - d * 0.53 - 0.024 * Math.cos(u * Math.PI * 8), top - 0.153 * edge]
      ];
    };
    const [a, b] = panel(j),
      [c, e] = panel(j + 1);
    m.face([a, c, e, b], col, [0, -1, 0]);
  }
  for (const s of [-1, 1])
    pipe(
      m,
      [
        [x + s * 0.375, y - d * 0.54, 0.25],
        [x + s * 0.38, y - d * 0.54, top - 0.04],
        [x + s * 0.38, y + 0.19, top]
      ],
      0.012,
      "#b8b4a7"
    );
  word(m, "KALDI", x - 0.24, x + 0.24, 1.4, 1.5, y - d * 0.59 - 0.035, "#c4ae78", "serif");
  word(m, "COFFEE FARM", x - 0.23, x + 0.23, 1.31, 1.37, y - d * 0.59 - 0.035, "#b6a175");
}
function mealPosters(m, l, r, b, t, y) {
  const mid = (l + r) / 2;
  for (const [left, right, takeaway] of [[l, mid - 0.025, true], [mid + 0.025, r, false]]) {
    box(m, left, right, b, t, y, 0.065, "#676259");
    box(m, left + 0.023, right - 0.023, b + 0.025, t - 0.025, y - 0.04, 0.022, takeaway ? "#ece9de" : "#dabe71");
    box(m, left + 0.045, right - 0.045, b + 0.07, b + 0.16, y - 0.057, 0.01, takeaway ? "#818966" : "#935741");
    word(m, takeaway ? "TAKE OUT" : "CURRY", left + 0.055, right - 0.055, t - 0.24, t - 0.12, y - 0.06, takeaway ? "#4e5550" : "#674131");
    word(m, takeaway ? "お弁当" : "カレー", left + 0.06, right - 0.19, t - 0.37, t - 0.30, y - 0.06, "#6f5844");
    menuDish(m, (left + right) / 2, y - 0.06, b + 0.32, (right - left) * 0.36, "curry", takeaway ? 1 : 0);
  }
}
function kebabCounter(m, L) {
  const { half: h, entry } = L,
    split = Math.min(h - 0.78, 0.55);
  box(m, -h, -h + 0.23, 0.075, 2.57, -0.015, 0.29, "stucco:#ede6cc");
  box(m, split - 0.055, split + 0.055, 0.1, 2.56, -0.005, 0.23, "#dbcba9");
  box(m, h - 0.19, h, 0.08, 2.57, -0.035, 0.26, "#d1c5a8");
  box(m, -h + 0.25, split - 0.045, 1.07, 1.16, 0.0, 0.65, "#54514a");
  box(m, -h + 0.21, split - 0.045, 0.14, 1.05, -0.088, 0.25, "lit:#e8dab7");
  tray(m, -h + 0.27, split - 0.09, 0.22, 0.99, -0.225, 3, 2, true, "kebab");
  box(m, -h + 0.23, split - 0.02, 2.06, 2.31, 0.025, 0.23, "#746d56");
  box(m, -h + 0.28, split - 0.08, 2.09, 2.28, -0.107, 0.045, "lit:#f3e9cb");
  word(m, "ORDER HERE", -h + 0.49, split - 0.2, 2.12, 2.244, -0.138, ink);
  box(m, -h + 0.18, h - 0.08, 2.36, 2.47, -0.074, 0.32, "#a89e80");
  const l = -h + 0.02,
    r = h - 0.02,
    b = 2.56,
    t = 3.29,
    step = (r - l) / 4;
  for (let i = 0; i < 4; i++) {
    const x = l + i * step;
    if (i) tray(m, x + 0.018, x + step - 0.025, b, t, -0.22, 2, 2, true, "kebab");
    else {
      box(m, x + 0.018, x + step - 0.025, b, t, -0.22, 0.09, "#544e43");
      box(m, x + 0.044, x + step - 0.05, b + 0.035, t - 0.036, -0.28, 0.035, "lit:#e8e5cd");
      word(m, "kebab & curry", x + 0.102, x + step - 0.085, b + 0.42, b + 0.53, -0.308, "#4f493b");
      word(m, "BASANTA", x + 0.12, x + step - 0.1, b + 0.18, b + 0.28, -0.311, "#5d5546");
    }
  }
  const spit = -h + 0.71;
  box(m, -h + 0.29, split - 0.06, 1.08, 2.04, 0.85, 0.12, "#54544a");
  box(m, spit - 0.26, spit + 0.21, 1.15, 1.99, 0.63, 0.17, "#74634e");
  for (let j = 0; j < 7; j++)
    box(m, spit - 0.2, spit + 0.15, 1.23 + j * 0.105, 1.27 + j * 0.105, 0.52, 0.04, j % 2 ? "#934e35" : "#b86b40");
  pipe(
    m,
    [
      [spit, 0.32, 1.1],
      [spit, 0.32, 2.025]
    ],
    0.023,
    steel
  );
  const rings = [
    [1.16, 0.077],
    [1.22, 0.12],
    [1.61, 0.196],
    [1.82, 0.165],
    [1.88, 0.146]
  ];
  m.turned(spit, 0.32, rings, "#bd833c", 16);
  for (let j = 0; j < 15; j++) {
    const z = 1.22 + j * 0.041,
      r = 0.125 + 0.054 * Math.sin(j * 0.18);
    m.turned(
      spit,
      0.32,
      [
        [z, r],
        [z + 0.014, r + 0.009]
      ],
      j % 3 ? "#bc8e52" : "#9c6638",
      13
    );
  }
  tray(m, split - 0.54, split - 0.11, 1.24, 1.95, 0.2, 2, 4, false, "kebab");
  for (const x of [spit - 0.12, entry]) m.oval(x, 0.24, 2.35, 0.071, 0.071, 0.034, "lit:#ffe9ae", 9, 5);
  threshold(m, -h, h, 0.34, "stone:#b5ae9c");
}
function curryFront(m, L) {
  const { half: h, edge } = L,
    l = -h + 0.04,
    r = edge - 0.03,
    mark = l + (r - l) * 0.19;
  box(m, -h, h, 3.17, 4.55, -0.042, 0.14, "brick:#976855");
  box(m, l, r, 2.6, 3.18, 0.07, 0.24, "#b7a88d");
  box(m, r + 0.04, h, 2.6, 3.18, -0.041, 0.14, "brick:#a46d5b");
  box(m, l - 0.02, r + 0.02, 3.28, 4.1, -0.128, 0.22, black);
  box(m, l + 0.035, r - 0.035, 3.34, 4.05, -0.253, 0.043, "lit:#e8c333");
  box(m, l + 0.041, r - 0.041, 3.38, 3.43, -0.283, 0.035, "#534348");
  m.oval(mark, -0.287, 3.7, 0.234, 0.039, 0.249, "#57414b", 18, 8);
  m.oval(mark, -0.322, 3.7, 0.196, 0.027, 0.21, "#eedb9e", 18, 8);
  m.oval(mark + 0.044, -0.343, 3.68, 0.118, 0.026, 0.135, "#dfb336", 14, 7);
  word(m, "CURRY HOUSE", l + (r - l) * 0.3, l + (r - l) * 0.59, 3.84, 3.96, -0.284, "#7a603e");
  word(m, "CoCo壱番屋", l + (r - l) * 0.28, r - 0.16, 3.49, 3.85, -0.295, "#5b4142");
  canopy(m, l, r, 3.04, 0.6, "canvas:#40594a", 0.17);
  spots(m, l, r, 2.71, -0.62, 6);
  box(m, l, l + 0.19, 0.12, 2.74, -0.06, 0.28, "#d4c7a5");
  // Pockets of the open sliding door, with a clear entrance at the left.
  const ent = L.entry;
  const doorWidth = L.doorWidth;
  const panelStart = ent + doorWidth * 0.52;
  glazing(m, panelStart, r - 0.035, 0.14, 2.6, -0.024, 3, "#514b42", "#8b8372", 1.8, "shopglass");
  box(m, panelStart, r - 0.03, 0.1, 0.91, -0.078, 0.08, "#494540");
  // Menu sleeves are mounted to the glass. The rear counter and the warm ceiling
  // are visible through the clear area of the doors.
  for (const [i, x] of [panelStart + 0.18, panelStart + 0.68].entries()) {
    tray(m, x - 0.14, x + 0.14, 1.17, 1.62, -0.107, 1, 2, false);
    box(m, x - 0.14, x + 0.14, 1.65, 1.75, -0.109, 0.025, i ? "#d2a655" : "#b9955a");
  }
  box(m, l + 0.13, r - 0.12, 2.59, 2.68, 0.99, 1.85, "timber:#b18d62");
  box(m, l + 0.11, r - 0.1, 0.65, 2.38, 3.11, 0.12, "timber:#b18e65");
  for (let i = 0; i < 6; i++) {
    const x = l + 0.38 + (i * (r - l - 0.7)) / 5;
    pipe(
      m,
      [
        [x, 1.14, 2.64],
        [x, 1.14, 2.51]
      ],
      0.012,
      black
    );
    m.oval(x, 1.14, 2.49, 0.105, 0.104, 0.052, "lit:#ffe7a4", 10, 5);
    tray(m, x - 0.16, x + 0.16, 1.48, 1.9, 2.91, 1, 2, false);
  }
  const menuL = r - 0.85;
  tray(m, menuL, r - 0.035, 1.1, 2.25, -0.173, 3, 5, true);
  mealPosters(m, r - 1.39, r - 0.04, 0.15, 1.02, -0.159);
  box(m, menuL - 0.1, r - 0.026, 2.29, 2.55, -0.135, 0.11, "#c37c44");
  word(m, "お弁当コーナー", menuL - 0.06, r - 0.09, 2.34, 2.49, -0.203, "#f4deaa");
  box(m, ent - doorWidth * 0.53, ent + doorWidth * 0.51, 2.26, 2.62, -0.006, 0.19, "#6f5c46");
  const wallX = r + 0.11;
  box(m, wallX, wallX + 0.14, 0.03, 2.88, 0.57, 1.3, "tile:#ddcfad");
  threshold(m, -h, h, 0.69, "brick:#b98b72");
  box(m, ent - doorWidth * 0.49, ent + doorWidth * 0.49, 0.079, 0.098, -0.37, 0.57, "#51473d");
  word(m, "CoCo", l + 0.18, l + 0.52, 2.36, 2.5, -0.11, "#dbbc64");
}
function northFront(m, L) {
  const { half: h, edge } = L,
    l = -h + 0.04,
    r = edge - 0.018;
  box(m, -h, h, 2.61, 3.64, -0.046, 0.11, "tile:#e6e5d9");
  box(m, l, r, 2.61, 3.46, -0.13, 0.235, "#dedfd5");
  box(m, l + 0.017, r - 0.017, 2.67, 3.34, -0.276, 0.04, "#f4f3e9");
  box(m, l + 0.017, r - 0.017, 3.11, 3.34, -0.309, 0.025, "#82c650");
  box(m, l + 0.017, r - 0.017, 2.67, 2.753, -0.309, 0.025, "#58a5cd");
  for (let x = l + (r - l) / 4; x < r - 0.08; x += (r - l) / 4)
    box(m, x - 0.012, x + 0.012, 2.63, 3.43, -0.326, 0.032, "#c4c8bd");
  word(m, "FamilyMart", l + 0.18 * (r - l), l + 0.64 * (r - l), 2.79, 3.12, -0.33, "#468cbc");
  word(m, "大岡山北口店", l + 0.74 * (r - l), r - 0.16, 2.81, 2.91, -0.33, "#777a70");
  box(m, 1.02, r, 0.05, 2.5, -0.033, 0.18, "tile:#e7e8dd");
  box(m, l, l + 0.66, 0.045, 2.56, -0.034, 0.18, "tile:#e7e8dd");
  box(m, -0.72, r - 0.07, 2.25, 2.5, -0.129, 0.069, "#dec268");
  word(m, "三角チーズケーキ", -0.55, r - 0.35, 2.3, 2.44, -0.17, "#5e5033");
  for (let j = 0; j < 3; j++) {
    const x = l + 0.22 + j * 0.37;
    m.loft(
      [m.rect(x, -0.28, 0.06, 0.33, 0.44), m.rect(x, -0.28, 0.56, 0.33, 0.44), m.rect(x, -0.23, 0.83, 0.27, 0.28)],
      j === 2 ? "#bbceaa" : "#d3ddc7"
    );
    box(m, x - 0.103, x + 0.103, 0.57, 0.68, -0.462, 0.025, "#657265");
  }
  // The white aluminium sliding leaves carry advertisements, with a clear
  // pedestrian opening between them. The poster boxes stand off the glass.
  const gapL = L.entry - L.doorWidth / 2,
    gapR = L.entry + L.doorWidth / 2;
  for (const [a, b] of [
    [l + 0.74, gapL],
    [gapR, 0.97]
  ]) {
    if (b - a < 0.18) continue;
    glazing(m, a, b, 0.11, 2.32, -0.029, 2, "#c9ccc3", "#9eaca8", 1.89, "shopglass");
    for (let j = 0; j < 7; j++) {
      const x = a + 0.08 + ((j + 1) % 3) * (b - a - 0.21) * 0.36,
        z = 0.3 + Math.floor(j / 3) * 0.43 + (j % 2) * 0.08;
      const w = Math.min(0.235, (b - a) * 0.32);
      box(m, x, x + w, z, z + 0.27, -0.106, 0.012, ["#c3aba6", "#a4b58f", "#e1c793"][j % 3]);
      box(m, x + 0.02, x + w - 0.01, z + 0.19, z + 0.224, -0.116, 0.008, "#e1dfd1");
      m.oval(x + w * 0.52, -0.119, z + 0.12, w * 0.27, 0.009, 0.055, j % 2 ? "#cead57" : "#849668", 8, 5);
    }
  }
  const X = r + 0.09;
  box(m, X - 0.11, X + 0.03, 0.09, 5.48, 1.5, 3.17, "tile:#d4d6cc");
  box(m, X + 0.015, h - 0.06, 5.48, 5.61, 1.45, 3.18, "stucco:#858989");
  for (const z of [0.16, 1.44, 2.37, 3.02]) box(m, X - 0.034, X + 0.036, z, z + 0.054, -0.136, 0.075, "#656764");
  pipe(
    m,
    [
      [X, -0.148, 0.13],
      [X, -0.148, 3.07]
    ],
    0.033,
    "#535550"
  );
  box(m, gapL - 0.16, gapR + 0.26, 0.085, 0.106, -0.37, 0.64, "#777670");
  const x = r - 0.24;
  box(m, x - 0.23, x + 0.23, 0.13, 0.23, -0.53, 0.39, "#eeeade");
  pipe(
    m,
    [
      [x - 0.19, -0.54, 0.2],
      [x - 0.19, -0.54, 2.09],
      [x + 0.27, -0.54, 2.09]
    ],
    0.015,
    "#f3ead5"
  );
  box(m, x - 0.15, x + 0.26, 0.53, 2.03, -0.53, 0.031, "canvas:#e8be42");
  [..."三角チーズケーキ"].forEach((c, j) => {
    const z = 1.89 - j * 0.147;
    if (c === "ー") m.box(x + 0.046, -0.551, z + 0.012, 0.018, 0.022, 0.109, ink);
    else word(m, c, x - 0.047, x + 0.13, z, z + 0.13, -0.555, "#484137");
  });
  for (let j = 0; j < 3; j++) {
    const x = r - 0.85 + j * 0.26,
      c = ["#d1b994", "#cc9f8a", "#cd918f"][j];
    box(m, x, x + 0.246, 2.275, 2.492, -0.176, 0.039, c);
    m.face(
      [
        [x + 0.023, -0.203, 2.298],
        [x + 0.219, -0.203, 2.319],
        [x + 0.165, -0.203, 2.452]
      ],
      "#e9ce97",
      [0, -1, 0]
    );
  }
  const a = L.edge + 0.025,
    b = h - 0.025;
  for (let j = 0; j < 12; j++) {
    const z = 0.055 + 0.171 * (j + 1),
      y = -0.3 + j * 0.253;
    box(m, a, b, 0.055, z, y, 0.255, "#3c4145");
    box(m, a, b, z - 0.006, z + 0.012, y - 0.09, 0.067, "#a3a6a1");
  }
  for (const s of [a, b]) {
    const pts = [
      [s, -0.39, 0.17],
      [s, 2.6, 2.13],
      [s, 2.6, 2.86],
      [s, -0.39, 0.56]
    ];
    m.face(pts, "tile:#e6e6dd", [s === a ? -1 : 1, 0, 0]);
    pipe(
      m,
      [
        [s, -0.39, 0.57],
        [s, 2.6, 2.88]
      ],
      0.038,
      ivory
    );
  }
  const cheek = (x0, x1) => {
    const wall = (x) => [
      [x, -0.41, 0.07],
      [x, 2.69, 2.12],
      [x, 2.69, 2.83],
      [x, -0.41, 0.56]
    ];
    const q = wall(x0),
      v = wall(x1);
    m.face(q, "tile:#d5d8d2", [-1, 0, 0]);
    m.face(v, "tile:#eef0e9", [1, 0, 0]);
    m.face([q[3], v[3], v[2], q[2]], "#d8dcd6", [0, -1, 1]);
    m.face([q[0], v[0], v[3], q[3]], "tile:#d2d4c8", [0, -1, 0]);
  };
  cheek(b - 0.15, b + 0.025);
  threshold(m, l, h, 0.36, "stone:#b3b1a7");
}
function pharmacyFront(m, L) {
  const { half: h } = L,
    l = -h + 0.025,
    r = h - 0.025,
    w = r - l;
  box(m, l, r, 2.45, 6.7, -0.105, 0.24, "#e9e6d8");
  box(m, l + 0.044, r - 0.044, 5.1, 6.62, -0.254, 0.06, "#8eb99a");
  box(m, l + 0.044, r - 0.044, 5.1, 5.57, -0.294, 0.04, "#45694e");
  word(m, "大岡山デンタル", l + w * 0.24, r - 0.15, 5.95, 6.37, -0.304, ivory);
  word(m, "クリニック", l + w * 0.45, r - 0.21, 5.67, 5.93, -0.304, ivory);
  word(m, "CT マイクロスコープ完備", l + 0.14, l + w * 0.69, 5.32, 5.48, -0.325, ivory);
  word(m, "こちら入口", l + w * 0.72, r - 0.12, 5.23, 5.48, -0.325, ivory);
  m.oval(l + w * 0.13, -0.304, 6.12, 0.2, 0.023, 0.2, "#e3edcd", 13, 6);
  box(m, l + 0.11, r - 0.11, 3.64, 4.98, -0.251, 0.058, "#d798ad");
  word(m, "処方せん", l + 0.37, r - 0.29, 3.86, 4.67, -0.29, "#f1dfc1");
  m.oval(l + w * 0.5, -0.315, 4.81, 0.105, 0.018, 0.052, "#5777a3", 10, 5);
  const xx = l + 0.46;
  box(m, xx - 0.115, xx + 0.115, 2.76, 3.24, -0.26, 0.061, "#b96683");
  box(m, xx - 0.23, xx + 0.23, 2.88, 3.11, -0.268, 0.064, "#c5708c");
  word(m, "ココカラファイン薬局", l + 0.85, r - 0.13, 2.86, 3.19, -0.271, "#4d4e74");
  word(m, "ココロ、カラダ、ゲンキ。", l + 1.32, r - 0.54, 2.59, 2.72, -0.271, "#69635c");
  const entry = L.entry;
  for (const [a, b] of [
    [l + 0.12, entry - 0.73],
    [entry + 0.73, r - 0.09]
  ]) {
    if (b - a < 0.25) continue;
    box(m, a, b, 0.17, 2.36, 0.043, 0.043, "frost:#d0d9ce");
    box(m, a, b, 1.02, 1.074, -0.001, 0.024, "#b8657d");
    word(m, "処方せん受付", a + 0.07, b - 0.07, 0.68, 0.91, -0.018, "#66576b");
  }
  threshold(m, l, r, 0.42, "stone:#a19087");
}
function coffeeFront(m, L) {
  const { half: h, edge } = L,
    l = -h + 0.02,
    r = edge - 0.075;
  box(m, l, r, 2.59, 3.83, -0.15, 0.41, "#222327");
  for (let j = 0; j < 5; j++) box(m, l, r, 3.03 + j * 0.165, 3.08 + j * 0.165, -0.4, 0.18, "#3d3940");
  const sl = l + 0.075,
    sr = r - 1.0;
  box(m, sl, sr, 3.0, 3.58, -0.51, 0.082, "#c5b79f");
  box(m, sl + 0.03, sr - 0.03, 3.035, 3.56, -0.566, 0.043, "lit:#8045aa");
  word(m, "KALDI", -0.72, 0.488, 3.131, 3.441, -0.595, "lit:#e9d89a", "lightItalic");
  word(m, "COFFEE", 0.52, 1.156, 3.272, 3.409, -0.595, "lit:#e8dba1", "lightItalic");
  word(m, "FARM", 0.529, 1.14, 3.11, 3.267, -0.595, "lit:#e8dba1", "lightItalic");
  box(m, 2.48, 2.92, 0.035, 3.84, -0.009, 0.15, "tile:#a59e96");
  box(m, 2.49, 2.9, 0.035, 0.33, -0.1, 0.34, "stone:#8a8374");
  canopy(m, l, r, 2.8, 0.69, "canvas:#252a32", 0.2);
  for (let i = 0; i < 3; i++) {
    const a = l + ((r - l) * (i + 0.09)) / 3,
      b = l + ((r - l) * (i + 0.9)) / 3;
    word(m, "KALDI COFFEE FARM", a, b, 2.481, 2.568, -0.728, "#cfb57c", "serif");
  }
  for (const x of [l + 0.35, l + 1.52, r - 0.39]) spots(m, x, x + 0.08, 3.96, -0.43, 1);
  box(m, 1.71, 2.56, 0.047, 0.145, -0.26, 0.66, "stone:#514b48");
  fabricCart(m, r - 0.24, -0.24);
  box(m, 0.79, 1.47, 0.18, 0.88, -0.26, 0.5, "timber:#ad815c");
  box(m, 0.83, 1.43, 0.88, 0.93, -0.24, 0.45, "#705740");
  box(m, 1.48, 1.91, 0.18, 0.67, -0.26, 0.49, "#443f46");
  for (let j = 0; j < 10; j++) {
    const x = 1.51 + (j % 3) * 0.12,
      y = -0.41 + Math.floor(j / 3) * 0.102,
      z = 0.65 + (j % 2) * 0.036;
    m.loft(
      [m.rect(x, y, z, 0.107, 0.075), m.rect(x, y, z + 0.16, 0.136, 0.094), m.rect(x, y, z + 0.229, 0.109, 0.051)],
      ["#dbb84d", "#e7ce71", "#d1a644"][j % 3]
    );
  }
  box(m, 1.52, 1.88, 0.25, 0.56, -0.527, 0.025, "#e4d9bd");
  box(m, 1.54, 1.85, 0.281, 0.49, -0.546, 0.014, "#534945");
  word(m, "SALE", 1.565, 1.82, 0.4, 0.47, -0.562, "#e9d8a1");
  box(m, -2.4, -1.95, 0.07, 0.44, -0.3, 0.52, "#49434b");
  const aisle = l + (r - l) * 0.33;
  for (let j = 0; j < 4; j++) {
    box(m, aisle - 0.66, aisle + 0.59, 0.459 + j * 0.3, 0.475 + j * 0.3, 0.512, 0.018, "lit:#ecd299");
    box(m, aisle - 0.68, aisle + 0.61, 0.46 + j * 0.3, 0.5 + j * 0.3, 0.73, 0.42, "timber:#9d7248");
    for (let k = 0; k < 8; k++) {
      const x = aisle - 0.59 + k * 0.151,
        z = 0.5 + j * 0.3;
      m.loft(
        [
          m.rect(x, 0.59, z, 0.129, 0.115),
          m.rect(x, 0.59, z + 0.14, 0.129, 0.115),
          m.rect(x, 0.59, z + 0.203, 0.1, 0.058)
        ],
        ["#ddbd70", "#b89455", "#b69e6f", "#927247"][(k + j) % 4]
      );
      box(m, x - 0.044, x + 0.045, z + 0.06, z + 0.104, 0.527, 0.008, "#ead6a2");
    }
  }
  for (let j = 0; j < 5; j++) {
    const x = l + 0.42 + ((r - l - 0.8) * j) / 4;
    box(m, x - 0.1, x + 0.1, 2.43, 2.47, 0.36, 0.35, "lit:#ffe5a4");
  }
  threshold(m, l, r, 0.45, "#645344");
}
function dentalFront(m, L) {
  const { half: h } = L;
  box(m, -h, h, 2.75, 3.65, -0.055, 0.18, "stone:#90888d");
  box(m, -h, -h + 0.42, 0.045, 2.79, -0.05, 0.26, "stone:#968f92");
  box(m, -0.83, -0.16, 0.045, 2.8, -0.09, 0.4, "stone:#948e92");
  shutter(m, -h + 0.45, -0.86, 0.08, 2.73, 0.24, "#bfbeb6");
  box(m, h - 0.34, h, 0.045, 2.8, -0.044, 0.27, "stone:#8c898c");
  box(m, 0.01, h - 0.34, 0.07, 2.75, 3.06, 0.13, "#4d4843");
  box(m, -0.15, h - 0.27, 2.72, 2.8, 1.32, 3.21, "#625d59");
  for (const x of [0.4, h - 0.61]) m.oval(x, 1.12, 2.696, 0.066, 0.063, 0.023, "lit:#e5d49b", 9, 5);
  // Both garage reveals and the parked folding chair are visible at the
  // oblique angle down the lane. The open bay continues behind the stone pier.
  for (const x of [-0.12, h - 0.38]) box(m, x - 0.05, x + 0.04, 0.035, 2.72, 1.6, 3.16, "stone:#626169");
  box(m, -0.09, h - 0.39, 0.051, 0.073, 1.49, 3.02, "road:#6b6967");
  box(m, -0.08, h - 0.32, 0.1, 2.72, 2.91, 0.18, "#4d494b");
  const x = 0.73,
    y = 0.81;
  for (const a of [-1, 1]) {
    pipe(
      m,
      [
        [x + a * 0.21, y - 0.13, 0.08],
        [x + a * 0.2, y + 0.21, 0.79]
      ],
      0.019,
      steel
    );
    pipe(
      m,
      [
        [x + a * 0.21, y + 0.31, 0.08],
        [x + a * 0.2, y - 0.08, 0.47]
      ],
      0.018,
      "#757a76"
    );
  }
  box(m, x - 0.24, x + 0.24, 0.4, 0.46, y, 0.41, "#8b8e88");
  box(m, x - 0.23, x + 0.23, 0.62, 0.85, y + 0.19, 0.055, "#cbc9bd");
  box(m, -0.96, -0.6, 1.1, 1.48, -0.119, 0.16, "#9ea1a0");
  pipe(
    m,
    [
      [-0.77, -0.057, 1.1],
      [-0.77, -0.057, 0.45],
      [-0.9, -0.057, 0.18]
    ],
    0.019,
    "#818981"
  );
  threshold(m, -h, h, 0.3, "stone:#89847f");
}
function ohshoFront(m, L) {
  const { half: h } = L,
    l = -h + 0.025,
    r = h - 0.025,
    w = r - l;
  box(m, l, r, 2.57, 3.72, -0.13, 0.37, black);
  box(m, l + 0.035, r - 0.035, 2.62, 3.67, -0.338, 0.055, "#f2ead9");
  // The red lozenge and two narrow curved outlines are solid-edged enamel panels.
  const band = (left, right, y, col) => {
    const coords = [
      [left + 0.16, 2.66],
      [right - 0.22, 2.66],
      [right - 0.05, 2.79],
      [right + 0.01, 3.11],
      [right - 0.04, 3.41],
      [right - 0.18, 3.64],
      [left + 0.17, 3.64],
      [left + 0.02, 3.41],
      [left - 0.02, 3.1],
      [left + 0.01, 2.82]
    ];
    m.face(
      coords.map(([x, z]) => [x, y, z]),
      col,
      [0, -1, 0]
    );
  };
  band(l + w * 0.12, r - w * 0.18, -0.379, "#b3a541");
  band(l + w * 0.132, r - w * 0.193, -0.392, "#ad3d3e");
  word(m, "王将", l + w * 0.23, r - w * 0.244, 2.75, 3.56, -0.408, "#f3e8d8", "serif");
  word(m, "餃子の", l + 0.1, l + w * 0.159, 3.08, 3.35, -0.395, "#9e3f37");
  word(m, "大岡山店", r - w * 0.155, r - 0.09, 2.73, 2.91, -0.385, "#964b3f");
  canopy(m, l, r, 2.56, 0.62, "canvas:#963b42", 0.16);
  spots(m, l, r, 2.42, -0.38, 6);
  for (const [a, b] of L.glass) {
    if (b - a < 0.43) continue;
    box(m, a, b, 0.098, 0.8, 0.033, 0.07, "#2f3031");
    const x = a + (b - a) * 0.5;
    if (b - a > 1) tray(m, x - 0.27, x + 0.27, 0.77, 1.64, -0.02, 1, 2, false, "gyoza");
  }
  threshold(m, l, r, 0.49, "stone:#a49686");
}
function drugFront(m, L) {
  const { half: h } = L;
  for (const f of L.fixtures.filter((f) => f.kind === "wireRack")) drugRack(m, f.x, f.y, f.d);
  for (let i = 0; i < 4; i++)
    box(m, -h + 0.36 + i * 1.95, -h + 0.41 + i * 1.95, 2.76, 2.8, 1.42, 2.94, "lit:#fff7dd");
  box(m, -h, h, 2.45, 3.69, -0.11, 0.29, "#e5e4d8");
  box(m, -h + 0.045, h - 0.045, 2.52, 3.62, -0.286, 0.046, "lit:#ece8d6");
  box(m, -h + 0.1, -h * 0.63, 2.87, 3.31, -0.323, 0.026, "#b95974");
  box(m, h * 0.47, h - 0.1, 2.87, 3.31, -0.323, 0.026, "#b95974");
  word(m, "ココカラファイン", -h * 0.58, h * 0.44, 2.83, 3.25, -0.328, "#49517c");
  word(m, "大岡山店", h * 0.55, h * 0.82, 2.91, 3.01, -0.347, "#f3e0d4");
  canopy(m, -h, h, 2.54, 0.9, "canvas:#414676", 0.17);
  word(m, "ココカラファイン", h * 0.36, h * 0.94, 2.26, 2.35, -0.938, "#e2dbc4");
}
function realtyFront(m, L) {
  const h = L.half;
  box(m, -h + 0.03, h - 0.02, 2.6, 3.48, -0.141, 0.27, "#9fbfc0");
  box(m, -h + 0.06, h - 0.06, 2.66, 3.42, -0.292, 0.052, "#b8d6d2");
  word(m, "ハウスコム", 0.06, h - 0.25, 2.84, 3.21, -0.326, "#e7d362");
  glazing(m, -h + 0.11, 0.26, 0.1, 2.46, 0.05, 2, "#a9aca3", "#c0bfb1", 1.97, "shopglass");
  box(m, -h + 0.24, -h + 1.01, 0.39, 1.52, -0.047, 0.034, "#94c0be");
  word(m, "大岡山店", -h + 0.34, -h + 0.35 + 0.51, 1.24, 1.35, -0.077, "#e9e5ca");
  for (let j = 0; j < 5; j++)
    box(m, -h + 0.36, -h + 0.91, 0.45 + j * 0.12, 0.465 + j * 0.12, -0.075, 0.012, "#e0dbbc");
  box(m, -h + 0.12, h - 0.12, 2.47, 2.51, 0.84, 1.66, "lit:#f2dfad");
  threshold(m, -h, h, 0.47, "tile:#c5bcb1");
}
function oliveFront(m, L) {
  const h = L.half,
    l = -h + 0.03,
    r = h - 0.03;
  box(m, l, r, 2.47, 3.52, -0.14, 0.3, "#49474a");
  box(m, l + 0.025, r - 0.025, 2.54, 3.45, -0.307, 0.055, "#504b4d");
  box(m, l + 0.13, l + 0.77, 2.7, 3.26, -0.347, 0.04, "lit:#efdfcf");
  word(m, "bb.q", l + 0.18, l + 0.72, 2.84, 3.12, -0.378, "#b7564f");
  word(m, "OLIVE", l + 0.88, r - 0.74, 3.06, 3.31, -0.365, ivory);
  word(m, "CHICKEN", l + 0.87, r - 0.63, 2.73, 3.02, -0.365, ivory);
  word(m, "café", r - 0.66, r - 0.085, 2.81, 3.0, -0.364, "#c0705b", "serif");
  canopy(m, l, r, 2.52, 0.74, "canvas:#586784", 0.18);
  glazing(m, l + 0.17, 0.3, 0.16, 2.33, 0.01, 2, ink, "#9d9286", 0, "shopglass");
  box(m, l + 0.28, 0.14, 0.56, 1.34, -0.064, 0.039, "#8d6755");
  word(m, "クリスピーチキン", l + 0.35, 0.08, 0.95, 1.13, -0.092, ivory);
  box(m, l + 0.12, r - 0.12, 2.36, 2.44, 0.57, 0.98, "#d2b693");
}
function clothFront(m, L) {
  const h = L.half;
  box(m, -h, h, 2.57, 3.18, -0.115, 0.26, "stone:#a9a59b");
  word(m, "CONSTANTINOPLE", -h + 0.46, h - 0.28, 2.82, 3.02, -0.262, "#dfd9c8", "serif");
  canopy(m, -h + 0.12, h - 0.1, 2.61, 0.56, "canvas:#817d70", 0.12);
  glazing(m, -h + 0.14, 0.2, 0.13, 2.45, 0.064, 2, ink, "#8d8c7b", 0, "shopglass");
  for (let i = 0; i < 3; i++) {
    const x = -h + 0.44 + i * 1.45;
    pipe(
      m,
      [
        [x, 0.44, 2.81],
        [x, 0.44, 2.32]
      ],
      0.012,
      steel
    );
    m.oval(x, 0.44, 2.22, 0.162, 0.16, 0.105, "lit:#f6d28d", 11, 7);
  }
  const x = -h + 0.84;
  for (const y of [-1.81, 0.02]) {
    pipe(
      m,
      [
        [x, y, 0.09],
        [x, y, 1.35]
      ],
      0.019,
      steel
    );
    pipe(
      m,
      [
        [x - 0.23, y, 0.15],
        [x + 0.23, y, 0.15]
      ],
      0.019,
      steel
    );
  }
  pipe(
    m,
    [
      [x, -1.84, 1.35],
      [x, 0.04, 1.35]
    ],
    0.021,
    steel
  );
  for (let k = 0; k < 20; k++) {
    const y = -1.79 + k * 0.088,
      c = ["#765961", "#727f9e", "#b3ac78", "#afaba3", "#4d515d"][k % 5];
    m.loft(
      [
        m.rect(x, y, 0.4 + (k % 3) * 0.055, 0.37, 0.053),
        m.rect(x, y, 0.97, 0.36, 0.07),
        m.rect(x, y, 1.21, 0.29, 0.067),
        m.rect(x, y, 1.25, 0.115, 0.042)
      ],
      c
    );
    pipe(
      m,
      [
        [x - 0.16, y, 1.17],
        [x, y, 1.34],
        [x + 0.16, y, 1.17]
      ],
      0.007,
      ink
    );
  }
}
export function filmedFront(m, shop, L) {
  switch (shop.id) {
    case "housecom":
      realtyFront(m, L);
      break;
    case "olive":
      oliveFront(m, L);
      break;
    case "constant":
      clothFront(m, L);
      break;
    case "kaldi":
      coffeeFront(m, L);
      break;
    case "cocoichi":
      curryFront(m, L);
      break;
    case "familynorth":
      northFront(m, L);
      break;
    case "basanta":
      kebabCounter(m, L);
      break;
    case "kamio":
      dentalFront(m, L);
      break;
    case "ohsho":
      ohshoFront(m, L);
      break;
    case "cocopharmacy":
      pharmacyFront(m, L);
      break;
    case "coco":
      drugFront(m, L);
      break;
    case "shibata": {
      const h = L.half;
      box(m, -h, h, 2.55, 2.77, -0.12, 0.26, "#a7a6a0");
      box(m, -h + 0.22, -h + 1.29, 0.14, 2.56, -0.037, 0.16, "#c2c2b8");
      glazing(m, -h + 1.35, -h + 2.34, 0.16, 2.4, -0.069, 1, "#595c59", "#6b726f", 0, "shopglass");
      box(m, -h + 1.29, -0.05, 2.13, 2.47, -0.124, 0.16, "#e4e2d8");
      word(m, "M  HAIR", -h + 1.6, -0.34, 2.2, 2.36, -0.218, "#64746f");
      box(m, -1.15, -0.12, 0.08, 2.08, 0.61, 0.16, "#484a46");
      glazing(m, 0.24, h - 0.24, 0.13, 2.47, -0.073, 3, "#80827a", "#8d938d", 1.78, "shopglass");
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) {
          const x = 0.55 + j * 0.5,
            z = 0.39 + k * 0.34;
          box(m, x - 0.2, x + 0.2, z, z + 0.27, -0.101, 0.021, "#d9e2da");
          box(m, x - 0.18, x + 0.18, z + 0.21, z + 0.265, -0.124, 0.011, "#5787a5");
          box(m, x - 0.11, x + 0.08, z + 0.054, z + 0.16, -0.127, 0.012, "#a9b4ac");
        }
      box(m, h - 0.94, h - 0.31, 0.5, 1.48, -0.116, 0.018, "#d3d2c3");
      for (let j = 0; j < 4; j++)
        box(m, h - 0.87, h - 0.35, 0.56 + j * 0.203, 0.6 + j * 0.203, -0.131, 0.012, "#7093a7");
      break;
    }
    default:
      return false;
  }
  return true;
}
export function filmedBlade(m, shop, L) {
  // Projecting boxes read in both directions. All brackets connect to the wall.
  const styles = {
    ohsho: [L.half - 0.16, 3.65, 1.76, 0.72, "#a53f39", "王将"],
    basanta: [-L.half + 0.02, 3.31, 1.48, 0.66, "#e5dfc9", "BASANTA"],
    kamio: [-L.half + 0.15, 3.54, 1.61, 0.48, "#498858", "神尾歯科医院"],
    familynorth: [-L.half + 0.12, 3.63, 0.96, 0.88, "#f3f1e5", "FamilyMart"]
  };
  const def = styles[shop.id];
  if (!def) return;
  const [x, b, h, d, col, text] = def,
    y = -d * 0.61;
  for (const z of [b + 0.14, b + h - 0.12]) box(m, x - 0.056, x + 0.056, z, z + 0.065, -0.19, 0.55, black);
  m.box(x, y, b, 0.125, d, h, "#5d5b59");
  for (const side of [1, -1]) {
    const first = m.v.length,
      l = -d / 2 + 0.018,
      r = d / 2 - 0.018;
    box(m, l, r, b + 0.024, b + h - 0.025, -0.083, 0.029, col);
    if (shop.id === "ohsho") {
      box(m, l, r, b + h * 0.55, b + h - 0.025, -0.105, 0.016, "#efe8d7");
      [..."餃子の"].forEach((s, i) =>
        word(
          m,
          s,
          l + (r - l) * 0.32,
          r - (r - l) * 0.32,
          b + h * (0.85 - 0.13 * i),
          b + h * (0.96 - 0.13 * i),
          -0.12,
          "#a04139",
          "serif"
        )
      );
      [...text].forEach((s, i) =>
        word(m, s, l + 0.1, r - 0.1, b + h * (0.32 - 0.23 * i), b + h * (0.52 - 0.23 * i), -0.12, ivory, "serif")
      );
    } else if (shop.id === "familynorth") {
      box(m, l, r, b + h * 0.71, b + h - 0.04, -0.104, 0.017, "#7fc154");
      box(m, l, r, b + 0.055, b + h * 0.26, -0.104, 0.017, "#589ac1");
      word(m, text, l + 0.04, r - 0.04, b + h * 0.41, b + h * 0.59, -0.113, "#4788b1");
      word(m, "酒 たばこ", l + 0.035, r - 0.036, b + 0.08, b + 0.18, -0.117, ivory);
    } else if (shop.id === "kamio") {
      [...text].forEach((s, i) =>
        word(m, s, l + 0.067, r - 0.067, b + h - (i + 1) * 0.242 - 0.01, b + h - i * 0.242 - 0.05, -0.108, ivory)
      );
    } else {
      word(m, "kebab", l + 0.07, r - 0.07, b + h * 0.66, b + h * 0.82, -0.111, "#655f50", "serif");
      word(m, text, l + 0.05, r - 0.05, b + h * 0.23, b + h * 0.34, -0.11, "#706c5f");
    }
    for (let i = first; i < m.v.length; i += 10) {
      const u = m.v[i],
        v = m.v[i + 1],
        nx = m.v[i + 3],
        ny = m.v[i + 4];
      m.v[i] = x - side * v;
      m.v[i + 1] = y + side * u;
      m.v[i + 3] = -side * ny;
      m.v[i + 4] = side * nx;
    }
  }
}
