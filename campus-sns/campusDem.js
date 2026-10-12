// 3D表示の地面の高さ。public/map-dem の標高タイル（ズーム15まで、scripts/gen-campus-terrain.mjs）を読み、
// 手で足した平地・坂道・階段（campus3dFeatures.js）を「元の地面 → 平地 → 坂道・階段」の順に焼き込む。
// - dem.groundAt([lng, lat])：ぜんぶ入れた地面の標高（m）。まだ読み込んでいないところは NaN（先に dem.ensure で読む）
// - dem.levelAt：平地だけ入れた地面（坂道・階段の高さの基準）、dem.baseAt：元の地面
// - MapLibre には campusdem://{z}/{x}/{y} のタイルとして渡す。坂のないタイルは元のまま、ズーム16・17は15から補間して作る
import { TERRAIN } from "./campusTerrain.js";
import { prepareSlope, prepareTerrace, toXY } from "./campus3dFeatures.js";

export const DEM_PROTOCOL = "campusdem";
export const BURN_MAXZOOM = 18; // 段差が壁の中に収まるよう、ズーム18（1px ≒ 0.5m）まで作る
const BZ = TERRAIN.maxzoom; // 元のタイルのいちばん細かいズーム
const DEG = Math.PI / 180;

const lngToX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat, z) => {
  const s = Math.sin(lat * DEG);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
const xToLng = (x, z) => (x / 2 ** z) * 360 - 180;
const yToLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / DEG;

// 元のタイルがある範囲（ズーム15のタイル番号）。外は端の値を延ばす
const [BW, BS, BE, BN] = TERRAIN.bounds;
const RX0 = Math.floor(lngToX(BW, BZ));
const RX1 = Math.floor(lngToX(BE, BZ));
const RY0 = Math.floor(latToY(BN, BZ));
const RY1 = Math.floor(latToY(BS, BZ));

const staticUrl = (z, x, y) => `${location.origin}${TERRAIN.path}/${z}/${x}/${y}.png`;
const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

// Terrarium 形式の PNG → 標高(m) の配列
async function decodePng(buf) {
  const bmp = await createImageBitmap(new Blob([buf], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const cv = makeCanvas(bmp.width, bmp.height);
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const out = new Float32Array(cv.width * cv.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  return out;
}

// 標高(m) の配列（256×256）→ Terrarium 形式の PNG。値のない点（NaN）は、深い穴にならないよう平均で埋める
async function encodePng(vals) {
  let sum = 0;
  let cnt = 0;
  for (const v of vals) if (Number.isFinite(v)) { sum += v; cnt++; }
  if (cnt < vals.length) {
    const avg = cnt ? sum / cnt : 0;
    for (let i = 0; i < vals.length; i++) if (!Number.isFinite(vals[i])) vals[i] = avg;
  }
  const cv = makeCanvas(256, 256);
  const g = cv.getContext("2d");
  const img = g.createImageData(256, 256);
  const d = img.data;
  for (let i = 0; i < vals.length; i++) {
    const v = Math.round((vals[i] + 32768) * 256) / 256;
    const f = Math.floor(v);
    d[i * 4] = f >> 8;
    d[i * 4 + 1] = f & 255;
    d[i * 4 + 2] = Math.round((v - f) * 256) & 255;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const blob = cv.convertToBlob ? await cv.convertToBlob({ type: "image/png" }) : await new Promise((r) => cv.toBlob(r, "image/png"));
  return blob.arrayBuffer();
}

class Dem {
  constructor() {
    this.tiles = new Map(); // "x/y"（ズーム15）→ Float32Array | null（取れなかった）
    this.loading = new Map();
    this.terraces = []; // prepareTerrace の結果
    this.slopes = []; // 坂道・階段（prepareSlope の結果）
    this.burnKey = "[]";
    this.version = 0; // 坂が変わるたびに増やす（タイルの URL に入れて作り直させる）
    this.cache = new Map(); // `${version}/${z}/${x}/${y}` → Promise<ArrayBuffer | null>
  }

  // [西, 南, 東, 北] を覆う元のタイルを読む
  ensure(bounds) {
    if (!bounds) return Promise.resolve();
    const [w, s, e, n] = bounds;
    const cx = (v) => Math.min(RX1, Math.max(RX0, v));
    const cy = (v) => Math.min(RY1, Math.max(RY0, v));
    const ps = [];
    for (let x = cx(Math.floor(lngToX(w, BZ))); x <= cx(Math.floor(lngToX(e, BZ))); x++) {
      for (let y = cy(Math.floor(latToY(n, BZ))); y <= cy(Math.floor(latToY(s, BZ))); y++) ps.push(this._load(x, y));
    }
    return Promise.all(ps);
  }

  _load(x, y) {
    const k = `${x}/${y}`;
    if (this.tiles.has(k)) return Promise.resolve();
    if (!this.loading.has(k)) {
      const p = fetch(staticUrl(BZ, x, y))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? decodePng(b) : null))
        .catch(() => null)
        .then((a) => {
          this.tiles.set(k, a);
          this.loading.delete(k);
        });
      this.loading.set(k, p);
    }
    return this.loading.get(k);
  }

  // ズーム15の全体の px 番号の値（範囲の外は端の値）
  _px(gx, gy) {
    const x = Math.min(RX1 * 256 + 255, Math.max(RX0 * 256, gx));
    const y = Math.min(RY1 * 256 + 255, Math.max(RY0 * 256, gy));
    const t = this.tiles.get(`${x >> 8}/${y >> 8}`);
    return t ? t[(y & 255) * 256 + (x & 255)] : NaN;
  }

  // px の中心どうしを直線で補間する（X, Y はズーム15の全体の px 座標から 0.5 引いたもの）
  _bilinear(X, Y) {
    const x0 = Math.floor(X);
    const y0 = Math.floor(Y);
    const fx = X - x0;
    const fy = Y - y0;
    const a = this._px(x0, y0);
    const b = this._px(x0 + 1, y0);
    const c = this._px(x0, y0 + 1);
    const d = this._px(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  // 元の地面の標高（坂を入れる前）
  baseAt([lng, lat]) {
    return this._bilinear(lngToX(lng, BZ) * 256 - 0.5, latToY(lat, BZ) * 256 - 0.5);
  }

  // 平地だけ入れた地面の標高（坂道・階段の高さの基準）
  levelAt(ll) {
    let v = this.baseAt(ll);
    if (!this.terraces.length || !Number.isFinite(v)) return v;
    const [x, y] = toXY(ll);
    for (const t of this.terraces) v = t.burn(x, y, v);
    return v;
  }

  // 平地・坂道・階段をぜんぶ入れた地面の標高
  groundAt(ll) {
    let v = this.levelAt(ll);
    if (!this.slopes.length || !Number.isFinite(v)) return v;
    const [x, y] = toXY(ll);
    for (const s of this.slopes) v = s.burn(x, y, v);
    return v;
  }

  // 焼き込むもの（平地・坂道・階段）を差し替える（先に ensure でまわりのタイルを読んでおく）。変わったら true
  setBurns(features) {
    const key = JSON.stringify(features);
    if (key === this.burnKey) return false;
    this.burnKey = key;
    this.terraces = features.filter((f) => f.type === "terrace").map((f) => prepareTerrace(f, (ll) => this.baseAt(ll))).filter(Boolean);
    this.slopes = features.filter((f) => f.type === "slope" || f.type === "stairs").map((f) => prepareSlope(f, (ll) => this.levelAt(ll))).filter(Boolean);
    this.version++;
    this.cache.clear();
    return true;
  }

  // MapLibre に渡すタイル（PNG のバイト列）
  getTile(z, x, y) {
    const key = `${this.version}/${z}/${x}/${y}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this._make(z, x, y).catch(() => null);
      this.cache.set(key, p);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value); // 古いものから捨てる
    }
    return p;
  }

  async _make(z, x, y) {
    // このタイルにかかるものだけ見る（平地 → 坂道・階段の順）
    const [x0m, y1m] = toXY([xToLng(x, z), yToLat(y, z)]);
    const [x1m, y0m] = toXY([xToLng(x + 1, z), yToLat(y + 1, z)]);
    const slopes = [...this.terraces, ...this.slopes].filter((s) => !(s.box[2] < x0m || s.box[0] > x1m || s.box[3] < y0m || s.box[1] > y1m));
    let vals;
    if (z <= BZ) {
      const r = await fetch(staticUrl(z, x, y));
      if (!r.ok) return null;
      const buf = await r.arrayBuffer();
      if (!slopes.length) return buf; // 坂がかからないタイルは元のまま
      vals = await decodePng(buf);
    } else {
      // ズーム16・17：15の値を補間する。端の補間には隣のタイルの px も使うので、2px ぶん広く読む
      const pad = (2 * 360) / (256 * 2 ** BZ);
      await this.ensure([xToLng(x, z) - pad, yToLat(y + 1, z) - pad, xToLng(x + 1, z) + pad, yToLat(y, z) + pad]);
      vals = new Float32Array(65536);
      const f = 2 ** (z - BZ);
      for (let py = 0; py < 256; py++) {
        const Y = (y * 256 + py + 0.5) / f - 0.5;
        for (let px = 0; px < 256; px++) vals[py * 256 + px] = this._bilinear((x * 256 + px + 0.5) / f - 0.5, Y);
      }
    }
    if (slopes.length) {
      const lngs = new Float64Array(256);
      for (let px = 0; px < 256; px++) lngs[px] = xToLng(x + (px + 0.5) / 256, z);
      for (let py = 0; py < 256; py++) {
        const lat = yToLat(y + (py + 0.5) / 256, z);
        for (let px = 0; px < 256; px++) {
          const [mx, my] = toXY([lngs[px], lat]);
          let v = vals[py * 256 + px];
          for (const s of slopes) v = s.burn(mx, my, v);
          vals[py * 256 + px] = v;
        }
      }
    }
    return encodePng(vals);
  }
}

export const dem = new Dem();

// MapLibre に campusdem:// を登録する（1回だけ）
let registered = false;
export function registerDemProtocol(ml) {
  if (registered || !ml?.addProtocol) return;
  registered = true;
  ml.addProtocol(DEM_PROTOCOL, async (params) => {
    const m = /^campusdem:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`bad DEM url: ${params.url}`);
    const data = await dem.getTile(+m[1], +m[2], +m[3]);
    if (!data) throw new Error(`no DEM tile: ${params.url}`);
    return { data };
  });
}
// 坂を焼き込んだタイルの URL（坂を変えたら version が変わる）
export const demTileUrl = () => `${DEM_PROTOCOL}://{z}/{x}/{y}?v=${dem.version}`;
