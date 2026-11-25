// Rebuild the complete cuttable reservation model from the campus map and DEM.
// Run from the repository root with node scripts/build-taki-preview.mjs.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import clip from "polygon-clipping";
import sharp from "sharp";
import { detailView, normalizeFeature, stairsOpening, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, Mesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { doorLeaves } from "../campus-sns/campus3dDoors.js";
import { surfaceColor } from "../campus-sns/campus3dPaint.js";
import { dem } from "../campus-sns/campusDem.js";
import { TERRAIN } from "../campus-sns/campusTerrain.js";

const all = JSON.parse(readFileSync("public/map-3d/features.json")).features;
const floors = all.filter(f => f.id.startsWith("taki-int-")).map(normalizeFeature);
const host = normalizeFeature(all.find(f => f.id === floors[0].host));
const origin = toXY(host.groundRef);
const target = "public/map-3d/taki-preview";
mkdirSync(target, { recursive: true });
const [east] = worldOf([1, 0]), [, north] = worldOf([0, 1]);
const finishes = { takiRoofDeck: "#c4b79f", takiConcrete: "#dcd8cd", paleoak: "#dbccb0", groovedwood: "#c5b49a", darkgravel: "#898a7d", "paving/wood": "#b8a991", "paving/stone": "#c9c8bd" };
const rgb = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const sunkenCourt = "tmv8s2rdw3dvc";
const outdoorStair = "smv8u1f9u5xbl";
const surroundings = new Set([sunkenCourt, outdoorStair, "ent-walk", "ent-hedge2", "gate-lw-fence", "ent-bed"]);
const site = detailView(all.filter(f =>
  f.id === host.id || f.id.startsWith("taki-") || f.id.startsWith("lw-") ||
  f.id.startsWith("walkfilm-taki-light-board-") || surroundings.has(f.id)
).map(normalizeFeature), { detail:true, level:"all" });

// Decode the same Terrarium data and apply the same terrace/stair/void burns
// as the campus map. Absolute elevations (25.90, 29.40 and 33.85 m) are used
// alongside per-control-point ground offsets on the two broad outdoor flights.
const tileRoot = "public"+TERRAIN.path+"/"+TERRAIN.maxzoom;
for (const x of readdirSync(tileRoot)) {
  for (const file of readdirSync(tileRoot+"/"+x).filter(name => name.endsWith(".png"))) {
    const bytes = await sharp(tileRoot+"/"+x+"/"+file).removeAlpha().raw().toBuffer();
    const heights = Float32Array.from({ length:256*256 }, (_, i) =>
      bytes[3*i]*256 + bytes[3*i+1] + bytes[3*i+2]/256 - 32768);
    dem.tiles.set(x+"/"+file.slice(0,-4), heights);
  }
}
dem.setBurns(site);
const groundAt = ll => dem.groundAt(ll);
const base = groundAt(host.groundRef);
const floorBase = Math.min(...floors.map(f => base + f.z - f.slab)) - .28;
const ringOf = f => f.coords.map(toXY);

// Outline the site model along the building, forecourt and surveyed rims.
// The surrounding plinth is a cut through the ground, down to the lowest slab.
function siteBoundary() {
  const points = site.filter(f => f.type==="floor" || f.id===host.id || ["lw-west-rim","lw-north-rim","taki-east-walk-pavers","taki-exit","taki-walk","taki-dryarea"].includes(f.id))
    .flatMap(ringOf).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  function side(sorted) {
    const result = [];
    for (const p of sorted) {
      while (result.length >= 2) {
        const a=result.at(-2), b=result.at(-1);
        if ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) > 0) break;
        result.pop();
      }
      result.push(p);
    }
    return result.slice(0,-1);
  }
  return [...side(points),...side([...points].reverse())];
}
function createSiteGround() {
  const ground = new Mesh(), outline = siteBoundary();
  const stair = site.find(f=>f.id===outdoorStair);
  const [left,right] = stairsOpening(stair).sides;
  const wells = dem.terraces.filter(t=>t.elev < base-1);
  const outside = clip.difference([outline], [ringOf(host)], [[...left,...right.reverse()]], ...wells.map(t=>[t.ring]));
  // Cut exactly at each material boundary. Depth samples on the rim must use
  // its upper grade even where the next surface, across the wall, is B2F.
  const upperTerraces = dem.terraces.filter(t=>t.elev >= base-1);
  function upperGrade(p) {
    let z = dem.baseAt(toLngLat(p));
    for (const t of upperTerraces) z=t.level(p[0],p[1],z);
    return z;
  }
  function groundSurface(area, colour) {
    if (!area.length) return;
    // Divide broad grade changes into short spans to follow the DEM.
    const vertices=area.flat(2), minX=Math.min(...vertices.map(p=>p[0])), maxX=Math.max(...vertices.map(p=>p[0]));
    const minY=Math.min(...vertices.map(p=>p[1])), maxY=Math.max(...vertices.map(p=>p[1]));
    for (let x=minX;x<maxX;x+=4) for (let y=minY;y<maxY;y+=4) {
      const cell=[[[x,y],[x+4,y],[x+4,y+4],[x,y+4]]];
      for (const polygon of clip.intersection(area,cell)) ground.polygon(polygon,upperGrade,[0,0,1],colour);
    }
  }
  let remaining=outside;
  for(const f of site.filter(f=>f.type==="surface").reverse()) {
    const shape=[ringOf(f)];
    const part=clip.intersection(remaining,shape);
    if (!part.length) continue;
    groundSurface(part,[...rgb(surfaceColor(f).light),1]);
    remaining=clip.difference(remaining,shape);
  }
  groundSurface(remaining,[...rgb("#c8c9b6"),1]);
  for (const tr of wells) {
    if (tr.f.ceiling > 0) continue; // Covered entrances have their own slab.
    const floorColour=tr.f.id==="taki-pit"?"#858979":"#bcb9aa";
    ground.polygon([tr.ring],tr.elev+.003,[0,0,1],[...rgb(floorColour),1]);
  }
  for (let i=0;i<outline.length;++i) {
    const a=outline[i], b=outline[(i+1)%outline.length];
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3);
    const at=t=>a.map((v,k)=>v+(b[k]-v)*t);
    for(let j=0;j<steps;++j) {
      const p=at(j/steps), q=at((j+1)/steps);
      ground.quad([[p,floorBase],[q,floorBase],[q,upperGrade(q)],[p,upperGrade(p)]],null,[...rgb("#ada998"),1]);
    }
  }
  ground.polygon([outline],floorBase,[0,0,-1],[...rgb("#a09d8e"),1]);
  return ground.result();
}

