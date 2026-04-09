import { createContext, useContext } from "react";

// ── ベーステーマ ──────────────────────────────────

const DARK = {
  bg:"#111113", bg2:"#1a1a1f", bg3:"#222228", bg4:"#2a2a32",
  hover:"#2f2f38", accent:"#6375f0", accentSoft:"#7b8bf5",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#b0b0b8", txH:"#dddde0", txD:"#68687a",
  bd:"#2a2a34", bdL:"#3a3a46",
  on:"#3dae72", idle:"#c6a236", off:"#555566",
};

const LIGHT = {
  bg:"#f6f6f8", bg2:"#ffffff", bg3:"#ededf0", bg4:"#e3e3e8",
  hover:"#dcdce2", accent:"#4f5bd5", accentSoft:"#6b7bf0",
  green:"#2a9058", red:"#d43d3d", orange:"#d08030", yellow:"#b89420",
  tx:"#4a4a56", txH:"#18181e", txD:"#84849a",
  bd:"#d6d6de", bdL:"#c6c6d2",
  on:"#2a9058", idle:"#b89420", off:"#a8a8b8",
};

const OLED = {
  bg:"#000000", bg2:"#0a0a0a", bg3:"#141416", bg4:"#1a1a1e",
  hover:"#1e1e24", accent:"#6375f0", accentSoft:"#7b8bf5",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#a0a0a8", txH:"#e0e0e4", txD:"#58586a",
  bd:"#1a1a22", bdL:"#2a2a36",
  on:"#3dae72", idle:"#c6a236", off:"#444455",
};

const DIM = {
  bg:"#1e1e24", bg2:"#252530", bg3:"#2e2e3a", bg4:"#363644",
  hover:"#3a3a48", accent:"#6375f0", accentSoft:"#7b8bf5",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#c0c0c8", txH:"#e8e8ec", txD:"#78788a",
  bd:"#363642", bdL:"#44445a",
  on:"#3dae72", idle:"#c6a236", off:"#666678",
};

const SEPIA = {
  bg:"#f4f0e8", bg2:"#faf8f2", bg3:"#ece8de", bg4:"#e2ddd2",
  hover:"#d8d2c6", accent:"#8b6914", accentSoft:"#a8842e",
  green:"#3d8c5a", red:"#c44030", orange:"#c07028", yellow:"#a8881c",
  tx:"#5c5444", txH:"#2a2418", txD:"#908474",
  bd:"#d6d0c4", bdL:"#c8c0b2",
  on:"#3d8c5a", idle:"#a8881c", off:"#a8a090",
};

// ── Science Tokyo ブランドテーマ ──────────────────

const TITECH = {
  bg:"#0a1628", bg2:"#0e1e36", bg3:"#142844", bg4:"#1a3252",
  hover:"#1e3a5e", accent:"#1e7ac8", accentSoft:"#4a9ae0",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#8eaac8", txH:"#d0e0f0", txD:"#506882",
  bd:"#1a3050", bdL:"#264060",
  on:"#3dae72", idle:"#c6a236", off:"#3e5468",
};

const TMDU = {
  bg:"#0a1a18", bg2:"#0e2422", bg3:"#142e2c", bg4:"#1a3836",
  hover:"#1e4240", accent:"#00897b", accentSoft:"#26a69a",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#88b0aa", txH:"#c8e8e4", txD:"#4e7872",
  bd:"#1a3432", bdL:"#264442",
  on:"#3dae72", idle:"#c6a236", off:"#3e5856",
};

const SCITOKYO = {
  bg:"#121218", bg2:"#18181f", bg3:"#202028", bg4:"#282832",
  hover:"#30303c", accent:"#6e58a8", accentSoft:"#8a78c0",
  green:"#3dae72", red:"#e5534b", orange:"#d4843e", yellow:"#c6a236",
  tx:"#a0a0b4", txH:"#d4d4e4", txD:"#646478",
  bd:"#282834", bdL:"#363644",
  on:"#3dae72", idle:"#c6a236", off:"#505060",
};

