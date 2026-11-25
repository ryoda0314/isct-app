import clip from 'polygon-clipping';
import { boundsOf, inside } from './navigation.js';
import { pavingBatch, projectPoint } from './landscapeGeometry.js';
import { pondTerraceOutline } from './pondTerrace.js';
import { triangulatePlan } from './plazaRoad.js';
import { gridSurfaceAt } from './roadTerrain.js';

// Worn ground below the tree canopy blends into the grass at the timber deck.
export function terraceSoil(x,z) {
  const dx=x-13.8,dz=z+139.2;
  if(Math.abs(dx)>12||Math.abs(dz)>12)return 0;
  const across=(.78*dx+.62*dz)/4.5,along=(.62*dx-.78*dz)/9;
  const radius=Math.hypot(across,along)+.06*Math.sin(x*1.7+z*.4);
  const t=Math.max(0,Math.min(1,(1.35-radius)/.72));
  return .89*t*t*(3-2*t);
}

// The plaza and the circular seating cut into the same hillside. Partition the
// terrain's metre grid in plan so grass, stone and treads meet at real edges.
function region(rings,spacing) {
  const borders=new Set();
  for(const polygon of rings)for(const ring of polygon) {
    for(let i=1;i<ring.length;i++) {
      const a=ring[i-1],b=ring[i];
      const left=Math.floor(Math.min(a[0],b[0])/spacing),right=Math.floor(Math.max(a[0],b[0])/spacing);
      const top=Math.floor(Math.min(a[1],b[1])/spacing),bottom=Math.floor(Math.max(a[1],b[1])/spacing);
      for(let j=top;j<=bottom;j++)for(let k=left;k<=right;k++) {
        if(projectPoint((k+.5)*spacing,(j+.5)*spacing,a,b).d<=spacing*Math.SQRT1_2+1e-9)borders.add(k+','+j);
      }
    }
  }
  return {rings,borders,contains:p=>rings.some(([shell,...holes])=>inside(p,shell)&&!holes.some(h=>inside(p,h)))};
}

export function hallPlazaMesh(T,group,polygon,spacing,height,substrate,edges) {
  const stone=region(clip.difference([polygon],[pondTerraceOutline]),spacing);
  const occupied=region(clip.union([polygon],[pondTerraceOutline]),spacing);
  const bounds=boundsOf([...polygon,...pondTerraceOutline]);
  const batch=pavingBatch(T,group),colour=0xb4b5af;
  batch.orient(.71,.70);
  // Clip already graded triangles. Re-sampling the DEM at the three corners
  // of a newly cut sliver can turn a tiny height difference into a vertical spike.
  const gradeAt=(x,z)=>gridSurfaceAt(x,z,spacing,height);
  const surface=([x,z])=>[x,gradeAt(x,z),z];
  const within=(x,z,size)=>x<bounds.right&&x+size>bounds.left&&z<bounds.bottom&&z+size>bounds.top;
  function vergeHeight(x,z,soil) {
    const reach=3.2;
    if(x<bounds.left-reach||x>bounds.right+reach||z<bounds.top-reach||z>bounds.bottom+reach)return soil;
    let nearest=reach;
    for(let i=0;i<polygon.length;i++)nearest=Math.min(nearest,projectPoint(x,z,polygon[i],polygon[(i+1)%polygon.length]).d);
    if(nearest>=reach)return soil;
    // All vertices of a cut metre cell follow the paving within one diagonal
    // of its edge. The bank therefore meets it with a uniform 3 cm edging.
    const t=Math.max(0,(nearest-spacing*Math.SQRT2)/(reach-spacing*Math.SQRT2));
    const edge=height(x,z)-.03;
    return edge+(soil-edge)*t*t*(3-2*t);
  }

  // Close the exposed thickness to the soil. Split at the same grid lines as
  // the paving so the top of the edging follows its actual boundary segments.
  for(const piece of stone.rings)for(const border of piece)for(let i=1;i<border.length;i++){
    const a=border[i-1],b=border[i],cuts=[0,1];
    // Terrace retaining walls close the excavation on this side.
    if(!polygon.some((p,j)=>projectPoint((a[0]+b[0])*.5,(a[1]+b[1])*.5,p,polygon[(j+1)%polygon.length]).d<1e-7))continue;
    for(const axis of [0,1]){
      const lo=Math.min(a[axis],b[axis]),hi=Math.max(a[axis],b[axis]);
      for(let v=(Math.floor(lo/spacing)+1)*spacing;v<hi;v+=spacing)cuts.push((v-a[axis])/(b[axis]-a[axis]));
    }
    cuts.sort((u,v)=>u-v);
    const edgeAt=f=>surface([a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]);
    let A=edgeAt(0);
    for(let j=1;j<cuts.length;j++){
      if(cuts[j]-cuts[j-1]<1e-7)continue;
      const B=edgeAt(cuts[j]);
      const base=([x,y,z])=>[x,Math.min(y,vergeHeight(x,z,substrate(x,z)))-.04,z];
      edges.quad(A,B,base(B),base(A),0x999a92);A=B;
    }
  }
  return {
    within,vergeHeight,
    gradeAt,
    // null keeps the existing ground quad, [] is a completely open excavation.
    cell(x,z){
      if(!within(x,z,spacing))return null;
      const key=Math.floor(x/spacing)+','+Math.floor(z/spacing),center=[x+spacing/2,z+spacing/2];
      const a=[x,z],b=[x,z+spacing],c=[x+spacing,z+spacing],d=[x+spacing,z],parents=[[a,b,c],[a,c,d]];
      const faces=stone.borders.has(key)?parents.flatMap(tri=>triangulatePlan(T,clip.intersection([tri],stone.rings))):
        stone.contains(center)?parents:[];
      for(const tri of faces)batch.tri(...tri.map(surface),colour);
      if(occupied.borders.has(key))return parents.flatMap(tri=>triangulatePlan(T,clip.difference([tri],occupied.rings)));
      return occupied.contains(center)?[]:null;
    },
    floor(x,z){return within(x,z,0)&&stone.contains([x,z])?gradeAt(x,z):null;},
    finish(){const mesh=batch.finish();if(mesh)mesh.name='H1 · plaza paving';}
  };
}
