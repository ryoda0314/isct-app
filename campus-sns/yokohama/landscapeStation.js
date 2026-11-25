// Station frontage, approach and railway context. Plan geometry © OpenStreetMap contributors
// (ways 24474881, 360602262–263, 360602284, 477991223/229, 919617499/503, 544051595/597).
// https://www.openstreetmap.org/copyright
// https://www.tokyu.co.jp/area/suzukakedai/station/
// https://solid-state-chemistry.jp/pdf/suzukake_access_detail.pdf
// Roof profiles and structural heights approximate the public exterior photographs.
import { groundAt } from './terrain.js';
import { plaqueText } from './landscapeFixtures.js';
import { triangleBatch } from './landscapeGeometry.js';

export const approachRoads=[
  [[-296.8,-205.2],[-243.9,-290.3]], [[-238,-286.5],[-269.2,-234.1],[-291.1,-201.7]],
  [[-211.9,-340.8],[-187.4,-378.4],[-127.6,-471.7],[-113.8,-494.3],[-96.5,-522.7],[-89.8,-532]],
  [[-81.9,-526.9],[-88.2,-517.2],[-108.4,-485.9],[-130.1,-453.8],[-205.9,-336.9]]
].map((points,i)=>({id:'R246-approach-'+i,kind:'road',width:8.4,points,walkable:false}));

