import { C, at, edges, rectangle } from "./buildingsGeometry.js";
import { towerFrame } from "./towerGround.js";
import { groundAt } from "./terrain.js";

const panes=[0x839b9e,0x657e83,0x799699,0x537176,0x90a4a4,0x6a8588];
const circle=(x,z,r)=>[x*Math.cos(r),z*Math.sin(r)];
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

function curtain(m,e,bottom,top,bayWidth,rows,out=.15) {
  const cols=Math.max(1,Math.round(e.length/bayWidth)),w=e.length/cols,h=(top-bottom)/rows;
  for(let j=0;j<cols;j++){
    for(let i=0;i<rows;i++){
      m.face(e,(j+.5)*w,out,bottom+h*(i+.5),w-.04,h-.045,.11,panes[(j*3+i*5+j*i)%panes.length],true);
    }
    m.face(e,(j+.04)*w,out+.095,(bottom+top)/2,.085,top-bottom,.185,C.silver);
  }
  for(let i=0;i<=rows;i++)
    m.face(e,e.length/2,out+.1,bottom+i*h,e.length+.02,.074,.17,C.silver);
}

// The two long axes run NE/SW. The SE wing extends past the stepped NE
// end of the NW wing, as visible in the GSI aerial and the surveyed base.
export function makeTowers(m,ring,base) {
  const {point,w,d,angle:heading}=towerFrame(ring);
  const eave=85.32,peak=90.87,floor=(eave-5.8)/19;
  m.solid(ring,base,base+4.25,0xa8afb0,0xb7bcb8);
  const dock=edges(ring)[1],dockCenter=dock.length*.62;
  m.face(dock,dockCenter,.065,base+1.80,4.92,3.60,.15,0x677272);
  m.face(dock,dockCenter,.16,base+1.74,4.55,3.42,.10,0x9ba5a6);
  for(let y=.26;y<3.45;y+=.20)m.face(dock,dockCenter,.22,base+y,4.55,.031,.06,0x737e7f);
  m.face(dock,dockCenter,.64,base+3.86,5.5,.20,1.38,C.pale);
  // The isolators and overhead girder sit above the reinforced concrete first storey.
  for(const [a,b,c,d1] of [[0,.014*d,.72*w,.37*d],[.015*w,.61*d,.99*w,.985*d]]){
    const footprint=rectangle(point,a,b,c,d1);
    // The narrow service galleries along the inside corners are open to the sky.
    const inset=2.35, galleryBack=1.8,inner=b<d*.5?d1:b,outer=inner===b?d1:b;
    const cut=inner+(outer>inner?inset:-inset);
    const recessed=[[a,outer],[c,outer],[c,cut],[c-galleryBack,cut],[c-galleryBack,inner],
      [a+galleryBack,inner],[a+galleryBack,cut],[a,cut]].map(([u,v])=>point(u,v));
    m.solid(recessed,base+5.8,base+eave,0xd5d8d7,0xb6b9b3);
    for(const u of [a+galleryBack/2,c-galleryBack/2]){
      for(let r=0;r<19;r++){
        const y=base+5.8+r*floor,center=point(u,(inner+cut)/2);
        m.box(center,y+.12,galleryBack,.24,inset,-heading,0xa3a8a6);
        const lip=point(u<c/2?u-galleryBack/2:u+galleryBack/2,(inner+cut)/2);
        m.box(lip,y+.92,.09,.10,inset,-heading,0x8a9494);
        m.box(lip,y+.49,.075,.06,inset,-heading,0x899393);
      }
    }
    const sides=edges(footprint);
    for(const [idx,full] of sides.entries()){
      const end=idx===1||idx===3;
      const e=end?edges(rectangle(point,a,Math.min(cut,outer),c,Math.max(cut,outer)))[idx]:full;
      for(let n=0;n<Math.max(2,Math.round(e.length/6));n++){
        const k=Math.max(2,Math.round(e.length/6)),p=at(e,(n+.5)*e.length/k,-.66);
        m.part("round",p,base+5.02,1.20,1.22,1.20,0,C.dark);
        for(const y of [4.52,4.77,5.02,5.27,5.52])m.part("round",p,base+y,1.28,.065,1.28,0,0x798282);
      }
      if(end){
        for(let r=0;r<19;r++){
          const y=base+5.8+(r+.56)*floor;
          m.face(e,e.length*.51,.045,y,1.25,.72,.12,C.dark);
          m.face(e,e.length*.51,.12,y,1.12,.61,.06,C.glass,true);
          if(r%2===0)m.face(e,e.length/2,.018,y-floor*.5,e.length-.28,.038,.042,0xb1b6b3);
        }
        // The designer specifies four-storey mega-braces at both gables.
        for(let start=0;start<19;start+=4){
          const y0=base+5.8+start*floor,y1=base+5.8+Math.min(19,start+4)*floor;
          const p=at(e,.30,.53),q=at(e,e.length-.30,.53);
          for(const [l,r] of [[p,q],[q,p]])m.beam([l[0],y0,l[1]],[r[0],y1,r[1]],.46,0xf1f0e7,.28);
          for(const t of [.31,e.length-.31]){
            m.face(e,t,.28,y0,.71,.62,.76,C.metal);
            m.disk(e,t,.74,y0,.28,.14,C.silver);
          }
        }
      }else{
        const n=Math.max(3,Math.round(e.length/3.65)),bay=e.length/n;
        for(let r=0;r<19;r++){
          const y=base+5.8+floor*r;
          m.face(e,e.length/2,.10,y+floor*.55,e.length-.64,floor*.57,.22,C.glassDark,true);
          for(let j=0;j<n;j++){
            m.face(e,(j+.5)*bay,.27,y+floor*.57,bay-.22,floor*.48,.15,panes[(r+j*2)%panes.length],true);
            m.face(e,j*bay+.12,.34,y+floor*.5,.21,floor,.75,C.pale);
          }
          m.face(e,e.length/2,.47,y+.18,e.length,.37,1.02,C.metal);
          m.face(e,e.length/2,.91,y+.80,e.length,.56,.13,0xadb8b8);
          m.face(e,e.length/2,.92,y+1.15,e.length,.08,.15,C.silver);
        }
        m.face(e,e.length/2,.1,base+eave+.15,e.length,.3,.32,C.pale);
      }
    }
    const center=point((a+c)*.5,(b+d1)*.5);
    m.box(center,base+eave+1.8,(c-a)*.38,3.6,(d1-b)*.53,-heading,C.pale);
    // Penthouse and exposed perimeter frame, set back from the roof perimeter.
    for(const e of sides){
      for(const loc of [.09,.91])m.face(e,e.length*loc,-.38,base+(eave+peak)/2,.34,peak-eave,.38,C.pale);
      m.face(e,e.length/2,-.4,base+peak-.17,e.length-.3,.34,.42,C.pale);
    }
  }
  const atrium=rectangle(point,w*.085,d*.365,w*.68,d*.62);
  m.solid(atrium,base+4.26,base+eave-.8,C.glassDark,C.roof);
  for(const [i,e] of edges(atrium).entries()){
    if(i===1||i===3)curtain(m,e,base+4.3,base+eave-.8,1.34,38);
  }
  for(const idx of [1,3]){
    const face=edges(atrium)[idx],entry=idx===1?base+5.8:groundAt(...point(-13,21.7))+.055;
    const center=face.length*.51,width=4.85;
    m.face(face,center,.42,entry+1.43,width,2.85,.50,0x38464c);
    for(const side of [-1,1]){
      const mid=center+side*1.14;
      m.face(face,mid,.713,entry+1.30,2.21,2.54,.11,0x466570,true);
      m.face(face,mid,.790,entry+.73,2.24,.075,.05,C.silver);
      for(const jamb of [-1,1])m.face(face,mid+jamb*1.10,.77,entry+1.33,.075,2.66,.09,C.metal);
      m.face(face,center+side*2.83,1.85,entry+1.84,.24,3.68,.26,C.pale);
    }
    m.face(face,center,1.03,entry+3.75,6.12,.32,2.35,0xaab2b1);
    m.face(face,center,2.17,entry+3.73,6.14,.36,.14,0xc3c8c4);
    m.face(face,center+3.25,.47,entry+1.47,.27,.55,.1,0x405668);
  }
}

