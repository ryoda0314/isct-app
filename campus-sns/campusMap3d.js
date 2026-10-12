// キャンパスナビの「3D表示」。イラスト地図（campusBasemap.js）と同じデータ・配色のまま、
// 建物を立ち上げて MapLibre GL（WebGL）で描くためのスタイルとデータを作る。地図タイルは使わない。
// 地形（土地の高低差）は、国土地理院の標高タイルから作った public/map-dem（scripts/gen-campus-terrain.mjs）。
// 出典: © OpenStreetMap contributors（ODbL）、国土地理院 — 地図上に出典を表示すること。
import { CAMPUS_BOUNDARY, SPOTS } from "./hooks/useLocationSharing.js";
import { MIN_PX, PALETTES, WIDTH_M, mixHex, walkSegments } from "./campusBasemap.js";
import { TERRAIN } from "./campusTerrain.js";

// MapLibre は 512px タイル基準なので、同じ縮尺は Leaflet のズームより 1 小さい
export const ML_ZOOM_OFFSET = -1;
export const PITCH = 55; // ふだんの傾き
export const PITCH_GUIDE = 60; // 案内中の傾き
export const TERRAIN_EXAG = 1; // 地形の高さの倍率（建物と同じ縮尺のまま）
export const ROUTE_DOT = "cb-route-dot"; // ルートの透けて見える点の画像名

const LAT0 = 35.6058;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const MPP0 = 78271.517 * COS; // MapLibre のズーム 0 で 1px あたり何 m か（この緯度）

const lngLat = ([lat, lng]) => [lng, lat];
const closeRing = (pts) => {
  const r = pts.map(lngLat);
  const a = r[0];
  const b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
};
// 面積（m²）。桁落ちしないよう最初の点からの相対座標で計算する
const areaM2 = (pts) => {
  const [y0, x0] = pts[0];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ya, xa] = pts[i];
    const [yb, xb] = pts[(i + 1) % pts.length];
    s += (xa - x0) * 111320 * COS * ((yb - y0) * 110950) - (xb - x0) * 111320 * COS * ((ya - y0) * 110950);
  }
  return Math.abs(s) / 2;
};

// 建物の高さ(m)。OSM に高さ・階数があればそれ（z）、無ければ面積から控えめに見積もる
export const buildingHeight = (b) => {
  if (b.z) return b.z;
  const a = areaM2(b.p);
  return Math.round(Math.max(6, Math.min(20, 8 + 2.2 * Math.log2(Math.max(1, a) / 100))) * 10) / 10;
};

// 実際の幅(m)をズームに合わせた px にする式（最小幅は確保）。extra は縁取りの分
const widthExpr = (meters, minPx, extra = 0) => {
  const z0 = Math.min(21, Math.log2((minPx * MPP0) / meters));
  return ["interpolate", ["exponential", 2], ["zoom"], z0, minPx + extra, 22, (meters * 2 ** 22) / MPP0 + extra];
};

const fc = (features) => ({ type: "FeatureCollection", features });
const polyF = (rings, properties = {}, id) => ({ type: "Feature", ...(id != null ? { id } : {}), properties, geometry: { type: "Polygon", coordinates: rings.map(closeRing) } });
const lineF = (pts, properties = {}) => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates: pts.map(lngLat) } });
const spotById = Object.fromEntries(SPOTS.filter((s) => s.id).map((s) => [s.id, s]));

export const EMPTY_FC = fc([]);

// ── 画面を地図データの外（何も描いていないところ）に出さない ──
const DEG = Math.PI / 180;
const MPP_EQ = 78271.517; // ズーム 0・赤道で 1px あたり何 m か（512px タイル）
const CONSTRAIN_PITCH = 20; // 制限の計算に使う傾きの上限。これより奥（画面の上のほう）は、もやで隠す

// データの範囲（緯度経度と、メートルでの幅・高さ）
export function regionOf(data) {
  const [[s, w], [n, e]] = data.region;
  const lat0 = (s + n) / 2;
  const kx = 111320 * Math.cos(lat0 * DEG);
  const ky = 110950;
  return { s, w, n, e, lat0, kx, ky, wm: (e - w) * kx, hm: (n - s) * ky, mpp0: MPP_EQ * Math.cos(lat0 * DEG) };
}

