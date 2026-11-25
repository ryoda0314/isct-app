import { parapet, equipment } from "./facadeKit.js";

// Tokyo Peil minus 15 m, the map's datum. The 2015 completion drawings put
// the landing surface at TP 103.20 m, 8.03 m above the roof carrying its legs.
export const wardRoofLevel=80.17;
const flightLevel=88.20;
const dx=.9146431543,dz=.4042621677,yaw=-Math.atan2(dz,dx);
const point=(u,v)=>[-5.49757+dx*u-dz*v,14.53450+dz*u+dx*v];
const xyz=(u,y,v)=>{const [x,z]=point(u,v);return [x,y,z];};
const rect=(a,b,c,d)=>[point(a,b),point(c,b),point(c,d),point(a,d)];
const frame={point,yaw};
const concrete=0xb0aba0,galvanized=0xb4bdbb,steel=0x727e7e,shadowSteel=0x57646a;
const wetDeck=0xb4b2a6,flashing=0xbdb3a4,fanShell=0xc4c5bb;
const box=(m,u,v,y,w,d,h,color)=>m.box(point(u,v),y,w,h,d,yaw,color);

// The dark cuts beside the light wells are lower roofs, visible through
// the screen of fans. The outer roof, its cap and the lower floor have
// separate lidar returns near TP 95.2, 96.1 and 90.1 respectively.
export function roofWells(isA){
  return (isA?[[-19.5,15.7,11.9,18.7],[-.6,-14.2,12.0,-9.6]]:
    [[-47.0,-52.1,-17,-45.2],[-47.2,-25.0,-29.6,-19.2]]).map(args=>rect(...args));
}

function fanBank(m,first,last,v,base,count){
  const pitch=(last-first)/count,r=Math.min(1.18,pitch*.435);
  box(m,(first+last)/2,v,base+.19,last-first,2*r+.55,.38,0x92918a);
  box(m,(first+last)/2,v,base+.92,last-first-.2,2*r+.20,1.12,fanShell);
  for(let i=0;i<count;i++){
    const u=first+(i+.5)*pitch,p=point(u,v);
    m.part("round",p,base+1.54,2*r,.35,2*r,yaw,0xa3a8a3);
    m.part("round",p,base+1.727,r*1.77,.035,r*1.77,yaw,0x464f51);
    for(let j=0;j<4;j++)m.box(p,base+1.76,r*1.70,.046,.085,yaw+j*Math.PI/4,0x87928c);
    m.part("round",p,base+1.78,.35,.09,.35,yaw,galvanized);
  }
}

function guard(m,a,b,y,height=.91){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(len/1.55);
  for(const h of [.38,height])
    m.beam(xyz(a[0],y+h,a[1]),xyz(b[0],y+h,b[1]),.055,galvanized);
  for(let i=0;i<=n;i++){
    const t=i/n,u=a[0]+t*(b[0]-a[0]),v=a[1]+t*(b[1]-a[1]);
    box(m,u,v,y+height/2,.058,.058,height,steel);
    if(i===n)continue;
    for(let j=1;j<5;j++){
      const f=(i+j/5)/n;
      box(m,a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1]),y+height*.51,.027,.027,height*.90,galvanized);
    }
  }
}

function grating(m,u,v,w,d,y){
  // Open parallel bars and widely spaced transverse ties leave the supports
  // visible from above and allow the landings to cast patterned shadows.
  const horizontal=w>d,long=horizontal?w:d,short=horizontal?d:w,n=Math.ceil(long/.27);
  for(let i=0;i<=n;i++){
    const x=long*(i/n-.5);
    box(m,u+(horizontal?x:0),v+(horizontal?0:x),y,horizontal?.044:short,horizontal?short:.044,.072,galvanized);
  }
  for(const q of [-.46,0,.46])box(m,u+(horizontal?0:q*short),v+(horizontal?q*short:0),
    y-.08,horizontal?w:.09,horizontal?.09:d,.12,steel);
}

