import { paths } from './groundsPaths.js';
import { terrainGrid, streetGridStep } from './terrain.js';
import { projectPoint } from '../yokohama/landscapeGeometry.js';
import { roadJoins } from '../yokohama/roadJoins.js';

const step=terrainGrid.step;
const cellKey=(x,z)=>x+2048*z;
const fine=new Set();

// Only refine the measured ground near at-grade paving. The outer cells of the
// band still sample the original DEM, so they meet untouched land at its height.
for(const path of paths){
  if(path.deck)continue;
  const radius=path.width/2+8+step*Math.SQRT1_2;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];
    const loX=Math.floor((Math.min(a[0],b[0])-radius)/step),hiX=Math.floor((Math.max(a[0],b[0])+radius)/step);
    const loZ=Math.floor((Math.min(a[1],b[1])-radius)/step),hiZ=Math.floor((Math.max(a[1],b[1])+radius)/step);
    for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
      if(projectPoint((x+.5)*step,(z+.5)*step,a,b).d<=radius)fine.add(cellKey(x,z));
    }
  }
}

export const roadCellDivisions=(x,z)=>fine.has(cellKey(Math.floor(x/step),Math.floor(z/step)))?step/streetGridStep:1;

function clip(points,distance){
  const ring=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);
    if(da>=0)ring.push(a);
    if((da<0&&db>0)||(da>0&&db<0)){
      const t=da/(da-db);
      ring.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
    }
  }
  return ring;
}

function tiles(points,spacing,visit){
  const xs=points.map(p=>p[0]),lo=Math.floor(Math.min(...xs)/spacing),hi=Math.ceil(Math.max(...xs)/spacing);
  for(let i=lo;i<hi;i++){
    const x=i*spacing;
    const strip=clip(clip(points,p=>p[0]-x),p=>x+spacing-p[0]);
    if(strip.length<3)continue;
    const zs=strip.map(p=>p[1]),low=Math.floor(Math.min(...zs)/spacing),high=Math.ceil(Math.max(...zs)/spacing);
    for(let j=low;j<high;j++){
      const z=j*spacing,ring=clip(clip(strip,p=>p[1]-z),p=>z+spacing-p[1]);
      if(ring.length>=3)visit(ring,x,z,spacing);
    }
  }
}

// Lay the city street onto the two actual DEM triangles in every intersected
// cell. Connecting only the two road edges cuts across ridges and buries paint.
function drapeStreet(points,sample,emit){
  function cell(ring,x,z,size){
    const nw=sample(x,z),sw=sample(x,z+size),ne=sample(x+size,z),se=sample(x+size,z+size);
    const diagonal=p=>(p[0]-x)-(p[1]-z);
    function surface(poly,north){
      const lifted=poly.map(([px,pz])=>{
        const u=(px-x)/size,v=(pz-z)/size;
        const h=north?nw*(1-u)+ne*(u-v)+se*v:nw*(1-v)+sw*(v-u)+se*u;
        return [px,h+.025,pz];
      });
      for(let j=1;j+1<lifted.length;j++)emit(lifted[0],lifted[j],lifted[j+1]);
    }
    surface(clip(ring,diagonal),true);
    surface(clip(ring,p=>-diagonal(p)),false);
  }
  tiles(points,step,(ring,x,z)=>{
    const n=roadCellDivisions(x,z);
    if(n===1)cell(ring,x,z,step);
    else tiles(ring,step/n,cell);
  });
}

export function addContextStreets(T,group,streets,campusPaths,roadbed){
  const knownWays=new Set(campusPaths.map(p=>String(p.osmId??p.id).match(/\d{6,}/)?.[0]).filter(Boolean));
  const segments=[],samples=new Map();
  for(const [id,width,points] of streets){
    if(knownWays.has(String(id)))continue;
    const path={id:'context-'+id,kind:'road',walkable:false};
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      if(len>.015)segments.push({path,a,b,nx:-dz/len,nz:dx/len,len,half:width/2});
    }
  }
  function sampleRoad(x,z){
    const key=x*4+z*4*16384;
    if(!samples.has(key))samples.set(key,roadbed(x,z));
    return samples.get(key);
  }
  const layout=roadJoins(segments),positions=[],indices=[],ids=new Map();
  function vertex(p){
    const key=Math.round(p[0]*1000)+Math.round(p[2]*1000)*5000000;
    if(ids.has(key))return ids.get(key);
    const id=positions.length/3;
    ids.set(key,id);positions.push(...p);
    return id;
  }
  function triangle(a,b,c){
    const up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    if(Math.abs(up)<1e-7)return;
    const i=vertex(a),j=vertex(b),k=vertex(c);
    if(up>0)indices.push(i,j,k);else indices.push(i,k,j);
  }
  for(const seg of segments){
    const reach=Math.min(.48,Math.max(1.5,seg.half*1.6)/seg.len),sections=[0,reach,1-reach,1];
    for(let j=1;j<sections.length;j++){
      const f=sections[j-1],g=sections[j],h=seg.half;
      drapeStreet([layout.point(seg,f,h),layout.point(seg,f,-h),layout.point(seg,g,-h),layout.point(seg,g,h)],sampleRoad,triangle);
    }
  }
  for(const arms of layout.junctions){
    const mid=arms[0].point;
    arms.forEach((arm,i)=>drapeStreet([mid,arm.left,arms[(i+1)%arms.length].left],sampleRoad,triangle));
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,new T.MeshLambertMaterial({color:0x969794}));
  mesh.name='御茶ノ水周辺の道路';mesh.receiveShadow=true;group.add(mesh);
}
