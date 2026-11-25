// Yokohama campus terrain, paths, gate approach, woodland and water.
// Ground: GSI DEM5A (terrain.js). Footpaths, bridges, water and terrain cover: data.js.
// Gate views: https://www.ssc.titech.ac.jp/amap/home/suzukakedai/
// Pond/reed beds: https://www.isct.ac.jp/ja/news/iig87pkdhg6k and Science Tokyo Fund,
// 2026 summer report, 横浜キャンパスすずかけ池のビオトープ化.
// Individual tree positions, street furnishings, pool level, portal section and
// bridge soffits are modeled estimates within those mapped areas.
import { groundAt as demAt, terrainGrid } from './terrain.js';
import { addRoadsideTerrain, gridSurfaceAt } from './roadTerrain.js';
import { hallApronAt, hallGround, hallLawnHeight } from './hallGround.js';
import { hallPlazaMesh, terraceSoil } from './hallPlaza.js';
import { outsidePlaza } from './plazaRoad.js';
import { boundsOf, inside } from './navigation.js';
import { asphaltFinish, geometryBatch, naturalMaterial, pavingBatch, plantShadows, projectPoint, spatialIndex, triangleBatch } from './landscapeGeometry.js';
import { pondHabitat, springValley } from './pond.js';
import { makePondTerrace, nearPondTerraceGround, pondTerraceOutline, pondTerraceSurfaceAt, pondTerraceTerrain } from './pondTerrace.js';
import { towerCourt, towerRailBlocks, towerSurfaceAt } from './towerGround.js';
import { landmarkFixtures } from './landscapeFixtures.js';
import { plantLandscape } from './landscapePlants.js';
import { approachRoads, stationContext, stationPlazaHeight, stationApronGround, stationSurfaceAt } from './landscapeStation.js';
import { libraryGardenBlocks, libraryRampTerrain, librarySurfaceAt, makeLibraryGround } from './libraryGround.js';
import { hasRoadMesh, roadJoins, roadSections } from './roadJoins.js';
import { prepareStreetGrades, streetBed } from './roadGrade.js';

const groundAt=(x,z)=>libraryRampTerrain(x,z,hallLawnHeight(x,z,demAt(x,z)));
const gradedGroundAt=(x,z)=>terrainRoadHeight(x,z,groundAt(x,z));
export function landscapedGroundAt(x,z){
  const soil=gradedGroundAt(x,z);
  return pondTerraceTerrain(x,z,hallPlaza?hallPlaza.vergeHeight(x,z,soil):soil,roadbedAt);
}
let features=spatialIndex(), collisions=spatialIndex(), lakes=[], hallPlaza=null;
const margin=.055;
const isTunnel=p=>p.kind==='tunnel'||p.tunnel===true;
const grading=p=>p.id==='G-hillside-slope'||p.id==='G-tunnel-apron';
const isSpecial=p=>isTunnel(p)||p.bridge||p.kind==='stairs'||grading(p);
const G_WEST=18.7,G_EAST=20.9; // DEM apron elevations continued under the wooded ridge.

function preparePaths(paths) {
  const all=spatialIndex(), segments=[];
  for(const path of paths) {
    const points=path.points;
    if(points.length<2)continue;
    let length=0;
    const chain=[];
    for(let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i], dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
      if(len<.02)continue;
      const half=path.width/2, item={path,a,b,len,start:length,nx:-dz/len,nz:dx/len,half};
      length+=len;chain.push(item);segments.push(item);
      all.add(item,Math.min(a[0],b[0])-half-6,Math.min(a[1],b[1])-half-6,
        Math.max(a[0],b[0])+half+6,Math.max(a[1],b[1])+half+6);
    }
    const first=points[0],last=points[points.length-1],rise=path.bridge?(path.walkable===false?1.2:.12):0;
    let h0=groundAt(...first)+rise,h1=groundAt(...last)+rise;
    if(path.id==='G-hillside-tunnel'){h0=G_WEST;h1=G_EAST;}
    if(path.id==='G-hillside-slope')h1=G_WEST;
    if(path.id==='G-tunnel-apron')h0=G_EAST;
    const steps=Math.max(1,Math.round(Math.abs(h1-h0)/.16));
    for(const item of chain) {
      Object.assign(item,{length,h0,h1,steps});
      if(path.id==='G-tunnel-apron')item.apronJoin={at:chain[0].len,y:groundAt(...chain[0].b)};
    }
  }
  const bore=segments.find(s=>s.path.id==='G-hillside-tunnel');
  const boreGrade=bore?(bore.h1-bore.h0)/bore.length:0;
  for(const s of segments)if(grading(s.path))s.boreGrade=boreGrade;
  prepareStreetGrades(segments,groundAt,isSpecial,profile);
  return {all,segments};
}

