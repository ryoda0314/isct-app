import { DEG, TAU, Part, add, mul, unit, lerp3, basis, tube, tubes, cyl, disc, torus, box, obox, ellipsoid, rgb } from "./campus3dVehicleGeometry.js";
import { CAR, CAR_WHEELS } from "./campus3dCar.js";
import { clamp } from "./campus3dVehicleMath.js";

const amber = rgb("#f67529",.87), orange = rgb("#dc4d1d",.87), ember = rgb("#aa361c",.87), ivory = rgb("#fff2ce",.87);
const carbon = rgb("#20282c"), black = rgb("#12191e"), rubber = rgb("#252c30"), alloy = rgb("#ccd6de",.80), gunmetal = rgb("#55616a",.80);
const blueGlass = rgb("#34586c",.93), glassLow = rgb("#182e40",.93), glassHigh = rgb("#718b9a",.93);
const pearl = rgb("#eeeade",.87), blue = rgb("#165581",.87), teal = rgb("#37b9c4",.87), brass = rgb("#ffba58",.80);
const axisX = [1, 0, 0], axisY = [0, 1, 0];

function sectionAt(stations, x) {
  const i = stations.findIndex(s => s[0] >= x);
  if (i <= 0) return stations[i < 0 ? stations.length - 1 : 0].slice(1);
  const a = stations[i-1], b = stations[i], t = (x-a[0])/(b[0]-a[0]);
  return a.slice(1).map((v, k) => v + (b[k+1]-v)*t);
}
function connect(P, a, b, colors, ref) {
  for (let i = 0; i < a.length - 1; i++) P.quad(a[i], b[i], b[i+1], a[i+1], colors[i], ref);
}
function strip(P, a, b, thickness, col) {
  for (let i = 0; i < a.length - 1; i++) {
    P.quad(a[i], a[i+1], b[i+1], b[i], col, null, [0, 0, 1]);
    P.quad(a[i], add(a[i], [0,0,-thickness]), add(a[i+1], [0,0,-thickness]), a[i+1], col);
  }
}

