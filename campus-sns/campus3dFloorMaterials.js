// 床の模様は床面の UV で繰り返す。各素材は同じ大きさの独立した画像なので、縮小しても隣の素材の色がにじまない。
import { HERRING_K, herringboneBricks, pointInRing, toLngLat, toXY } from "./campus3dFeatures.js";
import { ceilingMount, ceilingProfile } from "./campus3dCeiling.js";

const finishes = {
  takiConcrete: ["concrete", "concrete", 1.5],
  tile: ["tile", "tile", 0.45],
  grayTile: ["gravel", "gravel", 0.45],
  checker: ["checkerA", "checkerB", 0.6],
  tile2: ["tile2A", "tile2B", 0.3],
  stone2: ["stone2A", "stone2B", 0.6],
  tan: ["tanA", "tanB", 0.45],
  navy: ["navyA", "navyB", 0.5],
  cvs: ["cvsA", "cvsB", 0.6],
  marketPlanks: ["paleoak"],
  marketVinyl: ["marketVinyl"],
  marketTile: ["tile2A"],
  stationHallTile: ["tile2A"],
  stationPlatformTile: ["checkerA"],
  oak: ["oak"],
  paleoak: ["paleoak"],
  pine: ["pine"],
  darkgravel: ["darkgravel"],
  rubber: ["rubber"],
  studdedRubber: ["studdedRubber"],
  deckwood: ["deckwood"],
  terraceBoards: ["deckwood"],
  terraceGrooves: ["deckwood"],
  groovedwood: ["groovedwood"],
  speckle: ["speckle"],
  roofpaving: ["roofpaving"],
  herring: ["herring"],
};
const SIZE = 128;
const BRICK_REPEAT = HERRING_K * 4;
const deck = name => name === "deckwood" || name === "groovedwood";
const wood = name => name === "oak" || name === "paleoak" || deck(name);

// 平面の m 座標から反復画像の座標へ。同じ向きの隣室では模様の位置も連続する。
export function floorUV(finish, grid) {
  if (!Object.hasOwn(finishes, finish)) return null;
  let deg = grid?.[0] ?? 0;
  let width, height;
  if (finish === "terraceBoards" || finish === "terraceGrooves") {
    width = finish === "terraceBoards" ? 3.6 : 1.6;
    height = 8 * (grid?.[1] ?? (finish === "terraceBoards" ? 0.14 : 0.08));
  } else if (finish === "marketPlanks") {
    width = 3.6;
    height = 1.44;
  } else if (finish === "marketVinyl") {
    width = height = 2.4;
  } else if (finish === "marketTile" || finish === "stationHallTile" || finish === "stationPlatformTile") {
    width = height = grid?.[1] ?? 0.3;
  } else if (finish === "pine") {
    width = 1.05;
    height = 0.32;
  } else if (wood(finish)) {
    width = deck(finish) ? 3.6 : 2.4;
    height = deck(finish) ? 4 * (grid?.[1] ?? 0.14) : 0.72;
  } else if (finish === "speckle" || finish === "darkgravel") {
    width = height = 0.38;
  } else if (finish === "rubber" || finish === "studdedRubber") {
    width = height = grid?.[1] ?? 0.5;
  } else if (finish === "roofpaving") {
    width = height = grid?.[1] ?? 3;
  } else if (finish === "herring") {
    deg -= 45;
    width = height = BRICK_REPEAT * (grid?.[1] ?? 0.1);
  } else {
    const step = finish === "navy" || finish === "tan" ? finishes[finish][2] : grid?.[1] ?? finishes[finish][2];
    width = height = 2 * step;
  }
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return ([x, y]) => [(x * cos + y * sin) / width, (y * cos - x * sin) / height];
}