function writePlaza() {
  const mesh = buildMesh(site, { groundAt, terraces:dem.terraces, slopes:dem.slopes, digs:dem.digs, clip });
  const doors = doorLeaves(mesh.doors, []);
  const points = [], faces = [], indices = new Map();
  function addPart(part, from, count, tint) {
    for (let t = from; t < from + count; t += 3) {
      const positions = [0, 1, 2].map(i => {
        const n = 3 * (t + i);
        return [part.pos[n] / east - origin[0], part.pos[n + 2] - base, origin[1] - part.pos[n + 1] / north];
      });
      const ab = positions[1].map((v, i) => v - positions[0][i]);
      const ac = positions[2].map((v, i) => v - positions[0][i]);
      const area2 = Math.hypot(ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]);
      if (area2 < 0.014) continue; // retain chair legs, stair nosings and door frames
      const tri = [];
      for (let i = 0; i < 3; ++i) {
        const v = t + i, n = 3*v, c = 4*v;
        const light = Math.max(0, -0.53*part.nrm[n] - 0.36*part.nrm[n+1] + 0.76*part.nrm[n+2]);
        const colour = (tint || Array.from(part.col.subarray(c,c+3))).map(ch =>
          Math.round(255*Math.min(1,(.85*ch+.13)*(.75+.34*light))));
        const point = [...positions[i].map(x => Math.round(x*500)), ...colour];
        const id = point.join(",");
        if (!indices.has(id)) { indices.set(id,points.length); points.push(point); }
        tri.push(indices.get(id));
      }
      faces.push(tri);
    }
  }
  addPart(mesh, 0, mesh.count);
  for (const batch of mesh.floors.batches) addPart(mesh.floors, batch.first, batch.count, rgb(finishes[batch.finish] || "#d4caba"));
  for (const part of [mesh.cull, mesh.thin, mesh.screen, doors.solid]) addPart(part,0,part.count);
  const terrain=createSiteGround();
  addPart(terrain,0,terrain.count);
  const glassStart=faces.length;
  for (const part of [mesh.glass, doors.glass]) addPart(part,0,part.count,rgb("#a4c0c0"));
  const wide = points.length > 65535;
  const head = Buffer.from(["ply","format binary_little_endian 1.0","comment position unit: 2 millimetres",
    "comment glass_faces "+glassStart+" "+(faces.length-glassStart),
    "element vertex "+points.length,"property short x","property short y","property short z",
    "property uchar red","property uchar green","property uchar blue",
    "element face "+faces.length,"property list uchar "+(wide?"uint":"ushort")+" vertex_indices","end_header",""].join("\n"));
  const data = Buffer.alloc(points.length*9 + faces.length*(wide?13:7));
  let offset = 0;
  for (const [x,y,z,r,g,b] of points) {
    for (const a of [x,y,z]) { data.writeInt16LE(a,offset); offset+=2; }
    data[offset++]=r; data[offset++]=g; data[offset++]=b;
  }
  for (const face of faces) {
    data[offset++]=3;
    for (const index of face) {
      if (wide) { data.writeUInt32LE(index,offset); offset+=4; }
      else { data.writeUInt16LE(index,offset); offset+=2; }
    }
  }
  // Ship the complete mesh within the service worker's 2 MiB precache limit.
  const packed = gzipSync(Buffer.concat([head,data]), { level:9 });
  if (packed.length > 2*1024*1024) throw new Error("Taki Plaza model exceeds the offline cache limit");
  writeFileSync(target+"/plaza.ply.gz",packed);
  const stair=dem.slopes.find(s=>s.f.id===outdoorStair);
  console.log("Plaza model:", points.length, "vertices,", faces.length, "triangles; 1F datum", base.toFixed(2),
    "m; outdoor stair landings relative to 1F", stair.elev.map(z=>(z-base).toFixed(2)).join(", "), "m");
}
writePlaza();