const shellStations = [
  // x, half width, hood/deck, shoulder, sill
  [-2.24,.77,.80,.72,.29], [-2.13,.87,.85,.79,.23], [-1.74,.94,.87,.83,.20],
  [-1.32,.96,.87,.85,.19], [-.72,.91,.83,.79,.18], [.1,.90,.81,.75,.17],
  [.83,.93,.79,.74,.17], [1.36,.96,.77,.79,.18], [1.83,.91,.68,.69,.19],
  [2.15,.82,.58,.58,.22], [2.24,.74,.54,.53,.27],
];
function archHeight(x, sill) {
  const dx = Math.abs(Math.abs(x) - CAR.wheelbase/2);
  return dx < .394 ? Math.max(sill, CAR.wheelR + Math.sqrt(.394**2 - dx**2)) : sill;
}
function bodySurface(x, side) {
  const [w, top, shoulder, sill] = sectionAt(shellStations, x);
  const arch = archHeight(x, sill), waist = Math.max(shoulder, arch + .074);
  const point = (l, z) => [x, side*w*l, z];
  return [point(0,top), point(.61,top+.012), point(.85,waist+.024), point(.98,waist),
    point(1,.68*waist+.32*arch), point(.982,arch+.025), point(.93,arch), point(.74,arch+.018)];
}
function hoodPoint(x, side, fraction, lift=.016) {
  const row=bodySurface(x,side), y=fraction*sectionAt(shellStations,x)[0], edge=row.findIndex(p=>Math.abs(p[1])>=y);
  const a=row[Math.max(0,edge-1)], b=row[Math.max(0,edge)];
  return [x,side*y,a[2]+(b[2]-a[2])*(y-Math.abs(a[1]))/(Math.abs(b[1]-a[1])||1)+lift];
}
function makeCarWheel(x, l) {
  const P = new Part(), c = [x,l,CAR.wheelR], s = Math.sign(l), R = CAR.wheelR;
  const face = (out, r, a) => [x + r*Math.cos(a), l + s*out, c[2] + r*Math.sin(a)];
  for (let i = 0; i < 32; i++) {
    const a = i/32*TAU, b = (i+1)/32*TAU;
    const profile = [[-.112,.294],[-.098,R-.012],[-.064,R],[.064,R],[.098,R-.012],[.112,.294],[.111,.248]];
    connect(P, profile.map(([o,r]) => face(o,r,a)), profile.map(([o,r]) => face(o,r,b)), [rubber, rubber, black, rubber, rubber, black], c);
  }
  const at = out => add(c,[0,s*out,0]);
  cyl(P, at(.052), axisY, .22, .045, gunmetal, 24);
  disc(P, at(.11), axisY, .25, alloy, 32, .234);
  disc(P, at(.085), axisY, .224, gunmetal, 28, .105);
  for (let i = 0; i < 8; i++) {
    const a = i/8*TAU;
    for (const d of [-1,1]) P.quad(face(.128,.058,a-.09), face(.127,.07,a+.12),
      face(.11,.238,a+.13+d*.14), face(.11,.23,a+.05+d*.14), alloy, null, [0,s,0]);
  }
  cyl(P, at(.115), axisY, .072, .032, carbon, 16);
  disc(P, at(.133), axisY, .029, brass, 12);
  const caliper=new Part();
  box(caliper,[x-.166,l+s*.099,c[2]+.029],[.075,.036,.171],rgb("#dc4427"));
  return { P: P.freeze(), caliper:caliper.freeze(), c, front: x > 0 };
}
let car;
function contactShadow(length,width,opacity=.32) {
  const P=new Part(), paint=rgb("#111c20");
  const rings=[[.04,opacity],[.66,opacity*.94],[1,.006]];
  for(let j=1;j<rings.length;j++) for(let i=0;i<32;i++) {
    const at=(ring,step)=>[length*rings[ring][0]*Math.cos(step*TAU/32),width*rings[ring][0]*Math.sin(step*TAU/32),.044];
    const start=P.c.length;
    P.quad(at(j-1,i),at(j,i),at(j,i+1),at(j-1,i+1),paint,null,[0,0,1]);
    [j-1,j,j,j-1,j,j-1].forEach((ring,k)=>{P.c[start+k*4+3]=rings[ring][1];});
  }
  return P.freeze();
}
export function carParts() {
  if (car) return car;
  const body = new Part(), glass = new Part(), inside = new Part(), brake = new Part(), head = new Part(), reverse = new Part();
  const xs = [...shellStations.map(s => s[0]), -.97, -1.64, .91];
  for (const axle of [-CAR.wheelbase/2, CAR.wheelbase/2]) {
    xs.push(axle-.402, axle+.402);
    for (let k=0; k<=16; k++) xs.push(axle + .3939*Math.cos(k*Math.PI/16));
  }
  xs.sort((a,b) => a-b);
  for (const side of [-1,1]) {
    let prev;
    for (const x of xs) {
      const row = bodySurface(x, side);
      if (prev) {
        const cabin = prev[0][0]>=-1.64 && x<=.91;
        const start = cabin ? 2 : 0, colors = [amber, amber, orange, orange, ember, orange, black];
        connect(body, prev.slice(start), row.slice(start), colors.slice(start), [x,0,.46]);
        if (cabin) body.quad(prev[2],row[2],[x,side*.71,.35],[prev[2][0],side*.71,.35],carbon,null,[0,-side,0]);
      }
      prev = row;
    }
    for (const x of [-2.24,2.24]) {
      const row = bodySurface(x, side);
      for (let i=0; i<row.length-1; i++) body.tri([x,0,.29], row[i], row[i+1], orange, [Math.sign(x),0,0]);
    }
    for (const axle of [-CAR.wheelbase/2,CAR.wheelbase/2]) {
      const well=(angle,y)=>[axle+.394*Math.cos(angle),side*y,CAR.wheelR+.394*Math.sin(angle)];
      for(let k=0;k<16;k++){
        const a=k*Math.PI/16,b=(k+1)*Math.PI/16;
        body.quad(well(a,.655),well(b,.655),well(b,.915),well(a,.915),rubber);
      }
    }
    // Front splitter, recessed radiator and three vertical light blades per corner.
    body.quad([2.246,side*.07,.26],[2.246,side*.65,.275],[2.246,side*.57,.445],[2.246,side*.11,.43],black,null,axisX);
    for (let k=0;k<3;k++) tube(body,[2.249,side*.13,.292+k*.042],[2.249,side*.56,.30+k*.04],.009,gunmetal,5);
    const lamp = [[1.80,.857,.92],[1.98,.704,.955],[2.14,.55,.948],[2.23,.49,.918]];
    for (let k=1;k<lamp.length;k++) {
      const [a,b]=[lamp[k-1],lamp[k]];
      body.quad(hoodPoint(a[0],side,a[1]),hoodPoint(b[0],side,b[1]),hoodPoint(b[0],side,b[2]),hoodPoint(a[0],side,a[2]),black,null,[0,0,1]);
    }
    tubes(head,lamp.map(([x,l])=>hoodPoint(x,side,l+.028,.035)),.015,ivory,6);
    for (const [x,f] of [[2.05,.74],[2.12,.67],[2.18,.60]]) {
      tube(head,hoodPoint(x,side,f,.037),hoodPoint(x-.054,side,f+.125,.037),.017,rgb("#deeff5"),6);
    }
    tubes(head,[[2.248,side*.38,.515],[2.248,side*.65,.508],[2.206,side*.72,.534]],.012,ivory,6);
    tubes(body,[[2.247,side*.04,.244],[2.25,side*.70,.246],[2.09,side*.85,.218],[1.84,side*.90,.20]],.029,carbon,6);
    // Rear light bridge, diffuser, exhaust outlets and a floating rear foil.
    box(body,[-2.243,side*.38,.696],[.026,.755,.13],black);
    tubes(brake,[[-2.262,side*.018,.714],[-2.262,side*.58,.714],[-2.25,side*.76,.755],[-2.10,side*.86,.768]],.023,rgb("#e33229"),6);
    box(reverse,[-2.267,side*.57,.651],[.013,.13,.025],ivory);
    cyl(body,[-2.19,side*.64,.34],axisX,.076,.14,gunmetal,16);
    disc(body,[-2.264,side*.64,.34],axisX,.057,black,16);
    for (let k=0;k<3;k++) box(body,[-2.08,side*(.12+k*.18),.229],[.35,.025,.10],carbon);
    tube(body,[-1.87,side*.55,.88],[-2.01,side*.55,1.00],.029,gunmetal,6);
    const lip=[[-2.13,side*.02,1.01],[-2.12,side*.72,1.02],[-2.03,side*.90,1.055]];
    strip(body,lip,lip.map(p=>add(p,[.18,0,.014])),.04,carbon);
    // Sculpted rocker, side intake and a flush door pull.
    body.quad([-.93,side*.943,.231],[.89,side*.948,.218],[.70,side*.932,.267],[-.66,side*.932,.286],carbon,null,[0,side,0]);
    body.quad([-.91,side*.934,.40],[-.70,side*.912,.622],[-.38,side*.908,.65],[-.60,side*.922,.42],black,null,[0,side,0]);
    for (let i=0;i<3;i++) tube(body,[-.81+i*.083,side*.936,.47+i*.034],[-.66+i*.075,side*.929,.58+i*.025],.011,gunmetal,5);
    tubes(body,[[.57,side*.921,.742],[.63,side*.922,.61],[.51,side*.913,.339],[-.48,side*.914,.302],[-.66,side*.922,.378]],.008,ember,5);
    body.quad([-.78,side*.931,.29],[.83,side*.944,.279],[.71,side*.936,.298],[-.60,side*.923,.327],ivory,null,[0,side,0]);
    tubes(body,[[-.59,side*.918,.739],[.58,side*.923,.72],[.69,side*.918,.64]],.009,ember,5);
    box(body,[-.47,side*.916,.705],[.145,.022,.026],gunmetal);
    tube(body,[.53,side*.754,.84],[.48,side*.966,.891],.028,black,6);
    ellipsoid(body,[.46,side*.981,.906],[.124,.094,.048],orange,12,6);
    disc(body,[.367,side*.986,.91],[-1,0,0],.045,alloy,10);
  }
  box(body,[-2.256,0,.47],[.016,.32,.098],ivory);
  body.tri([2.249,0,.473],[2.249,-.061,.516],[2.249,.061,.516],alloy,axisX);
  for (let i=0;i<5;i++) box(body,[-2.266,-.091+i*.043,.468],[.012,.018,.046],carbon);
  // Black glasshouse with a low, curved roof and raked front and rear screens.
  const roof = [[-1.64,.75,.865,.86],[-1.43,.731,.876,1.00],[-.88,.664,.866,1.288],[-.60,.647,.858,1.342],
    [-.14,.644,.85,1.36],[.17,.655,.841,1.32],[.49,.701,.83,1.16],[.91,.765,.818,.842]];
  for (let i=1;i<roof.length;i++) {
    const a=roof[i-1], b=roof[i];
    const pt=(p,s,f,h) => [p[0],s*p[1]*f,p[2]+(p[3]-p[2])*h];
    const windshield=i>=6, rear=i<3, pane=windshield||rear;
    for (const side of [-1,1]) {
      const row=p=>[pt(p,side,0,1),pt(p,side,.81,.98),pt(p,side,.93,.91),pt(p,side,1.075,.06)];
      const A=row(a), B=row(b);
      connect(pane?glass:body,A.slice(0,3),B.slice(0,3),pane?[blueGlass,glassHigh]:[carbon,carbon],[a[0],0,.79]);
      connect(glass,A.slice(2),B.slice(2),[i<3?glassLow:blueGlass],[a[0],0,.79]);
      tube(body,A[2],B[2],.015,pane?carbon:orange,6);
      tube(body,A[3],B[3],.012,gunmetal,5);
      if (i===3 || i===6) tube(body,A[2],A[3],i===3?.037:.026,carbon,6);
    }
  }
  for (const side of [-1,1]) tubes(body,[[.86,side*.675,.86],[.79,side*.44,.92],[.755,side*.12,.95]],.012,carbon,5);
  // Twin offset competition stripes follow the hood and rear deck.
  for (const range of [[.92,2.225],[-2.22,-1.64]]) for (const [offset,width] of [[.04,.15],[.222,.038]]) {
    const points=[range[0],...shellStations.map(a=>a[0]).filter(x=>x>range[0]&&x<range[1]),range[1]];
    const edge = y => points.map(x=>[x,y,sectionAt(shellStations,x)[1]+.005+.012*y/(.61*sectionAt(shellStations,x)[0])]);
    strip(body,edge(offset),edge(offset+width),.001,ivory);
  }
  // Instrument binnacle, bolstered bucket seats, three-spoke wheel.
  box(inside,[-.42,0,.325],[2.43,1.46,.11],black);
  box(inside,[-.03,0,.49],[1.16,.22,.27],carbon);
  box(inside,[.65,0,.752],[.42,1.40,.16],carbon);
  box(inside,[.419,-.385,.828],[.036,.39,.12],black);
  for (const y of [-.49,-.32]) {
    disc(inside,[.397,y,.825],axisX,.051,alloy,20);
    disc(inside,[.393,y,.825],axisX,.045,black,20);
    for(let i=0;i<9;i++) {
      const a=(-32+i*29)*DEG;
      tube(inside,[.389,y+.033*Math.cos(a),.825+.033*Math.sin(a)],[.389,y+.041*Math.cos(a),.825+.041*Math.sin(a)],.0024,ivory,4);
    }
    tube(inside,[.386,y,.824],[.386,y-.021,.852],.0035,amber,4);
  }
  box(inside,[.419,.03,.80],[.032,.25,.107],blueGlass);
  for (const s of [-1,1]) {
    const y=s*.39;
    box(inside,[-.23,y,.43],[.49,.40,.13],carbon);
    obox(inside,[-.49,y,.72],unit([.976,0,.22]),axisY,unit([-.22,0,.976]),[.066,.202,.27],carbon);
    for (const o of [-.17,.17]) tubes(inside,[[-.25,y+o,.505],[-.43,y+o,.55],[-.54,y+o,.91]],.027,orange,6);
    ellipsoid(inside,[-.58,y,.988],[.089,.135,.094],carbon,10,5);
  }
  const wheelC=[.243,-.39,.78], WAX=unit([-.84,0,.55]), wheelPart=new Part();
  torus(wheelPart,wheelC,WAX,.156,.019,black,24,6);
  const [u,w]=basis(WAX);
  for (const a of [0,2.25,4.0]) tube(wheelPart,wheelC,add(wheelC,add(mul(u,.143*Math.cos(a)),mul(w,.143*Math.sin(a)))),.015,gunmetal,6);
  cyl(wheelPart,wheelC,WAX,.046,.032,amber,12);
  car={body:body.freeze(),glass:glass.freeze(),inside:inside.freeze(),brake:brake.freeze(),head:head.freeze(),reverse:reverse.freeze(),
    wheelPart:wheelPart.freeze(),wheelC,WAX,wheels:CAR_WHEELS.map(([x,y])=>makeCarWheel(x,y)),
    shadow:contactShadow(2.24,1.02),tireShadow:contactShadow(.255,.15,.385)};
  return car;
}

