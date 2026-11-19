const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const chalk = "#e5e4d7",
  silver = "#a8afac";

// Local metres measured from the first edge, like the adjacent shelves, glass and doors.
function fixtureFrame(r) {
  const [a, b, , d] = r,
    L = len(a, b),
    D = len(a, d);
  const ex = [(b[0] - a[0]) / L, (b[1] - a[1]) / L],
    ey = [(d[0] - a[0]) / D, (d[1] - a[1]) / D];
  return { L, D, ex, ey, P: (x, y) => [a[0] + ex[0] * x + ey[0] * y, a[1] + ex[1] * x + ey[1] * y] };
}
function put(inst, part, xy, z, angle, w, d, h, main, trim = main, light = 1.07) {
  inst.add("station/" + part, xy, z, angle, [w, d, h], [main, trim], light);
}

export const stationFixtureStyles = new Set([
  "stationGate",
  "stationTicket",
  "stationCharge",
  "stationTicketPanel",
  "stationTicketNotices",
  "stationFare",
  "stationSeat",
  "waitingSeat",
  "waitingCanopy",
  "stationBin",
  "stationLocker",
  "stationBoard",
  "stationWayfinding",
  "stationTicketBank"
]);

export function drawStationFixture(M, it, r, z0, z1, T, kit) {
  const inst = M.fixtureInstances,
    { L, D, ex, ey, P } = fixtureFrame(r),
    H = z1 - z0;
  const along = Math.atan2(ex[1], ex[0]),
    out = Math.atan2(ey[1], ey[0]) - Math.PI / 2;
  const box = (x0, x1, y0, y1, lo, hi, col) =>
    kit.prism(M.m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], lo, hi, T(col), { bottom: true });
  const rod = (x, y, z, X, Y, Z, w, col) => kit.bar(M.m, [P(x, y), z], [P(X, Y), Z], w, T(col));
  const mid = P(L * 0.5, D * 0.5);
  if (it.style === "stationGate") {
    put(inst, "gate", mid, z0, along, L, D, H, it.color || silver);
    return;
  }
  const terminal = {
    stationTicket: "ticket",
    stationCharge: "charge",
    stationFare: "fare",
    stationTicketPanel: "ticketPanel",
    stationTicketNotices: "ticketNotices"
  }[it.style];
  if (terminal) {
    put(inst, terminal, mid, z0, out, L, D, H, it.color || "#c8c9c3");
    if (it.machineNo) {
      // The numbered plate just below the header is mounted on the same inclined front.
      const at = P(L * 0.101, D * (0.5 - 0.478 + 0.91 * (0.878 - 0.43)) - 0.011);
      box(
        0.064 * L,
        0.14 * L,
        D * (0.5 - 0.478 + 0.91 * (0.878 - 0.43)) - 0.014,
        D * (0.5 - 0.478 + 0.91 * (0.878 - 0.43)) - 0.01,
        z0 + 0.868 * H,
        z0 + 0.903 * H,
        "#f1f0e6"
      );
      put(inst, "number" + it.machineNo, at, z0 + 0.872 * H, out, 0.046, 0.009, 0.043, "#272c30");
    }
    return;
  }
  if (it.style === "stationTicketBank") {
    const foot = z0 - it.z0;
    put(inst, "ticketDisplays", P(L * 0.5, D * 0.5 + 0.32), z0, out, L, D, H, "#e8e5df");
    box(-0.025, L + 0.025, -0.095, 0.56, foot + 0.12, foot + 0.697, "#665044");
    box(-0.025, L + 0.025, -0.07, 0.54, foot + 0.026, foot + 0.143, "#898780");
    box(-0.036, L + 0.036, -0.115, 0.57, foot + 0.688, foot + 0.724, "#b8b2a4");
    for (let i = 1; i < 4; i++)
      box((L * i) / 4 - 0.003, (L * i) / 4 + 0.003, -0.097, -0.094, foot + 0.15, foot + 0.675, "#4e423b");
    return;
  }
  if (it.style === "waitingSeat" || it.style === "stationSeat") {
    const indoor = it.style === "waitingSeat",
      count = Math.max(1, Math.round(L / (indoor ? 0.56 : 0.54))),
      bay = L / count;
    const palette = indoor ? ["#a59560", "#aa614a", "#8b985c", "#566362"] : ["#ba8247", "#c08b50", "#b7804a"];
    box(0.08, L - 0.08, D * 0.47, D * 0.62, z0 + 0.265, z0 + 0.325, "#707779");
    for (let i = 0; i < count; i++) {
      put(
        inst,
        indoor ? "waitingSeat" : "seat",
        P((i + 0.5) * bay, D * 0.5),
        z0,
        out + Math.PI,
        bay - 0.013,
        D,
        H,
        palette[i % palette.length],
        "#a38f74"
      );
      if (i % 2 === 0 || i === count - 1) {
        const x = (i + 0.93) * bay;
        rod(x, D * 0.22, z0 + 0.39, x, D * 0.31, z0 + 0.585, 0.029, silver);
        rod(x, D * 0.31, z0 + 0.585, x, D * 0.72, z0 + 0.574, 0.033, silver);
        rod(x, D * 0.72, z0 + 0.574, x, D * 0.78, z0 + 0.502, 0.031, silver);
      }
    }
    const feet = Math.max(2, Math.ceil(L / 1.8));
    for (let i = 0; i < feet; i++) {
      const x = 0.26 + ((L - 0.52) * i) / (feet - 1);
      for (const y of [0.11, 0.88]) {
        rod(x, D * 0.54, z0 + 0.28, x, D * y, z0 + 0.045, 0.044, silver);
        box(x - 0.056, x + 0.056, D * y - 0.037, D * y + 0.037, z0 + 0.005, z0 + 0.038, "#747875");
      }
    }
    return;
  }
  if (it.style === "waitingCanopy") {
    // The two short ends have sliding doors. The etched vine belongs only to the fixed glass.
    box(-0.035, L + 0.035, -0.035, D + 0.035, z0 + 0.035, z1, "#594641");
    box(0.075, L - 0.075, 0.065, D - 0.065, z0, z0 + 0.045, "#dfdfd5");
    const foot = z0 - it.z0;
    for (const y of [0.012, D - 0.012]) {
      box(0, L, y - 0.018, y + 0.018, foot + 0.012, foot + 0.094, silver);
      const bays = Math.max(1, Math.round(L / 0.82));
      for (let i = 0; i < bays; i++)
        for (const h of [0.84, 1.36]) {
          put(inst, "frost", P(((i + 0.5) * L) / bays, y), foot + h, along, L / bays, 0.022, 0.125, chalk);
        }
    }
    for (let i = 0; i < 4; i++) {
      const x = (L * (i + 0.5)) / 4;
      const lamp = P(x, D * 0.42);
      const ring = (radius) =>
        Array.from({ length: 16 }, (_, k) => [
          lamp[0] + radius * Math.cos((k * Math.PI) / 8),
          lamp[1] + radius * Math.sin((k * Math.PI) / 8)
        ]);
      kit.prism(M.m, ring(0.082), z0 - 0.018, z0 + 0.002, T("#a2a6a1"), { bottom: true });
      M.m.polygon([ring(0.067)], z0 - 0.019, [0, 0, -1], T("#fffce7"));
    }
    for (const x of [0, L]) {
      const outward = x === 0 ? -1 : 1;
      const p = P(x + outward * 0.027, D * 0.875);
      put(inst, "waitingSign", p, foot + 1.54, along + (outward * Math.PI) / 2, 0.31, 0.037, 0.37, silver);
    }
    box(L * 0.4, L * 0.6, D * 0.43, D * 0.73, z0 - 0.047, z0 - 0.012, silver);
    for (let i = 0; i < 9; i++)
      box(L * 0.41, L * 0.59, D * (0.45 + i * 0.03), D * (0.456 + i * 0.03), z0 - 0.053, z0 - 0.046, "#727771");
    return;
  }
  if (it.style === "stationBin") {
    box(0.02, L - 0.02, 0.025, D - 0.025, z0 + 0.035, z1 - 0.15, "#a4aaa7");
    box(0.03, L - 0.03, 0.04, D - 0.04, z0, z0 + 0.062, "#575c5c");
    const cols = 3;
    for (let i = 0; i < cols; i++) {
      const a = (i * L) / cols + 0.012,
        b = ((i + 1) * L) / cols - 0.012;
      box(a, b, 0.008, D - 0.008, z1 - 0.15, z1 - 0.06, "#bfc6c2");
      box(a + 0.02, b - 0.02, D * 0.1, D * 0.77, z1 - 0.062, z1 - 0.055, "#404b4c");
      for (const y of [0.08, 0.76]) box(a + 0.02, b - 0.02, D * y, D * y + 0.016, z1 - 0.058, z1 - 0.012, silver);
      box(a + 0.036, b - 0.036, -0.009, 0, z1 - 0.35, z1 - 0.27, ["#68849d", "#9b7562", "#809074"][i]);
      box(a + 0.02, a + 0.028, 0, 0.02, z0 + 0.1, z1 - 0.159, "#69716f");
    }
    return;
  }
  if (it.style === "stationLocker") {
    box(0, L, 0, D, z0 + 0.02, z1, "#959c99");
    const bays = Math.max(3, Math.round(L / 0.44)),
      w = L / bays;
    for (let i = 0; i < bays; i++) {
      let z = z0 + 0.095;
      const large = i >= bays - 2,
        heights = large ? [0.48, 0.52] : i === 0 ? [0.29, 0.36, 0.35] : [0.24, 0.24, 0.26, 0.26];
      for (const fr of heights) {
        const hi = z + fr * (H - 0.13);
        box(i * w + 0.012, (i + 1) * w - 0.012, -0.017, 0.002, z, hi - 0.012, "#daddce");
        box((i + 0.76) * w, (i + 0.91) * w, -0.034, -0.018, hi - 0.15, hi - 0.055, "#686f6b");
        box((i + 0.8) * w, (i + 0.88) * w, -0.04, -0.034, hi - 0.094, hi - 0.07, "#94b59c");
        z = hi;
      }
    }
    return;
  }
  if (it.style === "stationBoard") {
    box(0, L, 0, D, z0, z1, "#717a7b");
    for (const y of [-0.016, D + 0.016]) {
      box(0.06, L - 0.06, y - 0.009, y + 0.009, z0 + 0.06, z1 - 0.062, "#dadbd0");
      const w = (L - 0.16) / 3;
      for (let k = 0; k < 3; k++) {
        const x = 0.082 + k * w,
          front = y < 0 ? y - 0.014 : y + 0.014;
        box(
          x,
          x + w - 0.023,
          front - 0.004,
          front + 0.004,
          z0 + 0.12,
          z1 - 0.12,
          ["#eadbc6", "#dce4e2", "#d8ccba"][k]
        );
        box(
          x + 0.025,
          x + w - 0.048,
          front - 0.008,
          front + 0.008,
          z1 - 0.24,
          z1 - 0.155,
          ["#936a4e", "#587480", "#805555"][k]
        );
        for (let j = 0; j < 3; j++)
          box(
            x + 0.035,
            x + w * (0.9 - j * 0.08),
            front - 0.01,
            front + 0.01,
            z0 + 0.26 + j * 0.09,
            z0 + 0.275 + j * 0.09,
            "#9d9b90"
          );
      }
    }
    return;
  }
  if (it.style === "stationWayfinding") {
    const count = Math.max(1, Math.round(L / 0.84));
    for (let i = 0; i < count; i++) {
      for (const side of [0, 1])
        put(
          inst,
          "arrow",
          P(((i + 0.5) * L) / count, D * (side ? 0.75 : 0.25)),
          z0 + 0.002,
          along + (side ? Math.PI : 0),
          L / count - 0.008,
          D * 0.49,
          0.005,
          side ? "#b8cbd1" : "#383b50",
          side ? "#657782" : "#eee9d7"
        );
    }
  }
}

