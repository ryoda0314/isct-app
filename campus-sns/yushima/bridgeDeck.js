// Metres along the span from the north abutment, and across it to the west.
const unit=t=>Math.min(1,Math.max(0,t));
const smooth=t=>{const u=unit(t);return u*u*(3-2*u);};
export function bridgeFrame(b){
  const [x,z]=b.start,length=Math.hypot(b.end[0]-x,b.end[1]-z);
  const dx=(b.end[0]-x)/length,dz=(b.end[1]-z)/length,half=b.width/2;
  const point=(u,s)=>[x+dx*u-dz*s,z+dz*u+dx*s];
  const local=(X,Z)=>[dx*(X-x)+dz*(Z-z),-dz*(X-x)+dx*(Z-z)];
  return {length,half,point,local,outline:[point(0,-half),point(length,-half),point(length,half),point(0,half)]};
}

export function bridgeDeckLift(id,u,s,half){
  const edge=half-(id==='hijiri'?3.2:s<0?5.1:3.6),across=Math.abs(s)-edge;
  if(id==='hijiri')return .11*smooth((across+.10)/.20);
  const ramp=smooth((u-.45)/.82)*smooth((6.05-u)/.92);
  // The crossing reaches a flush kerb and climbs back to the full sidewalk
  // over 1.25 m of paving. The rest of the cast-iron span keeps its raised kerb.
  return .118*smooth((across+.035)/.07)*(1-ramp*(1-smooth(across/1.25)));
}
