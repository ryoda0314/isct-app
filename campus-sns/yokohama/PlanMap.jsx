import { createPlanMaps } from "../campusMap/PlanMap.jsx";
import { buildings,areas,paths } from "./data.js";
import { campusBounds,places } from "./places.js";
export const { PlanMap, WalkMinimap }=createPlanMaps({name:"横浜キャンパス",buildings,areas,paths,campusBounds,places,
  district:{J:"#8ba6b0",H:"#c2a48b",S:"#adac9c",R:"#b1a796",G:"#b7ab98",B:"#b7a198"}});
