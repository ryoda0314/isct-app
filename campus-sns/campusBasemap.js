// キャンパスナビの「イラスト地図」。航空写真タイルの代わりに、キャンパスの建物・通路・緑地を
// ベクターで描く（データ: campusBasemapData.js = OSM 由来 + アプリの通路グラフ WAYPOINTS/EDGES）。
// Leaflet の地図インスタンスに重ねて使う。leaflet-rotate の回転にも追従する。
import { CAMPUS_BOUNDARY, ENTRANCES, SPOTS, WAYPOINTS, EDGES } from "./hooks/useLocationSharing.js";

// 3D表示（campusMap3d.js）でも同じ配色・線幅を使う
export const PALETTES = {
  light: {
    outside: "#e8edf0", campus: "#f5f7f2", campusEdge: "#d8e1d3",
    park: "#d3e8c5", pitch: "#c7e2b6", track: "#ead7c6", wood: "#bddcaa", water: "#c4ddf0",
    streetCase: "#d4dde6", street: "#ffffff", walkCase: "#dfe6ec", walk: "#ffffff",
    rail: "#a6b1bd", railDash: "#ffffff", platform: "#cbd3dc",
    bld: "#ffffff", bldMuted: "#f6f8fa", bldStroke: "#c3cfdb", bldShadow: "rgba(20,40,60,0.12)",
    label: "#4c6480", labelMuted: "#96a4b3", halo: "#ffffff", station: "#0e2030", stationBg: "#ffffff",
  },
  dark: {
    outside: "#111418", campus: "#171b20", campusEdge: "#262d34",
    park: "#1c3024", pitch: "#1f3627", track: "#3a2d25", wood: "#1a2d20", water: "#1a2b3c",
    streetCase: "#0b0d10", street: "#2a3038", walkCase: "#101317", walk: "#313843",
    rail: "#59636f", railDash: "#1c2026", platform: "#2a313a",
    bld: "#262c35", bldMuted: "#1f242b", bldStroke: "#3b4450", bldShadow: "rgba(0,0,0,0.4)",
    label: "#b3bfcc", labelMuted: "#6c7886", halo: "#171b20", station: "#e6ebf1", stationBg: "#262c35",
  },
};

// 実際の幅(m)。ズームに応じて px に直す（最小幅は確保）
export const WIDTH_M = { walk: 4.5, minor: 6, ped: 5, mid: 8, major: 12 };
export const MIN_PX = { walk: 1.6, minor: 1.6, ped: 1.4, mid: 2.2, major: 3 };

const STYLE_ID = "campus-basemap-style";
const ZOOM_CLASSES = ["cb-z-lo", "cb-z-mid", "cb-z-hi", "cb-z-max"];
const CSS = `
.cb-lbl{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;letter-spacing:-.01em;line-height:1;color:var(--cb-label);
  text-shadow:0 0 3px var(--cb-halo),0 0 3px var(--cb-halo),0 0 2px var(--cb-halo),0 0 1px var(--cb-halo);pointer-events:none;font-family:inherit}
.cb-lbl .cb-s{font-size:11px}.cb-lbl .cb-f{font-size:12.5px}
.cb-lbl.cb-un{color:var(--cb-label-muted);font-weight:700}.cb-lbl.cb-un .cb-f{font-size:10.5px}
.cb-z-lo .cb-lbl{display:none}
.cb-z-mid .cb-lbl .cb-f{display:none}
.cb-z-hi .cb-lbl .cb-s,.cb-z-max .cb-lbl .cb-s{display:none}
.cb-z-mid .cb-lbl.cb-sm,.cb-z-hi .cb-lbl.cb-sm,.cb-z-mid .cb-lbl.cb-un,.cb-z-hi .cb-lbl.cb-un{display:none}
.cb-lbl.cb-hl{display:block!important;color:var(--cb-accent);font-size:14px;transform:translate(-50%,9px)}
.cb-lbl.cb-hl .cb-s{display:none!important}.cb-lbl.cb-hl .cb-f{display:inline!important;font-size:14px}
.cb-sta{position:absolute;transform:translate(-50%,-50%);padding:4px 10px;border-radius:9px;background:var(--cb-station-bg);color:var(--cb-station);
  font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.18);border:1px solid rgba(120,140,160,.35);pointer-events:none;font-family:inherit}
.cb-z-lo .cb-sta{font-size:10px;padding:2px 7px}
.cb-bld.leaflet-interactive{cursor:pointer}
/* 建物以外のスポット（ベンチ・自販機など）の点は、寄ったときだけ出す */
.cb-z-lo .nav-dot,.cb-z-mid .nav-dot{opacity:0;pointer-events:none}
`;

const ensureCss = () => {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
};

