import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildings, gates, groundHeight } from "../campus-sns/yushima/data.js";
import { areas, paths, createGrounds, walkingSurfaceAt } from "../campus-sns/yushima/grounds.js";
import { createYushimaBuildings } from "../campus-sns/yushima/buildings.js";
import { byId, defaultStart, exteriorView, network, places, searchPlaces } from "../campus-sns/yushima/places.js";
import { walkBlocked } from "../campus-sns/yushima/scene.js";
import { createNeighbourhood } from "../campus-sns/yushima/neighbourhood.js";
import { distance, interpolate } from "../campus-sns/yokohama/navigation.js";
import { bridgeLevel, bridgeSpecs, gardenLevel, pathSurface, pathVertex, roadTerrainHeight, stairFlight } from "../campus-sns/yushima/groundsLevels.js";
import { bridgeFrame } from "../campus-sns/yushima/bridgeDeck.js";

test("公式図の湯島地区1〜15、D棟の南北、門を独立した施設として選べる",()=>{
  assert.equal(buildings.length,16);
  assert.equal(gates.length,9);
  assert.equal(new Set(places.map(p=>p.id)).size,places.length);
  for(const [q,id] of [["Ｍ＆Ｄ","md"],["鈴木章夫","md"],["図書館","md"],["１号館西","b1w"],["病院Ｃ棟","med-c"],["屋上庭園","healing-garden"]]) {
    assert.equal(searchPlaces(q)[0]?.id,id,q);
  }
  assert.ok(searchPlaces("","病院").length>=5);
  assert.ok(areas.some(a=>a.kind==="water"));
});

test("駅・門・研究棟・橋の屋外ルートを往復でき、階段回避時の経路が通行条件を満たす",()=>{
  const station=defaultStart.approach;
  for(const p of places) {
    assert.ok(network.project(p.approach).gap<.1,p.name);
    const route=network.route(station,p.approach),back=network.route(p.approach,station);
    assert.ok(route&&back,p.name);
    assert.ok(Math.abs(route.length-back.length)<.01,p.name);
    const level=network.route(station,p.approach,true);
    if(level){assert.equal(level.hasStairs,false,p.name);assert.ok(level.length>=route.length-.02,p.name);}
  }
  const from=byId.get("sotobori-2").approach, to=byId.get("hijiri-bridge").approach;
  const regular=network.route(from,to), stepFree=network.route(from,to,true);
  assert.ok(regular.hasStairs && !stepFree.hasStairs && stepFree.length>regular.length+50);
});

test("写真素材のない全棟・街区・庭園を実際に組み立てる",()=>{
  const architecture=createYushimaBuildings(buildings,groundHeight);
  const allIds=new Set();
  architecture.traverse(o=>{if(o.userData.buildingId)allIds.add(o.userData.buildingId);});
  for(const b of buildings)assert.ok(allIds.has(b.id),b.id);
  const groups=[architecture,createGrounds(THREE),createNeighbourhood(THREE,groundHeight,paths)];
  for(const group of groups)group.traverse(o=>{
    if(!o.isMesh)return;
    const {geometry}=o;
    geometry.computeBoundingBox();
    const box=geometry.boundingBox;
    assert.ok([...box.min,...box.max].every(Number.isFinite),o.name);
    for(const mat of [].concat(o.material)) {
      for(const value of Object.values(mat)){
        if(value?.isTexture)assert.ok(!value.source?.data?.src,"Photographic image on "+o.name);
      }
    }
  });
  for(const b of buildings) {
    const view=exteriorView(byId.get(b.id));
    assert.equal(walkBlocked(...view.start),false,b.name+" exterior viewpoint");
    assert.ok(Number.isFinite(view.pitch+walkingSurfaceAt(...view.start)),b.name);
  }
  assert.equal(walkBlocked(-48,166),true,"神田川への落下を防止");
});

