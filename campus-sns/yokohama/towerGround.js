import { buildings, paths } from './data.js';
import { groundAt } from './terrain.js';
import { orientedFrame } from './buildingsGeometry.js';
import { projectPoint, triangleBatch } from './landscapeGeometry.js';

// The two gabled ends have entrances at different elevations. Use the same
// structural grid for the door frames, forecourts and walking surface.
export function towerFrame(ring) {
  const angle=-38.1*Math.PI/180,ux=Math.cos(angle),uz=Math.sin(angle);
  const axes=ring.map(([x,z])=>[x*ux+z*uz,-x*uz+z*ux]);
  const u0=Math.min(...axes.map(p=>p[0])),v0=Math.min(...axes.map(p=>p[1]));
  return {
    w:Math.max(...axes.map(p=>p[0]))-u0,d:Math.max(...axes.map(p=>p[1]))-v0,
    point:(u,v)=>[(u0+u)*ux-(v0+v)*uz,(u0+u)*uz+(v0+v)*ux],
    local:(x,z)=>[x*ux+z*uz-u0,-x*uz+z*ux-v0],angle
  };
}
const ring=buildings.find(b=>b.id==='J2-J3').footprint;
const fr=towerFrame(ring), footprint=orientedFrame(ring);
const heights=[...ring.map(p=>groundAt(...p)),groundAt(footprint.cx,footprint.cz)].sort((a,b)=>a-b);
const base=heights[Math.floor(heights.length/2)];
const upper=groundAt(...fr.point(-13,21.7))+.055, lobby=base+5.8;
const rampToe=-13,rampCrest=17.6;
// Short vertical curves ease the change from the entrance apron to the slope.
// Both ends are tangent to the paving of their adjoining landings.
function ramp(v,roadbedAt) {
  const start=roadbedAt(...fr.point(43,rampToe))+.055;
  const length=rampCrest-rampToe,run=Math.max(0,Math.min(length,v-rampToe)),ease=2;
  const m=(lobby-start)/(length-ease);
  if(run<ease)return start+m*run*run/(2*ease);
  if(run>length-ease)return lobby-m*(length-run)*(length-run)/(2*ease);
  return start+m*(run-ease/2);
}
const clamp=x=>Math.max(0,Math.min(1,x));
function parkingLip(u,v,roadbedAt) {
  const f=clamp((u+13.4)/2.7),blend=f*f*(3-2*f);
  const grade=roadbedAt(...fr.point(u,v))+.055;
  return grade+(upper-grade)*blend;
}
const P=(u,v,y)=>{const [x,z]=fr.point(u,v);return [x,y,z];};
const near=(x,z)=>x>-100&&x< -28&&z> -53&&z<30;

export function towerSurfaceAt(x,z,roadbedAt=groundAt) {
  if(!near(x,z))return null;
  const [u,v]=fr.local(x,z);
  if(u>=-13.4&&u<=3.76&&v>=16.8&&v<=26.2)return u< -10.7?parkingLip(u,v,roadbedAt):upper;
  if(u>=29.95&&u<=44.75&&v>=rampCrest&&v<=25.9)return lobby;
  if(u>=41.25&&u<=44.75&&v>=rampToe&&v<rampCrest)return ramp(v,roadbedAt);
  if(v>=rampToe&&v<rampCrest&&((u>=39.8&&u<41.25)||(u>44.75&&u<=47.8))){
    const inner=u<41.25?41.25:44.75,outer=u<41.25?39.8:47.8;
    const f=(u-inner)/(outer-inner),h=ramp(v,roadbedAt);
    return h+(roadbedAt(...fr.point(outer,v))+.055-h)*f;
  }
  return null;
}
export function towerRecess(x,z) {
  // Within the cadastral footprint the atrium is set back at both ends.
  const [u,v]=fr.local(x,z);
  return v>17.3&&v<25.6&&((u>-1&&u<2.70)||(u>30.93&&u<34));
}
export function towerPlantedArea(x,z) {
  if(x< -143||x> -24||z< -59||z>70)return false;
  const [u,v]=fr.local(x,z);
  return (u>38&&u<48.5&&v>-14&&v<27)||(u>-35&&u< -8.7&&v>-10&&v<28)||(u>-12&&u<4.5&&v>15&&v<27.2);
}

export function towerRailBlocks(x,z,r) {
  if(!near(x,z))return false;
  const [u,v]=fr.local(x,z);
  return (u>=-8.8&&u<=3.25&&(Math.abs(v-16.86)<r||Math.abs(v-26.12)<r))||
    (u>=34.7&&u<=43.9&&Math.abs(v-25.78)<r)||(v>=-10&&v<=17.5&&Math.abs(u-41.35)<r);
}

