// 「みんなと歩く」の部屋サーバー（2026-11-18）。3D マップの歩くモードで、同じ部屋にいる人どうしの位置・ひとこと・合図を中継する。
// 形：部屋 1 つ＝ Durable Object 1 つ（WalkRoom）。各自が自分の状態を WebSocket で送り、部屋がほかの全員へ配る（保存しない）。
// 無料プランの数え方：受けたメッセージは 20 個で 1 リクエスト、配る側は数えない → 送る回数を端末の側で抑える（動いているときだけ 1 秒 5 回）。
//
// 通信（どれも JSON の配列。1 つ目が種類）：
//   端末 → 部屋  ["j", name, col]             入る（名前は 16 字まで、色は #rrggbb）
//                ["p", x, y, z, yaw, st]      位置（平面の m・標高・向き°・状態の番号 0 歩く 1 走る 2 座る 3 飛ぶ 4 自転車 5 車 6 ドローン）
//                ["s", n]                     定型のひとこと（番号）    ["e", n]  合図（番号）    ["m", x, y, z]  集合の目印（null で消す）
//   部屋 → 端末  ["h", myId, [[id, name, col, x, y, z, yaw, st], …]]   入ったとき：自分の番号と、いまいる人
//                ["j", id, name, col]  だれかが入った      ["l", id]  だれかが出た
//                ["p", id, x, y, z, yaw, st]  ["s", id, n]  ["e", id, n]  ["m", id, x, y, z]
//                ["x", reason]  断り（"full" 満員・"rate" 送りすぎ・"bad" 形がちがう）
// 状態は WebSocket ごとの添え書き（serializeAttachment）に置く：部屋が眠っても（hibernation）残る。

const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
const RATE = { perSec: 12, burst: 24 }; // 1 接続が 1 秒に送れる数（ためておける数）
const MAX_BYTES = 200;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{1,32})$/);
    if (!m) return new Response("isct walk rooms", { status: url.pathname === "/" ? 200 : 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(origin)) return new Response("origin", { status: 403 });
    const id = env.ROOMS.idFromName(m[1]);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class WalkRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.max = Math.max(2, Math.min(100, parseInt(env.MAX_PEERS || "40", 10) || 40));
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const peers = this.ctx.getWebSockets();
    if (peers.length >= this.max) {
      server.accept();
      server.send(JSON.stringify(["x", "full"]));
      server.close(1013, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    // 番号：部屋の中で重ならない小さな数
    const used = new Set(peers.map((p) => p.deserializeAttachment()?.id));
    let id = 1;
    while (used.has(id)) id++;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name: null, col: null, s: null, tok: RATE.burst, t: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  others(ws) {
    return this.ctx.getWebSockets().filter((o) => o !== ws);
  }

  cast(ws, msg) {
    const text = JSON.stringify(msg);
    for (const o of this.others(ws)) {
      if (!o.deserializeAttachment()?.name) continue; // まだ入っていない接続には配らない
      try { o.send(text); } catch { /* 切れかけ */ }
    }
  }

  webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (typeof data !== "string" || data.length > MAX_BYTES) return ws.send(JSON.stringify(["x", "bad"]));
    // 送りすぎを抑える（バケツ）
    const now = Date.now();
    a.tok = Math.min(RATE.burst, a.tok + ((now - a.t) / 1000) * RATE.perSec);
    a.t = now;
    if (a.tok < 1) { ws.serializeAttachment(a); return; }
    a.tok -= 1;
    let msg;
    try { msg = JSON.parse(data); } catch { msg = null; }
    if (!Array.isArray(msg)) { ws.serializeAttachment(a); return ws.send(JSON.stringify(["x", "bad"])); }
    const kind = msg[0];
    if (kind === "j") {
      const name = String(msg[1] ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) || "ゲスト";
      const col = /^#[0-9a-fA-F]{6}$/.test(msg[2]) ? msg[2].toLowerCase() : "#6870e0";
      const first = !a.name;
      a.name = name;
      a.col = col;
      ws.serializeAttachment(a);
      if (first) {
        const list = this.others(ws).map((o) => o.deserializeAttachment()).filter((o) => o?.name).map((o) => [o.id, o.name, o.col, ...(o.s || [null, null, null, 0, 0])]);
        ws.send(JSON.stringify(["h", a.id, list]));
      }
      this.cast(ws, ["j", a.id, name, col]);
      return;
    }
    if (!a.name) { ws.serializeAttachment(a); return; } // 入る前のほかのメッセージは捨てる
    if (kind === "p") {
      const x = num(msg[1], -5000, 5000), y = num(msg[2], -5000, 5000), z = num(msg[3], -200, 1000), yaw = num(msg[4], -720, 720), st = num(msg[5], 0, 15);
      if (x == null || y == null || z == null || yaw == null) { ws.serializeAttachment(a); return; }
      a.s = [r2(x), r2(y), r2(z), Math.round(yaw), st == null ? 0 : Math.round(st)];
      ws.serializeAttachment(a);
      this.cast(ws, ["p", a.id, ...a.s]);
      return;
    }
    ws.serializeAttachment(a);
    if (kind === "s" || kind === "e") {
      const n = num(msg[1], 0, 63);
      if (n != null) this.cast(ws, [kind, a.id, Math.round(n)]);
    } else if (kind === "m") {
      const x = num(msg[1], -5000, 5000), y = num(msg[2], -5000, 5000), z = num(msg[3], -200, 1000);
      this.cast(ws, x == null || y == null || z == null ? ["m", a.id, null] : ["m", a.id, r2(x), r2(y), r2(z)]);
    }
  }

  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a?.name) this.cast(ws, ["l", a.id]);
    try { ws.close(); } catch { /* もう閉じている */ }
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
