import { Reflector } from 'three/addons/objects/Reflector.js';

// The offscreen camera shares the real scene. Allocate the render target only
// when the exposed water is both nearby and in view; the rest of the campus
// keeps the ordinary single render pass.
export function pondReflection(T,water,openWater) {
  const uniforms={
    pondMirror:{value:null},
    pondMirrorMatrix:{value:new T.Matrix4()},
    pondMirrorStrength:{value:0}
  };
  const frustum=new T.Frustum(),viewProjection=new T.Matrix4(),lastLens=new T.Matrix4();
  const lastPosition=new T.Vector3(),lastRotation=new T.Quaternion();
  let reflector=null,updated=-Infinity;
  water.onBeforeRender=(renderer,scene,camera)=>{
    uniforms.pondMirrorStrength.value=0;
    if(!camera.isPerspectiveCamera || renderer.getRenderTarget() || camera.position.y<=water.position.y+.015)return;
    const distance=openWater.distanceToPoint(camera.position);
    if(distance>=80)return;
    viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    if(!frustum.setFromProjectionMatrix(viewProjection).intersectsBox(openWater))return;
    if(!reflector) {
      reflector=new Reflector(water.geometry,{textureWidth:384,textureHeight:384,multisample:0,clipBias:.001});
      // A colour reflection works on WebGL2 without a float colour attachment.
      const texture=reflector.getRenderTarget().texture;
      texture.type=T.UnsignedByteType;
      texture.name='すずかけ池 · 反射像';
      uniforms.pondMirror.value=texture;
      uniforms.pondMirrorMatrix.value=reflector.material.uniforms.textureMatrix.value;
      // Reflector copies the user's projection. This independent zoom chooses
      // lighter tree/vegetation LODs for features seen only in the small reflection.
      reflector.camera.zoom=.53;
    }
    uniforms.pondMirrorStrength.value=1-T.MathUtils.smoothstep(distance,55,80);
    const now=performance.now(),travel=lastPosition.distanceToSquared(camera.position);
    const turn=lastRotation.angleTo(camera.quaternion);
    const lensChange=!lastLens.equals(camera.projectionMatrix);
    if(!lensChange && travel<.04 && turn<.012)return;
    if(!lensChange && travel<4 && turn<.13 && now-updated<82)return;
    reflector.matrixWorld.copy(water.matrixWorld);
    lastPosition.copy(camera.position);lastRotation.copy(camera.quaternion);
    lastLens.copy(camera.projectionMatrix);updated=now;
    water.visible=false;
    try { reflector.onBeforeRender(renderer,scene,camera); }
    finally { water.visible=true; }
  };
  // scene.release already disposes each scene material, including during a
  // failed map start. Reflector owns a separate material and depth attachment.
  water.material.addEventListener('dispose',()=>{
    reflector?.dispose();reflector=null;
    uniforms.pondMirror.value=null;uniforms.pondMirrorStrength.value=0;
  });
  return uniforms;
}
