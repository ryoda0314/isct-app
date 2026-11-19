import { displaySpace } from "./campus3dPicody.js";
import { lettering, infoCode } from "./campus3dTakiLettering.js";
import { reliefVertices, reliefFaces, reliefRim } from "./campus3dTakiReliefData.js";

const glazes=["#eee9dc","#e3d6bc","#d4bf98","#b29575","#93948b","#565955","#50516c","#2e376d",
  "#b7cfd0","#819ca4","#8eac98","#b9af6a","#d99178","#a75140","#c0a0ad","#a6a2b7"];
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
let ceramic;

function ceramicMesh() {
  if (ceramic) return ceramic;
  const raw=bytes(reliefVertices),data=new DataView(raw.buffer);
  const indices=s=>{
    const a=bytes(s),result=[];
    let previous=0,value=0,shift=0;
    for (const byte of a) {
      value|=(byte&127)<<shift;
      if (byte&128) {shift+=7;continue;}
      previous+=(value>>>1)^-(value&1);
      result.push(previous);
      value=0;shift=0;
    }
    return Uint16Array.from(result);
  };
  const faces=indices(reliefFaces),rim=indices(reliefRim),vertices=[];
  for (let i=0;i<raw.length;i+=7) {
    const p=[data.getUint16(i,true)/10000-2.5,data.getUint16(i+4,true)/10000,data.getUint16(i+2,true)/10000];
    vertices.push({p,n:[0,0,0],material:raw[i+6]&15,occlusion:1-(raw[i+6]>>4)/30});
  }
  for (let i=0;i<faces.length;i+=3) {
    const [a,b,c]=[vertices[faces[i]],vertices[faces[i+1]],vertices[faces[i+2]]];
    const n=cross(minus(b.p,a.p),minus(c.p,a.p)),sign=n[1]<0?-1:1;
    for (const v of [a,b,c]) for (let j=0;j<3;j++) v.n[j]+=sign*n[j];
  }
  for (const v of vertices) v.n=unit(v.n);
  return ceramic={vertices,faces,rim};
}

// Walking under the rim and up to the plaque uses the same raised surface as
// rendering. Cache vertical envelopes at 10 cm across and 5 cm into the relief.
let envelopes;
export function reliefWalkSpans(F,D,z0) {
  const columns=50,layers=14;
  const column=x=>Math.min(columns-1,Math.max(0,Math.floor((x+2.5)*10)));
  if (!envelopes) {
    envelopes=Array.from({length:columns*layers},()=>[Infinity,-Infinity]);
    const {vertices,faces}=ceramicMesh();
    for (let i=0;i<faces.length;i+=3) {
      const a=vertices[faces[i]].p,b=vertices[faces[i+1]].p,c=vertices[faces[i+2]].p;
      const lo=column(Math.min(a[0],b[0],c[0])),hi=column(Math.max(a[0],b[0],c[0]));
      const bottom=Math.min(a[2],b[2],c[2]),top=Math.max(a[2],b[2],c[2]),end=Math.min(layers-1,Math.floor(Math.max(a[1],b[1],c[1])*20));
      for (let x=lo;x<=hi;x++) for (let y=0;y<=end;y++) {
        const span=envelopes[x*layers+y];
        span[0]=Math.min(span[0],bottom);span[1]=Math.max(span[1],top);
      }
    }
  }
  const [nx,ny]=F.nf,bx=(F.a[0]+F.b[0])/2-nx*D,by=(F.a[1]+F.b[1])/2-ny*D;
  return (x,y)=>{
    const along=((y-by)*nx-(x-bx)*ny)*5/F.L,d=Math.floor(((x-bx)*nx+(y-by)*ny)*20);
    if (Math.abs(along)>2.5 || d<0 || d>=layers) return [];
    const [lo,hi]=envelopes[column(along)*layers+d];
    return lo<=hi?[[z0+lo,z0+hi]]:[];
  };
}

