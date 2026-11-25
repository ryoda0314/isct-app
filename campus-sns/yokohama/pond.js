import { boundsOf,inside } from './navigation.js';
import { groundAt } from './terrain.js';
import { rng } from './landscapeGeometry.js';
import { pondReflection } from './pondReflection.js';

// The water polygon includes the mown upper bank, the damp meadow and the
// willow/scrub fringe. Sample vegetation against their actual elevations.
function marshCover(T,group,polygon,box,level,batch) {
  const random=rng(88742),vertices=[],colors=[],instances=[];
  const shade=new T.Color(),trunk=new T.Object3D();
  const add=(p,v)=>{vertices.push(...p);colors.push(v*.94,v,v*.73);};
  for(let j=0;j<13;j++){
    const a=j*2.39996+random()*.35,dx=Math.cos(a),dz=Math.sin(a);
    const w=.018+random()*.038,h=.44+random()*.78,reach=.18+random()*.42,offset=.22*random();
    const p=[offset*dx,-.04,offset*dz],k=[(offset+reach*.41)*dx,h*.79,(offset+reach*.41)*dz];
    const l=[k[0]-w*dz,k[1]-.06,k[2]+w*dx],r=[k[0]+w*dz,k[1]-.06,k[2]-w*dx];
    const tip=[(reach+offset)*dx,h,(reach+offset)*dz];
    for(const [v,tone] of [[p,.42],[l,.81],[k,.91],[l,.81],[tip,1.05],[k,.91],[p,.42],[k,.91],[r,.68],[k,.91],[tip,1.05],[r,.68]])add(v,tone);
  }
  for(let x=box.left;x<box.right;x+=.63)for(let z=box.top;z<box.bottom;z+=.63){
    const px=x+(random()-.5)*.59,pz=z+(random()-.5)*.59;
    if(!inside([px,pz],polygon))continue;
    const h=groundAt(px,pz),height=h-level;
    if(height<-.23)continue;
    const patch=.5+.26*Math.sin(.48*px+.22*pz+Math.sin(.40*pz))+.24*Math.cos(.31*pz-.23*px);
    const reed=height<.9, density=reed?.54+patch*.6:.12+patch*.62;
    if(random()>density)continue;
    const scale=(reed?.65:.26)*(.54+patch*1.30+random()*.45);
    const col=shade.setHex(reed?0x829b4b:0x799447).offsetHSL((random()-.5)*.033,(random()-.5)*.12,(random()-.5)*.08).clone();
    trunk.position.set(px,h-.035,pz);trunk.rotation.y=random()*Math.PI*2;
    trunk.scale.set(scale*1.16,scale,scale*1.16);trunk.updateMatrix();instances.push([trunk.matrix.clone(),col]);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const mesh=new T.InstancedMesh(g,material,instances.length);
  const cx=box.center[0],cz=box.center[1];
  for(const [i,[matrix,col]] of instances.entries()){
    matrix.elements[12]-=cx;matrix.elements[13]-=level;matrix.elements[14]-=cz;
    mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,col);
  }
  mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.name='水際の草群落';
  const lod=new T.LOD();lod.position.set(cx,level,cz);lod.addLevel(mesh,0);lod.addLevel(new T.Group(),105,.12);group.add(lod);
  // Overhanging, multi-stem broadleaf trees visible between the library and valley.
  const trees=[[58,-217,5.9],[66,-218,7.7],[77,-223,8.3],[84,-221,5.8],[102,-198,7.0],[111,-189,8.3],
    [114,-184,8.5],[98,-181,6.2],[79,-174,6.3],[58,-166,6.7],[51,-173,6.5],[43,-184,7.5]];
  for(const [x,z,h] of trees){
    const y=groundAt(x,z),lean=(random()-.5)*1.9;
    const base=[x,y-.08,z],fork=[x+lean,y+h*.34,z+.31];
    batch.beam(base,fork,h*.050,h*.050,0x635e47,'trunk');
    batch.beam(base,[x+lean+.17,y+h*.66,z+.8],h*.041,h*.041,0x615c48,'stemFar');
    for(let j=0;j<6;j++){
      const a=j*2.39996+random()*.67,spread=h*(.22+random()*.24);
      const end=[x+lean+Math.cos(a)*spread,y+h*(.70+random()*.26),z+Math.sin(a)*spread];
      const bend=[(fork[0]+end[0])/2,(fork[1]+end[1])/2+.4,(fork[2]+end[2])/2];
      batch.beam(fork,bend,h*.032,h*.032,0x6c6751,'trunk');
      batch.beam(bend,end,h*.019,h*.019,0x777359,'trunk');
      const gcol=[0x547746,0x638346,0x6c904e,0x446d42,0x789854][j%5];
      const r=h*(.19+.08*random());
      batch.put('leaf',gcol,...end,r*1.35,r*.61,r*1.14,a);
      batch.put('canopyFar',gcol,...end,r*1.38,r*.67,r*1.17,a);
      for(let k=0;k<5;k++){
        const phi=random()*Math.PI*2;
        batch.put('shoot',gcol,end[0]+Math.cos(phi)*r,end[1]-r*.23,end[2]+Math.sin(phi)*r*.9,.66,.68,.71,phi);
      }
    }
  }
}

