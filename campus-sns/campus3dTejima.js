import { unit } from "./campus3dMarketGeometry.js";
import { tejimaPortrait } from "./campus3dTejimaPortrait.js";

// West-facing seated portrait in front of the GSIC. The chair and figure share
// a casting. These dimensions are in metres above the upper bronze plinth.
const bronze = "patina:#777a72", coat = "patina:#6a6c69", crease = "patina:#51544e";
const edge = "patina:#888d80", flesh = "patina:#838983";
const TAU = Math.PI * 2;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const normal = (a, b) => unit([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]);

// Smooth elliptical sections. The optional opening follows the front edges of
// the unbuttoned jacket. It leaves the waistcoat visible between the lapels.
function sections(m, rows, material, relief, open = false) {
  const count = m.detail ? 32 : 18;
  const rings = rows.map(([z, x, y, w, d, gap = 0], row) =>
    Array.from({ length: count + 1 }, (_, i) => {
      const angle = gap + (TAU - 2 * gap) * i / count;
      const k = relief?.(angle, row) ?? 1;
      return [x + w * Math.sin(angle) * k, y - d * Math.cos(angle) * k, z];
    })
  );
  const start = m.v.length / 10;
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j], low = rings[Math.max(0, j-1)], high = rings[Math.min(rings.length-1, j+1)];
    for (let i = 0; i <= count; i++) {
      const prev = i ? i-1 : open ? 0 : count-1;
      const next = i < count ? i+1 : open ? count : 1;
      m.vertex(ring[i], normal(sub(ring[next],ring[prev]), sub(high[i],low[i])), material);
      if (j && i) {
        const d = start+j*(count+1)+i, a = d-count-2;
        m.i.push(a,a+1,d,a,d,d-1);
      }
    }
  }
  if (!open) {
    m.face(rings[0].slice(0,count).reverse(),material,[0,0,-1]);
    m.face(rings[rings.length-1].slice(0,count),material,[0,0,1]);
  }
}

function chair(m) {
  const metal = "patina:#565d55";
  for(const x of [-.49,.49]) for(const y of [-.287,.39]) {
    m.loft([[0,.127],[.023,.137],[.045,.105],[.31,.100],[.36,.133],[.41,.120],[.445,.148]]
      .map(([z,w])=>m.rect(x,y,z,w,w)),metal);
  }
  m.loft([[.425,1.125,.845],[.455,1.16,.86],[.557,1.16,.86],[.574,1.155,.85],[.592,1.10,.81]]
    .map(([z,w,d])=>m.rect(0,.061,z,w,d)),metal);
  for(const x of [-.489,.489]) {
    for(const y of [-.257,.334]) {
      m.loft([[.566,.132],[.615,.119],[.830,.088],[.897,.115],[.923,.140]]
        .map(([z,w])=>m.rect(x,y,z,w,w)),bronze);
    }
    m.loft([[.903,.15,.79],[.925,.178,.835],[.969,.179,.84],[.985,.163,.80]]
      .map(([z,w,d])=>m.rect(x,.064,z,w,d)),bronze);
    m.box(x,.397,.57,.082,.086,.65,metal);
  }
  m.box(0,.420,.60,.999,.061,.61,metal);
  m.box(0,.382,.647,.867,.029,.513,bronze);
  for(const x of [-.497,.497]) m.box(x,.399,.596,.063,.083,.641,bronze);
  m.box(0,.393,1.187,1.051,.092,.046,edge);
  for(const x of [-.45,0,.45]) {
    m.box(x,-.373,.463,.199,.020,.080,crease);
    for(const s of [-1,1])m.tube([[x,-.390,.497],[x+s*.036,-.392,.525],[x+s*.072,-.39,.516],[x+s*.052,-.39,.49],[x+s*.026,-.39,.494]],.005,edge,6);
  }
}