// Horizontal cutaways clip actual triangles at their original elevation.
function cutFace(m,face,top) {
  if (face.every(v=>v.z>top)) return;
  let polygon=face;
  if (face.some(v=>v.z>top)) {
    polygon=[];
    for (let i=0;i<face.length;i++) {
      const a=face[i],b=face[(i+1)%face.length];
      if (a.z<=top) polygon.push(a);
      if ((a.z<=top)!==(b.z<=top)) {
        const t=(top-a.z)/(b.z-a.z);
        polygon.push({xy:mix(a.xy,b.xy,t),z:top,n:unit(mix(a.n,b.n,t)),c:mix(a.c,b.c,t)});
      }
    }
  }
  for (let i=1;i+1<polygon.length;i++) for (const v of [polygon[0],polygon[i],polygon[i+1]]) m.vert(v.xy,v.z,v.n,v.c);
}

export function addCeramicRelief(M,F,D,z0,top,T) {
  const {vertices,faces,rim}=ceramicMesh(),g=displaySpace(M,F,D,z0,T),colors=glazes.map(T);
  const local=(p,depth=p[1])=>[p[0]*F.L/5,depth-D/2,p[2]],full=top>=z0+5-.0001;
  const front=vertices.map(({p,n,material,occlusion})=>{
    const [xy,z]=g.point(local(p));
    const light=.68+.36*Math.max(-.7,n[0]*-.43+n[1]*.52+n[2]*.73);
    return {xy,z,n:g.normal(n),c:colors[material].map((v,i)=>i===3?v:v*light*occlusion)};
  });
  if (full) {
    for (const i of faces) {const v=front[i];M.m.vert(v.xy,v.z,v.n,v.c);}
  } else {
    for (let i=0;i<faces.length;i+=3) cutFace(M.m,[front[faces[i]],front[faces[i+1]],front[faces[i+2]]],top);
  }
  const body=T("#d5c9b2");
  const corner=(p,n,c)=>{const [xy,z]=g.point(p);return {xy,z,n:g.normal(n),c};};
  const back=corner([0,-D/2,2.5],[0,-1,0],body);
  for (let i=0;i<rim.length;i+=2) {
    const a=vertices[rim[i]].p,b=vertices[rim[i+1]].p,n=unit([b[2]-a[2],0,a[0]-b[0]]);
    if (n[0]*(a[0]+b[0])+n[2]*(a[2]+b[2]-5)<0) {n[0]*=-1;n[2]*=-1;}
    const edge=[local(a,0),local(b,0),local(b),local(a)].map(p=>corner(p,n,body));
    cutFace(M.m,edge,top);
    cutFace(M.m,[back,corner(local(b,0),[0,-1,0],body),corner(local(a,0),[0,-1,0],body)],top);
  }
}

// Vertex lighting on the physical plaster face. Four warm ceiling spots aim at
// different portions of the relief. Their circular cones meet the wall obliquely.
export function addGalleryPlaster(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),h=z1-z0,n=g.normal([0,1,0]),color=T("#faf8f2");
  const lamps=[-2.46,-.91,.57,2.11].map(x=>({x,axis:unit([-.28*x,-1.77,-4.16])}));
  function vertex(i,j) {
    const x=(i/36-.5)*F.L,z=h*j/32;
    let light=0;
    for (const lamp of lamps) {
      const ray=[x-lamp.x,-1.77,z-8.21],dist=Math.hypot(...ray);
      const cos=ray.reduce((v,k,i)=>v+k*lamp.axis[i],0)/dist;
      const cone=Math.min(1,Math.max(0,(cos-.888)/.087));
      light+=20.0*1.77/dist**3*cone*cone*(3-2*cone);
    }
    const radius=((x-.18)/3.02)**2+((z-3.97)/2.96)**2;
    const bounce=Math.exp(-.72*radius*radius);
    const gain=.76+.22*bounce+.055*Math.min(1,light);
    return [...g.point([x,D/2,z]),n,color.map((v,k)=>k===3?v:Math.min(1,v*gain))];
  }
  let low=Array.from({length:37},(_,i)=>vertex(i,0));
  for (let j=1;j<=32;j++) {
    const high=Array.from({length:37},(_,i)=>vertex(i,j));
    for (let i=0;i<36;i++) for (const v of [low[i],low[i+1],high[i+1],low[i],high[i+1],high[i]]) M.m.vert(...v);
    low=high;
  }
}

