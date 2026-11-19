import { categories, MENU_ATLAS_SIZE, menuCards, menuRegions } from "./campus3dTsubameMenu.js";

const gothic = '"Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
const mincho = '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
const ink = "#25292b";
const blue = "#19335f";
const categoryInks = ["#ae7631", "#486846", "#928166", "#354f77", "#354f77"];
const categoryNames = ["主菜", "丼・カレー", "サラダ・パン", "麺類", "うどん・そば"];
const categoryEnglish = ["SET MENU", "RICEBOWL / CURRY", "SALAD BAR", "NOODLE", "UDON / SOBA"];

function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function ellipse(c, x, y, rx, ry, color) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  c.fillStyle = color;
  c.fill();
}

function polygon(c, points, color) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const p of points.slice(1)) c.lineTo(...p);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function gradient(c, x, y, w, h, stops) {
  const fill = c.createLinearGradient(x, y, x + w * 0.36, y + h);
  for (const [offset, color] of stops) fill.addColorStop(offset, color);
  rect(c, x, y, w, h, fill);
}

function label(c, value, x, y, size, width, opts = {}) {
  c.font = (opts.weight || 650) + " " + size + "px " + (opts.font || gothic);
  c.textBaseline = "middle";
  c.textAlign = opts.align || "left";
  if (opts.outline) {
    c.lineJoin = "round";
    c.lineWidth = opts.outlineWidth || 4;
    c.strokeStyle = opts.outline;
    c.strokeText(value, x, y, width);
  }
  c.fillStyle = opts.color || ink;
  c.fillText(value, x, y, width);
}

// Local crop within one 400px render tile. Cropping only the transparent margin
// keeps a deep bowl, a loose pastry and a flat plate at their own aspect ratios.
function servingBounds(i) {
  if (i < 5) return [20, 89, 350, 252];
  if (i < 8) return [49, 53, 302, 252];
  if (i < 10) return [30, 95, 340, 242];
  if (i === 10) return [42, 147, 284, 143];
  if (i === 11) return [89, 157, 215, 149];
  if (i === 12) return [65, 107, 270, 221];
  if (i === 16) return [45, 88, 310, 254];
  if (i < 22) return [47, 53, 316, 254];
  return [73, 86, 267, 207];
}

function food(c, image, i, x, y, width, height) {
  const [sx, sy, sw, sh] = servingBounds(i);
  const scale = Math.min(width / sw, height / sh);
  const w = sw * scale, h = sh * scale;
  c.save();
  c.shadowColor = "rgba(52,43,29,0.26)";
  c.shadowBlur = 2.5;
  c.shadowOffsetY = 2.1;
  c.drawImage(image, (i % 5) * 400 + sx, Math.floor(i / 5) * 400 + sy, sw, sh,
    x + (width - w) / 2, y + (height - h) / 2, w, h);
  c.restore();
}

function paper(c, width, height) {
  gradient(c, 0, 0, width, height, [[0, "#fffefb"], [0.72, "#f7f6f0"], [1, "#eeece4"]]);
  c.strokeStyle = "#d3d1c9";
  c.lineWidth = 2;
  c.strokeRect(1, 1, width - 2, height - 2);
}

function stripe(c, row, fair) {
  const color = fair ? "#9a3037" : categoryInks[row];
  polygon(c, [[315, 0], [360, 0], [360, 240], [294, 240], [307, 179], [315, 101]], color);
  const fg = "#fbf9e9";
  if (row === 4) {
    rect(c, 301, 0, 17, 240, color);
    rect(c, 328, 13, 1.2, 159, "#aab1bd");
    ["うどん", "そば"].forEach((name, j) => {
      const x = 314 + j * 30;
      [...name].forEach((ch, k) => label(c, ch, x, 29 + 23 * k, 16, 20, { color: fg, align: "center" }));
      rect(c, x - 9, 172, 18, 1.5, fg);
    });
  } else {
    label(c, fair ? "フェア" : "食堂", 336, 20, 12, 37, { color: fg, align: "center" });
    for (const [i, text] of ["エネルギー", "たんぱく質", "脂質", "食塩相当量"].entries()) {
      rect(c, 317, 42 + i * 31, 38, 1.2, "#d8d4be");
      label(c, text, 335, 53 + i * 31, 9.5, 37, { color: fg, align: "center" });
    }
  }
  label(c, fair ? "北海道" : categoryNames[row], 330, 202, 14, 46, { color: fg, align: "center" });
}

