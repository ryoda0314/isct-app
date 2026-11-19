// Sculpture and exhibition joinery in the first-floor lobby, from IMG_1469 and IMG_1520.
import { lettering, infoCode, drawPicodyMark } from "./campus3dTakiLettering.js";
const TAU = 2 * Math.PI;
const order = [0,1,2,0,2,3];
const unit = v => {
  const d = Math.hypot(...v) || 1;
  return v.map(n => n/d);
};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((sum,x,i) => sum+x*b[i],0);

// Metres. Local x is the visitor's right, y points out into the lobby, z is up.
export function displaySpace(M, front, depth, z0, T) {
  const forward = front.nf, right = [-forward[1], forward[0]];
  const center = front.a.map((v,i) => (v+front.b[i]-forward[i]*depth)/2);
  const point = ([x,y,z]) => [[center[0]+right[0]*x+forward[0]*y,center[1]+right[1]*x+forward[1]*y],z0+z];
  const normal = ([x,y,z]) => [right[0]*x+forward[0]*y,right[1]*x+forward[1]*y,z];
  const light = unit([-.38,.44,.82]), half = unit([-.22,.66,.72]);
  function tint(color, n, gloss) {
    const gain = .78 + .22*Math.max(-.45,dot(n,light));
    const shine = gloss*Math.pow(Math.max(0,dot(n,half)),24);
    return color.map((v,i) => i===3 ? v : Math.min(1,v*gain+shine));
  }
  function quad(vertices, n, color) {
    M.m.quad(vertices.map(point),normal(n),tint(T(color),n,0));
  }
  function triangle(vertices, n, color) {
    const N=normal(n), c=tint(T(color),n,0);
    for (const p of vertices) M.m.vert(...point(p),N,c);
  }
  function surface(around, levels, sample, paint, gloss=.04, glass=false) {
    const mesh = glass ? M.glassy : M.m;
    if (!mesh) return;
    const color = T(paint);
    const rows = Array.from({length:levels+1},(_,j) =>
      Array.from({length:around+1},(_,i) => {
        const [p,n] = sample(i/around,j/levels);
        return [...point(p),normal(n),tint(color,n,gloss)];
      }));
    for (let j=0;j<levels;j++) for (let i=0;i<around;i++) {
      const vs=[rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]];
      for (const k of order) mesh.vert(...vs[k]);
    }
  }
  function ellipsoid(center, radii, color, gloss=.035, tilt=0) {
    const c=Math.cos(tilt), s=Math.sin(tilt);
    const rotate=([x,y,z])=>[x*c+z*s,y,-x*s+z*c];
    const diameter=Math.max(...radii)*2, slices=diameter<.05 ? 10 : diameter<.25 ? 16 : 24;
    surface(slices,slices/2,(u,v)=>{
      const a=TAU*u, b=Math.PI*(v-.5);
      const dir=[Math.sin(a)*Math.cos(b),Math.cos(a)*Math.cos(b),Math.sin(b)];
      const delta=rotate(dir.map((w,i)=>w*radii[i]));
      return [delta.map((w,i)=>w+center[i]),rotate(unit(dir.map((w,i)=>w/radii[i])))];
    },color,gloss);
  }
  function tube(a,b,ra,rb,color) {
    const axis=unit(b.map((v,i)=>v-a[i]));
    const across=unit(cross(axis,Math.abs(axis[2])>.85?[1,0,0]:[0,0,1])), other=cross(axis,across);
    surface(14,1,(u,v)=>{
      const angle=TAU*u, n=across.map((w,i)=>w*Math.cos(angle)+other[i]*Math.sin(angle));
      return [n.map((w,i)=>a[i]+(b[i]-a[i])*v+w*(ra+(rb-ra)*v)),n];
    },color);
  }
  function box(x0,y0,x1,y1,b,t,color) {
    const pts=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const ns=[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]];
    quad(pts.map(q=>[...q,t]),[0,0,1],color);
    quad(pts.slice().reverse().map(q=>[...q,b]),[0,0,-1],color);
    pts.forEach((p,i)=>{const q=pts[(i+1)%4];quad([[...p,b],[...q,b],[...q,t],[...p,t]],ns[i],color);});
  }
  function contact(x,y,z,rx,ry,color) {
    const up=[0,0,1], base=tint(T(color),up,0);
    const vertex=(a,r)=>[...point([x+rx*Math.cos(a)*r,y+ry*Math.sin(a)*r,z]),up,
      base.map((c,i)=>i===3 ? c : c*(1-.24*(1-r*r)**2))];
    for (const start of [0,.5]) for (let i=0;i<20;i++) {
      const a=TAU*i/20,b=TAU*(i+1)/20;
      const vs=[vertex(a,start),vertex(b,start),vertex(b,start+.5),vertex(a,start+.5)];
      for (const k of order) M.m.vert(...vs[k]);
    }
  }
  return { point, normal, triangle, quad, surface, ellipsoid, tube, box, contact };
}

