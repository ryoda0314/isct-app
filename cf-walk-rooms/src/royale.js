// キャンパスロワイヤルの部屋（docs/campus-royale-spec.md の 6 章）。部屋 1 つ＝ Durable Object 1 つ（RoyaleRoom）。
// WebSocket を試合の状態機械（campus-sns/campus3dRoyaleMatch.js。端末の練習・テストと同じもの）につなぐだけ。ルールはそちらにある。
// 時間で進むもの（秒読み・円のダメージ・結果のあとロビーへ）は Durable Object のアラームで 1 秒ごと。ロビーではアラームを止める（部屋が眠れる）。
// 接続ごとの添え書き（serializeAttachment）：{ id, name, col, tok, t }。試合の状態はメモリだけ（フェーズだけ保存し、
// 起きたときに試合の途中だったら中止してロビーへ戻す。途中からの復元はしない）。
import { createRoyaleMatch } from "../../campus-sns/campus3dRoyaleMatch.js";
import { versionOf } from "../../campus-sns/campus3dRoyaleRules.js";
import { HUBS, SPAWNS, SPAWNS_VER } from "../../campus-sns/campus3dRoyaleSpawns.js";

const RATE = { perSec: 24, burst: 48 }; // 1 接続が 1 秒に送れる数（位置 8・撃つ 5・当たり 5・ほか）
const MAX_BYTES = 200;

export class RoyaleRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.max = Math.max(2, Math.min(24, parseInt(env.ROYALE_MAX || "24", 10) || 24));
    this.match = createRoyaleMatch({ spawns: SPAWNS, hubs: HUBS, spawnsVer: SPAWNS_VER, max: this.max });
    this.phase = "lobby";
    this.alarmAt = 0;
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("phase");
      const now = Date.now();
      // 眠っていた部屋が起きた：つながっている人をロビーから入れ直す。試合の途中なら中止、結果・秒読みのあいだならロビーへ戻ったと知らせる
      // （結果の 15 秒のあいだに誰も何も送らないと、部屋は眠る）
      const socks = ctx.getWebSockets().filter((s) => s.deserializeAttachment()?.name);
      if (saved && saved !== "lobby") for (const s of socks) this.sendTo(s, ["m", saved === "play" ? "abort" : "lobby"]);
      for (const s of socks) {
        const a = s.deserializeAttachment();
        this.deliver(this.match.handle(a.id, ["j", a.name, a.col, versionOf(SPAWNS_VER)], now));
      }
      if (saved && saved !== "lobby") await ctx.storage.put("phase", "lobby");
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // 番号：いまの接続とも、結果のために残している出た人とも重ならない小さな数
    const used = new Set(this.ctx.getWebSockets().map((s) => s.deserializeAttachment()?.id));
    let id = 1;
    while (used.has(id) || this.match.has(id)) id++;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name: null, col: null, tok: RATE.burst, t: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  sendTo(ws, msg) {
    if (!ws) return;
    try { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); } catch { /* 切れかけ */ }
  }

  // 試合の状態機械が出したメッセージを配る（to: "all" | "others" | id | [id…]、close は送ったあと切る）
  deliver(out) {
    if (!out.length) return;
    const byId = new Map();
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment();
      if (a?.name) byId.set(a.id, s);
    }
    for (const o of out) {
      const text = JSON.stringify(o.msg);
      if (o.to === "all") for (const s of byId.values()) this.sendTo(s, text);
      else if (o.to === "others") { for (const [id, s] of byId) if (id !== o.from) this.sendTo(s, text); }
      else if (Array.isArray(o.to)) { for (const id of o.to) this.sendTo(byId.get(id), text); }
      else {
        const s = byId.get(o.to);
        this.sendTo(s, text);
        if (o.close && s) try { s.close(1008, String(o.msg[1] || "bye")); } catch { /* もう閉じている */ }
      }
    }
  }

  // フェーズが変わったら保存する（起きたときに試合の途中だったかを知るため）
  persist() {
    const ph = this.match.phase();
    if (ph !== this.phase) {
      this.phase = ph;
      this.ctx.storage.put("phase", ph);
    }
  }

  // 次のアラーム（試合の状態機械が「この時間後に tick して」と言う。null ならいらない）
  schedule(now) {
    const d = this.match.nextTick(now);
    if (d == null) {
      if (this.alarmAt) { this.alarmAt = 0; this.ctx.storage.deleteAlarm(); }
      return;
    }
    const at = now + Math.max(200, d);
    if (!this.alarmAt || this.alarmAt < now || at < this.alarmAt - 50) {
      this.alarmAt = at;
      this.ctx.storage.setAlarm(at);
    }
  }

  async alarm() {
    this.alarmAt = 0;
    const now = Date.now();
    this.deliver(this.match.tick(now));
    this.persist();
    this.schedule(now);
  }

  webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (typeof data !== "string" || data.length > MAX_BYTES) return this.sendTo(ws, ["x", "bad"]);
    // 送りすぎを抑える（バケツ）。あふれた分は黙って捨てる
    const now = Date.now();
    a.tok = Math.min(RATE.burst, a.tok + ((now - a.t) / 1000) * RATE.perSec);
    a.t = now;
    if (a.tok < 1) { ws.serializeAttachment(a); return; }
    a.tok -= 1;
    let msg;
    try { msg = JSON.parse(data); } catch { msg = null; }
    if (!Array.isArray(msg)) { ws.serializeAttachment(a); return this.sendTo(ws, ["x", "bad"]); }
    if (msg[0] === "j") {
      a.name = String(msg[1] ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) || "ゲスト";
      a.col = typeof msg[2] === "string" && /^#[0-9a-fA-F]{6}$/.test(msg[2]) ? msg[2].toLowerCase() : "#6870e0";
    }
    ws.serializeAttachment(a);
    if (!a.name) return; // 入る前のほかのメッセージは捨てる
    this.deliver(this.match.handle(a.id, msg, now));
    this.persist();
    this.schedule(now);
  }

  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    const now = Date.now();
    if (a?.name) {
      a.name = null; // もう配らない
      try { ws.serializeAttachment(a); } catch { /* 閉じている */ }
      this.deliver(this.match.leave(a.id, now));
      this.persist();
      this.schedule(now);
    }
    try { ws.close(); } catch { /* もう閉じている */ }
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
