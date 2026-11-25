import * as THREE from "three";
import { at, edges, nearestEdge, geometryResources, buildingGeometry } from "../yokohama/buildingsGeometry.js";
import { approaches } from "./groundsPaths.js";
import { buildingFrame, curtain, entrance, equipment, finish, grille, parapet, punchedWindows, wallFacing } from "./facadeKit.js";
import { compactHospital, mdTower, wards } from "./clinicalBuildings.js";
import { towerStoneMaterial } from "./towerElevations.js";

// Small breaks in a survey line divide a single continuous architectural
// elevation into several cadastral segments. Keep genuine wings and setbacks.
function continuousWalls(footprint) {
  const ring=footprint.slice();
  if(ring.length>3 && ring[0][0]===ring.at(-1)[0] && ring[0][1]===ring.at(-1)[1])ring.pop();
  let changed=true;
  while(changed && ring.length>3) {
    changed=false;
    for(let i=0;i<ring.length;i++){
      const a=ring[(i+ring.length-1)%ring.length], b=ring[i], c=ring[(i+1)%ring.length];
      const u=b[0]-a[0], v=b[1]-a[1], dx=c[0]-a[0], dz=c[1]-a[1];
      const span=Math.hypot(dx,dz), off=span ? Math.abs(u*dz-v*dx)/span : Infinity;
      if(Math.hypot(u,v)<.21 || (off<.42 && u*(c[0]-b[0])+v*(c[1]-b[1])>=0)){
        ring.splice(i,1);changed=true;break;
      }
    }
  }
  return ring;
}

const profiles={
  b1w:{color:0xc7b6a4,style:"administration",pitch:4.75},
  b1e:{color:0xb09a87,style:"school",pitch:4.1},
  b2:{color:0xb18776,style:"formerMain",pitch:4.15},
  b3:{color:0xb08c7e,style:"researchTower",pitch:3.05},
  b5:{color:0x9e7966,style:"serviceCore",pitch:3.40},
  b6:{color:0xb9a89b,style:"school",pitch:3.95},
  b7:{color:0xa17b64,style:"dentalSchool",pitch:3.30},
  b8n:{color:0xa48e7e,style:"researchWing",pitch:3.7},
  b8s:{color:0xab9187,style:"researchWing",pitch:4.50},
  b10:{color:0xa98e76,style:"teaching",pitch:5.2},
  "dental-n":{color:0x946f58,style:"dentalTower",pitch:3.18},
  "dental-s":{color:0xa88567,style:"outpatient",pitch:3.40},
};

function brickWallMaterial(shell) {
  const brick=shell.clone();
  brick.name="2号館の外装タイル";
  brick.onBeforeCompile=shader=>{
    shader.vertexShader="varying vec2 tilePos; varying float wallWeight;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`
      #include <begin_vertex>
      vec2 along = vec2(normal.z,-normal.x);
      tilePos = vec2(dot(position.xz,along),position.y);
      wallWeight = 1.0 - smoothstep(0.1,0.4,abs(normal.y));
    `);
    shader.fragmentShader="varying vec2 tilePos; varying float wallWeight;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      vec2 tile = tilePos / vec2(0.23,0.077);
      vec2 px = max(fwidth(tile),vec2(0.001));
      tile.x += mod(floor(tile.y),2.0)*0.5;
      vec2 edge = 0.5 - abs(fract(tile)-0.5);
      vec2 inside = smoothstep(vec2(0.018,0.04)-px*.45,vec2(0.018,0.04)+px*.45,edge);
      float variation = fract(sin(dot(floor(tile),vec2(83.17,15.23)))*3549.19)-0.5;
      float visible = wallWeight*(1.0-smoothstep(0.25,1.3,max(px.x,px.y)));
      diffuseColor.rgb *= 1.0+visible*(variation*.11+(1.0-inside.x*inside.y)*.17);
    `);
  };
  return brick;
}