export function drawTactileStrip(inst, r, z, warning) {
  if (r.length < 4 || r.length % 2) return;
  if (r.length === 4 && len(r[0], r[1]) < len(r[0], r[3])) r = [r[1], r[2], r[3], r[0]];
  const half = r.length / 2;
  for (let k = 0; k < half - 1; k++) {
    const a = r[k],
      b = r[k + 1],
      oppositeA = r[r.length - 1 - k],
      oppositeB = r[r.length - 2 - k];
    const start = middle(a, oppositeA),
      end = middle(b, oppositeB);
    const width = (len(a, oppositeA) + len(b, oppositeB)) / 2,
      length = len(start, end);
    if (width < 0.06 || length < 0.08) continue;
    const count = Math.max(1, Math.round(length / 0.3)),
      cols = Math.max(1, Math.round(width / 0.3));
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    for (let i = 0; i < count; i++)
      for (let j = 0; j < cols; j++) {
        const t = (i + 0.5) / count,
          v = (j + 0.5) / cols;
        const pos = a.map(
          (x, n) => (x + (b[n] - x) * t) * (1 - v) + (oppositeA[n] + (oppositeB[n] - oppositeA[n]) * t) * v
        );
        put(
          inst,
          warning ? "dots" : "ribs",
          pos,
          z + 0.0022,
          angle,
          length / count - 0.0009,
          width / cols - 0.001,
          0.0065,
          "#cdb949",
          "#e4d164"
        );
      }
  }
}

