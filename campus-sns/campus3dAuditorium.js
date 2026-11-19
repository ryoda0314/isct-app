// 創立70周年記念講堂。南西の雁行窓と透かし積み、舞台の反射壁と照明。
import { foldedScreenBays, toXY } from "./campus3dFeatures.js";

const up = [0, 0, 1], down = [0, 0, -1];
const mix = (a,b,t) => a.map((v,i) => v+(b[i]-v)*t);
const noise = (i,j) => { const v=Math.sin(i*31.7+j*67.1)*15731.7; return v-Math.floor(v); };

// s は最初の辺に沿う距離、d はその右側（表）への距離。
function wallPlane(a,b) {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const u=[(b[0]-a[0])/length,(b[1]-a[1])/length], n=[u[1],-u[0],0];
  const xy=(s,d) => [a[0]+u[0]*s+n[0]*d,a[1]+u[1]*s+n[1]*d];
  return {length,u,n,xy,P:(s,d,z)=>[xy(s,d),z]};
}

function block(m,F,a,b,l,r,lo,hi,color) {
  m.prism([F.xy(a,l),F.xy(b,l)],[F.xy(a,r),F.xy(b,r)],[lo,lo],[hi,hi],
    {top:color,side:color,bottom:color},{bottom:true});
}

// 一つの素焼きブロックに、円と菱形の穴が並ぶ。表・裏・穴の小口を同じ輪郭で結ぶ。
function clayCourse(m,F,lo,hi,thickness,row,bay,clay,shade) {
  const {length,P,n,u}=F, half=thickness/2;
  for (let col=0;col<2;col++) {
    const w=(length-.046)/2, h=hi-lo, mid=.023+(col+.5)*w, z=(lo+hi)/2;
    const round=(col+row)%2===0, radius=Math.min(w*.345,h*.371);
    const holeZ=z+(col===0 ? -.012 : .012);
    const face=mix(clay,shade,.04+.24*noise(row,bay));
    const bore=mix(face,shade,.64), back=mix(face,shade,.26);
    const sectors=round ? 16 : 8;
    const points=Array.from({length:sectors},(_,i)=>{
      const a=i*2*Math.PI/sectors, x=Math.cos(a), y=Math.sin(a), boxScale=1/Math.max(Math.abs(x),Math.abs(y));
      const r=round ? radius : radius*1.12/(Math.abs(x)+Math.abs(y));
      return {outside:[mid+w*x*boxScale/2,z+h*y*boxScale/2],hole:[mid+r*x,holeZ+r*y]};
    });
    const at=([s,z],d)=>P(s,d,z);
    for(let i=0;i<points.length;i++) {
      const a=points[i], b=points[(i+1)%points.length], loop=[a.outside,b.outside,b.hole,a.hole];
      m.quad(loop.map(q=>at(q,half)),n,face);
      m.quad(loop.map(q=>at(q,-half)),[-n[0],-n[1],0],back);
      const ds=b.hole[0]-a.hole[0], dz=b.hole[1]-a.hole[1], len=Math.hypot(ds,dz);
      const inward=[-u[0]*dz/len,-u[1]*dz/len,ds/len];
      m.quad([at(a.hole,half),at(b.hole,half),at(b.hole,-half),at(a.hole,-half)],inward,bore);
    }
  }
}