function bootAndLeg(m,s) {
  const k=s<0?0:.061, knee=.260*s, ankle=.301*s;
  const folds=(a,j)=>1+.037*Math.cos(3*a+j*.11)+.020*Math.sin(6*a-j*.50);
  sections(m,[[.105,ankle,-.338-k,.096,.094],[.163,ankle,-.341-k,.106,.102],
    [.198,ankle,-.317-k,.112,.123],[.314,.288*s,-.298-k,.100,.117],
    [.531,.277*s,-.313-k,.116,.122],[.686,knee,-.353-k,.130,.135],
    [.798,knee,-.336-k,.130,.140],[.831,knee,-.312-k,.092,.102]],coat,folds);
  // A separate lengthwise, tapered surface joins the knees to the seated pelvis.
  const n=m.detail?22:14, rings=[[-.399-k,knee,.756,.084,.060],[-.340-k,knee,.728,.137,.108],
    [-.196,.240*s,.691,.131,.109],[.022,.177*s,.641,.149,.109],[.192,.135*s,.619,.142,.104]];
  m.loft(rings.map(([y,x,z,rx,rz])=>Array.from({length:n},(_,i)=>{
    const a=TAU*i/n;return [x+rx*Math.cos(a),y,z+rz*Math.sin(a)];})),coat);
  m.tube([[knee,-.436-k,.769],[knee+s*.019,-.432-k,.686],[ankle,-.426-k,.454],[ankle-s*.012,-.417-k,.236]],[.006,.007,.005,.0025],bronze,6);
  const drape=[[s*.080,-.170,.681],[s*.127,-.211,.702],[s*.183,-.254,.750],[s*.224,-.294,.782]];
  for(const off of [0,.035]) {
    const ridge=drape.map(([x,y,z])=>[x+s*off,y-.010,z+.005-off*.24]);
    for(let j=1;j<ridge.length;j++){
      const a=ridge[j-1],b=ridge[j];
      m.face([a,b,[b[0]+s*.018,b[1]+.009,b[2]-.014],[a[0]+s*.015,a[1]+.009,a[2]-.012]],bronze,[0,-.5,.8]);
    }
  }
  for(const [z,y] of [[.20,-.395-k],[.65,-.420-k]])
    m.tube([[ankle-.073,y+.059,z+.029],[ankle-.029,y+.011,z],[ankle+.027,y,z+.014],[ankle+.074,y+.039,z+.035]],
      [.0015,.0045,.005,.002],crease,6);
  const shoeY=-.413-k;
  sections(m,[[.013,ankle,shoeY-.044,.087,.183],[.032,ankle,shoeY-.046,.092,.185],[.043,ankle,shoeY-.043,.091,.182]],crease);
  sections(m,[[.040,ankle,shoeY-.041,.089,.179],[.072,ankle,shoeY-.040,.087,.170],
    [.101,ankle,shoeY-.019,.085,.145],[.146,ankle,shoeY+.050,.077,.084],[.174,ankle,shoeY+.067,.071,.065]],bronze);
  for(let i=0;i<3;i++)m.tube([[ankle-.036,shoeY-.049+i*.019,.103+i*.006],[ankle,shoeY-.064+i*.019,.109+i*.006],
    [ankle+.033,shoeY-.048+i*.019,.103+i*.006]],.0035,edge,6);
}

function handAndSleeve(m,s) {
  const x=s*.365, y=s<0?-.251:-.192, z=s<0?.969:.949;
  sections(m,[[.901,s*.420,.005,.079,.083],[.968,s*.420,.040,.087,.109],
    [1.076,s*.379,.082,.097,.104],[1.189,s*.326,.112,.111,.107],
    [1.253,s*.286,.126,.103,.102],[1.301,s*.244,.133,.079,.081]],coat);
  m.tube([[s*.424,.050,.957],[s*.421,-.037,.952],[s*.408,-.123,.968],[x,y+.07,z+.032]],[.085,.088,.076,.072],coat,16);
  m.tube([[x+s*.013,y+.095,z+.032],[x,y+.049,z+.035]],[.076,.073],edge,16);
  m.oval(x,y,z+.031,.068,.084,.053,flesh,18,9);
  for(let i=0;i<4;i++) {
    const fx=x+s*(i-1.5)*.025, fy=y-.043+Math.abs(i-1.3)*.010;
    const reach=[.070,.086,.076,.053][i], curled=s>0;
    const tip=[fx-s*(curled?.007:.002),fy+(curled?.009:-.031),z-reach*(curled?.47:.91)];
    m.tube([[fx,fy+.014,z+.057],[fx+s*.002,fy-.024,z+.039],
      [fx+s*.004,fy-.043,z+.009],[fx,fy-(curled?.029:.041),z-reach*.42],tip],
      [.014,.016,.015,.012,.008],flesh,10);
    m.oval(...tip,.009,.011,.010,flesh,10,6);
    if(m.detail && !curled) {
      m.tube([[x+s*(i-1.5)*.012,y+.052,z+.070],[fx,y+.008,z+.080],
        [fx,fy-.003,z+.061]],[.0015,.0035,.0018],flesh,6);
    }
  }
  m.tube([[x-s*.040,y+.002,z+.044],[x-s*.063,y-.022,z+.025],[x-s*.070,y-.042,z+.001],[x-s*.058,y-.056,z-.013]],[.020,.019,.015,.010],flesh,9);
}

