// The recessed outdoor landing. Each timber has a cut end, two exposed edges
// and a joint down to the subdeck. Coordinates are metres from the glazed wall.
import { pointInRing } from "./campus3dFeatures.js";

const replacements=[[1.7,5.3],[.7,6],[2.4,7.9],[1.5,7.3],[.05,5.7],[2.1,8.5],[.8,7.1],
  [.35,5.2],[1.9,8.3],[.5,6.2],[2.7,7.8],[.2,6.5],[1.1,7.2],[2.1,5.6]];
const tone=(c,g)=>c.map((v,i)=>i===3?v:v*g);
export function addCourtDeck(m,poly,z,normal,color,a,b,clip) {
  const dx=b[0]-a[0],dy=b[1]-a[1],az=Math.atan2(dy,dx)+22*Math.PI/180;
  const ux=Math.cos(az),uy=Math.sin(az);
  const toBoard=p=>[(p[0]-a[0])*ux+(p[1]-a[1])*uy,(p[1]-a[1])*ux-(p[0]-a[0])*uy];
  const world=([u,v])=>[a[0]+ux*u-uy*v,a[1]+uy*u+ux*v];
  const ring=poly.map(toBoard),along=ring.map(p=>p[0]),across=ring.map(p=>p[1]);
  const lo=Math.min(...along),hi=Math.max(...along),pitch=.144,gap=.004,drop=.028;
  const row0=Math.floor(Math.min(...across)/pitch),row1=Math.floor(Math.max(...across)/pitch);
  const dark=tone(color,.39);
  m.polygon([poly],p=>z(p)-drop,normal,dark);
  for (let row=row0;row<=row1;row++) {
    const offset=((row%3)+3)%3*1.18,rep=replacements[row-16];
    const ends=[lo-.1,hi+.1];
    for (let u=Math.floor((lo-offset)/3.55)*3.55+offset;u<hi;u+=3.55) if (u>lo) ends.push(u);
    if (rep) ends.push(...rep.filter(u=>u>lo && u<hi));
    ends.sort((x,y)=>x-y);
    for (let i=1;i<ends.length;i++) {
      const l=ends[i-1]+gap/2,r=ends[i]-gap/2,v=row*pitch+gap/2,w=(row+1)*pitch-gap/2;
      if (r-l<.02) continue;
      const board=[[l,v],[r,v],[r,w],[l,w]],pieces=clip.intersection([ring],[board]);
      const mid=(l+r)/2,pale=rep && mid>rep[0] && mid<rep[1];
      const grain=Math.sin(row*343+i*89)*.030+Math.cos(row*32+i*19)*.023;
      const top=tone(color,(pale?1.12:.90)+grain),edge=tone(top,.67);
      for (const piece of pieces) {
        const rings=piece.map(ring=>ring.slice(0,-1).map(world));
        if (rings[0].length<3) continue;
        m.polygon(rings,z,normal,top);
        for (const points of rings) for (let k=0;k<points.length;k++) {
          const p=points[k],q=points[(k+1)%points.length],x=q[0]-p[0],y=q[1]-p[1],len=Math.hypot(x,y);
          if (len<.0001) continue;
          m.quad([[p,z(p)-drop],[q,z(q)-drop],[q,z(q)],[p,z(p)]],[y/len,-x/len,0],edge);
        }
        const inside=([u,v])=>pointInRing(u,v,piece[0]) && !piece.slice(1).some(hole=>pointInRing(u,v,hole));
        const surface=(u,v,d)=>{const p=world([u,v]);return [p,z(p)+d];};
        // Shallow weathered fibres follow each timber and stop at its cut end.
        for (let strand=0;strand<5;strand++) {
          const phase=row*37+i*11+strand*2.1,midline=v+(w-v)*(.12+.19*strand);
          const count=Math.max(2,Math.ceil((r-l)/.25));
          let previous;
          for (let k=0;k<=count;k++) {
            const t=k/count,u=l+.012+(r-l-.024)*t;
            const vc=midline+.0036*Math.sin(3.8*u+phase)+.0018*Math.sin(6.4*u-phase);
            const thick=.0005+.0016*Math.sin(t*Math.PI)**2;
            const pair=[[u,vc-thick],[u,vc+thick]];
            if (previous && [...previous,...pair].every(inside)) {
              const corners=[previous[0],pair[0],pair[1],previous[1]];
              m.quad(corners.map(([x,y])=>surface(x,y,.0005)),normal,tone(top,strand%3===0?1.035:.93));
            }
            previous=pair;
          }
        }
        for (const u of [l+.035,r-.035]) for (const v0 of [v+.027,w-.027]) {
          if (!inside([u,v0]) || !inside([u+.005,v0+.005])) continue;
          const center=surface(u,v0,.0006);
          const head=Array.from({length:7},(_,k)=>surface(u+.0036*Math.cos(k*Math.PI/3),v0+.0036*Math.sin(k*Math.PI/3),.0007));
          for (let k=0;k<6;k++) for (const vtx of [center,head[k],head[k+1]]) m.vert(...vtx,normal,tone(top,.65));
        }
      }
    }
  }
}