export function addFoldedScreen(m,p,g0,look) {
  const bottom=g0+Math.min(...p.zs), top=g0+Math.max(...p.zs);
  const clay=mix([.77,.49,.35,1],look.redBrick,.18), shade=mix(clay,look.dark,.55);
  const fin=mix(look.glazed,look.frame,.48), metal=mix(look.frame,look.mullion,.60);
  for(const [i,[a,b,c]] of foldedScreenBays(p).entries()) {
    const F=wallPlane(a,b), {P,length:L,n}=F;
    const returnFace=wallPlane(b,c);
    block(m,returnFace,-.018,returnFace.length+.018,-.026,.026,bottom,top,fin);
    if(p.kind==="clayScreen") {
      const rows=18, pitch=(top-bottom)/rows;
      for(let j=0;j<rows;j++) {
        const at=bottom+j*pitch;
        clayCourse(m,F,at+.004,at+pitch-.004,p.thickness,j,i,clay,shade);
        block(m,F,.018,L-.018,-p.thickness*.44,p.thickness*.44,at-.004,at+.004,shade);
      }
      for(const s of [0,L-.024]) block(m,F,s,s+.024,-.055,.055,bottom,top,fin);
    } else {
      // The cast glass gets darker under the eave and lighter towards the projecting sill.
      const low=mix(look.glazed,look.frost[1],.46);
      const high=mix(look.glass[0],look.frame,.46+.18*noise(i,3));
      m.quadColors([P(0,0,bottom),P(L,0,bottom),P(L,0,top),P(0,0,top)],n,[low,low,high,high]);
      for(const s of [0,L-.024]) block(m,F,s,s+.024,-.028,.045,bottom,top,metal);
      for(const t of [0,.22,.53,1]) {
        const z=bottom+(top-bottom)*t;
        block(m,F,0,L,-.025,.043,z-.018,z+.018,metal);
      }
    }
  }
}

export function addFaceBrick(m,p,g0,look) {
  const F=wallPlane(...p.coords.slice(0,2).map(toXY));
  const lo=g0+Math.min(...p.zs), hi=g0+Math.max(...p.zs), d=p.thickness/2+.004;
  const red=mix([.65,.36,.25,1],look.redBrick,.22), fired=mix(red,look.dark,.28);
  const width=.226, height=.079;
  for(let row=0;lo+row*height+.006<hi;row++) {
    const shift=(row%2)*width/2, z=lo+row*height+.004, h=Math.min(z+height-.009,hi);
    for(let col=0;col*width-shift<F.length;col++) {
      const a=Math.max(.001,col*width-shift+.004), b=Math.min(F.length-.001,(col+1)*width-shift-.004);
      if(b<=a) continue;
      const tone=noise(col,row), tint=mix(red,fired,tone*tone*.92);
      m.quad([F.P(a,d,z),F.P(b,d,z),F.P(b,d,h),F.P(a,d,h)],F.n,tint);
    }
  }
}

export function addBoardForm(m,p,g0,look) {
  const F=wallPlane(...p.coords.slice(0,2).map(toXY)), lo=g0+Math.min(...p.zs), hi=g0+Math.max(...p.zs);
  const front=p.thickness/2+.003, stone=mix(look.glazed,look.graniteDark,.29), dark=mix(stone,look.dark,.36);
  for(let row=0;lo+row*.15<hi;row++) {
    const z=lo+row*.15, h=Math.min(hi,z+.15);
    for(let col=-1;col*2.4<F.length;col++) {
      const shift=(row%3)*.8, a=Math.max(0,col*2.4+shift), b=Math.min(F.length,(col+1)*2.4+shift-.005);
      if(b<=a || h-z<.008) continue;
      const color=mix(stone,dark,.12+.19*noise(col,row)+.13*(row%12===0));
      m.quadColors([F.P(a,front,z+.003),F.P(b,front,z+.003),F.P(b,front,h-.003),F.P(a,front,h-.003)],
        F.n,[color,color,mix(color,stone,.14),mix(color,dark,noise(col,2)*.16)]);
    }
  }
  for(let s=.46;s<F.length;s+=.92) for(let z=lo+.43;z<hi;z+=.91) {
    const points=Array.from({length:8},(_,i)=>F.P(s+.021*Math.cos(i*Math.PI/4),front+.003,z+.021*Math.sin(i*Math.PI/4)));
    for(let i=1;i<7;i++) for(const v of [points[0],points[i],points[i+1]]) m.vert(...v,F.n,dark);
  }
}