function neckAndCollar(m) {
  const neck = "portraitBronze:#5d605b", shirt = "patina:#999b94";
  const neckRows = [[1.215,.070,.088],[1.239,.077,.085],[1.267,.073,.074],[1.294,.069,.065],
    [1.324,.063,.060],[1.355,.066,.065],[1.390,.074,.071]];
  sections(m,neckRows.map(([z,w,d])=>[z,0,.115,w,d]),neck,(angle,j)=>{
    const a=Math.min(angle,TAU-angle), tendon=.27+.155*j;
    return 1+.16*Math.exp(-((a-tendon)**2)/.052)-.052*Math.exp(-a*a/.072);
  });
  // The high collar wraps behind the jaw. Two turned-down leaves meet at the
  // tie knot; their exposed lower corners stand proud of the shirt front.
  sections(m,[[1.235,0,.112,.093,.090,.83],[1.263,0,.113,.088,.086,.80],
    [1.289,0,.115,.082,.078,.76],[1.314,0,.116,.078,.071,.85],
    [1.336,0,.120,.074,.073,1.04]],shirt,null,true);
  for(const s of [-1,1]){
    const tendon=[[1.218,.013,.024,.004,.003],[1.241,.022,.030,.008,.006],
      [1.276,.035,.047,.011,.0065],[1.310,.047,.064,.010,.006],[1.348,.060,.089,.005,.004]];
    sections(m,tendon.map(([z,x,y,w,d])=>[z,s*x,y,w,d]),"portraitBronze:#787b75");
    const rows=[
      [[.017,.013,1.272],[.042,.022,1.288],[.065,.052,1.321]],
      [[.021,.006,1.266],[.048,.013,1.277],[.078,.043,1.314]],
      [[.026,.002,1.259],[.055,.004,1.264],[.081,.034,1.302]],
      [[.030,-.004,1.247],[.054,-.001,1.247],[.071,.020,1.284]]
    ].map(row=>row.map(([x,y,z])=>[s*x,y-.014*(1-x/.085),z-.045*Math.max(0,1-(x-.022)/.060)]));
    for(let j=1;j<rows.length;j++)for(let i=1;i<3;i++)
      m.face([rows[j-1][i-1],rows[j-1][i],rows[j][i],rows[j][i-1]],shirt,[s*.2,-1,.18]);
    m.tube(rows.at(-1),[.0013,.0024,.0013],edge,6);
  }
  sections(m,[[1.187,0,-.036,.011,.011],[1.200,0,-.030,.017,.014],
    [1.219,0,-.021,.024,.016],[1.229,0,-.014,.020,.014]],bronze);
  sections(m,[[1.060,0,-.066,.004,.004],[1.099,0,-.056,.020,.009],
    [1.145,0,-.044,.016,.010],[1.177,0,-.036,.011,.009],[1.193,0,-.034,.012,.010]],bronze,
    (a,j)=>1+.12*Math.cos(3*a+.22*j));
}

