// Surveyed spans are in metres. Stonework, cast iron and steel are all modelled
// in section so their profile and shadows remain visible from the river.
import { addBlocker, bridgeLevel, bridgeSpecs, waterLevel } from './groundsLevels.js';
import { bridgeDeckLift } from './bridgeDeck.js';

function castRailing(t,batch,P,length,side,outer) {
  const paint=0xaeb8a2,cap=0xa6b09b,steel=0x656463;
  const along=(u,v,s,h,width,depth,color)=>batch.beam(P(u,s,h),P(v,s,h),width,depth,color);
  for(let i=0;i<30;i++) {
    const a=2.4+(length-4.8)*i/30,b=2.4+(length-4.8)*(i+1)/30;
    for(const y of [.24,.49,.75])along(a,b,outer,y,.064,.068,paint);
    t.quad(P(a,outer,.95),P(b,outer,.95),P(b,outer,1.14),P(a,outer,1.14),cap);
    along(a,b,outer,1.14,.10,.06,cap);
    for(const h of [.66,.86,1.23])along(a,b,outer-.10*side,h,.042,.042,steel);
    for(const off of [-.06,.06])
      batch.beam(P(a+off,outer,.17),P(a+off,outer,1.04),.085,.119,paint);
    batch.beam(P(a,outer-.09*side,.93),P(a,outer-.09*side,1.23),.042,.042,steel);
    along(a,b,outer-.08*side,.18,.077,.070,0x474a45);
    // Paired arch-shaped castings sit to either side of each railing upright.
    for(const center of [a+.25,b-.25]) {
      const r=.15;
      for(let j=0;j<6;j++) {
        const u=Math.PI*j/6,v=Math.PI*(j+1)/6;
        const arch=(angle,radius)=>P(center-Math.cos(angle)*radius,outer,.23+Math.sin(angle)*radius);
        t.quad(arch(u,r),arch(v,r),arch(v,r+.058),arch(u,r+.058),paint);
      }
    }
  }
}

function bridgeEnd(batch,P,angle,length,side,outer,writeSign) {
  const put=(s,u,h,w,l,height,color)=>batch.put('box',color,...P(u,s,h),w,height,l,angle);
  const granite=[0xb3afa4,0xaaa79e,0xb6b3ab,0xaaa9a0];
  for(const end of [0,length]) {
    const d=end===0?1:-1,s=outer-.02*side;
    const base=P(end,s),post=P(end+d*2.28,s);
    addBlocker([base[0],base[2]],[post[0],post[2]],.39);
    put(s,end+d*1.14,.78,.57,2.32,1.37,0x85847e);
    for(let course=0;course<4;course++) {
      const cuts=course%2?[0,.44,1.32,2.27]:[0,.88,1.76,2.27];
      for(let i=1;i<cuts.length;i++) {
        const a=cuts[i-1],b=cuts[i];
        put(s,end+d*(a+b)/2,.31+course*.31,.60,b-a-.016,.292,granite[(course+i)%4]);
      }
    }
    put(s,end+d*1.14,1.47,.72,2.38,.13,0xbab8ae);
    const u=end+d*2.28;
    for(const [h,r,height] of [[.22,.86,.15],[.83,.70,1.08],[1.39,.78,.10],[1.50,.83,.13]])
      batch.put('post',0xaeaba1,...P(u,s,h),r,height,r);
    for(const h of [.40,.65,.94,1.21])batch.put('post',0x94948c,...P(u,s,h),.715,.035,.715);
    put(s-.309*side,end+d*1.05,.89,.038,1.02,.31,0x73736a);
    const face=P(end+d*1.05,s-.332*side,.89);
    writeSign(end===0?'お茶の水橋':'おちゃのみずはし',face,.92,.22,angle+side*Math.PI/2);
  }
}

