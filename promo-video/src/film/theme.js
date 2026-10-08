// 最高傑作版（AppPromoFilm・1920x1080・約3分）の尺・曲・色。
// アニメーションの補助（ease, sp, mix …）は ver1 の theme.js をそのまま使う。
export { FPS, W, H, BEAT, BAR, C, GRAD_TEXT, GRAD_ICON, FONT, CLAMP, EASE_OUT, EASE_IN_OUT, EASE_IN, ease, sp, spSoft, mix, alpha } from '../promo/theme.js';

// ── 曲 ──────────────────────────────────────────────
// ver1・ver2 と同じ曲（150 BPM・1小節 48 フレーム）を、頭から最後まで通しで使う。
//   0–192     イントロ（低音だけの4小節）
//   192–1344  ビートが入る（24小節）
//   1344–1728 ベースが抜けるブレイク（8小節）
//   1728      ベースが戻る「ドロップ」
//   1728–5184 72小節
//   5184–     最後の4小節。178.85s（最後の小節の4拍目）の一打で止まる
// 曲の小節頭は 0.047s + 1.6s × n。1 フレーム（0.033s）から読むので、拍はカットの約 14ms 後に来る。
// （render_film.mjs は音を WAV で書き出してから AAC にし、MP4 の edit list で先頭の詰め物を消すので、音の遅れは足さない）
export const SONG = { file: 'promo/bgm.mp3', from: 1, volume: 0.74 };

// ── 場面の区切り（フレーム）。すべて小節の頭 ──────────────
export const TL = {
  open: 0, // 暗闇に「4月。」
  hero: 144, // 真上から見た春のキャンパスがにじみ出る
  rise: 192, // ビートが入る＝建物が立ち上がる
  maze: 576, // 「どこへ行けばいい？」本館のまわりを回る
  chaos: 768, // 情報は、あちこちに（窓が増えていく）
  build: 1152, // 窓が限界まで増えて、ツバメが突き抜ける
  brk: 1344, // ブレイク：空とツバメ
  one: 1440, // 「大学生活を、」
  one2: 1536, // 「ひとつに。」
  land: 1728, // ドロップ：ツバメがアイコンに着地 → ロゴ
  home: 1824, // ホーム（カードが浮き上がる）
  spring: 2112, // 春
  tt: 2208, // 時間割
  navi: 2496, // 3Dキャンパスナビ（全画面）
  naviUI: 2688, // スマホの案内画面
  summer: 2880, // 夏
  asgn: 2976, // 締切の通知 → 提出
  free: 3264, // 空き教室
  social: 3456, // DM・友達
  autumn: 3648, // 秋
  fest: 3744, // 工大祭の夜
  winter: 4032, // 冬
  exams: 4128, // 試験・成績
  you: 4416, // 17のテーマ
  langs: 4608, // 5つの言語
  devices: 4704, // スマホでも、PCでも
  all: 4800, // 大学生活の、ぜんぶ
  outro: 5184, // エンドカード
  hit: 5364, // 曲の最後の一打
  total: 5430,
};

// ── 季節の色 ────────────────────────────────────────
// bg: 背景の3色（上・中・下）、ink: 文字、sub: 小さい文字、accent: アプリのテーマのアクセント
export const SEASONS = {
  spring: { kanji: '春', en: 'SPRING', ja: 'はじまりの季節', theme: 'sakura', bg: ['#fbe3ec', '#fff2f5', '#fffaf6'], ink: '#3a1f2b', sub: '#a0687e', accent: '#d4507a' },
  summer: { kanji: '夏', en: 'SUMMER', ja: 'まなびの季節', theme: 'shinryoku', bg: ['#d7efe0', '#eef8f1', '#fbfdf9'], ink: '#14281a', sub: '#5f8a6c', accent: '#2e8b57' },
  autumn: { kanji: '秋', en: 'AUTUMN', ja: 'まつりの季節', theme: 'koyo', bg: ['#140c0a', '#2a1610', '#4a2416'], ink: '#fff3e6', sub: '#d9a988', accent: '#e8863a' },
  winter: { kanji: '冬', en: 'WINTER', ja: 'しめくくりの季節', theme: 'yuki', bg: ['#dbe7f2', '#eef3f8', '#fbfcfe'], ink: '#14263a', sub: '#6d88a6', accent: '#4a80b4' },
};

// 背景（空）の色の移り変わり。キーの blend フレーム前から混ぜ始める
export const SKY = [
  { at: 0, c: ['#000000', '#000000', '#000000'] },
  { at: TL.chaos, c: ['#dfe5ec', '#eef1f5', '#f7f8fa'], blend: 6 },
  { at: TL.build, c: ['#c9d0d9', '#dde2e8', '#eceff3'], blend: 90 },
  { at: TL.build + 160, c: ['#9aa3ae', '#b9c0c9', '#d2d7dd'], blend: 30 },
  { at: TL.brk, c: ['#ffd9c2', '#ffe9dc', '#fff6ee'], blend: 4 },
  { at: TL.one, c: ['#a9d5f7', '#dcecf8', '#fff4e8'], blend: 96 },
  { at: TL.land, c: ['#8fcaf6', '#dff0fb', '#fbf6ec'], blend: 40 },
  { at: TL.home, c: ['#cfe6f7', '#eaf4fb', '#f8fbfd'], blend: 30 },
  { at: TL.spring, c: SEASONS.spring.bg, blend: 8 },
  { at: TL.summer, c: SEASONS.summer.bg, blend: 8 },
  { at: TL.autumn, c: SEASONS.autumn.bg, blend: 8 },
  { at: TL.winter, c: SEASONS.winter.bg, blend: 8 },
  { at: TL.you, c: ['#1b1f2a', '#272c3a', '#333a4c'], blend: 8 },
  { at: TL.all, c: ['#050816', '#0d1636', '#1b2a52'], blend: 10 },
  { at: TL.outro, c: ['#a9d5f7', '#e4f1fb', '#fff6ec'], blend: 24 },
];