function formerMainWindows(m,e,base,roof,levels,skip) {
  const count=Math.max(1,Math.round((e.length-1.5)/4.15)), bay=(e.length-1.5)/count;
  const step=(roof-base)/levels, h=step*.51, w=bay*.54;
  for(let i=0;i<levels;i++)for(let j=0;j<count;j++){
    const t=.75+(j+.5)*bay, y=base+step*(i+.62);
    if(skip(i,j,t))continue;
    m.face(e,t,.04,y,w+.15,h+.15,.12,0x635951);
    for(const side of [-1,1]){
      const c=[0x536f65,0x72847d,0x414f4e,0x92a295][(i+j+(side+1)/2)%4];
      m.face(e,t+side*w*.245,.14,y-h*.10,w*.465,h*.75,.08,c,(i+j+side)%3===0);
      m.face(e,t+side*w*.245,.14,y+h*.38,w*.465,h*.18,.08,0xc4c8bd);
    }
    m.face(e,t,.22,y,.054,h,.09,0x716d60);
    m.face(e,t,.22,y+h*.276,w,.066,.09,0x736e62);
    m.face(e,t,.15,y-h*.52,w+.10,.072,.21,0xa58d80);
    if(i===1&&(j%3===1||j%4===0)){
      for(const side of [-1,1]) {
        m.face(e,t+side*w*.24,.18,y+h*.38,w*.39,h*.18,.14,0xc2beb0);
        m.disk(e,t+side*w*.24,.266,y+h*.38,h*.12,.035,0x8e9189);
      }
    }
  }
}

function formerMainEntry(m,e,t,base) {
  const dir=Math.sign(e.dx*e.nz-e.dz*e.nx);
  const loc=(u,out,y)=>{const [x,z]=at(e,t+dir*u,out);return [x,base+y,z];};
  const face=(u,out,y,w,h,d,color,glass=false)=>m.face(e,t+dir*u,out,base+y,w,h,d,color,glass);
  const brick=0xad7f66, coping=0xd4c2ac, width=3.7, steps=10, going=.34, rise=.172;
  const landing=steps*rise, run=steps*going+.68;
  face(0,.34,landing/2,width,landing,.70,0x9f978a);
  for(let i=0;i<steps;i++){
    const h=(steps-i)*rise, d=.68+(i+.5)*going;
    face(0,d,h/2,width,h,going+.018,0xa59f91);
    face(0,d+going*.45,h-.018,width,.036,.064,0xc8c3ae);
  }
  function cheek(center,w,high,low){
    const l=center-w/2,r=center+w/2;
    const a=loc(l,.02,high),b=loc(l,run,low),c=loc(r,run,low),d=loc(r,.02,high);
    const al=loc(l,.02,0), bl=loc(l,run,0), cl=loc(r,run,0), dl=loc(r,.02,0);
    const quad=(a,b,c,d,color)=>{m.triangle(a,b,c,color);m.triangle(a,c,d,color);};
    quad(a,b,c,d,coping);quad(b,a,al,bl,brick);quad(c,b,bl,cl,brick);
    quad(d,c,cl,dl,brick);quad(a,d,dl,al,brick);
  }
  cheek(-width/2-.19,.38,landing+1.07,.61);
  cheek(width/2+.14,.28,landing+.41,.28);
  // The right cheek encloses three stepped planting beds in the university view.
  const bedWidth=1.47,bedCenter=width/2+.28+bedWidth/2;
  for(let k=0;k<3;k++){
    const depth=run/3, h=landing*(1-k/3)+.12, d=(k+.5)*depth;
    face(bedCenter,d,h/2,bedWidth,h,depth,brick);
    face(bedCenter,d,h+.036,bedWidth-.18,.07,depth-.13,0x554d3b);
    for(let j=0;j<4;j++)
      m.part("shrub",at(e,t+dir*(bedCenter+(j-1.5)*.31),d+Math.sin(j*2)*.19),base+h+.18,.71,.43,.61,j*1.06,[0x6e804b,0x677c4a][j%2]);
  }
  cheek(width/2+.28+bedWidth,.24,landing+.62,.46);
  const canopy=landing+3.07, postOffset=width/2+.28;
  face(.42,1.26,canopy+.11,7.02,.26,2.94,0xebdfc9);
  face(.42,1.26,canopy+.31,7.04,.16,2.96,brick);
  for(const s of [-1,1]){
    face(s*postOffset,.39,(canopy+landing)/2,.38,canopy-landing,.61,brick);
    m.beam(loc(s*postOffset,.40,canopy-.76),loc(s*postOffset,1.78,canopy),.26,brick,.24);
  }
  face(-.21,.055,landing+1.4,3.6,2.82,.11,0x524e41);
  for(let j=0;j<3;j++){
    const u=-.21+(j-1)*1.12;
    face(u,.17,landing+1.25,1.03,2.4,.09,[0x484c42,0x454437,0x54574a][j]);
    face(u,.15,landing+2.66,1.03,.31,.09,0x647067);
    if(j<2)face(u+(j===0?.45:-.45),.25,landing+1.15,.040,.42,.073,0xa7a79a);
  }
  // Surface conduits step down beside the stair. The painted rail stays clear
  // of the foot of the steps and follows the low wall to the left.
  for(let j=0;j<2;j++){
    const offset=j*.15, h=2.12+offset, u=-width/2-.68-offset;
    m.beam(loc(u-5.3,.23,h),loc(u,.23,h),.085,0xdadbd2);
    m.beam(loc(u,.23,h),loc(u,.23,.37+offset),.085,0xdadbd2);
    m.beam(loc(u,.23,.37+offset),loc(u,1.52,.37+offset),.085,0xdadbd2);
  }
  const left=-width/2-.45;
  for(let j=0;j<4;j++)face(left-j*1.26,run, .44,.058,.88,.061,0xd8d7c5);
  for(const y of [.29,.54,.79])face(left-1.89,run,y,3.84,.048,.058,0xd8d7c5);
}

