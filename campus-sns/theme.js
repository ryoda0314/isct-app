import { createContext, useContext } from "react";

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

// テーマカラープリセット
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

const ThemeCtx = createContext();
const useTheme = () => useContext(ThemeCtx);

export let T = DARK;

let _accentId = "default";

export const updateT = (dark, accentId) => {
  if (accentId !== undefined) _accentId = accentId;
  const base = dark ? { ...DARK } : { ...LIGHT };
  const preset = ACCENT_PRESETS.find(p => p.id === _accentId);
  if (preset && preset.id !== "default") {
    const [accent, accentSoft] = dark ? preset.dark : preset.light;
    base.accent = accent;
    base.accentSoft = accentSoft;
  }
  T = base;
};

export { DARK, LIGHT, ThemeCtx, useTheme };
