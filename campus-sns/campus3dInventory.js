// 持ち物（歩いて見るときのマイクラのような持ち物。2026-11-15 ユーザー「持ち物という概念を作れる？」→「カメラ、飲み物、地図、お金。
// 学生証、IC もほしい」）。構想書 v0.3 の Layer B（仮想の拡張）：お金・飲み物・カードはゲームの中のもの（本物のお金・本物の学生証ではない）と
// 画面でも分け、建物のデータ（features.json）とは混ぜない。持ち物は端末の中だけ（localStorage。ログインしなくても使える・外へは送らない）
export const INV_KEY = "cb3Inventory";
export const SLOTS = 9; // 画面の下の欄のマス
export const DAILY_MONEY = 1000; // 毎日この額まで補充（ゲーム内の円）
export const IC_START = 500; // IC カードのはじめの残高
export const IC_FARE = 140; // 駅の改札を通るたびに引く（ゲーム内。本物の運賃ではない）
export const CHARGES = [500, 1000]; // 券売機でチャージできる額

// 物の種類：name は i18n のキー、use は使うボタンの名前のキー（null は使わない）、stack は重ねて持てる、price は自販機の値段
export const ITEMS = {
  camera: { name: "inv.camera", use: "inv.useShoot" },
  map: { name: "inv.map", use: null },
  student: { name: "inv.student", use: "inv.useShow" },
  ic: { name: "inv.ic", use: "inv.useShow" },
  tea: { name: "inv.tea", use: "inv.useDrink", stack: true, price: 130, drink: true },
  water: { name: "inv.water", use: "inv.useDrink", stack: true, price: 110, drink: true },
  coffee: { name: "inv.coffee", use: "inv.useDrink", stack: true, price: 150, drink: true },
};
export const DRINKS = ["tea", "water", "coffee"];

// ゲーム内の学籍番号（端末ごとにでたらめ。本物の学籍番号の形にはしない）
const gameSid = () => `G-${Math.floor(10000 + Math.random() * 90000)}`;
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// はじめの持ち物：カメラ・地図・学生証・IC カード（お金は財布＝欄の外）
export function freshInventory() {
  const slots = Array.from({ length: SLOTS }, () => null);
  ["camera", "map", "student", "ic"].forEach((id, i) => (slots[i] = { id, n: 1 }));
  return { v: 1, money: DAILY_MONEY, ic: IC_START, day: today(), slots, sel: 0, sid: gameSid(), issued: today().replace(/-/g, "/"), name: "" };
}

// 読みこみ（こわれていれば作り直す）。日が変わっていれば、お金を DAILY_MONEY まで補充
export function loadInventory() {
  let inv = null;
  try {
    const j = JSON.parse(localStorage.getItem(INV_KEY) || "null");
    if (j && j.v === 1 && Array.isArray(j.slots)) inv = j;
  } catch {
    /* 使えない・こわれている */
  }
  if (!inv) inv = freshInventory();
  inv.slots = Array.from({ length: SLOTS }, (_, i) => {
    const s = inv.slots[i];
    return s && ITEMS[s.id] && s.n > 0 ? { id: s.id, n: Math.min(99, Math.floor(s.n)) } : null;
  });
  inv.money = Math.max(0, Math.floor(+inv.money || 0));
  inv.ic = Math.max(0, Math.floor(+inv.ic || 0));
  inv.sel = Math.max(0, Math.min(SLOTS - 1, Math.floor(+inv.sel || 0)));
  if (typeof inv.sid !== "string" || !/^G-\d{5}$/.test(inv.sid)) inv.sid = gameSid();
  if (typeof inv.issued !== "string" || !/^\d{4}\/\d{2}\/\d{2}$/.test(inv.issued)) inv.issued = today().replace(/-/g, "/");
  inv.name = typeof inv.name === "string" ? inv.name.slice(0, 16) : "";
  const d = today();
  if (inv.day !== d) {
    inv.day = d;
    inv.money = Math.max(inv.money, DAILY_MONEY);
  }
  return inv;
}

export function saveInventory(inv) {
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(inv));
  } catch {
    /* 保存できない（プライベートブラウズなど）：このあいだだけ */
  }
}

// 持っているか（どのマスでも）
export const hasItem = (inv, id) => inv.slots.some((s) => s && s.id === id);

// 足す（重ねられる物は同じ物のマスへ、なければ選んでいるマスから右回りに空いているマス）。入れたマスの番号か -1（いっぱい）
export function addItem(inv, id, n = 1) {
  const def = ITEMS[id];
  if (!def) return -1;
  if (def.stack) {
    const i = inv.slots.findIndex((s) => s && s.id === id && s.n < 99);
    if (i >= 0) {
      inv.slots[i] = { id, n: Math.min(99, inv.slots[i].n + n) };
      return i;
    }
  }
  for (let k = 0; k < SLOTS; k++) {
    const i = (inv.sel + k) % SLOTS;
    if (!inv.slots[i]) {
      inv.slots[i] = { id, n };
      return i;
    }
  }
  return -1;
}

// マス i から n 個へらす（0 になればマスを空ける）
export function takeItem(inv, i, n = 1) {
  const s = inv.slots[i];
  if (!s) return;
  inv.slots[i] = s.n > n ? { id: s.id, n: s.n - n } : null;
}

// 自販機で買う：お金が足りて、入る所があれば買って true
export function buyDrink(inv, id) {
  const def = ITEMS[id];
  if (!def?.price || inv.money < def.price) return false;
  if (addItem(inv, id) < 0) return false;
  inv.money -= def.price;
  return true;
}

// 券売機で IC カードにチャージ（お金から）
export function chargeIc(inv, amount) {
  if (!(amount > 0) || inv.money < amount || !hasItem(inv, "ic")) return false;
  inv.money -= amount;
  inv.ic += amount;
  return true;
}

// 円の書き方（ゲーム内の円）
export const yen = (n) => `${Math.floor(n).toLocaleString("ja-JP")}`;
