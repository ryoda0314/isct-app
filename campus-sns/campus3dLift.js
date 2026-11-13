// エレベーター（2026-11-10、ユーザー「ちゃんとエレベーター写真参照して作って乗れるようにして。実際に階移動もしたい」）：
// 階（floor）の物 kind "lift"（4 点の四角。1 本目の辺 coords[0] → coords[1] が扉の面）を、同じ形が重なる階どうしで 1 台にまとめる。
// 昇降路は階ごとに中の見える壁（campus3dInterior の lift）、かご・かごの扉・乗り場の扉・ボタンはこの部品が開き具合と高さごとに作る
// （campus3dLayer の createDoorsLayer（層 cb-lift）が描き、CampusMap3D の walkTick が stepLift で動かす）。
// ボタン（同日、ユーザー「クリックはマイクラみたいに直接ボタンを押したい」）：乗り場の扉の右の呼びボタンの板に上・下のボタン、かごの中の
// 操作盤（中から扉に向いて右）に階のボタン（上の階ほど上・数字つき）と今の階の表示。目の前（LIFT_REACH m 以内）で照準（画面のまん中の
// 十字。マウスを固定していないときはマウスの先、スマホはタップしたところ）を合わせてクリックすると押せる（liftPick で視線の当たるボタン、
// pressButton で押す）。押したボタンはその階に着くまで光る。かごが止まっている階のボタンを押すと扉が開く。前に立つだけでは呼ばない。
// 動き：呼ばれた階・行き先の階へ、今の向きの先の近い階から順に。扉が閉まり、LIFT_SPEED m/s で上下して、着いた階で扉が開く。
// 扉は人が口のあたりにいるあいだは閉まらない。扉の口は扉が開いているときだけ通れる（liftBlocked）。
// 写真（動画 IMG_0723 の 2 階：t139・t145）：白い壁に、継ぎ目のないステンレスの扉 1 枚（横に引く）、右に細い呼びボタン、扉の上に表示はない。
// 附属図書館（2026-11-13、動画 IMG_1077 の 654〜666 秒）：扉は厚い打ち放しの壁の奥。乗り場の操作盤は扉の右の柱の手前の面の縦長のステンレスの板
// （上に黒い表示＝橙の矢印と今の階、上・下の呼びボタン＝黒い四角に白い矢印・押すと橙、銘板、青い車いすの印、車いす用の上・下）。
// 物 lift の hall（乗り場の壁の外の面までの出 m）・panel "strip" で、階ごとに（壁の厚さは階で違う）。
import { Mesh, planeText, textWidth } from "./campus3dMesh.js";
import { LIFT_DOOR_H, LIFT_DOOR_W, LIFT_WALL, toXY } from "./campus3dFeatures.js";

export { LIFT_DOOR_H, LIFT_DOOR_W, LIFT_WALL }; // 扉の口の幅・高さ、昇降路の壁の厚さ（m）
export const LIFT_REACH = 3; // ボタンを押せる距離（目から m。Minecraft の手の届く距離くらい）
export const LIFT_SPEED = 1.5; // かごの速さ（m/s。動き出し・止まりはなめらかに）
const OPEN_S = 0.9; // 扉が開くのにかかる秒
const CLOSE_S = 1.1; // 閉まるのにかかる秒
const HOLD_S = 3.5; // だれもいなくなってから扉を開けておく秒
const ACC = 1.0; // 加速度（m/s²）
const PICK_PAD = 0.012; // ボタンの当たりの広げ（m。小さいボタンでも押しやすく）
export const STEEL = [0.78, 0.8, 0.82, 1]; // ステンレス（扉・かごの壁）
const STEEL_DARK = [0.52, 0.55, 0.58, 1];
const CAR_FLOOR = [0.36, 0.37, 0.39, 1];
const CAR_CEIL = [0.92, 0.92, 0.9, 1];
const LIGHT = [1, 0.99, 0.94, 0.5]; // 光を受けない色（アルファ 0.5）：天井の照明
const BTN = [0.86, 0.87, 0.88, 1]; // 消えているボタン（明るい金属）
const BTN_SIDE = [0.6, 0.62, 0.64, 1];
const BTN_LIT = [1, 0.7, 0.26, 0.5]; // 押して光っているボタン（光を受けない色。乗り場の呼び）
const BTN_TEXT = [0.12, 0.13, 0.15, 1];
const AIM = [1, 1, 1, 0.5]; // 照準が当たっているボタンのふち（光を受けない白）
// かごの中の操作盤（2026-11-12、動画 IMG_1086：Taki Plaza のかご。扉の右の縦長のステンレスの柱）：上から表示（濃い灰の枠に、明るい
// 画面＝向きの矢印・今の階・日付と時刻、下にもう 1 枚の消えた画面）、ステンレス、黒い帯（非常呼びの橙のボタン SOS）、銘板、階のボタン
// （丸い銀色。上の階ほど上、左に点字）、いちばん下に開・閉のボタン（開は緑のふち）
const PANEL_FACE = [0.66, 0.68, 0.7, 1]; // 柱（少し暗いステンレス）
const PANEL_EDGE = [0.4, 0.42, 0.45, 1];
const DISP_FRAME = [0.24, 0.25, 0.28, 1];
const SCREEN = [0.36, 0.42, 0.52, 0.5]; // 光る画面（光を受けない色）
const SCREEN_OFF = [0.17, 0.18, 0.2, 1];
const SCREEN_TEXT = [1, 1, 1, 0.5];
const BAND = [0.07, 0.07, 0.08, 1];
const SOS = [0.98, 0.46, 0.12, 0.5];
const BTN_RING_LIT = [1, 0.97, 0.88, 0.5]; // 押して光っているかごのボタンのふち（白く光る）
const OPEN_RIM = [0.35, 0.85, 0.5, 0.5];
// 操作盤・ボタンの寸法（m）
const PANEL_IN = 0.1; // 口の端から操作盤まで
const PANEL_W = 0.22;
const CAR_BTN = 0.046; // 丸いボタンの径
const CAR_BTN_STEP = 0.062;
const CAR_BTN_Z0 = 0.86; // いちばん下のボタンのまん中（かごの床から）
const CAR_BTN_X = 0.025; // ボタンの列の、柱のまん中から右へ
const DOOR_BTN = 0.05; // 開・閉のボタン（四角）
const DOOR_BTN_Z = 0.7;
const HALL_BTN = 0.045;
const HALL_FACE = 0.019; // 乗り場のボタンの面（壁の外の面から外へ）
// 乗り場の縦長の操作盤（panel "strip"。附属図書館）：板の幅・下・上（階の床から）・板の面の出（壁の外の面から）、表示の下・上、
// 上・下の呼び（HALL_UP_Z・HALL_DN_Z）、車いす用の上・下（WC_Z）
const STRIP_W = 0.12;
const STRIP_Z0 = 0.76, STRIP_Z1 = 1.76;
const STRIP_OUT = 0.012;
const STRIP_DISP = [1.45, 1.7];
const HALL_UP_Z = 1.19, HALL_DN_Z = 1.11;
const WC_Z = [0.885, 0.815];
const BTN_BLACK = [0.07, 0.07, 0.08, 1]; // 黒い四角のボタン
const BTN_BLACK_SIDE = [0.2, 0.2, 0.22, 1];
const ARROW_WHITE = [0.9, 0.91, 0.92, 1];
const ARROW_LIT = [1, 0.72, 0.16, 0.5]; // 押して光っている矢印（光を受けない橙）
const LED = [1, 0.5, 0.1, 0.5]; // 表示の橙の字
const DISP_BLACK = [0.04, 0.04, 0.05, 1];
const WC_BLUE = [0.1, 0.33, 0.74, 1];
const PLATE_GREY = [0.6, 0.61, 0.63, 1];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lenOf = (v) => Math.hypot(v[0], v[1]);