function profile(s,t) {
  const d=s.start+s.len*t,span=s.h1-s.h0;
  let u=d/s.length;
  // Vertical curves at the fork and portals preserve the measured total rise.
  // At the foot, the first three metres share the service-road junction.
  if(s.path.id==='G-hillside-slope'){
    const foot=Math.max(0,d-3),curve=Math.min(8,foot),tail=Math.max(0,d-(s.length-5));
    const run=curve*curve/16+Math.max(0,foot-8),crest=tail*tail/10;
    const grade=(span-s.boreGrade*2.5)/(s.length-3-4-2.5);
    return s.h0+grade*(run-crest)+s.boreGrade*crest;
  }
  if(s.apronJoin){
    // The apron meets the campus road at its first bend. Its other DEM vertices
    // sampled the adjacent hillside and previously produced an artificial hump.
    const {at,y}=s.apronJoin,exitGrade=(s.h1-y)/(s.length-at);
    if(d>=at)return y+(d-at)*exitGrade;
    const f=d/at,g=1-f;
    return g*g*((1+2*f)*s.h0+at*s.boreGrade*f)+f*f*((3-2*f)*y-at*exitGrade*g);
  }
  if(s.path.kind==='stairs')u=Math.floor(u*s.steps+.000001)/s.steps;
  return s.h0+(s.h1-s.h0)*u;
}
function pathHeight(s,t,x,z) {
  // The hillside path fans out of the service road. Where their paving shares
  // the same footprint its foot and the road must describe one surface.
  if(grading(s.path))return streetBed(x,z,profile(s,t),features.near(x,z));
  if(isSpecial(s.path))return profile(s,t);
  return s.elevation?roadbedAt(x,z):groundAt(x,z);
}

export function roadbedAt(x,z) {
  return streetBed(x,z,groundAt(x,z),features.near(x,z));
}

export function terrainRoadHeight(x,z,original) {
  const nearby=features.near(x,z);
  let result=streetBed(x,z,original,nearby,.14);
  // Cut the ground beneath outdoor steps. The road bed must not fill a bridge
  // opening or remove a tunnel roof. Those two structures have separate decks.
  for(const s of nearby){
    if(s.path.kind!=='stairs'||s.path.siteModel)continue;
    const p=projectPoint(x,z,s.a,s.b),edge=s.half+.30;
    if(p.d>=edge+1.6)continue;
    const u=(s.start+s.len*p.t)/s.length;
    const bed=s.h0+(s.h1-s.h0)*u-.23;
    const f=Math.max(0,Math.min(1,(edge+1.6-p.d)/1.6));
    result=Math.min(result,result+(bed-result)*f*f*(3-2*f));
  }
  return stationApronGround(x,z,result,roadbedAt);
}

function activePath(x,z) {
  let best=null;
  for(const s of features.near(x,z)) {
    if(s.path.walkable===false)continue;
    const p=projectPoint(x,z,s.a,s.b);
    if(p.d>s.half+.14 || (best && p.d>=best.d))continue;
    if(isSpecial(s.path)&&(p.t===0||p.t===1)){
      const longitudinal=((x-p.x)*(s.b[0]-s.a[0])+(z-p.z)*(s.b[1]-s.a[1]))/s.len;
      if(Math.abs(longitudinal)>.025)continue;
    }
    best={s,...p};
  }
  return best;
}

