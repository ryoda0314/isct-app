import { shallowWater } from './groundsDetails.js';
import { groundHeight, buildings, boundary } from './data.js';
import { terrainGrid } from './terrain.js';
import { roadCellDivisions } from './streetTerrain.js';
import { clinicalForecourt } from './clinicalForecourt.js';
import { drawStreets } from './roadPaving.js';
import { inside, boundsOf, interpolate } from '../yokohama/navigation.js';
import { geometryBatch, triangleBatch, pavingBatch, naturalMaterial, projectPoint, rng } from '../yokohama/landscapeGeometry.js';
import { areas } from './groundsPaths.js';
import { northBank,southBank,streetTrees,treeRows } from './groundsSurvey.js';
import { waterLevel, bridgeSpecs, addBlocker, resetBlockers, onWalkway, roadTerrainHeight } from './groundsLevels.js';
import { garden, gateFurniture, bridges, station } from './groundsStructures.js';

export { paths, landmarks, approaches, areas } from './groundsPaths.js';
export { walkingSurfaceAt, hitsLandscape } from './groundsLevels.js';

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const railBedLevel=groundHeight(73,244)-.35;
const cuttingWeight=x=>Math.max(0,Math.min(1,(x+194)/29,(204-x)/36));
const cuttingWidth=(x,side)=>(side===-1?17:34)*cuttingWeight(x);
function terrain(T,group) {
  const ticks=(lo,hi,step)=>Array.from({length:Math.round((hi-lo)/step)},(_,i)=>lo+i*step);
  // Clip the DEM triangles against the two river banks. A terrain triangle over
  // an entire shoreline cell otherwise hides parts of the narrow channel.
  const xs=[...ticks(-1100,-305,15),...ticks(terrainGrid.xMin,terrainGrid.xMin+terrainGrid.step*terrainGrid.width,terrainGrid.step),...ticks(315,1110,15)];
  const zs=[-1100,-850,-660,-530,-400,-320,...ticks(-300,430,terrainGrid.step),460,520,595,690,850,1100];
  const positions=[],colors=[],index=[],c=new T.Color(),shared=new Map();
  function shorelineAt(row,x) {
    for(let i=1;i<row.length;i++){
      const a=row[i-1],b=row[i];
      if(a[0]<=x&&b[0]>=x&&b[0]!==a[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
    }
    return null;
  }
  // Here the terrain model averages the bank and tracks into one slope. Cut
  // back to the measured bank corridor so the modelled retaining walls show.
  const sections=xs.map(x=>[shorelineAt(northBank,x)-cuttingWidth(x,-1),shorelineAt(southBank,x)+cuttingWidth(x,1)]);
  function vertex(x,z){
    const key=x+','+z;
    if(shared.has(key))return shared.get(key);
    const id=positions.length/3;
    positions.push(x,roadTerrainHeight(x,z)-.035,z);
    c.setHex(inside([x,z],boundary)?0xb5b2a7:0xb8b5a9);
    c.multiplyScalar(.974+.017*Math.sin(x*.117+z*.092)+.012*Math.cos(x*.03-z*.086));
    colors.push(c.r,c.g,c.b);
    shared.set(key,id);return id;
  }
  // Sign of the distance to the bank at each vertex determines its half-plane.
  function cutFace(face,bank,leftX,rightX,sign) {
    const poly=[];
    const side=v=>{
      const f=(positions[v*3]-leftX)/(rightX-leftX);
      return sign*(positions[v*3+2]-bank[0]-(bank[1]-bank[0])*f);
    };
    for(let k=0;k<3;k++){
      const a=face[k],b=face[(k+1)%3],da=side(a),db=side(b);
      if(da>=0)poly.push(a);
      if((da>0&&db<0)||(da<0&&db>0)) {
        const t=da/(da-db),x=positions[a*3]+(positions[b*3]-positions[a*3])*t,z=positions[a*3+2]+(positions[b*3+2]-positions[a*3+2])*t;
        poly.push(vertex(x,z));
      }
    }
    for(let j=1;j+1<poly.length;j++)index.push(poly[0],poly[j],poly[j+1]);
  }
  function cell(x,z,right,bottom,north,south){
    if(z>=Math.max(...north)&&bottom<=Math.min(...south))return;
    const a=vertex(x,z),b=vertex(x,bottom),c=vertex(right,bottom),d=vertex(right,z);
    if(bottom<=Math.min(...north)||z>=Math.max(...south)){index.push(a,b,c,a,c,d);return;}
    for(const face of [[a,b,c],[a,c,d]]){
      cutFace(face,north,x,right,-1);cutFace(face,south,x,right,1);
    }
  }
  for(let i=0;i<xs.length-1;i++){
    const bank=(side,f)=>sections[i][side]+(sections[i+1][side]-sections[i][side])*f;
    for(let j=0;j<zs.length-1;j++){
      const x=xs[i],z=zs[j],n=roadCellDivisions(x,z),dx=(xs[i+1]-x)/n,dz=(zs[j+1]-z)/n;
      for(let cx=0;cx<n;cx++){
        const north=[bank(0,cx/n),bank(0,(cx+1)/n)],south=[bank(1,cx/n),bank(1,(cx+1)/n)];
        for(let cz=0;cz<n;cz++)cell(x+cx*dx,z+cz*dz,x+(cx+1)*dx,z+(cz+1)*dz,north,south);
      }
    }
  }
  const geo=new T.BufferGeometry();geo.setIndex(index);
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,naturalMaterial(T,'ground'));mesh.receiveShadow=true;mesh.name='湯島のDEM地形';group.add(mesh);
}
function riverCutting(t,batch,a,b,side,rand) {
  const steps=Math.max(1,Math.ceil(dist(a,b)/2.6));
  function section(f,across) {
    const x=a[0]+(b[0]-a[0])*f,z=a[1]+(b[1]-a[1])*f;
    const width=cuttingWidth(x,side),weight=cuttingWeight(x);
    const offset=across*(width+.75),v=z+side*offset;
    const dem=roadTerrainHeight(x,v);
    if(across>=1)return [x,dem-.035,v];
    if(side===1){
      const nearEdge=offset<.5;
      const h=nearEdge?waterLevel+.22:railBedLevel-.1;
      const blend=Math.min(1,Math.max(0,(1-across)*18));
      return [x,dem+(h-dem)*weight*blend,v];
    }
    // A stone toe and shelf separate the earth slope from the river.
    const crown=roadTerrainHeight(x,z+side*width);
    const embankment=across<.13?waterLevel+.12+across/.13*1.35:
      waterLevel+1.48+(Math.max(crown,waterLevel+2)-waterLevel-1.48)*Math.pow((across-.13)/.87,1.12);
    return [x,dem+(embankment-dem)*weight+.04,v];
  }
  for(let j=0;j<steps;j++){
    const u=j/steps,v=(j+1)/steps,m=(u+v)/2;
    if(side===1) {
      const base=f=>{const p=section(f,0);return [p[0],waterLevel-.28,p[2]];};
      const top=f=>section(f,.055);
      const A=top(u),B=top(v),dark=j%7===0?0x5b605c:0x666d65;
      t.quad(base(u),base(v),B,A,dark);
      t.quad(A,B,section(v,.082),section(u,.082),0x96978b);
      batch.beam(A,[A[0],waterLevel+.05,A[2]],.08,.08,0x7d8279);
      for(let k=1;k<=4;k++){
        const a0=base(u),b0=base(v);a0[1]+=(A[1]-a0[1])*k/5;b0[1]+=(B[1]-b0[1])*k/5;
        batch.beam(a0,b0,.035,.032,0x82857b);
      }
      for(let rib=0;rib<4;rib++){
        const f=u+(v-u)*(rib+.5)/4,a0=base(f),a1=top(f);
        batch.beam(a0,a1,.075,.068,0x727a6c);
      }
      for(const [i,k,c] of [[.082,.27,0x828474],[.27,.93,0x7b7970],[.93,1,0x9e9b8e]])
        t.quad(section(u,i),section(v,i),section(v,k),section(u,k),c);
    } else {
      const A=section(u,0),B=section(v,0);
      t.quad(A,B,[B[0],waterLevel-.36,B[2]],[A[0],waterLevel-.36,A[2]],0x626c60);
      for(const [i,k,c] of [[0,.13,0x85877b],[.13,.32,0x64774e],[.32,.63,0x657953],[.63,.85,0x687852],[.85,1,0x7c8968]]) {
        t.quad(section(u,i),section(v,i),section(v,k),section(u,k),c);
      }
      if(cuttingWeight(a[0])<.72)continue;
      for(const across of [.29,.63,.86]) {
        const p=section(m,across+(rand()-.5)*.08),size=1.5+rand();
        const color=rand()>.40?0x637e53:0x748c5e,sy=.48+across*.72+rand()*.29;
        batch.put('leaf',color,p[0],p[1]+.12,p[2],size,sy,size*.70,rand()*3);
        batch.put('canopyFar',color,p[0],p[1]+.12,p[2],size,sy,size*.70);
      }
      if(j%3===1){
        const p=section(m,.70),h=5.8+rand()*3.2;
        if(Object.values(bridgeSpecs).some(b=>projectPoint(p[0],p[2],b.start,b.end).d<b.width/2+2))continue;
        const color=rand()>.5?0x63804f:0x5e7752;
        for(const [dx,dz,dy] of [[-.9,.15,0],[1,.38,.06],[.15,-.8,.31]]){
          const tip=[p[0]+dx,p[1]+h*(.71+dy),p[2]+dz];
          batch.beam(p,tip,.15,.1,0x70695a,'trunk');
          batch.put('leaf',color,...tip,2.00,2.25,1.84,rand()*3);
        }
        batch.beam(p,[p[0],p[1]+h*.76,p[2]],.18,.16,0x70695a,'stemFar');
        batch.put('canopyFar',color,p[0],p[1]+h*.83,p[2],2.65,2.59,2.65);
      }
    }
  }
}
function riverside(T,group,t,batch) {
  shallowWater(T,group,areas[0].polygon,waterLevel);
  const rand=rng(93117);
  for(const [row,side] of [[northBank,-1],[southBank,1]])for(let i=1;i<row.length;i++){
    const a=row[i-1],b=row[i],length=dist(a,b),normal=[-(b[1]-a[1])/length*side,(b[0]-a[0])/length*side];
    if(cuttingWeight(a[0])>0||cuttingWeight(b[0])>0){riverCutting(t,batch,a,b,side,rand);continue;}
    const at=(f,offset,level)=>{const p=interpolate(a,b,f);return [p[0]+normal[0]*offset,level,p[1]+normal[1]*offset];};
    const w=side===-1?3.7:2.2;
    const y=p=>Math.max(waterLevel+1.6,groundHeight(p[0]+normal[0]*w,p[1]+normal[1]*w)-.3);
    const ya=y(a),yb=y(b),lip=.20;
    t.quad(at(0,-.27,waterLevel-.50),at(1,-.27,waterLevel-.50),at(1,w,yb),at(0,w,ya),side===1?0x777b72:0x879083);
    t.quad(at(0,w,ya),at(1,w,yb),at(1,w+.54,yb+lip),at(0,w+.54,ya+lip),0x92978b);
    for(let h=1.05;h<Math.min(ya,yb)-waterLevel-.2;h+=1.03) {
      const frac=h/Math.max(ya-waterLevel,1.65);
      batch.beam(at(0,-.30+frac*w,waterLevel+h),at(1,-.30+frac*w,waterLevel+h),.055,.065,0x7c8076);
    }
    if(i%3===0 && length>4) {
      const p=at(.5,-2.8,waterLevel+.016);
      t.quad(p,[p[0]+1.8,p[1],p[2]+.12],[p[0]+2.35,p[1],p[2]+.27],[p[0]+.21,p[1],p[2]+.13],0x7b9791);
    }
  }
}
function plants(batch) {
  const rand=rng(76219),wood=0x756651,pal=[0x76905c,0x829663,0x687f59,0x8a9c67,0x778d64];
  const planted=[],boxes=buildings.map(b=>({bounds:boundsOf(b.footprint),ring:b.footprint}));
  function tree(x,z,y,height){
    const r=height*.29,crown=y+height*.70,clr=pal[Math.floor(rand()*pal.length)];
    const floor=[x,y,z],fork=[x,y+height*.48,z];
    batch.beam(floor,fork,height*.05,height*.049,wood,'trunk');
    batch.beam(floor,[x,y+height*.64,z],height*.044,height*.044,wood,'stemFar');
    for(let j=0;j<6;j++){
      const a=j*2.39996+rand()*.72,reach=.36+rand()*.42;
      const dx=Math.cos(a)*reach*r,dz=Math.sin(a)*reach*r,cy=crown+(rand()-.38)*r;
      const tip=[x+dx,cy,z+dz];
      batch.beam(fork,[tip[0],cy-.57*r,tip[2]],height*.025,height*.024,wood,'trunk');
      batch.put('leaf',clr,...tip,r*(.56+rand()*.26),r*(.69+rand()*.37),r*(.53+rand()*.27),a);
      batch.put('shoot',clr,tip[0]+dx*.43,cy,tip[2]+dz*.43,.60,.55,.64,a);
    }
    batch.put('canopyFar',clr,x,crown+.10*r,z,r*1.12,r*1.24,r*1.05);
    addBlocker([x,z],[x,z],height*.022);
  }
  function landscapeTree(x,z,h){
    if(planted.some(p=>dist(p,[x,z])<4.2)||onWalkway(x,z,.12)||boxes.some(b=>x>=b.bounds.left&&x<=b.bounds.right&&z>=b.bounds.top&&z<=b.bounds.bottom&&inside([x,z],b.ring)))return;
    planted.push([x,z]);tree(x,z,roadTerrainHeight(x,z),h);
  }
  for(const [x,z] of streetTrees)landscapeTree(x,z,6.2+rand()*2.9);
  const rows=[...treeRows,[[-85,-135],[-58,-113],[-8,-73],[43,-33]],[[-162,18],[-127,70],[-115,79],[-75,95]],[[-19,120],[31,139],[66,153]],[[13,136],[59,153],[78,160]]];
  for(const row of rows)for(let i=1;i<row.length;i++){
    const a=row[i-1],b=row[i],n=Math.ceil(dist(a,b)/10.2);
    for(let k=0;k<n;k++){const p=interpolate(a,b,(k+.36)/n);landscapeTree(...p,5.5+rand()*2.7);}
  }
  landscapeTree(42.59,21.61,6.3);
  return tree;
}
function furniture(batch) {
  // Mast arms and luminous signal heads at the campus/bridge intersection.
  for(const [x,z,angle] of [[-82.9,95.8,.4],[-91.1,114.6,3.55],[-51.15,133.1,2.1],[120,26,.65],[-89,-138,2.25]]){
    const y=roadTerrainHeight(x,z),d=[Math.cos(angle),Math.sin(angle)];
    addBlocker([x,z],[x,z],.09);
    batch.beam([x,y,z],[x,y+5.05,z],.18,.18,0x8b928d,'post');
    const tip=[x+d[0]*3.4,y+5.1,z+d[1]*3.4];batch.beam([x,y+5,z],tip,.09,.11,0x919994);
    batch.put('box',0x484e4e,...tip,1.14,.37,.19,-angle);
    for(let j=0;j<3;j++)batch.put('round',[0x66ada1,0x877e5e,0x956559][j],tip[0]+d[0]*(j-1)*.31-d[1]*.1,tip[1],tip[2]+d[1]*(j-1)*.31+d[0]*.1,.12,.12,.09,-angle);
  }
  for(const [x,z] of [[-61,99],[-114,78],[-150,24],[-107,-103],[-28,-94],[38,-39],[117,25],[101,95],[56,152],[5,132]]){
    const y=roadTerrainHeight(x,z);batch.beam([x,y,z],[x,y+5.4,z],.13,.12,0x797f7b,'post');
    addBlocker([x,z],[x,z],.065);
    batch.put('box',0x8b928a,x+.34,y+5.43,z,.82,.15,.28);batch.put('box',0xe5e4cf,x+.52,y+5.34,z,.44,.04,.23);
  }
}
export function createGrounds(T){
  resetBlockers();
  const group=new T.Group();group.name='神田川・湯島キャンパスの外構';
  const t=triangleBatch(T,group),batch=geometryBatch(T,group),pavers=pavingBatch(T,group);
  terrain(T,group);riverside(T,group,t,batch);drawStreets(T,group,t,batch,pavers);
  const tree=plants(batch);clinicalForecourt(t,batch,tree);
  garden(T,group,t,batch,pavers);bridges(T,group,t,batch,pavers);station(T,group,t,batch);
  gateFurniture(T,group,batch);furniture(batch);
  t.finish();batch.finish();pavers.finish();return group;
}



