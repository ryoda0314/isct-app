// Exterior photographs, second-floor restaurant and lawn:
// https://www.ssc.titech.ac.jp/amap/home/suzukakedai/h/h1h2bldgs/
// https://www.kyoikushisetsu.co.jp/work/東京工業大学すずかけ台大学会館/
// Local metres. The 5 m DEM does not resolve the raised dining apron and its bank.
import { groundAt as demAt } from './terrain.js';
import { paths } from './data.js';
import { projectPoint } from './landscapeGeometry.js';
import { plaqueText } from './landscapeFixtures.js';

const cx=-17.159,cz=-146.007,facade=15.23,deck=15.68;
const start=-2.52,end=-.83,inner=15.12,outer=17.18;
const blend=t=>{const q=Math.max(0,Math.min(1,t));return q*q*(3-2*q);};
const polar=(r,a)=>[cx+r*Math.cos(a),cz+r*Math.sin(a)];
function bankOnly(x,z,h) {
  const side=blend((x+36)/9)*(1-blend((x+11.4)/12));
  const reach=blend((z+186)/15)*(1-blend((z+160.5)/4.2));
  return Math.max(h,h+(deck-.07-h)*side*reach);
}
export function hallLawnHeight(x,z,h) {
  if(x< -36||x>1||z< -186||z> -153.7)return h;
  return bankOnly(x,z,h);
}
export function hallApronAt(x,z) {
  if(x< -32||x> -4||z< -164||z> -153.7)return null;
  const r=Math.hypot(x-cx,z-cz),a=Math.atan2(z-cz,x-cx);
  return r>=inner-.12&&r<=outer+.035&&a>=start&&a<=end?deck:null;
}
const lawnY=(x,z)=>hallLawnHeight(x,z,demAt(x,z));
const nearby=paths.flatMap(p=>p.points.slice(1).map((b,i)=>({a:p.points[i],b,half:p.width/2})))
  .filter(({a,b})=>Math.min(a[0],b[0])<14&&Math.max(a[0],b[0])> -53&&Math.min(a[1],b[1])< -131&&Math.max(a[1],b[1])> -188);
const clearOfPaths=(x,z,extra)=>nearby.every(s=>projectPoint(x,z,s.a,s.b).d>s.half+extra);

