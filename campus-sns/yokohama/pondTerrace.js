import { groundAt } from "./terrain.js";
import { interpolate } from "./navigation.js";
import { spatialIndex } from "./landscapeGeometry.js";

// The 2016 master plan (existing facilities, printed p. 40, fig. 4-1) locates
// the terraced seating southwest of a circular landing at the head of the pond.
// Profiles, board widths and colours are estimates from exterior photographs.
// https://www.sisetu.titech.ac.jp/sisetu/03kikaku_keikaku/03campus_plan/temp/cmp2016.pdf#page=46
const cx=15.8,cz=-130.7,landing=5.15,outer=12.20,rows=7;
const start=1.43,end=3.80,width=(outer-landing)/rows;
const low=groundAt(cx+1,cz)+.09,top=groundAt(cx-outer,cz)+.07,rise=(top-low)/rows;
const aisles=[1.88,3.47],aisleHalf=.68;
const tau=Math.PI*2,clamp=x=>Math.min(1,Math.max(0,x));
const point=(r,a)=>[cx+r*Math.cos(a),cz+r*Math.sin(a)];
const at=(p,y)=>[p[0],y,p[1]];
const pathEnd=[3.41,-135.45],rimEnd=[4.39,-134.59];
const dx=rimEnd[0]-pathEnd[0],dz=rimEnd[1]-pathEnd[1],length=Math.hypot(dx,dz);
const entranceHeight=(p,roadbedAt)=>{
  const f=((p[0]-pathEnd[0])*dx+(p[1]-pathEnd[1])*dz)/(length*length);
  const u=clamp((f-.10)/.70),t=u*u*(3-2*u),road=roadbedAt(...p)+.055;
  return road+(top-road)*t;
};

// Every concentric ring has the same columns. The split at each side of an
// aisle moves with radius so the steps have a constant width in metres.
// The same corner belongs to the seat, the riser below and the adjacent tread.
const sectionCuts=r=>{
  const half=Math.asin(aisleHalf/r);
  return [start,aisles[0]-half,aisles[0]+half,aisles[1]-half,aisles[1]+half,end];
};
const outerAngles=sectionCuts(outer);
const counts=outerAngles.slice(1).map((b,i)=>{
  const cells=Math.ceil((b-outerAngles[i])*outer/.54);
  return i===1||i===3?2*Math.ceil(cells/2):cells;
});
const sections=counts.flatMap((count,section)=>Array(count).fill(section));
function ring(r) {
  const cuts=sectionCuts(r),result=[];
  for(let k=0;k<counts.length;k++)for(let j=0;j<counts[k];j++)
    result.push(point(r,cuts[k]+(cuts[k+1]-cuts[k])*j/counts[k]));
  result.push(point(r,end));
  return result;
}
const rings=Array.from({length:2*rows+1},(_,i)=>ring(landing+.5*i*width));
const first=rings[0],last=rings.at(-1),stairColumn=sections.indexOf(3),stairColumns=counts[3];
const openCount=Math.ceil((start+tau-end)*landing/.54);
const openArc=Array.from({length:openCount+1},(_,j)=>point(landing,end+(start+tau-end)*j/openCount));
openArc[0]=first.at(-1);openArc[openCount]=first[0];
const circle=[...first,...openArc.slice(1,-1)];
const entranceRows=8;
const entry=Array.from({length:entranceRows+1},(_,i)=>Array.from({length:stairColumns+1},(_,j)=>{
  const offset=(1-2*j/stairColumns)*aisleHalf;
  const curb=[pathEnd[0]-offset*dz/length,pathEnd[1]+offset*dx/length];
  return interpolate(curb,last[stairColumn+j],i/entranceRows);
}));
entry[entranceRows]=last.slice(stairColumn,stairColumn+stairColumns+1);