const upright = y => ({ at:(x,z,d=0)=>[x,y+d,z], n:[0,1,0] });

// Nested curved shells follow the cheeks all the way to the temples. Each has
// a rounded crown and a short return of its own at the outline.
function sculptFace(g) {
  const head = (x,z) => .031 + .185*Math.sqrt(Math.max(.006,1-(x/.242)**2-((z-.630)/.193)**2));
  function patch(cx,cz,outline,rise,crown,color) {
    const steps=outline.length;
    g.surface(steps,5,(u,v)=>{
      const [ex,ez]=outline[Math.round(u*steps)%steps];
      const r=Math.min(1,v*1.25), x=cx+(ex-cx)*r, z=cz+(ez-cz)*r;
      const h=head(x,z), cap=rise + crown*(1-r*r);
      const y=h+cap*(v<=.8?1:(1-v)*5);
      const shape=unit([x/.242**2,(h-.031)/.185**2,(z-.630)/.193**2]);
      const n=v<=.8 ? unit([shape[0]+(ex-cx)*r,shape[1],shape[2]+(ez-cz)*r]) :
        unit([ex-cx,.005,ez-cz]);
      return [[x,y,z],n];
    },color,.065);
  }
  function oval(cx,cz,rx,rz,tilt,rise,crown,color) {
    const outline=Array.from({length:28},(_,i)=>{
      const a=TAU*i/28, dx=rx*Math.cos(a), dz=rz*Math.sin(a);
      return [cx+dx*Math.cos(tilt)-dz*Math.sin(tilt),cz+dx*Math.sin(tilt)+dz*Math.cos(tilt)];
    });
    patch(cx,cz,outline,rise,crown,color);
  }
  for (const s of [-1,1]) {
    oval(s*.151,.544,.042,.015,s*.12,.0015,.001,"#edc5a8");
    oval(s*.127,.626,.084,.089,s*.12,.004,.005,"#382d29");
    oval(s*.121,.619,.074,.079,s*.09,.009,.005,"#fff4d7");
    oval(s*.113,.623,.062,.076,s*.045,.015,.005,"#946322");
    oval(s*.112,.621,.058,.070,s*.045,.020,.006,"#e7ac27");
    oval(s*.104,.627,.015,.024,0,.027,.003,"#795027");
    oval(s*.104,.628,.010,.018,0,.031,.003,"#fff4ca");
    patch(s*.129,.722,[[s*.069,.704],[s*.086,.745],[s*.122,.755],
      [s*.153,.742],[s*.179,.709],[s*.144,.723],[s*.109,.727]],.011,.006,"#986121");
    patch(s*.150,.777,[[s*.072,.801],[s*.125,.806],[s*.170,.774],[s*.191,.742],
      [s*.166,.715],[s*.150,.742],[s*.127,.713],[s*.108,.750]],.014,.007,"#e6be65");
  }
  patch(-.039,.755,[[-.116,.783],[-.105,.807],[-.053,.818],[.028,.814],
    [.066,.797],[.070,.768],[.064,.741],[.039,.719],[.012,.707],[-.021,.682],
    [-.047,.678],[-.073,.686],[-.092,.709],[-.106,.738]],.019,.019,"#be8538");
  patch(.003,.514,[[-.042,.525],[-.021,.522],[.006,.523],[.039,.530],[.034,.516],
    [.022,.505],[.009,.498],[-.004,.497],[-.021,.503],[-.034,.514]],.004,.002,"#714333");
  patch(.004,.502,[[-.016,.505],[.004,.507],[.020,.508],[.013,.501],[-.001,.499]],.008,.001,"#c98068");
  g.ellipsoid([.002,head(.002,.553)+.004,.553],[.019,.015,.015],"#528f94",.18);
}

