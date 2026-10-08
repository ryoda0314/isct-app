// ver2（AppPromoV2）の尺と色。アニメーション補助は ver1 の theme.js をそのまま使う。
export { FPS, W, H, BEAT, BAR, C, GRAD_TEXT, GRAD_ICON, FONT, CLAMP, EASE_OUT, EASE_IN_OUT, EASE_IN, ease, sp, spSoft, mix, alpha } from '../promo/theme.js';

// ── 尺とリズム ──────────────────────────────────────
// BGM は ver1 と同じ曲（150 BPM・1小節 48 フレーム）だが、使う場所を変える：
//   0–1536   曲の 44.85s〜（ブレイク8小節 → 57.65s でベースが戻る → 24小節）
//   1536〜   曲の 172.85s〜（最後の4小節。179.25s の一打で止まる＝動画の 1727f）
// 8小節の区切りどうしでつないでいるので、継ぎ目は聞こえない。
export const SONG = {
  file: 'promo/bgm.mp3',
  // 書き出し後の音声は AAC の先頭パディングで約 43ms 遅れる。曲の小節頭 44.847s を
  // 1346 フレーム（44.867s）から読むと、拍がカット（12f 格子）の約 23ms 後に来る。
  partA: { from: 1346, at: 0, until: 1536 },
  partB: { from: 5186, at: 1535 }, // from は動画の 1536f（partA.until）に当たる曲の位置。1フレーム前から重ねて入れ替える
  stop: 1727, // 最後の一打
};

export const T2 = {
  open: 0, // 夜明け（ブレイク：ベースなし）
  lock: 96, // ロック画面に通知が届く
  words: 216, // 授業。課題。…
  unlock: 312, // ロック解除 → ホーム → ドロップへ
  logo: 384, // ドロップ（ベースが戻る）→ ロゴ
  home: 480, // 8:40 ホーム
  navi: 624, // 8:42 キャンパスナビ（4小節）
  cls: 816, // 8:50 1限
  lunch: 960, // 12:40 昼休み
  tasks: 1104, // 17:20 放課後の課題
  fest: 1248, // 10/10 工大祭
  wall: 1392, // ぜんぶ入り
  end: 1536, // アウトロ → エンドカード
  total: 1764,
};

// 時間帯ごとの空（上・中・下の3色）。キーの blend フレーム前（既定 30）から混ぜ始める
export const SKY = [
  { at: T2.open, c: ['#050a18', '#0f1d3d', '#1d2c52'] },
  { at: T2.lock + 60, c: ['#0d1b3f', '#3a3f78', '#c47b7b'], blend: 110 },
  { at: T2.unlock + 20, c: ['#28407e', '#8a83b5', '#f4b48a'], blend: 120 },
  { at: T2.logo, c: ['#7cc0f4', '#cfe6f7', '#fff3e3'], blend: 40 },
  { at: T2.home, c: ['#8fcaf6', '#dff0fb', '#fbf6ec'] },
  { at: T2.navi, c: ['#9ad2f8', '#e4f2fb', '#f3f8fb'] },
  { at: T2.cls, c: ['#62b4f2', '#cfe8fa', '#f1f8fd'] },
  { at: T2.lunch, c: ['#4aa8f0', '#c8e6fb', '#f6fbff'] },
  { at: T2.tasks, c: ['#7eaee6', '#e8dfee', '#ffe2c4'] },
  { at: T2.fest + 4, c: ['#1b1745', '#5b2a6e', '#e2795c'], blend: 22 },
  { at: T2.fest + 80, c: ['#0b0c2a', '#2a1b4e', '#7a3460'] },
  { at: T2.wall, c: ['#050816', '#0d1636', '#1b2a52'] },
  { at: T2.end, c: ['#1b2f66', '#6d86c7', '#ffd9b0'], blend: 24 },
  { at: T2.end + 70, c: ['#6bb6f2', '#cde6f8', '#fff4e4'], blend: 60 },
];

// 時刻表示（左上の時計）
export const CLOCK = [
  { at: T2.home, t: '8:40', s: 'WED', label: '1限の前' },
  { at: T2.navi, t: '8:42', s: 'WED', label: '大岡山駅' },
  { at: T2.cls, t: '8:50', s: 'WED', label: '1限' },
  { at: T2.lunch, t: '12:40', s: 'WED', label: '昼休み' },
  { at: T2.tasks, t: '17:20', s: 'WED', label: '放課後' },
  { at: T2.fest, t: '10/10', s: 'SAT', label: '工大祭' },
];
