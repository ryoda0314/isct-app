import assert from "node:assert/strict";
import test from "node:test";
import { dropSize, dropSpeed, rainAmount } from "../campus-sns/campus3dPrecip.js";
import { rainMaterial, rainTile } from "../campus-sns/campus3dRainGround.js";
import { toLngLat } from "../campus-sns/campus3dFeatures.js";
import { paintFeatures } from "../campus-sns/campus3dPaint.js";

test("rain strikes the grade outside an eave, the roof above it, and the same height on adjoining tiles", () => {
  const grade = (x, y) => 32 + 0.13 * x + 0.06 * y;
  const roof = (x, y) => (x >= -4 && x < 0 && y >= 1 && y < 5 ? 37.5 : -Infinity);
  const west = rainTile(-8, 0, grade, roof),
    east = rainTile(0, 0, grade, roof);
  for (let y = 0; y < 5; y++) assert.equal(west.ground[y * 5 + 4], east.ground[y * 5]);
  for (const [tile, left] of [
    [west, -8],
    [east, 0],
  ]) {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const at = 4 * (y * 8 + x),
          px = left + x + 0.5,
          py = y + 0.5;
        const h = (tile.heights[at] * 256 + tile.heights[at + 1]) * 0.05 - 256;
        assert.equal(tile.heights[at + 3], 255);
        assert.ok(Math.abs(h - Math.max(grade(px, py), roof(px, py))) <= 0.02501);
      }
  }
  const missing = rainTile(
    0,
    0,
    () => NaN,
    (x) => (x < 1 ? 42 : -Infinity),
  );
  assert.equal(missing.heights[3], 255, "a canopy still intercepts rain before the DEM is ready");
  assert.equal(missing.heights[7], 0, "a missing DEM cell must not produce a ground plane");
});

test("real paving finishes control the water film, from tree beds to boards and asphalt", () => {
  const coords = [
    [0, 0],
    [5, 0],
    [5, 5],
    [0, 5],
  ].map(toLngLat);
  const surfaces = ["lawn", "gravel", "wood", "tile", "road"].map((kind) => ({
    type: "surface",
    id: kind,
    kind,
    coords,
  }));
  const painted = paintFeatures(surfaces).surfaces.features;
  const values = Object.fromEntries(painted.map(({ properties }) => [properties.id, rainMaterial(properties)]));
  assert.equal(values.lawn, 0);
  assert.equal(values.gravel, 0);
  assert.ok(values.wood > 0 && values.wood < values.tile && values.tile < values.road);
  assert.equal(rainMaterial({ paving: "rootBed", kind: "walk" }), 0);
  assert.equal(rainMaterial({ paving: "grass", kind: "road" }), 0);
  assert.equal(rainAmount(0), 0);
  for (const [a, b] of [
    [1.2, 6],
    [6, 30],
  ]) {
    assert.ok(rainAmount(a) < rainAmount(b) && rainAmount(b) < 1);
    assert.ok(dropSpeed(dropSize(a)) < dropSpeed(dropSize(b)));
  }
});
