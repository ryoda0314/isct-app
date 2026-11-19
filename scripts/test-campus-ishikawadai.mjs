import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import clip from "polygon-clipping";
import sharp from "sharp";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { stepDoors } from "../campus-sns/campus3dDoors.js";
import { burnsGround, detailView, parseFeatures, prepareBridge, replacedBuildings, stairsPath, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { BASEMAP } from "../campus-sns/campusBasemapData.js";
import { dem } from "../campus-sns/campusDem.js";

// Local metres. The avenue and the workshop frontage run parallel to the v axis.
const origin = toXY([139.68435, 35.6027]), angle = -7.7 * Math.PI / 180;
const c = Math.cos(angle), s = Math.sin(angle);
const xy = (u, v) => [origin[0] + c*u - s*v, origin[1] + s*u + c*v];
const inDistrict = ([lng, lat]) => lng > 139.68351 && lng < 139.68548 && lat > 35.60156 && lat < 35.60364;
const raw = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const features = detailView(parseFeatures(raw.features.filter(f => f.coords.some(inDistrict))), { detail: true, level: "all" });
const byId = new Map(features.map(f => [f.id, f]));

for (const y of [12911, 12912]) {
  const tile = new URL("../public/map-dem/15/29098/" + y + ".png", import.meta.url);
  const { data, info } = await sharp(fileURLToPath(tile)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const z = new Float32Array(info.width * info.height);
  for (let i = 0; i < z.length; i++) {
    const j = i * info.channels;
    z[i] = data[j] * 256 + data[j+1] + data[j+2] / 256 - 32768;
  }
  dem.tiles.set("29098/" + y, z);
}
dem.setBurns(features.filter(burnsGround));
const groundAt = p => dem.groundAt(p);
const decks = [
  ...features.filter(f => f.type === "bridge").map(f => prepareBridge(f, groundAt)),
  ...dem.slopes.filter(sl => sl.f.type === "stairs").map(sl => stairsPath(sl)),
].filter(Boolean);
const buildings = BASEMAP.buildings.filter(b => b.p.some(([lat,lng]) => inDistrict([lng,lat])));
const world = walkWorld({ data: { buildings }, features, replaced: replacedBuildings(features, buildings),
  groundAt, surfaceAt: p => dem.surfaceAt(p), decks, digs: dem.digs });

function walkBothWays(route, maxStep, streetLevel) {
  for (const path of [route, [...route].reverse()]) {
    let [x,y] = xy(...path[0]);
    let floor = world.floorBelow(x, y, streetLevel ?? groundAt(toLngLat([x,y])) + .85);
    assert.ok(floor);
    for (const point of path.slice(1)) {
      const [ex,ey] = xy(...point), dx = ex-x, dy = ey-y;
      const count = Math.ceil(Math.hypot(dx,dy) / .1);
      for (let i = 0; i < count; i++) {
        const oldZ = floor.z;
        ({x,y,floor} = world.move(x, y, oldZ, dx/count, dy/count, { deck: floor.deck }));
        assert.ok(floor && Math.abs(oldZ-floor.z) < maxStep, "unexpected step toward " + point);
      }
      assert.ok(Math.hypot(ex-x, ey-y) < .12, "obstruction approaching " + point);
    }
  }
}

test("both routes from the Seven-Eleven frontage reach Ishikawadai; the lower workshop path joins the avenue", () => {
  const avenue = [[-8.25,63.5],[-4.5,63.5],[-2.65,55],[-2.6,49],[-2.62,42],[-2.6,27],[-2.55,15.4],[-.45,9.8],[-.45,3.5],[-1.05,.8]];
  const gates = [[-3.1,-5.4],[-3.44,-15],[-3.59,-19.7],[-4.1,-25.8],[-4.83,-31.7],[-4.83,-39.7],
    [-4.88,-44.15],[-4.92,-45.3],[-4.88,-47.6],[-4.15,-50],[-4.15,-54.8],[-2.02,-56.6],[-1.84,-59.9],
    [-1.98,-63.5],[.75,-66.3],[3.45,-70.7],[3.53,-75.8]];
  const underpass = [[2.3,-7.88],[2.3,-20],[2.3,-31.4],[2.36,-41.45],[2.95,-47.45],[3.3,-48.7],
    [5.86,-53.43],[9.45,-58.17],[10,-59.45],[11.5,-61.05],[14.45,-63.2],[18.1,-64.83],[22.3,-65.31],
    [29.35,-65.35],[34,-65.7],[36,-69.3],[37,-77.2],[37,-83.5],[37,-88.6]];
  walkBothWays([...avenue, ...gates], .11);
  walkBothWays([...avenue, ...underpass], .11);
  walkBothWays([[-4.67,52.8],[-4.62,49.1],[-4.64,45],[-4.65,34],[-4.64,25.7],[-4.66,15],[-4.64,12.7]], .2);
  // The joint between the two planting beds is a side path, with a narrow concrete rim on each side.
  walkBothWays([[-4.8,-41.06],[-6.4,-40.96],[-7.35,-40.82],[-8.4,-40.25],[-10,-39.6],
    [-12,-38.75],[-15,-37.94],[-17,-37.48],[-19,-37.1],[-20.6,-36.8]], .05);
});

test("the street spans a separate asphalt tunnel, with a continuous upper roadbed", () => {
  walkBothWays([[19,-52],[-.5,-52],[-5.2,-52],[-12,-52]], .05, 31.2);
  const p = xy(5.7,-53.3);
  const levels = world.surfacesAt(...p).map(f => f.z).sort((a,b) => a-b);
  assert.equal(levels.length, 2);
  assert.ok(Math.abs(levels[0]-26.86) < .03 && Math.abs(levels[1]-30.48) < .04);
  assert.ok(!world.blocked(...p, levels[0]));
  assert.ok(world.blockedSpan(...p, 29.6, 30.1));
  const tunnel = byId.get("ud-tunnel");
  const mesh = buildMesh([tunnel], { groundAt, terraces: dem.terraces.filter(tr => tr.f.id === tunnel.id), clip });
  const hit = raycastMesh(mesh, { o: [...worldOf(p), 28], d: [0,0,-1] }, ["floors"]);
  assert.ok(hit && Math.abs(28-hit.t-levels[0]) < .025);
  assert.equal(mesh.floors.batches.find(b => hit.tri*3 >= b.first && hit.tri*3 < b.first+b.count)?.finish, "paving/asphalt");
});

test("pedestrians can pass the gate bollards and each ELSI entrance opens independently", () => {
  for (const id of ["sg-bollards", "ig-bollards"]) {
    const posts = byId.get(id).coords;
    for (const p of posts) assert.ok(world.blocked(...toXY(p), groundAt(p)), "missing post at " + p);
    const [a,b] = posts.slice(0,2).map(toXY);
    const gap = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    assert.ok(!world.blocked(...gap, groundAt(toLngLat(gap))));
  }
  const { doors } = buildMesh(["elsi-box-w","elsi-box-e"].map(id => byId.get(id)), { groundAt, clip });
  assert.deepEqual(doors.map(d => d.kind), ["bi","bi"]);
  for (const [i,d] of doors.entries()) {
    const state = [0,0];
    stepDoors(doors, state, { x: (d.a[0]+d.b[0])/2, y: (d.a[1]+d.b[1])/2, z: d.z0+.05 }, 1);
    assert.equal(state[i], 1);
    assert.equal(state[1-i], 0);
  }
});
