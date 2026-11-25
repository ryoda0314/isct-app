import * as THREE from "three";
import { C, at, edges, nearestEdge, orientedFrame, geometryResources, buildingGeometry } from "./buildingsGeometry.js";
import { makeHall, makeLibrary, makeTowers, linkHalls } from "./buildingsLandmarks.js";
import { paths } from "./data.js";
export { buildingNotes } from "./buildingsSurvey.js";

const finishes = {
  S1: ["ribbon",C.pale,5.1], S2:["fins",0xa39d8b,3.8], S4:["plant",C.pale,5.7],
  S5:["plant",C.white,4.4], S6:["plant",0xb7b7ae,5], S7:["workshop",C.pale,5.1],
  S8:["slits",0xd5d3c8,2.3], R1:["blades",0xb6baba,4.1],
  R2:["balconies",0xbfc4c1,4.1], R3:["blades",C.pale,4.6], "R3-LOW":["workshop",0xaaa69a,4.9],
  "R1-A":["ribbon",0xb4b6b4,5], "R1-B":["depot",C.pale,4.3],
  "R2-A":["ribbon",C.wall,4.8], "R2-B":["utility",C.pale,4.7],
  "R2-C":["utility",C.wall,5.5], "R2-D":["plant",0xb9baba,6.8], "R2-E":["utility",C.wall,4.8],
  "R3-A":["plant",C.pale,7], "R3-B":["depot",C.pale,5.1], "R3-C":["workshop",C.wall,4.4],
  "R3-D":["tile",0x898986,3.8], B1:["roundBalcony",0xb4aca5,4.1], B2:["roundBalcony",0xb4aca5,4.1],
  "B1B2-A":["screen",0xc5c2b7,4.1], "B1B2-B":["tile",0xa8a9a6,3.4],
  "B1B2-C":["tile",0xbdbab2,3.8], J1:["ribbon",0xc4c4b9,4.5],
  G1:["blades",0xbcc3c1,4.5], G2:["blades",0xbbc0bc,4.2], G3:["grid",0xc5c3b9,4.1],
  G4:["ribbon",C.pale,5.4], "G4-A":["shed",0xcad3d2,6], G5:["tile",0xbcb5a9,3.45],
};
const glasses=[0x566e73,0x70878a,0x778b8d,0x657e84,0x52686d,0x819395,0x697f82];
const glassFor=(row,col)=>glasses[Math.abs(row*17+col*31+(col%4)*(row%3))%glasses.length];
const canon=id=>String(id).toUpperCase().replace("B1-B2-","B1B2-");

// Raised letters on the upper concrete stair towers, drawn with physical
// strokes so that the identifiers stay sharp at every viewing distance.
const lettering={
  R:[[[0,0],[0,1],[.55,1],[.73,.86],[.73,.65],[.55,.51],[0,.51]],[[.37,.51],[.78,0]]],
  B:[[[0,0],[0,1],[.53,1],[.7,.86],[.7,.66],[.52,.53],[0,.53]],[[.48,.53],[.73,.39],[.73,.16],[.55,0],[0,0]]],
  G:[[[.76,.83],[.55,1],[.21,1],[0,.8],[0,.2],[.21,0],[.58,0],[.76,.16],[.76,.49],[.42,.49]]],
  J:[[[.63,1],[.63,.2],[.48,0],[.2,0],[0,.16]]],
  "1":[[[.09,.79],[.36,1],[.36,0]]], "2":[[[0,.79],[.16,1],[.53,1],[.69,.8],[.68,.61],[0,.02],[.73,.02]]],
  "3":[[[0,.91],[.2,1],[.53,1],[.69,.82],[.63,.63],[.41,.52],[.66,.4],[.71,.19],[.55,0],[.17,0],[0,.12]]],
};
function stairTowerSign(m,edge,id,t,base) {
  if(![...id].every(ch=>lettering[ch]))return;
  const scale=1.42,right=Math.sign(edge.dx*edge.nz-edge.dz*edge.nx);
  const letterPoint=(x,y)=>{
    const p=at(edge,t+(x-.83)*scale*right,.615);
    return [p[0],base+.27+scale*y,p[1]];
  };
  for(const [i,c] of [...id].entries()){
    for(const line of lettering[c]){
      for(let j=1;j<line.length;j++){
        m.beam(letterPoint(i+.02+line[j-1][0],line[j-1][1]),letterPoint(i+.02+line[j][0],line[j][1]),.112,C.white);
      }
    }
  }
}