// 画面の四隅が地面のどこに当たるか。中心からの [東, 北]（単位は中心の縮尺での px）
function cornerOffsets(W, H, pad, bearing, pitch, fovRad) {
  const p = Math.min(pitch, CONSTRAIN_PITCH) * DEG;
  const th = bearing * DEG;
  const D = (0.5 * H) / Math.tan(fovRad / 2); // カメラから画面の中心までの距離
  const xc = (W + pad.left - pad.right) / 2;
  const yc = (H + pad.top - pad.bottom) / 2;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return [[0, 0], [W, 0], [0, H], [W, H]].map(([sx, sy]) => {
    const v = sy - yc;
    const t = (D * cp) / (D * cp + v * sp);
    const fwd = (D * sp - v * cp) * t - D * sp; // 奥（画面の上）へ
    const right = (sx - xc) * t;
    return [right * Math.cos(th) + fwd * Math.sin(th), -right * Math.sin(th) + fwd * Math.cos(th)];
  });
}

// MapLibre の transformConstrain に渡す関数。this は MapLibre の transform（幅・高さ・向き・傾き・余白を持つ）。
// 回した・傾けた画面の四隅がデータの外に出るなら、中心をずらし、それでも収まらなければ寄る
export function makeConstrain(R, LngLat) {
  return function constrain(lngLat, zoom) {
    const W = this.width;
    const H = this.height;
    let z = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    if (!W || !H || !lngLat) return { center: lngLat, zoom: z };
    let mpp = R.mpp0 / 2 ** z;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    cornerOffsets(W, H, this.padding, this.bearing, this.pitch, this.fovInRadians).forEach(([ex, ny]) => {
      x0 = Math.min(x0, ex); x1 = Math.max(x1, ex); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    });
    const over = Math.max(((x1 - x0) * mpp) / R.wm, ((y1 - y0) * mpp) / R.hm);
    if (over > 1) {
      z = Math.min(this.maxZoom, z + Math.log2(over));
      mpp = R.mpp0 / 2 ** z;
    }
    const cx = (lngLat.lng - R.w) * R.kx; // データの南西の角から東へ何 m
    const cy = (lngLat.lat - R.s) * R.ky;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    const ex = clamp(cx, -x0 * mpp, R.wm - x1 * mpp);
    const ny = clamp(cy, -y0 * mpp, R.hm - y1 * mpp);
    if (ex === cx && ny === cy) return { center: lngLat, zoom: z };
    return { center: new LngLat(R.w + ex / R.kx, R.s + ny / R.ky), zoom: z };
  };
}

// 回さず傾けずに、データがちょうど画面いっぱいになるズーム（いちばん引いた「全体」）
export const coverZoom = (R, W, H) => Math.log2(Math.max((W * R.mpp0) / R.wm, (H * R.mpp0) / R.hm));

// 引くほど平らに：全体のあたりでは真上近くから、少し寄ると立体に
export const maxPitchAt = (zoom, cover) => 10 + 60 * Math.min(1, Math.max(0, (zoom - cover - 0.1) / 0.9));

// データの端（道路などを切ったところ）を背景色へ溶かす帯。外側ほど濃く、データの外は塗りつぶす
function edgeFC(R, width = 160, steps = 8) {
  const ring = (d) => {
    const dx = d / R.kx;
    const dy = d / R.ky;
    return [[R.w + dx, R.s + dy], [R.e - dx, R.s + dy], [R.e - dx, R.n - dy], [R.w + dx, R.n - dy], [R.w + dx, R.s + dy]];
  };
  const far = [[R.w - 1, R.s - 1], [R.e + 1, R.s - 1], [R.e + 1, R.n + 1], [R.w - 1, R.n + 1], [R.w - 1, R.s - 1]];
  const poly = (o, rings) => ({ type: "Feature", properties: { o }, geometry: { type: "Polygon", coordinates: rings } });
  const feats = [poly(1, [far, ring(0)])];
  for (let i = 0; i < steps; i++) feats.push(poly((1 - (i + 0.5) / steps) ** 1.6, [ring((width * i) / steps), ring((width * (i + 1)) / steps)]));
  return fc(feats);
}

// 段彩の標高(m)と、それぞれの色（低い → 高い）。大岡山のあたりは 7〜46m で、ほとんどが 15〜40m
const RELIEF = [8, 18, 26, 33, 40];
const RELIEF_COLORS = {
  light: ["#c9d5e0", "#d9e2e9", "#e6ebef", "#eff2f1", "#f6f6f2"],
  dark: ["#040507", "#0a0c0f", "#111418", "#1a1d22", "#23272c"],
};

