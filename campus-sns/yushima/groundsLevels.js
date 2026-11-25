import { inside, interpolate } from '../yokohama/navigation.js';
import { projectPoint, spatialIndex } from '../yokohama/landscapeGeometry.js';
import { prepareStreetGrades } from '../yokohama/roadGrade.js';
import { groundHeight } from './data.js';
import { bridgeDeckLift, bridgeFrame } from './bridgeDeck.js';
import { paths } from './groundsPaths.js';
import { garageFootprint, northBank, southBank } from './groundsSurvey.js';
import { towerForecourt, towerForecourtRails } from './towerForecourt.js';

export const waterLevel=groundHeight(-60,130)-15.4;
export const gardenLevel=groundHeight(-37.4,38.5)+4.3;
export const bridgeSpecs={
  ochanomizu:{start:[-66.1,126.6],end:[-97.7,200.4],width:23.4,north:groundHeight(-59,120),south:groundHeight(-96,212)},
  hijiri:{start:[95.4,166.4],end:[89.3,263.3],width:22,north:groundHeight(113,82),south:groundHeight(89,278)},
};
const riverRing=[...northBank,...[...southBank].reverse()];
const bridgeFrames=Object.entries(bridgeSpecs).map(([id,b])=>[id,bridgeFrame(b)]);
const ochaNorth=bridgeFrames.find(([id])=>id==='ochanomizu')[1];
export const overRiver=(x,z)=>inside([x,z],riverRing);
const clamp01=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{const u=clamp01(t);return u*u*(3-2*u);};
export function bridgeLevel(id,x,z) {
  const b=bridgeSpecs[id],t=projectPoint(x,z,b.start,b.end).t;
  return b.north+(b.south-b.north)*t+Math.sin(t*Math.PI)*.22;
}
const upperHongo=new Set(['osm-684893197','osm-404519832','osm-31887171','osm-31887159']);
const stairFlights=new Map(),surveyIndex=spatialIndex(),segments=[];
// Station/elevation pairs in metres (15 m Tokyo Peil = scene zero).
// Heights follow Tokyo's Class 2 point cloud summarized on a 1 m grid.
// Profiles in gaps under canopies, and the run from the A-ward deck to the
// D-ward court, interpolate the adjacent surveyed floors on that route.
const surveyProfiles={
  'osm-1320020327':[[0,4.1],[12,4.2],[20,3.9],[60,.6],[72,.8],[99,.8],[130,.7],[166,.7],[198,.8],[220,.9],[230,1.1],[238,1.5],[246,2.5],[250,2.7],[254,2.4]],
  'osm-668172774':[[0,4.6],[12,4.6],[23,4.8],[27,4.9],[35,4.8],[39,4.8]],
  'osm-687084580':[[0,4.5],[12,4.5],[24,4.9],[32,4.8],[40,4.6],[56,4.5],[72,4.3]],
  'osm-668158851':[[0,gardenLevel],[4,gardenLevel],[31,.9],[45,.8],[51,.8],[83,5.2],[89,4.7],[96,4.5],[100,4.6]],
  'osm-764607843':[[0,.55],[5,.5],[17,.8],[20,.6],[24.4,-.6]],
  'd-court':[[0,.9],[5.5,-.7],[11.5,-.6]],
  'east-court':[[0,4.4],[16,4.4],[20,4.3],[28,3.4],[36,3.3],[66,3.4]],
  'no10-court':[[0,-.7],[32,-.7],[45,-.8]],
  'hijiri-approach':[[0,3.2],[11,3.3],[19,3.4],[37,3.4]],
  'hongo-approach':[[0,5.5],[3,5.6]],
  'west-approach':[[0,4.4],[21,4.4]],
  'osm-666668686':[[0,.7],[7,.7],[14,.8],[21,.9]],
};
function surveyGrade(x,z,path,station){
  const points=surveyProfiles[path.id];
  if(points){
    const next=points.findIndex(p=>p[0]>=station);
    if(next<0)return points.at(-1)[1];
    if(!next)return points[0][1];
    const [a,y]=points[next-1],[b,h]=points[next];return y+(h-y)*(station-a)/(b-a);
  }
  const h=groundHeight(x,z);
  if(upperHongo.has(path.id))return h+(bridgeSpecs.hijiri.north-h)*smooth((z-85)/54);
  return h;
}
for(const path of paths){
  let start=0;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const half=path.width/2,margin=half+5;
    // Along the back of No. 3 the service lane runs below the street-side
    // entrance. No. 10 has the same narrow separation from the Hijiri terrace.
    const atWall=(path.id==='osm-1320020327'&&(i===4||i===5))||path.id==='no10-court';
    const s={path,a,b,start,len,half,atWall};
    segments.push(s);surveyIndex.add(s,Math.min(a[0],b[0])-margin,Math.min(a[1],b[1])-margin,
      Math.max(a[0],b[0])+margin,Math.max(a[1],b[1])+margin);
    start+=len;
  }
  if(path.kind==='stairs'){
    const first=path.points[0],last=path.points.at(-1),lo=groundHeight(...first);
    const hi=path.id==='osm-404519833'?bridgeSpecs.hijiri.north:groundHeight(...last);
    const risers=Math.max(1,Math.round(Math.abs(hi-lo)/.17));
    const landing=Math.max(1,Math.ceil(1.45*risers/start)),steps=risers+2*landing;
    const heightAt=f=>lo+(hi-lo)*clamp01((Math.floor(f*steps+1e-8)-landing)/risers);
    stairFlights.set(path.id,{start:lo,end:hi,steps,risers,heightAt});
  }
}
export const stairFlight=path=>stairFlights.get(path.id);
function structuralLevel(path,x,z){
  if(path.deck==='garden')return gardenLevel;
  if(bridgeSpecs[path.deck])return bridgeLevel(path.deck,x,z);
  const flight=stairFlight(path),f=projectPoint(x,z,path.points[0],path.points.at(-1)).t;
  return flight.heightAt(f);
}
prepareStreetGrades(segments,surveyGrade,p=>p.deck||p.kind==='stairs',(s,t)=>{
  const p=t?s.b:s.a;return structuralLevel(s.path,...p);
},()=>true);