export function walkingSurfaceAt(x,z) {
  const station=stationSurfaceAt(x,z,roadbedAt);
  if(station!==null)return station;
  const terrace=pondTerraceSurfaceAt(x,z,roadbedAt);
  if(terrace!==null)return terrace;
  const hall=hallApronAt(x,z,roadbedAt);
  if(hall!==null)return hall;
  const plaza=hallPlaza?.floor(x,z);
  if(plaza!=null)return plaza;
  const gallery=librarySurfaceAt(x,z,roadbedAt);
  if(gallery!==null)return gallery;
  const deck=towerSurfaceAt(x,z,roadbedAt);
  if(deck!==null)return deck;
  const path=activePath(x,z);
  if((!path||path.s.path.siteModel)&&(hallPlaza?.within(x,z,0)||nearPondTerraceGround(x,z))){
    return gridSurfaceAt(x,z,terrainGrid.step/5,landscapedGroundAt);
  }
  return (path&&isSpecial(path.s.path)&&!path.s.path.siteModel?pathHeight(path.s,path.t,x,z):roadbedAt(x,z))+margin;
}
export function inG4Passage(x,z,radius=.28) {
  return features.near(x,z).some(s=>s.path.id==='osm-698427430' &&
    projectPoint(x,z,s.a,s.b).d<=s.half-radius);
}

export function hitsLandscape(x,z,radius=.3) {
  if(towerRailBlocks(x,z,radius))return true;
  if(libraryGardenBlocks(x,z,radius))return true;
  for(const c of collisions.near(x,z)) if(Math.hypot(x-c.x,z-c.z)<radius+c.r)return true;
  const path=activePath(x,z);
  if(path?.s.path.bridge)return false;
  return lakes.some(lake=>inBounds(x,z,lake.bounds) && inside([x,z],lake.polygon) &&
    (lake.kind==='reservoir' || groundAt(x,z)<lake.level+.06));
}
function inBounds(x,z,b) {return x>=b.left&&x<=b.right&&z>=b.top&&z<=b.bottom;}

function tunnelLand(x,z,original=groundAt(x,z)) {
  let height=original,opening=false;
  // Only the actual tunnel openings are cut. The original ridgeline stays above them.
  for(const s of features.near(x,z)) {
    if(!grading(s.path)&&s.path.id!=='G-hillside-tunnel')continue;
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],u=((x-s.a[0])*dx+(z-s.a[1])*dz)/(s.len*s.len);
    const lateral=Math.abs((x-s.a[0])*s.nx+(z-s.a[1])*s.nz);
    if(s.path.id==='G-hillside-tunnel'){
      if(lateral<s.half+.45 && ((u>-.039&&u<.023)||(u>.977&&u<1.039)))opening=true;
      continue;
    }
    const t=Math.max(0,Math.min(1,u)),d=Math.hypot(x-s.a[0]-dx*t,z-s.a[1]-dz*t);
    if(d>s.half+3.4)continue;
    // Don't continue a circular cut from the apron through the ceiling inside the portal.
    if((s.path.id==='G-hillside-slope' && s.start+s.len>s.length-.02 && u>1)||
       (s.path.id==='G-tunnel-apron' && s.start===0 && u<0))continue;
    const alpha=Math.min(1,Math.max(0,(s.half+3.4-d)/3.1));
    height=Math.min(height,original+(pathHeight(s,t,x,z)-.11-original)*alpha);
  }
  return {height,opening};
}

