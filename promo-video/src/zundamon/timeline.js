// 台本（script.json）と合成した声（voice.json）から、映像の時間割りを作る（計算は schedule.js。撮影の側と共通）。
// 行の長さは声の長さで決まる（台本や声を作り直すと、自動でずれる）。単位はフレーム（30fps）。
import SCRIPT from './script.json';
import VOICE from './voice.json';
import { FPS, buildTimeline } from './schedule.js';

export { FPS };
export const W = 1920;
export const H = 1080;
const T = buildTimeline(SCRIPT, VOICE);
export const { SCENES, SCENE, LINES, LINE, TOTAL, word } = T;
// 章（番号つきの場面）
export const CHAPTERS = SCENES.filter((s) => s.chapter);
export const chapterNo = (id) => CHAPTERS.findIndex((s) => s.id === id) + 1;

export const sceneAt = (fr) => SCENES.find((s) => fr >= s.start && fr < s.end) || SCENES[SCENES.length - 1];
// 今の表情を決める行（その場面で最後に始まった行。まだなら場面の最初の行）
export const exprLineAt = (fr) => {
  const sc = sceneAt(fr);
  let cur = sc.lines[0];
  for (const l of sc.lines) if (l.at <= fr) cur = l;
  return cur;
};
// 話している行と、その行の頭からの秒
export const talkAt = (fr) => {
  const l = LINES.find((x) => fr >= x.at && fr < x.end);
  return l ? { line: l, t: (fr - l.at) / FPS } : null;
};
// 行の中の割合（0〜1）の位置のフレーム
export const at = (id, k = 0) => LINE[id].at + Math.round(LINE[id].dur * k);
