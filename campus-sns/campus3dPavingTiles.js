// The renderer runs in a worker, or on the main thread on browsers without transferable canvases.
export const TILE = 512;
const METRES = 40075016.686 * Math.cos(35.606 * Math.PI / 180);
const CELL = 128;
const repeat = { asphalt: 0.96, running: 0.84, herring: 0.84, granite: 1.28, plazaBlock: 2.4, blueTile: 1.2, groundcover: 0.92, aggregate: 0.8, grass: 3.2, basketweave: 0.8, roughStone: 0.48, deckComposite: 2.88, deckTimber: 3.12, rootBed: 0.86, apronConcrete: 0.64 };
const BOARDS_PER_STAMP = 12;
repeat.courtGravel = 4.8;
repeat.memorialBrick = 2.40;
repeat.stationSetts = 1.6;
// Full stamp widths in metres; the workshop and the avenue use 100 × 200 mm blocks.
Object.assign(repeat, { gateAshlar: 3.072, walkBond: 2.448, avenueHerring: 2.4, clayHerring: 2.4, lawnBrick: 2.52, campusAsphalt: 3.2 });
Object.assign(repeat, { roseFlags: 1.8, exposedFlags: 2, arcadeBrick: 2.88, lightDeck: 2.4 });
export const isDeckPlank = name => name === "deckComposite" || name === "deckTimber" || name === "lightDeck";
export const pavingStampName = finish => isDeckPlank(finish) ? finish : finish.startsWith("paving/") ? finish.slice(7) : null;
const stamps = new Map();

function canvas(size) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

// 湿った砂利と疎らな苔。周期境界を持つ砕石の粒を生成し、粒の上面と陰を別々に出す。
function courtyardGravel() {
  const size = TILE, cells = 110, c = canvas(size), ctx = c.getContext("2d");
  const out = ctx.createImageData(size,size), centers = new Float32Array(cells*cells*3);
  let seed = 1381;
  for (let k=0;k<centers.length;k++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    centers[k] = seed/4294967296;
  }
  const tau = 2*Math.PI;
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size, v=y/size, gx=u*cells, gy=v*cells, ix=Math.floor(gx), iy=Math.floor(gy);
    let first=Infinity, second=Infinity, stone=0, facet=0;
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) {
      const k=3*(((iy+j+cells)%cells)*cells+(ix+i+cells)%cells);
      const dx=gx-(ix+i+.12+.76*centers[k]), dy=gy-(iy+j+.12+.76*centers[k+1]);
      const d=dx*dx+dy*dy;
      if(d<first) { second=first; first=d; stone=centers[k+2]; facet=dx+dy*.6; }
      else if(d<second) second=d;
    }
    const moss=Math.max(0,Math.min(1,.72*Math.sin(tau*(u+v))+.34*Math.cos(tau*(2*u-3*v))+.20*Math.sin(tau*(5*u+4*v)) + stone*.45));
    const tone=104 + stone*56 + (facet<-.16 ? 23 : -5) - (second-first<.075 ? 31 : 0);
    const i=(y*size+x)*4, fleck=stone>.62 ? .28 : .75, k=moss*fleck;
    out.data[i]=tone*(1-k)+(123+stone*28)*k;
    out.data[i+1]=(tone-.8)*(1-k)+(126+stone*28)*k;
    out.data[i+2]=(tone-3)*(1-k)+(81+stone*28)*k;
    out.data[i+3]=145;
  }
  ctx.putImageData(out,0,0);
  return c;
}

async function loadStamp(name) {
  const url = "/map-3d/paving/" + name + ".png";
  let image;
  if (name === "courtGravel") image = courtyardGravel();
  else if (name === "stationSetts") image = stationSetts();
  else if (typeof createImageBitmap === "function") {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load " + url);
    image = await createImageBitmap(await response.blob());
  } else {
    image = new Image();
    image.src = url;
    await image.decode();
  }
  const levels = [image];
  for (let size = image.width / 2; size >= 1; size /= 2) {
    const c = canvas(size);
    c.getContext("2d").drawImage(levels.at(-1), 0, 0, size, size);
    levels.push(c);
  }
  return levels;
}