function sash(m,e,t,y,w,h,row,col) {
  m.face(e,t,.042,y,w,h,.095,C.dark);
  m.face(e,t,.10,y,w-.12,h-.12,.052,glassFor(row,col),true);
  if(w>1.65)m.face(e,t,.146,y,.059,h,.055,C.silver);
  if(w>3)m.face(e,t,.146,y+h*.23,w,.045,.065,C.frame);
  m.face(e,t,.16,y-h*.5,w+.16,.095,.31,C.concrete);
}

function horizontalShade(m,e,base,floor,levels,style) {
  const c=e.length/2,w=e.length-.3,out=style==="balconies"?.98:.74;
  for(let r=1;r<levels;r++){
    const y=base+floor*r;
    m.face(e,c,out*.48,y,w,.20,out*1.12,C.concrete);
    if(style==="balconies"){
      m.face(e,c,out,y+.47,w,.77,.13,0xa6b3b1);
      m.face(e,c,out+.035,y+.92,w,.085,.12,C.silver);
    }else{
      for(let j=0;j<4;j++)m.face(e,c,out,y+.16+j*.19,w,.119,.17,j===3?C.silver:C.metal);
    }
    const posts=Math.max(2,Math.round(w/4.2));
    for(let n=0;n<=posts;n++)m.face(e,.18+(w-.05)*n/posts,out-.12,y+.48,.07,.95,.09,C.frame);
  }
}

function balconies(m,e,base,floor,levels) {
  const count=Math.max(1,Math.floor(e.length/13));
  for(let n=0;n<count;n++){
    const t=(n+.55)/count*e.length,p=at(e,t,.33);
    for(let r=1;r<levels;r++){
      const y=base+floor*r;
      m.part("round",p,y+.14,2.8,.28,1.75,e.yaw,C.concrete);
      // Shallow curved balcony balustrades are open behind, against the window.
      for(let k=0;k<8;k++){
        const a=Math.PI*k/8,b=Math.PI*(k+1)/8;
        const p0=at(e,t+1.36*Math.cos(a),.34+.83*Math.sin(a));
        const p1=at(e,t+1.36*Math.cos(b),.34+.83*Math.sin(b));
        const dx=p1[0]-p0[0],dz=p1[1]-p0[1];
        m.box([(p0[0]+p1[0])/2,(p0[1]+p1[1])/2],y+.5,Math.hypot(dx,dz)+.025,.67,.13,-Math.atan2(dz,dx),C.wall);
        m.beam([p0[0],y+.91,p0[1]],[p1[0],y+.91,p1[1]],.075,C.silver);
      }
    }
  }
}

