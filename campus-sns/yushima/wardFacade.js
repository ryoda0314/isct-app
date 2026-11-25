import { at, edges } from "../yokohama/buildingsGeometry.js";

// The river elevation has nine recessed openings per floor. On the end walls
// the cladding continues across much larger blank areas and the openings change.
const panels=[0xd5ac95,0xd6af98,0xd6ae96,0xd8b19a,0xd3ab94,0xd8af98,0xd5ad96];
const windowBack=[0x242e31,0x303738,0x253230,0x494d46,0x342c29,0x313c38];
const drapes=[0xd7e8df,0xb6d7d0,0xa3ccc6,0xd8c8a4,0xbddee0,0xa6c4bb,0xe1e4d5];
const gasket=0x453f3c,metal=0x8c8781;

function noise(a,b,c=0){
  const n=Math.imul(a+37,19349663)^Math.imul(b+51,83492791)^Math.imul(c+19,73856093);
  const bits=Math.imul(n^(n>>>16),0x45d9f3b);
  return ((bits^(bits>>>16))>>>0)/4294967296;
}

// Emit the outer plane of each ceramic panel and leave a shallow, real joint
// over the recessed continuous bed. Only actual panel edges get a seam when
// a window cuts through the middle of a course.
function tiledFace(m,e,datum,pitch,rise){
  const forward=e.dx*e.nz-e.dz*e.nx>0;
  function tile(l,r,b,t,col){
    const a=at(e,l),z=at(e,r),A=[a[0],b,a[1]],B=[z[0],b,z[1]],C=[z[0],t,z[1]],D=[a[0],t,a[1]];
    if(forward){m.triangle(A,B,C,col);m.triangle(A,C,D,col);}
    else{m.triangle(A,C,B,col);m.triangle(A,D,C,col);}
  }
  return function wall(l,r,b,t){
    if(r-l<.008||t-b<.008)return;
    m.face(e,(l+r)/2,-.085,(b+t)/2,r-l,t-b,.129,0xa68b78);
    const first=Math.floor(l/pitch),last=Math.ceil(r/pitch),bottom=Math.floor((b-datum)/rise),top=Math.ceil((t-datum)/rise);
    for(let j=bottom;j<top;j++)for(let i=first;i<last;i++){
      const x0=Math.max(l,i*pitch+.013),x1=Math.min(r,(i+1)*pitch-.013);
      const y0=Math.max(b,datum+j*rise+.012),y1=Math.min(t,datum+(j+1)*rise-.012);
      if(x0<x1&&y0<y1)tile(x0,x1,y0,y1,panels[Math.floor(noise(i,j)*panels.length)]);
    }
  };
}

function windowReveal(m,e,l,r,b,t,depth){
  const c=(l+r)/2,y=(b+t)/2,w=r-l,h=t-b;
  m.face(e,l+.025,-depth/2,y,.05,h,depth,0xba987f);
  m.face(e,r-.025,-depth/2,y,.05,h,depth,0xbd9c86);
  m.face(e,c,-depth/2,t-.045,w,.09,depth,0xb6a089);
  m.face(e,c,-depth/2,b+.045,w,.09,depth,0xc5b4a0);
  m.face(e,c,-.14,b+.052,w-.07,.046,.26,0xb6aaa0);
}

function curtainCloth(m,e,cx,depth,b,t,width,tint){
  const panels=Math.max(4,2*Math.round(width/.29));
  const edge=k=>{
    const crease=k%2;
    const p=at(e,cx+width*(k/panels-.5),depth+crease*.023);
    return [[p[0],b+.018*crease,p[1]],[p[0],t,p[1]]];
  };
  const front=e.dx*e.nz-e.dz*e.nx>0;
  let [a,d]=edge(0);
  for(let k=1;k<=panels;k++){
    const [next,c]=edge(k);
    if(front){m.triangle(a,next,c,tint);m.triangle(a,c,d,tint);}
    else{m.triangle(a,c,next,tint);m.triangle(a,d,c,tint);}
    a=next;d=c;
  }
}

function wardWindow(m,e,l,r,b,t,seed,panes,depth=1.05){
  const width=r-l,height=t-b,center=(l+r)/2,mid=(b+t)/2,pitch=(width-.16)/panes;
  const glass=-depth;
  const room=noise(seed,2,15);
  windowReveal(m,e,l,r,b,t,depth);
  m.face(e,center,glass-.12,mid,width,height,.14,gasket);
  for(let i=0;i<panes;i++){
    const x=l+.08+(i+.5)*pitch,choice=noise(seed,i,7),shade=Math.floor(noise(seed,i,18)*6);
    m.face(e,x,glass-.068,mid,pitch-.035,height-.15,.042,windowBack[shade]);
    if(room<.77&&(room<.29||choice>.31)){
      // Curtains seen behind the sashes in the hospital's south aerial view.
      // The broad cloth can be drawn across a light or gathered at one jamb.
      const cloth=(pitch-.12)*(room<.29?.84+.15*choice:.44+.53*noise(seed,i,3)),left=choice>.63;
      const cx=x+(left?-1:1)*(pitch-.09-cloth)/2;
      const colour=drapes[Math.floor(noise(seed,i,11)*drapes.length)];
      curtainCloth(m,e,cx,glass-.016,b+.09,t-.08,cloth,colour);
    }
    if(i)m.face(e,l+.08+i*pitch,glass+.084,mid,.053,height-.04,.082,metal);
  }
  m.face(e,center,glass+.039,mid,width-.14,height-.13,.022,0x9dbabd,"clear");
  for(const x of [l+.059,r-.059])m.face(e,x,glass+.073,mid,.078,height,.084,metal);
  for(const y of [b+.068,t-.065])m.face(e,center,glass+.069,y,width-.075,.080,.081,metal);
}

