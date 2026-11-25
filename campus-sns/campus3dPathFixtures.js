// Outdoor fittings seen at walking height on the west and south campus paths.
const steel = "#abb0ae", frame = "#697376";

function gardenLamp(m) {
  m.turned(0,0,[[0,.093],[.024,.098],[.34,.086],[.35,.082]],"stone:#777879");
  m.turned(0,0,[[.355,.042],[.508,.043]],"lit:#d7d5b5");
  for (let i=0; i<3; i++) {
    const x=.064*Math.cos(i*2*Math.PI/3), y=.064*Math.sin(i*2*Math.PI/3);
    m.tube([[x,y,.345],[x,y,.514]],.009,frame);
  }
  m.turned(0,0,[[.507,.112],[.525,.112],[.541,.088]],"#727479");
}

function lawnDisplay(m) {
  const blue = "#505a68";
  for (const x of [-3.03,-1.52,0,1.52,3.03]) {
    for (const y of [-.52,.46]) m.box(x,y,0,.23,.28,.13,"stone:#a4a198");
    m.box(x,.46,.13,.055,.065,2.37,blue);
    m.tube([[x,-.52,.17],[x,.46,.94]],.026,blue,5);
    m.tube([[x,-.52,.17],[x,.46,.17]],.024,frame,5);
  }
  for (const z of [.23,1.01,2.47]) m.box(0,.46,z,6.14,.065,.051,blue);
}

function graniteSeat(m, plaques) {
  const top = "stone:#b9a7a0", base = "stone:#a8a5a0";
  const length=2.16, radius=.258, half=length/2-radius;
  const cap = (x, r, z, right) => Array.from({length:m.detail?12:6},(_,i) => {
    const count = m.detail ? 12 : 6;
    const angle = (right ? -.5 : .5)*Math.PI + Math.PI*i/(count-1);
    return [x+r*Math.cos(angle), r*Math.sin(angle), z];
  });
  const ring = (r,z) => [...cap(half,r,z,true),...cap(-half,r,z,false)];
  if (plaques) {
    m.loft([ring(radius-.016,0),ring(radius,.025),ring(radius,.421),ring(radius-.012,.436)], base);
    for (const x of [-.67,0,.67]) {
      m.box(x,0,.435,.36,.315,.003,"#898477");
      m.box(x,0,.438,.344,.298,.003,"stone:#ba9d77");
    }
  } else {
    for (const x of [-.74,.74]) m.turned(x,0,[[.005,.204],[.028,.214],[.334,.211]],base);
    m.loft([ring(radius-.01,.316),ring(radius,.329),ring(radius,.434),ring(radius-.012,.445)],top);
  }
}

function workshopExtractor(m) {
  const zinc = "#b4b8b7", shadow = "#70797b";
  // The main round duct leaves the wall, bends up, then returns above the balcony edge.
  const path = [[.60,.21,2.65],[.60,-.13,2.65]];
  for (let i=1;i<=7;i++) {
    const a=i*Math.PI/14;
    path.push([.60,-.13-.25*Math.sin(a),2.90-.25*Math.cos(a)]);
  }
  path.push([.60,-.38,4.42],[.60,-.365,4.66],[.60,-.262,4.78],[.60,.16,4.78]);
  m.tube(path,.142,zinc,m.detail?16:8);
  for (const z of [3.46,4.36]) m.turned(.60,-.38,[[z,.149],[z+.028,.149]],shadow);
  m.box(.60,-.005,1.76,.71,.42,.57,"#9b9fa0");
  m.loft([m.rect(.60,-.005,2.32,.71,.42),m.rect(.60,.015,2.49,.62,.37)],zinc);
  for (const x of [-.25,.16]) {
    m.tube([[x,.16,1.18],[x,-.12,1.18],[x,-.20,1.30],[x,-.20,1.64]],.086,shadow);
    m.loft([m.rect(x,-.18,1.64,.19,.16),m.rect(x,-.20,1.83,.34,.26),m.rect(x,-.19,1.89,.34,.26)],zinc);
  }
  for (const z of [1.36,1.72]) m.tube([[-.68,.10,z],[.94,.10,z]],.025,frame,5);
  m.tube([[-.72,.15,.08],[-.72,.15,2.48],[-.58,.15,2.64],[-.58,.15,3.51]],.036,zinc);
}

function hallChiller(m) {
  const caseColor="#d4d5ce", fins="#4e5860";
  for (const x of [-1.8,1.8]) m.box(x,0,0,.36,1.55,.22,"stone:#a3a49e");
  m.box(0,0,.22,4.35,1.50,.14,frame);
  m.box(0,0,.36,4.25,1.44,2.20,caseColor);
  for (const y of [-.73,.73]) {
    for (const x of [-1.04,1.04]) {
      m.box(x,y,1.14,1.94,.025,1.25,fins);
      const rows=m.detail ? 21 : 8;
      for (let j=0;j<rows;j++) m.box(x,y*1.023,1.16+1.19*j/rows,1.92,.030,.021,"#78838a");
    }
    m.box(0,y,.68,4.2,.024,.035,steel);
  }
  for (const x of [-1.06,1.06]) {
    m.turned(x,0,[[2.55,.55],[2.59,.54]],frame);
    for (let j=1;j<=4;j++) m.tube(Array.from({length:17},(_,k)=>[x+.108*j*Math.cos(k*Math.PI/8),.108*j*Math.sin(k*Math.PI/8),2.60]),.012,steel,4);
  }
}