function smallFair(c) {
  gradient(c, 0, 0, 360, 240, [[0, "#98bcda"], [0.44, "#e3eef2"], [0.70, "#fffae6"], [1, "#e2bf57"]]);
  polygon(c, [[0, 171], [58, 159], [113, 172], [175, 152], [238, 160], [315, 132], [330, 240], [0, 240]], "#e9d479");
  polygon(c, [[0, 196], [69, 174], [143, 192], [217, 161], [320, 144], [325, 240], [0, 240]], "#f3e6a8");
}

function menuCard(c, image, card, i) {
  const row = Math.floor(i / 5);
  if (card.kind === "app") return appNotice(c, 360, 240);
  if (card.kind === "payment") return payment(c);
  if (card.kind === "buffet") return buffet(c, image);
  paper(c, 360, 240);
  if (card.fair) smallFair(c);
  const special = card.dish === 1;
  if (!special && (row !== 2 || card.fair)) stripe(c, row, card.fair);
  if (special) gradient(c, 0, 0, 360, 240, [[0, "#faefed"], [0.55, "#f4f1e7"], [1, "#e3d5cd"]]);
  const bakery = row === 2 && !card.fair;
  const titleOpts = { weight: 770, color: "#252725", font: mincho };
  if (card.fair) Object.assign(titleOpts, { outline: "#e7edf0", outlineWidth: 3.5 });
  label(c, card.title, 13, 28, 26, bakery ? 331 : 291, titleOpts);
  const photoX = bakery ? 31 : 1, photoW = special ? 354 : bakery ? 305 : 303;
  food(c, image, card.dish, photoX, special ? 34 : 42, photoW, special ? 184 : bakery ? 148 : 168);
  if (special) banner(c, "ライス付き", 284, 190, 111, -0.035);
  if (card.price) {
    label(c, "¥" + card.price, 14, 214, 30, 114, { color: "#793e32", font: "Georgia, serif", weight: 700 });
    rect(c, 14, 231, 94, 1, "#ab8372");
  }
  label(c, card.fair ? "北海道フェア" : categoryEnglish[row], bakery ? 341 : 292, 220, 10, 125,
    { color: card.fair ? "#685525" : "#706f67", align: "right", weight: 500 });
}

function phone(c, x, y, w, h, color, word) {
  rect(c, x + w * 0.19, y, w * 0.62, h, "#536460");
  rect(c, x + w * 0.23, y + h * 0.055, w * 0.54, h * 0.84, "#fffef9");
  rect(c, x + w * 0.28, y + h * 0.15, w * 0.44, h * 0.46, color);
  label(c, word, x + w / 2, y + h * 0.39, w * 0.14, w * 0.39, { color: "white", align: "center", weight: 800 });
  rect(c, x + w * 0.29, y + h * 0.70, w * 0.41, h * 0.025, "#b2bab3");
  rect(c, x + w * 0.29, y + h * 0.76, w * 0.29, h * 0.025, "#b2bab3");
}

function appNotice(c, w, h) {
  c.save();
  c.scale(w / 400, h / 290);
  paper(c, 400, 290);
  label(c, "食堂メニューは", 200, 36, 21, 338, { align: "center", font: mincho });
  label(c, "LINEと大学生協アプリで確認できます", 200, 73, 19, 373, { align: "center", font: mincho });
  phone(c, 52, 101, 91, 118, "#538448", "LINE");
  phone(c, 254, 101, 91, 118, "#b36661", "生協");
  label(c, "大学生協のLINE", 97, 252, 14, 150, { align: "center" });
  label(c, "大学生協アプリ", 300, 252, 14, 150, { align: "center" });
  c.restore();
}

function payment(c) {
  paper(c, 360, 240);
  c.save();
  c.translate(42, 69);
  polygon(c, [[0, 0], [15, -10], [33, -6], [35, 5], [21, 14], [10, 12]], "#829a8a");
  polygon(c, [[8, 6], [23, -4], [40, 0], [36, 12], [22, 18]], "#5a7263");
  c.restore();
  label(c, "GakuPay", 94, 74, 44, 223, { color: "#465c50", font: "Georgia, serif", weight: 500 });
  rect(c, 36, 130, 288, 1.5, "#818781");
  label(c, "大学生協の電子マネー", 180, 157, 17, 297, { align: "center" });
  label(c, "食堂でご利用いただけます", 180, 187, 13, 294, { align: "center", weight: 500 });
}

function buffet(c, image) {
  paper(c, 360, 240);
  label(c, "サラダバー", 14, 31, 32, 210, { font: mincho });
  label(c, "SALAD  BAR", 15, 66, 14, 166, { color: "#65744f" });
  food(c, image, 23, 225, 6, 120, 91);
  rect(c, 14, 100, 329, 2, "#afba9b");
  for (const [i, [idx, title]] of [[23, "青菜"], [22, "きんぴら"], [24, "ライス"]].entries()) {
    food(c, image, idx, 13 + i * 112, 113, 108, 74);
    label(c, title, 67 + i * 112, 207, 14, 102, { align: "center" });
  }
}

