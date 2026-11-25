// キャンパスロワイヤル（バーチャルキャンパスのゲーム）の端末の側の進み（docs/campus-royale-spec.md の 7.3・8 章）。React を使わない。
// createRoyaleGame が返す物を CampusMap3D の props.game に渡すと、歩く画面の毎フレーム（walkTick）から呼ばれる（step・camera・fov・st・frame）。
// 自分のようす：lobby（ロビーを歩く）→ plane（飛行機）→ fall（落下）→ chute（パラシュート）→ ground（地上で戦う）→ out（アウト・観戦）。
// 途中で入った人は spectate（観戦）。弾が当たったか（壁ごしでないか）はこの端末が決め、ダメージ・HP・持ち物は部屋（campus3dRoyaleMatch）の答えを使う。
import { toXY } from "./campus3dFeatures.js";
import { worldOf } from "./campus3dMesh.js";
import { createViewmodel, muzzleLocal, vmScale } from "./campus3dRoyaleViewmodel.js";
import { createLocalRoyaleLink, createRoyaleLink } from "./campus3dRoyaleLink.js";
import { DROP_ID0 } from "./campus3dRoyaleMatch.js";
import { fxMesh, lootMesh, lootPulseMesh, planeMesh, selfMesh, zoneMesh } from "./campus3dRoyaleMesh.js";
import * as R from "./campus3dRoyaleRules.js";
import { HUBS, SPAWNS, SPAWNS_VER } from "./campus3dRoyaleSpawns.js";
import { createRoyaleAudio } from "./campus3dRoyaleAudio.js";
import { PITCH, stepFly } from "./campus3dWalk.js";

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const ROYALE_VER = R.versionOf(SPAWNS_VER);
const MISS_RANGE = 40; // 外れた弾の線を描く長さ（m）
export const COMPASS_PX = 2.4; // 方位の帯：1 度あたりの px（MapRoyale と同じ数）
const ROOM_RE = /^[a-z0-9-]{1,32}$/;
export const roomName = (s) => { const r = String(s || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32); return ROOM_RE.test(r) ? r : "main"; };

/**
 * 降下の 1 フレーム（docs 3.4）。d は { chute, fallT }（書きかえる）、s は歩く人の状態、inp は { fwd, side, dive（急降下）, open（開く） }、world は walkWorld
 * @returns { s, landed, agl（足場からの高さ） }
 */
export function stepDrop(d, s, inp, dt, world) {
  const D = R.DROP;
  d.fallT = (d.fallT || 0) + dt;
  const below = world.floorBelow(s.x, s.y, s.z + 0.05);
  const agl = below ? s.z - below.z : Infinity;
  if (!d.chute && (agl <= D.autoOpen || (inp.open && d.fallT >= D.manualAfter))) d.chute = true;
  let fwd = clamp(inp.fwd || 0, -1, 1), side = clamp(inp.side || 0, -1, 1);
  const m = Math.hypot(fwd, side);
  if (m > 1) { fwd /= m; side /= m; }
  const b = (s.yaw || 0) * DEG;
  const dx = Math.sin(b) * fwd + Math.cos(b) * side, dy = Math.cos(b) * fwd - Math.sin(b) * side;
  let hmax, down;
  if (!d.chute) [hmax, down] = inp.dive ? [D.diveH, D.dive] : [D.fallH, D.fall];
  else if (fwd < -0.3) [hmax, down] = [D.brakeH, D.brake];
  else [hmax, down] = [D.chuteH, D.chute];
  let vx = s.vx || 0, vy = s.vy || 0, vz = s.vz || 0;
  const ax = dx * hmax - vx, ay = dy * hmax - vy, al = Math.hypot(ax, ay), maxA = D.acc * dt * (d.chute ? 1.6 : 1);
  if (al > maxA) { vx += (ax / al) * maxA; vy += (ay / al) * maxA; } else { vx = dx * hmax; vy = dy * hmax; }
  vz += (-down - vz) * Math.min(1, dt * (d.chute ? 2.5 : 3));
  let { x, y, z } = s;
  let hit = false;
  const nx = x + vx * dt, ny = y + vy * dt;
  if (world.blockedSpan(nx, ny, z + 0.3, z + 1.8)) {
    hit = true;
    if (!world.blockedSpan(nx, y, z + 0.3, z + 1.8)) { x = nx; vy = 0; }
    else if (!world.blockedSpan(x, ny, z + 0.3, z + 1.8)) { y = ny; vx = 0; }
    else { vx = 0; vy = 0; }
  } else { x = nx; y = ny; }
  const nz = z + vz * dt;
  const f = world.floorBelow(x, y, z + 0.05);
  if (f && nz <= f.z) {
    z = f.z;
    if (world.blocked(x, y, z)) [x, y, z] = world.freeNear(x, y, z);
    return { s: { ...s, x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, deck: f.deck || null, stepUp: 0, hit }, landed: true, agl: 0 };
  }
  return { s: { ...s, x, y, z: nz, vx, vy, vz, onGround: false, deck: null, stepUp: 0, hit }, landed: false, agl: Number.isFinite(agl) ? agl - (z - nz) : agl };
}

// ── 当たり（docs 3.5 の当たりの形）。o・d は視線（d は単位）、peers は link.peers() ──
function raySphere(o, d, c, r) {
  const w = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const b = w[0] * d[0] + w[1] * d[1] + w[2] * d[2], cc = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = -b - s;
  return t >= 0 ? t : -b + s >= 0 ? 0 : null;
}
// 縦の筒（中心 cx, cy・高さ z0〜z1・半径 r、上下は半球）
function rayCapsule(o, d, cx, cy, z0, z1, r) {
  const wx = o[0] - cx, wy = o[1] - cy;
  const a = d[0] * d[0] + d[1] * d[1];
  let t = null;
  if (a > 1e-9) {
    const b = 2 * (d[0] * wx + d[1] * wy), c = wx * wx + wy * wy - r * r, disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a);
      const te = t1 >= 0 ? t1 : t2 >= 0 ? 0 : null;
      if (te != null) {
        const z = o[2] + d[2] * te;
        if (z >= z0 && z <= z1) t = te;
      }
    }
  }
  for (const zc of [z0, z1]) {
    const ts = raySphere(o, d, [cx, cy, zc], r);
    if (ts != null && (t == null || ts < t)) t = ts;
  }
  return t;
}
/** 視線がいちばん先に当たる人：{ id, t（距離）, head } か null */
export function rayTarget(o, d, peers, range) {
  let best = null;
  for (const q of peers) {
    if (Math.hypot(q.x - o[0], q.y - o[1]) > range + 2) continue;
    let tb, th;
    if (q.st === 8) {
      tb = raySphere(o, d, [q.x, q.y, q.z + 0.95], 0.6); // 落下中（腹ばい）は丸ごと
      th = null;
    } else {
      tb = rayCapsule(o, d, q.x, q.y, q.z + R.HIT.bodyLo, q.z + R.HIT.bodyHi, R.HIT.bodyR);
      th = raySphere(o, d, [q.x, q.y, q.z + R.HIT.headZ], R.HIT.headR);
    }
    const head = th != null && (tb == null || th <= tb + 0.25);
    const t = head ? th : tb;
    if (t == null || t > range) continue;
    if (!best || t < best.t) best = { id: q.id, t, head };
  }
  return best;
}
/**
 * 視線が壁・建物・地面に当たる距離（なければ maxT）。groundAt(x, y) は地面の標高。
 * 0.5 m きざみで見る（歩く世界の壁は体の半径 0.3 m を足した幅なので、薄い壁も飛ばさない）。
 * cache（Map）を渡すと、0.25 m の升目ごとの答えを使い回す（同じ所を続けて撃つとき軽い。扉が動くので呼ぶ側がときどき捨てる）
 */
