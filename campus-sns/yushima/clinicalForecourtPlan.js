// Metres along and out from the river-facing elevation of hospital C.
export const clinicalApronAxis=[.9103,.41396];
export const clinicalFrontage=46.96;
export function clinicalSitePoint(fraction,depth){
  const [dx,dz]=clinicalApronAxis,along=fraction*clinicalFrontage;
  return [-61.58+along*dx-depth*dz,89.57+along*dz+depth*dx];
}

// The irregular street edge meets the surveyed Sotobori sidewalk. This shared
// outline lets the road mesh tile the apron and the pavement without overlap.
export const clinicalApron=[
  [-.012,-.32],[1.055,-.32],[1.055,11.9],[1.022,14.7],[.99,14.8],
  [.69,15.25],[.56,15.52],[.09,14.05],[.012,13.72],[-.012,12.86],
].map(([fraction,depth])=>clinicalSitePoint(fraction,depth));