function deckMarkings(m,u,v){
  const y=flightLevel+.015,paint=0xf8c35b;
  for(const s of [-1,1]){
    box(m,u+s*10,v,y,.17,24.1,.018,paint);
    box(m,u,v+s*12.05,y,20.0,.17,.018,paint);
    box(m,u+s*.84,v,y+.015,.31,3.57,.022,paint);
  }
  box(m,u,v,y+.015,1.65,.31,.022,paint);
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32,r=3.08;
    const ring=(t,radius)=>xyz(u+radius*Math.cos(t),y,v+radius*Math.sin(t));
    m.triangle(ring(a,r-.11),ring(b,r+.11),ring(a,r+.11),paint);
    m.triangle(ring(a,r-.11),ring(b,r-.11),ring(b,r+.11),paint);
  }
  // Apron photos show two long parallel direction strokes and the facility
  // number just inside the left corner of the yellow rectangle.
  for(const s of [-1,1]){
    box(m,u+s*10.85,v-1,y,.14,5.8,.018,paint);
    for(const t of [-1,1])
      m.beam(xyz(u+s*10.85,y,v+1.94),xyz(u+s*10.85+t*.26,y,v+1.27),.023,paint,.12);
  }
  const strings=["acdfg","bc","abc"];
  const strokes={a:[0,-.42,.54,.095],b:[.245,-.22,.095,.44],c:[.245,.22,.095,.44],
    d:[0,.42,.54,.095],f:[-.245,-.22,.095,.44],g:[0,0,.54,.095]};
  for(let i=0;i<3;i++)for(const key of strings[i]){
    const [x,z,w,d]=strokes[key];box(m,u-9.36+.72*i+x,v+11.23+z,y+.012,w,d,.018,paint);
  }
}

function landingDeck(m){
  const u=-15.1,v=1.2,roof=wardRoofLevel,y=flightLevel,half=12.67,walk=1.72;
  const cols=[u-10.9,u-3.6,u+3.6,u+10.9],rows=[v-10.7,v,v+10.7];
  for(const x of cols)for(const z of rows){
    box(m,x,z,roof+.115,1.55,1.55,.23,0xd6d5cc);
    box(m,x,z,roof+.385,1.06,1.06,.31,concrete);
    box(m,x,z,roof+.565,.68,.68,.09,steel);
    const h=y-.82-(roof+.61);
    box(m,x,z,roof+.61+h/2,.18,.34,h,steel);
    for(const s of [-1,1])box(m,x+s*.16,z,roof+.61+h/2,.065,.41,h,galvanized);
  }
  for(const z of rows){
    box(m,u,z,y-.56,half*2,.23,.73,steel);
    box(m,u,z,y-.90,half*2,.48,.10,galvanized);
    for(let i=1;i<cols.length;i++){
      const a=cols[i-1],b=cols[i],mid=(a+b)/2;
      for(const x of [a,b])m.beam(xyz(x,roof+.7,z),xyz(mid,y-.89,z),.14,galvanized);
    }
  }
  for(const x of cols){
    box(m,x,v,y-.48,.30,half*2,.64,shadowSteel);
    if(x===cols[0]||x===cols.at(-1))for(let i=1;i<rows.length;i++){
      const a=rows[i-1],b=rows[i];
      for(const z of [a,b])m.beam(xyz(x,roof+.65,z),xyz(x,y-.83,(a+b)/2),.14,galvanized);
    }
  }
  for(let i=0;i<23;i++){
    const x=u-half+(i+.5)*half*2/23;
    box(m,x,v,y-.254,.14,half*2,.29,galvanized);
  }
  box(m,u,v,y-.115,half*2,half*2,.23,0x369b96);
  deckMarkings(m,u,v);
  for(const s of [-1,1]){
    const outU=u+s*(half+walk),outV=v+s*(half+walk),grateY=y-.68;
    grating(m,u+s*(half+walk/2),v,walk,half*2+walk*2,grateY);
    grating(m,u,v+s*(half+walk/2),half*2,walk,grateY);
    guard(m,[outU,v-half-walk],[outU,v+half+walk],grateY,.87);
    if(s===1)guard(m,[u-half,outV],[u+half,outV],grateY,.87);
    else{
      guard(m,[u-half,outV],[-22.95,outV],grateY,.87);
      guard(m,[-17.35,outV],[u+half,outV],grateY,.87);
    }
    for(let k=-1;k<=1;k++){
      const p=point(u+s*(half+.48),v+k*9.7);
      m.part("round",p,y-.42,.25,.23,.25,yaw,0xa55a42);
      m.part("round",p,y-.22,.19,.18,.19,yaw,0xffab4c);
    }
    box(m,outU,v+3,y-.22,.20,.47,.61,0xb6503b);
  }
}