export function wallDist(world, o, d, maxT, groundAt = null, cache = null) {
  const blockedAt = (t) => {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    if (cache) {
      const k = `${Math.round(x * 4)},${Math.round(y * 4)},${Math.round(z * 4)}`;
      let v = cache.get(k);
      if (v === undefined) { v = hitWall(world, x, y, z, groundAt); cache.set(k, v); }
      return v;
    }
    return hitWall(world, x, y, z, groundAt);
  };
  const step = 0.5;
  for (let t = 0.35; t <= maxT; t += step) {
    if (!blockedAt(t)) continue;
    for (let t2 = Math.max(0.35, t - step); t2 <= t; t2 += 0.1) if (blockedAt(t2)) return t2;
    return t;
  }
  return maxT;
}
// その点が壁・建物の中か、地面の下（掘った地下の階の中でない）か
function hitWall(world, x, y, z, groundAt) {
  if (world.blockedSpan(x, y, z - 0.05, z + 0.05)) return true;
  if (groundAt) {
    const g = groundAt(x, y);
    return Number.isFinite(g) && z < g - 0.15 && !world.floorBelow(x, y, z + 0.05);
  }
  return !world.floorBelow(x, y, z + 0.05);
}
function jitter(d, deg, r) {
  if (!deg) return d;
  const a = deg * DEG * Math.sqrt(r()), th = r() * Math.PI * 2;
  const u = unit(cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = cross(d, u);
  const c = Math.cos(a), s = Math.sin(a), ct = Math.cos(th), st = Math.sin(th);
  return unit([d[0] * c + (u[0] * ct + v[0] * st) * s, d[1] * c + (u[1] * ct + v[1] * st) * s, d[2] * c + (u[2] * ct + v[2] * st) * s]);
}

const emptyMe = () => ({ hp: R.HP_MAX, sh: 0, helmet: false, slots: [null, null], ammo: { light: 0, medium: 0, shell: 0, heavy: 0 }, heals: { tea: 0, bento: 0, coffee: 0, energy: 0 }, held: 0 });

/**
 * @param opts { url（部屋サーバーの wss://…、/royale/<部屋> の前まで）, room, name, col, basemap（地図の建物：ミニマップ）, onUi(state), groundAt }
 */
export function createRoyaleGame({ url = "", room = "main", name = "ゲスト", col = "#3d8bfd", basemap = null, onUi = () => {} } = {}) {
  // 音：ない関数（古い音のファイル）を呼んでも止まらないよう、何もしない関数で包む
  const audio0 = createRoyaleAudio();
  const audio = new Proxy(audio0, { get: (o, k) => (typeof o[k] === "function" ? o[k] : () => {}) });
  const G = {
    link: null, practice: false, room: roomName(room), url, name, col, autoReady: false,
    mode: "lobby", phase: "lobby", t0: 0, seed: 0, tier: "S", plan: null, startAt: 0, endAt: 0, roster: new Set(),
    players: new Map(), me: emptyMe(), myId: null,
    taken: new Set(), drops: new Map(), over: new Map(), lootVer: 0, grid: null, gridVer: -1, lootMesh: null, lootMeshVer: 0, lootMeshKey: "",
    pending: new Map(), noAuto: new Set(), discarded: null, swap: null,
    zoneKey: "", zoneMesh: null, zoneVer: 0, zoneWarned: -1,
    feed: [], results: null, winner: 0, place: 0, kills: 0, aliveLeft: 0, dmgDone: 0,
    trigger: false, edge: false, ads: false, jumpBtn: false, upBtn: false, downBtn: false, dropReq: false, openReq: false,
    cool: 0, recoil: 0, reload: null, heal: null, autoReloadAt: 0,
    fireN: 0, fireSlot: 0, fireT: 0, fireYaw: 0, firePitch: 90, hits: new Map(),
    drop: null, follow: null, bigMap: false, teleport: null, dropSent: false,
    fx: [], hitAt: 0, hurtAt: 0, lastDmg: null,
    w: null, api: null, hud: {}, uiKey: "", uiAt: 0, pickAt: 0, mapAt: 0, bg: null,
  };
  // 見せ方（2026-11-25 ユーザー「まだ安っぽいゲーム感が強い」）：一人称の手と装備・ダメージの数字・撃たれた向き・大きな知らせ・足音・風
  const VM = createViewmodel();
  Object.assign(G, { hpOf: new Map(), pops: [], dirs: [], announce: null, annId: 0, footDist: 0, lastPos: null, windAt: 0, peerSteps: new Map(), vmAt: 0, sprintIn: false, warned: new Set(), bloom: 0 });
  const rnd = Math.random;
  const serverNow = () => (G.link ? G.link.serverNow() : Date.now());
  const matchT = () => (G.plan ? (serverNow() - G.t0) / 1000 : 0);
  const heldKind = () => (G.me.held === 0 ? "fist" : G.me.slots[G.me.held - 1]?.kind || "fist");
  const nameOf = (id) => (id === G.myId ? G.name : G.players.get(id)?.name || G.link?.peer?.(id)?.name || "？");
  const inMatch = () => G.roster.has(G.myId);
  const toast = (text) => G.api?.toast?.(text);
  const ui = () => { G.uiKey = ""; }; // 次の hud の回で描き直す
  // 弾の壁の判定の使い回し（扉・エレベーターが動くので 1.5 秒で捨てる）
  const wallCache = () => {
    const now = performance.now();
    if (!G.wcache || now - G.wcacheAt > 1500 || G.wcache.size > 30000) { G.wcache = new Map(); G.wcacheAt = now; }
    return G.wcache;
  };

  // ── 部屋につなぐ（練習は端末の中） ──
  function connect({ practice = G.practice, room = G.room } = {}) {
    G.link?.close();
    G.practice = practice;
    G.room = roomName(room);
    resetMatch();
    G.players.clear();
    G.phase = "lobby";
    G.myId = null;
    setMode("lobby");
    const common = { name: G.name, col: G.col, onEvent, onChange: ui };
    G.link = practice
      ? createLocalRoyaleLink({ ...common, spawns: SPAWNS, hubs: HUBS, spawnsVer: SPAWNS_VER })
      : createRoyaleLink({ ...common, url: G.url ? `${G.url}/royale/${G.room}` : "", ver: ROYALE_VER });
    ui();
  }
  function resetMatch() {
    G.plan = null;
    G.roster = new Set();
    G.taken.clear(); G.drops.clear(); G.over.clear(); G.lootVer++;
    G.pending.clear(); G.noAuto.clear(); G.swap = null;
    G.me = emptyMe();
    G.results = null; G.winner = 0; G.place = 0; G.kills = 0; G.aliveLeft = 0; G.dmgDone = 0; G.dmgTotal = 0; G.outInfo = null;
    G.reload = null; G.heal = null; G.trigger = false; G.ads = false; G.fx = []; G.follow = null;
    G.dropSent = false; G.drop = null; G.fireN = 0; G.hits.clear();
    audio.plane(false);
  }
  const lobbySpot = () => {
    const a = rnd() * Math.PI * 2, d = rnd() * R.LOBBY.r;
    return { x: R.LOBBY.x + Math.cos(a) * d, y: R.LOBBY.y + Math.sin(a) * d, yaw: R.LOBBY.yaw, ground: true };
  };
  const addFeed = (text, extra = {}) => { G.feed.push({ text, at: Date.now(), ...extra }); if (G.feed.length > 6) G.feed.shift(); ui(); };
  // 大きな知らせ（画面のまん中の上。kind：info・kill・out・win・zone）
  const announce = (text, sub = "", kind = "info") => { G.announce = { id: ++G.annId, text, sub, kind, at: Date.now() }; ui(); };
  const colOf = (id) => (id === G.myId ? G.col : G.players.get(id)?.col || G.link?.peer?.(id)?.col || "#8d99ae");

  // ── 部屋からのメッセージ ──
  function onEvent(m) {
    const k = m[0];
    if (k === "h") {
      G.myId = m[1];
      const s = m[3] || {};
      G.phase = s.phase || "lobby";
      G.players.clear();
      for (const q of s.players || []) G.players.set(q[0], { id: q[0], name: q[1], col: q[2], alive: !!q[3], ready: !!q[10], inMatch: !!q[11], kills: q[12] | 0, dummy: !!q[13] });
      resetMatch();
      if ((G.phase === "play" || G.phase === "end") && s.seed != null) {
        G.t0 = s.t0; G.seed = s.seed; G.tier = s.tier; G.plan = R.matchPlan(s.seed, s.tier, SPAWNS, HUBS);
        G.roster = new Set(s.roster || []);
        for (const id of s.taken || []) G.taken.add(id);
        for (const d of s.drops || []) G.drops.set(d[0], { id: d[0], kind: d[1], n: d[2], x: d[3], y: d[4], z: d[5] });
        for (const [id, n] of s.over || []) G.over.set(id, n);
        G.aliveLeft = (s.players || []).filter((q) => q[3] && q[11]).length;
        G.lootVer++;
      }
      G.startAt = s.startAt || 0;
      setMode(G.phase === "play" || G.phase === "end" ? "spectate" : "lobby");
      if (G.autoReady && G.phase === "lobby") { G.autoReady = false; G.link.ready(1); }
    } else if (k === "j") {
      const p = G.players.get(m[1]);
      if (p) { p.name = m[2]; p.col = m[3]; } else G.players.set(m[1], { id: m[1], name: m[2], col: m[3], alive: G.phase !== "play", ready: false, inMatch: false, kills: 0, dummy: m[1] >= 1001 && m[1] < DROP_ID0 });
      ui();
    } else if (k === "l") { G.players.delete(m[1]); ui(); }
    else if (k === "r") { const p = G.players.get(m[1]); if (p) p.ready = !!m[2]; ui(); }
    else if (k === "m") onPhase(m);
    else if (k === "f") onShot(m);
    else if (k === "d") onDamage(m);
    else if (k === "k") onOut(m);
    else if (k === "g") {
      if (m[1] >= DROP_ID0) G.drops.delete(m[1]); else { G.taken.add(m[1]); G.over.delete(m[1]); }
      G.pending.delete(m[1]);
      G.lootVer++;
      if (m[2] === G.myId) audio.pick(G.lastTake?.id === m[1] ? R.catOf(G.lastTake.kind) || "item" : "item");
    } else if (k === "o") {
      const [, id, kind, n, x, y, z] = m;
      if (id >= DROP_ID0) G.drops.set(id, { id, kind, n, x, y, z });
      else G.over.set(id, n);
      G.pending.delete(id);
      // 自分が捨てたばかりの物は、近づいても自動では拾わない
      if (G.discarded && G.discarded.kind === kind && Date.now() < G.discarded.until && G.w && Math.hypot(x - G.w.x, y - G.w.y) < 2.5) G.noAuto.add(id);
      G.lootVer++;
    } else if (k === "i") onInv(m);
    ui();
  }

  function onPhase(m) {
    const was = G.phase;
    G.phase = m[1] === "abort" ? "lobby" : m[1];
    if (m[1] === "countdown") { G.startAt = m[2]; audio.ui(); }
    else if (m[1] === "play") {
      resetMatch();
      G.t0 = m[2]; G.seed = m[3]; G.tier = m[4];
      G.plan = R.matchPlan(G.seed, G.tier, SPAWNS, HUBS);
      G.roster = new Set(m[5] || []);
      G.aliveLeft = G.roster.size;
      for (const p of G.players.values()) { p.inMatch = G.roster.has(p.id); p.alive = p.inMatch; p.ready = false; p.kills = 0; }
      G.hpOf.clear();
      for (const id of G.roster) G.hpOf.set(id, { hp: R.HP_MAX, sh: 0 });
      G.warned.clear();
      G.lootVer++;
      if (inMatch()) { setMode("plane"); audio.plane(true); announce("試合開始", `${G.roster.size} 人・飛行機から飛び降りよう`); }
      else setMode("spectate");
    } else if (m[1] === "end") {
      G.winner = m[2];
      G.results = (m[3] || []).map((r) => ({ id: r[0], place: r[1], kills: r[2], damage: r[3], name: r[4] || nameOf(r[0]) }));
      G.endAt = Date.now() + R.MATCH.end * 1000;
      G.trigger = false;
      if (G.winner === G.myId) { audio.win(); announce("優勝", `撃破 ${G.kills}`, "win"); }
      else if (G.winner) announce(`${nameOf(G.winner)} の優勝`, "", "info");
    } else if (m[1] === "lobby" || m[1] === "abort") {
      resetMatch();
      for (const p of G.players.values()) { p.ready = false; p.inMatch = false; p.alive = true; }
      if (was !== "lobby" || G.mode !== "lobby") setMode("lobby");
    }
    ui();
  }

  function setMode(mode) {
    const prev = G.mode;
    G.mode = mode;
    const w = G.w;
    G.trigger = false; G.ads = false; G.reload = null; G.heal = null; G.follow = mode === prev ? G.follow : null;
    if (mode === "lobby") {
      if (w) { w.fly = false; G.teleport = lobbySpot(); }
      audio.plane(false);
    } else if (mode === "plane") {
      G.dropSent = false;
      if (w) { w.fly = false; w.pitch = 84; }
    } else if (mode === "spectate" || mode === "out") {
      if (w) { w.fly = true; w.vz = 0; }
      audio.plane(false);
    } else if (mode === "ground") {
      if (w) { w.fly = false; w.noJumpUntil = performance.now() + 500; }
    }
    ui();
  }

  function onInv(m) {
    const hadWeapon = G.me.slots.some(Boolean);
    const [, hp, sh, helmet, slots, ammo, heals, held] = m;
    G.me = {
      hp, sh, helmet: !!helmet, held: held | 0,
      slots: (slots || [null, null]).map((s) => (s ? { kind: s[0], mag: s[1] } : null)),
      ammo: Object.fromEntries(R.AMMO_KINDS.map((k, i) => [k, ammo?.[i] | 0])),
      heals: Object.fromEntries(R.HEAL_KINDS.map((k, i) => [k, heals?.[i] | 0])),
    };
    // はじめて拾ったブラスターは手に持つ（素手のとき）
    if (!hadWeapon && G.me.held === 0) {
      const i = G.me.slots.findIndex(Boolean);
      if (i >= 0) selectSlot(i + 1);
    }
    ui();
  }

  function onShot(m) {
    const [, id, kind, n] = m;
    const q = G.link?.peers().find((p) => p.id === id);
    const w = G.w;
    if (!q || !w) return;
    const yaw = m[4] * DEG, pitch = m[5] * DEG;
    const d = [Math.sin(pitch) * Math.sin(yaw), Math.sin(pitch) * Math.cos(yaw), -Math.cos(pitch)];
    const a = [q.x + d[0] * 0.6, q.y + d[1] * 0.6, q.z + 1.35];
    const len = kind === "fist" ? 0 : Math.min(R.WEAPONS[kind]?.range || 60, MISS_RANGE);
    const world = w.world;
    if (len > 0 && world && Math.hypot(q.x - w.x, q.y - w.y) < 150) {
      const t = wallDist(world, a, d, len, G.api?.groundAt, wallCache());
      G.fx.push({ kind: "tracer", a, b: [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], col: kind, t0: performance.now(), dur: kind === "sniper" ? 260 : 130 });
      G.fx.push({ kind: "flash", a, b: a, col: kind, t0: performance.now(), dur: 70 });
    }
    const dx = q.x - w.x, dy = q.y - w.y, dist = Math.hypot(dx, dy);
    const b = w.yaw * DEG;
    const pan = dist > 0.5 ? clamp((dx * Math.cos(b) - dy * Math.sin(b)) / dist, -1, 1) : 0;
    audio.shot(kind, dist, pan);
    void n;
  }

  function onDamage(m) {
    const [, target, hp, sh, by, kind, head] = m;
    const prev = G.hpOf.get(target) || { hp: R.HP_MAX, sh: 0 };
    const dmg = Math.max(0, prev.hp + prev.sh - (hp + sh));
    G.hpOf.set(target, { hp, sh });
    const now = performance.now();
    if (target === G.myId) {
      const before = G.me.hp + G.me.sh;
      G.me.hp = hp; G.me.sh = sh;
      if (hp + sh < before) {
        G.hurtAt = now;
        G.hurtFrom = by;
        if (by !== 0) {
          audio.hurt();
          // 撃たれた向き（画面の十字のまわりに赤い弧）と、画面のゆれ
          const q = G.link?.peers().find((p) => p.id === by);
          if (q && G.w) G.dirs.push({ x: q.x, y: q.y, t0: now });
          if (G.w) G.w.roll = (rnd() < 0.5 ? -1 : 1) * Math.min(3.2, 0.6 + dmg * 0.06);
        }
      }
    }
    if (by === G.myId && target !== G.myId && dmg > 0) {
      G.dmgDone++;
      G.dmgTotal = (G.dmgTotal || 0) + dmg;
      showDamage(head);
      // ダメージの数字を相手の頭の上に
      const q = G.link?.peers().find((p) => p.id === target);
      if (q) G.pops.push({ x: q.x + (rnd() - 0.5) * 0.4, y: q.y + (rnd() - 0.5) * 0.4, z: q.z + 2.05, n: Math.round(dmg), head: !!head, shield: prev.sh > 0, broke: prev.sh > 0 && sh === 0, t0: now, el: null });
    }
    void kind;
  }

  function onOut(m) {
    const [, victim, by, kind, place, left] = m;
    G.aliveLeft = left;
    const v = G.players.get(victim);
    if (v) v.alive = false;
    const killer = by ? nameOf(by) : null;
    addFeed(killer ? `${killer} → ${nameOf(victim)}` : `${nameOf(victim)}${kind === "zone" ? "（円の外）" : kind === "leave" ? "（退出）" : ""}`, { kc: by ? colOf(by) : null, vc: colOf(victim), w: kind, killer, victim: nameOf(victim) });
    // 消える演出：アウトになった所で、その人の色の破片が散る
    const lp = G.link?.peer?.(victim)?.lastPos;
    const vcol = G.link?.peer?.(victim)?.dummy ? "#ff9f43" : colOf(victim); // 練習の的は灰色なので目立つ色で
    if (lp && G.w && Math.hypot(lp[0] - G.w.x, lp[1] - G.w.y) < 220) G.fx.push({ kind: "burst", a: [lp[0], lp[1], lp[2]], b: [lp[0], lp[1], lp[2]], col: vcol, t0: performance.now(), dur: 1100, seed: victim });
    if (by === G.myId && victim !== G.myId) {
      G.kills++;
      audio.kill();
      announce(`${nameOf(victim)} を撃破`, left > 1 ? `残り ${left} 人` : "", "kill");
    } else if (victim !== G.myId) {
      audio.out(false); // ほかの人が倒れた（控えめな音）
      if (inMatch() && G.mode !== "out" && [10, 5, 3, 2].includes(left)) announce(`残り ${left} 人`, "", "info");
    }
    if (victim === G.myId) {
      G.place = place;
      G.outInfo = { killer: by && by !== G.myId ? killer : null, kc: by ? colOf(by) : null, weapon: by ? kind : null, cause: by ? null : kind };
      audio.out(true);
      announce("アウト", `${place} 位${killer && by !== G.myId ? `・${killer} に撃たれた` : kind === "zone" ? "・円の外" : ""}`, "out");
      setMode("out");
    }
    if (G.follow === victim) G.follow = null;
  }

  // ── 物資：いまある物と、近くを引く升目 ──
  function lootItems() {
    const out = [];
    if (!G.plan) return out;
    for (const [id, it] of G.plan.loot) {
      if (G.taken.has(id)) continue;
      const s = SPAWNS[id];
      if (!s) continue;
      out.push({ id, kind: it.kind, n: G.over.get(id) ?? it.n, x: s[0], y: s[1], z: s[2] });
    }
    for (const d of G.drops.values()) {
      if (d.z == null && G.w?.world) {
        const f = G.w.world.floorBelow(d.x, d.y, R.PLANE.z);
        d.z = f ? f.z : null; // 空中で落とした物は、その下のいちばん高い足場へ
      }
      if (d.z != null) out.push(d);
    }
    return out;
  }
  function grid() {
    if (G.gridVer === G.lootVer && G.grid) return G.grid;
    const m = new Map();
    for (const it of lootItems()) {
      const k = `${Math.floor(it.x / 10)},${Math.floor(it.y / 10)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    G.grid = m;
    G.gridVer = G.lootVer;
    return m;
  }
  function near(x, y, r) {
    const m = grid(), out = [];
    for (let i = Math.floor((x - r) / 10); i <= Math.floor((x + r) / 10); i++) for (let j = Math.floor((y - r) / 10); j <= Math.floor((y + r) / 10); j++) {
      for (const it of m.get(`${i},${j}`) || []) if (Math.hypot(it.x - x, it.y - y) <= r) out.push(it);
    }
    return out;
  }
  function take(it) {
    G.pending.set(it.id, Date.now() + 1500);
    G.lastTake = it;
    G.link.take(it.id);
  }
  function pickups(w) {
    const now = Date.now();
    if (now - G.pickAt < 100) return;
    G.pickAt = now;
    let swap = null;
    const me = G.me;
    for (const it of near(w.x, w.y, R.PICK.r)) {
      if (Math.abs(it.z - w.z) > R.PICK.dz || (G.pending.get(it.id) || 0) > now) continue;
      const cat = R.catOf(it.kind);
      if (cat === "weapon") {
        if (!G.noAuto.has(it.id) && (!me.slots[0] || !me.slots[1])) take(it);
        else if (me.slots[0] && me.slots[1] && (!swap || Math.hypot(it.x - w.x, it.y - w.y) < Math.hypot(swap.x - w.x, swap.y - w.y))) swap = it;
      } else if (G.noAuto.has(it.id)) continue;
      else if (cat === "ammo" && me.ammo[it.kind] < R.AMMO_CAP[it.kind]) take(it);
      else if (cat === "heal" && me.heals[it.kind] < R.HEALS[it.kind].max) take(it);
      else if (cat === "helmet" && !me.helmet) take(it);
    }
    if ((G.swap?.id ?? null) !== (swap?.id ?? null)) { G.swap = swap; ui(); }
  }
  function pickSwap() {
    if (G.mode !== "ground" || !G.swap) return;
    take(G.swap);
    G.swap = null;
  }

  // ── 撃つ・リロード・回復・持ちかえ ──
  function flushFire() {
    if (G.fireN) G.link.fire(G.fireSlot, G.fireN, G.fireYaw, G.firePitch);
    G.fireN = 0;
    for (const [id, h] of G.hits) G.link.hit(id, G.fireSlot, h.heads, h.k);
    G.hits.clear();
    G.fireT = 0;
  }
  function selectSlot(i) {
    if (i < 0 || i > 2 || (i > 0 && !G.me.slots[i - 1])) return;
    flushFire();
    G.reload = null;
    G.heal = null;
    G.ads = false;
    G.me.held = i;
    G.cool = Math.max(G.cool, 0.25);
    G.link?.hold(i);
    ui();
  }
  function startReload() {
    const s = G.me.held;
    const it = s ? G.me.slots[s - 1] : null;
    if (!it || G.reload || G.heal) return;
    const W = R.WEAPONS[it.kind];
    if (it.mag >= W.mag || G.me.ammo[W.ammo] <= 0) return;
    flushFire();
    G.reload = { slot: s, until: performance.now() + W.reload * 1000, dur: W.reload * 1000 };
    G.ads = false;
    audio.reload("start");
    ui();
  }
  function finishReload() {
    const r = G.reload;
    G.reload = null;
    const it = G.me.slots[r.slot - 1];
    if (!it || G.me.held !== r.slot) return;
    const W = R.WEAPONS[it.kind];
    const m = Math.min(W.mag - it.mag, G.me.ammo[W.ammo]);
    it.mag += m;
    G.me.ammo[W.ammo] -= m; // 先に見せる（部屋の答え「i」で合わせる）
    G.link.reload(r.slot);
    audio.reload("end");
    ui();
  }
  function useHeal(kind) {
    if (G.mode !== "ground" || !R.HEALS[kind] || G.heal) return;
    if (G.me.heals[kind] <= 0) return;
    if (!R.healUseful(kind, G.me.hp, G.me.sh)) { toast(R.HEALS[kind].hp || R.HEALS[kind].hpTo ? "HP は満タン" : "シールドは満タン"); return; }
    flushFire();
    G.reload = null;
    G.ads = false;
    G.trigger = false;
    G.heal = { kind, until: performance.now() + R.HEALS[kind].time * 1000, dur: R.HEALS[kind].time * 1000 };
    G.link.heal(kind, 0);
    ui();
  }
  function finishHeal() {
    const h = G.heal;
    G.heal = null;
    if (G.me.heals[h.kind] <= 0) return;
    const r = R.healed(h.kind, G.me.hp, G.me.sh);
    G.me.hp = r.hp; G.me.sh = r.sh; G.me.heals[h.kind]--;
    G.link.heal(h.kind, 1);
    audio.heal();
    ui();
  }
  function discard(kind) {
    if (G.mode !== "ground") return;
    G.discarded = { kind, until: Date.now() + 4000 };
    flushFire();
    G.link.discard(kind);
  }

  function shoot(w, kind, slot, it, inp) {
    const W = R.WEAPONS[kind];
    const ray = G.api?.ray?.(null);
    if (!ray) return;
    const world = w.world;
    const moving = Math.hypot(w.vx || 0, w.vy || 0) > 1.5, air = !w.onGround;
    const spread = R.spreadOf(kind, { moving, air, ads: G.ads, sneak: !!inp.sneak });
    const peers = (G.link?.peers() || []).filter((p) => p.alive);
    const per = new Map();
    const ends = [];
    // 光の線の出どころ：一人称の手の中の銃口（カメラのローカル → 世界）
    const b = w.yaw * DEG;
    const right = [Math.cos(b), -Math.sin(b), 0];
    const up = cross(right, ray.d);
    const mz = muzzleLocal(kind, G.ads ? 1 : 0, G.vmK ?? vmScale());
    const muzzle = [0, 1, 2].map((i) => ray.o[i] + ray.d[i] * mz[0] - right[i] * mz[1] + up[i] * mz[2]);
    const impacts = [];
    for (let i = 0; i < W.pellets; i++) {
      const d = jitter(ray.d, spread, rnd);
      const tg = rayTarget(ray.o, d, peers, W.range);
      // 外れた弾は見た目の線のためだけなので 40 m まで（壁の判定が重い）。当たりは相手まで
      const wt = world ? wallDist(world, ray.o, d, tg ? tg.t : Math.min(W.range, MISS_RANGE), G.api?.groundAt, wallCache()) : Infinity;
      let endT;
      // wallDist は壁がなければ渡した距離（相手まで）をそのまま返す → 等しいときは当たり
      if (tg && tg.t <= wt) {
        const e = per.get(tg.id) || { k: 0, heads: 0 };
        e.k++;
        if (tg.head) e.heads++;
        per.set(tg.id, e);
        endT = tg.t;
        impacts.push({ kind: "hitspark", p: [ray.o[0] + d[0] * endT, ray.o[1] + d[1] * endT, ray.o[2] + d[2] * endT], head: tg.head, d });
      } else {
        endT = Math.min(wt, W.range, MISS_RANGE);
        if (wt < Math.min(W.range, MISS_RANGE) - 0.01) impacts.push({ kind: "impact", p: [ray.o[0] + d[0] * endT, ray.o[1] + d[1] * endT, ray.o[2] + d[2] * endT], d });
      }
      if (i < 3) ends.push([ray.o[0] + d[0] * endT, ray.o[1] + d[1] * endT, ray.o[2] + d[2] * endT]);
    }
    G.lastShot = { kind, peers: peers.length, hits: [...per].map(([id, e]) => [id, e.k, e.heads]), at: Date.now() }; // 確かめ用
    if (it) it.mag--;
    if (G.fireN && G.fireSlot !== slot) flushFire();
    G.fireN++;
    G.fireSlot = slot;
    G.fireYaw = w.yaw;
    G.firePitch = w.pitch;
    if (!G.fireT) G.fireT = performance.now();
    let head = false;
    for (const [id, e] of per) {
      const h = G.hits.get(id) || { k: 0, heads: 0 };
      h.k += e.k; h.heads += e.heads;
      G.hits.set(id, h);
      if (e.heads) head = true;
    }
    const now = performance.now();
    VM.fire(kind, now);
    G.bloom = Math.min(1, G.bloom + (W.pellets > 1 ? 0.8 : kind === "sniper" ? 0.9 : 0.28));
    if (kind !== "fist") {
      for (const e of ends) G.fx.push({ kind: "tracer", a: muzzle, b: e, col: kind, t0: now, dur: kind === "sniper" ? 220 : 95 });
    }
    // 当たった所の火花（人は白・頭は黄色）、壁の火花（装備の色）。散弾は多いので 4 つまで
    impacts.slice(0, 4).forEach((m, i) => G.fx.push({ kind: m.kind, a: m.p, b: m.p, d: m.d, col: m.kind === "hitspark" ? (m.head ? "#ffd84a" : "#ffffff") : kind, t0: now, dur: m.kind === "hitspark" ? 260 : 380, seed: (now | 0) + i }));
    if (per.size) { G.hitAt = now; audio.hit(head); flashCross(head); }
    audio.shot(kind, 0, 0);
    // 反動：上へ跳ねる（撃ちやめると戻る）
    if (W.recoil) {
      const kick = W.recoil * (G.ads ? 0.6 : 1);
      w.pitch = Math.min(PITCH.max, w.pitch + kick);
      G.recoil += kick;
    }
    if (it && it.mag <= 0 && G.me.ammo[W.ammo] > 0) G.autoReloadAt = now + 180;
    ui();
  }

  function combat(w, inp, now) {
    if (G.reload && now >= G.reload.until) finishReload();
    if (G.heal && now >= G.heal.until) finishHeal();
    if (G.autoReloadAt && now >= G.autoReloadAt) { G.autoReloadAt = 0; startReload(); }
    const kind = heldKind(), W = R.WEAPONS[kind];
    const slot = G.me.held, it = slot ? G.me.slots[slot - 1] : null;
    const want = W.auto ? G.trigger : G.edge;
    G.edge = false;
    G.cool -= G.dtLast || 0;
    if (want && !G.reload && !G.heal && G.phase === "play") {
      if (G.cool <= 0) {
        if (it && it.mag <= 0) startReload();
        else {
          shoot(w, kind, slot, it, inp);
          G.cool = Math.max(G.cool, 0) + 1 / W.rps;
        }
      }
    }
    if (G.cool < 0) G.cool = 0;
    if (!G.trigger && G.recoil > 0) {
      const r = Math.min(G.recoil, (G.dtLast || 0) * 9);
      G.recoil -= r;
      w.pitch = Math.max(PITCH.min, w.pitch - r);
    }
    if ((G.fireN || G.hits.size) && now - G.fireT >= 200) flushFire();
  }

  // ── 画面の表示（MapRoyale が attach で渡す DOM） ──
  function flashCross(head) {
    const el = G.hud.cross;
    if (!el) return;
    el.classList.remove("hit", "head");
    void el.offsetWidth; // アニメーションをやり直す
    el.classList.add(head ? "head" : "hit");
  }
  function showDamage(head) {
    const el = G.hud.dmg;
    if (!el) return;
    el.textContent = head ? "頭！" : "命中";
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
  }
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  // 毎フレーム：方位の帯・十字の広がり（動き・空中・構え・撃った直後）・撃たれた向きの弧
  function hudFrame(w, dt, inp) {
    const H = G.hud;
    G.bloom *= Math.exp(-dt * 5.5);
    const yaw = G.api?.map ? G.api.map.getBearing() : w.yaw;
    if (H.compass) H.compass.style.transform = `translateX(${-((((yaw % 360) + 360) % 360) + 360) * (+H.compass.dataset.px || COMPASS_PX)}px)`;
    if (H.heading) { const h = String(Math.round((((yaw % 360) + 360) % 360))).padStart(3, "0"); if (H.heading.textContent !== h) H.heading.textContent = h; }
    if (H.cross && G.mode === "ground") {
      const kind = heldKind();
      const moving = Math.hypot(w.vx || 0, w.vy || 0) > 1.5;
      const sp = R.spreadOf(kind === "fist" ? "pistol" : kind, { moving, air: !w.onGround, ads: G.ads, sneak: !!inp?.sneak });
      const gap = 3 + sp * 5.5 + G.bloom * 12 + (kind === "shotgun" ? 10 : 0);
      H.cross.style.setProperty("--gap", `${gap.toFixed(1)}px`);
    }
    if (H.dirs) {
      const now = performance.now();
      G.dirs = G.dirs.filter((d) => now - d.t0 < 1400);
      while (H.dirs.children.length < G.dirs.length) H.dirs.appendChild(document.createElement("i"));
      [...H.dirs.children].forEach((el, i) => {
        const d = G.dirs[i];
        if (!d) { el.style.opacity = "0"; return; }
        const a = (Math.atan2(d.x - w.x, d.y - w.y) * 180) / Math.PI - yaw;
        el.style.transform = `rotate(${a.toFixed(1)}deg)`;
        el.style.opacity = String(Math.max(0, 1 - (now - d.t0) / 1400));
      });
    }
  }
  // ほかの人の足音（25 m 以内で動いている人。0.1 秒ごとに呼ぶ）
  function peerFootsteps(w, dt) {
    for (const q of G.link?.peers() || []) {
      if (q.st >= 8 || q.speed < 1.2) continue;
      const dx = q.x - w.x, dy = q.y - w.y, dist = Math.hypot(dx, dy);
      if (dist > 25) continue;
      const acc = (G.peerSteps.get(q.id) || 0) + q.speed * dt;
      if (acc > (q.speed > 4.6 ? 2.1 : 1.7)) {
        G.peerSteps.set(q.id, 0);
        const b = w.yaw * DEG;
        audio.step(Math.max(1, dist), dist > 0.5 ? clamp((dx * Math.cos(b) - dy * Math.sin(b)) / dist, -1, 1) : 0);
      } else G.peerSteps.set(q.id, acc);
    }
  }
  function hudTick(w) {
    const now = performance.now();
    if (now - G.mapAt < 100) return;
    G.mapAt = now;
    const T = serverNow();
    const t = matchT();
    let text = "";
    let outside = false;
    let z = null;
    if (G.phase === "countdown") text = `開始まで ${Math.max(0, Math.ceil((G.startAt - T) / 1000))}`;
    else if (G.plan && (G.phase === "play" || G.phase === "end")) {
      z = R.zoneAt(G.plan, t);
      if (G.mode === "plane") {
        text = R.canJump(G.plan, t) ? `降下できます・自動で降りるまで ${Math.max(0, Math.ceil(R.ejectAt(G.plan) - t))} 秒` : `降下まで ${Math.max(0, Math.ceil(R.PLANE.jumpAfter - t))} 秒`;
      } else if (z.last) text = "最後の円";
      else if (z.shrinking) text = `縮小中 ${mmss(z.until - t)}`;
      else text = `${z.stage === 0 ? "最初の縮小" : "縮小"}まで ${mmss(z.until - t)}`;
      if (w && G.mode === "ground" && z.dps > 0 && !R.inZone(z, w.x, w.y)) outside = true;
      if (z.stage !== G.zoneWarned && z.shrinking) { G.zoneWarned = z.stage; audio.warn(); if (inMatch() && G.mode !== "out") announce("安全地帯が縮小中", "白い円の中へ急ごう", "zone"); }
      // 縮小の 30 秒前の知らせ
      if (!z.shrinking && !z.last && Number.isFinite(z.until) && z.until - t <= 30 && z.until - t > 27 && !G.warned.has(`pre${z.stage}`) && G.mode !== "plane") {
        G.warned.add(`pre${z.stage}`);
        if (inMatch() && G.mode !== "out") announce("まもなく縮小", "あと 30 秒", "zone");
      }
    }
    if (w) peerFootsteps(w, 0.1);
    if (G.hud.timer && G.hud.timer.textContent !== text) G.hud.timer.textContent = text;
    if (G.hud.count && G.phase === "countdown") { const c = String(Math.max(0, Math.ceil((G.startAt - T) / 1000))); if (G.hud.count.textContent !== c) { G.hud.count.textContent = c; audio.ui(); } }
    if (G.hud.vignette) {
      const hurt = Math.max(0, 1 - (now - G.hurtAt) / 500);
      G.hud.vignette.style.opacity = String(Math.max(outside ? 0.55 : 0, hurt * 0.8));
      G.hud.vignette.dataset.zone = outside ? "1" : "";
    }
    drawMap(w, z, t);
    // 表示の状態（変わったときだけ React へ）
    const st = uiState();
    const key = JSON.stringify(st);
    if (key !== G.uiKey) { G.uiKey = key; try { onUi(st); } catch (e) { console.error(e); } } // eslint-disable-line no-console
  }

  function mapBackground() {
    if (G.bg !== null) return G.bg;
    G.bg = false;
    if (typeof document === "undefined" || !basemap?.buildings) return G.bg;
    const [x0, y0, x1, y1] = R.PLAY_RECT;
    const pad = 60, W = Math.ceil(x1 - x0 + pad * 2), H = Math.ceil(y1 - y0 + pad * 2);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#e8edf1";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#c2cbd4";
    for (const b of basemap.buildings) {
      const pts = b.p.map(([lat, lng]) => toXY([lng, lat]));
      if (!pts.some(([x, y]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad)) continue;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x - x0 + pad, y1 + pad - y) : g.moveTo(x - x0 + pad, y1 + pad - y)));
      g.closePath();
      g.fill();
    }
    G.bg = { cv, x0: x0 - pad, y1: y1 + pad };
    return G.bg;
  }
  // ミニマップ（北が上）。小さい地図は自分のまわり、大きい地図は全体
  function drawMap(w, z, t) {
    const cv = G.bigMap ? G.hud.bigMap : G.hud.map;
    if (!cv || !w) return;
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    const bg = mapBackground();
    const big = G.bigMap;
    const span = big ? Math.max(R.PLAY_RECT[2] - R.PLAY_RECT[0], R.PLAY_RECT[3] - R.PLAY_RECT[1]) + 80 : G.mode === "plane" || G.mode === "fall" ? 520 : 240;
    const cx = big ? (R.PLAY_RECT[0] + R.PLAY_RECT[2]) / 2 : w.x, cy = big ? (R.PLAY_RECT[1] + R.PLAY_RECT[3]) / 2 : w.y;
    const k = Math.min(W, H) / span;
    const px = (x) => W / 2 + (x - cx) * k, py = (y) => H / 2 - (y - cy) * k;
    g.save();
    g.clearRect(0, 0, W, H);
    if (!big) { g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = "#dfe5ea";
    g.fillRect(0, 0, W, H);
    if (bg) {
      const sx = cx - span / 2 - bg.x0, sy = bg.y1 - (cy + span / 2);
      g.drawImage(bg.cv, sx, sy, span, span, W / 2 - (span / 2) * k, H / 2 - (span / 2) * k, span * k, span * k);
    }
    if (z) {
      // 円の外は暗く
      g.fillStyle = "rgba(40,70,140,0.28)";
      g.beginPath();
      g.rect(0, 0, W, H);
      g.arc(px(z.x), py(z.y), Math.max(0, z.r * k), 0, Math.PI * 2, true);
      g.fill("evenodd");
      g.lineWidth = Math.max(1.5, W / 160);
      g.strokeStyle = "#ffffff";
      g.beginPath(); g.arc(px(z.x), py(z.y), Math.max(0, z.r * k), 0, Math.PI * 2); g.stroke();
      if (z.next && z.next.r !== z.r) {
        g.setLineDash([W / 60, W / 80]);
        g.strokeStyle = "#ffffff";
        g.beginPath(); g.arc(px(z.next.x), py(z.next.y), Math.max(0, z.next.r * k), 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
    }
    if (G.plan && t <= G.plan.plane.dur + 1 && (G.mode === "plane" || big)) {
      const { a, b } = G.plan.plane;
      g.strokeStyle = "rgba(14,32,48,.55)";
      g.lineWidth = Math.max(1, W / 220);
      g.setLineDash([W / 40, W / 60]);
      g.beginPath(); g.moveTo(px(a[0]), py(a[1])); g.lineTo(px(b[0]), py(b[1])); g.stroke();
      g.setLineDash([]);
      const P = R.planeAt(G.plan, t);
      g.fillStyle = "#0e2030";
      g.beginPath(); g.arc(px(P.x), py(P.y), Math.max(2.5, W / 70), 0, Math.PI * 2); g.fill();
    }
    // 自分（矢印）
    const ax = px(w.x), ay = py(w.y), s = Math.max(6, W / 22), yb = w.yaw * DEG;
    g.translate(ax, ay);
    g.rotate(yb);
    g.fillStyle = G.col;
    g.strokeStyle = "#ffffff";
    g.lineWidth = Math.max(1.5, W / 140);
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.62, s * 0.7); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.62, s * 0.7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    if (!big) {
      g.strokeStyle = "rgba(14,32,48,.6)";
      g.lineWidth = Math.max(1.5, W / 110);
      g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2 - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#0e2030";
      g.font = `800 ${Math.round(W / 11)}px sans-serif`;
      g.textAlign = "center";
      g.fillText("N", W / 2, W / 9);
    }
  }

  function uiState() {
    const t = matchT();
    const lobby = [...G.players.values()].filter((p) => !p.dummy).map((p) => ({ id: p.id, name: p.name, col: p.col, ready: p.ready }));
    return {
      conn: G.link ? G.link.status() : "closed", practice: G.practice, room: G.room, online: !!G.url,
      phase: G.phase, mode: G.mode, myId: G.myId, name: G.name, col: G.col,
      lobby, readyMe: !!G.players.get(G.myId)?.ready,
      me: { ...G.me, slots: G.me.slots.map((s) => (s ? { ...s } : null)), ammo: { ...G.me.ammo }, heals: { ...G.me.heals } },
      reload: G.reload ? { slot: G.reload.slot, dur: G.reload.dur, until: Math.round(G.reload.until) } : null,
      heal: G.heal ? { kind: G.heal.kind, dur: G.heal.dur, until: Math.round(G.heal.until) } : null,
      ads: G.ads, alive: G.aliveLeft, kills: G.kills, place: G.place, winner: G.winner,
      results: G.results, swap: G.swap ? { kind: G.swap.kind } : null,
      feed: G.feed.filter((f) => Date.now() - f.at < 6000).slice(-4).map((f) => ({ text: f.text, killer: f.killer || null, victim: f.victim || null, kc: f.kc || null, vc: f.vc || null, w: f.w || null, at: f.at })),
      announce: G.announce && Date.now() - G.announce.at < 3600 ? G.announce : null,
      canDrop: G.mode === "plane" && !!G.plan && R.canJump(G.plan, t), bigMap: G.bigMap,
      follow: G.follow ? nameOf(G.follow) : null, chute: G.mode === "chute",
      inMatch: inMatch(), held: heldKind(), total: G.roster.size,
      outInfo: G.mode === "out" ? { ...(G.outInfo || {}), kills: G.kills, damage: Math.round(G.dmgTotal || 0) } : null,
    };
  }

  // ── CampusMap3D の game フック ──
  const hook = {
    flags: {
      inventory: false, vehicles: false, phone: false, debugFly: false, seats: false,
      peerTags: () => G.phase !== "play" || G.mode === "out" || G.mode === "spectate",
    },
    begin(api) {
      G.api = api;
      G.w = api.walkRef?.current || null;
      if (G.w) {
        G.w.seats = [];
        if (G.mode === "spectate" || G.mode === "out") G.w.fly = true;
      }
      ui();
    },
    end() {
      flushFire();
      G.api = null;
      G.w = null;
      audio.plane(false);
    },
    input(inp) {
      const j = inp.jump || G.jumpBtn;
      if (G.mode === "ground") {
        let k = 1;
        if (G.ads) k *= 0.6;
        if (G.heal) k *= 0.7;
        return { ...inp, fwd: inp.fwd * k, side: inp.side * k, sprint: inp.sprint && !G.ads && !G.heal, jump: j };
      }
      if (G.mode === "out" || G.mode === "spectate") return { ...inp, jump: j || G.upBtn, sneak: inp.sneak || G.downBtn };
      return { ...inp, jump: j };
    },
    step(w, s, inp, dt, now) {
      G.w = w;
      G.dtLast = dt;
      hudFrame(w, dt, inp);
      hudTick(w);
      if (w.roll && G.mode !== "plane") w.roll *= Math.exp(-dt * 9); // 撃たれたときのゆれを戻す（歩く画面は動いているときしか戻さない）
      G.sprintIn = !!inp.sprint;
      if (G.teleport) {
        const p = G.teleport;
        G.teleport = null;
        const world = w.world;
        let z = w.z;
        if (world) {
          const f = world.floorBelow(p.x, p.y, p.z != null ? p.z + 0.6 : R.PLANE.z); // 高さの指定がなければいちばん上の足場
          z = f ? f.z : z;
          if (world.blocked(p.x, p.y, z)) { const q = world.freeNear(p.x, p.y, z); p.x = q[0]; p.y = q[1]; z = q[2]; }
        }
        return { ...s, x: p.x, y: p.y, z, vx: 0, vy: 0, vz: 0, onGround: true, deck: null, yaw: p.yaw ?? s.yaw };
      }
      const t = matchT();
      if (G.mode === "plane" && G.plan) {
        const P = R.planeAt(G.plan, t);
        const can = R.canJump(G.plan, t);
        if (!G.dropSent && ((can && (inp.jump || G.dropReq)) || t >= R.ejectAt(G.plan))) {
          G.dropSent = true;
          G.dropReq = false;
          G.link.drop();
          audio.plane(false);
          audio.drop();
          G.drop = { chute: false, fallT: 0 };
          const pb = P.yaw * DEG;
          G.mode = "fall";
          ui();
          return { ...s, x: P.x, y: P.y, z: P.z - 2, vx: Math.sin(pb) * 12, vy: Math.cos(pb) * 12, vz: 0, onGround: false, deck: null };
        }
        G.dropReq = false;
        return { ...s, x: P.x, y: P.y, z: P.z - 2, vx: 0, vy: 0, vz: 0, onGround: false, deck: null };
      }
      if ((G.mode === "fall" || G.mode === "chute") && w.world) {
        const open = inp.jump || G.openReq;
        G.openReq = false;
        const vz0 = -(s.vz || 0);
        const r = stepDrop(G.drop || (G.drop = { chute: false, fallT: 0 }), s, { fwd: inp.fwd, side: inp.side, dive: inp.sprint, open }, dt, w.world);
        if (G.drop.chute && G.mode === "fall") { G.mode = "chute"; audio.chute(); ui(); }
        // 風の音（落ちる速さ）
        if (now - G.windAt > 100) { G.windAt = now; audio.wind(r.landed ? 0 : Math.hypot(r.s.vx || 0, r.s.vy || 0, r.s.vz || 0)); }
        if (r.landed) {
          audio.wind(0);
          audio.land();
          VM.land(now, vz0);
          w.eyeOff = -Math.min(0.32, 0.08 + vz0 * 0.03); // 着地で視点が一瞬沈む（歩く画面が戻す）
          G.fx.push({ kind: "dust", a: [r.s.x, r.s.y, r.s.z], b: [r.s.x, r.s.y, r.s.z], col: "#d9d4c7", t0: now, dur: 700 });
          setMode("ground");
        }
        return r.s;
      }
      if (G.mode === "ground") {
        combat(w, inp, now);
        pickups(w);
        // 自分の足音（地面を進んだ距離で）
        if (G.lastPos && w.onGround && G.phase !== "lobby") {
          G.footDist += Math.hypot(w.x - G.lastPos[0], w.y - G.lastPos[1]);
          if (G.footDist > (G.sprintIn ? 2.2 : 1.75)) { G.footDist = 0; audio.step(0, 0); }
        }
        G.lastPos = [w.x, w.y];
        return null; // いつもの歩き（stepBody）
      }
      G.lastPos = null;
      if (G.mode === "out" || G.mode === "spectate") {
        if (G.follow) {
          const q = G.link?.peers().find((p) => p.id === G.follow);
          if (q) return { ...s, x: q.x, y: q.y, z: q.z, vx: 0, vy: 0, vz: 0, onGround: true, deck: null };
          G.follow = null;
          ui();
        }
        if (!w.world) return null;
        return stepFly(s, { fwd: inp.fwd, side: inp.side, turn: inp.turn, up: inp.jump, down: inp.sneak, sprint: inp.sprint }, dt, w.world, { noclip: false });
      }
      return null;
    },
    // 三人称のカメラ（飛行機・降下・人について見る）。null は目の位置
    camera(w) {
      let target = null, D = 0;
      if (G.mode === "plane" && G.plan) { const P = R.planeAt(G.plan, matchT()); target = [P.x, P.y, P.z + 3]; D = 52; } // 輸送機（全長 30 m ほど）を少し上・後ろから
      else if (G.mode === "fall") { target = [w.x, w.y, w.z + 1]; D = 7.5; }
      else if (G.mode === "chute") { target = [w.x, w.y, w.z + 2.6]; D = 11; }
      else if ((G.mode === "out" || G.mode === "spectate") && G.follow) { target = [w.x, w.y, w.z + 1.6]; D = 4.5; }
      if (!target) return null;
      const p = w.pitch * DEG, b = w.yaw * DEG;
      const dir = [Math.sin(p) * Math.sin(b), Math.sin(p) * Math.cos(b), -Math.cos(p)];
      let d = D;
      const world = w.world;
      if (world && G.mode !== "plane") {
        // 後ろに壁があればカメラを寄せる（ただし 2.5 m より寄せない：体のすぐそばの当たりは見ない）
        for (let i = 1; i <= 12; i++) {
          const dk = 2 + ((D - 2) * i) / 12;
          const c = [target[0] - dir[0] * dk, target[1] - dir[1] * dk, target[2] - dir[2] * dk];
          if (world.blockedSpan(c[0], c[1], c[2] - 0.25, c[2] + 0.25)) { d = Math.max(2.5, dk - 0.7); break; }
        }
      }
      return { x: target[0] - dir[0] * d, y: target[1] - dir[1] * d, z: target[2] - dir[2] * d, yaw: w.yaw, pitch: w.pitch, roll: 0 };
    },
    fov() {
      if (G.mode === "ground" && G.ads) return R.WEAPONS[heldKind()]?.adsFov || null;
      if (G.mode === "plane" || G.mode === "fall" || G.mode === "chute") return 76;
      return null;
    },
    st() {
      if (G.mode === "plane") return 10;
      if (G.mode === "fall") return 8;
      if (G.mode === "chute") return 9;
      if (G.mode === "out" || G.mode === "spectate") return 11;
      return null;
    },
    key(code, down) {
      if (!down) return false;
      const ground = G.mode === "ground";
      if (code === "Space") {
        if (G.mode === "plane") { G.dropReq = true; return true; }
        if (G.mode === "fall") { G.openReq = true; return true; }
        if (G.mode === "chute") return true;
        return false;
      }
      if (code === "KeyM") { G.bigMap = !G.bigMap; ui(); return true; }
      if (!ground) return false;
      if (code === "KeyR") { startReload(); return true; }
      if (code === "KeyF") { pickSwap(); return true; }
      if (code === "Digit1") { selectSlot(1); return true; }
      if (code === "Digit2") { selectSlot(2); return true; }
      if (code === "Digit3") { selectSlot(0); return true; }
      const hk = { Digit4: "tea", Digit5: "bento", Digit6: "coffee", Digit7: "energy" }[code];
      if (hk) { useHeal(hk); return true; }
      if (code === "KeyX") { const k = heldKind(); if (k !== "fist") discard(k); return true; }
      return false;
    },
    // マウスを固定しているときのボタン（0 左＝撃つ・2 右＝構える）。使ったら true
    pointer(kind, button) {
      audio.unlock();
      if (G.mode !== "ground") return false;
      if (kind === "down") {
        if (button === 0) api.fireDown();
        else if (button === 2) api.ads(true);
        return true;
      }
      if (button === 0) api.fireUp();
      else if (button === 2) api.ads(false);
      return true;
    },
    // ホイール：持ちかえ
    wheel(dy) {
      if (G.mode !== "ground") return false;
      const order = [0, 1, 2].filter((i) => i === 0 || G.me.slots[i - 1]);
      const i = order.indexOf(G.me.held);
      selectSlot(order[(i + (dy > 0 ? 1 : -1) + order.length) % order.length]);
      return true;
    },
    frame(now) {
      const w = G.w;
      const groups = [];
      if (G.plan && (G.phase === "play" || G.phase === "end") && w) {
        const t = matchT();
        // 物資：中身が変わった・30 m 以上動いたときだけ作り直す（まわり 90 m）
        const key = `${G.lootVer}:${Math.round(w.x / 30)},${Math.round(w.y / 30)}`;
        if (key !== G.lootMeshKey) {
          G.lootMeshKey = key;
          const items = near(w.x, w.y, 90).sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y)).slice(0, 140);
          G.lootMesh = lootMesh(items);
          G.lootMeshVer++;
        }
        if (G.lootMesh) groups.push({ id: "loot", ver: G.lootMeshVer, ...G.lootMesh });
        // 近くの物資は足もとの輪が脈打つ（毎フレーム。物の形そのものは上の静かな群）
        const pulse = near(w.x, w.y, 22).filter((it) => Math.abs(it.z - w.z) < 6).slice(0, 24);
        if (pulse.length) groups.push({ id: "lootfx", ver: null, ...lootPulseMesh(pulse, now) });
        // 円の壁：縞が上へ流れる（1 秒に 15 回だけ作り直す）
        const z = R.zoneAt(G.plan, t);
        const zk = `${z.x.toFixed(1)},${z.y.toFixed(1)},${z.r.toFixed(1)},${Math.floor(now / 66)}`;
        if (zk !== G.zoneKey) { G.zoneKey = zk; G.zoneMesh = zoneMesh(z, 5, 175, now / 1000); G.zoneVer++; }
        if (G.zoneMesh) groups.push({ id: "zone", ver: G.zoneVer, ...G.zoneMesh });
        const P = R.planeAt(G.plan, t);
        // 飛び降りた直後は飛行機がカメラの前をふさぐので、近い（60 m 以内）ときは描かない
        const nearPlane = (G.mode === "fall" || G.mode === "chute") && Math.hypot(P.x - w.x, P.y - w.y, P.z - w.z) < 60;
        if (t <= G.plan.plane.dur + 3 && t >= -1 && !nearPlane) {
          groups.push({ id: "plane", ver: null, ...planeMesh({ x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: 0, bank: 0, gearDown: 0, fanAngle: (now * 0.03) % (Math.PI * 2), v: R.PLANE.speed, throttle: 0.6 }, now) });
        }
      }
      if (w && (G.mode === "fall" || G.mode === "chute")) {
        groups.push({ id: "self", ver: null, ...selfMesh({ id: G.myId || 0, x: w.x, y: w.y, z: w.z, yaw: w.yaw, st: G.mode === "chute" ? 9 : 8, speed: 0, col: G.col }, now) });
      }
      G.fx = G.fx.filter((e) => now - e.t0 < e.dur);
      if (G.fx.length) groups.push({ id: "fx", ver: null, ...fxMesh(G.fx, now) });
      return groups.length ? { groups } : null;
    },
    // 一人称の手と装備（cb-royale-vm 層。深さを消してから描く）
    hasView() {
      return G.mode === "ground" && !!G.w && !!G.api?.map && !(G.ads && heldKind() === "sniper");
    },
    viewFrame(now) {
      if (!hook.hasView()) return null;
      const w = G.w, map = G.api.map;
      const dt = G.vmAt ? Math.min(0.1, (now - G.vmAt) / 1000) : 1 / 60;
      G.vmAt = now;
      G.vmK = vmScale(map.transform.fov, w.baseFov || 70);
      return VM.frame({
        fov: map.transform.fov, baseFov: w.baseFov || 70,
        kind: heldKind(), col: G.col, eye: [w.x, w.y, Number.isFinite(w.eyeZ) ? w.eyeZ : w.z + 1.62], yaw: map.getBearing(), pitch: map.getPitch(),
        speed: Math.hypot(w.vx || 0, w.vy || 0), onGround: !!w.onGround, sprint: G.sprintIn, ads: G.ads,
        reload: G.reload ? Math.min(1, Math.max(0, 1 - (G.reload.until - now) / G.reload.dur)) : null,
        heal: G.heal ? { kind: G.heal.kind, t: Math.min(1, Math.max(0, 1 - (G.heal.until - now) / G.heal.dur)) } : null, dt,
      }, now);
    },
    // 描く前の行列（効果の層から）：ダメージの数字を相手の頭の上の画面の位置へ
    matrix(M, cv) {
      const box = G.hud.pops;
      if (!box) return;
      const now = performance.now();
      const W = cv.clientWidth, H = cv.clientHeight;
      G.pops = G.pops.filter((p) => {
        const age = now - p.t0;
        if (age > 950) { p.el?.remove(); return false; }
        if (!p.el) {
          p.el = document.createElement("b");
          p.el.className = `roy-pop${p.head ? " head" : ""}${p.shield ? " sh" : ""}${p.broke ? " broke" : ""}`;
          p.el.textContent = String(p.n);
          box.appendChild(p.el);
        }
        const [wx, wy] = worldOf([p.x, p.y]);
        const z = p.z + (age / 950) * 0.6;
        const c = [0, 1, 2, 3].map((r) => M[r] * wx + M[4 + r] * wy + M[8 + r] * z + M[12 + r]);
        if (c[3] <= 0.05) { p.el.style.display = "none"; return true; }
        p.el.style.display = "block";
        p.el.style.transform = `translate(${(((c[0] / c[3] + 1) / 2) * W).toFixed(1)}px, ${(((1 - c[1] / c[3]) / 2) * H).toFixed(1)}px) translate(-50%, -50%)`;
        return true;
      });
    },
  };

  // ── 画面のボタン（MapRoyale）から ──
  const api = {
    hook,
    get link() { return G.link; },
    peers: null, // 下で作る（CampusMap3D の props.peers：いまの link へ取りつぐ）
    connect,
    practice() { G.autoReady = true; connect({ practice: true }); },
    online(room) { G.autoReady = false; connect({ practice: false, room: room ?? G.room }); },
    ready(v) { G.link?.ready(v); },
    fireDown() { audio.unlock(); if (G.mode !== "ground") return; if (G.heal) { G.heal = null; ui(); } G.trigger = true; G.edge = true; },
    fireUp() { G.trigger = false; },
    ads(v) { if (G.mode !== "ground" || heldKind() === "fist" || G.reload || G.heal) { G.ads = false; ui(); return; } G.ads = v == null ? !G.ads : !!v; ui(); },
    reload: () => startReload(),
    pick: () => pickSwap(),
    heal: (kind) => useHeal(kind),
    slot: (i) => selectSlot(i),
    discard: (kind) => discard(kind),
    jump(v) { audio.unlock(); G.jumpBtn = !!v; if (v && G.mode === "plane") G.dropReq = true; if (v && G.mode === "fall") G.openReq = true; },
    up(v) { G.upBtn = !!v; },
    down(v) { G.downBtn = !!v; },
    toggleMap() { G.bigMap = !G.bigMap; ui(); },
    spectateNext() {
      const list = (G.link?.peers() || []).filter((p) => p.alive && !p.dummy).map((p) => p.id);
      const all = list.length ? list : (G.link?.peers() || []).filter((p) => p.alive).map((p) => p.id);
      if (!all.length) { G.follow = null; ui(); return; }
      const i = all.indexOf(G.follow);
      G.follow = all[(i + 1) % all.length];
      if (G.w) G.w.fly = false;
      ui();
    },
    freeLook() { G.follow = null; if (G.w) G.w.fly = true; ui(); },
    // 撃つボタンを押したまま指でなぞる：見回す（回して描いているときは呼ぶ側で向きを直す）
    look(dx, dy) {
      const w = G.w;
      if (!w) return;
      w.yaw = (w.yaw + dx * 0.3 + 360) % 360;
      w.pitch = clamp(w.pitch - dy * 0.3, PITCH.min, PITCH.max);
      w.lookHold = performance.now() + 2500;
    },
    attach(part, el) { G.hud[part] = el || null; if (part === "map" || part === "bigMap") G.mapAt = 0; },
    say: (n) => G.link?.say(n),
    emote: (n) => G.link?.emote(n),
    state: () => uiState(),
    dispose() {
      flushFire();
      G.link?.close();
      G.link = null;
      audio.close();
    },
    _G: G, // テスト・確かめ用
    _dbg: { rayTarget, wallDist },
  };
  // CampusMap3D は props.peers を毎フレーム読む。link を作り直しても同じ物を渡せるよう、取りつぐ
  api.peers = {
    send: (s) => G.link?.send(s) ?? false,
    peers: (t) => G.link?.peers(t) ?? [],
    status: () => G.link?.status() ?? "closed",
    count: () => G.link?.count() ?? 0,
    myId: () => G.link?.myId() ?? null,
    say: (n) => G.link?.say(n),
    emote: (n) => G.link?.emote(n),
    mark: () => false,
  };
  connect({ practice: !url });
  return api;
}