function archedPortal(m,e,t,base) {
  const w=Math.min(5.6,e.length*.28), h=6.6;
  m.face(e,t,.43,base+h*.51,w,h,.47,0x4f4a43);
  entrance(m,e,t,base,w*.76,{h:3.15,canopy:0});
  for(const side of [-1,1])
    m.face(e,t+side*w*.56,.68,base+h*.43,w*.13,h*.86,1.42,finish.brick);
  for(let j=0;j<20;j++){
    const a=Math.PI*j/20, b=Math.PI*(j+1)/20;
    const segment=(ang,r)=>{const p=at(e,t+Math.cos(ang)*w*r,1.38);return [p[0],base+h*.84+Math.sin(ang)*h*.14*(r/.5),p[1]];};
    const lo=segment(a,.49),hi=segment(a,.63),bl=segment(b,.49),bh=segment(b,.63);
    m.triangle(lo,hi,bh,finish.brick);m.triangle(lo,bh,bl,finish.brick);
    m.triangle(bh,hi,lo,finish.brick);m.triangle(bl,bh,lo,finish.brick);
  }
}

function teachingReliefs(m,e,y) {
  const width=Math.min(6.8,e.length*.265), h=3.0;
  const direction=Math.sign(e.dx*e.nz-e.dz*e.nx);
  const facePoint=(t,dy,out)=>{const p=at(e,t,out);return [p[0],y+dy,p[1]];};
  for(let panel=0;panel<3;panel++){
    const center=e.length/2+(panel-1)*width*direction;
    const t=f=>center+f*width*direction, stone=0xd6c6a8;
    m.face(e,center,.81,y,width-.06,h,.50,0x9d8973);
    m.face(e,center,1.09,y,width-.28,h-.27,.115,0xbba78b);
    const stroke=(a,b,r=.08)=>m.beam(facePoint(t(a[0]),a[1],1.22),facePoint(t(b[0]),b[1],1.22),r,stone);
    const person=(x,dy,scale)=>{
      m.disk(e,t(x),1.23,y+dy+.51*scale,.28*scale,.15,stone);
      const upper=facePoint(t(x),dy+.32*scale,1.23), lower=facePoint(t(x-.009),dy-.34*scale,1.22);
      m.beam(upper,lower,.21*scale,stone,.11);
      for(const s of [-1,1])stroke([x,dy-.22*scale],[x+s*.032*scale,dy-.64*scale],.10*scale);
      stroke([x,dy+.17*scale],[x+.043*scale,dy+.04*scale],.09*scale);
    };
    if(panel===0) {
      // A portrait at the left of the inscribed oath.
      m.disk(e,t(-.23),1.27,y+.48,.78,.19,stone);
      stroke([-.28,.12],[-.35,-.82],.32);stroke([-.19,.10],[-.10,-.8],.35);
      for(let k=0;k<9;k++)m.face(e,t(.17),1.23,y+.79-k*.19,width*.42*(k===8?.72:1),.034,.10,stone);
    }else if(panel===1) {
      for(let j=0;j<18;j++){
        const a=Math.PI*j/18,b=Math.PI*(j+1)/18;
        stroke([Math.cos(a)*.37,Math.sin(a)*1.20],[Math.cos(b)*.37,Math.sin(b)*1.20],.10);
      }
      for(const [x,dy,s] of [[-.33,-.1,.60],[-.22,-.26,.77],[-.1,.03,1],[.04,.06,1.05],[.16,-.40,.59],[.26,-.14,.77],[.36,-.25,.68]])person(x,dy,s);
    }else{
      stroke([-.36,-.37],[.26,-.37],.19);stroke([-.23,-.40],[-.29,-.87]);stroke([.20,-.40],[.27,-.87]);
      for(const [x,dy,s] of [[-.32,-.03,.89],[-.19,.29,.73],[-.04,.40,.73],[.12,.33,.68],[.29,.07,.95]])person(x,dy,s);
      m.disk(e,t(-.09),1.31,y-.20,.27,.15,stone);stroke([-.06,-.23],[.19,-.28],.20);
    }
  }
}

