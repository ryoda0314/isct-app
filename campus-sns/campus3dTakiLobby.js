// Taki Plaza 1F. The sofa profile is visible end-on in S__47226944.
// IMG_0723 and the café's two interior photographs show the joinery on both sides of the counter.
import earcut from "earcut";
import polygonClipping from "polygon-clipping";
import { toXY } from "./campus3dFeatures.js";
import { displaySpace } from "./campus3dPicody.js";

const turn = 2 * Math.PI;
const unit = a => {
  const length = Math.hypot(...a) || 1;
  return a.map(v => v / length);
};

// A pair of independently sewn cushions. Round the corners of the real folded
// section before lofting it. The tapered end caps leave the triangular void open.
function cushion(g, section, depth, height, width, cloth) {
  const points = [];
  for (let i = 0; i < section.length; i++) {
    const a = section[(i + section.length - 1) % section.length], b = section[i], c = section[(i + 1) % section.length];
    for (const t of [0, .5, 1]) {
      points.push(b.map((n, j) => (n + .32 * ((a[j]-n)*(1-t)**2 + (c[j]-n)*t*t)) * (j ? height : depth)));
    }
  }
  const cap = earcut(points.flat());
  const center = points.reduce((p,q) => [p[0]+q[0]/points.length, p[1]+q[1]/points.length], [0,0]);
  const winding = Math.sign(points.reduce((sum,p,i)=>{
    const q=points[(i+1)%points.length];
    return sum+p[0]*q[1]-q[0]*p[1];
  },0));
  const normals = points.map((p,i)=>{
    const a=points[(i+points.length-1)%points.length], b=points[(i+1)%points.length];
    const before=unit([p[1]-a[1],a[0]-p[0]]), after=unit([b[1]-p[1],p[0]-b[0]]);
    return unit(before.map((v,k)=>winding*(v+after[k])));
  });
  for (const side of [-1,1]) {
    const xs = [.0008,.014,.05,.11,.27,.53,.77,.90,.958,.984,1].map(t=>t*width/2);
    const factors = [.941,.977,1.001,1.014,1.028,1.032,1.025,1.012,.986,.958,.892];
    const at = (i,j) => {
      const [y,z]=points[i], edge=Math.max(0,1-(xs.at(-1)-xs[j])/.13);
      const gather=.009*edge*Math.sin(26*y/depth+9*z/height);
      return [side*xs[j], center[0]+(y-center[0])*factors[j]+gather*normals[i][0],
        center[1]+(z-center[1])*factors[j]+gather*normals[i][1]];
    };
    g.surface(points.length,xs.length-1,(u,v)=>{
      const i=Math.round(u*points.length)%points.length,j=Math.round(v*(xs.length-1));
      const j0=Math.max(0,j-1),j1=Math.min(j+1,xs.length-1);
      const bulge=.17*(factors[j0]-factors[j1])/(xs[j1]-xs[j0]);
      return [at(i,j),unit([side*bulge,...normals[i]])];
    },cloth,.012);
    for (const j of [0,xs.length-1]) for (let k = 0; k < cap.length; k += 3) {
      g.triangle([at(cap[k],j),at(cap[k+1],j),at(cap[k+2],j)],[side*(j?1:-1),0,0],cloth);
    }
  }
}

export function addFoldedLounge(M,F,D,z0,z1,T) {
  const g = displaySpace(M,F,D,z0,T), H = z1-z0, W = F.L;
  for (const x of [-W*.40,W*.40]) {
    const sled = [[x,-D*.44,H*.245],[x,-D*.37,.025],[x,D*.39,.025],[x,D*.33,H*.245]];
    for (let j=1;j<sled.length;j++) g.tube(sled[j-1],sled[j],.012,.012,"#92948e");
  }
  g.box(-W*.46,-D*.415,W*.46,D*.40,H*.204,H*.235,"#5a5956");
  cushion(g,[[-.50,.25],[-.45,.21],[.44,.216],[.48,.27],[.40,.345],[-.05,.414],[-.43,.463],[-.50,.425]],D,H,W,"#b8b1a7");
  cushion(g,[[-.13,.373],[.205,.926],[.267,1.0],[.314,.982],[.505,.303],[.482,.258],
    [.417,.241],[.266,.762],[.006,.373],[-.056,.346]],D,H,W,"#b6afa5");
}

export function addLobbyLowTable(M,F,D,z0,z1,T) {
  const g = displaySpace(M,F,D,z0,T), W = F.L, H = z1-z0;
  for (const x of [-W*.39,W*.39]) {
    const y=D*.39;
    g.box(x-.012,-y,x+.012,y,.013,.034,"#484641");
    for (const end of [-y,y]) g.tube([x,end,.020],[x,end*1.06,H-.022],.011,.011,"#4e4b46");
  }
  g.box(-W/2,-D/2,W/2,D/2,H-.023,H-.004,"#b79772");
  g.box(-W/2,-D/2,W/2,D/2,H-.004,H,"#dfbd91");
  g.box(-.14,-.074,.14,.074,H+.0008,H+.002,"#eee9da");
}

