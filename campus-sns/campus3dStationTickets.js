const silver = "#c8c9c3",
  edge = "#e0e2db",
  black = "#282d32",
  navy = "#254c96",
  white = "#f1efe7";
const pink = "#c95084",
  ink = "#343739",
  led = "#c1d973";

// Two framed notices on the return wall beside the machines. The train and
// flower motifs, type, glazing clips and printed rules are all raised geometry.
export function ticketNotices(m) {
  m.box(0, 0.02, 0, 1, 0.86, 1, "#665953");
  m.box(0, -0.435, 0.024, 0.975, 0.08, 0.948, "#c3b7a3");
  for (const [x, col] of [
    [-0.238, "#ecdcd7"],
    [0.238, "#ebeadb"]
  ]) {
    m.box(x, -0.493, 0.06, 0.452, 0.034, 0.87, col);
    m.box(x, -0.525, 0.707, 0.388, 0.018, 0.147, x < 0 ? "#ba797b" : "#4f7075");
    m.text(x < 0 ? "PASMO" : "TOKYU", x, -0.549, 0.744, 0.33, 0.064, white, 0.003);
    for (let i = 0; i < 3; i++) m.box(x, -0.535, 0.13 + i * 0.034, 0.306 - i * 0.037, 0.012, 0.009, "#908478");
    for (const side of [-1, 1]) m.box(x + side * 0.198, -0.54, 0.883, 0.019, 0.016, 0.023, edge);
  }
  m.box(-0.238, -0.531, 0.339, 0.311, 0.031, 0.204, "#e9e3d6");
  m.box(-0.238, -0.55, 0.371, 0.311, 0.014, 0.042, "#bd596e");
  for (let j = 0; j < 4; j++) m.box(-0.355 + j * 0.078, -0.549, 0.435, 0.054, 0.015, 0.066, "#7e9c9e");
  for (const x of [-0.338, -0.146]) m.box(x, -0.538, 0.307, 0.059, 0.018, 0.036, "#535958");
  for (const [cx, cz, r, color] of [
    [0.17, 0.435, 0.093, "#b5827b"],
    [0.314, 0.546, 0.066, "#b8a05b"],
    [0.326, 0.346, 0.055, "#a9aaa1"]
  ]) {
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 3,
        dx = Math.cos(a) * r * 0.69,
        dz = Math.sin(a) * r;
      m.face(
        [
          [cx, -0.55, cz],
          [cx + dx * 0.62 - dz * 0.26, -0.55, cz + dz * 0.64 + dx * 0.49],
          [cx + dx, -0.55, cz + dz],
          [cx + dx * 0.62 + dz * 0.26, -0.55, cz + dz * 0.64 - dx * 0.49]
        ],
        color,
        [0, -1, 0]
      );
    }
  }
}

