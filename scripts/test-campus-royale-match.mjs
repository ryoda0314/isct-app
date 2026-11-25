// campus3dRoyaleMatch.js（キャンパスロワイヤルの試合の進み）のテスト。にせの参加者で試合を最後まで回す。
// node scripts/test-campus-royale-match.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { DROP_ID0, DUMMY_ID0, createRoyaleMatch } from "../campus-sns/campus3dRoyaleMatch.js";
import * as R from "../campus-sns/campus3dRoyaleRules.js";

// 置き場所：L の中心のまわりの 6 m の格子（屋外の広い所）＋拠点 3 つ
const spawns = [];
for (let i = -30; i <= 30; i++) for (let j = -30; j <= 30; j++) spawns.push([30 + i * 6, 55 + j * 6, 30, R.SPOT.open | (Math.abs(i) < 3 && Math.abs(j) < 3 ? R.SPOT.hub : 0)]);
const hubs = [{ id: "a", name: "A", x: 30, y: 55 }, { id: "b", name: "B", x: 60, y: 85 }, { id: "c", name: "C", x: 0, y: 25 }];
const VER = R.versionOf(0);

function room(opts = {}) {
  const m = createRoyaleMatch({ spawns, hubs, random: () => 0.37, ...opts });
  const log = [];
  const run = (out) => { log.push(...out); return out; };
  return {
    m, log,
    join: (id, now = 0, ver = VER) => run(m.handle(id, ["j", "人" + id, "#28c868", ver], now)),
    send: (id, msg, now) => run(m.handle(id, msg, now)),
    tick: (now) => run(m.tick(now)),
    leave: (id, now) => run(m.leave(id, now)),
  };
}
const msgs = (out, k) => out.filter((e) => e.msg[0] === k);
const to = (out, id) => out.filter((e) => e.to === "all" || e.to === id || (e.to === "others" && e.from !== id) || (Array.isArray(e.to) && e.to.includes(id)));
const inv = (out, id) => to(msgs(out, "i"), id).filter((e) => e.to === id).map((e) => e.msg).pop();

// 2 人を試合まで進める。返り値：始まった時刻・計画
function startTwo(r, ids = [1, 2]) {
  for (const id of ids) r.join(id);
  for (const id of ids) r.send(id, ["r", 1], 10);
  const cd = msgs(r.log, "m").find((e) => e.msg[1] === "countdown");
  assert.ok(cd, "全員が準備OKなら秒読み");
  const startAt = cd.msg[2];
  r.tick(startAt);
  const play = msgs(r.log, "m").find((e) => e.msg[1] === "play");
  assert.ok(play);
  return { t0: play.msg[2], plan: r.m.plan };
}
// 飛び降りて、物資の点の上まで歩いた（位置を送った）ことにする
function landAt(r, id, x, y, z, now) {
  r.send(id, ["d"], now);
  r.send(id, ["p", x, y, z, 0, 0], now + 60000); // 1 分あとなら、どこへ動いても速すぎない
}
const lootOf = (plan, cat) => [...plan.loot].find(([, it]) => R.catOf(it.kind) === cat);

test("入る：版が違う・満員・名前の整え・いまいる人", () => {
  const r = room({ max: 2 });
  const bad = r.join(1, 0, -1);
  assert.deepEqual(bad[0].msg, ["x", "ver"]);
  assert.equal(bad[0].close, true);
  const a = r.join(1);
  const h = msgs(a, "h")[0].msg;
  assert.equal(h[1], 1);
  assert.equal(h[3].phase, "lobby");
  r.m.handle(2, ["j", "<b>長い名前のひとですよろしくおねがいします</b>\u0007", "red", VER], 0);
  const p2 = r.m.player(2);
  assert.ok(!/[<>\u0007]/.test(p2.name) && p2.name.length <= 16);
  assert.equal(p2.col, "#6870e0");
  assert.deepEqual(r.join(3)[0].msg, ["x", "full"]);
  assert.equal(r.m.count(), 2);
});