// Compact cars and hatchbacks in the surveyed parking rows. Body, glass,
// wheels and lights are separate surfaces so the silhouettes work from both ends.
function parkingCar(shell,batch,solid,u,v,facing,color,hatch,roadbedAt) {
  const scale=hatch?.90:1.0,[x,z]=fr.point(u,v),floor=roadbedAt(x,z)+.065;
  const p=(a,b,h)=>P(u+a*facing*scale,v+b*facing,floor+h);
  const sections=[[-2.23,.67,.30,.69],[-1.91,.82,.24,.88],[-1.02,.86,.23,.96],
    [1.05,.86,.23,.94],[1.87,.80,.27,.79],[2.17,.71,.34,.68]];
  for(let j=0;j<sections.length-1;j++){
    const [a,w,lo,hi]=sections[j],[b,W,Lo,Hi]=sections[j+1];
    shell.quad(p(a,-w,hi),p(b,-W,Hi),p(b,W,Hi),p(a,w,hi),color);
    for(const s of [-1,1])shell.quad(p(a,s*w,lo),p(b,s*W,Lo),p(b,s*W,Hi),p(a,s*w,hi),color);
  }
  for(const [a,w,lo,hi] of [sections[0],sections.at(-1)]){
    shell.quad(p(a,-w,lo),p(a,w,lo),p(a,w,hi),p(a,-w,hi),color);
    for(const s of [-1,1])shell.quad(p(a+s*.001,s*.42,hi-.18),p(a,s*(w-.05),hi-.14),
      p(a,s*(w-.07),hi-.022),p(a,s*.40,hi-.07),a>0?0xdbdcd0:0x9b3534);
  }
  const A=hatch?-1.55:-1.42,B=.96,L=hatch?-1.27:-.81,R=.49,H=hatch?1.61:1.44;
  shell.quad(p(A,-.78,.91),p(A,.78,.91),p(L,.66,H),p(L,-.66,H),0x516568);
  shell.quad(p(B,.79,.93),p(B,-.79,.93),p(R,-.66,H),p(R,.66,H),0x647a7d);
  shell.quad(p(L,-.66,H),p(L,.66,H),p(R,.66,H),p(R,-.66,H),color);
  for(const s of [-1,1]){
    shell.quad(p(A,s*.78,.91),p(B,s*.79,.93),p(R,s*.66,H),p(L,s*.66,H),0x53686b);
    for(const [a,b] of [[A,L],[-.32,-.38],[B,R]])batch.beam(p(a,s*.79,.925),p(b,s*.66,H),.052,.045,color);
    batch.beam(p(.62,s*.83,.97),p(.59,s*.99,1.04),.10,.105,color);
    for(const axle of [-1.31,1.32]){
      const wheel=p(axle,s*.818,.346);
      batch.put('post',0x303333,...wheel,.63,.165,.63,-fr.angle,Math.PI/2);
      const hub=p(axle,s*.912,.346);
      batch.put('post',0x9ca29e,...hub,.35,.025,.35,-fr.angle,Math.PI/2);
    }
  }
  for(const a of [-1.27,0,1.27]){const q=p(a,0,0);solid(q[0],q[2],.82);}
}

function parkingCourtyard(T,group,t,batch,solid,roadbedAt) {
  const ground=(u,v,lift)=>{const [x,z]=fr.point(u,v);return [x,roadbedAt(x,z)+lift,z];};
  for(let u=-35;u< -9;u++)for(let v=-10;v<28;v+=2){
    t.quad(ground(u,v,.035),ground(u+1,v,.035),ground(u+1,v+2,.035),ground(u,v+2,.035),0x888c8b);
  }
  const shell=triangleBatch(T,group),first=group.children.length;
  const colors=[0xe3e6dd,0x99a5a9,0x647991,0xedece1,0x38474e,0x9b5550,0x667775];
  const lotPaths=paths.filter(p=>p.points.some(([x,z])=>Math.hypot(x+90,z-10)<65));
  const inAisle=(u,v)=>{
    const [x,z]=fr.point(u,v);
    return lotPaths.some(p=>p.points.slice(1).some((b,i)=>projectPoint(x,z,p.points[i],b).d<p.width*.5+.93));
  };
  for(const [u,v0,count] of [[-20.9,-10.9,10],[-43.8,-6.1,10],[-48.7,4.1,5]]){
    for(let j=0;j<count;j++){
      const v=v0+j*2.65;
      if([u-1.85,u,u+1.85].some(a=>inAisle(a,v)))continue;
      const paint=0xdbddd2;
      for(const side of [-1.29,1.29]){
        for(let a=-2.37;a<2.3;a+=1.18)t.quad(ground(u+a,v+side-.045,.075),ground(u+a+1.18,v+side-.045,.075),
          ground(u+a+1.18,v+side+.045,.075),ground(u+a,v+side+.045,.075),paint);
      }
      const face=u>-30?1:-1,stop=ground(u+face*2.0,v,.17);
      batch.put('box',0xbbbbb1,...stop,.19,.16,1.48,-fr.angle);
      if((j+count)%4!==1)parkingCar(shell,batch,solid,u,v,-face,colors[(j+count+Math.round(-u))%colors.length],j%3===0,roadbedAt);
    }
  }
  shell.finish();
  if(group.children.length>first){const cars=group.children.at(-1);cars.name='J棟駐車場の車両';cars.castShadow=true;}
}

