import assert from "node:assert/strict";
import test from "node:test";
import { starMatrix } from "../campus-sns/campus3dEnv.js";
import { visiblePlanets } from "../campus-sns/campus3dPlanets.js";
import { BRIGHT_STARS } from "../campus-sns/campus3dStarCatalog.js";
import { equatorialDirection, twilightLimit } from "../campus-sns/campus3dStars.js";

const winter = new Date("2026-01-15T12:00:00Z");
const summer = new Date("2026-08-12T11:30:00Z");
const degree = Math.PI / 180;

function horizontal(vector, date) {
  const m = starMatrix(date);
  const [east, north, up] = [0, 1, 2].map((i) => m[0][i] * vector[0] + m[1][i] * vector[1] + m[2][i] * vector[2]);
  return [(Math.atan2(east, north) / degree + 360) % 360, Math.asin(up) / degree];
}
function close(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

// Independent airless topocentric reference, Astronomy Engine 2.1.19 at 35.6058 N, 139.6845 E.
test("the pole, Orion's belt and the Summer Triangle keep the correct handedness and hour angle in Tokyo", () => {
  for (const [hr, date, az, alt] of [
    [424, winter, 359.633, 36.157],
    [2491, winter, 149.319, 31.76],
    [1852, winter, 165.375, 53.211],
    [1903, winter, 164.006, 52.101],
    [1948, winter, 162.511, 51.112],
    [7001, summer, 55.749, 84.024],
    [7557, summer, 133.551, 54.98],
    [7924, summer, 59.266, 60.19],
    [2491, summer, 336.036, -69.687],
  ]) {
    const [, ra, dec] = BRIGHT_STARS.find((star) => star[0] === hr);
    const [bearing, elevation] = horizontal(equatorialDirection(ra, dec), date);
    close(bearing, az, 0.075);
    close(elevation, alt, 0.025);
  }
  const betelgeuse = BRIGHT_STARS.find((star) => star[0] === 2061),
    rigel = BRIGHT_STARS.find((star) => star[0] === 1713);
  assert.ok(betelgeuse[4] - rigel[4] > 1.5);
  close(BRIGHT_STARS[0][3], -1.46, 0.01);
});

test("the urban limit admits fainter stars as the sun sets and the catalogue covers its soft edge", () => {
  const limits = [4, 0, -3, -6, -9, -12, -18, -70].map(twilightLimit);
  assert.deepEqual(
    limits,
    [...limits].sort((a, b) => a - b),
  );
  assert.ok(limits[0] < -5 && limits.at(-1) > 3.5);
  assert.ok(BRIGHT_STARS.at(-1)[3] >= limits.at(-1) + 0.18);
});

test("the naked-eye planets move independently against the catalogue and retain their apparent brightness", () => {
  const morning = new Date("2026-11-19T19:00:00Z");
  for (const [date, name, az, alt, mag] of [
    [winter, "Jupiter", 102.812, 55.716, -2.67],
    [winter, "Saturn", 259.382, 9.17, 1.04],
    [morning, "Venus", 104.678, 3.959, -4.83],
    [morning, "Mars", 124.715, 57.837, 0.65],
    [morning, "Mercury", 98.069, -9.29, -0.55],
  ]) {
    const planet = visiblePlanets(date).find((body) => body.name === name);
    const [bearing, elevation] = horizontal(planet.direction, date);
    close(bearing, az, 0.3);
    close(elevation, alt, 0.25);
    close(planet.magnitude, mag, 0.2);
  }
});