function accessBridge(m){
  const u=-20.15,start=-30.4,end=-11.42,mid=(start+end)/2,len=end-start;
  const y=flightLevel,level=y-.10;
  box(m,u,mid,level,4,len,.18,0xc2c9c6);
  for(const s of [-1,1]){
    box(m,u+2.0*s,mid,level-.36,.20,len,.52,steel);
    grating(m,u+2.40*s,mid,.80,len,level-.10);
    guard(m,[u+2.78*s,start],[u+2.78*s,end],level-.10,.93);
  }
  for(const v of [-17.0,-22.5])for(const side of [-1,1]){
    const x=u+side*1.65,h=y-wardRoofLevel-.5;
    box(m,x,v,wardRoofLevel+.14,1.12,1.12,.28,concrete);
    box(m,x,v,wardRoofLevel+.3+h/2,.27,.27,h,steel);
    m.beam(xyz(x,wardRoofLevel+.45,v),xyz(u-side*1.65,y-.5,v),.14,galvanized);
  }
  // At the north end the transfer landing turns east over the B roof.
  box(m,-16.99,-30.8,level-.027,8.74,3.14,.22,0xc3c7c1);
  guard(m,[-22.93,-32.39],[-12.70,-32.39],level+.08,1.15);
  guard(m,[-12.70,-32.39],[-12.70,-29.20],level+.08,1.15);
  box(m,-15.16,-30.65,level+.09,2.34,1.36,.025,0xabb2b2);
}

export function hospitalRoof(m,isA,ring,court,wells,podium,wallColour){
  const h=wardRoofLevel,lower=h-5.07;
  parapet(m,ring,h,wallColour,.88);
  parapet(m,court,h,wallColour,.72);
  for(const pit of wells){
    m.solid(pit,podium,lower,wallColour,wetDeck);
    for(let i=0;i<pit.length;i++){
      const a=pit[i],b=pit[(i+1)%pit.length],lo=[a[0],lower,a[1]],hi=[a[0],h,a[1]];
      const L=[b[0],lower,b[1]],H=[b[0],h,b[1]];
      m.triangle(lo,H,hi,0x97958a);m.triangle(lo,L,H,0x97958a);
    }
    parapet(m,pit,h,flashing,.17);
  }
  if(isA){
    landingDeck(m);
    fanBank(m,.2,11.3,10.67,h,5);
    fanBank(m,-.15,12.1,-11.55,lower+1.25,6);
    for(const u of [17.0,22.2]){
      equipment(m,frame,u,1.8,3.55,9.9,h,1.88);
      fanBank(m,u-2.0,u+2.0,-4.6,h,2);
    }
    for(const v of [-8,12.9])guard(m,[14.5,v],[25,v],h,.95);
    for(const u of [14.5,25])guard(m,[u,-8],[u,12.9],h,.95);
    return;
  }
  accessBridge(m);
  // Staggered lift/stair and waiting enclosures to the east of the B light well.
  // Its green standing-seam cap can be seen from both end elevations.
  box(m,-14.9,-27.4,h+1.94,15.2,14.4,3.88,wallColour);
  box(m,-14.9,-27.4,h+3.99,15.50,14.70,.19,wetDeck);
  box(m,-12.55,-24.44,h+6.00,8.63,4.52,3.97,0xbab6a9);
  box(m,-12.55,-24.44,h+8.06,8.98,4.85,.17,0x94aaa2);
  const capU=[-17.04,-8.06],capV=[-26.86,-24.44,-22.02];
  for(let i=0;i<2;i++){
    const edge=(j,k)=>xyz(capU[j],h+(k===1?9.50:8.15),capV[k]);
    const a=edge(0,i),b=edge(1,i),c=edge(1,i+1),d=edge(0,i+1);
    m.triangle(a,c,b,0x70a5a1);m.triangle(a,d,c,0x70a5a1);
  }
  for(let j=0;j<=17;j++){
    const x=capU[0]+(capU[1]-capU[0])*j/17;
    for(const v of [capV[0],capV[2]])m.beam(xyz(x,h+8.18,v),xyz(x,h+9.53,capV[1]),.046,0x629594);
    if(j===0||j===17){
      const a=xyz(x,h+8.15,capV[0]),b=xyz(x,h+8.15,capV[2]),c=xyz(x,h+9.50,capV[1]);
      if(j===0)m.triangle(a,b,c,flashing);else m.triangle(a,c,b,flashing);
    }
  }
  box(m,-15.56,-31.85,h+5.49,4.9,2.36,2.95,0xbdbcb2);
  box(m,-15.56,-31.85,h+7.02,5.2,2.67,.16,flashing);
  for(const v of [-45,-37.1,-29])equipment(m,frame,-57.3,v,6.2,4.1,h,2.60);
  fanBank(m,-60.8,-53.5,-21.5,h,3);
  for(const s of [-1,1]){
    guard(m,[-57.3+s*5,-50],[-57.3+s*5,-19.6],h,1.05);
    box(m,-52.4+s*.32,-36.6,h+.38,.26,26.9,.37,galvanized);
  }
}
