// バーチャルキャンパス（みんなと歩く）の通信の部品。部屋サーバー（cf-walk-rooms。Cloudflare Durable Objects）に WebSocket でつなぎ、
// 自分の位置を送り、ほかの人の位置を受けて、間をなめらかに補う。地図（キャンパスナビ）はこれを読まない＝通信しない。
//
// 送る：動いているときだけ 1 秒に 5 回まで。止まったら最後の位置を 1 回、そのあとは 4 秒に 1 回（無料プランの数え方：受けた 20 個で 1 回）。
// 受ける：届いた点をためて、INTERP_MS だけ遅らせた時刻の位置を 2 点のあいだで補う（少し抜けても目立たない）。向きは近いほうへ回す。
// 切れたら 1・2・4・…・15 秒おいてつなぎ直す。つながっていない間も歩くモードはそのまま（ひとり）。

export const PEER_STATES = ["walk", "run", "sit", "fly", "bike", "car", "drone", "jet"];
// 定型のひとこと・合図（番号で送る。自由な文は送らない）
export const PEER_PHRASES = ["こんにちは", "こっちだよ", "ついてきて", "ありがとう", "ちょっと待って", "いいね", "またね", "写真とろう"];
export const PEER_EMOTES = ["wave", "jump", "clap"];

const SEND_MS = 200; // 動いているときの送る間隔（1 秒 5 回）
const IDLE_MS = 4000; // 止まっているときの送る間隔
const INTERP_MS = 260; // 受けた位置を描くまでの遅れ（送る間隔より少し長く）
const KEEP_MS = 2500; // ためておく点の古さ
const SAY_MS = 4500; // ひとことを頭の上に出しておく時間
const EMOTE_MS = 1600;

const lerp = (a, b, k) => a + (b - a) * k;
const lerpDeg = (a, b, k) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * k;
};
const moved = (a, b) => !a || Math.abs(a[0] - b[0]) > 0.02 || Math.abs(a[1] - b[1]) > 0.02 || Math.abs(a[2] - b[2]) > 0.02 || Math.abs(a[3] - b[3]) > 1.5 || a[4] !== b[4];

/**
 * 部屋につなぐ。
 * @param opts { url（wss://…/room/<名前>）, name, col（#rrggbb）, WebSocketImpl（テスト用）, now（テスト用の時計）, onChange（人の出入り・つながりが変わったとき） }
 * @returns { send(state), peers(now), say(n), emote(n), mark(p), rename(name, col), status(), count(), close() }
 */
