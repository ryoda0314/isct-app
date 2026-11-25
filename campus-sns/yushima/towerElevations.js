import { Matrix4, Quaternion, Vector3 } from "three";
import { at } from "../yokohama/buildingsGeometry.js";
import { entrance } from "./facadeKit.js";

// Filter the mortar to screen-pixel size when viewing the crown from the
// garden. The stone colour masks off the concrete reveals and metalwork.
export function towerStoneMaterial(shell){
  const stone=shell.clone();
  stone.name="M&D 石張り";
  stone.onBeforeCompile=shader=>{
    shader.vertexShader="varying vec2 stonePosition; varying float stoneSurface;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`
      #include <begin_vertex>
      stonePosition = vec2(dot(position.xz,vec2(normal.z,-normal.x)),position.y);
      stoneSurface = (1.0-step(0.15,abs(normal.y)))*step(.86,color.r)*step(.65,color.g)*(1.0-step(.60,color.b));
    `);
    shader.fragmentShader="varying vec2 stonePosition; varying float stoneSurface;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      vec2 tile = stonePosition / vec2(1.24,.74);
      vec2 pixel = max(fwidth(tile),vec2(.001));
      tile.x += .5 * mod(floor(tile.y),2.0);
      vec2 edge = .5-abs(fract(tile)-.5);
      vec2 interior = smoothstep(vec2(.013,.018)-pixel*.56,vec2(.013,.018)+pixel*.56,edge);
      float joint = 1.0-interior.x*interior.y;
      float variation = fract(sin(dot(floor(tile),vec2(17.91,83.47)))*32815.79)-.5;
      float fade = stoneSurface * (1.0-smoothstep(.20,.90,max(pixel.x,pixel.y)));
      diffuseColor.rgb *= 1.0+fade*(variation*.072-joint*.22);
    `);
  };
  return stone;
}

