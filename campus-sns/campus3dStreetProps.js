const steel = "#a5aaa7",
  ink = "#35383c",
  paper = "#e8e5d8";
const line = (m, a, b, r, col) => m.tube([a, b], r, col, 7);
const colors = ["#7b925d", "#d5be59", "#c38994", "#708ec3", "#c6d7b4", "#e9e0d7", "#9a729b"];

// A stocked wire trolley, including the inward tilt of the shelves, ticket
// strips, folded pouches, handrail and individual castors.
export function drugRack(m, x, y, length = 2.18) {
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const X = x + side * 0.315,
        Y = y + end * (length / 2 - 0.04);
      line(m, [X, Y, 0.1], [X, Y, 1.25], 0.018, steel);
      m.oval(X, Y, 0.086, 0.049, 0.03, 0.065, ink, 8, 5);
    }
    line(m, [x + side * 0.31, y - length / 2, 1.24], [x + side * 0.31, y + length / 2, 1.24], 0.014, steel);
  }
  for (let j = 0; j < 3; j++) {
    const z = 0.22 + j * 0.335;
    m.box(x, y, z, 0.66, length, 0.033, "#d0cfc4");
    for (const side of [-1, 1]) {
      for (const h of [0.058, 0.108])
        line(
          m,
          [x + side * 0.323, y - length / 2, z + h],
          [x + side * 0.323, y + length / 2, z + h],
          0.009,
          steel
        );
      for (let k = 0; k < length / 0.15; k++)
        line(
          m,
          [x + side * 0.323, y - length / 2 + k * 0.15, z],
          [x + side * 0.323, y - length / 2 + k * 0.15, z + 0.109],
          0.005,
          steel
        );
    }
    const n = Math.max(3, Math.floor(length / 0.21));
    for (let k = 0; k < n; k++)
      for (let side = 0; side < 3; side++) {
        const X = x + (side - 1) * 0.19,
          Y = y + ((k + 0.5) / n - 0.5) * length,
          w = 0.14 + (k % 2) * 0.025;
        const h = 0.225 + 0.04 * ((j + k * 3 + side) % 3),
          c = colors[(k * 3 + side + j * 2) % colors.length];
        m.loft(
          [
            m.rect(X, Y, z + 0.039, w, 0.132),
            m.rect(X + 0.012, Y, z + h, w + 0.014, 0.124),
            m.rect(X + 0.013, Y, z + h + 0.071, w * 0.89, 0.037)
          ],
          c
        );
        m.box(X, Y - 0.067, z + 0.093, w * 0.84, 0.012, 0.092, "#e4e2d6");
        m.box(X, Y - 0.074, z + 0.14, w * 0.65, 0.007, 0.017, c);
      }
    for (let k = 0; k < 3; k++) {
      const X = x + (k - 1) * 0.2,
        Y = y - length / 2 - 0.024;
      m.box(X, Y, z + 0.021, 0.17, 0.018, 0.082, "#dec75c");
      m.box(X, Y - 0.012, z + 0.058, 0.108, 0.008, 0.015, "#af6742");
    }
  }
}

function parkingSign(m) {
  m.box(0, 0, 0, 0.74, 0.39, 0.075, "#55659b");
  for (const y of [-0.12, 0.12]) m.box(0, y, 0.075, 0.67, 0.083, 0.069, "#6879ac");
  const w = 0.6;
  m.loft(
    [
      m.rect(0, 0, 0.13, 0.62, 0.3),
      m.rect(0, 0, 0.32, 0.55, 0.23),
      m.rect(0, 0, 0.83, 0.46, 0.13),
      m.rect(0, 0, 0.89, 0.42, 0.11)
    ],
    "#a8aaa3"
  );
  m.box(0, -0.156, 0.18, w - 0.057, 0.035, 0.57, "#eae8db");
  m.box(0, -0.18, 0.22, 0.51, 0.013, 0.104, "#d8c655");
  const ring = (X, Z, r, col, thick) =>
    m.tube(
      Array.from({ length: 25 }, (_, j) => {
        const a = (j * 2 * Math.PI) / 24;
        return [X + r * Math.cos(a), -0.188, Z + r * Math.sin(a)];
      }),
      thick,
      col,
      5
    );
  for (const X of [-0.1, 0.1]) ring(X, 0.48, 0.06, "#454a4d", 0.009);
  m.tube(
    [
      [-0.097, -0.191, 0.481],
      [-0.025, -0.191, 0.553],
      [0.025, -0.191, 0.483],
      [0.094, -0.191, 0.482],
      [0.058, -0.191, 0.578]
    ],
    0.009,
    ink,
    5
  );
  ring(0, 0.515, 0.164, "#ac605d", 0.017);
  line(m, [-0.116, -0.205, 0.631], [0.116, -0.205, 0.399], 0.016, "#ac605d");
  m.text("駐輪禁止", 0, -0.199, 0.241, 0.43, 0.054, "#6b5c43", 0.003);
  m.tube(
    [
      [-0.12, 0, 0.85],
      [-0.09, 0, 0.94],
      [0.09, 0, 0.94],
      [0.12, 0, 0.85]
    ],
    0.021,
    "#6d716e",
    6
  );
}

