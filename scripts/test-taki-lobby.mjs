import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { detailView, normalizeFeature, pointInRing, toXY } from "../campus-sns/campus3dFeatures.js";
import { addFloor, roofCeiling } from "../campus-sns/campus3dInterior.js";
import { buildMesh, Mesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { collectSeats, seatPick, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const {features}=JSON.parse(readFileSync(new URL("../public/map-3d/features.json",import.meta.url)));
const source=features.find(f=>f.id==="taki-int-1f");
const site=features.filter(f=>f.id===source.host || f.id.startsWith("taki-int-")).map(f=>normalizeFeature(f));
const floor=site.find(f=>f.id===source.id), host=site.find(f=>f.id===source.host);
const view=detailView(site,{detail:true,level:"all"}), ground=33.9, groundAt=()=>ground;
const world=walkWorld({data:{buildings:[],water:[]},features:view,groundAt});
const ring=it=>it.coords.map(toXY);
const middle=it=>ring(it).reduce((s,p)=>s.map((v,k)=>v+p[k]/it.coords.length),[0,0]);
const distance=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
const styled=style=>floor.items.filter(it=>it.style===style);
const origin=toXY([139.68455,35.60618]), angle=-7.44*Math.PI/180;
const onPlan=(x,y)=>[origin[0]+x*Math.cos(angle)-y*Math.sin(angle),origin[1]+x*Math.sin(angle)+y*Math.cos(angle)];

test("the three lounge pairs and the sixteen café chairs are reachable and face their own tables",()=>{
  const seats=collectSeats([floor],groundAt);
  for (const [seatStyle,tableStyle,n] of [["folded","lobbyLow",3],["cafeBow","cafePedestal",8]]) {
    const tables=styled(tableStyle).map(middle), assignments=Array(n).fill(0);
    assert.equal(tables.length,n);
    assert.equal(styled(seatStyle).length,2*n);
    for (const it of styled(seatStyle)) {
      const c=middle(it), seat=seats.find(s=>distance(s.c,c)<.01);
      const times=tables.map(q=>distance(q,c)), i=times.indexOf(Math.min(...times));
      const target=tables[i], r=ring(it);
      const sideLength=distance(r[0],r[1]);
      const across=r[1].map((v,j)=>(v-r[0][j])/sideLength);
      const approaches=[-1,1].map(s=>c.map((v,k)=>v+s*across[k]*(sideLength/2+.35)));
      const from=approaches.find(p=>{
        if(world.blocked(...p,ground) || Math.abs(world.floorBelow(...p,ground+.1)?.z-ground)>.03) return false;
        const eye=[...p,ground+1.55], delta=[c[0]-p[0],c[1]-p[1],seat.seat-eye[2]];
        return seatPick(seats,eye,delta.map(v=>v/Math.hypot(...delta)),ground)?.seat===seat;
      });
      assert.ok(from,`aisle beside ${seatStyle} ${i}`);
      const pose=sitPose(seat,c,[...from,ground]), yaw=pose.yaw*Math.PI/180;
      assert.ok((Math.sin(yaw)*(target[0]-c[0])+Math.cos(yaw)*(target[1]-c[1]))/times[i]>.97);
      assignments[i]++;
    }
    assert.deepEqual(assignments,Array(n).fill(2));
  }
});

test("the cut concrete panels retain the stair opening and have metre-scale construction joints",()=>{
  const M={m:new Mesh(),glassy:new Mesh(),veil:new Mesh(),finishes:new Map()};
  addFloor(M,{...floor,items:[],walls:[],stairs:[]},{groundAt});
  const panels=M.finishes.get("takiConcrete").flatMap(batch=>batch.area);
  assert.ok(panels.length>=22 && panels.length<110);
  const onPanel=p=>panels.some(([outer,...holes])=>pointInRing(...p,outer) && !holes.some(r=>pointInRing(...p,r)));
  const p=toXY([139.6847582,35.6061555]), rot=-6.63*Math.PI/180;
  const at=(x,y)=>[p[0]+x*Math.cos(rot)-y*Math.sin(rot),p[1]+x*Math.sin(rot)+y*Math.cos(rot)];
  for(const delta of [-.03,.03]) assert.ok(onPanel(at(delta,-1.5)));
  assert.equal(onPanel(at(0,-1.5)),false);
  for(const hole of floor.holes) if(pointInRing(...middle(hole),ring(hole))) assert.equal(onPanel(middle(hole)),false);
});

test("lobby posts meet the slab or the roof framing directly above each footprint",()=>{
  const structure=buildMesh(view.map(f=>f.type==="floor"?{...f,items:[],walls:[],stairs:[]}:f),{groundAt});
  for (const [x,y] of [[5.5,-7.63],[-1.36,-.64],[5.37,1.69],[12.08,4.15],[19.04,-.26],[18.94,6.59],[25.94,-.16],[25.91,8.99]]) {
    const post=floor.items.find(it=>it.kind==="white" && distance(middle(it),onPlan(x,y))<.14);
    const p=middle(post), start=.8;
    const hit=raycastMesh(structure,{o:[...worldOf(p),ground+start],d:[0,0,1]});
    assert.ok(hit && post.z1>=start+hit.t-.035 && post.z1<start+hit.t+.24);
  }
});

test("both vestibule faces meet continuous roof beams and both automatic doors can be crossed",()=>{
  const panes=floor.walls.filter(w=>w.kind==="glass" && w.frame==="buttJoint");
  assert.equal(panes.length,3);
  const roof=roofCeiling(host,groundAt);
  for(const w of panes) {
    const beam=floor.walls.find(b=>b.kind==="wall" && JSON.stringify(b.coords)===JSON.stringify(w.coords));
    assert.ok(beam);
    for(const [j,p] of ring(w).entries()) {
      const head=j?w.h2:w.h, bottom=j?beam.z02:beam.z0, top=bottom+(j?beam.h2:beam.h);
      assert.ok(Math.abs(head-bottom)<.01 && head>5);
      assert.ok(top>=roof.soffit(p)-ground-.07 && top<=roof.soffit(p)-ground+.20);
    }
  }
  const grate=styled("vestibuleGrate")[0], p=middle(grate), mesh=buildMesh(view,{groundAt});
  const up=raycastMesh(mesh,{o:[...worldOf(p),ground+2.7],d:[0,0,1]});
  assert.ok(up && up.t+2.7>5.1,"uninterrupted view up to the roof inside the airlock");
  const passage=[[20.6,6.39],[23.70,6.39],[23.70,8.03],[23.25,10.02]];
  for(const stops of [passage,[...passage].reverse()]) {
    let p=onPlan(...stops[0]);
    for (const next of stops.slice(1)) {
      const q=onPlan(...next), steps=Math.ceil(distance(p,q)/.07), d=q.map((v,k)=>(v-p[k])/steps);
      for(let j=0;j<steps;j++) {
        const r=world.move(...p,ground,...d);
        assert.ok(distance([r.x,r.y],p.map((v,k)=>v+d[k]))<.008,"walk through both perpendicular doorways");
        p=[r.x,r.y];
      }
    }
  }
});