test("北門の路肩と市街道路の舗装が地形の折れ目を連続して覆う",()=>{
  const grounds=createGrounds(THREE),ground=grounds.getObjectByName("湯島のDEM地形");
  const road=createNeighbourhood(THREE,groundHeight,paths,roadTerrainHeight).getObjectByName("御茶ノ水周辺の道路");
  const probe=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  probe.set(new THREE.Vector3(-50,60,-104.7),down);
  const gate=probe.intersectObject(grounds.getObjectByName("湯島の車道と構内車路"))[0];
  const gateBase=probe.intersectObject(ground)[0];
  assert.ok(gate&&gateBase&&Math.abs(gate.point.y-gateBase.point.y-.155)<.005,"北門路肩の地面と舗装が同じ勾配をたどる");
  // DEM extrema sampled along five separate street ribbons. Previously up
  // to 1.98 m of measured ground projected through the centre and shoulders.
  for(const [x,z] of [[295.6,542.3],[160.3,371.9],[453.3,-84.9],[-156.4,-137.6],[130.3,280]]){
    probe.set(new THREE.Vector3(x,60,z),down);
    const base=probe.intersectObject(ground)[0],top=probe.intersectObject(road)[0];
    assert.ok(top&&base,`road and terrain at ${x}, ${z}`);
    const clearance=top.point.y-base.point.y;
    assert.ok(clearance>.015&&clearance<.10,`street clearance ${clearance} m at ${x}, ${z}`);
  }
});

test("経路の中心線から建物や塀に衝突せず、段差を越えられる",()=>{
  const failures=[];
  for(const path of paths.filter(p=>p.walkable!==false)) {
    let failure=null;
    for(let i=1;i<path.points.length&&!failure;i++) {
      const a=path.points[i-1],b=path.points[i],n=Math.ceil(distance(a,b)/.32);
      let prev=walkingSurfaceAt(...a);
      for(let j=0;j<=n;j++) {
        const p=interpolate(a,b,j/(n||1)),y=walkingSurfaceAt(...p);
        if(walkBlocked(...p)||Math.abs(y-prev)>=.7){
          failure=path.id+" "+p.map(v=>v.toFixed(2))+" / "+(walkBlocked(...p)?"obstruction":"step "+(y-prev).toFixed(2));break;
        }
        prev=y;
      }
    }
    if(failure)failures.push(failure);
  }
  assert.deepEqual(failures,[]);
});

test("外堀通りの車道・歩道・御茶ノ水門の車寄せが隙間なく接する",()=>{
  const group=createGrounds(THREE);
  const asphalt=group.getObjectByName("湯島の車道と構内車路"),walk=group.getObjectByName("湯島の歩道と前庭");
  const paint=group.getObjectByName("湯島の白線と横断歩道");
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  function pavingAt(p){
    ray.set(new THREE.Vector3(p[0],65,p[1]),down);
    return ray.intersectObjects([asphalt,walk]).map(hit=>hit.object);
  }
  for(const [a,b] of [
    [[-66.9,105.65],[-64.1,104.2]], // Flared gate mouth.
    [[-90.8,95.1],[-89.65,92.3]], // North sidewalk beside the four-lane approach.
    [[-49.7,131.6],[-50.8,134.0]], // River-side pavement.
  ]){
    for(let i=0;i<12;i++){
      const p=interpolate(a,b,(i+.29)/12),surfaces=new Set(pavingAt(p));
      assert.equal(surfaces.size,1,"street/sidewalk at "+p);
    }
  }
  const crossing=paths.find(p=>p.id==="osm-666668685"),samples=[];
  for(let i=0;i<16;i++){
    const p=interpolate(crossing.points[0],crossing.points.at(-1),.25+i*.028);
    assert.deepEqual(new Set(pavingAt(p)),new Set([asphalt]),"gate apron under the crossing");
    samples.push(ray.intersectObject(paint).length>0);
  }
  assert.ok(samples.includes(true)&&samples.includes(false),"alternating stripes across the gate");
});

test("歩行者橋からM&Dタワー正面の庇まで2階の床が連続する",()=>{
  const centerline=[[-76,20.76],[-79.9,19],[-82.4,20.23],[-86.92,23.56],[-96.12,19.96],[-108,14.62]];
  for(let i=1;i<centerline.length;i++) {
    const start=centerline[i-1],end=centerline[i],n=Math.ceil(distance(start,end)/.32);
    for(let j=0;j<=n;j++){
      const p=interpolate(start,end,j/n);
      assert.ok(Math.abs(walkingSurfaceAt(...p)-gardenLevel-.12)<.015,p.toString());
      assert.equal(walkBlocked(...p),false,p.toString());
    }
  }
  assert.ok(walkingSurfaceAt(-108,17.6)<gardenLevel-2,"庇の南側の構内通路は1階");
});

