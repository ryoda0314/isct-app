// 部屋サーバーの中継のテスト（手元の wrangler dev に 3 つつなぐ）。node test/relay.test.mjs ws://localhost:8799
const base = process.argv[2] || "ws://localhost:8799";
let ok = 0, fail = 0;
const t = (c, m) => { c ? ok++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (room) => new Promise((res, rej) => {
  const ws = new WebSocket(`${base}/room/${room}`);
  const got = [];
  ws.addEventListener("message", (e) => got.push(JSON.parse(e.data)));
  ws.addEventListener("open", () => res({ ws, got, send: (m) => ws.send(JSON.stringify(m)) }));
  ws.addEventListener("error", () => rej(new Error("connect failed")));
});
const room = "test-" + Date.now().toString(36);
const A = await open(room), B = await open(room);
A.send(["j", "あおい", "#28c868"]);
await sleep(300);
t(A.got[0]?.[0] === "h" && A.got[0][1] === 1 && A.got[0][2].length === 0, `A が入る：自分の番号 1、ほかの人 0（${JSON.stringify(A.got[0])}）`);
A.send(["p", 12.345, -6.789, 30.2, 91.4, 1]);
await sleep(200);
t(B.got.length === 0, "まだ入っていない B には何も配らない");
B.send(["j", "<b>ゲスト</b>\u0007とても長い名前のひとですよろしく", "red"]);
await sleep(300);
const hB = B.got.find((m) => m[0] === "h");
t(hB && hB[1] === 2 && hB[2].length === 1 && hB[2][0][1] === "あおい" && hB[2][0][3] === 12.35 && hB[2][0][6] === 91, `B が入る：A の名前と最後の位置を受ける（${JSON.stringify(hB)}）`);
const jA = A.got.find((m) => m[0] === "j");
t(jA && jA[1] === 2 && !/[<>\u0007]/.test(jA[2]) && jA[2].length <= 16 && jA[3] === "#6870e0", `A に B が入った知らせ：名前は記号を除いて 16 字まで、色は既定（${JSON.stringify(jA)}）`);
B.send(["p", 1, 2, 3, 4, 0]);
B.send(["s", 3]);
B.send(["e", 1]);
B.send(["m", 5, 6, 30]);
await sleep(300);
t(JSON.stringify(A.got.find((m) => m[0] === "p")) === JSON.stringify(["p", 2, 1, 2, 3, 4, 0]), "A が B の位置を受ける");
t(A.got.some((m) => m[0] === "s" && m[1] === 2 && m[2] === 3) && A.got.some((m) => m[0] === "e" && m[2] === 1) && A.got.some((m) => m[0] === "m" && m[2] === 5), "ひとこと・合図・集合の目印が届く");
t(!B.got.some((m) => m[0] === "p" && m[1] === 2), "自分の位置は自分に返らない");
// 形のちがうもの・大きすぎるものは配らない
const nA = A.got.length;
B.send(["p", "x", 2, 3, 4, 0]);
B.ws.send("x".repeat(300));
B.send({ a: 1 });
await sleep(300);
t(A.got.length === nA && B.got.filter((m) => m[0] === "x" && m[1] === "bad").length === 2, "形のちがう位置・大きすぎる文・配列でない物は配らない");
// 送りすぎ：60 個を一気に送っても、配られるのは 24 個ほどまで
const before = A.got.filter((m) => m[0] === "p").length;
for (let i = 0; i < 60; i++) B.send(["p", i, 0, 0, 0, 0]);
await sleep(600);
const passed = A.got.filter((m) => m[0] === "p").length - before;
t(passed >= 15 && passed <= 30, `送りすぎは抑える（60 個のうち配ったのは ${passed} 個）`);
// 別の部屋には届かない
const C = await open(room + "-b");
C.send(["j", "べつ", "#112233"]);
await sleep(300);
t(C.got.find((m) => m[0] === "h")?.[2].length === 0 && !A.got.some((m) => m[0] === "j" && m[2] === "べつ"), "別の部屋とは混ざらない");
// 出たら知らせる
B.ws.close();
await sleep(500);
t(A.got.some((m) => m[0] === "l" && m[1] === 2), "B が出たら A に知らせる");
A.ws.close(); C.ws.close();
console.log(`relay.test ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