function jacket(m) {
  sections(m,[[.571,0,.063,.244,.179],[.610,0,.046,.294,.204],[.650,0,.013,.283,.247],
    [.690,0,-.010,.192,.231],[.733,0,.024,.120,.165]],coat);
  sections(m,[[.595,0,.089,.233,.151],[.712,0,.074,.246,.163],[.845,0,.085,.220,.171],
    [1.043,0,.111,.239,.166],[1.207,0,.130,.283,.148],[1.254,0,.138,.258,.128],[1.283,0,.130,.131,.101]],bronze,
    (angle,j)=>1-(j<4?0:j===4?.20:.34)*Math.exp(-((Math.min(angle,TAU-angle)/.43)**2)));
  // The lower coat tails hang to each side of the seat.
  sections(m,[[.477,0,.126,.473,.243,1.37],[.566,0,.113,.453,.258,1.26],
    [.671,0,.079,.354,.272,.83],[.748,0,.059,.296,.255,.42],[.846,0,.079,.252,.203,.21],
    [1.032,0,.113,.254,.185,.34],[1.186,0,.128,.289,.161,.48],
    [1.262,0,.133,.283,.145,.55],[1.299,0,.128,.154,.110,.65]],coat,
    (a,j)=>1+(j<4?.065:.012)*Math.sin(7*a+.27*j),true);
  neckAndCollar(m);
  for(const s of [-1,1]){
    const flip=pts=>pts.map(([x,y,z])=>[s*x,y,z]);
    const lapel=[
      [[.054,-.091,.910],[.044,-.095,.893]],[[.084,-.078,1.020],[.111,-.080,1.051]],
      [[.103,-.062,1.111],[.157,-.053,1.126]],[[.099,-.043,1.183],[.217,-.010,1.199]],
      [[.096,-.035,1.207],[.175,-.008,1.216]],[[.084,-.011,1.251],[.216,.029,1.252]],
      [[.068,.036,1.318],[.111,.059,1.309]]
    ].map(flip);
    for(let j=1;j<lapel.length;j++){
      const [a,b]=lapel[j-1], [c,d]=lapel[j];
      m.face([a,b,d],bronze,[s*.2,-1,.25]);
      m.face([a,d,c],bronze,[s*.2,-1,.25]);
    }
    m.tube(flip([[.043,-.096,.893],[.119,-.069,1.090],[.212,-.014,1.198],[.179,-.010,1.215]]),.0048,edge,6);
    m.tube(flip([[.098,-.089,.785],[.152,-.075,.800],[.207,-.039,.816]]),.006,crease,7);
    bootAndLeg(m,s);handAndSleeve(m,s);
  }
  for(const [z,y] of [[1.080,-.060],[1.006,-.066],[.936,-.079],[.860,-.089],[.782,-.091]])
    m.oval(.011,y,z,.010,.005,.010,edge,9,5);
  for(const s of [-1,1]){
    m.face([[s*.014,-.093,.873],[s*.089,-.092,.856],[s*.140,-.102,.756],[s*.077,-.132,.719],
      [s*.015,-.145,.747]],bronze,[0,-1,.32]);
    m.tube([[s*.011,-.145,.746],[s*.077,-.134,.718],[s*.140,-.103,.755]],[.004,.005,.002],edge,6);
  }
  tejimaPortrait(m);
}

function bronzeBase(m) {
  const z=1.640;
  const profile=[[0,1.59,1.55],[.025,1.63,1.59],[.038,1.61,1.57],[.062,1.561,1.524],
    [.106,1.53,1.50],[.118,1.535,1.50],[.131,1.55,1.515],[.196,1.525,1.492],[.213,1.49,1.461]];
  m.loft(profile.map(([h,w,d])=>m.rect(0,-.010,z+h,w,d)),edge);
  for(let side=0;side<4;side++){
    const world=(u,v,h)=>side===0?[u,-v-.01,z+h]:side===1?[v,u-.01,z+h]:
      side===2?[-u,v-.01,z+h]:[-v,-u-.01,z+h];
    const fillet=side%2?.772:.753;
    for(let i=0;i<12;i++){
      const x=(i-5.5)*.120;
      const line=Array.from({length:12},(_,j)=>{
        const a=j/11*Math.PI*1.78;return world(x-.038+.036*Math.cos(a),fillet,.164+.025*Math.sin(a));});
      m.tube(line,m.detail?.0048:.006,bronze,5);
      m.tube([world(x+.004,fillet,.145),world(x+.031,fillet+.002,.178),world(x+.053,fillet,.178)],[.005,.007,.002],edge,6);
      if(m.detail)for(const off of [-.025,.025])m.tube([world(x+off,fillet+.005,.052),world(x+off*.76,fillet-.003,.078),world(x+off*.52,fillet-.006,.102)],[.004,.007,.003],bronze,5);
    }
  }
  return z+.213;
}