function trailingIvy(m) {
  // The vine hangs from the upper louvres. Its lower edge opens up into individual stems.
  const colors = ["#344132","#47513b","#394a39","#505a42","#42523e"];
  const bottom = x => .62 + .22*Math.sin(3.4*x+1.1) + .13*Math.sin(8*x-.8);
  for (let i=0; i<9; i++) {
    const a=-.9+i*.20, b=a+.20;
    m.face([[a,-.045,bottom(a)],[b,-.055,bottom(b)],[b,-.08,1.75],[a,-.08,1.75]],colors[i%5],[0,-1,0]);
  }
  for (let i=0; i<7; i++) {
    const x=-.82+i*.265, h=bottom(x);
    m.tube([[x,-.08,h+.16],[x+.035,-.095,h-.12],[x-.025,-.097,h-.29]],.009,"#4a4939",4);
  }
  const count = m.detail ? 145 : 35;
  for (let i=0; i<count; i++) {
    const x=1.8*((i*.618034)%1)-.9;
    const base=bottom(x)-.15, z=base+(1.79-base)*((i*.379721+.17)%1);
    const r=.045+.035*((i*.3121)%1), y=-.088-.034*Math.sin(i);
    m.face([[x-r,y,z+.018],[x,y-.015,z-.071],[x+r*.8,y,z+.038],[x+.006,y-.008,z+.068]],colors[(i*7)%5],[0,-1,0]);
  }
}

function serviceTank(m) {
  for(const x of [-.31,.31]) m.box(x,0,.028,.12,.60,.26,frame);
  m.turned(0,0,[[.25,.25],[.34,.44],[.46,.51],[2.52,.51],[2.65,.43],[2.70,.22]],"#c4c8c9",m.detail?22:12);
  for(const z of [.55,1.48,2.40]) m.turned(0,0,[[z,.521],[z+.026,.521]],steel);
  m.tube([[0,0,2.68],[0,0,2.82],[0,.24,2.82]],.05,frame);
}

function standingTable(m) {
  m.turned(0,0,[[.005,.215],[.017,.237],[.029,.232],[.054,.105],[.069,.058]],steel);
  m.turned(0,0,[[.055,.051],[.880,.051],[.895,.112]],"#a7acad");
  m.turned(0,0,[[.894,.331],[.901,.354],[.923,.36],[.938,.352]],"#c2c4bc",m.detail?28:16);
}

function wallSconce(m) {
  m.box(0,0,0,.105,.066,.40,frame);
  m.box(0,-.021,.035,.085,.05,.33,"lit:#ecebd9");
  for (const z of [0,.365]) m.box(0,-.009,z,.105,.075,.035,frame);
}

function cycleWarningStand(m) {
  const yellow = "#eac740", blue = "#4a4a83", red = "#bb5040", white = "#eeede0";
  const profile = [[.01,.46,.38],[.06,.50,.42],[.18,.50,.42],[.23,.46,.40],[1.13,.40,.19],[1.16,.38,.17]];
  m.loft(profile.map(([z,w,d])=>m.rect(0,0,z,w,d)),yellow);
  const front = z => -.20+(z-.23)*.105/.90-.004;
  const panel = (x0,x1,z0,z1,color,offset=0) => m.face([[x0,front(z0)-offset,z0],[x1,front(z0)-offset,z0],[x1,front(z1)-offset,z1],[x0,front(z1)-offset,z1]],color,[0,-1,0]);
  panel(-.163,.163,.30,1.02,white);
  panel(-.151,.151,.315,.79,blue,.003);
  panel(-.151,.151,.80,1.006,red,.003);
  m.text("駐輪禁止",0,front(.865)-.011,.865,.27,.053,white,.002);
  m.text("NO PARKING",0,front(.464)-.012,.458,.235,.025,white,.002);
  const decal = (x,z) => [x,front(z)-.012,z];
  const circle = (x,z,r) => Array.from({length:21},(_,k)=>decal(x+r*Math.cos(k*Math.PI/10),z+r*Math.sin(k*Math.PI/10)));
  m.face(circle(0,.66,.125).slice(0,-1),white,[0,-1,0]);
  m.tube(circle(0,.66,.114),.009,red,5);
  for(const x of [-.051,.053]) m.tube(circle(x,.648,.033).map(([u,v,h])=>[u,v-.003,h]),.004,frame,4);
  m.tube([decal(-.056,.65),decal(-.024,.697),decal(.016,.651),decal(.044,.692),decal(-.024,.697)],.004,frame,4);
  m.tube([decal(-.082,.746),decal(.082,.575)].map(([x,y,z])=>[x,y-.011,z]),.008,red,5);
  m.box(0,0,1.157,.15,.042,.018,"#b3a764");
}

export const pathFixtures = {
  gardenLamp: [[.224,.224,.541],gardenLamp],
  lawnDisplay: [[6.3,1.26,2.52],lawnDisplay],
  plaqueBench: [[2.16,.516,.441],m=>graniteSeat(m,true)],
  stoneBench: [[2.16,.516,.445],m=>graniteSeat(m,false)],
  workshopExtractor: [[1.75,.77,4.93],workshopExtractor],
  hallChiller: [[4.35,1.55,2.62],hallChiller],
  trailingIvy: [[1.80,.25,1.80],trailingIvy],
  serviceTank: [[1.05,1.05,2.88],serviceTank],
  standingTable: [[.72,.72,.94],standingTable],
  wallSconce: [[.105,.092,.40],wallSconce],
  cycleWarningStand: [[.50,.42,1.18],cycleWarningStand],
};
