// 床の模様は床面の UV で繰り返す。各素材は同じ大きさの独立した画像なので、縮小しても隣の素材の色がにじまない。
import { HERRING_K, herringboneBricks } from "./campus3dFeatures.js";

const finishes = {
  tile: ["tile", "tile", 0.45],
  checker: ["checkerA", "checkerB", 0.6],
  tile2: ["tile2A", "tile2B", 0.3],
  stone2: ["stone2A", "stone2B", 0.6],
  tan: ["tanA", "tanB", 0.45],
  navy: ["navyA", "navyB", 0.5],
  cvs: ["cvsA", "cvsB", 0.6],
  oak: ["oak"],
  paleoak: ["paleoak"],
  herring: ["herring"],
};
const SIZE = 128;
const BRICK_REPEAT = HERRING_K * 4;
const wood = (name) => name === "oak" || name === "paleoak";

// 平面の m 座標から反復画像の座標へ。同じ向きの隣室では模様の位置も連続する。
export function floorUV(finish, grid) {
  if (!Object.hasOwn(finishes, finish)) return null;
  let deg = grid?.[0] ?? 0;
  let width, height;
  if (wood(finish)) {
    width = 2.4;
    height = 0.72; // 18cm 幅の板を 4 列
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
function drawWood(ctx, base) {
  const pixels = ctx.createImageData(SIZE, SIZE);
  const rgb = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y * 4 / SIZE);
    const v = (y * 4 / SIZE) % 1;
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE + row * 0.37) % 1;
      const wave = Math.sin(2 * Math.PI * u + row);
      const grain = Math.sin(2 * Math.PI * (v * 6 + 0.32 * wave));
      const joint = v < 0.025 || u < 0.006 || Math.abs(u - 0.58) < 0.004;
      const k = 1 + 0.014 * grain + 0.012 * wave + 0.009 * ((row + (u < 0.58 ? 1 : 0)) % 3 - 1) - (joint ? 0.1 : 0);
      const i = 4 * (y * SIZE + x);
      for (let j = 0; j < 3; j++) pixels.data[i + j] = rgb[j] * k;
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

export function createFloorTexture(gl, name, palette) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const [a, b] = finishes[name];
  ctx.fillStyle = palette[a];
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (wood(name)) drawWood(ctx, palette[a]);
  else if (name === "herring") drawBricks(ctx, palette);
  else {
    const half = SIZE / 2;
    ctx.fillStyle = palette[b];
    ctx.fillRect(0, half, half, half);
    ctx.fillRect(half, 0, half, half);
    if (name === "cvs" || name === "tile") {
      ctx.fillStyle = name === "cvs" ? palette.cvsJoint : "rgba(60,50,40,0.17)";
      for (const edge of [0, half]) {
        ctx.fillRect(edge, 0, 1, SIZE);
        ctx.fillRect(0, edge, SIZE, 1);
      }
    }
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, ctx.getImageData(0, 0, SIZE, SIZE).data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return texture;
}
