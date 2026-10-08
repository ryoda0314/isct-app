// キャンパスナビの「3D表示」。イラスト地図（campusBasemap.js）と同じデータ・配色のまま、
// 建物を立ち上げて MapLibre GL（WebGL）で描くためのスタイルとデータを作る。地図タイルは使わない。
// 出典: © OpenStreetMap contributors（ODbL）— 地図上に出典を表示すること。
import { CAMPUS_BOUNDARY, SPOTS } from "./hooks/useLocationSharing.js";
import { MIN_PX, PALETTES, WIDTH_M, mixHex, walkSegments } from "./campusBasemap.js";

// MapLibre は 512px タイル基準なので、同じ縮尺は Leaflet のズームより 1 小さい
export const ML_ZOOM_OFFSET = -1;
export const PITCH = 55; // ふだんの傾き
export const PITCH_GUIDE = 60; // 案内中の傾き

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

/**
 * @param data  BASEMAP（campusBasemapData.js）
 * @param opts  { dark, accent }
 * @returns { style, bySpot: Map(spotId -> [建物の番号]), heights: 建物ごとの高さ(m), labels, stations, pal, hl }
 */
export function buildCampus3D(data, { dark = false, accent = "#28c868" } = {}) {
  const pal = dark ? PALETTES.dark : PALETTES.light;
  const hl = mixHex(accent, pal.bld, dark ? 0.55 : 0.4); // 目的地の建物の色

  const heights = data.buildings.map(buildingHeight);
  const buildings = data.buildings.map((b, i) => polyF([b.p, ...(b.h || [])], { i, s: b.s || "", m: b.s ? 1 : 0, h: heights[i] }, i));
  const bySpot = new Map();
  data.buildings.forEach((b, i) => {
    [b.s, ...(b.o || [])].filter(Boolean).forEach((id) => {
      if (!bySpot.has(id)) bySpot.set(id, []);
      bySpot.get(id).push(i);
    });
  });

  const streets = [];
  ["minor", "ped", "mid", "major"].forEach((k) => (data.streets[k] || []).forEach((l) => streets.push(lineF(l, { k }))));
  walkSegments().forEach((l) => streets.push(lineF(l, { k: "walk" })));

  const sources = {
    cbCampus: { type: "geojson", data: fc([polyF([CAMPUS_BOUNDARY])]) },
    cbGreen: { type: "geojson", data: fc(data.green.map((g) => polyF([g.p], { k: g.k }))) },
    cbWater: { type: "geojson", data: fc(data.water.map((w) => polyF([w]))) },
    cbStreets: { type: "geojson", data: fc(streets) },
    cbRailSurface: { type: "geojson", data: fc(data.rail.surface.map((l) => lineF(l))) },
    cbRailTunnel: { type: "geojson", data: fc(data.rail.tunnel.map((l) => lineF(l))) },
    cbPlatforms: { type: "geojson", data: fc(data.platforms.map((p) => polyF([p]))) },
    cbBuildings: { type: "geojson", data: fc(buildings) },
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
    { id: "cb-campus", type: "fill", source: "cbCampus", paint: { "fill-color": pal.campus } },
    { id: "cb-campus-edge", type: "line", source: "cbCampus", paint: { "line-color": pal.campusEdge, "line-width": 1.5 } },
    {
      id: "cb-green", type: "fill", source: "cbGreen",
      paint: { "fill-color": ["match", ["get", "k"], "pitch", pal.pitch, "track", pal.track, "wood", pal.wood, pal.park] },
    },
    { id: "cb-water", type: "fill", source: "cbWater", paint: { "fill-color": pal.water } },
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
    { id: "cb-rail-tunnel", type: "line", source: "cbRailTunnel", paint: { "line-color": pal.rail, "line-width": 2.5, "line-opacity": 0.55, "line-dasharray": [2, 3] } },
    { id: "cb-platforms", type: "fill", source: "cbPlatforms", paint: { "fill-color": pal.platform } },
    { id: "cb-rail", type: "line", source: "cbRailSurface", layout: { "line-join": "round" }, paint: { "line-color": pal.rail, "line-width": ["interpolate", ["exponential", 2], ["zoom"], zA, 3, zA + Math.log2(3), 9] } },
    { id: "cb-rail-dash", type: "line", source: "cbRailSurface", paint: { "line-color": pal.railDash, "line-width": ["interpolate", ["exponential", 2], ["zoom"], zA, 1.2, zA + Math.log2(3), 2.9], "line-dasharray": [4, 4] } },
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
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": dark ? 0.94 : 0.97,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    // ルートは建物の上に描く（建物の陰に入っても見えるように）
    { id: "nav-route-passed", type: "line", source: "navRoutePassed", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#888888", "line-width": 5, "line-opacity": 0.45, "line-dasharray": [1.2, 1.6] } },
    { id: "nav-route-case", type: "line", source: "navRoute", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 6, 19, 12] } },
    { id: "nav-route", type: "line", source: "navRoute", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1a8ef0", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3.5, 19, 7.5] } },
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
    light: { anchor: "map", color: "#ffffff", intensity: dark ? 0.25 : 0.38, position: [1.4, 210, 35] },
  };
  return { style, bySpot, heights, labels, stations, pal, hl };
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
