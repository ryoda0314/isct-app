// Shared, texture-free geometry for paving, vegetation, fittings and inscriptions.
export function rng(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function projectPoint(x,z,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  const u=a[0]+t*dx, v=a[1]+t*dz;
  return {t,x:u,z:v,d:Math.hypot(x-u,z-v)};
}

// Cell lookups keep walking collision checks local even in the preserve.
export function spatialIndex(step=16) {
  const cells = new Map();
  const key=(x,z)=>x+','+z;
  return {
    add(item,left,top,right,bottom) {
      for(let z=Math.floor(top/step);z<=Math.floor(bottom/step);z++) {
        for(let x=Math.floor(left/step);x<=Math.floor(right/step);x++) {
          const id=key(x,z);
          if(!cells.has(id)) cells.set(id,[]);
          cells.get(id).push(item);
        }
      }
    },
    near(x,z) { return cells.get(key(Math.floor(x/step),Math.floor(z/step)))||[]; }
  };
}

// Spatial noise is evaluated in metres so the foliage detail stays anchored on a
// solid, walk-around canopy. The derivatives fade sub-pixel details at map scale.
export function naturalMaterial(T,mode,porosity=1) {
  const mat=new T.MeshLambertMaterial({vertexColors:mode!=='bark',side:mode==='shoot'?T.DoubleSide:T.FrontSide});
  const dictionaries={
    foliage:`
      float broad=noiseAt(vHabitat*1.52);
      float clumps=noiseAt(vHabitat*5.3+broad*2.);
      float leaf=noiseAt(vHabitat*vec3(12.5,25.,11.)+clumps);
      float resol=clamp(1.-length(fwidth(vHabitat))*2.,0.,1.);
      float holes=clumps*.54+leaf*.46;
      if(holes<mix(.30,.50,vLeafRim)*${porosity.toFixed(2)}*resol)discard;
      diffuseColor.rgb*=mix(vec3(.57,.68,.55),vec3(1.34,1.31,1.09),smoothstep(.18,.80,broad*.52+clumps*.48));
      diffuseColor.rgb*=1.+(leaf-.5)*.41*resol;`,
    bark:`
      float ribs=noiseAt(vHabitat*vec3(18.,1.2,18.)),mottle=noiseAt(vHabitat*vec3(3.6,1.0,3.6));
      diffuseColor.rgb*=.76+.38*mottle+.24*ribs;`,
    ground:`
      float mottle=noiseAt(vHabitat*.22),grain=noiseAt(vHabitat*vec3(7.,2.,13.));
      float resol=clamp(1.-length(fwidth(vHabitat))*1.4,0.,1.);
      diffuseColor.rgb*=.88+.19*mottle+resol*.15*(grain-.5);`
  };
  const detail=dictionaries[mode];
  if(!detail)return mat;
  mat.customProgramCacheKey=()=>'suzukakedai-'+mode+'-'+porosity;
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vHabitat; varying float vLeafRim;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      vHabitat=(instanceMatrix*vec4(position,1.)).xyz;
      vec3 worldN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
      vLeafRim=1.-abs(dot(worldN,normalize(cameraPosition-(modelMatrix*vec4(vHabitat,1.)).xyz)));
      #else
      vHabitat=position;
      vLeafRim=0.;
      #endif`);
    shader.fragmentShader=`varying vec3 vHabitat; varying float vLeafRim;
      float hashAt(vec3 p) {p=fract(p*.1031);p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      float noiseAt(vec3 p) {vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hashAt(i),hashAt(i+vec3(1,0,0)),f.x),mix(hashAt(i+vec3(0,1,0)),hashAt(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hashAt(i+vec3(0,0,1)),hashAt(i+vec3(1,0,1)),f.x),mix(hashAt(i+vec3(0,1,1)),hashAt(i+vec3(1)),f.x),f.y),f.z);}
    `+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+detail);
  };
  return mat;
}