// Eight 20 cm square aggregate blocks across a seamless stamp (IMG_0719, 00:53).
function stationSetts() {
  const c = canvas(TILE), ctx = c.getContext("2d"), pixels = ctx.createImageData(TILE,TILE);
  const pitch = TILE / 8;
  let seed = 719;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
  const stone = Array.from({length:64},() => 116 + 14*random());
  for (let y=0;y<TILE;y++) for (let x=0;x<TILE;x++) {
    const sx=x%pitch, sy=y%pitch, edge=Math.min(sx,sy,pitch-1-sx,pitch-1-sy);
    const block=stone[(y/pitch|0)*8+(x/pitch|0)];
    const fleck=random(), grit=37*(random()-.5)+(fleck>.935?28:fleck<.072?-28:0);
    const tone=edge===0 ? block-39+grit*.5 : block+grit+(sx===1||sy===1?7:0);
    const i=(y*TILE+x)*4;
    pixels.data[i]=tone; pixels.data[i+1]=tone+.5; pixels.data[i+2]=tone-1;
    pixels.data[i+3]=193;
  }
  ctx.putImageData(pixels,0,0);
  return c;
}

function stamp(name) {
  if (!stamps.has(name)) stamps.set(name, loadStamp(name).catch(error => { stamps.delete(name); throw error; }));
  return stamps.get(name);
}

// The raised wooden lip uses the same image, world origin and board pitch as the surface below it.
export async function deckStampPixels(name) {
  const [image] = await stamp(name);
  const c = canvas(image.width), ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    data[i] *= a; data[i + 1] *= a; data[i + 2] *= a;
  }
  return { size: c.width, data };
}

function project([lng, lat]) {
  return [(lng + 180) / 360, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2];
}
const origin = project([139.6835, 35.6048]);
export function pavingUV(name, bearing, width) {
  const angle = (bearing - 90) * Math.PI / 180, cs = Math.cos(angle), sn = Math.sin(angle);
  const across = width ? width * BOARDS_PER_STAMP : repeat[name];
  return point => {
    const [u, v] = project(point);
    const x = (u - origin[0]) * METRES, y = (v - origin[1]) * METRES;
    return [(cs * x + sn * y) / repeat[name], (-sn * x + cs * y) / across];
  };
}
export const deckUV = (name, [width, bearing]) => pavingUV(name, bearing, width);
// Tokyo Digital Twin orthophoto, March–April 2023. Paths, shadows and canopy are masked.
const lawnNW = project([139.68305805, 35.60609788]), lawnSE = project([139.68447228, 35.60494421]);
const lawnRect = [(lawnNW[0] - origin[0]) * METRES, (lawnNW[1] - origin[1]) * METRES,
  (lawnSE[0] - lawnNW[0]) * METRES, (lawnSE[1] - lawnNW[1]) * METRES];

function cells(left, top, right, bottom, visit) {
  for (let col = Math.floor(left / CELL); col <= Math.floor(right / CELL); col++) {
    for (let row = Math.floor(top / CELL); row <= Math.floor(bottom / CELL); row++) visit(col + "/" + row);
  }
}

export async function tileSnapshot(c) {
  if (c.transferToImageBitmap) return c.transferToImageBitmap();
  if (typeof createImageBitmap === "function") return createImageBitmap(c);
  const blob = await new Promise(resolve => c.toBlob(resolve, "image/png"));
  return blob.arrayBuffer();
}

