import { unit } from "./campus3dMarketGeometry.js";
import { tejimaRelief } from "./campus3dTejimaRelief.js";

// A frontal study sets the widths and heights. The oblique view sets the depth
// of the occiput, orbits, nose and chin. Sections run from under the chin to
// the crown. Positive depth is towards the face.
const sections = [
  // height, half-width, face, back, lateral centre
  [0, .3, 25.5, 25, .6], [2, 8.8, 36, 12, .6], [6, 19.6, 41.5, -3, .5],
  [12, 27.3, 42.7, -18, .3], [20, 33.5, 41, -29, .1], [31, 37.6, 40, -38, 0],
  [45, 41.6, 40.7, -47, -.3], [59, 46, 42.6, -51, -.8],
  [70, 47.4, 44, -54, -1], [82, 46.5, 42.5, -56, -1.3],
  [94, 47.6, 44, -56, -1.5], [105, 45.3, 43.3, -53, -2],
  [116, 40.5, 38, -48, -2.7], [125, 32, 30, -39, -3.6],
  [131, 18.4, 17.7, -25, -5.2], [134, 9.2, 9.0, -13, -6.9],
  [135.5, 4.2, 4.2, -5.7, -7.9], [136, .16, .13, -.15, -8]
];
const PI = Math.PI, turn = 8.5 * PI / 180, scale = .00274;
const clamp = t => Math.max(0, Math.min(1, t));
function smooth(t) { t = clamp(t); return t*t*(3-2*t); }
const sq = x => x*x;
const bell = (x, width) => Math.exp(-sq(x / width));
const bump = (x, h, cx, ch, w, r) => Math.exp(-sq((x-cx)/w) - sq((h-ch)/r));
const diff = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const horizonDirections = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const horizonSteps = [3,8,15];

// Cubic B-spline knots describe millimetre-scale changes of surface slope
// observed on the forehead, malar planes and chin from two study angles.
function measuredRelief(x,h) {
  if(x<=-48 || x>=48 || h<=0 || h>=132)return 0;
  const u=(x+48)/3, v=h/3, i=Math.floor(u), j=Math.floor(v);
  const weights=t=>[(1-t)**3/6,(4-6*t*t+3*t*t*t)/6,
    (1+3*t+3*t*t-3*t*t*t)/6,t*t*t/6];
  const wx=weights(u-i), wy=weights(v-j);
  let quarterMillimetres=0;
  for(let b=0;b<4;b++){
    const row=tejimaRelief[Math.max(0,Math.min(44,j+b-1))];
    for(let a=0;a<4;a++)quarterMillimetres+=wx[a]*wy[b]*row[Math.max(0,Math.min(32,i+a-1))];
  }
  return quarterMillimetres*.00025/scale;
}

// Cubic interpolation with flat tangents at local extrema keeps the jaw and
// crown smooth without overshooting the measured silhouette.
function section(h) {
  let i = 0;
  while (i < sections.length-2 && h > sections[i+1][0]) i++;
  const a = sections[i], b = sections[i+1], p = sections[Math.max(0,i-1)];
  const q = sections[Math.min(sections.length-1,i+2)], span = b[0]-a[0];
  const t = clamp((h-a[0])/span), u = 1-t;
  function value(k) {
    const left = a[k]-p[k], mid = b[k]-a[k], right = q[k]-b[k];
    const m = i && left*mid <= 0 ? 0 : (b[k]-p[k])/(b[0]-p[0]);
    const n = i+2 < sections.length && mid*right <= 0 ? 0 : (q[k]-a[k])/(q[0]-a[0]);
    return u*u*(1+2*t)*a[k] + t*t*(3-2*t)*b[k] + span*t*u*(u*m-t*n);
  }
  return [value(1),value(2),value(3),value(4)];
}

