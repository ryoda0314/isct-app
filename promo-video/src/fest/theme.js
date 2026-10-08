// 工大祭の出店団体むけ「アプリで宣伝しませんか？」の縦動画（FestPromo・1080x1920・約23.6秒）の尺と曲。
// 部品と配色はストーリー用（src/story）と共通。
export { FPS, BEAT, BAR, C, FONT, EASE_OUT, EASE_IN_OUT, EASE_IN, ease, sp, mix, SW, SH, SAFE } from '../story/theme.js';

// 曲は同じ bgm.mp3（150 BPM・1小節 48 フレーム）。
//   0–96     曲の 54.45s〜：ベースの無い2小節（問いかけ）
//   96       57.65s：ベースが戻る「ドロップ」（答え）
//   96–480   そこから8小節（70.45s は8小節の区切り）
//   480〜    172.85s〜（最後の4小節）。178.85s の一打＝動画の 660f で締める
// from は「その位置で鳴らす曲のフレーム」（小節頭の 20ms 後から読むと、書き出し後に拍がカットの約 23ms 後に来る）
export const SONG_F = {
  file: 'promo/bgm.mp3',
  partA: { from: 1634, until: 480 },
  partB: { from: 5186, at: 479 },
  stop: 660,
};

// 場面（1小節 = 48 フレーム = 1.6秒）
export const TF = {
  hook: 0, // 工大祭に出店するみなさんへ。（ベースなし）
  ask: 48, // その出店、アプリで宣伝しませんか？
  drop: 96, // ドロップ：工大祭ページ（呼びかけカードと出店一覧）
  page: 144, // 出店ページ（2小節）
  map: 240, // マップで道案内
  coupon: 288, // 学生限定クーポン（学生が使う）
  count: 336, // 使われた数（出店者が見る）
  form: 384, // 申請フォームと自動保存
  members: 432, // メンバー用QR
  listed: 480, // 申請 → 掲載の通知
  end: 528, // エンドカード（660f の一打で締める）
  total: 708,
};

// 場面ごとの背景（工大祭のテーマ「Sparkle」に合わせて夜空の色）。どれも暗いので文字は白
export const BGF = [
  { at: TF.hook, c: ['#07081f', '#1d1440', '#3f1f5c'], dark: true },
  { at: TF.drop, c: ['#1b1745', '#4f2468', '#c8684f'], dark: true },
  { at: TF.page, c: ['#241a5a', '#5f3489', '#d9805a'], dark: true },
  { at: TF.map, c: ['#13245e', '#2f5ea5', '#69b6d6'], dark: true },
  { at: TF.coupon, c: ['#3d0f30', '#8f2a55', '#ea7b62'], dark: true },
  { at: TF.form, c: ['#171544', '#352a7a', '#7a5ab8'], dark: true },
  { at: TF.members, c: ['#0c2238', '#1a5866', '#3fa58f'], dark: true },
  { at: TF.listed, c: ['#1b1745', '#4f2468', '#c8684f'], dark: true },
  { at: TF.end, c: ['#07081f', '#24164a', '#6a2e5e'], dark: true },
];