test("A棟の坂とD棟前の分岐を縦横20cm刻みでたどっても舗装と歩行床が連続する",()=>{
  const hospital=paths.filter(p=>["osm-668158851","d-court","osm-764607843"].includes(p.id));
  for(const p of hospital)for(let i=1;i<p.points.length;i++){
    const a=p.points[i-1],b=p.points[i],n=Math.ceil(distance(a,b)/.2);
    const across=Math.ceil(p.width/.2);
    let previousRow;
    for(let j=0;j<=n;j++){
      const row=[];
      for(let k=0;k<=across;k++){
        const [x,y,z]=pathVertex(p,a,b,j/n,(k/across-.5)*p.width,.03);
        row.push(y);
        assert.ok(Math.abs(walkingSurfaceAt(x,z)-y)<.02,p.id+" surface");
        if(k)assert.ok(Math.abs(y-row[k-1])<.085,p.id+" crossfall");
        if(previousRow)assert.ok(Math.abs(y-previousRow[k])<.085,p.id+" grade");
      }
      previousRow=row;
    }
  }
  assert.ok(walkingSurfaceAt(-18.6,48.1)-walkingSurfaceAt(9.7,60.9)>3.8,"A棟デッキ東側の坂");
  for(const p of hospital)assert.equal(pathSurface(p,13.4,55.8),roadTerrainHeight(13.4,55.8));
});

test("擁壁の上下にある3か所の道路を混同せず、大学の門・玄関のある側から歩いて回り込める",()=>{
  const terraces=[
    [[-49.1,-106.2],[-55.5,-106],4.7],
    [[-112,-61],[-105.2,-52],3.7],
    [[67.8,97.8],[61.9,97.4],4.1],
  ];
  for(const [upper,lower,rise] of terraces){
    assert.ok(Math.abs(walkingSurfaceAt(...upper)-walkingSurfaceAt(...lower)-rise)<.22);
    assert.ok(network.route(upper,lower)?.length>100);
  }
});

test("神田川の両橋では車道中央も橋面に乗り、聖橋北詰の階段には両端の踊り場がある",()=>{
  for(const [id,b] of Object.entries(bridgeSpecs)){
    const p=interpolate(b.start,b.end,.51),bed=bridgeLevel(id,...p);
    assert.ok(bed-roadTerrainHeight(...p)>5,id);
    assert.ok(Math.abs(walkingSurfaceAt(...p)-bed)<.015,id+" carriageway");
  }
  const steps=paths.find(p=>p.id==="osm-404519833"),flight=stairFlight(steps);
  const samples=Array.from({length:201},(_,i)=>walkingSurfaceAt(...interpolate(steps.points[0],steps.points.at(-1),i/200)));
  const increments=samples.slice(1).map((h,i)=>h-samples[i]);
  assert.ok(samples.at(-1)-samples[0]>5);
  assert.equal(samples[10],samples[0]);assert.equal(samples[190],samples.at(-1));
  assert.equal(increments.filter(d=>d>.01).length,flight.risers);
  assert.ok(increments.every(d=>d>=-1e-8&&d<.18));
});

test("屋上庭園の撮影位置から梅の花壇を望み、園路の切り込みと円形ベンチの外側を歩ける",()=>{
  const grounds=createGrounds(THREE),garden=byId.get("healing-garden"),view=exteriorView(garden);
  grounds.updateMatrixWorld(true);
  const lawn=grounds.getObjectByName("園路が切り込む梅花壇の芝地");
  const turfAt=([x,z])=>new THREE.Raycaster(new THREE.Vector3(x,gardenLevel+2,z),new THREE.Vector3(0,-1,0)).intersectObject(lawn).length>0;
  assert.ok(turfAt([-90,62]),"花壇の外周の芝");
  assert.equal(turfAt([-82,64]),false,"南側の切り込みは舗装");
  assert.deepEqual(view.toward,garden.point);
  assert.equal(walkBlocked(...view.start),false);
  assert.equal(turfAt(view.start),false);
  assert.ok(network.route(defaultStart.approach,view.start));
  assert.equal(walkBlocked(...garden.point),true);
  assert.equal(walkBlocked(-69.7,63.36),true,"円形ベンチ内側の花壇");
  assert.equal(walkBlocked(-69.7,68.8),false,"円形ベンチ外側の木製デッキ");
});

