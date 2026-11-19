// 本館講義棟 B1。長手 s は南端から北向き、d は教室のガラス面から中庭向きの距離 (m)。
// IMG_1381 の 01:27–02:52、03:59–04:16。写真を投影せず、実際の開口と柱の位置で組む。
import { clipHalf, toXY } from "./campus3dFeatures.js";

const up = [0, 0, 1], down = [0, 0, -1];
const blend = (a, b, t) => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t).concat(.5);
const noise = (i, j) => { const v = Math.sin(i * 73.13 + j * 91.71) * 43758.55; return v - Math.floor(v); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = a => { const length = Math.hypot(...a) || 1; return a.map(x => x / length); };

function galleryAxes(f) {
  const ring = f.coords.map(toXY), west = f.lectureArcade.side === "west";
  const origin = ring[west ? 1 : 0], far = ring[west ? 2 : 3], outer = ring[west ? 0 : 1];
  const along = unit(sub(far, origin)), outward = west ? [-along[1], along[0]] : [along[1], -along[0]];
  const xy = (s, d) => [origin[0] + along[0] * s + outward[0] * d, origin[1] + along[1] * s + outward[1] * d];
  return { along, outward, xy, sd: p => [dot(sub(p, origin), along), dot(sub(p, origin), outward)],
    length: Math.hypot(...sub(far, origin)), width: dot(sub(outer, origin), outward) };
}

export function lecturePostFootprints(f) {
  const axes = galleryAxes(f);
  return (f.members || []).filter(m => m.kind === "weatheredI").map(m => {
    const [s,d] = axes.sd(toXY(m.coords[0])), h = m.size / 2;
    return { ring:[axes.xy(s-h,d-h),axes.xy(s+h,d-h),axes.xy(s+h,d+h),axes.xy(s-h,d+h)], zs:m.zs };
  });
}

// 外面と内面は同じ型枠割りを共有する。打継ぎと丸いセパ穴は開口の縁で途切れる。
function castFace(m, P, normal, profile, d, top, colors) {
  const { cement, recess } = colors;
  const face = (poly, tint, depth = d, weather = false) => {
    for (let i = 1; i < poly.length - 1; i++) for (const k of [0, i, i + 1]) {
      const [s,h] = poly[k], [p,z] = P(s,depth,h);
      const damp = weather ? Math.max(0,1-h/.75)*(.17+.19*noise(Math.floor(s*3),2)) +
        Math.max(0,1-(top-h)/.9)*(.06+.22*noise(Math.floor(s*2),7)) : 0;
      m.vert(p, z, normal, damp ? blend(tint,recess,damp) : tint);
    }
  };
  const direction = d > colors.mid ? 1 : -1;
  const cell = .91, course = 1.82;
  for (let i = 1; i < profile.length; i++) {
    const [s0, z0] = profile[i - 1], [s1, z1] = profile[i];
    if (s1 <= s0 + .0001) continue;
    const lo = s => z0 + (z1 - z0) * (s - s0) / (s1 - s0);
    face([[s0,z0],[s1,z1],[s1,top],[s0,top]], recess, d - direction * .004);
    for (let col = Math.floor(s0 / cell); col * cell < s1; col++) {
      const a = Math.max(s0, col * cell + .005), b = Math.min(s1, (col + 1) * cell - .005);
      if (b <= a) continue;
      for (let row = Math.max(0, Math.floor(Math.min(z0, z1) / course)); row * course < top; row++) {
        const low = row * course + .005, high = Math.min(top, (row + 1) * course - .005);
        const panel = clipHalf([[a,low],[b,low],[b,high],[a,high]], q => q[1] - lo(q[0]));
        const tone = noise(col, row);
        if (panel.length >= 3) face(panel, blend(cement, recess, tone * .21),d,true);
      }
    }
    // 型枠 1 枚につき 2 列。面よりわずかに奥の芯と片側の明るい面取り。
    const pitch = cell / 2;
    for (let col = Math.ceil(s0 / pitch - .5); (col + .5) * pitch < s1; col++) {
      const s = (col + .5) * pitch;
      for (let z = .33; z < top - .06; z += .91) {
        if (z < lo(s) + .14) continue;
        const ring = r => Array.from({length:8}, (_,j) => [s + r * Math.cos(j*Math.PI/4), z + r * Math.sin(j*Math.PI/4)]);
        face(ring(.024), blend(cement, recess, .62), d + direction * .0025);
        face(ring(.014), colors.plug, d + direction * .004);
      }
    }
  }
}

function castPalette(look) {
  const cement=blend(look.glazed,look.graniteDark,.15), dark=blend(look.dark,look.graniteDark,.27);
  return {cement, recess:blend(cement,dark,.34), plug:blend(cement,dark,.59), lip:blend(cement,look.member,.17)};
}

// Rectangular panels on the transverse passage use the same ties and shuttering as the curved piers.
// Their first edge follows the wall and their normal points into the passage.
export function addLectureFormwork(m, panel, g0, look) {
  const [A,B] = panel.coords.slice(0,2).map(toXY), axis=unit(sub(B,A)), length=Math.hypot(...sub(B,A));
  const n=[axis[1],-axis[0],0], offset=panel.thickness/2+.006;
  const P = (s,d,h) => [[A[0]+axis[0]*s+n[0]*d,A[1]+axis[1]*s+n[1]*d],g0+h];
  castFace(m,P,n,[[0,panel.zs[0]],[length,panel.zs[1]]],offset,panel.zs[2],{...castPalette(look),mid:0});
}

function castArch(m, axes, P, f, p, palette) {
  const pts = p.coords.map(q => axes.sd(toXY(q)));
  const mid = pts.reduce((v,q) => v + q[1], 0) / pts.length;
  const inner = mid - p.thickness / 2, outer = mid + p.thickness / 2;
  const profile = pts.slice(1,-1).map(([s],i) => [s,p.zs[i+1]]);
  if (profile.at(-1)[0] < profile[0][0]) profile.reverse();
  const paletteIn = { ...palette, mid, cement:blend(palette.cement, palette.recess, .26) };
  const N = [...axes.outward, 0], back = N.map(v => -v);
  castFace(m, P, N, profile, outer + .016, f.height, { ...palette, mid });
  castFace(m, P, back, profile, inner - .012, f.base, paletteIn);

  const bottom = Math.min(...profile.map(([,h]) => h));
  const left = (a,b) => unit([a[1]-b[1], b[0]-a[0]]);
  const edge = profile.map((p,i) => {
    const a = i ? left(profile[i-1],p) : left(p,profile[i+1]);
    const b = i+1 < profile.length ? left(p,profile[i+1]) : a;
    // アーチの縁取りは、地面から浮いた垂れ壁の下面で水平に納める。
    if (p[1] === bottom) {
      const jamb = profile[i-1]?.[1] > bottom ? a : b;
      return [p[0] + jamb[0] * .105, bottom];
    }
    const n = unit([a[0]+b[0], a[1]+b[1]]);
    const k = .105 / Math.max(.55,dot(n,b));
    return [p[0]+n[0]*k, p[1]+n[1]*k];
  });
  for (let i=1;i<profile.length;i++) {
    const [s,z]=profile[i-1], [t,h]=profile[i];
    if (Math.hypot(t-s,h-z)<.003) continue;
    if (z === bottom && h === bottom) {
      m.quad([P(s,inner-.012,z),P(t,inner-.012,z),P(t,outer+.016,z),P(s,outer+.016,z)],down,palette.recess);
      for (const j of [i-1,i]) {
        const a=profile[j][0], b=edge[j][0];
        if (Math.abs(a-b)>.001) m.quad([P(a,outer+.016,z),P(b,outer+.016,z),P(b,outer+.047,z),P(a,outer+.047,z)],down,palette.recess);
      }
      continue;
    }
    const n = left(profile[i-1],profile[i]);
    const soffitNormal = [-n[0]*axes.along[0],-n[0]*axes.along[1],-n[1]];
    m.quad([P(s,inner-.012,z),P(t,inner-.012,h),P(t,outer+.047,h),P(s,outer+.047,z)],soffitNormal,
      blend(palette.recess,palette.cement,.46 + .23*Math.abs(n[0])));
    const [a,b]=edge[i-1], [c,e]=edge[i];
    m.quad([P(s,outer+.047,z),P(t,outer+.047,h),P(c,outer+.047,e),P(a,outer+.047,b)],N,palette.lip);
    m.quad([P(a,outer+.047,b),P(c,outer+.047,e),P(c,outer+.016,e),P(a,outer+.016,b)],soffitNormal.map(v=>-v),palette.recess);
  }
  // 列の両端では垂れ壁の小口も見える。連続するアーチの継ぎ目は開いたままつなぐ。
  for (const [point,sign] of [[profile[0],-1],[profile.at(-1),1]]) {
    const [s,z]=point;
    if (z !== bottom || Math.min(Math.abs(s),Math.abs(axes.length-s))>.04) continue;
    const normal=[sign*axes.along[0],sign*axes.along[1],0];
    m.quad([P(s,inner-.012,z),P(s,outer+.016,z),P(s,outer+.016,f.base),P(s,inner-.012,f.base)],normal,palette.cement);
  }
}

// H形鋼はフランジとウェブの三材。塗膜の欠けは外のフランジ面に限る。
function weatheredPost(m, P, box, axes, member, j, colors, random) {
  const [s,d] = axes.sd(toXY(member.coords[0])), h = member.size / 2;
  const [z0,z1] = member.zs, flange = .026;
  box(s-h,d-.012,s+h,d+.012,z0,z1,colors.web);
  box(s-h-.01,d-h-.01,s+h+.01,d+h+.01,z0,z0+.035,colors.web);
  for (const side of [-1,1]) {
    const at = s+side*h, inside = at-side*flange;
    box(Math.min(at,inside),d-h,Math.max(at,inside),d+h,z0,z1,colors.paint);
    const normal = [side*axes.along[0],side*axes.along[1],0];
    const chip=(y,z,radius,tall) => {
      const outline = Array.from({length:12},(_,i) => {
        const a=i*Math.PI/6, k=.35+.65*random();
        return P(at+side*.002, d+Math.max(-h+.002,Math.min(h-.002,y+radius*k*Math.cos(a))), z+tall*k*Math.sin(a));
      });
      const color=blend(colors.rust,colors.web,random()*.22);
      for (let i=1;i<outline.length-1;i++) for (const k of [0,i,i+1]) m.vert(...outline[k],normal,color);
    };
    const scale = .45 + .55 * noise(j,13);
    for (let i=0;i<4;i++) {
      const y=(random()-.5)*h*1.6, z=z0+.37+random()*(z1-z0-.74);
      chip(y,z,.07*scale,.22*scale);
      for(let k=0;k<8;k++) chip(y+(random()-.5)*.095,z+(random()-.5)*.42,.007+random()*.027,.015+random()*.065);
    }
    for (let i=0;i<20;i++) {
      const y = (random()-.5)*h*1.68, z = z0+.14+random()*(z1-z0-.31);
      chip(y,z,.006+.026*random()*scale,.008+.064*random()*scale);
    }
  }
}

export function addLectureArcade(m, f, g0, look, random) {
  const axes = galleryAxes(f), {xy, width, length} = axes;
  if (width < .6 || length < 2) return;
  const P = (s,d,z) => [xy(s,d),g0+z];
  const rect = (s,d,t,e,z,n,c) => m.quad([P(s,d,z),P(t,d,z),P(t,e,z),P(s,e,z)],n,c);
  const box = (s,d,t,e,z,h,c) => m.prism([xy(s,d),xy(t,d)],[xy(s,e),xy(t,e)],[g0+z,g0+z],[g0+h,g0+h],
    {top:c,side:c,bottom:c},{bottom:true});
  const dark=blend(look.dark,look.graniteDark,.27), palette=castPalette(look);
  for (const p of f.panels || []) if (p.kind === "castArch") castArch(m, axes, P, f, p, palette);
  const postColors={paint:blend(look.member,look.glazed,.35), web:blend(look.glazed,look.graniteDark,.24), rust:blend(look.redBrick,look.graniteDark,.34)};
  let j=0;
  for (const mb of f.members || []) if (mb.kind === "weatheredI") weatheredPost(m,P,box,axes,mb,j++,postColors,random);

  const { entrances, side, floor, edge } = f.lectureArcade;
  const guided = side === "west", grate = blend(dark,look.grating,.30), steel = blend(look.frame,look.graniteDark,.42);
  // Square exhaust grilles alternate with access panels, and a second line of small downlights faces the arches.
  for (let s=1.45, i=0;s<length-.35;s+=2.02,i++) {
    if (i%3===0) {
      rect(s-.21,1.0,s+.21,1.42,f.base-.012,down,postColors.web);
      rect(s-.193,1.017,s+.193,1.403,f.base-.016,down,blend(look.soffitWhite,look.frame,.10));
    } else {
      rect(s-.146,1.05,s+.146,1.33,f.base-.018,down,steel);
      rect(s-.124,1.07,s+.124,1.31,f.base-.021,down,grate);
      for(let k=0;k<7;k++) rect(s-.11+k*.034,1.076,s-.098+k*.034,1.304,f.base-.025,down,steel);
    }
    if(i%2===0) {
      const disc=(r,z,c) => m.polygon([Array.from({length:12},(_,k)=>xy(s+r*Math.cos(k*Math.PI/6),width-.5+r*Math.sin(k*Math.PI/6)))],g0+z,down,c);
      disc(.073,f.base-.016,steel); disc(.052,f.base-.020,look.soffitWhite);
    }
    // Concrete joints stop at the outer edge and never cross the glass threshold.
    rect(s-.004,.12,s+.004,edge-.06,floor+.002,up,postColors.web);
  }
  // Heel-proof drain beside the glazing. Batches of small slots share a single continuous metal frame.
  const first = Math.max(0, Math.min(...entrances)-2), last = Math.min(length, Math.max(...entrances)+7);
  rect(first,.043,last,.15,floor+.006,up,steel);
  for(let s=first+.02;s<last-.045;s+=.068) rect(s,.05,s+.039,.143,floor+.009,up,grate);
  if (!guided) {
    for(const s of entrances) {
      box(s-.79,.15,s+.79,.88,floor+.002,floor+.012,dark);
      for(let k=0;k<23;k++) rect(s-.755+k*.067,.17,s-.739+k*.067,.86,floor+.014,up,grate);
    }
    return;
  }
  const gold = blend(look.tactile,look.glazed,.17);
  const ridge=blend(gold,look.member,.19), joint=blend(gold,look.graniteDark,.26);
  const lane=1.50, top=floor+.014;
  function tiles(start,end,fixed,across=false) {
    if(end<=start) return;
    const corners = (a,b,c,d,z,h,color) => across ? box(fixed+b,a,fixed+d,c,z,h,color) : box(a,fixed+b,c,fixed+d,z,h,color);
    corners(start,-.147,end,.147,floor+.002,top,joint);
    const count=Math.max(1,Math.round((end-start)/.3));
    for(let i=0;i<count;i++) {
      const a=start+(end-start)*i/count+.003, b=start+(end-start)*(i+1)/count-.003;
      corners(a,-.145,b,.145,top,top+.002,gold);
      for (const offset of [-.095,-.032,.032,.095]) corners(a+.012,offset-.012,b-.012,offset+.012,top+.002,top+.007,ridge);
    }
  }
  function stud(s,d) {
    box(s-.148,d-.148,s+.148,d+.148,floor+.002,top+.002,gold);
    for(let i=-2;i<=2;i++) for(let k=-2;k<=2;k++) {
      const a=s+i*.052,b=d+k*.052, corners=Array.from({length:6},(_,j)=>xy(a+.014*Math.cos(j*Math.PI/3),b+.014*Math.sin(j*Math.PI/3)));
      m.polygon([corners],g0+top+.007,up,ridge);
    }
  }
  let start=entrances[0]-.15;
  for (const s of entrances) {
    tiles(start,s-.15,lane); stud(s,lane);
    tiles(.45,lane-.15,s,true);
    for(const off of [-.30,0,.30]) stud(s+off,.30);
    start=s+.15;
  }
  tiles(start,length-.60,lane);
}