export function addGalleryTrack(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),w=F.L/2,h=z1-z0;
  if (h<.15) return;
  g.box(-w,-.021,w,.021,.119,.153,"#74736c");
  for (const x of [-w+.11,0,w-.11]) g.tube([x,0,.15],[x,0,h],.005,.005,"#999991");
  for (let i=0;i<4;i++) {
    const x=-w+.14+i*(2*w-.28)/3,aim=unit([-x*.10,-.39,-.92]);
    const a=[x,0,.111],b=a.map((v,j)=>v+aim[j]*.095),across=unit(cross(aim,[0,1,0])),up=cross(aim,across);
    g.tube(a,b,.040,.046,"#777972");
    const point=(j,r,d)=>b.map((v,k)=>v+aim[k]*d+r*(across[k]*Math.cos(j*Math.PI/8)+up[k]*Math.sin(j*Math.PI/8)));
    for (let j=0;j<16;j++) {
      g.quad([point(j,.046,0),point(j+1,.046,0),point(j+1,.035,.003),point(j,.035,.003)],aim,"#deddd0");
      for (const p of [point(j,.035,.003),point(j+1,.035,.003),point(j,0,.006)]) M.m.vert(...g.point(p),g.normal(aim),T("#fff8df"));
    }
  }
}

export function addReliefPlaque(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),w=F.L/2,h=z1-z0,y=D/2;
  g.box(-w,-y,w,y,0,h,"#9c9586");
  const plane={n:[0,1,0],at:(x,z,d=0)=>[x,y+d,z]},ink="#413f38";
  for (const z of [h*.90,h*.43]) g.box(-w*.89,y,w*.89,y+.0006,z,z+.0007,"#716d60");
  lettering(g,plane,"ELEMENTS OF FUTURE",0,h*.69,w*1.82,h*.14,ink,.0011);
  lettering(g,plane,"原画・制作監修",-w*.47,h*.55,w*.71,h*.035,ink);
  lettering(g,plane,"大友克洋",-w*.47,h*.47,w*.72,h*.081,ink,.0009);
  lettering(g,plane,"Design and Supervision",w*.46,h*.55,w*.89,h*.035,ink);
  lettering(g,plane,"KATSUHIRO OTOMO",w*.46,h*.47,w*.85,h*.067,ink);
  lettering(g,plane,"企画",-w*.47,h*.32,w*.55,h*.043,ink);
  lettering(g,plane,"日本交通文化協会",-w*.47,h*.25,w*.80,h*.039,ink);
  lettering(g,plane,"陶板レリーフ制作",w*.46,h*.32,w*.84,h*.043,ink);
  lettering(g,plane,"クレアーレ熱海ゆがわら工房",w*.46,h*.25,w*.87,h*.035,ink);
  lettering(g,plane,"CREARE ART",w*.46,h*.095,w*.65,h*.043,ink);
  infoCode(g,plane,-w*.52,h*.060,h*.116,ink,true);
}

