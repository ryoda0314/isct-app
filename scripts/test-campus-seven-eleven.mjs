import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { doorLeaves, stepDoors } from "../campus-sns/campus3dDoors.js";
import { detailView, parseFeatures, pointInRing, prepareTerrace, signFrame, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const survey = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const features = detailView(parseFeatures(survey.features.filter(f => f.id.startsWith("s4-"))), { detail: true, level: "all" });
const byId = new Map(features.map(f => [f.id, f]));
const shop = byId.get("s4-7e-1f");
const groundAt = () => 31.9375;
const opts = { groundAt, pal: PALETTES.light, clip };
const mesh = buildMesh(features, opts);
const angle = -7.7 * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
const xy = (along, across) => [along*c - across*s, along*s + across*c];
const along = ([x,y]) => x*c + y*s;

test("the glass canopy and entrance fascia follow the two different storefronts", () => {
  const canopy = buildMesh([byId.get("s4-canopy")], opts);
  const ray = { o: [...worldOf(xy(100.14, -159.77)), groundAt() + 3.2], d: [0,0,1] };
  const hit = raycastMesh(canopy, ray);
  assert.equal(hit?.pass, "glass");
  assert.ok(hit.t > .55 && hit.t < .8);
  const fascia = byId.get("s4-7e-fascia"), frame = signFrame(fascia);
  const ends = [0, fascia.width].map(x => along(frame.at(x,0)[0])).sort((a,b) => a-b);
  const doors = mesh.doors.filter(d => d.motif === "storeStripe").sort((a,b) => along(a.a) - along(b.a));
  assert.deepEqual(doors.map(d => d.kind), ["bi","single"]);
  // Outside, the leaf beside the brick pier slides east, behind the fixed glass.
  assert.ok(along(doors[1].a) > along(doors[1].b));
  assert.ok(ends[0] < along(doors[0].a) && along(doors[0].b) < ends[1]);
  assert.ok(ends[1] < along(doors[1].a) - .7);
  for (const [i, d] of doors.entries()) {
    const open = [0,0], x = (d.a[0]+d.b[0])/2, y = (d.a[1]+d.b[1])/2;
    stepDoors(doors, open, { x,y,z:d.z0+.1 }, 1);
    assert.equal(open[i], 1);
    assert.equal(open[1-i], 0);
    // Green film on both sliding leaves has to clear the same gap as the frames.
    const [ax,ay] = worldOf(d.a), [bx,by] = worldOf(d.b), dx = bx-ax, dy = by-ay;
    function closestStripe(fraction) {
      const { solid } = doorLeaves([d], [fraction]);
      let gap = Infinity;
      for (let v = 0; v < solid.count; v++) {
        if (Math.abs(solid.col[v*4] - .12) > .001 || Math.abs(solid.col[v*4+1] - .46) > .001) continue;
        const t = ((solid.pos[v*3]-ax)*dx + (solid.pos[v*3+1]-ay)*dy)/(dx*dx + dy*dy);
        gap = Math.min(gap, Math.abs(t-.5));
      }
      assert.ok(Number.isFinite(gap));
      return gap;
    }
    assert.ok(closestStripe(0) < .2);
    assert.ok(closestStripe(1) > .48);
    stepDoors(doors, open, null, 2);
    assert.deepEqual(open, [0,0]);
  }
});

test("the west cold wall, south bread wall and separate ATM define the sales floor", () => {
  const inside = (ring, a, b) => pointInRing(...xy(a,b), ring.map(toXY));
  const publicFloor = shop.rooms.find(r => r.finish === "cvs");
  const service = shop.rooms.find(r => r.finish === "concrete");
  for (const p of [[83,-157],[87,-160.65],[93,-163.4]]) assert.ok(inside(publicFloor.coords,...p));
  for (const p of [[79.9,-156],[85,-163.3]]) {
    assert.ok(inside(service.coords,...p));
    assert.ok(!inside(publicFloor.coords,...p));
  }
  const fixture = (kind, a, b) => {
    const item = shop.items.find(it => it.kind === kind && inside(it.coords,a,b));
    assert.ok(item, kind+" at "+[a,b]);
    return item;
  };
  function front(item) {
    const [a,b] = item.coords.map(toXY), edge = [b[0]-a[0],b[1]-a[1]], length = Math.hypot(...edge);
    return [edge[0]/length,edge[1]/length];
  }
  function assertFace(item, dir) {
    const edge = front(item), expected = xy(...dir);
    assert.ok(edge[0]*expected[0]+edge[1]*expected[1] > .995, item.kind+" faces the aisle");
  }
  // The first edge of each fixture is the face seen from the aisle.
  for (const [t, kind, stock] of [[-154.4,"cooler","drinks"],[-157.8,"chiller","rice"],[-160,"chiller","meals"]]) {
    const it = fixture(kind,81.6,t);
    assert.equal(it.stock,stock);
    assertFace(it,[0,1]);
  }
  const bakery = fixture("stack",86.8,-161.85);
  assert.equal(bakery.style,"wallShelf");
  assertFace(bakery,[-1,0]);
  assert.equal(fixture("sdoor",82.1,-162.1).style,"swingWindow");
  assert.equal(fixture("chiller",84.4,-159.35).low,true);
  assert.equal(fixture("crates",85.9,-159.39).style,"cartons");
  const register = fixture("register",89.3,-159.68), atm = fixture("atm",90,-161.84);
  assertFace(register,[1,0]);
  assertFace(atm,[0,1]);
  const bankSigns = shop.items.filter(it => it.print === "bankSign" && it.z0 > 2.1);
  assert.equal(bankSigns.length,2);
  const faces = bankSigns.map(front);
  assert.ok(faces.some(e => e[1] > .98) && faces.some(e => e[1] < -.98));
  assert.equal(fixture("coffee",89.60,-154.1).style,"sevenCafe");
  assert.ok(shop.items.some(it => it.kind === "woodchair" && it.style === "cafeHoop"));
});

test("the filmed entrance, west aisle and checkout loop can be walked in both directions", () => {
  const { uv, batches } = mesh.floors;
  const packets = batches.find(b => b.finish === "sevenShop");
  assert.ok(packets?.count > 6000);
  const tiles = new Set();
  for (let v = packets.first; v < packets.first + packets.count; v += 6) {
    tiles.add(Math.floor(uv[v*2]*8) + 8*Math.floor(uv[v*2+1]*8));
  }
  for (const tile of [0, 4, 8, 12, 16, 24, 28, 31, 32, 36, 38, 48, 49, 50, 54, 56, 58, 61]) {
    assert.ok(tiles.has(tile), "missing merchandise or signage tile " + tile);
  }
  assert.ok(batches.some(b => b.finish === "ochreBrick" && b.count > 0));
  const world = walkWorld({ data: { buildings: [] }, features, groundAt });
  const floorZ = groundAt() + shop.z;
  const markers = shop.items.filter(it => it.style === "queue");
  assert.ok(markers.length >= 4);
  assert.ok(markers.every(it => {
    const [x,y] = it.coords.map(toXY).reduce(([x,y],[a,b]) => [x+a/4,y+b/4],[0,0]);
    return !world.blocked(x,y,floorZ+.02);
  }));
  // The DEM reaches 32 m in the northwest aisle. Asphalt used to obscure both the tile and the queue.
  const subgrade = prepareTerrace(byId.get("s4-7e-subgrade"), groundAt);
  for (const p of [[82.9,-154.1], [82.8,-156.05], [83.01,-157.7]].map(v => xy(...v))) {
    const ray = { o: [...worldOf(p),floorZ+.3], d:[0,0,-1] };
    const hit = raycastMesh(mesh, ray, ["floors"]);
    const batch = batches.find(b => hit && 3*hit.tri >= b.first && 3*hit.tri < b.first+b.count);
    assert.equal(batch?.finish, "cvs");
    assert.ok(ray.o[2] - hit.t > subgrade.burn(...p,32) + .02);
  }
  const paths = [
    [[93.25,-149.82],[91.11,-150.69],[91.07,-151.63],[91.29,-152.65],[91.25,-153.09],
     [90.72,-153.32],[89.78,-153.18],[88.70,-152.92],[87.50,-152.72],[85.4,-152.86],
     [84.61,-152.85],[83.65,-152.84],[83.41,-153.18],[82.93,-153.85]],
    [[82.93,-153.85],[82.90,-155.53],[83.05,-157.55],[83.12,-158.43],[83.25,-159.53],
     [83.37,-160.23],[84.19,-160.98],[85.31,-160.75],[86.83,-160.63],[88.40,-160.72],
     [89.53,-160.75],[90.73,-160.69],[91.67,-160.84],[93.27,-161.69],[95.30,-162.12],[96.58,-162.04]],
    [[86.72,-149.80],[86.72,-151.65],[86.66,-152.62],[85.43,-152.71],[83.65,-152.84],[83.41,-153.18],[82.89,-153.90]],
    [[91.20,-152.05],[91.41,-153.33],[91.55,-155.65],[91.56,-157.77],[91.60,-159.65],[91.67,-160.84],[92.23,-162.57],[92.76,-163.09]],
    [[82.99,-156.37],[85.15,-156.34],[85.18,-155.62],[85.82,-155.57]],
    [[82.99,-158.22],[84.85,-158.23],[86.77,-158.25],[86.71,-159.61],[86.77,-160.53]],
  ];
  for (const route of paths) for (const path of [route, [...route].reverse()]) {
    let [x,y] = xy(...path[0]), floor = world.floorBelow(x,y,floorZ+.37);
    for (const point of path.slice(1)) {
      const [qx,qy] = xy(...point), dx = qx-x, dy = qy-y;
      const n = Math.ceil(Math.hypot(dx,dy)/.07);
      for (let i = 0; i < n; i++) {
        ({x,y,floor} = world.move(x,y,floor.z,dx/n,dy/n,{ deck:floor.deck }));
        assert.ok(Math.abs(floor.z-floorZ) < .16);
      }
      assert.ok(Math.hypot(qx-x,qy-y) < .15, "obstruction en route to " + point);
    }
  }
  for (const p of [[84.2,-154.9],[85.35,-157.3],[83.6,-161.85],[90.3,-159.63],[81.6,-157.6],[89.94,-161.83]]) {
    assert.ok(world.blocked(...xy(...p),floorZ+.02), "missing fixture at " + p);
  }
});
