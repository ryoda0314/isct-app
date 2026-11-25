import { at, edges, nearestEdge, rectangle } from "../yokohama/buildingsGeometry.js";
import { clinicalPavilion } from "./clinicalForecourt.js";
import { hospitalSign } from "./hospitalSign.js";
import { roadTerrainHeight } from "./groundsLevels.js";
import { buildingFrame, courtClip, curtain, entrance, equipment, finish, grille, parapet, punchedWindows, wallFacing } from "./facadeKit.js";
import { gardenCurtain, stoneCore } from "./towerElevations.js";
import { wardUpperWalls, wardPodium, wardTerrace } from "./wardFacade.js";
import { hospitalRoof, roofWells, wardRoofLevel } from "./wardRoofs.js";
import { towerForecourt, towerForecourtRails } from "./towerForecourt.js";

const towerGlass=[0x39698d,0x427998,0x3c7091,0x427494,0x457d9b,0x3d718f];
const reflectedGlass=[0x416b76,0x477477,0x53808a,0x4c6c77,0x527681,0x537a83];
const stone=0xf7dfba, warmPanel=0xddc0a8;
const darkMetal=0x42515a;

// Small raised letters assembled as strokes so the sign stays legible at
// building scale without having to load a font or a sign texture.
const glyphs={
  S:[".77,.85 .6,1 .22,1 .04,.82 .04,.64 .21,.52 .60,.48 .77,.34 .77,.16 .6,0 .16,0 0,.13"],
  c:[".59,.62 .45,.72 .19,.72 .04,.58 .04,.17 .18,.02 .47,.02 .60,.13"],
  i:[".12,.70 .12,.02",".12,1 .12,.95"],
  e:[".05,.36 .59,.36 .58,.57 .45,.71 .20,.71 .05,.57 .05,.17 .21,.02 .46,.02 .61,.13"],
  n:[".06,.02 .06,.70",".06,.51 .24,.70 .45,.70 .58,.57 .58,.02"],
  T:["0,1 .78,1",".39,1 .39,.02"],
  o:[".19,.02 .04,.18 .04,.55 .19,.71 .43,.71 .58,.55 .58,.18 .43,.02 .19,.02"],
  k:[".06,1 .06,.02",".56,.70 .07,.29",".23,.45 .62,.02"],
  y:[".01,.71 .29,.04",".60,.71 .24,-.16 .09,-.23"],
  C:[".69,.84 .53,.99 .23,.99 .04,.81 .04,.20 .21,.02 .53,.02 .70,.19"],
  I:[".12,1 .12,.02"],E:[".64,1 .05,1 .05,.02 .64,.02",".05,.54 .54,.54"],
  N:[".06,.02 .06,1 .68,.02 .68,1"],O:[".2,.02 .04,.21 .04,.82 .21,1 .51,1 .68,.81 .68,.22 .51,.02 .20,.02"],
  K:[".055,1 .055,.02",".66,1 .08,.39",".32,.62 .68,.02"],Y:[".01,1 .35,.52 .66,1",".35,.52 .35,.02"],
  s:[".56,.61 .43,.71 .20,.71 .07,.58 .11,.44 .47,.32 .54,.17 .42,.02 .17,.02 .06,.13"],
  t:[".20,.93 .20,.16 .29,.02 .45,.02",".03,.66 .47,.66"],u:[".05,.70 .05,.16 .18,.02 .40,.02 .55,.18 .55,.70"],
  f:[".15,.02 .15,.83 .29,.99 .48,.99",".03,.69 .47,.69"],
};
const letterWidths={S:.81,i:.25,I:.28,T:.8," ":.33};
function towerSign(m,e,t,out,y,size) {
  const ink=0x243349, direction=Math.sign(e.dx*e.nz-e.dz*e.nx);
  const run=(ch)=>(letterWidths[ch]??.68)+.11;
  function letters(str,x0,y0,scale){
    let cursor=x0;
    for(const ch of str){
      for(const line of glyphs[ch]??[]){
        const pts=line.split(" ").map(pair=>pair.split(",").map(Number));
        for(let j=1;j<pts.length;j++) {
          const ends=[pts[j-1],pts[j]].map(([x,h])=>{
            const p=at(e,t+(cursor+x*scale)*direction,out);
            return [p[0],y0+h*scale,p[1]];
          });
          m.beam(ends[0],ends[1],scale*.12,ink);
        }
      }
      cursor+=run(ch)*scale;
    }
  }
  const label="SCIENCE TOKYO";
  const width=[...label].reduce((sum,ch)=>sum+run(ch),0)*size;
  const symbol=size*1.48, left=-(width+symbol*1.06)/2;
  const textX=left+symbol*1.06;
  letters(label,textX,y,size);
  letters("Institute of",textX,y+size*1.22,size*.46);
  const point=(x,h)=>{
    const p=at(e,t+(left+x*symbol*.71)*direction,out+.045);
    return [p[0],y+h*symbol,p[1]];
  };
  // Raised arched strips from the wall-mounted Science S symbol.
  const strips=[
    [x=>.50-.25*x,x=>.82-.315*x,0x56657a],
    [x=>.51+.24*(1-(1-x)**2),x=>.80+.20*(1-(1-x)**2),ink],
    [x=>.24*(1-(1-x)**2),x=>.28+.22*(1-(1-x)**2),ink],
  ];
  for(const [lower,upper,col] of strips)for(let i=0;i<10;i++){
    const x=i/10, next=(i+1)/10;
    const a=point(x,lower(x)), b=point(next,lower(next)), c=point(next,upper(next)), d=point(x,upper(x));
    m.triangle(a,b,c,col);m.triangle(a,c,d,col);
  }
}