export function addBarrelSeams(m,arch,g0,hAt,look) {
  const F=wallPlane(...arch.coords.map(toXY)), count=Math.max(1,Math.round(F.length/arch.seamPitch));
  const color=mix(look.redPanel,look.graniteDark,.44), steps=2*(arch.n||16);
  for(let i=0;i<=count;i++) {
    const s=i*F.length/count, w=.020, left=[],right=[],lo=[],hi=[];
    for(let j=0;j<=steps;j++) {
      const d=arch.half*(2*j/steps-1), p=F.xy(s,d), z=g0+hAt(p);
      left.push(F.xy(s-w,d)); right.push(F.xy(s+w,d)); lo.push(z-.004); hi.push(z+.039);
    }
    m.prism(left,right,lo,hi,{top:color,side:color});
  }
}

// 舞台背面の五連の反射壁。平面の出入りと、見上げたときの弧形の上端を両方作る。
export function addAcousticShell(m,ring,lo,hi,T) {
  const F=wallPlane(ring[0],ring[1]), {P,length}=F;
  const depth=Math.max(.08,Math.hypot(ring[3][0]-ring[0][0],ring[3][1]-ring[0][1]));
  const bay=length/5, cells=12, rows=Math.ceil((hi-lo)/.34);
  const shift=s=>Math.sin(Math.PI*s), relief=s=>.045+(depth-.045)*shift(s);
  const crown=s=>hi-.60+.54*shift(s), stone=T("#d0c6ad"), seam=T("#948c79");
  block(m,F,0,length,-.035,0,lo,hi,T("#624633"));
  for(let k=0;k<5;k++) for(let i=0;i<cells;i++) {
    const a=i/cells, b=(i+1)/cells, x=(k+a)*bay, y=(k+b)*bay, d=relief(a), e=relief(b);
    for(let j=0;j<rows;j++) {
      const base=lo+j*.34, next=base+.34;
      const z=Math.min(base,crown(a)), h=Math.min(base,crown(b));
      const z1=Math.min(next,crown(a)), h1=Math.min(next,crown(b));
      if(z1<=z && h1<=h) continue;
      const tint=mix(stone,seam,.06+.33*(1-shift((a+b)/2))+.14*noise(k*4+Math.floor((i+2*(j%2))/4),j));
      m.quad([P(x,d,z),P(y,e,h),P(y,e,h1),P(x,d,z1)],null,tint);
      if(j && base<Math.min(crown(a),crown(b))) m.quad([P(x,d+.002,z),P(y,e+.002,h),P(y,e+.002,h+.009),P(x,d+.002,z+.009)],null,seam);
      if((i+2*(j%2))%4===0) m.quad([P(x,d+.002,z),P(x+.009,d+.002,z),P(x+.009,d+.002,z1),P(x,d+.002,z1)],F.n,seam);
    }
    m.quad([P(x,0,crown(a)),P(y,0,crown(b)),P(y,e,crown(b)),P(x,d,crown(a))],up,seam);
  }
}

// 舞台両袖の石張り。反射壁へ絞られる実際の壁の向きに石の通し目地を合わせる。
export function addStageWing(m,ring,lo,hi,T) {
  const F=wallPlane(ring[0],ring[1]), {length:L,P,n}=F;
  const stone=T("#c5b9a0"), joint=T("#958873");
  block(m,F,0,L,0,.045,lo,hi,joint);
  const face=(x,y,z,h,d,color) => m.quad([P(x,d,z),P(y,d,z),P(y,d,h),P(x,d,h)],n,color);
  for (let row=0;lo+row*.35<hi;row++) {
    const z=lo+row*.35, h=Math.min(hi,z+.35);
    for (let col=0;col*.72-.36<L;col++) {
      const a=col*.72-(row%2)*.36, x=Math.max(0,a), y=Math.min(L,a+.72);
      if(y-x>.012) face(x+.005,y-.005,z+.004,h-.004,.049,mix(stone,joint,.35*noise(col,row)));
    }
  }
  // 舞台床に沿う明るい木の腰板と、それを囲う白い方立。
  const a=L*.43,b=L*.95,top=lo+1.9;
  block(m,F,a,b,.05,.092,lo,top,T("#e7ddc8"));
  for(let i=0;i<4;i++) {
    const w=(b-a)/4;
    face(a+i*w+.055,a+(i+1)*w-.055,lo+.085,top-.085,.096,T(i%2 ? "#b88252" : "#c99160"));
  }
}