function terrainMesh(T,group,areas,ground,plaza) {
  const {width,depth,step,xMin,zMin}=terrainGrid;
  const pos=[],colors=[],indices=[],fine=[],c=new T.Color();
  const inner=new T.Color(0x9caa84), outer=new T.Color(0xb4bdab), wood=new T.Color(0x7c8c66);
  const cells=spatialIndex(32);
  for(const a of areas.filter(a=>['wood','scrub','lawn','water'].includes(a.kind))) {
    const b=boundsOf(a.polygon);cells.add(a,b.left,b.top,b.right,b.bottom);
  }
  for(let j=0;j<depth;j++)for(let i=0;i<width;i++) {
    const x=xMin+i*step,z=zMin+j*step,h=ground(x,z);
    pos.push(x,h,z);
    const f=Math.max(0,Math.min(1,(Math.hypot(x/360,(z+190)/450)-.78)*2));
    c.copy(inner).lerp(outer,f);
    for(const a of cells.near(x,z)) if(inside([x,z],a.polygon)) {
      if(a.kind==='wood'||a.kind==='scrub')c.copy(wood);
      if(a.kind==='water')c.setHex(h<2.5?0x665f45:h<3.2?0x809151:0x849a63);
      if(a.kind==='lawn')c.setHex(0x96aa72);
    }
    c.multiplyScalar(.98+.017*Math.sin(.042*x+.033*z)+.017*Math.sin(.11*z-.063*x));
    colors.push(c.r,c.g,c.b);
    if(i===width-1||j===depth-1)continue;
    const k=j*width+i, a=k+width, b=a+1;
    const portal=x>=-35&&x<45&&z>=-85&&z<20;
    const courtyard=(x>=-40&&x<5&&z>=-190&&z< -150)||(x>=0&&x<35&&z>=-150&&z< -115)||
      (x>=50&&x<75&&z>=-290&&z< -260)||(x>=-285&&x< -215&&z>=-465&&z< -410);
    const cx=x+step/2,cz=z+step/2;
    const roadside=features.near(cx,cz).some(s=>!s.path.bridge&&!isTunnel(s.path) &&
      projectPoint(cx,cz,s.a,s.b).d<s.half+8);
    if(portal||courtyard||roadside||plaza?.within(x,z,step)){fine.push([x,z,k,portal]);continue;}
    // Unwalkable scenery outside the campus and station is simplified. Leave every 5m
    // edge vertex on the seam to exactly meet the measured playable terrain.
    const nearX=x>=-400&&x<360, nearZ=z>=-620&&z<300;
    if(!nearX||!nearZ) {
      if(i%8===0 && j%8===0) {
        const n=8,outline=[];
        for(let q=0;q<n;q++)outline.push(k+q*width);
        for(let q=0;q<n;q++)outline.push(k+n*width+q);
        for(let q=0;q<n;q++)outline.push(k+(n-q)*width+n);
        for(let q=0;q<n;q++)outline.push(k+n-q);
        const center=k+4*width+4;
        for(let q=0;q<outline.length;q++)indices.push(center,outline[q],outline[(q+1)%outline.length]);
      }
      continue;
    }
    indices.push(k,a,b,k,b,k+1);
  }
  const material=naturalMaterial(T,'ground');
  addRoadsideTerrain(T,group,fine,terrainGrid,colors,material,
    (x,z)=>tunnelLand(x,z,ground(x,z)).height,(x,z)=>tunnelLand(x,z).opening,plaza,terraceSoil);
  const geo=new T.BufferGeometry();geo.setIndex(indices);
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,material);
  mesh.receiveShadow=true;mesh.name='GSI DEM5A · Yokohama';group.add(mesh);
}

