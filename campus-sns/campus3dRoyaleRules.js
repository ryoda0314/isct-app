// キャンパスロワイヤル（バーチャルキャンパスのゲーム。docs/campus-royale-spec.md）のルールの数と、決まった答えを返す関数。
// 部屋サーバー（cf-walk-rooms の RoyaleRoom）・端末・テストが同じものを読む。ほかのファイルは import しない（Worker にそのまま入れるため）。
// 座標は平面の m（キャンパスの中心から東・北）、高さは標高 m、向きは北から時計回りの度。試合の時刻は試合のはじめ（t0）からの秒。
// 円・飛行機・物資の中身は、シード・人数の段（ティア）・時刻だけから計算できる（通信しない）。

// 版：数・決め方・置き場所の表を変えたら上げる（端末と部屋サーバーで合わなければ入れない）
export const RULES_VER = 1;
export const versionOf = (spawnsVer) => RULES_VER * 1000 + (spawnsVer | 0);

export const HP_MAX = 100;
export const SHIELD_MAX = 100;

// ブラスター（おもちゃの光の弾。本物の銃の名前・形にしない）。dmg：1 発（散弾は 1 粒）、rps：1 秒の発数、mag：弾倉、reload：秒、
// full：満額の距離 m、minK・minAt：いちばん下がった倍率とその距離、range：届く距離、spread：ばらつき（度）、head：頭の倍率、
// recoil：1 発で上へ跳ねる角度、adsFov：構えたときの画角
export const WEAPONS = {
  fist: { dmg: 18, rps: 2, auto: false, mag: 0, reload: 0, full: null, minK: 1, minAt: 0, range: 2.2, spread: 0, head: 1, pellets: 1, ammo: null, recoil: 0, adsFov: null },
  pistol: { dmg: 24, rps: 4, auto: false, mag: 12, reload: 1.3, full: 25, minK: 0.6, minAt: 70, range: 120, spread: 1.0, head: 1.5, pellets: 1, ammo: "light", recoil: 0.9, adsFov: 50 },
  smg: { dmg: 15, rps: 11, auto: true, mag: 30, reload: 1.9, full: 18, minK: 0.5, minAt: 55, range: 90, spread: 2.2, head: 1.5, pellets: 1, ammo: "light", recoil: 0.45, adsFov: 52 },
  ar: { dmg: 26, rps: 6.5, auto: true, mag: 25, reload: 2.2, full: 50, minK: 0.7, minAt: 150, range: 250, spread: 1.2, head: 1.5, pellets: 1, ammo: "medium", recoil: 0.7, adsFov: 45 },
  shotgun: { dmg: 10, rps: 1.1, auto: false, mag: 5, reload: 2.6, full: 7, minK: 0.2, minAt: 25, range: 35, spread: 5, head: 1.25, pellets: 8, ammo: "shell", recoil: 2.5, adsFov: 55 },
  sniper: { dmg: 90, rps: 0.7, auto: false, mag: 4, reload: 3.0, full: null, minK: 1, minAt: 0, range: 400, spread: 4, adsSpread: 0.15, head: 2.0, pellets: 1, ammo: "heavy", recoil: 2.2, adsFov: 15 },
};
export const WEAPON_KINDS = ["pistol", "smg", "ar", "shotgun", "sniper"];
export const AMMO_KINDS = ["light", "medium", "shell", "heavy"];
export const AMMO_CAP = { light: 150, medium: 125, shell: 24, heavy: 15 };
export const AMMO_PACK = { light: 30, medium: 25, shell: 6, heavy: 5 };
// 回復（キャンパスの自販機・生協の物）。hp / sh は足す量、hpTo / shTo はそこまで戻す、time は使う秒、max は持てる数
export const HEALS = {
  tea: { hp: 25, time: 2.5, max: 5 },
  bento: { hpTo: 100, time: 6, max: 2 },
  coffee: { sh: 25, time: 2.5, max: 5 },
  energy: { shTo: 100, time: 5, max: 2 },
};
export const HEAL_KINDS = ["tea", "bento", "coffee", "energy"];
export const HELMET_HEAD = 1.0; // ヘルメットをかぶっていれば頭の倍率をこれに
export const HELMET_SNIPER_HEAD = 1.3; // スコープブラスターだけはこれ

