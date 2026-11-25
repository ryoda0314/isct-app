import { DEG, ID, about, compose, rotAxis } from "./campus3dVehicleGeometry.js";
import { COUPE_VERTEX, COUPE_FRAGMENT, instrumentCanvas } from "./campus3dCoupeMaterials.js";

const ROOT="/map-3d/vehicles/";
const STRIDE=20;
let asset, pending;
const loadImage=url=>new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Could not load "+url));
  img.src=url;
});
export function decodeCoupe(buffer) {
  const view=new DataView(buffer);
  if(view.byteLength<8 || view.getUint32(0)!==0x43415231) throw new Error("Invalid coupe mesh");
  const start=view.getUint32(4,true);
  const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,start-8)));
  const size=meta.vertexCount*STRIDE;
  if(start+size+meta.indexCount*2!==buffer.byteLength) throw new Error("Incomplete coupe mesh");
  return {...meta,vertices:new Uint8Array(buffer,start,size),indices:new Uint16Array(buffer,start+size,meta.indexCount)};
}
export function preloadCoupe() {
  if(!pending) pending=Promise.all([
    fetch(ROOT+"coupe-v1.bin").then(r=>{if(!r.ok) throw new Error("Coupe mesh "+r.status);return r.arrayBuffer();}).then(decodeCoupe),
    loadImage(ROOT+"courtyard-v1.webp"),loadImage(ROOT+"coupe-surfaces-v1.webp"),
  ]).then(([mesh,env,surfaces])=>(asset={mesh,env,surfaces})).catch(e=>{pending=null;throw e;});
  return pending;
}
function columnMajor(m){
  return [m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
}
function clipAt(M,pose){
  const clip=new Float32Array(16);
  for(let r=0;r<4;r++){
    clip[r]=M[r]*pose.e[0]+M[r+4]*pose.e[1];
    clip[4+r]=M[r]*pose.n[0]+M[r+4]*pose.n[1];
    clip[8+r]=M[r+8];
    clip[12+r]=M[r]*pose.W0[0]+M[r+4]*pose.W0[1]+M[r+8]*pose.z+M[r+12];
  }
  return clip;
}
function relativeEye(eye,{W0,e,n,z}){
  const x=eye[0]-W0[0],y=eye[1]-W0[1],det=e[0]*n[1]-e[1]*n[0];
  return [(x*n[1]-y*n[0])/det,(y*e[0]-x*e[1])/det,eye[2]-z];
}
const ZERO=[0,0,0,0];
function transforms(s,mesh){
  const angle=(s.steer||0)*DEG, spin=rotAxis([0,1,0],s.wheel||0);
  const parts={steering:about(rotAxis([-.93,0,.37],angle*3),mesh.steering)};
  for(const [i,hub] of mesh.hubs.entries()){
    const pad=about(rotAxis([0,0,1],i<2?angle:0),hub);
    if(s.heights){
      const pavement=s.z+hub[0]*Math.sin((s.pitch||0)*DEG)-hub[1]*Math.sin((s.roll||0)*DEG);
      pad.t[2]+=Math.max(-.18,Math.min(.19,s.heights[i]-pavement));
    }
    parts["pad"+i]=pad;
    parts["wheel"+i]=compose(pad,about(spin,hub));
  }
  return parts;
}

export function createCoupeRenderer(gl,compile,repaint) {
  let gpu=null, waiting=false, disposed=false, retryAfter=0;
  function upload(){
    const {mesh,env,surfaces}=asset;
    const program=compile(gl,COUPE_VERTEX,COUPE_FRAGMENT);
    const uniforms={};
    for(const name of ["clip","body","part","shift","eye","dents","sun","light","lamps","env","surfaceMap","instruments"])
      uniforms[name]=program.loc("u_"+name);
    const fields=[["position",3,gl.SHORT,false,0],["normal",3,gl.BYTE,true,6],
      ["surface",3,gl.UNSIGNED_BYTE,false,9],["paint",4,gl.UNSIGNED_BYTE,true,12],["uv",2,gl.SHORT,false,16]]
      .map(([key,...rest])=>[program.att("a_"+key),...rest]);
    const vertex=gl.createBuffer(),index=gl.createBuffer();
    const previousVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER,vertex);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    const parts=mesh.parts.map(p=>{
      const vao=gl.createVertexArray();
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);
      for(const [at,n,type,norm,off] of fields){
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at,n,type,norm,STRIDE,p.vertex*STRIDE+off);
      }
      return {...p,vao};
    });
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(previousVao);gl.bindBuffer(gl.ARRAY_BUFFER,previousBuffer);
    const instruments=instrumentCanvas();instruments.update();
    const previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
    const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premul=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    const textures=[env,surfaces,instruments.canvas].map((image,i)=>{
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,i===2 ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,i===2 ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,i===1 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      if(i!==2) gl.generateMipmap(gl.TEXTURE_2D);
      return texture;
    });
    gl.bindTexture(gl.TEXTURE_2D,previousTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premul);
    gpu={program,uniforms,mesh,parts,vertex,index,textures,instruments};
  }
  function prepare(){
    if(disposed || gpu || waiting || performance.now()<retryAfter) return;
    if(asset){upload();repaint();return;}
    waiting=true;
    preloadCoupe().then(()=>{if(!disposed) repaint();}).catch(()=>{retryAfter=performance.now()+15000;})
      .finally(()=>{waiting=false;});
  }
  function draw(cars,M,eye,light){
    if(!gpu||!cars.length||!eye) return;
    const {uniforms:u}=gpu;
    gl.useProgram(gpu.program.p);
    gl.uniform3f(u.sun,light.pos[0],-light.pos[1],light.pos[2]);
    gl.uniform3fv(u.light,light.color);
    const oldActive=gl.getParameter(gl.ACTIVE_TEXTURE),oldTextures=[];
    for(let i=0;i<3;i++){
      gl.activeTexture(gl.TEXTURE0+i);
      oldTextures.push(gl.getParameter(gl.TEXTURE_BINDING_2D));gl.bindTexture(gl.TEXTURE_2D,gpu.textures[i]);
    }
    const cockpit=cars.find(c=>c.fp);
    if(gpu.instruments.update(cockpit?.s.v,cockpit?.s.reverse ? -1 : cockpit?.s.gear,cockpit?.s.rpm)){
      const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,gpu.instruments.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);
    }
    gl.uniform1i(u.env,0);gl.uniform1i(u.surfaceMap,1);gl.uniform1i(u.instruments,2);
    const oldVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),cull=gl.isEnabled(gl.CULL_FACE),blend=gl.isEnabled(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    const instances=cars.map(car=>{
      const rel=relativeEye(eye,car.pose);
      const distance=Math.hypot(...rel);
      return {...car,rel,distance,range:distance>29?"far":"near",
        clip:clipAt(M,car.pose),model:columnMajor(car.pose.R),parts:transforms(car.s,gpu.mesh)};
    });
    const drawPass=glass=>{
      for(const car of instances){
        if(glass && car.fp) continue;
        gl.uniformMatrix4fv(u.clip,false,car.clip);gl.uniformMatrix3fv(u.body,false,car.model);
        gl.uniform3fv(u.eye,car.rel);gl.uniform4f(u.lamps,1-car.night,car.on?1:0,car.brake?1:0,car.reverse?1:0);
        for(const part of gpu.parts){
          if((part.name==="glass")!==glass) continue;
          const tx=car.parts[part.name]||ID;
          gl.uniformMatrix3fv(u.part,false,columnMajor(tx.R));gl.uniform3fv(u.shift,tx.t);
          gl.uniform4fv(u.dents,part.name==="body"||glass ? car.s.dents||ZERO : ZERO);
          gl.bindVertexArray(part.vao);
          const [offset,count]=part[car.range];gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,offset*2);
        }
      }
    };
    gl.disable(gl.BLEND);gl.depthMask(true);
    drawPass(false);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    if(instances.length>1) instances.sort((a,b)=>b.distance-a.distance);
    drawPass(true);
    gl.depthMask(true);
    if(!blend) gl.disable(gl.BLEND);
    if(cull) gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(oldVao);
    for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,oldTextures[i]);}
    gl.activeTexture(oldActive);
  }
  return {get ready(){return !!gpu;},prepare,draw,dispose(){
    disposed=true;
    if(!gpu) return;
    for(const p of gpu.parts) gl.deleteVertexArray(p.vao);
    for(const t of gpu.textures) gl.deleteTexture(t);
    gl.deleteBuffer(gpu.vertex);gl.deleteBuffer(gpu.index);gl.deleteProgram(gpu.program.p);gpu=null;
  }};
}
