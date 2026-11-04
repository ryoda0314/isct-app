// キャンパスナビの「3D表示」。MapLibre GL（window.maplibregl・shared.jsx の useMapLibre で読み込む）に、
// イラスト地図と同じデータで建物を立ち上げて描く。現在地・目的地・ルート・案内中の追従は NavigationView から props で受け取る。
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { EMPTY_FC, LAMP_LIGHT_BEFORE, LAMP_LIGHT_LAYER, LAMP_LIGHT_SOURCE, ML_ZOOM_OFFSET, PITCH, PITCH_GUIDE, ROUTE_COL, ROUTE_DOT, STATIC_DEM, TERRAIN_EXAG, applyLook, buildCampus3D, buildingsFC, circleFC, coverZoom, lampLightOpacity, linesFC, makeConstrain, maxPitchAt, pointsFC, regionOf, roofAt, routeCasing, routeWidth, spotOutline, streetsFC } from "../campusMap3d.js";
import { LOOK_MODES, lookFor } from "../campus3dSky.js";
import { BURN_MAXZOOM, dem, demTileUrl, registerDemProtocol } from "../campusDem.js";
import { ROUTE_ON_BRIDGE, buildingOpenings, buildingRoof, burnsGround, featuresBounds, isPaint, pointInRing, prepareBridge, replacedBuildings, splitByBridges, stairsPath, toLngLat, toXY } from "../campus3dFeatures.js";
import { buildMesh, buildRibbons } from "../campus3dMesh.js";
import { createExtrasLayer, createLightsLayer, createTrainsLayer } from "../campus3dLayer.js";
import { lampBounds, lampLightCanvas, lampMesh, streetLamps } from "../campus3dLamps.js";
import { EYE, PITCH as WALK_PITCH, SPEED, SPRINT_FOV, VIEW_D, WALK_FOV, eyeCamera, routePath, stepBody, stepRoute, walkWorld } from "../campus3dWalk.js";
import { paintFeatures } from "../campus3dPaint.js";
import { TRAINS_URL, prepareTrains, serviceClock, setTrackHeights, trackBounds, trainMesh, trainsAt } from "../campus3dTrains.js";
import { TERRAIN } from "../campusTerrain.js";
import { cutPassages, loadClipper } from "../campus3dBuildings.js";

const rgbaOf = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const NO_FEATURES = [];
const PIN_SVG = (col) => `<svg width="36" height="46" viewBox="0 0 36 46"><path d="M18 44C18 44 3 29.5 3 18a15 15 0 0130 0c0 11.5-15 26-15 26z" fill="${col}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="18" r="5.5" fill="#fff"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
// a から見た b の方位（度, 北=0, 時計回り）
const bearingOf = (a, b) => {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
const routeKey = (r) => (r && r.length > 1 ? `${r.length}|${r[0].lat},${r[0].lng}|${r[r.length - 1].lat},${r[r.length - 1].lng}` : null);
const MPP0 = 78271.517 * Math.cos((35.6058 * Math.PI) / 180); // ズーム 0 で 1px あたり何 m か
const PITCH_FIT = 45; // ルート全体などを見せるときの傾き
const GUIDE_FOCUS = 0.3; // 案内中は画面の上 30% を空けて、現在地を下寄りに置く（先の道が見えるように）
const ZOOM_CLASSES = ["cb3-z-lo", "cb3-z-mid", "cb3-z-hi", "cb3-z-max"];
const NO_PAD = { top: 0, bottom: 0, left: 0, right: 0 }; // 案内中に下げた現在地の位置を、ほかの移動では戻す
// MapLibre は地形の陰に入ったマーカーを薄くする（建物のラベルはそのまま）。駅名・ピン・現在地は谷にあっても必ず見せる
const ALWAYS = { opacityWhenCovered: "1" };

// 2D のイラスト地図と同じ見え方の規則（Leaflet のズーム 16.5 / 17.6 / 19 = MapLibre の 15.5 / 16.6 / 18）
const CSS = `
.cb3-map.maplibregl-map{font:inherit}
.cb3-map .maplibregl-canvas{outline:none}
.cb3-haze{position:absolute;left:0;right:0;top:0;height:38%;pointer-events:none;opacity:0}
.cb3-lbl{white-space:nowrap;font-weight:800;letter-spacing:-.01em;line-height:1;color:var(--cb3-label);pointer-events:none;font-family:inherit;
  text-shadow:0 0 3px var(--cb3-halo),0 0 3px var(--cb3-halo),0 0 2px var(--cb3-halo),0 0 1px var(--cb3-halo)}
.cb3-lbl{transition:opacity .18s}.cb3-lbl.cb-off{opacity:0!important}
.cb3-lbl .cb-s{font-size:11px}.cb3-lbl .cb-f{font-size:12.5px}
.cb3-lbl.cb-un{color:var(--cb3-label-muted);font-weight:700}.cb3-lbl.cb-un .cb-f{font-size:10.5px}
.cb3-z-lo .cb3-lbl{display:none}
.cb3-z-mid .cb3-lbl .cb-f{display:none}
.cb3-z-hi .cb3-lbl .cb-s,.cb3-z-max .cb3-lbl .cb-s{display:none}
.cb3-z-mid .cb3-lbl.cb-sm,.cb3-z-hi .cb3-lbl.cb-sm,.cb3-z-mid .cb3-lbl.cb-un,.cb3-z-hi .cb3-lbl.cb-un{display:none}
.cb3-lbl.cb-hl{display:none!important}
.cb3-pin-name{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);white-space:nowrap;padding:5px 10px;border-radius:10px;background:var(--cb3-halo);color:var(--cb3-accent);
  font-size:14px;font-weight:800;line-height:1.2;box-shadow:0 4px 12px -4px rgba(0,0,0,.35);pointer-events:none;animation:navSlideUp .3s .3s ease-out both}