export function mdTower(m,b,ring,fr,base,height,gardenLevel) {
  const crown=base+height, mainRoof=base+height*.803;
  const lobby=base+height*.16, transfer=base+height*.298;
  const voidRing=rectangle(fr.point,-fr.w*.22,-fr.d*.059,fr.w*.22,fr.d*.059);
  const voidFloor=base+20;
  const front=wallFacing(ring,-fr.dz,fr.dx);
  const inside=(p,e)=>(e.a[0]-p[0])*e.nx+(e.a[1]-p[1])*e.nz;
  const lower=courtClip(ring,p=>inside(p,front)-4.45), shoulder=courtClip(ring,p=>inside(p,front)-2.0);
  m.solid(lower,base,voidFloor,stone,finish.roof);
  if(lobby>voidFloor)m.solid(lower,voidFloor,lobby,stone,finish.roof,[voidRing]);
  m.solid(shoulder,lobby,transfer,stone,finish.roof,[voidRing]);
  m.soffit(courtClip(shoulder,p=>4.45-inside(p,front)),lobby,0xa0aaa7);
  m.solid(ring,transfer,mainRoof,stone,finish.roof,[voidRing]);
  m.soffit(courtClip(ring,p=>2.0-inside(p,front)),transfer,0x879292);
  // The LiDAR section puts the eastern core 10 m above the western roof.
  // Its bevels face NE and SE; a glass service strip separates their ends.
  const eastCore=courtClip(courtClip(ring,p=>{
    const [u,v]=fr.local(p);return u-fr.w*.13-v*.43;
  }),p=>{const [u,v]=fr.local(p);return u-fr.w*.13+v*.43;});
  const middleRing=courtClip(courtClip(ring,p=>fr.d*.405-fr.local(p)[1]),p=>fr.d*.405+fr.local(p)[1]);
  const terrace=base+height*.924;
  m.solid(middleRing,mainRoof,terrace,stone,finish.roof,[voidRing]);
  for(const e of edges(middleRing)){
    if(Math.abs(e.dx*fr.dx+e.dz*fr.dz)>.88)curtain(m,e,mainRoof,terrace,4,{pitch:1.65,colors:towerGlass,spandrel:0x55778b,metal:0x627581});
  }
  m.solid(eastCore,mainRoof,crown,stone,0xb2aa97);
  const sideWalls=edges(ring);
  for(const e of sideWalls) {
    const [u]=fr.local(at(e,e.length/2));
    const along=e.dx*fr.dx+e.dz*fr.dz, bevel=Math.abs(along)>.16&&Math.abs(along)<.8;
    if(bevel) {
      const w=e.length, top=u>0?crown:mainRoof;
      stoneCore(m,e,base,top,Math.abs(fr.local(e.a)[1])>Math.abs(fr.local(e.b)[1]),u>0?24:22,stone);
      if(u>0&&w>10)towerSign(m,e,w/2,.54,top-4.6,Math.min(1.42,w/12.9));
    } else if(e.dx*front.dx+e.dz*front.dz>.999 && e.nx*front.nx+e.nz*front.nz>.999) {
      gardenCurtain(m,e,base,lobby,transfer,mainRoof,gardenLevel);
      m.face(e,e.length/2,.29,mainRoof,e.length+.15,.24,.56,0x627079);
    } else {
      curtain(m,e,base,lobby,3,{pitch:2.05,colors:reflectedGlass,metal:0x6a787c});
      curtain(m,e,lobby,transfer,4,{pitch:1.94,colors:reflectedGlass,spandrel:0x879a9f,metal:0x718287});
      curtain(m,e,transfer,mainRoof,15,{pitch:1.64,colors:towerGlass,spandrel:0x547d9b,metal:0x536e7e});
      for(let i=1;i<=15;i++)m.face(e,e.length/2,.27,transfer+i*(mainRoof-transfer)/15,e.length,.19,.53,0x8a9aa1);
      m.face(e,e.length/2,.47,transfer,e.length+.04,.39,.94,0x35444a);
      m.face(e,e.length/2,.26,mainRoof,e.length+.24,.29,.59,0x5d6970);
      if(u>fr.w*.46)curtain(m,e,mainRoof,crown-.42,5,{pitch:1.58,colors:reflectedGlass});
    }
  }
  const loungeRoof=terrace;
  const canopyV=fr.d*.343;
  const capY=base+height*.941;
  const capLeft=-fr.w*.425,capRight=fr.w*.247;
  for(const sign of [-1,1]) {
    const count=8;
    for(let j=0;j<=count;j++){
      const pitch=(capRight-capLeft-.8)/count;
      const u=capLeft+.4+j*pitch,p=fr.point(u,canopyV+sign*fr.d*.038);
      m.box(p,(loungeRoof+capY)/2,.20,capY-loungeRoof,.20,fr.yaw,finish.metal);
      if(j<count) {
        const q=fr.point(u+pitch,canopyV+sign*fr.d*.038);
        m.beam([p[0],loungeRoof,p[1]],[q[0],capY,q[1]],.17,darkMetal);
      }
    }
  }
  m.box(fr.point((capLeft+capRight)/2,canopyV),capY,capRight-capLeft,.52,fr.d*.13,fr.yaw,0x45525a);
  for(const side of [-1,1])for(let k=0;k<3;k++)equipment(m,fr,(k-1.5)*fr.w*.15,side*fr.d*.20,5.5,3.5,terrace+.03,1.12);
  const wide=Math.min(front.length*.83,34), t=front.length/2;
  const deck=gardenLevel;
  m.solid(towerForecourt,deck-.44,deck+.06,0xa99f8c,0xc0b4a0);
  m.soffit(towerForecourt,deck-.44,0x9e9d8f);
  // The eastern end remains open to the footbridge. A stainless handrail
  // runs above the service lane along the long exposed edge.
  for(const [start,end] of towerForecourtRails){
    const n=Math.ceil(Math.hypot(end[0]-start[0],end[1]-start[1])/1.65);
    const pos=(t,y)=>[start[0]+(end[0]-start[0])*t,y,start[1]+(end[1]-start[1])*t];
    for(let i=0;i<=n;i++)m.beam(pos(i/n,deck),pos(i/n,deck+1.15),.058,finish.metal);
    for(const y of [.39,.77,1.15])m.beam(pos(0,deck+y),pos(1,deck+y),.051,finish.metal);
  }
  for(let j=0;j<5;j++){
    const p=at(front,(j+.5)*front.length/5,2.72);
    m.part("round",p,(deck+base)/2,.56,deck-base,.56,0,0xbcb6a9);
  }
  m.face(front,t,2.0,deck+5.6,wide,.44,4.6,0xd3cabc);
  for(const f of [-.43,-.14,.14,.43])m.part("round",at(front,t+wide*f,3.4),deck+2.78,.64,5.55,.64,0,0xd6cdbc);
  m.face(front,t,2.0,deck+5.35,wide-.20,.076,4.3,0xb9b2a3);
  for(const f of [-.34,-.11,.11,.34])m.face(front,t+wide*f,1.83,deck+5.28,.21,.08,2.75,0xe3dac2);
  const portal=nearestEdge(ring,[-82.9,17.6],4);
  if(portal){
    const e=portal.edge,w=e.length*.74,mid=e.length*.45;
    const shopfront={...e,a:at(e,0,.49)};
    m.face(e,mid,.45,deck+1.64,w,3.19,.24,0x384443);
    for(let j=0;j<8;j++){
      const t=mid-w/2+(j+.5)*w/8;
      m.face(e,t,.61,deck+1.66,w/8-.08,3.0,.09,0x587370,"clear");
      m.face(e,t-w/16,.68,deck+1.65,.083,3.17,.15,0x818b85);
    }
    m.face(e,mid,.74,deck+3.33,w+.28,.33,1.76,0xd3cbb7);
    entrance(m,shopfront,portal.t,deck,3.42,{h:3.05,canopy:0});
    entrance(m,shopfront,portal.t,base,3.18,{h:3.12,canopy:.75});
  }
}