function disc(g,r,y,z,height,paint,slices=28) {
  const side = (a,h) => [r*Math.cos(a),y+r*Math.sin(a),h];
  for (let j = 0; j < slices; j++) {
    const a = turn*j/slices, b = turn*(j+1)/slices;
    g.quad([side(a,z),side(b,z),side(b,z+height),side(a,z+height)],[Math.cos((a+b)/2),Math.sin((a+b)/2),0],paint);
    g.triangle([[0,y,z+height],side(a,z+height),side(b,z+height)],[0,0,1],paint);
  }
}

export function addSeattleTable(M,F,D,z0,z1,T,style) {
  const g = displaySpace(M,F,D,z0,T), W=F.L, H=z1-z0, standing=style==="cafeHigh";
  if (standing) {
    disc(g,W*.37,0,.004,.037,"#343435");
    disc(g,W*.5,0,H-.025,.025,"#302f30");
  } else {
    g.box(-W*.31,-D*.31,W*.31,D*.31,0,.032,"#393735");
    g.box(-W/2,-D/2,W/2,D/2,H-.030,H-.005,"#a88658");
    g.box(-W/2,-D/2,W/2,D/2,H-.005,H,"#d9b27f");
  }
  g.tube([0,0,.028],[0,0,H-.024],standing?.033:.036,.033,"#353432");
}

export function addCafeBowChair(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T), W=F.L, H=z1-z0, seat=Math.min(.45,H*.56);
  const wood="#c29b68";
  disc(g,Math.min(W,D)*.432,-.008,seat-.027,.027,"#caa877");
  for (const s of [-1,1]) for (const end of [-1,1]) {
    g.tube([s*W*.432,end*D*.455,.006],[s*W*.328,end*D*.29,seat-.015],.016,.022,wood);
  }
  // A single bent rail rises from each side and bows around the back.
  const bow=Array.from({length:21},(_,i)=>{
    const a=Math.PI*i/20;
    return [-W*.47*Math.cos(a),D*(-.13+.585*Math.sin(a)),seat+(H-seat)*(.44+.515*Math.sin(a))];
  });
  for(let j=1;j<bow.length;j++) g.tube(bow[j-1],bow[j],.019,.019,wood);
  for(const s of [-1,1]) {
    g.tube([s*W*.33,D*.22,seat-.020],[s*W*.386,D*.19,seat+(H-seat)*.73],.016,.018,wood);
    g.tube([s*W*.38,-D*.29,seat-.014],[s*W*.47,-D*.13,seat+(H-seat)*.44],.016,.019,wood);
  }
}

// Bell shade, rolled rim and the lighter inner surface are separate surfaces.
export function addCafeBell(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T), r=Math.min(F.L,D)/2, H=z1-z0;
  const shell=[[1,.05],[1,.12],[.90,.17],[.66,.80],[.37,1.03],[.19,1.07],[.14,1.27]];
  for (const [scale,sgn,paint] of [[1,1,"#a58b5b"],[.955,-1,"#ecdfbf"]]) {
    g.surface(32,shell.length-1,(u,v)=>{
      const j=Math.round(v*(shell.length-1)), [radius,z]=shell[j], a=turn*u;
      const [rb,zb]=shell[Math.max(0,j-1)],[rt,zt]=shell[Math.min(j+1,shell.length-1)];
      return [[r*scale*radius*Math.cos(a),r*scale*radius*Math.sin(a),z*r],unit([sgn*Math.cos(a),sgn*Math.sin(a),sgn*(rb-rt)/(zt-zb)])];
    },paint,.17);
  }
  g.ellipsoid([0,0,r*.27],[r*.18,r*.18,r*.28],"#fff2cd");
  g.tube([0,0,r*1.24],[0,0,H],.007,.007,"#595650");
  disc(g,.046,0,H-.024,.024,"#595650");
}

// Oak vertical boards, brushed steel counter, recessed plinth and cabinet doors.
export function addCafeJoinery(M,F,D,z0,z1,T,style) {
  const g=displaySpace(M,F,D,z0,T), W=F.L, H=z1-z0;
  const wall=style==="cafeCupboard", front=D/2;
  const woods=["#997851","#9d7e57","#94744f","#a3825c","#8d704e"];
  g.box(-W/2,-front,W/2,front-.012,0,H,"#715c47");
  const n=Math.max(1,Math.round(W/(wall?.31:.21)));
  for (let i=0;i<n;i++) {
    const x=-W/2+W*i/n, next=x+W/n;
    g.box(x+.002,front-.014,next-.002,front,wall?.018:.075,H-.022,woods[(i*7+Math.floor(i/3))%woods.length]);
    if (wall && i%2===1) g.box(next-.046,front,next-.035,front+.01,.09,.165,"#5e5c51");
  }
  g.box(-W/2-.009,-front-.008,W/2+.009,front+.016,H-.025,H,wall?"#ad8f68":"#b8b9b3");
}