test("準備OK：2 人から 30 秒、全員そろえばすぐ。押していない人は観戦。途中で入った人も観戦", () => {
  const r = room();
  for (const id of [1, 2, 3]) r.join(id);
  r.send(1, ["r", 1], 100);
  assert.equal(r.m.phase(), "lobby");
  r.send(2, ["r", 1], 200);
  assert.equal(r.m.phase(), "lobby", "3 人のうち 2 人だけ：まだ");
  assert.equal(r.m.nextTick(200), R.MATCH.readyWait * 1000);
  r.tick(200 + R.MATCH.readyWait * 1000);
  assert.equal(r.m.phase(), "countdown");
  const startAt = 200 + (R.MATCH.readyWait + R.MATCH.countdown) * 1000;
  assert.deepEqual(msgs(r.log, "m").pop().msg, ["m", "countdown", startAt]);
  r.tick(startAt);
  assert.equal(r.m.phase(), "play");
  assert.deepEqual(r.m.roster, [1, 2]);
  assert.equal(r.m.player(3).st, 11);
  assert.equal(r.m.player(1).st, 10);
  assert.ok(inv(r.log, 1), "参加者には持ち物を送る");
  const late = r.join(4, startAt + 5);
  assert.equal(msgs(late, "h")[0].msg[3].phase, "play");
  assert.equal(r.m.player(4).inMatch, false);
});

test("秒読み中に準備OKが 1 人になったらロビーへ戻る", () => {
  const r = room();
  r.join(1); r.join(2);
  r.send(1, ["r", 1], 0);
  r.send(2, ["r", 1], 0);
  assert.equal(r.m.phase(), "countdown");
  r.send(2, ["r", 0], 1000);
  assert.equal(r.m.phase(), "lobby");
  assert.deepEqual(msgs(r.log, "m").pop().msg, ["m", "lobby"]);
});

test("飛び降り：早すぎると降りない・あとで降りる・時間切れで降ろされる", () => {
  const r = room();
  const { t0, plan } = startTwo(r);
  r.send(1, ["d"], t0 + (R.PLANE.jumpAfter - 1) * 1000);
  assert.equal(r.m.player(1).jumped, false);
  r.send(1, ["d"], t0 + (R.PLANE.jumpAfter + 1) * 1000);
  const p1 = r.m.player(1);
  assert.equal(p1.jumped, true);
  const P = R.planeAt(plan, R.PLANE.jumpAfter + 1);
  assert.ok(Math.hypot(p1.x - P.x, p1.y - P.y) < 0.01 && p1.z === R.PLANE.z);
  // 飛行機の中の位置は配らない
  const before = r.log.length;
  r.send(2, ["p", 1, 2, 3, 0, 10], t0 + 5000);
  assert.equal(msgs(r.log.slice(before), "p").length, 0);
  r.tick(t0 + R.ejectAt(plan) * 1000 + 10);
  assert.equal(r.m.player(2).jumped, true);
  const E = R.planeAt(plan, R.ejectAt(plan));
  assert.ok(Math.hypot(r.m.player(2).x - E.x, r.m.player(2).y - E.y) < 0.01);
});

test("位置：地上で速すぎる飛びは捨てる", () => {
  const r = room();
  const { t0 } = startTwo(r);
  landAt(r, 1, 30, 55, 30, t0 + 4000);
  const now = t0 + 70000;
  r.send(1, ["p", 33, 55, 30, 0, 0], now + 1000);
  assert.equal(r.m.player(1).x, 33);
  r.send(1, ["p", 80, 55, 30, 0, 0], now + 1500);
  assert.equal(r.m.player(1).x, 33, "0.5 秒で 47 m は捨てる");
  const out = r.send(1, ["p", 36, 55, 30, 0, 0], now + 2000);
  assert.equal(msgs(out, "p")[0].to, "others");
});

