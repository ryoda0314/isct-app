import { buildings, groundHeight } from "./data.js";
import { paths, landmarks, approaches } from "./groundsPaths.js";
import { walkingSurfaceAt } from "./groundsLevels.js";
import { boundsOf, distance, inside, interpolate, walkingNetwork } from "../yokohama/navigation.js";

export const network=walkingNetwork(paths);
const shortNames={md:"M&Dタワー","med-a":"病院 A棟","med-b":"病院 B棟","med-c":"病院 C棟",
  "dental-n":"D棟北","dental-s":"D棟南",b1w:"1号館西",b1e:"1号館東",b8n:"8号館北",b8s:"8号館南"};
const featured=new Set(["md","med-a","med-c","dental-n","b1w","healing-garden","ochanomizu-bridge"]);
// The ward centroids fall under the helipad and in the B-wing lightwell.
// Place their badges over the adjoining patient-room roofs.
const labelPoints={"med-a":[-28,22],"med-b":[-35,-44],"healing-garden":[-121,52]};
const descriptions={
  md:"地上26階の医歯学総合研究棟。3・4階に図書館、2階に鈴木章夫記念講堂があります。",
  "med-a":"神田川側から見える病棟です。屋上のヘリポートには大きなHの印があります。",
  "med-c":"御茶ノ水橋のたもとに建つ病院棟。川沿いの白い外壁には縦の格子が並びます。",
  "healing-garden":"第1駐車場の屋上にある庭園。梅の花の形に並ぶ植栽をデッキから眺められます。",
};
const extras={md:["M＆D","MD","エムアンドディー","図書館","鈴木章夫記念講堂","医歯学総合研究棟II期棟"],
  "med-a":["病院A棟","医学部附属病院","ヘリポート"],"med-c":["病院C棟","救命救急センター"],
  "dental-n":["歯学部附属病院","D棟","歯科外来"],"dental-s":["歯学部附属病院","D棟"]};
const university="https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yushima-surugadai";
function makePlace(p) {
  const point=p.point||boundsOf(p.footprint).center;
  const approach=network.project(approaches[p.id]||p.approach||point)?.point;
  const hospital=p.id.startsWith("med-")||p.id.startsWith("dental-");
  const group=p.footprint ? hospital?"病院":"教育・研究施設" : p.kind==="gate"?"門":p.kind==="memorial"?"記念碑":"駅・橋・庭園";
  return {...p,point,group,approach,labelPoint:labelPoints[p.id]||point,labelLift:["med-a","med-b"].includes(p.id)?0:3,mapLabel:shortNames[p.id]||p.mapLabel||p.name.split("【")[0],
    detail:descriptions[p.id]||p.detail,source:descriptions[p.id]?university:p.source,
    aliases:[...(p.aliases||[]),...(extras[p.id]||[])],featured:featured.has(p.id)};
}
export const places=[...buildings,...landmarks].map(makePlace);
export const byId=new Map(places.map(p=>[p.id,p]));
export const campusBounds=boundsOf(buildings.flatMap(b=>b.footprint));
export const defaultStart=byId.get("jr-ochanomizu");
export const overviewStops=["md","med-a","med-c","healing-garden"].map(id=>byId.get(id)).filter(Boolean);
const normal=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[\s・ー－\-【】()]/g,"");
export function searchPlaces(query,group) {
  const q=normal(query);
  const fields=p=>[p.name,p.mapLabel,p.id,...p.aliases].map(normal);
  return places.filter(p=>(!group||p.group===group)&&(!q||fields(p).some(v=>v.includes(q))))
    .sort((a,b)=>Number(fields(b).includes(q))-Number(fields(a).includes(q))||Number(b.featured)-Number(a.featured));
}
const obstacles=buildings.map(b=>({...b,...boundsOf(b.footprint)}));
function contains(b,p) {
  return p[0]>=b.left&&p[0]<=b.right&&p[1]>=b.top&&p[1]<=b.bottom&&inside(p,b.footprint)&&!b.holes?.some(r=>inside(p,r));
}
const stations=paths.filter(path=>path.walkable!==false).flatMap(path=>path.points.slice(1).flatMap((p,i)=>{
  const a=path.points[i],steps=Math.max(1,Math.ceil(distance(a,p)/5));
  return Array.from({length:steps},(_,j)=>interpolate(a,p,j/steps));
})).filter(p=>!obstacles.some(b=>contains(b,p)));

export function exteriorView(place) {
  const {point,approach,id}=place;
  if(id==="md") {
    const start=network.project([-105,60]).point;
    return {start,toward:point,pitch:.60,framingFov:77};
  }
  if(id==="b2")return {start:network.project([58.24,23.70]).point,toward:[46.48,27.72],pitch:.27,framingFov:67};
  if(id==="med-c")return {start:network.project([-65,153]).point,toward:[-40,99],pitch:.23,framingFov:49};
  if(!place.footprint) {
    if(place.view)return place.view;
    if(id==="healing-garden")return {start:approach,toward:point,pitch:-.070,framingFov:38,framingAspect:1.45};
    const tower=byId.get("md").point;
    const toward=(id==="ochanomizu-bridge"||id==="jr-ochanomizu")?[-44,12]:id==="hijiri-bridge"?[-40,37]:
      distance(point,approach)>4?point:tower;
    return {start:approach,toward,pitch:id==="ochanomizu-bridge"?.21:id==="healing-garden"?.02:.08};
  }
  // Prefer an outdoor view of the broad elevation and enough space to see
  // the roof. A sightline may go above a lower building but never through it.
  const targetY=groundHeight(...point)+place.height*.46,box=boundsOf(place.footprint);
  const radius=Math.max(24,place.height*.85,Math.max(box.width,box.depth)*.8);
  const preferred={md:[-87,56],"med-a":[-76,134],"med-c":[-38,140],"b1w":[96,-13]}[id]||approach;
  function score(p) {
    const eye=walkingSurfaceAt(...p)+1.65,d=distance(p,point);
    let cost=Math.abs(d-radius)+distance(p,preferred)*.58;
    for(let t=0;t<1;t+=.045) {
      const q=interpolate(p,point,t),y=eye+(targetY-eye)*t;
      if(obstacles.some(b=>b.id!==id && contains(b,q) && groundHeight(...b.center)+b.height>y)) {cost+=900;break;}
    }
    return cost;
  }
  let start=approach,best=Infinity;
  for(const p of stations) {
    const d=distance(p,point);
    if(d<9 || d>radius*2.2+35)continue;
    const cost=score(p);
    if(cost<best){start=p;best=cost;}
  }
  return {start,toward:point,pitch:Math.atan2(targetY-walkingSurfaceAt(...start)-1.65,Math.max(1,distance(start,point))),framingFov:74};
}