// 昇降路の形（平面の点 4 つ。1 本目の辺が扉の面）から、扉の面の向きと口
export function liftFrame(ring) {
  const c = ring.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const A = ring[0], B = ring[1];
  const L = lenOf(sub(B, A)) || 1;
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  let n = [u[1], -u[0]];
  const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if ((m[0] - c[0]) * n[0] + (m[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]]; // 外向き
  const depth = Math.abs((ring[2][0] - B[0]) * n[0] + (ring[2][1] - B[1]) * n[1]); // 奥行き
  return { A, B, L, u, n, m, c, depth };
}

// 階の並び（floor features。toXY の平面）から、エレベーター { ring, levels: [{ z, label, order }], frame }
export function collectLifts(floors, groundAt, floorG0) {
  const out = [];
  for (const f of floors) {
    if (f.type !== "floor") continue;
    const g0 = floorG0(f, groundAt);
    if (!Number.isFinite(g0)) continue;
    for (const it of f.items || []) {
      if (it.kind !== "lift" || it.coords.length !== 4) continue;
      const ring = it.coords.map(toXY);
      const c = ring.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
      let L = out.find((l) => Math.hypot(l.frame.c[0] - c[0], l.frame.c[1] - c[1]) < 0.4);
      if (!L) {
        L = { ring, frame: liftFrame(ring), levels: [] };
        out.push(L);
      }
      // 乗り場の扉の色（物の color。大岡山駅の黄色い扉。2026-11-12）
      if (it.color && !L.doorCol) {
        const n = parseInt(it.color.slice(1, 7), 16);
        L.doorCol = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 0.5]; // 光を受けない色（屋内の照明。暗い黄土色にならないように）
      }
      // 乗り場（階ごと）：hall＝乗り場の壁の外の面の出（m）、panel＝操作盤の形（"strip" か null）
      const hall = Number.isFinite(it.hall) ? Math.max(0, Math.min(1.5, it.hall)) : 0;
      L.levels.push({ z: g0 + f.z + (it.z0 || 0), h: (it.z1 || f.height || 3) - (it.z0 || 0), label: f.level || "", order: f.order ?? 0, id: f.id, hall, panel: it.panel === "strip" ? "strip" : null });
    }
  }
  for (const L of out) L.levels.sort((a, b) => a.z - b.z);
  return out.filter((L) => L.levels.length >= 2);
}

// 状態（かごの高さ・止まっている階・扉の開き具合・向かっている階・向き・かごの中の行き先 car・乗り場の呼び hall [{ k, dir }]）
export function liftState(L, start = null) {
  const k = start != null ? start : Math.max(0, L.levels.findIndex((v) => v.label === "1F"));
  return { carZ: L.levels[k].z, level: k, target: null, phase: "idle", door: 0, hold: 0, v: 0, dir: 0, car: [], hall: [] };
}

const ease = (t) => t * t * (3 - 2 * t);

// かごの中の寸法（扉の面から中へ d0〜d1、幅 W）
function carGeom(L) {
  const F = L.frame;
  const W = F.L - 2 * LIFT_WALL - 0.04;
  const D = F.depth - 2 * LIFT_WALL - 0.04;
  const d0 = LIFT_WALL + 0.03;
  return { W, D, d0, d1: d0 + D };
}
// 操作盤（中から扉に向いて右）と乗り場の呼びボタンの板（外から扉に向いて右）の、扉の面に沿った位置の向き（u の ±）
function sides(F) {
  const inRight = F.n[1] * F.u[0] - F.n[0] * F.u[1]; // 中から外（n）を向いた人の右手 (n[1], −n[0]) と u
  const outRight = -F.n[1] * F.u[0] + F.n[0] * F.u[1]; // 外から中（−n）を向いた人の右手 (−n[1], n[0]) と u
  return { panel: inRight >= 0 ? 1 : -1, hall: outRight >= 0 ? 1 : -1 };
}
const levelText = (lb) => String(lb || "").replace(/F$/i, "") || "?";

