// Offline conversion of Khronos CarConcept. Input folder: the original glTF
// files and Poly Haven's urban_courtyard_02.jpg. Install meshoptimizer@0.25.0
// in that folder (build tool only), then run node scripts/prepare-campus-coupe.mjs <folder>.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { Part } from "../campus-sns/campus3dVehicleGeometry.js";

const source = path.resolve(process.argv[2]);
const output = new URL("../public/map-3d/vehicles/", import.meta.url);
const { MeshoptSimplifier: simplify } = createRequire(path.join(source, "build.cjs"))("meshoptimizer");
await simplify.ready;
const gltf = JSON.parse(await readFile(path.join(source, "CarConcept.gltf"), "utf8"));
const bytes = await readFile(path.join(source, gltf.buffers[0].uri));
const ao = await sharp(path.join(source, "Occlusion.png")).greyscale().raw().toBuffer({ resolveWithObject: true });
const size = { SCALAR: 1, VEC2: 2, VEC3: 3 };
function attribute(index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const offset = (v.byteOffset || 0) + (a.byteOffset || 0), n = size[a.type];
  const length = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const read = { 5121: "readUInt8", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" }[a.componentType];
  const array = a.type === "SCALAR" ? new Uint32Array(a.count) : new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++)
    array[i*n+k] = bytes[read](offset + i * (v.byteStride || n * length) + k * length);
  return array;
}
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function multiply(a, b) {
  return b.map((_, i) => {
    const r=i%4, c=i-r;
    return a[r]*b[c]+a[4+r]*b[c+1]+a[8+r]*b[c+2]+a[12+r]*b[c+3];
  });
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x,y,z,w]=n.rotation || [0,0,0,1], [a,b,c]=n.scale || [1,1,1];
  return [a*(1-2*y*y-2*z*z),a*(2*x*y+2*z*w),a*(2*x*z-2*y*w),0,
    b*(2*x*y-2*z*w),b*(1-2*x*x-2*z*z),b*(2*y*z+2*x*w),0,
    c*(2*x*z+2*y*w),c*(2*y*z-2*x*w),c*(1-2*x*x-2*y*y),0,...(n.translation || [0,0,0]),1];
}
// Original glTF: +Z forward, +X left, +Y up. Keep wheelbase and track in
// register with the simulation. A submillimetre grid leaves panel gaps intact.
const fore = .9574, lateral = .815, height = .994;
const carPoint = (x,y,z) => [(z-.085)*fore,x*lateral,y*height];
const unit = (x,y,z) => {const l=Math.hypot(x,y,z)||1; return [x/l,y/l,z/l];};
const groups = new Map();
const wheels = ["WheelFrontL","WheelFrontR","WheelRearL","WheelRearR"];
const hubs = [];
const toByte = n => Math.round(Math.min(1,Math.max(0,n))*255);
// sRGB, metalness, roughness. Material numbers follow the source asset.
const finishes = [
  ["34383c",.68,.40],["839fa8",0,.055],["293039",.18,.39],["303336",.02,.65],
  ["242627",0,.95],["9ea7ab",.85,.25],["aa6044",.02,.54],["47494a",.03,.60],
  ["171b1c",.05,.27],["e6e5d6",.05,.41],["353c42",.62,.24],["cc382a",.55,.20],
  ["73381d",.14,.20],["7d1212",.18,.15],["ccdae1",.38,.12],["d6e3ea",1,.06],
  ["cd5835",.48,.30],["9a9c9d",.89,.34],["292a2c",.02,.70],["28292a",.01,.78],
  ["c1c4c5",.94,.21],["454c53",.80,.29],
];
const palette = finishes.map(([hex,metal,rough]) => [
  ...hex.match(/../g).map(q=>parseInt(q,16)),toByte(metal),toByte(rough),
]);
const stride=20, bounds = new Map();
function addPrimitive(prim, matrix, group, name) {
  const m=prim.material, attrs=prim.attributes;
  const p=attribute(attrs.POSITION), n=attribute(attrs.NORMAL), ix=attribute(prim.indices);
  const uv=attrs.TEXCOORD_0 == null ? null : attribute(attrs.TEXCOORD_0);
  const uvAO=attrs.TEXCOORD_1 == null ? null : attribute(attrs.TEXCOORD_1);
  const vertices=Buffer.alloc(p.length/3*stride), weights=new Float32Array(p.length);
  const strength = gltf.materials[m].occlusionTexture?.strength ?? 1;
  let surfaces = palette[m===28 ? 3 : m]; // unpainted panel edges
  if(m===6 && !name.startsWith("InteriorSeats")) {
    surfaces = name.includes("Wheel") ? [67,57,53,4,160] : [48,53,55,3,174];
  }
  if (!surfaces) throw new Error("Unmapped car material " + m);
  const minmax=bounds.get(name) || [[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  bounds.set(name,minmax);
  for (let i=0,j=0;i<p.length/3;i++,j+=stride) {
    const x=p[3*i],y=p[3*i+1],z=p[3*i+2];
    const local=carPoint(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
      matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]);
    const nx=n[3*i],ny=n[3*i+1],nz=n[3*i+2];
    const normal=unit((matrix[2]*nx+matrix[6]*ny+matrix[10]*nz)/fore,
      (matrix[0]*nx+matrix[4]*ny+matrix[8]*nz)/lateral,(matrix[1]*nx+matrix[5]*ny+matrix[9]*nz)/height);
    for (let k=0;k<3;k++) {
      vertices.writeInt16LE(Math.round(local[k]*8192),j+k*2);
      vertices.writeInt8(Math.round(normal[k]*127),j+6+k);
      weights[3*i+k]=normal[k];minmax[0][k]=Math.min(minmax[0][k],local[k]);minmax[1][k]=Math.max(minmax[1][k],local[k]);
    }
    vertices[j+9]=m;
    const u=uvAO?.[2*i]||0,v=uvAO?.[2*i+1]||0;
    const ax=Math.min(ao.info.width-1,Math.max(0,Math.floor(u*ao.info.width)));
    const ay=Math.min(ao.info.height-1,Math.max(0,Math.floor(v*ao.info.height)));
    vertices[j+10]=uvAO && strength ? Math.round(255+(ao.data[ay*ao.info.width+ax]-255)*strength) : 255;
    vertices[j+11]=surfaces[4];
    for(let k=0;k<4;k++) vertices[j+12+k]=surfaces[k];
    const st=m===9 ? [.5-local[1]/.295,1-(local[2]-.263)/.102] :
      [3,6,7,8,17,19].includes(m) ? [uv?.[2*i]||0,uv?.[2*i+1]||0] : [0,0];
    for(let k=0;k<2;k++) vertices.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(st[k]*4096))),j+16+2*k);
  }
  // The second set of indices uses the same vertices. Small distant cars no
  // longer have to process every spoke, wiper and caliper triangle.
  const reduce=(indices, ratio, error) => {
    if(indices.length<72) return indices;
    return simplify.simplifyWithAttributes(indices,p,3,weights,3,[.10,.10,.10],null,
      Math.max(36,Math.floor(indices.length*ratio/3)*3),error,["Permissive"])[0];
  };
  const near=reduce(ix,name.includes("Wipers")?.09: .46,.008);
  const far=reduce(near,.17,.075);
  if(!groups.has(group)) groups.set(group,[]);
  groups.get(group).push({vertices, near, far});
}
function visit(index,parent,wheel=-1) {
  const node=gltf.nodes[index], name=node.name||"", wi=wheels.indexOf(name);
  const local=nodeMatrix(node);
  // The showcase pose has the front wheels turned 30 degrees. Restore all
  // hubs to their bind axes so physics owns both steering and spin.
  if(wi>=0){wheel=wi; for(let i=0;i<12;i++) local[i]=identity[i];}
  const M=multiply(parent,local);
  if(wi>=0) hubs[wi]=carPoint(M[12],M[13],M[14]);
  if(node.mesh!=null && name!=="InteriorSteeringEmblem"){
    for(const prim of gltf.meshes[node.mesh].primitives){
      let part="body";
      if(wheel>=0) part=(name.endsWith("BrakePad")?"pad":"wheel")+wheel;
      else if(prim.material===1) part="glass";
      else if(name.startsWith("InteriorSteeringWheel")) part="steering";
      else if(name.startsWith("Interior")||name.includes("WindshieldWiper")||prim.material===8) part="cabin";
      addPrimitive(prim,M,part,name);
    }
  }
  for(const child of node.children||[]) visit(child,M,wheel);
}
for(const root of gltf.scenes[gltf.scene||0].nodes) visit(root,identity);