function steelFrame(t,batch,P,length,half) {
  const columns=[length*.217,length*.704],green=0x889579,highlight=0x9ba58a;
  function lowerEdge(u) {
    const d=Math.max(0,Math.min(...columns.map(c=>Math.abs(u-c)))-.70);
    const r=2.7;
    return -1.45-(d<r?r-Math.sqrt(r*r-(r-d)*(r-d)):0);
  }
  // An independent web for each frame gives the whole bridge visible depth.
  for(const s of [-half+.21,-half*.51,0,half*.51,half-.21]) {
    const cuts=[0,length,...columns.flatMap(c=>[-3.4,-2.6,-1.9,-1.4,-1.0,-.80,-.70,.70,.80,1.0,1.4,1.9,2.6,3.4].map(x=>c+x))].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const a=cuts[i-1],b=cuts[i],ya=lowerEdge(a),yb=lowerEdge(b);
      t.quad(P(a,s,.02),P(b,s,.02),P(b,s,yb),P(a,s,ya),green);
      t.quad(P(a,s-.24,ya),P(b,s-.24,yb),P(b,s+.24,yb),P(a,s+.24,ya),highlight);
    }
    for(const c of columns) {
      const bottom=P(c,s,0);bottom[1]=waterLevel+.18;
      const top=P(c,s,-3.95),h=top[1]-bottom[1];
      for(const offset of [-.64,.64]) {
        const a=P(c+offset,s,0),b=P(c+offset,s,-3.6);a[1]=bottom[1];
        batch.beam(a,b,.33,.34,highlight);
      }
      t.quad([P(c-.65,s)[0],bottom[1],P(c-.65,s)[2]],P(c-.65,s,-3.85),P(c+.65,s,-3.85),[P(c+.65,s)[0],bottom[1],P(c+.65,s)[2]],green);
      for(let j=1;j<5;j++){
        const a=P(c-.67,s,0),b=P(c+.67,s,0);a[1]=b[1]=bottom[1]+j*h/5;
        batch.beam(a,b,.16,.15,highlight);
      }
    }
    for(let u=1.7;u<length;u+=2.85)
      batch.beam(P(u,s-.024,.02),P(u,s-.024,lowerEdge(u)),.12,.18,highlight);
  }
  for(let u=1.1;u<length;u+=4.6)batch.beam(P(u,-half+.25,-.53),P(u,half-.25,-.53),.34,.49,green);
}

function bridgeLamp(batch,P,u,s,angle) {
  // The restored street lamp has two bell shades suspended from the same yoke.
  const pole=0x89937d,trim=0x778269;
  const ring=(h,d,height,c)=>batch.put('post',c,...P(u,s,h),d,height,d);
  for(const [h,d,height,color] of [[.28,.44,.29,trim],[1.15,.31,1.47,pole],[2.02,.38,.13,trim],[3.68,.20,3.22,pole],[5.32,.26,.09,trim],[5.59,.24,.08,trim],[5.85,.07,.48,trim]])ring(h,d,height,color);
  batch.put('round',pole,...P(u,s,2.24),.215,.25,.215);
  for(const h of [4.90,5.54])
    batch.put('box',pole,...P(u,s,h),2.08,.105,.095,angle);
  for(const side of [-1,1]) {
    const edge=s+side*.96;
    batch.put('round',trim,...P(u,edge,5.55),.11,.11,.11);
    batch.beam(P(u,edge,5.53),P(u,edge,5.18),.066,.066,pole,'post');
    batch.put('round',pole,...P(u,edge,5.05),.22,.26,.22);
    batch.put('round',trim,...P(u,edge,4.89),.36,.13,.36);
    batch.put('round',0xe0e0cc,...P(u,edge,4.82),.28,.062,.28);
  }
}

