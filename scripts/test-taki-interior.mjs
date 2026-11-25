import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dem } from "../campus-sns/campusDem.js";
import { burnsGround, detailView, LIFT_DOOR_H, normalizeFeature, toXY } from "../campus-sns/campus3dFeatures.js";
import { addFloor, liftSides } from "../campus-sns/campus3dInterior.js";
import { addPicody } from "../campus-sns/campus3dPicody.js";
import { addCeramicRelief, reliefWalkSpans } from "../campus-sns/campus3dTakiExhibition.js";
import { addTakiVending } from "../campus-sns/campus3dTakiVending.js";
import { buildMesh, Mesh } from "../campus-sns/campus3dMesh.js";
import { collectSeats, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const { features } = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));

test("the shaped study table and its five webbed chairs are on Taki Plaza's second floor", () => {
  const floors = features.filter(f => f.id.startsWith("taki-int-"));
  const levelsFor = (kind, style, name) => floors.flatMap(f =>
    normalizeFeature(f).items.filter((it, j) => it.kind === kind && it.style === style && f.items[j].name === name).map(() => f.level)
  );
  assert.deepEqual(levelsFor("table", "slab", "学習スペースの変形テーブル"), ["2F"]);
  assert.deepEqual(levelsFor("woodchair", "webbed", "変形テーブルの編み座椅子"), Array(5).fill("2F"));
});

// Metres along the second-floor plan, turned to the building's bearing.
const planOrigin = toXY([139.68455, 35.60618]), bearing = -7.44 * Math.PI / 180;
function onPlan([x, y]) {
  return [planOrigin[0] + x * Math.cos(bearing) - y * Math.sin(bearing), planOrigin[1] + x * Math.sin(bearing) + y * Math.cos(bearing)];
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Record real mesh extents per material without allocating a WebGL context or decoding an image.
function geometryBounds(draw,width,depth,low,high,materials=[]) {
  const bounds=new Map(),M={};
  for (const pass of ["m","glassy"]) M[pass]={
    vert(p,z,n,c) {
      const key=pass+":"+(materials[c[3]-1] || "body");
      if (!bounds.has(key)) bounds.set(key,{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],count:0});
      const box=bounds.get(key);box.count++;
      for (const [j,v] of [p[0],p[1],z].entries()) {
        box.min[j]=Math.min(box.min[j],v);box.max[j]=Math.max(box.max[j],v);
        assert.ok(Number.isFinite(n[j]) && Number.isFinite(v));
      }
    },
    quad(face,n,c) {for (const [p,z] of face) this.vert(p,z,n,c);}
  };
  const front={a:[width/2,depth],b:[-width/2,depth],nf:[0,1],L:width};
  draw(M,front,depth,low,high,paint=>[.7,.7,.7,materials.indexOf(paint)+1]);
  return bounds;
}

test("Picody and the separate wooden lectern stand on the first-floor lobby floor", () => {
  const floors=features.filter(f=>f.id.startsWith("taki-int-")).map(f=>normalizeFeature(f));
  const floor=floors.find(f=>f.level==="1F");
  const exhibits=floors.flatMap(f=>(f.items||[]).filter(i=>["picody","picodyDisplay"].includes(i.style)).map(i=>[f,i]));
  assert.equal(exhibits.length,2);
  assert.ok(exhibits.every(([f,i])=>f===floor && i.z0===0));
  const [figure,stand]=exhibits.map(([,i])=>i);
  assert.equal(figure.kind,"art");assert.equal(stand.kind,"board");
  const [a,b]=figure.coords.map(toXY), [c,d]=stand.coords.map(toXY);
  assert.ok(distance(a,b)>.60 && distance(a,b)<.72 && distance(c,d)<.52);
  const right=b.map((x,i)=>x-a[i]), ctr=(p,q)=>p.map((x,i)=>(x+q[i])/2);
  const neighbor=ctr(c,d).map((x,i)=>x-ctr(a,b)[i]);
  assert.ok(neighbor.reduce((v,x,i)=>v+x*right[i],0)>.35);
  assert.equal(floor.finish,"takiConcrete");
  const M={m:new Mesh(),veil:new Mesh(),glassy:new Mesh(),finishes:new Map()};
  addFloor(M,{...floor,walls:[],stairs:[],items:[figure,stand]},{groundAt:()=>34});
  assert.deepEqual([...M.finishes.keys()].filter(k=>k!=="takiConcrete"),[]);
  const sculpt=geometryBounds(addPicody,.66,.64,0,figure.z1,["#e7ac27","#be8538","#714333"]);
  for (const paint of ["#e7ac27","#be8538","#714333"]) {
    const {min,max}=sculpt.get("m:"+paint);
    assert.ok(max[0]-min[0]>.065 && max[1]-min[1]>.009 && max[2]-min[2]>.025);
  }
  assert.ok(M.glassy.result().count>0);
});

