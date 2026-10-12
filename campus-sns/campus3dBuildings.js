// 建物をくぐる道（通り抜け）の穴を、建物にあける。
// 建物を「穴の外側（地面から屋上まで）」と「穴の上（天井の高さから屋上まで）」に分けて、MapLibre の fill-extrusion で描く。
// MapLibre は地形の上で、分けた形それぞれの重心の地面に建物を置くので、屋上がそろうよう高さを足し引きする
import { passageFootprint, toLngLat, toXY } from "./campus3dFeatures.js";

let clipper = null;
const loadClipper = () => (clipper ||= import("polygon-clipping").then((m) => m.default || m));

// 多角形の頂点の平均（MapLibre が重心にするのと同じく、閉じる点を除いた全部の輪の点）→ [lng, lat]
function vertexMean(poly) {
  let x = 0;
  let y = 0;
  let n = 0;
  poly.forEach((ring) => {
    const last = ring.length - 1;
    ring.forEach((p, i) => {
      if (i === last && p[0] === ring[0][0] && p[1] === ring[0][1]) return;
      x += p[0];
      y += p[1];
      n++;
    });
  });
  return toLngLat([x / n, y / n]);
}

const boxOf = (rings) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rings.forEach((r) => r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  return [x0, y0, x1, y1];
};
const overlap = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/**
 * @param buildings  BASEMAP の建物（p: [[lat, lng]...], h: 穴の輪）
 * @param heights    建物ごとの高さ(m)
 * @param passages   通り抜け（normalizeFeature 済み）
 * @param groundAt   ([lng, lat]) => 地面の標高
 * @returns { pieces: Map(建物の番号 → [{ rings: [[lng, lat]...], h, b }]), ceilings: [{ rings, z }] }
 */
export async function cutPassages(buildings, heights, passages, groundAt) {
  const out = { pieces: new Map(), ceilings: [] };
  if (!passages.length) return out;
  const pc = await loadClipper();
  const holes = passages.map((f) => {
    const geom = pc.union(...passageFootprint(f));
    return { f, geom, box: boxOf(geom.flat()) };
  });
  buildings.forEach((b, i) => {
    const B = [b.p, ...(b.h || [])].map((ring) => ring.map(([lat, lng]) => toXY([lng, lat])));
    const box = boxOf(B);
    const hits = holes.filter((h) => overlap(h.box, box));
    if (!hits.length) return;
    const H = heights[i];
    const ref = groundAt(vertexMean(B)); // 元の建物が置かれる地面の高さ
    if (!Number.isFinite(ref)) return;
    let rest = [B];
    const pieces = [];
    const ceilings = [];
    hits.forEach(({ f, geom }) => {
      const inside = pc.intersection(rest, geom);
      if (!inside.length) return;
      rest = pc.difference(rest, geom);
      if (f.height >= H) return; // 屋上より高い穴は、建物を切り通す
      inside.forEach((poly) => {
        const g = groundAt(vertexMean(poly));
        if (!Number.isFinite(g)) return;
        pieces.push({ poly, h: H + ref - g, b: f.height });
        ceilings.push({ poly, z: g + f.height });
      });
    });
    if (!pieces.length && rest.length === 1 && rest[0] === B) return; // 穴がかからなかった
    rest.forEach((poly) => {
      const g = groundAt(vertexMean(poly));
      pieces.push({ poly, h: H + (Number.isFinite(g) ? ref - g : 0), b: 0 });
    });
    const ll = (poly) => poly.map((ring) => ring.map(toLngLat));
    out.pieces.set(i, pieces.map((p) => ({ rings: ll(p.poly), h: p.h, b: p.b })));
    ceilings.forEach((c) => out.ceilings.push({ rings: ll(c.poly), z: c.z }));
  });
  return out;
}
