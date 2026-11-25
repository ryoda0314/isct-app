// Shared plan, pedestrian, and rendering geometry. Only attached survey vertices
// connect. The river bridges pass over the tracks and Sotobori-dori.
import { gates } from './data.js';
import { surveyedPaths, northBank, southBank, gardenFootprint } from './groundsSurvey.js';

const walk=(id,name,points,width=2.7,extra={})=>({id,name,kind:'walk',width,points,...extra});
function insertOn(pathId,p) {
  return surveyedPaths.find(p=>p.id==='osm-'+pathId).points.reduce((nearest,b,i,ps)=>{
    if(!i)return nearest;
    const a=ps[i-1],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
    const q=[+(a[0]+dx*t).toFixed(2),+(a[1]+dz*t).toFixed(2)],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
    return d<nearest.d?{d,point:q,edge:i,t}:nearest;
  },{d:Infinity});
}
// A gate may lie a couple of metres inside the point used by the street survey.
const additions=new Map();
const attach=(id,point)=>{
  const hit=insertOn(id,point);
  if(hit.t>0.0001&&hit.t<.9999) {
    if(!additions.has(id))additions.set(id,[]);
    additions.get(id).push(hit);
  }
  return hit.point;
};
const gate=id=>gates.find(g=>g.id===id).point;
const west=gate('west-gate'),hongo=gate('hongo-gate'),south=gate('south-gate'),hijiri=gate('hijiri-gate');
const gatePaths=[
  walk('west-approach','西門・8号館北前の通路',[attach(652157383,west),west,[-118,-69],[-112,-61]]),
  // The street-side entrance and the service lane behind No. 3 are on
  // opposite sides of a retaining wall, about 4.7 m apart vertically.
  walk('hongo-approach','本郷門前の通路',[attach(652157383,hongo),hongo]),
  walk('hijiri-approach','聖門前の通路',[attach(684893197,hijiri),hijiri,[94.6,108.8],[80.8,103.3],[67.8,97.8]]),
  walk('south-approach','南門前の通路',[attach(404519834,south),south,[39.8,135.2]]),
];
for(const [id,osm] of [['sotobori-1',652157383],['sotobori-2',666668688]]) {
  const g=gate(id);
  const p=attach(osm,g);
  if(Math.hypot(g[0]-p[0],g[1]-p[1])>.08)gatePaths.push(walk(id+'-apron','外堀門前の歩道',[p,g]));
}
const approachRoads=[
  walk('east-court','1号館・2号館前の通路',[[84.5,45.1],[92.3,50.9],[83.7,56.4],[80,61.6],[71.9,80.6],[66.1,94.8],[67.8,97.8]]),
  walk('no10-court','10号館前の通路',[[61.9,97.4],[54,117.5],[49.5,126],[39.8,135.2]]),
  walk('south-court','D棟南側の小路',[[39.8,135.2],[28.5,130.3],[17,128],[-1,120.5],[-15.6,114.5],[-20.4,111],[-28.7,107.9],[-39.7,103.3],[-40.4,101.6]],3.0),
  walk('d-court','D棟入口側の通路',[[9.7,60.9],[14.7,63.2],[18.3,58.4]]),
  walk('garden-loop','知と癒しの庭',[[-63.4,53.6],[-63.6,64.9],[-67.5,70.5],[-74,73],[-81.6,68.5],[-86.5,69.0],[-94,67.7],[-105,60],[-116,50],[-122.7,46.4],[-123.4,34.2],[-123.2,26.7],[-120.8,23.5],[-106.4,29.8],[-97,36.6],[-83.4,44],[-72.1,49.7]],2.75,{deck:'garden'}),
  walk('garden-petal-view','梅の花壇の前',[[-81.6,68.5],[-84.35,66.9]],2.1,{deck:'garden'}),
];
// The bridge-side survey polylines meet at the zebra and again on the river
// sidewalk. At eye level the granite end posts occupy part of that corridor.
// Follow the paving around each plinth and keep the crossing node shared.
const downstreamCrossing=[-58.53,133.4],upstreamCrossing=[-76.3,125.63];
function bridgeSidewalk(path){
  const p=path.points;
  switch(path.id){
    case 'osm-170335362':return {...path,points:[...p.slice(0,3),[-59.16,134.79],downstreamCrossing,
      [-57.08,130.57],[-55.77,129.41],[-54.53,129.81],[-53.86,131.14],p.at(-1)]};
    case 'osm-341185252':return {...path,points:[[-106.91,196.37],p[1],upstreamCrossing,[-75.33,122.85],
      [-75.41,121.00],[-76.46,120.43],[-77.64,120.68],p.at(-1)]};
    case 'osm-375670604':return {...path,points:[upstreamCrossing,p[1],downstreamCrossing]};
    default:return path;
  }
}
// Carriageways between the kerbs. The four-lane Sotobori-dori opens out at
// the hospital crossing, then narrows around the bend by the west gate.
// Dimensions estimated against the GSI orthophoto and surveyed sidewalk axes.
const pavementWidths={
  'osm-1021407861':16.8,'osm-427171555':15.8,
  'osm-33626801':14.6,'osm-34951755':14.6,
  'osm-666668683':10.2,'osm-666668686':8.2,
};
function streetWidths(path){
  if(path.id==='osm-33627771'){
    const {points}=path;
    return [{...path,width:17.4,points:points.slice(0,4)},
      {...path,id:path.id+'-bend',width:15.4,points:points.slice(3,7)},
      {...path,id:path.id+'-west',width:13.4,points:points.slice(6)}];
  }
  return [pavementWidths[path.id]?{...path,width:pavementWidths[path.id]}:path];
}
export const paths=[...surveyedPaths.map(bridgeSidewalk).flatMap(streetWidths).map(p=>{
  const changes=additions.get(Number(p.id.slice(4)));
  if(!changes)return p;
  const points=p.points.flatMap((point,i)=>[...changes.filter(q=>q.edge===i).sort((a,b)=>a.t-b.t).map(q=>q.point),point]);
  return {...p,points};
}),...gatePaths,...approachRoads].map(p=>({...p,points:p.points.filter((value,i,ps)=>!i||Math.hypot(value[0]-ps[i-1][0],value[1]-ps[i-1][1])>.015)}))
  .filter(p=>p.points.length>1);
