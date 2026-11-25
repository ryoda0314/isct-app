import { rng } from '../yokohama/landscapeGeometry.js';
import { detailMaterial } from './groundsDetails.js';
import { addBlocker } from './groundsLevels.js';
import { inside } from '../yokohama/navigation.js';

const tau=2*Math.PI;
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const at=(p,y)=>[p[0],y,p[1]];
const center=[-88.35,54.5],seat=[-69.7,63.36],deckRadius=6.22;
const radial=(c,r,a)=>[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];
const ring=(c,r,n=64)=>Array.from({length:n},(_,i)=>radial(c,r,i*tau/n));
// Local metres, traced from the overhead photograph. Each straight indentation
// is a paved place to stand facing the flower bed.
function gardenOutline(T){
  const s=new T.Shape();
  s.moveTo(-102.2,54.0);s.quadraticCurveTo(-102.9,47.1,-97.7,44.2);
  s.lineTo(-96.6,47.0);s.lineTo(-92.6,45.8);s.lineTo(-93.3,42.8);
  s.quadraticCurveTo(-83.9,41.5,-76.4,50.5);s.lineTo(-79.1,51.9);s.lineTo(-77.8,55.6);s.lineTo(-74.8,54.1);
  s.quadraticCurveTo(-74.5,55.4,-73.2,56.2);s.quadraticCurveTo(-77.5,59.3,-76.1,65.0);
  s.quadraticCurveTo(-77.9,64.3,-79.1,64.8);s.lineTo(-80.8,61.6);s.lineTo(-84.5,62.7);s.lineTo(-83.6,66.5);
  s.quadraticCurveTo(-94.5,67.8,-99.8,59.6);s.lineTo(-97.5,57.7);s.lineTo(-98.7,53.2);s.lineTo(-102.2,54.0);
  return s.getPoints(12).slice(0,-1).map(p=>[p.x,p.y]);
}
const westBeds=[
  [[-121.3,24.5],[-105.8,31.5],[-111.7,37.0],[-120.5,33.1]],
  [[-121.6,38.5],[-116.4,40.7],[-121.7,45.8]],
  [[-118.2,59.3],[-110.4,55.1],[-109.6,57.5],[-106.4,61.8],[-101.9,63.8],[-101.1,66.3],[-108.0,63.5]],
  [[-125.9,19.3],[-127.3,24.0],[-126.0,24.6],[-127.2,27.3],[-128.4,26.9],[-128.4,30.0],[-126.4,30.0],[-126.1,33.1],[-128.4,33.1],[-127.9,36.1],[-125.9,36.0],[-125.8,39.1],[-127.5,39.2],[-124.5,46.1],[-125.1,47.9],[-132.5,36.0],[-134.2,33.3],[-129.6,21.0]],
];
function surface(T,group,contour,holes,height,material,name){
  const v=r=>r.map(p=>new T.Vector2(...p)),faces=T.ShapeUtils.triangulateShape(v(contour),holes.map(v));
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([contour,...holes].flat().flatMap(p=>at(p,height)),3));
  geometry.setIndex(faces.flatMap(([a,b,c])=>[c,b,a]));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
}
function curb(t,ring,bottom,top,color){
  ring.forEach((p,i)=>{const q=ring[(i+1)%ring.length];t.quad(at(p,bottom),at(q,bottom),at(q,top),at(p,top),color);});
}
function edging(batch,contour,height,width,depth,colors,spacing=.21){
  let n=0;
  contour.forEach((p,i)=>{
    const q=contour[(i+1)%contour.length],len=distance(p,q),steps=Math.max(1,Math.round(len/spacing));
    const yaw=-Math.atan2(q[1]-p[1],q[0]-p[0]);
    for(let j=0;j<steps;j++,n++){
      const f=(j+.5)/steps;
      batch.put('box',colors[(n*7+Math.floor(n/5))%colors.length],p[0]+(q[0]-p[0])*f,height,p[1]+(q[1]-p[1])*f,
        Math.max(.02,len/steps-.009),depth,width,yaw);
    }
  });
}
function springPlants(T,group,flowerGroups){
  // Several blossoms and folded basal leaves grow from one plug. The common
  // geometry is instanced across the beds. All colours and vertices are local.
  const vertices=[],colors=[],color=new T.Color();
  const face=(a,b,c,hex)=>{vertices.push(...a,...b,...c);color.setHex(hex);for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);};
  for(let i=0;i<7;i++){
    const a=i*2.39996,dx=Math.cos(a),dz=Math.sin(a),m=[dx*.071,.051,dz*.071],tip=[dx*.14,.032,dz*.14];
    face([0,.009,0],[m[0]-dz*.029,.041,m[2]+dx*.029],tip,0x5f802d);
    face([0,.009,0],tip,[m[0]+dz*.025,.057,m[2]-dx*.025],0x839944);
  }
  for(let j=0;j<4;j++){
    const x=.068*Math.cos(j*2.4),z=.063*Math.sin(j*2.4),y=.076+.018*(j%3);
    for(let i=0;i<5;i++){
      const a=i*tau/5+j*.8,dx=Math.cos(a),dz=Math.sin(a),m=[x+dx*.023,y+.012,z+dz*.023];
      const l=[m[0]-dz*.017,y+.020,m[2]+dx*.017],r=[m[0]+dz*.017,y+.014,m[2]-dx*.017],tip=[x+dx*.037,y+.021,z+dz*.037];
      face([x,y,z],l,r,0xd2b4b7);face(l,tip,r,0xfffafb);
    }
    face([x-.009,y+.005,z-.009],[x+.012,y+.005,z],[x,y+.007,z+.012],0xffcc49);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new T.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide});
  const mesh=new T.InstancedMesh(geometry,material,flowerGroups.length),dummy=new T.Object3D();
  flowerGroups.forEach(([x,y,z,a,k,tint],i)=>{dummy.position.set(x,y,z);dummy.rotation.y=a;dummy.scale.setScalar(k);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.setHex(tint));});
  mesh.name='梅形花壇と円形デッキの草花';mesh.receiveShadow=true;
  const y=flowerGroups[0][1],lod=new T.LOD();lod.position.set(center[0],y,center[1]);
  mesh.position.copy(lod.position).multiplyScalar(-1);lod.addLevel(mesh,0);
  const farVertices=[],farColors=[];
  for(const [x,y,z,,k,tint] of flowerGroups){
    const w=k*.10;color.setHex(tint);
    farVertices.push(x-w,y+.08,z-.04,x,y+.09,z+w,x+w,y+.08,z-.04);
    for(let i=0;i<3;i++)farColors.push(color.r,color.g,color.b);
  }
  const proxy=new T.BufferGeometry();proxy.setAttribute('position',new T.Float32BufferAttribute(farVertices,3));
  proxy.setAttribute('color',new T.Float32BufferAttribute(farColors,3));proxy.computeVertexNormals();
  const far=new T.Mesh(proxy,material);far.position.copy(mesh.position);far.receiveShadow=true;
  lod.addLevel(far,43,.10);group.add(lod);
}
function grassTips(T,group,contour,h,rand){
  const pos=[],colors=[],normals=[],tint=new T.Color();
  for(let k=0;k<9;k++){
    const a=rand()*tau,w=.003+rand()*.005,dx=Math.cos(a),dz=Math.sin(a);
    const x=(rand()-.5)*.20,z=(rand()-.5)*.20,lean=.010+rand()*.047;
    const l=[x-w*dz,0,z+w*dx],r=[x+w*dz,0,z-w*dx],tip=[x+dx*lean,.024+rand()*.047,z+dz*lean];
    pos.push(...l,...r,...tip,...r,...l,...tip);
    const tipColor=k%3?0xa9b153:0xc1b964;
    for(const hex of [0x7d8939,0x84913e,tipColor,0x84913e,0x7d8939,tipColor]){
      tint.setHex(hex);colors.push(tint.r,tint.g,tint.b);
      normals.push(.3*dx,.95,.3*dz);
    }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  const points=[];
  for(let i=0;i<18500;i++){
    const x=-104+rand()*34,z=40+rand()*30,r=distance([x,z],center);
    if(r>5.72&&inside([x,z],contour))points.push([x,z]);
  }
  const grass=new T.InstancedMesh(geo,new T.MeshLambertMaterial({vertexColors:true}),points.length),dummy=new T.Object3D();
  points.forEach(([x,z],i)=>{dummy.position.set(x-center[0],0,z-center[1]);dummy.rotation.y=rand()*tau;dummy.scale.setScalar(.58+rand()*.70);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});
  const lod=new T.LOD();lod.position.set(center[0],h,center[1]);lod.addLevel(grass,0);lod.addLevel(new T.Group(),35,.13);
  grass.receiveShadow=true;grass.name='芝の葉先';group.add(lod);
}
function tieredTree(batch,c,y,scale,rand,evergreen){
  const [x,z]=c,wood=evergreen?0x473e2b:0x706653;
  const local=(u,v,w)=>[x+u*scale,y+v*scale,z+w*scale];
  const limb=(p,q,d)=>batch.beam(p,q,d*scale,d*scale,wood,'trunk');
  const base=local(0,0,0),tip=local(.11,3.27,-.10);
  let prev=base;
  for(let j=0;j<6;j++){
    const root=local(.105*Math.sin(j*2),.50+j*.46,.08*Math.cos(j*1.7));limb(prev,root,.16-j*.018);prev=root;
    const spread=(evergreen?1.1:1.29)*(1-j*.113);
    for(let i=0;i<4;i++){
      const a=i*tau/4+j*2.41+rand()*.39,dx=Math.cos(a),dz=Math.sin(a),r=spread*(.80+rand()*.34),rise=.34+rand()*.3;
      const elbow=[root[0]+scale*r*dx*.56,root[1]+scale*.15,root[2]+scale*r*dz*.56];
      const end=[root[0]+scale*r*dx,root[1]+scale*rise,root[2]+scale*r*dz];limb(root,elbow,.063-j*.006);limb(elbow,end,.042-j*.003);
      for(let k=0;k<3;k++){
        const angle=a+(k-1)*.83,reach=(.22+rand()*.18)*scale;
        const p=[end[0]+Math.cos(angle)*reach,end[1]+(.08+rand()*.20)*scale,end[2]+Math.sin(angle)*reach];
        limb(elbow,p,.025);const green=(evergreen?[0x6b791f,0x72852d,0x566c24,0x849531]:[0x96a55a,0x829342,0x9dad62])[(i+j+k)%(evergreen?4:3)];
        batch.put('leaf',green,...p,(evergreen?.165:.21)*scale,(evergreen?.13:.14)*scale,.19*scale,angle);
        for(let l=0;l<(evergreen?4:2);l++){
          const turn=angle+l*2.4,d=scale*(.10+rand()*.12);
          batch.put('shoot',green,p[0]+d*Math.cos(turn),p[1]+(rand()-.5)*.14*scale,p[2]+d*Math.sin(turn),.37*scale,.36*scale,.41*scale,turn);
        }
      }
    }
  }
  limb(prev,tip,.05);
  batch.beam(base,local(.04,2.38,-.06),.13*scale,.13*scale,wood,'stemFar');
  for(let j=0;j<3;j++){
    const r=(1.08-j*.24)*scale;
    batch.put('canopyFar',evergreen?0x70802e:0x8a9952,...local(.05*j,1.44+j*.69,-.04*j),r,r*.55,r*.89,j*1.6);
  }
  addBlocker(c,c,.13*scale);
}
function seatBench(batch,c,h,a,width=2.0){
  // +z points out from the backrest toward the visitor.
  const at=(u,v,y)=>[c[0]+u*Math.sin(a)+v*Math.cos(a),h+y,c[1]-u*Math.cos(a)+v*Math.sin(a)],yaw=Math.PI/2-a;
  for(const u of [-.36*width,.36*width]){
    batch.beam(at(u,.29,0),at(u,.10,.46),.055,.07,0x373737);
    batch.beam(at(u,-.28,0),at(u,-.12,.45),.055,.07,0x373737);
    batch.beam(at(u,-.14,.29),at(u,-.33,.91),.044,.072,0x40403b);
  }
  for(let k=0;k<5;k++){batch.put('box',k%2?0x976440:0xad744b,...at(0,-.19+k*.103,.45),width,.054,.087,yaw);}
  for(let k=0;k<4;k++)batch.put('box',k%2?0xa46d47:0x945d39,...at(0,-.244-k*.028,.58+k*.09),width,.070,.037,yaw);
  addBlocker([at(-width*.45,0,0)[0],at(-width*.45,0,0)[2]],[at(width*.45,0,0)[0],at(width*.45,0,0)[2]],.21);
}
function deckGarden(T,group,t,batch,cap,circle,h,rand,flowers){
  const deckH=h+.11,r=deckRadius;
  cap(T,t,circle,deckH-.02,0x6a564a);curb(t,circle,h-.02,deckH,0x694c40);
  const a=.43,local=(u,v)=>[seat[0]+u*Math.cos(a)-v*Math.sin(a),deckH,seat[1]+u*Math.sin(a)+v*Math.cos(a)];
  const steps=78;
  for(let i=0;i<steps;i++){
    const l=-r+(2*r/steps)*i+.005,m=-r+(2*r/steps)*(i+1)-.005;
    const len=u=>Math.sqrt(Math.max(0,r*r-u*u)),color=[0xb18b7f,0xa88073,0xb38e81,0xad877b][i%4];
    t.quad(local(l,-len(l)),local(m,-len(m)),local(m,len(m)),local(l,len(l)),color);
  }
  const planter=ring(seat,2.99,80),soilY=deckH+.37;
  curb(t,planter,deckH,soilY,0x865d4b);cap(T,t,planter,soilY,0x726147);
  for(let j=0;j<4;j++)edging(batch,ring(seat,2.98,64).map((_,i)=>radial(seat,2.98,(i+(j%2)*.5)*tau/64)),deckH+.053+j*.098,.16,.085,[0x915a42,0xa66e50,0x885746,0xad7858],.30);
  for(let i=0;i<350;i++){
    const a=rand()*tau,r=2.25+rand()*.57,p=radial(seat,r,a),palette=[0xefa32d,0xffde42,0x7f64c9,0x627acc,0xd8cdea];
    flowers.push([p[0],soilY,p[1],rand()*tau,.8+rand()*.55,palette[Math.floor(a*8+rand()*2)%palette.length]]);
  }
  for(let i=0;i<70;i++){
    const a=rand()*tau,r=2.3*Math.sqrt(rand()),p=radial(seat,r,a);
    batch.put('leafSmall',i%3?0x727d48:0x826a46,p[0],soilY+.1,p[1],.21,.12+rand()*.25,.19,a);
  }
  tieredTree(batch,seat,soilY,.93,rand,false);
  for(let i=0;i<5;i++){const a=.4+i*tau/5;seatBench(batch,radial(seat,3.48,a),deckH,a,2.10);}
  addBlocker(seat,seat,2.95);
}
function railPlanting(batch,start,end,h,rand){
  const length=distance(start,end),dx=(end[0]-start[0])/length,dz=(end[1]-start[1])/length;
  const at=(f,offset,y)=>[start[0]+dx*f-dz*offset,y,start[1]+dz*f+dx*offset];
  const rotation=-Math.atan2(dz,dx);
  for(const [from,to] of [[3,19],[22,38],[45,54],[57,65]]){
    const mid=(from+to)*.5;
    batch.put('box',0xa29b87,...at(mid,1.02,h+.14),to-from,.22,.92,rotation);
    batch.put('box',0x715b46,...at(mid,1.02,h+.259),to-from-.12,.04,.80,rotation);
    for(let j=from+.6;j<to;j+=1.4)batch.put('canopyFar',0x7c8b3c,...at(j,1.02,h+.44),.84,.26,.42,rotation);
    for(let j=from+.22;j<to-.2;j+=.30){
      const p=at(j,.85+rand()*.35,h+.40+rand()*.15),green=[0x708235,0x879536,0x658038,0x929e46][Math.floor(rand()*4)];
      batch.put('leaf',green,...p,.27+rand()*.13,.14+rand()*.22,.24+rand()*.15,rand()*tau);
      batch.put('shoot',green,p[0],p[1]+.17,p[2],.26,.28,.26,rand()*tau);
    }
  }
}
export function plantRoof(T,group,t,batch,pavers,cap,footprint,h){
  const rand=rng(815931),flowers=[],lawn=gardenOutline(T),circle=ring(seat,deckRadius,96);
  cap(T,pavers,footprint,h,0xd3c5ac,[lawn,circle,...westBeds]);
  const grass=detailMaterial(T,0x939f43,`
    vec2 p=vSite.xz;
    float low=sin(p.x*.69+sin(p.y*.38)*2.)*cos(p.y*.79+sin(p.x*.33));
    float resolve=clamp(1.-length(fwidth(p))*3.7,0.,1.);
    float turf=siteHash(floor(p*18.));
    float blade=siteHash(floor(vec2(71.*p.x+17.*p.y,29.*p.y)));
    diffuseColor.rgb*=.98+.09*low+resolve*((turf-.5)*.22+(blade-.5)*.21);
    diffuseColor.rgb+=vec3(.016,.013,.002)*smoothstep(.90,.99,turf)*resolve;`,'yushima-notched-lawn');
  surface(T,group,lawn,[],h+.045,grass,'園路が切り込む梅花壇の芝地');
  grassTips(T,group,lawn,h+.047,rand);
  curb(t,lawn,h-.03,h+.045,0x867056);
  for(const contour of westBeds){surface(T,group,contour,[],h+.06,grass,'庭園西側の植栽帯');curb(t,contour,h,h+.06,0x8f8269);}
  const edgingColors=[0x986a4d,0x845d46,0xa17052,0x795642,0x93694c];
  for(let i=0;i<5;i++){
    const a=.60+i*tau/5,ca=Math.cos(a),sa=Math.sin(a);
    const local=(r,s)=>[center[0]+r*ca-s*sa,center[1]+r*sa+s*ca];
    const oval=(mid,rx,rz,n)=>Array.from({length:n},(_,j)=>local(mid+rx*Math.cos(j*tau/n),rz*Math.sin(j*tau/n)));
    const outer=oval(3.24,2.48,2.05,64),hole=oval(2.98,1.72,1.64,56),island=oval(2.62,1.03,.88,44);
    const top=h+.175+i*.001;
    cap(T,t,outer,top,0x84905a,[hole]);cap(T,t,hole,h+.085,0xd6c3a3);cap(T,t,island,top,0x778659);
    for(const edge of [outer,hole,island]){
      curb(t,edge,h+.043,top,0x805d47);edging(batch,edge,(top+h+.053)/2,.077,top-h-.053,edgingColors,.13);
    }
    const pink=[0xe9a6c8,0xf6bcd3,0xce88b5,0xe0a2d4,0xf5d5df,0xffe9ef];
    for(let j=0;j<1150;j++){
      const theta=rand()*tau,frac=Math.sqrt(rand()),r=3.24+Math.cos(theta)*frac*2.46,s=Math.sin(theta)*frac*2.02;
      const inner=((r-2.98)/1.77)**2+(s/1.69)**2<1;
      if(inner&&((r-2.62)/.99)**2+(s/.84)**2>1)continue;
      const p=local(r,s),color=inner&&j%3?pale(j):pink[j%pink.length];
      flowers.push([p[0],top,p[1],rand()*tau,.68+rand()*.81,color]);
    }
    const sp=local(5.08,-.31);
    batch.put('post',0x554e40,sp[0],top+.077,sp[1],.055,.15,.055);
    batch.put('box',0x5a5749,sp[0],top+.15,sp[1],.19,.095,.14,-a,0,-.27);
    const eye=local(5.08,-.375);batch.put('box',0xb3b9a0,eye[0],top+.17,eye[1],.135,.049,.028,-a);
  }
  function pale(i){return [0xbbc3af,0xd4d1bb,0xb0bca3,0xc9b8d0][i%4];}
  const base=ring(center,.66,40);cap(T,t,base,h+.50,0x64543d);
  for(let j=0;j<4;j++)edging(batch,Array.from({length:24},(_,i)=>radial(center,.66,(i+.5*(j%2))*tau/24)),h+.108+j*.114,.12,.102,[0x985e45,0xa46a4b,0x805742,0xb17450],.19);
  tieredTree(batch,center,h+.49,.82,rand,true);
  // The raised beds and central lawn can be admired from all four path recesses.
  addBlocker(center,center,5.53);
  deckGarden(T,group,t,batch,cap,circle,h,rand,flowers);
  springPlants(T,group,flowers);
  railPlanting(batch,footprint[0],footprint[1],h,rand);
  for(const [x,z] of [[-113.9,46.6],[-110.4,43.3],[-106.8,40.8]]){
    batch.put('box',0x817568,x,h+.20,z,1.71,.36,1.71,.42);
    batch.put('box',0x685b4b,x,h+.40,z,1.52,.06,1.52,.42);
    for(let i=0;i<4;i++){const a=i*tau/4-.42,p=radial([x,z],.91,a);batch.put('box',0x936747,p[0],h+.44,p[1],2.17,.095,.34,Math.PI/2-a);}
    tieredTree(batch,[x,z],h+.45,.52+rand()*.12,rand,false);addBlocker([x,z],[x,z],.97);
  }
  for(const p of [[-102.0,59.9],[-76.1,54.25],[-94.1,43.0],[-79.45,64.75]]){
    batch.put('post',0x424742,p[0],h+.52,p[1],.096,1.04,.096);
    batch.put('post',0xd4cdab,p[0],h+.98,p[1],.10,.10,.10);
  }
}
// Welded wire and tubular top rail. The dense mesh fades before it aliases.
export function wirePanels(T,group,batch,segments,h){
  const verts=[],line=(p,y,q,top)=>verts.push(...at(p,y),...at(q,top));
  for(const [a,b] of segments){
    const length=distance(a,b),posts=Math.ceil(length/2),wires=Math.ceil(length/.14);
    for(let i=0;i<=posts;i++){
      const p=[a[0]+(b[0]-a[0])*i/posts,a[1]+(b[1]-a[1])*i/posts];batch.beam(at(p,h),at(p,h+1.16),.052,.056,0x969e94);
    }
    for(const y of [.13,1.13])batch.beam(at(a,h+y),at(b,h+y),.045,.045,0xa7afa5,'post');
    for(let i=0;i<=wires;i++){const p=[a[0]+(b[0]-a[0])*i/wires,a[1]+(b[1]-a[1])*i/wires];line(p,h+.15,p,h+1.12);}
    for(let i=1;i<=7;i++)line(a,h+.15+i*.12,b,h+.15+i*.12);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));
  const m=new T.LineBasicMaterial({color:0x8c978d,transparent:true,opacity:.50,depthWrite:false});
  m.onBeforeCompile=shader=>{
    shader.vertexShader='varying float meshRange;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n meshRange=-mvPosition.z;');
    shader.fragmentShader='varying float meshRange;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a *= 1.-smoothstep(13.,40.,meshRange);\n#include <opaque_fragment>');
  };
  const mesh=new T.LineSegments(geo,m);mesh.name='屋上庭園の金網手すり';group.add(mesh);
}
