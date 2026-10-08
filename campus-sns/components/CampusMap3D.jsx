// キャンパスナビの「3D表示」。MapLibre GL（window.maplibregl・shared.jsx の useMapLibre で読み込む）に、
// イラスト地図と同じデータで建物を立ち上げて描く。現在地・目的地・ルート・案内中の追従は NavigationView から props で受け取る。
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { EMPTY_FC, ML_ZOOM_OFFSET, PITCH, PITCH_GUIDE, buildCampus3D, circleFC, coverZoom, lineFC, makeConstrain, maxPitchAt, pointsFC, regionOf, roofAt, spotOutline } from "../campusMap3d.js";

const ROUTE_COL = "#1a8ef0";
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
.cb3-attr{position:absolute;right:0;bottom:0;font-size:9.5px;line-height:1.4;padding:0 5px;border-radius:6px 0 0 0;background:var(--cb3-attr-bg);color:var(--cb3-attr);pointer-events:none;z-index:2}
`;

const gpsHtml = () => `<div style="position:relative;width:14px;height:14px">
  <div class="gps3-arrow" style="display:none;position:absolute;top:-18px;left:50%;transform-origin:center 25px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid ${ROUTE_COL};filter:drop-shadow(0 0 3px rgba(26,142,240,.6));z-index:2"></div>
  <div style="position:absolute;inset:-12px;border-radius:50%;background:rgba(26,142,240,.25);animation:navHalo 2s ease-out infinite"></div>
  <div style="position:relative;width:14px;height:14px;border-radius:50%;background:${ROUTE_COL};border:3px solid #fff;box-shadow:0 1px 6px rgba(26,142,240,.55);box-sizing:border-box"></div>
  <div class="nav-here">${esc(t("navi.currentLocation"))}</div>
</div>`;
const ORIGIN_HTML = `<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #ccc;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;box-sizing:border-box"><div style="width:6px;height:6px;border-radius:50%;background:#aaa"></div></div>`;
// グループ（ベンチなど）のピン。2D と同じく、引いているときは点だけ、寄ったら名前の吹き出しを出す
const groupPinHtml = (label, col) => `<div class="cb3-gp" style="--gp:${col}"><div class="cb3-gp-lbl">${esc(label)}</div><div class="cb3-gp-stem"></div><div class="cb3-gp-dot"></div></div>`;

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
          const s = tr.locationToScreenPoint(ll);
          x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
        });
        const shift = new ml.Point(W / 2 + (x0 + x1) / 2 - (box.l + box.r) / 2, H / 2 + (y0 + y1) / 2 - (box.t + box.b) / 2);
        center = tr.screenPointToLocation(shift);
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
 *   initialView                    { lat, lng, zoom(Leaflet 基準), bearing(MapLibre 基準: 画面の上の方位) }
 *   spots                          NAV_SPOTS（建物の無いスポットは点で描く）
 *   origin, dest                   出発地 { lat, lng } / 目的地スポット
 *   route, split                   ルートの座標 [{lat,lng}] / 案内中の進み具合 { idx, t }
 *   gps, guiding, follow, northUp  現在地 { lat, lng, accuracy } と案内の状態
 *   group                          { prefix, col }（ベンチなどのグループ表示中）
 *   fitPad                         ルート全体などを見せるときの余白 { top, bottom, left, right }（上下のカードの分）
 *   onSpotTap(id), onGroupTap(id), onMapClick(), onUserMove(), onRotate(bearing), onLoad(), onError(err)
 */
