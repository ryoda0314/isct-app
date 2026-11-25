import { projectPoint, spatialIndex } from './landscapeGeometry.js';
import { inside } from './navigation.js';

// These stretches have their own surveyed paving, crossings or entrance decks.
const dedicated=new Set(['osm-210335023','osm-1086612621','station-forecourt','osm-1086612605']);
export const hasRoadMesh=path=>!path.siteModel&&!dedicated.has(path.id);

const mix=(a,b,f)=>a+(b-a)*f;
const lerp=(a,b,f)=>[mix(a[0],b[0],f),mix(a[1],b[1],f)];
const across=(arm,side,width)=>[arm.point[0]-arm.dz*side*width,arm.point[1]+arm.dx*side*width];

// Offset the two edges bordering each sector of the junction. Both roads then
// reference that very same corner (including the outside of the kerb).
function corner(a,b,extra) {
  const ha=a.seg.half+extra,hb=b.seg.half+extra;
  const cross=a.dx*b.dz-a.dz*b.dx,dot=a.dx*b.dx+a.dz*b.dz;
  if(Math.abs(cross)<.0001){
    return lerp(across(a,1,ha),across(b,-1,hb),.5);
  }
  // If unequal roads continue almost straight, carry their mean width across
  // the seam. Intersecting nearly parallel lines otherwise produces long spikes.
  const parallel=Math.min(1,Math.max(0,(-dot-.80)/.19));
  const mean=(ha+hb)*.5,left=mix(ha,mean,parallel),right=mix(hb,mean,parallel);
  const run=(right+left*dot)/cross;
  const x=-a.dz*left+a.dx*run,z=a.dx*left+a.dz*run;
  const cap=Math.min(1,2.6*Math.max(ha,hb)/Math.hypot(x,z));
  return [a.point[0]+x*cap,a.point[1]+z*cap];
}

const defaultGroup=p=>(p.bridge||p.kind==='stairs'||p.kind==='tunnel'||p.tunnel||p.id.startsWith('G-'))?p.id:'street';
const ordinaryStreet=p=>hasRoadMesh(p)&&p.walkable!==false&&!p.bridge&&!p.tunnel&&
  p.kind!=='stairs'&&p.kind!=='tunnel'&&!p.id.startsWith('G-');