test("拾う：近くの 1 人だけ・遠いと拾えない・弾は上限まで・枠がいっぱいなら入れかえて古いほうを落とす", () => {
  const r = room();
  const { t0, plan } = startTwo(r);
  const [wid, wit] = lootOf(plan, "weapon");
  const [x, y, z] = spawns[wid];
  landAt(r, 1, x, y, z, t0 + 4000);
  landAt(r, 2, x + 1, y, z, t0 + 4000);
  const now = t0 + 70000;
  const out = r.send(1, ["g", wid], now);
  assert.deepEqual(msgs(out, "g")[0].msg, ["g", wid, 1]);
  assert.deepEqual(inv(out, 1)[4][0], [wit.kind, wit.n]);
  assert.equal(msgs(r.send(2, ["g", wid], now + 10), "g").length, 0, "もうない");
  // 遠い
  const [fid] = [...plan.loot].find(([id]) => Math.hypot(spawns[id][0] - x, spawns[id][1] - y) > 10);
  assert.equal(msgs(r.send(1, ["g", fid], now + 20), "g").length, 0);
  // 弾（上限）
  const p1 = r.m.player(1);
  p1.ammo.light = R.AMMO_CAP.light - 5;
  const [aid] = [...plan.loot].find(([, it]) => it.kind === "light");
  p1.x = spawns[aid][0]; p1.y = spawns[aid][1];
  const ao = r.send(1, ["g", aid], now + 30);
  assert.equal(p1.ammo.light, R.AMMO_CAP.light);
  assert.deepEqual(msgs(ao, "o")[0].msg.slice(0, 4), ["o", aid, "light", R.AMMO_PACK.light - 5], "残りはその場に残る");
  assert.equal(inv(r.send(1, ["g", aid], now + 40), 1)[5][0], R.AMMO_CAP.light, "上限なら拾えない（持ち物を送り直す）");
  // 枠がいっぱい：手に持っているものと入れかえ
  p1.slots = [{ kind: "pistol", mag: 3, shotAt: 0, reloadAt: 0 }, { kind: "smg", mag: 7, shotAt: 0, reloadAt: 0 }];
  p1.held = 2;
  const [w2] = [...plan.loot].filter(([id, it]) => R.catOf(it.kind) === "weapon" && id !== wid)[0];
  p1.x = spawns[w2][0]; p1.y = spawns[w2][1];
  const so = r.send(1, ["g", w2], now + 50);
  assert.equal(p1.slots[1].kind, plan.loot.get(w2).kind);
  const dropped = msgs(so, "o")[0].msg;
  assert.deepEqual(dropped.slice(2, 4), ["smg", 7]);
  assert.ok(dropped[1] >= DROP_ID0);
});

test("撃つ・当たる：弾倉・連射の速さ・撃った数より多い当たりは受けない・シールドから減る・遠すぎる当たりは捨てる", () => {
  const r = room();
  const { t0 } = startTwo(r);
  landAt(r, 1, 30, 55, 30, t0 + 4000);
  landAt(r, 2, 40, 55, 30, t0 + 4000);
  const now = t0 + 70000;
  const p1 = r.m.player(1), p2 = r.m.player(2);
  p1.slots[0] = { kind: "pistol", mag: 12, shotAt: 0, reloadAt: 0 };
  p2.sh = 30;
  assert.equal(msgs(r.send(1, ["a", 2, 1, 0, 1], now), "d").length, 0, "撃っていなければ当たりは受けない");
  const f = r.send(1, ["f", 1, 2, 90, 90], now);
  assert.equal(p1.slots[0].mag, 10);
  assert.deepEqual(msgs(f, "f")[0].msg, ["f", 1, "pistol", 2, 90, 90]);
  assert.equal(msgs(f, "f")[0].to, "others");
  // 頭 36：シールド 30 が先に受け、残り 6 が HP
  const h = r.send(1, ["a", 2, 1, 1, 1], now + 50);
  assert.deepEqual(msgs(h, "d")[0].msg, ["d", 2, 94, 0, 1, "pistol", 1]);
  assert.equal(p1.damage, 36);
  r.send(1, ["a", 2, 1, 0, 1], now + 60);
  assert.equal(p2.hp, 70);
  assert.equal(msgs(r.send(1, ["a", 2, 1, 0, 1], now + 70), "d").length, 0, "2 発ぶんの当たりはもう使った");
  // 連射の速さ：ためておけるのは 0.5 秒＋2 発まで
  const fx = r.send(1, ["f", 1, 9, 90, 90], now + 100);
  assert.equal(msgs(fx, "f").length, 0);
  assert.equal(inv(fx, 1)[4][0][1], 10, "断ったら持ち物を送り直す");
  // 弾倉より多くは撃てない
  p1.slots[0].mag = 1;
  assert.equal(msgs(r.send(1, ["f", 1, 2, 90, 90], now + 5000), "f").length, 0);
  // 遠すぎる当たり
  p1.slots[0].mag = 12;
  p2.x = 30 + 200;
  r.send(1, ["f", 1, 1, 90, 90], now + 6000);
  assert.equal(msgs(r.send(1, ["a", 2, 1, 0, 1], now + 6010), "d").length, 0, "ハンドブラスターの届く距離 120 m の外");
});