export function createPeerLink({ url, name = "ゲスト", col = "#6870e0", WebSocketImpl = globalThis.WebSocket, now = () => Date.now(), onChange = () => {}, timers = globalThis } = {}) {
  const peers = new Map(); // id → { id, name, col, buf: [[t, x, y, z, yaw, st]], say, sayAt, emote, emoteAt, mark }
  let ws = null;
  let state = "connecting"; // connecting / open / closed / full
  let myId = null;
  let closed = false;
  let retry = 0;
  let timer = 0;
  let lastSent = null;
  let lastSendAt = 0;
  let me = { name, col };
  const tell = () => { try { onChange(); } catch { /* 呼ぶ側の失敗は通信に関係ない */ } };
  const setState = (s) => { if (state !== s) { state = s; tell(); } };
  const raw = (msg) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); return true; } catch { /* 切れかけ */ } } return false; };
  const peerOf = (id, nm, cl) => {
    let p = peers.get(id);
    if (!p) { p = { id, name: nm || "ゲスト", col: cl || "#6870e0", buf: [], say: null, sayAt: 0, emote: null, emoteAt: 0, mark: null }; peers.set(id, p); }
    else { if (nm) p.name = nm; if (cl) p.col = cl; }
    return p;
  };
  const push = (p, x, y, z, yaw, st) => {
    if (![x, y, z, yaw].every((v) => typeof v === "number" && Number.isFinite(v))) return;
    const t = now();
    p.buf.push([t, x, y, z, yaw, st | 0]);
    while (p.buf.length > 2 && p.buf[0][0] < t - KEEP_MS) p.buf.shift();
  };
  const onMessage = (text) => {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!Array.isArray(m)) return;
    const k = m[0];
    if (k === "h") {
      myId = m[1];
      peers.clear();
      for (const q of Array.isArray(m[2]) ? m[2] : []) { const p = peerOf(q[0], q[1], q[2]); push(p, q[3], q[4], q[5], q[6], q[7]); }
      tell();
    } else if (k === "j") { peerOf(m[1], m[2], m[3]); tell(); }
    else if (k === "l") { if (peers.delete(m[1])) tell(); }
    else if (k === "p") push(peerOf(m[1]), m[2], m[3], m[4], m[5], m[6]);
    else if (k === "s") { const p = peerOf(m[1]); p.say = m[2] | 0; p.sayAt = now(); tell(); }
    else if (k === "e") { const p = peerOf(m[1]); p.emote = m[2] | 0; p.emoteAt = now(); }
    else if (k === "m") { const p = peerOf(m[1]); p.mark = typeof m[2] === "number" ? [m[2], m[3], m[4]] : null; tell(); }
    else if (k === "x" && m[1] === "full") { setState("full"); }
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
      raw(["j", me.name, me.col]);
      setState("open");
    };
    sock.onmessage = (e) => { if (ws === sock) onMessage(typeof e.data === "string" ? e.data : ""); };
    sock.onclose = () => { if (ws === sock) { ws = null; if (peers.size) { peers.clear(); tell(); } if (state !== "full") again(); } };
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
    // 自分の状態を送る（毎フレーム呼んでよい。間引く）。s = { x, y, z, yaw, st }
    send(s) {
      if (state !== "open" || !s) return false;
      const t = now();
      const cur = [Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, Math.round(s.z * 100) / 100, Math.round(s.yaw), s.st | 0];
      const mv = moved(lastSent, cur);
      if (t - lastSendAt < (mv ? SEND_MS : IDLE_MS)) return false;
      if (!raw(["p", ...cur])) return false;
      lastSent = cur;
      lastSendAt = t;
      return true;
    },
    // ほかの人の、いま描く位置（補ったもの）。[{ id, name, col, x, y, z, yaw, st, speed, say, emote, mark }]
    peers(t = now()) {
      const at = t - INTERP_MS;
      const out = [];
      for (const p of peers.values()) {
        const b = p.buf;
        if (!b.length) continue;
        let i = b.length - 1;
        while (i > 0 && b[i][0] > at) i--;
        const a = b[i], c = b[Math.min(i + 1, b.length - 1)];
        const k = c[0] > a[0] ? Math.min(1, Math.max(0, (at - a[0]) / (c[0] - a[0]))) : 0;
        const dt = (c[0] - a[0]) / 1000;
        const speed = dt > 0 && k < 1 ? Math.hypot(c[1] - a[1], c[2] - a[2]) / dt : 0;
        out.push({
          id: p.id, name: p.name, col: p.col, x: lerp(a[1], c[1], k), y: lerp(a[2], c[2], k), z: lerp(a[3], c[3], k), yaw: lerpDeg(a[4], c[4], k), st: (k < 0.5 ? a : c)[5], speed,
          flightPitch: dt > 0 ? Math.atan2(c[3]-a[3], Math.hypot(c[1]-a[1],c[2]-a[2]))*180/Math.PI : 0,
          turnRate: dt > 0 ? (lerpDeg(a[4],c[4],1)-a[4])/dt : 0,
          say: p.say != null && t - p.sayAt < SAY_MS ? p.say : null, emote: p.emote != null && t - p.emoteAt < EMOTE_MS ? p.emote : null, emoteAt: p.emoteAt, mark: p.mark,
        });
      }
      return out;
    },
    say: (n) => raw(["s", n | 0]),
    emote: (n) => raw(["e", n | 0]),
    mark: (p) => raw(p ? ["m", p[0], p[1], p[2]] : ["m", null]),
    rename(nm, cl) { me = { name: nm || me.name, col: cl || me.col }; raw(["j", me.name, me.col]); },
    status: () => state,
    myId: () => myId,
    count: () => peers.size,
    close() {
      closed = true;
      timers.clearTimeout(timer);
      const s = ws;
      ws = null;
      try { s?.close(); } catch { /* もう閉じている */ }
      peers.clear();
      state = "closed";
    },
  };
}