export function hallGround(batch,t,solid,shadows,T,group) {
  const leafColors=[0x70844d,0x879550,0x6e864f,0x92a35e];
  const beam=(a,b,size,col,kind='box')=>batch.beam(a,b,size,size,col,kind);
  const safeSolid=(x,z,r)=>{if(clearOfPaths(x,z,r+.32))solid(x,z,r);};
  const point=(r,a,y)=>{const [x,z]=polar(r,a);return [x,y,z];};
  const strip=(r0,r1,a,b,y,color)=>t.quad(point(r0,a,y),point(r0,b,y),point(r1,b,y),point(r1,a,y),color);
  // The restaurant terrace meets the lawn at the top of the bank, and ends in
  // white concrete cheek walls where the ground falls away to the lower plaza.
  const cuts=36;
  for(let i=0;i<cuts;i++){
    const a=start+(end-start)*i/cuts,b=start+(end-start)*(i+1)/cuts;
    strip(inner,outer,a,b,deck,0xc1afa1);
    strip(inner,outer,a,a+.0017,deck+.007,0x958a7e);
    for(const r of [15.65,16.16,16.67])strip(r,r+.014,a,b,deck+.009,0xa99d8e);
    const A=point(outer,a,deck),B=point(outer,b,deck);
    const low=[A,B].map(([x,,z])=>[x,demAt(x,z)-.15,z]);
    t.quad(low[0],A,B,low[1],0xd9d6c7);
    const mid=(a+b)/2,[x,z]=polar(outer+.28,mid);
    if(deck-bankOnly(x,z,demAt(x,z))<.61)continue;
    const wall=(a< -2.13||a> -1.10);
    const h=wall?.70:.10;
    t.quad(A,B,point(outer,b,deck+h),point(outer,a,deck+h),0xe5e0d3);
    strip(outer-.17,outer,a,b,deck+h,0xeae4d8);
    t.quad(point(outer-.17,a,deck),point(outer-.17,b,deck),point(outer-.17,b,deck+h),point(outer-.17,a,deck+h),0xd0cbbf);
    if(i%2===0)beam(point(outer-.084,a,deck+h),point(outer-.084,a,deck+1.02),.038,0x89938e,'post');
    beam(point(outer-.084,a,deck+1.02),point(outer-.084,b,deck+1.02),.043,0x8a948e,'post');
    safeSolid(x,z,.19);
  }
  for(const a of [start,end]) {
    const A=point(inner,a,deck),B=point(outer,a,deck);
    t.quad([A[0],demAt(A[0],A[2])-.1,A[2]],A,B,[B[0],demAt(B[0],B[2])-.1,B[2]],0xd6d4c8);
    beam(point(inner,a,deck+.86),point(outer,a,deck+.86),.045,0x939c94,'post');
  }
  // The short 2F dining approach is paved directly up to the frame of the glazed door.
  const doorAngle=-1.373,far=polar(17.95,doorAngle),near=polar(inner+.12,doorAngle);
  const ux=Math.cos(doorAngle),uz=Math.sin(doorAngle),side=(p,k)=>[p[0]-uz*k,p[1]+ux*k];
  const V=(p,k,h)=>{const [x,z]=side(p,k);return [x,h,z];};
  t.quad(V(near,-.86,deck+.012),V(far,-.86,deck+.008),V(far,.86,deck+.008),V(near,.86,deck+.012),0xabaca2);
  // Segmented crimson awning and fine metal cafe furniture in the current photos.
  for(let i=0;i<5;i++){
    const a=doorAngle+(i-1.25)*.080,yaw=Math.PI/2-a;
    const [x,z]=polar(facade+.52,a),y=deck+2.73;
    batch.put('box',i%2?0xa32d43:0xad3448,x,y,z,1.23,.065,.98,yaw,.37);
    const [fx,fz]=polar(facade+.964,a);
    batch.put('box',0x9b3045,fx,y-.24,fz,1.22,.17,.055,yaw);
    for(const side of [-1,1]){
      const angled=a+side*.036;
      beam(point(facade+.11,angled,y-.46),point(facade+.88,angled,y-.17),.034,0x616967,'post');
    }
  }
  const signAngle=doorAngle-.06,heading=Math.PI/2-signAngle;
  batch.put('box',0x777970,...point(facade+.91,signAngle,deck+2.96),2.03,.48,.11,heading);
  batch.put('box',0xe4ded1,...point(facade+.978,signAngle,deck+2.96),1.96,.41,.035,heading);
  if(T&&group)plaqueText(T,group,'Kitchen MOTOTECH',...point(facade+1.006,signAngle,deck+2.96),1.79,.23,heading,0,'#633e37');
  for(const a of [-2.01,-1.87]){
    const table=point(16.26,a,deck+.73);
    batch.put('post',0x8f6657,...table,.70,.05,.70);
    beam(point(16.26,a,deck+.035),table,.065,0x585956,'post');
    for(const sign of [-1,1]){
      const phi=a+sign*.035,seat=point(16.25,phi,deck+.43);
      batch.put('post',0x975c52,...seat,.36,.042,.36);
      for(const s of [-1,1])for(const dr of [-.10,.10])
        beam(point(16.25+dr,phi+s*.007,deck+.035),point(16.25+dr,phi+s*.007,deck+.43),.026,0x775c53,'post');
      beam(point(16.25,phi+sign*.010,deck+.47),point(16.25,phi+sign*.012,deck+.75),.033,0x775c53,'post');
      batch.put('box',0x865c51,...point(16.25,phi+sign*.012,deck+.72),.30,.12,.035,-phi);
    }
  }
  // Curved lower-storey pavement and narrow drainage strip at the glass.
  const atGround=(r,a,h)=>{const [x,z]=polar(r,a);return [x,demAt(x,z)+h,z];};
  for(let i=0;i<48;i++){
    const a=-.77+i*.052,b=a+.052;
    t.quad(atGround(15.28,a,.076),atGround(15.28,b,.076),atGround(17.06,b,.076),atGround(17.06,a,.076),0xaeaaa0);
    t.quad(atGround(15.47,a,.082),atGround(15.47,b,.082),atGround(15.58,b,.082),atGround(15.58,a,.082),0x797f78);
    t.quad(atGround(17.06,a,.076),atGround(17.06,b,.076),atGround(17.26,b,.076),atGround(17.26,a,.076),0xd3cfc1);
  }
  // The trees on the lawn have open spreading crowns with visible forked trunks.
  for(const [x,z,h,angle] of [[-30.6,-174.3,7.7,2.8],[-39.1,-157.1,6.2,.10],[-2.7,-182.7,6.9,1.35]]) {
    const y=lawnY(x,z),fork=[x+.22,y+h*.28,z-.15];
    beam([x,y-.10,z],fork,h*.064,0x665c4b,'trunk');
    beam([x,y-.10,z],fork,h*.061,0x665c4b,'stemFar');
    for(let j=0;j<5;j++) {
      const a=angle+j*2.39,dx=Math.cos(a),dz=Math.sin(a);
      const end=[x+dx*h*.24,y+h*(.64+.05*(j%3)),z+dz*h*.24];
      const elbow=[x+dx*h*.11,y+h*.45,z+dz*h*.12];
      beam(fork,elbow,h*.041,0x675b49,'trunk');beam(elbow,end,h*.028,0x716552,'trunk');
      for(let k=0;k<3;k++){
        const b=a+.69*(k-1),scale=h*(k===1?.20:.165);
        const tip=[end[0]+Math.cos(b)*scale,end[1]+h*(.11+.04*(k%2)),end[2]+Math.sin(b)*scale];
        beam(end,tip,h*.012,0x746651,'trunk');
        batch.put('leaf',leafColors[(j+k)%4],...tip,h*.15,h*.105,h*.14,b);
        batch.put('shoot',leafColors[(j+2*k)%4],tip[0]+dx*.57,tip[1]-.27,tip[2]+dz*.58,1.35,1.04,1.38,b);
      }
    }
    batch.put('canopyFar',leafColors[0],x,y+h*.70,z,h*.4,h*.21,h*.4,angle);
    safeSolid(x,z,h*.032);shadows?.add(x+.44,z+.21,h*.40,.27);
  }
  for(const [x,z] of [[-26.5,-182.3],[-15.5,-166.2],[1.8,-169.2]]){
    const y=lawnY(x,z);batch.put('post',0x414747,x,y+.34,z,.115,.69,.115);
    batch.put('post',0xbfc2ab,x,y+.61,z,.119,.055,.119);safeSolid(x,z,.065);
  }
}
