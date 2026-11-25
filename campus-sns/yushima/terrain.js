import { grid, samples } from "./terrainGrid.js";

export const terrainGrid = grid;
export const streetGridStep = grid.step / 4;
const heights = new Int16Array(grid.width * grid.depth);
const bytes = atob(samples);
let cursor = 0;
for (let row = 0; row < grid.depth; row++) {
  let elevation = 0;
  for (let col = 0; col < grid.width; col++) {
    let delta = 0, shift = 0, byte;
    do {
      byte = bytes.charCodeAt(cursor++);
      delta |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    elevation += (delta >>> 1) ^ -(delta & 1);
    heights[row * grid.width + col] = elevation;
  }
}

// The NW–SE diagonal matches the two ground triangles in each 5 m cell.
export function groundHeight(x, z) {
  const gx = Math.max(0, Math.min(grid.width - 1, (x - grid.xMin) / grid.step));
  const gz = Math.max(0, Math.min(grid.depth - 1, (z - grid.zMin) / grid.step));
  const col = Math.min(grid.width - 2, Math.floor(gx));
  const row = Math.min(grid.depth - 2, Math.floor(gz));
  const u = gx - col, v = gz - row, index = row * grid.width + col;
  const nw = heights[index], se = heights[index + grid.width + 1];
  const height = u > v
    ? nw * (1 - u) + heights[index + 1] * (u - v) + se * v
    : nw * (1 - v) + heights[index + grid.width] * (v - u) + se * u;
  return height / 10 - grid.datum;
}
