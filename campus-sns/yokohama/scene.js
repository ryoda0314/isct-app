import { createYokohamaBuildings } from "./buildings.js";
import { createLandscape, hitsLandscape, inG4Passage, landscapedGroundAt, walkingSurfaceAt } from "./landscape.js";
import { groundAt } from "./terrain.js";
import { towerRecess } from "./towerGround.js";
import { inLibraryPilotis } from "./libraryGround.js";
import { createContext,hitsContext } from "./dataContext.js";
import { buildings, paths, areas, landmarks } from "./data.js";
import { boundsOf, inside } from "./navigation.js";

import { createCampusScene } from "../campusMap/scene.js";
const campus=boundsOf(buildings.flatMap(b=>b.footprint));
const floor=(x,z)=>walkingSurfaceAt(x,z);
const volume=buildings.map(b=>{
  const bounds=boundsOf(b.footprint);
  return {...b,...bounds,base:groundAt(...bounds.center)};
});
const inBuilding=(p,b)=>inside(p,b.footprint) && !b.holes?.some(h=>inside(p,h));

export function walkBlocked(x,z) {
  if (x<campus.left-170 || x>campus.right+170 || z<campus.top-170 || z>campus.bottom+170) return true;
  if (hitsLandscape(x,z,.28) || hitsContext(x,z)) return true;
  return volume.some(b=>x>=b.left-.3 && x<=b.right+.3 && z>=b.top-.3 && z<=b.bottom+.3 &&
    !(b.id==="G4" && inG4Passage(x,z,.28)) && !(b.id==="S3" && inLibraryPilotis(x,z,.28)) &&
    !(b.id==="J2-J3" && towerRecess(x,z)) &&
    [[x,z],[x-.27,z],[x+.27,z],[x,z-.27],[x,z+.27]].some(p=>inBuilding(p,b)));
}
export function createScene(host, callbacks) {
  return createCampusScene(host, callbacks, {name:"横浜キャンパス",campus,volume,paths,groundAt,floor,walkBlocked,stepResponse:.085,
    createModels(THREE) {
      const architecture=createYokohamaBuildings(buildings,groundAt);
      architecture.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
      const landscape=createLandscape(THREE,{buildings,paths,areas,landmarks,places:landmarks});
      return [createContext(THREE,groundAt,landscapedGroundAt),landscape,architecture];
    }
  });
}
