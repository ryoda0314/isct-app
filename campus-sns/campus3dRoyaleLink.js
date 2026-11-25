// キャンパスロワイヤルの通信（端末の側。docs/campus-royale-spec.md の 5・7.2 章）。
// 部屋サーバー（cf-walk-rooms の /royale/<部屋>。RoyaleRoom）に WebSocket でつなぐ。練習は同じ形で、端末の中で試合（campus3dRoyaleMatch）を動かす。
// createPeerLink（みんなと歩く）と同じ名前の関数（send・peers・status・myId・count・say・emote・close）を持つので、CampusMap3D の
// ほかの人の描き方（peersFrame）がそのまま使える。試合のメッセージは onEvent(msg) で渡す（campus3dRoyale.js が受ける）。
// 送る：試合中に生きていれば、動いているとき 1 秒 8 回・止まっていれば 2 秒に 1 回。ほかは 1 秒 5 回・4 秒に 1 回。飛行機の中・観戦中は送らない。
// 受ける：届いた点を INTERP_MS 遅らせて 2 点のあいだで補う。時計は部屋サーバーの時計に合わせる（serverNow）。
import { createRoyaleMatch } from "./campus3dRoyaleMatch.js";
import { versionOf } from "./campus3dRoyaleRules.js";

const RATE = { play: [125, 2000], lobby: [200, 4000] }; // [動いているとき, 止まっているとき] の送る間隔（ms）
const INTERP_MS = 200;
const KEEP_MS = 2500;
const SAY_MS = 4500;
const EMOTE_MS = 1600;
const SYNC_MS = 30000;

const lerp = (a, b, k) => a + (b - a) * k;
const lerpDeg = (a, b, k) => a + (((((b - a) % 360) + 540) % 360) - 180) * k;
const moved = (a, b) => !a || Math.abs(a[0] - b[0]) > 0.02 || Math.abs(a[1] - b[1]) > 0.02 || Math.abs(a[2] - b[2]) > 0.02 || Math.abs(a[3] - b[3]) > 1.5 || a[4] !== b[4];

/**
 * @param opts { url（wss://…/royale/<部屋>）, name, col, ver（versionOf(SPAWNS_VER)）, WebSocketImpl, now, timers, onEvent, local（練習） }
 */