export function ochanomizuBridge(t,batch,pavers,writeSign) {
  const b=bridgeSpecs.ochanomizu,[x,z]=b.start;
  const length=Math.hypot(b.end[0]-x,b.end[1]-z),dx=(b.end[0]-x)/length,dz=(b.end[1]-z)/length;
  const half=b.width/2,angle=Math.atan2(dx,dz);
  const P=(u,s,h=0)=>{
    const X=x+dx*u-dz*s,Z=z+dz*u+dx*s;
    return [X,bridgeLevel('ochanomizu',X,Z)+h,Z];
  };
  const surface=(u,v,l,r,h,color)=>t.quad(P(u,l,h),P(v,l,h),P(v,r,h),P(u,r,h),color);
  const sidewalk=(u,s,extra=0)=>P(u,s,bridgeDeckLift('ochanomizu',u,s,half)+extra);
  const tile=(sink,u,v,left,right,lift,color)=>sink.quad(sidewalk(u,left,lift),sidewalk(v,left,lift),
    sidewalk(v,right,lift),sidewalk(u,right,lift),color);
  pavers.orient(-dz,dx);
  const cuts=[...Array.from({length:37},(_,i)=>length*i/36),.45,.86,1.27,2.97,3.36,5.13,5.59,6.05].sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++) {
    const u=cuts[j-1],v=cuts[j],i=Math.floor(((u+v)/2)*36/length);
    surface(u,v,-half,half,0,0x64666a);
    for(const side of [-1,1]) {
      // The downstream (campus/railway view) sidewalk gained 1.5 m.
      const width=side===-1?5.1:3.6,outer=side*half,inner=side*(half-width);
      const strip=outer-side*1.66;
      const lip=inner+.035*side;
      const bands=[lip,inner+.42*side,inner+.84*side,inner+1.25*side,strip-side*.15];
      for(let k=1;k<bands.length;k++){
        tile(pavers,u,v,bands[k-1],bands[k],0,0x9a9796);
      }
      tile(pavers,u,v,strip+side*.15,outer,0,0x9a9796);
      t.quad(P(u,lip,0),P(v,lip,0),sidewalk(v,lip),sidewalk(u,lip),0x92938e);
      tile(t,u,v,lip,inner+.23*side,.006,0xb6b5ac);
      surface(u,v,inner-.23*side,inner-.33*side,.015,0xd5d6cd);
      surface(u,v,strip-.15,strip+.15,.13,0xd7ac46);
      for(const off of [-.095,-.033,.033,.095])surface(u,v,strip+off-.011,strip+off+.011,.141,0xf3cc64);
      surface(u,u+.015,strip-.15,strip+.15,.145,0xb99a51);
    }
    surface(u,v,.72,.84,.012,0xdbdbc9);
    if(i%5<3)for(const lane of [-3.0,4.1])surface(u,v,lane-.062,lane+.062,.012,0xe6e3d6);
  }
  for(const [u,s,dir] of [[15,2.51,-1],[length-14,-1.34,1]]){
    surface(u-dir*2.45,u+dir*.9,s-.12,s+.12,.017,0xe4e2d9);
    t.tri(P(u+dir*2.32,s,.018),P(u+dir*.45,s-.58,.018),P(u+dir*.45,s+.58,.018),0xe4e2d9);
  }
  // OSM crossing 375670604 meets both bridge sidewalks 3.2 m from the
  // northern abutment. The rail stops before these tactile crossing pads.
  for(let s=-6.43;s<7.94;s+=.88)surface(1.27,5.13,s,s+.45,.025,0xe8e6dc);
  surface(6.40,6.78,.88,7.75,.021,0xe4e3d8);
  for(const side of [-1,1]) {
    const outer=side*(half-.12);
    const inner=side*(half-(side===-1?5.1:3.6)+.16);
    castRailing(t,batch,P,length,side,outer);
    bridgeEnd(batch,P,angle,length,side,outer,writeSign);
    const railStart=6.32,railEnd=length-1.35;
    for(let j=0;j<27;j++) {
      const u=railStart+(railEnd-railStart)*j/27,v=railStart+(railEnd-railStart)*(j+1)/27;
      for(const h of [.32,.54,.83])batch.beam(P(u,inner,h),P(v,inner,h),h===.83?.14:.075,h===.83?.11:.064,0x454b49);
      batch.put('box',0x424744,...P(u,inner,.51),.13,.79,.16,angle);
    }
    const A=P(railStart,inner),B=P(railEnd,inner);
    addBlocker([A[0],A[2]],[B[0],B[2]],.065);
    const strip=outer-side*1.54;
    const count=Math.ceil(Math.abs(strip-inner)/.22);
    for(let k=0;k<count;k++)tile(t,2.97,3.36,inner+(strip-inner)*k/count,inner+(strip-inner)*(k+1)/count,.017,0xdab046);
    for(let row=0;row<3;row++)
      for(let s=Math.min(inner,strip)+.051;s<Math.max(inner,strip);s+=.10)
        batch.put('post',0xf0c75b,...sidewalk(3.025+row*.119,s,.025),.032,.012,.032);
    bridgeLamp(batch,P,length*.47,inner+side*.27,angle);
  }
  steelFrame(t,batch,P,length,half);
}