function point(x, depth, h) {
  // The sitter's face turns slightly to his left. The horizontal sections of
  // the face follow the upward sightline from the foot of the pedestal.
  const d = depth*Math.cos(turn)-x*Math.sin(turn);
  return [
    scale*(1.035*x*Math.cos(turn)+depth*Math.sin(turn)),
    .145-scale*d,
    1.735+scale*((h-136)/.957-.292*Math.max(0,depth)+.021*x*smooth((136-h)/8))
  ];
}

// For each eye the lid margins, folded skin and exposed sliver of the globe
// are evaluated on the same surface as the temple. The outer corner descends
// and the upper lid covers the top of the iris.
function orbit(a,h,right) {
  const u=(a-8.2)/26;
  if(u<=0 || u>=1)return [0,0];
  const arch=Math.sin(PI*u), taper=smooth(arch/.53);
  const line=76.15+.5*arch-2.5*u+(right?.85:-.6);
  const low=line-2.7*arch, high=line+6.4*arch;
  const upper=h-high, lower=h-low;
  const iris=Math.hypot((a-20.7)/4.45,(h-line-2.45)/4.9);
  const aperture=smooth((upper-.35)/-1.75)*smooth((lower+.35)/1.5);
  let d=2.4*bell(upper-1.25,1.9) + 2.0*bell(upper-4,3.7)
    - 1.55*bell(upper-5.8,1.35)*arch + 1.55*bell(lower+.6,1.35)
    + 1.72*bell(lower+2.3+3.1*arch-.75*u,2.6)
    - .96*bell(lower+4.5+3.9*arch-.75*u,1.75);
  d+=aperture*(1.35*bell(a-20.5,10)-.85*bell(iris-.95,.18)-2.65*bell(iris,.56));
  const tone=aperture*(-.16-.32*bell(iris,.96)-.28*bell(iris,.54))
    -.16*bell(upper+.4,.95) -.07*bell(upper-5.8,1.45) + .09*bell(upper-1.9,1.15)
    +.08*bell(lower+.8,1.35)-.085*bell(lower+4.5+3.9*arch-.75*u,1.5);
  return [taper*d,taper*tone];
}

function toolMarks(x,h) {
  const a=Math.abs(x), wave=Math.sin;
  const cheek=bump(a,h,30,46,12,20), chin=bump(x,h,0,14,15,12);
  const cheekCuts=wave(1.38*x+.37*h+.009*sq(h-55))+.55*wave(.87*x+.41*h+1.6);
  return .20*cheek*cheekCuts + .23*chin*(wave(1.30*x+.16*h)+.6*wave(.76*x-.39*h));
}