export function addLobbyCase(M,F,D,z0,z1,T,style) {
  const g=displaySpace(M,F,D,z0,T),w=F.L/2,d=D/2,h=z1-z0;
  const model=style==="plazaModel",top=model?.76:.73,post=model?.016:.012;
  g.box(-w,-d,w,d,top-.029,top,"#f4f2e9");
  for (const x of [-w+.025,w-.025]) for (const y of [-d+.023,d-.023]) {
    g.box(x-post,y-post,x+post,y+post,model?.008:.058,top-.029,model?"#b9b8ae":"#d8d9d4");
    if (!model) g.ellipsoid([x,y,.037],[.010,.030,.033],"#878983");
  }
  const a=w*(model?.83:.75),b=d*.82,base=top+.014,cap=h-.008;
  g.box(-a,-b,a,b,top,base,"#dedbd0");
  if (model) {
    // The scale model under acrylic repeats the actual public stair and the
    // splayed timber roof. Each landing is supported separately above the base.
    const wood="#c7ac7c",x0=-a*.80,x1=a*.78,front=b*.82,back=-b*.80;
    g.box(x0,back,x1,front,base+.006,base+.032,"#dbcdab");
    g.box(x0*.78,back*.76,x1*.71,back*.23,base+.033,base+.074,"#d4c5a3");
    for (const x of [x0*.72,x0*.14,x1*.67]) {
      g.box(x-.012,back*.72,x+.012,back*.24,base+.074,cap-.150,"#c2b99f");
    }
    g.box(x0*.78,back*.77,x1*.72,back*.18,cap-.155,cap-.140,"#e8dfc3");
    for (let i=0;i<16;i++) {
      const t=i/15,y=front+(back-front)*t,z=base+.041+(cap-base-.12)*t;
      const x=x0+(x1-x0)*(.05+.17*t),wide=x1-.025*t;
      const stair=x+(wide-x)*(.28+.09*t);
      g.box(x,y-.010,stair-.034,y+.010,z-.009,z,wood);
      g.box(stair+.034,y-.010,wide,y+.010,z-.009,z,i%4===0?"#d9c49c":wood);
      for (const j of [0,1]) g.box(stair-.034,y-.010+j*.010,stair+.034,y+j*.010,z-.010+j*.006,z-.004+j*.006,"#e4d5b1");
      if (i%3===0) for (const px of [x+.015,wide-.015]) g.box(px-.004,y-.005,px+.004,y+.005,base+.029,z-.01,"#c2b79e");
    }
    for (let i=0;i<10;i++) {
      const z=base+.042+i*.008,y=front-i*.014;
      g.box(x0+.02,y-.012,x0+.15,y+.005,z-.006,z,"#dfd1b3");
    }
  } else {
    // Individual volumes in the low cabinet. The black presentation boards
    // form a second row behind the freestanding blue pieces.
    for (let i=0;i<5;i++) {
      const x=-a*.54+i*a*.30,high=base+.22+(i%3)*.021;
      g.box(x-.071,-b*.57,x+.071,-b*.51,base,high,"#262832");
      g.box(x-.032,-b*.42,x+.032,-b*.15,base,base+.028,"#344164");
      g.ellipsoid([x,-b*.24,base+.075],[.022,.019,.047],i%2?"#777fac":"#8a9bc3");
    }
  }
  const panels=[
    [[-a,-b,base],[a,-b,base],[a,-b,cap],[-a,-b,cap]],
    [[a,-b,base],[a,b,base],[a,b,cap],[a,-b,cap]],
    [[a,b,base],[-a,b,base],[-a,b,cap],[a,b,cap]],
    [[-a,b,base],[-a,-b,base],[-a,-b,cap],[-a,b,cap]],
    [[-a,-b,cap],[a,-b,cap],[a,b,cap],[-a,b,cap]]
  ];
  const normals=[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0],[0,0,1]];
  if (M.glassy) panels.forEach((v,i)=>M.glassy.quad(v.map(g.point),g.normal(normals[i]),T("#e4e9df")));
  for (const x of [-a,a]) for (const y of [-b,b]) g.box(x-.0015,y-.0015,x+.0015,y+.0015,base,cap,"#c1c8c1");
  for (const y of [-b,b]) g.box(-a,y-.002,a,y+.002,cap-.002,cap,"#d2d7cd");
}

export function addCaseCaption(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),w=F.L/2,h=z1-z0;
  g.ellipsoid([0,0,.016],[w*.88,D*.42,.016],"#797a76");
  g.tube([0,0,.023],[0,0,h-.155],.008,.008,"#b4b4ad");
  g.box(-w,-.011,w,.011,h-.16,h,"#95958c");
  g.box(-w+.006,.011,w-.006,.014,h-.154,h-.006,"#f2efe1");
  lettering(g,{at:(x,z,d=0)=>[x,.014+d,z],n:[0,1,0]},"Taki Plaza",0,h-.081,w*1.62,.029,"#56534a");
}