function roads(T,group,segments,t,batch,hallPolygon) {
  const lampSpacing=29;
  const pavement=new T.Group();pavement.name='Yokohama · road surfaces';group.add(pavement);
  const asphalt=triangleBatch(T,pavement),pavers=pavingBatch(T,pavement);
  const layout=roadJoins(segments),axes=new Map();
  const plazaPath=p=>p.id==='osm-210335535'||p.id==='osm-210335025';
  const cut=hallPolygon&&outsidePlaza(T,hallPolygon,pondTerraceOutline);
  const outsideSquare=cut?{pavers:cut(pavers),kerbs:cut(t),asphalt:cut(asphalt)}:null;
  const paved=p=>!p.bridge&&!isTunnel(p)&&p.kind!=='stairs'&&
    (p.kind==='walk'||p.kind==='footway'||p.id==='osm-210335025');
  const widthSteps=s=>2*Math.max(1,Math.ceil(s.half/1.15));
  for(const s of segments)if(!axes.has(s.path)||s.len>axes.get(s.path).len)axes.set(s.path,s);
  function orient(p){
    const s=axes.get(p);pavers.orient(s.b[0]-s.a[0],s.b[1]-s.a[1]);
  }
  for(const s of segments) {
    const {path:p,a,b,nx,nz,half,len}=s;
    if(!hasRoadMesh(p))continue;
    const walk=p.kind==='walk'||p.kind==='footway', stair=p.kind==='stairs', tunnel=isTunnel(p)&&p.id!=='osm-698427430';
    const trafficBridge=p.bridge&&p.walkable===false;
    const approach=p.id.startsWith('R246-approach');
    const stone=paved(p),structure=stair||(p.bridge&&!trafficBridge);
    const trim=outsideSquare&&plazaPath(p)?outsideSquare:null;
    const surface=structure?t:(stone?(trim?.pavers??pavers):(trim?.asphalt??asphalt));
    const kerbs=trim?.kerbs??t;
    const color=p.bridge&&!trafficBridge?0x9b8974:stair?0xa1a6a3:stone?0xb0b3af:0x767c7c;
    if(stone)orient(p);
    function P(f,side,lift=0) {
      const [x,z]=layout.point(s,f,side);
      let h=pathHeight(s,f,x,z);
      if(approach) {
        for(const end of [[-205.9,-336.9],[-238,-286.5],[-243.9,-290.3],[-211.9,-340.8]]) {
          const gap=Math.hypot(a[0]+(b[0]-a[0])*f-end[0],a[1]+(b[1]-a[1])*f-end[1]);
          if(gap<12)h+=(groundAt(...end)+1.2-h)*(1-gap/12);
        }
      }
      return [x,h+margin+lift,z];
    }
    const sections=roadSections(s),cols=widthSteps(s);
    const elevated=p.bridge || tunnel;
    for(let i=1;i<sections.length;i++) {
      const f=sections[i-1],g=sections[i];
      const l=P(f,-half), r=P(f,half), L=P(g,-half), R=P(g,half);
      if(stair) {
        const topL=[L[0],l[1],L[2]],topR=[R[0],r[1],R[2]];
        surface.quad(r,l,topL,topR,color);t.quad(topL,L,R,topR,0x7e8784);
        if(Math.abs(L[1]-l[1])>.02){
          const nose=Math.max(f,g-.045/len),edge=P(nose,-half),edgeR=P(nose,half);
          edge[1]=topL[1]+.012;edgeR[1]=topR[1]+.012;
          t.quad(edge,edgeR,[topR[0],edgeR[1],topR[2]],[topL[0],edge[1],topL[2]],0xc2c5c0);
        }
      } else {
        let low=l,high=L;
        for(let j=1;j<=cols;j++){
          const side=half*(2*j/cols-1),right=j===cols?r:P(f,side),next=j===cols?R:P(g,side);
          surface.quad(low,right,next,high,color);low=right;high=next;
        }
      }
      for(const side of [-1,1]) {
        const edge=side*half, kerb=side*(half+.16);
        const lip=walk?.07:.095;
        const spans=layout.edgeSpans(s,f,g,edge);
        for(const [u,v] of spans){
          kerbs.quad(P(u,edge,lip),P(v,edge,lip),P(v,kerb,lip),P(u,kerb,lip),0xbabbb3);
          kerbs.quad(P(u,edge),P(v,edge),P(v,edge,lip),P(u,edge,lip),0x989e98);
          if(!p.bridge&&!tunnel)kerbs.quad(P(u,kerb,lip),P(v,kerb,lip),P(v,kerb,-.48),P(u,kerb,-.48),0x9a9d94);
        }
        if(!p.bridge&&!tunnel&&(spans.length!==1||spans[0][0]!==f||spans[0][1]!==g)){
          const mid=P((f+g)*.5,edge);
          if(layout.atAccess(s,mid[0],mid[2]))kerbs.quad(P(f,edge),P(g,edge),P(g,edge,-.48),P(f,edge,-.48),0x9a9d94);
        }
        if(p.bridge) {
          const bottom=trafficBridge?-.74:-.28;
          t.quad(P(f,kerb),P(g,kerb),P(g,kerb,bottom),P(f,kerb,bottom),0x98a29c);
          if(trafficBridge) {
            t.quad(P(f,edge,.49),P(g,edge,.49),P(g,edge,.12),P(f,edge,.12),0xb5bab2);
          }
        }
        if(tunnel) {
          const wall=half+.18, sidePt=wall*side;
          t.quad(P(f,sidePt,0),P(g,sidePt,0),P(g,sidePt,2.55),P(f,sidePt,2.55),0x9e927c);
          t.quad(P(f,sidePt,2.55),P(g,sidePt,2.55),P(g,sidePt*.77,2.88),P(f,sidePt*.77,2.88),0x9c9282);
        }
      }
      if(tunnel)t.quad(P(f,-(half+.18)*.77,2.88),P(f,(half+.18)*.77,2.88),P(g,(half+.18)*.77,2.88),P(g,-(half+.18)*.77,2.88),0xb0a590);
      if((trafficBridge||approach) && Math.floor((s.start+len*f)/5)%2===0) {
        t.quad(P(f,-.07,.025),P(f,.07,.025),P(g,.07,.025),P(g,-.07,.025),0xd9d9c8);
      }
    }
    for(const end of [0,1])if(layout.isTerminal(s,end)&&!p.bridge&&!tunnel){
      for(let j=0;j<cols;j++){
        const l=half*(2*j/cols-1),r=half*(2*(j+1)/cols-1);
        kerbs.quad(P(end,l),P(end,r),P(end,r,-.48),P(end,l,-.48),0x9a9d94);
      }
    }
    if(tunnel) {
      for(const f of [0,1]) {
        for(const side of [-1,1]) {
          const edge=side*(half+.17);
          t.quad(P(f,edge,0),P(f,side*(half+2.9),0),P(f,side*(half+2.9),3.22),P(f,edge,3.22),0xaaa999);
          batch.beam(P(f,edge,0),P(f,edge,3.19),.24,.24,0xc7c6b7);
        }
        batch.beam(P(f,-half-.25,3.02),P(f,half+.25,3.02),.33,.31,0xc4c4b7);
        for(const side of [-1,1]) {
          // Diamond-scored retaining stonework around the rectangular portal.
          for(let j=0;j<4;j++)for(let i=0;i<5;i++) {
            const v=side*(half+.39+i*.48),base=.20+j*.76;
            batch.beam(P(f,v,base),P(f,v+side*.32,base+.34),.025,.025,0x8c8f80);
            batch.beam(P(f,v+side*.32,base+.34),P(f,v,base+.69),.025,.025,0x8c8f80);
          }
        }
      }
    }
    if(p.bridge||stair) {
      for(const side of [-1,1]) {
        const offset=side*(half+.12), h=stair?.88:1.1;
        const nRails=Math.ceil(len/2.2);
        const railPoint=(u,height)=>{
          const pt=P(u,offset,height);
          if(stair)pt[1]=s.h0+(s.h1-s.h0)*(s.start+s.len*u)/s.length+margin+height;
          return pt;
        };
        for(let i=0;i<nRails;i++) {
          const f=i/nRails,g=(i+1)/nRails;
          const mid=P((f+g)*.5,offset);
          if(layout.atAccess(s,mid[0],mid[2],.35))continue;
          batch.beam(P(f,offset,.04),railPoint(f,h),.065,.065,0x697771,'post');
          batch.beam(railPoint(f,h),railPoint(g,h),.08,.08,0x718079,'post');
          if(p.bridge)batch.beam(P(f,offset,.58),P(g,offset,.58),.05,.05,0x78837d,'post');
        }
      }
      if(trafficBridge) {
        // Full underside and longitudinal steel girders are visible from the main gate.
        t.quad(P(0,-half,-.71),P(1,-half,-.71),P(1,half,-.71),P(0,half,-.71),0x909991);
        for(const v of [-.76,-.25,.25,.76]) {
          batch.beam(P(0,v*half,-1),P(1,v*half,-1),.29,.54,0x89968e);
          batch.beam(P(0,v*half,-1.25),P(1,v*half,-1.25),.7,.13,0x92a097);
        }
      }
    }
    if(!elevated && !stair && p.width>=3 && len>20 && p.id!=='osm-210335023') {
      for(let d=lampSpacing/2;d<len-4;d+=lampSpacing) {
        const base=P(d/len,half+.75), tip=[base[0],base[1]+4.2,base[2]];
        if(layout.covered(s,base[0],base[2]))continue;
        batch.beam(base,tip,.10,.10,0x717d7b,'trunk');
        const head=[tip[0]-.54*nx,tip[1]+.1,tip[2]-.54*nz];
        batch.beam(tip,head,.10,.10,0x737e7d);
        batch.put('box',0x858f8c,head[0],head[1],head[2],.37,.13,.37);
      }
    }
  }
  // Every approach terminates along an edge of the same junction polygon. The
  // subdivided fan shares its boundary vertices with the approach, including
  // points between the kerbs on wider carriageways.
  for(const arms of layout.junctions){
    const cx=arms.reduce((sum,a)=>sum+a.left[0],0)/arms.length;
    const cz=arms.reduce((sum,a)=>sum+a.left[1],0)/arms.length;
    const trim=outsideSquare&&arms.some(a=>plazaPath(a.seg.path))?outsideSquare:null;
    const stone=arms.every(a=>paved(a.seg.path)),surface=stone?(trim?.pavers??pavers):(trim?.asphalt??asphalt);
    const color=stone?0xb0b3af:0x767c7c;
    if(stone)orient(arms[0].seg.path);
    const rings=Math.max(1,...arms.map(a=>Math.ceil(Math.hypot(a.left[0]-cx,a.left[1]-cz)/1.15)));
    for(const arm of arms){
      const s=arm.seg,cols=widthSteps(s);
      function vertex(j,k){
        const side=s.half*(2*j/cols-1),[x,z]=layout.point(s,arm.end,side);
        const X=cx+(x-cx)*k/rings,Z=cz+(z-cz)*k/rings;
        return [X,pathHeight(s,arm.end,X,Z)+margin,Z];
      }
      for(let j=0;j<cols;j++){
        surface.tri(vertex(j,0),vertex(j,1),vertex(j+1,1),color);
        for(let k=1;k<rings;k++)
          surface.quad(vertex(j,k),vertex(j,k+1),vertex(j+1,k+1),vertex(j+1,k),color);
      }
    }
  }
  const roadMesh=asphalt.finish();
  if(roadMesh){roadMesh.name='Road asphalt and junctions';roadMesh.material.onBeforeCompile=asphaltFinish;}
  const blocks=pavers.finish();
  if(blocks)blocks.name='Road paving blocks';
}

