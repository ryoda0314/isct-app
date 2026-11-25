// Local map coordinates are metres east/north. Bearings increase clockwise from north.
export const DEG = Math.PI / 180;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const norm360 = (a) => ((a % 360) + 360) % 360;
export const angDiffV = (to, from) => norm360(to - from + 180) - 180;
export const fwdOf = (yaw) => [Math.sin(yaw * DEG), Math.cos(yaw * DEG)];
export const leftOf = (yaw) => [-Math.cos(yaw * DEG), Math.sin(yaw * DEG)];
export const spanBlocked = (world, x, y, lo, hi) => world.blockedSpan
  ? world.blockedSpan(x, y, lo, hi) : world.blocked(x, y, lo - 0.1);
export const floorZ = (world, x, y, z, step) => world.floorBelow(x, y, z + step)?.z ?? null;
