import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { detailView, parseFeatures, preparePaving, prepareSurveyGround, toXY } from "../campus-sns/campus3dFeatures.js";
import { paintFeatures } from "../campus-sns/campus3dPaint.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const survey = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const local = survey.features.filter(f => f.id.startsWith("w9-") || f.id.startsWith("rd-wr-o1"));
const features = detailView(parseFeatures(local), { detail: true });
const wing = features.find(f => f.id === "w9-w6");
const origin = toXY(wing.coords[2]), west = toXY(wing.coords[3]);
const dx = west[0] - origin[0], dy = west[1] - origin[1], length = Math.hypot(dx, dy);
// Distances west along the frontage and south into the building, from the glazed corner.
const xy = (u, v) => [origin[0] + (dx*u - dy*v)/length, origin[1] + (dy*u + dx*v)/length];
const groundAt = () => 23.60;
const world = walkWorld({ data: { buildings: [] }, features, groundAt });
const mesh = buildMesh(features, { groundAt, clip, pal: PALETTES.light });

function depthAt(u, v, z, passes) {
  const origin = worldOf(xy(u, v)), end = worldOf(xy(u, v + 1));
  const ray = { o: [...origin, groundAt() + z], d: [end[0] - origin[0], end[1] - origin[1], 0] };
  const hit = raycastMesh(mesh, ray, passes);
  assert.ok(hit, "no surface along ray at " + [u, v, z]);
  return v + hit.t;
}

test("West 9 has a high outer opening, a lower glazed bridge and a roof over the colonnade", () => {
  for (const [u, v, underside] of [[-7, 9.3, 11.87], [-4.4, 13.2, 11.87], [-4.4, 16.2, 3.80], [12, 2, 3.36]]) {
    const start = groundAt() + 1.6;
    const hit = raycastMesh(mesh, { o: [...worldOf(xy(u, v)), start], d: [0, 0, 15] }, ["floors"]);
    assert.ok(hit);
    assert.ok(Math.abs(start + 15*hit.t - groundAt() - underside) < 0.05);
    const batch = mesh.floors.batches.find(b => hit.tri*3 >= b.first && hit.tri*3 < b.first + b.count);
    assert.equal(batch.finish, "slottedSoffit");
  }
  assert.ok(Math.abs(depthAt(-6.86, 8.7, 6.12, ["veil"]) - 14.61) < .06);
  const interior = world.floorBelow(...xy(-4.4, 16.2), groundAt() + 8.12);
  assert.ok(Math.abs(interior.z - groundAt() - 7.94) < .03);
});

test("the arcade has separate panes, blinds, deep window bays and a solid final pier", () => {
  const opaque = ["", "cull", "floors"];
  const glass = depthAt(8.52, 1.65, 1.81, ["glass"]);
  const blind = depthAt(8.52, 1.65, 1.81, opaque);
  const open = depthAt(19.77, 1.65, 1.81, opaque);
  const pier = depthAt(43.28, -.3, 1.2, opaque);
  assert.ok(Math.abs(glass - 4.18) < .04);
  assert.ok(blind > glass + .15 && blind < glass + .25);
  assert.ok(open > blind + .60);
  assert.ok(Math.abs(depthAt(21.80, 1.65, 1.81, opaque) - 4.05) < .03);
  assert.ok(Math.abs(pier - .34) < .035);
  assert.ok(depthAt(41.87, -.3, 1.2, opaque) > 4);
  for (const u of [.87, 8.01, 15.08, 22.18, 29.31, 36.43]) {
    assert.ok(Math.abs(depthAt(u, -.1, 1.25, opaque) - pier) < .04);
  }
});

function walk(points, scene = world, startHeight = 25.5, maxStep = Infinity) {
  let [x, y] = xy(...points[0]);
  let foot = scene.floorBelow(x, y, startHeight);
  const heights = [foot.z];
  for (const point of points.slice(1)) {
    const [a, b] = xy(...point), dx = a - x, dy = b - y;
    const steps = Math.ceil(Math.hypot(dx, dy)/0.09);
    for (let i = 0; i < steps; i++) {
      ({ x, y, floor: foot } = scene.move(x, y, foot.z, dx/steps, dy/steps, { deck: foot.deck }));
      assert.ok(Math.abs(foot.z - heights.at(-1)) <= maxStep, "height discontinuity on the way to " + point);
      heights.push(foot.z);
    }
    assert.ok(Math.hypot(x-a, y-b) < 0.14, "blocked on the way to " + point);
  }
  return Math.max(...heights) - Math.min(...heights);
}