function vent(m,e,l,r,b,t){
  const w=r-l,mid=(l+r)/2;
  windowReveal(m,e,l,r,b,t,.24);
  m.face(e,mid,-.23,(b+t)/2,w,t-b,.06,0x382f2d);
  for(const f of [.3,.65])m.face(e,mid,-.15,b+(t-b)*f,w-.08,.035,.105,0x5b5751);
}

function bands(wall,length,openings,bottom,top,fill){
  let from=0;
  for(const [l,r] of openings){
    wall(from,l,bottom,top);
    fill(l,r);
    from=r;
  }
  wall(from,length,bottom,top);
}

function frontage(m,e,low,roof,seed){
  const height=roof-5.65-low,dy=height/9;
  const margin=Math.min(3.7,e.length*.06),count=Math.max(2,Math.round((e.length-2*margin)/5.9));
  const span=(e.length-2*margin)/(count-.17),pier=.17*span;
  const openings=Array.from({length:count},(_,i)=>[margin+i*span,margin+(i+1)*span-pier]);
  const wall=tiledFace(m,e,low,span/5,dy*.5);
  for(let j=0;j<9;j++){
    const y=low+j*dy,b=y+.25*dy,t=b+.47*dy;
    wall(0,e.length,y,b);
    bands(wall,e.length,openings,b,t,(l,r)=>wardWindow(m,e,l,r,b,t,seed+j*29+Math.round(l)*13,4));
    wall(0,e.length,t,y+dy);
  }
  const slit=roof-2.96;
  wall(0,e.length,low+height,slit-.155);
  bands(wall,e.length,openings,slit-.155,slit+.155,(l,r)=>vent(m,e,l,r,slit-.155,slit+.155));
  wall(0,e.length,slit+.155,roof);
}

// On the east there are three vertical stacks of lights in a nearly blind
// tiled end. The M&D-facing west side has one broad recessed return instead.
function endWall(m,e,low,roof,west,east,seed){
  const dy=(roof-5.65-low)/9,wall=tiledFace(m,e,low,1.25,dy*.5),w=e.length;
  if(!east&&!west){wall(0,w,low,roof);return;}
  const openings=west?[[w*.255,w*.706]]:[[w*.185-.43,w*.185+.43],[w*.502-1.22,w*.502+1.22],[w*.82-.40,w*.82+.40]];
  for(let j=0;j<9;j++){
    const y=low+j*dy,b=y+dy*.25,t=y+dy*(west?.73:.71);
    wall(0,w,y,b);
    bands(wall,w,openings,b,t,(l,r)=>wardWindow(m,e,l,r,b,t,seed+j*31+Math.round(l),west?9:r-l>2?2:1,west?1.42:.24));
    wall(0,w,t,y+dy);
  }
  wall(0,w,low+9*dy,roof);
}

export function wardUpperWalls(m,upper,frame,podium,roof,isA){
  for(const [index,e] of edges(upper).entries()){
    const alignment=e.dx*frame.dx+e.dz*frame.dz;
    if(Math.abs(alignment)>.86&&e.length>12){
      frontage(m,e,podium,roof,index*131);
    }else{
      const side=e.nx*frame.dx+e.nz*frame.dz;
      endWall(m,e,podium,roof,isA&&side<-.92&&e.length>30,side>.90&&e.length>19,index*131);
    }
  }
}