function monument(m) {
  m.box(0,0,0,2.087,2.087,1.632,"#353635");
  for (const ix of [-1,1]) for(const iy of [-1,1])
    m.loft([m.rect(ix*.525,iy*.525,.006,1.047,1.047),m.rect(ix*.525,iy*.525,1.635,1.047,1.047),
      m.rect(ix*.525,iy*.525,1.640,1.043,1.043)],"polishedGranite:#514e53");
  const height=bronzeBase(m), start=m.v.length;
  chair(m);jacket(m);
  for(let i=start+2;i<m.v.length;i+=10)m.v[i]+=height;
}

// Raised cast strokes on the sloping name stone: 手島精一先生. Each polyline
// is in a 10-unit character square, with the top of the inscription uphill.
const inscription = [
  [[[2,7.9],[5,8.3],[7.7,9]],[[1.7,6.3],[8.2,6.5]],[[.8,4.3],[9.3,4.6]],[[5.3,8.3],[5.5,1.8],[5.1,.8],[3.7,1.5]]],
  [[[4.3,8.5],[5,9.5]],[[2.6,8.3],[2.6,3.4],[8.8,3.4],[8.4,1],[7.4,.9]],[[2.7,8.3],[7.2,8.4],[7.3,5.8],[2.6,5.7]],[[2.9,7.1],[7.1,7.2]],[[2.6,4.5],[9,4.6]],[[1.3,2.9],[1.3,1.5],[6.5,1.6],[6.6,2.9]],[[3.8,3.3],[3.9,1.6]]],
  [[[2.6,9.1],[2.8,.9]],[[.8,7.9],[1.9,6.3]],[[4.3,8.2],[3.3,6.2]],[[.4,5.5],[4.6,5.6]],[[2.7,5.4],[.3,2]],[[2.9,4.9],[4.3,3.3]],[[6.7,9.3],[6.9,5.3]],[[4.6,8.1],[8.8,8.3]],[[4.8,6.8],[8.6,7]],[[4.2,5.4],[9.4,5.5]],[[5.1,.8],[5.1,4.4],[8.3,4.5],[8.4,.9],[7.5,1.2]],[[5.2,3.3],[8.2,3.4]],[[5.2,2.2],[8.3,2.3]]],
  [[ [.7,4.8],[3.4,5.0],[7.7,5.2],[9.3,5.1] ]],
  [[[3,8.9],[2.6,7],[1.5,5.5]],[[2.5,7.2],[8,7.4]],[[5.1,9.2],[5.2,5]],[[.7,4.7],[9.1,4.9]],[[3.9,4.7],[3.7,3.1],[2.8,1.8],[1.2,.8]],[[6,4.9],[6.1,1.7],[6.6,1.2],[8.8,1.2],[9.1,2.7]]],
  [[[3.1,8.8],[2.6,7],[1.1,5.2]],[[2.9,7.1],[8.6,7.4]],[[5.4,9.1],[5.4,1.1]],[[2.2,4.4],[8.3,4.6]],[[.6,1.1],[9.5,1.3]]]
];
function nameStone(m) {
  m.box(0,0,.018,.748,.433,.12,"polishedGranite:#626064");
  const front=.166, back=.292;
  const top=m.rect(0,0,0,.755,.445).map(([x,y])=>[x,y,y<0?front:back]);
  m.loft([m.rect(0,0,.082,.735,.432),top],"cutGranite:#aaa9a4");
  inscription.forEach((char,i)=>{for(const line of char){
    const pts=line.map(([x,y])=>{
      const yy=-.071+y*.015;return [(i-2.5)*.103+(x-5)*.0094,yy,front+(yy/.445+.5)*(back-front)+.006];
    });
    m.tube(pts,pts.map((p,j)=>j===pts.length-1?.0026:.0048),"patina:#343830",7);
  }});
}

function gardenBench(m) {
  for(const x of [-.64,.64]) {
    m.tube([[x,-.238,.027],[x,-.206,.196],[x,-.17,.385],[x,.166,.397],[x,.223,.481],[x,.295,.832]],.027,"#454c47",9);
    m.tube([[x,.201,.025],[x,.152,.219],[x,.152,.381]],.029,"#444b45",9);
    for(const y of [-.232,.201])m.box(x,y,.008,.105,.090,.021,"#5d625d");
  }
  for(let i=0;i<5;i++) {
    const y=-.205+i*.088;
    m.box(0,y,.393+(i===0?.008:0),1.83,.080,.038,"timber:#85705b");
  }
  for(let i=0;i<5;i++){
    const z=.474+i*.078,y=.201+i*.017;
    m.loft([m.rect(0,y,z,1.83,.031),m.rect(0,y+.013,z+.065,1.83,.031)],"timber:#827360");
    for(const x of [-.64,.64])m.oval(x,y-.017,z+.032,.008,.003,.008,"#6e6a60",8,4);
  }
}