// The south curtain turns back underneath the laboratories. Inside the atrium,
// the columns, mezzanine and inner doors can be seen through the outer glazing.
export function gardenCurtain(m,e,base,lobby,transfer,mainRoof,deck) {
  const width=e.length, middle=width/2, n=Math.max(4,Math.round(width/1.65)), w=width/n;
  const h=lobby-base, hallTop=lobby-.16;
  m.face(e,middle,-4.34,(base+hallTop)/2,width,h,.12,0x617773);
  for(let j=0;j<6;j++){
    m.part("round",at(e,(j+.5)*width/6,-2.78),(hallTop+deck)/2,.53,hallTop-deck,.53,0,0xd7d3bc);
  }
  for(const y of [deck,deck+(hallTop-deck)*.60]){
    m.face(e,middle,-3.18,y,width,.30,2.18,0xa7a89b);
    m.face(e,middle,-2.38,y+.97,width,.055,.075,0xb9bfae);
  }
  for(let j=0;j<12;j++){
    const t=(j+.5)*width/12;
    m.face(e,t,-4.10,deck+2.09,width/12-.22,3.93,.13,j%3===0?0x849a99:0x566f70);
    m.face(e,t,-4.08,hallTop-3.12,width/12-.34,4.48,.13,[0x98a8a4,0x829998,0xa2aba0][j%3]);
    m.face(e,t,-3.52,hallTop-.53,width/12*.62,.077,.29,0xf2e3c8);
  }
  const yStep=(hallTop-base)/4;
  for(let j=0;j<n;j++){
    const t=(j+.5)*w;
    // Leave the lower central opening clear down to the recessed automatic doors.
    const entranceBay=Math.abs(t-middle)<w*2;
    for(let k=0;k<4;k++){
      const y=base+(k+.5)*yStep;
      if(entranceBay && y<deck+3.65)continue;
      m.face(e,t,-.35,y,w-.052,yStep-.055,.045,[0x689898,0x769e9b,0x739695][j%3],"clear");
    }
    m.face(e,j*w,-.28,(hallTop+base)/2,.067,h,.12,0x4d6261);
  }
  for(let k=1;k<=4;k++)m.face(e,middle,-.25,base+k*yStep,width,.085,.15,0x62716b);
  entrance(m,{...e,a:at(e,0,-2.52)},middle,deck,w*4,{h:3.62,canopy:0});

  const shoulder=lobby+(transfer-lobby)*.57, band=(shoulder-lobby)/4;
  // Three dark casements interrupt a single pale horizontal course.
  const panel=[0x9ab0b4,0xa5b8bb,0x9bb2b9,0xb1c0bf];
  for(let i=0;i<4;i++)for(let j=0;j<n;j++){
    const center=(j+.5)*w, y=lobby+(i+.5)*band;
    const open=Math.abs(center-middle)<width*.118 && i===1;
    m.face(e,center,open?-1.82:-1.49,y,w-.027,band-.044,open?.09:.18,open?0x33423d:panel[(i+Math.floor(j/5))%4]);
    m.face(e,center,open?-1.70:-1.37,y,w-.065,band-.07,.046,open?0x3e5052:0x688891,"clear");
    m.face(e,j*w,-1.37,y,.055,band,.11,0x637a7c);
    if(open)m.face(e,center,-1.65,y,.067,band,.12,0x5d6c6c);
  }
  for(let i=0;i<=4;i++)m.face(e,middle,-1.39,lobby+i*band,width,.075,.21,0x809397);

  // The dark glass belt slopes outwards to meet the overhanging laboratory floors.
  const travel=1.93, rise=transfer-shoulder, tangent=new Vector3(e.dx,0,e.dz);
  const incline=new Vector3(e.nx*travel,rise,e.nz*travel).normalize();
  const normal=new Vector3().crossVectors(tangent,incline);
  const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(tangent,incline,normal));
  const beltColors=[0x263941,0x33494e,0x394a51,0x2e3e43];
  for(let k=0;k<3;k++){
    const f=(k+.5)/3, y=shoulder+f*rise, out=-1.48+travel*f;
    const tall=Math.hypot(rise,travel)/3;
    for(let j=0;j<n;j++){
      const t=(j+.5)*w, tint=beltColors[(k+Math.floor(j/3))%4];
      m.part("box",at(e,t,out),y,w-.028,tall-.023,.09,0,tint,false,rotation);
      m.part("box",at(e,t,out+.068),y,w-.065,tall-.062,.035,0,0x435966,"clear",rotation);
      m.part("box",at(e,j*w,out+.071),y,.055,tall,.11,0,0x38474c,false,rotation);
    }
    m.face(e,middle,-1.48+travel*k/3,shoulder+rise*k/3,width,.082,.13,0x58666b);
  }
  m.face(e,middle,.47,transfer,width+.16,.27,.53,0x526169);
  const floor=(mainRoof-transfer)/15, windows=[0x5589ac,0x517e9c,0x6590a4,0x497a9c,0x598aa7];
  const aprons=[0x486d88,0x557891,0x536f86,0x587b91];
  for(let k=0;k<15;k++){
    const sill=transfer+k*floor;
    for(let j=0;j<n;j++){
      const t=(j+.5)*w;
      m.face(e,t,.15,sill+floor*.722,w-.048,floor*.525,.12,windows[(k+Math.floor(j/3))%5],true);
      m.face(e,t,.25,sill+floor*.225,w-.04,floor*.45,.13,aprons[(k+Math.floor(j/5))%4]);
      m.face(e,j*w,.255,sill+floor*.722,.049,floor*.53,.115,0x566e7b);
    }
    m.face(e,middle,.32,sill+floor*.455,width,.085,.21,0x788993);
    m.face(e,middle,.30,sill+.03,width,.085,.18,0x627581);
  }
}

