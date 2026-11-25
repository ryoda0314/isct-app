import { at, edges, orientedFrame } from "../yokohama/buildingsGeometry.js";

export const finish = {
  sand: 0xc8b29d, tile: 0xb28d79, darkTile: 0x856655, brick: 0x99705d,
  joint: 0xa79486, chalk: 0xe4e5dd, frame: 0x859298, dark: 0x34454e,
  metal: 0xb6c0c2, roof: 0x9a9c95, blue: 0x426e88, aqua: 0x678d95,
};

// The river-facing elevation remains the front even when the winding or the
// longest side of a cadastral polygon changes.
export function buildingFrame(ring) {
  const raw = orientedFrame(ring);
  let dx = raw.ux, dz = raw.uz;
  if (Math.abs(dx) < Math.abs(dz)) [dx, dz] = [-dz, dx];
  if (dx < 0) { dx = -dx; dz = -dz; }
  const u = ring.map(([x,z]) => x*dx + z*dz);
  const v = ring.map(([x,z]) => -x*dz + z*dx);
  const minU = Math.min(...u), maxU = Math.max(...u);
  const minV = Math.min(...v), maxV = Math.max(...v);
  const u0 = (minU+maxU)/2, v0 = (minV+maxV)/2;
  const point = (a,b) => [(u0+a)*dx - (v0+b)*dz, (u0+a)*dz + (v0+b)*dx];
  return { dx, dz, w:maxU-minU, d:maxV-minV, yaw:-Math.atan2(dz,dx), point,
    local:([x,z]) => [x*dx+z*dz-u0, -x*dz+z*dx-v0] };
}

export function wallFacing(ring, nx, nz) {
  const candidates = edges(ring);
  const score = e => Math.max(0,e.nx*nx+e.nz*nz)**5 * e.length;
  return candidates.reduce((best,e) => score(e)>score(best) ? e : best);
}

export function courtClip(ring, signedDistance) {
  const result=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i], b=ring[(i+1)%ring.length], da=signedDistance(a), db=signedDistance(b);
    if(da>=0)result.push(a);
    if((da>0&&db<0)||(da<0&&db>0)){
      const t=da/(da-db);
      result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return result;
}

export function parapet(m, ring, y, color, h=.65) {
  for(const e of edges(ring)){
    m.face(e,e.length/2,-.10,y+h*.5,e.length,h,.23,color);
    m.face(e,e.length/2,-.10,y+h,e.length+.07,.075,.34,finish.metal);
  }
}

const panes=[0x496875,0x69828a,0x50636e,0x66878d,0x758d91,0x486574];
const blindPanes=[0x8b9b9c,0x839193,0x98a7a4];
function paneColor(row, col, edge) {
  const k=(row*19+col*7+edge*13+row*col)%29;
  return k<4 ? blindPanes[k%3] : panes[k%panes.length];
}

// Piers, spandrels, inner glazing, projecting sills and transoms have independent
// depths. The reveal around each pane is visible in a grazing street view.
export function punchedWindows(m,e,base,top,rows,opt={}) {
  if(e.length < 2 || top-base<1 || rows<1)return;
  const margin=Math.min(opt.margin??.72,e.length*.14);
  const count=Math.max(1,Math.round((e.length-margin*2)/(opt.pitch??4.1)));
  const bay=(e.length-2*margin)/count, step=(top-base)/rows;
  const width=bay*(opt.fraction??.70), h=step*(opt.open??.48);
  const over=opt.relief??.19, body=opt.color??finish.sand, start=opt.start??0;
  for(let j=0;j<count;j++){
    const t=margin+(j+.5)*bay;
    for(let i=0;i<rows;i++){
      const y=base+(i+.57)*step;
      if (opt.skip && opt.skip(i,j,t,y))continue;
      m.face(e,t,.042,y,width,h,.085,finish.dark);
      m.face(e,t,.101,y+.012,width-.10,h-.12,.045,paneColor(i,j+start,start),true);
      if(width>1.5)m.face(e,t,.148,y,.057,h,.09,finish.frame);
      if(width>4.2)for(const f of [-.28,.28])m.face(e,t+width*f,.15,y,.048,h,.07,finish.frame);
      m.face(e,t,over*.5+.10,y-h*.5-.04,width+.16,.10,over+.19,opt.sill??body);
      if(opt.deep){
        m.face(e,t-width*.5-.07,over*.5+.08,y,.14,h+.24,over,body);
        m.face(e,t+width*.5+.07,over*.5+.08,y,.14,h+.24,over,body);
        m.face(e,t,over*.5+.08,y+h*.5+.05,width+.30,.15,over,body);
      }
    }
    if(opt.posts)m.face(e,t-bay*.50,.28,(base+top)*.5,Math.min(.76,bay*.19),top-base,.78,body);
  }
}