// 標高タイル（Terrarium 形式）。MapLibre はタイルをワーカーで読むので、URL は絶対パスにする。
// 坂を焼き込むときは campusdem://（campusDem.js）のタイルを、ズーム17まで使う
export const STATIC_DEM = { tiles: [`${typeof location !== "undefined" ? location.origin : ""}${TERRAIN.path}/{z}/{x}/{y}.png`], maxzoom: TERRAIN.maxzoom };
const demSource = (dem) => ({
  type: "raster-dem",
  tiles: dem.tiles,
  tileSize: 256,
  encoding: "terrarium",
  minzoom: TERRAIN.minzoom,
  maxzoom: dem.maxzoom,
  bounds: TERRAIN.bounds,
});

// 光（南西から）。手で足した構造物（campus3dLayer.js）も同じ光で描く
export const lightOf = (dark) => ({ anchor: "map", color: "#ffffff", intensity: dark ? 0.25 : 0.38, position: [1.4, 210, 35] });
// ルートの線の太さ(px)。橋の上のルート（campus3dLayer.js）も同じ太さにする
export const ROUTE_COL = "#1a8ef0";
export const routeWidth = (zoom) => 3.5 + (Math.min(19, Math.max(14, zoom)) - 14) * 0.8;
export const routeCasing = (zoom) => 6 + (Math.min(19, Math.max(14, zoom)) - 14) * 1.2;

// 建物（通り抜けの穴をあけた建物は、分けた形 pieces: Map(番号 → [{ rings: lng/lat, h, b }]) に差し替える）
export function buildingsFC(data, heights, pieces = null) {
  const out = [];
  data.buildings.forEach((b, i) => {
    const props = { i, s: b.s || "", m: b.s ? 1 : 0 };
    const cut = pieces && pieces.get(i);
    if (!cut) out.push(polyF([b.p, ...(b.h || [])], { ...props, h: heights[i] }, i));
    else cut.forEach((p) => out.push({ type: "Feature", id: i, properties: { ...props, h: p.h, b: p.b }, geometry: { type: "Polygon", coordinates: p.rings } }));
  });
  return fc(out);
}

// 道路と通路の線 [{ k: 種類, pts: [[lat, lng]...] }]（橋の上の部分を除いて差し替えられるように、線のまま持つ）
export function streetLines(data) {
  const lines = [];
  ["minor", "ped", "mid", "major"].forEach((k) => (data.streets[k] || []).forEach((pts) => lines.push({ k, pts })));
  walkSegments().forEach((pts) => lines.push({ k: "walk", pts }));
  return lines;
}
export const streetsFC = (lines) => fc(lines.map(({ k, pts }) => lineF(pts, { k })));
export const linesFC = (lines) => fc(lines.map((pts) => lineF(pts)));

/**
 * @param data  BASEMAP（campusBasemapData.js）
 * @param opts  { dark, accent, dem（標高タイル。既定は STATIC_DEM） }
 * @returns { style, bySpot: Map(spotId -> [建物の番号]), heights: 建物ごとの高さ(m), labels, stations, pal, hl, streets }
 */