export const catOf = (kind) => (WEAPONS[kind] && kind !== "fist" ? "weapon" : AMMO_CAP[kind] ? "ammo" : HEALS[kind] ? "heal" : kind === "helmet" ? "helmet" : null);

// 当たりの形（足もとからの高さ m）：体は縦の線分のまわりの筒、頭は球
export const HIT = { bodyLo: 0.25, bodyHi: 1.45, bodyR: 0.32, headZ: 1.6, headR: 0.17 };
// 拾える近さ（端末）と、部屋サーバーが許す近さ（位置の遅れのぶん広い）
export const PICK = { r: 2.0, dz: 1.6, serverR: 4, serverDz: 3 };
// ロビー（ウッドデッキの西の張り出し＝バーチャルキャンパスの入口）
export const LOBBY = { x: 46, y: 121.5, yaw: 262, r: 2.5 };
// 細かく作ってある範囲（2026-11-25 に features.json から測った外形）。外は円の外と同じ扱い
export const PLAY_RECT = [-407, -487, 466, 593];
export const L_CENTER = [30, 55];
// 人数の段：はじめの円の半径と、円の時間の倍率
export const TIERS = {
  S: { min: 2, max: 4, r0: 160, time: 0.6 },
  M: { min: 5, max: 10, r0: 300, time: 0.8 },
  L: { min: 11, max: 24, r0: 700, time: 1.0 },
};
export const tierFor = (n) => (n <= 4 ? "S" : n <= 10 ? "M" : "L");
// 安全地帯：待つ秒・縮む秒（ティアの倍率を掛ける）、縮んだあとの半径（はじめの半径の何倍）、外にいる人が 1 秒に減る HP
export const ZONE_STAGES = [
  { wait: 60, shrink: 60, k: 0.5, dps: 1 },
  { wait: 45, shrink: 45, k: 0.25, dps: 2 },
  { wait: 40, shrink: 40, k: 0.11, dps: 4 },
  { wait: 30, shrink: 30, k: 0.04, dps: 7 },
  { wait: 20, shrink: 30, k: 0, dps: 10 },
];
export const ZONE_GRACE = 20; // 飛行機が飛び終わってから最初の待ちまで
// 飛行機：標高 m・速さ m/s・飛び降りられるのは出発から jumpAfter 秒後〜終点の forceBefore 秒前（そのとき乗っていれば降ろす）
export const PLANE = { z: 260, speed: 30, jumpAfter: 3, forceBefore: 2, margin: 150, offK: 0.3 };
// 降下：落下・急降下・パラシュート・ブレーキの下りる速さと横の最大の速さ（m/s）、横の加速（m/s²）、自動で開く高さ（足場から m）、手で開けるまでの秒
export const DROP = { fall: 30, dive: 48, fallH: 18, diveH: 6, acc: 12, chute: 6.5, chuteH: 10, brake: 5, brakeH: 3, autoOpen: 60, manualAfter: 1 };
export const FALL_DAMAGE = null; // v1 はなし（屋上に降りても飛び降りられるように）
// 物資の重み
export const LOOT = {
  kinds: { weapon: 34, ammo: 28, heal: 26, helmet: 6, none: 6 },
  weapons: { pistol: 30, smg: 24, ar: 22, shotgun: 16, sniper: 8 },
  heals: { tea: 40, coffee: 35, bento: 12, energy: 13 },
  indoorWeapon: 1.3,
  hubWeaponMin: 0.4,
  margin: 50, // はじめの円＋これの中の置き場所だけに出す
};
// 置き場所の flags（campus3dRoyaleSpawns.js）
export const SPOT = { indoor: 1, hub: 2, open: 4 };
// 試合の進み（秒）
export const MATCH = { countdown: 10, practiceCountdown: 3, readyWait: 30, end: 15, max: 24, practiceDummies: 10 };
// 部屋サーバーが許す動き（位置の飛びを捨てる）：1 秒あたり m と、遅れのぶんの余り
export const MOVE = { groundSpeed: 14, airSpeed: 22, slack: 3 };
// 端末の処理が届くまでの遅れのぶん、リロード・回復の時間を少し短く見る（ms）
export const SLACK_MS = 350;