// Suzuki-kake pond after the 2026 biotope work. The wetland survey marks the
// entire basin, including the dry bank. The pool itself follows the DEM contour.
function pondWater(T,group,polygon,level) {
  const bounds=boundsOf(polygon),[cx,cz]=bounds.center;
  const outline=polygon.map(([x,z])=>new T.Vector2(x,z));
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(polygon.flatMap(([x,z])=>[x-cx,cz-z,0]),3));
  g.setIndex(T.ShapeUtils.triangulateShape(outline,[]).flat().reverse());
  g.computeVertexNormals();
  const mat=new T.MeshLambertMaterial({color:0xffffff,side:T.DoubleSide});
  const mesh=new T.Mesh(g,mat);mesh.name='すずかけ池 · 水面と浮草';mesh.receiveShadow=true;
  mesh.position.set(cx,level,cz);mesh.rotation.x=-Math.PI/2;group.add(mesh);
  const openWater=new T.Box3(),point=new T.Vector3();
  for(let x=bounds.left;x<=bounds.right;x+=2)for(let z=bounds.top;z<=bounds.bottom;z+=2) {
    if(inside([x,z],polygon)&&groundAt(x,z)<=level+.02)openWater.expandByPoint(point.set(x,level,z));
  }
  openWater.expandByVector(new T.Vector3(1.1,.06,1.1));
  const reflection=pondReflection(T,mesh,openWater);
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,reflection);
    shader.vertexShader='uniform mat4 pondMirrorMatrix; varying vec4 pondProjection; varying vec3 pondPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\npondPoint=(modelMatrix*vec4(position,1.)).xyz; pondProjection=pondMirrorMatrix*vec4(position,1.);');
    shader.fragmentShader=`uniform sampler2D pondMirror; uniform float pondMirrorStrength;
      varying vec4 pondProjection; varying vec3 pondPoint;
      float wetHash(vec2 p){return fract(sin(dot(mod(p,743.),vec2(19.37,74.71)))*13758.63);}
      float wetNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(wetHash(i),wetHash(i+vec2(1,0)),f.x),mix(wetHash(i+vec2(0,1)),wetHash(i+1.),f.x),f.y);
      }\n`+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=pondPoint.xz;
        vec3 eye=normalize(cameraPosition-pondPoint);
        float coarse=wetNoise(p*.19);
        float patches=.54*coarse+.30*wetNoise(p*.63+coarse*1.8)+.16*wetNoise(p*2.5);
        float wave=.53*sin(p.x*4.9+p.y*2.7+coarse*13.)+.47*sin(p.x*6.7-p.y*3.1+coarse*8.);
        float sharp=clamp(1.-length(fwidth(p))*.94,0.,1.);
        float sheen=pow(1.-clamp(abs(eye.y)+wave*.025,0.,1.),3.);
        vec3 water=mix(vec3(.043,.085,.068),vec3(.23,.34,.39),sheen*(.58+.42*coarse));
        water+=vec3(.016,.024,.026)*wave*sharp;
        float fleck=wetNoise(p*21.)*.44+wetNoise(p*7.)*.56;
        float cover=smoothstep(.47,.62,patches+sharp*(fleck-.5)*.20);
        vec3 weed=mix(vec3(.11,.17,.045),vec3(.34,.41,.10),fleck*sharp+.50*(1.-sharp));
        diffuseColor.rgb=mix(water,weed,cover);
      `).replace('#include <opaque_fragment>',`
        if(pondMirrorStrength>0. && pondProjection.w>0.) {
          vec2 uv=pondProjection.xy/pondProjection.w;
          float grain=wetNoise(p*4.8+.34*coarse);
          vec2 ripple=vec2(wave*.0016,(grain-.5)*.005+wave*.0018)*sharp;
          vec2 samplePoint=clamp(uv+ripple,vec2(.002),vec2(.998));
          vec3 reflected=texture2D(pondMirror,samplePoint).rgb;
          float border=clamp(min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y))*35.,0.,1.);
          float fresnel=.23+.67*pow(1.-clamp(eye.y,0.,1.),2.5);
          float reflectivity=pondMirrorStrength*border*fresnel*(1.-.94*cover);
          outgoingLight=mix(outgoingLight,reflected*vec3(.78,.87,.82),reflectivity);
        }
        #include <opaque_fragment>`);
  };
}