function storeys(m,ring,frame,id,base,height,levels,style,color,pitch) {
  const floor=height/levels;
  const grid=["grid","ribbon","roundBalcony","balconies","blades","workshop","utility","screen"].includes(style);
  for(const [edgeIndex,e] of edges(ring).entries()){
    if(e.length<2)continue;
    const long=Math.abs(e.dx*frame.ux+e.dz*frame.uz)>.78;
    const major=e.length>Math.min(frame.width*.32,14);
    const gable=!long && levels>=5;
    const margin=gable?Math.min(e.length*.22,3.0):Math.min(1.35,e.length*.12);
    const count=Math.max(1,Math.round((e.length-2*margin)/(pitch*(gable?1.4:1))));
    const bay=(e.length-2*margin)/count;
    const slit=style==="slits", single=style==="tile"||slit;
    for(let r=0;r<levels;r++){
      for(let j=0;j<count;j++){
        if((style==="plant"||style==="depot"||style==="shed") && (j+2*r+edgeIndex)%3!==0)continue;
        let w=bay*(grid?.87:single?.41:.60),h=floor*(single?.55:.49);
        if(gable&&!single){w=bay*.37;h=floor*.39;}
        const t=margin+(j+.5)*bay,y=base+(r+.55)*floor;
        if(slit){w=Math.min(w,.77);h=floor*.49;}
        if(style==="plant"||style==="depot"){w=Math.min(1.15,w);h=Math.min(1.05,h);}
        sash(m,e,t,y,Math.max(.48,w),Math.max(.48,h),r,j+edgeIndex);
        if(slit)m.face(e,t,.09,y+h*.68,.43,.21,.11,C.dark);
        if(style==="fins" && major) m.face(e,t-bay*.41,.34,base+floor*(r+.5),.35,floor,.71,color);
      }
      if(major && grid && long && r>0 && style!=="blades"&&style!=="balconies"){
        m.face(e,e.length/2,.14,base+r*floor,e.length,.14,.36,C.concrete);
      }
    }
    if(!major)continue;
    if(long && ["blades","balconies"].includes(style))horizontalShade(m,e,base,floor,levels,style);
    if(long && style==="roundBalcony")balconies(m,e,base,floor,levels);
    if(long && ["grid","balconies","roundBalcony","fins","blades"].includes(style)){
      for(const f of (style==="grid"||id==="R2"?[.035,.5,.965]:[.032,.968])){
        const w=Math.min(2.3,e.length*.08);
        m.face(e,e.length*f,.26,base+height*.5,w,height+.25,.61,color);
        if(style==="grid"&&f===.5)m.face(e,e.length*f,.57,base+height*.5,w*.75,height+.35,.08,0xaba89e);
      }
    }
    if(style==="screen"&&long){
      for(let u=1;u<e.length-1;u+=.97)m.face(e,u,.44,base+height*.55,.12,height*.82,.66,0xa59e8f);
    }
    if(style==="utility"&&long){
      for(let v=0;v<5;v++)m.face(e,e.length*.5,.52,base+.42+v*.28,e.length*.9,.14,.20,C.metal);
    }
    if(style==="plant"||style==="shed"){
      for(let u=1;u<e.length;u+=style==="shed"?1.12:4.2)m.face(e,u,.015,base+height*.5,.035,height,.06,C.concrete);
    }
    m.face(e,e.length/2,.045,base+height+.13,e.length+.13,.26,.30,C.pale);
  }
}

function entrance(m,ring,base,approach,id,style) {
  const door=nearestEdge(ring,approach,3.1);if(!door)return;
  const e=door.edge,w=Math.min(e.length-.55,style==="plant"||style==="shed"?2.4:3.4);
  const t=THREE.MathUtils.clamp(door.t,w*.5+.22,e.length-w*.5-.22);
  m.face(e,t,.23,base+1.28,w+.20,2.56,.49,C.dark);
  for(const left of [-1,1]){
    m.face(e,t+left*w*.247,.50,base+1.24,w*.47,2.38,.06,style==="shed"?0x326494:0x5b787f,true);
    m.face(e,t+left*.13,.57,base+1.15,.042,.44,.10,C.silver);
  }
  m.face(e,t,.53,base+2.13,w,.07,.08,C.silver);
  const canopy=["R3-D","G5","B1B2-C"].includes(id)?C.dark:C.concrete;
  m.face(e,t,.78,base+2.83,w+1.35,.23,1.7,canopy);
  if(id==="R3-D"){
    const width=w+1.35;
    m.face(e,t,.87,base+2.88,width,.46,1.75,C.dark);
    for(const side of [-1,1])m.part("round",at(e,t+side*width/2,.87),base+2.88,1.7,.46,1.7,0,C.dark);
  }
  m.face(e,t,.84,base+.09,w+1.0,.18,1.67,C.concrete);
  if(id==="B1B2-A"){
    const span=Math.min(e.length-1,11);
    for(let u=-span/2;u<=span/2;u+=1.25)m.face(e,t+u,2.35,base+3.55,.12,.18,4.7,0xbda582);
    for(let v=0;v<5;v+=1)m.face(e,t,v+.2,base+3.4,span,.16,.11,0xbda582);
    for(const side of [-1,1])m.face(e,t+side*span*.46,4.2,base+1.75,.19,3.5,.19,C.metal);
  }
}