function profileBody(m,b,ring,fr,base,height,profile,groundAt) {
  const {color,style,pitch}=profile, top=base+height;
  const levels=b.levels,roof=top-(style==="researchTower"?4.8:style==="dentalTower"?4.7:style==="formerMain"?3.1:1.0);
  const street=approaches[b.id]??fr.point(0,fr.d*.7);
  const doorway=nearestEdge(ring,street,3);
  const doorBase=doorway?groundAt(...at(doorway.edge,doorway.t,style==="formerMain"?4.1:.94))+.08:base;
  const upper=b.upperFootprint?continuousWalls(b.upperFootprint):ring;
  const podium=style==="dentalTower"?base+9:base;
  if(podium>base)m.solid(ring,base,podium,color,finish.roof);
  m.solid(upper,podium,roof,color,finish.roof);
  const front=wallFacing(upper,-fr.dz,fr.dx), streetSide=wallFacing(upper,fr.dx,fr.dz);
  const roomSide=(e,s)=>e.nx*s.nx+e.nz*s.nz>.87;
  for(const [index,e] of edges(upper).entries()){
    if(e.length<2)continue;
    const long=e.length>Math.max(fr.w,fr.d)*.42;
    const gable=e.length<Math.max(fr.w,fr.d)*.44;
    const doorOnWall=doorway&&roomSide(e,doorway.edge);
    const skip=(i,j,t)=>doorOnWall&&Math.abs(t-doorway.t)<(style==="formerMain"?4.7:2.9)&&i<(style==="dentalSchool"?2:1);
    if(style==="researchTower" && roomSide(e,front)){
      const slots=e.length>12?[.36,.59]:[.49];
      for(const f of slots) {
        const w=Math.min(2.15,e.length*.13);
        m.face(e,e.length*f,.10,(roof+base)/2,w,roof-base,.22,0x645c56);
        for(let j=0;j<levels;j++)m.face(e,e.length*f,.29,base+(j+.54)*(roof-base)/levels,w-.18,(roof-base)/levels*.85,.15,finish.aqua,true);
        for(const v of [-1,1])m.face(e,e.length*f+v*w*.57,.32,(roof+base)/2,.27,roof-base,.65,color);
      }
    }else if(style==="dentalTower" && roomSide(e,front)){
      const n=Math.max(1,Math.round(e.length/4.35)), dy=(roof-podium)/(levels-2);
      for(let j=0;j<n;j++){
        const t=(j+.5)*e.length/n, w=e.length/n*.52;
        m.face(e,t,.04,(roof+podium)/2,w,roof-podium,.13,0x454845);
        for(let k=0;k<levels-2;k++)m.face(e,t,.16,podium+(k+.5)*dy,w*.88,dy*.73,.13,0x57707b,true);
        for(let k=0;k<4;k++)m.face(e,t+w*(k/3-.5),.55,(roof+podium)/2,.065,roof-podium,.28,0x4f534d);
        for(let k=0;k<3;k++)m.face(e,t,.66,podium+(k+.6)*(roof-podium)/3,w,.25,1.02,0x605950);
      }
    }else if(style==="teaching"&&long){
      // The teaching block has four broad bays, a curved upper fascia and
      // blue ribbon windows recessed between solid masonry blades.
      const bays=Math.max(3,Math.round(e.length/7.1)), step=(roof-base)/levels;
      const w=e.length/bays;
      for(let j=0;j<bays;j++){
        const t=(j+.5)*w, bow=.50*Math.sin(Math.PI*t/e.length);
        for(let k=0;k<levels;k++){
          const y=base+k*step;
          m.face(e,t,bow+.11,y+step*.60,w-.42,step*.66,.22,0x497f96,true);
          m.face(e,t,bow+.39,y+step*.20,w,.9,.91,color);
          for(const f of [-.24,0,.24])m.face(e,t+w*f,bow+.3,y+step*.60,.065,step*.66,.11,finish.frame);
        }
        m.face(e,t-w*.48,bow+.41,(roof+base)/2,.47,roof-base,.85,color);
        m.face(e,t,bow+.44,roof+.40,w+.03,.87+bow,.87,color);
      }
    }else if(style==="formerMain"){
      formerMainWindows(m,e,podium,roof,3,skip);
    }else{
      const narrow=(style==="serviceCore"&&gable)||(style==="administration"&&gable);
      const bay={pitch:narrow?pitch*1.18:pitch, color, start:index*3, skip,
        fraction:narrow?.32:style==="researchWing"?.86:.68,
        open:style==="outpatient"?.56:.49,
        deep:["dentalSchool","outpatient","researchTower"].includes(style),
        posts:(style==="dentalSchool"&&long)||(style==="researchTower"&&long)||(style==="outpatient"&&roomSide(e,front)),
        relief:style==="dentalSchool"?.53:.24,
      };
      punchedWindows(m,e,podium,roof,levels-(style==="dentalTower"?2:0),bay);
      if(style==="researchWing"&&long)for(let k=1;k<levels;k++)
        m.face(e,e.length/2,.30,base+(roof-base)*k/levels,e.length,.26,.7,color);
      if(style==="dentalTower"&&roomSide(e,streetSide)){
        m.face(e,e.length*.28,.23,(roof+podium)/2,2.25,roof-podium,.49,0x645c55);
        curtain(m,{...e,a:at(e,e.length*.28-1),length:2},podium,roof,levels-2,{pitch:1.05});
      }
    }
  }
  if(podium>base)for(const e of edges(ring))punchedWindows(m,e,base,podium,2,{pitch:4.1,color,fraction:.71});
  if(style==="teaching")teachingReliefs(m,front,roof-1.05);
  parapet(m,upper,roof,color,.64);
  const upperFrame=buildingFrame(upper);
  const cx=upperFrame.w*(style==="researchTower"?.18:0), cz=upperFrame.d*(style==="dentalTower"?-.18:0);
  const peak=style==="formerMain"?top:roof+(style==="researchTower"||style==="dentalTower"?3.53:1.08);
  const unitWidth=Math.min(upperFrame.w*.39,11.3),unitDepth=Math.min(upperFrame.d*.42,7.7);
  m.box(upperFrame.point(cx,cz),(roof+peak)/2,unitWidth,peak-roof,unitDepth,upperFrame.yaw,color);
  if(style==="dentalTower"||style==="researchTower"){
    const n=Math.ceil(unitWidth/.72);
    for(const sign of [-1,1]) {
      for(let i=0;i<=n;i++)m.box(upperFrame.point(cx+(i/n-.5)*unitWidth,cz+sign*unitDepth*.47),peak+.53,.08,1.2,.07,upperFrame.yaw,darkLouver);
      for(let i=0;i<5;i++)m.box(upperFrame.point(cx,cz+sign*unitDepth*.48),peak+.18+i*.21,unitWidth,.098,.23,upperFrame.yaw,darkLouver);
    }
  }
  for(const f of [-.26,.24]){
    equipment(m,upperFrame,upperFrame.w*f,upperFrame.d*.23,Math.min(4.3,upperFrame.w*.17),Math.min(2.2,upperFrame.d*.16),roof,.85);
  }
  if(doorway) {
    const {edge:e,t}=doorway;
    if(style==="dentalSchool")archedPortal(m,e,t,doorBase);
    else if(style==="formerMain")formerMainEntry(m,e,t,doorBase);
    else entrance(m,e,t,doorBase,4.15,{canopy:style==="serviceCore"?.9:2.35,posts:style==="researchTower"});
  }
}
const darkLouver=0x62675e;

