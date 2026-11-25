// キャンパスロワイヤルの部屋（src/royale.js の RoyaleRoom）を、手元の wrangler dev で確かめる。
// npx wrangler dev --local --port 8799 --var ALLOWED_ORIGINS: を起動して、node test/royale.test.mjs
// 3 人が入る → 全員準備OK → 秒読み → 試合 → 同時に飛び降りる（同じ所）→ A が素手で B・C をアウト → A の優勝 → ロビー
import { versionOf } from "../../campus-sns/campus3dRoyaleRules.js";
import { SPAWNS_VER } from "../../campus-sns/campus3dRoyaleSpawns.js";

const base = process.argv[2] || "ws://localhost:8799";
const VER = versionOf(SPAWNS_VER);
let ok = 0, fail = 0;
const t = (c, m) => { c ? ok++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (room) => new Promise((res, rej) => {
  const ws = new WebSocket(`${base}/royale/${room}`, { headers: { Origin: "http://localhost:3000" } });
  const got = [];
  ws.addEventListener("message", (e) => got.push(JSON.parse(e.data)));
  ws.addEventListener("open", () => res({ ws, got, send: (m) => ws.send(JSON.stringify(m)), find: (k, f = () => true) => got.find((m) => m[0] === k && f(m)) }));
  ws.addEventListener("error", () => rej(new Error("connect failed")));
});
const waitFor = async (c, k, f = () => true, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = c.find(k, f); if (m) return m; await sleep(50); }
  return null;
};

const room = "test-" + Date.now().toString(36);
const A = await open(room), B = await open(room), C = await open(room);
// 版が違うと断って切る
const X = await open(room);
X.send(["j", "古い", "#123456", -1]);
await sleep(300);
t(X.find("x")?.[1] === "ver", `版が違う：${JSON.stringify(X.find("x"))}`);

A.send(["j", "あおい", "#28c868", VER]);
await sleep(200);
B.send(["j", "みどり", "#3d8bfd", VER]);
await sleep(200);
C.send(["j", "<b>あか</b>", "red", VER]);
await sleep(400);
const hA = A.find("h");
t(hA && hA[1] === 1 && hA[3].phase === "lobby", `A が入る：番号 1・ロビー（${JSON.stringify(hA).slice(0, 80)}）`);
const jC = A.find("j", (m) => m[1] === 3);
t(jC && !/[<>]/.test(jC[2]) && jC[3] === "#6870e0", `C の名前は整えて配る（${JSON.stringify(jC)}）`);
// 準備OK（全員そろえばすぐ秒読み）
A.send(["r", 1]); B.send(["r", 1]); C.send(["r", 1]);
const cd = await waitFor(A, "m", (m) => m[1] === "countdown", 3000);
t(!!cd, "全員の準備OKで秒読み");
const play = await waitFor(B, "m", (m) => m[1] === "play", 15000);
t(play && play[5].length === 3, `試合が始まる（ティア ${play?.[4]}・参加 ${play?.[5]}）`);
t(!!(await waitFor(A, "i", () => true, 2000)), "参加者に持ち物（i）が届く");
// 時計合わせ
A.send(["t", 12345]);
const tr = await waitFor(A, "t", (m) => m[1] === 12345, 2000);
t(tr && Math.abs(tr[2] - Date.now()) < 5000, "時計合わせの返事");
// 飛行機から同時に降りる（同じ所に出る）
await sleep(3300);
A.send(["d"]); B.send(["d"]); C.send(["d"]);
await sleep(300);
// 素手で 6 回ずつ（1 回 18、連射は 1 秒 2 回まで）
async function punch(from, to, times) {
  for (let i = 0; i < times; i++) {
    from.send(["f", 0, 1, 0, 90]);
    from.send(["a", to, 0, 0, 1]);
    await sleep(520);
  }
}
await punch(A, 2, 6);
const kB = await waitFor(C, "k", (m) => m[1] === 2, 3000);
t(kB && kB[2] === 1 && kB[3] === "fist" && kB[4] === 3 && kB[5] === 2, `B がアウト（${JSON.stringify(kB)}）`);
const dB = A.got.filter((m) => m[0] === "d" && m[1] === 2);
t(dB.length >= 5 && dB[0][2] === 82, `ダメージは部屋が決める：1 回目で B の HP 82（${dB.length} 回）`);
// アウトの人の位置は配らない
const before = A.got.length;
B.send(["p", 1, 2, 30, 0, 0]);
await sleep(300);
t(!A.got.slice(before).some((m) => m[0] === "p" && m[1] === 2), "アウトの人の位置は配らない");
await punch(A, 3, 6);
const end = await waitFor(B, "m", (m) => m[1] === "end", 4000);
t(end && end[2] === 1 && end[3][0][0] === 1 && end[3][0][1] === 1 && end[3][0][2] === 2, `A の優勝・撃破 2（${JSON.stringify(end)}）`);
const lobby = await waitFor(C, "m", (m) => m[1] === "lobby" || m[1] === "abort", 20000);
t(lobby && lobby[1] === "lobby", `15 秒でロビーへ戻る（アラーム、または眠って起きたとき）：${JSON.stringify(lobby)}`);
// ロビーに戻れば、また準備OKから始められる
B.send(["r", 1]); C.send(["r", 1]); A.send(["r", 1]);
const cd2 = await waitFor(A, "m", (m) => m[1] === "countdown" && m !== cd, 3000);
t(!!cd2, "2 試合目の秒読み");
// 出る
A.ws.close();
await sleep(400);
t(!!B.find("l", (m) => m[1] === 1), "出た人の知らせ");
for (const c of [B, C, X]) try { c.ws.close(); } catch {}
await sleep(200);
console.log(`royale.test ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