const TSUBAME = {
  bg:"#eef5fb", bg2:"#f6fafd", bg3:"#e0ecf6", bg4:"#d2e2ee",
  hover:"#c4d8e6", accent:"#28c868", accentSoft:"#50d888",
  green:"#28c868", red:"#d44050", orange:"#d08040", yellow:"#d4a420",
  tx:"#3a5870", txH:"#0e2030", txD:"#7898b0",
  bd:"#c8dcea", bdL:"#b8cedf",
  on:"#28c868", idle:"#d4a420", off:"#9cb0c0",
};

// ── 季節テーマ ──────────────────────────────────

const SAKURA = {
  bg:"#fdf4f6", bg2:"#fff8f9", bg3:"#f8e8ec", bg4:"#f0dce2",
  hover:"#e8d0d8", accent:"#d4507a", accentSoft:"#e0789a",
  green:"#4a9060", red:"#d44050", orange:"#d08040", yellow:"#b89030",
  tx:"#6e4858", txH:"#2e1820", txD:"#a08090",
  bd:"#e8d4da", bdL:"#dcc4cc",
  on:"#4a9060", idle:"#b89030", off:"#b8a0a8",
};

const SHINRYOKU = {
  bg:"#f0f6f0", bg2:"#f8fcf8", bg3:"#e4efe4", bg4:"#d6e6d6",
  hover:"#c8dcc8", accent:"#2e8b57", accentSoft:"#4aab72",
  green:"#2e8b57", red:"#d04040", orange:"#c87830", yellow:"#a89020",
  tx:"#3e5c48", txH:"#142818", txD:"#78a088",
  bd:"#cce0cc", bdL:"#b8d4b8",
  on:"#2e8b57", idle:"#a89020", off:"#98b0a0",
};

const KOYO = {
  bg:"#1c1410", bg2:"#241a14", bg3:"#2e221a", bg4:"#382a20",
  hover:"#423228", accent:"#d4782a", accentSoft:"#e89848",
  green:"#5a9848", red:"#d44830", orange:"#d4782a", yellow:"#c8a030",
  tx:"#b8a090", txH:"#e8dcd0", txD:"#806858",
  bd:"#382a20", bdL:"#483828",
  on:"#5a9848", idle:"#c8a030", off:"#685848",
};

const YUKI = {
  bg:"#f0f4f8", bg2:"#f8fafc", bg3:"#e4eaf0", bg4:"#d6dee8",
  hover:"#c8d2de", accent:"#4a80b4", accentSoft:"#6a9ec8",
  green:"#3a9060", red:"#c84848", orange:"#c88040", yellow:"#a89030",
  tx:"#4a5868", txH:"#141c28", txD:"#8898a8",
  bd:"#d0dae4", bdL:"#bcc8d6",
  on:"#3a9060", idle:"#a89030", off:"#a0aab4",
};

// ── おふざけテーマ ────────────────────────────────

const MIZUKUMORI = {
  bg:"#d8dee6", bg2:"#e2e8ef", bg3:"#cdd4de", bg4:"#c4ccd8",
  hover:"#bac2d0", accent:"#6a88a8", accentSoft:"#8aa4be",
  green:"#6a9a80", red:"#b86868", orange:"#b08860", yellow:"#a09460",
  tx:"#708090", txH:"#4a5868", txD:"#98a4b0",
  bd:"#c0c8d4", bdL:"#b0baca",
  on:"#6a9a80", idle:"#a09460", off:"#a0a8b4",
};

// ── ソフトテーマ（春トーンのカラーバリエーション）───

const LAVENDER = {
  bg:"#f6f3fd", bg2:"#faf8ff", bg3:"#eee8f8", bg4:"#e4dcf0",
  hover:"#d8cee8", accent:"#8b60c8", accentSoft:"#a680e0",
  green:"#4a9060", red:"#d44050", orange:"#d08040", yellow:"#b89030",
  tx:"#5e4870", txH:"#221430", txD:"#9480a8",
  bd:"#ddd4ea", bdL:"#cec4de",
  on:"#4a9060", idle:"#b89030", off:"#ada0b8",
};

