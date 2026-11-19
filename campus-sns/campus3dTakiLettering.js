// Small exhibition signs use actual letter outlines, including the counters of
// the Japanese glyphs. The same local plane works on metal, paper and sloped wood.
import { characters, codeRows, plaqueRows } from "./campus3dTakiTypeData.js";

const glyphs=new Map();
function glyph(char) {
  if (glyphs.has(char)) return glyphs.get(char);
  const record=characters[char];
  if (!record) return { advance:.5, groups:[] };
  const bytes=Uint8Array.from(atob(record[1]),c=>c.charCodeAt(0));
  const groups=[];
  for (let i=0;i<bytes.length;) {
    const numLoops=bytes[i++], loops=[], points=[];
    for (let j=0;j<numLoops;j++) {
      const count=bytes[i++], start=points.length;
      for (let k=0;k<count;k++) points.push([(bytes[i++]-32)/195,(bytes[i++]-32)/195]);
      loops.push([start,points.length]);
    }
    const count=bytes[i++]|bytes[i++]<<8;
    groups.push({points,loops,faces:bytes.subarray(i,i+count)});
    i+=count;
  }
  const g={advance:record[0]/1000,groups};
  glyphs.set(char,g);
  return g;
}

export function lettering(g,plane,str,cx,baseline,maxWidth,size,ink,depth=.00045) {
  const letters=Array.from(str,glyph),em=Math.min(size,maxWidth/letters.reduce((a,l)=>a+l.advance,0));
  let left=cx-em*letters.reduce((a,l)=>a+l.advance,0)/2;
  for (const letter of letters) {
    for (const {points,loops,faces} of letter.groups) {
      const front=points.map(([x,y])=>plane.at(left+x*em,baseline+y*em,depth));
      for (let i=0;i<faces.length;i+=3) g.triangle([front[faces[i]],front[faces[i+1]],front[faces[i+2]]],plane.n,ink);
      // Only relief lettering casts an appreciable edge. Small printed ink stays flush.
      if (depth>.0008) {
        const back=points.map(([x,y])=>plane.at(left+x*em,baseline+y*em,0));
        for (const [start,end] of loops) for (let a=start;a<end;a++) {
          const b=a+1===end?start:a+1, dx=points[b][0]-points[a][0], dy=points[b][1]-points[a][1];
          const len=Math.hypot(dx,dy)||1, n0=plane.at(0,0), n1=plane.at(dy/len,-dx/len);
          g.quad([back[a],back[b],front[b],front[a]],n1.map((v,i)=>v-n0[i]),ink);
        }
      }
    }
    left+=letter.advance*em;
  }
}

// Each dark run in the filmed sign's decoded QR symbol is one ink polygon.
export function infoCode(g,plane,x,y,size,ink,plaque=false) {
  const rows=plaque?plaqueRows:codeRows,pitch=size/rows.length;
  rows.forEach((row,j)=>{
    for (const run of row.matchAll(/1+/g)) {
      const a=x+run.index*pitch,b=a+run[0].length*pitch,v=y+size-(j+1)*pitch;
      g.quad([plane.at(a,v,.0004),plane.at(b,v,.0004),plane.at(b,v+pitch,.0004),plane.at(a,v+pitch,.0004)],plane.n,ink);
    }
  });
}

// The little line drawing on the lectern, in the same timber-coloured ink.
export function drawPicodyMark(g,plane,x,y,size,ink) {
  const paths=[
    [[.18,.57],[.12,.63],[.12,.77],[.17,.90],[.28,.97],[.50,1],[.71,.96],[.80,.85],[.83,.63],[.78,.56]],
    [[.18,.79],[.27,.84],[.42,.85],[.47,.77],[.53,.76],[.60,.84],[.73,.81],[.78,.74]],
    [[.17,.68],[.20,.60],[.34,.53],[.54,.52],[.71,.57],[.77,.65]],
    [[.31,.72],[.34,.75],[.38,.72],[.37,.65],[.32,.65],[.31,.72]],
    [[.57,.71],[.60,.75],[.64,.72],[.63,.65],[.58,.65],[.57,.71]],
    [[.31,.52],[.29,.40],[.21,.25],[.37,.20],[.63,.21],[.72,.26],[.63,.50]],
    [[.31,.46],[.19,.36],[.11,.36],[.08,.40]],[[.64,.49],[.77,.53],[.87,.65],[.93,.61],[.80,.45],[.70,.42]],
    [[.33,.20],[.29,.06],[.25,.03],[.43,.02],[.47,.19]],[[.52,.20],[.53,.03],[.71,.03],[.65,.10],[.65,.22]]
  ];
  for (const path of paths) for (let i=1;i<path.length;i++) {
    const [a,b]=[path[i-1],path[i]],dx=b[0]-a[0],dy=b[1]-a[1],r=.011/(Math.hypot(dx,dy)||1);
    const point=(q,s)=>plane.at(x+(q[0]+s*dy*r)*size,y+(q[1]-s*dx*r)*size,.0005);
    g.quad([point(a,1),point(b,1),point(b,-1),point(a,-1)],plane.n,ink);
  }
}
