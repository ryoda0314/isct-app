// バーチャルキャンパスのほかの人の形（campus3dVehicleMesh.js の peopleMeshes）。node scripts/test-campus-people.mjs
import { Out, peopleMeshes } from "../campus-sns/campus3dVehicleMesh.js";
let ok = 0, fail = 0;
const t = (c, m) => { c ? ok++ : fail++; console.log(c ? "ok  " : "FAIL", m); };
const one = (q, now = 1000) => peopleMeshes([{ id: 1, x: 10, y: 20, z: 30, yaw: 90, st: 0, speed: 0, col: "#28c868", ...q }], { now });
const A = one({});
t(A.solid.count > 300 && A.solid.count % 3 === 0 && A.glass.count === 0 && A.glow.count === 0, `1 人ぶんの形（頂点 ${A.solid.count}）`);
const zs = []; for (let i = 2; i < A.solid.pos.length; i += 3) zs.push(A.solid.pos[i]);
t(Math.abs(Math.min(...zs) - 30) < 0.08 && Math.max(...zs) > 31.6 && Math.max(...zs) < 31.85, `足もとは z、頭の上は約 1.7 m（${Math.min(...zs).toFixed(2)}〜${Math.max(...zs).toFixed(2)}）`);
const green = []; for (let i = 0; i < A.solid.col.length; i += 4) if (Math.abs(A.solid.col[i] - 0x28 / 255) < 0.02 && Math.abs(A.solid.col[i + 1] - 0xc8 / 255) < 0.02) green.push(i);
t(green.length > 30, `服はその人の色（${green.length} 頂点）`);
const B = peopleMeshes([{ id: 1, x: 0, y: 0, z: 0, yaw: 0, speed: 0 }, { id: 2, x: 3, y: 0, z: 0, yaw: 0, speed: 0 }, { id: 3, x: NaN, y: 0, z: 0, yaw: 0 }], { now: 0 });
t(B.solid.count === A.solid.count * 2, "2 人で 2 倍、位置のおかしい人は描かない");
const same = (p, q) => p.solid.pos.length === q.solid.pos.length && p.solid.pos.every((v, i) => Math.abs(v - q.solid.pos[i]) < 1e-9);
const snap = (m) => ({ solid: { pos: Float32Array.from(m.solid.pos) } });
const still1 = snap(one({ speed: 0 }, 1000)), still2 = snap(one({ speed: 0 }, 1400));
t(same(still1, still2), "止まっている人は動かない");
const w1 = snap(one({ speed: 1.3 }, 1000)), w2 = snap(one({ speed: 1.3 }, 1150));
t(!same(w1, w2), "歩いている人は手足が動く");
const sit = one({ st: 2 }); const zs2 = []; for (let i = 2; i < sit.solid.pos.length; i += 3) zs2.push(sit.solid.pos[i]);
t(Math.max(...zs2) < Math.max(...zs) - 0.3, `座ると頭が下がる（${Math.max(...zs2).toFixed(2)}）`);
const wave = snap(one({ emote: 0, emoteAt: 900 }, 1000));
t(!same(wave, still1), "手を振る合図で形が変わる");
const hop = one({ emote: 1, emoteAt: 750 }, 1000); const zs3 = []; for (let i = 2; i < hop.solid.pos.length; i += 3) zs3.push(hop.solid.pos[i]);
t(Math.min(...zs3) > 30.2, `跳ねる合図で体が上がる（足もと ${Math.min(...zs3).toFixed(2)}）`);
// キャンパスロワイヤル：手に持つ装備・落下・パラシュート・書き出し先
const held = one({ hold: "ar" });
t(held.solid.count > A.solid.count + 100, `ブラスターを持つと形が増える（${held.solid.count}）`);
// 試合中の人（hold がある）は背中にバッグ。素手・知らない装備ではブラスターを描かない
const fistN = one({ hold: "fist" }).solid.count;
t(fistN === one({ hold: "nothing" }).solid.count && fistN > A.solid.count && fistN < held.solid.count, `素手・知らない装備は持たない（${A.solid.count} → バッグつき ${fistN} → ブラスターつき ${held.solid.count}）`);
// 遠い人（30 m より遠い）は軽い形
const far = peopleMeshes([{ id: 1, x: 100, y: 0, z: 30, yaw: 0, st: 0, speed: 0, col: "#28c868" }], { now: 1000, viewer: { x: 0, y: 0 } });
t(far.solid.count < A.solid.count / 2, `遠い人は軽い形（頂点 ${far.solid.count}）`);
const fall = one({ st: 8 }); const fz = []; for (let i = 2; i < fall.solid.pos.length; i += 3) fz.push(fall.solid.pos[i]);
t(Math.max(...fz) - Math.min(...fz) < 0.9, `落下は腹ばい（高さの幅 ${(Math.max(...fz) - Math.min(...fz)).toFixed(2)} m）`);
const chute = one({ st: 9 }); const cz = []; for (let i = 2; i < chute.solid.pos.length; i += 3) cz.push(chute.solid.pos[i]);
t(Math.max(...cz) > 35 && chute.solid.count > A.solid.count + 200, `パラシュートは頭の上に傘（上の端 ${Math.max(...cz).toFixed(1)}）`);
const POOL = { solid: new Out(), glass: new Out(), screen: new Out() };
const before = Float32Array.from(one({}).solid.pos);
const mine = peopleMeshes([{ id: 9, x: 100, y: 100, z: 40, yaw: 0, st: 9, speed: 0, col: "#ff0000" }], { now: 1000, pool: POOL });
const again = one({});
t(mine.solid.count !== again.solid.count && again.solid.pos.every((v, i) => v === before[i]), "別の書き出し先は、ほかの人の形を上書きしない");
console.log(`test-campus-people ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