test("両橋の北詰から横断歩道と病院側の歩道へ、親柱と信号柱を避けて歩ける",()=>{
  const grounds=createGrounds(THREE);
  grounds.updateMatrixWorld(true);
  const paving=["湯島の歩道と前庭","湯島の車道と構内車路","Roads, footpaths and outdoor surfaces","Masonry paving blocks"]
    .map(name=>grounds.getObjectByName(name));
  const posts=grounds.getObjectByName("Outdoor · post");
  const probe=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),east=new THREE.Vector3(1,0,0);
  function floor(point){
    const [x,z]=point,y=walkingSurfaceAt(x,z);
    probe.set(new THREE.Vector3(x,y+.30,z),down);
    probe.far=.60;
    const hit=probe.intersectObjects(paving)[0];
    assert.ok(hit&&Math.abs(hit.point.y-y)<.035,
      `橋面と舗装の高さ ${x}, ${z} / ${hit?.object.name} / ${hit?.point.y-y}m`);
    return hit;
  }
  function hasPost([x,z]){
    probe.set(new THREE.Vector3(x-.45,walkingSurfaceAt(x,z)+1,z),east);
    probe.far=.9;
    return probe.intersectObject(posts).length>0;
  }
  const ocha=bridgeFrame(bridgeSpecs.ochanomizu),hijiri=bridgeFrame(bridgeSpecs.hijiri);
  for(const side of [-1,1]){
    const curb=ocha.half-(side<0?5.1:3.6);
    const levels=[-.18,.13,.42,.83,1.34].map(offset=>{
      const p=ocha.point(3.16,side*(curb+offset));
      assert.equal(walkBlocked(...p),false,"切り下げ部の通行");
      return floor(p).point.y-bridgeLevel("ochanomizu",...p);
    });
    assert.ok(levels[0]<.035&&levels[1]<.035&&levels[4]>.105);
    assert.ok(levels.slice(1).every((h,i)=>h-levels[i]<.07),"切り下げから歩道までの傾斜");
    const granite=ocha.point(2.28,side*(ocha.half-.14));
    assert.ok(walkBlocked(...granite)&&hasPost(granite),"花崗岩親柱の実体と衝突");
  }
  const points=id=>paths.find(p=>p.id===id).points;
  const corridors=[
    [points("osm-170335362").slice(2),.65],
    [points("osm-341185252").slice(1),.65],
    [points("osm-375670604"),.65],
    [points("osm-666668683"),4.5],
  ];
  for(const [route,margin] of corridors)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],d=distance(a,b),count=Math.ceil(d/.35);
    for(let j=0;j<=count;j++){
      const p=interpolate(a,b,j/count);
      for(const w of [-margin,0,margin]){
        const x=p[0]-w*(b[1]-a[1])/d,z=p[1]+w*(b[0]-a[0])/d;
        assert.equal(walkBlocked(x,z),false,`歩行帯内の障害物 ${x}, ${z}`);
        if(j===0||j===count||j%4===0)floor([x,z]);
      }
    }
  }
  for(const u of [-3,-2.2,-1.3,-.3,.8]){
    const p=hijiri.point(u,9.4),hit=floor(p);
    assert.equal(walkBlocked(...p),false);
    assert.equal(hit.object.name,u<0?"湯島の歩道と前庭":"Masonry paving blocks","聖橋北端の歩道と橋面の接続");
  }
  for(const [old,relocated] of [[[-45,133],[-51.15,133.1]],[[-75,98],[-82.9,95.8]],[[-84,116],[-91.1,114.6]]]){
    assert.equal(walkBlocked(...old)||hasPost(old),false,"横断歩道の旧信号柱");
    assert.ok(walkBlocked(...relocated)&&hasPost(relocated),"歩道側に移した信号柱");
  }
});