// Below the planted eight-floor terrace the outpatient frontage has four
// continuous ribbons. The two-storey lobby is set back behind its columns.
export function wardPodium(m,e,base,roof){
  const w=e.length,n=Math.max(2,Math.round(w/2.02)),bay=w/n;
  const bottom=base+9.9,fascia=roof-4.35,dy=(fascia-bottom)/4;
  const tile=tiledFace(m,e,bottom,bay*.67,dy*.25);
  m.face(e,w/2,-2.54,(base+bottom)/2,w,bottom-base,.15,0x4b4a42);
  for(let i=0;i<n;i++){
    const t=(i+.5)*bay;
    m.face(e,t,-.73,(base+bottom)/2,bay-.09,bottom-base-.08,.065,0x718c8c,"clear");
    m.face(e,i*bay,-.64,(base+bottom)/2,.07,bottom-base,.12,0x605e57);
    if(i%3===0)m.face(e,t,-1.26,(base+bottom)/2,.73,bottom-base,.76,0xc9ab92);
  }
  for(const y of [base+2.7,base+5.2,base+7.8])m.face(e,w/2,-.65,y,w,.089,.12,0x77736b);
  for(let j=0;j<4;j++){
    const y=bottom+j*dy,lo=y+dy*.56,hi=y+dy*.93;
    tile(0,w,y,lo);tile(0,w,hi,y+dy);
    for(let i=0;i<n;i+=3){
      const l=i*bay,r=Math.min(w,l+3*bay);
      const pier=Math.min(.43,(r-l)*.15);
      tile(l,l+pier,lo,hi);
      wardWindow(m,e,l+pier,r,lo,hi,307+j*37+i,Math.min(6,2*(n-i)),.88);
    }
  }
  tile(0,w,fascia,roof);
  // Two narrow drip ledges under the coping are distinct in the south view.
  for(const y of [fascia-.14,fascia-.46])m.face(e,w/2,-.28,y,w-.52,.09,.69,0x979389);
}

// The eighth-floor garden is a long bed between two paved strips. Its wider
// west end turns around a separate paved court. Both are visible from above.
export function wardTerrace(m,e,deck){
  const planting=[0x668548,0x799453,0x54743c,0x708747,0x839b52,0x547948];
  const planter=(left,right,near,far,h)=>{
    const mid=(left+right)/2,out=(near+far)/2,w=right-left,d=far-near;
    m.face(e,mid,out,deck+h/2,w,h,d,0xafaa96);
    m.face(e,mid,out,deck+h+.012,w-.27,.04,d-.27,0x766e53);
  };
  function crown(t,v,y,r,h,seed){
    const [x,z]=at(e,t,v),n=8,offset=noise(seed,1)*Math.PI;
    const ring=(level,width,ky)=>Array.from({length:n},(_,j)=>{
      const a=(j+level*.28)*2*Math.PI/n+offset;
      const reach=r*width*(.87+.24*noise(j,level,seed));
      return [x+Math.cos(a)*reach,y+h*ky+.09*h*noise(j,level+5,seed),z+Math.sin(a)*reach*.86];
    });
    const rows=[ring(0,.31,0),ring(1,.95,.30),ring(2,.91,.64),ring(3,.48,.88)];
    const leaf=(j,k)=>planting[Math.floor(noise(j+seed,k,9)*planting.length)];
    for(let j=0;j<n;j++){
      const next=(j+1)%n;
      for(let k=1;k<rows.length;k++){
        const a=rows[k-1][j],b=rows[k][j],c=rows[k][next],d=rows[k-1][next];
        m.triangle(a,b,c,leaf(j,k));m.triangle(a,c,d,leaf(j,k));
      }
      m.triangle(rows[3][j],[x,y+h,z],rows[3][next],leaf(j,4));
    }
  }
  m.face(e,39,5.3,deck+.043,76,.086,10.38,0xaaa799);
  m.face(e,31.0,9.0,deck+.10,52,.07,2.69,0x747873);
  for(let t=5.7;t<57.2;t+=1.16)m.face(e,t,9.0,deck+.141,.021,.012,2.65,0x96978a);
  for(const [i,l,r] of [[0,7.7,39.2],[1,41.1,56.2]]){
    planter(l,r,2.45,7.3,.45);
    const count=Math.round((r-l)/1.4);
    for(let j=0;j<count;j++)for(let k=0;k<3;k++){
      const seed=211*i+17*j+k;
      const t=l+(j+.5+.18*(noise(seed,5)-.5))*(r-l)/count;
      const v=3.25+k*1.49+.23*(noise(seed,6)-.5);
      crown(t,v,deck+.44,.86+.22*noise(seed,3),.62+.68*noise(seed,4),seed);
    }
    for(let j=0;j<Math.floor((r-l)/5);j++){
      const t=l+2.3+j*5.3,v=4.0+.56*noise(i,j),h=1.43+.52*noise(j,i),p=at(e,t,v);
      m.part("round",p,deck+.53+h*.31,.11,h*.65,.11,0,0x746756);
      crown(t,v,deck+.51+h*.55,1.03+.25*noise(j,9),h,601+i*30+j);
    }
  }
  planter(59.2,77.1,-6.8,10.3,.24);
  m.face(e,68.0,1.50,deck+.29,12.4,.08,12.3,0xa29b85);
  for(let j=0;j<14;j++){
    const t=60.1+j*1.24;
    for(const v of [-5.66,8.9])crown(t,v,deck+.26,.73,.5+.27*noise(j,5),901+j+(v>0?70:0));
  }
  for(let t=1.4;t<=77.3;t+=2)m.face(e,t,10.47,deck+.55,.054,1.04,.06,0x9caaa2);
  for(const h of [.57,1.06])m.face(e,39.3,10.47,deck+h,76,.055,.072,0xa9b4a9);
}
