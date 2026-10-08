// インスタのストーリー用（StoryPromo・縦 1080x1920・約20秒）の尺・曲・色。
// アニメーション補助と配色は ver1 の theme.js をそのまま使う。
export { FPS, BEAT, BAR, C, GRAD_TEXT, FONT, EASE_OUT, EASE_IN_OUT, EASE_IN, ease, sp, mix } from '../promo/theme.js';

export const SW = 1080;
export const SH = 1920;
// ストーリーの画面で隠れやすいところ（上：プロフィールと進行バー、下：返信欄やリンクのスタンプ）。
// 文字はこの間（250〜1600）に置く
export const SAFE = { top: 250, bottom: 1600 };

// 曲は ver2 と同じ bgm.mp3（150 BPM・1小節 48 フレーム）。
//   0–384    曲の 57.65s〜（ベースが戻る「ドロップ」から8小節）
//   384〜    曲の 172.85s〜（最後の4小節）。曲は 178.85s（最後の小節の4拍目）の一打で終わる＝動画の 564f
// どちらも8小節の区切りなので、つないでも聞こえない。from は「その位置で鳴らす曲のフレーム」
export const SONG_S = {
  file: 'promo/bgm.mp3',
  partA: { from: 1730, until: 384 },
  partB: { from: 5186, at: 383 },
  stop: 564, // 最後の一打（書き出し後の音は約 23ms 後に来る）
};

// 場面（1小節 = 48 フレーム = 1.6秒）
export const TS = {
  hook: 0, // 大学生活、ぜんぶ入り。（2小節）
  navi: 96, // 3Dキャンパスナビ（3小節）
  cls: 240, // 時間割・出欠
  lunch: 288, // 空き教室・DM
  tasks: 336, // 課題の提出
  fest: 384, // 工大祭（ここから曲の最後の4小節）
  wall: 432, // ほかにも、ぜんぶ入り。
  end: 480, // エンドカード
  total: 612,
};

// 場面ごとの背景（上・中・下の3色）。dark は文字を白にする場面
export const BG = [
  { at: TS.hook, c: ['#5fb0f0', '#cfe7f9', '#fff3e2'] },
  { at: TS.navi, c: ['#3fbf95', '#cdf0e1', '#f2fbf7'] },
  { at: TS.cls, c: ['#4d9ff0', '#cde5fa', '#f3f9fe'] },
  { at: TS.lunch, c: ['#2fb0e2', '#c4ebf8', '#f7fcff'] },
  { at: TS.tasks, c: ['#7d9fe0', '#e6d9ee', '#ffdcbf'] },
  { at: TS.fest, c: ['#1b1745', '#4f2468', '#c8684f'], dark: true },
  { at: TS.wall, c: ['#050816', '#0d1636', '#1b2a52'], dark: true },
  { at: TS.end, c: ['#5fb0f0', '#cfe7f9', '#fff3e2'] },
];