.cb3-sta{padding:4px 10px;border-radius:9px;background:var(--cb3-station-bg);color:var(--cb3-station);font-size:12px;font-weight:800;white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,.18);border:1px solid rgba(120,140,160,.35);pointer-events:none;font-family:inherit}
.cb3-z-lo .cb3-sta{font-size:10px;padding:2px 7px}
.cb3-gp{display:flex;flex-direction:column;align-items:center;cursor:pointer;animation:navPinPop .35s cubic-bezier(.34,1.56,.64,1) both}
.cb3-gp-lbl{background:var(--gp);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;font-family:inherit}
.cb3-gp-stem{width:2px;height:6px;background:#fff;opacity:.7}
.cb3-gp-dot{width:6px;height:6px;border-radius:50%;background:var(--gp);border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.cb3-z-lo .cb3-gp-lbl,.cb3-z-lo .cb3-gp-stem,.cb3-z-mid .cb3-gp-lbl,.cb3-z-mid .cb3-gp-stem{display:none}
.cb3-z-lo .cb3-gp-dot,.cb3-z-mid .cb3-gp-dot{width:14px;height:14px;border-width:2.5px;margin-bottom:-7px;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.cb3-zoom{position:absolute;right:10px;bottom:24px;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:0 6px 16px -6px rgba(0,0,0,.4);z-index:2}
.cb3-zoom button{width:40px;height:40px;border:none;background:var(--cb3-btn);color:var(--cb3-btn-tx);font-size:20px;line-height:40px;cursor:pointer;padding:0;font-family:inherit}
.cb3-zoom button+button{border-top:1px solid var(--cb3-btn-bd)}
.cb3-look{position:absolute;right:10px;bottom:112px;width:40px;height:40px;border:none;border-radius:14px;background:var(--cb3-btn);color:var(--cb3-btn-tx);
  box-shadow:0 6px 16px -6px rgba(0,0,0,.4);cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;padding:0}
.cb3-look-a{position:absolute;right:4px;bottom:3px;font-size:8px;font-weight:800;line-height:1;opacity:.7;font-family:inherit}
.cb3-look-toast{position:absolute;right:58px;bottom:118px;padding:6px 10px;border-radius:10px;background:var(--cb3-btn);color:var(--cb3-btn-tx);font-size:12px;font-weight:700;
  white-space:nowrap;box-shadow:0 6px 16px -6px rgba(0,0,0,.4);z-index:2;pointer-events:none;animation:navSlideUp .2s ease-out}
.cb3-attr{position:absolute;right:0;bottom:0;font-size:9.5px;line-height:1.4;padding:0 5px;border-radius:6px 0 0 0;background:var(--cb3-attr-bg);color:var(--cb3-attr);pointer-events:none;z-index:2}
.cb3-walk{position:absolute;right:10px;bottom:166px;width:40px;height:40px;border:none;border-radius:14px;background:var(--cb3-btn);color:var(--cb3-btn-tx);
  box-shadow:0 6px 16px -6px rgba(0,0,0,.4);cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;padding:0}
/* 歩いて見る：ラベル・ピン・上のもや・ズームなどのボタンは隠す（目の高さでは位置が合わない。空は MapLibre の sky） */
.cb3-walking .maplibregl-marker,.cb3-walking .cb3-haze,.cb3-walking .cb3-zoom,.cb3-walking .cb3-look,.cb3-walking .cb3-look-toast,.cb3-walking .cb3-walk{display:none!important}
.cb3-walking .cb3-map{cursor:pointer;touch-action:none}
.cb3-cross{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none;opacity:.85}
.cb3-cross:before,.cb3-cross:after{content:"";position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.cb3-cross:before{left:8px;top:0;width:2px;height:18px}
.cb3-cross:after{left:0;top:8px;width:18px;height:2px}
.cb3-walk-btns .cb3-jump{width:64px;height:64px;border-radius:50%;padding:0;font-size:12px;background:rgba(255,255,255,.88);color:#0e2030;touch-action:none}
.cb3-walk-ui{position:absolute;inset:0;pointer-events:none;z-index:3;font-family:inherit}
.cb3-walk-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);max-width:calc(100% - 32px);padding:8px 14px;border-radius:16px;background:rgba(14,32,48,.82);
  color:#fff;font-size:12.5px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 6px 16px -6px rgba(0,0,0,.5);animation:navSlideUp .2s ease-out;box-sizing:border-box}
.cb3-joy{position:absolute;left:22px;bottom:30px;width:116px;height:116px;border-radius:50%;background:rgba(14,32,48,.32);border:2px solid rgba(255,255,255,.55);
  box-shadow:0 6px 18px -8px rgba(0,0,0,.5);pointer-events:auto;touch-action:none;cursor:pointer}
.cb3-joy-knob{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(255,255,255,.92);
  box-shadow:0 3px 10px rgba(0,0,0,.35);pointer-events:none}
.cb3-walk-btns{position:absolute;right:12px;bottom:30px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:auto}
.cb3-walk-btns button{min-width:44px;height:42px;padding:0 16px;border:none;border-radius:21px;background:rgba(14,32,48,.82);color:#fff;font-size:13px;font-weight:800;
  font-family:inherit;cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.5);white-space:nowrap}
.cb3-walk-btns button.on{background:var(--cb3-accent);color:#fff}
.cb3-walk-btns .cb3-walk-exit{background:#fff;color:#0e2030}
/* 歩きはじめるところを選ぶ：地図は動かせる（タップしたところから歩く）。下にほかの選び方 */
.cb3-picking .maplibregl-canvas-container.maplibregl-interactive{cursor:crosshair}
.cb3-picking .cb3-zoom,.cb3-picking .cb3-look,.cb3-picking .cb3-look-toast{display:none!important}
.cb3-pick-btns{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;width:max-content;
  max-width:calc(100% - 32px);pointer-events:auto}
.cb3-pick-btns button{height:42px;padding:0 16px;border:none;border-radius:21px;background:rgba(14,32,48,.82);color:#fff;font-size:13px;font-weight:800;
  font-family:inherit;cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.5);white-space:nowrap}
.cb3-pick-btns .cb3-walk-exit{background:#fff;color:#0e2030}
`;

// 「歩いて見る」のボタンのアイコン（歩く人）。キャンパスナビのボタン（NavigationView）も使う
export const WALK_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="2" />
    <path d="M10.5 21l1.8-6.2 2.7 2.4V21" />
    <path d="M7 12.5l2.2-4.3 4.3-.7 2.3 3.6 2.7 1.3" />
    <path d="M12.3 14.8L11 7.6" />
  </svg>
);

// 見え方のボタンのアイコン（昼：太陽、夕方：沈む太陽、夜：月）。キャンパスナビのボタン（NavigationView）も使う
export const LOOK_ICON = {
  day: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return <line key={a} x1={12 + Math.cos(r) * 7.2} y1={12 + Math.sin(r) * 7.2} x2={12 + Math.cos(r) * 9.6} y2={12 + Math.sin(r) * 9.6} />; })}</svg>,
  evening: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 16a5.5 5.5 0 0 1 11 0" /><line x1="3" y1="16" x2="21" y2="16" /><line x1="7" y1="19.5" x2="17" y2="19.5" />{[200, 245, 295, 340].map((a) => { const r = (a * Math.PI) / 180; return <line key={a} x1={12 + Math.cos(r) * 8} y1={16 + Math.sin(r) * 8} x2={12 + Math.cos(r) * 10.2} y2={16 + Math.sin(r) * 10.2} />; })}</svg>,
  night: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
};
export const LOOK_LABEL = { auto: "navi.lookAuto", day: "navi.lookDay", evening: "navi.lookEvening", night: "navi.lookNight" };
// 空（傾けたときの画面の上のもや）：上は空の色、地平線のあたりは地平線の色
const hazeBackground = (look) => `linear-gradient(to bottom, ${look.sky.top} 0%, ${look.sky.horizon}cc 34%, ${look.sky.horizon}00 100%)`;
// 歩いて見るときの空（MapLibre の sky。目の高さでは画面の上半分が空になる）：時刻の見え方の空の色。
// 遠くの地面は背景の色へ溶かす（データの端が見えないように）
const skyOf = (look) => ({
  "sky-color": look.sky.top,
  "horizon-color": look.sky.horizon,
  "fog-color": look.pal.outside,
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.55,
  "atmosphere-blend": 0,
});
// 歩くのに使うキー（押しているあいだ動く）
const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyC", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "ShiftLeft", "ShiftRight"]);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const gpsHtml = () => `<div style="position:relative;width:14px;height:14px">
  <div class="gps3-arrow" style="display:none;position:absolute;top:-18px;left:50%;transform-origin:center 25px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid ${ROUTE_COL};filter:drop-shadow(0 0 3px rgba(26,142,240,.6));z-index:2"></div>
  <div style="position:absolute;inset:-12px;border-radius:50%;background:rgba(26,142,240,.25);animation:navHalo 2s ease-out infinite"></div>
  <div style="position:relative;width:14px;height:14px;border-radius:50%;background:${ROUTE_COL};border:3px solid #fff;box-shadow:0 1px 6px rgba(26,142,240,.55);box-sizing:border-box"></div>
  <div class="nav-here">${esc(t("navi.currentLocation"))}</div>
</div>`;
const ORIGIN_HTML = `<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #ccc;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;box-sizing:border-box"><div style="width:6px;height:6px;border-radius:50%;background:#aaa"></div></div>`;
// グループ（ベンチなど）のピン。2D と同じく、引いているときは点だけ、寄ったら名前の吹き出しを出す
const groupPinHtml = (label, col) => `<div class="cb3-gp" style="--gp:${col}"><div class="cb3-gp-lbl">${esc(label)}</div><div class="cb3-gp-stem"></div><div class="cb3-gp-dot"></div></div>`;

// ルートの透けて見える点（2倍解像度で直径 6px）
const routeDotImage = () => {
  const s = 12;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  g.fillStyle = ROUTE_COL;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 0.5, 0, Math.PI * 2);
  g.fill();
  return g.getImageData(0, 0, s, s);
};

const el = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
};
// マーカーは外側の箱で包む。MapLibre は渡した要素を position:absolute で置くので、
// 中身（.nav-pin などの position:relative）とぶつかると、ほかのマーカーが押し下げられてずれる
const holder = (node) => {
  const d = document.createElement("div");
  d.appendChild(node);
  return d;
};

// 点の集まりが余白を除いた画面に収まるカメラ。cameraForBounds は傾きを考えないので、
// 傾けた状態で実際に投影し、はみ出し・偏りを見ながら中心とズームを数回詰める
function fitCamera(ml, map, pts, pad, pitch, bearing, maxZoom) {
  const b = new ml.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  const cam = map.cameraForBounds(b, { padding: pad, bearing, maxZoom });
  if (!cam) return null;
  let center = ml.LngLat.convert(cam.center);
  let zoom = cam.zoom;
  try {
    const tr = map.transform.clone();
    tr.setPadding?.({ top: 0, bottom: 0, left: 0, right: 0 });
    const W = tr.width;
    const H = tr.height;
    const box = { l: pad.left, r: W - pad.right, t: pad.top, b: H - pad.bottom };
    if (box.r - box.l > 40 && box.b - box.t > 40) {
      tr.setPitch(pitch);
      tr.setBearing(bearing);
      const lls = pts.map((p) => new ml.LngLat(p.lng, p.lat));
      for (let k = 0; k < 4; k++) {
        tr.setZoom(zoom);
        tr.setCenter(center);
        // データの外が見えないよう止められたら、止まった位置から測り直す
        zoom = tr.zoom;
        center = new ml.LngLat(tr.center.lng, tr.center.lat);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        lls.forEach((ll) => {
          const s = tr.locationToScreenPoint(ll, map.terrain || undefined); // 地形の高さも入れて投影する
          x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
        });
        const shift = new ml.Point(W / 2 + (x0 + x1) / 2 - (box.l + box.r) / 2, H / 2 + (y0 + y1) / 2 - (box.t + box.b) / 2);
        center = tr.screenPointToLocation(shift, map.terrain || undefined);
        const s = Math.min((box.r - box.l) / Math.max(1, x1 - x0), (box.b - box.t) / Math.max(1, y1 - y0));
        zoom = Math.min(maxZoom, zoom + Math.log2(s));
      }
    }
  } catch {
    /* 内部の投影が使えないときは、傾けない前提の値で寄る */
  }
  return { center, zoom, bearing, pitch };
}

/**
 * props:
 *   data, dark, accent             地図データ（BASEMAP）と配色（変わったら親が key を変えて作り直す）
 *   trains                         電車を走らせる（目黒線・大井町線、時刻表どおり。作るときだけ見る）
 *   initialView                    { lat, lng, zoom(Leaflet 基準), bearing(MapLibre 基準: 画面の上の方位) }
 *   spots                          NAV_SPOTS（建物の無いスポットは点で描く）
 *   origin, dest                   出発地 { lat, lng } / 目的地スポット
 *   route, split                   ルートの座標 [{lat,lng}] / 案内中の進み具合 { idx, t }
 *   gps, guiding, follow, northUp  現在地 { lat, lng, accuracy } と案内の状態
 *   group                          { prefix, col }（ベンチなどのグループ表示中）
 *   fitPad                         ルート全体などを見せるときの余白 { top, bottom, left, right }（上下のカードの分）
 *   features                       手で足した構造物（campus3dFeatures.js。坂があるかどうかは作るときに決まる）
 *   editable, selectedFeatureId    エディタ用：いつでも坂を焼き込める標高タイルにする / 選んでいる構造物を色で示す
 *   lookKey, defaultLook           見え方（時刻に合わせる・昼・夕方・夜。campus3dSky.js）を覚えておく localStorage のキーと、はじめの見え方
 *   lookMode, onLookPhase(phase)   見え方を親が決めるとき（このときは地図の上にボタンを出さない）と、いまの昼・夕方・夜を知らせる
 *   walkButton                     地図の上に「歩いて見る」のボタンを出す（エディタ。キャンパスナビは ref の startWalk() を呼ぶ）
 *   onSpotTap(id), onGroupTap(id), onMapClick(), onUserMove(), onRotate(bearing), onLoad(), onError(err)
 */
export const CampusMap3D = forwardRef(function CampusMap3D(props, ref) {
  const { data, dark, accent, initialView, lookKey = "cb3Look", defaultLook = "auto" } = props;
  // 見え方：auto（時刻に合わせる）・day・evening・night。ボタンで切りかえて覚えておく
  const [lookMode, setLookMode] = useState(() => {
    try {
      const v = localStorage.getItem(lookKey);
      if (LOOK_MODES.includes(v)) return v;
    } catch {
      /* 読めなければはじめの見え方 */
    }
    return LOOK_MODES.includes(defaultLook) ? defaultLook : "auto";
  });
  const controlled = LOOK_MODES.includes(props.lookMode);
  const mode = controlled ? props.lookMode : lookMode;
  const lookModeRef = useRef(mode);
  lookModeRef.current = mode;
  const lookRef = useRef(null); // いまの見え方（lookFor の結果）
  const [lookPhase, setLookPhase] = useState("day"); // ボタンのアイコン
  const [lookToast, setLookToast] = useState(null);
  const lookToastTimer = useRef(0);
  const hazeRef = useRef(null);
  const trainsLayerRef = useRef(null);
  const lightsRef = useRef(null); // 夜の街灯の柱・灯具を描くレイヤー（campus3dLayer.js）
  const lampsRef = useRef(null); // いまの街灯（campus3dLamps.js の streetLamps）
  const lampKeyRef = useRef(null); // 街灯を置いたときの構造物（変わっていなければ置き直さない）
  // 歩いて見る（campus3dWalk.js）：歩いているあいだの状態（位置・向き・入力・戻すときの設定）。null なら歩いていない
  const walkRef = useRef(null);
  const [walking, setWalking] = useState(false);
  const [walkUi, setWalkUi] = useState({ run: false, auto: false, route: false, done: false, hint: false, locked: false, touch: false });
  const joyKnobRef = useRef(null);
  // 歩きはじめるところを選んでいるあいだ：{ world }（null なら選んでいない）と、出すボタン { route, gps }
  const pickRef = useRef(null);
  const [picking, setPicking] = useState(null);
  const cutRef = useRef(null); // 通り抜けで分けた建物（歩くときのぶつかり）
  const replacedRef = useRef(null); // 手で置きかえた地図の建物
  const lampLightRef = useRef({ canvas: null, lamps: null, timer: 0 }); // 道に落ちる光の輪の画像（作ったときの街灯）
  const paintRef = useRef(null); // 道路・路面の塗りを作り直す関数（見え方が変わったら色を変える）
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const builtRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [loaded, setLoaded] = useState(false);
  const mk = useRef({ labels: [], stations: [], gps: null, pin: null }); // MapLibre の Marker
  const headRef = useRef({ follow: null, arrow: null }); // 追従で上にする方位 / 現在地の矢印の向き
  const riseRef = useRef(0); // 建物の高さの倍率（立ち上がりのアニメーション）
  const followRaf = useRef(0);
  const gestRef = useRef(false); // 指・マウスで動かしている最中（このあいだは追従で動かさない）
  const zoomTgtRef = useRef(null); // 追従しながら寄せたいズーム
  const gpsAnim = useRef({ raf: 0, at: null });
  const hlRef = useRef(null);
  const fitRef = useRef({ route: null, dest: null, group: null });
  const wasGuiding = useRef(false);
  const coverRef = useRef(14); // いちばん引いたズーム（データがちょうど画面いっぱい）
  const blockedRef = useRef(false); // 追従の中心が、データの端で止められている
  const extrasRef = useRef(null); // 手で足した構造物を描くレイヤー（campus3dLayer.js）
  const bridgesRef = useRef([]); // prepareBridge 済みの橋
  const meshRef = useRef(null); // 構造物の三角形を作り直す関数（目的地が変わったら、置きかえた建物の色を変える）
  const bldHitRef = useRef([]); // 置きかえた建物の形とスポット [{ ring: xy, spot }]（タップで選ぶ）
  const onBridgeRef = useRef([]); // ルートのうち橋の上を通る部分 [[lng, lat, 床の標高]...]
  const gpsLiftRef = useRef(0); // 現在地が橋の上なら、地面からの高さ(m)
  const applyRef = useRef(0); // 構造物の反映の番号（新しい反映が始まったら古いものは捨てる）
  const [bridgeTick, setBridgeTick] = useState(0); // 橋が変わったら増やす（ルートを分け直す）

  // ── 地図を作る（1回だけ）。手で足した坂があれば、先に坂のまわりの標高を読んで焼き込んでおく（あとから地形が切り替わらないように）──
  useEffect(() => {
    const slopes = (propsRef.current.features || []).filter(burnsGround);
    let cleanup = null;
    let cancelled = false;
    const start = () => {
      if (!cancelled) cleanup = createMap();
    };
    if (slopes.length) {
      dem.ensure(featuresBounds(slopes)).then(() => {
        dem.setBurns(slopes);
        start();
      });
    } else {
      dem.setBurns([]);
      start();
    }
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function createMap() {
    const ml = window.maplibregl;
    const box = boxRef.current;
    const wrap = wrapRef.current;
    if (!ml || !box || !wrap) return undefined;
    // 坂を焼き込む標高タイルは、エディタか、坂・階段があるときだけ（ふだんは元のタイルをそのまま使う）
    const burn = !!propsRef.current.editable || (propsRef.current.features || []).some(burnsGround);
    if (burn) registerDemProtocol(ml);
    // いまの見え方（時刻・昼・夕方・夜）の色と光で作る（できてから切りかえると一瞬ちらつくので）
    const look = lookFor(lookModeRef.current, { dark });
    lookRef.current = look;
    const built = buildCampus3D(data, { dark, accent, dem: burn ? { tiles: [demTileUrl()], maxzoom: BURN_MAXZOOM } : STATIC_DEM, look });
    built.burn = burn;
    builtRef.current = built;
    const vars = {
      "--cb3-label": built.pal.label, "--cb3-label-muted": built.pal.labelMuted, "--cb3-halo": built.pal.halo, "--cb3-accent": accent,
      "--cb3-station": built.pal.station, "--cb3-station-bg": built.pal.stationBg,
      "--cb3-btn": T.bg2, "--cb3-btn-tx": T.txH, "--cb3-btn-bd": T.bd, "--cb3-attr": T.txD, "--cb3-attr-bg": `${T.bg2}cc`,
    };
    Object.entries(vars).forEach(([k, v]) => wrap.style.setProperty(k, v));
    wrap.style.background = built.pal.outside;

    const R = regionOf(data);
    // 画面がデータの外に出ないようにする制限。歩いて見るあいだは目の位置で決めるので、ズームの範囲だけ
    const limit = makeConstrain(R, ml.LngLat);
    const constrain = function constrain(lngLat, zoom) {
      if (walkRef.current) return { center: lngLat, zoom: Math.min(this.maxZoom, Math.max(this.minZoom, zoom)) };
      return limit.call(this, lngLat, zoom);
    };
    let map;
    try {
      map = new ml.Map({
        container: box,
        style: built.style,
        center: [initialView.lng, initialView.lat],
        zoom: initialView.zoom + ML_ZOOM_OFFSET,
        bearing: initialView.bearing || 0,
        pitch: 0,
        minZoom: 12,
        maxZoom: 20,
        maxPitch: 70,
        // 画面が地図データの外（何も描いていないところ）に出ないよう、回転・傾き・余白も考えて止める
        transformConstrain: constrain,
        attributionControl: false,
        fadeDuration: 0,
      });
    } catch (err) {
      console.warn("[3D map] init failed:", err?.message || err);
      propsRef.current.onError?.(err);
      return undefined;
    }
    mapRef.current = map;
    map.on("error", (ev) => console.warn("[3D map]", ev?.error?.message || ev));
    map.on("styleimagemissing", (ev) => {
      if (ev.id === ROUTE_DOT && !map.hasImage(ROUTE_DOT)) map.addImage(ROUTE_DOT, routeDotImage(), { pixelRatio: 2 });
    });

    // いちばん引いたところ＝データがちょうど画面いっぱい（回していないとき）。画面の大きさが変わったら測り直す
    const fitMinZoom = () => {
      coverRef.current = coverZoom(R, box.clientWidth || 1, box.clientHeight || 1);
      map.setMinZoom(Math.min(19, coverRef.current));
    };
    fitMinZoom();
    // 地図のイベントの中でカメラを動かすと、MapLibre のアニメーションが入れ子になって壊れる
    // （"_onEaseFrame is not a function" など）。カメラを動かす処理は、イベントを抜けてから行う
    let resizeRaf = 0;
    map.on("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(fitMinZoom);
    });

    // 傾けたときは、画面の上のほう（遠く）を背景色のもやで薄める。地図の上・マーカーの下に重ねる
    const haze = document.createElement("div");
    haze.className = "cb3-haze";
    haze.style.background = hazeBackground(look);
    hazeRef.current = haze;
    map.getCanvas().after(haze);
    const updateHaze = () => { haze.style.opacity = String(Math.min(1, Math.max(0, (map.getPitch() - 22) / 26))); };
    map.on("pitch", updateHaze);
    updateHaze();

    // 動き終わったら：引いているのに傾きすぎていれば平らに戻し、回したあとなどで外が見えていれば内側へ戻す。
    // moveend は次の動きが前の動きを止めたときにも出るので、その場では動かさず、落ち着いてから確かめる
    let settleTimer = 0;
    const settle = () => {
      settleTimer = 0;
      const p = propsRef.current;
      if (walkRef.current) return; // 歩いて見るあいだはカメラを目の位置で決める
      if (mapRef.current !== map || map.isMoving() || map.isEasing()) return; // まだ動いている（終わればまた呼ばれる）
      if (p.guiding && p.follow) return; // 案内中の追従は自分でカメラを決める
      const c = map.getCenter();
      const z = map.getZoom();
      const r = constrain.call(map.transform, c, z);
      const outside = Math.hypot((r.center.lng - c.lng) * R.kx, (r.center.lat - c.lat) * R.ky) > 0.5 || r.zoom - z > 0.01;
      const cap = maxPitchAt(r.zoom, coverRef.current);
      if (outside || map.getPitch() > cap + 0.5) map.easeTo({ center: r.center, zoom: r.zoom, pitch: Math.min(map.getPitch(), cap), duration: 350 });
    };
    map.on("moveend", () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 0);
    });

    // ラベル（建物の屋上に置く）と駅名
    built.labels.forEach((l) => {
      const cls = ["cb3-lbl", l.mapped ? "" : "cb-un", l.small ? "cb-sm" : ""].filter(Boolean).join(" ");
      const node = el(`<div class="${cls}">${l.short ? `<span class="cb-s">${esc(l.short)}</span>` : ""}<span class="cb-f">${esc(l.full)}</span></div>`);
      const m = new ml.Marker({ element: holder(node), anchor: "center" }).setLngLat(l.lngLat).addTo(map);
      mk.current.labels.push({ m, node, l });
    });
    built.stations.forEach((st) => {
      const node = el(`<div class="cb3-sta">${esc(st.name)}</div>`);
      mk.current.stations.push({ m: new ml.Marker({ ...ALWAYS, element: holder(node), anchor: "center" }).setLngLat(st.lngLat).addTo(map), node });
    });

    // ズームに合わせた表示の切り替えと、ラベルを屋上の高さへ持ち上げる量
    const last = { cls: "", z: -1, p: -1, k: -1 };
    let raf = 0;
    const layout = () => {
      raf = 0;
      if (walkRef.current) return; // 歩いて見るあいだはラベルを地図から外している（やめたら relayout）
      const z = map.getZoom();
      const pitch = map.getPitch();
      const k = riseRef.current;
      const cls = z < 15.5 ? ZOOM_CLASSES[0] : z < 16.6 ? ZOOM_CLASSES[1] : z < 18 ? ZOOM_CLASSES[2] : ZOOM_CLASSES[3];
      if (cls !== last.cls) {
        wrap.classList.remove(...ZOOM_CLASSES);
        wrap.classList.add(cls);
        last.cls = cls;
        sizes.clear();
      }
      if (Math.abs(z - last.z) < 0.02 && Math.abs(pitch - last.p) < 0.3 && k === last.k) return;
      Object.assign(last, { z, p: pitch, k });
      const perM = (2 ** z / MPP0) * Math.sin((pitch * Math.PI) / 180); // 高さ 1m が画面で何 px 上か
      const f = k * perM;
      mk.current.labels.forEach(({ m, l }) => m.setOffset([0, -l.h * f - 6]));
      if (mk.current.pin) mk.current.pin.m.setOffset([0, 2 - mk.current.pin.h * f]);
      // 橋の上を歩いているときは、現在地を床の高さへ持ち上げる
      mk.current.gps?.setOffset([0, -gpsLiftRef.current * perM]);
      scheduleDeclutter();
    };
    const scheduleLayout = (force) => {
      if (force === true) last.z = -1;
      if (!raf) raf = requestAnimationFrame(layout);
    };

    // ラベルの重なりを間引く。スポットのある建物 → 画面の手前（下）の順に残す。駅名と目的地のピン（名前つき）は必ず出す
    const sizes = new Map(); // ラベルの大きさ（ズームの段階や強調が変わったら測り直す）
    let lastDeclutter = 0;
    let declutterTimer = 0;
    const shownAt = (l) => last.cls === ZOOM_CLASSES[3] || (last.cls !== ZOOM_CLASSES[0] && l.mapped && !l.small);
    const declutter = () => {
      declutterTimer = 0;
      if (walkRef.current) return;
      lastDeclutter = performance.now();
      const W = box.clientWidth;
      const H = box.clientHeight;
      const placed = [];
      const free = (r) => !placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
      const rectOf = (node, x, y) => {
        let sz = sizes.get(node);
        if (!sz) { sz = [node.offsetWidth, node.offsetHeight]; sizes.set(node, sz); }
        return [x - sz[0] / 2 - 2, y - sz[1] / 2 - 1, x + sz[0] / 2 + 2, y + sz[1] / 2 + 1];
      };
      mk.current.stations.forEach(({ m, node }) => { const p = map.project(m.getLngLat()); placed.push(rectOf(node, p.x, p.y)); });
      const pin = mk.current.pin;
      if (pin) {
        const p = map.project(pin.m.getLngLat());
        const o = pin.m.getOffset();
        if (!pin.nameW) pin.nameW = pin.name?.offsetWidth || 0;
        const hw = Math.max(18, pin.nameW / 2 + 2);
        placed.push([p.x - hw, p.y + o.y - 46 - (pin.nameW ? 34 : 0), p.x + hw, p.y + o.y]);
      }
      const items = [];
      mk.current.labels.forEach((it) => {
        if (!shownAt(it.l) || it.node.classList.contains("cb-hl")) return;
        const p = map.project(it.m.getLngLat());
        const o = it.m.getOffset();
        items.push({ it, x: p.x + o.x, y: p.y + o.y });
      });
      items.sort((a, b) => (b.it.l.mapped - a.it.l.mapped) || (b.y - a.y));
      const keep = new Set();
      items.forEach(({ it, x, y }) => {
        if (x < -80 || x > W + 80 || y < -30 || y > H + 30) return;
        const r = rectOf(it.node, x, y);
        if (free(r)) { placed.push(r); keep.add(it); }
      });
      mk.current.labels.forEach((it) => it.node.classList.toggle("cb-off", !keep.has(it)));
    };
    function scheduleDeclutter() {
      if (declutterTimer) return;
      declutterTimer = setTimeout(() => requestAnimationFrame(declutter), Math.max(0, 160 - (performance.now() - lastDeclutter)));
    }
    mk.current.relabel = () => { sizes.clear(); scheduleLayout(true); };
    mk.current.relayout = () => scheduleLayout(true);
    map.on("zoom", scheduleLayout);
    map.on("pitch", scheduleLayout);
    map.on("move", scheduleDeclutter);
    map.on("moveend", () => {
      clearTimeout(declutterTimer);
      declutterTimer = 0;
      requestAnimationFrame(declutter);
    });
    layout();

    const startTrains = async () => {
      try {
        const res = await fetch(TRAINS_URL);
        if (!res.ok) return;
        const prep = prepareTrains(await res.json());
        const [w, s, e, n] = trackBounds(prep);
        const tb = TERRAIN.bounds; // 標高タイルのある範囲だけ読む（外はいちばん近い高さ）
        await dem.ensure([Math.max(w, tb[0]), Math.max(s, tb[1]), Math.min(e, tb[2]), Math.min(n, tb[3])]);
        if (mapRef.current !== map) return;
        setTrackHeights(prep, (ll) => dem.groundAt(ll));
        const frame = (view) => {
          const ts = trainsAt(prep, serviceClock());
          return { ...trainMesh(prep, ts, lookRef.current?.lamp || 0, { ...view, reuse: true }), count: ts.length }; // 夜は窓あかり・前照灯の光
        };
        const layer = createTrainsLayer({ light: lookRef.current.light, exaggeration: TERRAIN_EXAG, frame });
        map.addLayer(layer, "nav-route-passed");
        trainsLayerRef.current = layer;
      } catch (err) {
        console.warn("[3D map] trains:", err?.message || err);
      }
    };

    // 地面から建物が立ち上がり、地図が傾く
    map.on("load", () => {
      // 手で足した構造物（壁・橋など）と橋の上のルートは、建物のすぐあと（ルートの線より前）に描く
      try {
        const extras = createExtrasLayer({
          light: lookRef.current.light,
          route: { width: routeWidth, casing: routeCasing, color: rgbaOf(ROUTE_COL), casingColor: [1, 1, 1, 1] },
          exaggeration: TERRAIN_EXAG,
        });
        map.addLayer(extras, "nav-route-passed");
        extrasRef.current = extras;
      } catch (err) {
        console.warn("[3D map] extras layer:", err?.message || err);
      }
      // 夜の街灯の柱・灯具（置き場所は構造物を反映するときに決める。手で描いた道路・建物などをよけるので）
      try {
        const lights = createLightsLayer({ light: lookRef.current.light, exaggeration: TERRAIN_EXAG });
        map.addLayer(lights, "nav-route-passed");
        lights.setGlow(lookRef.current.lamp);
        lightsRef.current = lights;
      } catch (err) {
        console.warn("[3D map] lights layer:", err?.message || err);
      }
      // 電車（目黒線・大井町線）を時刻表どおりに走らせる（campus3dTrains.js）。線路の標高を読んでから足す
      if (propsRef.current.trains) startTrains();
      // 平地・坂道・階段の垂直な段差は壁の中に隠すが、地形が粗いと段差がぎざぎざに壁の外へはみ出す。焼き込むときだけ細かくする：
      // ・網目：既定はタイルを 128 分割（ズーム18で約1m）→ 192（頂点の番号が 16bit なので 250 くらいまで）
      // ・標高：既定は描くタイルより1段粗いズームの標高（deltaZoom 1）→ 同じズーム（0）
      // どちらも MapLibre の内部の値。無ければ何もしない
      const tr = map.terrain;
      if (built.burn && tr && typeof tr.meshSize === "number") {
        try {
          tr.meshSize = 192;
          Object.values(tr._meshCache || {}).forEach((m) => m.destroy?.());
          tr._meshCache = {};
          if (tr.tileManager && tr.tileManager.deltaZoom === 1) {
            tr.tileManager.deltaZoom = 0;
            tr.tileManager._sourceTileCache = {};
          }
        } catch (err) {
          console.warn("[3D map] terrain detail:", err?.message || err);
        }
      }
      setLoaded(true);
      propsRef.current.onRotate?.(map.getBearing());
      propsRef.current.onLoad?.();
      const t0 = performance.now();
      const step = (now) => {
        if (mapRef.current !== map) return;
        const k = Math.min(1, (now - t0) / 950);
        riseRef.current = 1 - (1 - k) ** 3;
        map.setPaintProperty("cb-buildings", "fill-extrusion-height", ["*", ["get", "h"], riseRef.current]);
        map.setPaintProperty("cb-buildings", "fill-extrusion-base", ["*", ["coalesce", ["get", "b"], 0], riseRef.current]);
        scheduleLayout();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      if (!propsRef.current.guiding) map.easeTo({ pitch: Math.min(PITCH, maxPitchAt(map.getZoom(), coverRef.current)), duration: 950 });
    });

    // タップ：建物の無いスポット（点）→ 建物 → 何もないところ
    map.on("click", (ev) => {
      const p = propsRef.current;
      if (pickRef.current) {
        pickStart("tap", ev); // 歩きはじめるところ
        return;
      }
      if (walkRef.current) return; // 歩いて見るあいだのタップは見回すため
      p.onMapClick?.();
      const { x, y } = ev.point;
      const dots = map.getLayer("nav-spots") ? map.queryRenderedFeatures([[x - 12, y - 12], [x + 12, y + 12]], { layers: ["nav-spots"] }) : [];
      if (dots.length) {
        const near = dots
          .map((d) => ({ d, k: map.project(d.geometry.coordinates) }))
          .sort((a, b) => Math.hypot(a.k.x - x, a.k.y - y) - Math.hypot(b.k.x - x, b.k.y - y))[0];
        p.onSpotTap?.(near.d.properties.id);
        return;
      }
      const bld = map.queryRenderedFeatures(ev.point, { layers: ["cb-buildings"] }).find((h) => h.properties.s);
      if (bld) p.onSpotTap?.(bld.properties.s);
      else {
        const own = bldSpotAt(ev.lngLat);
        if (own) p.onSpotTap?.(own);
      }
    });
    // 手で置きかえた建物（3Dレイヤーで描く）のスポット：タップした地面の点がその形の中なら
    const bldSpotAt = (ll) => {
      const [x, y] = toXY([ll.lng, ll.lat]);
      return bldHitRef.current.find((b) => pointInRing(x, y, b.ring))?.spot || null;
    };
    map.on("mousemove", (ev) => {
      const hit = map.queryRenderedFeatures(ev.point, { layers: ["nav-spots", "cb-buildings"] }).some((h) => h.layer.id === "nav-spots" || h.properties.s) || !!bldSpotAt(ev.lngLat);
      map.getCanvas().style.cursor = hit ? "pointer" : "";
    });
    // 1本指（マウス）で動かしたら、案内中の追従をやめる。2本指の拡大・回転では追従を続け、指を離したら戻る
    map.on("dragstart", (ev) => {
      const oe = ev.originalEvent;
      if (oe && !(oe.touches && oe.touches.length > 1)) propsRef.current.onUserMove?.();
    });
    map.on("movestart", (ev) => { if (ev.originalEvent) gestRef.current = true; });
    map.on("moveend", () => {
      if (!gestRef.current) return;
      gestRef.current = false;
      kickFollow();
    });
    map.on("rotate", () => {
      if (walkRef.current) return; // 歩いて見るあいだは毎フレーム回るので、方位磁針などは動かさない
      propsRef.current.onRotate?.(map.getBearing());
      updateArrow();
    });

    return () => {
      cancelAnimationFrame(walkRef.current?.raf);
      walkRef.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(declutterTimer);
      clearTimeout(settleTimer);
      cancelAnimationFrame(followRaf.current);
      cancelAnimationFrame(gpsAnim.current.raf);
      followRaf.current = 0;
      applyRef.current++;
      map.remove();
      mapRef.current = null;
      extrasRef.current = null;
      mk.current = { labels: [], stations: [], gps: null, pin: null };
    };
  }

  // 現在地の矢印（向いている方向）は、地図の回転を引いて画面上の向きにする
  function updateArrow() {
    const map = mapRef.current;
    const arrow = mk.current.gps?.getElement()?.querySelector(".gps3-arrow");
    if (!map || !arrow) return;
    const h = headRef.current.arrow;
    if (h == null) {
      arrow.style.display = "none";
      return;
    }
    arrow.style.display = "block";
    arrow.style.transform = `translateX(-50%) rotate(${h - map.getBearing()}deg)`;
  }

  // ── 案内中の追従：現在地を画面の下寄りに、進む方向を上にして、毎フレーム少しずつ寄せる ──
  function followTick() {
    followRaf.current = 0;
    const map = mapRef.current;
    const p = propsRef.current;
    if (!map || !p.guiding || !p.follow || !p.gps || gestRef.current || walkRef.current || pickRef.current) return; // 歩きはじめるところを選ぶあいだも止める
    const c = map.getCenter();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    const zoom = map.getZoom();
    const padTop = map.getPadding().top || 0;
    const dB = angDiff(p.northUp ? 0 : headRef.current.follow ?? bearing, bearing);
    const dLng = p.gps.lng - c.lng;
    const dLat = p.gps.lat - c.lat;
    const dP = PITCH_GUIDE - pitch;
    const dZ = zoomTgtRef.current != null ? zoomTgtRef.current - zoom : 0;
    const dPad = map.getContainer().clientHeight * GUIDE_FOCUS - padTop;
    const centerNear = Math.abs(dLng) < 2e-7 && Math.abs(dLat) < 2e-7;
    if (Math.abs(dB) < 0.3 && Math.abs(dP) < 0.2 && Math.abs(dZ) < 0.01 && Math.abs(dPad) < 1 && (centerNear || blockedRef.current)) {
      zoomTgtRef.current = null;
      return;
    }
    map.jumpTo({
      center: [c.lng + dLng * 0.16, c.lat + dLat * 0.16],
      bearing: bearing + dB * 0.14,
      pitch: pitch + dP * 0.12,
      zoom: zoom + dZ * 0.15,
      padding: { top: padTop + dPad * 0.15, bottom: 0, left: 0, right: 0 },
    });
    // データの端の近くでは、画面が外に出ないよう中心が止められる。動かなくなったら、そこで待つのをやめる
    const after = map.getCenter();
    blockedRef.current = !centerNear && Math.abs(after.lng - c.lng) < 1e-9 && Math.abs(after.lat - c.lat) < 1e-9;
    followRaf.current = requestAnimationFrame(followTick);
  }
  function kickFollow() {
    if (!followRaf.current) followRaf.current = requestAnimationFrame(followTick);
  }

  useImperativeHandle(ref, () => ({
    // 2D に戻すときの視点（Leaflet 基準のズーム、MapLibre 基準の方位）
    getView() {
      const map = mapRef.current;
      if (!map) return null;
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng, zoom: map.getZoom() - ML_ZOOM_OFFSET, bearing: map.getBearing() };
    },
    getBearing: () => mapRef.current?.getBearing() || 0,
    // 現在地ボタン（zoom は Leaflet 基準）
    flyTo(lat, lng, zoom) {
      const map = mapRef.current;
      if (map && !walkRef.current) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom + ML_ZOOM_OFFSET), padding: NO_PAD, duration: 600 });
    },
    resetNorth() { if (!walkRef.current) mapRef.current?.easeTo({ bearing: 0, duration: 500 }); },
    // 目の高さで歩いて見る（はじめる・やめる）
    startWalk: () => startWalk(),
    stopWalk: () => (pickRef.current ? cancelPick() : stopWalk()),
    isWalking: () => !!walkRef.current || !!pickRef.current, // 選んでいるあいだも（地図のタップは歩きはじめるところ）
    // 案内中に上にする方位（null なら今の向きのまま）と、現在地の矢印の向き（null なら出さない）
    setHeading(follow, arrow) {
      headRef.current = { follow, arrow };
      updateArrow();
      kickFollow();
    },
    // エディタ用：地図そのものと、坂を入れた地面の標高
    getMap: () => mapRef.current,
    groundAt: (ll) => dem.groundAt(ll),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const { dest, origin, route, split, gps, guiding, follow, northUp, group, spots, fitPad } = props;
  const features = props.features || NO_FEATURES;
  const selectedFeatureId = props.selectedFeatureId || null;

  // ── 手で足した構造物を地図に反映する：坂・階段（標高タイル）→ 橋・階段の上の道路・線路を地面から外す → 建物に通り抜けの穴 → 壁・橋・階段の形 ──
  useEffect(() => {
    const map = mapRef.current;
    const built = builtRef.current;
    if (!loaded || !map || !built) return;
    const token = ++applyRef.current;
    const live = () => token === applyRef.current && mapRef.current === map;
    // 道路・路面・白線・横断歩道は地面に貼るだけなので、標高を待たずに出す（道路の交差点の計算には polygon-clipping を読む）
    const showPaint = (pc) => {
      const paint = paintFeatures(features, lookRef.current || dark, pc);
      map.getSource("cbPaveSurf")?.setData(paint.surfaces);
      map.getSource("cbPaveMark")?.setData(paint.paint);
      map.getSource("cbPaveFine")?.setData(paint.fine);
    };
    if (features.some((f) => f.type === "road")) {
      loadClipper().then((pc) => {
        if (!live()) return;
        paintRef.current = () => showPaint(pc);
        showPaint(pc);
      });
    } else {
      paintRef.current = () => showPaint(null);
      showPaint(null);
    }
    (async () => {
      await dem.ensure(featuresBounds(features.filter((f) => !isPaint(f.type)))); // 地面に貼る塗りは標高がいらない
      if (!live()) return;
      const slopes = features.filter(burnsGround);
      if (dem.setBurns(built.burn ? slopes : [])) {
        const url = demTileUrl();
        map.getSource("cbDem")?.setTiles([url]); // 陰影（cbDemShade）は元の地面のまま
      }
      const ground = (ll) => dem.groundAt(ll);
      const bridges = features.filter((f) => f.type === "bridge").map((f) => prepareBridge(f, ground)).filter(Boolean);
      // 線路の橋は線路だけ、道の橋は道だけを持ち上げる（並んで通る別の線を消さないように）
      const railBr = bridges.filter((b) => b.f.surface === "rail");
      // 階段の上を通る道・ルートも、段の上に描く
      const roadBr = [...bridges.filter((b) => b.f.surface !== "rail"), ...dem.slopes.filter((sl) => sl.f.type === "stairs").map(stairsPath)];
      const byKind = new Map();
      built.streets.forEach(({ k, pts }) => byKind.set(k, [...(byKind.get(k) || []), pts]));
      const streets = [];
      // 経路の網の線（通路）はルートと同じく、少しずれていても橋の上とみなす
      byKind.forEach((lines, k) => splitByBridges(lines, roadBr, k === "walk" ? ROUTE_ON_BRIDGE : undefined).ground.forEach((pts) => streets.push({ k, pts })));
      map.getSource("cbStreets")?.setData(streetsFC(streets));
      map.getSource("cbRailSurface")?.setData(linesFC(splitByBridges(data.rail.surface, railBr).ground));
      bridgesRef.current = roadBr;
      setBridgeTick((v) => v + 1);
      // 手で置きかえた建物（「建物」）：元の建物は描かず、ラベルとピンの高さはその点の屋根の高さに。
      // 通り抜けの穴は、置きかえた建物には地図の建物のほうではなく、置きかえた形にあける（buildMesh）
      const replaced = replacedBuildings(features, data.buildings);
      const cut = await cutPassages(data.buildings, built.heights, features.filter((f) => f.type === "passage"), ground, replaced);
      if (!live()) return;
      cutRef.current = cut;
      replacedRef.current = replaced;
      built.heights0 ||= built.heights.slice();
      built.heights = built.heights0.map((h, i) => (replaced.has(i) ? buildingRoof(replaced.get(i)).hAt(toXY([data.buildings[i].c[1], data.buildings[i].c[0]])) : h));
      built.labels.forEach((l) => {
        l.h0 ??= l.h;
        l.h = replaced.has(l.i) ? built.heights[l.i] : l.h0;
      });
      mk.current.relayout?.();
      const spotsOf = new Map(); // 「建物」→ 置きかえた建物のスポット
      replaced.forEach((f, i) => { if (data.buildings[i].s) spotsOf.set(f.id, [...(spotsOf.get(f.id) || []), data.buildings[i].s]); });
      bldHitRef.current = features.filter((f) => f.type === "building" && spotsOf.has(f.id)).map((f) => ({ ring: f.coords.map(toXY), spot: spotsOf.get(f.id)[0] }));
      map.getSource("cbBuildings")?.setData(buildingsFC(data, built.heights, cut.pieces, replaced));
      map.getSource("cbPassShade")?.setData({ type: "FeatureCollection", features: cut.ceilings.map(({ rings }) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } })) });
      // 置きかえた建物の色：目的地なら強調、スポットのある建物なら白、ほかは控えめ（fill-extrusion と同じ）
      const bldColor = (f) => {
        const spots = spotsOf.get(f.id) || [];
        return hlRef.current && spots.includes(hlRef.current) ? built.hl : spots.length ? built.pal.bld : built.pal.bldMuted;
      };
      // 建物のくり抜き（ベランダ）は多角形の重ね合わせで作る
      const clip = features.some((f) => f.type === "building" && buildingOpenings(f, features).length) ? await loadClipper() : null;
      if (!live()) return;
      meshRef.current = () => extrasRef.current?.setMesh(buildMesh(features, { groundAt: ground, slopes: dem.slopes, terraces: dem.terraces, ceilings: cut.ceilings, pal: built.pal, dark, selectedId: selectedFeatureId, accent, bldColor, clip, tone: lookRef.current?.tone }));
      meshRef.current();
      // 夜の街灯：手で足した道路・建物・橋などをよけて置き、柱の足もとは焼き込んだ地面の高さ。置き直すのは関係する構造物が
      // 変わったときだけ（選んだだけ・横断歩道や白線を直しただけでは置き直さない。全体で 0.1 秒ほどかかる）
      const lampKey = JSON.stringify(features.filter((f) => !isPaint(f.type) || f.type === "road"));
      if (lampKey !== lampKeyRef.current) {
        const lamps = streetLamps(data, features, regionOf(data));
        await dem.ensure(lampBounds(lamps));
        if (!live()) return;
        lampKeyRef.current = lampKey;
        lampsRef.current = lamps;
        lightsRef.current?.setLamps(lampMesh(lamps, ground));
        showLampLight();
      }
    })().catch((err) => console.warn("[3D map] features:", err?.message || err));
  }, [loaded, features, selectedFeatureId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 夜の街灯が道に落とす光の輪：夜（lamp > 0）に、街灯から画像を作って地形に貼る（地図の端の帯の前）。街灯が変わったら作り直す
  // （エディタで続けて直すときは、少し待ってからまとめて）。昼は applyLook が隠す
  function showLampLight() {
    const map = mapRef.current;
    const look = lookRef.current;
    const lamps = lampsRef.current;
    if (!map || !look || !lamps || look.lamp <= 0.01) return;
    const st = lampLightRef.current;
    const show = () => {
      if (!map.getLayer(LAMP_LIGHT_LAYER)) return;
      map.setLayoutProperty(LAMP_LIGHT_LAYER, "visibility", "visible");
      map.setPaintProperty(LAMP_LIGHT_LAYER, "raster-opacity", lampLightOpacity(lookRef.current));
    };
    if (st.lamps === lamps) return show();
    const src = map.getSource(LAMP_LIGHT_SOURCE);
    const draw = () => {
      st.timer = 0;
      if (mapRef.current !== map) return;
      const now = lampsRef.current;
      const { canvas, coordinates } = lampLightCanvas(now, data, regionOf(data), st.canvas);
      st.lamps = now;
      st.canvas = canvas;
      const s = map.getSource(LAMP_LIGHT_SOURCE);
      if (s) {
        // canvas のソースは、動かしているあいだだけ描き直す：1回描いたら止める
        s.play();
        map.once("render", () => s.pause());
        map.triggerRepaint();
      } else {
        map.addSource(LAMP_LIGHT_SOURCE, { type: "canvas", canvas, coordinates, animate: false });
        map.addLayer({ id: LAMP_LIGHT_LAYER, type: "raster", source: LAMP_LIGHT_SOURCE, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, map.getLayer(LAMP_LIGHT_BEFORE) ? LAMP_LIGHT_BEFORE : undefined);
      }
      show();
    };
    clearTimeout(st.timer);
    if (src) st.timer = setTimeout(draw, 300);
    else draw();
  }

  // ── 歩いて見る：目の高さで Minecraft のように動く（campus3dWalk.js）。PC はクリックでマウスを固定して見回し、WASD で移動・
  // Space でジャンプ・Shift（か W 2回）でダッシュ・C でしゃがむ。スマホは左のスティックで移動・画面をなぞって見回す・ジャンプのボタン。
  // はじめに歩きはじめるところを選ぶ（地図をタップ：屋上・橋の上も。画面のまん中・ルートの出発点・現在地からも）。
  // ルートがあれば自動でたどれる。カメラは毎フレーム目の位置から決める（中心は視線の先の宙。centerClampedToGround を切る）。
  // はじめとおわりは、上からの視点と目の高さのあいだをなめらかにつなぐ ──
  const inRegion = (ll) => {
    const R = regionOf(data);
    return !!ll && ll.lng > R.w && ll.lng < R.e && ll.lat > R.s && ll.lat < R.n;
  };
  // 地面の高さで建物の中か（ルートの上の点。出発点・目的地のスポットは建物の中にある）
  const routeBlocked = (world, path, al) => {
    const [px, py] = path.at(al);
    const g = dem.groundAt(toLngLat([px, py]));
    return world.blocked(px, py, Number.isFinite(g) ? g : 0);
  };

  async function startWalk() {
    const map = mapRef.current;
    if (!map || !builtRef.current || walkRef.current || pickRef.current) return;
    pickRef.current = { world: null };
    const p = propsRef.current;
    const R = regionOf(data);
    await dem.ensure([R.w, R.s, R.e, R.n]);
    if (mapRef.current !== map || !pickRef.current) return;
    // 歩ける範囲：データの端の帯（背景へ溶かすところ）より内側
    const [bx0, by0] = toXY([R.w, R.s]);
    const [bx1, by1] = toXY([R.e, R.n]);
    pickRef.current.world = walkWorld({
      data, features: p.features || [], cut: cutRef.current, replaced: replacedRef.current, heights: builtRef.current.heights, decks: bridgesRef.current,
      posts: (lampsRef.current || []).map((l) => [l.x, l.y]), bounds: [bx0 + 40, by0 + 40, bx1 - 40, by1 - 40], groundAt: (ll) => dem.groundAt(ll),
    });
    wrapRef.current?.classList.add("cb3-picking");
    setPicking({ route: !!(p.route && p.route.length > 1), gps: inRegion(p.gps) });
  }

  function cancelPick() {
    if (!pickRef.current) return;
    pickRef.current = null;
    wrapRef.current?.classList.remove("cb3-picking");
    setPicking(null);
  }

  // 選んだところから歩きはじめる。how は "tap"（ev は地図のクリック）・"center"（画面のまん中）・"route"（ルートの出発点。
  // 案内中は今いるところ）・"gps"（現在地）
  function pickStart(how, ev) {
    const map = mapRef.current;
    const world = pickRef.current?.world;
    if (!map || !world) return;
    const p = propsRef.current;
    const path = p.route && p.route.length > 1 ? routePath(p.route) : null;
    const groundZ = (x, y) => {
      const g = dem.groundAt(toLngLat([x, y]));
      return Number.isFinite(g) ? g : map.getCenterElevation();
    };
    let x;
    let y;
    let z;
    let along = 0;
    let yaw = map.getBearing();
    if (how === "route" && path) {
      along = p.guiding && inRegion(p.gps) ? path.nearest(...toXY([p.gps.lng, p.gps.lat])) : 0;
      // 出発点が建物の中（スポットの点）なら、ルートが建物を出るところから
      for (let k = 0; k < 160 && along < path.len && routeBlocked(world, path, along); k++) along += 0.5;
      [x, y] = path.at(along);
      z = groundZ(x, y);
      yaw = path.heading(along) ?? yaw;
    } else if (how === "gps" && inRegion(p.gps)) {
      [x, y] = toXY([p.gps.lng, p.gps.lat]);
      z = groundZ(x, y);
    } else {
      // 指したところ：カメラから、指した地面の点（画面のまん中なら地図の中心）へのまっすぐな線で最初に当たる、立てるところ
      const ll = how === "tap" && ev ? ev.lngLat : map.getCenter();
      const [hx, hy] = toXY([ll.lng, ll.lat]);
      const hz = how === "tap" ? (map.queryTerrainElevation?.(ll) ?? groundZ(hx, hy)) : map.getCenterElevation();
      const cam = map.transform.getCameraLngLat();
      [x, y, z] = world.pick([...toXY([cam.lng, cam.lat]), map.transform.getCameraAltitude()], [hx, hy, hz]);
    }
    if (world.blocked(x, y, z)) [x, y, z] = world.freeNear(x, y, z); // 建物の中・壁ぎわなら、近くの外から
    if (path && how !== "route") along = path.nearest(x, y);
    pickRef.current = null;
    wrapRef.current?.classList.remove("cb3-picking");
    setPicking(null);
    beginWalk({ world, path, x, y, z, yaw, along });
  }

  function beginWalk({ world, path, x, y, z, yaw, along }) {
    const map = mapRef.current;
    if (!map || walkRef.current) return;
    // いまのカメラの位置（ここから目の高さへ降りていく）
    const cam = map.transform.getCameraLngLat();
    const alt = map.transform.getCameraAltitude();
    const c = map.getCenter();
    const [camX, camY] = toXY([cam.lng, cam.lat]);
    const [cX, cY] = toXY([c.lng, c.lat]);
    const D0 = Math.max(1, Math.hypot(cX - camX, cY - camY, alt - map.getCenterElevation()));
    const handlers = ["dragPan", "dragRotate", "scrollZoom", "touchZoomRotate", "touchPitch", "doubleClickZoom", "keyboard", "boxZoom"].filter((h) => map[h]?.isEnabled?.());
    const restore = { maxZoom: map.getMaxZoom(), maxPitch: map.getMaxPitch(), fov: map.transform.fov, handlers };
    const touch = !!window.matchMedia?.("(pointer: coarse)").matches;
    walkRef.current = {
      world, path, x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, deck: null, yaw, pitch: WALK_PITCH.start, along,
      eyeOff: 0, bobPhase: 0, bobAmp: 0, fov: WALK_FOV,
      keys: new Set(), joy: { x: 0, y: 0 }, run: false, sprintLatch: false, lastW: 0, touch,
      auto: false, done: false, lookHold: 0, locked: false, unlockedAt: 0, restore, last: 0, raf: 0,
      anim: { t0: performance.now(), dur: 1500, from: { x: camX, y: camY, z: alt, yaw: map.getBearing(), pitch: map.getPitch(), D: D0, fov: restore.fov } },
    };
    map.stop();
    cancelAnimationFrame(followRaf.current);
    followRaf.current = 0;
    handlers.forEach((h) => map[h].disable());
    map.setMaxZoom(24);
    map.setMaxPitch(180);
    map.setCenterClampedToGround(false);
    map.setSky(skyOf(lookRef.current));
    trainsLayerRef.current?.setXray(false); // トンネルの中の列車を地面ごしに見せない
    // マーカー（ラベル・駅名・現在地・ピン）は地図から外す。MapLibre は地図が動くたびにマーカーごとに地形の奥行きを
    // GPU から読む（readPixels）ので、毎フレーム動かすと 2〜3fps まで落ちる。残るマーカー（エディタの点）は奥行きを読ませない
    const own = [...mk.current.labels.map((x) => x.m), ...mk.current.stations.map((x) => x.m), mk.current.gps, mk.current.pin?.m].filter(Boolean);
    own.forEach((m) => m.remove());
    walkRef.current.detached = own;
    if (map.terrain) map.terrain.depthAtPoint = () => 1; // 1 ＝いちばん奥：マーカーはいつも見えている扱い
    wrapRef.current?.classList.add("cb3-walking");
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.();
    setWalking(true);
    setWalkUi({ run: false, auto: false, route: !!path, done: false, hint: true, locked: false, touch });
    walkRef.current.raf = requestAnimationFrame(walkTick);
  }

  function walkTick(now) {
    const w = walkRef.current;
    const map = mapRef.current;
    if (!w || !map) return;
    w.raf = requestAnimationFrame(walkTick);
    const dt = w.last ? Math.min(0.1, (now - w.last) / 1000) : 0; // 遅い端末（10fps ほど）でも動く速さは変えない。タブを戻したときに飛ばない
    w.last = now;
    // はじめ・おわりのつなぎ：カメラの位置・向き・中心までの距離・画角を少しずつ
    if (w.anim) {
      const a = w.anim;
      const k = Math.min(1, (now - a.t0) / a.dur);
      const e = easeInOut(k);
      const f = a.from;
      const to = a.to || { x: w.x, y: w.y, z: w.z + EYE, yaw: w.yaw, pitch: w.pitch, D: VIEW_D, fov: WALK_FOV };
      const fov = f.fov + (to.fov - f.fov) * e;
      map.setVerticalFieldOfView(fov);
      const D = Math.exp(Math.log(f.D) + (Math.log(to.D) - Math.log(f.D)) * e);
      const pos = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, z: f.z + (to.z - f.z) * e };
      map.jumpTo(eyeCamera(pos, f.yaw + angDiff(to.yaw, f.yaw) * e, f.pitch + (to.pitch - f.pitch) * e, { height: map.transform.height, fov: (fov * Math.PI) / 180 }, D));
      if (k >= 1) {
        w.anim = null;
        if (a.out) finishWalk();
      }
      return;
    }
    const keys = w.keys;
    const key = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    const fwd = key("KeyW", "ArrowUp") - key("KeyS", "ArrowDown") + w.joy.y;
    const side = key("KeyD", "ArrowRight") - key("KeyA", "ArrowLeft") + w.joy.x;
    const turn = key("KeyE") - key("KeyQ");
    const look = key("KeyR", "PageUp") - key("KeyF", "PageDown");
    const sprint = w.run || w.sprintLatch || keys.has("ShiftLeft") || keys.has("ShiftRight");
    const sneak = keys.has("KeyC");
    const jump = keys.has("Space");
    // 自分で動いたら、ルートの自動はやめる
    if (w.auto && (Math.abs(fwd) > 0.05 || Math.abs(side) > 0.05 || jump)) {
      w.auto = false;
      setWalkUi((u) => ({ ...u, auto: false }));
    }
    let s = { x: w.x, y: w.y, z: w.z, vx: w.vx, vy: w.vy, vz: w.vz, onGround: w.onGround, deck: w.deck, yaw: w.yaw, pitch: w.pitch, along: w.along };
    if (w.auto && w.path) {
      // 見回しているあいだ（マウス・ドラッグ・回すキー）は、進む向きへ顔を戻さない
      s = stepRoute(s, w.path, dt, w.world, { run: sprint, steer: !turn && now > w.lookHold });
      if (turn) s.yaw = (s.yaw + turn * 120 * dt + 360) % 360;
      // 建物に入るところ：この先で建物を出るなら、出たところまで進む（建物の中を通るルート）。出なければ、入口で着いた
      if (routeBlocked(w.world, w.path, s.along) && !routeBlocked(w.world, w.path, w.along)) {
        let t = s.along;
        while (t < w.path.len && routeBlocked(w.world, w.path, t)) t += 0.5;
        const at = (al) => {
          const [nx, ny] = w.path.at(al);
          const f = w.world.floorBelow(nx, ny, w.z + 0.6);
          return { x: nx, y: ny, z: f ? f.z : w.z, along: al, stepUp: 0 };
        };
        // 目的地の建物の入口：壁の目の前ではなく、4m 手前から建物を見上げる
        s = t >= w.path.len ? { ...s, ...at(Math.max(0, w.along - 4)), pitch: 92, done: true } : { ...s, ...at(t) };
      }
      if (s.done) {
        w.auto = false;
        w.done = true;
        setWalkUi((u) => ({ ...u, auto: false, done: true }));
      }
    } else s = stepBody(s, { fwd, side, turn, jump, sprint, sneak, autoJump: w.touch }, dt, w.world);
    s.pitch = Math.min(WALK_PITCH.max, Math.max(WALK_PITCH.min, s.pitch + look * 80 * dt));
    Object.assign(w, s);
    // 目：段を上り下りしたときはなめらかに追いつく。歩いているあいだは少し上下にゆれる（Minecraft の「画面の揺れ」）
    w.eyeOff = (w.eyeOff - (s.stepUp || 0)) * Math.exp(-dt * 12);
    const hs = Math.hypot(w.vx, w.vy);
    w.bobAmp += ((w.onGround && !w.auto ? Math.min(1, hs / SPEED.walk) : 0) - w.bobAmp) * Math.min(1, dt * 8);
    w.bobPhase += hs * dt * (Math.PI / 0.8);
    const bob = -Math.abs(Math.sin(w.bobPhase)) * 0.05 * w.bobAmp;
    // ダッシュ中は画角を少し広げる
    const fovTarget = WALK_FOV + (sprint && hs > SPEED.walk + 0.3 ? SPRINT_FOV : 0);
    w.fov += (fovTarget - w.fov) * Math.min(1, dt * 8);
    if (Math.abs(w.fov - map.transform.fov) > 0.05) map.setVerticalFieldOfView(w.fov);
    map.jumpTo(eyeCamera({ x: w.x, y: w.y, z: w.z + EYE + w.eyeOff + bob }, w.yaw, w.pitch, { height: map.transform.height, fov: map.transform.fovInRadians }));
  }

  // やめる：目の高さから、歩いていたところを上から見下ろす視点へ戻してから、地図の設定を元に戻す
  function stopWalk() {
    const w = walkRef.current;
    const map = mapRef.current;
    if (!w || !map || w.anim?.out) return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    const pitch = 55;
    const zoom = 18.8;
    const lat = toLngLat([w.x, w.y])[1];
    const ppm = (512 * 2 ** zoom) / (40075016.686 * Math.cos((lat * Math.PI) / 180)); // 1m が何 px か
    const D = (0.5 * map.transform.height) / Math.tan((w.restore.fov * Math.PI) / 360) / ppm;
    const b = (w.yaw * Math.PI) / 180;
    const p = (pitch * Math.PI) / 180;
    const to = { x: w.x - D * Math.sin(p) * Math.sin(b), y: w.y - D * Math.sin(p) * Math.cos(b), z: w.z + D * Math.cos(p), yaw: w.yaw, pitch, D, fov: w.restore.fov };
    w.anim = { t0: performance.now(), dur: 1100, out: true, from: { x: w.x, y: w.y, z: w.z + EYE + w.eyeOff, yaw: w.yaw, pitch: w.pitch, D: VIEW_D, fov: map.transform.fov }, to };
    w.keys.clear();
    w.joy = { x: 0, y: 0 };
    w.auto = false;
  }

  function finishWalk() {
    const w = walkRef.current;
    const map = mapRef.current;
    if (!w) return;
    cancelAnimationFrame(w.raf);
    walkRef.current = null;
    if (map) {
      map.setCenterClampedToGround(true);
      map.setMaxPitch(w.restore.maxPitch);
      map.setMaxZoom(w.restore.maxZoom);
      map.setVerticalFieldOfView(w.restore.fov);
      map.setSky(undefined);
      w.restore.handlers.forEach((h) => map[h]?.enable());
      trainsLayerRef.current?.setXray(true);
      if (map.terrain) delete map.terrain.depthAtPoint; // もとの（地形の奥行きを読む）関数へ
      // 外したマーカーを戻す（歩いているあいだに入れかわったもの＝消されたピンなどは戻さない）
      const now = new Set([...mk.current.labels.map((x) => x.m), ...mk.current.stations.map((x) => x.m), mk.current.gps, mk.current.pin?.m].filter(Boolean));
      (w.detached || []).filter((m) => now.has(m)).forEach((m) => m.addTo(map));
      mk.current.relayout?.();
    }
    wrapRef.current?.classList.remove("cb3-walking");
    setWalking(false);
    setWalkUi((u) => ({ ...u, auto: false, done: false, hint: false, locked: false }));
  }

  // 歩いているあいだの入力。PC：地図をクリックするとマウスを固定（ポインターロック）して、動かした向きを見る。固定できなければ
  // ドラッグで見回す。Esc でマウスを離し、離れているときの Esc でやめる。W を 2回押すとダッシュ。
  // スマホ：画面をなぞった向きを見る（右へなぞると右を向く）
  useEffect(() => {
    if (!walking) return undefined;
    const box = boxRef.current;
    let drag = null;
    const lookBy = (dx, dy, perPx) => {
      const w = walkRef.current;
      if (!w || w.anim) return;
      w.yaw = (w.yaw + dx * perPx + 360) % 360;
      w.pitch = Math.min(WALK_PITCH.max, Math.max(WALK_PITCH.min, w.pitch - dy * perPx));
      w.lookHold = performance.now() + 2500;
    };
    const down = (e) => {
      const w = walkRef.current;
      if (!w) return;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        if (!document.pointerLockElement) {
          try {
            const r = box.requestPointerLock?.();
            r?.catch?.(() => {}); // 固定できなければドラッグで
          } catch {
            /* ドラッグで見回す */
          }
        }
      } else if (!w.touch) {
        w.touch = true;
        setWalkUi((u) => ({ ...u, touch: true }));
      }
      if (!document.pointerLockElement) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
        try {
          box.setPointerCapture?.(e.pointerId);
        } catch {
          /* マウスがすぐ固定されたとき（固定中は捕まえられない） */
        }
      }
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id || document.pointerLockElement) return;
      lookBy(e.clientX - drag.x, e.clientY - drag.y, drag.mouse ? 0.2 : 0.3);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    // マウスを固定しているあいだ：動かした量だけ見回す
    const mouseMove = (e) => {
      if (document.pointerLockElement === box) lookBy(e.movementX, e.movementY, 0.13);
    };
    const lockChange = () => {
      const w = walkRef.current;
      if (!w) return;
      w.locked = document.pointerLockElement === box;
      if (!w.locked) w.unlockedAt = performance.now();
      drag = null;
      setWalkUi((u) => ({ ...u, locked: w.locked, hint: !w.locked || u.hint }));
    };
    const keyDown = (e) => {
      const w = walkRef.current;
      if (!w || e.target?.closest?.("input,textarea,select,[contenteditable='true']")) return;
      if (e.code === "Escape") {
        // マウスを固定しているときの Esc はブラウザが固定をやめる。離れているときの Esc でやめる
        if (document.pointerLockElement || performance.now() - w.unlockedAt < 500) return;
        e.preventDefault();
        stopWalk();
      } else if (WALK_KEYS.has(e.code)) {
        e.preventDefault();
        if (e.code === "KeyW" && !e.repeat) {
          const t = performance.now();
          if (t - w.lastW < 300) w.sprintLatch = true; // W を 2回でダッシュ（W を離すまで）
          w.lastW = t;
        }
        w.keys.add(e.code);
      }
    };
    const keyUp = (e) => {
      const w = walkRef.current;
      if (!w) return;
      w.keys.delete(e.code);
      if (e.code === "KeyW") w.sprintLatch = false;
    };
    const blur = () => {
      const w = walkRef.current;
      if (!w) return;
      w.keys.clear();
      w.sprintLatch = false;
    };
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    document.addEventListener("mousemove", mouseMove);
    document.addEventListener("pointerlockchange", lockChange);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("pointerlockchange", lockChange);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      if (document.pointerLockElement === box) document.exitPointerLock?.();
    };
  }, [walking]); // eslint-disable-line react-hooks/exhaustive-deps
  // 歩きはじめるところを選んでいるあいだの Esc：やめる
  useEffect(() => {
    if (!picking) return undefined;
    const keyDown = (e) => {
      if (e.code !== "Escape" || e.target?.closest?.("input,textarea,select,[contenteditable='true']")) return;
      e.preventDefault();
      cancelPick();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [picking]); // eslint-disable-line react-hooks/exhaustive-deps
  // 説明はしばらくしたら消す（マウスを離したとき・スマホで歩きはじめたときにまた出す）
  useEffect(() => {
    if (!walking || !walkUi.hint) return undefined;
    const id = setTimeout(() => setWalkUi((u) => (u.locked || u.touch ? { ...u, hint: false } : u)), 6000);
    return () => clearTimeout(id);
  }, [walking, walkUi.hint, walkUi.locked]);

  // 左下のスティック（スマホ）：倒した向きへ動く（上が前、右が右へ横歩き）。つまみは指についてくる
  const joyId = useRef(null);
  const joyMove = (e) => {
    const w = walkRef.current;
    if (!w || joyId.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const half = r.width / 2;
    const lim = half - 14;
    let dx = e.clientX - (r.left + half);
    let dy = e.clientY - (r.top + half);
    const m = Math.hypot(dx, dy);
    if (m > lim) {
      dx *= lim / m;
      dy *= lim / m;
    }
    const v = m < lim * 0.12 ? 0 : 1; // まん中の近くは止まる
    w.joy = { x: (dx / lim) * v, y: (-dy / lim) * v };
    if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const joyDown = (e) => {
    joyId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    joyMove(e);
  };
  const joyUp = (e) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    if (walkRef.current) walkRef.current.joy = { x: 0, y: 0 };
    if (joyKnobRef.current) joyKnobRef.current.style.transform = "";
  };
  // ジャンプのボタン（押しているあいだは、着地するたびに跳ぶ＝Space と同じ）
  const jumpDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    walkRef.current?.keys.add("Space");
  };
  const jumpUp = () => walkRef.current?.keys.delete("Space");
  const toggleRun = () => {
    const w = walkRef.current;
    if (!w) return;
    w.run = !w.run;
    setWalkUi((u) => ({ ...u, run: w.run }));
  };
  // ルートを自動で歩く／止まる。終わりまで歩いたあとは、はじめから
  const toggleAuto = () => {
    const w = walkRef.current;
    if (!w?.path) return;
    if (w.auto) {
      w.auto = false;
      setWalkUi((u) => ({ ...u, auto: false }));
      return;
    }
    if (w.done) {
      // 着いたあとは、はじめから（出発点の建物を出るところから）
      let a = 0;
      for (let k = 0; k < 160 && a < w.path.len && routeBlocked(w.world, w.path, a); k++) a += 0.5;
      [w.x, w.y] = w.path.at(a);
      w.along = a;
      w.z = (w.world.floorBelow(w.x, w.y, Infinity) || { z: w.z }).z;
      w.done = false;
    } else w.along = w.path.nearest(w.x, w.y);
    w.auto = true;
    w.lookHold = 0;
    setWalkUi((u) => ({ ...u, auto: true, done: false }));
  };

  // ── 見え方（時刻に合わせる・昼・夕方・夜）を当てはめる。時刻に合わせるときは 1 分ごとに太陽の位置を測り直す。
  // window に "cb3-clock" を送ると、すぐ測り直す（試すとき：window.__mapClock = { at: "17:05" } と合わせて）──
  useEffect(() => {
    if (!loaded) return undefined;
    let last = null;
    const tick = () => {
      const map = mapRef.current;
      const built = builtRef.current;
      const wrap = wrapRef.current;
      if (!map || !built || !wrap) return;
      const look = lookFor(mode, { dark });
      setLookPhase(look.phase);
      propsRef.current.onLookPhase?.(look.phase);
      if (look.key === last) return;
      last = look.key;
      lookRef.current = look;
      applyLook(map, built, look, accent);
      const pal = look.pal;
      const vars = { "--cb3-label": pal.label, "--cb3-label-muted": pal.labelMuted, "--cb3-halo": pal.halo, "--cb3-station": pal.station, "--cb3-station-bg": pal.stationBg };
      Object.entries(vars).forEach(([k, v]) => wrap.style.setProperty(k, v));
      wrap.style.background = pal.outside;
      if (hazeRef.current) hazeRef.current.style.background = hazeBackground(look);
      extrasRef.current?.setLight(look.light);
      trainsLayerRef.current?.setLight(look.light);
      lightsRef.current?.setLight(look.light);
      lightsRef.current?.setGlow(look.lamp);
      showLampLight();
      if (walkRef.current) map.setSky(skyOf(look));
      meshRef.current?.();
      paintRef.current?.();
    };
    tick();
    const id = mode === "auto" ? setInterval(tick, 60000) : 0;
    window.addEventListener("cb3-clock", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("cb3-clock", tick);
    };
  }, [loaded, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 見え方のボタン：時刻に合わせる → 昼 → 夕方 → 夜 → 時刻に合わせる
  const cycleLook = () => {
    const next = LOOK_MODES[(LOOK_MODES.indexOf(lookMode) + 1) % LOOK_MODES.length];
    setLookMode(next);
    try {
      localStorage.setItem(lookKey, next);
    } catch {
      /* 覚えておけなくても切りかえはする */
    }
    clearTimeout(lookToastTimer.current);
    setLookToast(next);
    lookToastTimer.current = setTimeout(() => setLookToast(null), 1800);
  };
  useEffect(() => () => clearTimeout(lookToastTimer.current), []);

  // 目的地の建物を塗り、ラベルを目立たせる
  useEffect(() => {
    const map = mapRef.current;
    const built = builtRef.current;
    if (!loaded || !map || !built) return;
    const id = dest?.id || null;
    if (hlRef.current === id) return;
    (built.bySpot.get(hlRef.current) || []).forEach((i) => map.setFeatureState({ source: "cbBuildings", id: i }, { hl: false }));
    (built.bySpot.get(id) || []).forEach((i) => map.setFeatureState({ source: "cbBuildings", id: i }, { hl: true }));
    mk.current.labels.forEach(({ node, l }) => node.classList.toggle("cb-hl", !!id && l.spot === id));
    hlRef.current = id;
    mk.current.relabel?.();
    if (features.some((f) => f.type === "building")) meshRef.current?.(); // 置きかえた建物の色
  }, [loaded, dest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ルート（案内中は通ったところを灰色の点線に）。橋の上を通るところは地面に貼らず、橋の床の上に描く
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const passed = map.getSource("navRoutePassed");
    const rest = map.getSource("navRoute");
    const setRest = (latlngs) => {
      const { ground, onBridge } = splitByBridges(latlngs.length > 1 ? [latlngs] : [], bridgesRef.current, ROUTE_ON_BRIDGE);
      rest?.setData(linesFC(ground));
      onBridgeRef.current = onBridge;
      extrasRef.current?.setRibbons(buildRibbons(onBridge));
    };
    if (!route || route.length < 2) {
      passed?.setData(EMPTY_FC);
      setRest([]);
      return;
    }
    const toLL = (c) => [c.lat, c.lng];
    if (guiding && split) {
      const seg = Math.min(split.idx, route.length - 2);
      const a = route[seg];
      const b = route[seg + 1];
      const proj = { lat: a.lat + split.t * (b.lat - a.lat), lng: a.lng + split.t * (b.lng - a.lng) };
      passed?.setData(linesFC(splitByBridges([[...route.slice(0, seg + 1), proj].map(toLL)], bridgesRef.current, ROUTE_ON_BRIDGE).ground));
      setRest([proj, ...route.slice(seg + 1)].map(toLL));
    } else {
      passed?.setData(EMPTY_FC);
      setRest(route.map(toLL));
    }
  }, [loaded, route, split?.idx, split?.t, guiding, bridgeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 出発地・目的地のマーカー
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapRef.current;
    if (!loaded || !map || !ml) return undefined;
    const added = [];
    if (origin) added.push(new ml.Marker({ ...ALWAYS, element: holder(el(ORIGIN_HTML)), anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map));
    if (dest) {
      // 目的地が建物の中なら、ピンは屋上に立てる。名前はピンの上に出す
      const name = (dest.label || "").replace(/・.*$/, "");
      const node = el(`<div class="nav-pin">${name ? `<div class="cb3-pin-name">${esc(name)}</div>` : ""}<div class="nav-pin-shadow"></div><div class="nav-pin-body nav-pin-drop">${PIN_SVG(accent)}</div></div>`);
      const m = new ml.Marker({ ...ALWAYS, element: holder(node), anchor: "bottom", offset: [0, 2] }).setLngLat([dest.lng, dest.lat]).addTo(map);
      mk.current.pin = { m, h: roofAt(data, builtRef.current, dest.id, dest.lat, dest.lng), name: node.querySelector(".cb3-pin-name") };
      added.push(m);
    }
    mk.current.relabel?.();
    return () => {
      added.forEach((m) => m.remove());
      mk.current.pin = null;
    };
  }, [loaded, origin?.lat, origin?.lng, dest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 建物の無いスポット（点）と、グループ表示中のピン
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapRef.current;
    const built = builtRef.current;
    if (!loaded || !map || !ml || !built) return undefined;
    const inGroup = (s) => !!group && s.id.startsWith(`${group.prefix}_`);
    const pts = (spots || [])
      .filter((s) => s.lat != null && !built.bySpot.has(s.id) && s.id !== dest?.id && !inGroup(s))
      .map((s) => ({ lat: s.lat, lng: s.lng, props: { id: s.id, col: s.col || "#78909c", g: 0 } }));
    map.getSource("navSpots")?.setData(pointsFC(pts));
    const pins = [];
    if (group) {
      (spots || []).filter((s) => s.lat != null && inGroup(s)).forEach((s) => {
        const lbl = s.label.replace(/^[^（(]*[（(]/, "").replace(/[）)]$/, "") || s.short;
        const node = el(groupPinHtml(lbl, group.col || s.col));
        node.addEventListener("click", (ev) => { ev.stopPropagation(); propsRef.current.onGroupTap?.(s.id); });
        pins.push(new ml.Marker({ ...ALWAYS, element: holder(node), anchor: "bottom" }).setLngLat([s.lng, s.lat]).addTo(map));
      });
    }
    return () => pins.forEach((m) => m.remove());
  }, [loaded, spots, group?.prefix, dest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 現在地（点と精度の円）。点は 0.4 秒かけて新しい位置へ動かす
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapRef.current;
    if (!loaded || !map || !ml) return;
    cancelAnimationFrame(gpsAnim.current.raf);
    if (!gps) {
      mk.current.gps?.remove();
      mk.current.gps = null;
      gpsAnim.current.at = null;
      map.getSource("navAccuracy")?.setData(EMPTY_FC);
      return;
    }
    const to = { lat: gps.lat, lng: gps.lng };
    if (!mk.current.gps) {
      mk.current.gps = new ml.Marker({ ...ALWAYS, element: holder(el(gpsHtml())), anchor: "center" }).setLngLat([to.lng, to.lat]).addTo(map);
      gpsAnim.current.at = to;
      updateArrow();
    } else {
      const from = gpsAnim.current.at || to;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 400);
        const e = 1 - (1 - k) ** 2;
        const at = { lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e };
        gpsAnim.current.at = at;
        mk.current.gps?.setLngLat([at.lng, at.lat]);
        if (k < 1) gpsAnim.current.raf = requestAnimationFrame(step);
      };
      gpsAnim.current.raf = requestAnimationFrame(step);
    }
    map.getSource("navAccuracy")?.setData(gps.accuracy && gps.accuracy < 5000 ? circleFC(gps.lat, gps.lng, gps.accuracy) : EMPTY_FC);
    // ルートが橋の上を通っていて、現在地がその近く（4m 以内）なら、現在地を橋の床の高さに出す
    const p = toXY([gps.lng, gps.lat]);
    let best = 4;
    let deck = null;
    onBridgeRef.current.forEach((piece) => piece.forEach(([lng, lat, z]) => {
      const q = toXY([lng, lat]);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < best) { best = d; deck = z; }
    }));
    const g = deck == null ? NaN : dem.groundAt([gps.lng, gps.lat]);
    const lift = Number.isFinite(g) ? Math.max(0, deck - g) : 0;
    if (Math.abs(lift - gpsLiftRef.current) > 0.05) {
      gpsLiftRef.current = lift;
      mk.current.relayout?.();
    }
    blockedRef.current = false;
    if (follow) kickFollow();
  }, [loaded, gps]); // eslint-disable-line react-hooks/exhaustive-deps

  // 案内の開始・終了、追従の再開
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (guiding && follow) {
      // 開始時は少し寄る（Leaflet の 18 = 2D と同じ）。「現在地に戻る」では 17.5 まで
      zoomTgtRef.current = Math.max(map.getZoom(), (wasGuiding.current ? 17.5 : 18) + ML_ZOOM_OFFSET);
      kickFollow();
    } else if (!guiding && wasGuiding.current) {
      cancelAnimationFrame(followRaf.current);
      followRaf.current = 0;
      zoomTgtRef.current = null;
      if (!walkRef.current) map.easeTo({ pitch: Math.min(PITCH, maxPitchAt(map.getZoom(), coverRef.current)), bearing: 0, padding: NO_PAD, duration: 600 });
    }
    wasGuiding.current = guiding;
  }, [loaded, guiding, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded && guiding) kickFollow(); }, [loaded, northUp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 見せたいもの（ルート・グループ・目的地）が変わったら、そこへ寄る。GPS の更新ごとには動かさない。
  // 案内中は追従に任せ、見せたものとして覚えるだけ（案内を終えたときに、ルート全体へ引き戻さない）
  const rKey = routeKey(route);
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapRef.current;
    const built = builtRef.current;
    if (!loaded || !map || !ml || !built) return;
    const pad0 = fitPad || { top: 60, bottom: 60, left: 40, right: 40 };
    const pad = { ...pad0, left: pad0.left + 12, right: pad0.right + 12 };
    const f = fitRef.current;
    const gKey = group && spots ? group.prefix : null;
    const dKey = !rKey && dest ? `${origin ? `${origin.lat},${origin.lng}` : ""}|${dest.id}` : null;
    const changed = { route: f.route !== rKey, group: f.group !== gKey, dest: f.dest !== dKey };
    Object.assign(f, { route: rKey, group: gKey, dest: dKey });
    if (guiding || walkRef.current) return;
    const go = (pts, bearing, extraTop = 0, bottom = pad.bottom) => {
      const box = { ...pad, top: pad.top + extraTop, bottom };
      let cam = fitCamera(ml, map, pts, box, PITCH_FIT, bearing, 19 + ML_ZOOM_OFFSET);
      // 広い範囲を見せるとき（引いたズーム）は傾きを抑えて、もう一度合わせる
      const cap = cam ? maxPitchAt(cam.zoom, coverRef.current) : PITCH_FIT;
      if (cam && cap < PITCH_FIT) cam = fitCamera(ml, map, pts, box, cap, bearing, 19 + ML_ZOOM_OFFSET) || cam;
      if (cam) map.easeTo({ ...cam, padding: NO_PAD, duration: 800 });
    };
    // ルート全体：進む方向を上にして、目的地の建物とピンまで入れる
    if (rKey) {
      if (!changed.route) return;
      const end = route[route.length - 1];
      const pts = [...route, ...(dest ? [dest, ...spotOutline(data, built, dest.id)] : [])];
      go(pts, bearingOf(route[0], end), dest ? 70 : 0);
      return;
    }
    if (gKey) {
      if (!changed.group) return;
      const members = spots.filter((s) => s.lat != null && s.id.startsWith(`${group.prefix}_`));
      if (members.length === 1) map.easeTo({ center: [members[0].lng, members[0].lat], zoom: 18 + ML_ZOOM_OFFSET, padding: NO_PAD, duration: 500 });
      else if (members.length > 1) go(members, map.getBearing(), 30, Math.min(pad.bottom, 90)); // グループ表示では下にカードが出ない
      return;
    }
    if (dKey && changed.dest) {
      if (origin) go([origin, dest, ...spotOutline(data, built, dest.id)], bearingOf(origin, dest), 70);
      else {
        const z = Math.max(map.getZoom(), 18 + ML_ZOOM_OFFSET);
        map.easeTo({ center: [dest.lng, dest.lat], zoom: z, pitch: Math.min(Math.max(map.getPitch(), PITCH_FIT), maxPitchAt(z, coverRef.current)), padding: NO_PAD, duration: 700 });
      }
    }
  }, [loaded, rKey, dest?.id, origin?.lat, origin?.lng, group?.prefix, guiding]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 250 });
  return (
    // 歩いているあいだ（歩きはじめるところを選んでいるあいだも）は、地図を画面のほかの部品（検索・ボタン・カード）より上に出す
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, zIndex: walking || picking ? 1200 : 1 }}>
      <style>{CSS}</style>
      <div ref={boxRef} className="cb3-map" style={{ position: "absolute", inset: 0 }} />
      {props.walkButton && !walking && !picking && <button type="button" className="cb3-walk" aria-label={t("navi.stroll")} title={t("navi.stroll")} onClick={startWalk}>{WALK_ICON}</button>}
      {picking && (
        <div className="cb3-walk-ui">
          <div className="cb3-walk-hint">{t("navi.strollPick")}</div>
          <div className="cb3-pick-btns">
            <button type="button" onClick={() => pickStart("center")}>{t("navi.strollPickHere")}</button>
            {picking.route && <button type="button" onClick={() => pickStart("route")}>{t("navi.strollPickRoute")}</button>}
            {picking.gps && <button type="button" onClick={() => pickStart("gps")}>{t("navi.strollPickGps")}</button>}
            <button type="button" className="cb3-walk-exit" onClick={cancelPick}>{t("navi.strollPickCancel")}</button>
          </div>
        </div>
      )}
      {walking && (
        <div className="cb3-walk-ui">
          <div className="cb3-cross" />
          {(walkUi.hint || walkUi.done) && (
            <div className="cb3-walk-hint">{walkUi.done ? t("navi.strollArrived") : walkUi.touch ? t("navi.strollHintTouch") : walkUi.locked ? t("navi.strollHintLocked") : t("navi.strollHintKeys")}</div>
          )}
          {walkUi.touch && (
            <div className="cb3-joy" aria-hidden="true" onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp}>
              <div ref={joyKnobRef} className="cb3-joy-knob" />
            </div>
          )}
          <div className="cb3-walk-btns">
            {walkUi.touch && <button type="button" className="cb3-jump" onPointerDown={jumpDown} onPointerUp={jumpUp} onPointerCancel={jumpUp}>{t("navi.strollJump")}</button>}
            {walkUi.route && <button type="button" className={walkUi.auto ? "on" : ""} aria-pressed={walkUi.auto} onClick={toggleAuto}>{walkUi.auto ? t("navi.strollPause") : t("navi.strollRoute")}</button>}
            <button type="button" className={walkUi.run ? "on" : ""} aria-pressed={walkUi.run} onClick={toggleRun}>{t("navi.strollRun")}</button>
            <button type="button" className="cb3-walk-exit" onClick={stopWalk}>{t("navi.strollStop")}</button>
          </div>
        </div>
      )}
      {!controlled && <button type="button" className="cb3-look" aria-label={t("navi.look")} title={`${t("navi.look")}：${t(LOOK_LABEL[lookMode])}`} onClick={cycleLook}>
        {LOOK_ICON[lookMode === "auto" ? lookPhase : lookMode]}
        {lookMode === "auto" && <span className="cb3-look-a">A</span>}
      </button>}
      {!controlled && lookToast && <div className="cb3-look-toast">{lookToast === "auto" ? `${t("navi.lookAuto")}（${t(LOOK_LABEL[lookPhase])}）` : t(LOOK_LABEL[lookToast])}</div>}
      <div className="cb3-zoom">
        <button type="button" aria-label={t("pdf.zoomIn")} onClick={() => zoomBy(1)}>+</button>
        <button type="button" aria-label={t("pdf.zoomOut")} onClick={() => zoomBy(-1)}>−</button>
      </div>
      <div className="cb3-attr">© OpenStreetMap contributors · 標高: 国土地理院</div>
    </div>
  );
});