const treads=[],floor=spatialIndex(2),rim=[];
function register(a,b,c,height){
  const ux=b[0]-a[0],uz=b[1]-a[1],vx=c[0]-a[0],vz=c[1]-a[1];
  const determinant=ux*vz-uz*vx;
  floor.add({a,b,c,ux,uz,vx,vz,determinant,height},
    Math.min(a[0],b[0],c[0])-.00001,Math.min(a[1],b[1],c[1])-.00001,
    Math.max(a[0],b[0],c[0])+.00001,Math.max(a[1],b[1],c[1])+.00001);
}
function registerQuad([a,b,c,d],height) {register(a,b,c,height);register(a,c,d,height);}
for(let i=0;i<circle.length;i++)register([cx,cz],circle[(i+1)%circle.length],circle[i],low);
for(let i=0;i<2*rows;i++){
  for(let j=0;j<sections.length;j++){
    const aisle=sections[j]===1||sections[j]===3,row=Math.floor(i/2);
    const h=low+(aisle?(i+1)/2:row+1)*rise;
    const q=[rings[i][j],rings[i][j+1],rings[i+1][j+1],rings[i+1][j]];
    treads.push({q,h,aisle,i,j,row});registerQuad(q,h);
  }
}
function entryCells(draw){
  for(let i=0;i<entranceRows;i++)for(let j=0;j<stairColumns;j++)
    draw([entry[i][j],entry[i][j+1],entry[i+1][j+1],entry[i+1][j]]);
}
entryCells(q=>registerQuad(q,null));

// Walk the entire boundary counterclockwise in XZ. The narrow tongue replaces
// the four-sided stair mouth, including its shared junction with the top tread.
function edge(a,b,height){rim.push({a,b,height});}
for(let j=0;j<sections.length;j++) {
  if(j===stairColumn){
    for(let i=entranceRows;i>0;i--)edge(entry[i][0],entry[i-1][0],null);
    for(let k=0;k<stairColumns;k++)edge(entry[0][k],entry[0][k+1],null);
    for(let i=0;i<entranceRows;i++)edge(entry[i][stairColumns],entry[i+1][stairColumns],null);
  }
  if(j<stairColumn||j>=stairColumn+stairColumns)edge(last[j],last[j+1],top);
}
for(let i=2*rows;i>0;i--)edge(rings[i].at(-1),rings[i-1].at(-1),low+Math.ceil(i/2)*rise);
for(let j=0;j<openCount;j++)edge(openArc[j],openArc[j+1],low);
for(let i=0;i<2*rows;i++)edge(rings[i][0],rings[i+1][0],low+Math.ceil((i+1)/2)*rise);
export const pondTerraceOutline=rim.map(edge=>edge.a);

