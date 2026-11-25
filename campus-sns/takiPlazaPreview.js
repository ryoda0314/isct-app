import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { TAKI_CUT_Y } from "./takiPlazaSection.js";

// PLY vertices are in 2 mm units east/up/south of the Taki ground reference.
// The same orthographic camera projects the model and its accessible HTML pins.
let download;
function modelBytes() {
  if (!download) {
    download = fetch("/map-3d/taki-preview/plaza.ply.gz").then(async response => {
      if (!response.ok) throw new Error("Model download failed");
      const buffer=await response.arrayBuffer();
      const bytes=new Uint8Array(buffer);
      // A server may already apply Content-Encoding: gzip to this asset.
      if (bytes[0]!==0x1f || bytes[1]!==0x8b) return buffer;
      if (typeof DecompressionStream==="function") {
        const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).arrayBuffer();
      }
      const { gunzipSync }=await import("three/examples/jsm/libs/fflate.module.js");
      return gunzipSync(bytes).buffer;
    }).catch(err => { download = null; throw err; });
  }
  return download;
}

const glassOpacity=0.38;
// The exporter places glazing at the end so the depth-tested opaque pass can
// finish before either renderer composites the glass.
function glassStart(buffer, indexCount) {
  const header=new TextDecoder().decode(new Uint8Array(buffer,0,Math.min(buffer.byteLength,2048))).split("end_header")[0];
  const range=/^comment glass_faces (\d+) (\d+)\s*$/m.exec(header);
  if (!range) return indexCount;
  const start=Number(range[1])*3, end=start+Number(range[2])*3;
  return end===indexCount ? start : indexCount;
}

// A small CPU depth buffer keeps the sloping roof and intersecting interior
// walls correctly ordered even on devices where WebGL is disabled.
export function softwareRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const point = new THREE.Vector3(), color = new THREE.Color();
  const transform = new THREE.Matrix4(), lastTransform = new THREE.Matrix4();
  let previous = null, projected, colours, pixels, depths, projectionDirty = true;
  return {
    resize(w,h,ratio) {
      canvas.width = Math.max(1,Math.round(w*ratio)); canvas.height = Math.max(1,Math.round(h*ratio));
      pixels=ctx.createImageData(canvas.width,canvas.height);
      depths=new Float32Array(canvas.width*canvas.height);
      projectionDirty=true;
    },
    draw(mesh,camera,cut) {
      const { geometry } = mesh, { position, color: rgb } = geometry.attributes;
      if (geometry !== previous) {
        previous = geometry;
        projectionDirty=true;
        projected = new Float32Array(position.count*3);
        colours=new Uint8Array(position.count*3);
        for (let i=0; i<position.count; ++i) {
          color.fromBufferAttribute(rgb,i).convertLinearToSRGB();
          colours.set([Math.round(color.r*255),Math.round(color.g*255),Math.round(color.b*255)],i*3);
        }
      }
      const w = canvas.width, h = canvas.height;
      transform.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      if (projectionDirty || !transform.equals(lastTransform)) {
        for (let i=0; i<position.count; ++i) {
          point.fromBufferAttribute(position,i).applyMatrix4(transform);
          projected[i*3]=(point.x+1)*w/2;
          projected[i*3+1]=(1-point.y)*h/2;
          projected[i*3+2]=point.z;
        }
        lastTransform.copy(transform);
        projectionDirty=false;
      }
      depths.fill(Infinity); pixels.data.fill(0);
      const order=geometry.index.array;
      const glazing=geometry.userData.glassStart ?? order.length;
      for(let i=0;i<order.length;i+=3) {
        const a=order[i]*3,b=order[i+1]*3,c=order[i+2]*3;
        const ay=position.getY(order[i]),by=position.getY(order[i+1]),cy=position.getY(order[i+2]);
        if (Math.min(ay,by,cy)>cut) continue;
        const crossing=Math.max(ay,by,cy)>cut;
        const x0=projected[a],y0=projected[a+1],x1=projected[b],y1=projected[b+1],x2=projected[c],y2=projected[c+1];
        const denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
        if(Math.abs(denom)<1e-8) continue;
        const left=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),right=Math.min(w-1,Math.floor(Math.max(x0,x1,x2)-.5));
        const top=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),bottom=Math.min(h-1,Math.floor(Math.max(y0,y1,y2)-.5));
        for(let y=top;y<=bottom;++y) for(let x=left;x<=right;++x) {
          const u=((y1-y2)*(x+.5-x2)+(x2-x1)*(y+.5-y2))/denom;
          const v=((y2-y0)*(x+.5-x2)+(x0-x2)*(y+.5-y2))/denom;
          const wgt=1-u-v;
          if(Math.min(u,v,wgt)<0) continue;
          // Under orthographic projection a fragment's height is the affine
          // interpolation of the three model heights, just as in the GPU pass.
          if(crossing && u*ay+v*by+wgt*cy>cut) continue;
          const z=u*projected[a+2]+v*projected[b+2]+wgt*projected[c+2], at=y*w+x;
          if(z>depths[at]) continue;
          const dest=4*at;
          if(i<glazing) {
            depths[at]=z;
            for(let k=0;k<3;k++) pixels.data[dest+k]=u*colours[a+k]+v*colours[b+k]+wgt*colours[c+k];
            pixels.data[dest+3]=255;
          } else {
            const underAlpha=pixels.data[dest+3]/255*(1-glassOpacity), alpha=glassOpacity+underAlpha;
            for(let k=0;k<3;k++) {
              const src=u*colours[a+k]+v*colours[b+k]+wgt*colours[c+k];
              pixels.data[dest+k]=(glassOpacity*src+underAlpha*pixels.data[dest+k])/alpha;
            }
            pixels.data[dest+3]=255*alpha;
          }
        }
      }
      ctx.putImageData(pixels,0,0);
    },
    dispose() {}
  };
}

