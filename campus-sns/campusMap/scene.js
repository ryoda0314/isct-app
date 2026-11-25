import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { boundsOf, distance, inside, interpolate } from "../yokohama/navigation.js";
import { AIR_STEP, EYE, PITCH, PROBE, SPEED, SPRINT_FOV, STEP, WALK_FOV, stepBody, stepWalkView } from "../campus3dWalkCore.js";

const clamp=THREE.MathUtils.clamp;
const DEG=Math.PI/180;

// 歩く体の動きは大岡山と同じ（campus3dWalkCore の stepBody・stepWalkView。2026-11-26 ユーザー「動きとか操作したときの感覚が違いすぎて
// びっくりした。大岡山キャンパスのほうに合わせてほしい」）。体は大岡山の平面の向き（x 東・y 北・z 上、向きは北から時計回りの度、pitch は
// MapLibre と同じ 90 が水平）で動かし、three.js（x 東・z 南・y 上）へ写す。足場と壁は、この地図の floor（歩ける面の高さ）と walkBlocked
// （建物・植え込みなど。体の太さぶん広げた判定）を、大岡山の walkWorld と同じ約束（move・surfacesAt・floorBelow・blocked）で渡す
function bodyWorld(floor,walkBlocked) {
  const ground=(x,y)=>floor(x,-y);
  const blocked=(x,y)=>walkBlocked(x,-y);
  const floorBelow=(x,y,ref)=>{const g=ground(x,y);return Number.isFinite(g)&&g<=ref?{z:g,deck:null}:null;};
  const surfacesAt=(x,y)=>{const g=ground(x,y);return Number.isFinite(g)?[{z:g,deck:null}]:[];};
  // (x0, y0)・足の高さ z0 から (dx, dy) 動く。ぶつかったら東西だけ・南北だけ・斜めにずらした向きへすべる（大岡山の move と同じ順）。
  // 地面にいれば STEP m まで上る（空中では AIR_STEP）。少し先（PROBE m）が壁なら進まない。しゃがんでいればふちから落ちない
  const move=(x0,y0,z0,dx,dy,{onGround=true,sneak=false}={})=>{
    const step=onGround?STEP:AIR_STEP;
    const test=(nx,ny)=>{
      if(blocked(nx,ny))return null;
      const f=floorBelow(nx,ny,z0+step);
      if(!f)return null;
      const d=Math.hypot(nx-x0,ny-y0);
      if(d>1e-6) {
        const ux=(nx-x0)/d,uy=(ny-y0)/d;
        if(!floorBelow(x0+ux*PROBE,y0+uy*PROBE,z0+step))return null;
        const q=floorBelow(nx+ux*.15,ny+uy*.15,z0+step);
        if(onGround&&sneak&&z0-Math.min(f.z,q?q.z:f.z)>STEP)return null;
      }
      return {x:nx,y:ny,floor:f};
    };
    const full=test(x0+dx,y0+dy);
    if(full)return {...full,hit:false};
    const tries=[];
    if(Math.abs(dx)>1e-9)tries.push([dx,0]);
    if(Math.abs(dy)>1e-9)tries.push([0,dy]);
    for(const a of [45,-45,70,-70]) {const c=Math.cos(a*DEG),sn=Math.sin(a*DEG);tries.push([(dx*c-dy*sn)*c,(dx*sn+dy*c)*c]);}
    for(const [mx,my] of tries) {const r=test(x0+mx,y0+my);if(r)return {...r,hit:true};}
    return {x:x0,y:y0,floor:floorBelow(x0,y0,z0+step),hit:true};
  };
  return {move,surfacesAt,floorBelow,blocked:(x,y)=>blocked(x,y)};
}
const inBuilding=(p,b)=>inside(p,b.footprint) && !b.holes?.some(h=>inside(p,h));

function release(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(obj=>{
    if(obj.geometry) geometries.add(obj.geometry);
    for(const mat of [].concat(obj.material||[])) materials.add(mat);
    if(obj.isInstancedMesh) obj.dispose();
  });
  for(const mat of materials) {
    for(const value of Object.values(mat)) if(value?.isTexture) textures.add(value);
    mat.dispose();
  }
  for(const tex of textures) tex.dispose();
  for(const geo of geometries) geo.dispose();
}

