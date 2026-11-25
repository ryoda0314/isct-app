// Individual plant positions and species proportions approximate the woodland, the
// preserved hillside, and the planted verges shown on Science Tokyo's campus plan.
// https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yokohama
// https://www.szc.titech.ac.jp/history.html (cherry trees and campus history).
import { boundsOf,inside } from './navigation.js';
import { groundAt } from './terrain.js';
import { projectPoint,rng,spatialIndex } from './landscapeGeometry.js';
import { inLibraryGarden } from './libraryGround.js';
import { inPondTerrace } from './pondTerrace.js';
import { towerPlantedArea } from './towerGround.js';

const foliage=[0x517947,0x577749,0x668552,0x69894d,0x729354,0x607f4d,0x648a56,0x779255];
const shrubs=[0x7b9255,0x667c50,0x81965c,0x647e4a,0x87985a];
const bark=[0x735f4e,0x61564a,0x6c6250,0x766753];
// Low grass and shrubs beyond the right-hand hedge after the Route 246 crossing
// (accessibility survey, suzukakegate-7). The opposite bank retains its conifers.
const gateMeadow=[[-224.2,-285.9],[-211.3,-279.2],[-197.6,-275],[-179.7,-271.9],[-166.8,-270.2],
  [-169.1,-253.2],[-182,-254.9],[-200.6,-258.1],[-216.9,-263.1],[-232.8,-271.1]];