test("アウト：持ち物が落ちる・撃破数・最後の 1 人で終わり・15 秒でロビー", () => {
  const r = room();
  const { t0 } = startTwo(r, [1, 2, 3]);
  for (const [id, x] of [[1, 30], [2, 35], [3, 40]]) landAt(r, id, x, 55, 30, t0 + 4000);
  const now = t0 + 70000;
  const p1 = r.m.player(1), p2 = r.m.player(2), p3 = r.m.player(3);
  p1.slots[0] = { kind: "sniper", mag: 4, shotAt: 0, reloadAt: 0 };
  p2.slots[0] = { kind: "smg", mag: 9, shotAt: 0, reloadAt: 0 };
  p2.heals.tea = 2;
  p2.helmet = false;
  r.send(1, ["f", 1, 1, 0, 90], now);
  const k = r.send(1, ["a", 2, 1, 1, 1], now + 10);
  const kill = msgs(k, "k")[0].msg;
  assert.deepEqual(kill, ["k", 2, 1, "sniper", 3, 2]);
  assert.equal(p1.kills, 1);
  const drops = msgs(k, "o").map((e) => e.msg[2]).sort();
  assert.deepEqual(drops, ["smg", "tea"]);
  assert.equal(r.m.phase(), "play");
  // 3 人目が出る（切断）→ 1 人残って終わり
  const end = r.leave(3, now + 1000);
  assert.deepEqual(msgs(end, "k")[0].msg.slice(0, 5), ["k", 3, 0, "leave", 2]);
  const fin = msgs(end, "m")[0].msg;
  assert.equal(fin[1], "end");
  assert.equal(fin[2], 1);
  assert.deepEqual(fin[3].map((row) => row.slice(0, 3)), [[1, 1, 1], [3, 2, 0], [2, 3, 0]]);
  assert.equal(r.m.phase(), "end");
  r.tick(now + 1000 + R.MATCH.end * 1000);
  assert.equal(r.m.phase(), "lobby");
  assert.equal(r.m.has(3), false, "出た人は結果のあとで消える");
  assert.equal(p1.ready, false);
  // 2 試合目も始められる（1 試合目でアウトになった 2 も部屋にいる）
  r.join(4, now + 20000);
  for (const id of [1, 2, 4]) r.send(id, ["r", 1], now + 20000);
  r.tick(now + 20000 + R.MATCH.countdown * 1000);
  assert.equal(r.m.phase(), "play");
  assert.deepEqual(r.m.roster, [1, 2, 4]);
  assert.equal(r.m.player(2).alive, true);
});