// The rear bumper is the surface nearest the chase camera. Fit a curved
// intake, stamped grille, lamp blades and rolled outlet lips to that panel.
function addRearTrim(){
  const trim=new Map(), normal=[-1,0,0], neutral=[1,1,1,1];
  const part=m=>{if(!trim.has(m)) trim.set(m,new Part());return trim.get(m);};
  const face=(y,z,depth=0)=>[-1.951+.15*y*y+.70*(z-.50)**2-depth,y,z];
  const panel=(m,a,b,c,d)=>part(m).quad(a,b,c,d,neutral,null,normal);
  const base=29, graphite=30, bright=31;
  const materials={ [base]:[20,23,24,12,200],[graphite]:[65,72,75,142,115],[bright]:[163,172,175,232,65],13:palette[13] };
  for(let i=0;i<32;i++){
    const y0=-.735+i*1.47/32,y1=y0+1.47/32;
    const low=y=>.435+.058*(Math.abs(y)/.735)**5, high=y=>.582-.05*(Math.abs(y)/.735)**6;
    panel(base,face(y0,low(y0)),face(y0,high(y0)),face(y1,high(y1)),face(y1,low(y1)));
    panel(graphite,face(y0,low(y0),.003),face(y0,low(y0)+.008,.005),
      face(y1,low(y1)+.008,.005),face(y1,low(y1),.003));
  }
  for(let row=0;row<3;row++) for(let col=-15;col<=15;col++){
    const y=(col+(row%2)*.5)*.045,z=.465+row*.035;
    if(Math.abs(y)>.64 && row!==1) continue;
    const hex=(k,r)=>face(y+.025*r*Math.cos((k+.5)*Math.PI/3),z+.021*r*Math.sin((k+.5)*Math.PI/3),.005);
    for(let k=0;k<6;k++) panel(graphite,hex(k,1),hex(k,.79),hex(k+1,.79),hex(k+1,1));
  }
  for(const side of [-1,1]){
    for(const row of [0,1]) for(let i=0;i<12;i++){
      const lamp=(step,top,offset=0)=>{
        const t=step/12,y=side*(.40+.337*t);
        return face(y,.61+row*.030+.053*t*t+(top?.016*(1.-.6*t):0)+offset,.006);
      };
      panel(base,lamp(i,false,-.005),lamp(i,true,.005),lamp(i+1,true,.005),lamp(i+1,false,-.005));
      const lens=(step,top)=>{const p=lamp(step,top);p[0]-=.005;return p;};
      panel(13,lens(i,false),lens(i,true),lens(i+1,true),lens(i+1,false));
    }
    const outlet=(k,r,depth)=>{
      const a=k*2*Math.PI/24, y=side*.57+Math.cos(a)*r*.100, z=.235+Math.sin(a)*r*.041;
      return [-1.922+.16*y*y-depth,y,z];
    };
    for(let k=0;k<24;k++){
      part(base).tri(outlet(k,0,.001),outlet(k,1,.001),outlet(k+1,1,.001),neutral,normal);
      panel(graphite,outlet(k,1,.001),outlet(k,1,.033),outlet(k+1,1,.033),outlet(k+1,1,.001));
      panel(bright,outlet(k,1,.033),outlet(k,.80,.032),outlet(k+1,.80,.032),outlet(k+1,1,.033));
      panel(base,outlet(k,.80,.032),outlet(k,.80,.002),outlet(k+1,.80,.002),outlet(k+1,.80,.032));
    }
  }
  for(const [m,p] of trim){
    const count=p.p.length/3,v=Buffer.alloc(count*stride),indices=new Uint32Array(count);
    for(let i=0;i<count;i++){
      const off=i*stride;
      for(let k=0;k<3;k++){v.writeInt16LE(Math.round(p.p[i*3+k]*8192),off+2*k);v.writeInt8(Math.round(p.n[i*3+k]*127),off+6+k);}
      v[off+9]=m;v[off+10]=235;v[off+11]=materials[m][4];
      for(let k=0;k<4;k++) v[off+12+k]=materials[m][k];
      indices[i]=i;
    }
    groups.get("body").push({vertices:v,near:indices,far:m===graphite?new Uint32Array():indices});
  }
}
addRearTrim();
const parts=[], vblocks=[], iblocks=[];
let vertexCount=0,indexCount=0;
for(const [name,primitives] of groups){
  const vertices=[], near=[],far=[],unique=new Map();
  for(const prim of primitives){
    const kept=new Map();
    const remap=i=>{
      if(!kept.has(i)){
        const record=prim.vertices.subarray(i*stride,(i+1)*stride), key=record.toString("base64");
        if(!unique.has(key)){unique.set(key,vertices.length);vertices.push(record);}
        kept.set(i,unique.get(key));
      }
      return kept.get(i);
    };
    for(const i of prim.near) near.push(remap(i));
    for(const i of prim.far) far.push(remap(i));
  }
  if(vertices.length>65535) throw new Error("Car part exceeds 16-bit indices: "+name);
  const entry={name,vertex:vertexCount,near:[indexCount,near.length],far:[indexCount+near.length,far.length]};
  parts.push(entry);vblocks.push(Buffer.concat(vertices));
  iblocks.push(Buffer.from(Uint16Array.from(near).buffer),Buffer.from(Uint16Array.from(far).buffer));
  vertexCount+=vertices.length;indexCount+=near.length+far.length;
}
const steering=bounds.get("InteriorSteeringWheel01");
const header=Buffer.from(JSON.stringify({parts,hubs,steering:steering[0].map((v,k)=>(v+steering[1][k])/2),vertexCount,indexCount}));
const prefix=Buffer.alloc(8+Math.ceil(header.length/4)*4);
prefix.write("CAR1");prefix.writeUInt32LE(prefix.length,4);prefix.fill(32,8);header.copy(prefix,8);
await writeFile(new URL("coupe-v1.bin",output),Buffer.concat([prefix,...vblocks,...iblocks]));
await writeFile(new URL("courtyard-v1.webp",output),await sharp(path.join(source,"urban_courtyard_02.jpg"))
  .resize(1024,512).blur(.55).webp({quality:83}).toBuffer());
const tiles=["Tiretread_N","Hex_N","Rib_N","Dot_N"];
const layers=await Promise.all(tiles.map(async (name,i)=>({
  input:await sharp(path.join(source,name+".png")).resize(256,128,{fit:"fill"}).png().toBuffer(),
  left:(i%2)*256,top:Math.floor(i/2)*128,
})));
await writeFile(new URL("coupe-surfaces-v1.webp",output),await sharp({create:{width:512,height:256,channels:3,background:"#8080ff"}})
  .composite(layers).webp({quality:97}).toBuffer());
console.log({vertexCount,nearTriangles:parts.reduce((s,p)=>s+p.near[1]/3,0),farTriangles:parts.reduce((s,p)=>s+p.far[1]/3,0),hubs});
