import { toXY } from "./campus3dFeatures.js";
import { emptyPavingTile, tileContextOptions, tileImage, tileSnapshot } from "./campus3dPavingTiles.js";

// Project the same boughs and terminal foliage clusters that the 3D tree builder
// produced. MapLibre drapes the resulting shade over slopes, kerbs and road markings.
const CELL = 48, SIZE = 256, TAU = 2*Math.PI;
let nextSource = 0;
const clamp = n => Math.max(0, Math.min(1, n));
function cells(box, visit) {
  for (let x=Math.floor(box[0]/CELL); x<=Math.floor(box[2]/CELL); x++)
    for (let y=Math.floor(box[1]/CELL); y<=Math.floor(box[3]/CELL); y++) visit(x+","+y);
}
function tileCorner(x,y,n) {
  return toXY([x/n*360-180, Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI]);
}
function projectTree(tree, dx, dy, leaf) {
  const wood = new Path2D(), foliage = new Path2D();
  const foot=([x,y,z,r]) => [x+(z-tree.base)*dx,y+(z-tree.base)*dy,r];
  function limb(points) {
    let start=foot(points[0]);
    for (let i=1;i<points.length;i++) {
      const end=foot(points[i]), vx=end[0]-start[0], vy=end[1]-start[1], len=Math.hypot(vx,vy);
      if (len>.008) {
        const nx=-vy/len, ny=vx/len;
        wood.moveTo(start[0]+nx*start[2],start[1]+ny*start[2]);
        wood.lineTo(end[0]+nx*end[2],end[1]+ny*end[2]);
        wood.lineTo(end[0]-nx*end[2],end[1]-ny*end[2]);
        wood.lineTo(start[0]-nx*start[2],start[1]-ny*start[2]); wood.closePath();
      }
      start=end;
    }
  }
  limb([[tree.x,tree.y,tree.base,tree.radius],[tree.x,tree.y,tree.base+tree.h*.64,tree.radius*.38]]);
  tree.limbs.forEach(limb);
  tree.crowns.forEach((c,i) => {
    if (leaf<.04) return;
    const [x,y,r]=foot(c), phase=i*2.39996, spread=r*Math.sqrt(leaf);
    // Five groups per terminal shoot leave apertures between adjacent twigs.
    for(let k=0;k<5;k++) {
      const a=phase+k*2.39996, d=spread*(.13+.16*k);
      const px=x+d*Math.cos(a), py=y+d*Math.sin(a);
      const rx=Math.max(.035,spread*(.48-.024*k)), ry=rx*(.72+.14*Math.abs(Math.sin(phase)));
      foliage.moveTo(px+rx*Math.cos(a),py+rx*Math.sin(a)); foliage.ellipse(px,py,rx,ry,a,0,TAU);
    }
  });
  return { wood, foliage };
}

export function attachTreeShade(map, ml, bounds) {
  const protocol="campusshade"+(++nextSource), source="cbTreeShade", layer="cb-tree-shade";
  let trees=[], env, index=new Map(), key="", opacity=-1, version=0;
  const url=()=>protocol+"://{z}/{x}/{y}?v="+version;
  function refresh() {
    if (!env || !map.getSource(source)) return;
    const {azimuth,elevation}=env.sun, cloud=clamp(env.weather?.cloud || 0);
    const strength=Math.round(100*.46*clamp((elevation-2)/13)*(1-.84*cloud))/100;
    if (strength!==opacity) { map.setPaintProperty(layer,"raster-opacity",strength); opacity=strength; }
    if (!strength || !trees.length) return;
    const az=Math.round(azimuth/5)*5, el=Math.max(13,Math.round(elevation/3)*3);
    const leaves=Object.fromEntries(Object.entries(env.plants).map(([s,state])=>[s,Math.round(state.leaf*8)/8]));
    const sunKey=JSON.stringify([az,el,leaves]);
    if (key===sunKey) return;
    key=sunKey; index=new Map();
    const length=1/Math.tan(el*Math.PI/180), dx=-length*Math.sin(az*Math.PI/180), dy=-length*Math.cos(az*Math.PI/180);
    for(const tree of trees) {
      const crown=tree.spread, reach=tree.h*1.2;
      const box=[tree.x+Math.min(0,reach*dx)-crown,tree.y+Math.min(0,reach*dy)-crown,
        tree.x+Math.max(0,reach*dx)+crown,tree.y+Math.max(0,reach*dy)+crown];
      const entry={tree,box,dx,dy,leaf:leaves[tree.species]??1,shape:null};
      cells(box,cell=>{ if (!index.has(cell)) index.set(cell,[]); index.get(cell).push(entry); });
    }
    ++version; map.getSource(source).setTiles([url()]);
  }
  ml.addProtocol(protocol,async ({url:request},controller)=>{
    const [z,x,y]=request.split("://")[1].split("?")[0].split("/").map(Number), n=2**z;
    const [left,top]=tileCorner(x,y,n),[right,bottom]=tileCorner(x+1,y+1,n);
    const visible=new Set();
    cells([left,bottom,right,top],cell=>{
      for(const shape of index.get(cell)||[]) {
        const b=shape.box;
        if (b[0]<=right && b[2]>=left && b[1]<=top && b[3]>=bottom) visible.add(shape);
      }
    });
    controller?.signal?.throwIfAborted?.();
    if (!visible.size) return {data:tileImage(await emptyPavingTile())};
    const c=typeof OffscreenCanvas==="function" ? new OffscreenCanvas(SIZE,SIZE) : document.createElement("canvas");
    c.width=c.height=SIZE;
    const ctx=c.getContext("2d",tileContextOptions), sx=SIZE/(right-left), sy=SIZE/(top-bottom);
    ctx.setTransform(sx,0,0,-sy,-left*sx,top*sy);
    ctx.fillStyle="rgba(32,37,47,.78)";
    for(const entry of visible) {
      entry.shape ??= projectTree(entry.tree,entry.dx,entry.dy,entry.leaf);
      ctx.fill(entry.shape.foliage);
    }
    ctx.fillStyle="rgba(28,33,42,.93)";
    for(const entry of visible) ctx.fill(entry.shape.wood);
    controller?.signal?.throwIfAborted?.();
    return { data:tileImage(await tileSnapshot(c)) };
  });
  map.addSource(source,{type:"raster",tiles:[url()],tileSize:SIZE,minzoom:16,maxzoom:21,bounds:[bounds.w,bounds.s,bounds.e,bounds.n]});
  map.addLayer({id:layer,type:"raster",source,minzoom:16,paint:{"raster-opacity":0,"raster-fade-duration":0}},"cb-passage-shade");
  map.once("remove",()=>{ index.clear(); trees=[]; ml.removeProtocol(protocol); });
  return {
    setTrees(value) {
      trees=value; key="";
      if(!trees.length){index.clear(); ++version; map.getSource(source)?.setTiles([url()]);}
      else refresh();
    },
    setEnv(value) { env=value; refresh(); },
  };
}