// On the stone bevel the grouped slit lights open into larger casements
// towards the outside. A continuous reveal is cut around every opening.
export function stoneCore(m,e,base,top,facesGlassFirst,rows,stone) {
  const w=e.length, face={...e,a:at(e,0,.345)}, low=base+3.2, high=top-6.3, dy=(high-low)/rows;
  const units=w>12?[[.092,.015],[.127,.015],[.246,.017],[.284,.017],[.431,.059],[.642,.112],[.852,.109]]:
    [[.17,.042],[.31,.042],[.55,.090],[.79,.13]];
  const groups=units.map(([t,size])=>[(facesGlassFirst?t:1-t)*w,Math.max(.22,size*w)]);
  for(let j=0;j<rows;j++){
    const bottom=low+j*dy, y0=dy*.23,y1=dy*.79;
    const holes=groups.map(([t,a])=>[[t-a/2,y0],[t+a/2,y0],[t+a/2,y1],[t-a/2,y1]]);
    m.perforatedFace(face,bottom,dy,holes,stone);
    for(const [t,a] of groups){
      m.face(e,t,.082,bottom+(y0+y1)/2,a,y1-y0,.08,a>w*.055?0x46545a:0x293237);
      if(a>w*.055)m.face(e,t,.14,bottom+(y0+y1)/2,a-.07,y1-y0-.07,.03,0x486276,"clear");
      if(a>w*.05){
        const cy=bottom+(y0+y1)/2;
        m.face(e,t,.218,cy+y1*.29,a-.02,.045,.11,0x687170);
        for(const side of [-1,1])m.face(e,t+side*(a/2-.051),.205,cy,.069,y1-y0,.12,0x3b4546);
        m.face(e,t,.27,bottom+y0-.033,a+.085,.095,.20,0xcfbd9f);
      }
      if(a>w*.09)m.face(e,t,.210,bottom+(y0+y1)/2,.082,y1-y0,.12,0x4f5858);
    }
  }
  m.perforatedFace(face,base,low-base,[],stone);
  m.perforatedFace(face,high,top-high,[],stone);
}

// Continuous ward balcony shadows with windows and the smaller partitions
// behind the front edge of each projecting floor slab.
export function wardBalconies(m,e,low,high,rows,color) {
  const count=Math.max(2,Math.round(e.length/6.75)), span=e.length/count, dy=(high-low)/rows;
  for(let j=0;j<rows;j++){
    const y=low+dy*j;
    m.face(e,e.length/2,.046,y+dy*.62,e.length,dy*.72,.105,0x47433c);
    m.face(e,e.length/2,.48,y+dy*.188,e.length,dy*.38,1.09,color);
    m.face(e,e.length/2,.46,y+.03,e.length,.084,1.05,0x797064);
    for(let i=0;i<count;i++){
      const t=(i+.5)*span;
      m.face(e,t,.12,y+dy*.61,span*.76,dy*.47,.09,(i+j)%4===0?0x687571:0x414d4c);
      m.face(e,t,.19,y+dy*.61,.085,dy*.49,.11,0x717772);
      m.face(e,i*span+.35,.50,y+dy*.68,.70,dy*.67,1.08,color);
    }
  }
}

export function wardPodium(m,e,base,podium,color) {
  const n=Math.max(2,Math.round(e.length/2.48)), bay=e.length/n, hallTop=base+10.7, rows=5, dy=(podium-hallTop)/rows;
  m.face(e,e.length/2,-2.48,(base+hallTop)/2,e.length,hallTop-base,.13,0x394d4d);
  for(let i=0;i<n;i++){
    const t=(i+.5)*bay;
    m.face(e,t,-.63,(base+hallTop)/2,bay-.08,hallTop-base,.08,0x536f6e,"clear");
    m.face(e,i*bay,-.49,(hallTop+base)/2,.08,hallTop-base,.15,0x697976);
    if(i%3===0)m.face(e,t,-1.36,(base+hallTop)/2,.73,hallTop-base,.72,0xcfc2b1);
    if(i%2===0)m.face(e,t,-.17,base+5,bay*2,.28,.52,0xb5ab9b);
  }
  for(let j=0;j<rows;j++){
    const y=hallTop+j*dy, sill=y+dy*.49;
    for(let i=0;i<n;i++){
      const t=(i+.5)*bay;
      m.face(e,t,-.65,y+dy*.25,bay-.06,dy*.49,.09,(i+j)%5===0?0x67746e:0x404e4c);
      m.face(e,t,-.58,y+dy*.24,bay-.085,dy*.42,.045,0x536563,"clear");
      m.face(e,i*bay,-.44,y+dy*.25,.078,dy*.50,.16,0x74807b);
      m.face(e,t,.03,sill+dy*.255,bay-.029,dy*.51-.04,.65,color);
      if(i%3===0)m.face(e,t,-.14,y+dy*.25,.31,dy*.5,.56,color);
    }
    m.face(e,e.length/2,.35,sill+dy*.265,e.length,.029,.026,0xa99a8e);
    m.face(e,e.length/2,-.13,sill-.14,e.length,.085,.82,0x9b9b92);
    m.face(e,e.length/2,-.14,sill-.45,e.length,.075,.60,0xb8bab2);
    m.face(e,e.length/2,.31,y+dy-.05,e.length,.115,.13,0xc2b5a4);
  }
}
