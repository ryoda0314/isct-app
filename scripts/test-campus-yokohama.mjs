import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildings,paths,areas,landmarks } from "../campus-sns/yokohama/data.js";
import { places,network,defaultStart,searchPlaces,exteriorView } from "../campus-sns/yokohama/places.js";
import { distance,inside,interpolate,walkingNetwork } from "../campus-sns/yokohama/navigation.js";
import { createYokohamaBuildings } from "../campus-sns/yokohama/buildings.js";
import { createLandscape,hitsLandscape,walkingSurfaceAt } from "../campus-sns/yokohama/landscape.js";
import { groundAt } from "../campus-sns/yokohama/terrain.js";
import { walkBlocked } from "../campus-sns/yokohama/scene.js";
import { at, edges } from "../campus-sns/yokohama/buildingsGeometry.js";

test("図書館の正面玄関までスロープで歩けて、植え込みとピロティの柱を通り抜けない",()=>{
  const library=places.find(p=>p.id==="S3"),edge=edges(library.footprint)[2];
  const toe=paths.find(p=>p.id==="S3-library-ramp").points[0];
  const route=network.route(toe,library.approach,true);
  assert.ok(route&&!route.hasStairs&&route.length>40);
  assert.equal(network.project(library.approach).segment.path.id,"S3-library-ramp");
  assert.equal(walkBlocked(...library.approach),false);
  assert.ok(walkingSurfaceAt(...at(edge,50,1.5))>groundAt(...at(edge,50,1.5))+.5);
  assert.equal(walkBlocked(...at(edge,50,3.75)),true);
  assert.equal(walkBlocked(...at(edge,93,-4)),false);
  assert.equal(walkBlocked(...at(edge,edge.length-.43,-.38)),true);
});

test("施設名・全角棟番号から、屋外通路につながる各地区の施設を選べる",()=>{
  assert.equal(searchPlaces("Ｓ３")[0].id,"S3");
  assert.equal(searchPlaces("図書館")[0].id,"S3");
  assert.equal(searchPlaces("J2")[0].id,"J2-J3");
  assert.equal(searchPlaces("面発光レーザー")[0].id,"photonics-memorial");
  assert.ok(searchPlaces("","R地区").every(p=>p.district==="R"));
  assert.equal(new Set(places.map(p=>p.id)).size,places.length);
  for(const p of places) {
    const forward=network.route(defaultStart.approach,p.approach);
    const back=network.route(p.approach,defaultStart.approach);
    assert.ok(forward && back,p.name);
    assert.ok(Math.abs(forward.length-back.length)<.01,p.name);
    assert.ok(network.project(p.approach).gap<1,p.name);
  }
});

test("同じ線分の途中からの経路、階段回避、立体交差、車道の通行制限",()=>{
  const n=walkingNetwork([
    {kind:"walk",points:[[0,0],[10,0],[10,10]]},
    {kind:"stairs",points:[[0,0],[10,10]]},
    {kind:"walk",bridge:true,points:[[5,-10],[5,10]]},
    {kind:"road",walkable:false,points:[[0,0],[5,-10]]},
  ]);
  assert.equal(n.route([2,0],[7,0]).length,5);
  assert.equal(n.route([0,0],[10,10]).hasStairs,true);
  assert.equal(n.route([0,0],[10,10],true).length,20);
  assert.equal(n.route([0,0],[5,-10]),null);
  const hall=places.find(p=>p.id==="H1"), g2=places.find(p=>p.id==="G2");
  const regular=network.route(defaultStart.approach,hall.approach);
  const detour=network.route(defaultStart.approach,hall.approach,true);
  assert.ok(regular.hasStairs && detour && !detour.hasStairs && detour.length>regular.length);
  assert.equal(network.route(defaultStart.approach,g2.approach,true),null);
});

