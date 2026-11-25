import * as THREE from "three";

export const C = {
  wall: 0xbfc4c2, warm: 0xc0bbb2, pale: 0xd3d6d1, white: 0xe4e5de, base: 0x93948b,
  concrete: 0xa5aaa5, dark: 0x434d50, metal: 0xa6b1b1, silver: 0xc9d0ca,
  roof: 0x949e9c, frame: 0x7e8989, glass: 0x637f85, glassDark: 0x445d65,
};
const Y = new THREE.Vector3(0,1,0);
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
const position = new THREE.Vector3(), scale = new THREE.Vector3();
const tint = new THREE.Color();
const area = ring => ring.reduce((s,a,i) => {
  const b = ring[(i+1)%ring.length];
  return s+a[0]*b[1]-b[0]*a[1];
},0)*.5;
export const at = (e,t,out=0) => [e.a[0]+e.dx*t+e.nx*out,e.a[1]+e.dz*t+e.nz*out];
export function edges(ring) {
  const sign = area(ring)>0?1:-1;
  return ring.map((a,i)=>{
    const b = ring[(i+1)%ring.length], length = Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx = (b[0]-a[0])/(length||1), dz = (b[1]-a[1])/(length||1);
    return {a,b,dx,dz,nx:dz*sign,nz:-dx*sign,length,yaw:-Math.atan2(dz,dx)};
  }).filter(e=>e.length>.07);
}
export function orientedFrame(ring) {
  let best;
  for (const e of edges(ring)) {
    const bounds=[Infinity,Infinity,-Infinity,-Infinity];
    for (const [x,z] of ring) {
      const u=x*e.dx+z*e.dz,v=-x*e.dz+z*e.dx;
      bounds[0]=Math.min(bounds[0],u);bounds[2]=Math.max(bounds[2],u);
      bounds[1]=Math.min(bounds[1],v);bounds[3]=Math.max(bounds[3],v);
    }
    const [u0,v0,u1,v1]=bounds,w=u1-u0,d=v1-v0;
    if (best && best.area<=w*d) continue;
    const cx=e.dx*(u0+u1)/2-e.dz*(v0+v1)/2,cz=e.dz*(u0+u1)/2+e.dx*(v0+v1)/2;
    const ux=w>=d?e.dx:-e.dz,uz=w>=d?e.dz:e.dx;
    best={cx,cz,ux,uz,width:Math.max(w,d),depth:Math.min(w,d),area:w*d,
      point:(u,v)=>[cx+ux*u-uz*v,cz+uz*u+ux*v],yaw:-Math.atan2(uz,ux)};
  }
  return best;
}
export function nearestEdge(ring,point,minLength=2.4) {
  let nearest, best=Infinity;
  for(const e of edges(ring)){
    if(e.length<minLength)continue;
    const run=THREE.MathUtils.clamp((point[0]-e.a[0])*e.dx+(point[1]-e.a[1])*e.dz,0,e.length);
    const pos=at(e,run),dist=Math.hypot(pos[0]-point[0],pos[1]-point[1]);
    if(dist<best){nearest={edge:e,t:run};best=dist;}
  }
  return nearest;
}
export const rectangle = (point,x0,z0,x1,z1) =>
  [point(x0,z0),point(x1,z0),point(x1,z1),point(x0,z1)];

export function geometryResources() {
  // Architectural glass reflects an analytic sky gradient. No environment
  // maps or facade imagery are loaded, and reflections move with the viewer.
  const glazing=new THREE.MeshStandardMaterial({roughness:.26,metalness:.07});
  glazing.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>", `
      vec3 skyRay = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
      float upward = smoothstep(-0.08, 0.70, skyRay.y);
      float sheen = 0.16 + 0.55 * pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 3.0);
      vec3 horizon = mix(vec3(0.12,0.17,0.14), vec3(0.48,0.63,0.68), smoothstep(-0.16,0.09,skyRay.y));
      outgoingLight = mix(outgoingLight, mix(horizon, vec3(0.41,0.64,0.82),upward), sheen + 0.17*upward);
      #include <opaque_fragment>`);
  };
  const clear=glazing.clone();
  clear.transparent=true;clear.opacity=.41;clear.depthWrite=false;
  clear.onBeforeCompile=glazing.onBeforeCompile;
  return {
    box: new THREE.BoxGeometry(1,1,1),
    round: new THREE.CylinderGeometry(.5,.5,1,16),
    smooth: new THREE.CylinderGeometry(.5,.5,1,64),
    dome: new THREE.ConeGeometry(.5,1,64),
    matte: new THREE.MeshStandardMaterial({roughness:.87,metalness:.04}),
    glass: glazing, clear,
    shell: new THREE.MeshStandardMaterial({roughness:.9,vertexColors:true}),
  };
}