// Split mapped polygons into short triangles so their pavement follows the surveyed surface.
function drape(T,t,polygon,color,lift,height=groundAt,maxEdge=4.7) {
  const shape=polygon.slice();
  if(shape.length>1&&shape[0][0]===shape.at(-1)[0]&&shape[0][1]===shape.at(-1)[1])shape.pop();
  const faces=T.ShapeUtils.triangulateShape(shape.map(p=>new T.Vector2(...p)),[]);
  const tri=(a,b,c)=>{
    const edges=[[a,b,c],[b,c,a],[c,a,b]];
    let best=edges[0],long=0;
    for(const edge of edges){const d=Math.hypot(edge[1][0]-edge[0][0],edge[1][1]-edge[0][1]);if(d>long){long=d;best=edge;}}
    if(long>maxEdge) {
      const [u,v,w]=best,m=[(u[0]+v[0])/2,(u[1]+v[1])/2];
      tri(u,m,w);tri(m,v,w);return;
    }
    const vert=p=>[p[0],height(...p)+lift,p[1]];
    t.tri(vert(a),vert(b),vert(c),color);
  };
  for(const face of faces)tri(...face.map(i=>shape[i]));
}

function siteSurfaces(T,group,areas,t,batch,pavers) {
  for(const area of areas) {
    const {polygon,kind}=area, box=boundsOf(polygon);
    if(area.id==='hall-plaza')continue; // Fitted to the cutout for the circular landing and stairs.
    if(kind==='water') {
      let min=Infinity;
      for(let x=box.left;x<=box.right;x+=3)for(let z=box.top;z<=box.bottom;z+=3) {
        if(inside([x,z],polygon))min=Math.min(min,groundAt(x,z));
      }
      const level=min+.40;
      lakes.push({...area,bounds:box,level});
      pondHabitat(T,group,area,box,batch,t,level);
    } else if(kind==='reservoir') {
      lakes.push({...area,bounds:box,level:Infinity});
      drape(T,t,polygon,0xa8b6af,.10);
      const [a,b,,d]=polygon;
      for(let i=1;i<9;i++) {
        const p=i/9,U=[a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p],V=[U[0]+d[0]-a[0],U[1]+d[1]-a[1]];
        batch.beam([U[0],groundAt(...U)+.12,U[1]],[V[0],groundAt(...V)+.12,V[1]],.16,.16,0x7c8e88);
      }
    } else if(kind==='pitch'||kind==='tennis'||kind==='sports') {
      const tennis=area.sport==='tennis'||kind==='tennis'||box.width<40&&box.depth<40;
      drape(T,t,polygon,tennis?0x779e85:0xc7ad83,.055);
      if(tennis)tennisCourt(polygon,t,batch);
    } else if(kind==='plaza'||kind==='parking') {
      pavers.orient(.71,.70);
      if(area.id==='station-forecourt') {
        drape(T,pavers,polygon,0xb5a294,0,(x,z)=>stationPlazaHeight(x,z,roadbedAt),.85);
      } else {
        drape(T,kind==='plaza'?pavers:t,polygon,kind==='parking'?0x909493:0xb4b5af,kind==='parking'?.041:.06,landscapedGroundAt,1.5);
      }
    }
  }
}

