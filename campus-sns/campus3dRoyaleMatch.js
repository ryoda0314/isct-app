// キャンパスロワイヤルの試合の進み（部屋 1 つぶん。docs/campus-royale-spec.md の 4〜6 章）。
// ソケット・時計・地図・描画を持たない状態機械：handle(id, msg, now) と tick(now) と leave(id, now) が「出すメッセージの並び」を返す。
// 部屋サーバー（cf-walk-rooms/src/royale.js の RoyaleRoom）・練習（端末の中。campus3dRoyaleLink の createLocalRoyaleLink）・テストが
// 同じものを動かす。建物の形は持たない（弾が壁を抜けたかは撃った端末が決める）。ダメージ・HP・持ち物・アウト・順位はここが決める。
// 出すメッセージ：{ to: "all" | "others" | id | [id…], from, msg, close? }（others は from 以外の全員。close は送ったあと接続を切る）
// このファイルは campus3dRoyaleRules.js のほかは import しない（Worker に入れるため）。
import {
  AMMO_CAP, AMMO_KINDS, HEALS, HEAL_KINDS, HP_MAX, LOBBY, MATCH, MOVE, PICK, PLANE, SLACK_MS, WEAPONS,
  catOf, damageOf, ejectAt, healUseful, healed, inZone, matchPlan, planeAt, tierFor, versionOf, zoneAt, zonesEnd,
} from "./campus3dRoyaleRules.js";

const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const r2 = (v) => Math.round(v * 100) / 100;
export const DROP_ID0 = 100000; // 落とした物資の番号のはじめ（置き場所の番号と重ならない）
export const DUMMY_ID0 = 1001; // 練習の的の番号のはじめ

/**
 * 部屋 1 つぶんの試合。spawns・hubs は campus3dRoyaleSpawns.js の SPAWNS・HUBS、spawnsVer は SPAWNS_VER、random は 0〜1 の乱数（テストで固定）、
 * max は入れる人数、practice は練習（ひとり＋的。1 人でも始まる・秒読みが短い）
 */