export function createRoyaleLink({ url, name = "ゲスト", col = "#6870e0", ver = versionOf(0), WebSocketImpl = globalThis.WebSocket, now = () => Date.now(), timers = globalThis, onEvent = () => {}, onChange = () => {}, local = false } = {}) {
  const peers = new Map(); // id → { id, name, col, buf, hold, alive, inMatch, dummy, say, sayAt, emote, emoteAt }
  let ws = null;
  let state = "connecting"; // connecting / open / closed / full / ver
  let myId = null;
  let phase = "lobby";
  let meAlive = false;
  let closed = false;
  let retry = 0;
  let timer = 0;
  let syncTimer = 0;
  let lastSent = null;
  let lastSendAt = 0;
  let offset = 0; // 部屋サーバーの時計 − この端末の時計（ms）
  let bestRtt = Infinity;
  let bestAt = 0;
  const me = { name, col };

  const tell = () => { try { onChange(); } catch { /* 呼ぶ側の失敗は通信に関係ない */ } };
  const setState = (s) => { if (state !== s) { state = s; tell(); } };
  const raw = (msg) => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(msg)); return true; } catch { /* 切れかけ */ }
    }
    return false;
  };
  const peerOf = (id, nm, cl) => {
    let p = peers.get(id);
    if (!p) {
      p = { id, name: nm || "ゲスト", col: cl || "#6870e0", buf: [], hold: "fist", alive: true, inMatch: false, dummy: id >= 1001 && id < 100000, say: null, sayAt: 0, emote: null, emoteAt: 0 };
      peers.set(id, p);
    } else {
      if (nm) p.name = nm;
      if (cl) p.col = cl;
    }
    return p;
  };
  const push = (p, x, y, z, yaw, st) => {
    if (![x, y, z, yaw].every((v) => typeof v === "number" && Number.isFinite(v))) return;
    const t = now();
    p.buf.push([t, x, y, z, yaw, st | 0]);
    while (p.buf.length > 2 && p.buf[0][0] < t - KEEP_MS) p.buf.shift();
  };
  const sync = () => raw(["t", now()]);

  const onMessage = (text) => {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!Array.isArray(m)) return;
    const k = m[0];
    if (k === "h") {
      myId = m[1];
      if (Number.isFinite(m[2])) offset = m[2] - now();
      const snap = m[3] || {};
      phase = snap.phase || "lobby";
      peers.clear();
      meAlive = false;
      for (const q of snap.players || []) {
        if (q[0] === myId) { meAlive = !!q[3] && !!q[11]; continue; }
        const p = peerOf(q[0], q[1], q[2]);
        p.alive = !!q[3] || phase === "lobby" || phase === "countdown";
        p.hold = q[9] || "fist";
        p.inMatch = !!q[11];
        p.dummy = !!q[13];
        if (q[8] !== 10 && q[8] !== 11) push(p, q[4], q[5], q[6], q[7], q[8]);
      }
      // 時計合わせ（入ったとき 3 回、そのあと 30 秒ごと）
      sync();
      timers.setTimeout(sync, 400);
      timers.setTimeout(sync, 800);
      timers.clearInterval?.(syncTimer);
      syncTimer = timers.setInterval?.(sync, SYNC_MS) || 0;
      tell();
    } else if (k === "j") { peerOf(m[1], m[2], m[3]); tell(); }
    else if (k === "l") { if (peers.delete(m[1])) tell(); }
    else if (k === "p") { if (m[1] !== myId) push(peerOf(m[1]), m[2], m[3], m[4], m[5], m[6]); }
    else if (k === "w") { const p = peers.get(m[1]); if (p) p.hold = m[2] || "fist"; }
    else if (k === "k") {
      if (m[1] === myId) meAlive = false;
      const p = peers.get(m[1]);
      if (p) {
        const b = p.buf[p.buf.length - 1];
        p.lastPos = b ? [b[1], b[2], b[3]] : null; // アウトになった所（消える演出のため）
        p.alive = false;
        p.buf = [];
      }
    } else if (k === "m") {
      phase = m[1];
      if (m[1] === "play") {
        const roster = new Set(m[5] || []);
        meAlive = roster.has(myId);
        for (const p of peers.values()) {
          p.inMatch = roster.has(p.id);
          p.alive = p.inMatch;
          p.hold = "fist";
          if (!p.dummy) p.buf = []; // ロビーの位置は使わない（飛行機に乗る）
        }
      } else if (m[1] === "lobby" || m[1] === "abort") {
        phase = "lobby";
        meAlive = false;
        for (const p of peers.values()) { p.alive = true; p.inMatch = false; p.hold = "fist"; }
      }
      tell();
    } else if (k === "s") { const p = peerOf(m[1]); p.say = m[2] | 0; p.sayAt = now(); tell(); }
    else if (k === "e") { const p = peerOf(m[1]); p.emote = m[2] | 0; p.emoteAt = now(); }
    else if (k === "t") {
      const rtt = now() - m[1];
      if (Number.isFinite(rtt) && rtt >= 0 && Number.isFinite(m[2]) && (rtt <= bestRtt * 1.5 || now() - bestAt > 60000)) {
        offset = m[2] + rtt / 2 - now();
        bestRtt = Math.min(bestRtt, rtt);
        bestAt = now();
      }
    } else if (k === "x") {
      if (m[1] === "full" || m[1] === "ver") setState(m[1]);
    }
    try { onEvent(m); } catch (e) { console.error(e); } // eslint-disable-line no-console
  };

  const connect = () => {
    if (closed || !WebSocketImpl || !url) { setState("closed"); return; }
    setState("connecting");
    let sock;
    try { sock = new WebSocketImpl(url); } catch { sock = null; }
    if (!sock) return again();
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      retry = 0;
      lastSent = null;
      raw(["j", me.name, me.col, ver]);
      setState("open");
    };
    sock.onmessage = (e) => { if (ws === sock) onMessage(typeof e.data === "string" ? e.data : ""); };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      timers.clearInterval?.(syncTimer);
      if (peers.size) { peers.clear(); tell(); }
      try { onEvent(["closed"]); } catch { /* 呼ぶ側の失敗 */ }
      if (state !== "full" && state !== "ver") again();
    };
    sock.onerror = () => { try { sock.close(); } catch { /* もう閉じている */ } };
  };
  const again = () => {
    if (closed) return;
    setState("connecting");
    const wait = Math.min(15000, 1000 * 2 ** retry);
    retry = Math.min(retry + 1, 5);
    timers.clearTimeout(timer);
    timer = timers.setTimeout(connect, wait);
  };
  connect();

  return {
    local,
    // 自分の位置（毎フレーム呼んでよい。間引く）。s = { x, y, z, yaw, st }
    send(s) {
      if (state !== "open" || !s) return false;
      const st = s.st | 0;
      if (st === 10 || st === 11) return false; // 飛行機の中・観戦中
      const t = now();
      const cur = [Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, Math.round(s.z * 100) / 100, Math.round(s.yaw), st];
      const [mv, idle] = phase === "play" && meAlive ? RATE.play : RATE.lobby;
      if (t - lastSendAt < (moved(lastSent, cur) ? mv : idle)) return false;
      if (!raw(["p", ...cur])) return false;
      lastSent = cur;
      lastSendAt = t;
      return true;
    },
    // ほかの人の、いま描く位置。試合中はアウトの人・観戦の人・飛行機の中の人を出さない
    peers(t = now()) {
      const at = t - INTERP_MS;
      const list = [];
      for (const p of peers.values()) {
        const b = p.buf;
        if (!b.length) continue;
        if ((phase === "play" || phase === "end") && (!p.inMatch || !p.alive)) continue;
        let i = b.length - 1;
        while (i > 0 && b[i][0] > at) i--;
        const a = b[i], c = b[Math.min(i + 1, b.length - 1)];
        const k = c[0] > a[0] ? Math.min(1, Math.max(0, (at - a[0]) / (c[0] - a[0]))) : 0;
        const st = (k < 0.5 ? a : c)[5];
        if (st === 10 || st === 11) continue;
        const dt = (c[0] - a[0]) / 1000;
        const speed = dt > 0 && k < 1 ? Math.hypot(c[1] - a[1], c[2] - a[2]) / dt : 0;
        list.push({
          id: p.id, name: p.name, col: p.col, x: lerp(a[1], c[1], k), y: lerp(a[2], c[2], k), z: lerp(a[3], c[3], k), yaw: lerpDeg(a[4], c[4], k), st, speed,
          vz: dt > 0 ? (c[3] - a[3]) / dt : 0, hold: p.hold, alive: p.alive, dummy: p.dummy,
          say: p.say != null && t - p.sayAt < SAY_MS ? p.say : null, emote: p.emote != null && t - p.emoteAt < EMOTE_MS ? p.emote : null, emoteAt: p.emoteAt, mark: null,
        });
      }
      return list;
    },
    // 部屋の人（自分以外。的は数えない）
    people: () => [...peers.values()].filter((p) => !p.dummy),
    peer: (id) => peers.get(id) || null,
    serverNow: () => now() + offset,
    phase: () => phase,
    status: () => state,
    myId: () => myId,
    count: () => [...peers.values()].filter((p) => !p.dummy).length,
    say: (n) => raw(["s", n | 0]),
    emote: (n) => raw(["e", n | 0]),
    mark: () => false,
    rename(nm, cl) { me.name = nm || me.name; me.col = cl || me.col; raw(["j", me.name, me.col, ver]); },
    ready: (v) => raw(["r", v ? 1 : 0]),
    drop: () => raw(["d"]),
    hold: (slot) => raw(["w", slot | 0]),
    fire: (slot, n, yaw, pitch) => raw(["f", slot | 0, n | 0, Math.round(yaw), Math.round(pitch)]),
    hit: (tid, slot, heads, k) => raw(["a", tid | 0, slot | 0, heads | 0, k | 0]),
    reload: (slot) => raw(["l", slot | 0]),
    take: (id) => raw(["g", id | 0]),
    discard: (kind) => raw(["o", String(kind)]),
    heal: (kind, done) => raw(["u", String(kind), done ? 1 : 0]),
    close() {
      closed = true;
      timers.clearTimeout(timer);
      timers.clearInterval?.(syncTimer);
      const s = ws;
      ws = null;
      try { s?.close(); } catch { /* もう閉じている */ }
      peers.clear();
      state = "closed";
    },
  };
}