function features(x, h) {
  const a = Math.abs(x), asym = x > 0 ? .65 : -.65;
  const arch = 93.1 + 3.7*bell(a-21,10) - .15*(a-22) + asym;
  let d = 3*bump(x,h,-1,108,28,15);
  d += 1.9*bump(a,h,22,105,13,10) - 3.6*bump(a,h,39,88,8,15);
  d += 5.7*bell(a-22,14)*bell(h-arch,4.5);
  const brow=bell(a-21,12)*bell(h-arch+.9,2.75);
  d+=brow*(2.15+.50*Math.sin(2.13*a-.73*h+.35*Math.sin(.81*a)));
  d-=1.65*bell(a-20,12)*bell(h-arch+4.2,1.7);
  d -= 5.6*bump(a,h,21,84+asym,14,7.9);
  d -= 3*bump(a,h,11.2,77,3.6,6.6);
  d += 2.5*bump(x,h,0,92,6.7,10);
  d -= 1.5*bell(a-4.4-.12*(h-97),1.35)*bell(h-96,9);
  d += 6.3*bump(a,h,33,62,10.7,9.2) + 3.4*bump(a,h,20,65,9,6);
  d -= 5.7*bell(a-(32+.13*(h-47)),7.5)*bell(h-44,17);
  d -= 2.0*bell(a-35-.18*(h-50),2.2)*bell(h-45,15);
  const fold = 15.3 + .41*(52-h);
  d -= 1.9*bell(a-fold,2.15)*bell(h-40,14);
  d += 2.7*bell(a-fold-3.4,3.9)*bell(h-42,14);
  d -= 1.25*bell(h-67+.23*(a-29),1.65)*bell(a-23,8.4);
  d -= .97*bell(h-75-.36*(a-32),1.12)*bell(a-34,5.8);
  d -= .83*bell(h-72+.21*(a-33),1.04)*bell(a-35,6.0);
  if(h>61 && h<101)d+=orbit(a,h,x>0)[0];
  // Nasal bones, bulb, separate alae, columella and the scooped underside.
  d += 12.4*bump(x,h,-.3,75,5.4,19) + 6*bump(x,h,-.3,66,7.8,17);
  d += 16.4*bump(x,h,.4,56.2,9.8,6.7) + 12.6*bump(a,h,10.5,53.3,5.0,5.2);
  d += 3.8*bump(x,h,.5,57,7.9,5.2) + 3.2*bump(a,h,12.2,53.4,4.4,4.5)
    - 1.9*bump(a,h,7.8,56.1,1.85,3.45);
  d += 4.5*bump(x,h,0,49.6,2.6,4.1);
  d -= 8.6*bump(a,h,7.2,50.4,2.8,1.8) + 3.6*bump(a,h,14,52,1.8,4);
  // Upper maxilla, philtrum, downturned mouth, lower lip and cleft chin.
  d += 2.9*bump(x,h,0,39,20,10) + 1.8*bump(a,h,3.2,45,2,4.4);
  const mouth = 34.6-9.4*Math.pow(Math.min(1,a/22),1.8);
  d -= 2.6*bell(a,18)*bell(h-mouth,1.7);
  d += 3.3*bell(a,10.7)*bell(h-mouth+3.5,3.4);
  d += 2.5*bump(a,h,4.5,26.5,4,3.0)-.85*bump(x,h,.1,25,2.1,2.9);
  d -= 3.1*bump(x,h,0,21.6,10.8,3.4) + 2.7*bump(a,h,20.5,25,2.8,7);
  d += 5.1*bump(x,h,.6,12.3,17,7.7) + 1.4*bump(a,h,5.1,11.5,4,4.2);
  d -= 1.0*bump(x,h,-.3,11.1,2.2,4.5);
  return d+toolMarks(x,h)+measuredRelief(x,h);
}

function skullDepth(x, h, row = section(h)) {
  const [w, front, back, cx] = row, s = Math.max(-1,Math.min(1,(x-cx)/w));
  const c = Math.sqrt(Math.max(0,1-s*s));
  return (front+back)/2 + (front-back)/2*c + features(x,h)*smooth(c/.57);
}

const metal = "portraitBronze:#a5a6a7";
// One indexed patch with shared normals across its interior and periodic seam.
// Tone describes local tarnish or wear on the casting, independent of lighting.
function patch(m, nu, nv, sample, flip = false, wrap = false, occlude = false) {
  const start = m.v.length/10, stride = nu+1;
  const grid = Array.from({length:nv+1}, (_,j) =>
    Array.from({length:stride}, (_,i) => sample(i/nu,j/nv)));
  for (let j=0; j<=nv; j++) {
    const row = grid[j], low = grid[Math.max(0,j-1)], high = grid[Math.min(nv,j+1)];
    for (let i=0; i<=nu; i++) {
      const l = row[i ? i-1 : wrap ? nu-1 : 0].p;
      const r = row[i<nu ? i+1 : wrap ? 1 : nu].p;
      const n = unit(cross(flip ? diff(l,r) : diff(r,l),diff(high[i].p,low[i].p)));
      const {p} = row[i];
      let tone=row[i].tone;
      if(occlude) {
        // A projecting brow or alar rim occludes part of the sky. Estimate
        // that solid angle from the neighbouring surface in sculpture space.
        let shadow=0;
        for(const [di,dj] of horizonDirections) {
          let horizon=0;
          for(const step of horizonSteps) {
            const col=(i+di*step+nu)%nu, y=Math.max(0,Math.min(nv,j+dj*step));
            const q=grid[y][col].p, dx=q[0]-p[0], dy=q[1]-p[1], dz=q[2]-p[2];
            horizon=Math.max(horizon,(dx*n[0]+dy*n[1]+dz*n[2])/(Math.hypot(dx,dy,dz)||1));
          }
          shadow+=horizon*horizon;
        }
        tone*=1-.95*shadow/8;
      }
      const k = m.vertex(p,n,metal)*10;
      for (let c=6; c<9; c++) m.v[k+c] *= tone;
      if (i && j) {
        const e=start+j*stride+i, a=e-stride-1;
        if (flip) m.i.push(a,e,a+1,a,e-1,e);
        else m.i.push(a,a+1,e,a,e,e-1);
      }
    }
  }
}