// ボタンの並び（形と押したときの意味）：{ kind "car"|"hall"|"door", k（階の番号。door は −1）, dir（hall の上 1・下 −1、door の開 1・閉 −1）,
// c（面のまん中 [x, y, z]）, N（面の外向き。押す人の側）, U（面の上で右）, hu・hv（半分の幅・高さ）, lit（光っている）, round（丸いボタン） }
export function liftButtons(L, S) {
  const F = L.frame;
  const { u, n, m } = F;
  const P = (s, d) => [m[0] + u[0] * s - n[0] * d, m[1] + u[1] * s - n[1] * d]; // s：扉の面に沿って、d：扉の面から中へ
  const sd = sides(F);
  const hw = LIFT_DOOR_W / 2;
  const { d0 } = carGeom(L);
  const out = [];
  // かごの中の操作盤：階のボタン（柱のまん中から右へ CAR_BTN_X）と、いちばん下の開・閉
  const sMid = sd.panel * (hw + PANEL_IN + PANEL_W / 2);
  const inN = [-n[0], -n[1], 0];
  const inU = [n[1], -n[0], 0];
  // 面の上で右（inU）へ x m の、扉の面に沿った位置 s
  const sAt = (x) => sMid + x * (inU[0] * u[0] + inU[1] * u[1]);
  L.levels.forEach((_, k) => {
    const p = P(sAt(CAR_BTN_X), d0 + 0.078);
    out.push({ kind: "car", k, dir: 0, c: [p[0], p[1], S.carZ + CAR_BTN_Z0 + k * CAR_BTN_STEP], N: inN, U: inU, hu: CAR_BTN / 2, hv: CAR_BTN / 2, lit: S.car.includes(k), round: true });
  });
  for (const [dir, x] of [[1, -0.035], [-1, 0.045]]) {
    const p = P(sAt(x), d0 + 0.078);
    out.push({ kind: "door", k: -1, dir, c: [p[0], p[1], S.carZ + DOOR_BTN_Z], N: inN, U: inU, hu: DOOR_BTN / 2, hv: DOOR_BTN / 2, lit: false });
  }
  // 乗り場の呼びボタン：上（いちばん上の階はなし）・下（いちばん下の階はなし）。乗り場の壁の外の面（扉の面から lv.hall 外）に付く。
  // 縦長の操作盤（strip）は黒い四角のボタンで、上・下の高さは決まった位置、その下に車いす用の上・下（wc。押すと同じように呼ぶ）
  const sHall = sd.hall * (hw + 0.2);
  const outN = [n[0], n[1], 0];
  const outU = [-n[1], n[0], 0];
  const top = L.levels.length - 1;
  L.levels.forEach((lv, k) => {
    const p = P(sHall, -(HALL_FACE + (lv.hall || 0)));
    const dirs = k === 0 ? [1] : k === top ? [-1] : [1, -1];
    const strip = lv.panel === "strip";
    for (const dir of dirs) {
      const zc = lv.z + (strip ? (dir > 0 ? HALL_UP_Z : HALL_DN_Z) : dirs.length === 1 ? 1.15 : dir > 0 ? 1.19 : 1.11);
      out.push({ kind: "hall", k, dir, c: [p[0], p[1], zc], N: outN, U: outU, hu: HALL_BTN / 2, hv: HALL_BTN / 2, lit: S.hall.some((h) => h.k === k && h.dir === dir && !h.wc), dark: strip });
      if (strip) {
        const zw = lv.z + (dir > 0 ? WC_Z[0] : WC_Z[1]);
        out.push({ kind: "hall", k, dir, wc: true, c: [p[0], p[1], zw], N: outN, U: outU, hu: HALL_BTN / 2, hv: HALL_BTN / 2, lit: S.hall.some((h) => h.k === k && h.dir === dir && h.wc), dark: true });
      }
    }
  });
  return out;
}

// 視線（目 o = [x, y, z]、向き dir（単位）、m）の先でいちばん近いボタン { i（台）, kind, k, dir, t（距離） }。なければ null
export function liftPick(lifts, states, o, dir, reach = LIFT_REACH) {
  let best = null;
  lifts.forEach((L, i) => {
    for (const b of liftButtons(L, states[i])) {
      const den = dir[0] * b.N[0] + dir[1] * b.N[1] + dir[2] * b.N[2];
      if (den > -1e-4) continue; // 裏から・横から
      const t = ((b.c[0] - o[0]) * b.N[0] + (b.c[1] - o[1]) * b.N[1] + (b.c[2] - o[2]) * b.N[2]) / den;
      if (!(t > 0 && t <= reach)) continue;
      const h = [o[0] + dir[0] * t - b.c[0], o[1] + dir[1] * t - b.c[1], o[2] + dir[2] * t - b.c[2]];
      if (Math.abs(h[0] * b.U[0] + h[1] * b.U[1]) > b.hu + PICK_PAD || Math.abs(h[2]) > b.hv + PICK_PAD) continue;
      if (!best || t < best.t) best = { i, kind: b.kind, k: b.k, dir: b.dir, wc: !!b.wc, t };
    }
  });
  return best;
}

// ボタンを押す（b：{ kind, k, dir }）。かごが止まっている階なら扉を開ける。ほかの階なら呼び・行き先に足す（着くまで光る）。
// 開（door・dir 1）：動いていなければ扉を開けて待つ。閉（door・dir −1）：開いている扉をすぐ閉める（口に人がいれば開き直す）
export function pressButton(L, S, b) {
  if (b && b.kind === "door") {
    if (S.phase === "moving") return false;
    if (b.dir > 0) {
      if (S.phase !== "open") S.phase = "opening";
      S.hold = Math.max(S.hold, HOLD_S);
    } else if (S.phase === "open" || S.phase === "opening") {
      S.phase = "closing";
      S.hold = 0;
    }
    return true;
  }
  if (!b || !(b.k >= 0 && b.k < L.levels.length)) return false;
  if (b.k === S.level && S.phase !== "moving") {
    if (S.phase === "idle" || S.phase === "closing") S.phase = "opening";
    S.hold = Math.max(S.hold, HOLD_S);
    return true;
  }
  if (b.kind === "car") {
    if (!S.car.includes(b.k)) S.car.push(b.k);
  } else if (!S.hall.some((h) => h.k === b.k && h.dir === b.dir && !!h.wc === !!b.wc)) S.hall.push(b.wc ? { k: b.k, dir: b.dir || 0, wc: true } : { k: b.k, dir: b.dir || 0 });
  return true;
}
// 行き先を選ぶ（かごの中の階のボタンを押すのと同じ）
export function selectLevel(L, S, k) {
  return pressButton(L, S, { kind: "car", k });
}