/**
 * 練習：端末の中で試合（campus3dRoyaleMatch の practice）を動かし、部屋サーバーと同じ形でつなぐ。
 * @param opts { name, col, spawns, hubs, spawnsVer, now, timers, onEvent, onChange }
 */
export function createLocalRoyaleLink({ spawns, hubs, spawnsVer = 0, now = () => Date.now(), timers = globalThis, ...rest } = {}) {
  const match = createRoyaleMatch({ spawns, hubs, spawnsVer, practice: true });
  const MY = 1;
  class LocalSocket {
    constructor() {
      this.readyState = 0;
      this.iv = timers.setInterval(() => this.deliver(match.tick(now())), 250);
      timers.setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.onopen?.();
      }, 0);
    }

    send(text) {
      if (this.readyState !== 1) return;
      let m;
      try { m = JSON.parse(text); } catch { return; }
      this.deliver(match.handle(MY, m, now()));
    }

    deliver(out) {
      for (const o of out) {
        const mine = o.to === "all" || o.to === MY || (o.to === "others" && o.from !== MY) || (Array.isArray(o.to) && o.to.includes(MY));
        if (!mine) continue;
        const data = JSON.stringify(o.msg);
        timers.setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data }); }, 0);
      }
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      timers.clearInterval(this.iv);
      match.leave(MY, now());
      timers.setTimeout(() => this.onclose?.(), 0);
    }
  }
  const link = createRoyaleLink({ ...rest, url: "local:practice", ver: versionOf(spawnsVer), WebSocketImpl: LocalSocket, now, timers, local: true });
  link.match = match; // テスト用
  return link;
}