export function addCafePastryCase(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T), W=F.L, H=z1-z0, x=W/2, y=D/2;
  const pane=(a,b,c,d,n)=>M.glassy?.quad([a,b,c,d].map(g.point),g.normal(n),T("#e3ece9"));
  g.box(-x,-y,x,y,0,.045,"#6c6e69");
  for (const h of [.13,H*.56,H-.028]) {
    pane([-x,-y,h],[x,-y,h],[x,y,h],[-x,y,h],[0,0,1]);
    g.box(-x,y-.014,x,y,h-.008,h+.005,"#8d938b");
  }
  pane([-x,y,.041],[x,y,.041],[x,y,H],[-x,y,H],[0,1,0]);
  for (const end of [-x,x]) {
    pane([end,-y,.041],[end,y,.041],[end,y,H],[end,-y,H],[Math.sign(end),0,0]);
    for (const back of [-y,y]) g.tube([end,back,.041],[end,back,H],.008,.008,"#71776e");
  }
  for (const h of [.14,H*.56+.012]) for (let i=0;i<4;i++) {
    const px=(i-1.5)*W*.225;
    g.box(px-.092,-.105,px+.092,.105,h,h+.012,"#f0e8d6");
    g.ellipsoid([px,.008,h+.037],[.078,.064,.034],i%2?"#aa743b":"#d49b55",.012);
  }
}

export function addRibbedMat(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T), x=F.L/2, y=D/2, H=z1-z0;
  g.box(-x,-y,x,y,0,H*.65,"#585755");
  const n=Math.ceil(D/.024);
  for (let i=0;i<n;i++) {
    const a=-y+i*D/n;
    g.box(-x+.009,a+.004,x-.009,a+D/n-.003,H*.65,H,i%3?"#76736c":"#696862");
  }
}

// Parallel recessed channels run all the way to the oblique street threshold.
export function addVestibuleGrate(m,r,z0,z1,T) {
  const [a,b,c,d]=r, up=[0,0,1], blend=(p,q,f)=>p.map((n,i)=>n+(q[i]-n)*f);
  m.polygon([r],z0+.001,up,T("#484942"));
  const pitch=.031, width=Math.hypot(b[0]-a[0],b[1]-a[1]), count=Math.round(width/pitch);
  for(let j=0;j<count;j++) {
    const u=(j+.09)/count,v=(j+.57)/count;
    const slat=[blend(a,b,u),blend(a,b,v),blend(d,c,v),blend(d,c,u)];
    m.quad(slat.map(p=>[p,z1]),up,T("#989990"));
    m.quad([[slat[0],z0],[slat[0],z1],[slat[3],z1],[slat[3],z0]],[-1,0,0],T("#777a71"));
  }
}

// Saw cuts follow the structural grid across the public floor. Clip them against
// the slab itself, including the descending staircase and the edge of the void.
const panelCache = new WeakMap();
export function concretePanels(area) {
  const previous=panelCache.get(area);
  if (previous) return previous;
  const origin=toXY([139.6847582,35.6061555]), a=-6.63*Math.PI/180, cs=Math.cos(a), sn=Math.sin(a);
  const intoGrid=([x,y])=>[(x-origin[0])*cs+(y-origin[1])*sn,(y-origin[1])*cs-(x-origin[0])*sn];
  const toWorld=([x,y])=>[origin[0]+x*cs-y*sn,origin[1]+x*sn+y*cs];
  const points=area.flat(2).map(intoGrid);
  if (!points.length) return area;
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const x0=Math.min(...xs)-.2, x1=Math.max(...xs)+.2, y0=Math.min(...ys)-.2, y1=Math.max(...ys)+.2;
  const strips=[];
  const slot=(x,y,X,Y)=>strips.push([[[x,y],[X,y],[X,Y],[x,Y]].map(toWorld)]);
  for(let x=Math.ceil(x0/6.85)*6.85;x<x1;x+=6.85) slot(x-.006,y0,x+.006,y1);
  for(let y=Math.ceil(y0/3.43)*3.43;y<y1;y+=3.43) slot(x0,y-.006,x1,y+.006);
  const panels=strips.length ? polygonClipping.difference(area,...strips) : area;
  panelCache.set(area,panels);
  return panels;
}
