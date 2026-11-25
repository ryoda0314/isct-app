import { buildings } from "./data.js";
import { at, edges, orientedFrame } from "./buildingsGeometry.js";
import { naturalMaterial, rng } from "./landscapeGeometry.js";
import { groundAt } from "./terrain.js";

// Entrance photographs 1 and 2, pilotis, accessibility plan and approach:
// https://www.ssc.titech.ac.jp/amap/home/suzukakedai/s/s3bldg/
// The planting profile and split metallic cylinder are visible from the other end:
// https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yokohama
const library=buildings.find(b=>b.id==="S3"), frame=orientedFrame(library.footprint);
const front=edges(library.footprint).filter(e=>e.length>frame.width*.75).sort((a,b)=>a.nx-b.nx)[0];
const groundSamples=[groundAt(frame.cx,frame.cz),...library.footprint.map(p=>groundAt(...p))].sort((a,b)=>a-b);
const deck=groundSamples[2]+.65, stairEnd=9.6, stairCount=20, rampToe=86, edge=2.67;
const low=groundAt(...at(front,0,.05))+.10, high=groundAt(...at(front,rampToe,4.8))+.07;
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{const f=clamp(t);return f*f*(3-2*f);};
const xyz=(t,d,y)=>{const [x,z]=at(front,t,d);return [x,y,z];};
const grade=(t,d)=>groundAt(...at(front,t,d));

function profile(t) {
  if(t<stairEnd)return low+(deck-low)*Math.min(stairCount,Math.floor(clamp(t/stairEnd)*stairCount)+1)/stairCount;
  const length=rampToe-62,run=clamp((t-62)/length)*length,ease=1.8;
  const slope=(high-deck)/(length-ease);
  if(run<ease)return deck+slope*run*run/(2*ease);
  if(run>length-ease)return high-slope*(length-run)*(length-run)/(2*ease);
  return deck+slope*(run-ease/2);
}
function approachHeight(t,d,roadbedAt) {
  const blend=smooth((d-edge)/(5.2-edge)),ramp=profile(t);
  return ramp+(roadbedAt(...at(front,t,d))+.055-ramp)*blend;
}
// A bounding box prevents footprint projections on the rest of the campus.
function local(x,z){
  if(x<44||x>132||z< -306||z> -212)return null;
  const dx=x-front.a[0],dz=z-front.a[1];
  return [dx*front.dx+dz*front.dz,dx*front.nx+dz*front.nz];
}
export function librarySurfaceAt(x,z,roadbedAt=groundAt){
  const p=local(x,z);
  if(!p)return null;
  const [t,d]=p;
  if(t>=84.6&&t<=88&&d>=edge&&d<5.2)return approachHeight(t,d,roadbedAt);
  return t>=0&&t<=88&&d>=-.02&&d<=edge?profile(t):null;
}
// The DEM records the bank alongside the northwest end rather than the cut
// beneath the concrete ramp. Leave clearance for the slab along this end.
export function libraryRampTerrain(x,z,height) {
  const p=local(x,z);
  if(!p)return height;
  const [t,d]=p;
  if(t<61||t>90||d< -1||d>5.2)return height;
  const end=smooth((t-61)/2)*smooth((90-t)/2);
  const side=smooth((d+1)/.9)*smooth((5.2-d)/1.5);
  return height+Math.min(0,profile(t)-.12-height)*end*side;
}
export function libraryGardenBlocks(x,z,radius=.28){
  const p=local(x,z);
  if(!p)return false;
  const [t,d]=p;
  if(t>1-radius&&t<84.6+radius&&Math.abs(d-edge)<.045+radius)return true;
  if(t>32-radius&&t<70+radius&&d>edge&&d<4.36+radius)return true;
  return Math.hypot(t-30.7,d-3.33)<.96+radius;
}
export function inLibraryGarden(x,z){
  const p=local(x,z);
  return !!p&&p[0]>-1&&p[0]<front.length+1&&p[1]>-1&&p[1]<5.8;
}

export function inLibraryPilotis(x,z,radius){
  const p=local(x,z);
  if(!p)return false;
  const [t,d]=p,L=front.length;
  if(t<L-8.1+radius||t>L+.5||d< -frame.depth-.5||d>.5)return false;
  return [-.38,-frame.depth/2,-frame.depth+.45].every(col=>
    Math.abs(t-L+.43)>.41+radius||Math.abs(d-col)>.4+radius);
}