function tennisCourt(polygon,t,batch) {
  const p=polygon.slice(0,4);
  if(p.length!==4)return;
  if(Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1])>Math.hypot(p[2][0]-p[1][0],p[2][1]-p[1][1]))p.push(p.shift());
  const P=(u,v,h=0)=>{
    const x=(1-v)*(p[0][0]*(1-u)+p[1][0]*u)+v*(p[3][0]*(1-u)+p[2][0]*u);
    const z=(1-v)*(p[0][1]*(1-u)+p[1][1]*u)+v*(p[3][1]*(1-u)+p[2][1]*u);
    return [x,groundAt(x,z)+margin+h,z];
  };
  for(const u of [.01,.125,.50,.875,.99]) {
    const v=u===.5?.23:.01; t.quad(P(u-.003,v,.027),P(u+.003,v,.027),P(u+.003,1-v,.027),P(u-.003,1-v,.027),0xe2e6d6);
  }
  for(const v of [.01,.23,.77,.99]) {
    const u=v===.01||v===.99?.01:.125;
    t.quad(P(u,v-.002,.027),P(1-u,v-.002,.027),P(1-u,v+.002,.027),P(u,v+.002,.027),0xe2e6d6);
  }
  for(let i=0;i<=46;i++)batch.beam(P(i/46,.5,.06),P(i/46,.5,.91),.014,.014,0x4b5851);
  for(let h=.11;h<=1;h+=.15)batch.beam(P(0,.5,h),P(1,.5,h),.014,.014,0x58685d);
  batch.beam(P(0,.5,.94),P(1,.5,.94),.045,.05,0xdcded2);
  for(const u of [-.02,1.02])batch.beam(P(u,.5,0),P(u,.5,1.06),.08,.08,0x62746a,'post');
}

