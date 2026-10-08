import React from 'react';
import { BASEMAP } from '../../../campus-sns/campusBasemapData.js';
import ROUTE from './campusRoute.json';

// 大岡山キャンパスの3D表示（アプリのイラスト地図と同じ OSM データ・配色）。
// 簡単な透視投影を自前で行い、建物は外壁を立ち上げて描く（奥から順に塗る画家のアルゴリズム）。
// 座標はメートル：x = 東、y = 北、z = 上。

const PAL = {
  ground: '#dfe6ec', park: '#d3e8c5', pitch: '#c7e2b6', track: '#ead7c6', wood: '#bddcaa', water: '#c4ddf0',
  streetCase: '#d4dde6', street: '#ffffff', walk: '#ffffff', rail: '#a6b1bd', platform: '#cbd3dc',
  roof: '#ffffff', wallLight: [228, 235, 242], wallDark: [158, 176, 198], stroke: '#bccad8', label: '#4c6480',
  dest: '#28c868', route: '#1a8ef0',
};

const LAT0 = 35.6061;
const LNG0 = 139.6838;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110950;
export const toXY = ([lat, lng]) => [(lng - LNG0) * KX, (lat - LAT0) * KY];

const area = (r) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
// 外周は反時計回り、穴は時計回りにそろえる（壁の表裏判定に使う）
const orient = (r, ccw) => (area(r) > 0 === ccw ? r : [...r].reverse());