// ── 決まった乱数（mulberry32）──
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 重みの表から 1 つ（r は 0〜1 の乱数を返す関数）
export function weighted(r, table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let v = r() * sum;
  for (const k in table) {
    v -= table[k];
    if (v < 0) return k;
  }
  return Object.keys(table).pop();
}

const inRect = (x, y) => x >= PLAY_RECT[0] && x <= PLAY_RECT[2] && y >= PLAY_RECT[1] && y <= PLAY_RECT[3];

/**
 * 試合の計画（試合のはじめに 1 回だけ作る。同じシード・ティア・置き場所なら同じ答え）。
 * spawns は [[x, y, z, flags], …]、hubs は [{ id, name, x, y }, …]
 * @returns { seed, tier, center0, r0, plane: { a, b, yaw, dur }, zones: [{ start, shrink, end, from, to, dps }], loot: Map(id → { kind, n }), dummies: [[x, y, z, yaw]…],
 *   dummyLoot: [的が立つ物資の点の番号…]（練習ではじめに拾われた扱い） }
 */
export function matchPlan(seed, tier, spawns, hubs = []) {
  const T = TIERS[tier] || TIERS.S;
  const r = rng(seed);
  const hub = tier === "L" || !hubs.length ? null : hubs[Math.floor(r() * hubs.length)];
  const center0 = hub ? [hub.x, hub.y] : [...L_CENTER];
  const r0 = T.r0;
  // 飛行機の線：中心から 0.3×r0 以内の点を通る直線。始点と終点は半径 r0＋margin の円との交点
  const pr = PLANE.offK * r0 * Math.sqrt(r()), pa = r() * Math.PI * 2;
  const P = [center0[0] + Math.cos(pa) * pr, center0[1] + Math.sin(pa) * pr];
  const yaw = r() * 360;
  const d = [Math.sin((yaw * Math.PI) / 180), Math.cos((yaw * Math.PI) / 180)];
  const R = r0 + PLANE.margin;
  const w = [P[0] - center0[0], P[1] - center0[1]];
  const b = d[0] * w[0] + d[1] * w[1], c = w[0] * w[0] + w[1] * w[1] - R * R;
  const s = Math.sqrt(Math.max(0, b * b - c));
  const a = [P[0] + d[0] * (-b - s), P[1] + d[1] * (-b - s)];
  const e = [P[0] + d[0] * (-b + s), P[1] + d[1] * (-b + s)];
  const dur = (2 * s) / PLANE.speed;
  const plane = { a, b: e, yaw, dur };
  // 円：次の円は前の円の中に全部入る。次の中心は前の円の中の「屋外の広い所」の点から選ぶ（なければ円の中のどこか）
  const open = spawns.filter((p) => p[3] & SPOT.open);
  const zones = [];
  let cur = { x: center0[0], y: center0[1], r: r0 };
  const d0 = dur + ZONE_GRACE;
  zones.push({ start: 0, shrink: d0, end: d0, from: cur, to: cur, dps: 0 });
  let t = d0;
  for (const st of ZONE_STAGES) {
    const rn = r0 * st.k;
    const room = cur.r - rn;
    const cand = open.filter((p) => Math.hypot(p[0] - cur.x, p[1] - cur.y) <= room && inRect(p[0], p[1]));
    let nx, ny;
    if (cand.length) {
      const p = cand[Math.floor(r() * cand.length)];
      nx = p[0];
      ny = p[1];
    } else {
      const rr = room * Math.sqrt(r()), aa = r() * Math.PI * 2;
      nx = cur.x + Math.cos(aa) * rr;
      ny = cur.y + Math.sin(aa) * rr;
    }
    const next = { x: nx, y: ny, r: rn };
    const shrink = t + st.wait * T.time, end = shrink + st.shrink * T.time;
    zones.push({ start: t, shrink, end, from: cur, to: next, dps: st.dps });
    cur = next;
    t = end;
  }
  // 物資：はじめの円＋margin の中の置き場所だけ。番号は置き場所の並びの番号
  const lr = rng((seed ^ 0x5bd1e995) >>> 0);
  const loot = new Map();
  const hubIds = [];
  spawns.forEach((p, id) => {
    if (Math.hypot(p[0] - center0[0], p[1] - center0[1]) > r0 + LOOT.margin) return;
    const kinds = { ...LOOT.kinds };
    if (p[3] & SPOT.indoor) kinds.weapon *= LOOT.indoorWeapon;
    const cat = weighted(lr, kinds);
    const it = rollItem(lr, cat);
    if (it) loot.set(id, it);
    if (p[3] & SPOT.hub) hubIds.push(id);
  });
  // 拠点の点は 4 割以上がブラスターになるように補う（なしの点から先に）
  const isWeapon = (id) => catOf(loot.get(id)?.kind) === "weapon";
  let wn = hubIds.filter(isWeapon).length;
  const need = Math.ceil(hubIds.length * LOOT.hubWeaponMin);
  if (wn < need) {
    const empty = hubIds.filter((id) => !loot.has(id)), other = hubIds.filter((id) => loot.has(id) && !isWeapon(id));
    for (const pool of [empty, other]) {
      while (wn < need && pool.length) {
        const id = pool.splice(Math.floor(lr() * pool.length), 1)[0];
        loot.set(id, rollItem(lr, "weapon"));
        wn++;
      }
    }
  }
  // 練習の的の場所：はじめの円の中心から 25〜100 m の屋外の点。物資のない点から先に選ぶ。
  // 物資の点に立つと、落ちているブラスターが的の脚を突き抜けて見える（2026-11-25）。本物の置き場所では中心の近くの
  // 屋外の点はほとんど物資があるので、その点の番号を dummyLoot に入れて、練習では試合のはじめに拾われた扱いにする（Match）
  const dr = rng((seed ^ 0x27d4eb2f) >>> 0);
  const nearIds = [];
  spawns.forEach((p, id) => {
    const dc = Math.hypot(p[0] - center0[0], p[1] - center0[1]);
    if (!(p[3] & SPOT.indoor) && dc >= 25 && dc <= 100) nearIds.push(id);
  });
  const dummies = [], dummyLoot = [];
  for (const pool of [nearIds.filter((id) => !loot.has(id)), nearIds.filter((id) => loot.has(id))]) {
    while (pool.length && dummies.length < MATCH.practiceDummies) {
      const id = pool.splice(Math.floor(dr() * pool.length), 1)[0], p = spawns[id];
      dummies.push([p[0], p[1], p[2], Math.round(dr() * 360)]);
      if (loot.has(id)) dummyLoot.push(id);
    }
  }
  return { seed, tier, center0, r0, plane, zones, loot, dummies, dummyLoot };
}

