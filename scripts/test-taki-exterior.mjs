import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { detailView, normalizeFeature, pointInRing, roofBoards, roofSlab, toXY } from "../campus-sns/campus3dFeatures.js";
import { doorLeaves, roomDoorBlocked } from "../campus-sns/campus3dDoors.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const { features } = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const feature = id => normalizeFeature(features.find(f => f.id === id));
const floor = feature("taki-int-2f"), host = feature(floor.host), rail = feature("taki-west-terrace-rail");
const middle = (p, q) => p.map((x, i) => (x + q[i]) / 2);

test("the courtyard return supports the projecting roof boards and its single glazed door swings clear", () => {
  const court = host.carves.find(c => c.finish === "takiCourtDeck");
  const [a,b,c] = court.coords.slice(0,3).map(toXY);
  const uv = (u,v) => a.map((x,i) => x+u*(b[i]-x)+v*(c[i]-b[i]));
  const slab = roofSlab(host), boards = roofBoards(host);
  // The independent 2F canopy meets the corner well below the main roof.
  for (const u of [.05,.50,.95]) assert.ok(slab.at(uv(u,0)) > 9.5);
  const site = detailView([host, floor], { detail:true, level:"all" });
  const groundAt = () => 34, mesh = buildMesh(site, { groundAt, clip });
  const eave = uv(.73,.23), board = boards.at(eave);
  const hit = raycastMesh(mesh,{o:[...worldOf(eave),55],d:[0,0,-28]},["floors"]);
  assert.ok(hit && board && Math.abs(55-28*hit.t-34-board.zAt(eave)) < .006);
  const [door] = mesh.doors.filter(d => d.pull === "vertical");
  assert.ok(door?.glazed && door.width > .82 && door.width < 1.02);
  const center = middle(door.a,door.b);
  assert.ok(roomDoorBlocked([door],[0],...center,door.z0));
  assert.ok(!roomDoorBlocked([door],[1],...center,door.z0));
  const start = center.map((x,i) => x+door.n[i]*.80), end = center.map((x,i) => x-door.n[i]*.80);
  const wo = worldOf(start), we = worldOf(end);
  const ray = {o:[...wo,door.z0+1.57],d:[we[0]-wo[0],we[1]-wo[1],0]};
  assert.ok(raycastMesh(doorLeaves([door],[0]),ray,["glass"]));
  assert.equal(raycastMesh(doorLeaves([door],[1]),ray,["glass"]),null);
  const world = walkWorld({data:{buildings:[],water:[]}, features:site,groundAt});
  for (const [p,q] of [[start,end],[end,start]]) {
    let xy=p,z=door.z0;
    const step=q.map((x,i)=>(x-p[i])/36);
    for (let k=0;k<36;k++) {
      const next=world.move(...xy,z,...step);
      assert.ok(next.floor && Math.abs(next.floor.z-door.z0)<.035);
      xy=[next.x,next.y];z=next.floor.z;
    }
    assert.ok(Math.hypot(xy[0]-q[0],xy[1]-q[1])<.035);
  }
});