function hedges(T,group,batch) {
  const pos=[],colors=[],tint=new T.Color(),rand=rng(197803);
  // A lower round-topped row sits at the toe of the taller sheared bank.
  // Each cross-section is continuous, with small deviations at shoot scale.
  const section=[[0,.02],[-.49,.12],[-.48,.60],[-.43,.87],[-.33,.98],[-.14,1],[.16,1],[.36,.97],[.45,.88],[.5,.66],[.5,.26],[.45,.07],[0,.02]];
  function row(left,right,offset,width,crest) {
    const count=Math.ceil((right-left)/.31);
    let last;
    for(let i=0;i<=count;i++){
      const t=left+(right-left)*i/count, nearEnd=Math.min(t-left,right-t);
      const round=.13+.87*Math.sqrt(clamp(nearEnd/.62)),lo=grade(t,offset)-.01,hi=crest(t);
      const slice=section.map(([u,v])=>xyz(t+(rand()-.5)*.09,offset+(width*u+(rand()-.5)*.06)*round,
        lo+(hi-lo)*Math.max(0,v*(.75+.25*round))+(rand()-.5)*.08));
      if(last){
        for(let j=1;j<slice.length;j++){
          const level=section[j][1],light=.87+.21*rand()+.22*level;
          tint.setHex(level>.86?0x72884a:level>.36?0x586e3c:0x475c38).multiplyScalar(light);
          for(const v of [last[j-1],slice[j],last[j],last[j-1],slice[j-1],slice[j]]){
            pos.push(...v);colors.push(tint.r,tint.g,tint.b);
          }
        }
      }
      if(i%3===0){
        const q=slice[6],size=.22+rand()*.13;
        batch.put('shoot',0x78894d,q[0],q[1]-.07,q[2],size,size*.63,size,rand()*6);
      }
      if(i%2===0){
        const q=slice[8+Math.floor(rand()*3)],size=.20+rand()*.12;
        batch.put('shoot',0x657b46,q[0],q[1],q[2],size,size*.8,size,rand()*6);
      }
      last=slice;
    }
  }
  row(32,67.7,3.37,1.4,t=>profile(t)-.13+.075*Math.sin(.44*t));
  row(32.2,70,4.03,.78,t=>grade(t,4.03)+.59+.055*Math.sin(.59*t));
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mat=naturalMaterial(T,'foliage',.34);mat.side=T.DoubleSide;
  const hedge=new T.Mesh(geo,mat);hedge.castShadow=true;hedge.receiveShadow=true;
  hedge.name="S3 · clipped planting on the entrance slope";group.add(hedge);
}