function rollItem(r, cat) {
  if (cat === "weapon") {
    const kind = weighted(r, LOOT.weapons);
    return { kind, n: WEAPONS[kind].mag };
  }
  if (cat === "ammo") {
    const kind = AMMO_KINDS[Math.floor(r() * AMMO_KINDS.length)];
    return { kind, n: AMMO_PACK[kind] };
  }
  if (cat === "heal") return { kind: weighted(r, LOOT.heals), n: 1 };
  if (cat === "helmet") return { kind: "helmet", n: 1 };
  return null;
}

// 飛行機のいま（t は試合の秒）
export function planeAt(plan, t) {
  const { a, b, yaw, dur } = plan.plane;
  const k = Math.min(1, Math.max(0, dur > 0 ? t / dur : 1));
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: PLANE.z, yaw, on: t >= 0 && t <= dur, k };
}
// 飛び降りられる時間か・自動で降ろす時刻
export const canJump = (plan, t) => t >= PLANE.jumpAfter && t <= plan.plane.dur - PLANE.forceBefore;
export const ejectAt = (plan) => Math.max(PLANE.jumpAfter, plan.plane.dur - PLANE.forceBefore);

/**
 * いまの円（t は試合の秒）。
 * @returns { x, y, r, next: { x, y, r }, stage（0 降下・1〜5）, shrinking, dps（外にいるときの 1 秒のダメージ）, until（次に変わる試合の秒）, last（最後の円が閉じた） }
 */