export function roadJoins(segments,{hasMesh=hasRoadMesh,groupKey=defaultGroup,atGrade=ordinaryStreet}={}) {
  const nodes=new Map(),ends=new Map(),junctions=[];
  for(const seg of segments){
    const arms=[];
    for(const end of [0,1]){
      const point=end?seg.b:seg.a,key=point.join(','),sign=end?-1:1;
      if(!nodes.has(key))nodes.set(key,[]);
      const dx=sign*seg.nz,dz=-sign*seg.nx;
      const arm={point,dx,dz,angle:Math.atan2(dz,dx),seg,end};
      if(hasMesh(seg.path)){
        arm.left=across(arm,1,seg.half);arm.right=across(arm,-1,seg.half);
        arm.outerLeft=across(arm,1,seg.half+.16);arm.outerRight=across(arm,-1,seg.half+.16);
      }
      nodes.get(key).push(arm);arms.push(arm);
    }
    ends.set(seg,arms);
  }
  for(const arms of nodes.values()){
    const groups=new Map();
    for(const arm of arms){
      const p=arm.seg.path;
      if(!hasMesh(p))continue;
      // Decks, flights and tunnel portals meet the terrain through their own
      // transverse end section. Never join a grade-separated geometric crossing.
      const key=groupKey(p);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(arm);
    }
    for(const group of groups.values()){
      const others=arms.filter(a=>!group.includes(a)).map(a=>a.seg);
      group.forEach(a=>{a.access=others;a.terminal=arms.length===1;});
      if(group.length===1)continue;
      group.sort((a,b)=>a.angle-b.angle);
      for(let i=0;i<group.length;i++){
        const a=group[i],b=group[(i+1)%group.length];
        a.left=b.right=corner(a,b,0);
        a.outerLeft=b.outerRight=corner(a,b,.16);
      }
      if(group.length>=3)junctions.push(group);
    }
  }
  // A short survey segment is often the full width of a T-intersection.
  // Allow either end to use the available length. Only shorten corners when
  // the two actual cuts on the SAME edge would pass one another.
  for(const [seg,[a,b]] of ends){
    if(!hasMesh(seg.path))continue;
    for(const [sideA,sideB] of [['left','right'],['right','left']]){
      const advance=(arm,point)=>Math.max(0,(point[0]-arm.point[0])*arm.dx+(point[1]-arm.point[1])*arm.dz);
      const run=advance(a,a[sideA])+advance(b,b[sideB]);
      if(run<seg.len*.98)continue;
      const shrink=seg.len*.98/run;
      for(const [arm,side] of [[a,sideA],[b,sideB]]){
        if(advance(arm,arm[side])===0)continue;
        const kerb=side==='left'?arm.outerLeft:arm.outerRight;
        for(const point of [arm[side],kerb]){
          point[0]=mix(arm.point[0],point[0],shrink);point[1]=mix(arm.point[1],point[1],shrink);
        }
      }
    }
  }
  const endpoint=(arm,side)=>{
    const n=arm.end?-side:side,h=arm.seg.half;
    if(n>=-h&&n<=h)return lerp(arm.right,arm.left,.5+n/(2*h));
    return n<0?lerp(arm.right,arm.outerRight,(-n-h)/.16):
      lerp(arm.left,arm.outerLeft,(n-h)/.16);
  };
  function point(seg,f,side){
    const [a,b]=ends.get(seg);
    const start=endpoint(a,side),end=endpoint(b,side);
    if(f===0)return start;if(f===1)return end;
    const normalA=(start[0]-a.point[0])*seg.nx+(start[1]-a.point[1])*seg.nz;
    const normalB=(end[0]-b.point[0])*seg.nx+(end[1]-b.point[1])*seg.nz;
    const reach=Math.min(seg.len*.48,Math.max(1.5,seg.half*1.6));
    const nearA=Math.max(0,1-f*seg.len/reach),nearB=Math.max(0,1-(1-f)*seg.len/reach);
    const normal=side+(normalA-side)*nearA+(normalB-side)*nearB;
    const correction=normal-mix(normalA,normalB,f);
    return [mix(start[0],end[0],f)+seg.nx*correction,mix(start[1],end[1],f)+seg.nz*correction];
  }
  function atAccess(seg,x,z,pad=.16){
    return ends.get(seg).some(arm=>arm.access?.some(other=>{
      // The concrete entrance flares to 3.4 m where the S3 ramp meets the road.
      const half=other.path.id==='S3-library-ramp'?1.7:other.half;
      return projectPoint(x,z,other.a,other.b).d<half+pad;
    }));
  }
  // At shallow Y forks two carriageways may keep overlapping beyond their
  // shared survey vertex. Curbs and lamp posts belong only on the outer edges.
  const footprints=spatialIndex(16);
  function remember(ring,seg){
    const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
    footprints.add({seg,ring},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
  }
  for(const seg of segments.filter(s=>atGrade(s.path))){
    const reach=Math.min(.48,Math.max(1.5,seg.half*1.6)/seg.len);
    const cuts=[0,reach,1-reach,1],h=seg.half;
    remember([...cuts.map(f=>point(seg,f,h)),...cuts.reverse().map(f=>point(seg,f,-h))],seg);
  }
  for(const arms of junctions)if(arms.every(a=>atGrade(a.seg.path)))remember(arms.map(a=>a.left));
  function covered(seg,x,z){
    return atAccess(seg,x,z,.18)||(atGrade(seg.path)&&footprints.near(x,z).some(entry=>
      entry.seg!==seg&&inside([x,z],entry.ring)));
  }
  function edgeSpans(seg,f,g,side){
    const open=u=>{const [x,z]=point(seg,u,side);return !covered(seg,x,z);};
    const spans=[],m=(f+g)*.5,states=[open(f),open(m),open(g)];
    if(states[0]===states[1]&&states[1]===states[2])return states[0]?[[f,g]]:[];
    for(let i=0;i<2;i++){
      const from=i?m:f,to=i?g:m;
      if(states[i]===states[i+1]){if(states[i])spans.push([from,to]);continue;}
      let lo=from,hi=to;
      for(let n=0;n<6;n++){
        const mid=(lo+hi)*.5;
        if(open(mid)===states[i])lo=mid;else hi=mid;
      }
      const cut=(lo+hi)*.5;spans.push(states[i]?[from,cut]:[cut,to]);
    }
    return spans;
  }
  return {point,junctions,edgeSpans,atAccess,covered,isTerminal:(s,end)=>ends.get(s)[end].terminal};
}

export function roadSections(seg) {
  const n=Math.max(1,Math.ceil(seg.len/1.15)),fractions=[0];
  if(seg.path.kind==='stairs'){
    const run=seg.length/seg.steps;
    for(let i=Math.floor(seg.start/run)+1;i*run<seg.start+seg.len-.00001;i++){
      const f=(i*run-seg.start)/seg.len;if(f>.00001)fractions.push(f);
    }
  }else for(let i=1;i<n;i++)fractions.push(i/n);
  fractions.push(1);
  return fractions;
}