test("実データで有限な3D形状を生成し、主要棟前で地面から歩ける",async context=>{
  const landscape=createLandscape(THREE,{buildings,paths,areas,landmarks});
  const architecture=createYokohamaBuildings(buildings,groundAt);
  const mainDoor=network.project(buildings.find(b=>b.id==="J2-J3").approach);
  const parkingDoor=paths.find(p=>p.id==="J-parking-side-entrance").points.at(-1);
  assert.equal(mainDoor.segment.path.id,"J-hall-side-entrance");
  assert.ok(walkingSurfaceAt(...parkingDoor)>walkingSurfaceAt(...mainDoor.point)+3);
  assert.ok(walkingSurfaceAt(...parkingDoor)>groundAt(...parkingDoor)+8);
  assert.equal(walkBlocked(...parkingDoor),false);
  assert.equal(walkBlocked(90,-196),true,"水面に踏み出せない");
  let meshes=0;
  for(const root of [landscape,architecture]) root.traverse(obj=>{
    if(!obj.isMesh)return;
    meshes++;
    obj.geometry.computeBoundingBox();
    const b=obj.geometry.boundingBox;
    assert.ok(Number.isFinite(b.min.x+b.min.y+b.min.z+b.max.x+b.max.y+b.max.z),obj.name);
  });
  assert.ok(meshes>buildings.length);
  // Check the triangles actually sent to WebGL, including the outer edge of
  // narrow branches. A continuous height function alone cannot catch a hole.
  landscape.updateMatrixWorld(true);
  const paving=landscape.getObjectByName("Yokohama · road surfaces"), groundMeshes=[];
  landscape.traverse(obj=>{if(obj.isMesh&&obj.name.startsWith("GSI DEM5A"))groundMeshes.push(obj);});
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  for(const [x,z] of [
    [-59.97,-119.51],[-54.94,-130.19], // H2 hillside, including its low shoulder
    [84.2,-244],[111.1,18.9],           // library junction and southern bend
    [-41.422,-276.558],[-42.209,-138.765], // outer edges of shallow forks
  ]) {
    ray.ray.origin.set(x,100,z);
    const road=ray.intersectObject(paving,true)[0],earth=ray.intersectObjects(groundMeshes,false)[0];
    assert.ok(road&&earth,`舗装または地面が途切れている (${x}, ${z})`);
    assert.ok(earth.point.y<road.point.y,`舗装の上に土が出ている (${x}, ${z})`);
    assert.ok(Math.abs(road.point.y-walkingSurfaceAt(x,z))<.02,`舗装と歩行高さがずれている (${x}, ${z})`);
  }
  await context.test("中央広場の歩行面が踊り場・小階段・上段の石畳・脇の芝生に一致する",()=>{
    const terrace=landscape.getObjectByName("Central terrace · treads and landing");
    const plaza=landscape.getObjectByName("H1 · plaza paving");
    assert.ok(terrace&&plaza,"段床と広場の舗装を生成する");
    const tiers=[[15.8,-130.7],[13.81833,-132.66821],[4.718,-129.168],[7.72,-136.87]];
    // Cross both stair aisles and several seating arcs, including their outer ends.
    for(const angle of [1.45,1.88,2.72,3.47,3.78]){
      for(let row=0;row<7;row++)for(const part of [.26,.76]){
        const r=5.15+(row+part)*(12.20-5.15)/7;
        tiers.push([15.8+r*Math.cos(angle),-130.7+r*Math.sin(angle)]);
      }
    }
    function hit(surface){return ray.intersectObject(surface,true)[0];}
    const deckLevel=walkingSurfaceAt(15.8,-130.7);
    for(const a of [3.93,4.08,4.25,4.42,4.63,4.9]){
      const x=15.8+5.17*Math.cos(a),z=-130.7+5.17*Math.sin(a);
      ray.ray.origin.set(x,100,z);
      const bank=ray.intersectObjects(groundMeshes,false)[0];
      assert.ok(bank&&Math.abs(bank.point.y-deckLevel)<.05,"踊り場の開放側に段差ができている");
    }
    for(const [x,z] of tiers){
      ray.ray.origin.set(x,100,z);
      const tread=hit(terrace),ground=ray.intersectObjects(groundMeshes,false)[0];
      assert.ok(tread,`段床に穴がある (${x}, ${z})`);
      assert.ok(!hit(plaza),`石畳が段床内へ入っている (${x}, ${z})`);
      assert.ok(!ground||ground.point.y<tread.point.y,`芝が段床を突き抜ける (${x}, ${z})`);
      assert.ok(Math.abs(tread.point.y-walkingSurfaceAt(x,z))<.025,`表示された段と歩行面がずれている (${x}, ${z})`);
    }
    // The university's view from the landing shows grass beside the seats.
    for(const [x,z] of [
      [13.52,-135.47],[11.82,-134.37],[12.08,-135.23],[14.10,-137.60],[9.51833,-135.56821],
      [-.08167,-129.66821],[4.01833,-133.86821], // upper path shoulder and edge of the stair mouth
    ]){
      ray.ray.origin.set(x,100,z);
      const grass=ray.intersectObjects(groundMeshes,false)[0];
      assert.ok(grass&&!hit(plaza)&&!hit(terrace),`段床横の芝生に穴または石畳がある (${x}, ${z})`);
      assert.ok(grass.face.normal.y>.70,`芝の斜面が垂直に折れている (${x}, ${z})`);
      assert.ok(Math.abs(grass.point.y-walkingSurfaceAt(x,z))<.025,`芝の歩行面と地表がずれている (${x}, ${z})`);
    }
    // Follow the upper paved square from the top of the aisle towards H1.
    for(const [x,z] of [[3.00,-136.30],[5.50,-139.50],[8.20,-142.30],[11.30,-145.00]]){
      ray.ray.origin.set(x,100,z);
      const paver=hit(plaza),ground=ray.intersectObjects(groundMeshes,false)[0];
      assert.ok(paver,`広場の舗装に穴がある (${x}, ${z})`);
      assert.ok(!ground||ground.point.y<paver.point.y,`芝が広場の舗装に出ている (${x}, ${z})`);
      assert.ok(Math.abs(paver.face.normal.y)>.80,`石畳が壁のように立ち上がっている (${x}, ${z})`);
      assert.ok(Math.abs(paver.point.y-walkingSurfaceAt(x,z))<.025,`広場の歩行面が石畳から外れている (${x}, ${z})`);
    }
  });
  const tunnel=paths.find(p=>p.id==="osm-698427430");
  for(const p of tunnel.points) assert.equal(walkBlocked(...p),false,"G4棟下を通過できる");
  assert.equal(walkBlocked(-17,-146),true,"大学会館の壁を通過しない");
  // The real walkway joins a bridge part-way along its span. These samples also
  // cover the portal aprons, where the raw hillside DEM sits above the tunnel floor.
  for(const path of paths.filter(p=>p.walkable!==false)) {
    let previous=walkingSurfaceAt(...path.points[0]),previousGrade=null;
    for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i],length=distance(a,b);
      if(length===0)continue;
      const samples=Math.ceil(length/.20),run=length/samples;
      for(let j=1;j<=samples;j++) {
        const point=interpolate(a,b,j/samples),height=walkingSurfaceAt(...point);
        assert.ok(!walkBlocked(...point),path.id+" walkway intersects an obstacle");
        assert.ok(Math.abs(height-previous)<.7,path.id+" exceeds the walking step height");
        // Compare rise/run on successive 20 cm intervals, including both sides of a bend.
        // A steady incline is fine. A change of ten percentage points marks a sharp kink.
        if(path.kind!=="stairs"){
          const grade=(height-previous)/run;
          if(previousGrade!==null){
            const change=Math.abs(grade-previousGrade);
            assert.ok(change<=.10,
              `${path.id} (${point.map(n=>n.toFixed(2)).join(", ")}) 勾配差 ${(change*100).toFixed(2)} ポイント`);
          }
          previousGrade=grade;
        }
        previous=height;
      }
    }
  }
  for(const p of places.filter(p=>p.featured && p.footprint)) {
    const {start,pitch}=exteriorView(p);
    assert.ok(Number.isFinite(walkingSurfaceAt(...start)+pitch));
    assert.ok(!hitsLandscape(...start,.28),p.name);
    assert.ok(!buildings.some(b=>inside(start,b.footprint)),p.name);
  }
});