const spotById = Object.fromEntries(SPOTS.filter((s) => s.id).map((s) => [s.id, s]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 通路グラフの辺を [[lat,lng],[lat,lng]] の線分の配列にする
export const walkSegments = () => {
  const nodes = {};
  WAYPOINTS.forEach((w) => { nodes[w.id] = w; });
  ENTRANCES.forEach((e, i) => { nodes[`ent_${i}`] = e; });
  SPOTS.forEach((s) => { if (s.id && s.lat != null) nodes[s.id] = s; });
  const segs = [];
  EDGES.forEach(([a, b]) => {
    const A = nodes[a];
    const B = nodes[b];
    if (A && B) segs.push([[A.lat, A.lng], [B.lat, B.lng]]);
  });
  return segs;
};

// a と b を t:1-t で混ぜた色（'#rrggbb'）
export const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * t + ((pb >> sh) & 255) * (1 - t));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`;
};

export function isDarkColor(hex) {
  const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * @param L       window.L
 * @param map     L.Map
 * @param data    BASEMAP（campusBasemapData.js）
 * @param opts    { dark, accent, onSpotClick(spotId) }
 */
export function createCampusBasemap(L, map, data, { dark = false, accent = "#28c868", onSpotClick } = {}) {
  ensureCss();
  const pal = dark ? PALETTES.dark : PALETTES.light;
  const container = map.getContainer();
  const prevBg = container.style.background;
  container.style.background = pal.outside;
  container.style.setProperty("--cb-label", pal.label);
  container.style.setProperty("--cb-label-muted", pal.labelMuted);
  container.style.setProperty("--cb-halo", pal.halo);
  container.style.setProperty("--cb-accent", accent);
  container.style.setProperty("--cb-station", pal.station);
  container.style.setProperty("--cb-station-bg", pal.stationBg);

  // 形は回転する側、文字は回転しない側のペインに置く（leaflet-rotate が無い環境ではどちらも mapPane）
  const pane = (name, z, parent) => {
    const p = map.getPane(name) || map.createPane(name, parent || undefined);
    p.style.zIndex = String(z);
    p.style.display = "";
    return p;
  };
  const rot = map.getPane("rotatePane");
  const norot = map.getPane("norotatePane");
  pane("cbBase", 250, rot).style.pointerEvents = "none";
  pane("cbBuild", 260, rot);
  const labelPane = pane("cbLabel", 590, norot);
  labelPane.style.pointerEvents = "none";

  const rBase = L.svg({ pane: "cbBase", padding: 0.6 });
  const rBuild = L.svg({ pane: "cbBuild", padding: 0.6 });
  const layers = [];
  const add = (layer) => { layer.addTo(map); layers.push(layer); return layer; };
  const base = { renderer: rBase, interactive: false };

  // 地面
  add(L.polygon(CAMPUS_BOUNDARY, { ...base, color: pal.campusEdge, weight: 1.5, fillColor: pal.campus, fillOpacity: 1, attribution: data.attribution }));
  // 緑地・水面（種類ごとに1パスへまとめる）
  ["park", "pitch", "track", "wood"].forEach((k) => {
    const rings = data.green.filter((g) => g.k === k).map((g) => [g.p]);
    if (rings.length) add(L.polygon(rings, { ...base, stroke: false, fillColor: pal[k], fillOpacity: 1 }));
  });
  if (data.water.length) add(L.polygon(data.water.map((p) => [p]), { ...base, stroke: false, fillColor: pal.water, fillOpacity: 1 }));

  // 道路と通路（縁取り → 中身の順に重ねて交差部をきれいに見せる）
  const lineKinds = [
    ["minor", data.streets.minor], ["ped", data.streets.ped], ["mid", data.streets.mid], ["major", data.streets.major],
    ["walk", walkSegments()],
  ].filter(([, list]) => list && list.length);
  const caseLayers = {};
  const fillLayers = {};
  const lineOpt = { ...base, lineCap: "round", lineJoin: "round", fill: false };
  lineKinds.forEach(([k, list]) => {
    caseLayers[k] = add(L.polyline(list, { ...lineOpt, color: k === "walk" ? pal.walkCase : pal.streetCase, opacity: 1 }));
  });
  lineKinds.forEach(([k, list]) => {
    fillLayers[k] = add(L.polyline(list, { ...lineOpt, color: k === "walk" ? pal.walk : pal.street, opacity: 1 }));
  });

  // 線路（地下区間は控えめな破線）
  if (data.rail.tunnel.length) add(L.polyline(data.rail.tunnel, { ...lineOpt, color: pal.rail, weight: 2.5, opacity: 0.55, dashArray: "4 6" }));
  if (data.platforms.length) add(L.polygon(data.platforms.map((p) => [p]), { ...base, stroke: false, fillColor: pal.platform, fillOpacity: 1 }));
  let railCase = null;
  let railDash = null;
  if (data.rail.surface.length) {
    railCase = add(L.polyline(data.rail.surface, { ...lineOpt, color: pal.rail, weight: 5, opacity: 1 }));
    railDash = add(L.polyline(data.rail.surface, { ...lineOpt, color: pal.railDash, weight: 1.6, opacity: 1, dashArray: "7 7", lineCap: "butt" }));
  }

  // 建物：影（南東へ少しずらした面）→ 本体
  const SH = [-0.0000085, 0.0000065];
  const shadowRings = data.buildings.map((b) => [b.p.map(([a, c]) => [a + SH[0], c + SH[1]])]);
  add(L.polygon(shadowRings, { renderer: rBuild, interactive: false, stroke: false, fillColor: pal.bldShadow, fillOpacity: 1 }));

  const bySpot = new Map(); // spotId -> [polygon]
  data.buildings.forEach((b) => {
    const mapped = !!b.s;
    const poly = add(L.polygon([b.p, ...(b.h || [])], {
      renderer: rBuild, interactive: mapped, bubblingMouseEvents: false, className: mapped ? `cb-bld cb-spot-${b.s}` : "cb-bld",
      color: pal.bldStroke, weight: 1, fillColor: mapped ? pal.bld : pal.bldMuted, fillOpacity: 1,
    }));
    if (mapped) {
      [b.s, ...(b.o || [])].forEach((id) => {
        if (!bySpot.has(id)) bySpot.set(id, []);
        bySpot.get(id).push(poly);
      });
      poly.on("click", () => onSpotClick?.(b.s));
    }
  });

  // ラベル（建物名）と駅名
  const labelEls = new Map(); // spotId -> element
  data.buildings.filter((b) => b.l).forEach((b) => {
    const s = b.s ? spotById[b.s] : null;
    const full = s ? s.label.replace(/・.*$/, "") : b.n;
    if (!full) return;
    const short = s ? s.short : "";
    const cls = ["cb-lbl", s ? "" : "cb-un", b.r < 5 ? "cb-sm" : ""].filter(Boolean).join(" ");
    const html = `<div class="${cls}" data-spot="${esc(b.s || "")}">${short ? `<span class="cb-s">${esc(short)}</span>` : ""}<span class="cb-f">${esc(full)}</span></div>`;
    const m = add(L.marker(b.c, { pane: "cbLabel", interactive: false, keyboard: false, icon: L.divIcon({ className: "", html, iconSize: [0, 0] }) }));
    if (b.s) labelEls.set(b.s, m);
  });
  data.stations.forEach((st) => {
    add(L.marker([st.lat, st.lng], { pane: "cbLabel", interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<div class="cb-sta">${esc(st.name)}駅</div>`, iconSize: [0, 0] }) }));
  });

  // ズームに合わせて線幅と文字の出し方を変える
  const onZoom = () => {
    const z = map.getZoom();
    const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** z;
    lineKinds.forEach(([k]) => {
      const w = Math.max(MIN_PX[k], WIDTH_M[k] / mpp);
      fillLayers[k].setStyle({ weight: w });
      caseLayers[k].setStyle({ weight: w + (k === "walk" ? 1.6 : 2) });
    });
    const rw = Math.max(3, Math.min(9, 3 / mpp));
    railCase?.setStyle({ weight: rw });
    railDash?.setStyle({ weight: Math.max(1.2, rw * 0.32) });
    container.classList.remove(...ZOOM_CLASSES);
    container.classList.add(z < 16.5 ? "cb-z-lo" : z < 17.6 ? "cb-z-mid" : z < 19 ? "cb-z-hi" : "cb-z-max");
  };
  map.on("zoomend", onZoom);
  onZoom();

  let highlighted = null;
  const regionBounds = L.latLngBounds(data.region);

  return {
    hasSpot: (id) => bySpot.has(id),
    regionBounds,
    setHighlight(id) {
      if (highlighted === id) return;
      if (highlighted) {
        (bySpot.get(highlighted) || []).forEach((p) => p.setStyle({ fillColor: pal.bld, color: pal.bldStroke, weight: 1 }));
        labelEls.get(highlighted)?.getElement()?.querySelector(".cb-lbl")?.classList.remove("cb-hl");
      }
      highlighted = id && bySpot.has(id) ? id : null;
      if (highlighted) {
        (bySpot.get(highlighted) || []).forEach((p) => {
          p.setStyle({ fillColor: mixHex(accent, pal.bld, dark ? 0.32 : 0.16), color: accent, weight: 2.5 });
          p.bringToFront();
        });
        labelEls.get(highlighted)?.getElement()?.querySelector(".cb-lbl")?.classList.add("cb-hl");
      }
    },
    remove() {
      map.off("zoomend", onZoom);
      layers.forEach((l) => { try { map.removeLayer(l); } catch { /* 既に外れている */ } });
      ["cbBase", "cbBuild", "cbLabel"].forEach((n) => { const p = map.getPane(n); if (p) p.style.display = "none"; });
      container.style.background = prevBg;
      container.classList.remove(...ZOOM_CLASSES);
    },
  };
}