export function pavingTiles(collection) {
  const index = new Map();
  let order = 0;
  const names = new Set();
  for (const { geometry, properties } of collection.features) {
    const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
    for (const poly of polys) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      let angle = 0, longest = 0;
      let path = new Path2D(), base;
      for (const [ringIndex, ring] of [...poly, ...(properties.pavingHoles || [])].entries()) {
        // The fill still covers earlier materials inside buildings with an unknown floor finish.
        if (ringIndex === poly.length) { base = path; path = new Path2D(base); }
        let lastX, lastY;
        for (const [i, point] of ring.entries()) {
          const [u, v] = project(point);
          const x = (u - origin[0]) * METRES, y = (v - origin[1]) * METRES;
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
          if (ringIndex === 0) {
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
            const length = (x - lastX) ** 2 + (y - lastY) ** 2;
            if (length > longest) { longest = length; angle = Math.atan2(y - lastY, x - lastX); }
          }
          lastX = x; lastY = y;
        }
        path.closePath();
      }
      if (Number.isFinite(properties.pavingBearing)) angle = (properties.pavingBearing - 90) * Math.PI / 180;
      const name = properties.paving;
      if (name) names.add(name);
      const across = properties.pavingBoardWidth * BOARDS_PER_STAMP || repeat[name];
      const shape = { order: order++, path, base: base || path, left, top, right, bottom, name, angle, across };
      cells(left, top, right, bottom, key => {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(shape);
      });
    }
  }
  if (names.has("grass")) names.add("westLawnTone");
  for (const name of names) stamp(name).catch(() => {}); // Requests retry a failed preload on demand.

  const c = canvas(TILE), ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D paving canvas is unavailable");
  return async (z, x, y, signal) => {
    signal?.throwIfAborted?.();
    const n = 2 ** z, span = METRES / n, scale = TILE / span;
    const left = (x / n - origin[0]) * METRES, top = (y / n - origin[1]) * METRES;
    const right = left + span, bottom = top + span;
    const matches = new Set();
    cells(left, top, right, bottom, key => {
      for (const shape of index.get(key) || []) {
        if (shape.right >= left && shape.left <= right && shape.bottom >= top && shape.top <= bottom) matches.add(shape);
      }
    });
    const visible = [...matches].sort((a, b) => a.order - b.order);
    const materials = [...new Set(visible.map(shape => shape.name).filter(Boolean))];
    if (!materials.length) return null;
    if (materials.includes("grass") && left < lawnRect[0] + lawnRect[2] && right > lawnRect[0] &&
        top < lawnRect[1] + lawnRect[3] && bottom > lawnRect[1]) materials.push("westLawnTone");
    const images = new Map(await Promise.all(materials.map(async name => [name, await stamp(name)])));
    if (signal?.aborted) throw new DOMException("Tile request aborted", "AbortError");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    let painted = false;
    const patterns = new Map();
    for (const { path, base, name, angle, across } of visible) {
      if (painted) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        ctx.fill(base, "evenodd");
        ctx.globalCompositeOperation = "source-over";
      }
      if (!name) continue;
      const key = name + "/" + angle + "/" + across;
      let pattern = patterns.get(key);
      if (!pattern) {
        const levels = images.get(name), period = repeat[name];
        const pixels = scale * Math.min(period, across);
        const level = Math.max(0, Math.min(levels.length - 1, Math.floor(Math.log2(levels[0].width / pixels))));
        const image = levels[level], ux = period / image.width, uy = across / image.height;
        const cs = Math.cos(angle), sn = Math.sin(angle);
        pattern = ctx.createPattern(image, "repeat");
        pattern.setTransform(new DOMMatrix([cs * ux, sn * ux, -sn * uy, cs * uy, 0, 0]));
        patterns.set(key, pattern);
      }
      ctx.fillStyle = pattern;
      ctx.fill(path, "evenodd");
      if (name === "grass" && images.has("westLawnTone")) {
        ctx.save();
        ctx.clip(path, "evenodd");
        ctx.drawImage(images.get("westLawnTone")[0], ...lawnRect);
        ctx.restore();
      }
      painted = true;
    }
    return tileSnapshot(c);
  };
}

export function emptyPavingTile() {
  const c = canvas(1);
  c.getContext("2d").clearRect(0, 0, 1, 1);
  return tileSnapshot(c);
}
