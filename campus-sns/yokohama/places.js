import { areas, buildings, landmarks, paths } from "./data.js";
import { boundsOf, distance, inside, interpolate, walkingNetwork } from "./navigation.js";

export const network=walkingNetwork(paths);
export const places=[
  ...buildings.filter(b=>b.name && !b.auxiliary).map(b=>({...b,point:boundsOf(b.footprint).center})),
  ...landmarks,
].map(p=>({...p,group:p.district ? p.district+"地区" : "門・屋外施設",
  arrival:({"J2-J3":"J2・J3棟のホール側2階正面玄関",S3:"すずかけ台図書館の正面玄関","central-terrace":"中央広場の円形段床の上段"})[p.id],
  featured:["J2-J3","H1","S3","G3","suzukake-gate","nagatsuta-gate"].includes(p.id),
  mapLabel:({H1:"すずかけホール",S3:"図書館","J2-J3":"J2・J3"})[p.id] || (p.district?p.id:p.name),
}));
export const byId=new Map(places.map(p=>[p.id,p]));
export const campusBounds=boundsOf([...buildings.flatMap(b=>b.footprint),...landmarks.map(p=>p.point)]);
export const defaultStart=byId.get("suzukake-gate") || places.find(p=>p.kind==="gate") || places[0];
export const overviewStops=["H1","J2-J3","S3"].map(id=>byId.get(id)).filter(Boolean);
const norm=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[\s・ー−‐‑–—-]/g,"");
export function searchPlaces(query,group) {
  const q=norm(query);
  return places.filter(p=>(!group || p.group===group) && (!q || [p.name,p.id,p.group,...(p.aliases||[])].some(s=>norm(s).includes(q))))
    .sort((a,b)=>Number(norm(b.id)===q)-Number(norm(a.id)===q)||Number(b.featured)-Number(a.featured));
}

// Pick a position along a surveyed path far enough back to see the facade. Reject
// sightlines through another building, even when its path is close on the plan.
export function exteriorView(place) {
  // The entire timber landing is walkable. From its pond-side edge the visitor
  // sees the stair aisle, the planted bank and the round glass front of H1.
  if(place?.id==="central-terrace")return {start:[17.039,-134.861],toward:[-2.249,-140.148],pitch:-.15237,framingFov:62.56};
  // Approaches which show a distinctive elevation, entrance sign or tunnel mouth.
  // Each eye point is projected onto the same surveyed path used by the navigator.
  const viewpoints={
    "J2-J3":[[-106,40],[-53,2],.51],
    S3:[[76.93,-238.29],[88.7,-250.7],.20],
    // East lawn path: lower cafeteria glass at left, bank at right, J towers behind.
    H1:[[3.9,-170.54],[-13.1,-146],.15,58],
    "suzukakedai-station":[[-255.7,-446.2],[-238,-439],.065],
    "suzukake-gate":[[-273,-320],[-263,-311],.04],
    "nagatsuta-gate":[[6,-427],[3.3,-416.4],.02],
    "okabe-gate":[[160,-187.5],[148,-187.3],0],
    "G-tunnel":[[-6.6,-45.5],[7,-34],0],
    "suzukake-pond":[[42,-204],[88,-191],-.15],
  };
  const view=viewpoints[place?.id];
  if(view)return {start:network.project(view[0]).point,toward:view[1],pitch:view[2],framingFov:view[3]};
  if(place?.kind==="memorial") {
    const gap=distance(place.approach,place.point),width=network.project(place.approach).segment.path.width;
    return {start:interpolate(place.approach,place.point,Math.min(.52,(width*.5-.3)/gap)),toward:place.point,pitch:-.21};
  }
  if(!place?.footprint) {
    const start=place?.approach||defaultStart.approach, toward=place?.point||start;
    return {start,toward:distance(start,toward)>2?toward:[start[0]+12,start[1]+5],pitch:0};
  }
  const target=place.point, entry=place.approach, rect=boundsOf(place.footprint);
  const viewingDistance=Math.max(18,Math.min(94,place.height*1.35),Math.min(rect.width,rect.depth)*.65);
  const normal=[entry[0]-target[0],entry[1]-target[1]], radius=Math.hypot(...normal)||1;
  const wanted=[entry[0]+normal[0]/radius*viewingDistance,entry[1]+normal[1]/radius*viewingDistance];
  const candidates=[];
  for(const path of paths.filter(p=>p.walkable!==false && p.kind!=="tunnel")) {
    for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i],n=Math.max(1,Math.ceil(distance(a,b)/6));
      for(let j=0;j<n;j++) {
        const p=interpolate(a,b,j/n);
        const d=distance(p,wanted);
        if(d<viewingDistance+45 && !inside(p,place.footprint)) candidates.push({p,d});
      }
    }
  }
  function unobstructed(p) {
    for(let n=0;n<12;n++) {
      const q=interpolate(p,target,n/12);
      if(buildings.some(b=>b.id!==place.id && inside(q,b.footprint)))return false;
      if(areas.some(a=>a.kind==="water" && n===0 && inside(q,a.polygon)))return false;
    }
    return true;
  }
  const start=candidates.sort((a,b)=>a.d-b.d).find(c=>unobstructed(c.p))?.p || entry;
  return {start,toward:target,pitch:Math.atan2(place.height*.4-1.65,Math.max(5,distance(start,target)))};
}
