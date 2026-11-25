// Exterior references (observation only): Science Tokyo Accessibility Map gate views;
// https://www.ssc.titech.ac.jp/amap/home/suzukakedai/
// https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yokohama
// https://www.titech.ac.jp/student-support/pdf/2024guidance-slides-t.pdf (p.15)
// Street furniture dimensions and engraving layouts are approximations.
import { groundAt } from './terrain.js';
import { projectPoint } from './landscapeGeometry.js';
import { gateApproach } from './gateApproach.js';

function streetFrame(point,paths) {
  const [x,z]=point;
  let nearest=Infinity, heading=0, width=4;
  for(const path of paths) {
    if(path.walkable===false || path.bridge)continue;
    for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1], b=path.points[i], {d}=projectPoint(x,z,a,b);
      if(d>=nearest)continue;
      nearest=d;width=path.width;
      const dx=b[0]-a[0],dz=b[1]-a[1];
      const sign=dx*(8-x)+dz*(-166-z)>=0?1:-1;
      heading=Math.atan2(dx*sign,dz*sign);
    }
  }
  const sn=Math.sin(heading),cs=Math.cos(heading);
  return {heading,width, local:(u,v)=>[x+u*cs+v*sn,z-u*sn+v*cs]};
}

// Text on the signs is typeset locally; no map imagery or photographs are read.
export function plaqueText(T,group,text,x,y,z,w,h,yaw,pitch=0,color='#edf0e8',font='600 1em sans-serif') {
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');
  canvas.width=640;canvas.height=Math.max(18,Math.round(640*h/w));
  const ctx=canvas.getContext('2d');
  ctx.font=font.replace('1em','100px');
  const size=Math.min(canvas.height*.86,canvas.width*.95/Math.max(1,ctx.measureText(text).width)*100);
  ctx.font=font.replace('1em',size+'px');
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
  ctx.fillText(text,canvas.width/2,canvas.height/2,canvas.width*.97);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}));
  mesh.position.set(x,y,z);mesh.rotation.set(pitch,yaw,0,'YXZ');group.add(mesh);
}

