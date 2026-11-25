import earcut from "earcut";
import { marketLetters } from "./campus3dMarketLettering.js";

const colors = new Map();
// Procedural finishes for the outdoor architectural meshes. These IDs, like clear
// glass and illuminated lettering, travel with the vertices in the material channel.
const streetFinishes = {
  glass: 5, brick: 6, tile: 7, stucco: 8, road: 9, canvas: 10, timber: 11, frost: 12,
  stone: 13, shopglass: 14, slab: 15, tintedglass: 16,
  ashlar: 17, carvedStone: 18, cutGranite: 19, doorGlass: 20, spall: 21,
  castConcrete: 22, punchedMetal: 23, patina: 24, polishedGranite: 25, broadleaf: 26, portraitBronze: 27
};
export function marketRGB(hex) {
  if (!colors.has(hex))
    colors.set(
      hex,
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    );
  return colors.get(hex);
}
export const unit = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
};
const difference = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const TAU = 2 * Math.PI;
const glyphs = new Map();
function glyph(style, ch) {
  const key = style + ch;
  if (glyphs.has(key)) return glyphs.get(key);
  const [advance, ...contours] = marketLetters[style]?.[ch] || marketLetters.sans[ch] || [142];
  const rings = contours.map((r) => {
    let area = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) area += r[j] * r[i + 1] - r[i] * r[j + 1];
    return { r, area };
  });
  const exterior = rings.reduce((a, b) => (Math.abs(a.area) > Math.abs(b.area) ? a : b), { area: 0 });
  const shells = rings.filter((o) => o.area * exterior.area > 0).map((o) => ({ ...o, holes: [] }));
  const inside = (r, x, y) => {
    let hit = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2)
      if (r[i + 1] > y !== r[j + 1] > y && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i])
        hit = !hit;
    return hit;
  };
  for (const hole of rings.filter((o) => o.area * exterior.area < 0)) {
    const parent = shells
      .filter((o) => inside(o.r, hole.r[0], hole.r[1]))
      .sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
    if (parent) parent.holes.push(hole.r);
  }
  const shapes = shells.map(({ r, holes }) => {
    const points = r.slice(),
      starts = [];
    for (const h of holes) {
      starts.push(points.length / 2);
      points.push(...h);
    }
    return { points, indices: earcut(points, starts) };
  });
  const out = { advance, rings: contours, shapes };
  glyphs.set(key, out);
  return out;
}

