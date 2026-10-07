import React from 'react';
import { C, FONT, mix } from './theme.js';

// イラスト調のキャンパスマップ（1920x1080）。実際の配置を厳密に再現したものではない。
export const ROUTE = [[980, 206], [980, 760], [1370, 760], [1370, 796]];
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ROUTE_LEN = ROUTE.slice(1).reduce((s, p, i) => s + segLen(ROUTE[i], p), 0);
export const DEST = [1370, 796];
export const HERE = ROUTE[0];

export const routePoint = (t) => {
  let d = Math.max(0, Math.min(1, t)) * ROUTE_LEN;
  for (let i = 1; i < ROUTE.length; i++) {
    const l = segLen(ROUTE[i - 1], ROUTE[i]);
    if (d <= l) {
      const k = d / l;
      return [mix(ROUTE[i - 1][0], ROUTE[i][0], k), mix(ROUTE[i - 1][1], ROUTE[i][1], k)];
    }
    d -= l;
  }
  return ROUTE[ROUTE.length - 1];
};

const ROADS = [
  'M 980 150 L 980 1060',
  'M 520 560 L 1940 560',
  'M 980 760 L 1940 760',
  'M 1520 150 L 1520 1060',
  'M 620 160 L 620 1060',
  'M 620 330 L 980 330',
];

const BUILDINGS = [
  { x: 1040, y: 590, w: 420, h: 120, label: '本館', lx: 1140 },
  { x: 1225, y: 566, w: 50, h: 168 },
  { x: 1570, y: 200, w: 260, h: 150, label: '図書館' },
  { x: 1570, y: 400, w: 260, h: 120, label: '講堂' },
  { x: 1030, y: 810, w: 200, h: 130, label: '南2号館' },
  { x: 1270, y: 810, w: 200, h: 150, label: '南3号館', dest: true },
  { x: 1570, y: 810, w: 230, h: 150, label: '南4号館' },
  { x: 750, y: 190, w: 182, h: 110, label: '西9号館', west: true },
  { x: 750, y: 380, w: 182, h: 130, label: '西5号館', west: true },
  { x: 750, y: 610, w: 182, h: 120, label: '西6号館', west: true },
  { x: 1870, y: 230, w: 120, h: 160 },
  { x: 1870, y: 620, w: 120, h: 110 },
  { x: 380, y: 200, w: 190, h: 120 },
  { x: 380, y: 620, w: 190, h: 130 },
  { x: 1040, y: 1000, w: 220, h: 110 },
];

// 決定的な木の配置
const TREES = (() => {
  const out = [];
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const lines = [[1010, 240, 1010, 520], [945, 380, 945, 720], [1060, 735, 1480, 735], [1060, 788, 1240, 788], [1545, 560, 1545, 740], [650, 800, 940, 1020], [1490, 230, 1490, 520]];
  lines.forEach(([x1, y1, x2, y2]) => {
    const n = Math.round(Math.hypot(x2 - x1, y2 - y1) / 46);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      out.push({ x: mix(x1, x2, k) + (rnd() - 0.5) * 10, y: mix(y1, y2, k) + (rnd() - 0.5) * 10, r: 12 + rnd() * 8 });
    }
  });
  return out;
})();