// 歩く人（足もと { x, y, z }）が、かごの中か（扉の面の内）
export function inCar(L, S, who) {
  if (!who) return false;
  const F = L.frame;
  const d = (who.x - F.m[0]) * -F.n[0] + (who.y - F.m[1]) * -F.n[1]; // 扉の面から中への深さ
  const s = (who.x - F.m[0]) * F.u[0] + (who.y - F.m[1]) * F.u[1];
  return d > LIFT_WALL * 0.5 && d < F.depth && Math.abs(s) < F.L / 2 && Math.abs(who.z - S.carZ) < 0.6;
}
// 扉の口のあたり（外 0.6m 〜 中 0.45m＝閉まる扉に体が当たるところ、口の幅）にいるか
function inDoorway(L, who, z) {
  if (!who) return false;
  const F = L.frame;
  const d = (who.x - F.m[0]) * F.n[0] + (who.y - F.m[1]) * F.n[1];
  const s = (who.x - F.m[0]) * F.u[0] + (who.y - F.m[1]) * F.u[1];
  return d > -0.45 && d < 0.6 && Math.abs(s) < LIFT_DOOR_W / 2 + 0.15 && Math.abs(who.z - z) < 1.2;
}
// 次に向かう階：今の向きの先の呼び・行き先のうち近い階。先になければ近い階
function nextTarget(S) {
  const ks = [...new Set([...S.car, ...S.hall.map((h) => h.k)])];
  if (!ks.length) return null;
  const ahead = S.dir ? ks.filter((k) => (k - S.level) * S.dir > 0) : [];
  const pool = ahead.length ? ahead : ks;
  return pool.reduce((b, k) => (b == null || Math.abs(k - S.level) < Math.abs(b - S.level) ? k : b), null);
}
function clearAt(S, k) {
  S.car = S.car.filter((x) => x !== k);
  S.hall = S.hall.filter((h) => h.k !== k);
}

// dt 秒すすめる。who は歩く人（いなければ null）。返り値 { dz（かごが動いた高さ。中の人はいっしょに動く）, riding（中にいる）, changed（形を作り直す） }
export function stepLift(L, S, who, dt) {
  const riding = inCar(L, S, who);
  let changed = false;
  const z0 = S.carZ;
  const blockingDoor = inDoorway(L, who, L.levels[S.level].z);
  switch (S.phase) {
    case "idle": {
      // 扉は閉まっている。呼び・行き先があれば、止まっている階なら扉を開け、ほかの階なら向かう
      const t = nextTarget(S);
      if (t == null) {
        S.dir = 0;
        break;
      }
      changed = true;
      if (t === S.level) {
        clearAt(S, t);
        S.phase = "opening";
      } else {
        S.target = t;
        S.dir = Math.sign(t - S.level);
        S.phase = "moving";
      }
      break;
    }
    case "opening":
      S.door = Math.min(1, S.door + dt / OPEN_S);
      changed = true;
      if (S.door >= 1) {
        S.phase = "open";
        S.hold = Math.max(S.hold, HOLD_S);
      }
      break;
    case "open":
      // 中で行き先を押したら閉める（口に人がいれば待つ）。中にいる・口にいるあいだは待つ。だれもいなければ HOLD_S のあと閉める
      if (S.car.some((k) => k !== S.level) && !blockingDoor) S.phase = "closing";
      else if (riding || blockingDoor) S.hold = Math.max(S.hold, 1.5);
      else {
        S.hold -= dt;
        if (S.hold <= 0) S.phase = "closing";
      }
      break;
    case "closing":
      if (blockingDoor) {
        S.phase = "opening"; // 口に人がいれば開き直す
        break;
      }
      S.door = Math.max(0, S.door - dt / CLOSE_S);
      changed = true;
      if (S.door <= 0) {
        S.door = 0;
        S.hold = 0;
        S.phase = "idle";
      }
      break;
    case "moving": {
      const zt = L.levels[S.target].z;
      const dz = zt - S.carZ;
      const dist = Math.abs(dz);
      // なめらかに：止まるまでの距離より近づいたら減速
      const vmax = Math.min(LIFT_SPEED, Math.sqrt(2 * ACC * dist) + 0.05);
      S.v = Math.min(vmax, S.v + ACC * dt);
      const step = Math.min(dist, S.v * dt);
      S.carZ += Math.sign(dz) * step;
      changed = true;
      if (Math.abs(zt - S.carZ) < 1e-3) {
        S.carZ = zt;
        S.level = S.target;
        S.target = null;
        S.v = 0;
        clearAt(S, S.level); // 着いた階のボタンは消える
        S.phase = "opening";
      }
      break;
    }
  }
  return { dz: S.carZ - z0, riding, changed };
}

// 扉の口が閉まっていて通れないか（walk の世界の動く壁）：口の面の外 0.35m 〜 中 0.35m（体の半径ぶん）、口の幅、その階の高さ。
// かごの中では、かごの奥と両わきの壁から体の半径ぶん内まで（かごの壁を抜けて昇降路の壁とのすき間へ入らない）
export function liftBlocked(lifts, states, x, y, z) {
  for (let i = 0; i < lifts.length; i++) {
    const L = lifts[i], S = states[i];
    const F = L.frame;
    const d = (x - F.m[0]) * F.n[0] + (y - F.m[1]) * F.n[1];
    const s = (x - F.m[0]) * F.u[0] + (y - F.m[1]) * F.u[1];
    if (-d > LIFT_WALL + 0.35 && -d < F.depth && Math.abs(s) < F.L / 2 && Math.abs(z - S.carZ) < 1.0) {
      const { W, d1 } = carGeom(L);
      if (-d > d1 - 0.3 || Math.abs(s) > W / 2 - 0.3) return true;
    }
    if (!(d > -LIFT_WALL - 0.35 && d < 0.35 && Math.abs(s) < LIFT_DOOR_W / 2 + 0.05)) continue;
    for (let k = 0; k < L.levels.length; k++) {
      const lv = L.levels[k];
      if (z + 1.7 < lv.z || z > lv.z + LIFT_DOOR_H) continue;
      const open = k === S.level && S.phase !== "moving" && S.door > 0.85 && Math.abs(S.carZ - lv.z) < 0.02;
      if (!open) return true;
    }
  }
  return false;
}

