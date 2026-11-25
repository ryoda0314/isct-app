import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { boundsOf, distance, inside, interpolate } from "../yokohama/navigation.js";

const clamp=THREE.MathUtils.clamp;
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
  let localShadows=false;
  function placeShadows(walk) {
    const x=walk?free.x:cx,z=walk?free.z:cz;
    if(walk===localShadows && (!walk||Math.hypot(x-sun.target.position.x,z-sun.target.position.z)<34))return;
    const y=walk?floor(x,z):0,radius=walk?106:shadowRadius;
    sun.target.position.set(x,y,z);
    sun.position.copy(sun.target.position).add(sunlight);
    Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:walk?530:1,far:walk?1050:1600});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias=walk?-.00013:-.00025;sun.shadow.normalBias=walk?.047:.12;
    renderer.shadowMap.needsUpdate=true;localShadows=walk;
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
    const position=new THREE.Vector3(anchor[0],(p.footprint?groundAt:floor)(...anchor)+(p.height||0)+3,anchor[1]);
    return {p,node,position};
  });
  for(const tag of tags){
    tag.width=tag.node.offsetWidth;
    tag.height=tag.node.offsetHeight;
  }
  let selectedId=null, routeMesh=null, routeDisplay=[], walking=false, saved=null, free=nilWalk();
  let lastTime=0, movingPointer=null, pointerStart=null, lastPose=0;
  const stick={x:0,y:0}, keys=new Set(),projected=new THREE.Vector3();
  let inputOff=false, runOn=false, gpsPos=null, rotated=false;
  const gpsNode=document.createElement("div");gpsNode.className="yh-gps";gpsNode.hidden=true;labels.append(gpsNode);
  const raycaster=new THREE.Raycaster();
  function nilWalk() {return {x:0,z:0,yaw:0,pitch:0,up:0,vertical:0};}
  const bounds3d=volume.flatMap(b=>b.footprint.map(([x,z])=>new THREE.Vector3(x,b.base+b.height,z)));
  for(const [x,z] of world.overviewGroundPoints||[])bounds3d.push(new THREE.Vector3(x,floor(x,z),z));
  function framePoints(points,route=false) {
    if(!points.length || walking)return;
    const center=new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const narrow=camera.aspect<.86;
    const direction=new THREE.Vector3(narrow ? .04 : world.overviewX ?? -.63,route||narrow ? 1.8 : world.overviewY ?? 1.12,1).normalize();
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
    if(!free.framingFov)return 71;
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
    free={...nilWalk(),x:start[0],z:start[1],eyeFloor:floor(...start),yaw:Math.atan2(toward[0]-start[0],start[1]-toward[1]),pitch,framingFov,framingAspect};
    walking=true;lastPose=-Infinity;controls.enabled=false;labels.hidden=true;scene.fog.density=.00062;
    camera.fov=walkingFov();camera.updateProjectionMatrix();canvas.focus({preventScroll:true});schedule();return true;
  }
  function leave() {
    if(!walking) return;
    if(document.pointerLockElement===canvas)document.exitPointerLock?.();
    walking=false;runOn=false;inputOff=false;controls.enabled=true;labels.hidden=false;scene.fog.density=.00023;keys.clear();stick.x=stick.y=0;
    camera.rotation.order="XYZ";camera.fov=saved.fov;camera.updateProjectionMatrix();
    camera.position.copy(saved.pos);controls.target.copy(saved.target);controls.update();schedule();
  }
  function advance(dt) {
    const k=inputOff?NO_KEYS:keys, st=inputOff?NO_STICK:stick;
    const forward=+(k.has("KeyW")||k.has("ArrowUp"))-+(k.has("KeyS")||k.has("ArrowDown"))-st.y;
    const side=+k.has("KeyD")-+k.has("KeyA")+st.x;
    free.yaw+=(+k.has("ArrowRight")-+k.has("ArrowLeft"))*dt*1.55;
    const speed=(k.has("ShiftLeft")||k.has("ShiftRight")||runOn?5.5:2.8)*dt/Math.max(1,Math.hypot(forward,side));
    const dx=(Math.sin(free.yaw)*forward+Math.cos(free.yaw)*side)*speed;
    const dz=(-Math.cos(free.yaw)*forward+Math.sin(free.yaw)*side)*speed;
    function pass(x,z) {return !walkBlocked(x,z) && Math.abs(floor(x,z)-floor(free.x,free.z))<.7;}
    if(dx && pass(free.x+dx,free.z)) free.x+=dx;
    if(dz && pass(free.x,free.z+dz)) free.z+=dz;
    if(free.up>0 || free.vertical>0) {
      free.vertical-=9.81*dt;free.up=Math.max(0,free.up+free.vertical*dt);
      if(!free.up)free.vertical=0;
    }
    const ground=floor(free.x,free.z);
    // Let the view settle over a tread without changing the collision surface
    // or the jump height. The filter uses elapsed time, including after release.
    const lag=world.stepResponse?clamp((ground-free.eyeFloor)*Math.exp(-dt/world.stepResponse),-.19,.19):0;
    free.eyeFloor=ground-(Math.abs(lag)>.001?lag:0);
    camera.position.set(free.x,free.eyeFloor+(k.has("KeyC")?1.15:1.65)+free.up,free.z); // C でしゃがむ
    camera.rotation.set(free.pitch,-free.yaw,0,"YXZ");
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
        a.position.distanceToSquared(camera.position)-b.position.distanceToSquared(camera.position));
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
    if(walking && (keys.size||stick.x||stick.y||free.up||free.vertical||free.eyeFloor!==floor(free.x,free.z)))schedule();
  }
  function onResize() {
    const w=host.clientWidth,h=host.clientHeight;
    renderer.setSize(Math.max(1,w),Math.max(1,h),false);camera.aspect=Math.max(1,w)/Math.max(1,h);
    if(walking)camera.fov=walkingFov();
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
  listen(canvas,"pointermove",e=>{
    if(walking&&document.pointerLockElement===canvas) {
      if(inputOff)return;
      free.yaw+=e.movementX*.0026;free.pitch=clamp(free.pitch-e.movementY*.0026,-1.32,1.32);schedule();return;
    }
    if(!walking || movingPointer?.id!==e.pointerId)return;
    // 縦に持ったスマホで横に回して描いているとき（setRotated）は、画面の上の指の動きを絵の向きに直す
    let ddx=e.clientX-movingPointer.x,ddy=e.clientY-movingPointer.y;
    if(rotated){const s=ddx;ddx=ddy;ddy=-s;}
    free.yaw+=ddx*.004;free.pitch=clamp(free.pitch-ddy*.004,-1.32,1.32);
    movingPointer.x=e.clientX;movingPointer.y=e.clientY;schedule();
  });
  listen(canvas,"pointerup",e=>{
    if(!walking && e.button===0 && pointerStart && Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<5)pick(e);
    pointerStart=null;if(movingPointer?.id===e.pointerId)movingPointer=null;
  });
  listen(canvas,"pointercancel",()=>{pointerStart=null;movingPointer=null;});
  listen(document,"pointerlockchange",()=>onLock?.(document.pointerLockElement===canvas));
  listen(canvas,"contextmenu",e=>{if(walking)e.preventDefault();}); // 歩いているあいだの右クリックは「持ち物を使う」
  const walkKeys=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight","Space","KeyC"];
  listen(window,"keydown",e=>{
    if(!walking || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
    if(e.code==="Escape"){onExit();return;}
    if(inputOff||!walkKeys.includes(e.code))return;
    e.preventDefault();keys.add(e.code);
    if(e.code==="Space" && !e.repeat && !free.up && !free.vertical)free.vertical=4.2;
    schedule();
  });
  listen(window,"keyup",e=>{keys.delete(e.code);if(walking)schedule();});
  listen(window,"blur",()=>{keys.clear();stick.x=stick.y=0;movingPointer=null;});
  listen(canvas,"webglcontextlost",e=>{e.preventDefault();onError();});
  controls.addEventListener("change",schedule);
  const observer=new ResizeObserver(onResize);observer.observe(host);onResize();fit();
  return {fit,fitRoute,focus,zoom,northUp,walk,leave,setRoute,
    move(x,y){if(inputOff)return;stick.x=x;stick.y=y;schedule();},
    jump(){if(walking&&!inputOff&&!free.up&&!free.vertical){free.vertical=4.2;schedule();}},
    setRun(on){runOn=!!on;},
    setRotated(on){rotated=!!on;},
    // メニュー・スマホ・持ち物の画面を開いているあいだは歩かない（マウスも離す）
    setInputOff(on){inputOff=!!on;if(inputOff){keys.clear();stick.x=stick.y=0;movingPointer=null;if(document.pointerLockElement===canvas)document.exitPointerLock?.();}schedule();},
    pose(){return walking?[free.x,free.z,free.yaw]:null;},
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
