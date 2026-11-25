import CampusExplorer from "../campusMap/CampusExplorer.jsx";
import { PlanMap, WalkMinimap } from "./PlanMap.jsx";
import { byId, defaultStart, exteriorView, network, overviewStops, places, searchPlaces } from "./places.js";
import { buildingNotes } from "./buildingsSurvey.js";

const campus = {
  name:"横浜キャンパス", places, byId, defaultStart, exteriorView, network, overviewStops, searchPlaces,
  PlanMap, WalkMinimap, loadScene:()=>import("./scene.js"), defaultView:byId.get("H1"), buildingNotes,
  searchHint:"例：J2、図書館、すずかけ門", credit:"地理院標高タイル",
  sources:[
    ["東京科学大学 横浜キャンパス案内図","https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yokohama"],
    ["大学の建物別アクセシビリティマップ","https://www.ssc.titech.ac.jp/amap/home/suzukakedai/"],
    ["国土交通省 PLATEAU 横浜市（2024年度）","https://www.geospatial.jp/ckan/dataset/plateau-14100-yokohama-shi-2024"],
    ["国土地理院 標高タイル","https://maps.gsi.go.jp/development/ichiran.html"],
  ],
};
export default function YokohamaMap() { return <CampusExplorer campus={campus}/>; }