// The inclined fascia is built in its own plane. Increasing depth comes towards
// the traveller. Bezels, slots, tray walls and legends share the same inclination.
export function ticketMachine(m, kind) {
  const charger = kind === "charge",
    fare = kind === "fare",
    leaflet = kind === "ticketPanel";
  const shell = charger ? "#d76c99" : fare ? 1 : silver,
    slope = 0.91;
  const y = (z) => -0.478 + slope * (z - 0.43);
  const p = (x, z, d) => [x, y(z) - d, z];
  const front = [0, -1, slope];
  function slab(x0, x1, z0, z1, d, back, color) {
    const rect = (t) => [p(x0, z0, t), p(x1, z0, t), p(x1, z1, t), p(x0, z1, t)];
    const a = rect(d),
      b = rect(back);
    m.face(a, color, front);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      m.face([a[i], a[j], b[j], b[i]], color);
    }
  }
  function frame(x0, x1, z0, z1, d, back, xw, zh, color) {
    slab(x0, x0 + xw, z0, z1, d, back, color);
    slab(x1 - xw, x1, z0, z1, d, back, color);
    slab(x0 + xw, x1 - xw, z0, z0 + zh, d, back, color);
    slab(x0 + xw, x1 - xw, z1 - zh, z1, d, back, color);
  }
  function label(text, x, z, w, h, color, d = 0.016) {
    const start = m.v.length;
    const aspect = 2.15;
    m.text(text, x, 0, z, w / aspect, h, color, 0.0017);
    for (let i = start; i < m.v.length; i += 10) {
      m.v[i] = x + (m.v[i] - x) * aspect;
      m.v[i + 1] += y(m.v[i + 2]) - d;
      m.v[i + 5] -= slope * m.v[i + 4];
      const n = Math.hypot(m.v[i + 3], m.v[i + 4], m.v[i + 5]) || 1;
      for (let k = 3; k <= 5; k++) m.v[i + k] /= n;
    }
  }
  function slot(x0, x1, z0, z1, title) {
    // Open mouth, a recessed back and return tray. The indicator is set into the brow.
    slab(x0 + 0.011, x1 - 0.011, z0 + 0.004, z1 - 0.003, -0.035, -0.045, black);
    frame(x0, x1, z0, z1, 0.054, -0.04, 0.017, 0.007, "#717777");
    slab(x0 - 0.004, x1 + 0.004, z1, z1 + 0.023, 0.074, 0.01, edge);
    slab(x0 + 0.012, x1 - 0.012, z1 + 0.001, z1 + 0.006, 0.076, 0.074, "lit:" + led);
    const lip = title === "紙幣" ? 0.053 : title === "カード" ? 0.039 : 0.085;
    slab(x0 + 0.008, x1 - 0.008, z0 - 0.009, z0 + 0.005, lip, 0.018, "#7a8081");
    if (m.detail) label(title, (x0 + x1) / 2, z1 + 0.009, x1 - x0, 0.01, ink, 0.077);
  }
  function coinBay() {
    // The coin enters a short steel chute. The return below is a thumb-sized
    // scoop with a rolled edge and a deep, curved inner wall.
    slab(0.178, 0.441, 0.492, 0.555, 0.008, -0.046, "#bbc0bc");
    slab(0.21, 0.39, 0.512, 0.533, 0.033, 0.01, "#6d7778");
    slab(0.224, 0.376, 0.518, 0.527, 0.034, 0.033, "#222a2d");
    slab(0.214, 0.384, 0.505, 0.514, 0.049, 0.012, edge);
    slab(0.398, 0.42, 0.516, 0.531, 0.021, 0.009, "lit:" + led);
    const contour = (rx, rz, depth, centerZ) => {
      const n = m.detail ? 24 : 12;
      return Array.from({ length: n }, (_, j) => {
        const theta = (j * 2 * Math.PI) / n;
        const rounded = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.53);
        return p(0.313 + rx * rounded(Math.cos(theta)), centerZ + rz * rounded(Math.sin(theta)), depth);
      });
    };
    const outer = contour(0.126, 0.031, 0.052, 0.46);
    const rim = contour(0.117, 0.028, 0.064, 0.46);
    const mouth = contour(0.101, 0.023, 0.059, 0.46);
    const floor = contour(0.076, 0.012, -0.035, 0.464);
    for (let j = 0; j < rim.length; j++) {
      const k = (j + 1) % rim.length;
      m.face([outer[j], outer[k], rim[k], rim[j]], "#8d9390", front);
      m.face([rim[j], rim[k], mouth[k], mouth[j]], edge, front);
      m.face([mouth[j], mouth[k], floor[k], floor[j]], j >= rim.length / 2 ? "#555e60" : "#303739", front);
    }
    m.face(floor, "#24292b", front);
    if (m.detail) {
      label("硬貨", 0.285, 0.538, 0.088, 0.014, ink, 0.014);
      slab(0.241, 0.379, 0.49, 0.505, 0.046, 0.007, edge);
      label("おつり", 0.31, 0.494, 0.12, 0.008, ink, 0.048);
    }
  }
  // A recessed steel carcass starts at counter height. The adjacent machines sit
  // over one continuous wood apron and toe-kick built by the ticket bank.
  m.box(0, 0.23, 0.435, 0.973, 0.47, 0.55, "#a3a59e");
  if (fare) {
    m.box(0, 0.02, 0.017, 0.934, 0.88, 0.068, "#686c68");
    m.box(0, 0, 0.079, 0.972, 0.94, 0.368, shell);
    slab(-0.416, 0.416, 0.428, 0.452, 0.029, -0.064, edge);
  }
  slab(-0.496, 0.496, 0.433, 0.995, -0.069, -0.134, shell);
  for (const [a, b] of [
    [-0.499, -0.474],
    [0.474, 0.499]
  ])
    slab(a, b, 0.431, 0.998, 0.008, -0.13, edge);
  if (leaflet) {
    slab(-0.473, 0.473, 0.432, 0.993, 0.008, -0.08, "#c6c3b5");
    for (const [lo, hi] of [
      [0.58, 0.704],
      [0.722, 0.89]
    ]) {
      slab(-0.39, 0.39, lo, hi, 0.026, 0.01, "#817e73");
      slab(-0.365, 0.365, lo + 0.008, hi - 0.009, 0.028, 0.026, "#e4decb");
      slab(-0.33, -0.193, lo + 0.014, hi - 0.017, 0.031, 0.028, lo < 0.7 ? "#b8b9ab" : "#c7d2c0");
      slab(-0.158, 0.31, hi - 0.034, hi - 0.023, 0.031, 0.028, lo < 0.7 ? "#82695d" : "#738284");
      for (let j = 0; j < 4; j++)
        slab(
          -0.16,
          0.27 - (j % 2) * 0.061,
          lo + 0.018 + j * 0.012,
          lo + 0.021 + j * 0.012,
          0.03,
          0.028,
          "#989488"
        );
      if (m.detail) label(lo < 0.7 ? "定期券" : "ICカード", -0.008, hi - 0.061, 0.33, 0.015, ink, 0.033);
    }
    frame(-0.438, 0.438, 0.48, 0.566, 0.061, 0.013, 0.019, 0.014, edge);
    slab(-0.432, 0.432, 0.522, 0.565, 0.062, 0.057, "#dfbb56");
    for (let x = -0.4; x < 0.37; x += 0.15) {
      m.face(
        [p(x, 0.523, 0.065), p(x + 0.045, 0.523, 0.065), p(x + 0.098, 0.56, 0.065), p(x + 0.053, 0.56, 0.065)],
        "#4b473d",
        front
      );
    }
    return;
  }
  slab(-0.474, 0.474, 0.812, 0.992, 0.002, -0.068, shell);
  const headers = charger
    ? [[-0.464, 0.464, pink, "交通系ICチャージ", "Recharge IC card"]]
    : fare
      ? [[-0.464, 0.464, "#c5a238", "精算", "Fare adjustment"]]
      : [
          [-0.463, -0.15, "#c74f7e", "ICカード", "IC Card"],
          [-0.146, 0.146, "#357da8", "きっぷ", "Ticket"],
          [0.151, 0.464, "#e3dfcb", "定期券", "Commuter Pass"]
        ];
  for (const [lo, hi, col, jp, en] of headers) {
    slab(lo, hi, 0.916, 0.986, 0.018, 0.003, col);
    const textColor = jp === "定期券" || fare ? ink : white;
    label(jp, (lo + hi) / 2, 0.947, hi - lo - 0.02, 0.029, textColor, 0.02);
    if (m.detail) label(en, (lo + hi) / 2, 0.924, hi - lo - 0.028, 0.013, textColor, 0.02);
  }
  slab(-0.19, 0.18, 0.844, 0.894, 0.021, 0.002, "#727975");
  slab(-0.16, 0.15, 0.852, 0.879, 0.026, 0.022, "lit:#c9d5c9");
  slab(0.28, 0.36, 0.851, 0.893, 0.022, 0.002, black);
  if (m.detail) {
    for (let i = 0; i < 5; i++) slab(-0.425, -0.35, 0.818 + i * 0.009, 0.821 + i * 0.009, 0.007, 0.003, "#818681");
    label("TOKYU", 0.27, 0.813, 0.13, 0.011, ink);
  }
  // The touch panel sits behind a deep bevel, with actual pushbuttons to its left.
  slab(-0.473, 0.473, 0.57, 0.818, -0.011, -0.068, shell);
  const xmin = charger ? -0.31 : -0.274,
    xmax = 0.395,
    lo = 0.59,
    hi = 0.798;
  frame(xmin - 0.018, xmax + 0.018, lo - 0.012, hi + 0.013, 0.031, -0.012, 0.022, 0.012, "#474c4c");
  slab(xmin + 0.003, xmax - 0.003, lo + 0.002, hi - 0.002, 0.018, 0.014, black);
  // Positions inside the LCD use the display's own left-to-right, top-to-bottom grid.
  const screenX = (u) => xmin + 0.012 + u * (xmax - xmin - 0.024);
  const screenZ = (v) => hi - 0.006 - v * (hi - lo - 0.012);
  function cell(left, top, right, bottom, color, depth = 0.022) {
    slab(screenX(left), screenX(right), screenZ(bottom), screenZ(top), depth, depth - 0.002, "lit:" + color);
  }
  function caption(value, left, right, baseline, height, color = ink) {
    if (m.detail)
      label(
        value,
        (screenX(left) + screenX(right)) / 2,
        screenZ(baseline),
        screenX(right) - screenX(left),
        height * (hi - lo - 0.012),
        color,
        0.031
      );
  }
  const paper = "#ececef",
    lilac = "#bdc1e4";
  // Hardware and accepted-note indicators above the blue instruction band.
  for (const [j, value] of ["IC", "カード", "1000", "2000", "5000", "10000"].entries()) {
    const x = 0.012 + j * 0.094;
    cell(x, 0.011, x + 0.086, 0.066, "#747987");
    cell(x + 0.005, 0.016, x + 0.081, 0.06, "#29313c", 0.025);
    caption(value, x + 0.004, x + 0.082, 0.053, 0.031, white);
  }
  cell(0.865, 0.011, 0.988, 0.067, "#aeb3d9");
  caption("English", 0.868, 0.988, 0.053, 0.031);
  cell(0, 0.082, 1, 0.202, navy);
  caption("ご希望のボタンにふれてください", 0.015, 0.597, 0.161, 0.05, white);
  if (charger) {
    caption("チャージ金額", 0.012, 0.287, 0.28, 0.056, white);
    for (const [i, key] of ["チャージ", "カード", "残額"].entries()) {
      const top = 0.354 + i * 0.153;
      cell(0.004, top, 0.15, top + 0.143, lilac);
      caption(key, 0.012, 0.146, top + 0.087, 0.046);
    }
    cell(0.17, 0.3, 0.986, 0.416, "#414957");
    caption("チャージする金額", 0.184, 0.617, 0.379, 0.049, white);
    for (const [i, amount] of ["1,000", "2,000", "3,000", "4,000", "5,000", "10,000"].entries()) {
      const x = 0.171 + (i % 3) * 0.274,
        top = 0.433 + Math.floor(i / 3) * 0.18;
      cell(x, top, x + 0.265, top + 0.166, paper);
      caption(amount, x + 0.009, x + 0.256, top + 0.106, 0.077);
    }
    for (const [i, key] of ["残額", "定期券", "その他"].entries()) {
      const x = 0.171 + i * 0.274;
      cell(x, 0.799, x + 0.265, 0.969, lilac);
      caption(key, x + 0.009, x + 0.256, 0.911, 0.051);
    }
  } else if (fare) {
    for (const [i, key] of ["精算", "チャージ", "日本語", "English"].entries()) {
      const x = 0.015 + (i % 2) * 0.492,
        top = 0.248 + Math.floor(i / 2) * 0.362;
      cell(x, top, x + 0.471, top + 0.34, paper);
      caption(key, x + 0.012, x + 0.459, top + 0.2, 0.102);
    }
  } else {
    // The default ticket menu uses two large top tiles, a tall pass tile and
    // two pairs of smaller actions. A clear space sits above the QR control.
    const button = (l, t, r, b, title, sub, color = paper) => {
      cell(l, t, r, b, color);
      caption(title, l + 0.015, r - 0.012, t + 0.088, 0.069);
      if (sub) caption(sub, l + 0.011, r - 0.01, t + 0.158, 0.049);
    };
    button(0.008, 0.244, 0.332, 0.596, "チャージ", "をする");
    button(0.347, 0.244, 0.668, 0.596, "きっぷ", "を買う");
    button(0.008, 0.612, 0.332, 0.789, "フリーパス", "");
    button(0.008, 0.805, 0.332, 0.974, "新しいPASMO", "");
    button(0.347, 0.612, 0.668, 0.974, "定期券", "を買う");
    button(0.685, 0.612, 0.991, 0.789, "QRコード", "バーコード");
    button(0.685, 0.805, 0.991, 0.974, "その他", "", lilac);
    for (const [i, col] of ["#df5769", "#e6a751", "#56a480", "#6e99be"].entries())
      cell(0.054 + 0.049 * i, 0.44, 0.096 + 0.049 * i, 0.497, col, 0.025);
    for (const [x, t] of [
      [0.379, 0.442],
      [0.379, 0.811]
    ]) {
      cell(x, t, x + 0.124, t + 0.096, "#9b9e9a", 0.025);
      cell(x + 0.006, t + 0.009, x + 0.118, t + 0.086, "#f8f5ed", 0.027);
      cell(x + 0.014, t + 0.028, x + 0.104, t + 0.041, "#909888", 0.029);
    }
  }
  const bx = charger ? -0.391 : -0.36;
  slab(bx - 0.048, bx + 0.048, 0.605, 0.792, 0.014, -0.01, "#98978c");
  for (let i = 0; i < 5; i++) {
    const z = 0.613 + i * 0.034;
    slab(bx - 0.032, bx + 0.032, z, z + 0.024, 0.038, 0.014, i === 2 ? "#af5148" : "#dedacb");
    if (m.detail)
      for (let j = 0; j < 3; j++)
        slab(bx - 0.023 + j * 0.016, bx - 0.018 + j * 0.016, z + 0.011, z + 0.015, 0.041, 0.038, "#7f837f");
  }
  // The payment bay projects beyond the screen. Plates surround the working
  // apertures instead of covering them, so the slot recess is visible in profile.
  slab(-0.471, 0.471, 0.431, 0.571, -0.044, -0.07, shell);
  slot(-0.441, -0.185, 0.503, 0.539, "カード");
  slot(-0.147, 0.128, 0.501, 0.539, "紙幣");
  if (charger) {
    frame(0.19, 0.433, 0.468, 0.548, 0.073, -0.033, 0.021, 0.011, "#777d7a");
    slab(0.215, 0.409, 0.482, 0.532, 0.069, 0.056, "#434e54");
    if (m.detail) label("IC", 0.314, 0.492, 0.13, 0.027, "#adccdc", 0.073);
  } else coinBay();
  slot(-0.432, 0.12, 0.438, 0.473, charger ? "カード" : "きっぷ");
  slab(-0.474, 0.474, 0.565, 0.581, 0.044, -0.042, edge);
  if (m.detail) {
    slab(0.317, 0.395, 0.823, 0.84, 0.018, 0.001, charger ? "#bf4e82" : "#b44c45");
    label("呼出", 0.356, 0.827, 0.07, 0.009, white, 0.02);
  }
}
