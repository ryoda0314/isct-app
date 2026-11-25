import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { parseFeatures, prepareBridge, preparePaving, prepareTerrace } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { PALETTES } from "../campus-sns/campusBasemap.js";

const survey = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const ids = ["walkfilm-west8-ramp", "w3-w8ent-deck", "taki-walk", "ent-walk", "walkfilm-auditorium-carriage"];
const features = parseFeatures(survey.features.filter(f => ids.includes(f.id)));
const get = id => features.find(f => f.id === id);

test("the West 8 ramp follows its granite walking surface around the corner and over the trench", () => {
  const f = get("walkfilm-west8-ramp");
  // The datum is on the road. The path itself passes over a basement 8 m below.
  const groundAt = p => Math.hypot(p[0]-f.groundRef[0], p[1]-f.groundRef[1]) < 1e-9 ? 29.6 : 21.42;
  const bridges = [f, get("w3-w8ent-deck")];
  const decks = bridges.map(b => prepareBridge(b, groundAt));
  const ramp = decks[0];
  const mesh = buildMesh(bridges, { groundAt, clip, pal: PALETTES.light });
  const world = walkWorld({ data:{ buildings:[] }, features:bridges, groundAt, decks });
  assert.equal(f.handrail, "pickets");
  assert.ok(Math.abs(ramp.elev[0] - 29.66) < .016);
  assert.ok(Math.abs(ramp.elev.at(-1) - 31.22) < .016);
  for (let i=1; i<ramp.xy.length; i++) {
    const a=ramp.xy[i-1], b=ramp.xy[i], p=[(a[0]+b[0])/2, (a[1]+b[1])/2];
    const z=(ramp.elev[i-1]+ramp.elev[i])/2;
    const floor=world.floorBelow(...p,z+.2);
    assert.ok(floor && Math.abs(floor.z-z)<.05);
    const hit=raycastMesh(mesh, {o:[...worldOf(p),z+.25],d:[0,0,-1]}, ["floors"]);
    assert.ok(hit && Math.abs(.25-hit.t)<.05);
    const batch=mesh.floors.batches.find(b => b.first<=3*hit.tri && b.first+b.count>3*hit.tri);
    assert.equal(batch.finish,"paving/roseFlags");
  }
});

test("the lightwell boards clear the upper slab without filling the basement, and the auditorium lane descends continuously", () => {
  const terrace=get("taki-walk"), boards=get("ent-walk"), groundAt=()=>33.85;
  const model=buildMesh([terrace,boards], { groundAt, terraces:[prepareTerrace(terrace,groundAt)], clip });
  assert.ok(model.floors.batches.some(b=>b.finish==="lightDeck" && b.count>0));
  assert.ok(boards.pavingHost===terrace.id && boards.pavingLift>.03);
  assert.equal(boards.grade,undefined);
  const road=get("walkfilm-auditorium-carriage"), patch=preparePaving(road);
  assert.ok(patch && road.groundBlend>0);
  const n=road.coords.length/2;
  const centerRise=(road.grade[n-1]+road.grade[n]-road.grade[0]-road.grade.at(-1))/2;
  assert.ok(centerRise>1.1 && centerRise<1.3);
  for (let i=1;i<n;i++) {
    assert.ok(Math.abs(road.grade[i]-road.grade[i-1])<.35);
    assert.ok(Math.abs(road.grade.at(-i-1)-road.grade.at(-i))<.35);
  }
});