// 木の板の継ぎ目を列ごとにずらし、長手方向には目の流れと緩い濃淡をつける。
function drawWood(ctx, base, finish) {
  const size = ctx.canvas.width;
  const exterior = deck(finish);
  const pixels = ctx.createImageData(size, size);
  const rgb = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y * 4 / size);
    const v = (y * 4 / size) % 1;
    for (let x = 0; x < size; x++) {
      const u = (x / size + row * 0.37) % 1;
      const wave = Math.sin(2 * Math.PI * u + row);
      const grain = Math.sin(2 * Math.PI * (v * 6 + 0.32 * wave));
      const joint = v < 0.025 || u < (exterior ? 0.0025 : 0.006) || Math.abs(u - 0.58) < (exterior ? 0.0012 : 0.004);
      const groove = finish === "groovedwood" ? 0.07 * Math.cos(2 * Math.PI * 28 * v) : 0;
      const k = 1 + 0.014 * grain + 0.012 * wave + groove + 0.009 * ((row + (u < 0.58 ? 1 : 0)) % 3 - 1) - (joint ? (exterior ? 0.32 : 0.1) : 0);
      const i = 4 * (y * size + x);
      for (let j = 0; j < 3; j++) pixels.data[i + j] = rgb[j] * k;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

// IMG_1487 の客席の床。近くでだけ見える細かな粒を同じ配置で反復する。
function drawSpeckle(ctx, base) {
  const rgb = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  const pixels = ctx.createImageData(SIZE, SIZE);
  let seed = 1487;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const tone = (seed >>> 24) / 255;
    const delta = (tone - 0.5) * 9 - (tone < 0.08 ? 12 : 0);
    for (let j = 0; j < 3; j++) pixels.data[i + j] = rgb[j] + delta;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
}

// 厚い集成材の天板。板ごとに色を変え、節のまわりで年輪を回り込ませる。
function drawPine(ctx, base) {
  const size = ctx.canvas.width;
  const pixels = ctx.createImageData(size, size);
  const rgb = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
  const boardTones = [0.02, -0.05, 0.04, -0.01];
  for (let y = 0; y < size; y++) {
    const row = Math.floor(4 * y / size), v = (4 * y / size) % 1;
    for (let x = 0; x < size; x++) {
      const u = x / size, dx = ((u + 0.68 + row * 0.37) % 1) - 0.5;
      const dy = v - 0.44 - 0.18 * Math.sin(row * 2);
      const radius = (dx / 0.017) ** 2 + (dy / (0.075 + 0.015 * row)) ** 2;
      const knot = Math.min(1, Math.max(0, (1.23 - Math.sqrt(radius)) * 4));
      const grain = v + 0.06 * Math.sin(2 * Math.PI * u + row) + 0.27 * Math.exp(-((dx / 0.10) ** 2 + (dy / 0.4) ** 2));
      const tone = 1 + boardTones[row] - 0.09 * Math.sin(35 * grain + row) ** 4 - 0.56 * knot - 0.11 * Math.exp(-4 * (Math.sqrt(radius) - 1.6) ** 2);
      const i = 4 * (y * size + x);
      for (let c = 0; c < 3; c++) pixels.data[i + c] = rgb[c] * tone;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

function drawBricks(ctx, palette) {
  // 既存の杉綾の並べ方・4 色を使い、端にかかる同じれんがを反対側にも描く。
  const n = BRICK_REPEAT, k = HERRING_K;
  const ring = [[-k, -k], [n + k, -k], [n + k, n + k], [-k, n + k]];
  for (const { q, tone } of herringboneBricks(ring, [], [1, 1], 1, 0.06)) {
    const [x, y] = q[0], [x1, y1] = q[2];
    if (x < 0 || x >= n || y < 0 || y >= n) continue;
    ctx.fillStyle = palette["herring" + tone];
    for (const dx of [0, -n]) for (const dy of [0, -n]) {
      ctx.fillRect((x + dx) * SIZE / n, (y + dy) * SIZE / n, (x1 - x) * SIZE / n, (y1 - y) * SIZE / n);
    }
  }
}

// IMG_1077 の地下の書架通路と学習棟。凸の縁には明暗をつけ、遠くではミップマップで均す。
function drawRubber(ctx, base, studded) {
  const size = ctx.canvas.width;
  const rgb = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = ((x + 0.5) * 20 / size) % 1 - 0.5;
    const dy = ((y + 0.5) * 20 / size) % 1 - 0.5;
    const r = Math.hypot(dx, dy);
    const bevel = studded ? Math.max(0, 1 - Math.abs(r - 0.37) / 0.075) : 0;
    const bump = bevel * (dy - dx) * 41 + (studded && r < 0.35 ? 2 : 0);
    const seam = x === 0 || y === 0 ? -7 : 0;
    const i = 4 * (y * size + x);
    for (let k = 0; k < 3; k++) pixels.data[i + k] = rgb[k] + bump + seam;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
}

export function createFloorTexture(gl, name, palette) {
  // The board and tile geometry supplies the joint depth and the colour of each piece.
  if (name === "marketPlanks" || name === "marketVinyl" || name === "marketTile" || name === "stationHallTile" || name === "stationPlatformTile")
    return uploadFloorTexture(gl, 1, new Uint8Array(name === "marketPlanks" ? [210,190,160,255] : [198,196,188,255]));
  const canvas = document.createElement("canvas");
  const size = deck(name) || name === "pine" || name === "studdedRubber" || name === "cvs" ? 512 : SIZE;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const [a, b] = finishes[name];
  ctx.fillStyle = palette[a];
  ctx.fillRect(0, 0, size, size);
  if (name === "cvs") {
    const half = size / 2, pixels = ctx.createImageData(size, size);
    const tones = [palette[a], palette[b], palette.cvsJoint].map(col => [1,3,5].map(i => parseInt(col.slice(i, i+2), 16)));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const rgb = tones[(Math.floor(x / half) + Math.floor(y / half)) % 2];
      const seam = x % half < 2 || y % half < 2;
      const grain = Math.sin(x*.078 + Math.sin(y*.07)*1.9)*1.45 + Math.cos((x+y)*.10)*1.2;
      const i = (y*size + x) * 4;
      for (let j = 0; j < 3; j++) pixels.data[i+j] = seam ? tones[2][j] : rgb[j] + grain;
      pixels.data[i+3] = 255;
    }
    ctx.putImageData(pixels,0,0);
  } else if (name === "terraceGrooves") {
    // IMG_1488：傾斜面の横溝。上り方向に明るい縁とそのすぐ下の影が繰り返す。
    drawSpeckle(ctx, "#b7b7b4");
    for (let y = 0; y < size; y += size / 8) {
      ctx.fillStyle = "rgba(65,65,62,0.28)";
      ctx.fillRect(0, y, size, 2);
      ctx.fillStyle = "rgba(244,244,237,0.55)";
      ctx.fillRect(0, y + 2, size, 2);
    }
  }
  else if (name === "rubber" || name === "studdedRubber") drawRubber(ctx, palette[a], name === "studdedRubber");
  else if (name === "pine") drawPine(ctx, palette[a]);
  else if (name === "darkgravel") {
    drawSpeckle(ctx, palette[a]);
    let seed = 1462;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const stones = ["#55534e", "#6c6a62", "#86847b", "#474945", "#949084"];
    for (let i = 0; i < 1300; i++) {
      const x = random() * SIZE, y = random() * SIZE, radius = 0.65 + 1.7 * random();
      ctx.fillStyle = stones[Math.floor(random() * stones.length)];
      const xs = x < radius ? [x, x + SIZE] : x > SIZE - radius ? [x, x - SIZE] : [x];
      const ys = y < radius ? [y, y + SIZE] : y > SIZE - radius ? [y, y - SIZE] : [y];
      for (const cx of xs) for (const cy of ys) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, 0.71 * radius, i, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  else if (wood(name)) drawWood(ctx, palette[a], name);
  else if (name === "speckle" || name === "roofpaving") {
    drawSpeckle(ctx, palette[a]);
    if (name === "roofpaving") {
      ctx.fillStyle = "rgba(45,43,36,0.38)";
      ctx.fillRect(0, 0, 1, SIZE);
      ctx.fillRect(0, 0, SIZE, 1);
      ctx.fillStyle = "rgba(227,223,201,0.24)";
      ctx.fillRect(1, 1, 1, SIZE - 1);
      ctx.fillRect(1, 1, SIZE - 1, 1);
    }
  }
  else if (name === "herring") drawBricks(ctx, palette);
  else {
    const half = SIZE / 2;
    ctx.fillStyle = palette[b];
    ctx.fillRect(0, half, half, half);
    ctx.fillRect(half, 0, half, half);
    if (name === "tile" || name === "grayTile") {
      ctx.fillStyle = "rgba(60,50,40,0.17)";
      for (const edge of [0, half]) {
        ctx.fillRect(edge, 0, 1, SIZE);
        ctx.fillRect(0, edge, SIZE, 1);
      }
    }
  }
  return uploadFloorTexture(gl, size, ctx.getImageData(0, 0, size, size).data);
}

export async function signPrintPixels(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  const size = Math.max(img.naturalWidth, img.naturalHeight);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  return { size, data: ctx.getImageData(0, 0, size, size).data };
}

// 実際の照明の平面配置を映り込みに使う。床ごとに、描画座標での矩形と発光面を保持する。
export function ceilingLightPlan(floor, z, project) {
  const lamps = (floor.items || []).filter(it => ["glow", "light", "dlight"].includes(it.kind) && it.z0 > 2);
  if (!lamps.length) return null;
  const outline = floor.coords.map(project);
  const x = Math.min(...outline.map(p => p[0])), y = Math.min(...outline.map(p => p[1]));
  const w = Math.max(...outline.map(p => p[0])) - x, h = Math.max(...outline.map(p => p[1])) - y;
  const span = Math.max(w,h) * 1.04;
  const profile = ceilingProfile(floor);
  const bands = [[],[],[]], sums = [0,0,0];
  let ceiling = floor.ceiling.z;
  const regions = [];
  for (const patch of profile?.patches || []) for (const polygon of patch.area) {
    for (const p of polygon[0]) ceiling = Math.max(ceiling,patch.at(p));
    const projectXY = p => project(toLngLat(p));
    const p = polygon[0][0], a = projectXY(p), east = [p[0]+1,p[1]], north = [p[0],p[1]+1];
    const u = projectXY(east).map((v,i)=>v-a[i]), v = projectXY(north).map((n,i)=>n-a[i]);
    const det = u[0]*v[1]-u[1]*v[0], z0=patch.at(p);
    const hu=patch.at(east)-z0, hv=patch.at(north)-z0;
    regions.push({ rings:polygon.map(r=>r.map(projectXY)), a, height:z0,
      gradient:[(hu*v[1]-hv*u[1])/det,(hv*u[0]-hu*v[0])/det] });
  }
  function add(ring, height) {
    const band = !profile || height < 3.4 ? 0 : height < 5.4 ? 1 : 2;
    sums[band] += height;
    bands[band].push(ring);
  }
  for (const lamp of lamps) {
    const ring = lamp.coords.map(project);
    const local = lamp.coords.map(toXY), mount = ceilingMount(profile,lamp,local);
    const heights = local.map(p => lamp.z0 + (mount ? mount.offset(p) : 0));
    const count = Math.ceil((Math.max(...heights)-Math.min(...heights))/.55);
    if (count > 1 && ring.length === 4) {
      // Divide a long rising strip so its two ends reflect at their respective heights.
      const [a,b,c,d] = ring;
      const mix = (p,q,t) => p.map((v,i) => v+(q[i]-v)*t);
      const start = (heights[0]+heights[3])/2, end = (heights[1]+heights[2])/2;
      for (let i=0;i<count;i++) {
        const t=i/count, u=(i+1)/count;
        add([mix(a,b,t),mix(a,b,u),mix(d,c,u),mix(d,c,t)], start+(end-start)*(t+u)/2);
      }
    } else add(ring,heights.reduce((a,b) => a+b,0)/heights.length);
  }
  return { x:x-(span-w)/2, y:y-(span-h)/2, span, z, ceiling, bands, outline, regions,
    heights:sums.map((sum,i) => bands[i].length ? sum/bands[i].length : 0) };
}

export function insideLightPlan(plan, eye) {
  const [x,y,z] = eye, h = z-plan.z;
  if (h <= .1 || h >= plan.ceiling || x < plan.x || x > plan.x+plan.span || y < plan.y || y > plan.y+plan.span) return false;
  if (!plan.regions.length) return pointInRing(x,y,plan.outline);
  return plan.regions.some(r => h < r.height+(x-r.a[0])*r.gradient[0]+(y-r.a[1])*r.gradient[1]
    && pointInRing(x,y,r.rings[0]) && !r.rings.slice(1).some(hole=>pointInRing(x,y,hole)));
}

export function ceilingLightPixels(plan) {
  const size = 512, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d"), scale = size/plan.span;
  ctx.fillStyle = "#000";
  ctx.fillRect(0,0,size,size);
  ctx.filter = "blur(1.5px)";
  ctx.lineWidth = 1.8;
  ctx.globalCompositeOperation = "lighter";
  plan.bands.forEach((band,i) => {
    if (!band.length) return;
    ctx.beginPath();
    for (const ring of band) {
      ring.forEach(([x,y],j) => {
        const u = (x-plan.x)*scale, v = (y-plan.y)*scale;
        if (j === 0) ctx.moveTo(u,v);
        else ctx.lineTo(u,v);
      });
      ctx.closePath();
    }
    ctx.strokeStyle = ctx.fillStyle = ["#f00","#0f0","#00f"][i];
    ctx.fill();
    ctx.stroke();
  });
  return ctx.getImageData(0,0,size,size);
}

export function uploadFloorTexture(gl, size, pixels, texture = gl.createTexture()) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return texture;
}