const trackLines=[
  [[-139.5,-559.2],[-150.8,-538.4],[-163.8,-510.3],[-175,-487.1],[-191.3,-460.2],[-208.7,-430.1],[-242,-382.5],[-271.2,-344.2],[-303.2,-309],[-330,-281.8],[-354.5,-258.4]],
  [[-147.4,-554.5],[-153.8,-539.2],[-166.3,-512.6],[-177.7,-489.4],[-194,-461.6],[-211.2,-431.8],[-244.4,-384.3],[-273.5,-346.2],[-305.4,-311],[-332.1,-283.9],[-356.5,-260.6]]
];
const railHeight=z=>21.08+.0045*(z+540); // measured clear-track gradient in scene metres
const ux=-.533,uz=.846,nx=.846,nz=.533,base=17.22;
const floorHeight=base+.115;
const F=(u,h,v)=>[-239.05+ux*u+nx*v,base+h,-439.45+uz*u+nz*v];
function stationLocal(x,z){
  const dx=x+239.05,dz=z+439.45,norm=ux*ux+uz*uz;
  return [(dx*ux+dz*uz)/norm,(dx*nx+dz*nz)/norm];
}
function smooth(value){
  const t=Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
}
function apronWeight(u,v) {
  return smooth((u+22)/5)*smooth((10-u)/5)*smooth((v+11)/8)*smooth((10-v)/3);
}
function apronHeight(u,v,road) {
  // The west end exposes three risers. Toward the shop the plaza reaches the
  // same level as the concourse, giving the signposted east exit a flush route.
  // Keep the stone pavers just below the threshold finish even where the
  // two slabs overlap under the roof. The east entrance has an 8 mm sill.
  const target=base-.40+.507*smooth((u+14)/10);
  return road+(target-road)*apronWeight(u,v);
}
export function stationPlazaHeight(x,z,roadbedAt=groundAt){
  const [u,v]=stationLocal(x,z);
  const road=roadbedAt(x,z)+.055;
  return apronHeight(u,v,road);
}
export function stationApronGround(x,z,original,roadbedAt){
  if(Math.abs(x+239.05)>34||Math.abs(z+439.45)>34)return original;
  const [u,v]=stationLocal(x,z),weight=apronWeight(u,v);
  if(!weight)return original;
  const apron=apronHeight(u,v,roadbedAt(x,z)+.055);
  return Math.min(original,apron-.14*weight);
}
export function stationSurfaceAt(x,z,roadbedAt=groundAt){
  if(Math.abs(x+239.05)>34||Math.abs(z+439.45)>34)return null;
  const [u,v]=stationLocal(x,z);
  if(u>=-17.1&&u<=4.1&&v>=-1.16&&v<=6.62)return floorHeight;
  if(!apronWeight(u,v))return null;
  const apron=apronHeight(u,v,roadbedAt(x,z)+.055);
  if(u>=-16.9&&u<=.1&&v>=-2.46&&v< -1.16){
    const step=Math.min(2,Math.floor((v+2.46)/.43));
    return Math.max(apron,base-.27+step*.13);
  }
  return apron;
}
export function stationContext(T,group,t,batch,solid,roadbedAt=groundAt) {
  for(const [line,points] of trackLines.entries()) {
    for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      const nx=-dz/len,nz=dx/len,h0=railHeight(a[1]),h1=railHeight(b[1]);
      const P=(f,c,h)=>[a[0]+f*dx+nx*c,h0+(h1-h0)*f+h,a[1]+f*dz+nz*c];
      t.quad(P(0,-1.53,.23),P(1,-1.53,.23),P(1,1.53,.23),P(0,1.53,.23),0x8a8580);
      for(let d=0;d<len;d+=.9)batch.beam(P(d/len,-1.11,.28),P(d/len,1.11,.28),.15,.14,0x70685e);
      for(const c of [-.5335,.5335])batch.beam(P(0,c,.37),P(1,c,.37),.068,.075,0x777876);
      if(j>6)continue;
      const c=line===0?-1.84:1.84,outer=c+(line===0?-4.05:4.05);
      t.quad(P(0,c,1.38),P(1,c,1.38),P(1,outer,1.38),P(0,outer,1.38),0xb9bab1);
      t.quad(P(0,c,.05),P(1,c,.05),P(1,c,1.38),P(0,c,1.38),0x969c95);
      const stripe=c+(line===0?-.65:.65);
      t.quad(P(0,stripe,1.392),P(1,stripe,1.392),P(1,stripe+.26,1.392),P(0,stripe+.26,1.392),0xc7b16e);
      if(j<3||j>5)continue;
      const ridge=c+(outer-c)*.60;
      for(const side of [c-.65,outer+.65]) {
        t.quad(P(0,ridge,5.74),P(1,ridge,5.74),P(1,side,5.19),P(0,side,5.19),0xc1c5bc);
        batch.beam(P(0,side,5.11),P(1,side,5.11),.14,.12,0xb1b7af);
      }
      for(let d=2;d<len;d+=8) {
        batch.beam(P(d/len,ridge,1.38),P(d/len,ridge,5.56),.18,.20,0xb9c1bc);
        batch.beam(P(d/len,c,5.2),P(d/len,outer,5.2),.13,.13,0x84918b);
      }
    }
  }
  // The street facade is the southwest edge of the mapped concourse (way 919617503).
  const yaw=Math.atan2(-nx,-nz);
  const panel=(c0,c1,v,low,high,color)=>t.quad(F(c0,low,v),F(c1,low,v),F(c1,high,v),F(c0,high,v),color);
  const block=(u,v,h,w,d,height,col)=>batch.put('box',col,...F(u,h,v),w,height,d,yaw);
  const sign=(text,u,h,v,w,height,color,font)=>plaqueText(T,group,text,...F(u,h,v),w,height,yaw,0,color,font);
  const floor=(u,j,v,k,h,col)=>t.quad(F(u,h,v),F(j,h,v),F(j,h,k),F(u,h,k),col);
  for(const [a,b,extra] of [[-17.2,.7,.72],[.7,17.2,0]]) {
    // Shallow green standing-seam folded roof and a light soffit over the ticket hall.
    t.quad(F(a,3.35,-.6),F(b,3.35,-.6),F(b,3.35,10),F(a,3.35,10),0xcccec5);
    t.quad(F(a,3.55+extra,-.65),F(b,3.55+extra,-.65),F(b,5.85+extra,3.55),F(a,5.85+extra,3.55),0x688a6d);
    t.quad(F(a,5.85+extra,3.55),F(b,5.85+extra,3.55),F(b,3.65,12.8),F(a,3.65,12.8),0x729276);
    panel(a,b,-.65,3.28,3.55+extra,0xbfc4b3);
    for(const end of [a,b]) {
      t.tri(F(end,3.53+extra,-.64),F(end,5.85+extra,3.55),F(end,3.48,12.79),0xacc0ab);
      for(let h=3.7+extra;h<5.81+extra;h+=.14) {
        const left=-.64+(h-3.53-extra)/(5.85-3.53)*4.19;
        const right=12.79-(h-3.48)/(5.85+extra-3.48)*9.24;
        batch.beam(F(end,h,left),F(end,h,right),.023,.027,0x91a393);
      }
    }
    batch.beam(F(a,3.31,-.70),F(b,3.31,-.70),.12,.14,0xe2dfd0);
    for(let u=a+.35;u<b;u+=.84) {
      batch.beam(F(u,3.58+extra,-.65),F(u,5.88+extra,3.55),.039,.065,0x57795e);
      batch.beam(F(u,5.88+extra,3.55),F(u,3.67,12.8),.034,.055,0x6a896e);
    }
  }
  for(const u of [-16.7,-6.6,4.3,16.6]) {
    block(u,.38,1.48,.34,.36,3.77,0xd2c9b6);
    block(u,.38,.07,.38,.40,.20,0xa9ada1);
    const p=F(u,0,.38);solid(p[0],p[2],.2);
  }
  floor(-17.1,4.1,-1.16,6.62,.115,0xaaa9a1);
  panel(-17.1,4.1,-1.16,-.52,.115,0xaaa9a2);
  // Short entry steps rise from the paver apron to the station's level threshold.
  // The eastern shop threshold emerges naturally where the public square slopes up.
  for(let j=0;j<3;j++) {
    const v=-2.46+j*.43,h=-.27+j*.13;
    floor(-16.9,.1,v,v+.44,h,0xb5b6ae);
    panel(-16.9,.1,v,h-.135,h,0x92958d);
    floor(-16.9,.1,v,v+.048,h+.008,0xd5ca9f);
  }
  panel(-17.2,-5.4,6.52,.1,3.35,0x454b49);
  panel(-5.4,4.36,3.21,.1,3.33,0xc6c2b5);
  for(let u=-16.5;u<=4;u+=2.37) {
    block(u,2.45,3.20,.12,5.99,.13,0xadb2a8);
    if(u>-.4)continue;
    block(u,1.66,3.11,.14,1.16,.06,0xdbddcd);
    block(u,1.66,3.065,.065,1.08,.022,0xf2f0db);
  }
  // An open ticket hall at the left and recessed ticket machines to its right.
  for(let u=-15.5;u<-6.3;u+=1.54) {
    for(const v of [1.68,2.18,2.68]) {const p=F(u,0,v);solid(p[0],p[2],.205);}
    block(u,2.18,.60,.41,1.53,.92,0xb1b2a9);
    block(u,2.18,1.066,.42,1.55,.10,0x56605e);
    block(u,1.56,.92,.416,.35,.18,0x497a86);
    block(u,1.40,.84,.28,.038,.31,0x454e4e);
    block(u,1.43,1.127,.18,.18,.018,0x689aaa);
    block(u+.30,2.50,.66,.2,.10,.30,0x72697e);
  }
  panel(-5.1,.52,3.19,.72,2.41,0x858b88);
  for(let u=-4.42;u<.35;u+=1.36) {
    block(u,3.015,.90,1.11,.39,1.22,0xb0b5ac);
    block(u,2.80,1.23,.80,.05,.51,0x4c5252);
    block(u,2.77,1.26,.62,.02,.34,0x82aaa9);
    block(u,2.75,.88,.58,.074,.12,0x6e7771);
    block(u,2.77,.57,.65,.04,.17,0x727970);
  }
  panel(-5.08,.51,3.14,1.71,2.70,0xebeadf);
  for(const [i,col] of [0x999384,0x788e91,0x91a380,0xb78e70].entries()) {
    for(let u=-4.94;u<.22;u+=.66) {
      const y=2.01+i*.13+.095*Math.sin(u*2+i);
      batch.beam(F(u,y,3.125),F(u+.46,y+.12*Math.sin(u*3+i),3.125),.019,.019,col);
    }
  }
  panel(.76,3.99,3.16,.2,2.75,0xa8ada6);
  panel(.92,2.32,3.13,.96,2.42,0x596a6b);
  panel(2.41,3.83,3.13,.96,2.42,0x536364);
  panel(4.4,17.2,.74,-.1,3.21,0x587378);
  // Window frames and display/shelf silhouettes vary in depth, behind the mullions.
  for(let i=0;i<8;i++) {
    const u=4.56+i*1.54;
    for(const centre of [u+.36,u+1.10]) {const p=F(centre,0,.76);solid(p[0],p[2],.38);}
    panel(u,u+1.43,.717,.53,2.46,i%2?0x779394:0x879f9d);
    panel(u+.04,u+1.38,.712,.60,1.30,i%2?0x687c73:0x748777);
    for(let j=0;j<8;j++) {
      const c=[0xb9af93,0xb6a388,0x8a9b95,0xc4ad83,0xa69e7c][(i*3+j)%5];
      panel(u+.09+j*.159,u+.204+j*.159,.704,.70,.88+(j%4)*.085,c);
    }
    block(u,.65,1.45,.064,.092,2.06,0xb5bdb8);
    panel(u+.05,u+1.4,.65,1.48,1.518,0xc5ccc1);
  }
  panel(4.4,17.2,.59,2.46,3.16,0xe9eae2);
  panel(4.4,17.2,.575,2.58,3.07,0x3f76a9);
  panel(4.4,17.2,.563,2.52,2.568,0x6492ad);
  sign('LAWSON',9.14,2.835,.55,3.20,.46,'#f3f4ed','700 1em sans-serif');
  sign('ローソン＋toks',12.72,2.83,.55,3.35,.40,'#e9f0ed');
  panel(-13.38,-4.73,-.683,2.65,3.36,0xe9e9df);
  block(-12.79,-.701,3.01,.40,.035,.27,0xb04655);
  sign('すずかけ台駅',-8.77,3.043,-.715,5.12,.42,'#26353b');
  sign('Suzukakedai Station',-8.77,2.779,-.715,4.35,.174,'#404e4e','500 1em sans-serif');
  // Grooved yellow tiles turn from the concourse toward the descending stairs.
  const tactile=triangleBatch(T,group);
  const G=(u,v,h)=>{const p=F(u,0,v);p[1]=stationPlazaHeight(p[0],p[2],roadbedAt)+h;return p;};
  const tile=(u,j,v,k,h,col)=>tactile.quad(G(u,v,h),G(j,v,h),G(j,k,h),G(u,k,h),col);
  for(let u=-10.4;u<14;u+=.31) {
    tile(u,u+.300,-4.12,-3.81,.009,0xc8af68);
    for(let j=0;j<4;j++)tile(u+.02,u+.28,-4.088+j*.073,-4.063+j*.073,.015,0xdec37e);
  }
  for(let v=-3.81;v<-2.38;v+=.31) {
    tile(-10.4,-10.09,v,v+.30,.009,0xcfb46e);
    for(let j=0;j<4;j++)tile(-10.38+j*.073,-10.35+j*.073,v+.014,v+.29,.015,0xe0c782);
  }
  tactile.finish(-3);
}