export function wards(m,b,ring,fr,base) {
  const isA=b.id==="med-a", podium=isA?41.7:45.5;
  const front=wallFacing(ring,-fr.dz,fr.dx);
  const fromFront=p=>(front.a[0]-p[0])*front.nx+(front.a[1]-p[1])*front.nz;
  const podiumBody=isA?courtClip(ring,p=>fromFront(p)-2.58):ring;
  m.solid(podiumBody,base,podium,warmPanel,finish.roof);
  if(isA){
    const strip=courtClip(ring,p=>2.62-fromFront(p));
    m.solid(strip,podium-.78,podium,warmPanel,finish.roof);
    m.soffit(strip,podium-.78,0xa89d8e);
    const colBottom=base+.15,colTop=podium-.78;
    for(const t of [1.68,front.length-1.68]){
      const position=at(front,t,-.95);
      m.part("smooth",position,(colBottom+colTop)/2,3.22,colTop-colBottom,3.22,0,0xd6af97);
      for(let y=colBottom+1.16;y<colTop;y+=1.16)m.part("smooth",position,y,3.24,.026,3.24,0,0xb09a86);
    }
  }
  for(const wall of edges(ring)){
    let e=wall;
    if(e.length<2.4)continue;
    if(isA && e.nx*front.nx+e.nz*front.nz>.998 && e.length>front.length*.95) {
      wardPodium(m,e,base,podium);
      continue;
    }
    if(isA && e.length>4 && Math.hypot(e.a[0]-front.b[0],e.a[1]-front.b[1])<.25)
      e={...e,a:at(e,2.83),length:e.length-2.83};
    curtain(m,e,base+.3,base+5.2,1,{pitch:2.38,colors:reflectedGlass});
    const count=isA?5:6, dy=(podium-base-6.9)/count;
    for(let k=0;k<count;k++){
      const y=base+5.35+k*dy;
      curtain(m,e,y,y+dy*.44,1,{pitch:2.7,colors:reflectedGlass});
      m.face(e,e.length*.5,.26,y+dy*.74,e.length+.025,dy*.55,.62,warmPanel);
    }
    for(let k=0;k<Math.ceil(e.length/6.7);k++)m.face(e,(k+.5)*e.length/Math.ceil(e.length/6.7),.27,base+2.65,.53,5.3,.85,finish.sand);
    m.face(e,e.length/2,.34,podium-.63,e.length,1.22,.73,warmPanel);
  }
  parapet(m,ring,podium,warmPanel,.48);
  // The river side of A is the wide, low outpatient podium. Its window grid
  // and roof garden stop several floors below the ward bar behind it.
  const upper=b.upperFootprint??courtClip(ring,p=>fr.d*(isA?.115:.29)-fr.local(p)[1]);
  if(upper.length<3)return;
  const uf=buildingFrame(upper), roof=wardRoofLevel, wells=roofWells(isA);
  const court=isA?[[1.9,28.1],[8.3,13.3],[-7.9,6.4],[-14.2,21.1]]:
    [[-13.7,-36.6],[-31.3,-44.8],[-38.5,-29.4],[-20.9,-21.2]];
  m.solid(upper,roof-.16,roof,warmPanel,0xb4b2a6,[court,...wells]);
  for(const e of edges(court.slice().reverse())){
    // The inward glazing is on the courtyard side of this edge.
    const inside={...e,nx:-e.nx,nz:-e.nz};
    m.face(inside,e.length/2,-.08,(podium+roof)/2,e.length,roof-podium,.16,warmPanel);
    punchedWindows(m,inside,podium,roof,8,{pitch:3.7,margin:.24,color:warmPanel});
  }
  wardUpperWalls(m,upper,uf,podium,roof,isA);
  hospitalRoof(m,isA,upper,court,wells,podium,warmPanel);
  if(isA) {
    const e=wallFacing(upper,-fr.dz,fr.dx);
    hospitalSign(m,e,roof);
    wardTerrace(m,wallFacing(upper,-fr.dz,fr.dx),podium);
    entrance(m,front,front.length*.48,base,7.2,{canopy:2.9});
  }
}