// Bake each building into a small number of static, pickable draws. Glass panes,
// sash rails, brise-soleil and structural members all have metric thickness.
export function buildingGeometry(id,resources) {
  const batches=new Map(), vertices=[],colors=[];
  function part(shape,p,y,w,h,d,yaw,color,glazed=false,rotation=null) {
    if(Math.min(w,h,d)<=0) return;
    const key=shape+String(glazed), batch=batches.get(key)||{shape,glazed,matrices:[],colors:[]};
    batches.set(key,batch);
    position.set(p[0],y,p[1]);scale.set(w,h,d);
    if(!rotation) quaternion.setFromAxisAngle(Y,yaw);
    matrix.compose(position,rotation||quaternion,scale);
    batch.matrices.push(...matrix.elements);
    tint.setHex(color);
    batch.colors.push(tint.r,tint.g,tint.b);
  }
  const box=(p,y,w,h,d,yaw,color,glazed=false)=>part("box",p,y,w,h,d,yaw,color,glazed);
  const face=(e,t,out,y,w,h,d,color,glazed=false)=>box(at(e,t,out),y,w,h,d,e.yaw,color,glazed);
  function beam(a,b,diameter,color,depth=diameter) {
    const vec=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const length=vec.length();
    if(length<.01)return;
    const rot=new THREE.Quaternion().setFromUnitVectors(Y,vec.normalize());
    part("box",[(a[0]+b[0])/2,(a[2]+b[2])/2],(a[1]+b[1])/2,diameter,length,depth,0,color,false,rot);
  }
  function disk(e,t,out,y,diameter,depth,color,glazed=false) {
    const rot=new THREE.Quaternion().setFromUnitVectors(Y,new THREE.Vector3(e.nx,0,e.nz));
    part("round",at(e,t,out),y,diameter,depth,diameter,0,color,glazed,rot);
  }
  function triangle(a,b,c,col) {
    vertices.push(...a,...b,...c);tint.setHex(col);
    for(let i=0;i<3;i++) colors.push(tint.r,tint.g,tint.b);
  }
  function solid(ring,base,top,wall,roof,holes=[]) {
    const rings=[ring,...holes];
    const vectors=rings.map(r=>r.map(([x,z])=>new THREE.Vector2(x,z)));
    const coords=rings.flat();
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(vectors[0],vectors.slice(1))) {
      const points=[coords[a],coords[b],coords[c]];
      if(area(points)>0)points.reverse();
      triangle(...points.map(([x,z])=>[x,top,z]),roof);
    }
    rings.forEach((r,i)=>{
      const pts=(area(r)>0)===(i===0)?r:[...r].reverse();
      for(let n=0;n<pts.length;n++){
        const a=pts[n],b=pts[(n+1)%pts.length];
        const lo=[a[0],base,a[1]],hi=[a[0],top,a[1]],bl=[b[0],base,b[1]],bh=[b[0],top,b[1]];
        triangle(lo,hi,bh,wall);triangle(lo,bh,bl,wall);
      }
    });
  }
  function perforatedFace(e,base,height,openings,wallColor) {
    const outer=[[0,0],[e.length,0],[e.length,height],[0,height]];
    const loops=[outer,...openings];
    const input=loops.map(l=>l.map(p=>new THREE.Vector2(...p)));
    const local=loops.flat();
    const world=([t,y],depth=0)=>{const p=at(e,t,depth);return [p[0],base+y,p[1]];};
    const sign=e.dx*e.nz-e.dz*e.nx;
    for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(input[0],input.slice(1))){
      const pts=[local[i],local[j],local[k]];
      if(area(pts)*sign<0)pts.reverse();
      triangle(...pts.map(p=>world(p)),wallColor);
    }
    for(const ring of openings){
      let pts=[...ring];if(area(pts)*sign>0)pts.reverse();
      for(let i=0;i<pts.length;i++){
        const a=pts[i],b=pts[(i+1)%pts.length];
        triangle(world(a),world(b,-.31),world(b),C.concrete);
        triangle(world(a),world(a,-.31),world(b,-.31),C.concrete);
      }
    }
  }
  function soffit(ring,y,color) {
    const vectors=ring.map(p=>new THREE.Vector2(...p));
    for(const ids of THREE.ShapeUtils.triangulateShape(vectors,[])){
      const pts=ids.map(i=>ring[i]);
      if(area(pts)<0)pts.reverse();
      triangle(...pts.map(([x,z])=>[x,y,z]),color);
    }
  }
  function finish() {
    const group=new THREE.Group();group.name=id;group.userData.buildingId=id;
    const add=mesh=>{mesh.userData.buildingId=id;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);};
    if(vertices.length) {
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();geometry.computeBoundingSphere();add(new THREE.Mesh(geometry,resources.shell));
    }
    for(const batch of batches.values()){
      const count=batch.colors.length/3;
      const mat=batch.glazed==="clear"?resources.clear:batch.glazed?resources.glass:resources.matte;
      const mesh=new THREE.InstancedMesh(resources[batch.shape],mat,count);
      mesh.instanceMatrix.array.set(batch.matrices);
      mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(batch.colors),3);
      mesh.computeBoundingBox();mesh.computeBoundingSphere();add(mesh);
    }
    return group;
  }
  return {part,box,face,disk,beam,solid,soffit,triangle,perforatedFace,finish};
}