// Local x points right, y toward the back of a fixture, z upward. Material 1 is
// the item's main colour and material 2 its accent. All other colours are fixed.
export class MarketModel {
  constructor(detail = true) {
    this.detail = detail;
    this.v = [];
    this.i = [];
    this.glassIndices = [];
  }
  vertex(p, n, material) {
    const clear = material === "clear", dynamic = typeof material === "number";
    const luminous = !dynamic && material.startsWith("lit:");
    const sep = !dynamic && !clear ? material.indexOf(":") : -1;
    const finish = sep > 0 ? streetFinishes[material.slice(0, sep)] : 0;
    const rgb = clear ? [0.84, 0.9, 0.89] : dynamic ? [1, 1, 1] : marketRGB(sep > 0 ? material.slice(sep + 1) : material);
    const i = this.v.length / 10;
    this.v.push(...p, ...n, ...rgb, finish || (luminous ? 4 : clear ? 3 : dynamic ? material : 0));
    return i;
  }
  face(points, mat, expected, indices = this.i) {
    const a = points[0];
    let n = unit(cross(difference(points[1], a), difference(points[2], a)));
    if (expected && dot(n, expected) < 0) n = n.map((x) => -x);
    const i = this.v.length / 10;
    for (const p of points) this.vertex(p, n, mat);
    for (let j = 1; j + 1 < points.length; j++) indices.push(i, i + j, i + j + 1);
  }
  windowPane(left, right, bottom, top, y, tint, finish = "shopglass") {
    // The sash supplies the thickness. Both sides look through the same sheet.
    this.face([[left, y, bottom], [right, y, bottom], [right, y, top], [left, y, top]],
      finish + ":" + tint, [0, -1, 0], this.glassIndices);
  }
  // Successive closed cross sections form package shoulders, folded tops, tray lips and bottle necks.
  loft(rings, mat) {
    const center = (ring) => ring[0].map((_, k) => ring.reduce((s, p) => s + p[k], 0) / ring.length);
    for (let j = 1; j < rings.length; j++) {
      const a = rings[j - 1],
        b = rings[j],
        ca = center(a),
        cb = center(b);
      for (let i = 0; i < a.length; i++) {
        const k = (i + 1) % a.length,
          dir = a[i].map((v, t) => a[k][t] + v + b[i][t] + b[k][t] - 2 * ca[t] - 2 * cb[t]);
        this.face([a[i], a[k], b[k], b[i]], Array.isArray(mat) ? mat[j - 1] : mat, dir);
      }
    }
    this.face(rings[0], Array.isArray(mat) ? mat[0] : mat, [0, 0, -1]);
    this.face(rings.at(-1), Array.isArray(mat) ? mat.at(-1) : mat, [0, 0, 1]);
  }
  rect(x, y, z, w, d) {
    return [
      [x - w / 2, y - d / 2, z],
      [x + w / 2, y - d / 2, z],
      [x + w / 2, y + d / 2, z],
      [x - w / 2, y + d / 2, z]
    ];
  }
  box(x, y, z, w, d, h, mat) {
    this.loft([this.rect(x, y, z, w, d), this.rect(x, y, z + h, w, d)], mat);
  }
  ring(x, y, z, rx, ry, n = 12, phase = 0) {
    return Array.from({ length: n }, (_, i) => [
      x + rx * Math.cos((i * TAU) / n + phase),
      y + ry * Math.sin((i * TAU) / n + phase),
      z
    ]);
  }
  turned(x, y, profile, mat, n = this.detail ? 12 : 7) {
    this.loft(
      profile.map(([z, rx, ry = rx]) => this.ring(x, y, z, rx, ry, n)),
      mat
    );
  }
  oval(x, y, z, rx, ry, rz, mat, n = this.detail ? 12 : 7, steps = this.detail ? 7 : 4) {
    const start = this.v.length / 10;
    for (let j = 0; j <= steps; j++) {
      const t = (Math.PI * j) / steps - Math.PI / 2,
        c = Math.cos(t),
        s = Math.sin(t);
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n,
          vx = c * Math.cos(a),
          vy = c * Math.sin(a);
        this.vertex([x + rx * vx, y + ry * vy, z + rz * s], unit([vx / rx, vy / ry, s / rz]), mat);
      }
    }
    for (let j = 0; j < steps; j++)
      for (let i = 0; i < n; i++) {
        const a = start + j * n + i,
          b = start + j * n + ((i + 1) % n);
        if (j > 0) this.i.push(a, b, b + n);
        if (j < steps - 1) this.i.push(a, b + n, a + n);
      }
  }
  tube(points, radii, mat, n = this.detail ? 7 : 5) {
    const rings = points.map((p, i) => {
      const tangent = unit(difference(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]));
      const a = unit(cross(tangent, Math.abs(tangent[2]) < 0.85 ? [0, 0, 1] : [0, 1, 0])),
        b = cross(tangent, a);
      const r = Array.isArray(radii) ? radii[i] : radii;
      return Array.from({ length: n }, (_, j) =>
        p.map((v, k) => v + r * (Math.cos((j * TAU) / n) * a[k] + Math.sin((j * TAU) / n) * b[k]))
      );
    });
    this.loft(rings, mat);
  }
  // Trim geometry is also used for lettering on folded packages and on the checkout screens.
  text(value, cx, y, baseline, width, cap, mat, depth = 0.012, style = "sans") {
    const letters = [...value].map((c) => glyph(style, c)),
      total = letters.reduce((s, g) => s + g.advance, 0);
    if (!total) return;
    const sy = cap / 204,
      sx = Math.min(width / total, sy * 1.18);
    let x = cx - (total * sx) / 2;
    for (const g of letters) {
      for (const { points, indices } of g.shapes) {
        const start = this.v.length / 10;
        for (let k = 0; k < points.length; k += 2)
          this.vertex([x + sx * points[k], y - depth, baseline + sy * points[k + 1]], [0, -1, 0], mat);
        for (const i of indices) this.i.push(start + i);
      }
      if (depth > 0)
        for (const ring of g.rings)
          for (let j = 0; j < ring.length; j += 2) {
            const k = (j + 2) % ring.length,
              a = [x + sx * ring[j], y, baseline + sy * ring[j + 1]],
              b = [x + sx * ring[k], y, baseline + sy * ring[k + 1]];
            this.face([a, b, [b[0], y - depth, b[2]], [a[0], y - depth, a[2]]], mat);
          }
      x += sx * g.advance;
    }
  }
  finish() {
    const Index = this.v.length / 10 > 65535 ? Uint32Array : Uint16Array;
    const indices = new Index(this.i.length + this.glassIndices.length);
    indices.set(this.i);
    indices.set(this.glassIndices, this.i.length);
    return {
      vertices: Float32Array.from(this.v),
      indices,
      opaqueCount: this.i.length
    };
  }
}