function leafyCrown(m,x,y,z,w,d,h,seed) {
  let state=seed; const rnd=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
  const tones=["broadleaf:#42523a","broadleaf:#506349","broadleaf:#667858","broadleaf:#667945","broadleaf:#89926c"];
  sections(m,[[z+h*.04,x,y,w*.26,d*.32],[z+h*.19,x,y,w*.84,d*.78],
    [z+h*.44,x+.04*w,y,w,d],[z+h*.67,x,y-.03*d,w*.87,d*.86],
    [z+h*.85,x-.06*w,y,w*.55,d*.58],[z+h*.98,x+.09*w,y,w*.11,d*.16]],
    tones[0],(a,j)=>1+.09*Math.sin(5*a+.78*j)+.055*Math.sin(8*a-.32*j));
  const lobes=m.detail?35:19;
  for(let i=0;i<lobes;i++){
    const u=.13+.79*rnd(),a=i*2.39996+.21*rnd(),rr=Math.pow(Math.sin(Math.PI*u),.76)*.83;
    const span=(.17+.13*rnd())*w;
    m.oval(x+w*rr*Math.cos(a),y+d*rr*Math.sin(a),z+h*u,span,span*.84,span*(.73+.60*rnd()),
      tones[i%4],8,5);
  }
  const n=m.detail?550:171;
  for(let i=0;i<n;i++){
    const u=.08+.88*rnd(), a=TAU*rnd(),r=Math.pow(Math.sin(Math.PI*u),.71)*(.93+.18*rnd());
    const cx=x+w*r*Math.cos(a),cy=y+d*r*Math.sin(a),cz=z+h*u;
    const l=.043+rnd()*.044,dx=Math.cos(a+.43)*l,dy=Math.sin(a+.43)*l,dz=l*(.3+rnd()*.65);
    const leaf=tones[1+Math.floor(rnd()*4)];
    for(const side of [-1,1]) {
      const k=side*.38;
      m.face([[cx,cy,cz],[cx+dx*.51-dy*k,cy+dy*.51+dx*k,cz+dz*.62],
        [cx+dx,cy+dy,cz+dz],[cx+dx*.49,cy+dy*.49,cz+dz*.76]],leaf,[Math.cos(a),Math.sin(a),.38]);
    }
  }
}

// Woody climbing stems and small leaf sprays let the concrete show through,
// as it does behind the chair in the winter field photograph.
function climbingVines(m) {
  let state=1907;const rnd=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
  for(let k=0;k<7;k++){
    let x=-1.46+k*.47,y=-.025,z=0;const span=3.0+rnd()*3.1;
    for(let j=0;j<11;j++){
      const X=Math.max(-1.7,Math.min(1.7,x+(rnd()-.53)*.63)),Y=-.024-rnd()*.033,Z=span*(j+1)/11;
      m.tube([[x,y,z],[X,Y,Z]],[.010*(1-j*.06),.010*(1-(j+1)*.06)],"#605e4c",5);
      for(let b=0;b<3;b++){
        const u=rnd(),ox=x+(X-x)*u,oz=z+(Z-z)*u,sgn=rnd()>.5?1:-1;
        const ex=ox+sgn*(.075+rnd()*.23),ez=oz+.10+rnd()*.32;
        m.tube([[ox,Y,oz],[ex,Y-.018,ez]],[.0035,.0018],"#706e5c",5);
        const leaves=m.detail?7:3;
        for(let l=0;l<leaves;l++){
          const lx=ex+(rnd()-.50)*.19,lz=ez+(rnd()-.50)*.21,r=.024+rnd()*.028;
          m.face([[lx,Y-.024,lz-r],[lx-.55*r,Y-.029,lz],[lx+.16*r,Y-.031,lz+r],[lx+.50*r,Y-.026,lz+.12*r]],
            ["broadleaf:#70794e","broadleaf:#596446","broadleaf:#80915e"][l%3],[0,-1,.30]);
        }
      }
      x=X;y=Y;z=Z;
    }
  }
}