test("the five-metre ceramic relief faces the entrance, with a deep cast surface and a true section cut", () => {
  const floor=normalizeFeature(features.find(f=>f.id==="taki-int-1f"));
  const find=style=>floor.items.find(i=>i.style===style);
  const relief=find("ceramicRelief"),plaque=find("reliefPlaque"),figure=find("picody"),stand=find("picodyDisplay");
  const mid=i=>i.coords.map(toXY).reduce(([x,y],p)=>[x+p[0]/4,y+p[1]/4],[0,0]);
  assert.ok(Math.abs(distance(...relief.coords.slice(0,2).map(toXY))-5)<.022);
  assert.equal(relief.z1-relief.z0,5);
  assert.ok(distance(mid(relief),onPlan([22.36,-4.54]))<.12);
  assert.ok(distance(mid(figure),mid(plaque))>.94 && distance(mid(figure),mid(stand))<.9);
  assert.ok(plaque.z1<relief.z0 && find("plazaModel") && find("lobbyShowcase"));
  const all=geometryBounds(addCeramicRelief,5,.68,0,5).get("m:body");
  assert.ok(all.max[0]-all.min[0]>4.98 && all.max[2]-all.min[2]>4.98);
  assert.ok(all.max[1]-all.min[1]>.42 && all.max[1]<.74);
  const sliced=geometryBounds(addCeramicRelief,5,.68,0,1.9).get("m:body");
  assert.ok(Math.abs(sliced.max[2]-1.9)<1e-6 && sliced.count<all.count*.6);
  const spans=reliefWalkSpans({a:[2.5,.68],b:[-2.5,.68],nf:[0,1],L:5},.68,0);
  assert.deepEqual(spans(2.35,.55),[]);
  assert.ok(spans(0,.22)[0][0]>0 && spans(0,.22)[0][1]>3);
});

test("the first-floor glass lobby and the passage around the end of the relief are traversable", () => {
  const site=features.filter(f=>f.id.startsWith("taki-int-") || f.id==="bmvj4e1wfjq0s").map(f=>normalizeFeature(f));
  const view=detailView(site,{detail:true,level:"all"}),z=33.9;
  const world=walkWorld({data:{buildings:[],water:[]},features:view,groundAt:()=>z});
  const route=[[22.8,3.0],[22.8,-2.35],[18.30,-2.35],[18.30,-5.73],[20.30,-5.73]];
  for (const stops of [route,[...route].reverse()]) {
    let p=onPlan(stops[0]);
    for (const stop of stops.slice(1)) {
      const q=onPlan(stop),steps=Math.ceil(distance(p,q)/.045),step=q.map((v,j)=>(v-p[j])/steps);
      for (let i=0;i<steps;i++) {
        const r=world.move(...p,z,...step);
        assert.ok(Math.hypot(r.x-p[0]-step[0],r.y-p[1]-step[1])<.007,`blocked walking to ${stop}`);
        p=[r.x,r.y];
      }
    }
  }
});

test("the window beside the second-floor stair landing tapers to the floor through the exterior wall", () => {
  const floor = normalizeFeature(features.find(f => f.id === "taki-int-2f"));
  const host = normalizeFeature(features.find(f => f.id === floor.host));
  const jamb = toXY(host.carves[0].coords[1]);
  assert.ok(distance(jamb,onPlan([-1.43,-7.19])) < .10);
  const atJamb = w => distance(toXY(w.coords[0]), jamb) < 0.1;
  const pane = floor.walls.find(w => w.kind === "curtain" && w.pane && atJamb(w));
  const opening = host.windows.find(w => w.kind === "opening" && atJamb(w));
  assert.ok(pane && opening);
  assert.deepEqual(opening.coords, pane.coords);
  assert.equal(opening.bottom, floor.z);
  assert.ok(Math.abs(opening.top - floor.z - pane.h) < 1e-6);
  assert.equal(opening.top2, opening.bottom);
  assert.equal(pane.h2, 0);
  assert.ok(distance(toXY(pane.coords[1]), onPlan([-1.47, -3.02])) < 0.1);

  const panels = [];
  const glassy = { quad: points => panels.push(points) };
  addFloor({ m: new Mesh(), veil: new Mesh(), glassy }, { ...floor, walls: [pane], items: [], stairs: [] }, {
    groundAt: () => 0, ceilAt: () => 20,
  });
  assert.equal(panels.length, 1);
  const points = panels[0];
  const [start, tip] = pane.coords.map(toXY);
  for (const [i, expected] of [start, tip, tip, start].entries()) assert.ok(distance(points[i][0], expected) < 1e-6);
  for (const [i, expected] of [floor.z, floor.z, floor.z, floor.z + pane.h].entries()) assert.ok(Math.abs(points[i][1] - expected) < 1e-6);
});