export function plantLandscape({areas,buildings,paths,segments,landmarks,batch,solid,shadows,height=groundAt}) {
  const random=rng(40759), planted=spatialIndex(), avoids=spatialIndex(16);
  const pick=palette=>palette[Math.floor(random()*palette.length)];
  const bounds=boundsOf(buildings.flatMap(b=>b.footprint).concat(landmarks.map(p=>p.point)));
  const limit=(x,z)=>x>=bounds.left-37&&x<=bounds.right+37&&z>=bounds.top-37&&z<=bounds.bottom+37;
  for(const polygon of [
    ...buildings.map(b=>b.footprint),
    ...areas.filter(a=>['water','reservoir','pitch','tennis','plaza','sports','parking'].includes(a.kind)).map(a=>a.polygon)
  ]) {
    const b=boundsOf(polygon);avoids.add(polygon,b.left-4,b.top-4,b.right+4,b.bottom+4);
  }
  const buffers=landmarks.filter(l=>/門|記念碑/.test(l.name));
  function available(x,z,gap,roadGap) {
    if(inLibraryGarden(x,z)||towerPlantedArea(x,z)||inPondTerrace(x,z,1))return false;
    if(x>-201&&x< -189&&z>-290&&z< -281)return false;
    if(!limit(x,z))return false;
    if(buffers.some(l=>Math.hypot(x-l.point[0],z-l.point[1])<4))return false;
    for(const polygon of avoids.near(x,z)) {
      if(inside([x,z],polygon)||polygon.some((a,i)=>projectPoint(x,z,a,polygon[(i+1)%polygon.length]).d<gap))return false;
    }
    for(const s of paths.near(x,z)) {
      if(projectPoint(x,z,s.a,s.b).d<s.half+roadGap)return false;
    }
    return !planted.near(x,z).some(p=>Math.hypot(p.x-x,p.z-z)<p.r+gap*.5);
  }
  function mark(x,z,r) {
    planted.add({x,z,r},x-r-4,z-r-4,x+r+4,z+r+4);
  }
  function tree(x,z,street=false,heightMeters) {
    if(x>=-233&&x<=-166&&z>=-286&&z<=-253&&inside([x,z],gateMeadow))return;
    const h=heightMeters??(street?6.1+random()*3.5:6.8+random()*7.5);
    const narrow=heightMeters==null&&!street&&random()<.17, spread=h*(narrow?.195:.32);
    if(!available(x,z,street?1.6:2.1,street?.9:1.5))return;
    const y=height(x,z), trunkColor=pick(bark), color=pick(foliage), angle=random()*Math.PI*2;
    const radius=heightMeters!=null?.105+h*.005:narrow?.17+h*.008:.17+h*.011, fork=y+h*(narrow?.63:.44);
    const lean=.40+random()*.38,fx=x+Math.cos(angle)*lean,fz=z+Math.sin(angle)*lean;
    const detailed=Math.hypot(x+18,z+143)<57||Math.hypot(x+191,z+282)<47||Math.hypot(x+261,z+314)<29;
    batch.beam([x,y-.14,z],[fx,fork+.1,fz],radius*2.1,radius*2.1,trunkColor,'trunk');
    const n=narrow?4:5;
    for(let i=0;i<n;i++) {
      const theta=angle+i*2*Math.PI/n+random()*.34, dx=Math.cos(theta), dz=Math.sin(theta);
      const run=spread*(.54+random()*.19), crownY=y+h*(.64+random()*.15);
      const u=x+dx*run, v=z+dz*run;
      const elbow=[fx+dx*run*.55,fork+(crownY-fork)*.40,fz+dz*run*.55];
      batch.beam([fx,fork-random()*.8,fz],elbow,radius*1.24,radius*1.24,trunkColor,'trunk');
      batch.beam(elbow,[u,crownY,v],radius*.76,radius*.76,trunkColor,'trunk');
      const rx=spread*(.52+random()*.22),ry=h*(narrow?.25:.16),rz=spread*(.45+random()*.22);
      batch.put('leaf',color,u,crownY,v,rx,ry,rz,theta,dx*.24,dz*.24);
      if(detailed) {
        for(let k=0;k<5;k++){
          const phi=theta+k*1.27,ox=Math.cos(phi),oz=Math.sin(phi),ext=.64+random()*.24;
          const end=[u+ox*rx*ext,crownY+ry*(random()*.88-.52),v+oz*rz*ext];
          batch.beam(elbow,end,radius*.31,radius*.31,trunkColor,'trunk');
          const size=.54+spread*.15;
          batch.put('shoot',k%3===0?pick(foliage):color,...end,size, size*.93,size,phi,random()*.47-.19);
        }
      }
    }
    batch.put('leaf',color,x+.18,y+h*.85,z,spread*.72,h*.16,spread*.65,angle);
    batch.put('canopyFar',color,x+.18,y+h*.73,z,spread*1.25,h*.25,spread*1.17,angle);
    batch.beam([x,y-.1,z],[fx,y+h*.61,fz],radius*2.15,radius*2.15,trunkColor,'stemFar');
    mark(x,z,spread*.73);solid(x,z,radius);shadows.add(x+.45,z+.3,spread*1.48,.29);
  }
  function shrub(x,z,size) {
    if(!available(x,z,.5,.32))return;
    const h=size*(.55+random()*.45),y=height(x,z),angle=random()*6.28,col=pick(shrubs);
    batch.put('leaf',col,x,y+h*.49,z,size,h*.66,size*.78,angle);
    batch.put('leaf',col,x+size*.44,y+h*.42,z+size*.21,size*.62,h*.60,size*.63,angle+1);
    batch.put('canopyFar',col,x,y+h*.49,z,size*1.08,h*.68,size*.81,angle);
    if(Math.hypot(x+18,z+143)<57||Math.hypot(x+191,z+282)<47) {
      for(let i=0;i<3;i++) {
        const a=i*2.1+angle;
        batch.put('shoot',pick(shrubs),x+Math.cos(a)*size*.65,y+h*.7,z+Math.sin(a)*size*.55,size*.65,size*.7,size*.65,a);
      }
    }
    shadows.add(x,z,size*1.36,.27);
    mark(x,z,size*.65);
  }
  for(const a of areas) {
    if(!['wood','scrub','lawn'].includes(a.kind))continue;
    const b=boundsOf(a.polygon);
    const step=a.kind==='scrub'?3.45:a.kind==='wood'?6.7:12;
    const xMin=Math.max(b.left,bounds.left-36),xMax=Math.min(b.right,bounds.right+36);
    const zMin=Math.max(b.top,bounds.top-36),zMax=Math.min(b.bottom,bounds.bottom+36);
    for(let v=zMin;v<zMax;v+=step)for(let u=xMin;u<xMax;u+=step) {
      const x=u+.92*step*random(),z=v+.92*step*random();
      if(!inside([x,z],a.polygon))continue;
      if(a.kind==='scrub'||a.kind==='wood'&&random()<.27)shrub(x,z,1+random()*1.1);
      else if(a.kind==='wood'||random()<.16)tree(x,z);
    }
  }
  // Canopy and clipped hedges alongside the major approaches, preserving the intersections.
  for(const s of segments) {
    if(s.path.walkable===false||s.path.bridge||['stairs','tunnel'].includes(s.path.kind)||s.path.tunnel||s.path.width<2.7)continue;
    for(let d=6+random()*7;d<s.len-4;d+=10.5+random()*4.2) {
      const f=d/s.len, side=random()>.48?1:-1, t=(s.half+2.35)*side;
      const x=s.a[0]+(s.b[0]-s.a[0])*f+s.nx*t, z=s.a[1]+(s.b[1]-s.a[1])*f+s.nz*t;
      if(random()>.16)tree(x,z,true);
      if(random()>.35)continue;
      for(let j=-3;j<=3;j++){
        const u=x+j*1.28*(-s.nz),v=z+j*1.28*s.nx;
        shrub(u,v,.69+random()*.21);
      }
    }
  }
  // The event photograph in FIRST NEWS 02 shows open trunks on the bank to
  // the right of the timber rows. Keep their bases clear of the deck and path.
  for(const [x,z,h] of [[11.6,-138.8,6.3],[15.4,-143.5,7.1],[21.5,-146.4,7.6]])tree(x,z,false,h);
}