function nearEdge(x,z,padding) {
  return rim.some(({a,b})=>{
    const dx=b[0]-a[0],dz=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
    return (x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2<=padding*padding;
  });
}
function nearTerrace(x,z,padding=0) {
  return Math.abs(x-cx)<outer+2+padding&&Math.abs(z-cz)<outer+2+padding;
}
export function pondTerraceSurfaceAt(x,z,roadbedAt=groundAt){
  if(!nearTerrace(x,z))return null;
  let h=null;
  for(const face of floor.near(x,z)){
    const {a,b,c,ux,uz,vx,vz,determinant,height}=face,fx=x-a[0],fz=z-a[1];
    const u=(fx*vz-fz*vx)/determinant,v=(ux*fz-uz*fx)/determinant;
    if(u< -1e-7||v< -1e-7||u+v>1.0000001)continue;
    const y=height??((1-u-v)*entranceHeight(a,roadbedAt)+u*entranceHeight(b,roadbedAt)+v*entranceHeight(c,roadbedAt));
    h=h===null?y:Math.max(h,y);
  }
  return h;
}
export function inPondTerrace(x,z,padding=0){
  if(!nearTerrace(x,z,padding))return false;
  return pondTerraceSurfaceAt(x,z)!==null || (padding>0&&nearEdge(x,z,padding));
}

export function nearPondTerraceGround(x,z){return Math.abs(x-cx)<=16&&Math.abs(z-cz)<=16;}

// Measured in plan from the low side of the upper walk to the end of the seats.
const crestA=[4.34,-134.56],crestB=[15.96,-146.54];
const crestLength=Math.hypot(crestB[0]-crestA[0],crestB[1]-crestA[1]);
const tx=(crestB[0]-crestA[0])/crestLength,tz=(crestB[1]-crestA[1])/crestLength;
const foot=first.at(-1),footDistance=(foot[0]-crestA[0])*(-tz)+(foot[1]-crestA[1])*tx;
export function pondTerraceTerrain(x,z,original,roadbedAt=groundAt){
  const X=x-cx,Z=z-cz;
  if(!nearPondTerraceGround(x,z))return original;
  const smooth=u=>{const t=clamp(u);return t*t*(3-2*t);};
  const bottom=low,r=Math.hypot(X,Z);
  // The outside of the landing rolls gently into the lower valley.
  const apron=bottom+(original-bottom)*smooth((r-landing)/4.5);
  // A section goes from the real paving edge directly down to the timber
  // landing. Its length grows toward the trees; interpolating between these
  // sections keeps the planted bank free of troughs at the former kerb.
  const d=(x-crestA[0])*(-tz)+(z-crestA[1])*tx,along=(x-foot[0])*tx+(z-foot[1])*tz;
  const width=footDistance+.18*Math.max(0,Math.min(10,along));
  const weight=smooth((along+2.2)/1.7)*(1-smooth((along-10)/5))*
    smooth((d+1.65)/1.05)*(1-smooth((d-width-1)/3.5));
  if(!weight)return apron;
  const crestX=x+d*tz,crestZ=z-d*tx;
  const high=roadbedAt(crestX,crestZ)+.025;
  const toe=bottom-.025*Math.max(0,along-3);
  const straight=toe+(high-toe)*Math.max(0,1-d/width);
  // At the curved deck use its actual perimeter as the lower end of each
  // section. Continue the grade underneath the cutout for grid interpolation.
  const radial=bottom+(high-bottom)*(r-landing)/(Math.hypot(crestX-cx,crestZ-cz)-landing);
  const round=smooth((landing+3.7-r)/2);
  const bank=straight+(radial-straight)*round;
  return apron+(bank-apron)*weight;
}

// Planar clipping keeps the deck boards, butt joints and perimeter trim in a
// single flush surface. The university's festival photograph shows pale timber:
// https://www.first.iir.isct.ac.jp/news/uploads/FIRSTNEWS02.pdf#page=9
function landingBoards(surfaces,outline){
  const angle=(start+end)/2,dx=Math.cos(angle),dz=Math.sin(angle);
  const across=([x,z])=>(x-cx)*dx+(z-cz)*dz;
  const along=([x,z])=>-(x-cx)*dz+(z-cz)*dx;
  const timber=[0xcbbba8,0xd1c2ad,0xc6b59f,0xd2c2ae,0xc9b8a3,0xc3b19c];
  const joint=0xa99a87,boardWidth=.16,boardLength=2.65,gap=.004;
  // The backing spans the staggered end joints. Float32 rounding can open a
  // hairline along otherwise collinear board edges next to a shorter board.
  const backing=low-.012;
  for(let i=0;i<outline.length;i++)
    surfaces.tri(at([cx,cz],backing),at(outline[(i+1)%outline.length],backing),at(outline[i],backing),joint);
  function clipHalf(poly,axis,limit,greater){
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],u=axis(a)-limit,v=axis(b)-limit;
      const keepA=greater?u>=0:u<=0,keepB=greater?v>=0:v<=0;
      if(keepA)result.push(a);
      if(keepA!==keepB)result.push(interpolate(a,b,u/(u-v)));
    }
    return result;
  }
  const strip=(poly,axis,lo,hi)=>clipHalf(clipHalf(poly,axis,lo,true),axis,hi,false);
  const paint=(poly,color)=>{
    for(let i=1;i<poly.length-1;i++)
      surfaces.tri(at(poly[0],low),at(poly[i+1],low),at(poly[i],low),color);
  };
  const radius=landing-.11;
  for(let row=0;row*boardWidth<2*radius;row++){
    const from=-radius+row*boardWidth,to=from+boardWidth;
    paint(strip(outline,across,from,from+gap),joint);
    const board=strip(outline,across,from+gap,to);
    const offset=(row%3)*boardLength/3;
    for(let n=-3;n<=2;n++){
      const begin=n*boardLength+offset,end=begin+boardLength;
      if(begin>=radius||end<=-radius)continue;
      paint(strip(board,along,begin,begin+gap),joint);
      paint(strip(board,along,begin+gap,end),timber[(row*5+n+3)%timber.length]);
    }
  }
}