export function createTakiPreview(stage, onProject) {
  function newCanvas() {
    const c=document.createElement("canvas");
    c.setAttribute("aria-hidden","true");
    stage.replaceChildren(c);
    return c;
  }
  const canvas=newCanvas(), scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,500);
  const cutPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
  const planes=[cutPlane], uncut=[];
  let renderer, hardware=null;
  try {
    hardware=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:"low-power"});
    hardware.setClearColor(0x000000,0);
    renderer={
      resize(w,h,r) { hardware.setPixelRatio(r); hardware.setSize(w,h,false); },
      draw(mesh,camera,cut) {
        if (Number.isFinite(cut)) {
          cutPlane.constant=cut;
          hardware.clippingPlanes=planes;
        } else hardware.clippingPlanes=uncut;
        hardware.render(scene,camera);
      },
      dispose() { hardware.dispose(); hardware.forceContextLoss(); },
    };
  } catch {
    renderer=softwareRenderer(newCanvas());
  }
  const material=new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.DoubleSide});
  const glass=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,
    opacity:glassOpacity,depthWrite:false,forceSinglePass:true});
  const centre=new THREE.Vector3(), point=new THREE.Vector3();
  let mesh=null, pending=null, cut=Infinity, yaw, tilt, zoom, active=true, frame=0, viewDirty=true;
  let panX=0, panY=0;
  let fittedYaw,fittedTilt,xMin,yMin,xMax,yMax;
  function reset() {
    yaw=-1.34;
    tilt=.735;
    zoom=1;
    panX=0; panY=0;
    updateView();
  }
  function draw() {
    frame=0;
    if (!active || !mesh) return;
    const w=stage.clientWidth, h=stage.clientHeight;
    if (!w || !h) return;
    if (viewDirty) {
      if (fittedYaw!==yaw || fittedTilt!==tilt) {
        camera.position.set(Math.sin(yaw)*Math.cos(tilt),Math.sin(tilt),Math.cos(yaw)*Math.cos(tilt)).multiplyScalar(120).add(centre);
        camera.lookAt(centre); camera.updateMatrixWorld();
        const positions=mesh.geometry.attributes.position;
        xMin=Infinity; yMin=Infinity; xMax=-Infinity; yMax=-Infinity;
        // Include the few vertices of the site's retaining walls among the
        // densely tessellated roof and furniture when framing the whole model.
        for(let i=0;i<positions.count;i++) {
          point.fromBufferAttribute(positions,i).applyMatrix4(camera.matrixWorldInverse);
          xMin=Math.min(xMin,point.x); xMax=Math.max(xMax,point.x);
          yMin=Math.min(yMin,point.y); yMax=Math.max(yMax,point.y);
        }
        fittedYaw=yaw; fittedTilt=tilt;
      }
      const half = Math.max((xMax-xMin)*h/w,yMax-yMin)*.56/zoom;
      // Keep part of the building in reach, including after a viewport resize.
      const metresPerPixel=2*half/h;
      const limitX=Math.max(w*.22,(xMax-xMin)/(2*metresPerPixel)-w*.22);
      const limitY=Math.max(h*.22,(yMax-yMin)/(2*metresPerPixel)-h*.22);
      panX=THREE.MathUtils.clamp(panX,-limitX,limitX);
      panY=THREE.MathUtils.clamp(panY,-limitY,limitY);
      const x=(xMax+xMin)/2-panX*metresPerPixel, y=(yMax+yMin)/2+panY*metresPerPixel;
      camera.left=x-half*w/h; camera.right=x+half*w/h;
      camera.top=y+half; camera.bottom=y-half; camera.updateProjectionMatrix();
      viewDirty=false;
    }
    renderer.draw(mesh,camera,cut);
    onProject(position => {
      point.fromArray(position).project(camera);
      return [(1+point.x)*w/2,(1-point.y)*h/2];
    });
  }
  function schedule() { if (active && !frame) frame=requestAnimationFrame(draw); }
  function updateView() { viewDirty=true; schedule(); }
  function setCut(height) {
    if ((height!==Infinity && !Number.isFinite(height)) || height===cut) return;
    cut=height;
    schedule();
  }
  function resize() {
    if (!active) return;
    const ratio=hardware ? Math.min(2,window.devicePixelRatio||1) : 1;
    renderer.resize(stage.clientWidth||1,stage.clientHeight||1,ratio);
    updateView();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(stage);
  // A lost GL context leaves a readable, rotatable model on the same device.
  const lost=event=>{
    if (!active) return;
    event.preventDefault();
    hardware.dispose();
    hardware=null;
    renderer=softwareRenderer(newCanvas());
    resize();
  };
  if(hardware) canvas.addEventListener("webglcontextlost",lost);
  reset();
  resize();
  return {
    async load(floor) {
      if (floor && Object.hasOwn(TAKI_CUT_Y,floor)) setCut(TAKI_CUT_Y[floor]);
      if (!active || mesh) return;
      if (!pending) pending=modelBytes().then(buffer=>{
        if (!active) return;
        const geometry=new PLYLoader().parse(buffer);
        geometry.scale(.002,.002,.002);
        geometry.computeBoundingBox();
        const count=geometry.index.count, glazing=glassStart(buffer,count);
        geometry.userData.glassStart=glazing;
        geometry.addGroup(0,glazing,0);
        if(glazing<count) geometry.addGroup(glazing,count-glazing,1);
        mesh=new THREE.Mesh(geometry,[material,glass]); scene.add(mesh);
        geometry.boundingBox.getCenter(centre);
        updateView();
      }).finally(()=>{ pending=null; });
      return pending;
    },
    setCut,
    rotate(dx,dy) {
      yaw-=dx*.014; tilt=Math.max(.20,Math.min(1.5,tilt+dy*.009)); updateView();
    },
    scale(factor,x=stage.clientWidth/2,y=stage.clientHeight/2) {
      if (!(factor>0) || !Number.isFinite(factor)) return;
      const next=THREE.MathUtils.clamp(zoom*factor,.72,4);
      const ratio=next/zoom, dx=x-stage.clientWidth/2, dy=y-stage.clientHeight/2;
      panX=dx+(panX-dx)*ratio;
      panY=dy+(panY-dy)*ratio;
      zoom=next; updateView();
    },
    pan(dx,dy) { panX+=dx; panY+=dy; updateView(); },
    reset,
    dispose() {
      active=false; cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener("webglcontextlost",lost);
      mesh?.geometry.dispose(); material.dispose(); glass.dispose(); renderer.dispose(); stage.replaceChildren();
    }
  };
}
