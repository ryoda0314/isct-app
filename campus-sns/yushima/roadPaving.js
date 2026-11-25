import clip from 'polygon-clipping';
import { asphaltFinish, pavingMaterial, projectPoint } from '../yokohama/landscapeGeometry.js';
import { paths } from './groundsPaths.js';
import { gardenLevel, pathSurface, roadTerrainHeight, stairFlight, bridgeLevel, bridgeSpecs } from './groundsLevels.js';
import { bridgeFrame } from './bridgeDeck.js';
import { garageFootprint } from './groundsSurvey.js';
import { towerForecourt } from './towerForecourt.js';
import { clinicalApron, clinicalApronAxis } from './clinicalForecourtPlan.js';
import { roadLayout, roadSegments, hasStreetSurface } from './streetLayout.js';
import { pavementBatch, pavementGrid } from './pavementGrid.js';
import { carriagewaySections, sidewalkShoulders } from './carriageway.js';
import { groundHeight } from './data.js';

const atGrade=p=>hasStreetSurface(p)&&!p.deck&&p.kind!=='stairs';
const mm=v=>Math.round(v*1000)/1000;
const outline=ring=>[ring.map(([x,z])=>[mm(x),mm(z)])];
const union=polys=>polys.length?clip.union(...polys):[];
const remainder=(a,b)=>a.length&&b.length?clip.difference(a,b):a;
const fromSeg=(s,d,offset)=>[s.a[0]+s.nz*d+s.nx*offset,s.a[1]-s.nx*d+s.nz*offset];
const rect=(s,lo,hi,left,right)=>outline([fromSeg(s,lo,left),fromSeg(s,hi,left),fromSeg(s,hi,right),fromSeg(s,lo,right)]);
const disk=(p,r)=>outline(Array.from({length:24},(_,i)=>{
  const a=i*Math.PI/12;return [p[0]+r*Math.cos(a),p[1]+r*Math.sin(a)];
}));
const streetClass=p=>p.kind==='road'?'traffic':p.name==='歩道'?'sidewalk':p.kind==='lane'?'lane':
  p.id==='south-court'?'south':'walk';
const groups=new Map(paths.map(p=>[p,[]]));
for(const s of roadSegments)groups.get(s.path).push(s);
const carriageways=carriagewaySections(roadSegments.filter(s=>atGrade(s.path)&&s.path.kind==='road'));

