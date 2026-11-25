import * as THREE from "three";

// Use the rendered building shells, including recessed storeys and courtyards.
// Large rooftop parts are instanced alongside thousands of small window frames.
// Keep their original shapes and transforms for picking, without testing every
// sash, letter and handrail on each orbit.
function majorInstances(source) {
  const matrix=new THREE.Matrix4(),size=new THREE.Vector3(),parts=[];
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);
    size.setFromMatrixScale(matrix);
    if(size.x>=2 && size.z>=2 && size.y>=.12)parts.push(i);
  }
  if(!parts.length)return null;
  const mesh=new THREE.InstancedMesh(source.geometry,source.material,parts.length);
  for(const [i,part] of parts.entries()){
    source.getMatrixAt(part,matrix);
    mesh.setMatrixAt(i,matrix);
  }
  mesh.matrixWorld.copy(source.matrixWorld);
  mesh.userData.buildingId=source.userData.buildingId;
  return mesh;
}

export function buildingSightlines(root) {
  root.updateWorldMatrix(true,true);
  const shells=[];
  root.traverse(object=>{
    if(!object.isMesh||!object.userData.buildingId||object.material.transparent)return;
    const mesh=object.isInstancedMesh?majorInstances(object):object;
    if(mesh)shells.push(mesh);
  });
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),hits=[];
  return (eye,anchor,facilityId)=>{
    direction.subVectors(anchor,eye);
    const distance=direction.length();
    if(distance<.05)return true;
    ray.set(eye,direction.multiplyScalar(1/distance));
    ray.far=distance-.05;
    hits.length=0;
    ray.intersectObjects(shells,false,hits);
    return !hits.length||hits[0].object.userData.buildingId===facilityId;
  };
}
