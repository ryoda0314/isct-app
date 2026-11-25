// Geometry observed from the university accessibility survey, views 6 and 7, and the
// station walking guide. Distances along the path use the mapped pedestrian centreline.
// Widths, planting and the fixtures' offsets are estimates from the exterior views.
// https://www.ssc.titech.ac.jp/amap/wp-content/uploads/2023/02/suzukakegate-6.jpg
// https://www.ssc.titech.ac.jp/amap/wp-content/uploads/2023/02/suzukakegate-7.jpg
// https://solid-state-chemistry.jp/pdf/suzukake_access_detail.pdf
import { groundAt } from './terrain.js';
import { projectPoint, rng } from './landscapeGeometry.js';

function approachFrame(points,roadbedAt) {
  const knots=[0], segments=[];
  for(let i=1;i<points.length;i++) {
    const dx=points[i][0]-points[i-1][0],dz=points[i][1]-points[i-1][1],length=Math.hypot(dx,dz);
    segments.push([dx/length,dz/length]);knots.push(knots[i-1]+length);
  }
  const normals=points.map((_,i)=>{
    const a=segments[Math.max(0,i-1)],b=segments[Math.min(segments.length-1,i)];
    const nx=a[1]+b[1],nz=-a[0]-b[0],div=nx*a[1]-nz*a[0];
    return [nx/div,nz/div];
  });
  // u increases to the left when walking into campus. Interpolate the normals to
  // make slabs, rails and hedges join at corners without gaps.
  return (u,s,h=0)=>{
    let i=0;
    while(i<segments.length-1 && s>knots[i+1])i++;
    const a=points[i], b=points[i+1], f=(s-knots[i])/(knots[i+1]-knots[i]);
    const c=Math.max(0,Math.min(1,f));
    const x=a[0]+(b[0]-a[0])*f+u*(normals[i][0]*(1-c)+normals[i+1][0]*c);
    const z=a[1]+(b[1]-a[1])*f+u*(normals[i][1]*(1-c)+normals[i+1][1]*c);
    return [x,roadbedAt(x,z)+h,z];
  };
}