// Union the straight survey strips and their round joins before tessellation.
// Very short edges at the station entrance can be smaller than a paving block.
// Treating both ends as independent mitres there folds the pavement back on itself.
function footprint(segments,extra=0){
  const strips=[],ends=new Map();
  for(const s of segments){
    const half=s.half+extra;
    const section=carriageways.ends.get(s);
    strips.push(section?outline(carriageways.band(s,0,s.len,-1,1,extra)):rect(s,0,s.len,-half,half));
    for(const [end,p] of [s.a,s.b].entries()){
      const key=p.toString();
      if(!ends.has(key))ends.set(key,{p,widths:[]});
      ends.get(key).widths.push(section?section[end].half+extra:half);
    }
  }
  for(const {p,widths} of ends.values())if(widths.length>1)strips.push(disk(p,Math.min(...widths)));
  return union(strips);
}
let roadPlan;
function planPaving(){
  if(roadPlan)return roadPlan;
  const ground=roadSegments.filter(s=>atGrade(s.path));
  const classified=kind=>ground.filter(s=>streetClass(s.path)===kind);
  const roads=classified('traffic'),walks=classified('sidewalk'),asphaltShape=footprint(roads);
  const riverRoad=footprint(roads.filter(s=>s.path.name==='外堀通り'));
  const shoulder=remainder(union(sidewalkShoulders(walks,riverRoad).map(outline)),asphaltShape);
  // Ochanomizu gate has a flared vehicle entrance. The parallel crossing
  // spans its full mouth, while the service-lane survey stops on the crossing.
  const gate=groups.get(paths.find(p=>p.id==='osm-676680985')).at(-1);
  const crossing=paths.find(p=>p.id==='osm-666668685').points;
  const mouth=(p,d)=>[p[0]+gate.nz*d,p[1]-gate.nx*d];
  const near=crossing[0],far=crossing.at(-1);
  const gateMouth=outline([fromSeg(gate,-4,-gate.half),mouth(near,-1.8),mouth(near,7.5),
    mouth(far,7.5),mouth(far,-1.8),fromSeg(gate,-4,gate.half)]);
  const layers=[
    ['sidewalk',clip.union(footprint(walks),shoulder),0xb8b4a7],
    ['traffic',asphaltShape,0x696d6c],
    ['court',union([outline(clinicalApron)]),0xbb8e79],
    ['lane',clip.union(footprint(classified('lane')),gateMouth),0x8f9290],
    ['south',footprint(classified('south')),0xb18b75],
    ['walk',footprint(classified('walk')),0xb8b4a7],
  ];
  let occupied=[];
  for(const layer of layers){
    const shape=layer[1];layer[1]=remainder(shape,occupied);
    if(shape.length)occupied=occupied.length?clip.union(occupied,shape):shape;
  }
  const crossings=roadSegments.filter(s=>s.path.kind==='crossing'&&!s.path.deck);
  const zebra=footprint(crossings);
  const nonTraffic=ground.filter(s=>s.path.kind!=='road');
  let curb=remainder(footprint(nonTraffic,.12),clip.union(occupied,zebra));
  // Interrupt the lane dividers at a real junction or a crossing. Two
  // consecutive OSM ways on Sotobori-dori are often the same carriageway.
  const trafficNodes=new Map(),gaps=[];
  for(const s of ground.filter(s=>s.path.kind==='road'||s.path.kind==='lane')){
    for(const p of [s.a,s.b]){
      const key=p.toString();
      if(!trafficNodes.has(key))trafficNodes.set(key,{p,arms:[]});
      trafficNodes.get(key).arms.push(s);
    }
  }
  for(const {p,arms} of trafficNodes.values()){
    if(arms.length>=3&&arms.some(s=>s.path.kind==='road'))gaps.push(disk(p,Math.max(...arms.map(s=>s.half))+1.0));
  }
  const keepClear=union([...gaps,...crossings.map(s=>rect(s,-.4,s.len+.4,-s.half-.9,s.half+.9))]);
  const stripes=[],dividers=[];
  for(const [path,segments] of groups){
    if(path.deck)continue;
    if(path.kind==='crossing'){
      const length=segments[0].length,count=Math.max(1,Math.floor(length/.90)),edge=(length-(count-.5)*.90)/2;
      for(const s of segments)for(let i=0;i<count;i++){
        const start=edge+i*.9-s.start,lo=Math.max(0,start),hi=Math.min(s.len,start+.45);
        if(hi-lo>.0005)stripes.push(rect(s,lo,hi,-s.half,s.half));
      }
    }
    if(path.kind==='road'){
      for(const s of segments){
        const fourLane=path.name==='外堀通り',offsets=fourLane?[-.50,0,.50]:[0];
        for(const offset of offsets){
          // A continuous centreline divides the opposing two-lane flows.
          if(fourLane&&offset===0){dividers.push(outline(carriageways.band(s,0,s.len,0,0,.075)));continue;}
          for(let d=Math.floor(s.start/10)*10;d<s.start+s.len;d+=10){
            const lo=Math.max(0,d-s.start),hi=Math.min(s.len,d+5-s.start);
            if(hi-lo>.001)dividers.push(outline(carriageways.band(s,lo,hi,offset,offset,.075)));
          }
        }
      }
    }
  }
  const asphalt=layers.find(l=>l[0]==='traffic')[1];
  const paintedRoad=clip.union(asphalt,layers.find(l=>l[0]==='lane')[1]);
  let crossPaint=stripes.length?clip.intersection(union(stripes),paintedRoad):[];
  let lines=dividers.length?clip.intersection(remainder(union(dividers),keepClear),asphalt):[];
  const landings=[];
  for(const [id,b] of Object.entries(bridgeSpecs)){
    const frame=bridgeFrame(b),span=outline(frame.outline),segments=roadSegments.filter(s=>s.path.deck===id);
    let sidewalk=[];
    for(const kind of ['walk','road']){
      const arms=segments.filter(s=>s.path.kind===kind);
      const joints=kind==='walk'?arms.flatMap(s=>[disk(s.a,s.half),disk(s.b,s.half)]):[];
      const ends=remainder(union([footprint(arms),...joints]),span);
      // The apron around each granite post is continuous with the city
      // sidewalk and takes precedence over a widened traffic shoulder.
      const corner=id==='ochanomizu'&&kind==='walk';
      const shape=remainder(remainder(ends,corner?layers[0][1]:occupied),sidewalk);
      if(!shape.length)continue;
      if(corner){
        for(const layer of layers.slice(1))layer[1]=remainder(layer[1],shape);
        curb=remainder(curb,shape);
        crossPaint=remainder(crossPaint,shape);
        lines=remainder(lines,shape);
      }
      landings.push({id,kind,shape,frame});
      if(kind==='walk')sidewalk=shape;
    }
  }
  roadPlan={layers,curb,lines,crossPaint,landings};return roadPlan;
}