// Bent individual blades grow in opposite pairs along radiating twigs. Used on
// the outside of crowns by routes, where a walker can see the gaps between leaves.
function leafSpray(T) {
  const rand=rng(610823),pos=[],cols=[];
  const vec=(x,y,z)=>new T.Vector3(x,y,z);
  for(let shoot=0;shoot<7;shoot++) {
    const phi=shoot*2.39996, axis=vec(Math.cos(phi),-.32+rand()*.86,Math.sin(phi)).normalize();
    for(let i=0;i<3;i++)for(const side of [-1,1]) {
      const f=.25+.22*i+rand()*.12,root=axis.clone().multiplyScalar(f);
      const a=phi+side*(.50+rand()*.91), length=.22+rand()*.20;
      const tip=root.clone().add(vec(Math.cos(a)*length,(-.6+rand()*.55)*length,Math.sin(a)*length));
      const mid=root.clone().lerp(tip,.50),width=length*(.18+rand()*.09),across=vec(-Math.sin(a)*width,0,Math.cos(a)*width);
      const left=mid.clone().add(across), right=mid.clone().sub(across);right.y-=.045;
      mid.y+=.042;
      const hue=.72+rand()*.50;
      for(const v of [root,left,tip,root,tip,right]) {
        pos.push(v.x,v.y,v.z);
        const shade=hue*(v===left?.91:v===mid?1.04:1);
        cols.push(shade*.96,shade,shade*.81);
      }
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));geo.computeVertexNormals();return geo;
}