test("the glazed vestibule has separate sliding doors toward the arcade, passage and interior", () => {
  for (const [u, v] of [[4.20, 4.05], [1.20, 6.85], [5.96, 6.43]]) {
    const [x, y] = xy(u, v);
    const door = mesh.doors.find(({ a, b }) => Math.hypot((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - y) < .05);
    assert.ok(door, "sliding door at " + [u, v]);
    assert.equal(door.kind, "bi");
    assert.ok(Math.abs(door.z0 - groundAt() - .12) < .02);
    assert.ok(Math.abs(door.z1 - door.z0 - 2.48) < .02);
  }
});

test("the vestibule, arcade and brick footpath stay level beside the descending road", () => {
  const routes = [
    [[3.4, 2.25], [36.6, 2.25]],
    [[4.12, 1.65], [4.12, 6.77], [-0.68, 6.77]],
    [[-0.72, 1.6], [-0.72, 12.35], [-3.84, 12.35]],
  ];
  for (const route of routes) {
    assert.ok(walk(route) < 0.16);
    assert.ok(walk([...route].reverse()) < 0.16);
  }
  const passage = [[-7, 5.4], [-6.35, 11.45], [-4.5, 18.5], [-3.5, 29]];
  walk(passage);
  walk([...passage].reverse());
  const road = [[2, -4.1], [42, -4.1]];
  assert.ok(walk(road) > 1.8);
  assert.ok(walk([...road].reverse()) > 1.8);
});

const measured = parseFeatures(survey.features.filter(f => f.groundBlend != null && /^w[59]-/.test(f.id)));
const terrain = prepareSurveyGround(measured.map(preparePaving).filter(Boolean));
const elevation = (u, v) => terrain.at(...xy(u, v), NaN);

test("the road follows independent ground returns from West 5 to the bend beyond West 9", () => {
  // Tokyo airborne LAS 09LD4655 and 09LD4656, JGD2011 plane IX. Each elevation is the median
  // of a 0.7 m ground-class cell that was held out from the surface fit.
  const returns = [
    [-52.86, -31.79, 29.23], [-42.25, -25.53, 28.14], [-31.82, -19.24, 27.17],
    [-17.85, -9.47, 25.95], [-8.76, -4.65, 25.11], [-.42, -4.49, 24.22],
    [3.85, -4.64, 23.97], [11.78, -4.95, 23.51], [21.29, -3.97, 22.90],
    [33.30, -4.67, 22.17], [44.48, -5.87, 21.46], [52.87, -5.88, 21.01],
    [62.08, -9.64, 20.10], [64.68, -10.91, 19.98],
  ];
  const errors = returns.map(([u, v, z]) => Math.abs(elevation(u, v) - z)).sort((a, b) => a - b);
  assert.ok(errors[Math.floor(errors.length / 2)] < .06);
  assert.ok(errors.at(-1) < .18);
  assert.equal(terrain.at(...xy(-38.69, -34.93), 28.55), 28.55);
  assert.equal(terrain.at(...xy(-25.84, 51.6), 23.60), 23.60);
});

test("road sections meet across paint bands and the bank continues past the final pier", () => {
  const raw = survey.features.filter(f => f.groundBlend != null && /^w[59]-/.test(f.id));
  for (const f of raw) {
    const plate = measured.find(g => g.id === f.id);
    assert.equal(plate?.grade?.length, f.coords.length, f.id + " lost its vertex elevations");
    if (f.sections) assert.equal(plate.sections, true, f.id + " lost its paired sections");
  }
  let last;
  for (let u = -1; u <= 55; u += .1) {
    const z = elevation(u, -4.45);
    assert.ok(Number.isFinite(z));
    if (last != null) assert.ok(Math.abs(z - last) < .025, "road seam at " + u);
    last = z;
  }
  assert.ok(elevation(10, -.01) > 23.68);
  assert.ok(elevation(45.5, -1) > 22.5);
  assert.ok(Math.abs(elevation(44.10, -1) - elevation(44.20, -1)) < .06);
  const curb = elevation(8, -8.18) - elevation(8, -7.96);
  assert.ok(curb > .04 && curb < .09, "measured curb " + curb);
  const lawn = measured.find(f => f.id === "w9-north-verge-1");
  const base = parseFeatures([survey.features.find(f => f.id === "rd-w-base")])[0];
  const ordered = paintFeatures([lawn, base]).surfaces.features.map(f => f.properties.id);
  assert.ok(ordered.indexOf(lawn.id) > ordered.indexOf(base.id));
});

test("the whole hillside road, curb crossing and arcade approach are walkable in both directions", () => {
  const corridor = survey.features.filter(f => /^w[59]-/.test(f.id) || f.id === "tmv4t9i4d5do7");
  const scene = walkWorld({
    data: { buildings: [] }, features: detailView(parseFeatures(corridor), { detail: true }),
    groundAt: ll => terrain.at(...toXY(ll), 23.6),
  });
  const routes = [
    { maxStep: .025, points: [[-57, -36], [-40, -24.65], [-25, -14.3], [-12, -6.5], [0, -4.4], [30, -5.1], [52, -5.9], [58, -7.2], [64, -10.8]] },
    { maxStep: .085, points: [[5, -6.5], [5, -8.36], [5, -9.45]] },
    { maxStep: .075, points: [[40, -1.1], [43.5, -1.14], [45.5, -1.28], [47.7, -1.3]] },
    { maxStep: .06, points: [[4.12, -4.55], [4.12, -.4], [4.12, 1.75], [4.12, 6.77]] },
  ];
  for (const { points, maxStep } of routes) {
    for (const dir of [points, [...points].reverse()]) {
      const start = scene.pavedHeight(...xy(...dir[0]));
      assert.ok(Number.isFinite(start));
      walk(dir, scene, start + .16, maxStep);
    }
  }
});
