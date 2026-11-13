// 看板の字（日本語も）と絵（2026-11-12、大岡山駅の 1 階・階段の上の広告。ユーザー「えき１階もちゃんと再現して。今の簡易版ではなく」）：
// 画面の canvas に字・絵を描き、升目（cell）ごとの塗りを横の並び → 縦にまとめた四角の並びにする（看板の面に貼る四角。campus3dMesh の addSign）。
// 同じ字・大きさ・太さは覚えておく。canvas のないところ（node のテスト・ビルド）では null（字を描かない）。
// 字の大きさ h は字の箱（em）の高さ m。四角は字の箱の左下からの m（[x, y, w, h]）
const cache = new Map();
let ctx2d = null;
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","YuGothic","Yu Gothic","Meiryo","Noto Sans JP","Noto Sans CJK JP",sans-serif';

function context() {
  if (ctx2d) return ctx2d;
  try {
    let c = null;
    if (typeof OffscreenCanvas !== "undefined") c = new OffscreenCanvas(8, 8);
    else if (typeof document !== "undefined") c = document.createElement("canvas");
    if (!c) return null;
    ctx2d = c.getContext("2d", { willReadFrequently: true });
    return ctx2d;
  } catch {
    return null;
  }
}

// 塗りの升目（alpha > 0.5）を四角に：横の並び（行ごと）→ 同じ並びが続く行をまとめる。px は 1 升の m、top は箱の上の行、rows は箱の行数
function cellsToRects(data, W, H, cell, { dots = false, x0 = 0, rowsTop = 0, rows = H } = {}) {
  const rects = [];
  const open = new Map(); // "a,b" → rect
  for (let r = 0; r < H; r++) {
    const runs = [];
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && data[(r * W + x) * 4 + 3] > 128;
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        runs.push([a, x]);
        a = -1;
      }
    }
    const y = (rowsTop + rows - r - 1) * cell; // この行の下の端（箱の下から）
    if (dots) {
      for (const [p, q] of runs) for (let x = p; x < q; x++) rects.push([(x - x0) * cell + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76]);
      continue;
    }
    const seen = new Set();
    for (const [p, q] of runs) {
      const k = `${p},${q}`;
      seen.add(k);
      const R = open.get(k);
      if (R) {
        R[1] = y;
        R[3] += cell;
      } else {
        const N = [(p - x0) * cell, y, (q - p) * cell, cell];
        open.set(k, N);
        rects.push(N);
      }
    }
    for (const k of [...open.keys()]) if (!seen.has(k)) open.delete(k);
  }
  return rects;
}

/**
 * 字の四角。t：字、h：字の箱の高さ m、b：太さ、led：光る点の粗い字（1 升ずつの点）
 * @returns { w（字の並びの幅 m）, rects: [[x, y, w, h]] } か null
 */
