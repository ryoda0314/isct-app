import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { burnsGround, detailView, parseFeatures, prepareBridge, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const data = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const features = detailView(parseFeatures(data.features.filter(f => /^s[24](-|av-)/.test(f.id))), { detail: true });
const byId = id => features.find(f => f.id === id);
const stair = byId("s2-stair-n");
const refs = [["s2-main", 30.55], ["s4-7e-box", 31.9375]].map(([id, z]) => [toXY(byId(id).groundRef), z]);
const groundAt = ll => {
  const [x, y] = toXY(ll);
  return refs.find(([[a, b]]) => Math.hypot(x-a, y-b) < .04)?.[1] ?? 31.76;
};
const decks = features.filter(f => f.type === "bridge").map(f => prepareBridge(f, groundAt));
const world = walkWorld({ data: { buildings: [] }, features, groundAt, decks });
const g = decks.find(d => d.f.id === stair.id).flight;
const origin = toXY([139.6843047, 35.6031837]), theta = 7.7 * Math.PI / 180;
// Survey station u increases towards the upper entrance. Positive v faces South 2.
const xy = (u, v) => [origin[0]-u*Math.cos(theta)-v*Math.sin(theta), origin[1]+u*Math.sin(theta)-v*Math.cos(theta)];
const near = (a, b, eps = .025) => assert.ok(Math.abs(a-b) < eps, `${a} should be within ${eps} of ${b}`);

test("the 23 stone noses share the walk heights and leave a sloping soffit and two open sides", () => {
  assert.equal(stair.steps, 23);
  assert.equal(burnsGround(stair), false);
  near(g.low, 31.77);
  near(g.rise, 3.83);
  near(g.tread, .30, .015);
  const across = id => byId(id).coords.map(ll => g.across(...toXY(ll)));
  near(-Math.max(...across("s4-7e-brick-s"))-stair.width/2, 1.66, .03);
  near(Math.min(...across("s2-main"))-stair.width/2, .55, .04);
  const mesh = buildMesh([stair], { groundAt, clip, pal: PALETTES.light });
  const ray = (p, z, dz) => raycastMesh(mesh, { o: [...worldOf(p), z], d: [0, 0, dz] });
  for (let i = 0; i < stair.steps-1; i++) {
    const s = (i+.5)*g.tread, top = g.low+(i+1)*g.riser;
    near(40-ray(g.at(s, 0), 40, -1).t, top);
    near(g.top(s), top);
  }
  near(g.top(g.length), 35.60);
  near(32+ray(xy(6.35, .3), 32, 1).t, g.under(g.run(...xy(6.35, .3))));
  for (const v of [-2.54, 1.96]) assert.equal(ray(xy(3.8, v), 32, 1), null);
  const reverse = prepareBridge({ ...stair, coords: [...stair.coords].reverse(), z: [...stair.z].reverse() }, groundAt);
  near(reverse.treadAt(reverse.flight.length*.70), g.top(g.length*.30));
});

test("the rear steel stair has separate folded treads with visible gaps between them", () => {
  const steel = byId("s4-escape-2-lower"), flight = decks.find(d => d.f.id === steel.id).flight;
  const mesh = buildMesh([steel], { groundAt, clip, pal: PALETTES.light });
  const s = 5*flight.tread, z = flight.top(s)-flight.riser*.57;
  const a = worldOf(flight.at(s-.07, 0)), b = worldOf(flight.at(s+.07, 0));
  const through = raycastMesh(mesh, { o: [...a, z], d: [b[0]-a[0], b[1]-a[1], 0] });
  assert.ok(!through || through.t > 1);
  const below = raycastMesh(mesh, { o: [...worldOf(flight.at(s+.14, 0)), z-.40], d: [0, 0, 1] });
  near(z-.40+below.t, flight.top(s)-.025);
});

function walk(stations, startZ) {
  let [x, y] = xy(...stations[0]), floor = world.floorBelow(x, y, startZ+.24);
  const heights = [floor.z];
  for (const station of stations.slice(1)) {
    const [tx, ty] = xy(...station), dx = tx-x, dy = ty-y, n = Math.ceil(Math.hypot(dx, dy)/.075);
    for (let i=0; i<n; i++) {
      ({ x, y, floor } = world.move(x, y, floor.z, dx/n, dy/n, { deck: floor.deck }));
      heights.push(floor.z);
    }
    assert.ok(Math.hypot(x-tx, y-ty) < .10, "blocked on the way to " + station);
  }
  return heights;
}

test("all 23 risers lead into the South 2 second-floor doorway in both directions", () => {
  const route = [[-1, 0], [7.64, 0], [8.72, .32], [8.72, 3.18]];
  for (const reverse of [false, true]) {
    const heights = walk(reverse ? [...route].reverse() : route, reverse ? 35.60 : 31.77);
    const changes = heights.slice(1).map((z, i) => z-heights[i]).filter(h => Math.abs(h) > .1);
    assert.equal(changes.length, 23);
    for (const rise of changes) near(rise, (reverse ? -1 : 1)*3.83/23);
    near(heights.at(-1), reverse ? 31.77 : 35.60);
  }
});

test("pavement continues beside the brick wall, below the main flight and behind the landings", () => {
  const lanes = [
    [[-2.5, -2.54], [6, -2.54], [10.8, -2.54]],
    [[6.35, -2.54], [6.35, 1.64]],
    [[9.55, -2.6], [10.65, -2.1], [11.1, .12], [19.84, .10]],
  ];
  for (const lane of lanes) for (const route of [lane, [...lane].reverse()]) {
    for (const height of walk(route, 31.76)) near(height, 31.76, .09);
  }
  const escape = [[11.2, -2.74], [16.85, -2.74], [17.12, -1.425], [16.45, -1.425], [11.6, -1.425], [10.1, -1.42]];
  near(walk(escape, 31.73).at(-1), 35.60);
  near(walk([...escape].reverse(), 35.60).at(-1), 31.73);
});
