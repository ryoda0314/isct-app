// campus3dPeers.js（バーチャルキャンパスの通信の部品）のテスト。にせの WebSocket と時計で、送る間引き・受けた位置の補い・つなぎ直しを見る。
// node scripts/test-campus-peers.mjs
import { createPeerLink } from "../campus-sns/campus3dPeers.js";
let ok = 0, fail = 0;
const t = (c, m) => { c ? ok++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
let clock = 1000;
const socks = [];
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; socks.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
const pending = [];
const timers = { setTimeout: (fn, ms) => { pending.push({ fn, at: clock + ms }); return pending.length; }, clearTimeout: () => {} };
const runTimers = () => { for (const p of pending.splice(0)) if (p.at <= clock) p.fn(); else pending.push(p); };
let changes = 0;
const link = createPeerLink({ url: "ws://x/room/main", name: "あおい", col: "#28c868", WebSocketImpl: FakeWS, now: () => clock, timers, onChange: () => changes++ });
t(link.status() === "connecting" && socks.length === 1, "つなぎはじめる");
t(link.send({ x: 1, y: 2, z: 3, yaw: 0, st: 0 }) === false, "つながる前は送らない");
socks[0].open();
t(link.status() === "open" && JSON.stringify(socks[0].sent[0]) === JSON.stringify(["j", "あおい", "#28c868"]), "つながったら名前と色を送る");
socks[0].recv(["h", 7, [[3, "みどり", "#112233", 10, 20, 30, 90, 0]]]);
t(link.myId() === 7 && link.count() === 1, "入ったとき、いまいる人を受ける");
// 送る間引き：動いているとき 200 ms に 1 回、止まったら 4 秒に 1 回
const S = socks[0];
const n0 = S.sent.length;
let sent = 0;
for (let i = 0; i < 60; i++) { clock += 16; if (link.send({ x: i * 0.07, y: 0, z: 30, yaw: 0, st: 0 })) sent++; }
t(sent >= 4 && sent <= 6 && S.sent.length - n0 === sent, `歩いているあいだ（約 1 秒）に送るのは 5 回ほど（${sent} 回）`);
let idle = 0;
for (let i = 0; i < 600; i++) { clock += 16; if (link.send({ x: 4.13, y: 0, z: 30, yaw: 0, st: 0 })) idle++; }
t(idle >= 2 && idle <= 4, `止まっているあいだ（約 10 秒）に送るのは 3 回ほど（${idle} 回）`);
// 受けた位置の補い：260 ms 遅れて、2 点のあいだ
clock = 10000;
S.recv(["p", 3, 0, 0, 30, 350, 0]);
clock = 10200;
S.recv(["p", 3, 2, 0, 30, 10, 0]);
const at = (ms) => link.peers(ms).find((p) => p.id === 3);
t(Math.abs(at(10260 + 100).x - 1) < 0.01, `2 点のまん中の時刻では、位置もまん中（x ${at(10360).x.toFixed(2)}）`);
t(Math.abs(((at(10360).yaw % 360) + 360) % 360 - 0) < 0.5, `向きは近いほうへ回る（350° → 10° のまん中は 0°。${at(10360).yaw.toFixed(1)}）`);
t(Math.abs(at(10360).speed - 10) < 0.1, "速さ（歩く動きに使う）も出る");
t(at(12000).x === 2 && at(12000).speed === 0, "新しい点が来なければ、最後の位置で止まる");
// ひとこと・合図・目印
S.recv(["s", 3, 2]);
t(at(clock).say === 2 && at(clock + 6000).say === null, "ひとことは 4.5 秒だけ出す");
S.recv(["m", 3, 5, 6, 30]);
t(JSON.stringify(at(clock).mark) === "[5,6,30]", "集合の目印を受ける");
S.recv(["m", 3, null]);
t(at(clock).mark === null, "目印を消す");
link.say(1); link.emote(0); link.mark([1, 2, 3]);
t(JSON.stringify(S.sent.slice(-3)) === JSON.stringify([["s", 1], ["e", 0], ["m", 1, 2, 3]]), "ひとこと・合図・目印を送る");
// 出入り
S.recv(["j", 9, "あか", "#ff0000"]);
t(link.count() === 2 && link.peers(clock).length === 1, "入っただけの人（位置がまだ来ていない）は描かない");
S.recv(["l", 3]);
t(link.count() === 1, "出た人を消す");
// 切れたらつなぎ直す
S.close();
t(link.status() === "connecting" && link.count() === 0, "切れたら人を消して、つなぎ直しを待つ");
clock += 1100; runTimers();
t(socks.length === 2, "1 秒あとにつなぎ直す");
socks[1].open();
t(link.status() === "open" && socks[1].sent[0][0] === "j", "つなぎ直したら、もう一度入る");
// 満員
socks[1].recv(["x", "full"]);
socks[1].close();
clock += 20000; runTimers();
t(link.status() === "full" && socks.length === 2, "満員ならつなぎ直さない");
// 閉じる
const link2 = createPeerLink({ url: "ws://x/room/main", WebSocketImpl: FakeWS, now: () => clock, timers });
socks[2].open();
link2.close();
clock += 20000; runTimers();
t(link2.status() === "closed" && socks.length === 3, "閉じたらつなぎ直さない");
console.log(`test-campus-peers ok=${ok} fail=${fail}`, "changes", changes);
process.exit(fail ? 1 : 0);