export function textCells(t, h, { b = 700, led = false } = {}) {
  const key = `${t}|${h}|${b}|${led ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const g = context();
  if (!g) return null;
  // 1 字の高さを何升にするか：光る点の字は 12、ほかは字の大きさで 28〜48
  const px = led ? 12 : Math.max(28, Math.min(48, Math.round(h * 220)));
  const cell = h / px;
  g.font = `${b} ${px}px ${FONT}`;
  const W = Math.max(1, Math.ceil(g.measureText(t).width) + 4);
  const H = Math.ceil(px * 1.2) + 2;
  if (g.canvas.width < W || g.canvas.height < H) {
    g.canvas.width = Math.max(g.canvas.width, W);
    g.canvas.height = Math.max(g.canvas.height, H);
  }
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.font = `${b} ${px}px ${FONT}`;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#000";
  const base = Math.round(px * 0.88) + 1; // 字の箱の上は base − 0.88px、下は base + 0.12px
  g.fillText(t, 2, base);
  const data = g.getImageData(0, 0, W, H).data;
  // 行 r の下の端の高さ = 箱の下（base + 0.12px）から上へ。cellsToRects は rowsTop + rows − r − 1 で数えるので、箱の下の行に合わせる
  const bottomRow = base + 0.12 * px; // この行の上の端が箱の下
  const rects = cellsToRects(data, W, H, cell, { dots: led, x0: 2, rowsTop: -(H - bottomRow), rows: H });
  const out = { w: (W - 4) * cell, rects };
  cache.set(key, out);
  return out;
}

// 絵の形（100 × 100 の箱。y は下へ）。SIGN_ICONS（campus3dFeatures）と同じ名前
const ICON_PATHS = {
  man: "M50 4a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z M32 28h36a6 6 0 0 1 6 6v30h-8v-28h-2v62h-12v-34h-4v34h-12v-62h-2v28h-8v-30a6 6 0 0 1 6-6Z",
  woman: "M50 4a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z M38 28h24l16 38h-9l-7-18h-1l9 26h-9v24h-9v-24h-4v24h-9v-24h-9l9-26h-1l-7 18h-9Z",
  wheel: "M42 2a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M36 24h12v24h22l12 30l-9 4l-9-22h-28Z M30 44a26 26 0 1 0 34 30l-7-4a18 18 0 1 1-24-20Z",
  baby: "M50 6a12 12 0 1 1 0 24a12 12 0 1 1 0-24Z M22 40h56v12h-20v44h-16v-44h-20Z",
  ostomy: "M50 4a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z M34 28h32v40h-32Z M44 72h12v26h-12Z M60 40h14v10h10v14h-10v10h-14v-10h-10v-14h10Z",
  esc: "M8 92h26l40-56h18v-14h-26l-40 56h-18Z M62 6a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z M56 26h12v22l-6 8h-6Z",
  lift: "M10 6h80v88h-80Z M18 14v72h64v-72Z M50 20l12 14h-24Z M50 80l-12-14h24Z M34 40a6 6 0 1 1 0 12a6 6 0 1 1 0-12Z M28 54h12v20h-12Z M66 40a6 6 0 1 1 0 12a6 6 0 1 1 0-12Z M60 54h12v20h-12Z",
  exit: "M60 4a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M44 26h20l12 18l14 4l-2 8l-18-5l-6-8l-4 16l12 10v28h-9v-22l-10-8l-6 14l-18 10l-4-8l15-8l10-30h-6l-8 12l-7-4Z",
  arrow: "M6 42h54v-22l36 30l-36 30v-22h-54Z",
  uturn: "M70 94v-54a20 20 0 0 0-40 0v18h14l-22 26l-22-26h14v-18a36 36 0 0 1 72 0v54Z",
  drink: "M28 10h44l-6 84h-32Z M34 28h32l-2 20h-28Z",
  onigiri: "M50 8l42 76a8 8 0 0 1-7 12h-70a8 8 0 0 1-7-12Z M30 62h40v30h-40Z",
  sandwich: "M10 30l80 0l-40 56Z M14 22h72v6h-72Z",
  cigarette: "M6 56h70v14h-70Z M80 56h6v14h-6Z M90 56h4v14h-4Z M74 26c10 4 10 14 2 22l-4-3c5-5 5-11-2-14Z",
  tokyu: "M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0-96Z",
};
const ROT = { arrowL: 180, arrowU: -90, arrowD: 90, arrowUL: -135, arrowDL: 135, arrowUR: -45, arrowDR: 45 };

/**
 * 絵の四角。k：種類、h：絵の箱の高さ m
 * @returns { w, rects } か null
 */
export function iconCells(k, h) {
  const key = `icon|${k}|${h}`;
  if (cache.has(key)) return cache.get(key);
  const g = context();
  if (!g || typeof Path2D === "undefined") return null;
  const path = ICON_PATHS[ROT[k] != null ? "arrow" : k];
  if (!path) return null;
  const px = Math.max(32, Math.min(64, Math.round(h * 160)));
  const cell = h / px;
  if (g.canvas.width < px + 2 || g.canvas.height < px + 2) {
    g.canvas.width = Math.max(g.canvas.width, px + 2);
    g.canvas.height = Math.max(g.canvas.height, px + 2);
  }
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.save();
  g.translate(1 + px / 2, 1 + px / 2);
  if (ROT[k]) g.rotate((ROT[k] * Math.PI) / 180);
  g.scale(px / 100, px / 100);
  g.translate(-50, -50);
  g.fillStyle = "#000";
  g.fill(new Path2D(path), "evenodd");
  g.restore();
  const W = px + 2, H = px + 2;
  const data = g.getImageData(0, 0, W, H).data;
  const rects = cellsToRects(data, W, H, cell, { x0: 1, rowsTop: -1, rows: H });
  const out = { w: h, rects };
  cache.set(key, out);
  return out;
}
