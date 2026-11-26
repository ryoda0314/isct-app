// 手で足した構造物の形（buildMesh）を作る Web Worker（2026-11-24）。画面の側（CampusMap3D）で作ると、作るあいだ（PC で 7〜17 秒、
// スマホではその数倍）画面が止まった。スマホで歩いて近くの建物が変わるたびにも作り直すので、歩くたびに数秒止まっていた。
// ここでは：
// ・地面の高さ（campusDem）は画面の側と同じタイル（送られてきたもの）と同じ焼き込みで作る（groundAt が同じになる）
// ・できた形は升目ごとに並べかえて（campus3dChunks）、配列ごと渡す（写さない）
// 受け取るもの：{ id, view?（features。変わったときだけ）, inside（中を描く建物の host の並び。null なら全部）, only（inside の建物の中だけを作る。
//   2026-11-26：スマホは近くの建物が変わるたびにキャンパス全体を作り直していた）, demTiles?, burns, opts, bldColors, needClip }
import { buildMesh, setMeshPacking, worldOf } from "./campus3dMesh.js";
import { dem } from "./campusDem.js";
import { chunkTriangles } from "./campus3dChunks.js";
import { toneOf } from "./campus3dSky.js";

setMeshPacking(true);
let view = null;
let clip = null;
// 多角形の重ね合わせ（polygon-clipping）は、起きたらすぐ読み始める（はじめの形を頼まれてから読むと、その分建物が遅れる。2026-11-25）
const clipLoad = import("polygon-clipping").then((m) => (clip = m.default || m), () => null);
const o = worldOf([0, 0]), e = worldOf([1, 0]);
const KXY = Math.hypot(e[0] - o[0], e[1] - o[1]);
const BUCKETS = ["thin", "glass", "screen", "haze", "veil", "cull"];

const buffersOf = (x, out = new Set(), depth = 0) => {
  if (!x || typeof x !== "object" || depth > 10) return out;
  if (ArrayBuffer.isView(x)) { out.add(x.buffer); return out; }
  if (Array.isArray(x)) { for (const v of x) buffersOf(v, out, depth + 1); return out; }
  for (const v of Object.values(x)) buffersOf(v, out, depth + 1);
  return out;
};

self.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    if (data.view) view = data.view;
    if (!view) throw new Error("no features yet");
    if (data.demTiles) for (const [k, a] of data.demTiles) dem.tiles.set(k, a);
    dem.setBurns(data.burns || []);
    if (data.needClip && !clip) await clipLoad;
    if (data.needClip && !clip) clip = await import("polygon-clipping").then((m) => m.default || m);
    const colors = data.bldColors || null;
    const t0 = performance.now();
    // 階はいつも全部入れる（殻の形は階を見て決まる）。どの建物の中を描くかは inside で選ぶ
    const res = buildMesh(view, {
      ...data.opts,
      inside: data.inside ? new Set(data.inside) : null,
      onlyInside: !!data.only,
      groundAt: (ll) => dem.groundAt(ll),
      slopes: dem.slopes,
      terraces: dem.terraces,
      digs: dem.digs,
      clip: data.needClip ? clip : null,
      bldColor: colors ? (f) => colors[f.id] : null,
      // 時刻の色（campus3dSky の lookFor の tone と同じ：look.f の割合で昼・夜の色を混ぜる）
      tone: data.toneF ? (d, n) => toneOf(data.toneF, d, n) : null,
    });
    const t1 = performance.now();
    // 建物の中だけの形（only）は小さく、近くの建物だけなので升目に分けない（全部描く）
    if (data.chunks && !data.only) {
      const ch = (d, inside) => (d?.count ? chunkTriangles(d, [["pos", 3], ["nrm", 3], ["col", 4]], { kxy: KXY, interior: inside || null }) : null);
      res.chunks = ch(res, res.interior?.m);
      for (const k of BUCKETS) if (res[k]) res[k].chunks = ch(res[k], res.interior?.[k]);
    }
    res.timing = { build: Math.round(t1 - t0), chunk: Math.round(performance.now() - t1) };
    self.postMessage({ id, res }, [...buffersOf(res)]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
