import { Easing, interpolate, spring } from 'remotion';

// ── 尺とリズム ──────────────────────────────────────
// BGM（public/promo/bgm.mp3）はちょうど 150 BPM。
// 30fps なら 1拍 = 12フレーム、1小節 = 48フレームで、全カットをこの格子に乗せている。
export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const BEAT = 12;
export const BAR = 48;

// シーン境界（フレーム）。曲の構成：
//   0–192   イントロ（ハイハット無し）  → 課題提起
//   192     ハイハットが入る「ドロップ」 → ロゴ登場
//   1344    ベースが抜けるブレイク      → デバイス紹介〜エンドカード
export const T = {
  hook: 0,
  reveal: 192,
  home: 288,
  timetable: 480,
  tasks: 672,
  social: 864,
  map: 1056,
  wall: 1248,
  devices: 1344,
  end: 1440,
  total: 1620,
};

// ── 色（アプリの TSUBAME テーマ＋アイコンのグラデーション）──────
export const C = {
  bg: '#eef5fb',
  bg2: '#f6fafd',
  bg3: '#e0ecf6',
  bg4: '#d2e2ee',
  card: '#ffffff',
  bd: '#c8dcea',
  bdL: '#b8cedf',
  tx: '#3a5870',
  txH: '#0e2030',
  txD: '#7898b0',
  accent: '#28c868',
  accentDeep: '#1fa557',
  red: '#d44050',
  orange: '#d08040',
  yellow: '#d4a420',
  blue: '#1a9cf0',
  teal: '#1d8a7c',
};

// 見出しの強調語（白背景で読める濃さに寄せたアイコン配色）
export const GRAD_TEXT = 'linear-gradient(95deg, #0a8de4 0%, #13b26a 58%, #6fb515 100%)';
export const GRAD_ICON = 'linear-gradient(135deg, #1a9cf0 0%, #28c868 50%, #f2d21c 100%)';

export const FONT = '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';

// 科目（アプリのデモデータと同じ配色）
export const COURSE = {
  T243: { code: 'CSC.T243', short: 'T243', name: 'データ構造とアルゴリズム', room: 'W6-31', bldg: '西6号館', col: '#a855c7' },
  T223: { code: 'MCS.T223', short: 'T223', name: '線形代数学第二', room: 'W5-21', bldg: '西5号館', col: '#6375f0' },
  T253: { code: 'CSC.T253', short: 'T253', name: '論理と形式言語', room: 'S2-203', bldg: '南2号館', col: '#e5534b' },
  A101: { code: 'LAS.A101', short: 'A101', name: '英語第二 S', room: 'W9-31', bldg: '西9号館', col: '#3dae72' },
  T273: { code: 'CSC.T273', short: 'T273', name: '計算機科学実験第一', room: 'S3-115', bldg: '南3号館', col: '#d4843e' },
  T213: { code: 'MCS.T213', short: 'T213', name: '確率と統計', room: 'W5-21', bldg: '西5号館', col: '#2d9d8f' },
  T263: { code: 'CSC.T263', short: 'T263', name: 'コンピュータアーキテクチャ', room: 'W6-31', bldg: '西6号館', col: '#c678dd' },
  C103: { code: 'LAS.C103', short: 'C103', name: '立志プロジェクト', room: 'WL1-301', bldg: '西講義棟1', col: '#c75d8e' },
};

export const PEOPLE = {
  hanako: { name: '山田花子', avatar: 'H', col: '#e5534b' },
  ichiro: { name: '鈴木一郎', avatar: 'I', col: '#6375f0' },
  kenta: { name: '佐藤健太', avatar: 'K', col: '#d4843e' },
};

// ── アニメーション補助 ───────────────────────────────
export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.55, 0, 1, 0.45);

// 区間 [a,b] で from→to（範囲外はクランプ）
// （exitAt = Infinity のような「起きない」区間も渡せるようにしておく）
export const ease = (f, [a, b], [from, to], easing = EASE_OUT) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return f < a ? from : to;
  return interpolate(f, [a, b], [from, to], { ...CLAMP, easing });
};

// delay フレーム後に 0→1 へ弾むばね
export const sp = (f, delay = 0, config = {}) =>
  spring({ frame: f - delay, fps: FPS, config: { damping: 16, stiffness: 170, mass: 0.85, ...config } });

// 落ち着いた（ほぼオーバーシュートしない）ばね
export const spSoft = (f, delay = 0) => sp(f, delay, { damping: 26, stiffness: 120, mass: 1 });

export const mix = (a, b, t) => a + (b - a) * t;

// '#rrggbb' → 'rgba(r,g,b,a)'
export const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
