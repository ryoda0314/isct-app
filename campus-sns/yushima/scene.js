import { createCampusScene } from "../campusMap/scene.js";
import { buildingSightlines } from "../campusMap/buildingSightlines.js";
import { boundsOf, inside } from "../yokohama/navigation.js";
import { buildings, groundHeight, bounds } from "./data.js";
import { createYushimaBuildings, prepareYushimaReflections } from "./buildings.js";
import { paths, createGrounds, walkingSurfaceAt, hitsLandscape } from "./grounds.js";
import { createNeighbourhood, hitsNeighbourhood } from "./neighbourhood.js";
import { roadTerrainHeight } from "./groundsLevels.js";

const campus=boundsOf(buildings.flatMap(b=>b.footprint));
const pedestrianBounds=boundsOf(paths.filter(p=>p.walkable!==false).flatMap(p=>p.points));
const volume=buildings.map(b=>{
  const extents=boundsOf(b.footprint);
  return {...b,...extents,base:groundHeight(...extents.center)};
});

export function walkBlocked(x,z) {
  if(x<Math.min(bounds.minX,pedestrianBounds.left-2)||z<Math.min(bounds.minZ,pedestrianBounds.top-2)||
     x>Math.max(bounds.maxX,pedestrianBounds.right+2)||z>Math.max(bounds.maxZ,pedestrianBounds.bottom+2)||
     hitsLandscape(x,z,.25)||hitsNeighbourhood(x,z))return true;
  return volume.some(b=>x>b.left-.25&&x<b.right+.25&&z>b.top-.25&&z<b.bottom+.25&&
    [[x,z],[x-.25,z],[x+.25,z],[x,z-.25],[x,z+.25]].some(p=>inside(p,b.footprint)&&!b.holes?.some(r=>inside(p,r))));
}
export function createScene(host,callbacks) {
  return createCampusScene(host,callbacks,{
    name:"湯島キャンパス",campus,volume,paths,groundAt:groundHeight,floor:walkingSurfaceAt,walkBlocked,stepResponse:.085,
    overviewX:-.31,overviewY:.92,overviewGroundPoints:[[-90,180],[94,214]],sunlight:[170,620,340],detailShadows:true,
    // The upper south elevation and landing deck can be seen together from
    // across the river. The entrance direction points into the adjacent tower.
    facilityViews:{'med-a':{direction:[-.70,.40,1],points:[
      [-41.1,43,21.4],[13.2,43,45.4],[-41.1,81.1,21.4],[13.2,81.1,45.4],[-20,88.2,10],
    ]}},
    prepareReflections:prepareYushimaReflections,buildingSightlines,
    createModels(T) {
      const buildings3D=createYushimaBuildings(buildings,groundHeight);
      buildings3D.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      return [createGrounds(T),createNeighbourhood(T,groundHeight,paths,roadTerrainHeight),buildings3D];
    }
  });
}
