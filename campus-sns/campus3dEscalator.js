// エスカレーターの段（2026-11-12、ユーザー「エスカレーターは動かさないと」）：buildMesh が集めたエスカレーター（res.esc：{ e（階の escalators の 1 つ）,
// zf（階の床の標高） }）の段を、時刻に合わせて動かして描く。動かない部分（欄干・手すり・くし・床の板）は campus3dInterior の addEscalator が
// 階といっしょに描く。段の形は addEscalatorSteps（段の角の線に沿って 0.406m おき、上りは上へ・下りは下へ 0.5m/s）。
// 歩く人を運ぶのは campus3dWalk（walkWorld の beltAt・stepBody）。描くのは campus3dLayer の createDoorsLayer（自動ドアと同じ）
import { addEscalatorSteps, escalatorGeom } from "./campus3dInterior.js";
import { Mesh } from "./campus3dMesh.js";

export const ESC_LAYER_ID = "cb-esc";

// 形の準備（段の角の線の表は addEscalatorSteps が初めに作って G に残す）
export function prepareEscalators(list) {
  return (list || []).map(({ e, zf }) => escalatorGeom(e, zf));
}

// 時刻 t（秒）の段：{ solid, glass }（Mesh の result。光を受けない色）
export function escalatorMesh(geoms, t) {
  const solid = new Mesh();
  for (const G of geoms) addEscalatorSteps(solid, G, t);
  return { solid: solid.result(), glass: new Mesh().result() };
}