test("the two window sofas face their low table and the signs face the second-floor corridor", () => {
  const floor = normalizeFeature(features.find(f => f.id === "taki-int-2f"));
  const seats = collectSeats([floor], () => 33.9), coffeeTable = onPlan([14.04,-19.20]);
  const sofas = seats.filter(s => s.kind === "lounge" && distance(s.c, coffeeTable) < 1.4);
  assert.equal(sofas.length, 2);
  for (const sofa of sofas) {
    const pose = sitPose(sofa, sofa.c, coffeeTable);
    assert.ok(distance(pose.stand, coffeeTable) < distance(sofa.c, coffeeTable) / 2);
  }
  const signs = floor.items.filter(it => it.kind === "woodsign" && it.style === "slats");
  assert.deepEqual(signs.map(s => s.text).sort(), ["MEN", "WOMEN"]);
  for (const sign of signs) {
    const [a,b,c,d] = sign.coords.map(toXY);
    const hall = onPlan([18, sign.text === "MEN" ? -7.24 : -13.10]);
    assert.ok(distance(a,hall) + distance(b,hall) < distance(c,hall) + distance(d,hall));
  }
});

test("the second-floor aisles and both washroom routes are passable in either direction", () => {
  const site = features.filter(f => f.id.startsWith("taki-int-") || f.id === "bmvj4e1wfjq0s").map(f => normalizeFeature(f));
  const view = detailView(site, { detail: true, level: "all" });
  const groundAt = () => 33.9, zf = groundAt() + site.find(f => f.id === "taki-int-2f").z;
  const world = walkWorld({ data: { buildings: [], water: [] }, features: view, groundAt });
  const routes = [
    [[5.90,-19.51], [5.90,-15.26], [6.30,-15.26]],
    [[18.08,-8.22], [17.87,-8.40], [1.75,-8.40]],
    [[18.08,-15.8], [18.08,-8.22], [21.29,-8.22], [21.29,-9.80], [21.80,-9.80], [21.80,-10.41]],
    [[18.08,-15.8], [18.08,-12.24], [19.97,-12.24], [19.97,-13.49], [21.88,-13.49], [21.88,-12.49]],
    ...[-8.31,-6.85,-5.87].map(y => [[21.8,-10.41], [21.8,-9.88], [23.4,-9.88], [23.4,y], [24.71,y]]),
    ...[23.53,24.52,25.55].map(x => [[21.88,-12.49], [21.88,-13.04], [x,-13.04], [x,-11.90]]),
  ];
  for (const route of routes) for (const stops of [route, route.slice().reverse()]) {
    let p = onPlan(stops[0]), z = zf;
    for (const stop of stops.slice(1)) {
      const q = onPlan(stop), steps = Math.ceil(distance(p,q) / 0.055);
      const dx = (q[0] - p[0]) / steps, dy = (q[1] - p[1]) / steps;
      for (let i = 0; i < steps; i++) {
        const next = world.move(...p, z, dx, dy);
        assert.ok(next.floor && Math.abs(next.floor.z - zf) < 0.035 && Math.hypot(next.x - p[0] - dx, next.y - p[1] - dy) < 0.009, `blocked walking to ${stop}`);
        p = [next.x, next.y];
        z = next.floor.z;
      }
    }
  }
  // The former lower half of the women's opening is the wall carrying the sign.
  let p = onPlan([18.08, -13.45]);
  const target = onPlan([20.08, -13.45]);
  const step = target.map((v, i) => (v - p[i]) / 40);
  for (let i = 0; i < 40; i++) {
    const next = world.move(...p, zf, ...step);
    p = [next.x, next.y];
  }
  assert.ok(distance(p, onPlan([19.38, -13.45])) < 0.53 && distance(p, target) > 1);
});