const MINT = {
  bg:"#f0f8f5", bg2:"#f6fcf9", bg3:"#e2f0ea", bg4:"#d4e6dc",
  hover:"#c6dcd0", accent:"#3a9878", accentSoft:"#58b898",
  green:"#3a9878", red:"#d44050", orange:"#d08040", yellow:"#b89030",
  tx:"#406858", txH:"#142820", txD:"#80a894",
  bd:"#cce0d4", bdL:"#bcd4c6",
  on:"#3a9878", idle:"#b89030", off:"#a0b4a8",
};

const SKY = {
  bg:"#f0f5fc", bg2:"#f6faff", bg3:"#e2ecf8", bg4:"#d4e0f0",
  hover:"#c6d4e8", accent:"#4a80c8", accentSoft:"#689ce0",
  green:"#4a9060", red:"#d44050", orange:"#d08040", yellow:"#b89030",
  tx:"#405868", txH:"#141e30", txD:"#8098b0",
  bd:"#ccd8e8", bdL:"#bccadc",
  on:"#4a9060", idle:"#b89030", off:"#a0acb8",
};

const PEACH = {
  bg:"#fdf5f0", bg2:"#fff9f5", bg3:"#f8ece4", bg4:"#f0dfd4",
  hover:"#e8d2c6", accent:"#d07848", accentSoft:"#e09468",
  green:"#4a9060", red:"#d44050", orange:"#d07848", yellow:"#b89030",
  tx:"#6e5040", txH:"#2e1c14", txD:"#a88878",
  bd:"#e8d4c8", bdL:"#dcc6b8",
  on:"#4a9060", idle:"#b89030", off:"#b8a8a0",
};

const LEMON = {
  bg:"#faf8f0", bg2:"#fdfcf5", bg3:"#f2eee2", bg4:"#e8e2d4",
  hover:"#ded8c8", accent:"#a89030", accentSoft:"#c0a850",
  green:"#4a9060", red:"#d44050", orange:"#d08040", yellow:"#a89030",
  tx:"#605840", txH:"#282014", txD:"#a09878",
  bd:"#e0dac6", bdL:"#d4ccb6",
  on:"#4a9060", idle:"#a89030", off:"#b0a898",
};

const CORAL = {
  bg:"#fdf4f2", bg2:"#fff8f6", bg3:"#f8e8e4", bg4:"#f0dcd6",
  hover:"#e8d0c8", accent:"#d0605a", accentSoft:"#e0807a",
  green:"#4a9060", red:"#d0605a", orange:"#d08040", yellow:"#b89030",
  tx:"#6e4844", txH:"#2e1814", txD:"#a08078",
  bd:"#e8d4d0", bdL:"#dcc4be",
  on:"#4a9060", idle:"#b89030", off:"#b8a0a0",
};

// ── テーマモード定義 ──────────────────────────────

export const THEME_MODES = {
  base: [
    { id:"dark",  name:"ダーク" },
    { id:"light", name:"ライト" },
    { id:"auto",  name:"自動"   },
  ],
  brand: [
    { id:"titech",   name:"東工大ブルー", col:"#1e7ac8" },
    { id:"tmdu",     name:"医科歯科",     col:"#00897b" },
    { id:"scitokyo", name:"Science Tokyo", col:"#5c3ec4" },
    { id:"tsubame",  name:"ツバメ",        col:"#28c868" },
  ],
  soft: [
    { id:"sakura",   name:"桜",       col:"#d4507a" },
    { id:"lavender", name:"ラベンダー", col:"#8b60c8" },
    { id:"mint",     name:"ミント",    col:"#3a9878" },
    { id:"sky",      name:"スカイ",    col:"#4a80c8" },
    { id:"peach",    name:"ピーチ",    col:"#d07848" },
    { id:"lemon",    name:"レモン",    col:"#a89030" },
    { id:"coral",    name:"コーラル",  col:"#d0605a" },
  ],
  season: [
    { id:"shinryoku",name:"新緑", col:"#2e8b57", emoji:"🌿" },
    { id:"koyo",     name:"紅葉", col:"#d4782a", emoji:"🍁" },
    { id:"yuki",     name:"雪",   col:"#4a80b4", emoji:"❄️" },
  ],
  fun: [
    { id:"mizukumori", name:"水曇り", col:"#6a88a8", emoji:"💧" },
  ],
};