export function addPicody(M,F,D,z0,z1,T) {
  const pedestal = z1-z0-1.012;
  if (pedestal < .04) return;
  const base = displaySpace(M,F,D,z0,T), W=F.L;
  base.box(-W/2,-D/2,W/2,D/2,0,pedestal,"#f3f0e8");
  const w=W*.347, low=pedestal*.19, high=pedestal*.88;
  base.box(-w,D/2,w,D/2+.004,low,high,"#eeece3");
  const plate=upright(D/2+.004);
  lettering(base,plate,"「ピコディー」等身大フィギュア",0,low+(high-low)*.72,w*1.74,.024,"#48423b");
  lettering(base,plate,"工大祭公式マスコットキャラクター",0,low+(high-low)*.49,w*1.55,.014,"#4e4a44");
  lettering(base,plate,"東京科学大学 ものつくりセンター",0,low+(high-low)*.28,w*1.45,.014,"#4e4a44");
  const g=displaySpace(M,F,D,z0+pedestal,T);
  const white="#faf8eb", coat="#f6f3e8", gold="#f6c51f", rim="#edb617", teal="#4e9baa", skin="#f1d5b1";
  for (const s of [-1,1]) {
    base.contact(s*.104,.018,pedestal+.0007,.104,.151,"#f3f0e8");
    const boot=[[.0,.84],[.010,.96],[.028,1],[.065,.99],[.089,.91],[.108,.71],[.119,.35],[.121,0]];
    g.surface(24,boot.length-1,(u,v)=>{
      const j=Math.min(boot.length-2,Math.floor(v*(boot.length-1))), t=v*(boot.length-1)-j;
      const [lo,r0]=boot[j],[hi,r1]=boot[j+1], r=r0+(r1-r0)*t;
      const a=TAU*u, z=lo+(hi-lo)*t;
      return [[s*.096+.089*r*Math.sin(a),.049+.118*r*Math.cos(a)-z*.18,z],
        unit([Math.sin(a),Math.cos(a),.094*(r0-r1)/(hi-lo)])];
    },white);
    g.ellipsoid([s*.099,.003,.169],[.065,.070,.105],coat);
    g.ellipsoid([s*.097,.062,.157],[.031,.016,.034],gold);
  }
  // Flared jacket with a rolled hem and raised collar.
  const coatRings=[[.190,.135],[.202,.162],[.219,.180],[.239,.184],[.258,.170],[.353,.131],[.417,.105],[.436,.109],[.455,.105]];
  const jacket=(angle,v)=>{
    const level=Math.min(coatRings.length-2,Math.floor(v*(coatRings.length-1)));
    const t=v*(coatRings.length-1)-level,[lo,r0]=coatRings[level],[hi,r1]=coatRings[level+1];
    const r=r0+(r1-r0)*t;
    return [[r*Math.sin(angle),r*.84*Math.cos(angle),lo+(hi-lo)*t],
      unit([Math.sin(angle),Math.cos(angle)/.84,(r0-r1)/(hi-lo)])];
  };
  g.surface(32,coatRings.length-1,(u,v)=>jacket(TAU*u,v),coat);
  g.surface(2,coatRings.length-1,(u,v)=>{
    const [p,n]=jacket(.32+.14*u,v);return [[p[0]*1.008,p[1]*1.008,p[2]],n];
  },gold);
  for (const z of [.327,.354]) {
    const radius=.131-(z-.353)*.39, y=radius*.84;
    g.box(.013,y-.012,.091,y+.008,z-.005,z+.007,gold);
  }
  for (const s of [-1,1]) {
    const raised=s===1;
    const shoulder=[s*.078,-.01,.407], wrist=raised?[.311,.014,.510]:[-.190,.053,.292];
    const palm=raised?[.336,.033,.528]:[-.209,.071,.266];
    g.tube(shoulder,wrist,.064,.042,coat);
    const cuff=wrist.map((v,i)=>v+(palm[i]-v)*.37);
    g.tube(wrist,cuff,.047,.046,gold);
    g.ellipsoid(palm,[.033,.025,.047],white,.04,raised?.9:.56);
    for (let i=0;i<4;i++) {
      const a=raised?[.349,.035,.497+i*.017]:[-.220+i*.009,.074,.262+i*.003];
      const b=raised?[.393+.007*Math.sin(i),.042,.487+i*.030]:[-.259+i*.014,.089,.219+i*.005];
      g.tube(a,b,.011,.007,white);g.ellipsoid(b,[.008,.008,.010],white);
    }
    if (raised) {
      g.tube([.322,.042,.545],[.329,.061,.586],.014,.010,white);
      g.ellipsoid([.329,.061,.586],[.010,.010,.013],white);
    }
  }
  // Front-opening helmet. Its lower edge descends around the back of the head.
  const cap=(u,v)=>{
    const a=TAU*u, back=(1-Math.cos(a))*.5;
    const phi=.015+(1.30+.91*back)*v;
    const dir=[Math.sin(a)*Math.sin(phi),Math.cos(a)*Math.sin(phi),Math.cos(phi)];
    return [[.285*dir[0],-.030+.224*dir[1],.727+.251*dir[2]],unit(dir)];
  };
  g.surface(40,15,cap,gold,.19);
  for (const s of [-1,1]) {
    // The upper ends of the ear guards sweep into the dome rather than ending
    // in upright points. Their lower ends are rounded below the jaw.
    g.surface(22,16,(u,v)=>{
      const a=TAU*u, lat=Math.PI*(v-.5), c=Math.cos(lat), z=.659+.232*Math.sin(lat);
      const inward=.09*Math.max(0,(z-.70)/.191)**1.4;
      const n=[Math.sin(a)*c,Math.cos(a)*c,Math.sin(lat)];
      return [[s*(.243-inward)+.058*n[0],.051+.151*n[1],z],unit([n[0]/.058,n[1]/.151,n[2]/.232])];
    },gold,.14);
    g.ellipsoid([s*.283,-.040,.688],[.077,.119,.117],rim,.12);
    g.ellipsoid([s*.309,-.042,.694],[.078,.097,.094],teal,.22);
    const a=[s*.209,-.045,.902], b=[s*.241,-.052,.994];
    g.tube(a,b,.021,.021,"#407987");g.ellipsoid(b,[.022,.022,.018],"#478694",.13);
  }
  g.ellipsoid([0,.031,.630],[.242,.185,.193],skin);
  sculptFace(g);
  // A clear curved visor projects beyond the brow, with a turned lower edge.
  const visor=(u,v)=>{
    const a=(u-.5)*2.65, temple=Math.abs(Math.sin(a));
    const top=.35+.70*temple**1.6, bottom=1.72-.10*temple+.18*temple**6;
    const phi=top+(bottom-top)*v;
    const n=[Math.sin(a)*Math.sin(phi),Math.cos(a)*Math.sin(phi),Math.cos(phi)];
    return [[.269*n[0],.012+.258*n[1],.685+.251*n[2]],n];
  };
  g.surface(26,7,visor,"#e1d9b6",.15,true);
  for (let i=0;i<26;i++) g.tube(visor(i/26,1)[0],visor((i+1)/26,1)[0],.0019,.0019,"#c9b885");
}