export function curtain(m,e,base,top,rows,opt={}) {
  if(e.length<.65||top<=base)return;
  const cols=Math.max(1,Math.round(e.length/(opt.pitch??2.1)));
  const w=e.length/cols,h=(top-base)/rows;
  const glass=opt.colors??[0x386987,0x457d97,0x3d7690,0x4c8199,0x41768d];
  for(let j=0;j<cols;j++) {
    const t=(j+.5)*w;
    for(let i=0;i<rows;i++) {
      const color=glass[(i*11+Math.floor(j/3)*7+(i%3)*j)%glass.length];
      const mid=base+(i+.5)*h;
      m.face(e,t,.075,mid,w-.037,h-.055,.12,color,true);
      if(opt.spandrel) m.face(e,t,.206,mid-h*.5+h*.17,w-.039,h*.32,.10,opt.spandrel,false);
    }
    m.face(e,j*w,.163,(base+top)*.5,.069,top-base,.14,opt.metal??0x53646c);
  }
  for(let i=0;i<=rows;i++)m.face(e,e.length*.5,.165,base+i*h,e.length,.105,.19,opt.metal??0x576b76);
}

export function entrance(m,e,t,base,width,opt={}) {
  const w=Math.min(width,e.length-.5);
  if(w<2)return;
  t=Math.max(w*.5+.12,Math.min(e.length-w*.5-.12,t));
  const stepCount=opt.steps??0,landing=base+stepCount*.17, h=opt.h??3.1;
  const canopy=opt.canopy??2.4,depth=opt.depth??.18;
  for(let j=stepCount;j>=1;j--){
    const d=.36*j;
    m.face(e,t,d*.50,base+(stepCount-j+1)*.085,w,(stepCount-j+1)*.17,d+.17,0xa6a299);
  }
  m.face(e,t,.13,landing+h*.5,w,h,.25,finish.dark);
  const doorW=w*.88/4;
  for(let j=0;j<4;j++){
    const u=t+(j-1.5)*doorW;
    m.face(e,u,.28,landing+h*.47,doorW-.08,h*.86,.08,0x557478,true);
    m.face(e,u,.35,landing+h*.64,doorW,.065,.07,finish.metal);
    if(j===1||j===2)m.face(e,u+(j===1?1:-1)*doorW*.38,.38,landing+1.14,.044,.35,.085,finish.metal);
  }
  m.face(e,t,.25,landing+h-.16,w,.29,.29,finish.frame);
  if(canopy>0) {
    m.face(e,t,canopy*.48,landing+h+.31,w+.65,depth,canopy,opt.capColor??finish.chalk);
    m.face(e,t,canopy-.07,landing+h+.30,w+.67,depth+.08,.15,finish.metal);
    for(const side of [-1,1]){
      const p=at(e,t+side*w*.45,canopy-.25);
      if(opt.posts)m.part("round",p,landing+(h+.2)/2,.19,h+.22,.19,0,finish.metal);
    }
  }
}

export function equipment(m,fr,u,v,w,d,base,h) {
  const p=fr.point(u,v);
  m.box(p,base+.17,w+.42,.34,d+.42,fr.yaw,0x9c9d96);
  m.box(p,base+.30+h/2,w,h,d,fr.yaw,0xbec3bd);
  for(const sign of [-1,1]){
    for(let k=0;k<4;k++)m.box(fr.point(u,v+sign*d*.508), base+.44+h*k*.19,w*.81,.061,.11,fr.yaw,0x758084);
  }
  const fans=Math.max(1,Math.round(w/2.1));
  for(let k=0;k<fans;k++){
    const pos=fr.point(u-w*.5+w*(k+.5)/fans,v), dia=Math.min(d*.68,w/fans*.68);
    m.part("round",pos,base+h+.32,dia,.10,dia,0,0x5d686a);
    m.part("round",pos,base+h+.38,dia*.45,.05,dia*.45,0,0x899491);
  }
}

export function grille(m,e,t,out,base,w,h,color) {
  m.face(e,t,out,base+h*.5,w,h,.20,finish.dark);
  const n=Math.max(2,Math.round(h/.36));
  for(let j=0;j<n;j++)m.face(e,t,out+.17,base+(j+.5)*h/n,w,.10,.20,color);
}