const BASES = {
  dark:DARK, light:LIGHT, oled:OLED, dim:DIM, sepia:SEPIA,
  titech:TITECH, tmdu:TMDU, scitokyo:SCITOKYO, tsubame:TSUBAME,
  sakura:SAKURA, shinryoku:SHINRYOKU, koyo:KOYO, yuki:YUKI,
  lavender:LAVENDER, mint:MINT, sky:SKY, peach:PEACH, lemon:LEMON, coral:CORAL,
  mizukumori:MIZUKUMORI,
};

// ── テーマカラープリセット ─────────────────────────

export const ACCENT_PRESETS = [
  { id:"default",  name:"デフォルト",   dark:["#6375f0","#7b8bf5"], light:["#4f5bd5","#6b7bf0"], col:"#6375f0" },
  { id:"ocean",    name:"オーシャン",   dark:["#3b82f6","#60a5fa"], light:["#2563eb","#3b82f6"], col:"#3b82f6" },
  { id:"emerald",  name:"エメラルド",   dark:["#10b981","#34d399"], light:["#059669","#10b981"], col:"#10b981" },
  { id:"sunset",   name:"サンセット",   dark:["#f97316","#fb923c"], light:["#ea580c","#f97316"], col:"#f97316" },
  { id:"rose",     name:"ローズ",      dark:["#f43f5e","#fb7185"], light:["#e11d48","#f43f5e"], col:"#f43f5e" },
  { id:"violet",   name:"バイオレット", dark:["#8b5cf6","#a78bfa"], light:["#7c3aed","#8b5cf6"], col:"#8b5cf6" },
  { id:"amber",    name:"アンバー",     dark:["#f59e0b","#fbbf24"], light:["#d97706","#f59e0b"], col:"#f59e0b" },
  { id:"cyan",     name:"シアン",       dark:["#06b6d4","#22d3ee"], light:["#0891b2","#06b6d4"], col:"#06b6d4" },
  { id:"pink",     name:"ピンク",       dark:["#ec4899","#f472b6"], light:["#db2777","#ec4899"], col:"#ec4899" },
  { id:"lime",     name:"ライム",       dark:["#84cc16","#a3e635"], light:["#65a30d","#84cc16"], col:"#84cc16" },
  { id:"teal",     name:"ティール",     dark:["#14b8a6","#2dd4bf"], light:["#0d9488","#14b8a6"], col:"#14b8a6" },
  { id:"red",      name:"レッド",       dark:["#ef4444","#f87171"], light:["#dc2626","#ef4444"], col:"#ef4444" },
];

// ── ランタイム ─────────────────────────────────

const ThemeCtx = createContext();
const useTheme = () => useContext(ThemeCtx);

export let T = TSUBAME;

let _accentId = "default";

// ブランド・季節テーマはアクセントカラー固定（テーマ自体がカラーを持つ）
const FIXED_ACCENT_MODES = new Set(["titech","tmdu","scitokyo","tsubame","sakura","shinryoku","koyo","yuki","lavender","mint","sky","peach","lemon","coral","mizukumori"]);

export const updateT = (mode, accentId) => {
  if (accentId !== undefined) _accentId = accentId;
  const base = { ...(BASES[mode] || DARK) };

  // ブランド・季節テーマ以外はアクセントカラーを上書き
  if (!FIXED_ACCENT_MODES.has(mode)) {
    const preset = ACCENT_PRESETS.find(p => p.id === _accentId);
    if (preset && preset.id !== "default") {
      const isDarkish = mode !== "light" && mode !== "sepia";
      const [accent, accentSoft] = isDarkish ? preset.dark : preset.light;
      base.accent = accent;
      base.accentSoft = accentSoft;
    }
  }
  T = base;
};

// light系テーマの判定
const LIGHT_MODES = new Set(["light","sepia","tsubame","sakura","shinryoku","yuki","lavender","mint","sky","peach","lemon","coral","mizukumori"]);
export const isDarkMode = (mode) => !LIGHT_MODES.has(mode);

export { DARK, LIGHT, OLED, DIM, SEPIA, TITECH, TMDU, SCITOKYO, TSUBAME, SAKURA, SHINRYOKU, KOYO, YUKI, LAVENDER, MINT, SKY, PEACH, LEMON, CORAL, MIZUKUMORI, ThemeCtx, useTheme };