// かごの床（歩く世界の動く床）：点がかごの中（昇降路の壁の内）なら、かごの床の標高。昇降路のところの階の床には穴（データの holes）
export function liftFloors(lifts, states, x, y) {
  const out = [];
  lifts.forEach((L, i) => {
    const F = L.frame;
    const d = (x - F.m[0]) * -F.n[0] + (y - F.m[1]) * -F.n[1];
    const s = (x - F.m[0]) * F.u[0] + (y - F.m[1]) * F.u[1];
    if (d > LIFT_WALL - 0.02 && d < F.depth - LIFT_WALL + 0.02 && Math.abs(s) < F.L / 2 - LIFT_WALL + 0.02) out.push(states[i].carZ);
  });
  return out;
}

// 面（まん中 c・外向き N・右 U・上 z）の上の 2 次元の点 (x, y)（m）を、面から外へ off m 浮かせた点 [[x, y], z] に
const onFace = (b, x, y, off) => [[b.c[0] + b.U[0] * x + b.N[0] * off, b.c[1] + b.U[1] * x + b.N[1] * off], b.c[2] + y];
// 面の上の四角（x0〜x1・y0〜y1）
function faceRect(m, b, x0, y0, x1, y1, off, c) {
  m.quad([onFace(b, x0, y0, off), onFace(b, x1, y0, off), onFace(b, x1, y1, off), onFace(b, x0, y1, off)], b.N, c);
}
// 面の上の太さ w の線（(x0, y0) → (x1, y1)）
function faceBar(m, b, x0, y0, x1, y1, w, off, c) {
  const l = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / l) * (w / 2), ny = ((x1 - x0) / l) * (w / 2);
  m.quad([onFace(b, x0 - nx, y0 - ny, off), onFace(b, x1 - nx, y1 - ny, off), onFace(b, x1 + nx, y1 + ny, off), onFace(b, x0 + nx, y0 + ny, off)], b.N, c);
}
// 面の上の三角（x, y の 3 点）
const faceTri = (m, b, pts, off, c) => m.quad([onFace(b, ...pts[0], off), onFace(b, ...pts[1], off), onFace(b, ...pts[2], off), onFace(b, ...pts[2], off)], b.N, c);
// 面の上の丸（まん中 (x, y)、半径 r）
function faceDisc(m, b, x, y, r, off, c, seg = 20) {
  for (let k = 0; k < seg; k++) {
    const a0 = (2 * Math.PI * k) / seg, a1 = (2 * Math.PI * (k + 1)) / seg;
    faceTri(m, b, [[x, y], [x + r * Math.cos(a0), y + r * Math.sin(a0)], [x + r * Math.cos(a1), y + r * Math.sin(a1)]], off, c);
  }
}
// 柱の面（ボタンの面 c から BASE m 奥）と、ボタンの出（c から手前へ DEP_B）
const BASE = -0.0075, DEP_B = 0.005;
// 面の上の四角の筒（x0〜x1・y0〜y1、奥 o0 〜 手前 o1）の 4 つの側面
function faceSides(m, b, x0, y0, x1, y1, o0, o1, c) {
  const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = P[k], [bx, by] = P[(k + 1) % 4];
    const nx = by - ay, ny = -(bx - ax), l = Math.hypot(nx, ny) || 1;
    m.quad([onFace(b, ax, ay, o0), onFace(b, bx, by, o0), onFace(b, bx, by, o1), onFace(b, ax, ay, o1)], [b.U[0] * (nx / l), b.U[1] * (nx / l), ny / l], c);
  }
}
// かごの中の丸いボタン：柱の面の輪の上に銀色の丸（筒）、数字。押して光っていれば輪が白く光る。左に点字
function drawRoundButton(m, b, label, aimed) {
  const seg = 20, r = b.hu;
  faceDisc(m, b, 0, 0, r * 1.2, BASE + 0.0003, b.lit ? BTN_RING_LIT : BTN_SIDE, seg);
  faceDisc(m, b, 0, 0, r, DEP_B, BTN, seg);
  for (let k = 0; k < seg; k++) {
    const a0 = (2 * Math.PI * k) / seg, a1 = (2 * Math.PI * (k + 1)) / seg;
    const am = (a0 + a1) / 2;
    const N = [b.U[0] * Math.cos(am), b.U[1] * Math.cos(am), Math.sin(am)];
    m.quad([onFace(b, r * Math.cos(a0), r * Math.sin(a0), BASE), onFace(b, r * Math.cos(a1), r * Math.sin(a1), BASE), onFace(b, r * Math.cos(a1), r * Math.sin(a1), DEP_B), onFace(b, r * Math.cos(a0), r * Math.sin(a0), DEP_B)], N, BTN_SIDE);
  }
  const size = 0.019;
  const opt = { stroke: 0.13, d0: DEP_B + 0.0003, d1: DEP_B + 0.0013 };
  const w = textWidth(label, size, opt);
  const plane = { P: (x, y, d) => onFace(b, x, y, d), N: b.N, U: b.U, V: [0, 0, 1] };
  planeText(m, plane, label, -w / 2, -size / 2, size, opt, BTN_TEXT, BTN_TEXT);
  // 左の点字（字の数に合わせた小さな点）
  const nDots = Math.min(4, 1 + label.length);
  for (let j = 0; j < nDots; j++) faceRect(m, b, -r - 0.024 + j * 0.006, -0.002 + (j % 2) * 0.004, -r - 0.021 + j * 0.006, 0.001 + (j % 2) * 0.004, BASE + 0.0006, BTN_SIDE);
  if (aimed) drawAim(m, b);
}
// 開・閉のボタン：四角に、開は外へ向く 2 つの三角（緑に光るふち）、閉は内へ向く 2 つの三角
function drawDoorButton(m, b, aimed) {
  const DEP = DEP_B, { hu, hv } = b;
  faceRect(m, b, -hu - 0.004, -hv - 0.004, hu + 0.004, hv + 0.004, BASE + 0.0003, b.dir > 0 ? OPEN_RIM : BTN_SIDE);
  faceRect(m, b, -hu, -hv, hu, hv, DEP, BTN);
  faceSides(m, b, -hu, -hv, hu, hv, BASE, DEP, BTN_SIDE);
  const s = b.dir > 0 ? 1 : -1, h = 0.011, g = 0.002;
  // 開：◀▶（先が外）、閉：▶◀（先が内）
  faceTri(m, b, [[-g - (s > 0 ? 0.016 : 0), 0], [-g - (s > 0 ? 0 : 0.016), h], [-g - (s > 0 ? 0 : 0.016), -h]], DEP + 0.0008, BTN_TEXT);
  faceTri(m, b, [[g + (s > 0 ? 0.016 : 0), 0], [g + (s > 0 ? 0 : 0.016), -h], [g + (s > 0 ? 0 : 0.016), h]], DEP + 0.0008, BTN_TEXT);
  if (aimed) drawAim(m, b);
}
// 車いすの印（青い四角の上の白い人と車輪。まん中 (x, y)、面から off）
function drawWheelchair(m, b, x, y, off) {
  const Wt = [0.95, 0.96, 0.97, 1];
  faceDisc(m, b, x - 0.003, y - 0.008, 0.0125, off, Wt, 16); // 車輪（白い丸に青い丸＝輪）
  faceDisc(m, b, x - 0.003, y - 0.008, 0.0092, off + 0.0002, WC_BLUE, 16);
  const o2 = off + 0.0004;
  faceDisc(m, b, x + 0.002, y + 0.016, 0.0042, o2, Wt, 10); // 頭
  faceBar(m, b, x - 0.002, y - 0.002, x, y + 0.01, 0.005, o2, Wt); // 胴
  faceBar(m, b, x - 0.002, y - 0.002, x + 0.01, y - 0.002, 0.0045, o2, Wt); // もも
  faceBar(m, b, x + 0.013, y - 0.014, x + 0.01, y - 0.002, 0.004, o2, Wt); // すね
  faceBar(m, b, x, y + 0.007, x + 0.009, y + 0.004, 0.0035, o2, Wt); // 腕
}
// 照準が当たっている：白く光るふち（Minecraft の当たっているブロックの枠のかわり）
function drawAim(m, b) {
  const { hu, hv } = b;
  const t = 0.005, g = 0.003;
  faceRect(m, b, -hu - g - t, hv + g, hu + g + t, hv + g + t, 0.006, AIM);
  faceRect(m, b, -hu - g - t, -hv - g - t, hu + g + t, -hv - g, 0.006, AIM);
  faceRect(m, b, -hu - g - t, -hv - g, -hu - g, hv + g, 0.006, AIM);
  faceRect(m, b, hu + g, -hv - g, hu + g + t, hv + g, 0.006, AIM);
}
// ボタン 1 つ：少し出っ張った板（面と 4 つの側面）、数字か三角、光っているか、照準のふち
function drawButton(m, b, label, aimed) {
  if (b.round) return drawRoundButton(m, b, label, aimed);
  if (b.kind === "door") return drawDoorButton(m, b, aimed);
  const DEP = 0.006;
  const { hu, hv } = b;
  // dark：縦長の乗り場の操作盤（附属図書館）の黒い四角のボタン（白い矢印、押すと矢印が橙に光る）
  const face = b.dark ? BTN_BLACK : b.lit ? BTN_LIT : BTN;
  faceRect(m, b, -hu, -hv, hu, hv, 0, face);
  const corners = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 4];
    const nx = y1 - y0, ny = -(x1 - x0); // 面の上の外向き
    const l = Math.hypot(nx, ny) || 1;
    const N = [b.U[0] * (nx / l), b.U[1] * (nx / l), ny / l];
    m.quad([onFace(b, x0, y0, -DEP), onFace(b, x1, y1, -DEP), onFace(b, x1, y1, 0), onFace(b, x0, y0, 0)], N, b.dark ? BTN_BLACK_SIDE : BTN_SIDE);
  }
  if (b.dark && b.kind === "hall") {
    // 矢印（三角の頭と軸）
    const s = b.dir > 0 ? 1 : -1;
    const ink = b.lit ? ARROW_LIT : ARROW_WHITE;
    const tri = [[0, 0.012 * s], [-0.01 * s, 0.001 * s], [0.01 * s, 0.001 * s]];
    m.quad([onFace(b, ...tri[0], 0.0015), onFace(b, ...tri[1], 0.0015), onFace(b, ...tri[2], 0.0015), onFace(b, ...tri[2], 0.0015)], b.N, ink);
    faceBar(m, b, 0, Math.min(-0.011 * s, 0.002 * s), 0, Math.max(-0.011 * s, 0.002 * s), 0.0055, 0.0015, ink);
    if (aimed) drawAim(m, b);
    return;
  }
  const ink = b.lit ? [0.35, 0.16, 0.02, 1] : BTN_TEXT;
  if (b.kind === "car") {
    const size = 0.03;
    const opt = { stroke: 0.12, d0: 0.0006, d1: 0.0022 };
    const w = textWidth(label, size, opt);
    const plane = { P: (x, y, d) => onFace(b, x, y, d), N: b.N, U: b.U, V: [0, 0, 1] };
    planeText(m, plane, label, -w / 2, -size / 2, size, opt, ink, ink);
  } else {
    // 上・下の三角
    const s = b.dir > 0 ? 1 : -1;
    const tri = [[0, 0.011 * s], [-0.011 * s, -0.008 * s], [0.011 * s, -0.008 * s]];
    m.quad([onFace(b, ...tri[0], 0.0015), onFace(b, ...tri[1], 0.0015), onFace(b, ...tri[2], 0.0015), onFace(b, ...tri[2], 0.0015)], b.N, ink);
  }
  if (aimed) {
    // 照準が当たっている：白く光るふち（Minecraft の当たっているブロックの枠のかわり）
    const t = 0.005, g = 0.003;
    faceRect(m, b, -hu - g - t, hv + g, hu + g + t, hv + g + t, 0.003, AIM);
    faceRect(m, b, -hu - g - t, -hv - g - t, hu + g + t, -hv - g, 0.003, AIM);
    faceRect(m, b, -hu - g - t, -hv - g, -hu - g, hv + g, 0.003, AIM);
    faceRect(m, b, hu + g, -hv - g, hu + g + t, hv + g, 0.003, AIM);
  }
}

