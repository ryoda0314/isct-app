import { MarketModel } from "./campus3dMarketGeometry.js";
import { STREET_SHOPS } from "./campus3dStreetCatalog.js";
import { retailKinds, foodKinds, shopLayout } from "./campus3dStreetLayout.js";
import { streetFurnitureModel } from "./campus3dStreetFurniture.js";
import { avenueFixtures } from "./campus3dAvenueFixtures.js";
import { filmedUpper, filmedFront, filmedBlade } from "./campus3dStreetElevations.js";

const metal = "#a8aca7",
  iron = "#434644",
  chalk = "#eeeadf",
  wood = "#9c7654",
  glass = "#81908d";
const cache = new Map();

// The shop meshes are drawn in metres. Pack them into the same instanced format
// as the station fittings, retaining the correct normals under non-uniform scaling.
function normalize(m, w, d, h, offsetY = 0) {
  for (let i = 0; i < m.v.length; i += 10) {
    m.v[i] /= w;
    m.v[i + 1] = (m.v[i + 1] - offsetY) / d;
    m.v[i + 2] /= h;
    const x = m.v[i + 3] * w,
      y = m.v[i + 4] * d,
      z = m.v[i + 5] * h,
      n = Math.hypot(x, y, z) || 1;
    m.v[i + 3] = x / n;
    m.v[i + 4] = y / n;
    m.v[i + 5] = z / n;
  }
}

function lettering(m, word, x, y, z, w, h, col) {
  if (word && w > 0.07) m.text(word, x, y, z, w, h, col, m.detail ? 0.009 : 0.005);
}
function pane(m, x, y, z, w, h, frame, transparent = false) {
  if (w < 0.14 || h < 0.14) return;
  const border = 0.052;
  m.box(x - w / 2 + border / 2, y, z, border, 0.12, h, frame);
  m.box(x + w / 2 - border / 2, y, z, border, 0.12, h, frame);
  m.box(x, y, z, w - border * 2, 0.12, border, frame);
  m.box(x, y, z + h - border, w - border * 2, 0.12, border, frame);
  if (transparent)
    m.windowPane(x - w / 2 + border, x + w / 2 - border, z + border, z + h - border, y + 0.017, glass);
  else m.box(x, y + 0.017, z + border, w - border * 2, 0.021, h - border * 2, "glass:" + glass);
}
function awning(m, l, r, base, reach, color, stripes = false) {
  const n = stripes ? Math.max(4, Math.round((r - l) / 0.32)) : 1,
    fold = base - 0.23;
  for (let i = 0; i < n; i++) {
    const a = l + ((r - l) * i) / n,
      b = l + ((r - l) * (i + 1)) / n,
      col = stripes && i % 2 ? chalk : color;
    m.face(
      [
        [a, -0.02, base],
        [b, -0.02, base],
        [b, -reach, fold],
        [a, -reach, fold]
      ],
      col,
      [0, -1, 1]
    );
    m.box((a + b) / 2, -reach, fold - 0.13, b - a, 0.045, 0.13, col);
  }
  for (const x of [l + 0.09, r - 0.09])
    m.tube(
      [
        [x, -0.04, base - 0.52],
        [x, -reach, fold + 0.005]
      ],
      0.022,
      metal,
      5
    );
}
function blade(m, x, h, shop) {
  // A projecting, double-sided light box. The lettering on each side reads the
  // right way round from the corresponding end of the street.
  const vertical = ["ohsho", "kohikan", "cocopharmacy", "sundrug"].includes(shop.id);
  const depth = vertical ? 0.69 : 0.74,
    tall = shop.id === "sundrug" ? 2.11 : vertical ? 1.43 : 0.63,
    y = -0.61;
  m.box(x, -0.21, h + tall - 0.13, 0.084, 0.53, 0.085, iron);
  m.box(x, y, h, 0.135, depth, tall, iron);
  for (const side of [-1, 1]) {
    m.box(
      x + side * 0.076,
      y,
      h + 0.026,
      0.018,
      depth - 0.04,
      tall - 0.052,
      shop.id === "sundrug" ? "#b83b36" : shop.band
    );
    if (shop.kind === "convenience") {
      m.box(x + side * 0.091, y, h + tall * 0.73, 0.02, depth - 0.05, tall * 0.22, "#79ba53");
      m.box(x + side * 0.091, y, h + tall * 0.07, 0.02, depth - 0.05, tall * 0.115, "#4c9cc6");
    }
    if (shop.id === "sundrug") m.box(x + side * 0.089, y, h + 0.03, 0.024, depth - 0.05, 0.27, "#edc34c");
    const glyphs = vertical
      ? [
          ...(shop.id === "cocopharmacy"
            ? "処方せん"
            : shop.id === "sundrug"
              ? "サンドラッグ"
              : shop.id === "ohsho"
                ? "王将"
                : shop.title)
        ]
      : [shop.title];
    for (const [i, word] of glyphs.entries()) {
      const z = vertical
          ? h + tall - ((i + 0.86) * (tall - (shop.id === "sundrug" ? 0.31 : 0))) / glyphs.length
          : h + 0.215,
        from = m.v.length;
      lettering(
        m,
        word,
        0,
        -0.02,
        z,
        depth - 0.12,
        Math.min(0.28, (tall / glyphs.length) * 0.64),
        shop.id === "sundrug" ? chalk : shop.ink
      );
      for (let j = from; j < m.v.length; j += 10) {
        const u = m.v[j],
          v = m.v[j + 1],
          nx = m.v[j + 3],
          ny = m.v[j + 4];
        m.v[j] = x + side * (0.077 - v);
        m.v[j + 1] = y + side * u;
        m.v[j + 3] = -side * ny;
        m.v[j + 4] = side * nx;
      }
    }
  }
}