function hokkaido(c) {
  // 道北から時計回り。西南の半島と東の根室側の突端を含む。
  polygon(c, [[92, 26], [108, 39], [117, 68], [140, 91], [170, 111], [202, 119],
    [227, 113], [248, 93], [239, 118], [246, 127], [269, 127], [254, 139],
    [239, 143], [229, 154], [209, 152], [196, 155], [177, 168], [159, 188],
    [141, 177], [126, 168], [111, 168], [89, 159], [79, 165], [76, 179], [62, 183],
    [58, 193], [71, 201], [66, 210], [52, 204], [43, 211], [34, 207], [37, 194],
    [44, 182], [39, 171], [42, 155], [55, 147], [61, 133], [69, 128], [74, 142],
    [83, 143], [91, 127], [98, 111], [91, 103], [82, 95], [89, 83], [91, 66]], "#254e4b");
}

function banner(c, text, x, y, w, angle = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  rect(c, -w / 2, -11, w, 24, "#fff9df");
  label(c, text, 0, 1, 15, w - 8, { align: "center", color: "#34291d", font: mincho, weight: 800 });
  c.restore();
}

function fairPoster(c, image) {
  gradient(c, 0, 0, 480, 650, [[0, "#90b4d6"], [0.26, "#dfebf0"], [0.47, "#fff9db"], [0.7, "#edcb68"], [1, "#d3ab44"]]);
  polygon(c, [[0, 433], [111, 401], [229, 420], [367, 385], [480, 374], [480, 650], [0, 650]], "#edcf78");
  polygon(c, [[0, 487], [143, 446], [270, 452], [408, 416], [480, 412], [480, 650], [0, 650]], "#f6e39d");
  c.save();
  c.translate(-31, -2);
  hokkaido(c);
  c.restore();
  const title = { align: "center", font: mincho, weight: 900, color: "#191c20", outline: "#fbfaf0", outlineWidth: 8 };
  c.save();
  c.translate(240, 0);
  c.rotate(-0.042);
  label(c, "北海道", 0, 91, 94, 415, title);
  label(c, "フェア", -6, 176, 82, 304, title);
  c.restore();
  ellipse(c, 412, 190, 46, 48, "#263d66");
  label(c, "11.16", 412, 173, 23, 72, { color: "white", align: "center", font: mincho });
  label(c, "～11.22", 412, 204, 21, 77, { color: "white", align: "center", font: mincho });
  food(c, image, 0, -18, 214, 294, 185);
  food(c, image, 3, 285, 231, 184, 129);
  food(c, image, 12, 208, 333, 171, 97);
  banner(c, "鶏ザンギ", 105, 381, 140, -0.07);
  banner(c, "コロッケ", 389, 350, 104, -0.04);
  banner(c, "チーズケーキ", 315, 425, 145, 0.04);
  food(c, image, 5, -17, 434, 261, 169);
  food(c, image, 13, 220, 429, 271, 178);
  banner(c, "北海道の豚丼", 106, 587, 175, -0.06);
  banner(c, "北海道味噌ラーメン", 353, 592, 222, 0.03);
  rect(c, 0, 620, 480, 30, "#2b426e");
  label(c, "北海道フェア", 240, 635, 15, 302, { align: "center", color: "white", font: mincho });
}

function tag(c, value, x, y, w) {
  c.fillStyle = "#669079";
  c.beginPath();
  c.roundRect(x - w / 2, y - 12, w, 24, 12);
  c.fill();
  label(c, value, x, y, 14, w - 13, { align: "center", color: "white" });
}

