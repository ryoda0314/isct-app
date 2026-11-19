import { displaySpace } from "./campus3dPicody.js";
import { lettering } from "./campus3dTakiLettering.js";

const TAU=2*Math.PI;
const drinks=[
  ["#772f46","#dfeced","#d6e4e5","#e9f0ec","#e5ecd9","#c8cc92","#c8d891","#cfdb83","#ead67a","#f5d981","#f4cd75","#f6e29e"],
  ["#a36743","#b8c6b9","#e2bc70","#c6c7aa","#8dadaa","#e5bb7f","#9d6876","#62678c","#d7d2aa","#80626a","#628873","#96a480"],
  ["#b97648","#e4dbc3","#78905b","#688563","#53806d","#688b77","#759197","#a94d48","#565058","#6486a5","#537499","#516082"]
];

// A return is measured into the cabinet from the front glazing in metres.
function cabinet(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),W=F.L,H=z1-z0;
  const X=s=>(s-.5)*W,Y=r=>D/2-r;
  const slab=(a,b,r,s,low,high,color)=>g.box(X(a),Y(s),X(b),Y(r),low*H,high*H,color);
  return {g,W,H,X,Y,slab};
}

export function addTakiVending(M,F,D,z0,z1,T) {
  const {g,W,H,X,Y,slab}=cabinet(M,F,D,z0,z1,T),white="#efefeb",metal="#c1c6c2";
  for (const x of [.06,.85]) slab(x,x+.09,-.038,D-.04,0,.032,"#494b49");
  slab(0,1,.14,D,.032,1,white);
  slab(0,.045,0,.15,.032,1,white);slab(.826,1,0,.15,.269,1,white);
  slab(.041,.83,0,.15,.962,1,white);slab(.041,.83,0,.15,.273,.418,white);
  slab(.043,.826,.121,.144,.415,.965,"#e0e6dc");
  for (const x of [.047,.816]) slab(x,x+.006,.010,.108,.416,.965,"#bec6bd");
  for (const [row,shelf] of [.799,.612,.423].entries()) {
    slab(.048,.818,.009,.119,shelf,shelf+.014,"#eceee9");
    slab(.056,.810,.009,.016,shelf+.015,shelf+.037,"#d3dae0");
    for (let col=0;col<12;col++) {
      const x=X(.077+col*.0646),y=Y(.069),r=Math.min(W*.022,.024),ink=drinks[row][col];
      const can=row===2 || (row===1 && col%3===0),h=H*(can?.097:.120),bottom=H*(shelf+.043);
      const profile=can?[[0,.88],[.05,1],[.84,1],[.98,.89],[1,.89]]:
        [[0,.79],[.055,1],[.62,1],[.73,.94],[.85,.46],[.94,.46],[.96,.54],[1,.54]];
      for (let i=1;i<profile.length;i++) {
        const [v0,r0]=profile[i-1],[v1,r1]=profile[i],shoulder=(r0-r1)*r/((v1-v0)*h);
        const color=i===1?"#e4e4d7":i===2?ink:i===profile.length-1?(can?"#c6c9c7":"#f0eee0"):"#d5ded5";
        g.surface(10,1,(u,v)=>{
          const a=TAU*u,rad=r*(r0+(r1-r0)*v),nx=Math.sin(a),ny=Math.cos(a),l=Math.hypot(1,shoulder);
          return [[x+rad*nx,y+rad*ny,bottom+(v0+(v1-v0)*v)*h],[nx/l,ny/l,shoulder/l]];
        },color,.09);
      }
      const cap=profile[profile.length-1][1]*r;
      g.ellipsoid([x,y,bottom+h],[cap,cap,.0015],can?"#cbd0c6":"#e6e8df");
      g.box(x-r*.48,y+r*.89,x+r*.47,y+r*.99,bottom+h*.35,bottom+h*.50,row===0?"#f8f7ec":"#eee7d1");
      const buttonZ=H*(shelf+.026);
      g.ellipsoid([x,Y(.006),buttonZ],[W*.022,.007,.010],"#48588b");
      g.box(x-.005,Y(.001),x+.005,Y(-.0015),buttonZ-.001,buttonZ+.0018,"#bfdaed");
    }
  }
  const pane=[.05,.815].map(X),glassY=Y(.002);
  M.glassy?.quad([[pane[0],.417],[pane[1],.417],[pane[1],.963],[pane[0],.963]].map(([x,z])=>g.point([x,glassY,z*H])),g.normal([0,1,0]),T("#e2eaee"));
  // Reader and coin acceptor project forward. Both retrieval hatches are recessed into the casing.
  slab(.855,.973,-.007,0,.784,.938,metal);
  slab(.860,.969,-.010,-.007,.794,.930,"#f2f0e7");
  slab(.883,.957,-.022,0,.641,.728,"#354861");
  slab(.893,.948,-.026,-.022,.652,.716,"#7187a1");
  const axis=(x,z,rad,c)=>g.tube([X(x),Y(.004),z*H],[X(x),Y(-.009),z*H],rad,rad,c);
  axis(.929,.557,.024,"#93988f");slab(.916,.944,-.011,-.008,.555,.558,"#414541");
  slab(.876,.971,-.016,.005,.459,.474,"#d7a24b");
  slab(0,.192,0,.15,.032,.277,white);slab(.774,1,0,.15,.032,.277,white);
  slab(.192,.775,0,.15,.032,.103,white);slab(.192,.775,0,.15,.240,.278,white);
  slab(.192,.775,.095,.14,.102,.244,"#444946");
  slab(.204,.765,.035,.045,.133,.230,"#838883");slab(.204,.765,.010,.090,.104,.117,metal);
  slab(.866,.974,-.005,0,.111,.181,metal);slab(.878,.961,-.007,-.005,.126,.159,"#494e4c");
  for (let k=0;k<31;k++) slab(.234+k*.017,.241+k*.017,-.001,.002,.067,.074,"#777b74");
  slab(.907,.985,-.012,.010,.949,1.028,white);
  g.ellipsoid([X(.946),Y(-.013),H*.991],[W*.034,.002,H*.027],"#637ca2");
}

