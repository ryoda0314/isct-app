import clip from "polygon-clipping";
import { pointInRing, toXY } from "./campus3dFeatures.js";

const profiles = new WeakMap();
const contains = (ring, p) => pointInRing(p[0], p[1], ring);
const mix = (a,b,t) => a + (b-a)*t;

// A long straight side can border several bays at different heights. Split it at
// their vertices so a bulkhead ends at a gallery or stair opening.
function ceilingSteps(patches, outer, inside, at, base) {
  const vertices = patches.flatMap(p => p.area.flatMap(poly => poly.flat()));
  const steps = [];
  for (const patch of patches) for (const poly of patch.area) for (const edge of poly) {
    for (let i=0;i<edge.length-1;i++) {
      const a=edge[i], b=edge[i+1], dx=b[0]-a[0], dy=b[1]-a[1], length=Math.hypot(dx,dy);
      if (length < .002) continue;
      const u=[dx/length,dy/length], n=[u[1],-u[0]], stops=[0,length];
      for (const p of vertices) {
        const x=p[0]-a[0], y=p[1]-a[1], s=x*u[0]+y*u[1];
        if (s>0 && s<length && Math.abs(x*n[0]+y*n[1])<.0001) stops.push(s);
      }
      stops.sort((a,b)=>a-b);
      const point = s => [a[0]+u[0]*s,a[1]+u[1]*s];
      for (let k=1;k<stops.length;k++) {
        let s=stops[k-1], t=stops[k];
        if (t-s<.002) continue;
        const mid=point((s+t)/2), beside=[mid[0]+n[0]*.008,mid[1]+n[1]*.008];
        const hasNeighbour=inside(beside);
        if (!hasNeighbour && contains(outer,beside)) continue;
        const lower=hasNeighbour ? at(beside) : base;
        const difference = p => patch.at(p)-lower.at(p);
        const h=difference(point(s)), j=difference(point(t));
        if (Math.max(h,j)<.012) continue;
        if (h*j<0) {
          const crossing=mix(s,t,h/(h-j));
          if (h<0) s=crossing;
          else t=crossing;
        }
        const p=point(s), q=point(t);
        steps.push({a:p,b:q,lo:[lower.at(p),lower.at(q)],hi:[patch.at(p),patch.at(q)],normal:[-n[0],-n[1],0]});
      }
    }
  }
  return steps;
}

// 階の床からの高さ。後に置いた区画を優先し、天井面・梁・照明・当たり判定で同じ面を使う。
export function ceilingProfile(f) {
  const c = f.ceiling;
  if (!c?.sections?.length) return null;
  if (profiles.has(f)) return profiles.get(f);
  const ring = f.coords.map(toXY);
  const holes = [...(f.holes || []).filter(h => h.ceil !== false), ...(c.holes || [])].map(h => h.coords.map(toXY));
  const solid = holes.length ? clip.difference([ring], ...holes.map(h => [h])) : [[ring]];
  const sections = c.sections.map(s => {
    const [a,b] = (s.slope || []).map(toXY);
    const dx = b ? b[0]-a[0] : 0, dy = b ? b[1]-a[1] : 0;
    const span2 = dx*dx+dy*dy;
    const k = span2 > .0001 && Number.isFinite(s.z2) ? (s.z2-s.z)/span2 : 0;
    const gx = dx*k, gy = dy*k, length = Math.hypot(gx,gy,1);
    return { ring:s.coords.map(toXY), finish:s.finish, at:k ? p => s.z + gx*(p[0]-a[0]) + gy*(p[1]-a[1]) : () => s.z,
      normal:[gx/length,gy/length,-1/length] };
  }).reverse();
  const base = { at:() => c.z, normal:[0,0,-1] };
  const at = (p, structural = false) => sections.find(s => !(structural && s.finish === "frosted") && contains(s.ring,p)) || base;
  let rest = solid;
  const patches = [];
  for (const s of sections) {
    const area = clip.intersection(rest,[s.ring]);
    if (area.length) { patches.push({ ...s, area }); rest = clip.difference(rest,[s.ring]); }
  }
  if (rest.length) patches.push({ ...base, area:rest });
  const inside = p => contains(ring,p) && !holes.some(h => contains(h,p));
  const profile = { patches, steps:ceilingSteps(patches,ring,inside,at,base), at, inside, base:c.z };
  profiles.set(f,profile);
  return profile;
}

export function ceilingMount(profile, item, ring) {
  if (!profile || item.mount !== "ceiling") return null;
  const center = ring.reduce((s,p) => [s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
  const plane = profile.at(center,true);
  return { plane, offset:p => plane.at(p)-profile.base };
}