// かごの中の表示の日付と時刻（日本時間 "YYYY-MM-DD HH:MM"。ms は世界の時計の時刻）
export function liftClock(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 9 * 3600000);
  const p2 = (v) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

// 形：かご（床・3 面の壁・扉の面・天井の照明・手すり・操作盤とボタン・今の階の表示）とかごの扉、各階の乗り場の扉（1 枚の引き戸。開くと口の
// 片側＝u の向きへ引く）と呼びボタン。aim は照準が当たっているボタン（liftPick の返り値。白いふち）。clock はかごの表示の日付と時刻
// （liftClock。なければ出さない）。{ solid, glass }（createDoorsLayer の形。照明・光っているボタンはアルファ 0.5＝光を受けない色で solid に）
export function liftMeshes(lifts, states, aim = null, clock = null) {
  const solid = new Mesh();
  const glow = solid;
  lifts.forEach((L, i) => {
    const S = states[i];
    const F = L.frame;
    const { u, n, m } = F;
    const { W, d0, d1 } = carGeom(L);
    const P = (s, d) => [m[0] + u[0] * s - n[0] * d, m[1] + u[1] * s - n[1] * d]; // s：扉の面に沿って、d：扉の面から中へ
    const z = S.carZ;
    const H = 2.3; // かごの高さ
    const box = (sa, sb, da, db, za, zb, c, cs = c) => {
      const p = [P(Math.min(sa, sb), da), P(Math.max(sa, sb), da), P(Math.max(sa, sb), db), P(Math.min(sa, sb), db)];
      solid.quad([[p[0], zb], [p[1], zb], [p[2], zb], [p[3], zb]], [0, 0, 1], c);
      solid.quad([[p[3], za], [p[2], za], [p[1], za], [p[0], za]], [0, 0, -1], cs);
      for (let k = 0; k < 4; k++) {
        const a = p[k], b = p[(k + 1) % 4];
        const L2 = lenOf(sub(b, a)) || 1;
        const nn = [(b[1] - a[1]) / L2, -(b[0] - a[0]) / L2];
        solid.quad([[a, za], [b, za], [b, zb], [a, zb]], [nn[0], nn[1], 0], cs);
      }
    };
    // かごの床・天井・3 面の壁（内も外もステンレス）
    box(-W / 2, W / 2, d0, d1, z - 0.12, z + 0.005, CAR_FLOOR, STEEL_DARK);
    box(-W / 2, W / 2, d0, d1, z + H, z + H + 0.1, CAR_CEIL);
    box(-W / 2, -W / 2 + 0.04, d0, d1, z, z + H, STEEL);
    box(W / 2 - 0.04, W / 2, d0, d1, z, z + H, STEEL);
    box(-W / 2, W / 2, d1 - 0.04, d1, z, z + H, STEEL);
    // 扉の面（口のまわり）
    const hw = LIFT_DOOR_W / 2;
    box(-W / 2, -hw, d0, d0 + 0.05, z, z + H, STEEL);
    box(hw, W / 2, d0, d0 + 0.05, z, z + H, STEEL);
    box(-hw, hw, d0, d0 + 0.05, z + LIFT_DOOR_H, z + H, STEEL);
    // 天井の照明（光を受けない明るい板）・奥の手すり
    const lp = [P(-W / 2 + 0.25, d0 + 0.25), P(W / 2 - 0.25, d0 + 0.25), P(W / 2 - 0.25, d1 - 0.25), P(-W / 2 + 0.25, d1 - 0.25)];
    glow.quad([[lp[3], z + H - 0.01], [lp[2], z + H - 0.01], [lp[1], z + H - 0.01], [lp[0], z + H - 0.01]], [0, 0, -1], LIGHT);
    box(-W / 2 + 0.2, W / 2 - 0.2, d1 - 0.1, d1 - 0.05, z + 0.85, z + 0.9, STEEL_DARK);
    // 操作盤（扉の右の縦長のステンレスの柱。動画 IMG_1086）：柱・ボタン・表示
    const sd = sides(F);
    const pa = sd.panel * (hw + PANEL_IN), pb = sd.panel * (hw + PANEL_IN + PANEL_W);
    box(pa, pb, d0 + 0.05, d0 + 0.07, z + 0.04, z + H - 0.06, PANEL_FACE, PANEL_EDGE);
    const btns = liftButtons(L, S);
    const isAim = (b) => aim && aim.i === i && aim.kind === b.kind && aim.k === b.k && (aim.dir || 0) === (b.dir || 0) && !!aim.wc === !!b.wc;
    for (const b of btns) drawButton(solid, b, b.kind === "car" ? levelText(L.levels[b.k].label) : "", isAim(b));
    // 柱の面の上（x：柱のまん中から右、y：かごの床から。面から少し手前に）
    const pm = P(sd.panel * (hw + PANEL_IN + PANEL_W / 2), d0 + 0.07);
    const pf = { c: [pm[0], pm[1], z], N: [-n[0], -n[1], 0], U: [n[1], -n[0], 0] };
    const W2 = PANEL_W / 2;
    faceRect(solid, pf, -W2, 0.04, -W2 + 0.006, H - 0.06, 0.0006, PANEL_EDGE); // 両わきの溝
    faceRect(solid, pf, W2 - 0.006, 0.04, W2, H - 0.06, 0.0006, PANEL_EDGE);
    faceRect(solid, pf, -W2 + 0.012, 1.66, W2 - 0.012, 2.12, 0.0008, DISP_FRAME); // 表示の枠
    faceRect(solid, pf, -0.072, 1.73, 0.072, 1.87, 0.0016, SCREEN_OFF); // 消えた画面
    faceRect(solid, pf, -W2 + 0.012, 1.18, W2 - 0.012, 1.38, 0.0008, BAND); // 黒い帯
    faceRect(solid, pf, -W2 + 0.012, 1.276, W2 - 0.012, 1.282, 0.0012, DISP_FRAME);
    faceRect(glow, pf, -0.038, 1.196, -0.004, 1.23, 0.0016, SOS); // 非常呼び
    faceRect(solid, pf, -0.035, 1.128, 0.07, 1.158, 0.0008, DISP_FRAME); // 銘板
    // 光る画面：向きの矢印と今の階（大きな白い字）、下に日付と時刻（clock）
    faceRect(glow, pf, -0.072, 1.92, 0.072, 2.07, 0.0016, SCREEN);
    const near = L.levels.reduce((best, lv, k) => (Math.abs(lv.z - S.carZ) < Math.abs(L.levels[best].z - S.carZ) ? k : best), S.level);
    const label = levelText(L.levels[near].label);
    const plane = { P: (x, y, d) => onFace(pf, x, y, d), N: pf.N, U: pf.U, V: [0, 0, 1] };
    const size = 0.056;
    const opt = { stroke: 0.08, d0: 0.0022, d1: 0.0028 };
    planeText(glow, plane, label, 0.006, 1.985, size, opt, SCREEN_TEXT, SCREEN_TEXT);
    const dir = S.phase === "moving" && S.target != null ? Math.sign(L.levels[S.target].z - S.carZ) : S.dir || 0;
    if (dir) {
      // ∧（上）・∨（下）：細い 2 本の線
      const ax = -0.03, y0 = dir > 0 ? 1.985 : 2.041, y1 = dir > 0 ? 2.041 : 1.985;
      faceBar(glow, pf, ax - 0.022, y0, ax, y1, 0.0045, 0.0025, SCREEN_TEXT);
      faceBar(glow, pf, ax, y1, ax + 0.022, y0, 0.0045, 0.0025, SCREEN_TEXT);
    }
    if (clock) {
      const cs = 0.0115, copt = { stroke: 0.12, d0: 0.0022, d1: 0.0028 };
      planeText(glow, plane, clock, -textWidth(clock, cs, copt) / 2, 1.938, cs, copt, SCREEN_TEXT, SCREEN_TEXT);
    }
    // 乗り場の縦長の操作盤（panel "strip"。附属図書館の動画 IMG_1077 の 660 秒）：乗り場の壁の外の面（扉の面から lv.hall 外）に、
    // ステンレスの板・黒い表示の窓（橙の今の階、動いているときは向きの矢印）・銘板・青い車いすの印・下の銘板。ボタンは liftButtons
    const sStrip = sd.hall * (hw + 0.2);
    const ledOpt = { stroke: 0.13, d0: 0.0012, d1: 0.0018 };
    L.levels.forEach((lv) => {
      if (lv.panel !== "strip") return;
      const off = lv.hall || 0;
      box(sStrip - STRIP_W / 2, sStrip + STRIP_W / 2, -off - STRIP_OUT, -off + 0.003, lv.z + STRIP_Z0, lv.z + STRIP_Z1, PANEL_FACE, PANEL_FACE);
      const hm = P(sStrip, -off - STRIP_OUT);
      const hf = { c: [hm[0], hm[1], lv.z], N: [n[0], n[1], 0], U: [-n[1], n[0], 0] };
      const w2 = STRIP_W / 2;
      faceRect(solid, hf, -w2, STRIP_Z0, -w2 + 0.004, STRIP_Z1, 0.0005, PANEL_EDGE); // 両わきの細い影
      faceRect(solid, hf, w2 - 0.004, STRIP_Z0, w2, STRIP_Z1, 0.0005, PANEL_EDGE);
      faceRect(solid, hf, -w2 + 0.012, STRIP_DISP[0], w2 - 0.012, STRIP_DISP[1], 0.0008, DISP_BLACK); // 表示の窓
      const hp = { P: (x, y, d) => onFace(hf, x, y, d), N: hf.N, U: hf.U, V: [0, 0, 1] };
      const ls = Math.min(0.07, 0.08 / Math.max(0.01, textWidth(label, 1, ledOpt)));
      planeText(glow, hp, label, -textWidth(label, ls, ledOpt) / 2, STRIP_DISP[0] + 0.035, ls, ledOpt, LED, LED);
      if (dir) {
        const yc = STRIP_DISP[0] + 0.175, s = dir > 0 ? 1 : -1;
        const tri = [[0, yc + 0.04 * s], [-0.026 * s, yc + 0.006 * s], [0.026 * s, yc + 0.006 * s]];
        glow.quad([onFace(hf, ...tri[0], 0.0016), onFace(hf, ...tri[1], 0.0016), onFace(hf, ...tri[2], 0.0016), onFace(hf, ...tri[2], 0.0016)], hf.N, LED);
        faceBar(glow, hf, 0, Math.min(yc + 0.008 * s, yc - 0.04 * s), 0, Math.max(yc + 0.008 * s, yc - 0.04 * s), 0.014, 0.0016, LED);
      }
      faceRect(solid, hf, -0.034, 1.034, 0.034, 1.058, 0.0008, PLATE_GREY); // 銘板
      faceRect(solid, hf, -0.024, 0.935, 0.024, 0.983, 0.0008, WC_BLUE); // 車いすの印
      drawWheelchair(solid, hf, 0, 0.959, 0.0012);
      faceRect(solid, hf, -0.03, 0.775, 0.03, 0.792, 0.0008, PLATE_GREY); // 下の銘板
    });
    // かごの扉と乗り場の扉：1 枚の引き戸（口の幅＋重ね 0.05）。開くと u の向きへ口の幅だけ引く
    const f = ease(S.door);
    const door = (dd, za, zb) => {
      const sh = f * (LIFT_DOOR_W + 0.02);
      box(-hw - 0.025 + sh, hw + 0.025 + sh, dd, dd + 0.03, za, zb, STEEL);
    };
    door(d0 - 0.035, z, z + LIFT_DOOR_H);
    L.levels.forEach((lv, k) => {
      const sh = k === S.level && Math.abs(S.carZ - lv.z) < 0.02 ? f * (LIFT_DOOR_W + 0.02) : 0;
      box(-hw - 0.03 + sh, hw + 0.03 + sh, 0.015, 0.045, lv.z, lv.z + LIFT_DOOR_H, L.doorCol || STEEL); // 壁の厚さの中（開くと壁の中へ引き込む）
      // 色のある扉（大岡山駅の黄色い扉）は縦長の暗いガラスの窓
      if (L.doorCol) box(-0.07 + sh, 0.07 + sh, 0.008, 0.016, lv.z + 0.75, lv.z + 1.85, STEEL_DARK);
    });
  });
  return { solid: solid.result(), glass: new Mesh().result() };
}