export { makeLibrary } from "./libraryArchitecture.js";

function rotundaRing(p,r,n=48){
  return Array.from({length:n},(_,i)=>{const [x,z]=circle(r,r,Math.PI*2*i/n);return [p[0]+x,p[1]+z];});
}
// Suzukakedai University Hall, Kyoiku Shisetsu Kenkyujo (2002).
// The lawn faces the split-level dining rotunda. The auditorium sits in the opposite bank.
// The section and material changes follow the architect's exterior photograph and the
// university accessibility survey. Door widths, frame spacing and roof offsets are estimates.
function hallDoors(m,e,t,floor,width=2.32) {
  const h=2.27;
  for(const side of [-1,0,1])m.face(e,t+side*(width/2+.02),.24,floor+h*.5,.095,h+.14,.19,C.silver);
  m.face(e,t,.23,floor+h+.035,width+.21,.10,.19,C.silver);
  for(const side of [-1,1]) {
    const c=t+side*width/4;
    m.face(e,c,.273,floor+h/2,width/2-.09,h-.12,.055,0x667e80,"clear");
    m.face(e,c,.373,floor+.16,width/2,.22,.08,0xafb5b1);
    m.face(e,t+side*.145,.414,floor+1.08,.038,.47,.065,0xc4cecd);
  }
  m.face(e,t,.30,floor+h+.35,width+.21,.55,.10,0x789392,true);
  m.face(e,t,.38,floor+h+.67,width+.3,.085,.13,C.silver);
}