export function addPicodyStand(M,F,D,z0,z1,T) {
  const g=displaySpace(M,F,D,z0,T), w=F.L/2, h=z1-z0, d=D*.34;
  const wood="#bd9c67";
  g.box(-.023,-.023,.023,.023,.020,h-.065,wood);
  // Low, triangular timber feet and braces are visible from both sides.
  for (const s of [-1,1]) {
    const run=[[s*.012,-D*.37],[s*.032,-D*.37],[s*w*.89,D*.44],[s*w*.71,D*.44]];
    g.quad(run.map(p=>[...p,.027]),[0,0,1],wood);
    for (let i=0;i<4;i++) {
      const a=run[i],b=run[(i+1)%4];
      g.quad([[...a,.003],[...b,.003],[...b,.027],[...a,.027]],unit([b[1]-a[1],a[0]-b[0],0]),wood);
    }
    g.tube([0,0,.146],[s*w*.76,D*.39,.02],.015,.014,wood);
  }
  g.box(-w*.82,D*.38,w*.82,D*.44,.004,.025,wood);
  const front=h-.12, top=[[-w,d,front],[w,d,front],[w,-d,h],[-w,-d,h]];
  const n=unit([0,.12,2*d]);
  g.quad(top,n,wood);
  top.forEach((a,i)=>{
    const b=top[(i+1)%4],down=p=>[p[0],p[1],p[2]-.013];
    g.quad([down(a),down(b),b,a],unit([b[1]-a[1],a[0]-b[0],0]),"#96784e");
  });
  const run=Math.hypot(.12,2*d);
  const plane={at:(x,v,offset=0)=>[x,d-2*d*v/run+n[1]*offset,front+.12*v/run+n[2]*offset],n};
  const ink="#57442d";
  lettering(g,plane,"常設展示：ピコディー等身大フィギュア",0,run*.77,2*w*.90,.019,ink);
  lettering(g,plane,"工大祭公式マスコットキャラクター「ピコディー」",0,run*.62,2*w*.86,.009,ink);
  lettering(g,plane,"ものつくりセンターにて制作されました。",0,run*.53,2*w*.81,.009,ink);
  infoCode(g,plane,-w*.87,run*.12,run*.30,ink);
  drawPicodyMark(g,plane,-w*.30,run*.13,run*.27,ink);
  lettering(g,plane,"ピコディーの等身大フィギュア",w*.28,run*.31,w*1.03,.009,ink);
  lettering(g,plane,"詳しくはこちら",w*.28,run*.20,w*.67,.009,ink);
}