export function pondHabitat(T,group,area,box,batch,t,level) {
  const random=rng(91174), polygon=area.polygon;
  pondWater(T,group,polygon,level);
  marshCover(T,group,polygon,box,level,batch);
  // Marsh grasses grow in stands. Each leaf has a crease and a tip bending
  // away from the stem. Sparse pockets leave the open water visible.
  const greens=[0x748549,0x94a458,0x829c53,0x637e47,0xa9ac66];
  for(let i=0;i<3100;i++){
    const x=box.left+box.width*random(),z=box.top+box.depth*random(),y=groundAt(x,z);
    if(!inside([x,z],polygon)||y<level-.26||y>level+2.8)continue;
    const damp=y<level+.55, stand=Math.sin(x*.42+Math.sin(z*.32))+Math.cos(z*.39-x*.16);
    if(stand<-.35 || (!damp&&random()>.36))continue;
    const height=(damp?.70:.33)*(.60+random()*1.1);
    for(let j=0;j<8;j++){
      const angle=random()*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle),w=.022+random()*.036;
      const h=height*(.54+random()*.64),reach=(.11+random()*.36)*h;
      const root=[x+dx*.13,y-.07,z+dz*.13], mid=[root[0]+dx*reach*.4,y+h*.75,root[2]+dz*reach*.4];
      const l=[mid[0]-dz*w,mid[1]-.07,mid[2]+dx*w],r=[mid[0]+dz*w,mid[1]-.07,mid[2]-dx*w];
      const tip=[root[0]+dx*reach,y+h,root[2]+dz*reach],col=greens[Math.floor(random()*greens.length)];
      t.tri(root,l,mid,col);t.tri(l,tip,mid,col);t.tri(root,mid,r,greens[(j+2)%greens.length]);t.tri(mid,tip,r,col);
    }
  }
  // Low cross-banks in the shallow end partially enclose the flooded beds.
  // The dark stakes are paired with horizontal logs, as in the field photos.
  for(const [a,b] of [[[72,-197],[78,-188]],[[78,-188],[88,-190]],[[82,-204],[91,-196]],[[91,-196],[99,-199]]]){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    const pts=Array.from({length:Math.ceil(len/.82)+1},(_,i)=>{
      const f=i/Math.ceil(len/.82),wiggle=.22*Math.sin(7*f);
      const x=a[0]+dx*f+nx*wiggle,z=a[1]+dz*f+nz*wiggle;
      return [x,Math.max(level,groundAt(x,z))+.08+.025*Math.sin(f*9),z];
    });
    for(let i=0;i<pts.length-1;i++){
      const p=pts[i],q=pts[i+1],offset=(v,d,dy)=>[v[0]+nx*d,v[1]+dy,v[2]+nz*d];
      t.quad(offset(p,-.46,-.16),offset(q,-.46,-.16),offset(q,-.20,.04),offset(p,-.20,.04),0x706b4b);
      t.quad(offset(p,-.2,.04),offset(q,-.2,.04),offset(q,.20,.04),offset(p,.20,.04),0x7e864b);
      batch.beam(offset(p,.23,-.04),offset(q,.23,-.04),.17,.15,0x514e38,'post');
      if(i%2===0)batch.beam(offset(p,.30,-.26),offset(p,.31,.26+random()*.12),.085,.085,0x514b3c,'post');
    }
  }
  // Dry-laid retaining wall beside the earthen path at the head of the valley.
  const stone=[0x737369,0x87867b,0x62665c,0x79786d,0x8e8a79];
  const side=(u,v)=>{
    const x=55+u*.75+v*.66,z=-166-u*.66+v*.75+1.4*Math.sin(u*.23);
    return [x,groundAt(x,z),z];
  };
  for(let j=0;j<25;j++){
    const u=j*.44,p=side(u,0),q=side(u+.44,0),l=side(u,-1.3),r=side(u+.44,-1.3);
    for(const pt of [p,q,l,r])pt[1]+=.06;
    t.quad(p,q,r,l,0x94836b);
    for(let row=0;row<3;row++){
      const v=side(u+row%2*.19,.16+row*.035),w=.22+random()*.12;
      batch.put('stone',stone[Math.floor(random()*stone.length)],v[0],v[1]+.11+row*.205,v[2],w,.14+random()*.06,.22+random()*.10,random()*2);
    }
  }
}