export function buildCampus3D(data, { dark = false, accent = "#28c868", dem = STATIC_DEM } = {}) {
  const pal = { ...(dark ? PALETTES.dark : PALETTES.light), relief: RELIEF_COLORS[dark ? "dark" : "light"] };
  const hl =mixHex(accent, pal.bld, dark ? 0.55 : 0.4); // 目的地の建物の色

  const heights = data.buildings.map(buildingHeight);
  const bySpot = new Map();
  data.buildings.forEach((b, i) => {
    [b.s, ...(b.o || [])].filter(Boolean).forEach((id) => {
      if (!bySpot.has(id)) bySpot.set(id, []);
      bySpot.get(id).push(i);
    });
  });

  const streets = streetLines(data);

  const sources = {
    cbCampus: { type: "geojson", data: fc([polyF([CAMPUS_BOUNDARY])]) },
    cbGreen: { type: "geojson", data: fc(data.green.map((g) => polyF([g.p], { k: g.k }))) },
    cbWater: { type: "geojson", data: fc(data.water.map((w) => polyF([w]))) },
    cbStreets: { type: "geojson", data: streetsFC(streets) },
    cbRailSurface: { type: "geojson", data: linesFC(data.rail.surface) },
    cbRailTunnel: { type: "geojson", data: fc(data.rail.tunnel.map((l) => lineF(l))) },
    cbPlatforms: { type: "geojson", data: fc(data.platforms.map((p) => polyF([p]))) },
    cbBuildings: { type: "geojson", data: buildingsFC(data, heights) },
    cbEdge: { type: "geojson", data: edgeFC(regionOf(data)) },
    cbPassShade: { type: "geojson", data: EMPTY_FC }, // 通り抜け（屋根の下）の床の影
    // 地形（立体）と陰影は別のソースにする（MapLibre の推奨。同じタイルを共有すると解像度の扱いがぶつかる）
    cbDem: demSource(dem),
    cbDemShade: demSource(dem),
    // 動的に入れ替えるもの
    navAccuracy: { type: "geojson", data: EMPTY_FC },
    navRoutePassed: { type: "geojson", data: EMPTY_FC },
    navRoute: { type: "geojson", data: EMPTY_FC },
    navSpots: { type: "geojson", data: EMPTY_FC },
  };

  const kinds = ["minor", "ped", "mid", "major", "walk"];
  const caseOf = (k) => (k === "walk" ? pal.walkCase : pal.streetCase);
  const fillOf = (k) => (k === "walk" ? pal.walk : pal.street);
  const zA = Math.log2(MPP0); // 線路：3m を 3〜9px で
  const layers = [
    { id: "cb-bg", type: "background", paint: { "background-color": pal.outside } },
    // 段彩：低いところ（谷）ほど濃く、高いところ（台地）ほど明るく塗る。坂がゆるやかなので、陰影だけでは高低がわかりにくい
    {
      id: "cb-relief", type: "color-relief", source: "cbDemShade",
      paint: {
        "color-relief-color": ["interpolate", ["linear"], ["elevation"], ...RELIEF.flatMap((h, i) => [h, pal.relief[i]])],
        "color-relief-opacity": 1,
      },
    },
    { id: "cb-campus", type: "fill", source: "cbCampus", paint: { "fill-color": pal.campus } },
    { id: "cb-campus-edge", type: "line", source: "cbCampus", paint: { "line-color": pal.campusEdge, "line-width": 1.5 } },
    {
      id: "cb-green", type: "fill", source: "cbGreen",
      paint: { "fill-color": ["match", ["get", "k"], "pitch", pal.pitch, "track", pal.track, "wood", pal.wood, pal.park] },
    },
    { id: "cb-water", type: "fill", source: "cbWater", paint: { "fill-color": pal.water } },
    // 斜面の陰影（地面の色の上・道路の下）。立体の地形だけでは、塗りが平らで坂が見えにくい
    {
      id: "cb-hillshade", type: "hillshade", source: "cbDemShade",
      paint: {
        "hillshade-exaggeration": dark ? 0.6 : 0.55,
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-anchor": "map",
        "hillshade-shadow-color": dark ? "#000000" : "#4d6378",
        "hillshade-highlight-color": dark ? "#2c3540" : "#ffffff",
        "hillshade-accent-color": dark ? "#000000" : "#6f8398",
      },
    },
    ...kinds.map((k) => ({
      id: `cb-case-${k}`, type: "line", source: "cbStreets", filter: ["==", ["get", "k"], k],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": caseOf(k), "line-width": widthExpr(WIDTH_M[k], MIN_PX[k], k === "walk" ? 1.6 : 2) },
    })),
    ...kinds.map((k) => ({
      id: `cb-fill-${k}`, type: "line", source: "cbStreets", filter: ["==", ["get", "k"], k],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": fillOf(k), "line-width": widthExpr(WIDTH_M[k], MIN_PX[k]) },
    })),
    // 建物をくぐる通路の床は暗くする（上は屋根で隠れるので、穴の口からだけ見える）
    { id: "cb-passage-shade", type: "fill", source: "cbPassShade", paint: { "fill-color": dark ? "#000000" : "#2b3a4a", "fill-opacity": dark ? 0.35 : 0.22 } },
    { id: "cb-rail-tunnel", type: "line", source: "cbRailTunnel", paint: { "line-color": pal.rail, "line-width": 2.5, "line-opacity": 0.55, "line-dasharray": [2, 3] } },
    { id: "cb-platforms", type: "fill", source: "cbPlatforms", paint: { "fill-color": pal.platform } },
    { id: "cb-rail", type: "line", source: "cbRailSurface", layout: { "line-join": "round" }, paint: { "line-color": pal.rail, "line-width": ["interpolate", ["exponential", 2], ["zoom"], zA, 3, zA + Math.log2(3), 9] } },
    { id: "cb-rail-dash", type: "line", source: "cbRailSurface", paint: { "line-color": pal.railDash, "line-width": ["interpolate", ["exponential", 2], ["zoom"], zA, 1.2, zA + Math.log2(3), 2.9], "line-dasharray": [4, 4] } },
    // データの端を背景へ溶かす（道路がぷつっと切れて見えないように）
    { id: "cb-edge", type: "fill", source: "cbEdge", paint: { "fill-color": pal.outside, "fill-opacity": ["get", "o"], "fill-antialias": false } },
    { id: "nav-accuracy", type: "fill", source: "navAccuracy", paint: { "fill-color": "#4285f4", "fill-opacity": 0.1 } },
    // 建物以外のスポット（ベンチ・自販機など）。寄ったときだけ出す。建物の陰になるものは隠れる
    {
      id: "nav-spots", type: "circle", source: "navSpots", minzoom: 16.6,
      paint: {
        "circle-radius": ["case", ["==", ["get", "g"], 1], 7, 4.5],
        "circle-color": ["get", "col"],
        "circle-opacity": ["case", ["==", ["get", "g"], 1], 1, 0.6],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["==", ["get", "g"], 1], 2.5, 1.2],
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "cb-buildings", type: "fill-extrusion", source: "cbBuildings",
      paint: {
        "fill-extrusion-color": ["case", ["boolean", ["feature-state", "hl"], false], hl, ["==", ["get", "m"], 1], pal.bld, pal.bldMuted],
        "fill-extrusion-height": ["get", "h"],
        // 通り抜けの穴の上の部分は、天井の高さ b から上だけ
        "fill-extrusion-base": ["coalesce", ["get", "b"], 0],
        "fill-extrusion-opacity": dark ? 0.94 : 0.97,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    // ルートの線は地形に貼り付けて描くので、建物の陰に入ると隠れる
    { id: "nav-route-passed", type: "line", source: "navRoutePassed", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#888888", "line-width": 5, "line-opacity": 0.45, "line-dasharray": [1.2, 1.6] } },
    { id: "nav-route-case", type: "line", source: "navRoute", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 6, 19, 12] } },
    { id: "nav-route", type: "line", source: "navRoute", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTE_COL, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3.5, 19, 7.5] } },
    // 建物の陰に隠れたところも透けて見えるよう、建物より手前に描かれる点（シンボル）を線に沿って並べる。
    // 線より細い同じ色なので、見えているところでは線に溶け込み、建物の上だけ点線になる（画像 ROUTE_DOT は CampusMap3D が足す）
    {
      id: "nav-route-xray", type: "symbol", source: "navRoute",
      layout: {
        "symbol-placement": "line", "symbol-spacing": 9, "icon-image": ROUTE_DOT,
        "icon-allow-overlap": true, "icon-ignore-placement": true,
        "icon-rotation-alignment": "map", "icon-pitch-alignment": "map",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.5, 19, 1],
      },
      paint: { "icon-opacity": 0.9 },
    },
  ];

  // ラベル（2D と同じく、スポットの略称と名前。小さい建物は寄ったときだけ）
  const labels = [];
  data.buildings.forEach((b, i) => {
    if (!b.l) return;
    const s = b.s ? spotById[b.s] : null;
    const full = s ? s.label.replace(/・.*$/, "") : b.n;
    if (!full) return;
    labels.push({ i, spot: b.s || "", lngLat: lngLat(b.c), short: s ? s.short : "", full, mapped: !!s, small: b.r < 5, h: heights[i] });
  });
  const stations = data.stations.map((st) => ({ lngLat: [st.lng, st.lat], name: `${st.name}駅` }));

  const style = {
    version: 8,
    sources,
    layers,
    // 南西からの光（2D の影と同じ向き）
    light: lightOf(dark),
    terrain: { source: "cbDem", exaggeration: TERRAIN_EXAG },
  };
  return { style, bySpot, heights, labels, stations, pal, hl, streets };
}

const inRing = (lat, lng, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// スポットの位置がそのスポットの建物の中なら、その建物の高さ(m)。外（入口など）なら 0
export function roofAt(data, built, spotId, lat, lng) {
  for (const i of built.bySpot.get(spotId) || []) {
    const b = data.buildings[i];
    if (inRing(lat, lng, b.p) && !(b.h || []).some((hole) => inRing(lat, lng, hole))) return built.heights[i];
  }
  return 0;
}
// スポットの建物の外周の点（ルート全体を見せるときに、目的地の建物まで画面に入れる）
export const spotOutline = (data, built, spotId) => (built.bySpot.get(spotId) || []).flatMap((i) => data.buildings[i].p.map(([lat, lng]) => ({ lat, lng })));

// 半径 r(m) の円（GPS の精度表示用）
export function circleFC(lat, lng, r, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([lng + (r * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 110950]);
  }
  return fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }]);
}

export const lineFC = (latlngs) => (latlngs && latlngs.length > 1 ? fc([lineF(latlngs)]) : EMPTY_FC);
export const pointsFC = (points) => fc(points.map((p) => ({ type: "Feature", properties: p.props || {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })));
