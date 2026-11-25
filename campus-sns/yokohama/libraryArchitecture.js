import { at, C, edges, rectangle } from "./buildingsGeometry.js";
import { groundAt } from "./terrain.js";

// The entrance and pilotis photos and the one-storey plan are from
// https://www.ssc.titech.ac.jp/amap/home/suzukakedai/s/s3bldg/
// Longitudinal dimensions are scaled to the mapped footprint. The main
// elevation faces southwest and the road descends toward its southeast end.
const concrete=0xe2e8e9, joints=0xc5cbcb;
const glass=[0x617779,0x8b9b99,0x687e83,0x869497,0x738688];

function upperFacade(m,e,side,bottom,top) {
  const h=top-bottom, holes=[];
  function window(t,y,w,wh,columns) {
    holes.push([[t-w/2,y-wh/2],[t+w/2,y-wh/2],[t+w/2,y+wh/2],[t-w/2,y+wh/2]]);
    m.face(e,t,-.39,bottom+y,w+.03,wh+.03,.10,C.dark);
    for(let i=0;i<columns;i++) {
      const x=t-w/2+w*(i+.5)/columns;
      m.face(e,x,-.331,bottom+y,w/columns-.067,wh-.12,.045,glass[(i+Math.round(t))%glass.length],true);
    }
    if(wh>2)m.face(e,t,-.28,bottom+y-wh*.28,w,.055,.08,C.silver);
  }
  for(const floor of [0,1]){
    const y=h*(.25+.5*floor);
    if(side==="front"){
      for(const t of [4.3,12.3,e.length-4.1])window(t,y,6.9,2.52,5);
      for(const t of [26.8,59.5])window(t,y+.27,3.7,1.04,2);
      // Apertures sit lower than the centre line of the rectangular windows.
      for(let t=17.9;t<e.length-8.2;t+=2.12){
        if(Math.abs(t-26.8)<2.4||Math.abs(t-59.5)<2.4)continue;
        const cy=y-.20;
        holes.push(Array.from({length:20},(_,j)=>[t+.265*Math.cos(j*Math.PI/10),cy+.265*Math.sin(j*Math.PI/10)]));
        m.disk(e,t,-.35,bottom+cy,.55,.06,0x3d4e50,true);
      }
    }else if(side==="rear"){
      for(let t=4.15;t<e.length-3.2;t+=8.03)window(t,y,5.8,1.68,4);
    }else{
      window(e.length*.48,y,2.75,1.95,2);
      // The two small concrete balconies project from the northwest end wall.
      if(side==="northwest"){
        m.face(e,e.length*.48,.52,bottom+y-.86,3.2,.22,1.15,concrete);
        m.face(e,e.length*.48,1.03,bottom+y-.30,3.2,.97,.13,concrete);
        for(const sign of [-1,1])for(let n=0;n<7;n++)
          m.face(e,e.length*.48+sign*1.52,.15+n*.145,bottom+y-.32,.045,.96,.04,C.silver);
      }
    }
  }
  m.perforatedFace(e,bottom,h,holes,concrete);
  m.face(e,e.length*.5,.012,bottom+h*.5,e.length,.019,.022,joints);
  m.face(e,e.length*.5,.02,top-.045,e.length,.080,.10,C.silver);
  if(side==="front"){
    for(const t of [16.5,49.2,81.9])m.face(e,t,.012,bottom+h*.5,.022,h-.24,.022,joints);
  }
}

function entrance(m,e,t,deck,accent) {
  // Sliding glass doors and glazed returns in the recessed entrance bay.
  const w=4.7;
  m.face(e,t,-.10,deck+1.43,w,2.86,.11,C.frame);
  for(let n=0;n<4;n++){
    const x=t+(n-1.5)*w/4, out=n===1||n===2?-.024:-.047;
    m.face(e,x,out,deck+1.42,w/4-.058,2.68,.048,glass[(n+1)%5],true);
    m.face(e,x,out+.037,deck+.99,w/4-.06,.092,.032,accent);
    m.face(e,x,out+.038,deck+1.22,w/4-.06,.022,.032,0xd8e1db);
  }
  m.face(e,t,-.04,deck+2.68,w,.085,.16,C.silver);
  m.face(e,t,.13,deck+.024,w,.045,.46,0xc7ced0);
  for(const sign of [-1,1]){
    m.face(e,t+sign*w*.5,-.64,deck+1.43,.08,2.83,1.1,glass[1],true);
    m.face(e,t+sign*w*.5,-.65,deck+.99,.09,.09,1.1,accent);
  }
}