export function compactHospital(m,b,ring,fr,base,height){
  const lobby=base+height*.268, roof=base+height*.897, top=base+height;
  const outer=rectangle(fr.point,-fr.w*.492,-fr.d*.494,fr.w*.492,fr.d*.488);
  const front=wallFacing(outer,-fr.dz,fr.dx), L=front.length, H=roof-lobby;
  const frontT=x=>(front.dx*front.nz-front.dz*front.nx>0?x:1-x)*L;
  const frontPiece=(x,out,y,w,h,d,color,glass=false)=>m.face(front,frontT(x),out,y,w,h,d,color,glass);
  const silver=0xdadcd7, chalk=0xe6e5de, graphite=0x404449;

  // The dark reveal separates the white corner cheeks from the glazed screen.
  m.solid(outer,lobby,roof,graphite,finish.roof);
  const n=40, w=L*.868/n;
  const panelT=i=>.066+.868*i/n;
  const rows=[0,.070,.193,.273,.394,.468,.592,.667,.79,.895,1];
  const opal=[0xcfddda,0xd5e1dc,0xdbe4df,0xd0dedb];
  for(let i=0;i<n;i++){
    const x=panelT(i+.5);
    for(let j=0;j<rows.length-1;j++){
      const bottom=lobby+H*rows[j], h=H*(rows[j+1]-rows[j]);
      const window=(j===2||j===6)&&[1,2,4,5].includes(i%10);
      const grilleRow=j>=8;
      const color=grilleRow?0x38424a:window?[0x476b68,0x587d77,0x3f6268][(i+j)%3]:opal[(Math.floor(i/3)+j)%4];
      frontPiece(x,.19,bottom+h/2,w-.038,h-.045,.16,color,window&&i%10===2);
      if(grilleRow){
        for(const k of [-1,0,1])frontPiece(x+k*.868/(n*4),.30,bottom+h/2,.021,h,.065,0x899393);
      }
      if(window&&i%10===5)frontPiece(x,.295,bottom+h*.16,w*.84,h*.28,.048,0x758d82,true);
    }
  }
  // Fine vertical ribs throw short shadows across the milky panels.
  for(let i=0;i<=n;i++)frontPiece(panelT(i),.32,lobby+H/2,.079,H,.31,0xe5e6dc);
  for(const f of rows)frontPiece(.50,.297,lobby+f*H,L*.868,.062,.16,0xb1b6b1);
  for(const f of [.017,.983])frontPiece(f,.36,lobby+H/2,L*.034,H,.87,chalk);
  for(const e of edges(outer)){
    if(e.nx*front.nx+e.nz*front.nz<.96){
      const pitch=H/4;
      for(let j=0;j<4;j++){
        const y=lobby+j*pitch;
        curtain(m,e,y+pitch*.42,y+pitch*.84,1,{pitch:2.55,colors:[0x435454,0x404a4b,0x515d59]});
        for(const [offset,band] of [[.21,.42],[.92,.16]])
          m.face(e,e.length/2,.28,y+offset*pitch,e.length,band*pitch,.64,0xc7b297);
      }
      for(const t of [.4,e.length-.4])m.face(e,t,.38,lobby+H/2,.84,H,.89,chalk);
    }
    m.face(e,e.length/2,.29,lobby-.20,e.length+.55,.39,1.4,graphite);
    m.face(e,e.length/2,.68,lobby-.49,e.length+1.86,.22,2.25,silver);
    m.face(e,e.length/2,.55,lobby-.69,e.length+1.41,.16,1.88,0x8e918e);
  }
  const groundCore=courtClip(ring,p=>fr.d*.488-4.65-fr.local(p)[1]);
  m.solid(groundCore,base,lobby-.78,0xa19f91,finish.roof);
  m.soffit(outer,lobby-.77,0x9f9e95);
  for(const e of edges(groundCore)){
    if(e.length<1.2||e.nx*front.nx+e.nz*front.nz>.96)continue;
    curtain(m,e,base+.12,lobby-.35,2,{pitch:2.55,colors:reflectedGlass});
    const n=Math.max(1,Math.round(e.length/2.85));
    for(let i=0;i<n;i++)m.face(e,(i+.28)*e.length/n,.34,(base+lobby)*.5,.28,lobby-base,.69,chalk);
  }
  const canopyBottom=lobby-.78, atriumH=canopyBottom-base, atriumWidth=.77;
  // Three distinct depths remain visible through the two-storey atrium.
  const bay=atriumWidth*L/10;
  for(let j=0;j<10;j++){
    const x=atriumWidth*(j+.5)/10;
    frontPiece(x,-4.30,base+atriumH*.53,bay-.09,atriumH*.91,.13,[0x455855,0x717b70,0x516a5c][j%3]);
    frontPiece(x,-3.84,base+4.9,bay,.24,1.13,0xb9b7a8);
    frontPiece(x-.012,-3.53,base+atriumH*.50,.17,atriumH*.92,1.95,0xb8bdb0);
    frontPiece(x+.018,-3.91,base+atriumH*.32,.77,1.57,.12,0x424e43);
    frontPiece(x,-1.90,base+atriumH*.50,bay-.05,atriumH-.12,.069,0x8fafa1,"clear");
    if(x<.46||x>.64){
      const split=base+atriumH*.59;
      frontPiece(x,-.69,base+atriumH*.29,bay*.42,atriumH*.58,.27,0x7e8581);
      for(let k=0;k<25;k++)frontPiece(x,-.49,base+.16+k*atriumH*.57/25,bay*.42,.070,.15,0xc8cac4);
      frontPiece(x,-.61,split+(canopyBottom-split)*.5,bay*.42,canopyBottom-split,.14,0x495552);
    }
    for(const offset of [-.25,.25])frontPiece(x+offset*bay/L,-.64,base+atriumH*.5,.23,atriumH,.87,silver);
  }
  for(const h of [.46,.84])frontPiece(atriumWidth/2,-1.78,base+atriumH*h,L*atriumWidth,.12,.17,silver);
  for(let j=0;j<4;j++){
    const h=atriumH/4, x=(1+atriumWidth)/2, w=L*(1-atriumWidth);
    frontPiece(x,-1.66,base+h*(j+.59),w,h*.43,.15,0x485958,true);
    frontPiece(x,-1.50,base+h*(j+.18),w,h*.37,.43,0xb5a28a);
    frontPiece(x,-1.50,base+h*(j+.91),w,h*.19,.43,0xc5b197);
    for(let k=1;k<5;k++)frontPiece(atriumWidth+(1-atriumWidth)*k/5,-1.52,base+h*(j+.59),.078,h*.43,.16,darkMetal);
  }
  const door=.56, portalW=L*.174, portalH=atriumH*.455, jamb=.48;
  for(const s of [-1,1])frontPiece(door+s*(portalW-jamb)/(2*L),.29,base+portalH*.5,jamb,portalH,2.25,chalk);
  frontPiece(door,.29,base+portalH-.21,portalW,.43,2.25,chalk);
  frontPiece(door,-1.02,base+portalH*.47,portalW-.88,portalH*.91,.15,0x444d47);
  for(let i=0;i<4;i++){
    const x=door+(i-1.5)*(portalW-.99)/(4*L);
    frontPiece(x,-.89,base+portalH*.42,(portalW-.99)/4-.066,portalH*.76,.092,i===1||i===2?0x625346:0x63736f,i===0||i===3);
    if(i===1||i===2)frontPiece(x+(i===1?.013:-.013),-.79,base+1.13,.086,.24,.09,silver);
  }
  frontPiece(door,-.75,base+portalH*.77,portalW-.92,.11,.14,silver);
  frontPiece(door,-.40,base+portalH+.47,portalW+.44,.20,.65,silver);
  // Glazed street pavilion beside the raised eastern garden. The transparent
  // panes reveal its steel frame and the back wall from the pedestrian crossing.
  const {center:pavilion,depth,width:pavilionW,length:pavilionD,height:pavilionH}=clinicalPavilion;
  const floor=roadTerrainHeight(...at(front,frontT(pavilion),depth))+.17;
  frontPiece(pavilion,depth,floor+.07,pavilionW,.14,pavilionD,0x9e9c8e);
  frontPiece(pavilion,depth,floor+pavilionH,pavilionW+.20,.22,pavilionD+.20,silver);
  frontPiece(pavilion,depth,floor+pavilionH+.13,pavilionW-.22,.09,pavilionD-.26,0x9bb2ac,true);
  const back=depth-pavilionD/2,street=depth+pavilionD/2;
  frontPiece(pavilion,back,floor+pavilionH*.45,pavilionW-.20,pavilionH*.85,.12,0x6d837a,true);
  for(const s of [-1,1]){
    const x=pavilion+s*pavilionW/(2*L);
    frontPiece(x,depth,floor+pavilionH/2,.063,pavilionH,pavilionD,0x8fa99d,"clear");
    frontPiece(x,depth,floor+pavilionH*.62,.10,.08,pavilionD,silver);
    for(const d of [back,depth,street])frontPiece(x,d,floor+pavilionH/2,.10,pavilionH,.10,silver);
  }
  for(const s of [-1,1])frontPiece(pavilion+s*pavilionW/(6*L),street,floor+pavilionH/2,.077,pavilionH,.11,silver);
  frontPiece(pavilion,street,floor+pavilionH*.68,pavilionW,.11,.12,silver);
  frontPiece(pavilion,street,floor+pavilionH*.83,pavilionW-.13,pavilionH*.28,.055,0x94aaa0,"clear");
  const mech=rectangle(fr.point,-fr.w*.32,-fr.d*.32,fr.w*.32,fr.d*.15);
  m.solid(mech,roof,top-.35,0xd7d8ce,0xc3c6c2);
  for(const e of edges(mech))grille(m,e,e.length/2,.03,roof+.5,e.length*.71,(top-roof)*.55,0xaeb8b7);
  for(let j=0;j<4;j++)equipment(m,fr,fr.w*(-.3+.19*j),fr.d*.31,5,3.2,roof,.98);
  parapet(m,outer,roof,finish.chalk,.47);
}
