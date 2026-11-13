// 大岡山駅のホームドアの戸（2026-11-11、ユーザー「駅の中も含めて作ってほしい。すでに走ってる電車も併せて、うまく組み合うように」）：
// buildMesh が集めた戸の口（res.psd：{ a, b（口の両端。平面 m）, z0, z1, n, style（"mg" / "om"）, track（線路 track の id） }）を、
// その線路に止まって扉を開けている電車（campus3dTrains の trainsAt の open）に合わせて開く。電車の車体の長さの中にある口だけ開く
// （5 両の電車なら 6 両目より先の口は閉じたまま）。形は campus3dInterior の psdLeaves、描くのは campus3dLayer の createDoorsLayer
import { psdLeaves } from "./campus3dInterior.js";
import { Mesh } from "./campus3dMesh.js";
import { projectOnRoute, trainLength } from "./campus3dTrains.js";

export const PSD_LAYER_ID = "cb-psd";

/**
 * 戸の口ごとに、その線路を走る電車の路線（prep.routes の番号 ri）と線の上の距離 s（口のまん中）。tracks は構造物の track の並び
 * @returns [{ d（口）, on: [{ ri, s }] }]
 */
export function preparePsd(list, prep, tracks) {
  const byId = new Map((tracks || []).map((t) => [t.id, t]));
  return (list || []).map((d) => {
    const t = d.track ? byId.get(d.track) : null;
    if (!t || !prep) return { d, on: [] };
    const c = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
    const on = (t.routes || [])
      .map((key) => {
        const ri = prep.routes.findIndex((r) => r.key === key);
        if (ri < 0) return null;
        const pr = projectOnRoute(prep.routes[ri], c);
        return pr.d < 6 ? { ri, s: pr.s } : null;
      })
      .filter(Boolean);
    return { d, on };
  });
}

// いまの戸の開き具合（0〜1）：その線路に止まって扉を開けている電車の車体の長さの中に口のまん中があれば、電車の扉と同じ
export function psdOpen(P, trains) {
  return P.map(({ on }) => {
    let o = 0;
    if (!on.length) return 0;
    for (const t of trains || []) {
      if (!(t.open > 0)) continue;
      const half = trainLength(t.cars, t.carLen) / 2 - 0.3;
      for (const q of on) if (q.ri === t.route && Math.abs(q.s - t.s) < half) o = Math.max(o, t.open);
    }
    return o;
  });
}

// 戸の形：{ solid, glass }（Mesh の result。光を受けない色）
export function psdMesh(P, open) {
  const solid = new Mesh();
  const glass = new Mesh();
  P.forEach(({ d }, i) => psdLeaves(solid, glass, d, open[i] || 0));
  return { solid: solid.result(), glass: glass.result() };
}
