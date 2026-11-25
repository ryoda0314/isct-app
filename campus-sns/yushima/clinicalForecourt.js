import { buildings } from './data.js';
import { addBlocker, roadTerrainHeight } from './groundsLevels.js';
import { clinicalApronAxis, clinicalFrontage as span, clinicalSitePoint as xy } from './clinicalForecourtPlan.js';
import { rng } from '../yokohama/landscapeGeometry.js';

// Local axes follow the river-facing corners of C. The crossing runs between
// the low planted island on the west and the elevated stone bed on the east.
export const clinicalPavilion={center:1.014,depth:6.62,width:3.9,length:3.12,height:3.9};
function point(u,d,h=0){
  const [x,z]=xy(u,d);
  return [x,roadTerrainHeight(x,z)+h,z];
}

export function clinicalForecourt(t,batch,tree) {
  const rand=rng(326), yaw=-Math.atan2(clinicalApronAxis[1],clinicalApronAxis[0]);
  function bed(start,end,back,front,h,wall,soil) {
    const rim=[[start,back],[end,back],[end,front],[start,front]];
    t.quad(...rim.map(([u,d])=>point(u,d,h)),soil);
    rim.forEach(([u,d],i)=>{
      const [v,e]=rim[(i+1)%4];
      t.quad(point(u,d,.12),point(v,e,.12),point(v,e,h),point(u,d,h),wall);
      addBlocker(xy(u,d),xy(v,e),.07);
    });
  }
  bed(.045,.413,3.9,10.45,.47,0x9d8973,0x69834d);
  function shrub(u,d,h,r) {
    const [x,y,z]=point(u,d,h);
    batch.put('leaf',[0x6b8350,0x839650,0x748746,0x637b4e][Math.floor(rand()*4)],x,y,z,r,.49+r*.22,r*.79,rand()*4);
  }
  for(let i=0;i<18;i++)for(const d of [4.48,9.94])
    shrub(.055+.350*i/17,d,.58,.63+rand()*.18);
  for(let i=0;i<11;i++)shrub(.11+rand()*.24,5.1+rand()*3.8,.64+rand()*.22,.83+rand()*.39);
  for(const [u,d,h] of [[.109,5.4,4.3],[.209,5.3,3.9],[.397,9.28,8.6]]){
    const p=point(u,d,.42);tree(p[0],p[2],p[1],h);
  }
  const start=.704,end=.923,back=5.46,front=12.30,h=1.65;
  bed(start,end,back,front,h,0xb2a28b,0x8c9c64);
  // Three courses of dressed dark stone project from the street wall. Each
  // course has independently spaced joints and a continuous coping stone.
  for(let row=0;row<3;row++){
    const course=.46,marg=.013;
    let u=start;
    while(u<end-.001){
      const v=Math.min(end,u+(.64+rand()*.48)/span);
      const color=[0x706e61,0x6a6658,0x767368,0x615f53,0x827d6f][Math.floor(rand()*5)];
      const lower=.22+row*course, rim=[[.05,.04],[.89,.018],[.99,.13],[.97,.83],[.86,.97],[.1,.98],[.012,.84],[.01,.14]];
      const rough=front+.08+rand()*.045, mid=point((u+v)/2,rough+.053,lower+course*.55);
      const edge=rim.map(([f,g])=>[u+f*(v-u),lower+g*(course-marg)]);
      for(let k=0;k<edge.length;k++){
        const [x,y]=edge[k],[a,b]=edge[(k+1)%edge.length], one=point(x,rough,y), two=point(a,rough,b);
        t.tri(one,two,mid,color);
        t.quad(point(x,front+.008,y),one,two,point(a,front+.008,b),color);
      }
      u=v;
    }
  }
  batch.beam(point(start,front,h),point(end,front,h),.14,.27,0xaaa18d);
  for(const [a,b] of [[[start,front],[end,front]],[[start,front],[start,front-2]],[[end,front],[end,front-2]]]){
    const count=Math.ceil(Math.hypot((a[0]-b[0])*span,a[1]-b[1])/.21);
    for(let j=0;j<=count;j++){
      const u=a[0]+(b[0]-a[0])*j/count,d=a[1]+(b[1]-a[1])*j/count;
      batch.beam(point(u,d,h),point(u,d,h+.88),.034,.033,0x53544c);
    }
    for(const y of [.12,.82,.92])batch.beam(point(...a,h+y),point(...b,h+y),.047,.05,0x494c46);
  }
  for(let i=0;i<13;i++)shrub(start+.013+(end-start-.026)*i/12,front-.67,h+.17,.65);
  for(const [u,d] of [[.775,9.5],[.850,8.7]])shrub(u,d,h+.44,1.27);
  const board=(u,w,color)=>batch.put('box',color,...point(u,front+.078,h+.48),w,.73,.068,yaw);
  const ink=(u,x,y,depth=.123)=>point(u+x/span,front+depth,h+.48+y);
  board(.770,1.68,0xe3e1d7);
  for(const b of buildings)for(let j=0;j<b.footprint.length;j++){
    const toPanel=([x,z])=>ink(.770,(x+14)*.0054,-(z+2)*.00265);
    const p=b.footprint[j],q=b.footprint[(j+1)%b.footprint.length];
    batch.beam(toPanel(p),toPanel(q),.015,.012,0x81928c);
  }
  board(.873,1.95,0xeec845);
  const glyph=[[-.40,-.24],[-.40,.25],[-.17,.25],[-.10,.17],[-.10,.07],[-.18,.01],[-.40,.01]];
  for(let j=1;j<glyph.length;j++)batch.beam(ink(.873,...glyph[j-1]),ink(.873,...glyph[j]),.068,.05,0x32382e);
  const p=clinicalPavilion, left=p.center-p.width/(2*span),right=p.center+p.width/(2*span);
  const rear=p.depth-p.length/2,entrance=p.depth+p.length/2;
  addBlocker(xy(left,rear),xy(right,rear),.07);
  for(const u of [left,right])addBlocker(xy(u,rear),xy(u,entrance),.07);
}
