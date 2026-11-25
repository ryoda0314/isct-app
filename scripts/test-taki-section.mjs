import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import * as THREE from "three";
import { softwareRenderer, createTakiPreview } from "../campus-sns/takiPlazaPreview.js";
import { TAKI_CUT_Y, TAKI_FLOOR_Y } from "../campus-sns/takiPlazaSection.js";

function canvas2D() {
  const ctx = {
    createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }),
    putImageData(pixels) { this.pixels = pixels.data; },
  };
  return {
    getContext: type => type === "2d" ? ctx : null,
    setAttribute() {}, addEventListener() {}, removeEventListener() {},
  };
}

test("software sections retain the exact covered pixels of crossing faces and expose the lower mesh", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute([
    -.8,-.8,0, .8,-.8,0, 0,.8,0,
    -.8,-.8,-.3, .8,-.8,-.3, .8,-.1,-.3,
  ],3));
  geometry.setAttribute("color",new THREE.Float32BufferAttribute([
    1,0,0, 1,0,0, 1,0,0, 0,1,0, 0,1,0, 0,1,0,
  ],3));
  geometry.setIndex([0,1,2,3,4,5]);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);
  camera.position.z=2; camera.updateMatrixWorld();
  const canvas=canvas2D(), renderer=softwareRenderer(canvas), mesh=new THREE.Mesh(geometry);
  renderer.resize(64,64,1);
  function draw(height) {
    renderer.draw(mesh,camera,height);
    return canvas.getContext("2d").pixels.slice();
  }
  const full=draw(Infinity);
  for (const height of [-1,-.6,0,.45,1]) {
    const section=draw(height);
    for (let y=0; y<64; y++) for (let x=0; x<64; x++) {
      const offset=4*(y*64+x), worldY=1-2*(y+.5)/64;
      if (worldY>height) assert.equal(section[offset+3],0);
      else assert.deepEqual(section.subarray(offset,offset+4),full.subarray(offset,offset+4));
    }
  }
  // Looking down, the clipped roof used to write depth and hide the floor.
  camera.position.set(0,2,1); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const roof=draw(Infinity), cut=draw(-.2);
  let revealed=0;
  for(let i=0;i<cut.length;i+=4) if (roof[i]>240 && cut[i+1]>240) revealed++;
  assert.ok(revealed>0);
  geometry.userData.glassStart=3;
  const glazed=draw(-.2);
  assert.ok(glazed.some((v,i)=>i%4===3 && v>0 && v<255));
  assert.ok(draw(-1).every(v=>v===0));
  geometry.dispose(); mesh.material.dispose();
});

test("the section presets lie above their floor and below the next floor", () => {
  const floors=Object.keys(TAKI_FLOOR_Y);
  floors.forEach((floor,i) => {
    assert.ok(TAKI_CUT_Y[floor]>TAKI_FLOOR_Y[floor]);
    assert.ok(TAKI_CUT_Y[floor]<(TAKI_FLOOR_Y[floors[i+1]] ?? TAKI_CUT_Y.all));
  });
});

test("cutting the loaded mesh preserves screen registration, including after a pan and anchored zoom", async t => {
  const buffer=new TextEncoder().encode([
    "ply","format ascii 1.0","element vertex 3","property short x","property short y","property short z",
    "property uchar red","property uchar green","property uchar blue",
    "element face 1","property list uchar ushort vertex_indices","end_header",
    "-3000 -1500 -1000 255 0 0","3000 -1500 1000 0 255 0","0 3000 1200 0 0 255","3 0 1 2",
  ].join("\n")).buffer;
  let frame, project, downloads=0;
  let responseBytes=buffer;
  const globals = {
    document:{ createElement:canvas2D }, window:{ devicePixelRatio:1 },
    requestAnimationFrame(cb) { frame=cb; return 1; }, cancelAnimationFrame() {},
    ResizeObserver:class { observe() {} disconnect() {} },
    async fetch(path) {
      assert.equal(path,"/map-3d/taki-preview/plaza.ply.gz"); downloads++;
      return {ok:true,arrayBuffer:async()=>responseBytes};
    },
  };
  let view;
  t.after(()=>view?.dispose());
  for (const [key,value] of Object.entries(globals)) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]);
  }
  const stage={clientWidth:160,clientHeight:100,replaceChildren(){}};
  view=createTakiPreview(stage,p=>{project=p;});
  await view.load(); frame();
  const marker=[1,1,-.5];
  const initial=project(marker);
  view.setCut(-1); frame();
  assert.deepEqual(project(marker),initial);
  view.scale(1.2,...initial); frame();
  const zoomed=project(marker);
  assert.ok(Math.hypot(zoomed[0]-initial[0],zoomed[1]-initial[1])<1e-8);
  view.pan(4,3); frame();
  const moved=project(marker);
  assert.ok(Math.hypot(moved[0]-initial[0]-4,moved[1]-initial[1]-3)<1e-8);
  view.setCut(1); frame();
  assert.deepEqual(project(marker),moved);
  await view.load("B1F"); frame();
  assert.deepEqual(project(marker),moved);
  assert.equal(downloads,1);
  const gzip=gzipSync(new Uint8Array(buffer));
  responseBytes=Uint8Array.from(gzip).buffer;
  for (const backend of ["native","fallback"]) {
    await t.test(`a gzip response reconstructs the same mesh with the ${backend} decoder`, async sub => {
      if (backend==="fallback") {
        const original=Object.getOwnPropertyDescriptor(globalThis,"DecompressionStream");
        Object.defineProperty(globalThis,"DecompressionStream",{ configurable:true, value:undefined });
        sub.after(()=>Object.defineProperty(globalThis,"DecompressionStream",original));
      }
      // Each independently opened module has a fresh, empty model-download cache.
      const module=await import(`../campus-sns/takiPlazaPreview.js?decoder=${backend}`);
      const other=module.createTakiPreview(stage,p=>{project=p;});
      sub.after(()=>other.dispose());
      await other.load(); frame();
      assert.deepEqual(project(marker),initial);
    });
  }
});