function serviceElevation(m,e,base,levelHeight,levels,id) {
  const pipe=at(e,e.length-.65,.29);
  m.part("round",pipe,base+levels*levelHeight*.50,.13,levels*levelHeight-.24,.13,0,C.metal);
  for(let r=0;r<levels;r++){
    m.face(e,e.length-.65,.13,base+(r+.48)*levelHeight,.26,.095,.28,C.frame);
    if(["S1","R1-A","R3-C","R2-B","R2-C","S4"].includes(id)){
      const n=Math.max(1,Math.floor(e.length/9));
      for(let k=r%2;k<n;k+=2){
        const t=(k+.55)*e.length/n;
        const y=base+levelHeight*(r+.22);
        m.face(e,t,.32,y,.97,.64,.52,0xc4c6b9);
        m.disk(e,t-.11,.605,y,.45,.065,0x7e8680);
        for(const dv of [-.13,-.043,.043,.13])m.face(e,t-.11,.646,y+dv,.37,.028,.027,C.silver);
        m.face(e,t,.3,y-.35,1.12,.095,.56,C.frame);
      }
    }
  }
  if(id==="S6"||id==="G4-A"||id==="R2-D"){
    const width=Math.min(e.length*.33,3.7),t=e.length*.57;
    const h=Math.min(levelHeight*.84,3.4);
    m.face(e,t,.08,base+h/2,width+.24,h+.14,.22,C.dark);
    m.face(e,t,.22,base+h/2,width,h,.095,id==="G4-A"?0x466d8c:0x939d9b);
    for(let v=.15;v<h;v+=.21)m.face(e,t,.29,base+v,width,.035,.045,C.metal);
  }
}

function outsideStair(m,e,base,level) {
  const length=Math.min(e.length*.68,level*1.65),count=Math.ceil(level/.21);
  const first=(e.length-length)/2;
  for(let n=0;n<count;n++)m.face(e,first+(n+.5)*length/count,.87,base+(n+1)*level/count,
    length/count+.025,.13,1.42,C.concrete);
  m.face(e,first+length+.58,.87,base+level,1.4,.18,1.42,C.concrete);
  for(const out of [.34,1.49]){
    const a=at(e,first,out),b=at(e,first+length,out);
    m.beam([a[0],base+.92,a[1]],[b[0],base+level+.92,b[1]],.062,C.silver);
    for(let n=0;n<=5;n++)m.face(e,first+length*n/5,out,base+level*n/5+.46,.055,.92,.055,C.metal);
  }
}

function roofPlant(m,ring,fr,base,height,levels,id) {
  const roof=base+height, usable=fr.depth>=7&&fr.width>=9;
  // Place equipment on a real roof face even for concave footprints.
  const topTriangle=THREE.ShapeUtils.triangulateShape(ring.map(([x,z])=>new THREE.Vector2(x,z)),[])
    .map(ids=>ids.map(i=>ring[i])).sort((a,b)=>size(b)-size(a))[0];
  function size([a,b,c]){return Math.abs((a[0]-b[0])*(c[1]-b[1])-(a[1]-b[1])*(c[0]-b[0]));}
  if(!topTriangle||!usable)return;
  const p=[0,1].map(i=>topTriangle.reduce((sum,v)=>sum+v[i],0)/3);
  if(levels>=4){
    const w=Math.min(7.7,fr.width*.21),d=Math.min(3.7,fr.depth*.22),h=Math.min(2.8,height*.075);
    m.box(p,roof+h*.5,w,h,d,fr.yaw,C.wall);
    m.box(p,roof+h+.07,w+.26,.16,d+.24,fr.yaw,C.silver);
  }
  for(let j=0;j<Math.min(3,Math.floor(fr.width/13));j++){
    const q=[p[0]+fr.ux*(j-1)*1.65+fr.uz*2.6,p[1]+fr.uz*(j-1)*1.65-fr.ux*2.6];
    m.box(q,roof+.47,1.33,.94,1.05,fr.yaw,0xa9b2ae);
    m.part("round",q,roof+.96,.75,.055,.75,0,C.dark);
  }
  if(id==="S6"||id==="S7"){
    const e=edges(ring).sort((a,b)=>b.length-a.length)[0];
    const p0=at(e,e.length*.21,-.85),h=id==="S7"?6.0:3.6;
    m.part(id==="S7"?"round":"box",p0,roof+h/2,id==="S7"?.55:1.25,h,id==="S7"?.55:1.25,e.yaw,C.concrete);
  }
  if(id==="G1"||id==="R3"){
    for(const e of edges(ring).filter(e=>e.length>10)){
      m.face(e,e.length/2,-.25,roof+1.63,e.length,.17,.18,C.metal);
      for(let j=.45;j<e.length;j+=4.3)m.face(e,j,-.25,roof+.84,.12,1.63,.14,C.silver);
    }
  }
}