function shroud(m,e,t,deck) {
  const center=3.33,r=.96, ground=groundAt(...at(e,t,center))+.06,top=deck+2.04;
  const point=(a,y,radius=r)=>{
    const [x,z]=at(e,t+radius*Math.sin(a),center+radius*Math.cos(a));return [x,y,z];
  };
  const rim=a=>top+.25*Math.sin(a);
  const quad=(a,b,c,d,color)=>{m.triangle(a,b,c,color);m.triangle(a,c,d,color);};
  // The metal jacket has a sloping rim, a thin vertical slit and a larger
  // pentagonal opening at pavement level visible in the entrance 2 photo.
  for(const sign of [-1,1]){
    const angles=[.025,...Array.from({length:9},(_,i)=>.025+(i+1)*(.49-.025)/9),
      ...Array.from({length:38},(_,i)=>.49+(i+1)*(Math.PI-.49)/38)];
    for(let i=1;i<angles.length;i++){
      const [a,b]=[sign*angles[i-1],sign*angles[i]].sort((a,b)=>a-b);
      const foot=phi=>ground+(angles[i]<=.49001?.97+.63*(1-Math.abs(phi)/.49):0);
      quad(point(a,foot(a)),point(a,rim(a)-.095),point(b,rim(b)-.095),point(b,foot(b)),0xbec9ce);
      quad(point(a,rim(a)-.095),point(a,rim(a)),point(b,rim(b)),point(b,rim(b)-.095),0x556268);
      quad(point(a,rim(a)),point(a,rim(a),r-.105),point(b,rim(b),r-.105),point(b,rim(b)),0x78868a);
      quad(point(b,foot(b),r-.08),point(b,rim(b),r-.08),point(a,rim(a),r-.08),point(a,foot(a),r-.08),0x68747a);
    }
  }
  m.part("round",at(e,t,center),ground+(top-ground)*.5,.38,top-ground,.38,0,0x39484d);
  m.part("round",at(e,t,center),ground+.39,1.11,.78,1.11,0,C.dark);
}

export function makeLibrary(m,ring,fr,base,height) {
  const sides=edges(ring);
  const e=sides.filter(w=>w.length>fr.width*.75).sort((a,b)=>a.nx-b.nx)[0];
  const p=(t,d)=>at(e,t,d),L=e.length,D=fr.depth,deck=base+.65;
  const ceiling=deck+3.18,top=base+height;
  const shell=rectangle(p,.62,-D+.63,L-.65,-.67);
  m.solid(shell,ceiling,top-.08,C.dark,0xb4bdb8);
  m.solid(ring,top-.12,top,concrete,0xc0c6c1);
  m.soffit(ring,ceiling,0xc5c9c5);
  for(const side of sides){
    const type=side===e?"front":side.length>L*.7?"rear":side.nx+side.nz<0?"northwest":"southeast";
    upperFacade(m,side,type,ceiling,top);
  }

  // The entire end bay stands on pilotis. Keep the ground storey set back
  // so the viewer can see through the two open end faces at street level.
  m.solid(rectangle(p,.10,-D+.08,L-8.1,-1.36),base-4.4,ceiling,C.wall,C.concrete);
  for(const d of [-.38,-D/2,-D+.45])m.face(e,L-.43,d,(base-1+ceiling)/2,.82,ceiling-base+1,.80,concrete);
  const positions=[.30,8.15,16.3,24.2,32.2,40.2,45.1,51.1,61.9,70.2,78.6,87.8];
  for(const t of positions)m.face(e,t,-.36,(base-3.8+ceiling)/2,.63,ceiling-base+3.8,.74,concrete);
  for(let i=1;i<positions.length;i++){
    const left=positions[i-1],right=positions[i],mid=(left+right)/2,w=right-left-.58;
    if(left===45.1||left===16.3)continue;
    if(left===51.1){m.face(e,mid,-.13,(deck+ceiling)/2,w,ceiling-deck,.27,concrete);continue;}
    const sill=deck+(mid>61?1.22:.23),h=ceiling-sill-.22;
    m.face(e,mid,-.74,(sill+ceiling-.22)/2,w,h,.15,C.frame);
    const n=Math.ceil(w/1.35);
    for(let j=0;j<n;j++)m.face(e,left+.29+(j+.5)*w/n,-.64,sill+h*.5,w/n-.062,h-.09,.042,glass[(i+j)%5],true);
    m.face(e,mid,-.64,(sill+base-3.4)/2,w,sill-base+3.4,.28,0xd0d1c8);
    if(mid>61)for(let j=0;j<3;j++)m.face(e,mid,-.58,ceiling-.24-j*.07,w,.038,.09,0x858e8a);
  }
  entrance(m,e,48,deck,0x2876af);
  entrance(m,e,20.3,deck,0xbd8851);
  shroud(m,e,30.7,deck);
  // Service doors and vending machines in the sheltered lower-level recess.
  for(const t of [15.3,18]) {
    const y=groundAt(...p(t,1.2));
    m.face(e,t,.03,y+1.24,2.5,2.48,.10,0xc2c9c8);
    m.face(e,t,.10,y+1.24,.041,2.45,.06,C.frame);
  }
  const paints=[0x346795,0xe0dfd5,0x3975a8], labels=[0xd1b873,0x648b68,0xc77c62,0x8996a3];
  for(let k=0;k<3;k++){
    const t=25.3+k*1.09,y=groundAt(...p(t,1.03));
    m.face(e,t,1.02,y-.16,1.095,.34,.86,0xa6aba5);
    m.face(e,t,.98,y+.94,1.03,1.88,.70,paints[k]);
    m.face(e,t,1.345,y+1.34,.87,.78,.038,0xc2d1d1,true);
    for(let col=0;col<6;col++)for(let row=0;row<3;row++)
      m.face(e,t+(col-2.5)*.13,1.373,y+1.10+row*.21,.082,.14,.035,labels[(col+row+k)%4]);
    m.face(e,t,1.36,y+.45,.67,.18,.05,C.dark);
  }
}