function clippedHedge(T,group,P,t,side,start,end,height,random,solid) {
  // A solid clipped core with bevelled shoulders, fine leaf silhouettes and an
  // exposed, woody skirt, all visible from either side of the hedge.
  const w=side>0?1.65:1.38,inner=side*(side>0?2.65:2.36);
  const shape=[[.11,.18],[0,.42],[.02,.90],[.19,1],[w-.2,1.01],[w,.89],[w-.04,.16]];
  const sections=[],skin=[];
  const palette=[0x506535,0x536935,0x596e39,0x405b30,0x59713c,0x4e6635];
  const count=Math.ceil((end-start)/.64);
  for(let i=0;i<=count;i++) {
    const s=start+(end-start)*i/count;
    const centre=P(inner+side*w*.5,s);
    solid(centre[0],centre[2],w*.47);
    const bank=side<0?Math.max(0,P(0,s)[1]-P(inner,s)[1]):0;
    const crown=height*(.99+.023*Math.sin(s*.72))+bank;
    const ring=shape.map(([offset,rise])=>P(inner+side*(offset+random()*.055),s,crown*rise+.035*random()));
    if(i)for(let k=1;k<ring.length;k++) {
      skin.push(...sections[k-1],...ring[k-1],...ring[k],...sections[k-1],...ring[k],...sections[k]);
    }
    if(i===0||i===count)for(let k=1;k<ring.length-1;k++)skin.push(...ring[0],...ring[k],...ring[k+1]);
    sections.splice(0,sections.length,...ring);
    if(i===count)break;
    for(let j=0;j<24;j++) {
      const d=s+random()*.63,top=j%3===0;
      const offset=top?.15+random()*(w-.32):.008-random()*.075;
      const h=top?crown+.052:crown*(.24+random()*.69);
      const u=inner+side*offset,r=.028+random()*.041,col=palette[Math.floor(random()*palette.length)];
      const root=P(u,d,h),tip=P(u-side*r*.5,d+.12,h+r);
      t.tri(root,P(u+(top?r:0),d+.039,h+(top?.007:r)),tip,col);
      t.tri(root,tip,P(u-(top?r:.01),d+.072,h-(top?.009:r*.46)),col+0x030301);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(skin,3));geo.computeVertexNormals();
  const mat=new T.MeshLambertMaterial({color:0x697d42,side:T.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vHedge;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vHedge=position;');
    shader.fragmentShader='varying vec3 vHedge;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=vec2(vHedge.x*.83+vHedge.z*.48,(vHedge.y+vHedge.z*.63-vHedge.x*.31)*1.28);
      p+=.049*vec2(sin(p.y*12.3)+.51*sin(p.x*14.+p.y*3.),sin(p.x*9.)+.57*sin(p.y*16.8));
      vec2 texel=p*vec2(17.,19.);
      texel.x+=.5*mod(floor(texel.y),2.);
      vec2 cell=mod(floor(texel),303.);
      float tint=fract(sin(dot(cell,vec2(17.23,81.34)))*8172.98);
      vec2 grain=fract(texel)-.5;
      grain.x+=grain.y*(tint-.5)*1.43;
      float tip=1.-smoothstep(.12,1.,abs(grain.x)*1.71+abs(grain.y+sin(grain.x*4.)*.10)*1.06);
      float res=clamp(1.-max(fwidth(texel.x),fwidth(texel.y))*.54,0.,1.);
      float clump=sin(p.x*4.+p.y*6.3)*.05+sin(p.x*7.1-p.y*3.8)*.05;
      diffuseColor.rgb*=mix(vec3(.94),vec3(.58,.62,.55)+vec3(.77,.70,.51)*tip*(.54+tint*.91)+clump,res);`);
  };
  const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Clipped approach hedge';group.add(mesh);
}

function concreteWall(T,group,P,t,batch,solid,plaqueText,roadbedAt) {
  const origin=P(-2.94,.65);
  const top=origin[1]+3.85, thickness=.34;
  const skin=[],colors=[],color=new T.Color();
  // The inscription faces the public street. The long return is seen in
  // perspective on the right as the visitor walks towards the overpass.
  for(const [a,b] of [[P(-8.72,-.22),origin],[origin,P(-3.05,17.5)]]) {
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),tx=dx/length,tz=dz/length;
    const nx=-tz,nz=tx, yaw=Math.atan2(nx,nz);
    const point=(s,level,offset=0)=>{
      const x=a[0]+tx*s+nx*offset,z=a[2]+tz*s+nz*offset;
      return [x,level===null?roadbedAt(x,z)-.29:level,z];
    };
    const bays=Math.ceil(length/1.07),bay=length/bays;
    for(let i=0;i<bays;i++) {
      const j=i*bay,k=(i+1)*bay,mid=(j+k)/2;
      const low=Math.min(point(j,null)[1],point(k,null)[1]);
      for(const side of [1,-1]) {
        const v=side*thickness*.5;
        for(let row=0;top-row*1.12>low;row++) {
          const hi=top-row*1.12,lo=Math.max(low,hi-1.12);
          color.set([0xdbdcd7,0xdfdfda,0xd9dcd7,0xdedfd9,0xdadbd5][(i*7+row*3)%5]);
          const a=point(j,lo,v),b=point(k,lo,v),c=point(k,hi,v),d=point(j,hi,v);
          skin.push(...a,...b,...c,...a,...c,...d);
          for(let n=0;n<6;n++)colors.push(color.r,color.g,color.b);
          if(row>0)batch.beam(point(j,hi,v+side*.008),point(k,hi,v+side*.008),.012,.013,0xa5a8a2);
          if(hi-lo>.8)for(const sa of [mid-bay*.27,mid+bay*.27]) {
            batch.put('stone',0x92968f,...point(sa,hi-.29,v+side*.008),.021,.021,.008,yaw);
          }
        }
        batch.beam(point(j,low,v+side*.004),point(j,top,v+side*.004),.012,.010,0xa7a9a2);
      }
      const midPoint=point(mid,null);solid(midPoint[0],midPoint[2],.32);
    }
    for(const end of [0,length])t.quad(point(end,null,-thickness/2),point(end,null,thickness/2),point(end,top,thickness/2),point(end,top,-thickness/2),0xd8dad2);
    for(const v of [-.24,.24])t.quad(point(0,top-.01,v),point(length,top-.01,v),point(length,top+.22,v),point(0,top+.22,v),0xe5e6de);
    t.quad(point(0,top+.22,-.24),point(length,top+.22,-.24),point(length,top+.22,.24),point(0,top+.22,.24),0xeeeee4);
    if(a!==origin) {
      const off=-.184,cy=top-1.49;
      t.quad(point(.47,cy-.14,off),point(3.88,cy-.14,off),point(3.88,cy+.14,off),point(.47,cy+.14,off),0x969b96);
      plaqueText(T,group,'東京科学大学　横浜キャンパス',...point(2.17,cy,off-.012),3.20,.195,yaw+Math.PI,0,'#333c3b');
    } else {
      const off=-.186,cy=top-1.84;
      t.quad(point(4,cy-.54,off),point(4.59,cy-.54,off),point(4.59,cy+.54,off),point(4,cy+.54,off),0xcfd2ca);
      for(let i=0;i<6;i++)batch.beam(point(4.08,cy+.36-i*.1,off-.006),point(4.49-i%3*.06,cy+.36-i*.1,off-.006),.014,.014,0xa4aaa4);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(skin,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mat=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,emissive:0x393b38,emissiveIntensity:.40});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vConcrete;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vConcrete=position;');
    shader.fragmentShader='varying vec3 vConcrete;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float s=vConcrete.x*.77+vConcrete.z*.63;
      float streak=sin(s*12.+.37*sin(vConcrete.y*2.1+s))*sin(s*3.2+vConcrete.y*.44);
      float fleck=fract(sin(dot(mod(floor(vConcrete*76.),537.),vec3(13.21,52.13,20.43)))*8278.43);
      float res=clamp(1.-length(fwidth(vConcrete))*12.,0.,1.);
      diffuseColor.rgb*=.99+.019*streak+.064*res*(fleck-.5);`);
  };
  const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Suzukake Gate concrete returns';group.add(mesh);
}

function bridgeFittings(batch,paths,solid,roadbedAt) {
  const walk=paths.find(p=>p.id==='osm-210335023').points;
  for(const path of paths.filter(p=>p.bridge&&p.name==='国道246号')) {
    const [a,b]=path.points,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    const alt0=groundAt(...a)+1.255,alt1=groundAt(...b)+1.255;
    const point=(s,w,dy)=>[a[0]+dx*s/len-dz*w/len,alt0+(alt1-alt0)*s/len+dy,a[1]+dz*s/len+dx*w/len];
    const half=path.width*.5,yaw=Math.atan2(dx,dz);
    const beam=(s,v,h,width,height,depth,col)=>batch.put('box',col,...point(s,v,h),width,height,depth,yaw);
    for(let s=2.8;s<len-1;s+=3.7) {
      beam(s,0,-.91,2*half,.27,.15,0x7e8882);
      for(const v of [-.76,-.25,.25,.76]) {
        const d=v*half;
        beam(s,d,-1.01,.37,.52,.10,0x819088);
      }
      if(Math.round((s-2.8)/3.7)%3===0) {
        const e=half+.14;
        batch.beam(point(s,e,.46),point(s,e,-.69),.038,.048,0x89958d);
      }
    }
    // Keep the piers on the shoulders, clear of the pedestrian passage beneath.
    for(const s of [len*.17,len*.49,len*.8]) {
      const base=point(s,0,-1.31), h=roadbedAt(base[0],base[2]);
      const clear=walk.slice(1).every((v,i)=>projectPoint(base[0],base[2],walk[i],v).d>9.1);
      if(base[1]-h<1||!clear)continue;
      for(const side of [-1,1]) {
        const end=point(s,side*half*.63,-1.45);
        const foot=roadbedAt(end[0],end[2])-.14;
        batch.put('box',0xa4aaa1,end[0],(end[1]+foot)*.5,end[2],.9,Math.abs(end[1]-foot),1.20,yaw);
        solid(end[0],end[2],.60);
      }
      beam(s,0,-1.38,2*half,.59,.70,0xb3b8ad);
    }
  }
}

export function gateApproach(T,group,t,batch,paths,solid,plaqueText,roadbedAt=groundAt) {
  const path=paths.find(p=>p.id==='osm-210335023');
  if(!path)return;
  const P=approachFrame([...path.points].reverse(),roadbedAt),random=rng(24866);
  // Subdivide wide bands at the same scale as their individual flags. A single
  // wide chord across this sloped DEM can otherwise cover the stonework by 30 cm.
  const rect=(u,v,s,e,h,col,frame=P)=>{
    const nx=Math.ceil((v-u)/.54),nz=Math.ceil((e-s)/.54);
    for(let j=0;j<nx;j++)for(let i=0;i<nz;i++) {
      const left=u+(v-u)*j/nx,right=u+(v-u)*(j+1)/nx;
      const a=s+(e-s)*i/nz,b=s+(e-s)*(i+1)/nz;
      t.quad(frame(left,a,h),frame(right,a,h),frame(right,b,h),frame(left,b,h),col);
    }
  };
  const stone=[0xa7a69d,0xaaa9a3,0xb1afa6,0xa3a59f,0xaaa89e,0xb0aea4];
  // The plaza at the gate narrows into a pedestrian way of square stone flags.
  const total=path.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path.points[i][0],p[1]-path.points[i][1]),0);
  for(let s=0;s<total;s+=.54) {
    const end=Math.min(total,s+.54),gap=Math.min(.011,(end-s)*.1);
    const half=s<6?2.54-s*.09:2;
    const n=s<6?10:8;
    for(let j=0;j<n;j++) {
      const u=-half+j*2*half/n,v=u+2*half/n;
      rect(u,v,s,end,.048,0x82857d);
      rect(u+.008,v-.008,s+gap,end-gap,.055,stone[Math.floor(random()*stone.length)]);
    }
  }
  // The marked crossing terminates at the domed granite bollards.
  const crossing=paths.find(p=>p.id==='osm-1086612621');
  const crossingFrame=crossing?approachFrame([...crossing.points].reverse(),roadbedAt):P;
  const C=(u,s,h)=>{
    const inside=P(u,s,h);
    if(!crossing||s>=0)return inside;
    const outside=crossingFrame(-u,-s,h),factor=Math.min(1,-s/8.1);
    const x=inside[0]+(outside[0]-inside[0])*factor,z=inside[2]+(outside[2]-inside[2])*factor;
    return [x,roadbedAt(x,z)+h,z];
  };
  rect(-1.62,1.62,-11.45,-8.1,.048,0x82857d,C);
  for(let s=-11.45;s< -8.1;s+=.54)for(let j=0;j<6;j++){
    const u=-1.62+j*.54;rect(u+.008,u+.532,s,Math.min(-8.1,s+.532),.055,stone[(j+8+Math.floor(-s*2))%stone.length],C);
  }
  for(let s=-8.1;s<0;s+=.6)for(let u=-10;u<10;u+=1)rect(u,u+1,s,Math.min(0,s+.6),.055,0x707674,C);
  for(let s=-7.75;s<-.2;s+=.89)rect(-1.44,1.44,s,s+.39,.066,0xe4e3d7,C);
  for(let s=.12;s<30;s+=.30) {
    rect(.96,1.26,s,s+.292,.063,0xd4b35d);
    for(const u of [.995,1.062,1.129,1.196])rect(u,u+.023,s+.019,s+.273,.071,0xe7c674);
  }
  for(let u=-1.45;u<1.26;u+=.30) {
    rect(u,u+.29,.13,.70,.073,0xceb05f);
    for(let k=0;k<4;k++)for(let j=0;j<8;j++)
      batch.put('stone',0xe2c879,...P(u+.04+.067*k,.169+.069*j,.081),.017,.011,.017);
  }
  concreteWall(T,group,P,t,batch,solid,plaqueText,roadbedAt);
  for(const u of [-2.03,-.57,1.68]) {
    const [x,base,z]=P(u,.27,.052);
    batch.put('post',0x97988f,x,base+.25,z,.34,.5,.34);
    batch.put('post',0x686e69,x,base+.477,z,.345,.025,.345);
    batch.put('round',0xb1b1a6,x,base+.488,z,.171,.141,.171);
    solid(x,z,.17);
  }
  for(let i=0;i<5;i++) {
    const [x,h,z]=P(-2.76-i*.14,-.74-i*1.16,.054);
    batch.put('post',0xb35b38,x,h+.021,z,.27,.042,.27);
    batch.put('post',0xcf7651,x,h+.32,z,.071,.62,.071);
    for(const y of [.38,.48,.57])batch.put('post',0xe2d3b6,x,h+y,z,.073,.043,.073);
    solid(x,z,.07);
  }
  const heading=Math.atan2(P(0,5)[0]-P(0,4)[0],P(0,5)[2]-P(0,4)[2]);
  for(const [u,s] of [[1.52,6.4],[-.83,8.1],[-1.55,5.4]]) {
    const [x,y,z]=P(u,s,.045);
    batch.put('box',0x414c4a,x,y+.12,z,.56,.24,.4,heading);
    batch.put('box',0x7c8884,x,y+.77,z,.5,1.14,.095,heading);
    const [X,,Z]=P(u,s-.06);
    batch.put('box',0xe0e1d5,X,y+.78,Z,.417,.96,.023,heading);
    batch.put('box',0x9bb9b8,X-.026*Math.sin(heading),y+.44,Z-.026*Math.cos(heading),.4,.22,.016,heading);
    for(let j=0;j<4;j++)batch.put('box',0x84918d,X-.019*Math.sin(heading),y+1.06-j*.079,Z-.019*Math.cos(heading),.32-.05*(j%3),.016,.014,heading);
    solid(x,z,.255);
  }
  clippedHedge(T,group,P,t,1,.2,22,2.04,random,solid);
  clippedHedge(T,group,P,t,-1,52,99,1.23,random,solid);
  // The vegetation rises behind the right-hand concrete return. Forked trunks
  // and the overhead utility run break the skyline seen from the crossing.
  for(let i=0;i<9;i++) {
    const u=-5.2-random()*7.1,s=2+random()*15;
    const [x,y,z]=P(u,s),h=2.7+random()*2.1;
    const fork=[x+.17,y+h*.56,z+.09];
    batch.beam([x,y-.07,z],fork,.16,.18,0x776f5e,'trunk');
    batch.beam([x,y-.07,z],fork,.16,.18,0x776f5e,'stemFar');
    for(let j=0;j<5;j++) {
      const a=i*2.4+j*1.256,rad=.28+random()*1.0;
      const tip=[fork[0]+Math.cos(a)*rad,y+h*(.72+random()*.39),fork[2]+Math.sin(a)*rad];
      batch.beam(fork,tip,.076,.085,0x756e5b,'trunk');
      const col=[0x596748,0x556f4d,0x647444,0x6d7752][(i+j)%4];
      batch.put('leaf',col,...tip,.73,.82,.68,i+j);
      if(j%2===0)batch.put('canopyFar',col,...tip,.98,.91,.93,i+j);
    }
  }
  const left=P(7.01,2.44),right=P(-10.3,6.82);
  for(const [p,h] of [[left,7.55],[right,8.55]]) {
    batch.put('post',0x8b8980,p[0],p[1]+h/2,p[2],.16,h,.16);
    batch.put('post',0x70726d,p[0],p[1]+h-.55,p[2],.177,.091,.177);
  }
  for(let j=0;j<2;j++) {
    const wire=f=>[left[0]+(right[0]-left[0])*f,
      (left[1]+7.25)*(1-f)+(right[1]+8.24)*f-.33*4*f*(1-f)-j*.28,left[2]+(right[2]-left[2])*f];
    for(let i=0;i<9;i++)batch.beam(wire(i/9),wire((i+1)/9),.015,.015,0x6b706b,'post');
  }
  // Narrow evergreen spires and dried plumes on the left shoulder in view 7.
  for(let i=0;i<9;i++) {
    const s=53+i*1.65+random(),u=6.2+random()*1.4;
    const [x,y,z]=P(u,s),height=3.0+random()*2.9;
    batch.put('trunk',0x665e4b,x,y+height*.48,z,.18,height*.97,.18);
    batch.put('stemFar',0x665e4b,x,y+height*.48,z,.18,height*.97,.18);
    for(let j=0;j<7;j++) {
      const f=j/7,rad=(1-f)*.59+.12,c=0x3e583a+j%3*0x030502;
      batch.put('leaf',c,x+.12*Math.sin(i+j),y+height*(.25+.72*f),z+.11*Math.cos(i+j),rad,height*.19,rad*.88,i+j);
      if(j%2===0)batch.put('canopyFar',c,x,y+height*(.25+.72*f),z,rad,height*.26,rad*.88,i+j);
    }
  }
  for(let i=0;i<160;i++) {
    const s=52+random()*16,u=3.05+random()*2.65;
    const [x,y,z]=P(u,s),height=.62+random()*.65;
    for(let j=0;j<7;j++) {
      const a=j*2.4+random(),dx=Math.cos(a),dz=Math.sin(a),h=height*(.42+.47*random());
      const root=[x,y,z],left=[x+dx*.14-dz*.012,y+h*.63,z+dz*.14+dx*.012];
      const right=[x+dx*.14+dz*.012,y+h*.63,z+dz*.14-dx*.012];
      const col=j%3===0?0x9c9368:j%3===1?0xb5a67a:0xbaab84;
      t.tri(root,left,right,col);t.tri(left,[x+dx*.32,y+h,z+dz*.32],right,col);
    }
    if(i%3===0) {
      const tip=[x+.17,y+height,z+.06];
      batch.beam([x,y+.04,z],tip,.012,.012,0xab996e);
      batch.put('stone',0xc5b289,...tip,.037,.125,.032,.3,-.28);
    }
  }
  // Stainless gateposts, a handrail along the left verge and a fire cabinet
  // punctuate the view as the paving emerges from below Route 246.
  for(const [u,s] of [[-1.34,57.2],[.58,57.9],[1.35,56.7]]) {
    const [x,y,z]=P(u,s,.052);
    batch.put('post',0x909997,x,y+.026,z,.31,.052,.31);
    batch.put('post',0xafb7b4,x,y+.402,z,.17,.76,.17);
    for(const h of [.54,.66])batch.put('post',0xbda35a,x,y+h,z,.174,.045,.174);
    batch.put('round',0xd5d7d0,x,y+.788,z,.087,.033,.087);solid(x,z,.085);
  }
  for(let s=54;s<57.1;s+=.30) {
    rect(.94,1.24,s,s+.292,.063,0xcbaa61);
    for(let i=0;i<4;i++)rect(.97+i*.065,.992+i*.065,s+.018,s+.272,.071,0xe1c778);
  }
  const silver=0xa9b4b2;
  for(let s=47;s<57;s+=2.3) {
    batch.beam(P(2.04,s,.05),P(2.04,s,.87),.059,.059,silver,'post');
    if(s+2.3<57)batch.beam(P(2.04,s,.87),P(2.04,s+2.3,.87),.068,.068,silver,'post');
  }
  const [x,y,z]=P(2.51,83,.02);
  batch.put('post',0x8d9393,x,y+3.06,z,.158,6.12,.158);
  batch.beam(P(2.51,83,6.12),P(1.77,83,6.12),.13,.12,0x777f80);
  batch.put('box',0x626a6c,...P(1.72,83,6.02),.42,.18,.37,heading);
  batch.put('box',0xaf4d41,...P(2.39,82.7,.63),.41,.91,.27,heading);
  batch.put('box',0xe4d6bd,...P(2.39,82.54,.66),.15,.14,.016,heading);
  solid(x,z,.19);
  bridgeFittings(batch,paths,solid,roadbedAt);
}