function drawStructures(t,batch,pavers){
  const gardenDeck=roadSegments.filter(s=>hasStreetSurface(s.path)&&s.path.deck==='garden');
  const deckShape=remainder(footprint(gardenDeck),union([outline(garageFootprint),outline(towerForecourt)]));
  const distanceToEdge=(x,z,ring)=>Math.min(...ring.map((a,i)=>projectPoint(x,z,a,ring[(i+1)%ring.length]).d));
  const deckHeight=([x,y,z])=>[x,y-.12*Math.max(0,1-distanceToEdge(x,z,garageFootprint))-
    .06*Math.max(0,1-distanceToEdge(x,z,towerForecourt)),z];
  pavers.orient(.909,.416);
  pavementGrid(()=>gardenLevel+.12).draw(deckShape,{
    tri:(a,b,c,colour)=>pavers.tri(deckHeight(a),deckHeight(b),deckHeight(c),colour),
  },0xc8bca6);
  for(const s of roadSegments){
    const {path,half,len}=s;
    if(!hasStreetSurface(path))continue;
    const flight=stairFlight(path),deck=path.deck==='garden';
    if(!flight&&!deck&&path.id!=='d-court')continue;
    const P=(f,side,lift=0)=>{
      const [x,z]=roadLayout.point(s,f,side);
      return [x,pathSurface(path,x,z)+.12+lift,z];
    };
    if(flight){
      const n=flight.steps;
      for(let i=0;i<n;i++){
        const a=i/n,b=(i+1)/n,L=P(a,-half),R=P(a,half),l=P(b,-half),r=P(b,half);
        const top=flight.heightAt((i+.5)/n)+.12;
        const next=flight.heightAt(Math.min(1,(i+1.5)/n))+.12;
        L[1]=R[1]=top;l[1]=r[1]=next;
        const treadL=[l[0],top,l[2]],treadR=[r[0],top,r[2]];
        t.quad(L,R,treadR,treadL,0xb4b1a7);
        if(next!==top)t.quad(treadL,treadR,r,l,0x8f9189);
      }
    }
    if(deck&&!path.bridge)continue;
    for(const side of [-1,1]){
      const width=side*(half+.06),posts=Math.ceil(len/2.1);
      const rail=(f,lift)=>{
        const p=P(f,width,lift);
        if(flight)p[1]=flight.start+(flight.end-flight.start)*f+.12+lift;
        return p;
      };
      if(deck)t.quad(P(0,width),P(1,width),P(1,width,-.63),P(0,width,-.63),0xa1aba6);
      for(let j=0;j<posts;j++){
        const f=j/posts,g=(j+1)/posts,mid=rail((f+g)/2,0);
        if(roadLayout.atAccess(s,mid[0],mid[2],.12))continue;
        const h=deck?1.12:.90;
        batch.beam(rail(f,h),rail(g,h),.075,.075,0x808c87,'post');
        batch.beam(P(f,width),rail(f,h),.065,.065,0x8c9591,'post');
        if(deck)batch.beam(rail(f,.56),rail(g,.56),.05,.05,0x8f9890,'post');
      }
    }
    if(deck){const mid=P(.5,0,-.50);batch.beam([mid[0],groundHeight(mid[0],mid[2]),mid[2]],mid,.38,.39,0xb8b9ae);}
  }
}

export function drawStreets(T,group,t,batch,pavers){
  const plan=planPaving(),grid=pavementGrid((x,z)=>roadTerrainHeight(x,z)+.12);
  const solid=offset=>new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,
    polygonOffsetFactor:offset,polygonOffsetUnits:offset});
  const asphalt=pavementBatch(T,group,solid(-1),grid.normal),stone=pavementBatch(T,group,pavingMaterial(T),grid.normal,true);
  const curb=pavementBatch(T,group,solid(-1),grid.normal),paint=pavementBatch(T,group,solid(-3),grid.normal);
  for(const [kind,shape,colour] of plan.layers){
    const hard=kind==='traffic'||kind==='lane';
    stone.orient(...(kind==='court'?clinicalApronAxis:[.918,.396]));
    grid.draw(shape,hard?asphalt:stone,colour);
  }
  grid.draw(plan.curb,curb,0xbab6ac);
  grid.draw(plan.crossPaint,paint,0xe2dfcf,.007);
  grid.draw(plan.lines,paint,0xcfcdbf,.007);
  // The surveyed bridge ways flare and turn at the abutments. Only their ends
  // extend beyond the separate bridge decks and abutting street pavement.
  for(const {id,kind,shape,frame} of plan.landings){
    const walk=kind==='walk';
    const landing=pavementGrid((x,z)=>bridgeLevel(id,x,z)+(walk?(id==='hijiri'?.11:.118):0));
    stone.orient(frame.outline[1][0]-frame.outline[0][0],frame.outline[1][1]-frame.outline[0][1]);
    landing.draw(shape,walk?stone:asphalt,walk?(id==='hijiri'?0xada998:0x9a9796):0x767e82);
  }
  asphalt.finish('湯島の車道と構内車路').material.onBeforeCompile=asphaltFinish;
  stone.finish('湯島の歩道と前庭');
  curb.finish('湯島の縁石');
  paint.finish('湯島の白線と横断歩道');
  drawStructures(t,batch,pavers);
}