function halfPlane(ring,signedDistance) {
  const out=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],da=signedDistance(a),db=signedDistance(b);
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)){
      const k=da/(da-db);out.push([a[0]+k*(b[0]-a[0]),a[1]+k*(b[1]-a[1])]);
    }
  }
  return out;
}

function makeG4(m,ring,fr,bottom,base,height,ground) {
  const passage=paths.find(p=>p.id==="osm-698427430"),a=passage.points[0],c=passage.points.at(-1);
  const len=Math.hypot(c[0]-a[0],c[1]-a[1]),dx=(c[0]-a[0])/len,dz=(c[1]-a[1])/len;
  const line=p=>(p[0]-a[0])*(-dz)+(p[1]-a[1])*dx;
  const half=passage.width*.5+.12,ceiling=Math.max(...passage.points.map(p=>ground(...p)))+3.70;
  const upper=base+height;
  for(const sign of [-1,1]){
    const part=halfPlane(ring,p=>line(p)*sign-half);
    m.solid(part,bottom,base+.08,C.base,C.pale);
    m.solid(part,base,ceiling,C.pale,C.wall);
    storeys(m,part,fr,"G4",base,ceiling-base,1,"ribbon",C.pale,5.4);
  }
  m.solid(ring,ceiling,upper,C.pale,C.roof);
  m.soffit(ring,ceiling,0xb8b7a9);
  storeys(m,ring,fr,"G4",ceiling,upper-ceiling,1,"ribbon",C.pale,5.4);
  for(const sign of [-1,1]){
    const p=[(a[0]+c[0])/2-dz*sign*1.22,(a[1]+c[1])/2+dx*sign*1.22];
    m.box(p,ceiling-.065,len*.65,.1,.12,-Math.atan2(dz,dx),0xf3eacc);
  }
}