test("円の外：シールドを無視して減り続け、最後はアウト", () => {
  const r = room();
  const { t0, plan } = startTwo(r);
  landAt(r, 1, 30, 55, 30, t0 + 4000);
  landAt(r, 2, 31, 55, 30, t0 + 4000);
  const p2 = r.m.player(2);
  p2.sh = 100;
  // 2 人目を作り込んだ範囲の外へ
  const z1 = plan.zones[1];
  const tOut = t0 + z1.start * 1000 + 1000;
  p2.x = R.PLAY_RECT[2] + 30;
  p2.zoneAt = tOut - 1000;
  const o = r.tick(tOut);
  assert.deepEqual(msgs(o, "d")[0].msg, ["d", 2, 100 - z1.dps, 100, 0, "zone", 0]);
  let t = tOut;
  while (r.m.phase() === "play" && t < tOut + 200000) { t += 1000; r.tick(t); }
  assert.equal(p2.alive, false);
  assert.equal(r.m.phase(), "end");
  assert.equal(msgs(r.log, "m").pop().msg[2], 1);
});

test("回復・リロード：早すぎる知らせは断る", () => {
  const r = room();
  const { t0 } = startTwo(r);
  landAt(r, 1, 30, 55, 30, t0 + 4000);
  landAt(r, 2, 31, 55, 30, t0 + 4000);
  const now = t0 + 70000;
  const p1 = r.m.player(1);
  p1.hp = 50;
  p1.heals.tea = 1;
  r.send(1, ["u", "tea", 0], now);
  const early = r.send(1, ["u", "tea", 1], now + 1000);
  assert.equal(p1.hp, 50);
  assert.ok(inv(early, 1));
  r.send(1, ["u", "tea", 0], now + 2000);
  r.send(1, ["u", "tea", 1], now + 2000 + R.HEALS.tea.time * 1000);
  assert.equal(p1.hp, 75);
  assert.equal(p1.heals.tea, 0);
  // 撃つと回復は取り消し
  p1.heals.bento = 1;
  p1.slots[0] = { kind: "ar", mag: 0, shotAt: 0, reloadAt: 0 };
  p1.ammo.medium = 40;
  // リロード：撃ってから 2.2 秒たっていなければ断る
  p1.slots[0].mag = 5;
  r.send(1, ["f", 1, 1, 0, 90], now + 10000);
  r.send(1, ["l", 1], now + 11000);
  assert.equal(p1.slots[0].mag, 4);
  r.send(1, ["l", 1], now + 10000 + R.WEAPONS.ar.reload * 1000);
  assert.equal(p1.slots[0].mag, 25);
  assert.equal(p1.ammo.medium, 40 - 21);
  r.send(1, ["u", "bento", 0], now + 20000);
  r.send(1, ["f", 1, 1, 0, 90], now + 20500);
  r.send(1, ["u", "bento", 1], now + 20000 + R.HEALS.bento.time * 1000);
  assert.equal(p1.heals.bento, 1, "撃ったので取り消し");
});

test("捨てる：その場に落ち、持ち物から消える", () => {
  const r = room();
  const { t0 } = startTwo(r);
  landAt(r, 1, 30, 55, 30, t0 + 4000);
  landAt(r, 2, 31, 55, 30, t0 + 4000);
  const p1 = r.m.player(1);
  p1.slots[1] = { kind: "shotgun", mag: 2, shotAt: 0, reloadAt: 0 };
  p1.held = 2;
  const o = r.send(1, ["o", "shotgun"], t0 + 70000);
  assert.deepEqual(msgs(o, "o")[0].msg.slice(2, 4), ["shotgun", 2]);
  assert.equal(p1.slots[1], null);
  assert.equal(p1.held, 0);
});

test("ひとこと：試合中に生きている人には届かない（観戦している人どうしだけ）", () => {
  const r = room();
  for (const id of [1, 2, 3, 4]) r.join(id);
  r.send(1, ["r", 1], 0);
  r.send(2, ["r", 1], 0);
  r.tick(R.MATCH.readyWait * 1000);
  r.tick((R.MATCH.readyWait + R.MATCH.countdown) * 1000);
  assert.equal(r.m.phase(), "play");
  const now = (R.MATCH.readyWait + R.MATCH.countdown) * 1000 + 5000;
  assert.equal(r.send(1, ["s", 2], now).length, 0, "参加している人は言えない");
  assert.deepEqual(r.send(3, ["s", 2], now)[0], { to: [4], from: 0, msg: ["s", 3, 2] });
  r.leave(2, now + 10);
  assert.equal(r.m.phase(), "end");
  assert.equal(r.send(3, ["e", 1], now + 20)[0].to, "others", "試合が終われば全員へ");
});