// Deform the actual panels and lamp lenses. Cache per part and damage vector
// so parked cars and normal driving reuse their geometry between impacts.
const crushed = new WeakMap();
export function dentedShell(part, dents) {
  if (!dents?.some(v=>v>.005)) return part;
  const cached=crushed.get(part);
  if (cached?.dents===dents) return cached.mesh;
  const P=new Float32Array(part.P), N=new Float32Array(part.N), C=new Float32Array(part.C);
  for (let i=0;i<P.length;i+=3) {
    const x=P[i],y=P[i+1],z=P[i+2],side=clamp(.5+y*.67,0,1),end=x>0?0:2;
    const amount=dents[end]*side+dents[end+1]*(1-side);
    const crush=amount*clamp((Math.abs(x)-1.02)/1.17,0,1)**1.45;
    const sideDamage = Math.min(dents[0],dents[2])*side + Math.min(dents[1],dents[3])*(1-side);
    const door = sideDamage*clamp((Math.abs(y)-.56)/.34,0,1)*Math.max(0,1-(x/1.9)**2);
    P[i]-=Math.sign(x)*crush*(.43+.11*Math.cos(y*7));
    P[i+1]-=Math.sign(y)*(crush*.09+door*(.17+.06*Math.sin(6*x+3*z)));
    P[i+2]+=crush*(.065+.12*Math.sin(Math.abs(x)*12+y*4))*(z>.46?1:-.4);
    if (crush>.23) for (let j=0;j<3;j++) C[i/3*4+j]*=1-crush*.35;
  }
  for (let i=0; i<P.length; i+=9) {
    if (P.subarray(i,i+9).every((v,j)=>v===part.P[i+j])) continue;
    const ax=P[i+3]-P[i], ay=P[i+4]-P[i+1], az=P[i+5]-P[i+2];
    const bx=P[i+6]-P[i], by=P[i+7]-P[i+1], bz=P[i+8]-P[i+2];
    const normal=unit([ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx]);
    const sign=normal[0]*N[i]+normal[1]*N[i+1]+normal[2]*N[i+2]<0?-1:1;
    for(let k=0;k<9;k++) N[i+k]=normal[k%3]*sign;
  }
  const mesh={...part,P,N,C};
  crushed.set(part,{dents,mesh});
  return mesh;
}

