// Reconstruct a continuous longitudinal grade for an at-grade campus street.
// DEM5A measures 5 m terrain cells, including the banks beside the pavement.
// Slopes are fitted along the surveyed route, not across buildings or valleys.
const key=p=>p[0]+','+p[1];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);

function interval(knots,x) {
  let lo=0,hi=knots.length-1;
  while(hi-lo>1){const i=(hi+lo)>>>1;if(knots[i]<=x)lo=i;else hi=i;}
  return lo;
}

function fitChain(chain,ground) {
  const length=chain.at(-1).start+chain.at(-1).len;
  const starts=chain.map(s=>s.start).concat(length);
  const count=Math.max(1,Math.ceil(length/1.5)),step=length/count;
  const raw=[],filtered=[],closed=key(chain[0].a)===key(chain.at(-1).b);
  for(let j=0;j<=count;j++){
    const d=j*step,s=chain[interval(starts,d)],f=(d-s.start)/s.len;
    raw.push(ground(s.a[0]+(s.b[0]-s.a[0])*f,s.a[1]+(s.b[1]-s.a[1])*f,s.path,d));
  }
  // Linear continuation preserves a genuine steady incline even at the end of
  // a short street. Closed loops use samples from the other end of the loop.
  const look=Math.min(count,Math.max(1,Math.round(9/step)));
  const left=(raw[look]-raw[0])/look,right=(raw[count]-raw[count-look])/look;
  const radius=Math.min(18,Math.ceil(15/step));
  const kernel=Array.from({length:radius+1},(_,i)=>Math.exp(-.5*(i*step/5.2)**2));
  const total=kernel[0]+2*kernel.slice(1).reduce((a,b)=>a+b,0);
  function sample(j){
    if(closed)return raw[((j%count)+count)%count];
    if(j<0)return raw[0]+left*j;
    if(j>count)return raw[count]+right*(j-count);
    return raw[j];
  }
  for(let j=0;j<=count;j++){
    let sum=raw[j];
    for(let k=1;k<=radius;k++)sum+=kernel[k]*(sample(j-k)+sample(j+k));
    filtered.push(sum/total);
  }
  const estimate=d=>{
    const i=Math.min(count-1,Math.floor(clamp(d/step,0,count))),t=d/step-i;
    return filtered[i]+(filtered[i+1]-filtered[i])*t;
  };
  return {chain,starts,length,step,count,estimate};
}

export function prepareStreetGrades(segments,ground,isSpecial,profile,include=path=>path.walkable!==false) {
  const ordinary=new Map(),owners=new Map(),incidence=new Map(),fixed=new Map();
  for(const s of segments){
    if(!include(s.path))continue;
    const structural=isSpecial(s.path);
    for(const [i,p] of [s.a,s.b].entries()){
      const k=key(p);
      if(!owners.has(k))owners.set(k,new Set());
      owners.get(k).add(s.path);
      incidence.set(k,(incidence.get(k)||0)+1);
      if(s.path.siteModel)continue;
      if(structural)fixed.set(k,profile(s,i));
    }
    if(structural||s.path.siteModel)continue;
    if(!ordinary.has(s.path))ordinary.set(s.path,[]);
    ordinary.get(s.path).push(s);
  }
  const chains=Array.from(ordinary.values(),chain=>fitChain(chain,ground)),junctions=new Map();
  for(const c of chains){
    c.anchors=[];
    const vertices=[c.chain[0].a,...c.chain.map(s=>s.b)];
    for(const [i,p] of vertices.entries()){
      const k=key(p),d=c.starts[i],atEnd=i===0||i===vertices.length-1,users=owners.get(k);
      if(!atEnd&&users.size===1&&incidence.get(k)===2)continue;
      if(!junctions.has(k))junctions.set(k,[]);
      const sample=c.estimate(d);junctions.get(k).push(sample);
      c.anchors.push({d,k,sample});
      // A surveyed path leading into custom paving should meet its actual grade.
      if(!fixed.has(k)&&[...users].some(path=>path.siteModel))fixed.set(k,ground(...p));
    }
  }
  for(const c of chains){
    for(const a of c.anchors){
      const elevations=junctions.get(a.k);
      const target=fixed.get(a.k)??(elevations.reduce((sum,y)=>sum+y,0)/elevations.length);
      a.correction=target-a.sample;
    }
    const knots=Array.from(new Set([...c.anchors.map(a=>a.d),
      ...Array.from({length:c.count+1},(_,j)=>j===c.count?c.length:j*c.step)])).sort((a,b)=>a-b);
    const stations=c.anchors.map(a=>a.d);
    const heights=knots.map(d=>{
      const index=interval(stations,d),a=c.anchors[index],b=c.anchors[index+1],span=b.d-a.d;
      const reach=Math.min(span,12);
      const l=smooth(clamp(1-(d-a.d)/reach,0,1)),r=smooth(clamp(1-(b.d-d)/reach,0,1));
      return c.estimate(d)+(l*a.correction+r*b.correction)/Math.max(1,l+r);
    });
    const slopes=heights.slice(1).map((h,j)=>(h-heights[j])/(knots[j+1]-knots[j]));
    const tangents=heights.map((_,j)=>{
      if(j===0)return slopes[0];
      if(j===slopes.length)return slopes[j-1];
      const a=slopes[j-1],b=slopes[j];
      return a*b>0?2*a*b/(a+b):0;
    });
    function elevation(d){
      const j=interval(knots,d),run=knots[j+1]-knots[j],t=clamp((d-knots[j])/run,0,1),f=1-t;
      return f*f*((1+2*t)*heights[j]+t*run*tangents[j])+t*t*((3-2*t)*heights[j+1]-f*run*tangents[j+1]);
    }
    for(const s of c.chain)s.elevation=elevation;
  }
}

// Adjacent ribbons evaluate the same world-space height, including under a
// mitered corner or in an intersection. Inverse-distance weighting keeps the
// measured centreline exact while smoothly joining the transverse profiles.
export function streetBed(x,z,original,segments,lower=0) {
  let sum=0,total=0,coverage=0;
  for(const s of segments){
    if(!s.elevation)continue;
    const f=clamp(((x-s.a[0])*(s.b[0]-s.a[0])+(z-s.a[1])*(s.b[1]-s.a[1]))/(s.len*s.len),0,1);
    const dx=x-s.a[0]-(s.b[0]-s.a[0])*f,dz=z-s.a[1]-(s.b[1]-s.a[1])*f,d2=dx*dx+dz*dz;
    const shoulder=s.half+.35,outer=shoulder+3;
    if(d2>=outer*outer)continue;
    const y=s.elevation(s.start+s.len*f);
    if(d2<1e-10)return y-lower;
    const d=Math.sqrt(d2),fade=smooth(clamp((outer-d)/(outer-shoulder),0,1));
    const weight=fade*fade/(d2+.0025);
    total+=weight;sum+=weight*y;coverage=Math.max(coverage,fade);
  }
  return total?original+coverage*(sum/total-lower-original):original;
}