export function makeLibraryGround(T,group,surfaces,batch,roadbedAt=groundAt) {
  const q=(a,b,c,d,color)=>surfaces.quad(a,b,c,d,color);
  function strip(t0,t1,d0,d1,y0,y1,color){
    q(xyz(t0,d0,y0),xyz(t0,d1,y0),xyz(t1,d1,y1),xyz(t1,d0,y1),color);
  }
  const pavement=0x999991, white=0xd8dcd6;
  // Road-level asphalt continues under the cantilever and through the pilotis.
  for(const [t0,t1,d0,d1] of [[1,32,-1.0,4.65],[88,front.length+1.9,-frame.depth-.4,4.8]]){
    const point=(t,d)=>xyz(t,d,roadbedAt(...at(front,t,d))+.055);
    for(let a=t0;a<t1;a+=.64)for(let d=d0;d<d1;d+=.64){
      const b=Math.min(a+.64,t1),end=Math.min(d+.64,d1);
      q(point(a,d),point(a,end),point(b,end),point(b,d),0x848887);
    }
  }
  // The southeast staircase meets the same continuous gallery as the ramp.
  for(let n=0;n<stairCount;n++){
    const a=n*stairEnd/stairCount,b=(n+1)*stairEnd/stairCount,h=profile((a+b)*.5);
    strip(a,b,-.03,edge,h,h,pavement);
    strip(a,a+.065,.06,edge-.04,h+.012,h+.012,0xc5c7bf);
    const prev=n===0?grade(a,1.3):profile(a-.02);
    q(xyz(a,-.03,prev),xyz(a,edge,prev),xyz(a,edge,h),xyz(a,-.03,h),0xb9bcb5);
    q(xyz(a,edge,grade(a,edge)-.1),xyz(b,edge,grade(b,edge)-.1),xyz(b,edge,h),xyz(a,edge,h),white);
  }
  for(let a=stairEnd;a<88;a+=1){
    const b=Math.min(88,a+1),h0=profile(a),h1=profile(b);
    strip(a,b,-.05,edge,h0,h1,pavement);
    const railEnd=Math.min(b,84.6);
    if(a<railEnd)strip(a,railEnd,edge-.10,edge,h0+.018,profile(railEnd)+.018,white);
    const b0=a<30.7?h0-.27:grade(a,edge)-.1,b1=b<30.7?h1-.27:grade(b,edge)-.1;
    q(xyz(a,edge,b0),xyz(b,edge,b1),xyz(b,edge,h1),xyz(a,edge,h0),white);
    if(a<30.7)strip(a,b,-.05,edge,h0-.27,h1-.27,0xbec5c1);
    if(a>31&&a<railEnd){
      q(xyz(a,edge,h0-.46),xyz(a,4.5,grade(a,4.5)+.07),
        xyz(railEnd,4.5,grade(railEnd,4.5)+.07),xyz(railEnd,edge,profile(railEnd)-.46),0x83936a);
    }
    if(a>42&&a<84)for(const d of [.91,1.01,1.11])
      strip(a,b,d,d+.037,h0+.019,h1+.019,0xc8c8bd);
  }
  // Connect the toe to the surveyed road, independently of the raised gallery.
  const endOfBed=31.86, crest=profile(endOfBed)-.04, toe=grade(endOfBed,4.47)+.10;
  for(const t of [endOfBed-.16,endOfBed]){
    q(xyz(t,edge,grade(t,edge)-.02),xyz(t,4.47,grade(t,4.47)-.02),
      xyz(t,4.47,toe),xyz(t,edge,crest),white);
  }
  q(xyz(endOfBed-.16,edge,crest),xyz(endOfBed-.16,4.47,toe),xyz(endOfBed,4.47,toe),xyz(endOfBed,edge,crest),white);
  for(let d=edge;d<5.2;d+=.30){
    const end=Math.min(d+.30,5.2);
    const point=(t,l)=>xyz(t,l,approachHeight(t,l,roadbedAt)+.006*smooth((l-edge)/(5.2-edge)));
    for(let u=84.6;u<88;u+=.45){
      const right=Math.min(u+.45,88);
      q(point(u,d),point(u,end),point(right,end),point(right,d),pavement);
    }
  }
  function railing(a,b,d,height,balusters) {
    const span=(b-a)/Math.ceil((b-a)/1.45);
    const foot=t=>t<stairEnd?low+(deck-low)*t/stairEnd:profile(t);
    for(let t=a;t<b-.001;t+=span){
      const end=Math.min(b,t+span),h0=foot(t),h1=foot(end);
      for(const lift of [.17,height])
        batch.beam(xyz(t,d,h0+lift),xyz(end,d,h1+lift),lift===height?.054:.031,lift===height?.054:.031,white,'post');
      const count=balusters?7:1;
      for(let i=0;i<count;i++){
        const s=t+(end-t)*i/count,h=foot(s),diam=i===0?.044:.024;
        batch.beam(xyz(s,d,h+(i?.17:.01)),xyz(s,d,h+height),diam,diam,white,'post');
      }
    }
  }
  railing(1,stairEnd,edge,1.01,true);railing(stairEnd,84.6,edge,1.01,true);
  railing(66,84.6,.17,.81,false);
  hedges(T,group,batch);
  // White pedestrian crossings at the pilotis approach and lower gallery.
  for(const t of [21.5,88.4]){
    for(let j=0;j<7;j++){
      const d=5.04+j*.80,point=(u,v)=>xyz(u,v,roadbedAt(...at(front,u,v))+.069);
      for(let u=t-1.22;u<t+1.22;u+=.40){
        const end=Math.min(t+1.22,u+.40);
        q(point(u,d),point(u,d+.40),point(end,d+.40),point(end,d),0xe3e4dc);
      }
    }
  }
}
