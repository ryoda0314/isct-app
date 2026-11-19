import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { detailView, normalizeFeature, pointInRing, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { ceilingMount, ceilingProfile } from "../campus-sns/campus3dCeiling.js";
import { insideLightPlan } from "../campus-sns/campus3dFloorMaterials.js";
import { floorWalk } from "../campus-sns/campus3dInterior.js";
import { BOOK_STRIDE, bookModel, rackBooks } from "../campus-sns/campus3dLibraryBooks.js";
import { collectSeats, seatPick, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const { features } = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const site = features.filter(f => f.id.startsWith("lib-")).map(f => normalizeFeature(f));
const floor = level => site.find(f => f.type === "floor" && f.level === level);
const groundAt = () => 33.9;
const origin = toXY([139.6841201, 35.6063238]);
const onPlan = ([x, y]) => [origin[0] + x, origin[1] + y];
const stacks = ([x, y]) => {
  const angle = -8 * Math.PI / 180;
  return onPlan([x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
};

test("the library aisles, entrance gate and routes past the floor guide and reading desks stay clear", () => {
  const view = detailView(site, { detail: true, level: "all" });
  const world = walkWorld({ data: { buildings: [], water: [] }, features: view, groundAt });
  const routes = [
    ["1F", onPlan, [[-7.36, 21.88], [-6.73, 22.07], [-5.8, 22.36]]],
    ["B1", onPlan, [[3.35, 14.5], [6.44, 13.91], [9.72, 13.97], [12.2, 14.64]]],
    ["B2", onPlan, [[4.5, 15.7], [3.95, 15.15], [3.25, 14.36]]],
    ["2F", onPlan, [[-5.27, 12.15], [-6.59, 3.2]]],
    ["3F", onPlan, [[-5.5, 12.15], [-6.82, 3.2]]],
  ];
  for (const level of ["B1", "B2"]) {
    routes.push([level, stacks, [[5.4, -8.5], [5.4, 0.79], [14.53, 0.79], [14.53, 10.4]]]);
    routes.push([level, stacks, [[-3.72,-10.85],[-3.72,6]]]);
  }
  for (const [level, project, route] of routes) {
    const floorZ = groundAt() + floor(level).z;
    for (const stops of [route, route.slice().reverse()]) {
      let [x, y] = project(stops[0]), z = floorZ;
      for (const stop of stops.slice(1)) {
        const [tx, ty] = project(stop), count = Math.ceil(Math.hypot(tx - x, ty - y) / 0.06);
        const dx = (tx - x) / count, dy = (ty - y) / count;
        for (let i = 0; i < count; i++) {
          const next = world.move(x, y, z, dx, dy);
          assert.ok(next.floor && Math.abs(next.floor.z - floorZ) < 0.035, `${level} floor near ${stop}`);
          assert.ok(Math.hypot(next.x - x - dx, next.y - y - dy) < 0.009, `${level} obstruction on the way to ${stop}`);
          x = next.x; y = next.y; z = next.floor.z;
        }
      }
    }
  }
});

test("sitting at the study tables and the basement counters faces the work surface", () => {
  for (const level of ["2F", "B1", "B2"]) {
    const f = floor(level), z = groundAt() + f.z;
    const seats = collectSeats([f], groundAt);
    const tables = f.items.filter(it => it.kind === "table").map(it => it.coords.map(toXY));
    const centers = level === "2F" ? f.items.filter(it => it.style === "bucket").map(it => {
      const ring = it.coords.map(toXY);
      return [0, 1].map(i => ring.reduce((sum, p) => sum + p[i], 0) / ring.length);
    }) : [onPlan(level === "B1" ? [13, 39.08] : [-4.57, -0.21])];
    assert.ok(centers.length > 0);
    for (const [x, y] of centers) {
      const eye = [x, y, z + 1.62], hit = seatPick(seats, eye, [0, 0, -1], z);
      assert.equal(hit?.seat.kind, "chair");
      const pose = sitPose(hit.seat, hit.p, eye), yaw = pose.yaw * Math.PI / 180;
      const tx = pose.x + 0.65 * Math.sin(yaw), ty = pose.y + 0.65 * Math.cos(yaw);
      assert.ok(tables.some(ring => pointInRing(tx, ty, ring)), `${level} chair at ${x}, ${y}`);
    }
  }
});

test("both library collections use individual volumes with paper, boards and printed spines", () => {
  const near = bookModel(true), far = bookModel(false);
  assert.ok(near.indices.length > far.indices.length);
  assert.deepEqual(new Set(near.vertices.filter((_,i) => i%7 === 5)), new Set([0,1,2,3,4]));
  for (const level of ["B1", "B2"]) {
    const f = floor(level);
    const rack = f.items.find(it => it.kind === "stack" && it.books > 0 && it.bookSide == null && it.z1 > 2);
    const items = [rack, ...f.items.filter(it => it.print === "libraryGuide")];
    const { floors, bookRacks } = buildMesh([{ ...f, rooms: [], walls: [], stairs: [], items }], { groundAt });
    assert.equal(bookRacks.length,1);
    assert.equal(floors.batches.some(b => b.finish === "libraryShelves"),false);
    const def = bookRacks[0], data = rackBooks(def);
    assert.deepEqual(data,rackBooks(def));
    assert.equal(def.journals,level === "B2");
    assert.ok(data.length > BOOK_STRIDE*30);
    const books = [];
    for (let i=0;i<data.length;i+=BOOK_STRIDE) {
      const v = data.slice(i,i+BOOK_STRIDE);
      assert.ok(v[4] > 0 && Math.abs(v[5]) > .02 && v[6] > .1);
      assert.ok(v[0]-v[4]/2 >= 0 && v[0]+v[4]/2+v[3] <= def.length);
      assert.ok(v[1]+v[5] > 0 && v[1]+v[5] < def.depth);
      books.push(v);
    }
    assert.deepEqual(new Set(books.map(v => Math.sign(v[5]))),new Set([1,-1]));
    if (def.journals) {
      const bay = books.filter(v => v[5] > 0 && v[0] < def.length/def.bays);
      assert.equal(new Set(bay.map(v=>v[11])).size,1);
      bay.forEach((v,i) => assert.equal(v[7],bay[0][7]+i));
    } else {
      assert.ok(new Set(books.map(v => Math.round(v[6]*100))).size > 5);
      assert.ok(books.some(v => v[3] > .01));
    }
    const guide = floors.batches.find(b => b.finish === "libraryGuide");
    if (level === "B2") {
      assert.equal(guide.count, 6);
      const bottom = guide.first, top = bottom + 2;
      assert.ok(floors.pos[3 * top + 2] > floors.pos[3 * bottom + 2] + 1);
      assert.ok(floors.uv[2 * top + 1] < floors.uv[2 * bottom + 1]);
    } else assert.equal(guide, undefined);
  }
});

test("the west wall recesses and reception are clear of bookcases, wall shelves face one aisle", () => {
  for (const level of ["B1","B2"]) {
    const f = floor(level);
    const kindAt = (kind,p) => f.items.filter(it => it.kind === kind && pointInRing(...onPlan(p),it.coords.map(toXY)));
    const alcoves = level === "B1"
      ? [[-6.77,-11.79],[-6.34,-8.67],[-5.90,-5.55],[-4.59,3.84]] : [[-6.77,-11.79]];
    for (const [i,p] of alcoves.entries()) {
      assert.equal(kindAt("stack",p).length,0);
      assert.equal(kindAt("table",p).length,i ? 1 : 0);
      const [x,y] = onPlan(p);
      assert.ok(f.walls.some(w => w.kind === "conc" && w.coords.map(toXY).some(q => Math.hypot(q[0]-x,q[1]-y)<1.8)));
      if (i) {
        const chairs = f.items.filter(it => it.kind === "chair").map(it => it.coords.map(toXY))
          .filter(r => Math.hypot(...[0,1].map(j => r.reduce((s,q) => s+q[j]/r.length,0)-[x,y][j])) < 1.32);
        assert.equal(chairs.length,3);
      }
    }
    if (level === "B1") {
      assert.equal(kindAt("stack",[-4.93,13.6]).length,0);
      assert.equal(kindAt("white",[-4.93,13.6]).length,1);
      const items = f.items.filter(it => it.bookSide != null);
      assert.ok(items.length > 0);
      for (const r of buildMesh([{...f,items}],{groundAt}).bookRacks) {
        const data = rackBooks(r);
        assert.ok(data.length > 0);
        for (let j=0;j<data.length;j+=BOOK_STRIDE) assert.equal(Math.sign(data[j+5]),r.bookSide ? -1 : 1);
      }
    }
  }
});

test("B1 has a sloping reading ceiling, lower adjoining bays and open stairs in both rendering and walking", () => {
  const f = {...floor("B1"), items:[], walls:[], stairs:[], rooms:[]};
  const z = groundAt()+f.z, profile = ceilingProfile(f), mesh = buildMesh([f],{groundAt});
  const solids = [];
  floorWalk(f,groundAt,{solid:(r,holes,spans) => solids.push({r,holes,spans}),edge:()=>{}},.24);
  const sample = p => {
    const q = onPlan(p);
    const hit = raycastMesh(mesh,{o:[...worldOf(q),z+.25],d:[0,0,12]});
    const spans = solids.filter(s => pointInRing(...q,s.r) && !s.holes.some(h => pointInRing(...q,h))).flatMap(s => s.spans(...q));
    if (!profile.inside(q)) { assert.equal(hit,null); assert.ok(spans.every(s => s[1]<=z)); return; }
    const h = profile.at(q).at(q);
    assert.ok(hit && Math.abs(.25+hit.t*12-h)<.02, String(p));
    assert.ok(spans.some(([lo]) => Math.abs(lo-z-h)<.01));
    return h;
  };
  assert.equal(sample([20,0]),2.84);
  assert.equal(sample([5,-5]),3.8);
  assert.equal(sample([-7,36]),3.06);
  assert.ok(sample([15,29])-sample([15,20]) > 2.3);
  const rooflight = site.find(it=>it.id==="lib-skylight").coords.map(toXY);
  const aperture = [0,1].map(i=>rooflight.reduce((s,p)=>s+p[i]/rooflight.length,0));
  const well = sample(aperture.map((v,i)=>v-origin[i]));
  assert.ok(well-profile.at(aperture,true).at(aperture)>.30);
  sample([-9,0]);
  const full = floor("B1");
  const risingBeam = full.items.find(it => {
    if (it.mount !== "ceiling" || it.kind !== "white" || it.z0 <= 0) return false;
    const r = it.coords.map(toXY), m = ceilingMount(profile,it,r);
    return Math.abs(m.offset(r[1])-m.offset(r[0])) > 2;
  });
  assert.ok(risingBeam);
  const lights = buildMesh([{...f,items:full.items.filter(it=>it.kind==="glow" || it.kind==="dlight")}],{groundAt}).lightPlans[0];
  assert.ok(lights.heights[0]<3.4 && lights.heights[1]>3.4 && lights.heights[2]>5.4);
  assert.equal(insideLightPlan(lights,[...worldOf(onPlan([20,0])),z+4.4]),false);
  assert.equal(insideLightPlan(lights,[...worldOf(onPlan([15,29])),z+4.4]),true);
});