function skinTone(x,h) {
  const a=Math.abs(x), arch=93.1+3.7*bell(a-21,10)-.15*(a-22);
  const brow = bell(a-21,12.8)*bell(h-arch+1.7,3.25);
  const nose = bump(a,h,7.2,50.4,3,2.1);
  const mouth = 34.6-9.4*Math.pow(Math.min(1,a/22),1.8);
  const lids=h>61 && h<101?orbit(a,h,x>0)[1]:0;
  return .91 + lids -.34*brow - .17*bump(a,h,21,84,14,7) - .33*nose
    -.25*bump(x,h,0,51.3,13.2,3.25) -.32*bump(x,h,.4,24.9,9.1,4.1)
    - .14*bell(a,17)*bell(h-mouth,1.6) - .09*bump(x,h,0,21,12,3)
    + .055*bump(x,h,-2,59,7,14) + .04*bump(a,h,31,64,9,8) + .055*toolMarks(x,h);
}

function cranium(m) {
  const sides = m.detail ? 160 : 92, levels = m.detail ? 158 : 89;
  const rows = Array.from({length:levels+1}, (_,j) => section(136*j/levels));
  patch(m,sides,levels,(u,v) => {
    const h=v*136, [w,f,b,cx] = rows[Math.round(v*levels)];
    const angle=(u-.5)*2*PI, a=angle-.54*Math.sin(angle);
    const c=Math.cos(a), s=Math.sin(a), x=cx+w*s;
    const facing=smooth(c/.57);
    let depth=(f+b)/2+(f-b)/2*c;
    if(c>0) depth+=features(x,h)*facing;
    // Swept hair recedes at the temples, returns behind each ear, and crosses
    // the crown obliquely. Its flutes change the side and rear silhouettes.
    const hairline=39+85/(1+Math.exp((Math.abs(a)-1.13)*4.1)) + 3*Math.sin(a*2.2+.3);
    const hair=smooth((h-hairline)/11), crown=smooth((136-h)/4.5);
    const flow=a*29+.27*h+.0017*sq(h-85)*Math.sin(.9*a+.65)+2.4*Math.sin(a*2.4+.035*h);
    const ridges=.46*Math.sin(flow)+.30*Math.sin(1.83*flow+.3)+.24*Math.sin(a*41+h*.17);
    const temple=Math.abs(a)-(1.53-.0090*(h-60)-.000060*sq(h-85))-.06*Math.sin(.093*h+a);
    const swept=bell(temple,.20)*bell(h-90,29);
    const locks=swept*(1.4+.93*Math.sin(35*temple+.068*h)+.38*Math.sin(67*temple));
    const lift=crown*(hair*(.64+.82*ridges)+locks);
    const tone=.89+(skinTone(x,h)-.89)*facing+hair*(.023+.065*ridges)-.095*swept+.037*locks;
    return {p:point(x+s*lift,depth+c*lift,h),tone};
  },false,true,true);
  for (const h of [0,136]) {
    const [w,f,b,cx]=section(h);
    const ring=Array.from({length:sides},(_,i)=>{
      const a=2*PI*i/sides;
      return point(cx+w*Math.sin(a),(f+b)/2+(f-b)/2*Math.cos(a),h);
    });
    m.face(ring,metal,[0,0,h ? 1 : -1]);
  }
}