function graniteBlock(T,group,corners,F,top) {
  const positions=[];
  const quad=(a,b,c,d)=>positions.push(...a,...b,...d,...b,...c,...d);
  for(let i=0;i<4;i++) {
    const [u,v]=corners[i],[j,k]=corners[(i+1)%4];
    quad(F(u,.08,v),F(j,.08,k),top(j,k),top(u,v));
  }
  quad(...corners.map(([u,v])=>top(u,v)));
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
  const mat=new T.MeshLambertMaterial({color:0xa4a8af,side:T.DoubleSide});
  // Irregular dark and light mineral grains, fading below pixel size.
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vStone;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vStone=position;');
    shader.fragmentShader='varying vec3 vStone;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 q=vStone*310.;
      vec3 cell=mod(floor(q+0.22*sin(q.yzx*.79)),337.);
      float noise=fract(sin(dot(cell,vec3(19.41,73.32,41.17)))*9154.17);
      float fade=clamp(1.-max(max(fwidth(q.x),fwidth(q.y)),fwidth(q.z))*.34,0.,1.);
      diffuseColor.rgb*=1.+fade*(smoothstep(.16,.8,noise)-.5)*.83;`);
  };
  const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Granite memorial';group.add(mesh);
}

// Drawn relief, lettering and line work on the Nobel plaque. Coordinates are in
// millimetre-scale offsets on its sloped plane and the shapes cast actual edges.
function nobelPortrait(T,t,top) {
  const P=(x,y,lift)=>top(-.187-x*.153,.096+y*.158,lift);
  const relief=(outline,col,lift)=>{
    const faces=T.ShapeUtils.triangulateShape(outline.map(p=>new T.Vector2(...p)),[]);
    for(const [a,b,c] of faces)t.tri(P(...outline[a],lift),P(...outline[b],lift),P(...outline[c],lift),col);
  };
  const incise=(points,weight=.012)=>{
    for(let i=1;i<points.length;i++) {
      const [a,b]=points[i-1],[c,d]=points[i],dx=c-a,dy=d-b,len=Math.hypot(dx,dy);
      const x=-dy/len*weight,y=dx/len*weight;
      t.quad(P(a+x,b+y,.032),P(c+x,d+y,.032),P(c-x,d-y,.032),P(a-x,b-y,.032),0x514b37);
    }
  };
  const profile=[[-.91,-.88],[-.99,-.64],[-.75,-.51],[-.43,-.39],[-.38,-.19],[-.51,-.01],[-.53,.19],[-.60,.28],[-.63,.46],[-.57,.72],[-.39,.89],[-.18,.94],[.03,.98],[.24,.92],[.39,.77],[.43,.57],[.44,.25],[.48,.10],[.44,-.07],[.36,-.21],[.43,-.36],[.68,-.45],[.97,-.55],[.94,-.90]];
  relief(profile,0xe2c375,.026);
  relief([[-.13,-.57],[-.025,-.55],[.05,-.61],[.02,-.69],[.15,-.89],[-.01,-.89],[-.065,-.70]],0x464c4b,.029);
  for(const line of [
    [[-.5,.55],[-.48,.70],[-.32,.83],[-.12,.86],[.09,.83]],
    [[-.53,.43],[-.49,.61],[-.33,.73],[-.18,.77]],
    [[.05,.90],[.21,.86],[.36,.72],[.39,.51]],
    [[-.32,.39],[-.22,.43],[-.12,.39]],[ [.07,.40],[.19,.43],[.29,.38] ],
    [[-.29,.32],[-.22,.35],[-.16,.31],[-.22,.30],[-.29,.32]],
    [[.10,.32],[.18,.35],[.24,.31],[.17,.29],[.10,.32]],
    [[-.02,.35],[-.055,.20],[-.11,.15],[-.04,.12],[.035,.15]],
    [[-.16,.035],[-.07,.065],[0,.04],[.075,.052],[.14,.012]],[[ -.085,-.007],[.05,-.012]],
    [[-.38,.09],[-.35,-.04],[-.28,-.16],[-.22,-.15],[-.18,-.23],[-.12,-.19],[-.04,-.25],[.02,-.20],[.09,-.22],[.14,-.15],[.19,-.17],[.25,-.08],[.32,-.08],[.38,.04]],
    [[-.42,-.38],[-.51,-.65],[-.36,-.71],[-.42,-.76],[-.18,-.87]],
    [[.39,-.36],[.56,-.55],[.46,-.63],[.55,-.67],[.42,-.88]],
    [[-.3,-.23],[-.16,-.50],[-.08,-.57],[.0,-.45],[.29,-.27]]
  ])incise(line);
}

function memorialGarden(batch,t,landmarks,roadbedAt) {
  const l=landmarks.find(p=>p.id==='ohsumi-memorial'),r=landmarks.find(p=>p.id==='koga-memorial');
  if(!l||!r)return;
  const dx=r.point[0]-l.point[0],dz=r.point[1]-l.point[1],dist=Math.hypot(dx,dz);
  const tx=dx/dist,tz=dz/dist;
  const P=(u,v,h=0)=>{const x=l.point[0]+u*tx+v*tz,z=l.point[1]+u*tz-v*tx;return [x,roadbedAt(x,z)+h,z];};
  const band=(a,b,c,d,h,col)=>{
    const parts=Math.max(1,Math.ceil(Math.abs(d-c)/.4));
    for(let i=0;i<parts;i++) {
      const e=c+(d-c)*i/parts,f=c+(d-c)*(i+1)/parts;
      t.quad(P(a,e,h),P(b,e,h),P(b,f,h),P(a,f,h),col);
    }
  };
  for(let u=-1.13;u<dist+1.1;u+=.36) {
    band(u,u+.36,-.88,1.08,.06,0x716455);
    band(u,u+.36,-3.65,-1.14,.097,0x93958c);
    band(u+.008,u+.35,-.88,-1.14,.103,0xa9afac);
    for(let k=0;k<7;k++)band(u+.025+k*.047,u+.040+k*.047,-.91,-1.10,.108,0x646e69);
    band(u+.008,u+.35,1.05,1.15,.136,0xa0765e);
  }
  for(let k=0;k<29;k++) {
    const u=-1+k*.213,height=.70+.72*(.5+.5*Math.sin(k*17.31)),root=P(u,1.5+.17*Math.sin(k*4.7),.06);
    const tip=P(u+.15,1.51+.3*Math.sin(k*4.7),height);
    batch.beam(root,tip,.022,.023,0x756e4c);
    for(let m=0;m<6;m++) {
      const frac=(m+1)/8,angle=k*7+m*2.28;
      const point=(f,side,h)=>[root[0]+(tip[0]-root[0])*frac+f*.235*Math.cos(angle)-side*Math.sin(angle),
        root[1]+(tip[1]-root[1])*frac+f*.056+h,root[2]+(tip[2]-root[2])*frac+f*.235*Math.sin(angle)+side*Math.cos(angle)];
      batch.beam(point(0,0,0),point(1,0,0),.012,.012,0x65794c);
      for(let n=0;n<3;n++)for(const side of [-1,1]) {
        const off=n*.22+.13,base=point(off,0,0),peak=point(off+.09,side*.041,.024),end=point(off+.26,side*.079,-.014);
        t.tri(base,peak,end,n%2?0x70884c:0x627d47);
        t.tri(base,end,point(off+.18,side*.023,.003),0x547343);
      }
    }
    if(k%3!==1)for(let n=0;n<9;n++) {
      const ang=n*2.4+k,rad=n<5?.027:.014;
      batch.put('stone',k%4===0?0xe7ac79:n%3?0xe7cc59:0xd4ac48,tip[0]+rad*Math.cos(ang),tip[1]+(n<5?0:.018),tip[2]+rad*Math.sin(ang),.029,.021,.032,ang);
    }
  }
  for(let i=0;i<18;i++) {
    const u=-1.4+i*.38,col=[0x565548,0x605647,0x564e43,0x646249][i%4];
    const p=P(u,2.47+.04*Math.sin(i*4.7),.70);
    batch.put('leaf',col,...p,.49,.56+.04*Math.sin(i),.51,i*2.4);
    if(i%2===0)batch.put('canopyFar',col,...p,.75,.54,.50,i*2.4);
    for(let j=0;j<4;j++) {
      const f=P(u+.12*Math.cos(j*2.4),2.1,.45+j*.16);
      batch.put('shoot',j%2?0x716350:0x595845,...f,.23,.23,.24,i+j);
    }
  }
}

export function landmarkFixtures(T,group,batch,triangles,landmarks,paths,solid,roadbedAt=groundAt) {
  memorialGarden(batch,triangles,landmarks,roadbedAt);
  for(const lm of landmarks) {
    const [x,z]=lm.point;
    const street=streetFrame(lm.point,paths),width=street.width;
    // The sloping inscription looks out towards the approach on the path.
    const heading=lm.kind==='memorial'?Math.atan2(x-lm.approach[0],z-lm.approach[1]):street.heading;
    const cs=Math.cos(heading),sn=Math.sin(heading);
    const local=(u,v)=>[x+u*cs+v*sn,z-u*sn+v*cs];
    const y=roadbedAt(x,z);
    const F=(u,h,v)=>{const [X,Z]=local(u,v);return [X,y+h,Z];};
    const box=(u,h,v,w,height,depth,col,turn=0,tilt=0)=>{
      const p=F(u,h,v);batch.put('box',col,...p,w,height,depth,heading+turn,tilt);
    };
    const pole=(u,v,h,d,col)=>{
      const [X,Z]=local(u,v);
      batch.put('post',col,X,roadbedAt(X,Z)+h/2,Z,d,h,d);
      solid(X,Z,d/2);
    };
    if(lm.kind==='memorial') {
      const W=.98,D=.84,front=.84,back=1.19;
      const corners=[[-W/2,-D/2],[W/2,-D/2],[W/2,D/2],[-W/2,D/2]];
      const top=(u,v,lift=0)=>F(u,front+(v+D/2)/D*(back-front)+lift,v);
      graniteBlock(T,group,corners,F,top);
      box(0,.07,0,1.13,.14,1.02,0x8f9397);
      const plate=(cx,cz,w,h,lift,col)=>triangles.quad(
        top(cx-w/2,cz-h/2,lift),top(cx+w/2,cz-h/2,lift),top(cx+w/2,cz+h/2,lift),top(cx-w/2,cz+h/2,lift),col);
      plate(0,.10,.78,.49,.009,0xb69b57);plate(0,.10,.72,.44,.014,0x262b29);
      plate(0,-.27,.81,.16,.01,0xc8ad6b);
      const ohsumi=lm.name.includes('大隅');
      const pitch=-Math.PI/2+Math.atan((back-front)/D);
      const wording=(s,u,v,w,h,col='#ead093',font='600 1em Georgia, serif')=>
        plaqueText(T,group,s,...top(u,v,.021),w,h,heading+Math.PI,pitch,col,font);
      if(ohsumi) {
        nobelPortrait(T,triangles,top);
        for(const [i,line] of ['Nobel Prize','in Physiology or','Medicine  2016'].entries())
          wording(line,.182,.239-i*.062,.313,.063);
        plate(.18,-.036,.29,.071,.017,0xd4b36b);
        wording('Yoshinori Ohsumi',.18,-.035,.26,.052,'#524734','italic 1em Georgia, serif');
        wording('大隅良典 栄誉教授　ノーベル賞受賞記念碑',.164,-.231,.43,.037,'#524735');
      } else {
        const optics=lm.id==='photonics-memorial';
        wording('IEEE MILESTONE',0,.251,.56,.074);
        const lines=optics?['Optical Semiconductor Lasers','Single-mode Semiconductor Lasers','Vertical-Cavity Surface-Emitting Lasers']:
          ['Temperature-Insensitive','Quartz Crystal Oscillator','1933'];
        for(const [i,line] of lines.entries())wording(line,0,.161-.061*i,.58,.051);
        wording(optics?'末松安晴・伊賀健一　半導体レーザ':'古賀逸策　温度無依存水晶振動子',0,-.231,.61,.039,'#524735');
      }
      for(let col=0;col<2;col++)for(let i=0;i<5;i++)
        plate((col-.5)*.38,-.26-i*.015,.326-(i===4?.047:0),.004,.016,0x998450);
      solid(x,z,.58);
    } else if(lm.name.includes('すずかけ門')) {
      gateApproach(T,group,triangles,batch,paths,solid,plaqueText,roadbedAt);
    } else if(lm.name.includes('岡部門')) {
      const side=Math.max(2.3,width*.5+.16);
      // Show the sliding gate retracted so the walking route stays open.
      for(const u of [-side,side])pole(u,0,1.53,.17,0x7a898e);
      for(let i=0;i<=16;i++)box(side+i*.17,.85,0,.036,1.31,.045,0x84979c);
      for(const h of [.23,1.46])box(side+1.36,h,0,2.8,.08,.08,0x63767a);
    } else if(lm.name.includes('長津田門')) {
      const side=Math.max(width*.5+.35,3.1);
      box(side,.43,0,.61,.86,2.8,0xaaa99e);
      pole(side,-1.22,1.36,.17,0x686e67);
      pole(-side,-1.05,1.32,.13,0x747d74);
      box(side+.24,1.54,.7,.78,.5,.08,0x4d747e);
    }
  }
}