function ordinary(m,id,b,ring,fr,base,height,levels){
  const [style,color,pitch]=finishes[id]||["utility",C.wall,4.4];
  const top=base+height;
  if(id==="R2"&&ring.length===4){
    // The northeast third of R2 steps down two floors beyond the stair core.
    const sign=fr.ux>0?1:-1;
    const u=(p)=>((p[0]-fr.cx)*fr.ux+(p[1]-fr.cz)*fr.uz)*sign-fr.width*.163;
    for(const low of [false,true]){
      const part=halfPlane(ring,p=>low?u(p):-u(p)),floors=low?levels-2:levels,h=height*floors/levels;
      m.solid(part,base,base+h,color,C.roof);
      storeys(m,part,fr,id,base,h,floors,style,color,pitch);
      if(!low)roofPlant(m,part,orientedFrame(part),base,h,floors,id);
    }
    entrance(m,ring,base,b.approach||ring[0],id,style);
    return;
  }
  m.solid(ring,base,top,color,C.roof,b.holes||[]);
  storeys(m,ring,fr,id,base,height,levels,style,color,pitch);
  const sides=edges(ring).sort((a,b)=>b.length-a.length);
  const approach=b.approach||ring[0];
  const distanceToApproach=e=>Math.hypot(...at(e,e.length*.5).map((v,i)=>v-approach[i]));
  const service=sides.slice(0,2).sort((a,b)=>distanceToApproach(b)-distanceToApproach(a))[0];
  if(service && (levels<5||id==="S1"))serviceElevation(m,service,base,height/levels,levels,id);
  if(["J1","B1","B2","G1","G2","G3","R1","R3"].includes(id)){
    const facade=sides[0],w=Math.min(3.8,facade.length*.15),t=w*.52;
    m.face(facade,t,.2,top-1.75,w,7.1,.72,color);
    stairTowerSign(m,facade,id,t,top-.27);
  }
  if(["R2-D","S4","S6"].includes(id))outsideStair(m,sides[0],base,height/levels);
  if(style==="shed"){
    const h=1.35, ridgeA=fr.point(-fr.width/2,0),ridgeB=fr.point(fr.width/2,0);
    for(const sign of [-1,1]){
      const a=fr.point(0,sign*fr.depth*.25);
      const pitch=Math.atan2(h,fr.depth/2), width=fr.width+.6, depth=Math.hypot(fr.depth/2,h)+.3;
      const rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(sign*pitch,fr.yaw,0,"YXZ"));
      m.part("box",a,top+h*.5,width,.17,depth,0,0x92a6aa,false,rot);
    }
    m.beam([ridgeA[0],top+h,ridgeA[1]],[ridgeB[0],top+h,ridgeB[1]],.15,C.metal);
  }else roofPlant(m,ring,fr,base,height,levels,id);
  entrance(m,ring,base,b.approach||b.footprint[0],id,style);
}

export function createYokohamaBuildings(buildings,groundHeight=()=>0) {
  const campus=new THREE.Group(),resources=geometryResources(),halls={};
  campus.name="Yokohama architecture";
  for(const b of buildings){
    let ring=b.footprint;
    if(!ring||ring.length<3)continue;
    if(ring.at(-1)[0]===ring[0][0]&&ring.at(-1)[1]===ring[0][1])ring=ring.slice(0,-1);
    const id=canon(b.id),fr=orientedFrame(ring);
    if(!fr)continue;
    const samples=[...ring.map(p=>groundHeight(...p)),groundHeight(fr.cx,fr.cz)].sort((a,b)=>a-b);
    let base=samples[Math.floor(samples.length/2)];
    if(b.approach && !["J2-J3","S3","H1","H2","G4"].includes(id)){
      const door=nearestEdge(ring,b.approach,3.1);
      if(door){
        const t=THREE.MathUtils.clamp(door.t,Math.min(1.92,door.edge.length*.48),Math.max(door.edge.length*.52,door.edge.length-1.92));
        base=groundHeight(...at(door.edge,t,.78))+.025;
      }
    }
    const bottom=Math.min(base,...samples)-1;
    const levels=Math.max(1,Math.round(b.levels||1)),height=Math.max(2.5,b.height||levels*3.5);
    const m=buildingGeometry(b.id,resources);
    if(id!=="G4"&&id!=="S3")m.solid(ring,bottom,base+.06,C.base,C.concrete,b.holes||[]);
    if(id==="G4")makeG4(m,ring,fr,bottom,base,height,groundHeight);
    else if(id==="J2-J3") makeTowers(m,ring,base);
    else if(id==="S3")makeLibrary(m,ring,fr,base,height,b.approach);
    else if(id==="H1"||id==="H2"){
      halls[id]={ring,fr,base,height};
      makeHall(m,id,ring,fr,base,height);
    }else ordinary(m,id,b,ring,fr,base,height,levels);
    campus.add(m.finish());
  }
  if(halls.H1&&halls.H2){
    const m=buildingGeometry("H1",resources);
    linkHalls(m,halls.H1,halls.H2);
    campus.add(m.finish());
  }
  return campus;
}