test("練習：1 人で始まり、的が出て、的を全部アウトにすると勝ち", () => {
  const r = room({ practice: true });
  r.join(1);
  r.send(1, ["r", 1], 0);
  assert.equal(r.m.phase(), "countdown");
  r.tick(R.MATCH.practiceCountdown * 1000);
  assert.equal(r.m.phase(), "play");
  const roster = r.m.roster;
  assert.equal(roster.length, 1 + R.MATCH.practiceDummies);
  assert.equal(msgs(r.log, "j").filter((e) => e.msg[1] >= DUMMY_ID0).length, R.MATCH.practiceDummies);
  assert.equal(msgs(r.log, "p").filter((e) => e.msg[1] >= DUMMY_ID0).length, R.MATCH.practiceDummies);
  const t0 = r.m.t0;
  const p1 = r.m.player(1);
  r.send(1, ["d"], t0 + 4000);
  p1.slots[0] = { kind: "sniper", mag: 4, shotAt: 0, reloadAt: 0 };
  let now = t0 + 60000;
  for (const id of roster.slice(1)) {
    const d = r.m.player(id);
    r.send(1, ["p", d.x + 1, d.y, d.z, 0, 0], now);
    p1.slots[0].mag = 4;
    r.send(1, ["f", 1, 1, 0, 90], now + 10);
    r.send(1, ["a", id, 1, 1, 1], now + 20);
    assert.equal(d.alive, false, `的 ${id}`);
    now += 3000;
  }
  assert.equal(r.m.phase(), "end");
  assert.equal(msgs(r.log, "m").pop().msg[2], 1);
  r.tick(now + R.MATCH.end * 1000);
  assert.equal(r.m.phase(), "lobby");
  assert.equal(msgs(r.log, "l").filter((e) => e.msg[1] >= DUMMY_ID0).length, R.MATCH.practiceDummies, "的はロビーで消える");
});

test("練習：的の足もとの物資は、はじめから拾われた扱い（拾えない・見えない）", () => {
  // 30 m の格子：中心の近くの点はほとんど物資があるので、的が物資の点にも立つ
  const sparse = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) sparse.push([30 + i * 30, 55 + j * 30, 30, R.SPOT.open]);
  const r = room({ practice: true, spawns: sparse });
  r.join(1);
  r.send(1, ["r", 1], 0);
  r.tick(R.MATCH.practiceCountdown * 1000);
  const plan = r.m.plan;
  assert.ok(plan.dummyLoot.length > 0, "的が物資の点に立つ");
  const playAt = r.log.findIndex((e) => e.msg[0] === "m" && e.msg[1] === "play");
  const gone = r.log.slice(playAt).filter((e) => e.msg[0] === "g").map((e) => e.msg[1]);
  assert.deepEqual([...gone].sort((a, b) => a - b), [...plan.dummyLoot].sort((a, b) => a - b), "試合の知らせのあとに拾われた知らせ");
  for (const lid of plan.dummyLoot) assert.ok(r.m.snapshot().taken.includes(lid), "つなぎ直しても見えない");
  const lid = plan.dummyLoot[0], s = sparse[lid];
  r.send(1, ["d"], r.m.t0 + 4000);
  r.send(1, ["p", s[0], s[1], s[2], 0, 0], r.m.t0 + 60000);
  const got = r.send(1, ["g", lid], r.m.t0 + 60010);
  assert.equal(msgs(got, "g").length, 0, "拾えない");
});

test("練習：自分がアウトになれば的が残っていても終わる", () => {
  const r = room({ practice: true });
  r.join(1);
  r.send(1, ["r", 1], 0);
  r.tick(R.MATCH.practiceCountdown * 1000);
  const end = r.leave(1, R.MATCH.practiceCountdown * 1000 + 5000);
  assert.equal(msgs(end, "m")[0].msg[1], "end");
  assert.equal(msgs(end, "m")[0].msg[2], 0);
});