// westLabels: 全画面時は左の見出しパネルの縁から西側の建物名がはみ出すので消す
export const MapWorld = ({ f, route = 0, pin = 0, highlight = 0, walker = null, labels = 1, westLabels = 1 }) => {
  const dash = ROUTE_LEN * (1 - route);
  const halo = (f % 40) / 40;
  const w = walker !== null ? routePoint(walker) : null;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ display: 'block', fontFamily: FONT }}>
      <rect width="1920" height="1080" fill="#eef2ea" />
      {/* 緑地 */}
      <rect x="1030" y="200" width="440" height="330" rx="44" fill="#cfe5c3" />
      <rect x="1060" y="230" width="380" height="270" rx="32" fill="#c6e0b8" />
      <rect x="640" y="790" width="300" height="270" rx="44" fill="#d6eacc" />
      <rect x="1880" y="420" width="90" height="140" rx="20" fill="#d6eacc" />
      {/* 線路 */}
      <path d="M -40 132 C 600 114, 1300 98, 1960 72" stroke="#a9b4c0" strokeWidth="16" fill="none" />
      <path d="M -40 132 C 600 114, 1300 98, 1960 72" stroke="#ffffff" strokeWidth="4" strokeDasharray="26 18" fill="none" />
      {/* 道 */}
      {ROADS.map((d) => <path key={`o${d}`} d={d} stroke="#d3dce6" strokeWidth="46" strokeLinecap="round" fill="none" />)}
      {ROADS.map((d) => <path key={`i${d}`} d={d} stroke="#ffffff" strokeWidth="38" strokeLinecap="round" fill="none" />)}
      <circle cx="980" cy="182" r="48" fill="#ffffff" stroke="#d3dce6" strokeWidth="4" />
      {/* 木 */}
      {TREES.map((t, i) => (
        <g key={i}>
          <circle cx={t.x} cy={t.y + 3} r={t.r} fill="rgba(14,32,48,0.06)" />
          <circle cx={t.x} cy={t.y} r={t.r} fill="#b4d9a3" stroke="#9cc98b" strokeWidth="2" />
        </g>
      ))}
      {/* 建物 */}
      {BUILDINGS.map((b, i) => {
        const hl = b.dest ? highlight : 0;
        return (
          <g key={i}>
            <rect x={b.x} y={b.y + 7} width={b.w} height={b.h} rx="14" fill="rgba(14,32,48,0.07)" />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="14"
              fill={hl > 0 ? `rgba(40,200,104,${0.08 + 0.14 * hl})` : '#ffffff'}
              stroke={hl > 0 ? C.accent : '#c9d4df'} strokeWidth={2 + 2 * hl} />
            {b.label && (
              <text x={b.lx ?? b.x + b.w / 2} y={b.y + b.h / 2 + 8} textAnchor="middle" fontSize="22" fontWeight="800"
                fill={hl > 0.5 ? C.accentDeep : '#5a7088'} opacity={labels * (b.west ? westLabels : 1)}>{b.label}</text>
            )}
          </g>
        );
      })}
      {/* 駅 */}
      <rect x="860" y="80" width="240" height="62" rx="16" fill="#ffffff" stroke="#a9b4c0" strokeWidth="2.5" />
      <text x="980" y="121" textAnchor="middle" fontSize="23" fontWeight="800" fill="#4a6078" opacity={labels}>大岡山駅</text>

      {/* ルート */}
      {route > 0 && (
        <>
          <polyline points={ROUTE.map((p) => p.join(',')).join(' ')} fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={ROUTE_LEN} strokeDashoffset={dash} />
          <polyline points={ROUTE.map((p) => p.join(',')).join(' ')} fill="none" stroke="#1a8ef0" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={ROUTE_LEN} strokeDashoffset={dash} />
          {route >= 1 && (
            <polyline points={ROUTE.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray="2 22" strokeDashoffset={-f * 1.6} />
          )}
        </>
      )}

      {/* 現在地 */}
      <circle cx={HERE[0]} cy={HERE[1]} r={14 + 34 * halo} fill={`rgba(26,142,240,${0.3 * (1 - halo)})`} />
      <circle cx={HERE[0]} cy={HERE[1]} r="15" fill="#1a8ef0" stroke="#ffffff" strokeWidth="5" />
      <g opacity={labels}>
        <rect x={HERE[0] + 26} y={HERE[1] - 19} width="96" height="38" rx="19" fill="#0e2030" />
        <text x={HERE[0] + 74} y={HERE[1] + 7} textAnchor="middle" fontSize="18" fontWeight="800" fill="#ffffff">現在地</text>
      </g>

      {/* 歩いている人 */}
      {w && (
        <g transform={`translate(${w[0]} ${w[1]})`}>
          <circle r="20" fill="rgba(26,142,240,0.25)" />
          <circle r="11" fill="#ffffff" stroke="#1a8ef0" strokeWidth="5" />
        </g>
      )}

      {/* 目的地ピン */}
      {pin > 0 && (
        <g transform={`translate(${DEST[0]} ${DEST[1]})`}>
          <ellipse cx="0" cy="2" rx={18 * pin} ry={6 * pin} fill="rgba(14,32,48,0.2)" />
          <g transform={`translate(0 ${-150 * (1 - pin)}) scale(${0.6 + 0.4 * Math.min(1, pin)})`}>
            <path d="M 0 0 C -16 -22 -32 -38 -32 -60 A 32 32 0 1 1 32 -60 C 32 -38 16 -22 0 0 Z" fill={C.accent} stroke="#ffffff" strokeWidth="4" />
            <circle cx="0" cy="-60" r="12" fill="#ffffff" />
          </g>
        </g>
      )}
    </svg>
  );
};
