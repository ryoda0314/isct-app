// 入口の献立見本（IMG_1375・1486）。番号は render-tsubame-dishes.py の盛り付け順。
export const TSUBAME_ATLAS = "tsubameMenu";
export const MENU_ATLAS_SIZE = 2048;

export const menuCards = [
  { title: "鶏ザンギ", dish: 0, fair: true },
  { title: "ハンバーグステーキ", dish: 1 },
  { title: "豚肉と野菜の生姜炒め", dish: 2, price: 378 },
  { title: "ソースコロッケ", dish: 3, price: 378 },
  { title: "甘酢あんの肉団子", dish: 4 },
  { title: "北海道の豚丼", dish: 5, fair: true },
  { title: "豚肉の温玉丼", dish: 6 },
  { title: "鶏たま丼", dish: 7 },
  { title: "ロースカツカレー", dish: 8 },
  { title: "チーズカレー", dish: 9 },
  { title: "サラダバー", kind: "buffet" },
  { title: "ミニクロワッサン各種", dish: 10, price: 183 },
  { title: "ミニデニッシュ各種", dish: 11, price: 99 },
  { title: "チーズケーキ", dish: 12, fair: true },
  { title: "GakuPay", kind: "payment" },
  { title: "北海道味噌ラーメン", dish: 13, fair: true },
  { title: "味噌ラーメン", dish: 14 },
  { title: "焦がし醤油まぜそば", dish: 15 },
  { title: "明太子のクリームパスタ", dish: 16 },
  { title: "海苔ラーメン", dish: 17 },
  { title: "鶏天うどん・そば", dish: 18 },
  { title: "天ぷらうどん・そば", dish: 19 },
  { title: "かき揚げうどん・そば", dish: 20 },
  { title: "肉うどん・そば", dish: 21 },
  { title: "食堂メニュー", kind: "app" },
];

export const categories = [
  ["CAFETERIA", "SET MENU", "SALAD"],
  ["RICEBOWL", "CURRY"],
  ["SALAD BAR", "BUFFET"],
  ["NOODLE"],
];

// Atlas regions are in pixels. Every slip has padding so filtering at a distance
// cannot pull in text or dishes from the neighbouring slip.
export const menuRegions = Object.fromEntries(menuCards.map((_, i) =>
  [i, [8 + (i % 5) * 406, 8 + Math.floor(i / 5) * 248, 392, 234]]));
Object.assign(menuRegions, {
  fair: [8, 1260, 510, 774],
  weekly: [534, 1260, 420, 774],
  apps: [970, 1260, 416, 336],
  sideA: [970, 1612, 416, 202],
  sideB: [970, 1828, 416, 202],
  sizes: [1624, 1260, 410, 230],
  rice: [1624, 1510, 410, 230],
});
for (let i = 0; i < categories.length; i++) menuRegions["cat" + i] = [1402, 1260 + 193 * i, 204, 173];

const sheet = (id, left, top, width, height) => ({ id, left, top, width, height });
const entry = [
  sheet("apps", 0.016, 0.026, 0.214, 0.345),
  sheet("fair", 0.016, 0.383, 0.214, 0.588),
  ...categories.map((_, i) => sheet("cat" + i, 0.242, 0.028 + i * 0.191, 0.066, 0.18)),
  ...menuCards.map((_, i) => sheet(i, 0.316 + (i % 5) * 0.134,
    0.026 + Math.floor(i / 5) * 0.191, 0.1275, 0.181)),
];

function counter(ids, start, step, width) {
  return ids.map((id, i) => sheet(id, start + i * step, 0.067, width, 0.864));
}

const layouts = {
  tsubameMenu: entry,
  tsubameDigital: [sheet("weekly", 0.019, 0.012, 0.962, 0.976)],
  tsubameSetCards: counter([0, 1, 2, 3, 4, "sideA", "sideB", 10, 13, 14], 0.052, 0.090, 0.078),
  tsubameRiceCards: counter([5, 6, 7, 8, 9, "rice", "sizes", 14], 0.122, 0.104, 0.082),
};

export function tsubameMenuLayout(name) {
  return Object.hasOwn(layouts, name) ? layouts[name] : null;
}

export function menuUV(id) {
  const [x, y, w, h] = menuRegions[id];
  return [(x + 0.5) / MENU_ATLAS_SIZE, (y + 0.5) / MENU_ATLAS_SIZE,
    (x + w - 0.5) / MENU_ATLAS_SIZE, (y + h - 0.5) / MENU_ATLAS_SIZE];
}
