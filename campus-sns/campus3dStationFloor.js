import clip from "polygon-clipping";

const cache = new WeakMap();
const hall = ["#b1a392", "#b8ab98", "#b5a895", "#b8ac9a"];
const cream = ["#e4e1d6", "#e8e5d9", "#e6e2d7", "#e1dfd5"];
const sand = ["#c1bbae", "#c5bfb1", "#c4beb2", "#bfb9ac"];

export const isStationTile = (finish) => finish === "stationHallTile" || finish === "stationPlatformTile";

// Cut the ceramic at stair wells, lift openings and the coloured paths. Whole tiles
// share one bevelled mesh. Only cells touched by the outline need polygon clipping.
function tilePlan(area, uv, platform) {
  if (cache.has(area)) return cache.get(area);
  const [ux] = uv([1, 0]),
    [uy] = uv([0, 1]);
  const step = 1 / Math.hypot(ux, uy),
    c = ux * step,
    s = uy * step;
  const fromGrid = ([x, y]) => [step * (x * c - y * s), step * (x * s + y * c)];
  const shape = area.map((poly) => poly.map((ring) => ring.map(uv)));
  const rows = new Map(),
    full = [],
    cut = [];
  for (const poly of shape)
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          dy = b[1] - a[1];
        if (a[0] === b[0] && !dy) continue;
        const low = Math.min(a[1], b[1]),
          high = Math.max(a[1], b[1]);
        const xAt = (y) => a[0] + (b[0] - a[0]) * ((y - a[1]) / dy);
        for (let y = Math.floor(low); y <= Math.floor(high); y++) {
          if (!rows.has(y)) rows.set(y, { edges: new Set(), crosses: [] });
          const row = rows.get(y);
          if (low <= y + 0.5 && y + 0.5 < high) row.crosses.push(xAt(y + 0.5));
          const x1 = dy ? xAt(Math.max(low, y)) : a[0],
            x2 = dy ? xAt(Math.min(high, y + 1)) : b[0];
          for (let x = Math.floor(Math.min(x1, x2)); x <= Math.floor(Math.max(x1, x2)); x++) row.edges.add(x);
        }
      }
    }
  const gap = 0.0017 / step;
  for (const [y, row] of rows) {
    row.crosses.sort((a, b) => a - b);
    const color = (x) => {
      const tone = platform ? ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? sand : cream) : hall;
      return tone[Math.abs(Math.imul(x, 73) ^ Math.imul(y, 157)) % tone.length];
    };
    for (let i = 1; i < row.crosses.length; i += 2) {
      for (let x = Math.ceil(row.crosses[i - 1] - 0.5); x + 0.5 < row.crosses[i]; x++) {
        if (!row.edges.has(x)) full.push([fromGrid([x + 0.5, y + 0.5]), color(x)]);
      }
    }
    let band;
    for (const x of row.edges) {
      band ??= clip.intersection(shape, [
        [
          [-1e6, y],
          [1e6, y],
          [1e6, y + 1],
          [-1e6, y + 1]
        ]
      ]);
      if (!band.length) break;
      const pieces = clip.intersection(band, [
        [
          [x + gap, y + gap],
          [x + 1 - gap, y + gap],
          [x + 1 - gap, y + 1 - gap],
          [x + gap, y + 1 - gap]
        ]
      ]);
      for (const poly of pieces) cut.push([poly.map((ring) => ring.map(fromGrid)), color(x)]);
    }
  }
  const plan = { full, cut, angle: Math.atan2(s, c), width: step - 0.0034, c, s };
  cache.set(area, plan);
  return plan;
}

export function drawStationFloor(M, area, finish, uv, z, T, highlight) {
  const { full, cut, angle, width, c, s } = tilePlan(area, uv, finish === "stationPlatformTile");
  const base = z - 0.003,
    grout = T(finish === "stationPlatformTile" ? "#aaa69a" : "#948b7f");
  const value = (color) => {
    if (!highlight?.[3]) return color;
    const rgb = T(color)
      .slice(0, 3)
      .map((v, i) => Math.round(255 * (v * (1 - highlight[3]) + highlight[i] * highlight[3])));
    return "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");
  };
  for (const poly of area) M.m.polygon(poly, base, [0, 0, 1], grout);
  for (const [p, col] of full) {
    const color = value(col);
    if (M.fixtureInstances)
      M.fixtureInstances.add("station/tile", p, base, angle, [width, width, 0.003], [color, color], 1.025);
    else {
      const ring = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5]
      ].map(([x, y]) => [p[0] + width * (c * x - s * y), p[1] + width * (s * x + c * y)]);
      M.m.polygon([ring], z, [0, 0, 1], T(color));
    }
  }
  for (const [poly, col] of cut) {
    const color = T(value(col));
    M.m.polygon(poly, z, [0, 0, 1], color);
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          l = Math.hypot(dx, dy);
        if (l > 1e-6)
          M.m.quad(
            [
              [a, base],
              [b, base],
              [b, z],
              [a, z]
            ],
            [dy / l, -dx / l, 0],
            grout
          );
      }
  }
}