export function addAuditoriumSpeaker(m,ring,lo,hi,T) {
  const F=wallPlane(ring[0],ring[1]), {length:L}=F;
  const depth=Math.hypot(ring[3][0]-ring[0][0],ring[3][1]-ring[0][1]);
  const oak=T("#85613f"), end=T("#68492f"), grille=T("#292825"), slat=T("#444038");
  block(m,F,0,L,0,.10,lo,hi,oak);
  block(m,F,.06,L-.06,.10,depth-.025,lo+.10,hi-.09,end);
  block(m,F,.12,L-.12,depth-.028,depth,lo+.19,hi-.16,grille);
  for(let z=lo+.21;z<hi-.2;z+=.061) {
    m.quad([F.P(.14,depth+.003,z),F.P(L-.14,depth+.003,z),F.P(L-.14,depth+.003,z+.006),F.P(.14,depth+.003,z+.006)],F.n,slat);
  }
}

// 木の背板は上へ行くほど後ろに傾く。布張りの表は中央が浅くくぼみ、上縁が丸く回り込む。
export function addAuditoriumSeat(m, xy, width, depth, floor, top, cloth, wood, side) {
  const height = top-floor, seat = floor+Math.min(.44,height*.50);
  const arm = floor+Math.min(.62,height*.70);
  const P = (x,y,z) => [xy(x,y),z];
  const edge = mix(cloth,side,.38), rim = mix(wood,side,.30);
  const crossSection = t => {
    const x = width*(.09+.82*t), arch = 1-(2*t-1)**2;
    const back = .012+.047*(1-arch), crown = top-.071*(1-arch);
    return [
      P(x,back+.09,seat-.16), P(x,back,crown-.031),
      P(x,back+.021,crown), P(x,back+.052,crown-.014),
      P(x,back+.070,crown-.063), P(x,back+.126,seat+.002),
    ];
  };
  const finishes = [wood,rim,wood,edge,cloth,side];
  let a = crossSection(0);
  const cap = (points,sign) => {
    const axis=xy(width,0), origin=xy(0,0), n=[sign*(axis[0]-origin[0])/width,sign*(axis[1]-origin[1])/width,0];
    for(let j=1;j+1<points.length;j++) for(const v of [points[0],points[j],points[j+1]]) m.vert(...v,n,rim);
  };
  cap(a,-1);
  for (let i=1;i<=6;i++) {
    const b = crossSection(i/6);
    for (let j=0;j<finishes.length;j++) {
      const next = (j+1)%finishes.length;
      m.quad([a[j],b[j],b[next],a[next]],null,finishes[j]);
    }
    a = b;
  }
  cap(a,1);

  // 座の前縁は角を取り、少し持ち上げる。左右の脚の間は床まで開く。
  const cushion = [[.12,.23],[.88,.23],[.89,.81],[.85,.88],[.15,.88],[.11,.81]];
  const lower = cushion.map(([x,y])=>P(width*x,depth*y,seat-.070+.020*y));
  const upper = cushion.map(([x,y])=>P(width*x,depth*y,seat+.025*y));
  for (let j=0;j<upper.length;j++) {
    const k = (j+1)%upper.length;
    m.quad([lower[j],lower[k],upper[k],upper[j]],null,edge);
    for (const v of [P(width*.5,depth*.55,seat+.033),upper[j],upper[k]]) m.vert(...v,up,cloth);
  }
  for (const center of [width*.050,width*.950]) {
    const strip = (half,y0,y1,z0,z1,color) => m.prism(
      [xy(center-half,y0),xy(center-half,y1)], [xy(center+half,y0),xy(center+half,y1)],
      z0,z1,{top:color,side:color,bottom:color},{bottom:true});
    strip(.016,depth*.33,depth*.52,[floor,floor],[arm-.055,arm-.055],side);
    strip(.023,depth*.15,depth*.77,[arm-.13,arm-.085],[arm-.033,arm-.055],side);
    strip(.028,depth*.12,depth*.82,[arm-.030,arm-.050],[arm+.008,arm-.012],wood);
  }
}

