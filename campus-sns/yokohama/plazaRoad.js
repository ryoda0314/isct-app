import polygonClipping from 'polygon-clipping';
import { boundsOf, inside } from './navigation.js';

export function triangulatePlan(T,polygons) {
  const result=[];
  for(const polygon of polygons){
    const rings=polygon.map(r=>r.slice(0,-1));
    const vertices=rings.flat(),vectors=rings.map(r=>r.map(([x,z])=>new T.Vector2(x,z)));
    for(const [a,b,c] of T.ShapeUtils.triangulateShape(vectors[0],vectors.slice(1))) {
      // Earcut's positive winding in the map plane points down in Three's XZ plane.
      result.push([vertices[a],vertices[c],vertices[b]]);
    }
  }
  return result;
}

// A walkway changes into open paving as it enters the hall square. Clip the
// emitted triangles in plan, including the narrow kerb top. An upright kerb
// face projects to a line, so its visible runs are split at boundary crossings.
export function outsidePlaza(T,plaza,terrace){
  const mask=polygonClipping.union([plaza],[terrace]),rings=mask.flat();
  const box=boundsOf(rings.flat()),plan=p=>[p[0],p[2]];
  const between=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
  const beyond=pts=>pts.every(p=>p[0]<box.left)||pts.every(p=>p[0]>box.right)||
    pts.every(p=>p[2]<box.top)||pts.every(p=>p[2]>box.bottom);
  function visibleRuns(a,b){
    const dx=b[0]-a[0],dz=b[2]-a[2],cuts=[0,1],length2=dx*dx+dz*dz;
    if(length2<1e-14)return [];
    const add=u=>{if(u>0&&u<1)cuts.push(u);};
    for(const ring of rings)for(let j=1;j<ring.length;j++){
      const p=ring[j-1],q=ring[j],ex=q[0]-p[0],ez=q[1]-p[1],px=p[0]-a[0],pz=p[1]-a[2];
      const det=dx*ez-dz*ex;
      if(Math.abs(det)<1e-11){
        if(Math.abs(px*dz-pz*dx)<1e-9){
          add((px*dx+pz*dz)/length2);add(((px+ex)*dx+(pz+ez)*dz)/length2);
        }
      }else{
        const edge=(px*dz-pz*dx)/det;
        if(edge>=0&&edge<=1)add((px*ez-pz*ex)/det);
      }
    }
    cuts.sort((x,y)=>x-y);
    const runs=[];
    for(let j=1;j<cuts.length;j++){
      const f=cuts[j-1],g=cuts[j];
      if(g-f<1e-8)continue;
      const mid=[a[0]+(f+g)*.5*dx,a[2]+(f+g)*.5*dz];
      if(!mask.some(([outer,...holes])=>inside(mid,outer)&&!holes.some(h=>inside(mid,h))))runs.push([f,g]);
    }
    return runs;
  }
  return function clipBatch(target){
    function tri(a,b,c,color){
      if(beyond([a,b,c]))return target.tri(a,b,c,color);
      const ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2],det=ux*vz-uz*vx;
      if(Math.abs(det)<1e-12)return;
      const pieces=polygonClipping.difference([[plan(a),plan(b),plan(c)]],mask);
      for(const projected of triangulatePlan(T,pieces)){
        const triangle=projected.map(([X,Z])=>{
          const x=X-a[0],z=Z-a[2],u=(x*vz-z*vx)/det,v=(ux*z-uz*x)/det;
          return [X,a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]),Z];
        });
        if(det>0)triangle.reverse();
        target.tri(...triangle,color);
      }
    }
    function quad(a,b,c,d,color){
      if(beyond([a,b,c,d]))return target.quad(a,b,c,d,color);
      if(a[0]===d[0]&&a[2]===d[2]&&b[0]===c[0]&&b[2]===c[2]){
        for(const [f,g] of visibleRuns(a,b))
          target.quad(between(a,b,f),between(a,b,g),between(d,c,g),between(d,c,f),color);
      }else{tri(a,b,c,color);tri(a,c,d,color);}
    }
    return {tri,quad};
  };
}
