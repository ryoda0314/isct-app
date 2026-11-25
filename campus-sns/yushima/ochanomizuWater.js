import { Reflector } from 'three/addons/objects/Reflector.js';

// From the two bridges the largest feature of the water is the distorted
// silhouette of the opposite bank. Reflect the actual scene in the water plane.
export function shallowWater(T,group,ring,height) {
  const geo=new T.BufferGeometry(),faces=T.ShapeUtils.triangulateShape(ring.map(p=>new T.Vector2(...p)),[]);
  geo.setAttribute('position',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x,-z,0]),3));
  geo.setIndex(faces.flat().reverse());geo.computeVertexNormals();
  const shader={
    name:'神田川の水面',
    uniforms:{...Reflector.ReflectorShader.uniforms,waterReflection:{value:0}},
    vertexShader:`
      uniform mat4 textureMatrix;
      varying vec4 mirrorCoord;
      varying vec3 site;
      void main(){
        site=(modelMatrix*vec4(position,1.)).xyz;
        mirrorCoord=textureMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float waterReflection;
      varying vec4 mirrorCoord;
      varying vec3 site;
      void main(){
        vec2 p=mat2(.95,-.31,.31,.95)*site.xz;
        float eddy=sin(p.x*.19+p.y*.22)+.62*sin(p.x*.31-p.y*.48);
        float longWave=sin(p.y*7.6+p.x*.96+eddy*2.9);
        float shortWave=sin(p.y*15.4-p.x*3.1+sin(p.x*.93+p.y));
        float resolve=1.-smoothstep(.06,.48,length(fwidth(p)));
        float grazing=1.-abs(normalize(cameraPosition-site).y);
        vec3 green=color*(.77+.05*eddy+.04*longWave*resolve);
        green+=vec3(.022,.038,.045)*pow(grazing,4.);
        if(waterReflection>.5){
          vec2 displacement=vec2(longWave+shortWave*.46,shortWave-longWave*.35);
          vec2 uv=mirrorCoord.xy/mirrorCoord.w + displacement*(.0009+.0026*resolve);
          vec3 reflection=texture2D(tDiffuse,clamp(uv,.001,.999)).rgb;
          green=mix(green,reflection*vec3(.79,.85,.80),.20+.51*pow(grazing,2.5));
        }
        gl_FragColor=vec4(green,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const river=new Reflector(geo,{shader,color:0x425848,clipBias:.002,textureWidth:384,textureHeight:256,multisample:0});
  river.name='神田川の川面';river.position.y=height;river.rotation.x=-Math.PI/2;river.material.side=T.DoubleSide;
  // Retain the previous projection between small camera changes. Only a
  // pedestrian near the channel needs the extra, low-resolution render.
  const drawMirror=river.onBeforeRender,position=new T.Vector3(Infinity,0,0),rotation=new T.Quaternion();
  let lastUpdate=-Infinity,lastAspect=0,lastFov=0;
  river.onBeforeRender=function(renderer,scene,camera){
    const {x,y,z}=camera.position,reflect=river.material.uniforms.waterReflection;
    if(renderer.getRenderTarget()||!renderer.extensions.has('EXT_color_buffer_float')||
        y>55||y<=height||x< -215||x>220||Math.abs(z-(.33*x+176))>50){
      reflect.value=0;return;
    }
    reflect.value=1;
    const now=performance.now(),moved=position.distanceToSquared(camera.position)>.02||rotation.angleTo(camera.quaternion)>.008;
    if(lastFov===camera.fov&&lastAspect===camera.aspect&&(!moved||now-lastUpdate<90))return;
    drawMirror.call(river,renderer,scene,camera);
    position.copy(camera.position);rotation.copy(camera.quaternion);lastAspect=camera.aspect;lastFov=camera.fov;lastUpdate=now;
  };
  river.material.addEventListener('dispose',()=>river.getRenderTarget().dispose());
  group.add(river);
}
