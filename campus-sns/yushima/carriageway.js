const dot=(ax,az,bx,bz)=>ax*bx+az*bz;
const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
const average=(a,b)=>(a+b)*.5;

// Survey ways divide one continuous street at intersections and width changes.
// Use a common cross-section there for both the asphalt and every lane stripe.
export function carriagewaySections(roads){
  const nodes=new Map(),ends=new Map();
  for(const s of roads){
    const pair=[];
    for(const [p,sign] of [[s.a,1],[s.b,-1]]){
      const key=p.join(','),arm={s,p,sign,nx:s.nx,nz:s.nz,half:s.half};
      if(!nodes.has(key))nodes.set(key,[]);
      nodes.get(key).push(arm);pair.push(arm);
    }
    ends.set(s,pair);
  }
  for(const arms of nodes.values())for(const arm of arms){
    const {s,sign}=arm;
    const matches=arms.filter(b=>b!==arm&&b.s.path.name===s.path.name&&
      sign*b.sign*dot(s.nx,s.nz,b.s.nx,b.s.nz)<-.65);
    if(matches.length!==1)continue;
    const b=matches[0],same=-sign*b.sign,cos=same*dot(s.nx,s.nz,b.s.nx,b.s.nz);
    arm.nx=(s.nx+same*b.s.nx)/(1+cos);arm.nz=(s.nz+same*b.s.nz)/(1+cos);
    arm.half=average(s.half,b.s.half);
  }
  function reach(s){return Math.min(s.len*.45,7.5);}
  function point(s,d,fraction,extra){
    const [a,b]=ends.get(s),length=reach(s);
    const lo=Math.max(0,1-d/length),hi=Math.max(0,1-(s.len-d)/length);
    const width=fraction*s.half+extra,wA=fraction*a.half+extra,wB=fraction*b.half+extra;
    return [s.a[0]+s.nz*d+s.nx*width*(1-lo-hi)+a.nx*wA*lo+b.nx*wB*hi,
      s.a[1]-s.nx*d+s.nz*width*(1-lo-hi)+a.nz*wA*lo+b.nz*wB*hi];
  }
  function band(s,lo,hi,left,right,pad=0){
    const length=reach(s),ds=[lo,...[length,s.len-length].filter(d=>d>lo&&d<hi),hi];
    return [...ds.map(d=>point(s,d,left,-pad)),...ds.reverse().map(d=>point(s,d,right,pad))];
  }
  return {band,ends};
}

// The survey records the sidewalk and street as separate axes. Where the
// hospital sidewalk parallels Sotobori-dori up to the kerb, close the space
// between their surveyed widths. Use the actual street edge through its bend.
export function sidewalkShoulders(walks,street){
  const boundary=[];
  for(const polygon of street)for(const ring of polygon)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len>.001)boundary.push({a,dx,dz,len});
  }
  function streetEdge(x,z,nx,nz){
    let nearest=Infinity;
    for(const {a,dx,dz,len} of boundary){
      const den=cross(nx,nz,dx,dz);
      if(Math.abs(den)<len*.76)continue;
      const ax=a[0]-x,az=a[1]-z;
      const along=cross(ax,az,nx,nz)/den,depth=cross(ax,az,dx,dz)/den;
      if(along>=-.0001&&along<=1.0001&&depth>=-.15&&depth<nearest)nearest=depth;
    }
    return nearest<=3.8?Math.max(.06,nearest+.04):0;
  }
  const strips=[];
  for(const s of walks)for(const side of [-1,1]){
    const count=Math.ceil(s.len/.95),nx=s.nx*side,nz=s.nz*side;
    let previous;
    for(let i=0;i<=count;i++){
      const f=i/count,x=s.a[0]+s.nz*s.len*f+nx*s.half,z=s.a[1]-s.nx*s.len*f+nz*s.half;
      const depth=streetEdge(x,z,nx,nz);
      const section={inner:[x-nx*.05,z-nz*.05],outer:[x+nx*depth,z+nz*depth],depth};
      if(previous&&(previous.depth||depth))strips.push([previous.inner,previous.outer,section.outer,section.inner]);
      previous=section;
    }
  }
  return strips;
}
