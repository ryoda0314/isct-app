import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { doorBatches, doorLeaves, roomDoorBlocked, stepDoors } from "../campus-sns/campus3dDoors.js";
import { burnsGround, detailView, normalizeFeature, panelSlices, prepareBridge, preparePaving, prepareTerrace, toXY } from "../campus-sns/campus3dFeatures.js";
import { stairGeom } from "../campus-sns/campus3dInterior.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { dem } from "../campus-sns/campusDem.js";

const { features } = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const feature = id => normalizeFeature(features.find(f => f.id === id));
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} differs from ${b}`);

test("the arcade has one curb beside each recessed deck and a level central crossing", t => {
  const porch = feature("hon-porch-floor-paint"), central = feature("hon-porch-slab");
  const local = features.filter(f => f.id === "deck-ground" || f.id.startsWith("hon-porch-")).map(f => normalizeFeature(f));
  t.mock.method(dem, "baseAt", () => 33.6);
  dem.setBurns(local.filter(burnsGround));
  t.after(() => dem.setBurns([]));
  const world = walkWorld({ data: { buildings: [] }, features: local, groundAt: p => dem.groundAt(p) });
  const high = central.grade[0];
  const low = feature("hon-porch-deck-e").elev;
  near(high - low, 0.17);
  near(feature("hon-porch-deck-w").elev, low);
  const [, , eastEnd, eastJoint, westJoint, westEnd] = porch.coords.map(toXY);
  const outerEast = toXY(central.coords[2]);
  const unit = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)];
  };
  const outward = unit(eastJoint, outerEast);
  const crossing = (origin, outsideHeight) => {
    for (const direction of [-1, 1]) {
      const dx = direction * 0.05 * outward[0], dy = direction * 0.05 * outward[1];
      let x = origin[0] - 16 * dx, y = origin[1] - 16 * dy;
      let floor = world.floorBelow(x, y, high + 0.4);
      near(floor.z, direction < 0 ? outsideHeight : high);
      let changes = 0;
      for (let i = 0; i < 32; i++) {
        const moved = world.move(x, y, floor.z, dx, dy, { deck: floor.deck });
        near(moved.x, x + dx);
        near(moved.y, y + dy);
        if (Math.abs(moved.floor.z - floor.z) > 0.005) changes++;
        ({ x, y, floor } = moved);
      }
      assert.equal(changes, outsideHeight === high ? 0 : 1);
      near(floor.z, direction < 0 ? high : outsideHeight);
    }
  };
  for (const [joint, end] of [[eastJoint, eastEnd], [westJoint, westEnd]]) {
    const towardWing = unit(joint, end);
    crossing(joint.map((v, i) => v + 0.70 * towardWing[i]), low);
  }
  crossing(eastJoint.map((v, i) => (v + westJoint[i]) / 2), high);
});

test("the stone approaches and timber beside the arcade share their visible and walkable edges", () => {
  const surfaces = features.filter(f => f.id.startsWith("hon-porch-") && f.grade).map(f => normalizeFeature(f));
  const groundAt = () => 31;
  const mesh = buildMesh(surfaces, { groundAt, clip });
  const world = walkWorld({ data: { buildings: [] }, features: surfaces, groundAt });
  const between = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const sample = (p, expected, material) => {
    const hit = raycastMesh(mesh, { o: [...worldOf(p), 36], d: [0, 0, -6] }, ["floors"]);
    assert.ok(hit, material);
    const batch = mesh.floors.batches.find(b => hit.tri * 3 >= b.first && hit.tri * 3 < b.first + b.count);
    assert.equal(batch?.finish, material);
    near(36 - 6 * hit.t, expected);
    near(world.floorBelow(...p, 36)?.z, expected);
    near(world.pick([...p, 36], [...p, groundAt()])[2], expected);
  };
  const checkJoin = (a, b) => {
    for (const [i, j] of [[3, 0], [2, 1]]) {
      assert.deepEqual(a.coords[i], b.coords[j]);
      near(a.grade[i], b.grade[j]);
    }
  };
  for (const side of ["w", "e"]) {
    const section = name => feature(`hon-porch-${side}-${name}`);
    const timber = ["channel", "boards", "grade", "join"].map(section);
    const roads = [1, 2, 3, 4].map(i => section("approach-" + i));
    const lanes = [1, 2, 3, 4].map(i => section("lane-" + i));
    for (const strip of [timber, roads, lanes]) {
      for (let i = 1; i < strip.length; i++) checkJoin(strip[i - 1], strip[i]);
    }
    for (let i = 0; i < roads.length; i++) {
      for (const [a, b] of [[1, 0], [2, 3]]) {
        assert.deepEqual(roads[i].coords[a], lanes[i].coords[b]);
        near(roads[i].grade[a], lanes[i].grade[b]);
      }
    }
    for (const f of timber) {
      const [a, b, c, d] = f.coords.map(toXY);
      const start = between(a, b, .4), end = between(d, c, .4);
      for (const t of [.02, .35, .68, .98]) {
        sample(between(start, end, t), f.grade[0] + t * (f.grade[3] - f.grade[0]), f.paving === "roughStone" ? "paving/roughStone" : "deckTimber");
      }
    }
    near(timber[0].grade[0], 34.13);
    near(timber.at(-1).grade[0], 34.30);
    const joint = preparePaving(timber.at(-1));
    const middle = between(joint.ring[0], joint.ring[2], .5);
    const under = joint.burn(...middle, 34.30);
    assert.ok(under >= 34.28 && under < 34.30, "the ground continuing beyond the deck has no false lip");
    for (const f of [...roads, ...lanes]) {
      const [a, b, c, d] = f.coords.map(toXY);
      const material = "paving/" + f.paving;
      // Sample just inside either side of the seam shared by the paving and the driveway.
      for (const t of [.08, .43, .92]) {
        const nearEdge = between(a, b, t), farEdge = between(d, c, t);
        sample(between(nearEdge, farEdge, .0005), f.grade[0] + t * (f.grade[1] - f.grade[0]), material);
        sample(between(farEdge, nearEdge, .0005), f.grade[3] + t * (f.grade[2] - f.grade[3]), material);
      }
    }
  }
});

test("the main approach, two entrance risers and gallery share their landing heights", () => {
  const porch = feature("hon-porch-slab"), entrance = feature("hon-int-1f-ent"), hall = feature("hon-int-1f");
  const base = () => 33.2;
  const terraces = features.filter(f => f.type === "terrace" && (f.id === "deck-ground" || f.id.startsWith("hon-porch-")));
  const [x, y] = toXY(entrance.groundRef);
  const datum = terraces.reduce((z, f) => prepareTerrace(normalizeFeature(f), base).level(x, y, z), base());
  near(porch.grade[0], datum + entrance.z);
  near(porch.grade[0], feature("deck-ground").elev);
  for (const s of entrance.stairs) {
    const g = stairGeom(s, entrance.z);
    near(g.zA + g.R, hall.z);
    if (s.ramp) {
      for (const t of [0, 0.13, 0.47, 0.82, 1]) near(g.topAt(...g.P(t * g.L, 0)), entrance.z + t * g.R);
    } else {
      assert.equal(g.N, 2);
      near(g.riser, 0.15);
      near(g.topAt(...g.P(g.L * 0.25, 0)), entrance.z + g.riser);
      near(g.topAt(...g.P(g.L * 0.75, 0)), hall.z);
    }
  }
});

test("the courtyard shutter retracts into its housing along with the painted motif", () => {
  const mesh = buildMesh([feature("hon-tower-podium")], { groundAt: () => 33.88 });
  const shutter = mesh.doors.find(d => d.kind === "shutter");
  assert.equal(shutter?.motif, "swallow");
  const doors = [shutter], open = [0];
  assert.ok(doorLeaves(doors, open).solid.count > 6);
  const half = doorLeaves(doors, [0.5]).solid.pos.filter((_, i) => i % 3 === 2);
  near(Math.min(...half), (shutter.z0 + shutter.z1) / 2);
  near(Math.max(...half), shutter.z1);
  stepDoors(doors, open, { x: (shutter.a[0] + shutter.b[0]) / 2, y: (shutter.a[1] + shutter.b[1]) / 2, z: shutter.z0 }, 1);
  assert.equal(doorLeaves(doors, open).solid.count, 0);
});

test("adjoining wings have clear corridors on all four levels and keep their exposed facades", () => {
  const hall = feature("hon-int-1f");
  const wings = [hall.host, ...hall.hosts].map(feature);
  const local = detailView([...wings, hall, ...["hon-int-b1", "hon-int-2f", "hon-int-3f"].map(feature)], { detail: true });
  const datum = 33.88;
  const groundAt = () => datum;
  const mesh = buildMesh(local, { groundAt, clip });
  const world = walkWorld({ data: { buildings: [] }, features: local, groundAt });
  let leaves = null;
  const [, , right, left] = feature("hon-int-1f-ent").coords.map(toXY);
  const length = Math.hypot(right[0] - left[0], right[1] - left[1]);
  const ux = (right[0] - left[0]) / length, uy = (right[1] - left[1]) / length;
  const xy = (u, v) => [left[0] + u * ux + v * uy, left[1] + u * uy - v * ux];
  const faceBetween = (a, b, z) => {
    const from = worldOf(a), to = worldOf(b);
    const ray = { o: [...from, z], d: [to[0] - from[0], to[1] - from[1], 0] };
    return [raycastMesh(mesh, ray, ["", "cull", "glass"]), raycastMesh(leaves, ray, ["solid", "glass"])]
      .some(hit => hit != null && hit.t <= 1);
  };
  for (const [floor, u, v] of [
    ["hon-int-b1", -43.52, 43.02], ["hon-int-1f", -43.57, 12.59], ["hon-int-1f", -8.38, 12.39],
    ["hon-int-2f", 34.68, 51.10], ["hon-int-3f", 62.08, 12.13],
  ]) {
    const z = datum + feature(floor).z;
    const a = xy(u - .65, v), b = xy(u + .65, v);
    const nearby = mesh.doors.filter(d => d.kind === "room" && Math.abs(d.z0 - z) < .1 &&
      Math.hypot(d.a[0] - a[0], d.a[1] - a[1]) < 4);
    const state = nearby.map(() => 0);
    world.setDyn((x, y, h) => roomDoorBlocked(nearby, state, x, y, h));
    leaves = doorLeaves(nearby, state);
    assert.equal(faceBetween(xy(u - .22, v), xy(u + .22, v), z + 1.6), false, "wing joint");
    for (const [from, to] of [[a, b], [b, a]]) {
      // The doorway to 227B is just beyond the second-floor joint.
      stepDoors(nearby, state, { x: from[0], y: from[1], z }, 1);
      leaves = doorLeaves(nearby, state);
      const step = to.map((x, i) => (x - from[i]) / 20);
      let [x, y] = from;
      for (let i = 0; i < 20; i++) {
        const moved = world.move(x, y, z, ...step, { deck: null });
        near(moved.floor?.z, z);
        x = moved.x; y = moved.y;
      }
      near(x, to[0]); near(y, to[1]);
      assert.equal(faceBetween(from, to, z + 1.6), false, floor + " at " + u + ", " + v);
    }
  }
  assert.ok(faceBetween(xy(-42, 65), xy(-44.6, 65), datum + 2.1), "west courtyard facade");
  assert.ok(faceBetween(xy(-8.9, 12.39), xy(-7.8, 12.39), datum + 15.3), "wall above the lower wing's roof");
});

test("the northeast light well keeps its retaining edge outside basement rooms", () => {
  const well = feature("hon-dry-ne");
  const base = 33.6;
  const terrace = prepareTerrace(well, () => base);
  const groundAt = p => terrace.level(...toXY(p), base);
  const wing = { ...feature("hon-wing-45"), groundRef: well.coords[0] };
  const mesh = buildMesh([well, wing, feature("hon-int-b1")], { groundAt, terraces: [terrace], clip });
  const [corner, next] = terrace.ring;
  const length = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
  const dx = (next[0] - corner[0]) / length, dy = (next[1] - corner[1]) / length;
  const capAt = (along, outward) => {
    const p = [corner[0] + along * dx + outward * dy, corner[1] + along * dy - outward * dx];
    const hit = raycastMesh(mesh, { o: [...worldOf(p), base + .05], d: [0, 0, -.25] }, [""]);
    return hit != null && hit.t <= 1;
  };
  assert.equal(capAt(-1.4, .21), false, "corner fan inside the north room");
  assert.equal(capAt(1.4, -7.5), false, "straight retaining edge inside the south room");
  assert.ok(capAt(.4, .6), "corner cap outside the facade");
  assert.ok(capAt(4.6, -4), "outer retaining wall");
});

test("room door panels, windows and walking collisions follow their hinges", () => {
  for (const width of [1.12, 1.80]) {
    const door = { kind: "room", a: [0, 0], b: [width, 0], n: [0, 1], width, z0: 20.016, z1: 22.178, off: 0 };
    const doors = [door], state = [0];
    const through = (mesh, x, z) => {
      const a = worldOf([x, -.22]), b = worldOf([x, .22]);
      const hit = raycastMesh(mesh, { o: [...a, z], d: [b[0] - a[0], b[1] - a[1], 0] }, [""]);
      return hit != null && hit.t <= 1;
    };
    const closed = doorLeaves(doors, state);
    const panel = width / 4, window = (width > 1.5 ? width / 2 - .004 : width - .016) - .21;
    assert.ok(through(closed.solid, panel, 21.5));
    assert.equal(through(closed.solid, window, 21.5), false);
    assert.ok(through(closed.glass, window, 21.5));
    assert.ok(roomDoorBlocked(doors, state, width / 2, 0, 20));
    stepDoors(doors, state, { x: width / 2, y: .5, z: 24 }, 1);
    assert.equal(state[0], 0);
    for (const approach of [-1, 1]) {
      stepDoors(doors, state, { x: width / 2, y: approach, z: 20 }, .3);
      assert.equal(state[0], .5);
      stepDoors(doors, state, { x: width / 2, y: approach, z: 20 }, .3);
      const opened = doorLeaves(doors, state);
      assert.equal(through(opened.solid, panel, 21.5), false);
      for (const y of [-.65, 0, .65]) assert.equal(roomDoorBlocked(doors, state, width / 2, y, 20), false);
      assert.ok(roomDoorBlocked(doors, state, .01, .6, 20), "open leaf still has thickness");
      stepDoors(doors, state, { x: 5, y: 0, z: 20 }, 1.2);
      assert.equal(state[0], 0);
    }
  }
});

test("each marked room entrance has one working door on its own floor", () => {
  for (const id of ["hon-lect-int", "hon-int-b1", "hon-int-1f", "hon-int-2f", "hon-int-3f"]) {
    const floor = feature(id), groundAt = () => 33.88;
    const tagged = floor.walls.flatMap(w => (w.doors || []).filter(d => d[2]));
    const doors = buildMesh([floor], { groundAt, clip }).doors.filter(d => d.kind === "room");
    assert.equal(doors.length, tagged.length);
    assert.ok(doors.length >= (id === "hon-lect-int" ? 6 : floor.rooms.length));
    const open = doors.map(() => 0);
    for (const d of doors) {
      near(d.z0 - .016, groundAt() + floor.z);
      const middle = d.a.map((x, i) => (x + d.b[i]) / 2);
      assert.ok(roomDoorBlocked([d], [0], ...middle, d.z0));
      assert.equal(roomDoorBlocked([d], [1], ...middle, d.z0), false);
    }
    if (id === "hon-int-1f") {
      const batches = doorBatches(doors, open);
      open[25] = .5;
      const next = doorBatches(doors, open, batches);
      assert.strictEqual(next[0], batches[0]);
      assert.notStrictEqual(next[1].solid.pos, batches[1].solid.pos);
      assert.strictEqual(next[2], batches[2]);
    }
  }
});

test("the lecture wing's six glass doors open through the exterior glazing", () => {
  const host = feature("hon-lect-core"), floor = feature("hon-lect-int"), groundAt = () => 33.88;
  const shell = detailView([host], { detail: true })[0];
  assert.equal(shell.windows.filter(w => w.kind === "glassdoor").length, 6);
  const view = detailView([host, floor], { detail: true });
  const mesh = buildMesh(view, { groundAt, clip });
  const doors = mesh.doors.filter(d => d.kind === "room" && d.glazed);
  assert.equal(doors.length, 6);
  for (const d of doors) {
    const m = d.a.map((x, i) => (x + d.b[i]) / 2);
    const cast = (offset, height) => {
      const ends = [-.35, .35].map(depth => worldOf([
        m[0] + offset * d.n[1] + depth * d.n[0], m[1] - offset * d.n[0] + depth * d.n[1],
      ]));
      return { o: [...ends[0], d.z0 + height], d: [ends[1][0] - ends[0][0], ends[1][1] - ends[0][1], 0] };
    };
    const shut = doorLeaves([d], [0]), open = doorLeaves([d], [1]);
    for (const [offset, height] of [[.16, 1], [-.22, 1.5]]) {
      const ray = cast(offset, height);
      const hits = (m, passes) => (raycastMesh(m, ray, passes)?.t ?? Infinity) <= 1;
      assert.ok(hits(shut, ["solid", "glass"]));
      assert.equal(hits(open, ["solid", "glass"]), false);
      assert.equal(hits(mesh, ["", "cull", "glass"]), false);
    }
  }
});

test("at courtyard level every classroom has a level approach through both working doors", () => {
  const local = features.filter(f => f.id.startsWith("hon-lect-") || f.id.startsWith("hon-court-c-g")).map(normalizeFeature);
  const cut = detailView(local, { detail:true, level:-1 });
  assert.equal(cut.find(f => f.id === "hon-lect-int")?.cut, true);
  assert.ok(!cut.some(f => f.id.startsWith("hon-lect-bench-") || f.id.startsWith("hon-lect-plant-")));
  const view = detailView(local, { detail:true }), groundAt = () => 29.62;
  const mesh = buildMesh(view.filter(f => f.id === "hon-lect-int" || f.id === "hon-lect-core"), { groundAt, clip });
  const doors = mesh.doors.filter(d => d.classroom);
  assert.deepEqual(doors.map(d => d.classroom).sort(), ["M-B101","M-B101","M-B104","M-B104","M-B107","M-B107"]);
  const world = walkWorld({ data:{ buildings:[] }, features:view, groundAt });
  const state = doors.map(() => 0);
  world.setDyn((x,y,z) => roomDoorBlocked(doors,state,x,y,z));
  for (const door of doors) {
    const middle = door.a.map((a,i) => (a+door.b[i])/2);
    assert.ok(world.blocked(...middle,29.75));
    const n = door.n.map(a => a*door.outside);
    let [x,y] = middle.map((a,i) => a+n[i]*1.35);
    stepDoors(doors,state,{x,y,z:29.75},1);
    for (let i=0;i<27;i++) {
      const next = world.move(x,y,29.75,-n[0]*.10,-n[1]*.10,{deck:null});
      near(next.x,x-n[0]*.10); near(next.y,y-n[1]*.10);
      near(next.floor.z,29.75);
      ({x,y}=next);
    }
    stepDoors(doors,state,null,2);
  }
  for (const f of view.filter(f => f.lectureArcade)) {
    for (const post of f.members.filter(p => p.kind === "weatheredI")) {
      assert.ok(world.blocked(...toXY(post.coords[0]),29.75));
    }
  }
});

test("both courtyard arcades have open air below the concrete blades and floor-supported steel posts", () => {
  const gravel = feature("hon-court-c-gw"), apron = feature("hon-lect-apron-e");
  const datum = gravel.grade[0], groundAt = () => datum;
  for (const side of ["w", "e"]) {
    const deck = feature("hon-lect-deck-" + side), cast = deck.panels.filter(p => p.kind === "castArch");
    assert.ok(cast.length > 0);
    const bottom = Math.min(...cast[0].zs);
    assert.ok(datum+bottom > apron.grade[0]+.10);
    for (const p of cast) {
      near(Math.min(...p.zs), bottom);
      near(Math.min(...panelSlices(p).flatMap(s => s.spans.map(([z]) => z))), bottom);
    }
    const panel = cast[Math.floor(cast.length/2)];
    const i = panel.zs.findIndex((z,i) => z === bottom && panel.zs[i+1] === bottom);
    assert.ok(i >= 0);
    const [a,b] = panel.coords.slice(i,i+2).map(toXY), mid = a.map((v,j) => (v+b[j])/2);
    const length = Math.hypot(b[0]-a[0],b[1]-a[1]), n = [(b[1]-a[1])/length,(a[0]-b[0])/length];
    const mesh = buildMesh([deck],{groundAt,clip});
    const intersectsBlade = (point,direction,z) => {
      const [from,to] = [-.32,.32].map(d => worldOf(point.map((v,j) => v+d*direction[j])));
      const hit = raycastMesh(mesh,{o:[...from,z],d:[to[0]-from[0],to[1]-from[1],0]});
      return hit != null && hit.t <= 1;
    };
    const world = walkWorld({data:{buildings:[]},features:[deck,gravel,apron],groundAt});
    const surface = world.floorBelow(...mid,datum+1).z;
    near(surface, side === "w" ? gravel.grade[0] : apron.grade[0]);
    assert.equal(intersectsBlade(mid,n,surface+.10),false);
    assert.equal(intersectsBlade(mid,n,datum+bottom-.02),false);
    assert.ok(intersectsBlade(mid,n,datum+bottom+.08));
    const underside = raycastMesh(mesh,{o:[...worldOf(mid),surface+.05],d:[0,0,1]});
    assert.ok(underside);
    near(surface+.05+underside.t,datum+bottom);
    near(underside.normal[2],-1);
    assert.ok(world.blocked(...mid,surface));
    for (const end of [cast[0].coords[1],cast.at(-1).coords.at(-2)]) {
      assert.ok(intersectsBlade(toXY(end),[n[1],-n[0]],datum+bottom+.12), "exposed end face");
    }
    const posts = deck.members.filter(p => p.kind === "weatheredI");
    assert.ok(posts.length > 0);
    for (const post of posts) near(datum+post.zs[0],apron.grade[0]);
  }
});

test("the steel crossing meets the gallery and the top stone landing at their walking heights", () => {
  const ramp = feature("hon-lect-east-ramp"), groundAt = () => 29.62, deck = prepareBridge(ramp,groundAt);
  const local = features.filter(f => f.id === ramp.id || f.id === "hon-lect-apron-e" ||
    f.id === "hon-court-c-ge" || f.id.startsWith("hon-lect-east-stoop-")).map(normalizeFeature);
  const world = walkWorld({ data:{buildings:[]}, features:local, groundAt, decks:[deck] });
  const [a,b] = [deck.xy[0],deck.xy.at(-1)], L = Math.hypot(b[0]-a[0],b[1]-a[1]);
  const n = b.map((v,i) => (v-a[i])/L), step=.055;
  let [x,y]=a.map((v,i) => v-.20*n[i]), floor=world.floorBelow(x,y,30.8);
  near(floor.z,29.75);
  for(let i=0;i<Math.ceil((L+.6)/step);i++) {
    const next=world.move(x,y,floor.z,n[0]*step,n[1]*step,{deck:floor.deck});
    near(next.x,x+n[0]*step); near(next.y,y+n[1]*step);
    assert.ok(next.floor.z >= floor.z-.005 && next.floor.z-floor.z < .03);
    ({x,y,floor}=next);
  }
  near(floor.z,30.60);
});