export function addStageBatten(m,ring,lo,hi,T) {
  const F=wallPlane(ring[0],ring[1]), {length:L,P}=F;
  const black=T("#292b2b"), steel=T("#51504b"), lens=T("#ddd8bf");
  const height=s=>hi-.07-.68*(2*s/L-1)**2;
  const count=12;
  for(let i=0;i<count;i++) {
    const a=i*L/count, b=(i+1)*L/count, s=(a+b)/2, h=height(s);
    m.prism([F.xy(a,-.034),F.xy(b,-.034)],[F.xy(a,.034),F.xy(b,.034)],
      [height(a)-.04,height(b)-.04],[height(a)+.04,height(b)+.04],{top:steel,side:black,bottom:black},{bottom:true});
    for(const x of [s-.128,s+.103]) block(m,F,x,x+.025,-.021,.021,h-.21,h,black);
    // 照明の筒は舞台に向かって傾く。レンズと手前のフードの間にも深さを持たせる。
    const base=Math.max(lo+.03,h-.44);
    const circle=(radius,d,z)=>Array.from({length:12},(_,i)=>{
      const ang=i*Math.PI/6;
      return P(s+radius*Math.cos(ang),d+radius*.70*Math.sin(ang),z-radius*.71*Math.sin(ang));
    });
    const rings=[circle(.096,.10,h-.12),circle(.116,-.08,base+.09),circle(.132,-.14,base+.03)];
    for(let k=1;k<rings.length;k++) for(let j=0;j<12;j++) {
      const jj=(j+1)%12;
      m.quad([rings[k-1][j],rings[k-1][jj],rings[k][jj],rings[k][j]],null,black);
    }
    const glass=circle(.094,-.143,base+.027);
    for(let j=0;j<12;j++) {
      m.quad([rings[2][j],rings[2][(j+1)%12],glass[(j+1)%12],glass[j]],down,steel);
      for(const v of [P(s,-.143,base+.027),glass[j],glass[(j+1)%12]]) m.vert(...v,down,lens);
    }
  }
}

// 半円筒の天井に沿って取付面までの距離を測る。器具の縁も木の天井から離れない。
export function addVaultFixture(m, kind, at, normal, T) {
  if (kind === "roundVent") {
    const profile = [[.285,0,"#84776a"],[.266,.024,"#a5927f"],[.230,.012,"#3f3632"],
      [.185,.012,"#51463e"],[.165,.045,"#a58e78"],[.143,.023,"#4b413b"],
      [.095,.026,"#5a4c43"],[.078,.052,"#9d8570"],[0,.025,"#423832"]];
    const point = (k,r,h) => at(r*Math.cos(k*Math.PI/12),r*Math.sin(k*Math.PI/12),h);
    for (let j=1;j<profile.length;j++) {
      const [ra,ha]=profile[j-1], [rb,hb,color]=profile[j];
      for (let k=0;k<24;k++) m.quad([point(k,ra,ha),point(k+1,ra,ha),point(k+1,rb,hb),point(k,rb,hb)],normal,T(color));
    }
    return;
  }
  const quad = (a,b,c,d,h,color) => m.quad([at(a,c,h),at(b,c,h),at(b,d,h),at(a,d,h)],normal,color);
  quad(-.35,.35,-.16,.16,.012,T("#4f4b46"));
  quad(-.325,.325,-.142,.142,.021,T("#aaa9a0"));
  for (let i=0;i<3;i++) for (let j=0;j<2;j++) {
    const x=-.292+i*.206,y=-.118+j*.127;
    quad(x,x+.174,y,y+.105,.028,T("dlight"));
  }
}