test("the women's sign and the flush vending cabinets follow the second-floor corridor plan", () => {
  const floor = normalizeFeature(features.find(f => f.id === "taki-int-2f"));
  const sign = floor.items.find(it => it.text === "WOMEN");
  const signFront = sign.coords.slice(0, 2).map(toXY);
  const center = signFront[0].map((v, i) => (v + signFront[1][i]) / 2);
  assert.ok(distance(center, onPlan([19.23, -13.12])) < 0.08);

  const machine = floor.items.find(it => it.style === "takiVending");
  const sorting = floor.items.find(it => it.style === "takiSorting");
  assert.equal(sorting.n, 4);
  assert.ok(distance(toXY(machine.coords[1]), toXY(sorting.coords[0])) < 0.025);
  assert.ok(distance(toXY(sorting.coords[1]), onPlan([19.77, -11.63])) < 0.06);
  const products=geometryBounds(addTakiVending,1.10,.74,0,1.83,["#772f46","#354861","#48588b"]);
  const bottle=products.get("m:#772f46"),reader=products.get("m:#354861"),buttons=products.get("m:#48588b");
  assert.ok(bottle.max[1]-bottle.min[1]>.040 && bottle.max[2]-bottle.min[2]>.11);
  assert.ok(reader.max[1] > products.get("glassy:body").max[1] && buttons.max[2]-buttons.min[2]>.65);
});

test("the small wooden lift pictogram projects from the left jamb above the second-floor door", () => {
  const floor = normalizeFeature(features.find(f => f.id === "taki-int-2f"));
  const sign = floor.items.find(it => it.kind === "woodcut" && it.shape === "lift");
  const [back, tip] = sign.coords.map(toXY);
  const shaft = floor.items.find(it => it.kind === "lift");
  const front = liftSides(shaft.coords.map(toXY))[0];
  const jamb = front.a.map((v, i) => v + front.s0 * front.u[i]);
  assert.ok(distance(back, jamb) < 0.18 && distance(tip, jamb) > distance(back, jamb));
  assert.ok(Math.abs(distance(back, tip) - 0.27) < 0.02);
  assert.ok(Math.abs(sign.z1 - sign.z0 - 0.30) < 0.02);
  assert.ok(sign.z0 >= LIFT_DOOR_H && sign.z0 < LIFT_DOOR_H + 0.09);
});

test("all three basement doors can be crossed beneath the light-well walkway", t => {
  const site = new Set(["bmvj4e1wfjq0s", "tmv8s2rdw3dvc", "smv8u1f9u5xbl", "taki-walk", "lw-b2-sw", "lw-b1-recess"]);
  const selected = features.filter(f => site.has(f.id) || f.id.startsWith("taki-int-"));
  const view = detailView(selected.map(f => normalizeFeature(f)), { detail: true, level: "all" });
  t.mock.method(dem, "baseAt", () => 33.9);
  dem.setBurns(view.filter(burnsGround));
  t.after(() => dem.setBurns([]));
  const groundAt = ll => dem.groundAt(ll);
  const world = walkWorld({ data: { buildings: [], water: [] }, features: view, groundAt, surfaceAt: ll => dem.surfaceAt(ll), digs: dem.digs });
  const mesh = buildMesh(view, { groundAt, slopes: dem.slopes, terraces: dem.terraces, digs: dem.digs });
  const doors = mesh.doors.filter(d => d.kind === "swing");
  assert.equal(doors.length, 3);
  for (const door of doors) {
    const center = door.a.map((v, i) => (v + door.b[i]) / 2);
    for (const sign of [-1, 1]) {
      const [dx, dy] = door.n.map(v => sign * v * 0.0625);
      let [x, y] = center.map((v, i) => v - sign * door.n[i] * 0.75);
      let z = door.z0;
      for (let step = 0; step < 24; step++) {
        const next = world.move(x, y, z, dx, dy);
        assert.ok(next.floor && Math.hypot(next.x - x - dx, next.y - y - dy) < 0.009, "blocked at the glazed entrance");
        x = next.x;
        y = next.y;
        z = next.floor.z;
      }
    }
  }
});