export function geometryBatch(T,group) {
  const chunks=new Map(), matrix=new T.Matrix4(), obj=new T.Object3D();
  const leaf=new T.IcosahedronGeometry(1,2), pos=leaf.attributes.position;
  const tint=[], tc=new T.Color();
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const f=1+.11*Math.sin(9*x+11*z+5*y)+.085*Math.cos(13*y+7*x);
    pos.setXYZ(i,x*f,y*f,z*f);
    tc.setRGB(.79+.12*y,.83+.1*y,.74+.13*y); tint.push(tc.r,tc.g,tc.b);
  }
  leaf.setAttribute('color',new T.Float32BufferAttribute(tint,3));
  // Keep smoothly-varying author-space normals. Edges are broken by shoots and gaps.
  const geometries={
    box:new T.BoxGeometry(1,1,1), trunk:new T.CylinderGeometry(.36,.5,1,6,1,true),
    post:new T.CylinderGeometry(.5,.5,1,10), leaf, shoot:leafSpray(T),
    canopyFar:new T.IcosahedronGeometry(1,1),leafSmall:new T.IcosahedronGeometry(1,0),
    stemFar:new T.CylinderGeometry(.36,.5,1,5,1,true),stone:new T.IcosahedronGeometry(1,0), round:new T.SphereGeometry(1,12,9)
  };
  for(const g of [geometries.canopyFar,geometries.leafSmall]) {
    const p=g.attributes.position,colors=[];
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),f=1+.12*Math.sin(5*x+2*y+5*z)+.05*Math.cos(x*12+z*7);
      p.setXYZ(i,x*f,y*f,z*f);
      const light=.81+.15*y;colors.push(light*.97,light,light*.92);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  }
  const up=new T.Vector3(0,1,0), a=new T.Vector3(),b=new T.Vector3();
  function record(kind,color) {
    obj.updateMatrix();
    if(!chunks.has(kind))chunks.set(kind,[]);
    chunks.get(kind).push([obj.matrix.clone(),color]);
  }
  function put(kind,color,x,y,z,sx,sy,sz,ry=0,rx=0,rz=0) {
    obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);obj.rotation.set(rx,ry,rz,'YXZ');record(kind,color);
  }
  function beam(A,B,width,depth,color,kind='box') {
    a.fromArray(A); b.fromArray(B).sub(a);
    if(b.lengthSq()<1e-8) return;
    obj.position.copy(a).addScaledVector(b,.5);
    obj.scale.set(width,b.length(),depth);
    obj.quaternion.setFromUnitVectors(up,b.normalize());
    record(kind,color);
  }
  function finish() {
    const materials=new Map(),used=new Set();
    function spawn(kind,items,parent) {
      if(!items?.length)return;
      if(!materials.has(kind))materials.set(kind,kind==='leaf'?naturalMaterial(T,'foliage'):kind==='trunk'?naturalMaterial(T,'bark'):
        kind==='shoot'?naturalMaterial(T,'shoot'):new T.MeshLambertMaterial({color:0xffffff,vertexColors:kind==='canopyFar'||kind==='leafSmall',flatShading:kind==='stone'}));
      const mesh=new T.InstancedMesh(geometries[kind],materials.get(kind),items.length);
      const c=new T.Color();
      items.forEach(([transform,colour],i)=>{mesh.setMatrixAt(i,matrix.copy(transform));mesh.setColorAt(i,c.set(colour));});
      mesh.castShadow=kind!=='shoot';mesh.receiveShadow=true;mesh.name='Outdoor · '+kind;
      mesh.computeBoundingSphere();parent.add(mesh);used.add(kind);
    }
    const cells=new Map(),cellSize=44;
    for(const [kind,items] of chunks) {
      if(!['leaf','trunk','shoot','stemFar','canopyFar'].includes(kind)){spawn(kind,items,group);continue;}
      for(const item of items) {
        const m=item[0].elements,col=Math.floor(m[12]/cellSize),row=Math.floor(m[14]/cellSize),key=col+','+row;
        if(!cells.has(key))cells.set(key,{x:(col+.5)*cellSize,z:(row+.5)*cellSize,items:{}});
        const cell=cells.get(key);
        (cell.items[kind]??=[]).push(item);
      }
    }
    for(const {x,z,items} of cells.values()) {
      const lod=new T.LOD(),near=new T.Group(),middle=new T.Group(),far=new T.Group();
      const first=Object.values(items)[0][0][0].elements,y=first[13];
      lod.position.set(x,y,z);
      for(const g of [near,middle,far])g.position.set(-x,-y,-z);
      spawn('trunk',items.trunk,near);spawn('leaf',items.leaf,near);spawn('shoot',items.shoot,near);
      spawn('stemFar',items.stemFar,middle);spawn('leafSmall',items.leaf,middle);
      spawn('stemFar',items.stemFar,far);spawn('canopyFar',items.canopyFar,far);
      lod.addLevel(near,0);lod.addLevel(middle,66,.08);lod.addLevel(far,155,.10);
      lod.name='Tree and shrub detail';group.add(lod);
    }
    for(const key in geometries) if(!used.has(key)) geometries[key].dispose();
  }
  return {put,beam,finish};
}

// Vertex-coloured surfaces, one mesh for every opaque ribbon/paving/stone polygon.
export function triangleBatch(T,group) {
  const pos=[],colors=[],c=new T.Color();
  function tri(a,b,d,color) {
    pos.push(...a,...b,...d);c.set(color);
    for(let i=0;i<3;i++)colors.push(c.r,c.g,c.b);
  }
  function quad(a,b,c,d,col) {tri(a,b,c,col);tri(a,c,d,col);}
  function finish(polygonOffset=-1) {
    if(!pos.length)return;
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
    const mesh=new T.Mesh(g,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:polygonOffset,polygonOffsetUnits:polygonOffset}));
    mesh.receiveShadow=true;mesh.name='Roads, footpaths and outdoor surfaces';group.add(mesh);
    return mesh;
  }
  return {tri,quad,finish};
}

