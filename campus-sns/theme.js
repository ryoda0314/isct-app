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
  bg:"#f5f5f7", bg2:"#ffffff", bg3:"#eeeef0", bg4:"#e4e4e8",
  hover:"#dddde2", accent:"#5563d8", accentSoft:"#6b7bf0",
  green:"#2d9462", red:"#d44040", orange:"#c07030", yellow:"#a88a2a",
  tx:"#555566", txH:"#1a1a22", txD:"#8888a0",
  bd:"#d8d8e0", bdL:"#c8c8d4",
  on:"#2d9462", idle:"#a88a2a", off:"#aaaabc",
};

const ThemeCtx = createContext();
const useTheme = () => useContext(ThemeCtx);

export let T = DARK;

export const updateT = (dark) => {
  T = dark ? DARK : LIGHT;
};

export { DARK, LIGHT, ThemeCtx, useTheme };
