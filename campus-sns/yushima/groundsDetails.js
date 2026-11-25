// Surface detail in metres. No sampled imagery: each material is evaluated from
// its own vertices and spatial coordinates.
export { shallowWater } from './ochanomizuWater.js';
export function detailMaterial(T,color,fragment,cacheKey) {
  const mat=new T.MeshLambertMaterial({color,side:T.DoubleSide});
  mat.customProgramCacheKey=()=>cacheKey;
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vSite;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSite=position;');
    shader.fragmentShader='varying vec3 vSite;\nfloat siteHash(vec2 p){return fract(sin(dot(mod(p,197.),vec2(32.765,91.156)))*23897.313);}\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+fragment);
  };
  return mat;
}
function granite(T) {
  return detailMaterial(T,0x95a4ab,`
    vec2 p=vec2(vSite.x*43.+vSite.z*119.,vSite.y*128.+vSite.z*39.);
    float grain=siteHash(floor(p));
    float resolve=clamp(1.-max(fwidth(p.x),fwidth(p.y))*.4,0.,1.);
    diffuseColor.rgb*=1.+resolve*(grain-.5)*.77;`,'yushima-sundial-granite');
}
export function sundial(T,group,t,batch,h,x,z) {
  const mat=granite(T),stone=new T.Group();stone.name='90周年記念日時計';group.add(stone);
  for(const [width,height,depth,center] of [[1.30,.10,1.26,.06],[.72,1.06,.69,.63],[.82,.08,.79,1.20]]) {
    const mesh=new T.Mesh(new T.BoxGeometry(width,height,depth),mat);
    mesh.position.set(x,h+center,z);mesh.receiveShadow=mesh.castShadow=true;stone.add(mesh);
  }
  batch.put('post',0xb3864c,x,h+1.267,z,.70,.055,.70);
  t.tri([x,h+1.30,z+.24],[x,h+1.30,z-.25],[x,h+1.54,z-.24],0x9f773d);
  for(let j=0;j<16;j++){
    const a=-Math.PI+j*Math.PI/12;
    batch.beam([x+.267*Math.cos(a),h+1.297,z+.267*Math.sin(a)],[x+.325*Math.cos(a),h+1.297,z+.325*Math.sin(a)],.009,.009,0x635c49);
  }
  batch.put('box',0xb88863,x,h+.69,z+.351,.23,.54,.016);
  if(typeof document!=='undefined'){
    const cv=document.createElement('canvas');cv.width=128;cv.height=256;
    const ctx=cv.getContext('2d');
    if(ctx){
      ctx.fillStyle='#c38c67';ctx.fillRect(0,0,128,256);ctx.fillStyle='#41362b';
      ctx.font='bold 49px serif';ctx.textAlign='center';ctx.textBaseline='middle';
      [...'仁心仁術'].forEach((s,i)=>ctx.fillText(s,64,34+i*59));
      const label=new T.CanvasTexture(cv);label.colorSpace=T.SRGBColorSpace;
      const plaque=new T.Mesh(new T.PlaneGeometry(.215,.51),new T.MeshLambertMaterial({map:label}));
      plaque.position.set(x,h+.69,z+.3605);stone.add(plaque);
    }
  }
}
