// 台本（script.json）と声（voice.json）から、映像の時間割り（フレーム）を作る。
// 映像の側（timeline.js）と撮影の側（capture/record_film.mjs の rec_z_*）の両方で使うので、ここでは JSON を読まない（呼ぶ側が渡す）。
// 撮影の側はこの時間割りで操作のフレームを決めて撮るので、映像では録画をそのまま 1 倍速で流せば声と合う（コマを止めたり飛ばしたりしない）。
export const FPS = 30;
const GAP = 7; // 同じ場面の行と行のあいだ
// 場面の頭（章の幕が通り過ぎる・端末が入る）と終わりの余白
const LEAD = { hook: 14, title: 34, end: 20 };
const TAIL = { hook: 6, title: 14, end: 150 };
const LEAD_DEFAULT = 24;
const TAIL_DEFAULT = 10;

export const buildTimeline = (SCRIPT, VOICE) => {
  let f = 0;
  const SCENES = SCRIPT.scenes.map((sc, si) => {
    const start = f;
    f += LEAD[sc.id] ?? LEAD_DEFAULT;
    const lines = sc.lines.map((l, i) => {
      const voice = VOICE[l.id];
      if (!voice) throw new Error(`声がありません: ${l.id}（node capture/zunda_voice.mjs）`);
      const dur = Math.ceil(voice.dur * FPS);
      const at = f;
      f += dur + (i < sc.lines.length - 1 ? GAP : 0);
      return { ...l, scene: sc.id, at, dur, end: at + dur, voice };
    });
    f += TAIL[sc.id] ?? TAIL_DEFAULT;
    return { ...sc, index: si, start, end: f, lines };
  });
  const LINES = SCENES.flatMap((s) => s.lines);
  const LINE = Object.fromEntries(LINES.map((l) => [l.id, l]));
  // 行の中で、その言葉（声のカナ。伸ばす音は「オ」「エ」：提出＝テエシュツ）が始まるフレーム
  const word = (id, kana, offset = 0) => {
    const l = LINE[id];
    if (!l) throw new Error(`行がありません: ${id}`);
    const m = l.voice.moras;
    for (let i = 0; i < m.length; i++) {
      let s = '';
      for (let j = i; j < m.length && s.length < kana.length; j++) s += m[j][4];
      if (s.startsWith(kana)) return l.at + Math.round(m[i][0] * FPS) + offset;
    }
    throw new Error(`${id} に「${kana}」がありません（${m.map((x) => x[4]).join('')}）`);
  };
  return { SCENES, SCENE: Object.fromEntries(SCENES.map((s) => [s.id, s])), LINES, LINE, TOTAL: f, word };
};