// The hospital section explicitly shows indoor crossings at floors 3–6.
// Below them the service road between A and C remains open.
function hospitalLinks(m,base) {
  const pairs=[
    [[-32.7,37.1],[-35.9,44.5]], [[-5.5,49.6],[-8.8,57.7]],
  ];
  for(const [p,q] of pairs){
    const dx=q[0]-p[0], dz=q[1]-p[1], length=Math.hypot(dx,dz);
    const yaw=-Math.atan2(dz,dx), normal=[-dz/length,dx/length], center=[(p[0]+q[0])/2,(p[1]+q[1])/2];
    const floor=base+12.2,step=4.35,w=3.8;
    for(let i=0;i<4;i++){
      const y=floor+i*step;
      m.box(center,y,length+.52,.36,w+.30,yaw,0xc1bdb1);
      for(const sign of [-1,1]){
        const side=[center[0]+normal[0]*sign*w/2,center[1]+normal[1]*sign*w/2];
        m.box(side,y+step*.46,length+.30,step*.91,.14,yaw,0x637b80,true);
        m.box(side,y+.60,length+.31,1.1,.23,yaw,finish.sand);
        for(let j=0;j<=3;j++)m.box([side[0]+dx*(j/3-.5),side[1]+dz*(j/3-.5)],y+step/2,.095,step,.23,yaw,finish.metal);
      }
    }
    m.box(center,floor+4*step,length+.56,.31,w+.38,yaw,finish.metal);
  }
}