export function towerCourt(T,group,t,pavers,batch,solid,roadbedAt=groundAt) {
  const quad=(dest,u,v,U,V,y,Y,col)=>dest.quad(P(u,v,y),P(U,v,y),P(U,V,Y),P(u,V,Y),col);
  const slab=(u,v,U,V,y,col)=>{
    quad(pavers,u,v,U,V,y,y,col);
    for(const side of [v,V])t.quad(P(u,side,y-.38),P(U,side,y-.38),P(U,side,y),P(u,side,y),0x9c9b92);
  };
  const rail=(u,v,U,V,y,Y)=>{
    const n=Math.ceil(Math.hypot(U-u,V-v)/1.4);
    for(let j=0;j<=n;j++){
      const f=j/n,p=u+(U-u)*f,q=v+(V-v)*f,h=y+(Y-y)*f;
      batch.beam(P(p,q,h+.02),P(p,q,h+.96),.048,.048,0x869092,'post');
    }
    for(const h of [.48,.96])batch.beam(P(u,v,y+h),P(U,V,Y+h),.055,.055,0xadb3ae,'post');
  };
  pavers.orient(Math.cos(fr.angle),Math.sin(fr.angle));
  // Orange, brown and buff pavers in the parking-side third-floor forecourt.
  slab(-10.7,16.8,3.76,26.2,upper,0xb09a85);
  const lipPoint=(u,v)=>P(u,v,parkingLip(u,v,roadbedAt));
  for(let u=-13.4;u< -10.7;u+=.36)for(let v=16.8;v<26.2;v+=.6){
    const right=Math.min(-10.7,u+.36),end=Math.min(26.2,v+.6);
    pavers.quad(lipPoint(u,v),lipPoint(right,v),lipPoint(right,end),lipPoint(u,end),0xb09a85);
  }
  for(const v of [16.86,26.12]){
    rail(-8.8,v,3.25,v,upper,upper);
    for(const u of [-4.7,.6]){
      const y=groundAt(...fr.point(u,v));
      batch.beam(P(u,v,y-.25),P(u,v,upper-.26),.38,.48,0xb4b5ae);
    }
  }
  // Brown exposed-aggregate forecourt and the grassy bank at the hall-side door.
  slab(29.95,rampCrest,44.75,25.9,lobby,0xbbaa98);
  rail(34.7,25.78,43.9,25.78,lobby,lobby);
  for(let v=rampToe;v<rampCrest;v+=.5){
    const end=Math.min(rampCrest,v+.5),y=ramp(v,roadbedAt),Y=ramp(end,roadbedAt);
    quad(pavers,41.25,v,44.75,end,y,Y,0xb6a796);
    for(const edge of [41.25,44.75]) {
      const outer=edge===41.25?39.8:47.8;
      const toe=(q)=>{const [x,z]=fr.point(outer,q);return P(outer,q,roadbedAt(x,z)+.055);};
      t.quad(P(edge,v,y),P(edge,end,Y),toe(end),toe(v),edge===41.25?0x809153:0x8e9d60);
    }
  }
  for(let u=38;u<44;u++){
    const y=(U,V)=>{const p=fr.point(U,V);return P(U,V,roadbedAt(...p)+.055);};
    pavers.quad(y(u,-14.4),y(u+1,-14.4),y(u+1,rampToe),y(u,rampToe),0xb6a796);
  }
  rail(41.35,-10,41.35,rampCrest,ramp(-10,roadbedAt),lobby);
  // The low loading door remains visible beneath the raised entrance apron.
  for(const u of [32,38,44])for(const v of [18.2,25.3]){
    const y=groundAt(...fr.point(u,v));
    batch.beam(P(u,v,y-.22),P(u,v,lobby-.15),.42,.42,0xabafa9);
  }
  parkingCourtyard(T,group,t,batch,solid,roadbedAt);
}