// 2026-11-25 大岡山の歩くモードにそろえる：PC はクリックでマウスを捕まえて見回す（ポインターロック。onLock で知らせる）・C でしゃがむ・
// 走る（スマホのボタン setRun）・ジャンプ（jump）・入力を止める（メニューやスマホを開いているあいだ setInputOff）・写真（capture）・
// いまの位置（pose）・現在地の印（setGps・focusPoint）
const NO_KEYS=new Set(), NO_STICK={x:0,y:0};
export function createCampusScene(host, {onPick,onExit,onPose,onError,onBearing,onLock,places}, world) {
  const {name, campus, volume, paths, groundAt, floor, walkBlocked, createModels} = world;
  const canvas=document.createElement("canvas");
  const context=canvas.getContext("webgl2",{antialias:true,alpha:false,powerPreference:"high-performance"}) ||
    canvas.getContext("webgl2",{antialias:false,alpha:false});
  if(!context)throw new Error("WebGL2 unavailable");
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:context.getContextAttributes().antialias});
  canvas.setAttribute("aria-label",name+"の3D地図");
  canvas.tabIndex=0;
  host.prepend(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.6));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xddeaf1);
  scene.fog=new THREE.FogExp2(0xddeaf1,.00023);
  const sunlight=new THREE.Vector3(...(world.sunlight||[-320,620,270]));
  const sky=new THREE.Mesh(new THREE.SphereGeometry(3600,36,18),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{sunDirection:{value:world.sunlight?sunlight.clone().normalize():new THREE.Vector3(-.52,.79,.44).normalize()}},
    vertexShader:`varying vec3 dir;
      void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 dir;
      uniform vec3 sunDirection;
      float cloudHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
      float air(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(cloudHash(i),cloudHash(i+vec2(1.,0.)),f.x),mix(cloudHash(i+vec2(0.,1.)),cloudHash(i+1.),f.x),f.y);
      }
      float cloudField(vec2 p){
        float v=0.,weight=.56;
        mat2 turn=mat2(.84,.54,-.54,.84);
        for(int i=0;i<4;i++){v+=weight*air(p);p=2.12*turn*p+vec2(6.7,2.3);weight*=.49;}
        return v;
      }
      void main(){
        vec3 d=normalize(dir);
        float h=clamp(d.y,0.0,1.0);
        vec3 base=mix(vec3(.77,.85,.89),vec3(.20,.48,.79),pow(h,.52));
        float light=max(dot(d,sunDirection),0.0);
        if(h>.035){
          vec2 q=d.xz/(h+.072)*1.42+vec2(21.4,10.7);
          float cloud=cloudField(q),cap=cloudField(q+vec2(-.15,.13));
          float density=smoothstep(.52,.72,cloud)*smoothstep(.035,.17,h);
          vec3 vapour=mix(vec3(.65,.74,.82),vec3(.98,.98,.94),smoothstep(-.028,.052,cloud-cap));
          base=mix(base,vapour,density*.83);
        }
        base+=vec3(.12,.09,.04)*pow(light,15.0)+vec3(.5,.44,.32)*smoothstep(.99965,.99997,light);
        gl_FragColor=vec4(base,1.0);
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=1000;scene.add(sky);
  const camera=new THREE.PerspectiveCamera(43,1,.32,5500);
  const controls=new OrbitControls(camera,canvas);
  controls.minPolarAngle=.08; controls.maxPolarAngle=1.43;
  controls.minDistance=12; controls.maxDistance=2000;
  controls.enableDamping=false;
  controls.screenSpacePanning=false;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  const hemi=new THREE.HemisphereLight(0xf1f8ff,0xa2a989,1.75);
  const sun=new THREE.DirectionalLight(0xfff1d7,2.15);
  const [cx,cz]=campus.center;
  sun.target.position.set(cx,0,cz);
  sun.position.copy(sun.target.position).add(sunlight);
  sun.castShadow=true;
  const shadowRadius=Math.max(campus.width,campus.depth)*.73+60;
  Object.assign(sun.shadow.camera,{left:-shadowRadius,right:shadowRadius,top:shadowRadius,bottom:-shadowRadius,near:1,far:1600});
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias=-.00025; sun.shadow.normalBias=.12;
  scene.add(hemi,sun,sun.target);
  let shadowMode="campus";
  function placeShadows(walk) {
    const close=!walk&&world.detailShadows&&camera.position.distanceTo(controls.target)<125;
    const mode=walk?"walk":close?"building":"campus";
    const x=walk?free.x:close?controls.target.x:cx,z=walk?free.z:close?controls.target.z:cz;
    const y=walk?floor(x,z):close?controls.target.y:0;
    if(mode===shadowMode&&(mode==="campus"||sun.target.position.distanceToSquared({x,y,z})<(close?12:34)**2))return;
    const radius=walk?106:close?64:shadowRadius,local=walk||close;
    sun.target.position.set(x,y,z);
    sun.position.copy(sun.target.position).add(sunlight);
    Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:local?530:1,far:local?1050:1600});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias=local?-.00013:-.00025;sun.shadow.normalBias=close?.028:walk?.047:.12;
    renderer.shadowMap.needsUpdate=true;shadowMode=mode;
  }
  let frame=0, disposed=false;
  const schedule=()=>{ if(!disposed && !frame) frame=requestAnimationFrame(draw); };
  scene.add(...createModels(THREE));
  const releaseReflections=world.prepareReflections?.(renderer,scene);
  const canSeeLabel=world.buildingSightlines?.(scene);
  const labels=document.createElement("div"); labels.className="yh-labels"; host.append(labels);
  const ns="http://www.w3.org/2000/svg";
  const overlay=document.createElementNS(ns,"svg");overlay.setAttribute("class","yh-route-overlay");
  overlay.setAttribute("aria-hidden","true");
  const halo=document.createElementNS(ns,"path"),line=document.createElementNS(ns,"path");
  for(const [path,color,width] of [[halo,"#fff",6],[line,"#087ba7",3.5]]) {
    path.setAttribute("fill","none");path.setAttribute("stroke",color);path.setAttribute("stroke-width",width);
    path.setAttribute("stroke-linejoin","round");path.setAttribute("stroke-linecap","round");overlay.append(path);
  }
  host.insertBefore(overlay,labels);
  const tags=places.filter(p=>!p.auxiliary).map(p=>{
    const node=document.createElement("button");
    node.type="button"; node.className="yh-tag"; node.textContent=p.mapLabel||p.id;
    node.setAttribute("aria-label",p.name);
    node.onclick=()=>onPick({id:p.id});
    labels.append(node);
    const anchor=p.labelPoint||p.point;
    const position=new THREE.Vector3(anchor[0],(p.footprint?groundAt:floor)(...anchor)+(p.height||0)+(p.labelLift??3),anchor[1]);
    return {p,node,position};
  });
  let selectedId=null, routeMesh=null, routeDisplay=[], walking=false, saved=null, free=nilWalk();
  let lastTime=0, movingPointer=null, pointerStart=null, lastPose=0;
  const stick={x:0,y:0}, keys=new Set(),projected=new THREE.Vector3();
  let inputOff=false, runOn=false, gpsPos=null, rotated=false;
  const gpsNode=document.createElement("div");gpsNode.className="yh-gps";gpsNode.hidden=true;labels.append(gpsNode);
  const raycaster=new THREE.Raycaster();
  // 歩く人：body が大岡山と同じ体（stepBody の状態）。x・z・yaw（ラジアン）・pitch（ラジアン、上が +）は three.js 向けの写し（ほかの所が読む）
  const walkWorld=bodyWorld(floor,walkBlocked);
  const touchDevice=typeof window!=="undefined"&&!!window.matchMedia?.("(pointer: coarse)").matches;
  const reducedMotion=typeof window!=="undefined"?window.matchMedia?.("(prefers-reduced-motion: reduce)"):null;
  function nilWalk() {return {x:0,z:0,yaw:0,pitch:0,body:null,eyeOff:0,bobPhase:0,bobAmp:0,fov:WALK_FOV,baseFov:WALK_FOV,sprintLatch:false,lastW:0,jumpUntil:0};}
  const bounds3d=volume.flatMap(b=>b.footprint.map(([x,z])=>new THREE.Vector3(x,b.base+b.height,z)));
  for(const [x,z] of world.overviewGroundPoints||[])bounds3d.push(new THREE.Vector3(x,floor(x,z),z));
  function framePoints(points,route=false,viewDirection) {
    if(!points.length || walking)return;
    const center=new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const narrow=camera.aspect<.86;
    const direction=new THREE.Vector3(...(viewDirection||[narrow ? .04 : world.overviewX ?? -.63,route||narrow ? 1.8 : world.overviewY ?? 1.12,1])).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right);
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),width=host.clientWidth,height=host.clientHeight;
    const bottom=Math.min(height*(route ? .31 : .16),route?212:100),top=52;
    const useY=Math.max(.42,1-(bottom+top)/height), useX=Math.max(.65,1-74/width);
    let dist=45;
    for(const p of points) {
      const v=p.clone().sub(center),near=v.dot(direction);
      dist=Math.max(dist,near+Math.abs(v.dot(right))/(tan*camera.aspect*useX),near+Math.abs(v.dot(up))/(tan*useY));
    }
    dist*=1.04;
    center.addScaledVector(up,(top-bottom)/height*tan*dist);
    controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,dist);
    controls.update();schedule();
  }
  function fit() {framePoints(bounds3d);}
  function fitRoute(route) {if(route?.points.length)framePoints(route.points.map(([x,z])=>new THREE.Vector3(x,floor(x,z),z)),true);}
  function focus(p) {
    selectedId=p?.id||null;
    if(walking || !p) {schedule();return;}
    const view=world.facilityViews?.[p.id];
    if(view){framePoints(view.points.map(v=>new THREE.Vector3(...v)),false,view.direction);return;}
    const [x,z]=p.point, height=p.height||0, box=p.footprint?boundsOf(p.footprint):null;
    const span=Math.max(30,height,(box?.width||0)*.7,(box?.depth||0)*.7);
    const dx=p.approach[0]-x,dz=p.approach[1]-z;
    const dir=new THREE.Vector3(dx,0,dz);
    if(dir.length()<2) dir.set(-.65,0,1);
    dir.normalize();
    controls.target.set(x,groundAt(x,z)+height*.37,z);
    camera.position.copy(controls.target).addScaledVector(dir,span*(camera.aspect<.9?3.4:2.3)+15);
    camera.position.y+=span*1.08+13;
    controls.update();schedule();
  }
  function zoom(factor) {
    camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
    controls.update();schedule();
  }
  function northUp() {
    const offset=camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target).add(new THREE.Vector3(0,offset.y,Math.hypot(offset.x,offset.z)));
    controls.update();schedule();
  }
  function setRoute(route) {
    routeDisplay=(route?.points||[]).map(([x,z])=>new THREE.Vector3(x,floor(x,z)+.32,z));
    if(routeMesh){scene.remove(routeMesh);release(routeMesh);routeMesh=null;}
    if(route?.points.length>1) {
      const vertices=[];
      for(let i=1;i<route.points.length;i++) {
        const a=route.points[i-1],b=route.points[i],len=distance(a,b);
        if(len<.02)continue;
        const nx=(b[1]-a[1])/len*.78,nz=(a[0]-b[0])/len*.78;
        const steps=Math.ceil(len/1.8);
        for(let j=0;j<steps;j++) {
          const s=interpolate(a,b,j/steps), e=interpolate(a,b,(j+1)/steps);
          for(const [p,sign] of [[s,1],[s,-1],[e,1],[e,1],[s,-1],[e,-1]]) {
            const x=p[0]+nx*sign,z=p[1]+nz*sign;
            vertices.push(x,Math.max(floor(...p),floor(x,z))+.22,z);
          }
        }
      }
      const geom=new THREE.BufferGeometry();geom.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      routeMesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({color:0x087faf,side:THREE.DoubleSide}));
      scene.add(routeMesh);
    }
    schedule();
  }
  function walkingFov() {
    if(!free.framingFov)return WALK_FOV;
    const tan=Math.tan(THREE.MathUtils.degToRad(free.framingFov/2));
    const aspectFraction=Math.min(1,Math.max(.1,camera.aspect/free.framingAspect));
    return Math.min(106,2*THREE.MathUtils.radToDeg(Math.atan(tan/aspectFraction)));
  }
  function walk(point,toward,pitch=0,framingFov,framingAspect=1) {
    if(!walking) saved={pos:camera.position.clone(),target:controls.target.clone(),fov:camera.fov};
    let start=point;
    if(walkBlocked(...point)) {
      const candidates=paths.filter(p=>p.walkable!==false).flatMap(p=>p.points);
      start=candidates.filter(p=>distance(p,point)<55 && !walkBlocked(...p)).sort((a,b)=>distance(point,a)-distance(point,b))[0];
      if(!start) return false;
    }
    const yaw=Math.atan2(toward[0]-start[0],start[1]-toward[1]);
    free={...nilWalk(),x:start[0],z:start[1],yaw,pitch,framingFov,framingAspect};
    // pitch（ラジアン、上が +）→ 体の pitch（MapLibre と同じ度：90 が水平）。向きは北から時計回りの度
    free.body={x:start[0],y:-start[1],z:floor(...start),vx:0,vy:0,vz:0,onGround:true,deck:null,yaw:((yaw/DEG)%360+360)%360,
      pitch:clamp(90+pitch/DEG,PITCH.min,PITCH.max)};
    free.baseFov=free.fov=walkingFov();
    walking=true;lastPose=-Infinity;controls.enabled=false;labels.hidden=true;scene.fog.density=.00062;
    camera.fov=free.fov;camera.updateProjectionMatrix();canvas.focus({preventScroll:true});advance(0);schedule();return true;
  }
  function leave() {
    if(!walking) return;
    if(document.pointerLockElement===canvas)document.exitPointerLock?.();
    walking=false;runOn=false;inputOff=false;controls.enabled=true;labels.hidden=false;scene.fog.density=.00023;keys.clear();stick.x=stick.y=0;
    camera.rotation.order="XYZ";camera.fov=saved.fov;camera.updateProjectionMatrix();
    camera.position.copy(saved.pos);controls.target.copy(saved.target);controls.update();schedule();
  }
  // 1 フレーム歩く：入力の読み方・体の動き・目（段の追いつき・揺れ・走るときの画角）は大岡山の walkTick と同じ
  function advance(dt) {
    const k=inputOff?NO_KEYS:keys, st=inputOff?NO_STICK:stick;
    const key=(...codes)=>codes.some(c=>k.has(c))?1:0;
    const fwd=key("KeyW","ArrowUp")-key("KeyS","ArrowDown")-st.y;
    const side=key("KeyD","ArrowRight")-key("KeyA","ArrowLeft")+st.x; // 矢印の左右は横歩き（大岡山と同じ。向きは Q・E）
    const turn=key("KeyE")-key("KeyQ");
    const look=key("KeyR","PageUp")-key("KeyF","PageDown");
    const sprint=runOn||free.sprintLatch||k.has("ShiftLeft")||k.has("ShiftRight");
    const sneak=k.has("KeyC");
    const jump=!inputOff&&(k.has("Space")||performance.now()<free.jumpUntil);
    const s0=free.body;
    const s=stepBody(s0,{fwd,side,turn,jump,sprint,sneak,autoJump:touchDevice},dt,walkWorld);
    s.pitch=clamp(s.pitch+look*80*dt,PITCH.min,PITCH.max);
    if(s.onGround&&!s0.onGround)free.jumpUntil=0; // 着地したら、押したジャンプは使い終わり（押しつづけている Space はまた跳ぶ）
    const stepDistance=s.onGround?Math.hypot(s.x-s0.x,s.y-s0.y):0;
    free.body=s;
    free.eyeOff=(free.eyeOff-(s.stepUp||0))*Math.exp(-dt*12);
    const hs=Math.hypot(s.vx,s.vy);
    const fovTarget=free.baseFov+(sprint&&hs>SPEED.walk+.3?SPRINT_FOV:0);
    free.fov+=(fovTarget-free.fov)*Math.min(1,dt*8);
    const gait=stepWalkView(free,stepDistance,dt,free.fov,!s.onGround||!!reducedMotion?.matches);
    const pitch=(clamp(s.pitch+gait.pitch,PITCH.min,PITCH.max)-90)*DEG, yaw=(s.yaw+gait.yaw)*DEG;
    camera.position.set(s.x,s.z+EYE+free.eyeOff+gait.height,-s.y);
    camera.rotation.set(pitch,-yaw,0,"YXZ");
    if(Math.abs(camera.fov-free.fov)>.05) {camera.fov=free.fov;camera.updateProjectionMatrix();}
    // three.js 向けの写し（現在地の印・地図の向き・影・スマホナビが読む）
    free.x=s.x;free.z=-s.y;free.yaw=s.yaw*DEG;free.pitch=(s.pitch-90)*DEG;
    // まだ動いている（止まりかけ・空中・段の追いつき・揺れ・画角）あいだは描きつづける
    free.busy=hs>.01||!s.onGround||Math.abs(free.eyeOff)>.002||free.bobAmp>.002||Math.abs(fovTarget-free.fov)>.05;
  }
  function draw(now) {
    frame=0;if(disposed)return;
    if(walking) advance(Math.min(.08,(now-lastTime)/1000 || .016));
    lastTime=now;
    const near=walking?.16:clamp(camera.position.distanceTo(controls.target)/90,.35,6);
    if(Math.abs(near-camera.near)>.01) {camera.near=near;camera.updateProjectionMatrix();}
    placeShadows(walking);
    sky.position.copy(camera.position);renderer.render(scene,camera);
    overlay.style.display=walking||!routeDisplay.length?"none":"";
    if(!walking) {
      const azimuth=controls.getAzimuthalAngle();
      onBearing?.(Math.atan2(Math.sin(azimuth),Math.cos(azimuth)*Math.cos(controls.getPolarAngle())));
      // 現在地の印（青い点。画面の上でいつも同じ大きさ）
      if(gpsPos) {
        projected.copy(gpsPos).project(camera);
        const show=projected.z<1&&projected.z>0;
        gpsNode.hidden=!show;
        if(show){gpsNode.style.left=((projected.x+1)*host.clientWidth/2).toFixed(1)+"px";gpsNode.style.top=((1-projected.y)*host.clientHeight/2).toFixed(1)+"px";}
      } else gpsNode.hidden=true;
      if(routeDisplay.length) {
        let d="",move=true;
        for(const point of routeDisplay) {
          projected.copy(point).project(camera);
          if(projected.z>=1 || projected.z<0) {move=true;continue;}
          d+=(move?"M":"L")+((1+projected.x)*host.clientWidth/2).toFixed(1)+" "+((1-projected.y)*host.clientHeight/2).toFixed(1);
          move=false;
        }
        line.setAttribute("d",d);halo.setAttribute("d",d);
      }
      const near=camera.position.distanceTo(controls.target)<235;
      const occupied=[];
      const width=host.clientWidth,height=host.clientHeight;
      const priority=tags.slice().sort((a,b)=>Number(b.p.id===selectedId)-Number(a.p.id===selectedId)||Number(b.p.featured)-Number(a.p.featured)||
        (canSeeLabel?a.position.distanceToSquared(camera.position)-b.position.distanceToSquared(camera.position):0));
      for(const {p,node,position,width:tagWidth,height:tagHeight} of priority) {
        projected.copy(position).project(camera);
        const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
        const chosen=p.id===selectedId;
        const half=tagWidth/2,cx=clamp(x,half+2,width-half-2);
        const left=cx-half,right=cx+half,top=y-tagHeight,gap=near?4:10;
        const show=(chosen||p.featured||near) && projected.z<1 && projected.z>0 && x>18 && x<width-18 && top>1 && y<height-2 &&
          !occupied.some(q=>left<q.right+gap && right>q.left-gap && top<q.bottom+4 && y>q.top-4) &&
          (!canSeeLabel || canSeeLabel(camera.position,position,p.id));
        node.hidden=!show;
        if(show) {occupied.push({left,right,top,bottom:y});node.style.left=cx+"px";node.style.top=y+"px";node.classList.toggle("selected",chosen);}
      }
    }
    if(walking && (now-lastPose>180 || !(keys.size||stick.x||stick.y))) {lastPose=now;onPose?.([free.x,free.z,free.yaw]);}
    if(walking && (keys.size||stick.x||stick.y||free.busy||performance.now()<free.jumpUntil))schedule();
  }
  function onResize() {
    const w=host.clientWidth,h=host.clientHeight;
    renderer.setSize(Math.max(1,w),Math.max(1,h),false);camera.aspect=Math.max(1,w)/Math.max(1,h);
    if(w&&h&&!labels.hidden){
      const unmeasured=tags.filter(t=>!t.width);
      for(const {node} of unmeasured)node.hidden=false;
      for(const tag of unmeasured){tag.width=tag.node.offsetWidth;tag.height=tag.node.offsetHeight;}
    }
    if(walking){free.baseFov=walkingFov();free.fov=free.baseFov;camera.fov=free.fov;}
    camera.updateProjectionMatrix();schedule();
  }
  function pick(e) {
    const rect=canvas.getBoundingClientRect(), uv=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
    raycaster.setFromCamera(uv,camera);
    const ray=raycaster.ray, pos=new THREE.Vector3();
    // Intersect each vertical shell and its roof analytically so a facade can be tapped at street level.
    let first=Infinity,id=null;
    for(const b of volume) {
      const roof=b.base+b.height;
      const topT=(roof-ray.origin.y)/ray.direction.y;
      if(topT>=0 && topT<first) {
        ray.at(topT,pos);
        if(inBuilding([pos.x,pos.z],b)){first=topT;id=b.id;}
      }
      for(let i=0;i<b.footprint.length;i++) {
        const a=b.footprint[i],c=b.footprint[(i+1)%b.footprint.length],vx=c[0]-a[0],vz=c[1]-a[1];
        const ox=a[0]-ray.origin.x,oz=a[1]-ray.origin.z, det=ray.direction.x*vz-ray.direction.z*vx;
        if(Math.abs(det)<1e-7) continue;
        const t=(ox*vz-oz*vx)/det, u=(ox*ray.direction.z-oz*ray.direction.x)/det, y=ray.origin.y+t*ray.direction.y;
        if(t>=0 && t<first && u>=0 && u<=1 && y>=b.base-2 && y<=roof){first=t;id=b.id;}
      }
    }
    for(let t=0;t<Math.min(2800,first);t+=3) {
      ray.at(t,pos);
      if(pos.y<=floor(pos.x,pos.z)) {onPick({point:[pos.x,pos.z]});return;}
    }
    if(id)onPick({id});
  }
  const abort=new AbortController();
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:abort.signal});
  listen(canvas,"pointerdown",e=>{
    if(walking) {
      // PC（マウス）：クリックでマウスを捕まえて見回す（大岡山と同じ。Esc で離す）。捕まえられない環境はドラッグで見回す
      if(e.pointerType==="mouse") {
        if(e.button===0&&!inputOff&&document.pointerLockElement!==canvas&&canvas.requestPointerLock){try{canvas.requestPointerLock()?.catch?.(()=>{});}catch{/* ドラッグで */}}
        if(document.pointerLockElement===canvas)return;
      }
      if(movingPointer && movingPointer.id!==e.pointerId)return;
      movingPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
    }else if(e.isPrimary)pointerStart={x:e.clientX,y:e.clientY};else pointerStart=null;
  });
  // 見回す（大岡山と同じ速さ：捕まえたマウス 0.13 度/px・マウスのドラッグ 0.2・指 0.3。上下は真上・真下の手前まで）
  const lookBy=(dx,dy,perPx)=>{
    const b=free.body;
    if(!b)return;
    b.yaw=((b.yaw+dx*perPx)%360+360)%360;
    b.pitch=clamp(b.pitch-dy*perPx,PITCH.min,PITCH.max);
    schedule();
  };
  listen(canvas,"pointermove",e=>{
    if(walking&&document.pointerLockElement===canvas) {
      if(inputOff)return;
      lookBy(e.movementX,e.movementY,.13);return;
    }
    if(!walking || movingPointer?.id!==e.pointerId)return;
    // 縦に持ったスマホで横に回して描いているとき（setRotated）は、画面の上の指の動きを絵の向きに直す
    let ddx=e.clientX-movingPointer.x,ddy=e.clientY-movingPointer.y;
    if(rotated){const s=ddx;ddx=ddy;ddy=-s;}
    lookBy(ddx,ddy,e.pointerType==="mouse"?.2:.3);
    movingPointer.x=e.clientX;movingPointer.y=e.clientY;
  });
  listen(canvas,"pointerup",e=>{
    if(!walking && e.button===0 && pointerStart && Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<5)pick(e);
    pointerStart=null;if(movingPointer?.id===e.pointerId)movingPointer=null;
  });
  listen(canvas,"pointercancel",()=>{pointerStart=null;movingPointer=null;});
  listen(document,"pointerlockchange",()=>onLock?.(document.pointerLockElement===canvas));
  listen(canvas,"contextmenu",e=>{if(walking)e.preventDefault();}); // 歩いているあいだの右クリックは「持ち物を使う」
  // 歩くキー（大岡山の WALK_KEYS と同じ：Q・E で向き、R・F で見上げる・見下ろす、W を 2 回でダッシュ。Space は押しているあいだ跳ぶ）
  const walkKeys=["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","KeyR","KeyF","KeyC","Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown","ShiftLeft","ShiftRight"];
  listen(window,"keydown",e=>{
    if(!walking || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
    if(e.code==="Escape"){onExit();return;}
    if(inputOff||!walkKeys.includes(e.code))return;
    e.preventDefault();
    if(e.code==="KeyW"&&!e.repeat) {
      const t=performance.now();
      if(t-free.lastW<300)free.sprintLatch=true; // W を 2 回でダッシュ（W を離すまで）
      free.lastW=t;
    }
    keys.add(e.code);
    schedule();
  });
  listen(window,"keyup",e=>{keys.delete(e.code);if(e.code==="KeyW")free.sprintLatch=false;if(walking)schedule();});
  listen(window,"blur",()=>{keys.clear();stick.x=stick.y=0;movingPointer=null;free.sprintLatch=false;});
  listen(canvas,"webglcontextlost",e=>{e.preventDefault();onError();});
  controls.addEventListener("change",schedule);
  const observer=new ResizeObserver(onResize);observer.observe(host);onResize();fit();
  return {fit,fitRoute,focus,zoom,northUp,walk,leave,setRoute,
    move(x,y){if(inputOff)return;stick.x=x;stick.y=y;schedule();},
    // ジャンプのボタン（スマホ）：押したとき少しのあいだ Space と同じ（地面にいれば跳ぶ）
    jump(){if(walking&&!inputOff){free.jumpUntil=performance.now()+150;schedule();}},
    setRun(on){runOn=!!on;},
    setRotated(on){rotated=!!on;},
    // メニュー・スマホ・持ち物の画面を開いているあいだは歩かない（マウスも離す）
    setInputOff(on){inputOff=!!on;if(inputOff){keys.clear();stick.x=stick.y=0;movingPointer=null;if(document.pointerLockElement===canvas)document.exitPointerLock?.();}schedule();},
    pose(){return walking?[free.x,free.z,free.yaw]:null;},
    // いまの体（大岡山の stepBody と同じ形）と画角・目の高さ（確かめ用。読むだけ）
    walkState(){return walking&&free.body?{...free.body,fov:free.fov,eye:camera.position.y}:null;},
    // 写真：いまの絵をその場で描いて JPEG に（描いた直後なら描画の中身が読める）
    capture(){return new Promise(res=>{try{sky.position.copy(camera.position);renderer.render(scene,camera);canvas.toBlob(b=>res(b),"image/jpeg",.9);}catch{res(null);}});},
    // 現在地：[x, z]（キャンパスの m）か null。focusPoint は上からの視点のままそこへ寄る
    setGps(p){gpsPos=p?new THREE.Vector3(p[0],floor(p[0],p[1])+.6,p[1]):null;schedule();},
    focusPoint(p){
      if(walking||!p)return;
      const off=camera.position.clone().sub(controls.target);
      off.setLength(clamp(off.length(),90,260));
      controls.target.set(p[0],floor(p[0],p[1]),p[1]);
      camera.position.copy(controls.target).add(off);
      controls.update();schedule();
    },
    dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();controls.dispose();releaseReflections?.();release(scene);sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();overlay.remove();labels.remove();},
  };
}