// The aggregate is visible up close on the warm exterior panels. Fade each
// grain size independently as its footprint falls below one screen pixel.
function wardPanelMaterial(source){
  const material=source.clone();
  material.name="病棟の外装パネル";
  material.onBeforeCompile=shader=>{
    shader.vertexShader="varying vec2 wardUV; varying float wardPanel;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`
      #include <begin_vertex>
      wardUV=vec2(dot(position.xz,vec2(normal.z,-normal.x)),position.y);
      wardPanel=(1.-step(.12,abs(normal.y)))*step(.46,color.r)*step(color.g*1.32,color.r)*step(color.b*1.12,color.g);`);
    shader.fragmentShader=`
      varying vec2 wardUV; varying float wardPanel;
      float wardHash(vec2 p){
        vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
        h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);
      }
      float aggregate(vec2 p){
        vec2 id=floor(p),t=fract(p),px=fwidth(p);
        t=t*t*(3.-2.*t);
        float v=mix(mix(wardHash(id),wardHash(id+vec2(1.,0.)),t.x),
                    mix(wardHash(id+vec2(0.,1.)),wardHash(id+1.),t.x),t.y);
        return (v-.5)*(1.-smoothstep(.4,1.6,max(px.x,px.y)));
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      diffuseColor.rgb*=1.+wardPanel*(.047*aggregate(wardUV*11.)+.035*aggregate(wardUV*37.));`);
  };
  return material;
}

export function createYushimaBuildings(buildings,groundAt=()=>0) {
  const group=new THREE.Group(), resources=geometryResources();
  const brickResources={...resources,shell:brickWallMaterial(resources.shell),shrub:new THREE.IcosahedronGeometry(.5,1)};
  const towerGlass=resources.glass.clone();
  towerGlass.onBeforeCompile=resources.glass.onBeforeCompile;
  towerGlass.name="M&D façade glazing";
  const foyerGlass=resources.clear.clone();
  foyerGlass.name="M&D foyer glass";
  foyerGlass.opacity=.48;
  const towerMaterials={...resources,shell:towerStoneMaterial(resources.shell),glass:towerGlass,clear:foyerGlass};
  const wardGlass=resources.glass.clone(),wardClear=resources.clear.clone();
  wardClear.opacity=.26;
  wardGlass.name="Hospital window glass";wardClear.name="Hospital clear glazing";
  const wardMaterials={...resources,shell:wardPanelMaterial(resources.shell),glass:wardGlass,clear:wardClear};
  group.name="湯島キャンパス 建築";
  for(const b of buildings){
    if(!b.footprint?.length)continue;
    const ring=continuousWalls(b.footprint),fr=buildingFrame(ring);
    const sample=[...ring,fr.point(0,0)].map(p=>groundAt(...p)).sort((a,b)=>a-b);
    const base=sample[Math.floor(sample.length/2)]+.06;
    const ward=b.id==="med-a"||b.id==="med-b";
    const m=buildingGeometry(b.id,b.id==="md"?towerMaterials:ward?wardMaterials:b.id==="b2"?brickResources:resources);
    m.solid(ring,sample[0]-.6,base+.02,0x8c887e,finish.roof);
    if(b.id==="md")mdTower(m,b,ring,fr,base,b.height,groundAt(-37.4,38.5)+4.3);
    else if(b.id==="med-c")compactHospital(m,b,ring,fr,base,b.height);
    else if(ward){
      wards(m,b,ring,fr,base);
      if(b.id==="med-a")hospitalLinks(m,base);
    } else profileBody(m,b,ring,fr,base,b.height,profiles[b.id]??profiles.b6,groundAt);
    const building=m.finish();
    building.userData.facility=b.name;
    group.add(building);
  }
  return group;
}

// Static probes capture the modelled buildings and sky at the glazing itself.
// The hospital's clear outer panes leave the curtains behind them visible.
function captureGlass(renderer,scene,building,position,size,finishes){
  const panes=finishes.flatMap(([name,tint,blend])=>{
    const material=building?.children.find(o=>o.material?.name===name)?.material;
    return material?[{material,tint,blend,previous:material.onBeforeCompile}]:[];
  });
  if(!panes.length)return;
  const target=new THREE.WebGLCubeRenderTarget(size,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const camera=new THREE.CubeCamera(.5,5000,target);
  camera.position.set(...position);
  const visible=building.visible, shadowUpdate=renderer.shadowMap.needsUpdate;
  building.visible=false;
  renderer.shadowMap.needsUpdate=false;
  try {
    camera.update(renderer,scene);
  }catch(error){
    target.dispose();
    throw error;
  }finally{
    building.visible=visible;
    renderer.shadowMap.needsUpdate=shadowUpdate;
  }
  for(const {material,tint,blend} of panes){
    material.onBeforeCompile=shader=>{
      shader.uniforms.campusReflection={value:target.texture};
      shader.uniforms.campusCoating={value:new THREE.Vector3(...tint)};
      shader.uniforms.campusBlend={value:new THREE.Vector2(...blend)};
      shader.fragmentShader="uniform samplerCube campusReflection;\nuniform vec3 campusCoating;\nuniform vec2 campusBlend;\n"+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",`
        vec3 reflected = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
        vec3 surroundings = textureCube(campusReflection, reflected, 0.35).rgb;
        float glancing = 1.0 - max(0.0, dot(normal, normalize(vViewPosition)));
        outgoingLight = mix(outgoingLight, surroundings * campusCoating, campusBlend.x + campusBlend.y * glancing);
        #include <opaque_fragment>`);
    };
    material.needsUpdate=true;
  }
  return ()=>{
    for(const {material,previous} of panes){
      material.onBeforeCompile=previous;
      material.needsUpdate=true;
    }
    target.dispose();
  };
}

export function prepareYushimaReflections(renderer,scene){
  const disposers=[];
  try{
    disposers.push(captureGlass(renderer,scene,scene.getObjectByName("md"),[-105,14,15],128,[
      ["M&D façade glazing",[.63,.84,.98],[.50,.29]],
      ["M&D foyer glass",[.70,.94,.91],[.72,.20]],
    ]));
    disposers.push(captureGlass(renderer,scene,scene.getObjectByName("med-a"),[-17,62,37],64,[
      ["Hospital window glass",[.80,.91,.96],[.19,.34]],
      ["Hospital clear glazing",[.87,.94,.98],[.30,.27]],
    ]));
  }catch(error){
    for(const dispose of disposers)dispose?.();
    throw error;
  }
  return ()=>{for(const dispose of disposers)dispose?.();};
}
