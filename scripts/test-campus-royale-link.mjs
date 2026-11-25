// campus3dRoyaleLink.js（キャンパスロワイヤルの通信）のテスト。にせの WebSocket・時計・タイマーで、送る間引き・時計合わせ・補い・
// アウトの人を描かないこと、練習（端末の中の試合）が最後まで回ることを見る。node scripts/test-campus-royale-link.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { DUMMY_ID0 } from "../campus-sns/campus3dRoyaleMatch.js";
import { createLocalRoyaleLink, createRoyaleLink } from "../campus-sns/campus3dRoyaleLink.js";
import * as R from "../campus-sns/campus3dRoyaleRules.js";

function fakeTime(start = 1000) {
  let clock = start, seq = 0;
  const q = [];
  const timers = {
    setTimeout: (fn, ms = 0) => { const id = ++seq; q.push({ id, fn, at: clock + ms }); return id; },
    clearTimeout: (id) => { const i = q.findIndex((t) => t.id === id); if (i >= 0) q.splice(i, 1); },
    setInterval: (fn, ms) => { const id = ++seq; q.push({ id, fn, at: clock + ms, every: ms }); return id; },
    clearInterval: (id) => timers.clearTimeout(id),
  };
  const advance = (ms) => {
    const end = clock + ms;
    for (;;) {
      q.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = q[0];
      if (!t || t.at > end) break;
      clock = Math.max(clock, t.at);
      if (t.every) t.at += t.every; else q.shift();
      t.fn();
    }
    clock = end;
  };
  return { now: () => clock, timers, advance, set: (v) => { clock = v; } };
}
const socks = [];
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; socks.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

test("つなぐ・入る・時計合わせ・送る間引き・アウトの人は描かない", () => {
  const T = fakeTime();
  const events = [];
  const link = createRoyaleLink({ url: "ws://x/royale/main", name: "あおい", col: "#28c868", ver: 1005, WebSocketImpl: FakeWS, now: T.now, timers: T.timers, onEvent: (m) => events.push(m) });
  const S = socks.at(-1);
  assert.equal(link.status(), "connecting");
  S.open();
  assert.deepEqual(S.sent[0], ["j", "あおい", "#28c868", 1005]);
  // 入った：部屋の時計は端末より 5 秒進んでいる
  S.recv(["h", 4, T.now() + 5000, { phase: "lobby", players: [[4, "あおい", "#28c868", 0, 0, 0, 0, 0, 0, "fist", 0, 0, 0, 0], [2, "みどり", "#112233", 0, 10, 20, 30, 90, 0, "fist", 1, 0, 0, 0]] }]);
  assert.equal(link.myId(), 4);
  assert.equal(link.count(), 1);
  assert.ok(Math.abs(link.serverNow() - (T.now() + 5000)) < 1);
  assert.equal(S.sent.filter((m) => m[0] === "t").length, 1, "入ったらすぐ時計合わせ");
  T.advance(1000);
  assert.equal(S.sent.filter((m) => m[0] === "t").length, 3);
  // 返事：部屋は行き帰りのまん中の時刻（部屋の時計は +5000）で答える → ずれは 5000
  const ping = S.sent.filter((m) => m[0] === "t").at(-1);
  T.advance(100);
  const rtt = T.now() - ping[1];
  S.recv(["t", ping[1], ping[1] + rtt / 2 + 5000]);
  assert.ok(Math.abs(link.serverNow() - (T.now() + 5000)) < 1, "行き帰りの半分を足す");
  assert.ok(events.some((m) => m[0] === "h"), "試合のメッセージは onEvent へも");
  // ロビー：動いているとき 200 ms に 1 回
  const n0 = S.sent.length;
  let sent = 0;
  for (let i = 0; i < 60; i++) { T.advance(16); if (link.send({ x: i * 0.07, y: 0, z: 30, yaw: 0, st: 0 })) sent++; }
  assert.ok(sent >= 4 && sent <= 6, `ロビーで約 1 秒に ${sent} 回`);
  assert.equal(S.sent.length - n0, sent);
  // 試合が始まった：自分は参加している → 125 ms に 1 回。飛行機の中は送らない
  S.recv(["m", "play", T.now(), 7, "S", [4, 2]]);
  assert.equal(link.send({ x: 1, y: 1, z: 260, yaw: 0, st: 10 }), false);
  sent = 0;
  for (let i = 0; i < 60; i++) { T.advance(16); if (link.send({ x: i * 0.07, y: 0, z: 30, yaw: 0, st: 0 })) sent++; }
  assert.ok(sent >= 7 && sent <= 9, `試合中は約 1 秒に ${sent} 回`);
  // ほかの人の補い：200 ms 遅れて 2 点のあいだ
  S.recv(["p", 2, 0, 0, 30, 0, 0]);
  T.advance(200);
  S.recv(["p", 2, 2, 0, 30, 0, 0]);
  T.advance(100);
  const q = link.peers().find((p) => p.id === 2);
  assert.ok(q && Math.abs(q.x - 1) < 0.05, `x ${q?.x}`);
  assert.ok(Math.abs(q.speed - 10) < 0.5, `速さ ${q?.speed}`);
  S.recv(["w", 2, "smg"]);
  assert.equal(link.peers()[0].hold, "smg");
  // アウト → 描かない
  S.recv(["k", 2, 4, "smg", 2, 1]);
  assert.equal(link.peers().length, 0);
  // ロビーへ戻る → また描く（新しい位置が届けば）
  S.recv(["m", "lobby"]);
  S.recv(["p", 2, 5, 5, 30, 0, 0]);
  T.advance(300);
  assert.equal(link.peers().length, 1);
  // 満員の断り
  S.recv(["x", "full"]);
  assert.equal(link.status(), "full");
  link.close();
  assert.equal(link.status(), "closed");
});