// Sample in campus coordinates so neighbouring ribbons continue through the junction.
// Fade each scale as its aggregate becomes smaller than a screen pixel.
export function asphaltFinish(shader) {
  shader.vertexShader='varying vec2 vAsphalt;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n vAsphalt=position.xz;');
  shader.fragmentShader=`varying vec2 vAsphalt;
    float roadHash(vec2 cell) {
      vec3 p=fract(vec3(cell.xyx)*vec3(.1031,.1030,.0973));
      p+=dot(p,p.yzx+33.33);
      return fract((p.x+p.y)*p.z);
    }
    float roadNoise(vec2 p) {
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(roadHash(i),roadHash(i+vec2(1.,0.)),f.x),
                 mix(roadHash(i+vec2(0.,1.)),roadHash(i+1.),f.x),f.y)-.5;
    }
    float roadDetail(vec2 p) {
      vec2 footprint=fwidth(p);
      return roadNoise(p)*(1.-smoothstep(.22,1.3,max(footprint.x,footprint.y)));
    }
  `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 grain=mat2(.8,.6,-.6,.8)*vAsphalt;
    diffuseColor.rgb*=1.+.105*roadDetail(vAsphalt*.42)+.090*roadDetail(grain*5.1)
                       +.24*roadDetail(vAsphalt*39.);`);
}

export function pavingMaterial(T) {
  const mat=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vPaver;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vPaver=uv;');
    shader.fragmentShader='varying vec2 vPaver;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 tile=vPaver/vec2(.315,.161);
      tile.x+=.5*mod(floor(tile.y),2.);
      vec2 cell=floor(tile), edge=min(fract(tile),1.-fract(tile));
      vec2 fw=max(fwidth(tile),vec2(.0001));
      float seam=min(smoothstep(.010,.010+fw.x,edge.x),smoothstep(.026,.026+fw.y,edge.y));
      float variation=fract(sin(dot(mod(cell,907.),vec2(71.179,19.43)))*4354.713);
      float grain=fract(sin(dot(floor(mod(vPaver,481.)*118.),vec2(9.729,51.33)))*917.47);
      float resolve=clamp(1.-max(fw.x,fw.y)*.49,0.,1.);
      diffuseColor.rgb*=mix(.99,mix(.68,.83+.36*variation,seam),resolve);
      diffuseColor.rgb*=1.+.08*(grain-.5)*clamp(1.-max(fw.x,fw.y)*6.,0.,1.);`);
  };
  return mat;
}

export function pavingBatch(T,group) {
  const pos=[],uv=[],colors=[],col=new T.Color();
  let tx=.76,tz=.65;
  function orient(x,z) { const l=Math.hypot(x,z)||1;tx=x/l;tz=z/l; }
  function tri(a,b,c,colour) {
    col.set(colour);
    for(const p of [a,b,c]) {
      pos.push(...p);uv.push(tx*p[0]+tz*p[2],-tz*p[0]+tx*p[2]);colors.push(col.r,col.g,col.b);
    }
  }
  function quad(a,b,c,d,col) {tri(a,b,c,col);tri(a,c,d,col);}
  function finish() {
    if(!pos.length)return;
    const geo=new T.BufferGeometry(),mat=pavingMaterial(T);
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const mesh=new T.Mesh(geo,mat);mesh.name='Masonry paving blocks';mesh.receiveShadow=true;group.add(mesh);
    return mesh;
  }
  return {tri,quad,orient,finish};
}

export function plantShadows(T,group,height) {
  const pos=[],colors=[],c=new T.Color(0x26382a);
  function add(x,z,r,alpha) {
    const v=(u,w,a)=>{pos.push(u,height(u,w)+.123,w);colors.push(c.r,c.g,c.b,a);};
    for(let i=0;i<10;i++) {
      const a=i*.6283185,b=(i+1)*.6283185;
      v(x,z,alpha);v(x+Math.cos(b)*r,z+Math.sin(b)*r*.85,0);v(x+Math.cos(a)*r,z+Math.sin(a)*r*.85,0);
    }
  }
  function finish() {
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,4));
    const m=new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,side:T.DoubleSide}));
    m.renderOrder=2;m.name='Canopy ground shade';group.add(m);
  }
  return {add,finish};
}