export function makePondTerrace(surfaces,roadbedAt=groundAt,surroundingGround=groundAt){
  const wood=[0xbeaa93,0xc5b29a,0xb9a58e,0xc3ae95],edgeColor=0xccbda8,concrete=0x908980;
  const flat=(q,h,col)=>surfaces.quad(...q.map(p=>at(p,h)),col);
  const wall=(a,b,y0,y1,col)=>surfaces.quad(at(a,y0),at(b,y0),at(b,y1),at(a,y1),col);
  function band([a,b,c,d],from,to,h,col){
    flat([interpolate(a,d,from),interpolate(b,c,from),interpolate(b,c,to),interpolate(a,d,to)],h,col);
  }
  // Boards, joints and nosings partition the tops without coplanar overlays.
  for(const {q,h,aisle,i,j,row} of treads){
    if(aisle){
      band(q,0,.083,h,edgeColor);band(q,.083,1,h,0xb7a38d);
    }else{
      for(let k=0;k<3;k++){
        const from=k/3,to=(k+1)/3,joint=from+(k===0&&i%2===0?.083:.014);
        band(q,from,joint,h,k===0&&i%2===0?edgeColor:0x9d8b77);
        band(q,joint,to,h,wood[(row+Math.floor(j/4)+k)%wood.length]);
      }
    }
    if(aisle||i%2===0){
      const bottom=low+(aisle?i/2:row)*rise;
      wall(q[0],q[1],bottom,h-.04,aisle?0x96887c:concrete);
      wall(q[0],q[1],h-.04,h,edgeColor);
    }
    if(aisle&&i%2===0){
      if(j===0||sections[j-1]!==sections[j])wall(q[0],q[3],h,h+rise/2,concrete);
      if(j+1===sections.length||sections[j+1]!==sections[j])wall(q[1],q[2],h,h+rise/2,concrete);
    }
  }
  const center=[cx,cz],trim=circle.map(p=>interpolate(center,p,1-.11/landing));
  landingBoards(surfaces,trim);
  for(let j=0;j<circle.length;j++){
    const k=(j+1)%circle.length;
    flat([trim[j],trim[k],circle[k],circle[j]],low,0xc4b29c);
  }
  entryCells(q=>surfaces.quad(...q.map(p=>at(p,entranceHeight(p,roadbedAt))),0xa39a8f));
  // Seal every exposed side down to the adjacent grade. In particular, the
  // north and south end walls follow each tread instead of spanning a slope.
  for(const {a,b,height} of rim){
    const yA=height??entranceHeight(a,roadbedAt),yB=height??entranceHeight(b,roadbedAt);
    const bankA=surroundingGround(...a),bankB=surroundingGround(...b);
    const bottomA=Math.min(yA-.32,bankA-.22),bottomB=Math.min(yB-.32,bankB-.22);
    surfaces.quad(at(a,bottomA),at(b,bottomB),at(b,Math.max(yB,bankB)),at(a,Math.max(yA,bankA)),concrete);
  }
}