export function zoneAt(plan, t) {
  const zs = plan.zones;
  let i = 0;
  while (i + 1 < zs.length && t >= zs[i + 1].start) i++;
  const z = zs[i];
  const lastZ = zs[zs.length - 1];
  if (i === zs.length - 1 && t >= z.end) return { x: z.to.x, y: z.to.y, r: z.to.r, next: z.to, stage: i, shrinking: false, dps: z.dps, until: Infinity, last: true };
  // 降下中（縮まない段）は、次の段の円を「次」として見せる
  const next = z.to.r === z.from.r && zs[i + 1] ? zs[i + 1].to : z.to;
  if (t < z.shrink) return { x: z.from.x, y: z.from.y, r: z.from.r, next, stage: i, shrinking: false, dps: z.dps, until: z.shrink === z.end && zs[i + 1] ? zs[i + 1].shrink : z.shrink, last: false };
  const k = Math.min(1, (t - z.shrink) / Math.max(1e-6, z.end - z.shrink));
  void lastZ;
  return {
    x: z.from.x + (z.to.x - z.from.x) * k, y: z.from.y + (z.to.y - z.from.y) * k, r: z.from.r + (z.to.r - z.from.r) * k,
    next: z.to, stage: i, shrinking: true, dps: z.dps, until: z.end, last: false,
  };
}
// 円の中か（作り込んだ範囲の外は円の外）
export const inZone = (z, x, y) => inRect(x, y) && Math.hypot(x - z.x, y - z.y) <= z.r;
// 試合の終わりのいちばん遅い時刻（最後の円が閉じる）
export const zonesEnd = (plan) => plan.zones[plan.zones.length - 1].end;

/**
 * 当たったときのダメージ。heads は頭に当たった数、k は当たった数（散弾は粒の数）、helmet は撃たれた人がヘルメットをかぶっているか
 */
export function damageOf(kind, dist, heads = 0, k = 1, helmet = false) {
  const w = WEAPONS[kind];
  if (!w || k < 1) return 0;
  let f = 1;
  if (w.full != null && dist > w.full) f = dist >= w.minAt ? w.minK : 1 - ((1 - w.minK) * (dist - w.full)) / (w.minAt - w.full);
  const hm = helmet ? (kind === "sniper" ? HELMET_SNIPER_HEAD : HELMET_HEAD) : w.head;
  const h = Math.max(0, Math.min(k, heads));
  return Math.round(w.dmg * f * (k - h + h * hm));
}
// ばらつき（度）：動いている・空中・構え・しゃがみ
export function spreadOf(kind, { moving = false, air = false, ads = false, sneak = false } = {}) {
  const w = WEAPONS[kind];
  if (!w || !w.spread) return 0;
  let s = ads ? (w.adsSpread ?? w.spread * 0.5) : w.spread;
  if (moving) s *= 1.6;
  if (air) s *= 2.2;
  if (sneak) s *= 0.8;
  return s;
}
// 回復を使ったあとの HP・シールド
export function healed(kind, hp, sh) {
  const h = HEALS[kind];
  if (!h) return { hp, sh };
  if (h.hp) hp = Math.min(HP_MAX, hp + h.hp);
  if (h.hpTo) hp = Math.max(hp, h.hpTo);
  if (h.sh) sh = Math.min(SHIELD_MAX, sh + h.sh);
  if (h.shTo) sh = Math.max(sh, h.shTo);
  return { hp, sh };
}
// 回復を使って意味があるか（満タンなら使わない）
export const healUseful = (kind, hp, sh) => (HEALS[kind]?.hp || HEALS[kind]?.hpTo ? hp < HP_MAX : sh < SHIELD_MAX);