test("切れたらつなぎ直す（1・2・4 秒…）", () => {
  const T = fakeTime();
  const n0 = socks.length;
  const link = createRoyaleLink({ url: "ws://x/royale/main", WebSocketImpl: FakeWS, now: T.now, timers: T.timers });
  socks.at(-1).open();
  socks.at(-1).close();
  assert.equal(link.status(), "connecting");
  T.advance(999);
  assert.equal(socks.length, n0 + 1);
  T.advance(2);
  assert.equal(socks.length, n0 + 2, "1 秒後につなぎ直す");
  link.close();
});

test("練習：端末の中の試合で、秒読み → 飛行機 → 降りる → 的を撃ってアウト", () => {
  const T = fakeTime(50000);
  const spawns = [];
  for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) spawns.push([30 + i * 6, 55 + j * 6, 30, R.SPOT.open]);
  const hubs = [{ id: "a", name: "A", x: 30, y: 55 }];
  const events = [];
  const link = createLocalRoyaleLink({ name: "練習", col: "#3d8bfd", spawns, hubs, now: T.now, timers: T.timers, onEvent: (m) => events.push(m) });
  T.advance(10);
  assert.equal(link.status(), "open");
  assert.equal(link.myId(), 1);
  link.ready(1);
  T.advance(10);
  assert.ok(events.some((m) => m[0] === "m" && m[1] === "countdown"));
  T.advance(R.MATCH.practiceCountdown * 1000 + 300);
  const play = events.find((m) => m[0] === "m" && m[1] === "play");
  assert.ok(play, "始まった");
  assert.equal(link.phase(), "play");
  const dummies = link.peers().filter((p) => p.dummy);
  assert.equal(dummies.length, R.MATCH.practiceDummies, "的が見える");
  assert.ok(dummies.every((p) => p.id >= DUMMY_ID0));
  assert.equal(link.count(), 0, "的は人数に数えない");
  T.advance(4000);
  link.drop();
  T.advance(10);
  // 的のすぐそばへ（1 分後なら速すぎない）
  T.advance(60000);
  const d = dummies[0];
  link.send({ x: d.x + 1, y: d.y, z: d.z, yaw: 0, st: 0 });
  // スコープブラスターを持たせる（テスト用に試合の中を直接さわる）
  const me = link.match.player(1);
  me.slots[0] = { kind: "sniper", mag: 4, shotAt: 0, reloadAt: 0 };
  link.fire(1, 1, 0, 90);
  link.hit(d.id, 1, 1, 1);
  T.advance(10);
  const k = events.find((m) => m[0] === "k");
  assert.ok(k && k[1] === d.id && k[2] === 1, "的がアウト");
  assert.equal(link.peers().filter((p) => p.dummy).length, R.MATCH.practiceDummies - 1);
  // やめる（接続を閉じる）→ 試合の中では自分がアウトで終わる
  link.close();
  assert.equal(link.match.phase(), "end");
});