export const CampusMap3D = forwardRef(function CampusMap3D(props, ref) {
  const { data, dark, accent, initialView } = props;
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

  // ── 地図を作る（1回だけ）──
  useEffect(() => {
    const ml = window.maplibregl;
    const box = boxRef.current;
    const wrap = wrapRef.current;
    if (!ml || !box || !wrap) return undefined;
    const built = buildCampus3D(data, { dark, accent });
    builtRef.current = built;
    const vars = {
      "--cb3-label": built.pal.label, "--cb3-label-muted": built.pal.labelMuted, "--cb3-halo": built.pal.halo, "--cb3-accent": accent,
      "--cb3-station": built.pal.station, "--cb3-station-bg": built.pal.stationBg,
      "--cb3-btn": T.bg2, "--cb3-btn-tx": T.txH, "--cb3-btn-bd": T.bd, "--cb3-attr": T.txD, "--cb3-attr-bg": `${T.bg2}cc`,
    };
    Object.entries(vars).forEach(([k, v]) => wrap.style.setProperty(k, v));
    wrap.style.background = built.pal.outside;

    const R = regionOf(data);
    const constrain = makeConstrain(R, ml.LngLat);
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

    // いちばん引いたところ＝データがちょうど画面いっぱい（回していないとき）。画面の大きさが変わったら測り直す
    const fitMinZoom = () => {
      coverRef.current = coverZoom(R, box.clientWidth || 1, box.clientHeight || 1);
      map.setMinZoom(Math.min(19, coverRef.current));
    };
    fitMinZoom();
    map.on("resize", fitMinZoom);

    // 傾けたときは、画面の上のほう（遠く）を背景色のもやで薄める。地図の上・マーカーの下に重ねる
    const haze = document.createElement("div");
    haze.className = "cb3-haze";
    haze.style.background = `linear-gradient(to bottom, ${built.pal.outside} 0%, ${built.pal.outside}cc 32%, ${built.pal.outside}00 100%)`;
    map.getCanvas().after(haze);
    const updateHaze = () => { haze.style.opacity = String(Math.min(1, Math.max(0, (map.getPitch() - 22) / 26))); };
    map.on("pitch", updateHaze);
    updateHaze();

    // 動き終わったら：引いているのに傾きすぎていれば平らに戻し、回したあとなどで外が見えていれば内側へ戻す
    map.on("moveend", () => {
      const p = propsRef.current;
      if (p.guiding && p.follow) return; // 案内中の追従は自分でカメラを決める
      const c = map.getCenter();
      const z = map.getZoom();
      const r = constrain.call(map.transform, c, z);
      const outside = Math.hypot((r.center.lng - c.lng) * R.kx, (r.center.lat - c.lat) * R.ky) > 0.5 || r.zoom - z > 0.01;
      const cap = maxPitchAt(r.zoom, coverRef.current);
      if (outside || map.getPitch() > cap + 0.5) map.easeTo({ center: r.center, zoom: r.zoom, pitch: Math.min(map.getPitch(), cap), duration: 350 });
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
      mk.current.stations.push({ m: new ml.Marker({ element: holder(node), anchor: "center" }).setLngLat(st.lngLat).addTo(map), node });
    });

    // ズームに合わせた表示の切り替えと、ラベルを屋上の高さへ持ち上げる量
    const last = { cls: "", z: -1, p: -1, k: -1 };
    let raf = 0;
    const layout = () => {
      raf = 0;
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
      const f = k * (2 ** z / MPP0) * Math.sin((pitch * Math.PI) / 180);
      mk.current.labels.forEach(({ m, l }) => m.setOffset([0, -l.h * f - 6]));
      if (mk.current.pin) mk.current.pin.m.setOffset([0, 2 - mk.current.pin.h * f]);
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
    map.on("zoom", scheduleLayout);
    map.on("pitch", scheduleLayout);
    map.on("move", scheduleDeclutter);
    map.on("moveend", () => {
      clearTimeout(declutterTimer);
      declutterTimer = 0;
      requestAnimationFrame(declutter);
    });
    layout();

    // 地面から建物が立ち上がり、地図が傾く
    map.on("load", () => {
      setLoaded(true);
      propsRef.current.onRotate?.(map.getBearing());
      propsRef.current.onLoad?.();
      const t0 = performance.now();
      const step = (now) => {
        if (mapRef.current !== map) return;
        const k = Math.min(1, (now - t0) / 950);
        riseRef.current = 1 - (1 - k) ** 3;
        map.setPaintProperty("cb-buildings", "fill-extrusion-height", ["*", ["get", "h"], riseRef.current]);
        scheduleLayout();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      if (!propsRef.current.guiding) map.easeTo({ pitch: Math.min(PITCH, maxPitchAt(map.getZoom(), coverRef.current)), duration: 950 });
    });

    // タップ：建物の無いスポット（点）→ 建物 → 何もないところ
    map.on("click", (ev) => {
      const p = propsRef.current;
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
    });
    map.on("mousemove", (ev) => {
      const hit = map.queryRenderedFeatures(ev.point, { layers: ["nav-spots", "cb-buildings"] }).some((h) => h.layer.id === "nav-spots" || h.properties.s);
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
      propsRef.current.onRotate?.(map.getBearing());
      updateArrow();
    });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(declutterTimer);
      cancelAnimationFrame(followRaf.current);
      cancelAnimationFrame(gpsAnim.current.raf);
      followRaf.current = 0;
      map.remove();
      mapRef.current = null;
      mk.current = { labels: [], stations: [], gps: null, pin: null };
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!map || !p.guiding || !p.follow || !p.gps || gestRef.current) return;
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
      if (map) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom + ML_ZOOM_OFFSET), padding: NO_PAD, duration: 600 });
    },
    resetNorth() { mapRef.current?.easeTo({ bearing: 0, duration: 500 }); },
    // 案内中に上にする方位（null なら今の向きのまま）と、現在地の矢印の向き（null なら出さない）
    setHeading(follow, arrow) {
      headRef.current = { follow, arrow };
      updateArrow();
      kickFollow();
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const { dest, origin, route, split, gps, guiding, follow, northUp, group, spots, fitPad } = props;

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
  }, [loaded, dest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ルート（案内中は通ったところを灰色の点線に）
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const passed = map.getSource("navRoutePassed");
    const rest = map.getSource("navRoute");
    if (!route || route.length < 2) {
      passed?.setData(EMPTY_FC);
      rest?.setData(EMPTY_FC);
      return;
    }
    const toLL = (c) => [c.lat, c.lng];
    if (guiding && split) {
      const seg = Math.min(split.idx, route.length - 2);
      const a = route[seg];
      const b = route[seg + 1];
      const proj = { lat: a.lat + split.t * (b.lat - a.lat), lng: a.lng + split.t * (b.lng - a.lng) };
      passed?.setData(lineFC([...route.slice(0, seg + 1), proj].map(toLL)));
      rest?.setData(lineFC([proj, ...route.slice(seg + 1)].map(toLL)));
    } else {
      passed?.setData(EMPTY_FC);
      rest?.setData(lineFC(route.map(toLL)));
    }
  }, [loaded, route, split?.idx, split?.t, guiding]); // eslint-disable-line react-hooks/exhaustive-deps

  // 出発地・目的地のマーカー
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapRef.current;
    if (!loaded || !map || !ml) return undefined;
    const added = [];
    if (origin) added.push(new ml.Marker({ element: holder(el(ORIGIN_HTML)), anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map));
    if (dest) {
      // 目的地が建物の中なら、ピンは屋上に立てる。名前はピンの上に出す
      const name = (dest.label || "").replace(/・.*$/, "");
      const node = el(`<div class="nav-pin">${name ? `<div class="cb3-pin-name">${esc(name)}</div>` : ""}<div class="nav-pin-shadow"></div><div class="nav-pin-body nav-pin-drop">${PIN_SVG(accent)}</div></div>`);
      const m = new ml.Marker({ element: holder(node), anchor: "bottom", offset: [0, 2] }).setLngLat([dest.lng, dest.lat]).addTo(map);
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
        pins.push(new ml.Marker({ element: holder(node), anchor: "bottom" }).setLngLat([s.lng, s.lat]).addTo(map));
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
      mk.current.gps = new ml.Marker({ element: holder(el(gpsHtml())), anchor: "center" }).setLngLat([to.lng, to.lat]).addTo(map);
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
    map.getSource("navAccuracy")?.setData(gps.accuracy && gps.accuracy < 500 ? circleFC(gps.lat, gps.lng, gps.accuracy) : EMPTY_FC);
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
      map.easeTo({ pitch: Math.min(PITCH, maxPitchAt(map.getZoom(), coverRef.current)), bearing: 0, padding: NO_PAD, duration: 600 });
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
    if (guiding) return;
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
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      <style>{CSS}</style>
      <div ref={boxRef} className="cb3-map" style={{ position: "absolute", inset: 0 }} />
      <div className="cb3-zoom">
        <button type="button" aria-label={t("pdf.zoomIn")} onClick={() => zoomBy(1)}>+</button>
        <button type="button" aria-label={t("pdf.zoomOut")} onClick={() => zoomBy(-1)}>−</button>
      </div>
      <div className="cb3-attr">© OpenStreetMap contributors</div>
    </div>
  );
});
