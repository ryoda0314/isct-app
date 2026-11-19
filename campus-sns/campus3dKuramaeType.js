// Letter contours from the project’s Noto Sans JP font, in 1/500 em. Counters stay open all the way through each raised letter.
import earcut from "earcut";
import glyphs from "./campus3dKuramaeGlyphs.js";
const cache = new Map();
const area = (loop) =>
  loop.reduce((s, a, i) => {
    const b = loop[(i + 1) % loop.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);
function contains(loop, [x, y]) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[j],
      b = loop[i];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function letter(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const [advance, loops] = glyphs[ch];
  const sorted = loops
    .map((points) => ({ points, size: Math.abs(area(points)), holes: [] }))
    .sort((a, b) => b.size - a.size);
  const faces = [];
  for (let i = 0; i < sorted.length; i++) {
    const part = sorted[i];
    const parent = sorted
      .slice(0, i)
      .reverse()
      .find((o) => contains(o.points, part.points[0]));
    part.hole = parent ? !parent.hole : false;
    if (part.hole) parent.holes.push(part.points);
    else faces.push(part);
  }
  const shape = {
    advance,
    faces: faces.map((part) => {
      const rings = [part.points, ...part.holes],
        pts = rings.flat(),
        holes = [];
      let count = part.points.length;
      for (const h of part.holes) {
        holes.push(count);
        count += h.length;
      }
      return { pts, idx: earcut(pts.flat(), holes, 2) };
    }),
    loops,
  };
  cache.set(ch, shape);
  return shape;
}
export function raisedLine(g, text, at, width, height, thickness, face, edge, emHeight = 370) {
  const tracking = 18,
    chars = [...text],
    advance = (ch) => (ch === " " ? 142 : letter(ch).advance);
  const total = chars.reduce((sum, ch) => sum + advance(ch) + tracking, 0) - tracking;
  const sx = width / total,
    sy = height / emHeight;
  let pen = 0;
  for (const ch of chars) {
    if (ch !== " ") {
      const shape = letter(ch);
      const v = (p, d) => at((pen + p[0]) * sx, p[1] * sy, d);
      for (const { pts, idx } of shape.faces)
        for (let i = 0; i < idx.length; i += 3) {
          const a = pts[idx[i]],
            b = pts[idx[i + 1]],
            c = pts[idx[i + 2]];
          g.face([v(a, thickness), v(b, thickness), v(c, thickness)], face);
          g.face([v(c, 0), v(b, 0), v(a, 0)], edge);
        }
      for (const loop of shape.loops)
        for (let j = 0; j < loop.length; j++) {
          const a = loop[j],
            b = loop[(j + 1) % loop.length];
          g.face([v(a, 0), v(b, 0), v(b, thickness), v(a, thickness)], edge);
        }
    }
    pen += advance(ch) + tracking;
  }
}