// The long station building looks north over a terrace, with the trains
// and tracks still visible a full level below the concourse.
export function stationRiverFront(t,batch,floor) {
  const start=[-38,198.9],end=[53,225.8],dx=end[0]-start[0],dz=end[1]-start[1];
  const len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len,rot=-Math.atan2(tz,tx);
  const P=(u,s,h)=>[start[0]+tx*u-tz*s,floor+h,start[1]+tz*u+tx*s];
  const box=(u,s,h,w,d,height,c)=>batch.put('box',c,...P(u,s,h),w,height,d,rot);
  const glass=[0x395158,0x506669,0x627b80,0x496063,0x344d55,0x516768];
  for(let bay=0;bay<34;bay++) {
    const u=bay*len/34,v=(bay+1)*len/34,mid=(u+v)/2;
    const setback=bay<6?1.05:bay<27?3.5:2.5;
    box(mid,setback,.98,v-u-.05,.16,2.9,glass[bay%glass.length]);
    box(u,setback-.13,1.0,.075,.18,3.15,0x3f4a4c);
    box(mid,setback-.11,1.76,v-u,.12,.075,0x596565);
    box(mid,.1,2.83,v-u,.68,.48,0xb3b1a7);
    box(mid,.50,2.48,v-u,1.45,.12,0x494c47);
    if(bay>=6&&bay<27) {
      box(mid,1.60,-.48,v-u,3.72,.28,0xbcbab1);
      box(mid,-.25,-.55,v-u,.27,.46,0xb9bbaf);
      box(mid,-.27,.68,v-u,.08,.09,0x889596);
      for(let j=0;j<7;j++){
        const post=u+(j+.5)*(v-u)/7;
        box(post,-.265,.12,.038,.046,1.04,0x8d9999);
      }
      if(bay%3===0)box(u,.14,1.01,.2,.22,3.12,0x586060);
    } else {
      box(mid,.98,-.48,v-u,2.15,.29,0xb4b5ad);
    }
  }
  for(const [a,b] of [[8,20],[52,63]]) {
    const u=(a+b)/2;
    box(u,.72,-.06,b-a,.78,.58,0x94988b);
    for(let j=a+.28;j<b;j+=.7)batch.put('leafSmall',j%2>1?0x65815f:0x6f8960,...P(j,.72,.29),.57,.34,.36);
  }
}

export function stationPortal(batch,floor,writeSign) {
  const angle=-1.29,tx=Math.cos(angle),tz=-Math.sin(angle);
  const P=(w,d,y)=>[-76.1+tx*w+tz*d,floor+y,201.2+tz*w-tx*d];
  const box=(w,d,y,width,depth,height,color)=>batch.put('box',color,...P(w,d,y),width,height,depth,angle);
  box(0,2.55,-.19,15,6.6,.50,0xb1afa5);
  box(0,2.10,2.73,15,6.4,.94,0xe1ded4);
  box(0,-1.15,2.31,15.15,.42,.15,0xb3b4ae);
  for(const w of [-7.18,-4.55,4.65,7.18])box(w,.20,1.2,.36,.85,2.4,0xd4d3c9);
  box(0,4.6,1.20,14.6,.20,2.56,0x4f5350);
  for(let w=-5.9;w<6;w+=1.45){
    box(w,2.02,.45,.33,1.45,.90,0x788887);
    box(w,1.54,.87,.35,.49,.13,0x4a6a55);
  }
  writeSign('JR 御茶ノ水駅','OCHANOMIZU STATION',P(0,-1.135,2.77),5.17,.68,angle,'#237c4b','#e9e6dc');
}