// Work from the actual door intervals, even when a platform edge bends. Fixed numbers and lamps
// stand on the public side of each pocket. Moving leaves remain linked to the arriving train.
export function drawStationBoarding(inst, openings, pathPoint, z, platformSide, style, clear) {
  openings.forEach(([a, b], index) => {
    const A = pathPoint(a),
      B = pathPoint(b),
      L = len(A, B);
    if (L < 0.5) return;
    const ux = (B[0] - A[0]) / L,
      uy = (B[1] - A[1]) / L,
      nx = -uy * platformSide,
      ny = ux * platformSide;
    const at = (x, y) => [A[0] + ux * x + nx * y, A[1] + uy * x + ny * y];
    const angle = Math.atan2(uy, ux),
      faceAngle = Math.atan2(ny, nx) + Math.PI / 2;
    const pieces = 4;
    for (let i = 0; i < pieces; i++)
      put(
        inst,
        "threshold",
        at(((i + 0.5) * L) / pieces, 0.22),
        z + 0.003,
        angle,
        L / pieces - 0.009,
        0.24,
        0.012,
        silver
      );
    const n = Math.max(2, Math.round(L / 0.3));
    for (let i = 0; i < n; i++)
      put(
        inst,
        "dots",
        at(((i + 0.5) * L) / n, 0.509),
        z + 0.004,
        angle,
        L / n - 0.002,
        0.33,
        0.0065,
        "#cdb949",
        "#e4d164"
      );
    if (clear(at(L / 2, 2.13)) && clear(at(L / 2, 1.3))) {
      for (const x of [0.17, L - 0.17])
        put(inst, "queue", at(x, 1.52), z + 0.003, angle + Math.PI / 2, 1.15, 0.046, 0.004, "#72839c", "#d9ddd5");
      put(
        inst,
        "boardingArrow",
        at(L / 2, 1.52),
        z + 0.003,
        (-platformSide * Math.PI) / 2 + angle,
        0.27,
        0.24,
        0.005,
        chalk
      );
    }
    if (style !== "mg") return;
    const p = at(-0.26, 0.179);
    put(inst, "pocket", at(-0.56, 0.169), z + 0.055, faceAngle, 1.03, 0.018, 1.22, silver);
    put(inst, "position", p, z + 0.69, faceAngle, 0.32, 0.025, 0.35, "#383d41");
    const car = Math.ceil((openings.length - index) / 4),
      door = 4 - (index % 4);
    for (const h of [0.705, 0.87]) {
      if (car > 6 && h < 0.8) continue;
      put(
        inst,
        "digit" + car + "-" + door,
        [p[0] + nx * 0.02, p[1] + ny * 0.02],
        z + h,
        faceAngle,
        0.192,
        0.008,
        0.095,
        chalk
      );
    }
  });
}
