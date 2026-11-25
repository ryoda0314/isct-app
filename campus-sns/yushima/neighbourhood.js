import { blocks, groves, streets } from "./neighbourhoodData.js";
import { boundsOf, inside } from "../yokohama/navigation.js";
import { spatialIndex } from "../yokohama/landscapeGeometry.js";
import { at, edges, orientedFrame } from "../yokohama/buildingsGeometry.js";
import { addContextStreets } from "./streetTerrain.js";

const footprints=blocks.map(([, , ,ring])=>({...boundsOf(ring),ring}));
const nearby=spatialIndex(24);
for(const b of footprints)nearby.add(b,b.left,b.top,b.right,b.bottom);
export function hitsNeighbourhood(x,z) {
  return nearby.near(x,z).some(b=>x>b.left&&x<b.right&&z>b.top&&z<b.bottom&&inside([x,z],b.ring));
}

// Bake the surrounding city into a single static mesh. Facade coordinates are
// measured in metres, so the window spacing stays fixed when the camera moves.
export function createNeighbourhood(T, ground, campusPaths, roadbed=ground) {
  const group=new T.Group(), vertices=[], colors=[], facade=[];
  const tint=new T.Color(), walls=[0xb7ada0,0xaea99f,0xa9aba6,0xc1b8aa,0xab9a8e,0xb3afa3,0xb8bcb8];
  const roofs=[0x999f9b,0xa3a39a,0x94989a,0x99968e];
  function triangle(a,b,c,color,uv) {
    vertices.push(...a,...b,...c);
    tint.setHex(color);
    for(let i=0;i<3;i++) {
      colors.push(tint.r,tint.g,tint.b);
      facade.push(...(uv?.[i]||[0,0,0]));
    }
  }
  function quad(a,b,c,d,color,uv) {
    triangle(a,b,c,color,uv&&[uv[0],uv[1],uv[2]]);
    triangle(a,c,d,color,uv&&[uv[0],uv[2],uv[3]]);
  }
  const xyz=(p,y)=>[p[0],y,p[1]];
  function cap(ring,height,color) {
    const pts=ring.map(([x,z])=>new T.Vector2(x,z));
    for(const [i,j,k] of T.ShapeUtils.triangulateShape(pts,[])) {
      triangle(xyz(ring[k],height),xyz(ring[j],height),xyz(ring[i],height),color);
    }
  }
  function volume(ring,base,top,wall,roof,glazing=0) {
    cap(ring,top,roof);
    ring.forEach((a,i)=>{
      const b=ring[(i+1)%ring.length],run=Math.hypot(b[0]-a[0],b[1]-a[1]),h=top-base;
      const uv=glazing&&run>2.5 ? [[0,0,glazing],[run,0,glazing],[run,h,glazing],[0,h,glazing]] : null;
      quad(xyz(a,base),xyz(b,base),xyz(b,top),xyz(a,top),wall,uv);
    });
  }
  function juntendo(ring,floor) {
    const [origin,north,,east]=ring;
    const width=Math.hypot(east[0]-origin[0],east[1]-origin[1]);
    const depth=Math.hypot(north[0]-origin[0],north[1]-origin[1]);
    const point=(u,v)=>[origin[0]+(east[0]-origin[0])*u/width+(north[0]-origin[0])*v/depth,
      origin[1]+(east[1]-origin[1])*u/width+(north[1]-origin[1])*v/depth];
    const pale=0xbda48f, pier=0xc9b09a, coping=0xc0b9a5, roofing=0x9d9a8e;
    const wing=(u0,v0,u1,v1,lo,hi,color=pale)=>volume(
      [point(u0,v0),point(u0,v1),point(u1,v1),point(u1,v0)],lo,hi,color,roofing);
    const tower=ring.slice(0,4);

    // The lidar roof returns encircle a deep central light well. Elevations
    // use the same local datum (Tokyo Peil minus 15 m) as the campus terrain.
    volume(tower,floor,31,pale,0xa4a89d);
    wing(0,0,width,20.5,31,64);wing(0,34,width,depth,31,64);
    wing(0,20.5,23,34,31,64);wing(39,20.5,width,34,31,64);
    wing(0,0,width,12,64,68);wing(0,41,width,depth,64,68);
    wing(0,12,13,41,64,68);wing(49,12,width,41,64,68);
    wing(40,7,49,44,64,72);wing(11,28,22,44,64,77.6);
    wing(10.6,27.6,22.4,44.4,77.6,78);
    const openings=[8.1,12.5,16.8,21.0,29.0,33.2,37.4,41.6,45.8,50,54.2,58.4,62.6];
    for(const e of edges(tower)){
      const p=(u,d,y)=>xyz(at(e,u,d),y);
      const skin=(a,b,lo,hi,d,color)=>quad(p(a,d,lo),p(b,d,lo),p(b,d,hi),p(a,d,hi),color);
      const end=(t,lo,hi,inner,outer,color)=>quad(p(t,inner,lo),p(t,outer,lo),p(t,outer,hi),p(t,inner,hi),color);
      const shelf=(a,b,y,inner,outer,color)=>quad(p(a,inner,y),p(b,inner,y),p(b,outer,y),p(a,outer,y),color);
      const bays=9, bay=e.length/bays;
      // Main street elevation: nine recessed bands in the upper stack,
      // with wide precast columns running uninterrupted between adjacent bays.
      skin(0,e.length,64,72,.04,pale);
      shelf(0,e.length,72,-.56,.66,coping);
      skin(0,e.length,68,72,-.56,pale);
      for(let j=0;j<=bays;j++){
        const l=Math.max(0,j*bay-.46),r=Math.min(e.length,j*bay+.46);
        skin(l,r,floor,72,.67,pier);
        end(l,floor,72,.0,.67,0xad9381);end(r,floor,72,.0,.67,0xab9281);
      }
      for(let j=0;j<bays;j++){
        const l=j*bay+.46,r=(j+1)*bay-.46;
        let prev=floor;
        for(const [i,y] of openings.entries()){
          const lo=y-1.08,hi=y+1.08;
          skin(l,r,prev,lo,.54,pale);
          shelf(l,r,lo,.075,.54,0xc2b39c);shelf(l,r,hi,.075,.54,0x887d70);
          const glass=[0x4d5759,0x586561,0x51615e,0x465153][(i+Math.floor(j/2))%4];
          skin(l,r,lo,hi,.07,glass);
          skin(l,r,hi-.38,hi,.09,0x434b49);
          for(const f of [.33,.67]){
            const t=l+(r-l)*f;
            skin(t-.035,t+.035,lo,hi,.14,0x867e6f);
          }
          skin(l,r,lo+.31,lo+.37,.29,0xb9ad98);
          prev=hi;
        }
        skin(l,r,prev,72,.54,pale);
        for(const y of [66.5,69.4,71.55])skin(l,r,y,y+.055,.57,0x998b7a);
      }
    }
    // Only the canopy and its lower glazed band follow the curved southern
    // outline. The enclosed entrance is recessed behind the drop-off columns.
    const canopy=ring.slice(4), c=boundsOf(canopy).center;
    const inset=canopy.map(([x,z])=>[c[0]+(x-c[0])*.81,c[1]+(z-c[1])*.77]);
    volume(inset,floor,9.15,0x6b7775,0x948c7b);
    const panel=(e,a,b,lo,hi,d,col)=>quad(xyz(at(e,a,d),lo),xyz(at(e,b,d),lo),
      xyz(at(e,b,d),hi),xyz(at(e,a,d),hi),col);
    for(const e of edges(inset)){
      const count=Math.max(1,Math.round(e.length/1.9)), span=e.length/count;
      for(let j=0;j<count;j++){
        const x=j*span;
        panel(e,x+.04,x+span-.04,floor+.19,6.18,.028,[0x526661,0x586b64,0x61726c][j%3]);
        panel(e,x+.04,x+span-.04,6.27,8.72,.028,[0x798982,0x657a73][j%2]);
        panel(e,x,x+.064,floor+.19,8.76,.044,0xa49f90);
      }
      panel(e,0,e.length,6.17,6.27,.05,0xada99a);
    }
    const band=canopy.map(([x,z])=>[c[0]+(x-c[0])*.982,c[1]+(z-c[1])*.982]);
    volume(band,9.22,11.5,0x65746f,0xa59b8a);
    for(const e of edges(band)){
      panel(e,0,e.length,11.16,11.49,.025,0x555d58);
      const count=Math.max(1,Math.ceil(e.length/2.2));
      for(let j=0;j<count;j++)panel(e,j*e.length/count,j*e.length/count+.09,9.22,11.5,.025,0xa4a295);
    }
    volume(canopy,11.5,13.1,0xbba18c,coping);
    cap(canopy,9.22,0x9c9282);
    for(const e of edges(canopy)){
      const bays=Math.max(1,Math.round(e.length/3.4));
      for(let j=0;j<bays;j++){
        const p=at(e,(j+.28)*e.length/bays,-.76),r=.23;
        const post=[[p[0]-r,p[1]-r],[p[0]+r,p[1]-r],[p[0]+r,p[1]+r],[p[0]-r,p[1]+r]];
        volume(post,floor,11.5,pier,coping);
      }
    }
  }
  function temple(ring,id,base) {
    const {point,width,depth}=orientedFrame(ring),main=id===91528891;
    const a=width/2,b=depth/2,height=main?7.4:3.1,top=base+height;
    const rect=(x,z)=>[point(-x,-z),point(x,-z),point(x,z),point(-x,z)];
    volume(rect(a*.87,b*.80),base,top,0x403f36,0x42483e);
    // The deep copper eaves rise in two pitches. End ridges turn up at the corners.
    const eaves=rect(a+.85,b+.9), mid=rect(a*.88,b*.69);
    for(let i=0;i<4;i++) {
      const j=(i+1)%4;
      quad(xyz(eaves[i],top),xyz(eaves[j],top),xyz(mid[j],top+.7),xyz(mid[i],top+.7),0x658478);
    }
    const ridge=Math.max(.25,a-b*.62),l=xyz(point(-ridge,0),top+b*.47),r=xyz(point(ridge,0),top+b*.47);
    quad(xyz(mid[0],top+.7),xyz(mid[1],top+.7),r,l,0x4f766b);
    quad(xyz(mid[2],top+.7),xyz(mid[3],top+.7),l,r,0x608476);
    triangle(xyz(mid[3],top+.7),xyz(mid[0],top+.7),l,0x5a766b);
    triangle(xyz(mid[1],top+.7),xyz(mid[2],top+.7),r,0x597568);
    for(const side of [-1,1])for(let i=0;i<=Math.ceil(width/3.6);i++) {
      const x=(i/Math.ceil(width/3.6)-.5)*width*.95,z=b*.94*side;
      const post=[point(x-.17,z-.17),point(x+.17,z-.17),point(x+.17,z+.17),point(x-.17,z+.17)];
      volume(post,base,top,0x393a32,0x393a32);
    }
  }
  for(const [i,[id,height,type,ring]] of blocks.entries()) {
    const b=footprints[i],base=ground(...b.center),floor=Math.min(base,...ring.map(p=>ground(...p)))-.4;
    if(id===52980169){juntendo(ring,floor);continue;}
    if(type==="seido"||type==="shrine"){temple(ring,id,base);continue;}
    const levelCount=Math.max(1,Math.round(height/3.45)), roof=roofs[id%roofs.length];
    volume(ring,floor,base+height,walls[id%walls.length],roof,(base+height-floor)/levelCount);
    if(height>12 && Math.hypot(...b.center)<340 && Math.min(b.width,b.depth)>6) {
      const frame=orientedFrame(ring),w=Math.min(9,frame.width*.24),d=Math.min(6,frame.depth*.24);
      const pad=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(p=>frame.point(...p));
      if(pad.every(p=>inside(p,ring)))volume(pad,base+height,base+height+Math.min(2.7,height*.09),0xa8aba4,0xb5b9b2);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute("color",new T.Float32BufferAttribute(colors,3));
  geometry.setAttribute("facade",new T.Float32BufferAttribute(facade,3));geometry.computeVertexNormals();
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader="attribute vec3 facade; varying vec3 blockFacade;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nblockFacade=facade;");
    shader.fragmentShader="varying vec3 blockFacade;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      if(blockFacade.z>0.1) {
        vec2 p=blockFacade.xy/vec2(2.45,blockFacade.z);
        vec2 uv=fract(p),aa=min(vec2(.21),max(fwidth(p),.001));
        vec2 pane=smoothstep(vec2(.16,.26)-aa,vec2(.16,.26)+aa,uv)*(1.-smoothstep(vec2(.88,.76)-aa,vec2(.88,.76)+aa,uv));
        vec3 glass=mix(vec3(.14,.19,.21),vec3(.23,.28,.29),fract(sin(dot(floor(p),vec2(13.1,7.7)))*137.2));
        diffuseColor.rgb=mix(diffuseColor.rgb,glass,.82*pane.x*pane.y);
      }`);
  };
  const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;mesh.name="御茶ノ水の市街地と湯島聖堂";group.add(mesh);
  addContextStreets(T,group,streets,campusPaths,roadbed);
  const crowns=[],treeColor=[0x708363,0x60785c,0x859272,0x677e65];
  for(const [id,ring] of groves) {
    const {left,right,top,bottom}=boundsOf(ring);
    for(let x=left+3;x<right;x+=7.4)for(let z=top+3;z<bottom;z+=7.1) {
      const a=x+2*Math.sin(z*3),b=z+2*Math.cos(x*1.9);
      if(!inside([a,b],ring)||hitsNeighbourhood(a,b) || (id===46985717 && Math.hypot(a-170,b-112)<25))continue;
      crowns.push([a,b,7.2+2*Math.sin(x+z)]);
    }
  }
  const trees=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshLambertMaterial({flatShading:true}),crowns.length);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.21,.32,1,6),new T.MeshLambertMaterial({color:0x675f51}),crowns.length);
  const pose=new T.Object3D();
  crowns.forEach(([x,z,h],i)=>{
    const y=ground(x,z);
    pose.position.set(x,y+h*.34,z);pose.scale.set(1,h*.68,1);pose.updateMatrix();trunks.setMatrixAt(i,pose.matrix);
    pose.position.y=y+h*.72;pose.rotation.y=i;pose.scale.set(h*.37,h*.38,h*.34);pose.updateMatrix();
    trees.setMatrixAt(i,pose.matrix);trees.setColorAt(i,tint.setHex(treeColor[i%4]));
  });
  group.add(trees,trunks);
  return group;
}
