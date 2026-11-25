import CampusExplorer from "../campusMap/CampusExplorer.jsx";
import { createPlanMaps } from "../campusMap/PlanMap.jsx";
import { buildings } from "./data.js";
import { areas, paths } from "./groundsPaths.js";
import { hitsLandscape } from "./groundsLevels.js";
import { blocks, streets } from "./neighbourhoodData.js";
import { byId, campusBounds, defaultStart, exteriorView, network, overviewStops, places, searchPlaces } from "./places.js";

const pathData=ring=>"M"+ring.map(p=>p.join(" ")).join("L");
const contextPlan=<g aria-hidden="true">
  <path d={blocks.map(b=>pathData(b[3])+"Z").join("")} fill="#cdcfcb" stroke="#b7bcb7" strokeWidth=".45"/>
  <path d={streets.map(s=>pathData(s[2])).join("")} fill="none" stroke="#faf8f2" strokeWidth="4"/>
</g>;
const {PlanMap,WalkMinimap}=createPlanMaps({
  name:"湯島キャンパス",buildings,areas,paths,campusBounds,places,contextPlan,groundColor:"#e5e3d9",labelZoom:200,
  district:Object.fromEntries(buildings.map(b=>[b.district,/病院|医科|歯科/.test(b.district)?"#a0b5c2":"#b8b1a4"])),
});
const campus={
  name:"湯島キャンパス",mapTitle:"湯島キャンパス",places,byId,defaultStart,exteriorView,network,overviewStops,searchPlaces,
  PlanMap,WalkMinimap,loadScene:()=>import("./scene.js"),defaultView:byId.get("ochanomizu-bridge"),
  canPickGround:(x,z)=>!hitsLandscape(x,z,0),
  searchHint:"例：M&D、歯科、湯島門",credit:"PLATEAU・東京都・国土地理院",
  sourceNote:"建物の配置と高さは大学案内図・3D都市モデル・航空レーザー点群で照合し、外観写真を参考に立体化しました。資料に写らない壁面、窓の間隔、植栽の一部は推定です。",
  sources:[
    ["東京科学大学 湯島地区キャンパスマップ","https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yushima-and-surugadai"],
    ["東京科学大学 湯島の施設・外観","https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yushima-surugadai"],
    ["国土交通省 PLATEAU 文京区（2025年度）","https://www.geospatial.jp/ckan/dataset/plateau-13105-bunkyo-ku-2025"],
    ["東京都デジタルサービス局 区部点群データ（CC BY 4.0）を加工","https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000024"],
    ["国土地理院 標高タイル","https://maps.gsi.go.jp/development/ichiran.html#dem"],
  ],
};
export default function YushimaMap() {return <CampusExplorer campus={campus}/>;}