// Upstream from the surveyed pool the 2026 works gather the hillside springs
// into one shallow channel. Trace the low ground from the piazza to the reeds.
export function springValley(t,batch) {
  const random=rng(9003);
  const course=[[23.8,-130.3],[27.8,-132.7],[31.6,-133.8],[33.9,-136.9],
    [33.7,-139.2],[36.7,-141.8],[40.0,-142.8],[40.7,-145.5],[43.4,-146.8],
    [44.6,-150.0],[47.2,-152.4],[47.0,-155.1],[50.2,-157.4],[53.6,-159.4],
    [55.5,-162.1],[59.4,-164.4],[61.8,-168.6],[65.5,-170.5],[67.3,-174.7],
    [70.1,-176.9],[72.1,-180.3],[75.8,-182.5]];
  const bank=(x,z,nx,nz,side,reach,h)=>{
    const px=x+nx*reach*side,pz=z+nz*reach*side;
    return [px,groundAt(px,pz)+h,pz];
  };
  const samples=[];
  for(let j=0;j<course.length-1;j++){
    const [x,z]=course[j],[X,Z]=course[j+1],dx=X-x,dz=Z-z,n=Math.ceil(Math.hypot(dx,dz)/.78);
    for(let i=0;i<n;i++)samples.push([x+dx*i/n,z+dz*i/n]);
  }
  samples.push(course.at(-1));
  const rings=samples.map(([x,z],j)=>{
    const a=samples[Math.max(0,j-1)],b=samples[Math.min(j+1,samples.length-1)];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=(a[1]-b[1])/length,nz=(b[0]-a[0])/length;
    const width=.48+.24*Math.cos(j*.24)+.18*Math.sin(j*.57);
    const center=[x,groundAt(x,z)+.13,z];
    return {center,edges:[-1,1].map(side=>[
      bank(x,z,nx,nz,side,width,.12),bank(x,z,nx,nz,side,width+.27,.16),bank(x,z,nx,nz,side,width+1,.035)
    ])};
  });
  for(let j=1;j<rings.length;j++){
    const a=rings[j-1],b=rings[j];
    for(const side of [0,1]){
      const [edge,lip,grass]=a.edges[side],[E,L,G]=b.edges[side];
      t.quad(a.center,edge,E,b.center,j%17===0?0x688474:0x5a776b);
      t.quad(edge,lip,L,E,0x736e4f);
      t.quad(lip,grass,G,L,0x7b8a55);
      if(random()<.42){
        const reach=.13+random()*.24;
        batch.put('stone',random()>.5?0x888773:0x787e6b,lip[0],lip[1]+.027,lip[2],reach,.06+random()*.08,reach*.76,random()*3);
      }
      if((j+side)%3===0){
        for(let k=0;k<7;k++){
          const angle=random()*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle),h=.20+random()*.51;
          const r=[grass[0]+dx*.17,grass[1]-.025,grass[2]+dz*.17];
          const m=[r[0]+dx*.13,r[1]+h*.75,r[2]+dz*.13];
          const tip=[r[0]+dx*.32,r[1]+h,r[2]+dz*.32],col=random()>.5?0x809649:0x69864b;
          t.tri(r,[m[0]-dz*.04,m[1],m[2]+dx*.04],tip,col);
          t.tri(r,tip,[m[0]+dz*.04,m[1]-.04,m[2]-dx*.04],col);
        }
      }
    }
  }
}