export function addTakiSorting(M,F,D,z0,z1,T) {
  const {g,W,H,X,Y,slab}=cabinet(M,F,D,z0,z1,T),white="#eeeae1";
  slab(0,1,.157,D,.01,.977,"#77766d");
  slab(0,1,-.010,D,.975,1,white);slab(0,1,0,.157,.819,.839,white);
  const plane={n:[0,1,0],at:(x,z,d=0)=>[x,Y(-.002)-.0004+d,z]};
  for (let i=0;i<4;i++) {
    const x=i/4,center=X(x+.125);
    slab(x+.003,x+.247,0,.16,.012,.820,white);
    slab(x,x+.013,0,.16,.828,.977,white);
    slab(x+.117,x+.142,-.004,0,.054,.072,"#89877d");
    const line=i===3?"CANS / BOTTLES":"BURNABLE";
    lettering(g,plane,line,center,H*.730,W*.216,.033,"#55574d");
    lettering(g,plane,i===3?"PET BOTTLES":"可燃ごみ",center,H*.670,W*.196,.025,"#616258");
  }
  slab(.987,1,0,.16,.828,.977,white);
  slab(.25,.42,.09,.23,1,1+.023/H,"#dedace");
  slab(.43,.59,.20,.34,1,1+.075/H,"#e6e4d9");
  slab(.46,.56,.241,.253,1+.075/H,1+.079/H,"#8e8c80");
  slab(.24,.30,.40,.414,1,1+.10/H,"#debe5c");
  for (const s of [.49,.55]) {
    g.tube([X(s),Y(.42),H],[X(s),Y(.42),H+.096],.023,.020,"#dfdfd3");
    g.tube([X(s),Y(.42),H+.096],[X(s),Y(.42),H+.139],.013,.009,"#eaeae2");
  }
}

export function addBinLiner(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T),w=F.L/2-.021,d=D/2-.021,h=z1-z0;
  // Uneven folded plastic curls over the rim, sags into the mouth and opens in the centre.
  g.surface(36,4,(u,v)=>{
    const a=u*TAU,co=Math.cos(a),si=Math.sin(a),fold=Math.sin(11*a+.8)+.52*Math.sin(7*a);
    const radius=[1.07,1.045,.94,.79,.64][Math.round(v*4)];
    const levels=[h-.056,h+.003,h-.003,h-.068,h-.111];
    return [[w*Math.sign(co)*Math.abs(co)**.44*radius,d*Math.sign(si)*Math.abs(si)**.44*radius,
      levels[Math.round(v*4)]+(.005+.007*v)*fold],[co*.5,si*.5,.7]];
  },"#e9e5de",.10);
  for (const [x,y,rx,ry,color] of [[-.36,.08,.20,.18,"#d5d4c6"],[.26,-.18,.21,.23,"#e6d9cf"],[-.07,.30,.16,.13,"#658299"]]) {
    g.ellipsoid([x*w,y*d,h-.106],[rx*w,ry*d,.036],color);
  }
  lettering(g,{n:[0,1,0],at:(x,z,k=0)=>[x,D/2+.002+k,z]},"可燃ごみ",0,h*.54,F.L*.72,.030,"#66645d");
}