export const approaches={
  md:[-79.8,19.0],'med-a':[-36.2,35.6],'med-b':[12.6,-50.7],'med-c':[-40.0,102.3],
  'dental-n':[18.9,58], 'dental-s':[-1,120.5], b1w:[77,39.8], b1e:[92.3,50.9],
  b2:[52.9,19.3],b3:[-78.5,-77.5],b5:[4.9,-9.5],b6:[44,8.1],
  b7:[71.9,80.6],b8n:[-118,-69],b8s:[-120.7,-29.4],b10:[61.9,97.4],
};
export const landmarks=[
  ...gates.map(g=>({...g,kind:'gate',approach:g.point})),
  {id:'jr-ochanomizu',name:'JR御茶ノ水駅（御茶ノ水橋口）',kind:'station',point:[-75.8,198],approach:[-78.9,201.9],aliases:['JR','お茶の水駅','中央線','総武線']},
  {id:'metro-ochanomizu',name:'東京メトロ御茶ノ水駅（大学病院側）',kind:'station',point:[-22.4,116.6],approach:[-25,122.4],aliases:['丸ノ内線','丸の内線','地下鉄']},
  {id:'ochanomizu-bridge',name:'お茶の水橋',kind:'bridge',point:[-84,164],approach:[-76.1,174.9],aliases:['お茶の水橋','御茶ノ水橋','神田川']},
  {id:'hijiri-bridge',name:'聖橋',kind:'bridge',point:[92.5,212],approach:[83.7,210],aliases:['ひじりばし','神田川']},
  {id:'garden-sundial',name:'創立90周年記念の日時計',kind:'memorial',point:[-87,37.3],approach:[-83.4,44],aliases:['日時計','仁心仁術','中国校友','知と癒しの庭']},
  {id:'healing-garden',name:'知と癒しの庭',kind:'garden',point:[-88.35,54.5],approach:[-84.35,66.9],aliases:['屋上庭園','立体駐車場','梅の植栽']},
];
export const areas=[
  {id:'kanda',kind:'water',polygon:[...northBank,...[...southBank].reverse()]},
  {id:'healing-garden',kind:'garden',polygon:gardenFootprint},
];