export function makeHall(m,id,ring,fr,base,height) {
  const second=base+height*.30,third=base+height*.61;
  if(id==="H2"){
    const walls=edges(ring);
    m.solid(ring,base,base+height,0xd6d4ca,0xa0a39c);
    for(const e of walls) {
      const foyer=e.nx>.55&&e.nz<-.4,shop=e.nx>.4&&e.nz>.5;
      for(let t=1.8;t<e.length-.1;t+=2.35)m.face(e,t,.028,base+height/2,.025,height-.28,.04,0xb4b5ac);
      for(const y of [second-.4,third-.39,base+height-.29]){
        m.face(e,e.length/2,.028,y,e.length,.035,.055,0xb3b5ac);
      }
      m.face(e,e.length/2,.10,base+height+.03,e.length+.18,.15,.39,0xdfe0d7);
      if(foyer){
        curtain(m,e,third+.2,base+height-.53,1.72,3);
        m.face(e,e.length/2,.22,third-.08,e.length,.48,.52,0xe2e2d7);
        const w=Math.min(8.2,e.length*.52),t=e.length*.50;
        m.face(e,t,.10,base+1.65,w,3.27,.21,C.frame);
        hallDoors(m,e,t,base+.12);
        for(const side of [-1,1])m.face(e,t+side*(w/4+.54),.26,base+1.58,w/2-1.27,2.91,.085,C.glass,true);
        m.face(e,t,.94,base+3.42,w+.45,.18,2.03,C.silver);
      }else if(shop){
        const y=base+3.18;
        for(let i=0;i<5;i++){
          const t=e.length*(.16+i*.13);
          m.face(e,t,.10,base+1.72,2.9,2.93,.16,C.frame);
          m.face(e,t,.21,base+1.71,2.75,2.79,.07,C.glass,true);
          m.face(e,t,.29,base+1.05,2.86,.075,.09,C.silver);
        }
        m.face(e,e.length*.415,.69,y+.21,e.length*.68,.18,1.52,C.pale);
        m.face(e,e.length*.50,.045,third+1.71,e.length*.49,1.40,.13,C.frame);
        for(let i=0;i<5;i++)m.face(e,e.length*(.30+i*.1),.15,third+1.7,e.length*.091,1.22,.07,C.glass,true);
      }else{
        // Limited openings on the exposed portion of the auditorium's concrete shell.
        for(const u of [.37,.48,.59])m.face(e,e.length*u,.048,third+1.25,e.length*.10,.87,.115,0x596461,true);
      }
    }
    const plant=fr.point(-fr.width*.14,fr.depth*.06);
    m.box(plant,base+height+.7,fr.width*.38,1.4,fr.depth*.41,fr.yaw,0xbfc1ba);
    m.box(plant,base+height+1.42,fr.width*.39,.11,fr.depth*.43,fr.yaw,0x9ca39f);
    return;
  }
  const r=Math.min(fr.width,fr.depth)*.5,p=[fr.cx,fr.cz];
  const fascia=base+height*.535,eaves=base+height*.82,upper=r*.775;
  const radial=(radius,a)=>[p[0]+radius*Math.cos(a),p[1]+radius*Math.sin(a)];
  const slab=(y,radius,h,color)=>m.part("smooth",p,y,radius*2,h,radius*2,0,color);
  slab(base+.1,r,.22,0xb9b3a5);slab(second,r-.10,.24,0xc0b395);
  slab(fascia+.45,r+.10,.22,0xd9d7c7);
  const core=radial(r*.29,Math.PI*.80);
  m.part("smooth",core,base+height*.42,r*.62,height*.84,r*.62,0,0xa8a397);
  for(let i=0;i<14;i++) {
    const a=Math.PI*2*i/14,dir=[Math.cos(a),Math.sin(a)];
    const q=radial(r*.70,a);
    m.part("round",q,(base+eaves)/2,.28,eaves-base,.28,0,0xe1ded2);
    if(dir[0]<-.53&&dir[1]>.1)continue;
    for(const floor of [base+.14,second+.13]) {
      const dt=radial(r*.845,a);
      m.box(dt,floor+.75,1.09,.075,.74,-a,0xb59a73);
      m.part("round",dt,floor+.38,.09,.74,.09,0,C.frame);
      for(const side of [-1,1]){
        const chair=[dt[0]-dir[1]*side*.64,dt[1]+dir[0]*side*.64];
        m.box(chair,floor+.43,.44,.09,.44,-a,0x96704f);
        m.box(chair,floor+.25,.09,.39,.09,0,C.dark);
        const back=[chair[0]-dir[1]*side*.19,chair[1]+dir[0]*side*.19];
        m.box(back,floor+.62,.47,.31,.071,-a,0xa17d5e);
      }
    }
  }
  const siding=0xe1ded2;
  for(const [radius,y0,y1,upperTier] of [[r,base+.12,fascia,false],[upper,fascia+.54,eaves,true]]) {
    const segments=edges(rotundaRing(p,radius,48));
    for(const [i,e] of segments.entries()){
      const rear=e.nx<-.45&&e.nz>.04;
      const rows=upperTier?4:6,step=(y1-y0)/rows;
      if(rear) {
        m.face(e,e.length/2,.04,(y0+y1)/2,e.length+.06,y1-y0,.14,siding);
        m.face(e,e.length/2,.14,upperTier?y0+.8:y0+2.5,e.length,.58,.07,0x6d7977,true);
      }else {
        for(let j=0;j<rows;j++){
          const col=panes[(Math.floor(i/6)+Math.floor(j/3))%panes.length];
          m.face(e,e.length/2,.02,y0+step*(j+.5),e.length-.018,step-.045,.069,col,"clear");
          m.face(e,e.length/2,.125,y0+step*j,e.length+.03,.059,.14,C.silver);
        }
      }
      m.face(e,0,.145,(y0+y1)/2,i%3===0?.125:.065,y1-y0,.17,C.silver);
    }
    if(!upperTier){
      // Full-height aluminium-clad spandrel and drip below the third-storey terrace.
      for(const e of segments) {
        m.face(e,e.length/2,.075,fascia+.16,e.length+.045,.91,.27,siding);
        m.face(e,0,.22,fascia+.16,.028,.87,.031,0xb7b7ae);
        m.face(e,e.length/2,.21,fascia-.33,e.length+.06,.067,.14,0x787e76);
      }
      // Lower plaza doors and the glazed restaurant entrance on the raised lawn apron.
      for(const i of [6,39])hallDoors(m,segments[i],segments[i].length/2,base+.18);
      const vestibule=segments[6],mid=vestibule.length/2;
      m.face(vestibule,mid,.99,base+3.03,3.18,.14,2.25,C.silver);
      for(const side of [-1,1]){
        m.face(vestibule,mid+side*1.47,.95,base+1.60,.075,2.82,1.80,0x89a1a1,"clear");
        m.face(vestibule,mid+side*1.47,1.82,base+1.59,.085,2.82,.12,C.silver);
        m.face(vestibule,mid+side*1.47,.94,base+.87,.11,.075,1.82,C.silver);
      }
      m.face(vestibule,mid,1.82,base+2.47,3.02,.09,.12,C.silver);
      const restaurant=segments[37];
      hallDoors(m,restaurant,restaurant.length/2,second+.13);
    }
  }
  for(const e of edges(rotundaRing(p,r*.958,48))) {
    if(e.nx<-.50&&e.nz>0)continue;
    for(const h of [.33,.83])m.face(e,e.length/2,0,fascia+.6+h,e.length+.045,.04,.041,0xa7aaa3);
    m.face(e,0,0,fascia+1.06,.04,.93,.04,C.silver);
  }
  // A round-ended service core joins the angular glass foyer at the downhill side.
  const rear=radial(r*.80,2.55);
  m.part("smooth",rear,base+height*.5,5.35,height*.97,5.35,0,0xd3d2c8);
  m.part("smooth",rear,base+height*.84,5.38,height*.17,5.38,0,0x899390,true);
  m.part("smooth",rear,base+height*.97,5.47,.17,5.47,0,0xa7aaa2);
  const roof=r*.823;
  slab(eaves-.13,roof,.29,0x555e59);
  slab(eaves+.051,roof+.045,.09,0xabb0a8);
  // Broad shallow metal roof with raised concentric clerestories near the centre.
  m.part("dome",p,eaves+.99,roof*2,1.93,roof*2,0,0x8f9590);
  for(const [f,y] of [[.64,1.26],[.54,1.87],[.40,2.23],[.23,2.49]]){
    const d=roof*2*f;
    m.part("smooth",p,eaves+y,d,.42,d,0,0x64726d,true);
    m.part("dome",p,eaves+y+.35,d+.44,.64,d+.44,0,0xa4aaa3);
  }
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8;
    const v=radial(upper-.16,a),t=radial(roof*.19,a);
    m.beam([v[0],eaves-.19,v[1]],[t[0],eaves+.31,t[1]],.11,0xbec1b9,.14);
  }
  m.part("dome",p,eaves+3.14,.64,.45,.64,0,0xc5cfca,true);
}

