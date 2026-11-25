import * as THREE from "three";

// Group nearby instances once. Long cornices, balcony slabs and roof screens
// retain their complete bounds, even when they reach into another grid cell.
function indexBuildingMeshes(root){
  const facilities=new Map(),matrix=new THREE.Matrix4(),box=new THREE.Box3(),center=new THREE.Vector3();
  root.updateWorldMatrix(true,true);
  root.traverse(source=>{
    const id=source.userData.buildingId;
    if(!source.isMesh||!id||source.material.transparent)return;
    if(!facilities.has(id))facilities.set(id,{id,bounds:new THREE.Box3(),groups:[]});
    const facility=facilities.get(id),geometry=source.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    if(!source.isInstancedMesh){
      const bounds=geometry.boundingBox.clone().applyMatrix4(source.matrixWorld);
      facility.bounds.union(bounds);
      facility.groups.push({bounds,source});
      return;
    }
    const cells=new Map(),probe=new THREE.Mesh(geometry,source.material);
    const boxes=new Float64Array(source.count*6);
    for(let i=0;i<source.count;i++){
      source.getMatrixAt(i,matrix);
      matrix.premultiply(source.matrixWorld);
      box.copy(geometry.boundingBox).applyMatrix4(matrix).getCenter(center);
      box.min.toArray(boxes,i*6);box.max.toArray(boxes,i*6+3);
      const key=Math.floor(center.x/12)+","+Math.floor(center.y/12)+","+Math.floor(center.z/12);
      let group=cells.get(key);
      if(!group){
        group={source,probe,boxes,bounds:new THREE.Box3(),instances:[]};
        cells.set(key,group);facility.groups.push(group);
      }
      group.bounds.union(box);group.instances.push(i);
    }
    for(const group of cells.values())facility.bounds.union(group.bounds);
  });
  return facilities;
}

export function buildingSightlines(root){
  const facilities=indexBuildingMeshes(root),ray=new THREE.Raycaster(),hits=[];
  const direction=new THREE.Vector3(),entry=new THREE.Vector3(),partBox=new THREE.Box3();
  const roofs=new Map(),down=new THREE.Vector3(0,-1,0),roofEye=new THREE.Vector3();
  function entryDistanceSq(bounds){
    if(bounds.containsPoint(ray.ray.origin))return 0;
    return ray.ray.intersectBox(bounds,entry)?entry.distanceToSquared(ray.ray.origin):Infinity;
  }
  function nearest(origin,unit,limit,facilitiesToTest){
    ray.set(origin,unit);ray.far=limit;
    let result;
    const candidates=[];
    for(const facility of facilitiesToTest){
      const distanceSq=entryDistanceSq(facility.bounds);
      if(distanceSq<limit*limit)candidates.push({facility,distanceSq});
    }
    candidates.sort((a,b)=>a.distanceSq-b.distanceSq);
    for(const {facility:{id,groups},distanceSq} of candidates){
      if(distanceSq>=ray.far*ray.far)break;
      for(const group of groups){
        if(entryDistanceSq(group.bounds)>=ray.far*ray.far)continue;
        const {source,instances,probe,boxes}=group;
        hits.length=0;
        if(instances){
          for(const i of instances){
            partBox.min.fromArray(boxes,i*6);partBox.max.fromArray(boxes,i*6+3);
            if(entryDistanceSq(partBox)>=ray.far*ray.far)continue;
            source.getMatrixAt(i,probe.matrixWorld);
            probe.matrixWorld.premultiply(source.matrixWorld);
            probe.raycast(ray,hits);
          }
        }else source.raycast(ray,hits);
        for(const hit of hits)if(hit.distance<ray.far){ray.far=hit.distance;result=id;}
      }
    }
    return result;
  }
  function seen(eye,point,id){
    direction.subVectors(point,eye);
    const length=direction.length();
    if(length<.05)return true;
    const hit=nearest(eye,direction.multiplyScalar(1/length),length-.05,facilities.values());
    return !hit||hit===id;
  }
  return (eye,anchor,id)=>{
    if(!seen(eye,anchor,id))return false;
    const facility=facilities.get(id);
    if(!facility)return true;
    // A floating badge can clear the foreground roof while the labelled
    // building is still completely behind it. Also check its real roof.
    if(!roofs.has(id)){
      roofEye.set(anchor.x,facility.bounds.max.y+1,anchor.z);
      const hit=nearest(roofEye,down,Infinity,[facility]);
      roofs.set(id,hit?new THREE.Vector3(anchor.x,roofEye.y-ray.far+.04,anchor.z):null);
    }
    const roof=roofs.get(id);
    return !roof||seen(eye,roof,id);
  };
}