export function createRoyaleMatch({ spawns = [], hubs = [], spawnsVer = 0, random = Math.random, max = MATCH.max, practice = false } = {}) {
  const ver = versionOf(spawnsVer);
  const players = new Map(); // id → 人（的も。試合の途中で出た人は gone にして結果まで残す）
  let phase = "lobby";
  let readySince = null; // 準備OKが 2 人になった時刻（30 秒たてば、全員がそろわなくても始める）
  let startAt = 0, t0 = 0, endAt = 0;
  let seed = 0, tier = "S", plan = null, roster = [], results = null, winner = 0;
  const taken = new Set(); // 拾われた置き場所の物資の番号
  const drops = new Map(); // 落とした物資：番号 → { id, kind, n, x, y, z（null は空中で落とした＝地面は端末が探す） }
  const over = new Map(); // 置き場所の物資の、一部だけ拾われたあとの数
  let nextDrop = DROP_ID0;
  let out = [];

  const all = (msg) => out.push({ to: "all", from: 0, msg });
  const others = (from, msg) => out.push({ to: "others", from, msg });
  const one = (id, msg, close = false) => out.push(close ? { to: id, from: 0, msg, close: true } : { to: id, from: 0, msg });
  const some = (ids, msg) => { if (ids.length) out.push({ to: ids, from: 0, msg }); };
  const humans = () => [...players.values()].filter((p) => !p.dummy && !p.gone);
  const entrants = () => roster.map((id) => players.get(id)).filter(Boolean);
  const aliveList = () => entrants().filter((p) => p.alive);
  const matchT = (now) => (now - t0) / 1000;
  const heldKind = (p) => (p.held === 0 ? "fist" : p.slots[p.held - 1]?.kind || "fist");
  const playing = (p) => phase === "play" && p.inMatch && p.alive;
  const invMsg = (p) => ["i", p.hp, p.sh, p.helmet ? 1 : 0, p.slots.map((s) => (s ? [s.kind, s.mag] : null)), AMMO_KINDS.map((k) => p.ammo[k]), HEAL_KINDS.map((k) => p.heals[k]), p.held];
  const resync = (p) => { if (!p.dummy) one(p.id, invMsg(p)); };

  // 試合ごとに戻すもの
  function fresh(p) {
    Object.assign(p, {
      alive: false, jumped: false, hp: HP_MAX, sh: 0, helmet: false, slots: [null, null],
      ammo: { light: 0, medium: 0, shell: 0, heavy: 0 }, heals: { tea: 0, bento: 0, coffee: 0, energy: 0 }, held: 0,
      fireKind: null, fireBudget: 0, fireAt: 0, credit: 0, healing: null, kills: 0, damage: 0, place: 0, zoneAt: 0, zoneAcc: 0, hasPos: false,
    });
  }

  function snapshot() {
    return {
      phase, t0, seed, tier, startAt, endAt, roster: [...roster], winner, results,
      players: [...players.values()].filter((p) => !p.gone).map((p) => [p.id, p.name, p.col, p.alive ? 1 : 0, r2(p.x), r2(p.y), r2(p.z), Math.round(p.yaw), p.st, heldKind(p), p.ready ? 1 : 0, p.inMatch ? 1 : 0, p.kills, p.dummy ? 1 : 0]),
      taken: [...taken], drops: [...drops.values()].map((d) => [d.id, d.kind, d.n, d.x, d.y, d.z]), over: [...over],
    };
  }

  // ── 入る・準備・始まる ──
  function join(id, msg, now) {
    if (msg[3] !== ver) return one(id, ["x", "ver"], true);
    const name = String(msg[1] ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) || "ゲスト";
    const col = typeof msg[2] === "string" && /^#[0-9a-fA-F]{6}$/.test(msg[2]) ? msg[2].toLowerCase() : "#6870e0";
    let p = players.get(id);
    if (p && !p.gone && !p.dummy) {
      // 名前・色を変えただけ
      p.name = name;
      p.col = col;
      others(id, ["j", id, name, col]);
      return;
    }
    if (humans().length >= max) return one(id, ["x", "full"], true);
    p = { id, name, col, dummy: false, gone: false, ready: false, inMatch: false, x: LOBBY.x, y: LOBBY.y, z: 0, yaw: LOBBY.yaw, st: phase === "play" ? 11 : 0, posAt: now };
    fresh(p);
    players.set(id, p);
    one(id, ["h", id, now, snapshot()]);
    others(id, ["j", id, name, col]);
  }

  function ready(p, msg, now) {
    if (phase !== "lobby" && phase !== "countdown") return;
    const v = msg[1] ? 1 : 0;
    if (p.ready === !!v) return;
    p.ready = !!v;
    all(["r", p.id, v]);
    checkReady(now);
  }

  function checkReady(now) {
    const hs = humans();
    const rd = hs.filter((q) => q.ready);
    const need = practice ? 1 : 2;
    if (phase === "lobby") {
      if (rd.length >= need && rd.length === hs.length) startCountdown(now);
      else if (rd.length >= need) readySince ??= now;
      else readySince = null;
    } else if (phase === "countdown" && rd.length < need) {
      phase = "lobby";
      readySince = null;
      all(["m", "lobby"]);
    }
  }

  function startCountdown(now) {
    phase = "countdown";
    readySince = null;
    startAt = now + (practice ? MATCH.practiceCountdown : MATCH.countdown) * 1000;
    all(["m", "countdown", startAt]);
  }

  function startPlay(at) {
    const rd = humans().filter((p) => p.ready);
    if (rd.length < (practice ? 1 : 2)) {
      phase = "lobby";
      readySince = null;
      all(["m", "lobby"]);
      return;
    }
    seed = Math.floor(random() * 4294967296) >>> 0;
    tier = practice ? "S" : tierFor(rd.length);
    plan = matchPlan(seed, tier, spawns, hubs);
    t0 = at;
    taken.clear();
    drops.clear();
    over.clear();
    nextDrop = DROP_ID0;
    results = null;
    winner = 0;
    roster = rd.map((p) => p.id);
    for (const p of players.values()) {
      fresh(p);
      p.inMatch = roster.includes(p.id);
      p.alive = p.inMatch;
      p.st = p.inMatch ? 10 : 11;
      p.zoneAt = at;
    }
    if (practice) {
      plan.dummies.forEach(([x, y, z, yaw], i) => {
        const d = { id: DUMMY_ID0 + i, name: `的 ${i + 1}`, col: "#8d99ae", dummy: true, gone: false, ready: true, inMatch: true, x, y, z, yaw, st: 0, posAt: at };
        fresh(d);
        Object.assign(d, { alive: true, jumped: true, hasPos: true, zoneAt: at });
        players.set(d.id, d);
        roster.push(d.id);
        all(["j", d.id, d.name, d.col]);
      });
    }
    phase = "play";
    all(["m", "play", t0, seed, tier, [...roster]]);
    // 練習：的の足もとの物資は、はじめから拾われた扱い（落ちているブラスターが的の脚を突き抜けて見えるため）
    if (practice) for (const lid of plan.dummyLoot || []) { taken.add(lid); all(["g", lid, 0]); }
    for (const id of roster) {
      const p = players.get(id);
      if (p.dummy) all(["p", p.id, r2(p.x), r2(p.y), r2(p.z), p.yaw, 0]);
      else one(p.id, invMsg(p));
    }
  }

  // ── 時間で進むもの（zone：円の外のダメージも。部屋サーバーは 1 秒に 1 回、練習は 0.25 秒に 1 回呼ぶ）──
  function advance(now, zone) {
    if (phase === "lobby" && readySince != null && now >= readySince + MATCH.readyWait * 1000) startCountdown(now);
    if (phase === "countdown" && now >= startAt) startPlay(startAt);
    if (phase === "play") {
      const t = matchT(now);
      if (t >= ejectAt(plan)) for (const p of aliveList()) if (!p.jumped) jumpOut(p, t0 + ejectAt(plan) * 1000);
      if (zone) for (const p of aliveList()) if (phase === "play") zoneHurt(p, now);
      if (phase === "play" && t > zonesEnd(plan) + 120) endMatch(now); // 最後の円が閉じてもまだ決まらないとき（ふつうは来ない）
    }
    if (phase === "end" && now >= endAt) toLobby();
  }

  function jumpOut(p, at) {
    const P = planeAt(plan, (at - t0) / 1000);
    Object.assign(p, { jumped: true, x: r2(P.x), y: r2(P.y), z: P.z, st: 8, posAt: at, hasPos: true });
  }

  function zoneHurt(p, now) {
    const dt = Math.min(2, Math.max(0, (now - p.zoneAt) / 1000));
    p.zoneAt = now;
    if (!p.jumped || dt <= 0) return;
    const z = zoneAt(plan, matchT(now));
    if (z.dps <= 0 || inZone(z, p.x, p.y)) {
      p.zoneAcc = 0;
      return;
    }
    p.zoneAcc += z.dps * dt;
    const d = Math.floor(p.zoneAcc + 1e-9);
    if (d < 1) return;
    p.zoneAcc -= d;
    p.hp = Math.max(0, p.hp - d); // 円のダメージはシールドを無視する
    all(["d", p.id, p.hp, p.sh, 0, "zone", 0]);
    if (p.hp <= 0) eliminate(p, 0, "zone", now);
  }

  // ── 動く・飛び降りる・持ちかえる ──
  function move(p, msg, now) {
    const x = num(msg[1], -5000, 5000), y = num(msg[2], -5000, 5000), z = num(msg[3], -200, 1000), yaw = num(msg[4], -720, 720), st = num(msg[5], 0, 15);
    if (x == null || y == null || z == null || yaw == null) return;
    const s = st == null ? 0 : Math.round(st);
    if (phase === "play" || phase === "end") {
      if (!p.inMatch || !p.alive) return; // 観戦・アウトの人の位置は配らない
      if (phase === "play" && !p.jumped) return; // 飛行機の中（位置は飛行機）
      if (p.hasPos) {
        const dt = Math.max(0.05, (now - p.posAt) / 1000);
        const air = s === 8 || s === 9 || p.st === 8 || p.st === 9;
        if (Math.hypot(x - p.x, y - p.y) > (air ? MOVE.airSpeed : MOVE.groundSpeed) * dt + MOVE.slack) return; // 速すぎる飛び
      }
    }
    Object.assign(p, { x: r2(x), y: r2(y), z: r2(z), yaw: Math.round(yaw), st: s, posAt: now, hasPos: true });
    others(p.id, ["p", p.id, p.x, p.y, p.z, p.yaw, p.st]);
  }

  function dropOut(p, now) {
    if (!playing(p) || p.jumped) return;
    if (matchT(now) < PLANE.jumpAfter - 0.5) return;
    jumpOut(p, Math.min(now, t0 + ejectAt(plan) * 1000));
  }

  function hold(p, msg) {
    const s = int(msg[1]);
    if (s == null || s < 0 || s > 2) return;
    p.held = s;
    if (playing(p)) others(p.id, ["w", p.id, heldKind(p)]);
  }

  // ── 撃つ・当たる ──
  function fire(p, msg, now) {
    if (!playing(p) || !p.jumped) return;
    const s = int(msg[1]), n = int(msg[2]);
    if (s == null || n == null || s < 0 || s > 2 || n < 1 || n > 30) return;
    const it = s === 0 ? null : p.slots[s - 1];
    const kind = s === 0 ? "fist" : it?.kind;
    if (!kind) return resync(p);
    const W = WEAPONS[kind];
    // 連射の速さ：持っている装備の 1 秒の発数ぶんずつたまる（0.5 秒＋2 発までためられる）
    if (p.fireKind !== kind) {
      p.fireKind = kind;
      p.fireBudget = 2;
      p.fireAt = now;
    }
    p.fireBudget = Math.min(W.rps * 0.5 + 2, p.fireBudget + ((now - p.fireAt) / 1000) * W.rps);
    p.fireAt = now;
    if (n > p.fireBudget + 1e-6) return resync(p);
    if (it) {
      if (it.mag < n) return resync(p);
      it.mag -= n;
      it.shotAt = now;
    }
    p.fireBudget -= n;
    p.credit = Math.min(64, p.credit + n * W.pellets); // この数までの当たりを受けつける
    p.healing = null; // 撃つと回復は取り消し
    const yaw = num(msg[3], -720, 720) ?? p.yaw, pitch = num(msg[4], 0, 180) ?? 90;
    others(p.id, ["f", p.id, kind, n, Math.round(yaw), Math.round(pitch)]);
  }

  function hit(p, msg, now) {
    if (!playing(p) || !p.jumped) return;
    const tid = int(msg[1]), s = int(msg[2]), heads = int(msg[3]), k = int(msg[4]);
    if (tid == null || s == null || heads == null || k == null || s < 0 || s > 2) return;
    const q = players.get(tid);
    if (!q || q === p || q.gone || !q.inMatch || !q.alive || !q.jumped) return;
    if (k < 1 || heads < 0 || heads > k || k > p.credit) return;
    const kind = s === 0 ? "fist" : p.slots[s - 1]?.kind;
    if (!kind) return;
    const dist = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (dist > WEAPONS[kind].range * 1.1 + 5) return; // 部屋が知っている位置で遠すぎる
    p.credit -= k;
    hurt(q, damageOf(kind, dist, heads, k, q.helmet), p, kind, heads > 0, now);
  }

  function hurt(q, dmg, by, kind, head, now) {
    if (!(dmg > 0)) return;
    const before = q.hp + q.sh;
    const s = Math.min(q.sh, dmg);
    q.sh -= s;
    q.hp = Math.max(0, q.hp - (dmg - s));
    if (by) by.damage += Math.min(dmg, before);
    all(["d", q.id, q.hp, q.sh, by ? by.id : 0, kind, head ? 1 : 0]);
    if (q.hp <= 0) eliminate(q, by ? by.id : 0, kind, now);
  }

  function eliminate(p, by, kind, now) {
    if (!p.alive) return;
    const before = aliveList().length;
    p.alive = false;
    p.place = before;
    p.healing = null;
    const killer = by ? players.get(by) : null;
    if (killer && killer !== p) killer.kills++;
    dropAll(p);
    p.st = 11;
    all(["k", p.id, by || 0, kind, p.place, before - 1]);
    checkEnd(now);
  }

  // アウトになった人の持ち物を、その場にまわりへ並べて落とす（空中ならその下の地面は端末が探す）
  function dropAll(p) {
    const z = p.st === 8 || p.st === 9 ? null : p.z;
    const items = [];
    p.slots.forEach((s) => s && items.push([s.kind, s.mag]));
    AMMO_KINDS.forEach((k) => p.ammo[k] > 0 && items.push([k, p.ammo[k]]));
    HEAL_KINDS.forEach((k) => p.heals[k] > 0 && items.push([k, p.heals[k]]));
    if (p.helmet) items.push(["helmet", 1]);
    items.forEach(([kind, n], i) => {
      const a = (i / items.length) * Math.PI * 2, r = items.length > 1 ? 0.9 : 0;
      dropItem(kind, n, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, z);
    });
    p.slots = [null, null];
    for (const k of AMMO_KINDS) p.ammo[k] = 0;
    for (const k of HEAL_KINDS) p.heals[k] = 0;
    p.helmet = false;
  }

  function dropItem(kind, n, x, y, z) {
    const id = nextDrop++;
    const d = { id, kind, n, x: r2(x), y: r2(y), z: z == null ? null : r2(z) };
    drops.set(id, d);
    all(["o", id, kind, n, d.x, d.y, d.z]);
  }

  function checkEnd(now) {
    if (phase !== "play") return;
    const alive = aliveList();
    if (alive.length <= 1 || !alive.some((q) => !q.dummy)) endMatch(now, alive.length === 1 ? alive[0] : null);
  }

  function endMatch(now, w = null) {
    phase = "end";
    endAt = now + MATCH.end * 1000;
    if (w) w.place = 1;
    winner = w ? w.id : 0;
    results = entrants()
      .map((q) => [q.id, q.place || (q.alive ? 1 : 0), q.kills, Math.round(q.damage), q.name])
      .sort((a, b) => (a[1] || 999) - (b[1] || 999) || b[2] - a[2] || a[0] - b[0]);
    all(["m", "end", winner, results]);
  }

  function toLobby() {
    phase = "lobby";
    plan = null;
    readySince = null;
    for (const [id, p] of [...players]) {
      if (p.dummy || p.gone) {
        players.delete(id);
        if (p.dummy) all(["l", id]);
        continue;
      }
      fresh(p);
      p.ready = false;
      p.inMatch = false;
      p.st = 0;
    }
    roster = [];
    results = null;
    winner = 0;
    taken.clear();
    drops.clear();
    over.clear();
    all(["m", "lobby"]);
  }

  // ── 物資 ──
  function lootItem(lid) {
    const d = drops.get(lid);
    if (d) return { ...d, drop: true };
    if (!plan || taken.has(lid)) return null;
    const L = plan.loot.get(lid), s = spawns[lid];
    if (!L || !s) return null;
    return { id: lid, kind: L.kind, n: over.get(lid) ?? L.n, x: s[0], y: s[1], z: s[2], drop: false };
  }

  // 持ち物に入れる。残った数（0 は全部入った）か -1（入らない）
  function give(p, it) {
    const cat = catOf(it.kind);
    if (cat === "ammo" || cat === "heal") {
      const room = cat === "ammo" ? AMMO_CAP[it.kind] - p.ammo[it.kind] : HEALS[it.kind].max - p.heals[it.kind];
      if (room <= 0) return -1;
      const t = Math.min(room, it.n);
      if (cat === "ammo") p.ammo[it.kind] += t;
      else p.heals[it.kind] += t;
      return it.n - t;
    }
    if (cat === "helmet") {
      if (p.helmet) return -1;
      p.helmet = true;
      return 0;
    }
    if (cat === "weapon") {
      let s = !p.slots[0] ? 0 : !p.slots[1] ? 1 : -1;
      if (s < 0) {
        // 枠がいっぱい：手に持っているもの（素手なら 1 つ目）と入れかえ、古いほうはその場に落とす
        s = p.held >= 1 ? p.held - 1 : 0;
        const old = p.slots[s];
        dropItem(old.kind, old.mag, p.x, p.y, p.z);
      }
      p.slots[s] = { kind: it.kind, mag: Math.max(0, Math.min(WEAPONS[it.kind].mag, it.n)), shotAt: 0, reloadAt: 0 };
      return 0;
    }
    return -1;
  }

  function take(p, msg) {
    if (!playing(p) || !p.jumped) return;
    const lid = int(msg[1]);
    if (lid == null) return;
    const it = lootItem(lid);
    if (!it) return;
    if (Math.hypot(it.x - p.x, it.y - p.y) > PICK.serverR || (it.z != null && Math.abs(it.z - p.z) > PICK.serverDz)) return;
    const left = give(p, it);
    if (left < 0) return resync(p);
    if (left === 0) {
      if (it.drop) drops.delete(lid);
      else {
        taken.add(lid);
        over.delete(lid);
      }
      all(["g", lid, p.id]);
    } else {
      if (it.drop) drops.get(lid).n = left;
      else over.set(lid, left);
      all(["o", lid, it.kind, left, it.x, it.y, it.z]);
    }
    one(p.id, invMsg(p));
  }

  function discard(p, msg) {
    if (!playing(p) || !p.jumped) return;
    const k = String(msg[1] ?? "");
    const cat = catOf(k);
    if (cat === "weapon") {
      const s = p.held >= 1 && p.slots[p.held - 1]?.kind === k ? p.held - 1 : p.slots.findIndex((x) => x?.kind === k);
      if (s < 0) return resync(p);
      const it = p.slots[s];
      p.slots[s] = null;
      if (p.held === s + 1) p.held = 0;
      dropItem(it.kind, it.mag, p.x, p.y, p.z);
    } else if (cat === "ammo" || cat === "heal") {
      const bag = cat === "ammo" ? p.ammo : p.heals;
      if (!bag[k]) return resync(p);
      dropItem(k, bag[k], p.x, p.y, p.z);
      bag[k] = 0;
    } else if (cat === "helmet") {
      if (!p.helmet) return resync(p);
      p.helmet = false;
      dropItem("helmet", 1, p.x, p.y, p.z);
    } else return;
    one(p.id, invMsg(p));
  }

  function reload(p, msg, now) {
    if (!playing(p)) return;
    const s = int(msg[1]);
    if (s !== 1 && s !== 2) return;
    const it = p.slots[s - 1];
    if (!it) return resync(p);
    const W = WEAPONS[it.kind];
    const need = W.mag - it.mag, have = p.ammo[W.ammo];
    if (need <= 0 || have <= 0) return resync(p);
    if (now - Math.max(it.shotAt, it.reloadAt) < W.reload * 1000 - SLACK_MS) return resync(p); // 早すぎる
    const m = Math.min(need, have);
    it.mag += m;
    p.ammo[W.ammo] -= m;
    it.reloadAt = now;
    one(p.id, invMsg(p));
  }

  function heal(p, msg, now) {
    if (!playing(p) || !p.jumped) return;
    const k = String(msg[1] ?? "");
    const H = HEALS[k];
    if (!H) return;
    if (!msg[2]) {
      // 使いはじめ
      if (p.heals[k] > 0 && healUseful(k, p.hp, p.sh)) p.healing = { kind: k, at: now };
      return;
    }
    if (!p.healing || p.healing.kind !== k || p.heals[k] <= 0 || now - p.healing.at < H.time * 1000 - SLACK_MS) {
      p.healing = null;
      return resync(p);
    }
    const r = healed(k, p.hp, p.sh);
    p.hp = r.hp;
    p.sh = r.sh;
    p.heals[k]--;
    p.healing = null;
    one(p.id, invMsg(p));
  }

  // 定型のひとこと・合図：試合中は、生きている人には届かない（観戦している人どうしだけ）
  function chat(p, msg) {
    const n = num(msg[1], 0, 63);
    if (n == null) return;
    const m = [msg[0], p.id, Math.round(n)];
    if (phase === "play") {
      if (p.inMatch && p.alive) return;
      some(humans().filter((q) => q !== p && !(q.inMatch && q.alive)).map((q) => q.id), m);
    } else others(p.id, m);
  }

  function handle(id, msg, now) {
    out = [];
    if (!Array.isArray(msg) || !Number.isFinite(now)) return out;
    advance(now, false);
    if (msg[0] === "j") {
      join(id, msg, now);
      return out;
    }
    const p = players.get(id);
    if (!p || p.gone || p.dummy) return out;
    switch (msg[0]) {
      case "t": if (Number.isFinite(msg[1])) one(id, ["t", msg[1], now]); break;
      case "r": ready(p, msg, now); break;
      case "p": move(p, msg, now); break;
      case "d": dropOut(p, now); break;
      case "w": hold(p, msg); break;
      case "f": fire(p, msg, now); break;
      case "a": hit(p, msg, now); break;
      case "l": reload(p, msg, now); break;
      case "g": take(p, msg); break;
      case "o": discard(p, msg); break;
      case "u": heal(p, msg, now); break;
      case "s": case "e": chat(p, msg); break;
      default: break;
    }
    return out;
  }

  function tick(now) {
    out = [];
    if (Number.isFinite(now)) advance(now, true);
    return out;
  }

  function leave(id, now) {
    out = [];
    const p = players.get(id);
    if (!p || p.dummy || p.gone) return out;
    if (phase === "play" && p.inMatch && p.alive) eliminate(p, 0, "leave", now);
    if ((phase === "play" || phase === "end") && p.inMatch) p.gone = true; // 結果に残す
    else players.delete(id);
    all(["l", id]);
    if (phase === "lobby" || phase === "countdown") checkReady(now);
    return out;
  }

  // 次に tick を呼んでほしい時間（ms）。null はいらない（部屋が眠ってよい）
  function nextTick(now) {
    if (phase === "lobby") return readySince != null ? Math.max(0, readySince + MATCH.readyWait * 1000 - now) : null;
    if (phase === "countdown") return Math.max(0, Math.min(1000, startAt - now));
    if (phase === "play") return 1000;
    if (phase === "end") return Math.max(0, endAt - now);
    return null;
  }

  return {
    handle, tick, leave, nextTick, snapshot,
    has: (id) => players.has(id),
    player: (id) => players.get(id),
    phase: () => phase,
    get plan() { return plan; },
    get t0() { return t0; },
    get roster() { return [...roster]; },
    count: () => humans().length,
  };
}
