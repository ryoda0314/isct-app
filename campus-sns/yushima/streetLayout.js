import { paths } from './groundsPaths.js';
import { roadJoins } from '../yokohama/roadJoins.js';

// The garden floor and the two river bridges have their own surveyed surfaces.
// Crossings describe paint on the carriageway, not a separate strip of pavement.
export function hasStreetSurface(path) {
  return path.kind!=='crossing'&&path.deck!=='ochanomizu'&&path.deck!=='hijiri'&&
    path.id!=='osm-676718844'&&!path.id.startsWith('garden-');
}

export const roadSegments=paths.flatMap(path=>{
  const chain=[];
  let start=0;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const len=Math.hypot(dx,dz);
    if(len<.015)continue;
    chain.push({path,a,b,len,start,nx:-dz/len,nz:dx/len,half:path.width/2});
    start+=len;
  }
  for(const seg of chain)seg.length=start;
  return chain;
});

export const roadLayout=roadJoins(roadSegments,{
  hasMesh:hasStreetSurface,
  groupKey:p=>p.kind==='stairs'?p.id:'pavement',
  atGrade:p=>hasStreetSurface(p)&&!p.deck&&p.kind!=='stairs',
});