function westWallBay(m) {
  m.box(0,.04,0,3.44,.07,9.57,"castConcrete:#bbb9ad");
  m.box(0,-.002,7.42,3.33,.035,1.38,"doorGlass:#6d8180");
  for(const x of [-1.67,-.55,.55,1.67])m.box(x,-.029,7.41,.039,.057,1.40,"#8b908b");
  for(const z of [7.38,8.79])m.box(0,-.031,z,3.42,.095,.045,"#a3a59c");
  m.box(0,-.018,9.52,3.44,.13,.045,"#9c9991");
}

function broadleaf(m) {
  m.tube([[0,0,0],[.013,.014,.50],[-.036,0,1.17],[.023,.016,2.99]],[.081,.071,.060,.025],"timber:#776c56",12);
  for(const [x,y,z] of [[-.41,.05,1.19],[.38,.10,1.46],[-.17,-.40,1.73],[.22,-.22,2.17]])
    m.tube([[0,0,z-.72],[x*.48,y*.43,z-.39],[x,y,z]],[.04,.027,.012],"timber:#746d57",9);
  leafyCrown(m,-.09,0,.55,.80,.69,2.62,147);
  leafyCrown(m,.12,.04,1.45,.57,.58,2.13,365);
}

function gardenSapling(m) {
  m.tube([[0,0,0],[-.045,.005,.86],[.018,.01,1.53],[-.06,0,2.7],[.075,.019,4.64]],
    [.075,.066,.059,.046,.016],"timber:#6e6b58",11);
  const clusters=[[-.53,.07,1.22,.66,1.30],[.58,-.09,1.68,.61,1.38],
    [-.42,-.13,2.39,.69,1.47],[.41,.11,2.88,.70,1.41],[-.14,-.03,3.63,.71,1.35]];
  for(const [j,[x,y,z,w,h]] of clusters.entries()){
    m.tube([[0,0,z-.68],[x*.48,y*.6,z-.26],[x,y,z+.47]],[.037,.022,.009],"timber:#696c56",8);
    leafyCrown(m,x,y,z,w,w*.69,h,417+j*1553);
  }
}

function clippedShrub(m) {
  for(const [x,y] of [[-.28,0],[.36,.01],[0,.19]])m.tube([[x,y,0],[x*.92,y,.46],[x*1.15,y-.03,.77]],[.039,.027,.011],"timber:#786f56",8);
  leafyCrown(m,-.36,0,.16,.65,.58,.96,2104);
  leafyCrown(m,.31,.017,.16,.73,.59,1.10,1845);
}

function flowerBowl(m) {
  m.turned(0,0,[[.015,.129],[.033,.15],[.055,.15],[.30,.222],[.312,.235],[.349,.237],[.357,.212]],"stucco:#ad7156",22);
  m.turned(0,0,[[.342,.211],[.347,.211]],"#493c30",22);
  m.oval(0,0,.42,.278,.251,.121,"#657044",18,9);
  const n=m.detail?53:22;
  for(let i=0;i<n;i++) {
    const a=i*2.39996, r=Math.sqrt((i+.5)/n);
    const x=.26*r*Math.cos(a),y=.234*r*Math.sin(a),z=.435+.107*Math.sqrt(1-r*r);
    m.oval(x,y,z,.023,.018,.017,["#a48783","#cfb7ad","#ac858a","#85736e"][i%4],6,4);
  }
}

export const tejimaFixtures = {
  tejimaMonument: [[2.10,2.10,3.588],monument],
  tejimaNameStone: [[.755,.445,.292],nameStone],
  tejimaGardenBench: [[1.83,.58,.85],gardenBench],
  tejimaEvergreen: [[1.86,1.55,3.58],broadleaf],
  tejimaGardenSapling: [[2.56,1.50,5.0],gardenSapling],
  tejimaClippedShrub: [[2.08,1.24,1.26],clippedShrub],
  tejimaFlowerBowl: [[.56,.52,.56],flowerBowl],
  tejimaClimbingVines: [[3.50,.16,6.1],climbingVines],
  tejimaWallBay: [[3.44,.16,9.57],westWallBay],
  tejimaLecternPost: [[.13,.13,.99], m=>{
    m.box(0,0,.004,.13,.13,.014,"#777773");
    m.box(0,0,.018,.041,.046,.944,"#b2b3ad");
    m.box(0,0,.946,.096,.094,.045,"#a6a7a1");
  }],
};
