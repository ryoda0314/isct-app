import clip from "polygon-clipping";

const cache = new WeakMap();
const woodTones = ["#cfb995", "#bda887", "#c8b294", "#d4c3a7", "#d0bda2", "#c4ad8d", "#d7c7ad"];
const tileTones = ["#bdbbb3", "#c4c2ba", "#c1bfb6", "#c8c5bc", "#c5c3bc"];
const ceramicTones = ["#c8c6ba", "#d0cec1", "#cccabd", "#c5c5b9"];
const materialRGB = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
function cutTiles(area, uv, finish) {
  if (cache.has(area)) return cache.get(area);
  const wood = finish === "marketPlanks", ceramic = finish === "marketTile";
  const [ux] = uv([1, 0]),
    [uy] = uv([0, 1]);
  const scaleU = Math.hypot(ux, uy);
  const c = ux / scaleU,
    s = uy / scaleU,
    rotate = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  const map = (p) => [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  const surface = area.map((poly) => poly.map((r) => r.map(rotate)));
  const points = surface.flat(2),
    minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  const width = wood ? 0.168 : ceramic ? 1 / scaleU : 0.615,
    length = wood ? 1.26 : width,
    gap = wood ? 0.0023 : 0.0018,
    pieces = [];
  for (let row = Math.floor(minY / width); row <= Math.floor(maxY / width); row++) {
    const offset = wood ? (length * ((((row * 137) % 101) + 101) % 101)) / 101 : 0;
    for (let col = Math.floor((minX - offset) / length); col <= Math.floor((maxX - offset) / length); col++) {
      const x = col * length + offset,
        y = row * width,
        rect = [
          [x + gap, y + gap],
          [x + length - gap, y + gap],
          [x + length - gap, y + width - gap],
          [x + gap, y + width - gap]
        ];
      const clipped = clip.intersection(surface, [rect]);
      if (!clipped.length) continue;
      const id = Math.abs(Math.imul(row, 11939) ^ Math.imul(col, 3011)),
        tones = wood ? woodTones : ceramic ? ceramicTones : tileTones;
      const rings = clipped.map((p) => p.map((r) => r.map(map)));
      const grains = [];
      if (
        wood &&
        id % 5 !== 0 &&
        clipped.length === 1 &&
        clipped[0][0].length === 5 &&
        clipped[0][0].every((p) => rect.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.00001))
      ) {
        // Short tapered strips are part of each board, following its own grain direction.
        for (let g = 0; g < 2; g++) {
          const a = x + 0.1 + ((id + g * 31) % 37) * 0.012,
            b = Math.min(x + length - 0.09, a + 0.24 + ((id + g * 17) % 19) * 0.019);
          const t = y + 0.025 + (((id + g * 37) % 98) / 98) * 0.118,
            mid = (a + b) / 2;
          grains.push(
            [
              [a, t],
              [mid, t + 0.0037],
              [b, t + 0.003],
              [mid, t + 0.0022]
            ].map(map)
          );
        }
      }
      pieces.push({ rings, grains, tone: materialRGB(tones[id % tones.length]) });
    }
  }
  cache.set(area, pieces);
  return pieces;
}

export function drawMarketFloor(M, area, finish, uv, z, T, highlight) {
  const wood = finish === "marketPlanks",
    grout = T(wood ? "#a69377" : finish === "marketTile" ? "#a8aaa0" : "#b6b3ac");
  const pieces = cutTiles(area, uv, finish),
    base = z - 0.003;
  if (M.finishes) {
    if (!M.finishes.has(finish)) M.finishes.set(finish, []);
    M.finishes.get(finish).push({ area, z: base, uv, highlight: [grout[0], grout[1], grout[2], 1] });
  } else for (const p of area) M.m.polygon(p, base, [0, 0, 1], grout);
  for (const { rings, grains, tone } of pieces) {
    const rgb = tone.map((v, i) => v * (1 - highlight[3]) + highlight[i] * highlight[3]);
    if (M.finishes) M.finishes.get(finish).push({ area: rings, z, uv, highlight: [...rgb, 0.72] });
    else for (const p of rings) M.m.polygon(p, z, [0, 0, 1], [...rgb, 0.5]);
    for (const poly of rings)
      for (const ring of poly)
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1],
            b = ring[i],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            l = Math.hypot(dx, dy);
          if (l > 1e-7)
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
    for (const grain of grains) M.m.polygon([grain], z + 0.0006, [0, 0, 1], rgb.map((v) => v * 0.94).concat(0.5));
  }
}