export function linkHalls(m,h1,h2) {
  const p=[h1.fr.cx,h1.fr.cz],q=[h2.fr.cx,h2.fr.cz];
  const distance=Math.hypot(q[0]-p[0],q[1]-p[1]),u=[(q[0]-p[0])/distance,(q[1]-p[1])/distance];
  const a=mix(p,q,h1.fr.depth*.33/distance);
  const exit=Math.max(...h2.ring.map(k=>(q[0]-k[0])*u[0]+(q[1]-k[1])*u[1]));
  const b=mix(q,p,Math.max(1,exit-2.8)/distance);
  const mid=mix(a,b,.5),len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const y=Math.max(h1.base+h1.height*.59,h2.base+h2.height*.61),yaw=-Math.atan2(u[1],u[0]);
  const width=4.55,h=3.62;
  const atBridge=(s,t)=>[mid[0]+s*u[0]-t*u[1],mid[1]+s*u[1]+t*u[0]];
  m.box(mid,y-.19,len+.5,.52,width+.16,yaw,0xc8c8be);
  m.box(mid,y+.10,len+.49,.13,width+.32,yaw,C.pale);
  m.box(mid,y+h+.05,len+.62,.28,width+.45,yaw,C.pale);
  const bays=Math.ceil(len/1.68),bay=len/bays;
  for(const side of [-1,1]){
    const t=side*width/2;
    for(let i=0;i<bays;i++){
      const s=bay*(i+.5)-len/2;
      m.box(atBridge(s,t),y+h*.53,bay-.035,h-.21,.075,yaw,panes[(i+2)%panes.length],"clear");
      m.box(atBridge(s+bay*.5,t),y+h*.5,.086,h,.13,yaw,C.silver);
    }
    for(const z of [.28,1.04,2.67])m.box(atBridge(0,t),y+z,len,.065,.14,yaw,C.silver);
    m.box(atBridge(0,t*.87),y-.54,len,.21,.18,yaw,0x7e8580);
  }
}
