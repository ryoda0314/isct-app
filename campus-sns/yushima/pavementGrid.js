// Slice each paved polygon (including holes) against the same terrain triangles.
// At a material boundary both materials then have exactly the same elevation,
// even if a tiny gate or junction introduces an extra vertex on just one side.
import { streetGridStep as step } from './terrain.js';
const snap=p=>[Math.round(p[0]*1e6)/1e6,Math.round(p[1]*1e6)/1e6];
function cut(points,value) {
  const result=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],va=value(a),vb=value(b);
    if(va>=0)result.push(a);
    if((va<0&&vb>0)||(vb<0&&va>0)){
      const f=va/(va-vb);
      result.push([a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]);
    }
  }
  return result;
}

export function pavementGrid(height){
  const levels=new Map();
  function knot(ix,iz){
    const key=ix+','+iz;
    if(!levels.has(key))levels.set(key,height(ix*step,iz*step));
    return levels.get(key);
  }
  function surface(x,z){
    const ix=Math.floor(x/step),iz=Math.floor(z/step),u=x/step-ix,v=z/step-iz;
    const a=knot(ix,iz),b=knot(ix+1,iz+1);
    if(u>v)return a*(1-u)+knot(ix+1,iz)*(u-v)+b*v;
    return a*(1-v)+knot(ix,iz+1)*(v-u)+b*u;
  }
  // Estimate the normal across neighbouring cells. The tiny clipped triangles
  // along a curb use the same lighting as the large asphalt triangles beside it.
  function normal(x,z){
    const dx=(surface(x+step,z)-surface(x-step,z))/(2*step);
    const dz=(surface(x,z+step)-surface(x,z-step))/(2*step);
    const scale=1/Math.hypot(dx,1,dz);
    return [-dx*scale,scale,-dz*scale];
  }
  function draw(shape,target,colour,lift=0){
    for(const polygon of shape){
      const divisions=new Set(),edges=[];
      for(const ring of polygon)for(let i=1;i<ring.length;i++){
        const a=snap(ring[i-1]),b=snap(ring[i]);
        divisions.add(a[1]);divisions.add(b[1]);
        if(a[1]===b[1])continue;
        edges.push({a,min:Math.min(a[1],b[1]),max:Math.max(a[1],b[1]),slope:(b[0]-a[0])/(b[1]-a[1])});
      }
      const zs=[...divisions],low=Math.min(...zs),high=Math.max(...zs);
      for(let k=Math.floor(low/step)+1;k*step<high;k++)divisions.add(k*step);
      const rows=[...divisions].sort((a,b)=>a-b);
      for(let i=1;i<rows.length;i++){
        const front=rows[i-1],back=rows[i],mid=(front+back)/2;
        if(back-front<1e-7)continue;
        const sections=[];
        for(const e of edges)if(e.min<mid&&mid<e.max){
          const x0=e.a[0]+(front-e.a[1])*e.slope,x1=e.a[0]+(back-e.a[1])*e.slope;
          sections.push([x0,x1]);
        }
        sections.sort((l,r)=>l[0]+l[1]-r[0]-r[1]);
        for(let j=1;j<sections.length;j+=2){
          const [l,L]=sections[j-1],[r,R]=sections[j];
          const band=[[l,front],[L,back],[R,back],[r,front]];
          const xMin=Math.min(l,L),xMax=Math.max(r,R),row=Math.floor(mid/step);
          for(let ix=Math.floor(xMin/step);ix*step<xMax;ix++){
            const left=ix*step,right=left+step;
            const cell=cut(cut(band,p=>p[0]-left),p=>right-p[0]);
            const side=p=>p[1]-row*step-(p[0]-left);
            for(const sign of [1,-1]){
              const pts=cut(cell,p=>sign*side(p));
              if(pts.length<3)continue;
              const vertices=pts.map(([x,z])=>[x,surface(x,z)+lift,z]);
              for(let k=2;k<vertices.length;k++){
                const a=vertices[0],b=vertices[k-1],c=vertices[k];
                if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))>1e-8)target.tri(a,b,c,colour);
              }
            }
          }
        }
      }
    }
  }
  return {draw,surface,normal};
}

// Straight survey edges cut the same grid thousands of times. Share the
// float32 vertices at each cut, while preserving colours and masonry axes.
export function pavementBatch(T,group,material,normal,masonry=false){
  const pos=[],normals=[],colors=[],uv=[],indices=[],lookup=new Map(),col=new T.Color();
  let axis=[1,0];
  function vertex([x,y,z],color){
    const key=[Math.round(x*1e5),Math.round(y*1e5),Math.round(z*1e5),color].join(',');
    if(lookup.has(key))return lookup.get(key);
    const id=pos.length/3;
    lookup.set(key,id);pos.push(Math.fround(x),Math.fround(y),Math.fround(z));normals.push(...normal(x,z));
    colors.push(col.r,col.g,col.b);
    if(masonry)uv.push(axis[0]*x+axis[1]*z,-axis[1]*x+axis[0]*z);
    return id;
  }
  function tri(a,b,c,color){
    col.setHex(color);
    const i=vertex(a,color),j=vertex(b,color),k=vertex(c,color);
    const x=pos[i*3],z=pos[i*3+2];
    const area=(pos[j*3]-x)*(pos[k*3+2]-z)-(pos[j*3+2]-z)*(pos[k*3]-x);
    if(area!==0)indices.push(i,j,k);
  }
  function finish(name){
    const g=new T.BufferGeometry();
    for(const [key,values,size] of [['position',pos,3],['normal',normals,3],['color',colors,3],['uv',uv,2]]){
      if(values.length)g.setAttribute(key,new T.Float32BufferAttribute(values,size));
    }
    g.setIndex(indices);
    const mesh=new T.Mesh(g,material);
    mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
    return mesh;
  }
  function orient(x,z){
    const len=Math.hypot(x,z)||1;axis=[x/len,z/len];
  }
  return {tri,finish,orient};
}