function nostril(m,s) {
  // The inner wall turns under the rolled edge of each ala. The aperture
  // widens towards the outside and stays shadowed when seen from below.
  patch(m,m.detail?40:26,12,(u,v)=>{
    const a=2*PI*u, r=.003+.997*v, bx=r*Math.cos(a), bz=r*Math.sin(a);
    const x=s*(8.15+5.1*bx);
    const h=50.75+2.35*bz*(1+.20*bx)+.64*bx;
    const upper=smooth((Math.sin(a)+.25+.32*Math.cos(a))/.95);
    const rim=bell(r-.71,.20)*smooth((1-r)/.22)*upper;
    const overhang=rim*1.55;
    const d=skullDepth(x,h)+.26+overhang-.65*smooth((r-.82)/.18);
    const tone=skinTone(x,h)*(.55+.45*smooth((r-.18)/.62))+.025*rim;
    return {p:point(x,d,h-.37*rim),tone};
  },s>0,true);
}

function moustache(m,s) {
  patch(m,m.detail?48:28,16,(u,v)=>{
    const arch=Math.sin(PI*u), x=s*(.04+23.4*(u+.12*arch));
    const upper=44.7+1.7*bell(u-.21,.24)-20.5*u*u+(s>0?-.7:.35)*u;
    const width=(8.5+1.6*arch)*(1-Math.pow(u,3.4))+.35;
    const h=upper-width*(1-v);
    // Slip the underside back into the lip to expose a distinct lower edge
    // from a low viewing angle. The two wings lift separately at the centre.
    const envelope=(.36+.64*smooth(u/.15))*smooth((1-u)/.21);
    const sweep=2*PI*(u*9.4+(v-.5)*(1.45-1.04*u)+.28*Math.sin(u*7+.8*v));
    const roll=Math.sin(PI*Math.pow(v,.62));
    const relief=envelope*(5.5*roll+.38*Math.sin(sweep)*roll)-.35;
    const tone=.83-envelope*(.10+.18*(1-v)-.063*Math.sin(sweep)*roll);
    return {p:point(x,skullDepth(x,h)+relief,h),tone};
  },s<0);
}

function ear(m,s) {
  // Pinna tilted outward and forward. Its bowl, bifurcating antihelix and
  // rolled outer rim are cut into the front and connect to a convex back.
  const sample=(u,v,back)=>{
    const a=2*PI*u, r=.002+.998*v, vx=r*Math.cos(a), vz=r*Math.sin(a);
    const lateral=vx*(6.6+1.7*vz)+1.5*vz, h=41.5+16.6*vz+(s>0?.6:0);
    const rim=3.4*bell(r-.80,.145), bowl=2.75*bump(vx,vz,-.13,.02,.46,.52);
    const fork=.88+.22*Math.tanh((vz-.12)*7);
    const inner=1.7*bell(vx-.03-.36*vz,.16)*bell(vz,.62)
      +1.15*bell(vx+.03+.50*vz,.14)*bell(vz-.38,.35);
    const tragus=2.55*bump(vx,vz,-.56,-.22,.23,.23);
    const swell=back ? -3.7*Math.sqrt(1-r*r) : (1-r*r)*1.6+(rim+inner*fork+tragus-bowl)*smooth((1-r)/.13);
    const [width,,,cx]=section(h);
    const x=cx+s*(width-.55+.52*lateral+.85*swell);
    const d=-7.2-.85*lateral+.52*swell;
    return {p:point(x,d,h),tone:back?.84:.88+.033*rim-.075*bowl};
  };
  for(const back of [false,true])
    patch(m,m.detail?48:28,m.detail?14:9,(u,v)=>sample(u,v,back),back ? s<0 : s>0,true);
}

export function tejimaPortrait(m) {
  cranium(m);
  for(const s of [-1,1]) {
    nostril(m,s);
    moustache(m,s);
    ear(m,s);
  }
}