function upperStories(m, shop, layout, height) {
  if (filmedUpper(m, shop, layout, height)) return;
  const { half, span } = layout,
    w = half * 2,
    stories = Math.max(1, Math.round((height - 3.7) / 3));
  const hash = [...shop.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const ribbon = ["kaldi", "housecom", "kamio", "coco", "constant", "cocoichi", "livable", "hidakaya"].includes(
    shop.id
  );
  const balcony = shop.kind === "convenience" || hash % 7 === 0;
  const coat =
    shop.id === "familysouth"
      ? "tile:#d9be78"
      : shop.id === "ongaku"
        ? "stucco:#b6afa3"
        : shop.id === "cando"
          ? "brick:#c59e84"
          : shop.kind === "realty" || shop.kind === "clinic"
            ? "stone:" + shop.wall
            : "stucco:" + shop.wall;
  m.box(0, -0.034, 3.12, w, 0.047, height - 3.12, coat);
  // Horizontal siding on Ongaku-do and the small ceramic tiles of the corner buildings.
  if (
    m.detail &&
    ["ongaku", "familysouth", "familynorth", "cocoichi", "coco", "constant", "cando", "kaldi"].includes(shop.id)
  ) {
    const pitch = shop.id === "ongaku" ? 0.225 : 0.115;
    const joint = {
      ongaku: "#948b78",
      familysouth: "#ac9c76",
      familynorth: "#c4c6bf",
      cocoichi: "#8c695b",
      coco: "#b5b1a4",
      constant: "#b5b1a4",
      cando: "#a99785",
      kaldi: "#9d968a"
    }[shop.id];
    for (let j = 0, zz = 3.24; zz < height - 0.16; j++, zz += pitch) {
      m.box(0, -0.011, zz, w - 0.035, 0.022, 0.012, joint);
      if (shop.id === "ongaku") continue;
      for (let xx = -half + 0.14 + (j % 2) * 0.17; xx < half - 0.05; xx += 0.34)
        m.box(xx, -0.012, zz, 0.012, 0.021, pitch, joint);
    }
  }
  for (let k = 0; k < stories; k++) {
    const floor = 3.66 + k * 3,
      z = floor + 0.48;
    if (shop.id === "familysouth") {
      const n = Math.max(1, Math.round(w / 2.75)),
        bay = w / n;
      for (let i = 0; i < n; i++) {
        const x = -half + (i + 0.5) * bay,
          rw = Math.min(2.0, bay * 0.77);
        pane(m, x, -0.108, z, rw, 1.43, metal);
        m.box(x, -0.14, z, 0.049, 0.063, 1.42, metal);
        const rail = [];
        for (let j = 0; j <= 8; j++) {
          const u = j / 8,
            d = 0.14 + 0.3 * Math.sin(u * Math.PI);
          const xx = x + (u - 0.5) * rw * 1.1;
          rail.push([xx, -d, z + 0.36]);
          m.tube(
            [
              [xx, -0.13, z - 0.08],
              [xx, -d - 0.045, z + 0.05],
              [xx, -d, z + 0.36]
            ],
            0.021,
            "#dedcce",
            5
          );
        }
        m.tube(rail, 0.031, "#dedcce", 6);
        m.box(x, -0.14, z + 1.45, rw + 0.15, 0.27, 0.09, "#e2d6b3");
      }
    } else if (ribbon || (k === 0 && shop.id === "matsuyaelec")) {
      m.box(0, -0.038, z - 0.07, w - 0.22, 0.09, 1.91, iron);
      const n = Math.max(2, Math.round(w / 1.5)),
        bw = (w - 0.32) / n;
      for (let j = 0; j < n; j++) pane(m, -half + 0.16 + (j + 0.5) * bw, -0.108, z, bw - 0.026, 1.72, metal);
    } else {
      const n = Math.max(1, Math.floor(w / (balcony ? 2.75 : 2.25))),
        bay = w / n;
      for (let j = 0; j < n; j++) {
        const x = (j + 0.5) * bay - half,
          bw = Math.min(bay * 0.7, 1.83);
        pane(m, x, -0.085, z, bw, 1.34, k % 2 === 1 ? metal : iron);
        m.box(x, -0.113, z + 0.07, 0.038, 0.06, 1.23, metal);
        m.box(x, -0.115, z - 0.067, bw + 0.09, 0.235, 0.075, shop.wall);
        if (m.detail && (j + k + hash) % 3 === 0) {
          for (let slat = 0; slat < 5; slat++)
            m.box(x - bw * 0.235, -0.124, z + 0.69 + slat * 0.1, bw * 0.408, 0.014, 0.044, "#b4b4a7");
        }
        if (balcony && (j + k) % 2 === 0) {
          m.box(x, -0.28, z - 0.2, bw + 0.26, 0.58, 0.13, shop.wall);
          m.tube(
            [
              [x - bw * 0.54, -0.53, z + 0.7],
              [x + bw * 0.54, -0.53, z + 0.7]
            ],
            0.023,
            metal,
            5
          );
          for (let s = 0; s <= 6; s++) m.box(x + bw * (s / 6 - 0.5), -0.52, z - 0.075, 0.022, 0.031, 0.77, metal);
        }
      }
    }
    if (hash % 3 === 0 || ribbon) m.box(0, -0.052, floor - 0.13, w, 0.13, 0.095, shop.wall);
  }
  m.box(0, -0.033, height - 0.115, w + 0.045, 0.19, 0.135, shop.wall);
  if (m.detail && w > 4.5) {
    const x = half - 0.53,
      top = height - 0.45;
    m.box(x, -0.03, top - 0.52, 0.7, 0.37, 0.48, "#bcbab0");
    for (let j = 0; j < 7; j++) m.box(x, -0.225, top - 0.45 + j * 0.042, 0.46, 0.017, 0.015, "#767b78");
    m.tube(
      [
        [x + 0.4, -0.09, top - 0.13],
        [x + 0.47, -0.1, top - 0.28],
        [x + 0.47, -0.1, top - 0.77]
      ],
      0.026,
      metal,
      5
    );
  }
  if (shop.id === "kamio") {
    lettering(m, "神尾歯科医院", 0, -0.191, 4.4, w - 0.38, 0.45, "#8bb76b");
  } else if (shop.id === "kaldi" || shop.id === "housecom") {
    const letters = shop.id === "kaldi" ? ["明", "光", "義", "塾"] : ["大", "岡", "山", "教", "室"];
    const panel = Math.min(w - 0.26, 5.4),
      cw = panel / letters.length;
    m.box(0, -0.2, 4.28, panel, 0.11, 0.77, "#414b88");
    letters.forEach((s, j) => {
      const x = (j + 0.5) * cw - panel / 2;
      m.box(x, -0.267, 4.35, cw - 0.07, 0.036, 0.62, "#e0c14b");
      lettering(m, s, x, -0.289, 4.45, cw - 0.13, 0.38, "#415189");
    });
  } else if (shop.id === "cocoichi") {
    m.box(0, -0.121, 4.13, w - 0.22, 0.15, 0.58, "#587383");
    lettering(m, "大岡山教室", 0, -0.206, 4.22, w - 0.46, 0.31, "#efede0");
  } else if (shop.id === "cocopharmacy" && span > 2) {
    m.box(0, -0.115, 3.3, w - 0.13, 0.18, 1.3, "#cf849a");
    lettering(m, "処方せん", 0, -0.215, 3.52, w - 0.3, 0.63, chalk);
    m.box(0, -0.122, 4.69, w - 0.12, 0.18, 1.08, "#669b79");
    lettering(m, "大岡山デンタル", 0, -0.222, 5.16, w - 0.28, 0.32, chalk);
    lettering(m, "クリニック", 0, -0.222, 4.8, w - 0.28, 0.25, chalk);
  } else if (shop.id === "shibata") {
    for (const [i, s] of ["Pilates Mirror", "大岡山クリニック", "デンタル"].entries()) {
      const z = 4.41 + 3 * i;
      m.box(0, -0.17, z, w * 0.64, 0.21, 0.82, i === 2 ? "#a27d51" : "#e5e1d1");
      lettering(m, s, 0, -0.287, z + 0.19, w * 0.57, 0.32, i === 2 ? chalk : "#766e65");
    }
  }
}

function cornerReturn(m, shop, L) {
  const { half } = L,
    w = 2 * half;
  m.box(0, -0.081, 0.08, w - 0.03, 0.158, 2.47, shop.id === "familysouth" ? "#d4ccac" : "#b6b1a3");
  const count = Math.max(1, Math.round(w / 1.45)),
    bay = w / count;
  for (let j = 0; j < count; j++) {
    const x = (j + 0.5) * bay - half;
    pane(m, x, -0.19, 0.35, bay - 0.09, 1.99, shop.id === "matsuyaelec" ? chalk : metal);
    if (j % 3 !== 0)
      m.box(x, -0.213, 0.56, bay * 0.54, 0.018, 1.49, shop.id === "familysouth" ? "#c4d0b6" : "#bfbcae");
  }
  m.box(0, -0.111, 2.56, w, 0.31, 0.65, shop.band);
  if (shop.kind === "convenience") {
    m.box(0, -0.28, 3.065, w, 0.028, 0.14, "#78bc4f");
    m.box(0, -0.28, 2.575, w, 0.028, 0.057, "#4a9ac4");
  }
  if (w > 2.3) lettering(m, shop.title, 0, -0.282, 2.72, w - 0.34, 0.31, shop.ink);
}

function shopDetails(m, shop, L) {
  const { half, edge, span, center } = L;
  if (["basanta", "cocopharmacy", "familynorth", "kamio"].includes(shop.id)) return;
  if (shop.id === "kaldi") {
    for (let j = 0; j < 4; j++) m.box(center, -0.215, 3.21 + j * 0.092, span, 0.32, 0.051, "#32322e");
    // Roasted coffee in timber bins, with visible beans and individual name cards.
    m.turned(
      edge - 0.46,
      -0.12,
      [
        [0.04, 0.31],
        [0.17, 0.35],
        [0.64, 0.385],
        [0.84, 0.343]
      ],
      "#916f4b",
      14
    );
    for (const z of [0.19, 0.68])
      m.turned(
        edge - 0.46,
        -0.12,
        [
          [z, 0.375],
          [z + 0.044, 0.375]
        ],
        "#454642",
        14
      );
    m.oval(edge - 0.46, -0.12, 0.83, 0.309, 0.298, 0.049, "#584332", 14, 5);
    for (let j = 0; j < 15; j++) {
      const a = j * 2.4,
        r = 0.064 * Math.sqrt(j);
      m.oval(
        edge - 0.46 + Math.cos(a) * r,
        -0.12 + Math.sin(a) * r,
        0.868,
        0.034,
        0.026,
        0.019,
        j % 2 ? "#584333" : "#795a3e",
        6,
        4
      );
    }
    m.box(edge - 0.43, 0.034, 0.85, 0.24, 0.039, 0.14, "#e7d8a7");
    for (let j = 0; j < 3; j++) m.box(center, 1.12 + j * 0.83, 2.91, span * 0.88, 0.042, 0.045, "lit:#ffe3a4");
    for (const x of [-half + 0.19, edge - 0.19]) {
      for (let j = 0; j < 3; j++) m.box(x, 1.45, 0.75 + j * 0.58, 0.24, 2.27, 0.075, wood);
    }
    if (m.detail) {
      for (let x = -half + 0.13; x < edge - 0.05; x += 0.145) m.box(x, 1.62, 0.065, 0.014, 3.14, 0.006, "#755c43");
      for (let j = 0; j < 4; j++) {
        const x = -half + ((j + 0.5) * span) / 4;
        m.box(x, 2.73, 2.49, Math.min(0.54, span * 0.22), 0.09, 0.2, "#795335");
        m.box(x, 2.67, 2.57, Math.min(0.32, span * 0.13), 0.02, 0.033, "#dfcb95");
      }
    }
  } else if (shop.id === "ohsho" || shop.id === "cocoichi" || shop.id === "daigen" || shop.id === "hidakaya") {
    for (let i = 0; i < Math.max(3, Math.round(span / 0.52)); i++) {
      const x = -half + 0.26 + (i * (span - 0.44)) / Math.max(2, Math.round(span / 0.52) - 1);
      m.turned(
        x,
        -0.27,
        [
          [2.43, 0.044],
          [2.48, 0.079],
          [2.52, 0.052]
        ],
        "#665d50",
        7
      );
      m.oval(x, -0.272, 2.426, 0.058, 0.057, 0.024, "lit:#fff1cd", 7, 4);
    }
    m.box(center, 3.08, 1.2, span - 0.21, 0.145, 0.81, "#89674c");
    const n = Math.max(3, Math.min(13, Math.floor(span / 0.53)));
    for (let i = 0; i < n; i++) {
      const x = center + ((i + 0.5 - n / 2) * (span - 0.36)) / n;
      m.box(x, 2.99, 1.39, ((span - 0.36) / n) * 0.86, 0.035, 0.44, "#eee0b8");
      m.oval(x, 2.987, 1.615, Math.min(0.16, (span / n) * 0.29), 0.036, 0.103, "#bf8549", 9, 5);
      m.box(x, 2.959, 1.43, 0.11, 0.01, 0.021, "#6b4939");
    }
    for (let i = 0; i < Math.max(2, Math.floor(span / 1.0)); i++) {
      const x = center - span * 0.33 + i * 0.83;
      if (Math.abs(x - L.entry) < 0.57) continue;
      m.turned(
        x,
        1.98,
        [
          [0.025, 0.16],
          [0.06, 0.16],
          [0.1, 0.04],
          [0.57, 0.04],
          [0.6, 0.21],
          [0.68, 0.2]
        ],
        shop.id === "ohsho" ? "#964a3f" : "#795b49",
        9
      );
    }
    if (shop.id === "daigen" || shop.id === "hidakaya") {
      for (let j = 0; j < 3; j++)
        m.box(
          L.entry + (j - 1) * 0.35,
          0.2,
          1.85,
          0.33,
          0.037,
          0.41,
          shop.id === "daigen" ? "#973f34" : "#304955"
        );
    }
  } else if (shop.kind === "convenience") {
    const x = -half + 0.71,
      depth = shop.id === "familysouth" ? -0.28 : -0.18;
    for (let i = 0; i < 3; i++) {
      m.box(x, depth, i * 0.191 + 0.045, 0.67, 0.4, 0.165, i % 2 ? "#57876b" : "#547aa8");
      for (let j = 0; j < 5; j++)
        m.box(x - 0.24 + j * 0.122, depth - 0.206, i * 0.191 + 0.12, 0.074, 0.012, 0.051, "#445961");
    }
    for (const [l, r] of L.glass) {
      for (const [z, c] of [
        [1.04, "#69a75c"],
        [0.99, "#568eae"]
      ])
        m.box((l + r) / 2, 0.08, z, r - l, 0.017, 0.027, c);
      if (r - l > 1.0) {
        m.box((l + r) / 2, 0.075, 0.37, 0.44, 0.023, 0.48, "#f0ddb6");
        m.box((l + r) / 2, 0.061, 0.69, 0.35, 0.01, 0.067, "#b8704d");
      }
    }
    if (shop.id === "familynorth") {
      m.box(center, 0.028, 2.11, span - 0.09, 0.027, 0.22, "#e4bc69");
      if (span > 4)
        for (let j = 0; j < 2; j++) {
          const bx = -half + 0.33 + j * 0.43;
          m.loft(
            [
              m.rect(bx, -0.13, 0.02, 0.38, 0.38),
              m.rect(bx, -0.13, 0.6, 0.37, 0.37),
              m.rect(bx, -0.16, 0.8, 0.31, 0.24)
            ],
            "#b7c9b1"
          );
          m.box(bx, -0.301, 0.555, 0.235, 0.027, 0.105, "#65796d");
        }
    }
  } else if (shop.id === "basanta") {
    m.box(center, 0.58, 0.87, span * 0.77, 0.58, 0.18, "#d8ccae");
    m.turned(
      center - 0.28,
      0.73,
      [
        [1.05, 0.13],
        [1.17, 0.26],
        [1.87, 0.19],
        [2.0, 0.083]
      ],
      "#a06b48",
      13
    );
    m.box(center - 0.28, 0.73, 1.0, 0.035, 0.035, 1.11, metal);
    lettering(m, "ORDER HERE", center, -0.234, 2.55, span - 0.34, 0.19, "#3e382d");
  } else if (shop.id === "sundrug" || shop.id === "coco" || shop.id === "cando") {
    const n = Math.max(3, Math.ceil(span / 1.6));
    for (let i = 0; i < n; i++) {
      const x = -half + 0.48 + ((span - 0.96) * (i + 0.5)) / n;
      m.box(x, 2.09, 2.49, 0.41, 0.06, 0.29, i % 2 ? "#cb6856" : "#e7cb66");
      m.box(x, 2.048, 2.56, 0.26, 0.014, 0.045, "#f8ecd3");
    }
    for (let j = 0; j < 3; j++) m.box(center, 0.48 + j * 0.97, 3.001, span - 0.28, 0.065, 0.045, "lit:#fff6dc");
  }
}

function retailFurniture(m, v, shop) {
  const { kind, x, y, w, d, h } = v;
  if (kind === "bin") {
    m.box(x, y, 0.025, w - 0.03, d - 0.03, h - 0.16, "#735130");
    for (let i = 0; i < 5; i++)
      m.box(
        x + ((i - 2) * w) / 5,
        y - d / 2,
        0.078,
        w / 5 - 0.008,
        0.038,
        h - 0.095,
        i % 2 ? "#ad8557" : "#a37b4c"
      );
    for (const side of [-1, 1]) m.box(x + side * w * 0.48, y, h - 0.17, 0.045, d, 0.165, wood);
    m.box(x, y + d * 0.47, h - 0.18, w, 0.047, 0.18, wood);
    m.box(x, y - d * 0.51, h - 0.19, w, 0.05, 0.13, "#a37e54");
  } else if (kind === "shutter") {
    m.box(x, y, 0.045, w, d, h, "#a39e90");
    for (let i = 0; i < h - 0.09; i += 0.105) m.box(x, y - d / 2 - 0.013, 0.09 + i, w, 0.032, 0.023, "#827e74");
    m.box(x, y - d / 2 - 0.02, 0.055, w, 0.06, 0.077, metal);
  } else if (kind === "shelf" || kind === "rack") {
    const levels = kind === "rack" ? 3 : shop.id === "kaldi" ? 6 : 4;
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        m.box(x + a * (w / 2 - 0.025), y + b * (d / 2 - 0.035), 0.1, 0.043, 0.042, h - 0.07, metal);
    if (kind === "shelf")
      m.box(x, y + d * 0.47, 0.16, w - 0.025, 0.035, h - 0.16, shop.id === "kaldi" ? wood : "#d6d4c6");
    for (let i = 0; i < levels; i++) {
      const z = 0.2 + (i * (h - 0.31)) / (levels - 1);
      m.box(x, y, z, w, d, 0.048, shop.id === "kaldi" ? wood : chalk);
      m.box(x, y - d / 2 - 0.012, z + 0.008, w, 0.034, 0.061, "#a5a796");
      if (m.detail)
        for (let j = 0; j < Math.ceil(w / 0.58); j++)
          m.box(x - w / 2 + 0.16 + j * 0.54, y - d / 2 - 0.032, z + 0.012, 0.12, 0.007, 0.045, "#f2e9b5");
    }
    if (kind === "rack")
      for (const s of [-1, 1]) m.oval(x + s * (w / 2 - 0.08), y, 0.077, 0.062, 0.056, 0.077, iron, 7, 4);
  } else if (kind === "counter" || kind === "desk" || kind === "listings") {
    m.box(x, y + 0.03, 0.05, w - 0.07, d - 0.09, h - 0.11, kind === "counter" ? "#aa876b" : "#b9af99");
    m.box(x, y, h - 0.08, w + 0.03, d + 0.06, 0.095, kind === "counter" ? "#574c42" : "#d7c8b3");
    if (kind === "listings") {
      const n = Math.max(2, Math.floor(w / 0.42));
      m.box(x, y + 0.27, h + 0.22, w - 0.12, 0.065, 0.99, "#777b70");
      for (let j = 0; j < n; j++)
        for (let k = 0; k < 2; k++)
          m.box(
            x - w * 0.47 + ((j + 0.5) * w * 0.94) / n,
            y + 0.228,
            h + 0.29 + k * 0.45,
            (w * 0.84) / n,
            0.012,
            0.38,
            k % 2 ? "#e8e4cf" : "#d2ded7"
          );
    }
    if (kind === "counter" && w > 1.5) {
      m.box(x + w * 0.27, y, h + 0.02, 0.32, 0.24, 0.06, iron);
      m.box(x + w * 0.27, y + 0.06, h + 0.06, 0.26, 0.085, 0.19, "#323a3d");
    }
  } else if (kind === "table") {
    m.box(x, y, h - 0.064, w, d, 0.068, wood);
    m.box(x, y, 0.04, 0.095, 0.095, h - 0.08, iron);
    for (const side of [-1, 1]) {
      m.turned(
        x + 0.02,
        y + side * (d * 0.48 + 0.16),
        [
          [0.025, 0.12],
          [0.06, 0.14],
          [0.42, 0.042],
          [0.44, 0.17],
          [0.49, 0.18]
        ],
        wood,
        9
      );
    }
  } else if (kind === "clothes") {
    for (const side of [-1, 1]) {
      const px = x + side * (w / 2 - 0.06);
      m.box(px, y, 0, 0.13, d, 0.06, metal);
      m.box(px, y, 0.055, 0.04, 0.05, h - 0.06, metal);
    }
    m.tube(
      [
        [x - w / 2 + 0.05, y, h],
        [x + w / 2 - 0.05, y, h]
      ],
      0.024,
      metal,
      6
    );
  } else if (kind === "salon") {
    m.box(x, y + 0.18, h - 0.8, w - 0.12, 0.12, 0.85, "#755f4f");
    m.box(x, y + 0.108, h - 0.75, w - 0.25, 0.021, 0.7, "#adbfba");
    m.box(x, y, 0.64, w - 0.12, 0.42, 0.085, wood);
    m.turned(
      x,
      y - 0.38,
      [
        [0.015, 0.18],
        [0.075, 0.2],
        [0.1, 0.05],
        [0.43, 0.05],
        [0.48, 0.24],
        [0.58, 0.25]
      ],
      iron,
      10
    );
    m.box(x, y - 0.49, 0.6, 0.49, 0.12, 0.37, "#6a594b");
  }
}

// Leave the measured display windows and their mullions to filmedFront.
function standardWindowBays(shop, layout) {
  const { glass, half, entry } = layout;
  switch (shop.id) {
    case "familynorth": return [];
    case "cocoichi": return glass.filter(([left]) => left < entry);
    case "housecom":
    case "olive":
    case "constant": return glass.filter(([left]) => left > entry);
    case "shibata": return [[-half + 2.34, 0.24, 0.16]];
    default: return glass;
  }
}
function signAndEntrance(m, shop, L) {
  const { half, edge, span, center, entry, open } = L,
    w = 2 * half;
  for (const x of [-half + 0.045, edge - 0.045]) m.box(x, 0.115, 0.04, 0.092, 0.4, 3.15, shop.wall);
  const coffee = shop.id === "kaldi";
  m.box(
    center,
    1.58,
    0.015,
    span - 0.07,
    3.25,
    0.048,
    coffee ? "#534132" : shop.id === "cocoichi" ? "#a57c64" : "#b7ab9c"
  );
  m.box(center, 1.6, 3.045, span - 0.07, 3.25, 0.075, coffee ? "#403832" : "#d2c9b7");
  m.box(
    center,
    3.19,
    0.08,
    span - 0.1,
    0.15,
    2.98,
    coffee ? "#68533e" : retailKinds.has(shop.kind) ? "#dad1bd" : "#baa995"
  );
  if (coffee)
    for (const side of [-1, 1])
      m.box(center + side * (span / 2 - 0.088), 1.63, 0.065, 0.085, 3.15, 2.94, "#594632");
  for (const [l, r, y] of standardWindowBays(shop, L)) {
    const pieces = Math.max(1, Math.ceil((r - l) / 1.55)),
      pw = (r - l) / pieces;
    for (let i = 0; i < pieces; i++)
      pane(
        m,
        l + (i + 0.5) * pw,
        y,
        0.085,
        pw,
        2.39,
        shop.id === "cocoichi" || foodKinds.has(shop.kind) ? iron : metal,
        true
      );
    if (shop.id === "ohsho" || shop.id === "cocoichi") {
      m.box((l + r) / 2, 0.063, 0.095, r - l, 0.047, 0.62, "#3e3a36");
      m.box((l + r) / 2, 0.046, 1.93, r - l, 0.079, 0.054, "#514c43");
    }
  }
  if (!open && shop.kind !== "shutter") {
    const dw = L.doorWidth;
    pane(m, entry, 0.21, 2.24, dw, 0.28, metal, true);
    m.box(entry + dw * 0.46, 0.28, 0.1, 0.046, 0.17, 2.12, metal);
    if (L.span > 3.25)
      m.tube(
        [
          [entry + dw * 0.47, 0.13, 0.79],
          [entry + dw * 0.47, 0.07, 0.85],
          [entry + dw * 0.47, 0.07, 1.14],
          [entry + dw * 0.47, 0.13, 1.18]
        ],
        0.016,
        iron,
        6
      );
  }
  if (L.hasStairs && shop.id !== "familynorth") {
    const sw = half - edge - 0.06,
      sx = edge + sw / 2 + 0.035;
    for (let i = 0; i < 12; i++) m.box(sx, 0.37 + i * 0.241, 0.055, sw, 0.247, 0.17 * (i + 1), "#545959");
    m.tube(
      [
        [edge + 0.03, 0.26, 0.91],
        [edge + 0.03, 3.12, 2.96]
      ],
      0.032,
      metal,
      6
    );
    for (const i of [0, 5, 11]) m.box(edge + 0.03, 0.37 + i * 0.241, 0.22 + i * 0.17, 0.043, 0.043, 0.84, metal);
  }
  if (filmedFront(m, shop, L)) {
    filmedBlade(m, shop, L);
    return;
  }
  const signHeight = shop.id === "sundrug" ? 0.86 : 0.68;
  m.box(center, -0.118, 2.54, span + 0.045, 0.345, signHeight, shop.band);
  m.box(center, -0.13, 2.51, span + 0.065, 0.36, 0.043, iron);
  if (shop.kind === "convenience") {
    m.box(center, -0.303, 3.049, span, 0.026, 0.143, "#78bc4f");
    m.box(center, -0.303, 2.564, span, 0.027, 0.06, "#4a9ac4");
  }
  if (shop.id === "ohsho") {
    m.box(center, -0.302, 2.55, span * 0.61, 0.025, 0.663, "#a93836");
    for (const side of [-1, 1])
      m.box(center + side * span * 0.407, -0.302, 2.55, span * 0.17, 0.025, 0.663, "#efe5d1");
    lettering(m, "餃子の", center - span * 0.382, -0.322, 2.82, span * 0.17, 0.155, "#7f3d30");
    lettering(m, "王将", center, -0.326, 2.62, span * 0.57, 0.44, "#fff1d2");
  } else if (shop.id === "kaldi") {
    const purpleWidth = span * 0.7;
    m.box(center, -0.302, 2.54, span, 0.035, 0.68, "#323335");
    for (let j = 0; j < 4; j++) m.box(center, -0.33, 2.55 + j * 0.177, span, 0.095, 0.048, "#474744");
    m.box(center, -0.383, 2.62, purpleWidth, 0.06, 0.51, "#643499");
    lettering(m, "KALDI", center - purpleWidth * 0.13, -0.428, 2.7, purpleWidth * 0.52, 0.335, "#f3dfad");
    lettering(m, "COFFEE", center + purpleWidth * 0.25, -0.427, 2.89, purpleWidth * 0.3, 0.123, "#f3dfad");
    lettering(m, "FARM", center + purpleWidth * 0.25, -0.427, 2.71, purpleWidth * 0.3, 0.123, "#f3dfad");
  } else if (shop.id === "cocoichi") {
    const px = center - span * 0.34;
    m.box(center, -0.303, 2.55, span - 0.07, 0.045, 0.065, iron);
    m.oval(px, -0.333, 2.88, 0.235, 0.033, 0.23, "#65494a", 18, 7);
    m.oval(px, -0.361, 2.88, 0.185, 0.029, 0.177, "#f5e5c8", 16, 6);
    m.oval(px + 0.064, -0.377, 2.85, 0.103, 0.022, 0.092, "#c49854", 10, 5);
    lettering(m, "CURRY HOUSE", center - 0.02 * span, -0.336, 3.013, span * 0.4, 0.088, "#635141");
    lettering(m, shop.title, center + 0.065 * span, -0.336, 2.66, span * 0.68, 0.327, shop.ink);
  } else if (shop.id === "cando") {
    m.box(center, -0.311, 2.605, span * 0.57, 0.052, 0.52, "#f4f0e4");
    lettering(m, "Can★Do", center, -0.347, 2.693, span * 0.51, 0.315, "#614e42");
  } else if (shop.id === "coco") {
    for (const side of [-1, 1])
      m.box(center + side * span * 0.39, -0.309, 2.59, span * 0.21, 0.037, 0.245, "#b04b66");
    lettering(m, shop.title, center, -0.342, 2.731, span * 0.58, 0.294, "#464368");
  } else {
    lettering(
      m,
      shop.title,
      center,
      -0.307,
      shop.subtitle ? 2.765 : 2.704,
      span - 0.24,
      Math.min(shop.subtitle ? 0.37 : 0.46, span * 0.22),
      shop.ink
    );
    if (shop.subtitle) lettering(m, shop.subtitle, center, -0.309, 2.593, span - 0.26, 0.109, shop.ink);
  }
  if (
    [
      "kaldi",
      "olive",
      "cocoichi",
      "ohsho",
      "doutor",
      "chiyoda",
      "kohikan",
      "coco",
      "cando",
      "ongaku",
      "nagano",
      "constant"
    ].includes(shop.id) ||
    shop.kind === "bakery"
  )
    awning(
      m,
      -half + 0.06,
      edge - 0.06,
      2.53,
      shop.id === "kaldi" ? 0.82 : 0.56,
      shop.id === "kaldi"
        ? "#252b35"
        : shop.id === "olive"
          ? "#3d5078"
          : shop.id === "coco"
            ? "#414873"
            : shop.id === "ongaku"
              ? "#8d8b7f"
              : shop.id === "cocoichi"
                ? "#475a44"
                : shop.band,
      shop.id === "melon"
    );
  for (let i = 0; i < Math.max(1, Math.floor(span / 2.2)); i++) {
    const x = -half + ((i + 0.5) * span) / Math.max(1, Math.floor(span / 2.2));
    m.box(x, 1.36, 3.015, Math.min(1.03, span * 0.7), 0.118, 0.038, "lit:#fff1c9");
    if (foodKinds.has(shop.kind))
      m.turned(
        x,
        2.27,
        [
          [2.35, 0.15],
          [2.45, 0.125],
          [2.53, 0.038],
          [3.02, 0.012]
        ],
        "#8d7560",
        9
      );
  }
  if (
    shop.id === "sundrug" ||
    shop.id === "kaldi" ||
    shop.id === "ohsho" ||
    shop.id === "kohikan" ||
    shop.id === "cocopharmacy" ||
    shop.kind === "convenience" ||
    shop.kind === "curry" ||
    shop.kind === "ramen" ||
    shop.kind === "pawn" ||
    shop.kind === "shoes"
  )
    blade(m, -half + 0.16, 3.56, shop);
}

function merchandise(m, name) {
  if (name === "cd") {
    m.box(0, 0, 0.04, 0.92, 0.74, 0.9, "#565650");
    m.box(0.045, -0.378, 0.095, 0.78, 0.046, 0.78, 1);
    m.box(-0.395, -0.388, 0.08, 0.077, 0.036, 0.84, 2);
    m.oval(0.05, -0.406, 0.53, 0.245, 0.042, 0.268, 2, 10, 5);
    m.oval(0.05, -0.438, 0.53, 0.071, 0.025, 0.075, 1, 8, 4);
  } else if (name === "bowl") {
    const profile = [
      [0.04, 0.23],
      [0.12, 0.24],
      [0.28, 0.36],
      [0.8, 0.49],
      [0.88, 0.48],
      [0.82, 0.42],
      [0.31, 0.25],
      [0.23, 0.14]
    ];
    m.turned(0, 0, profile, 1, 14);
    m.tube(
      [...Array(17)].map((_, i) => [
        0.476 * Math.cos((i * Math.PI) / 8),
        0.476 * Math.sin((i * Math.PI) / 8),
        0.81
      ]),
      0.019,
      2,
      5
    );
  } else if (name === "shirt") {
    const ring = [
      [-0.48, 0.71],
      [-0.3, 0.91],
      [-0.14, 0.95],
      [0, 0.84],
      [0.14, 0.95],
      [0.3, 0.91],
      [0.48, 0.71],
      [0.33, 0.55],
      [0.27, 0.63],
      [0.3, 0.07],
      [-0.3, 0.07],
      [-0.27, 0.63],
      [-0.33, 0.55]
    ];
    for (const y of [-0.22, 0.22])
      m.face(
        ring.map(([x, z]) => [x, y, z]),
        1,
        [0, Math.sign(y), 0]
      );
    for (let i = 0; i < ring.length; i++) {
      const [x, z] = ring[i],
        [X, Z] = ring[(i + 1) % ring.length];
      m.face(
        [
          [x, -0.22, z],
          [X, -0.22, Z],
          [X, 0.22, Z],
          [x, 0.22, z]
        ],
        1
      );
    }
    m.tube(
      [
        [-0.14, 0, 0.91],
        [0, 0, 0.995],
        [0.15, 0, 0.91]
      ],
      0.026,
      2,
      5
    );
  } else if (name === "shoe") {
    m.loft(
      [
        m.rect(0, 0, 0.04, 0.94, 0.64),
        m.rect(0, 0, 0.2, 0.97, 0.68),
        m.rect(-0.14, 0, 0.39, 0.67, 0.59),
        m.rect(-0.28, 0, 0.79, 0.36, 0.49)
      ],
      1
    );
    m.box(0, 0, 0, 0.94, 0.67, 0.08, 2);
    for (let i = 0; i < 3; i++) m.box(-0.13 + i * 0.08, 0, 0.4 - i * 0.035, 0.055, 0.35, 0.03, 2);
  } else if (name === "gacha") {
    m.box(0, 0, 0.04, 0.91, 0.76, 0.46, 2);
    m.box(0, 0, 0.5, 0.9, 0.77, 0.43, "clear");
    m.box(0, 0, 0.93, 0.93, 0.8, 0.05, 2);
    for (let j = 0; j < 7; j++)
      m.oval(
        ((j % 3) - 1) * 0.24,
        ((j % 2) - 0.5) * 0.31,
        0.58 + j * 0.028,
        0.115,
        0.11,
        0.09,
        j % 2 ? 1 : 2,
        7,
        4
      );
    m.box(-0.21, -0.391, 0.12, 0.26, 0.048, 0.12, iron);
    m.box(0.18, -0.41, 0.25, 0.19, 0.09, 0.06, chalk);
  } else if (name === "washer") {
    m.box(0, 0, 0.03, 0.91, 0.85, 0.88, 1);
    m.box(0, 0, 0.9, 0.92, 0.86, 0.08, 2);
    m.oval(0, -0.435, 0.49, 0.29, 0.08, 0.27, metal, 12, 7);
    m.oval(0, -0.487, 0.49, 0.218, 0.06, 0.201, "#58646a", 12, 7);
  } else if (name === "menu") {
    const c = ["#bb7a42", "#a35d3c", "#dfbe75", "#648456"];
    m.box(0, 0, 0.03, 0.91, 0.11, 0.91, 2);
    for (let i = 0; i < 6; i++) {
      const x = ((i % 2) - 0.5) * 0.39,
        z = 0.2 + Math.floor(i / 2) * 0.26;
      m.oval(x, -0.065, z, 0.151, 0.018, 0.084, "#ede6d1", 10, 5);
      m.oval(x, -0.086, z, 0.107, 0.02, 0.052, c[i % 4], 8, 4);
    }
  }
}

export function streetModel(key, detail) {
  const cacheKey = key + ":" + Number(detail);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const [, type, id, w, h] = key.split("/"),
    m = new MarketModel(detail);
  if (type === "shop" || type === "flank") {
    const width = Number(w) / 100,
      height = Number(h) / 100,
      shop = STREET_SHOPS.get(id),
      L = shopLayout(shop, width);
    upperStories(m, shop, L, height);
    if (type === "flank") cornerReturn(m, shop, L);
    else {
      signAndEntrance(m, shop, L);
      for (const item of L.fixtures) retailFurniture(m, item, shop);
      shopDetails(m, shop, L);
    }
    normalize(m, width, 6.6, height, 1.2);
  } else if (type === "avenue") {
    const [dimensions, draw] = avenueFixtures[id];
    draw(m);
    normalize(m, ...dimensions);
  } else if (type === "goods") merchandise(m, id);
  else streetFurnitureModel(m, type, id);
  const out = m.finish();
  cache.set(cacheKey, out);
  return out;
}
