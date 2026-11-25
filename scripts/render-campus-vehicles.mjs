// Render the actual game meshes for the garage. Run from the project root.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { worldOf } from "../campus-sns/campus3dMesh.js";
import { vehicleMeshes } from "../campus-sns/campus3dVehicleMesh.js";
import { VEHICLE_KINDS } from "../campus-sns/campus3dVehicles.js";
import { renderCoupeCard } from "./render-campus-coupe.mjs";

const W = 1024, H = 432;
const unit = v => v.map(n => n / Math.hypot(...v));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const [sx] = worldOf([1,0]), [,sy] = worldOf([0,1]);
const key=unit([.54,.38,1]), rim=unit([-.71,-.5,.62]);
const folder = new URL("../public/map-3d/vehicles/", import.meta.url);
await mkdir(folder,{recursive:true});

for (const kind of VEHICLE_KINDS) {
  if (kind==="car") {
    await renderCoupeCard(new URL("car.webp",folder));
    continue;
  }
  const model=vehicleMeshes([{kind,s:{x:0,y:0,z:0,yaw:90,gearDown:0},rider:null}]);
  const eye=unit(kind==="jet" ? [.88,1,.57] : kind==="bike" ? [.43,1,.22] : kind==="drone" ? [.77,1,.86] : [.72,1,.42]);
  const right=unit(cross([0,0,1],eye)), up=cross(eye,right), half=unit(eye.map((n,i)=>n+key[i]));
  const triangles=[];
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for (const name of ["solid","glass","screen"]) {
    const mesh=model[name];
    for (let i=0;i<mesh.count;i+=3) {
      if (mesh.col[i*4+3]<.4) continue;
      const pts=[];
      for (let k=i;k<i+3;k++) {
        const p=[mesh.pos[k*3]/sx,mesh.pos[k*3+1]/sy,mesh.pos[k*3+2]];
        const x=dot(p,right), y=-dot(p,up);
        xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
        pts.push([x,y,dot(p,eye)]);
      }
      const n=[mesh.nrm[i*3],-mesh.nrm[i*3+1],mesh.nrm[i*3+2]];
      const lambert=.56+.48*Math.max(0,dot(n,key))+.17*Math.max(0,dot(n,rim));
      const spec=(name==="glass"?.30:.10)*Math.max(0,dot(n,half))**14;
      const color=[0,1,2].map(j=>Math.min(255,Math.round(255*(mesh.col[i*4+j]*lambert+spec))));
      triangles.push({pts,color});
    }
  }
  const scale=Math.min(W*.91/(xmax-xmin),H*.90/(ymax-ymin));
  const rgba=Buffer.alloc(W*H*4), depth=new Float32Array(W*H).fill(-Infinity);
  for (const {pts,color} of triangles) {
    const [a,b,c]=pts.map(([x,y,z])=>[(x-(xmax+xmin)/2)*scale+W/2,(y-(ymax+ymin)/2)*scale+H/2,z]);
    const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(det)<.01) continue;
    const xs=[a[0],b[0],c[0]],ys=[a[1],b[1],c[1]];
    const left=Math.max(0,Math.floor(Math.min(...xs))), top=Math.max(0,Math.floor(Math.min(...ys)));
    const bottom=Math.min(H-1,Math.ceil(Math.max(...ys))), end=Math.min(W-1,Math.ceil(Math.max(...xs)));
    for (let y=top;y<=bottom;y++) for(let x=left;x<=end;x++) {
      const dx=x+.5-c[0],dy=y+.5-c[1];
      const u=((b[1]-c[1])*dx+(c[0]-b[0])*dy)/det;
      const v=((c[1]-a[1])*dx+(a[0]-c[0])*dy)/det, w=1-u-v;
      if(Math.min(u,v,w)<0) continue;
      const z=u*a[2]+v*b[2]+w*c[2],ix=y*W+x;
      if(z<depth[ix]) continue;
      depth[ix]=z;
      for(let j=0;j<3;j++) rgba[ix*4+j]=color[j];
      rgba[ix*4+3]=255;
    }
  }
  await sharp(rgba,{raw:{width:W,height:H,channels:4}}).resize(576,243).webp({quality:89}).toFile(fileURLToPath(new URL(kind+".webp",folder)));
}
