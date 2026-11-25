import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MONUMENT_VIEWS, PHOTO_GROUPS, PHOTO_VIEWS } from "../campus-sns/campus3dPhotoViews.js";
import { linkedStreetView, streetViewEye, streetViewSpawn } from "../campus-sns/campus3dStreetViews.js";
import { parseFeatures, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { eyeCamera, WALK_MAX_ZOOM } from "../campus-sns/campus3dWalk.js";
import { streetModel } from "../campus-sns/campus3dStreetModels.js";
import { collectSeats, seatPick, sitPose } from "../campus-sns/campus3dSeats.js";

const records = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url))).features;
const anchor = parseFeatures(records.filter(f => f.id === "ave-main-n-arch"));

test("each unique outdoor photo opens at its own optical axis in the walking world", () => {
  assert.equal(PHOTO_VIEWS.length,45);
  assert.equal(new Set(PHOTO_VIEWS.map(v => v.number)).size,45);
  assert.equal(new Set(PHOTO_VIEWS.map(v => v.group)).size,PHOTO_GROUPS.length);
  assert.equal(linkedStreetView("?photo=54"),undefined);
  for (const view of PHOTO_VIEWS) {
    assert.equal(linkedStreetView("?photo="+view.number),view);
    assert.equal(streetViewSpawn(view,[]),null);
    const pose=streetViewSpawn(view,anchor);
    const ll=toLngLat([pose.x,pose.y]);
    assert.ok(ll.every((x,i)=>Math.abs(x-view.coord[i])<1e-8));
    assert.equal(pose.roll,-view.roll);
    assert.ok(pose.pitch>=35 && pose.pitch<=138 && pose.fov>42 && pose.fov<95);
    assert.ok(Math.abs(streetViewEye(pose,34.2,()=>34,1.6)-(view.eye-.2))<1e-9);
  }
  assert.equal(PHOTO_VIEWS.find(v=>v.number===55).aspect,4/3);
  assert.equal(PHOTO_VIEWS.find(v=>v.number===68).aspect,3/4);
  assert.ok(Math.abs(PHOTO_VIEWS.find(v=>v.number===63).roll)>25);
  assert.equal(linkedStreetView("?streetView=coffee").shop,"kaldi");
});

test("the photographed foregrounds have solid geometry and native surface materials", () => {
  const hasFinish=(name,finish)=>{
    const model=streetModel("street/avenue/"+name,true);
    for(let k=9;k<model.vertices.length;k+=10) if(model.vertices[k]===finish)return true;
    return false;
  };
  assert.ok(hasFinish("archedEntrance",17) && hasFinish("archedEntrance",18) && hasFinish("archedEntrance",20));
  assert.ok(hasFinish("chippedLanding",19) && hasFinish("chippedLanding",21));
  assert.ok(hasFinish("concreteSpandrel",22) && hasFinish("laboratoryBay",23));
  assert.ok(hasFinish("ginkgoBed",21));
  for(const n of [1,2,3]) assert.equal(records.find(f=>f.id==="ave-south5-edge-"+n).roadInset,"graniteCourse");
  assert.ok(!records.some(f=>f.id==="s4av-ginkgo-7" || f.id==="s4av-ginkgo-12"));
});