function weeklyPoster(c, image) {
  rect(c, 0, 0, 420, 756, "#363535");
  gradient(c, 8, 9, 404, 563, [[0, "#fff3d3"], [0.44, "#f3f1e9"], [1, "#f5e2be"]]);
  for (const [x, y, r, color] of [[20, 179, 30, "#dcc2d3"], [394, 151, 29, "#eddb96"],
    [29, 281, 32, "#e5b891"], [394, 353, 25, "#debbcb"], [124, 444, 24, "#f0dc99"]]) {
    ellipse(c, x, y, r, r * 0.7, color);
  }
  rect(c, 16, 22, 181, 43, "#514783");
  label(c, "管理栄養士", 106, 43, 29, 166, { align: "center", color: "white", weight: 850 });
  const title = { align: "center", color: "#191e43", outline: "#fffdf5", outlineWidth: 5, weight: 900 };
  label(c, "今週の", 305, 48, 47, 197, title);
  label(c, "おすすめ組み合わせ", 210, 109, 40, 381, title);
  food(c, image, 22, 31, 164, 155, 115);
  food(c, image, 23, 235, 164, 161, 115);
  tag(c, "きんぴらごぼう", 105, 152, 123);
  tag(c, "青菜のおひたし", 315, 152, 129);
  food(c, image, 24, 7, 299, 155, 113);
  food(c, image, 0, 141, 279, 270, 154);
  tag(c, "ライス", 82, 286, 75);
  tag(c, "鶏ザンギ", 336, 285, 93);
  rect(c, 26, 424, 152, 28, "#333b66");
  label(c, "11/16 ▶ 22", 102, 438, 21, 141, { align: "center", color: "#fffdf6" });
  rect(c, 24, 458, 371, 23, "#fffdf9");
  label(c, "主菜　・　副菜　・　ライス", 209, 469, 12, 346, { color: "#414453", align: "center" });
  gradient(c, 8, 490, 404, 106, [[0, "#e2eabc"], [1, "#b0cb87"]]);
  label(c, "強い骨", 28, 518, 34, 129, { color: "#9d4440", weight: 850 });
  label(c, "を", 156, 522, 23, 37);
  label(c, "つくろう！", 46, 564, 34, 187, { color: "#283c36", weight: 850 });
  ellipse(c, 316, 548, 65, 34, "#f8f8e9");
  label(c, "今週のおすすめ", 317, 548, 14, 107, { align: "center", color: "#536949" });
  rect(c, 8, 598, 404, 12, "#704935");
  rect(c, 8, 610, 404, 138, "#fbf4f4");
  label(c, "食堂のメニューは LINE で", 24, 632, 18, 305, { color: "#58555d" });
  label(c, "ご確認いただけます", 24, 659, 17, 276, { color: "#58555d" });
  phone(c, 311, 628, 78, 99, "#639461", "LINE");
}

// Rasterise the typeset slips once per texture load. The only source image
// contains the transparent dishes rendered by scripts/render-tsubame-dishes.py.
export async function tsubameMenuPixels() {
  const dishes = new Image();
  dishes.src = "/map-3d/tsubame-dishes.webp";
  await dishes.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MENU_ATLAS_SIZE;
  const c = canvas.getContext("2d");
  c.imageSmoothingQuality = "high";
  rect(c, 0, 0, MENU_ATLAS_SIZE, MENU_ATLAS_SIZE, "#eeeae1");
  function region(id, width, height, paint) {
    const [x, y, w, h] = menuRegions[id];
    c.save();
    c.translate(x, y);
    c.scale(w / width, h / height);
    c.beginPath();
    c.rect(0, 0, width, height);
    c.clip();
    paint();
    c.restore();
  }
  menuCards.forEach((card, i) => region(i, 360, 240, () => menuCard(c, dishes, card, i)));
  region("fair", 480, 650, () => fairPoster(c, dishes));
  region("weekly", 420, 756, () => weeklyPoster(c, dishes));
  region("apps", 400, 290, () => appNotice(c, 400, 290));
  categories.forEach((lines, i) => region("cat" + i, 202, 240, () => {
    rect(c, 0, 0, 202, 240, "#f2f1ed");
    lines.forEach((s, j) => label(c, s, 101, 117 + (j - (lines.length - 1) / 2) * 25, 22, 181,
      { align: "center", font: "Georgia, serif", weight: 500, color: "#5d6160" }));
  }));
  for (const [id, title, dish] of [["sideA", "きんぴらごぼう", 22], ["sideB", "青菜のおひたし", 23], ["rice", "ライス", 24]]) {
    region(id, 360, 240, () => {
      paper(c, 360, 240);
      label(c, title, 15, 30, 26, 306, { font: mincho });
      food(c, dishes, dish, 24, 58, 306, 162);
    });
  }
  region("sizes", 360, 240, () => {
    paper(c, 360, 240);
    label(c, "ライスのサイズ", 180, 47, 25, 305, { align: "center" });
    rect(c, 25, 75, 311, 2, "#6d816d");
    ["小", "中", "大"].forEach((v, i) => {
      const w = 70 + i * 13;
      food(c, dishes, 24, 64 + i * 114 - w / 2, 103 - i * 4, w, w * 0.8);
      label(c, v, 65 + i * 114, 191, 20, 60, { align: "center" });
    });
  });
  return { size: MENU_ATLAS_SIZE, data: c.getImageData(0, 0, MENU_ATLAS_SIZE, MENU_ATLAS_SIZE).data };
}
