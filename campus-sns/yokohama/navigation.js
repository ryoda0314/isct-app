export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const interpolate = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];

export function inside(point, ring) {
  const [x,z] = point;
  let hit = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [ax,az]=ring[j], [bx,bz]=ring[i];
    if ((az>z)!==(bz>z) && x < (bx-ax)*(z-az)/(bz-az)+ax) hit=!hit;
  }
  return hit;
}

export function boundsOf(points) {
  const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...zs),bottom=Math.max(...zs);
  return {left,right,top,bottom,center:[(left+right)/2,(top+bottom)/2],width:right-left,depth:bottom-top};
}

function segmentProjection(p,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1];
  const t=Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz || 1)));
  const point=interpolate(a,b,t);
  return {point,t,gap:distance(p,point)};
}

// The graph joins shared survey vertices. A crossing on another level has no shared
// vertex. Insert the two approaches on their actual segments, including on the same edge.
export function walkingNetwork(paths) {
  const vertices=[], links=[], segments=[], indices=new Map();
  function index(point) {
    const key=point.join(",");
    if (!indices.has(key)) {
      indices.set(key,vertices.length); vertices.push(point); links.push([]);
    }
    return indices.get(key);
  }
  for (const path of paths) {
    if (path.walkable===false) continue;
    for (let i=1;i<path.points.length;i++) {
      const a=index(path.points[i-1]), b=index(path.points[i]);
      if (a===b) continue;
      const segment={a,b,path,length:distance(vertices[a],vertices[b])};
      segments.push(segment);
      links[a].push({to:b,segment}); links[b].push({to:a,segment});
    }
  }
  function project(p) {
    let best=null;
    for (const segment of segments) {
      const hit=segmentProjection(p,vertices[segment.a],vertices[segment.b]);
      if (!best || hit.gap<best.gap) best={...hit,segment};
    }
    return best;
  }
  function route(start,end,avoidSteps=false) {
    const first=project(start),last=project(end);
    if (!first || !last) return null;
    const allowed=s=>!avoidSteps || s.path.kind!=="stairs";
    const points=[...vertices,first.point,last.point], from=vertices.length, to=from+1;
    const extra=new Map();
    function attach(i,j,segment) {
      if (!extra.has(i)) extra.set(i,[]);
      extra.get(i).push({to:j,segment});
    }
    for (const [i,hit] of [[from,first],[to,last]]) {
      for (const j of [hit.segment.a,hit.segment.b]) {
        attach(i,j,hit.segment); attach(j,i,hit.segment);
      }
    }
    if (first.segment===last.segment) attach(from,to,first.segment);
    const cost=new Map([[from,0]]), previous=new Map(), queue=new Set([from]);
    while (queue.size) {
      let here=null;
      for (const i of queue) if (here===null || cost.get(i)<cost.get(here)) here=i;
      queue.delete(here);
      if (here===to) break;
      for (const edge of [...(links[here]||[]),...(extra.get(here)||[])]) {
        const length=distance(points[here],points[edge.to]);
        if (length>0.001 && !allowed(edge.segment)) continue;
        const sum=cost.get(here)+length;
        if (sum >= (cost.get(edge.to)??Infinity)) continue;
        cost.set(edge.to,sum); previous.set(edge.to,{i:here,path:edge.segment.path}); queue.add(edge.to);
      }
    }
    if (!cost.has(to)) return null;
    const steps=[];
    for (let i=to;i!==from;) {
      const prev=previous.get(i), a=points[prev.i], b=points[i];
      if (distance(a,b)>0.01) steps.push({a,b,kind:prev.path.kind});
      i=prev.i;
    }
    steps.reverse();
    return {points:[first.point,...steps.map(s=>s.b)],steps,length:cost.get(to),hasStairs:steps.some(s=>s.kind==="stairs")};
  }
  return {project,route};
}

export function routeDirections(route) {
  const groups=[];
  let previous=null;
  for (const step of route.steps) {
    const bearing=Math.atan2(step.b[0]-step.a[0],step.a[1]-step.b[1]);
    const turn=previous==null ? 0 : Math.atan2(Math.sin(bearing-previous),Math.cos(bearing-previous));
    let action=null;
    if (!groups.length || step.kind!==groups.at(-1).kind || Math.abs(turn)>0.82) {
      action=step.kind==="stairs" ? "階段を進む" : step.kind==="tunnel" ? "トンネルを通る" :
        turn>0.82 ? "右に曲がる" : turn< -0.82 ? "左に曲がる" : "道なりに進む";
      groups.push({action,kind:step.kind,length:0});
    }
    groups.at(-1).length+=distance(step.a,step.b);
    previous=bearing;
  }
  return groups;
}