test("the Tejima garden uses the measured stone base and a single seated casting", () => {
  const garden = parseFeatures(records.filter(f => f.id.startsWith("tsz-")));
  assert.equal(garden.find(f => f.id === "tsz-paving").paving,"memorialBrick");
  assert.equal(garden.find(f => f.id === "tsz-pedestal").streetFixture,"tejimaMonument");
  assert.equal(garden.find(f => f.id === "tsz-name").streetFixture,"tejimaNameStone");
  assert.ok(!garden.some(f => f.id.startsWith("tsz-fig-") || f.id.startsWith("tsz-chair-")));
  for (const view of MONUMENT_VIEWS) {
    assert.equal(linkedStreetView("?landmark=" + view.id),view);
    assert.equal(streetViewSpawn(view,garden).yaw,view.heading);
  }
  const benches=collectSeats(garden,()=>34).filter(s => s.kind === "wallbench");
  assert.equal(benches.length,2);
  for(const bench of benches){
    const [dx,dy]=bench.front,[x,y]=bench.c;
    const from=[x+dx,y+dy,34], direction=[-dx,-dy,bench.h-1.55], length=Math.hypot(...direction);
    const hit=seatPick(benches,[from[0],from[1],35.55],direction.map(v=>v/length),34);
    assert.equal(hit?.seat,bench);
    const pose=sitPose(bench,hit.p,from);
    assert.ok((pose.stand[0]-pose.x)*dx+(pose.stand[1]-pose.y)*dy>.34);
  }
  for (const detail of [false,true]) {
    const model=streetModel("street/avenue/tejimaMonument",detail);
    const finishes=new Set(),vertices=model.vertices;
    let graniteTop=0,bronzeTop=0;
    for(let i=0;i<vertices.length;i+=10){
      const material=vertices[i+9], z=vertices[i+2]*3.588;
      assert.ok(Number.isFinite(z));
      finishes.add(material);
      if(material===25)graniteTop=Math.max(graniteTop,z);
      if(material===24 || material===27)bronzeTop=Math.max(bronzeTop,z);
    }
    assert.ok(finishes.has(24) && finishes.has(25) && finishes.has(27));
    assert.ok(Math.abs(graniteTop-1.640)<.002 && Math.abs(bronzeTop-3.588)<.002);
  }
});

test("the two close portraits keep the MapLibre eye at the walking position on different screen heights", () => {
  const garden=parseFeatures(records.filter(f=>f.id==="tsz-pedestal"));
  for (const id of ["tejima-portrait","tejima-three-quarter"]) {
    const shot=streetViewSpawn(linkedStreetView("?landmark="+id),garden);
    for(const height of [568,756,1440]) {
      const rad=Math.PI/180, fov=shot.fov*rad;
      const camera=eyeCamera({x:shot.x,y:shot.y,z:35+shot.eye},shot.yaw,shot.pitch,{height,fov});
      assert.ok(camera.zoom<=WALK_MAX_ZOOM);
      const d=.5*height/Math.tan(fov/2)*40075016.686*Math.cos(camera.center[1]*rad)/(512*2**camera.zoom);
      const [cx,cy]=toXY(camera.center), horizontal=d*Math.sin(shot.pitch*rad);
      assert.ok(Math.hypot(cx-horizontal*Math.sin(shot.yaw*rad)-shot.x,
        cy-horizontal*Math.cos(shot.yaw*rad)-shot.y)<.02);
      assert.ok(Math.abs(camera.elevation+d*Math.cos(shot.pitch*rad)-35-shot.eye)<.002);
    }
  }
});

test("both statue meshes retain the recessed orbits, projecting nose and volume behind the ears", () => {
  const tilt=17*Math.PI/180;
  for(const detail of [false,true]){
    const {vertices}=streetModel("street/avenue/tejimaMonument",detail);
    // Sample small disks in the frontal sightline, in metres from the crown.
    function surface(x,z) {
      let front=Infinity, back=-Infinity;
      for(let i=0;i<vertices.length;i+=10){
        if(vertices[i+9]!==27)continue;
        const y=vertices[i+1]*2.10;
        const height=(vertices[i+2]*3.588-3.588)*Math.cos(tilt)-y*Math.sin(tilt);
        if(Math.hypot(vertices[i]*2.10-x,height-z)<.007){
          front=Math.min(front,y);
          back=Math.max(back,y);
        }
      }
      assert.ok(Number.isFinite(front) && Number.isFinite(back));
      return {front,back};
    }
    for(const x of [-.044,.074]){
      const brow=surface(x,-.152), eye=surface(x,-.193);
      assert.ok(eye.front-brow.front>.014);
      assert.ok(eye.back-eye.front>.18);
    }
    assert.ok(surface(.018,-.210).front-surface(.021,-.259).front>.010);
  }
});