function conifer(m) {
  m.loft([m.rect(0, 0, 0, 0.55, 0.49), m.rect(0, 0, 0.53, 0.69, 0.61), m.rect(0, 0, 0.56, 0.7, 0.62)], "#bdb8aa");
  m.box(0, 0, 0.558, 0.61, 0.54, 0.013, "#645a46");
  line(m, [0, 0, 0.55], [0.02, 0.035, 2.37], 0.041, "#76664a");
  const shades = ["#4a5839", "#50633d", "#657b45", "#526840", "#677346", "#788650"];
  for (let j = 0; j < 46; j++) {
    const a = j * 2.399,
      t = j / 46,
      reach = 0.44 * (1 - t * 0.72),
      x = Math.cos(a) * reach,
      y = Math.sin(a) * reach,
      z = 0.72 + t * 1.57;
    line(m, [0, 0, z - 0.04], [x, y, z + 0.12], 0.013, "#6b674a");
    m.oval(
      x * 0.61,
      y * 0.61,
      z + 0.12,
      0.099 * (1 - t * 0.43),
      0.105 * (1 - t * 0.43),
      0.187 * (1 - t * 0.46),
      shades[j % 6],
      7,
      5
    );
    for (let k = 0; k < (m.detail ? 11 : 5); k++) {
      const u = a + k * 2.23,
        r = 0.12 + 0.12 * Math.sin(k * 0.9),
        xx = x * 0.78 + Math.cos(u) * r,
        yy = y * 0.78 + Math.sin(u) * r,
        zz = z + 0.035 + (k % 4) * 0.064;
      const tip = [xx + 0.085 * Math.cos(u), yy + 0.085 * Math.sin(u), zz + 0.21];
      line(m, [xx, yy, zz], tip, 0.004, shades[(j + k) % 6]);
      for (let n = 0; n < 5; n++) {
        const f = n * 0.176,
          g = (1 - f) * 0.048,
          X = xx + f * (tip[0] - xx),
          Y = yy + f * (tip[1] - yy),
          Z = zz + f * 0.21;
        for (const sign of [-1, 1]) {
          const p = [X + Math.cos(u + sign * 1.2) * g, Y + Math.sin(u + sign * 1.2) * g, Z + 0.064 - f * 0.015];
          m.face([[X - 0.01, Y + 0.006, Z], [X + 0.012, Y - 0.008, Z + 0.015], p], shades[(j + k + n) % 6]);
        }
      }
    }
  }
}