const hash = (s) => {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

// 建物の高さ（m）。データに階数がないので、面積から決めて少し揺らす。目的地と目立つ建物は手で決める
const HEIGHTS = { w9: 38, main: 24, lib: 12, gym: 15, hyaku: 26 };
const BUILDINGS = BASEMAP.buildings.map((b, i) => {
  const outer = orient(b.p.map(toXY), true);
  const holes = (b.h || []).map((h) => orient(h.map(toXY), false));
  const a = Math.abs(area(outer));
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
  const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  const base = 11 + Math.min(17, Math.sqrt(a) / 3.2) + hash(b.s || b.n || i) * 6;
  return { id: b.s || `b${i}`, name: b.n, spot: b.s, outer, holes, cx, cy, h: HEIGHTS[b.s] ?? base, dest: b.s === 'w9' };
});

const GREEN = BASEMAP.green.map((g) => ({ k: g.k, p: g.p.map(toXY) }));
const WATER = BASEMAP.water.map((w) => w.map(toXY));
const STREETS = Object.fromEntries(Object.entries(BASEMAP.streets).map(([k, lines]) => [k, lines.map((l) => l.map(toXY))]));
const RAIL = (BASEMAP.rail.surface || []).map((l) => l.map(toXY));
const PLATFORMS = BASEMAP.platforms.map((p) => p.map(toXY));
export const STATION = toXY([BASEMAP.stations[0].lat, BASEMAP.stations[0].lng]);
export const ROUTE_XY = ROUTE.points.map(toXY);
export const DEST_XY = ROUTE_XY[ROUTE_XY.length - 1];
const SEG = ROUTE_XY.slice(1).map((p, i) => Math.hypot(p[0] - ROUTE_XY[i][0], p[1] - ROUTE_XY[i][1]));
export const ROUTE_LEN = SEG.reduce((a, b) => a + b, 0);

// ルート上で、全体の t（0〜1）の位置と進行方向（度・北=0 時計回り）
export const routeAt = (t) => {
  let d = Math.max(0, Math.min(1, t)) * ROUTE_LEN;
  for (let i = 0; i < SEG.length; i++) {
    if (d <= SEG[i] || i === SEG.length - 1) {
      const k = SEG[i] ? Math.min(1, d / SEG[i]) : 0;
      const a = ROUTE_XY[i];
      const b = ROUTE_XY[i + 1];
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dir: (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI };
    }
    d -= SEG[i];
  }
  return { x: DEST_XY[0], y: DEST_XY[1], dir: 0 };
};

// カメラ：注視点 (tx, ty)、距離 dist(m)、俯角 pitch（0 = 真上から）、方位 yaw（度・画面の上が向く方角）、焦点距離 f(px)
export const makeCamera = ({ tx, ty, dist, pitch, yaw, f = 1400, w = 1920, h = 1080, cx = w / 2, cy = h / 2 }) => {
  const p = (pitch * Math.PI) / 180;
  const y = (yaw * Math.PI) / 180;
  const sp = Math.sin(p);
  const cp = Math.cos(p);
  const sy = Math.sin(y);
  const cyw = Math.cos(y);
  const proj = (X, Y, Z = 0) => {
    const dx = X - tx;
    const dy = Y - ty;
    const xr = dx * cyw - dy * sy;
    const yr = dx * sy + dy * cyw;
    const vx = xr;
    const vy = yr * cp + Z * sp;
    const vz = yr * sp - Z * cp + dist;
    const k = f / Math.max(1, vz);
    return [cx + vx * k, cy - vy * k, vz, k];
  };
  // カメラの水平位置（壁の表裏判定と、奥から塗る順番に使う）
  return { proj, camX: tx - dist * sp * sy, camY: ty - dist * sp * cyw, f };
};

const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const pathOf = (rings) => rings.map((r) => `M${r.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`).join('');

const shade = (nx, ny) => {
  // 南西からの光
  const l = Math.max(0, Math.min(1, 0.5 + 0.5 * (nx * -0.55 + ny * -0.83)));
  const c = PAL.wallDark.map((d, i) => Math.round(d + (PAL.wallLight[i] - d) * l));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// rise: 建物の高さの倍率（0 で平面）、route: ルートを描いた割合、walker: 歩いている人の位置（0〜1, null で非表示）
export const Campus3D = ({ cam, rise = 1, route = 0, walker = null, dest = 0, labels = 1, w = 1920, h = 1080, frame = 0, haze = '#e4f0fa' }) => {
  const { proj } = cam;
  const camX = cam.camX;
  const camY = cam.camY;
  const P = (p, z = 0) => proj(p[0], p[1], z);

  // 地面
  const ground = [];
  GREEN.forEach((g, i) => ground.push(<polygon key={`g${i}`} points={pts(g.p.map((p) => P(p)))} fill={PAL[g.k] || PAL.park} />));
  WATER.forEach((wr, i) => ground.push(<polygon key={`w${i}`} points={pts(wr.map((p) => P(p)))} fill={PAL.water} />));
  const streetW = { major: 13, mid: 9, minor: 6, ped: 3.2 };
  const scaleAt = (p) => P(p)[3];
  ['major', 'mid', 'minor', 'ped'].forEach((k) => (STREETS[k] || []).forEach((l, i) => {
    const mid = l[Math.floor(l.length / 2)];
    const sw = streetW[k] * scaleAt(mid);
    const d = `M${l.map((p) => P(p).slice(0, 2).map((v) => v.toFixed(1)).join(' ')).join('L')}`;
    ground.push(<path key={`sc${k}${i}`} d={d} fill="none" stroke={PAL.streetCase} strokeWidth={sw + 2} strokeLinecap="round" strokeLinejoin="round" />);
    ground.push(<path key={`s${k}${i}`} d={d} fill="none" stroke={k === 'ped' ? PAL.walk : PAL.street} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />);
  }));
  PLATFORMS.forEach((pl, i) => ground.push(<polygon key={`pl${i}`} points={pts(pl.map((p) => P(p)))} fill={PAL.platform} />));
  RAIL.forEach((l, i) => {
    const d = `M${l.map((p) => P(p).slice(0, 2).map((v) => v.toFixed(1)).join(' ')).join('L')}`;
    const sw = 5 * scaleAt(l[Math.floor(l.length / 2)]);
    ground.push(<path key={`r${i}`} d={d} fill="none" stroke={PAL.rail} strokeWidth={sw} />);
    ground.push(<path key={`rd${i}`} d={d} fill="none" stroke="#fff" strokeWidth={sw * 0.4} strokeDasharray={`${sw * 2} ${sw * 2}`} />);
  });

  // 建物：カメラから遠い順に、外壁（表を向いている面だけ）→ 屋根
  const order = BUILDINGS.map((b) => ({ b, d: Math.hypot(b.cx - camX, b.cy - camY) })).sort((a, b) => b.d - a.d);
  const solids = [];
  order.forEach(({ b }) => {
    const H = b.h * rise;
    const isDest = b.dest && dest > 0;
    const walls = [];
    const addWalls = (ring) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const nx = c[1] - a[1];
        const ny = -(c[0] - a[0]);
        const len = Math.hypot(nx, ny) || 1;
        const mx = (a[0] + c[0]) / 2;
        const my = (a[1] + c[1]) / 2;
        if (nx * (camX - mx) + ny * (camY - my) <= 0) continue; // 裏向き
        walls.push({ a, c, n: [nx / len, ny / len], d: Math.hypot(mx - camX, my - camY) });
      }
    };
    if (H > 0.3) {
      addWalls(b.outer);
      b.holes.forEach(addWalls);
      walls.sort((p, q) => q.d - p.d);
    }
    walls.forEach((wl, i) => {
      const q = [P(wl.a), P(wl.c), P(wl.c, H), P(wl.a, H)];
      const fill = isDest ? mixHex('#9fdcb5', '#2a9d5f', 0.5 + 0.5 * (wl.n[0] * -0.55 + wl.n[1] * -0.83)) : shade(wl.n[0], wl.n[1]);
      solids.push(<polygon key={`${b.id}w${i}`} points={pts(q)} fill={fill} stroke={fill} strokeWidth="0.6" />);
    });
    const roof = pathOf([b.outer, ...b.holes].map((r) => r.map((p) => P(p, H))));
    solids.push(<path key={`${b.id}r`} d={roof} fill={isDest ? mixHex('#ffffff', '#c6f2d5', dest) : PAL.roof} fillRule="evenodd" stroke={isDest ? PAL.dest : PAL.stroke} strokeWidth={isDest ? 2.4 : 1} strokeLinejoin="round" />);
  });

  // ルート（地面から少し浮かせる）
  let routeEl = null;
  if (route > 0) {
    const n = 80;
    const pts2 = [];
    for (let i = 0; i <= n; i++) {
      const r = routeAt((i / n) * route);
      const s = P([r.x, r.y], 0.6);
      pts2.push(`${s[0].toFixed(1)},${s[1].toFixed(1)}`);
    }
    const mid = routeAt(route * 0.5);
    const sw = 7 * scaleAt([mid.x, mid.y]);
    routeEl = (
      <g>
        <polyline points={pts2.join(' ')} fill="none" stroke="rgba(26,142,240,0.25)" strokeWidth={sw * 2.6} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts2.join(' ')} fill="none" stroke="#ffffff" strokeWidth={sw * 1.5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts2.join(' ')} fill="none" stroke={PAL.route} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  // 目的地のピンと、歩いている人
  const destS = P(DEST_XY, 0);
  const walkerS = walker != null ? P([routeAt(walker).x, routeAt(walker).y], 0.6) : null;
  const ring = (frame % 36) / 36;

  // ラベル
  const LABELS = [
    { at: [BUILDINGS.find((b) => b.spot === 'main')], text: '本館' },
    { at: [BUILDINGS.find((b) => b.spot === 'w9')], text: '西9号館', dest: true },
    { at: [BUILDINGS.find((b) => b.spot === 'lib')], text: '図書館' },
    { at: [BUILDINGS.find((b) => b.spot === 'gym')], text: '体育館' },
    { at: [BUILDINGS.find((b) => b.spot === 'hyaku')], text: '百年記念館' },
    { at: [BUILDINGS.find((b) => b.spot === 'taki')], text: 'Taki Plaza' },
  ].filter((l) => l.at[0]);

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <rect x="0" y="0" width={w} height={h} fill={PAL.ground} />
        {ground}
        {routeEl}
        {solids}
        {/* 建物に隠れたルートも薄く見えるように */}
        {routeEl && <g opacity="0.38">{routeEl}</g>}
        {walkerS && (
          <g>
            <circle cx={walkerS[0]} cy={walkerS[1]} r={14 + 26 * ring} fill="none" stroke={PAL.route} strokeWidth="3" opacity={0.6 * (1 - ring)} />
            <circle cx={walkerS[0]} cy={walkerS[1]} r="13" fill="#ffffff" />
            <circle cx={walkerS[0]} cy={walkerS[1]} r="9" fill={PAL.route} />
          </g>
        )}
      </svg>
      {/* 遠くを空の色にかすませる */}
      {haze && <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h * 0.5, background: `linear-gradient(180deg, ${haze} 0%, ${haze}cc 30%, ${haze}00 100%)` }} />}
      {labels > 0 && LABELS.map((l) => {
        const b = l.at[0];
        const s = P([b.cx, b.cy], b.h * rise + 2);
        if (s[2] <= 0) return null;
        return (
          <div key={l.text} style={{
            position: 'absolute', left: s[0], top: s[1], transform: 'translate(-50%, -100%)', whiteSpace: 'nowrap', opacity: labels,
            fontSize: l.dest ? 30 : 21, fontWeight: l.dest ? 900 : 800, color: l.dest ? '#fff' : PAL.label,
            padding: l.dest ? '8px 16px' : 0, borderRadius: 12, background: l.dest ? PAL.dest : 'none',
            textShadow: l.dest ? 'none' : '0 0 6px #fff, 0 0 6px #fff, 0 0 3px #fff',
            boxShadow: l.dest ? '0 12px 24px -10px rgba(14,32,48,0.5)' : 'none',
          }}>{l.text}</div>
        );
      })}
      {dest > 0 && (
        <div style={{ position: 'absolute', left: destS[0], top: destS[1], transform: `translate(-50%, -100%) scale(${dest})`, transformOrigin: '50% 100%' }}>
          <svg width="44" height="58" viewBox="0 0 44 58"><path d="M22 57C22 57 42 33 42 21A20 20 0 1 0 2 21C2 33 22 57 22 57Z" fill={PAL.dest} stroke="#fff" strokeWidth="3" /><circle cx="22" cy="21" r="7" fill="#fff" /></svg>
        </div>
      )}
    </div>
  );
};

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (s) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
