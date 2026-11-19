import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { doorLeaves, roomDoorBlocked, stepDoors } from "../campus-sns/campus3dDoors.js";
import { detailView, foldedScreenBays, panelSlices, parseFeatures, prepareBridge, stairsPath, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { collectSeats, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { dem } from "../campus-sns/campusDem.js";

const survey = JSON.parse(readFileSync(new URL("../public/map-3d/features.json",import.meta.url)));
const features = parseFeatures(survey.features.filter(f => f.id.startsWith("k70-")));
const view = detailView(features,{detail:true});
const byId = id => features.find(f => f.id === id);
const body = byId("k70-body"), forecourt = byId("k70-g-n").elev;
const lobby = byId("k70-walk").elev;
const [sw,se] = body.coords.map(toXY);
const dx=se[0]-sw[0], dy=se[1]-sw[1], len=Math.hypot(dx,dy);
const xy=(s,t)=>[sw[0]+((s+32.8)*dx-(t-110.5)*dy)/len,sw[1]+((s+32.8)*dy+(t-110.5)*dx)/len];
const groundAt = p => {
  if (p[0]===body.groundRef[0] && p[1]===body.groundRef[1]) return lobby;
  const [x,y] = toXY(p);
  return ((x-sw[0])*dx+(y-sw[1])*dy)/len > 39.5 ? lobby : forecourt;
};
const mesh = buildMesh(view,{groundAt,clip,pal:PALETTES.light});
const near = (a,b,tol=.025) => assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const trace = (source,a,b,z,passes) => {
  const from=worldOf(a),to=worldOf(b);
  return raycastMesh(source,{o:[...from,z],d:[to[0]-from[0],to[1]-from[1],0]},passes)?.t ?? Infinity;
};

test("round and diamond openings go through the folded clay blocks between their webs", () => {
  const panel=byId("k70-screen-terra").panels[0];
  const bays=foldedScreenBays(panel);
  assert.equal(bays.length,12);
  assert.equal(panelSlices(panel).length,2*bays.length);
  const [a,b,c]=bays[5], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const u=b.map((v,i)=>(v-a[i])/L), n=[u[1],-u[0]];
  near(Math.hypot(c[0]-b[0],c[1]-b[1]),.38);
  const start=forecourt+panel.zs[0], pitch=(panel.zs[2]-panel.zs[0])/18;
  const pass=(s,z) => {
    const point=d=>a.map((v,i)=>v+u[i]*s+n[i]*d);
    return trace(mesh,point(.14),point(-.14),z,["","cull"])>1;
  };
  for (const row of [1,9,14]) {
    const z=start+(row+.5)*pitch, w=(L-.046)/2;
    for (const col of [0,1]) {
      const x=.023+(col+.5)*w, center=z+(col ? .012 : -.012);
      assert.ok(pass(x,center));
      assert.equal(pass(x+w*.43,center),false);
      // The same diagonal offset is inside a circular bore and outside a diamond bore.
      assert.equal(pass(x+.087,center+.064),(row+col)%2===0);
    }
  }
  for (const [id,count] of [["k70-screen-s",44],["k70-screen-w",22]]) {
    const p=byId(id).panels[0];
    assert.equal(foldedScreenBays(p).length,count);
    assert.equal(panelSlices(p).length,2*count);
  }
});

function walk(world,from,to,z,label="ramp") {
  let [x,y]=from, floor=world.floorBelow(x,y,z+.18);
  const dx=to[0]-x,dy=to[1]-y,n=Math.ceil(Math.hypot(dx,dy)/.06);
  const heights=[floor.z];
  for (let i=0;i<n;i++) {
    ({x,y,floor}=world.move(x,y,floor.z,dx/n,dy/n,{deck:floor.deck}));
    assert.ok(floor);
    heights.push(floor.z);
  }
  assert.ok(Math.hypot(x-to[0],y-to[1])<.08,`${label} from ${from} to ${to} stopped at ${[x,y,floor.z]}`);
  return heights;
}

test("all three glazed pairs open onto the foyer and the three timber doors open into the rear gallery", () => {
  const doorways=mesh.doors.filter(d=>d.hardware==="bronzeDiagonal" || (d.timber && d.z0>lobby && Math.abs(d.width-1.65)<.1));
  assert.equal(doorways.filter(d=>d.hardware).length,3);
  assert.equal(doorways.length,6);
  const world=walkWorld({data:{buildings:[]},features:view,groundAt});
  for (const d of doorways) {
    assert.ok(d.width>1.5);
    const state=[0], mid=d.a.map((v,i)=>(v+d.b[i])/2);
    const at=(s,h=0)=>mid.map((v,i)=>v+d.n[i]*s+(i===0 ? d.n[1] : -d.n[0])*h);
    assert.ok(roomDoorBlocked([d],state,...mid,d.z0));
    assert.ok(trace(doorLeaves([d],state),at(-.33,.27),at(.33,.27),d.z0+1.32,["solid","glass"])<1);
    const [x,y]=at(1.05);
    stepDoors([d],state,{x,y,z:d.z0},1);
    assert.equal(state[0],1);
    assert.ok(trace(doorLeaves([d],state),at(-.33,.27),at(.33,.27),d.z0+1.32,["solid","glass"])>1);
    assert.ok(trace(mesh,at(-.36,.27),at(.36,.27),d.z0+1.32,["","cull","glass"])>1);
    world.setDyn((x,y,z)=>roomDoorBlocked([d],state,x,y,z));
    walk(world,at(-.8),at(.8),d.z0,d.hardware || "timber");
    walk(world,at(.8),at(-.8),d.z0,d.hardware || "timber");
  }
});

test("the vehicle entrance ramp connects the court to the accessible sliding door without a curb", () => {
  const ramp=byId("k70-north-ramp");
  const deck=prepareBridge(ramp,groundAt), world=walkWorld({data:{buildings:[]},features:view,groundAt,decks:[deck]});
  const door=mesh.doors.find(d=>d.kind==="single" && Math.abs(d.z0-forecourt-.30)<.015);
  assert.ok(door);
  const mid=door.a.map((v,i)=>(v+door.b[i])/2);
  const points=[xy(-12.02,139.7),deck.xy.at(-1),mid,xy(-11.85,133.3)];
  const heights=[];
  for (let i=1;i<points.length;i++) heights.push(...walk(world,points[i-1],points[i],heights.at(-1) ?? forecourt));
  near(heights[0],forecourt); near(heights.at(-1),door.z0);
  for(let i=1;i<heights.length;i++) assert.ok(Math.abs(heights[i]-heights[i-1])<.04);
});

test("the southwest garden stair has two tiled flights and walking follows the visible treads", t => {
  const stair=byId("k70-garden-stairs");
  const base=[28.02,28.17,28.69,28.85,30.20,30.20], points=stair.coords.map(toXY);
  const direction=points.at(-1).map((v,i)=>v-points[0][i]), L=Math.hypot(...direction);
  const along=p=>direction.reduce((s,v,i)=>s+(p[i]-points[0][i])*v/L,0);
  const stations=points.map(along);
  t.mock.method(dem,"baseAt",ll=>{
    const x=along(toXY(ll)), i=stations.findIndex(s=>s>=x);
    if(i<=0) return base[i===0 ? 0 : base.length-1];
    return base[i-1]+(base[i]-base[i-1])*(x-stations[i-1])/(stations[i]-stations[i-1]);
  });
  dem.setBurns([stair]);
  t.after(()=>dem.setBurns([]));
  const sl=dem.slopes[0], deck=stairsPath(sl), g=p=>dem.groundAt(p);
  assert.equal(stair.material,"clayMosaic");
  assert.equal(sl.treads.filter(p=>p.flat).length,3);
  const draw=buildMesh([stair],{groundAt:g,clip,pal:PALETTES.light,slopes:[sl]});
  for (const st of sl.treads) {
    const s=(st.s0+st.s1)/2, p=points[0].map((v,i)=>v+direction[i]*s/L);
    near(deck.treadAt(s),st.top);
    const hit=raycastMesh(draw,{o:[...worldOf(p),st.top+.09],d:[0,0,-.18]},[""]);
    assert.ok(hit && hit.t<1);
    near(st.top+.09-.18*hit.t,st.top,.007);
  }
  const world=walkWorld({data:{buildings:[]},features:[stair],groundAt:g,decks:[deck]});
  for(const rev of [false,true]) {
    const heights=walk(world,points.at(rev?-1:0),points.at(rev?0:-1),rev?30.22:28.10,"garden stair");
    near(Math.abs(heights.at(-1)-heights[0]),2.12);
    for(let i=1;i<heights.length;i++) assert.ok(Math.abs(heights[i]-heights[i-1])<.16);
  }
});

test("the raked hall retains 611 seats facing the curved stage and its five acoustic reflectors", () => {
  const hall=byId("k70-int-hall"),rear=byId("k70-int-hall-rear");
  const seats=collectSeats([hall,rear],groundAt);
  assert.equal(seats.length,611);
  for (const s of seats) {
    const pose=sitPose(s,s.c,[...s.c,s.z0]);
    const dir=[Math.sin(pose.yaw*Math.PI/180),Math.cos(pose.yaw*Math.PI/180)];
    assert.ok((dir[0]*dx+dir[1]*dy)/len < -.83);
  }
  const world=walkWorld({data:{buildings:[]},features:view,groundAt});
  const stage=lobby+hall.z+.95;
  near(world.floorBelow(...xy(-27.2,120.5),stage+.12).z,stage);
  const shell=hall.items.find(i=>i.style==="acousticShell");
  const [a,b]=shell.coords.map(toXY),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const u=b.map((x,i)=>(x-a[i])/length), n=[u[1],-u[0]];
  const depth=t=>{
    const point=d=>a.map((v,i)=>v+(b[i]-v)*t+n[i]*d);
    return 1-trace(mesh,point(1),point(0),stage+1.5,[""]);
  };
  for(let i=0;i<5;i++) {
    const ridge=depth((i+.5)/5), groove=depth((i+(i<2 ? .955 : .045))/5);
    assert.ok(ridge-groove>.29,`bay ${i} has depths ${ridge} and ${groove}`);
  }
});
