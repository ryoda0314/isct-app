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

const ThemeCtx = createContext();
const useTheme = () => useContext(ThemeCtx);

export let T = DARK;

export const updateT = (dark) => {
  T = dark ? DARK : LIGHT;
};

export { DARK, LIGHT, ThemeCtx, useTheme };