function streetTree(m) {
  const wood = "#6c6454";
  m.turned(
    0,
    0,
    [
      [0, 0.2],
      [0.39, 0.155],
      [1.58, 0.138],
      [2.65, 0.09],
      [3.28, 0.061]
    ],
    wood,
    11
  );
  const shades = ["#627346", "#798845", "#4f633a", "#81934e", "#6e8043", "#596b3b"];
  for (let j = 0; j < 27; j++) {
    const a = j * 2.399,
      t = j / 27,
      l = 0.66 + 1.24 * Math.sin((0.1 + t * 0.83) * Math.PI),
      z = 2.39 + t * 3.74;
    const X = Math.cos(a) * l,
      Y = Math.sin(a) * l;
    m.tube(
      [
        [0, 0, Math.max(1.65, z - 1.34)],
        [X * 0.42, Y * 0.42, z - 0.64],
        [X, Y, z]
      ],
      0.034 * (1.5 - t * 0.55),
      wood,
      7
    );
    for (let k = 0; k < (m.detail ? 18 : 6); k++) {
      const u = k * 2.4 + a,
        r = 0.16 + (k % 4) * 0.13,
        x = X + Math.cos(u) * r,
        y = Y + Math.sin(u) * r,
        h = z + Math.sin(k * 4.1) * 0.36;
      m.oval(
        x,
        y,
        h,
        0.22 + (k % 3) * 0.095,
        0.28 + (k % 2) * 0.11,
        0.27 + (k % 4) * 0.05,
        shades[(j + k) % 6],
        7,
        4
      );
    }
  }
}

function pedestrian(m, bag) {
  const dark = "#40424a",
    skin = "#bd9678",
    hair = "#353337";
  for (const side of [-1, 1]) {
    const x = side * 0.087,
      dy = side * 0.102;
    m.loft(
      [
        m.ring(x * 1.22, dy, 0.078, 0.063, 0.073, 9),
        m.ring(x * 1.19, -dy * 0.19, 0.46, 0.084, 0.078, 9),
        m.ring(x, 0, 0.84, 0.102, 0.115, 9)
      ],
      dark
    );
    m.oval(x * 1.22, dy - 0.042, 0.072, 0.072, 0.136, 0.067, "#464444", 10, 5);
    m.oval(x * 1.22, dy - 0.056, 0.034, 0.073, 0.133, 0.026, "#b5b0a3", 9, 4);
  }
  m.loft(
    [
      m.ring(0, 0.012, 0.77, 0.188, 0.135, 12),
      m.ring(0, 0, 0.91, 0.198, 0.136, 12),
      m.ring(0, -0.012, 1.23, 0.211, 0.13, 12),
      m.ring(0, 0, 1.36, 0.181, 0.108, 12),
      m.ring(0, 0, 1.4, 0.071, 0.07, 12)
    ],
    1
  );
  for (const side of [-1, 1]) {
    const elbow = [side * 0.236, -side * 0.073, 1.045],
      wrist = [side * 0.237, -side * 0.134, 0.877];
    m.tube([[side * 0.175, 0, 1.31], elbow, wrist], 0.069, 1, 8);
    m.oval(wrist[0], wrist[1], wrist[2] - 0.037, 0.042, 0.05, 0.069, skin, 8, 5);
  }
  m.oval(0, -0.009, 1.507, 0.112, 0.109, 0.152, skin, 12, 8);
  m.oval(0, 0.013, 1.564, 0.116, 0.115, 0.111, hair, 12, 7);
  m.oval(0, -0.109, 1.5, 0.023, 0.02, 0.036, skin, 7, 5);
  if (bag) {
    m.oval(0, 0.128, 1.08, 0.164, 0.102, 0.223, 2, 10, 7);
    for (const x of [-0.115, 0.115])
      m.tube(
        [
          [x, 0.13, 1.07],
          [x, 0.06, 1.34],
          [x, -0.075, 1.32],
          [x, -0.124, 1.11]
        ],
        0.018,
        2,
        6
      );
  } else {
    m.box(0.232, -0.069, 0.52, 0.235, 0.129, 0.31, "#d1c8b8");
    m.tube(
      [
        [0.14, -0.075, 0.8],
        [0.177, -0.076, 0.91],
        [0.257, -0.076, 0.91],
        [0.309, -0.075, 0.8]
      ],
      0.009,
      paper,
      5
    );
  }
}

export function filmedProp(m, id) {
  if (id === "parking") {
    parkingSign(m);
    return [0.74, 0.39, 0.95];
  }
  if (id === "conifer") {
    conifer(m);
    return [1.04, 0.97, 2.55];
  }
  if (id === "tree") {
    streetTree(m);
    return [4.9, 4.8, 6.7];
  }
  pedestrian(m, id === "backpack");
  return [0.54, 0.43, 1.69];
}