// A stationary Chuo rapid formation gives the station and river cutting
// their scale. Its cars follow successive chords along the surveyed track.
export function chuoRapid(batch,alignment,railY) {
  const stations=[0];
  for(let i=1;i<alignment.length;i++)stations.push(stations[i-1]+Math.hypot(alignment[i][0]-alignment[i-1][0],alignment[i][1]-alignment[i-1][1]));
  function locate(chainage) {
    let i=1;while(i<stations.length-1&&stations[i]<chainage)i++;
    const f=(chainage-stations[i-1])/(stations[i]-stations[i-1]),a=alignment[i-1],b=alignment[i];
    return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
  }
  for(let car=0;car<12;car++){
    const start=108+car*19.8,A=locate(start),B=locate(start+19.36);
    const cx=(A[0]+B[0])/2,cz=(A[1]+B[1])/2,angle=-Math.atan2(B[1]-A[1],B[0]-A[0]),cs=Math.cos(angle),sn=-Math.sin(angle);
    const P=(u,s,h)=>[cx+cs*u-sn*s,railY+h,cz+sn*u+cs*s];
    const box=(u,s,h,l,w,height,color)=>batch.put('box',color,...P(u,s,h),l,height,w,angle);
    const doubleDeck=car===7||car===8,orange=0xce6526,body=0xbfc4c1,glazing=0x365258;
    box(0,0,1.74,19.36,2.87,1.56,body);
    box(0,0,2.94,19.20,2.83,.90,body);
    box(0,0,3.62,19.06,2.67,.49,0xa1aaa6);
    box(0,0,3.93,18.75,2.41,.20,0x9da6a2);
    for(const bogie of [-6.75,6.75])box(bogie,0,.55,2.62,2.42,.65,0x4e5656);
    box(0,0,.70,9,1.82,.52,0x727a78);
    box(0,0,4.17,3.55,1.11,.28,0xa2a9a6);
    for(const s of [-1,1]){
      if(doubleDeck) {
        box(0,1.419*s,2.01,18.99,.047,.45,orange);
        for(let k=0;k<7;k++)for(const h of [1.39,2.94])
          box((k-3)*1.75,1.438*s,h,1.43,.060,.69,glazing);
        for(const u of [-7.87,7.87])box(u,1.443*s,2.44,.94,.060,.72,glazing);
      }else{
        box(0,1.44*s,1.74,19.32,.035,.39,orange);
        box(0,1.42*s,3.44,19.09,.055,.14,orange);
        for(const u of [-7.05,-2.35,2.35,7.05]){
          for(const edge of [-.66,.66])box(u+edge,1.452*s,2.11,.046,.040,1.95,0x848f8b);
          for(const split of [-.30,.30])box(u+split,1.45*s,2.66,.42,.08,.67,glazing);
        }
        for(const u of [-4.70,0,4.70])box(u,1.438*s,2.70,2.61,.09,.90,glazing);
        for(const u of [-8.85,8.85])box(u,1.436*s,2.70,.82,.09,.87,glazing);
      }
    }
    if(car===0||car===11){
      const end=(car===0?-1:1)*9.69;
      box(end,0,2.42,.12,2.80,1.98,orange);
      box(end*1.008,0,2.83,.12,2.38,.88,glazing);
      for(const s of [-1,1])box(end*1.012,s*.94,3.27,.08,.50,.12,0xe9e2b6);
    }
  }
  // Contact and messenger wires sag between transverse support portals.
  for(let i=0;i<12;i++){
    const u=44+28*i,v=u+28;
    const A=locate(u),B=locate(v);
    const d=Math.hypot(B[0]-A[0],B[1]-A[1]),nx=-(B[1]-A[1])/d,nz=(B[0]-A[0])/d;
    const p=(f,s,h)=>{const q=locate(u+f*28);return [q[0]+nx*s,railY+h,q[1]+nz*s];};
    for(const s of [-2.0,18.5])batch.beam(p(0,s,0),p(0,s,6.22),.17,.17,0x74746c);
    batch.beam(p(0,-2.18,6.20),p(0,18.82,6.20),.16,.17,0x888980);
    for(const s of [0,6.4,12.2]) {
      batch.beam(p(0,s,4.95),p(1,s,4.95),.025,.025,0x5c605c);
      for(let j=0;j<4;j++) {
        const f=j/4,g=(j+1)/4,h=k=>5.83-.52*4*k*(1-k);
        batch.beam(p(f,s,h(f)),p(g,s,h(g)),.027,.027,0x595c58);
      }
    }
  }
}