// Elliptical cross-sections along the fuselage. The paint break follows the
// curvature continuously around the nose, under the windows and into the tail.
function loft(P, stations, sides, colorAt, open = null) {
  const rows=stations.map(([x,w,z,h],j)=>{
    const a=stations[Math.max(0,j-1)],b=stations[Math.min(stations.length-1,j+1)];
    const dx=b[0]-a[0],dw=(b[1]-a[1])/dx,dz=(b[2]-a[2])/dx,dh=(b[3]-a[3])/dx;
    return Array.from({length:sides+1},(_,i)=>{
      const theta=i*TAU/sides,c=Math.cos(theta),s=Math.sin(theta);
      return {p:[x,w*c,z+h*s],n:unit([-w*s*(dz+dh*s)-h*dw*c*c,h*c,w*s]),open:open?.(x,s)};
    });
  });
  for(let j=1;j<rows.length;j++) for(let k=0;k<sides;k++){
    const a=rows[j-1][k],b=rows[j][k],c=rows[j][k+1],d=rows[j-1][k+1];
    if(a.open&&b.open&&c.open&&d.open) continue;
    const color=colorAt(k,(k+.5)*TAU/sides);
    for(const v of [a,c,b,a,d,c]){P.p.push(...v.p);P.n.push(...v.n);P.c.push(...color);}
  }
}
function foil(P, sections, side, colors) {
  let prev;
  for (const [span,lead,trail,z,thick] of sections) {
    const row=[[lead,side*span,z],[lead*.78+trail*.22,side*span,z+thick],[trail,side*span,z+.015],[lead*.7+trail*.3,side*span,z-thick*.32],[lead,side*span,z]];
    if(prev) connect(P,prev,row,colors,[(lead+trail)/2,0,z-.032]);
    prev=row;
  }
}
let jet;
export function jetParts() {
  if (jet) return jet;
  const shell=new Part(), glass=new Part(), gear=new Part(), cockpit=new Part(), controls=[], fans=[];
  const fuselage=[[-5.1,.052,1.99,.08],[-4.62,.24,1.84,.29],[-3.7,.49,1.68,.48],[-2.32,.69,1.53,.66],
    [-.8,.76,1.46,.75],[.82,.76,1.46,.75],[1.65,.73,1.42,.71],[2.48,.62,1.36,.59],
    [3.22,.50,1.28,.45],[4.12,.32,1.22,.285],[4.86,.12,1.18,.124],[5.1,.012,1.18,.015]];
  const skin=fuselage.flatMap((station,i)=>i>0 && station[0]>1.3 && station[0]<=3.22
    ? [1/3,2/3,1].map(f=>station.map((n,k)=>fuselage[i-1][k]*(1-f)+n*f)) : [station]);
  loft(shell,skin,40,(_,a)=>Math.sin(a)>.01?pearl:Math.sin(a)>-.22?teal:blue,(x,sin)=>{
    const side=(Math.acos(clamp(sin,-1,1))/DEG-5)/54;
    return side>=0 && side<=.96 && x>1.59-.27*side && x<3.02-.51*side;
  });
  // Sculpted windshield, cabin glazing, frames and a dorsal anti-glare panel.
  for (const s of [-1,1]) {
    const canopy=(sideFraction,foreFraction)=>{
      const front=3.02-.51*sideFraction, back=1.59-.27*sideFraction;
      const x=back+(front-back)*foreFraction, [w,z,h]=sectionAt(fuselage,x);
      const angle=(5+sideFraction*(57-foreFraction*6))*DEG;
      return [x,s*(w+.032)*Math.sin(angle),z+(h+.04)*Math.cos(angle)];
    };
    const fractions=[0,.25,.5,.75,1];
    for(let i=1;i<fractions.length;i++) for(let k=1;k<fractions.length;k++){
      const a=fractions[i-1],b=fractions[i],c=fractions[k-1],d=fractions[k];
      glass.quad(canopy(a,c),canopy(a,d),canopy(b,d),canopy(b,c),a>.55?glassLow:blueGlass,[1.8,0,1.4]);
    }
    for(const f of [0,1]){
      tubes(shell,fractions.map(t=>canopy(t,f)),.020,carbon,6);
      tubes(shell,fractions.map(t=>canopy(f,t)),.018,carbon,6);
    }
    ellipsoid(shell,[1.57,s*.29,1.54],[.23,.18,.075],carbon,16,8);
    ellipsoid(shell,[1.37,s*.29,1.73],[.075,.18,.25],carbon,16,8);
    ellipsoid(shell,[1.35,s*.29,1.94],[.063,.132,.085],gunmetal,14,8);
    for (const x of [.78,.04,-.70,-1.44]) {
      const circ=sectionAt(fuselage,x), y=s*circ[0]*.949, z=circ[1]+.228;
      ellipsoid(shell,[x,y,z],[.215,.056,.215],gunmetal,12,7);
      ellipsoid(shell,[x,y+s*.018,z+.003],[.178,.055,.177],glassLow,12,7);
    }
    // Swept wings, contrasting tip caps, winglets and split control surfaces.
    foil(shell,[[.54,1.04,-1.95,1.03,.149],[1.62,.34,-1.55,1.045,.13],[3.76,-.98,-1.87,1.14,.074],[4.51,-1.60,-2.18,1.24,.04]],s,[pearl,pearl,blue,blue]);
    foil(shell,[[4.37,-1.50,-2.22,1.225,.042],[4.57,-1.68,-2.23,1.26,.032],[4.60,-2.04,-2.27,1.82,.022]],s,[teal,teal,blue,blue]);
    tubes(shell,[[.97,s*1.18,1.16],[-.21,s*2.55,1.17],[-1.30,s*4.14,1.27]],.018,gunmetal,5);
    const aileron=new Part(), stabilator=new Part(), hinge=[-1.56,s*1.62,1.06], tip=[-2.02,s*4.15,1.20];
    foil(aileron,[[1.62,-1.56,-2.06,1.05,.022],[3.76,-1.88,-2.17,1.145,.021],[4.15,-2.02,-2.19,1.195,.018]],s,[gunmetal,pearl,blue,blue]);
    foil(stabilator,[[.18,-3.07,-4.62,1.96,.076],[1.35,-3.71,-4.68,2.025,.049],[2.14,-4.24,-4.72,2.12,.025]],s,[pearl,blue,blue,blue]);
    controls.push({part:aileron.freeze(),hinge,axis:unit(tip.map((n,i)=>(n-hinge[i])*s)),side:s},
      {part:stabilator.freeze(),hinge:[-3.88,0,2.01],axis:axisY,side:0});
    tube(shell,[-2.59,s*.37,1.5],[-2.59,s*1.03,1.57],.148,gunmetal,8);
    // Two aft turbofans, including recessed fan blades and a nozzle lip.
    const engine=new Part();
    loft(engine,[[-3.66,.23,0,.23],[-3.37,.33,0,.33],[-2.59,.395,0,.392],[-1.95,.37,0,.37],[-1.85,.32,0,.32]],24,(_,a)=>Math.sin(a)>-.22?pearl:blue);
    const offset=[0,s*1.025,1.69];
    for (let i=0;i<engine.p.length;i+=3) {engine.p[i+1]+=offset[1];engine.p[i+2]+=offset[2];}
    shell.p.push(...engine.p); shell.n.push(...engine.n); shell.c.push(...engine.c);
    for (const [x,r,depth,col] of [[-1.85,.317,-.15,alloy],[-3.65,.228,.16,gunmetal]]) {
      const c=[x,s*1.025,1.69],behind=[x+depth,c[1],c[2]];
      cyl(shell,[x+depth/2,c[1],c[2]],axisX,r,Math.abs(depth),gunmetal,32,false);
      disc(shell,behind,axisX,r,black,32);
      torus(shell,c,axisX,r,.022,col,32,8);
    }
    const hub=[-1.968,s*1.025,1.69], fan=new Part();
    for (let i=0;i<18;i++) {
      const a=i*TAU/18,pt=(r,d,depth)=>[hub[0]+depth,hub[1]+r*Math.cos(a+d),hub[2]+r*Math.sin(a+d)];
      fan.quad(pt(.055,0,.035),pt(.30,.18,.015),pt(.294,.40,-.007),pt(.057,.20,.012),gunmetal);
      fan.quad(pt(.055,0,.037),pt(.30,.18,.016),pt(.30,.20,.012),pt(.055,.035,.034),alloy);
    }
    ellipsoid(fan,hub,[.074,.066,.066],alloy,18,9);
    ellipsoid(shell,[-3.55,s*1.025,1.69],[.141,.101,.101],gunmetal,18,9);
    fans.push({part:fan.freeze(),hub});
    const a=[-4.77,s*.065,1.92], b=[-3.10,s*.09,2.07], c=[-4.28,s*.055,3.61], d=[-4.75,s*.045,3.72];
    shell.quad(a,b,c,d,blue,null,[0,s,0]);
    shell.quad(lerp3(a,d,.58),lerp3(b,c,.55),lerp3(b,c,.68),lerp3(a,d,.72),teal,null,[0,s,0]);
    tube(shell,c,d,.042,brass,6);
  }
  box(cockpit,[2.52,0,1.62],[.36,1.17,.24],carbon);
  for(const y of [-.26,.24]) {
    box(cockpit,[2.334,y,1.634],[.016,.406,.185],black);
    box(cockpit,[2.321,y,1.675],[.006,.316,.069],rgb("#63aac6",.5));
    box(cockpit,[2.321,y,1.606],[.006,.316,.068],rgb("#ae744c",.5));
    for(let i=-2;i<=2;i++) box(cockpit,[2.315,y,1.64+i*.019],[.005,i===0?.24:.048,.0035],ivory);
    for(const d of [-1,1]) box(cockpit,[2.312,y+d*.131,1.637],[.006,.028,.015],brass);
  }
  for(const y of [-.53,.53]) {
    tube(cockpit,[2.49,y,1.75],[1.44,y*1.23,2.17],.019,carbon,6);
    for(let i=0;i<3;i++) disc(cockpit,[2.33,y,1.575+i*.046],axisX,.011,gunmetal,8);
  }
  for(const [x,y,r] of [[2.60,0,.205],[-.70,.85,.255],[-.70,-.85,.255]]) {
    tube(gear,[x-.15,y,.96],[x,y,r],.053,alloy,8);
    tube(gear,[x-.44,y,.89],[x+.005,y,r+.13],.03,gunmetal,6);
    cyl(gear,[x,y,r],axisY,r,.14,rubber,18);
    for(const s of [-1,1]) disc(gear,[x,y+s*.073,r],axisY,r*.53,alloy,14);
  }
  jet={body:shell.freeze(),glass:glass.freeze(),gear:gear.freeze(),cockpit:cockpit.freeze(),controls,fans};
  return jet;
}