test("the west terrace meets the canopy and the open courtyard has decking at its walkable height in both building modes", () => {
  const boards = roofBoards(host).list;
  const canopy = boards.find(b => b.crossBeams);
  assert.ok(canopy);
  assert.equal(boards.filter(b => b.kind === "green").length, 31);
  const deck = middle(canopy.ring[0], canopy.ring[2]);
  const court = toXY([139.684475, 35.606157]);
  assert.ok(host.carves.some(c => pointInRing(...court, c.coords.map(toXY))));
  for (const shell of [host, { ...host, detailShell: true }]) {
    const mesh = buildMesh([shell], { groundAt: () => 34, clip: shell.detailShell ? undefined : clip });
    const material = mesh.floors.batches.find(b => b.finish === "takiRoofDeck");
    assert.ok(material?.count > 0);
    const hit = p => raycastMesh(mesh, { o: [...worldOf(p), 55], d: [0, 0, -30] }, ["floors"]);
    const surface = hit(deck);
    assert.ok(surface);
    assert.ok(Math.abs(55 - 30 * surface.t - 34 - canopy.top) < 0.005);
    const [a,b]=host.carves[0].coords.slice(0,2).map(toXY);
    const angle=Math.atan2(b[1]-a[1],b[0]-a[0])+22*Math.PI/180;
    const boardAt=(u,v)=>[a[0]+u*Math.cos(angle)-v*Math.sin(angle),a[1]+u*Math.sin(angle)+v*Math.cos(angle)];
    const height=34+host.carves[0].bottom;
    const landing=p=>raycastMesh(mesh,{o:[...worldOf(p),height+.12],d:[0,0,-.20]},["","cull"]);
    const wood=landing(boardAt(2.42,8.5*.144)),joint=landing(boardAt(2.42,8*.144));
    assert.ok(wood && joint && Math.abs(.12-.20*wood.t)<.002);
    assert.ok((joint.t-wood.t)*.20>.024);
  }
});

test("the west guard rests on the building datum, blocks the terrace edge and leaves the cafe passage open below", () => {
  assert.deepEqual(rail.groundRef, host.groundRef);
  const groundAt = ll => Math.hypot(...ll.map((v, i) => v - host.groundRef[i])) < 1e-7 ? 34 : 32;
  const p = middle(...rail.coords.slice(1, 3).map(toXY));
  const mesh = buildMesh([rail], { groundAt });
  let top = -Infinity;
  for (let i = 2; i < mesh.count * 3; i += 3) top = Math.max(top, mesh.pos[i]);
  assert.ok(Math.abs(top - (34 + rail.base + rail.height)) < 0.005);
  const walk = walkWorld({ data: { buildings: [] }, features: [rail], groundAt });
  assert.equal(walk.blocked(...p, 34 + rail.base), true);
  assert.equal(walk.blocked(...p, 34), false);
  assert.ok(detailView([host, floor, rail]).some(f => f.id === rail.id));
  assert.ok(!detailView([host, floor, rail], { detail: true, level: 0 }).some(f => f.id === rail.id));
});

test("the two sloping handrails follow the public treads at both ends and leave space to climb alongside", () => {
  const boards = roofBoards(host);
  const rails = host.panels.filter(p => p.kind === "steel" && Math.abs(p.zs[0] - p.zs[1]) > 1);
  assert.equal(rails.length, 2);
  const guards = features.filter(f => f.id.startsWith("taki-stair-landing-mesh-")).map(normalizeFeature);
  const walk = walkWorld({ data: { buildings: [] }, features: [{ ...host, detailShell: true }, ...guards], groundAt: () => 34 });
  assert.equal(guards.length, 2);
  const walkHeight = p => walk.floorBelow(...p, 34 + boards.topAt(p) + 0.34).z;
  // The handrail divides the gate. There is a walkable tread on each side.
  const [left, right] = [guards[0].coords[1], guards[1].coords[0]].map(toXY);
  for (const t of [0.18, 0.80]) {
    const opening = left.map((v, i) => v + t * (right[i] - v));
    assert.ok(!walk.blocked(...opening, walkHeight(opening) + 0.015));
  }
  for (const panel of rails) {
    const [a, b] = panel.coords.slice(0, 2).map(toXY);
    for (const [i, p] of [a, b].entries()) {
      const clearance = panel.zs[i] - boards.topAt(p);
      assert.ok(clearance > 0.85 && clearance < 1.05);
    }
    const p = middle(a, b), L = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const side = [p[0] - (b[1] - a[1]) * 0.80 / L, p[1] + (b[0] - a[0]) * 0.80 / L];
    assert.ok(walk.blocked(...p, walkHeight(p) + 0.015));
    assert.ok(!walk.blocked(...side, walkHeight(side) + 0.015));
  }
});
