// Local metre coordinates for the small cast and fabricated parts in the Kuramae forecourt.
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const scale = (a, t) => a.map((x) => x * t);
export const unit = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const circle = 2 * Math.PI;

export function modelFrame(mesh, origin, u, v, base) {
  const xy = (p) => [origin[0] + u[0] * p[0] + v[0] * p[1], origin[1] + u[1] * p[0] + v[1] * p[1]];
  const normal = (n) => [u[0] * n[0] + v[0] * n[1], u[1] * n[0] + v[1] * n[1], n[2]];
  function vertex(p, n, color) {
    mesh.vert(xy(p), base + p[2], normal(n), color);
  }
  function face(points, color, n) {
    const out = n || unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    for (let i = 1; i < points.length - 1; i++) for (const k of [0, i, i + 1]) vertex(points[k], out, color);
  }
  function box(x0, y0, z0, x1, y1, z1, c) {
    const bottom = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
    ];
    const top = bottom.map(([x, y]) => [x, y, z1]);
    face(top, c);
    face([...bottom].reverse(), c);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      face([bottom[i], bottom[j], top[j], top[i]], c);
    }
  }
  // Smooth rings use the actual changing profile tangent for the outward normals, including bevels.
  function rings(rows, color, cap = true) {
    const last = rows.length - 1,
      size = rows[0].length;
    const vs = rows.map((row, i) =>
      row.map((p, j) => {
        const lateral = sub(row[(j + 1) % size], row[(j + size - 1) % size]);
        const axial = sub(rows[Math.min(last, i + 1)][j], rows[Math.max(0, i - 1)][j]);
        const n = unit(cross(lateral, axial));
        return [p, n, typeof color === "function" ? color(p, n, i, j) : color];
      }),
    );
    for (let i = 0; i < last; i++)
      for (let j = 0; j < size; j++) {
        const k = (j + 1) % size,
          a = vs[i][j],
          b = vs[i][k],
          c = vs[i + 1][k],
          d = vs[i + 1][j];
        for (const vtx of [a, b, c, a, c, d]) vertex(...vtx);
      }
    if (cap)
      for (const i of [0, last]) {
        const row = rows[i],
          center = scale(row.reduce(add), 1 / size),
          col = vs[i][0][2];
        for (let j = 0; j < size; j++) {
          const a = row[j],
            b = row[(j + 1) % size];
          face(i === 0 ? [center, b, a] : [center, a, b], col);
        }
      }
  }
  function turned(x, y, profile, color, sides = 20) {
    rings(
      profile.map(([z, r]) =>
        Array.from({ length: sides }, (_, j) => {
          const a = (circle * j) / sides;
          return [x + r * Math.cos(a), y + r * Math.sin(a), z];
        }),
      ),
      color,
    );
  }
  function tube(points, r, color, sides = 9) {
    // Carry one normal along the bends to keep the round rail continuous.
    let hint = Math.abs(unit(sub(points[1], points[0]))[2]) > 0.8 ? [1, 0, 0] : [0, 0, 1];
    rings(
      points.map((p, i) => {
        const t = unit(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]));
        hint = unit(sub(hint, scale(t, dot(t, hint))));
        const side = cross(t, hint);
        return Array.from({ length: sides }, (_, j) =>
          add(p, add(scale(hint, r * Math.cos((circle * j) / sides)), scale(side, r * Math.sin((circle * j) / sides)))),
        );
      }),
      color,
    );
  }
  return { vertex, face, box, rings, turned, tube };
}
