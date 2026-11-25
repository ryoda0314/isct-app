// Sample the same NW–SE diagonal used by the one-metre terrain and plaza meshes.
export function gridSurfaceAt(x,z,spacing,height) {
  const X=Math.floor(x/spacing)*spacing,Z=Math.floor(z/spacing)*spacing,u=(x-X)/spacing,v=(z-Z)/spacing;
  const a=height(X,Z);
  if(!u&&!v)return a;
  const c=height(X+spacing,Z+spacing);
  return u>v?a*(1-u)+height(X+spacing,Z)*(u-v)+c*v:
    a*(1-v)+height(X,Z+spacing)*(v-u)+c*u;
}

// Fine ground is limited to the roadbed, its shoulders and the landscaped
// courtyards. Tile boundaries follow the 5 m DEM grid. Vertices on both sides
// sample the same surface, including at the two tunnel portals.
export function addRoadsideTerrain(T,group,cells,grid,baseColors,material,sample,opening,plaza,exposedSoil) {
  const tiles=new Map(),span=grid.step*16,subdivisions=5,spacing=grid.step/subdivisions;
  const earth=new T.Color(0xa48c70).toArray();
  for(const [x,z,k,portal] of cells){
    const tileX=Math.floor((x-grid.xMin)/span),tileZ=Math.floor((z-grid.zMin)/span);
    const tileKey=tileX+','+tileZ;
    if(!tiles.has(tileKey))tiles.set(tileKey,{x:grid.xMin+tileX*span,z:grid.zMin+tileZ*span,cells:[]});
    tiles.get(tileKey).cells.push([x,z,k,portal]);
  }
  for(const tile of tiles.values()){
    const positions=[],colors=[],indices=[],vertices=new Map();
    function vertex(x,z,k,i,j) {
      const X=x+i*spacing,Z=z+j*spacing;
      const key=Number.isInteger(i)&&Number.isInteger(j)
        ? Math.round((Z-tile.z)/spacing)*(16*subdivisions+1)+Math.round((X-tile.x)/spacing)
        : X.toFixed(7)+','+Z.toFixed(7);
      if(vertices.has(key))return vertices.get(key);
      const id=positions.length/3,fx=i/subdivisions,fz=j/subdivisions;
      positions.push(X,Number.isInteger(i)&&Number.isInteger(j)?sample(X,Z):gridSurfaceAt(X,Z,spacing,sample),Z);
      const right=k+1,bottom=k+grid.width,diagonal=bottom+1;
      const worn=exposedSoil(X,Z);
      for(let c=0;c<3;c++){
        const first=baseColors[3*k+c],last=baseColors[3*diagonal+c];
        const base=fx>fz?first*(1-fx)+baseColors[3*right+c]*(fx-fz)+last*fz:
          first*(1-fz)+baseColors[3*bottom+c]*(fz-fx)+last*fx;
        colors.push(base+(earth[c]-base)*worn);
      }
      vertices.set(key,id);return id;
    }
    for(const [x,z,k,portal] of tile.cells){
      const atPlaza=plaza?.within(x,z,grid.step);
      for(let j=0;j<subdivisions;j++)for(let i=0;i<subdivisions;i++){
        if(portal&&opening(x+(i+.5)*spacing,z+(j+.5)*spacing))continue;
        if(atPlaza){
          const remainder=plaza.cell(x+i*spacing,z+j*spacing);
          if(remainder!==null){
            for(const tri of remainder)for(const [X,Z] of tri)indices.push(vertex(x,z,k,(X-x)/spacing,(Z-z)/spacing));
            continue;
          }
        }
        const a=vertex(x,z,k,i,j),b=vertex(x,z,k,i,j+1);
        const c=vertex(x,z,k,i+1,j+1),d=vertex(x,z,k,i+1,j);
        indices.push(a,b,c,a,c,d);
      }
    }
    if(!indices.length)continue;
    const geo=new T.BufferGeometry();geo.setIndex(indices);
    geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.computeVertexNormals();geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;
    mesh.name='GSI DEM5A · road shoulders';group.add(mesh);
  }
}
