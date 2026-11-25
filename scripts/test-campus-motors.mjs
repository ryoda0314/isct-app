import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { detailView, parseFeatures, prepareBridge, toXY } from "../campus-sns/campus3dFeatures.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { CAR, carFits, loadVehicles, placeVehicle, saveVehicles, stepCar, stepJet, vehicleCamera } from "../campus-sns/campus3dVehicles.js";
import { carParts, dentedShell } from "../campus-sns/campus3dMotorModels.js";
import { peerFrameMeshes, vehicleFrameMeshes } from "../campus-sns/campus3dVehicleMesh.js";
import { decodeCoupe } from "../campus-sns/campus3dCoupeRenderer.js";

const origin={ x:0, y:0, z:0, yaw:0 };
const world=(terrain=()=>0, occupied=()=>false)=>({
  floorBelow(x,y,ceiling) { const z=terrain(x,y); return z<=ceiling ? {z} : null; },
  blocked:(x,y,z)=>occupied(x,y,z+.1,z+1.8), blockedSpan:occupied,
});
const flat=world();

test("the driving mesh has four registered wheel hubs, independent brakes and valid near and far indices",()=>{
  const bytes=readFileSync(new URL("../public/map-3d/vehicles/coupe-v1.bin",import.meta.url));
  const mesh=decodeCoupe(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  const names=mesh.parts.map(p=>p.name);
  for(const [i,[x,y,z]] of mesh.hubs.entries()){
    assert.ok(Math.abs(x-(i<2?1:-1)*CAR.wheelbase/2)<.02);
    assert.ok(Math.abs(y-(i%2?-1:1)*CAR.track/2)<.02 && Math.abs(z-CAR.wheelR)<.01);
    assert.ok(names.includes("wheel"+i)&&names.includes("pad"+i));
  }
  assert.ok(names.includes("steering")&&names.includes("glass")&&names.includes("cabin"));
  for(const [i,p] of mesh.parts.entries()){
    const limit=(mesh.parts[i+1]?.vertex??mesh.vertexCount)-p.vertex;
    for(const [offset,count] of [p.near,p.far])
      assert.ok(count>0 && count%3===0 && mesh.indices.subarray(offset,offset+count).every(n=>n<limit));
    assert.ok(p.near[1]>=p.far[1]);
  }
  const parked=[{kind:"car",s:origin}];
  const fallback=vehicleFrameMeshes(parked).groups[0];
  const detailed=vehicleFrameMeshes(parked,{detailedCar:true,glow:.2}).groups[0];
  const night=vehicleFrameMeshes(parked,{detailedCar:true,glow:.9}).groups[0];
  assert.ok(fallback.solid.count>1000 && detailed.solid.count===0 && detailed.screen.count>0);
  assert.ok(detailed.ver>fallback.ver && night.ver===detailed.ver);
  assert.equal(night.cars[0].night,.9);
});
function run(step,s,input,seconds,w,fps=60) {
  const frames=[];
  for(let i=0;i<Math.round(seconds*fps);i++) { s=step(s,input,1/fps,w);frames.push(s); }
  return frames;
}

test("front and rear axles climb a curb separately and the suspension settles",()=>{
  const w=world((x,y)=>y>=0?.44:0,(x,y,lo)=>y>=0&&lo<.44);
  const frames=run(stepCar,{...origin,y:-4,v:6},{fwd:.32},2,w);
  const crossing=frames.find(s=>s.heights[0]>.4&&s.heights[2]===0);
  assert.ok(crossing && crossing.roadPitch>8);
  assert.ok(frames.some(s=>Math.abs(s.z-s.zr)>.05));
  assert.ok(frames.every(s=>!s.hit));
  assert.ok(Math.abs(frames.at(-1).z-.44)<.01);
  const ledge=world((x,y)=>y<0?1.5:0);
  const drop=run(stepCar,{...origin,z:1.5,y:-3,v:11},{},1.6,ledge);
  assert.ok(drop.some(s=>s.air && s.vz<0));
  assert.ok(Math.abs(drop.at(-1).z)<.02);
});

test("the garage chooses clear pavement beside a bench and accepts a sloping road",()=>{
  const bench=world((x,y)=>x<-.4&&x>-1.1&&y>.7&&y<2.1 ? .42:0);
  assert.equal(carFits(bench,0,0,0,0,true).ok,false);
  const placed=placeVehicle("car",bench,origin);
  assert.ok(placed && placed.heights.every(z=>z===0));
  const incline=world((x,y)=>.16*y+.03*x);
  assert.ok(carFits(incline,0,0,0,0,true).ok);
});

test("the coupe follows the treads of the campus South 2 exterior stair",()=>{
  const survey=JSON.parse(readFileSync(new URL("../public/map-3d/features.json",import.meta.url)));
  const features=detailView(parseFeatures(survey.features.filter(f=>/^s[24](-|av-)/.test(f.id))),{detail:true});
  const datums=[["s2-main",30.55],["s4-7e-box",31.9375]].map(([id,z])=>[toXY(features.find(f=>f.id===id).groundRef),z]);
  const groundAt=ll=>{const [x,y]=toXY(ll);return datums.find(([[a,b]])=>Math.hypot(x-a,y-b)<.04)?.[1] ?? 31.76;};
  const decks=features.filter(f=>f.type==="bridge").map(f=>prepareBridge(f,groundAt));
  const g=decks.find(d=>d.f.id==="s2-stair-n").flight;
  const w=walkWorld({data:{buildings:[]},features,decks,groundAt});
  const a=g.at(0,0), b=g.at(1,0), dx=b[0]-a[0], dy=b[1]-a[1];
  const start={x:a[0]-3*dx,y:a[1]-3*dy,z:g.low,yaw:Math.atan2(dx,dy)*180/Math.PI};
  const frames=run(stepCar,start,{fwd:.30},2.8,w);
  assert.ok(frames.some(s=>s.roadPitch>22));
  assert.ok(frames.some(s=>s.z>g.low+g.rise-.35));
});

test("thin walls stop the body at high speed, even on a long frame, and deform the struck panels",()=>{
  const w=world(()=>0,(x,y)=>y>2.5&&y<2.72);
  for(const fps of [10,30,60,120]) {
    const frames=run(stepCar,{...origin,y:-3,v:CAR.sprint},{},.8,w,fps);
    const crash=frames.find(s=>s.impact>15);
    assert.ok(crash && crash.v<0);
    assert.ok(frames.every(s=>s.y < .55));
    assert.ok(crash.dents[0]>.5 && crash.dents[1]>.5 && crash.dents[2]===0 && crash.dents[3]===0);
    const shell=carParts().body, damaged=dentedShell(shell,crash.dents);
    assert.notDeepEqual(damaged.P,shell.P);
    assert.equal(damaged,dentedShell(shell,crash.dents));
    assert.ok(frames.filter(s=>s.impact>0).length===1);
  }
  const reversing=run(stepCar,{...origin,y:7,v:-6},{fwd:-1},1,w);
  const rear=reversing.find(s=>s.impact>2);
  assert.ok(rear?.dents[2]>0 && rear.dents[0]===0);
});

test("glancing impact retains travel along the wall, while an inside corner gives an asymmetric dent",()=>{
  const w=world(()=>0,(x,y)=>y>4);
  const frames=run(stepCar,{...origin,yaw:66,v:20},{},.9,w);
  const t=frames.findIndex(s=>s.impact>2);
  assert.ok(t>=0);
  assert.ok(frames.at(-1).x>frames[t].x+3);
  assert.ok(Math.abs(frames[t].spin)>2);
  assert.notEqual(frames[t].dents[0],frames[t].dents[1]);
  assert.ok(!carFits(w,0,4,0,0).ok);
});

test("handbrake releases rear grip and leaves bounded tire marks",()=>{
  const c={...origin,v:18};
  const slide=run(stepCar,c,{fwd:.85,side:.62,handbrake:true},1.2,flat).at(-1);
  const grip=run(stepCar,c,{fwd:.85,side:.62},1.2,flat).at(-1);
  assert.ok(Math.abs(slide.slip)>Math.abs(grip.slip)+1);
  assert.ok(slide.marks.length>0 && slide.marks.length<=48);
  assert.equal(run(stepCar,{...slide,v:0,slip:0},{},8,flat).at(-1).marks.length,0);
});

test("jet thrust, bank, climb, descent and both views respond to independent inputs",()=>{
  const j=placeVehicle("jet",flat,origin);
  assert.ok(j.agl>20 && j.v>20);
  const climbing=run(stepJet,j,{fwd:1,side:1,up:true},2,flat).at(-1);
  assert.ok(climbing.v>j.v+10 && climbing.z>j.z+10 && climbing.yaw>8 && climbing.bank>40);
  const descent=run(stepJet,climbing,{down:true,fwd:-1},3,flat).at(-1);
  assert.ok(descent.z<climbing.z && descent.v<climbing.v);
  for(const view of ["fp","tp"]) {
    const cam=vehicleCamera("jet",climbing,view,{pitch:77,yaw:0},1/60,flat);
    assert.ok([cam.x,cam.y,cam.z,cam.roll].every(Number.isFinite));
    assert.ok(view==="fp" ? Math.hypot(cam.x-climbing.x,cam.y-climbing.y)<4 : cam.D>12);
  }
});

test("a gentle touchdown allows taxi, takeoff and gear retraction; a clipped wing resets to the launch pose",()=>{
  const j=placeVehicle("jet",flat,origin);
  const approach={...j,z:.30,v:22,throttle:.22,pitch:-6};
  const landed=run(stepJet,approach,{fwd:-1},2,flat).at(-1);
  assert.ok(landed.grounded && landed.gearDown>.95 && landed.z===0);
  const airborne=run(stepJet,landed,{fwd:1,up:true},7,flat).at(-1);
  assert.ok(!airborne.grounded && airborne.z>12 && airborne.gearDown<.1);
  const pillar=world(()=>0,(x,y,lo,hi)=>x>4.20&&x<4.70&&y>4&&y<4.8&&lo<45&&hi>8);
  const hit=run(stepJet,j,{},.4,pillar,10).find(s=>s.recovered);
  assert.ok(hit && hit.x===j.launch.x && hit.y===j.launch.y && hit.z===j.launch.z);
});

test("version-one parking records, dents and a jet camera preference round-trip",()=>{
  const prev=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  let saved=JSON.stringify({v:1,parked:{car:origin},view:{car:"fp"}});
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>saved,setItem:(_,v)=>{saved=v;}}});
  try {
    const st=loadVehicles();
    assert.deepEqual(st.parked.car,origin);assert.equal(st.view.jet,"tp");
    st.parked.car.dents=[.8,.2,0,0];st.view.jet="fp";saveVehicles(st);
    assert.deepEqual(loadVehicles(),st);
  } finally { if(prev) Object.defineProperty(globalThis,"localStorage",prev);else delete globalThis.localStorage; }
});

test("parked damage invalidates the GPU cache and peers use separate geometry buffers",()=>{
  const pack=dents=>vehicleFrameMeshes([{kind:"car",s:{...origin,dents},rider:null}]).groups[0];
  const a=pack([0,0,0,0]),b=pack([.7,0,0,0]);
  assert.ok(b.ver>a.ver);assert.equal(pack([.7,0,0,0]).ver,b.ver);
  const jet=placeVehicle("jet",flat,origin);
  const own=vehicleFrameMeshes([{kind:"jet",s:jet,rider:"tp",view:"tp"}]).groups.at(-1);
  const peers=peerFrameMeshes([{...origin,x:11,st:5,speed:8}],1234,.2,{...origin,world:flat});
  assert.ok(own.solid.count>1000&&peers.groups[0].solid.count>1000);
  assert.notEqual(own.solid.pos.buffer,peers.groups[0].solid.pos.buffer);
});