// At a junction all adjoining pavement samples use the same height. A finite
// influence across a whole lane also handles OSM lines that cross in plan but
// do not share a vertex. Outside the shoulder the measured DEM is untouched.
export function roadTerrainHeight(x,z){
  const h=groundHeight(x,z);
  let sum=0,total=0,coverage=0,wallWeight=0,wallLevel=0;
  for(const s of surveyIndex.near(x,z)){
    if(!s.elevation)continue;
    const hit=projectPoint(x,z,s.a,s.b),distance=hit.d,edge=s.half+.45;
    if(distance>=edge+4.5)continue;
    const blend=1-smooth((distance-edge)/4.5);
    const footprint=s.atWall?1-smooth((distance-s.half-.14)/1.2):1;
    const weight=footprint*blend*blend/(1+(distance/(1.45+s.half*.45))**2)**2;
    const level=s.elevation(s.start+hit.t*s.len);
    sum+=weight*level;total+=weight;coverage=Math.max(coverage,footprint*blend);
    if(s.atWall&&footprint>wallWeight){wallWeight=footprint;wallLevel=level;}
  }
  const fitted=total?h+coverage*(sum/total-h):h;
  const floor=fitted+wallWeight*(wallLevel-fitted);
  // Around the granite posts the abutment, turning sidewalks and Sotobori
  // meet on the same landing. Carry its surveyed level onto both shoulders.
  if(x< -90||x> -42||z<104||z>149)return floor;
  const [u,s]=ochaNorth.local(x,z);
  const landing=(1-smooth((Math.abs(u)-2.5)/4.2))*(1-smooth((Math.abs(Math.abs(s)-ochaNorth.half)-3.5)/3));
  return floor+landing*(bridgeLevel('ochanomizu',x,z)-floor);
}
export function pathSurface(path,x,z){
  return path.deck||path.kind==='stairs'?structuralLevel(path,x,z):roadTerrainHeight(x,z);
}
export function pathVertex(path,a,b,t,offset=0,lift=0) {
  const p=interpolate(a,b,t),d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
  const x=p[0]-offset*(b[1]-a[1])/d,z=p[1]+offset*(b[0]-a[0])/d;
  return [x,pathSurface(path,x,z)+.09+lift,z];
}
export function walkingSurfaceAt(x,z) {
  if(inside([x,z],garageFootprint)||inside([x,z],towerForecourt))return gardenLevel+.12;
  // The whole bridge deck is walkable at bridge height, including between the
  // two surveyed sidewalk lines. Its actual ends leave the lower street free.
  for(const [id,frame] of bridgeFrames){
    const [u,s]=frame.local(x,z);
    if(u<0||u>frame.length||Math.abs(s)>frame.half+.005)continue;
    return bridgeLevel(id,x,z)+bridgeDeckLift(id,u,s,frame.half);
  }
  let best=null;
  for(const s of surveyIndex.near(x,z)) {
    if(!(s.path.deck||s.path.kind==='stairs'))continue;
    const hit=projectPoint(x,z,s.a,s.b);
    if(hit.d>s.half+.04)continue;
    if((hit.t===0||hit.t===1)&&Math.abs(((x-hit.x)*(s.b[0]-s.a[0])+(z-hit.z)*(s.b[1]-s.a[1]))/s.len)>.025)continue;
    const rank=s.path.deck&&s.path.walkable!==false?0:1;
    if(!best||rank<best.rank||(rank===best.rank&&hit.d<best.d))best={path:s.path,d:hit.d,rank};
  }
  return best?structuralLevel(best.path,x,z)+(best.path.walkable===false?0:.12):roadTerrainHeight(x,z)+.12;
}
let blockers=spatialIndex();
export function resetBlockers(){blockers=spatialIndex();}
export function addBlocker(a,b,r){
  blockers.add({a,b,r},Math.min(a[0],b[0])-r-1,Math.min(a[1],b[1])-r-1,Math.max(a[0],b[0])+r+1,Math.max(a[1],b[1])+r+1);
}
export function hitsLandscape(x,z,r=.3){
  if(x>=-129&&x<=-78&&z>=0&&z<=27&&towerForecourtRails.some(([a,b])=>projectPoint(x,z,a,b).d<r+.045))return true;
  if(overRiver(x,z)) {
    const valid=Object.values(bridgeSpecs).some(bridge=>projectPoint(x,z,bridge.start,bridge.end).d<=bridge.width/2+.18);
    if(!valid)return true;
  }
  for(const obstacle of blockers.near(x,z))if(projectPoint(x,z,obstacle.a,obstacle.b).d<r+obstacle.r)return true;
  return false;
}
export function onWalkway(x,z,margin=0){
  return surveyIndex.near(x,z).some(s=>projectPoint(x,z,s.a,s.b).d<=s.path.width/2+margin);
}


export function clearanceFromWalk(x,z){return Math.min(Infinity,...surveyIndex.near(x,z).filter(s=>s.path.walkable!==false).map(s=>projectPoint(x,z,s.a,s.b).d));}