export function createLandscape(T,{buildings,paths,areas,landmarks}) {
  const group=new T.Group();group.name='Yokohama · outdoor landscape';
  const prepared=preparePaths([...paths,...approachRoads]);features=prepared.all;collisions=spatialIndex();lakes=[];
  const solid=(x,z,r)=>collisions.add({x,z,r},x-r-1,z-r-1,x+r+1,z+r+1);
  const t=triangleBatch(T,group),batch=geometryBatch(T,group),pavers=pavingBatch(T,group),shadows=plantShadows(T,group,landscapedGroundAt);
  const hallPolygon=areas.find(a=>a.id==='hall-plaza')?.polygon;
  const plazaHeight=(x,z)=>roadbedAt(x,z)+margin;
  hallPlaza=hallPolygon&&hallPlazaMesh(T,group,hallPolygon,terrainGrid.step/5,plazaHeight,gradedGroundAt,t);
  terrainMesh(T,group,areas,landscapedGroundAt,hallPlaza);
  hallPlaza?.finish();
  siteSurfaces(T,group,areas,t,batch,pavers);
  const terrace=triangleBatch(T,group);
  makePondTerrace(terrace,roadbedAt,(x,z)=>hallPolygon&&inside([x,z],hallPolygon)?hallPlaza.gradeAt(x,z):
    gridSurfaceAt(x,z,terrainGrid.step/5,landscapedGroundAt));
  terrace.finish().name='Central terrace · treads and landing';
  springValley(t,batch);
  roads(T,group,prepared.segments,t,batch,hallPolygon);
  hallGround(batch,t,solid,shadows,T,group);
  towerCourt(T,group,t,pavers,batch,solid,roadbedAt);
  landmarkFixtures(T,group,batch,t,landmarks,paths,solid,roadbedAt);
  stationContext(T,group,t,batch,solid,roadbedAt);
  makeLibraryGround(T,group,t,batch,roadbedAt);
  plantLandscape({areas,buildings,paths:features,segments:prepared.segments,landmarks,batch,solid,shadows,height:landscapedGroundAt});
  t.finish();batch.finish();pavers.finish();shadows.finish();
  return group;
}
