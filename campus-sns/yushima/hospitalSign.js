import { ShapeUtils, Vector2 } from "three";
import { at } from "../yokohama/buildingsGeometry.js";
import { hospitalLettering } from "./hospitalLettering.js";

const designWidth=382.518;
const inks=[0x203775,0x7d95bd];
const sideColor=0x3d4758;

// Use the logo's outlines as individual channel letters. Counters in letters
// such as 病, 院 and O remain open to the tile behind them from every angle.
export function hospitalSign(m,wall,roof){
  const right=Math.sign(wall.dx*wall.nz-wall.dz*wall.nx);
  const left=(right>0?.064:.936)*wall.length;
  const scale=wall.length*.352/designWidth,top=roof+.27;
  function point(p,depth){
    const [x,z]=at(wall,left+right*p.x*scale,depth);
    return [x,top-p.y*scale,z];
  }
  for(const [ink,...outlines] of hospitalLettering){
    const rings=outlines.map(flat=>{
      const ring=[];
      for(let i=0;i<flat.length;i+=2)ring.push(new Vector2(flat[i],flat[i+1]));
      return ring;
    });
    const faces=ShapeUtils.triangulateShape(rings[0],rings.slice(1));
    const front=rings.flat().map(p=>point(p,.13));
    for(const [a,b,c] of faces)m.triangle(front[c],front[b],front[a],inks[ink]);
    for(const [index,ring] of rings.entries()){
      const forward=ShapeUtils.isClockWise(ring)===(index===0);
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length];
        const near=forward?a:b,far=forward?b:a;
        const A=point(near,.13),B=point(far,.13),C=point(far,.012),D=point(near,.012);
        m.triangle(A,C,B,sideColor);m.triangle(A,D,C,sideColor);
      }
    }
  }
}
