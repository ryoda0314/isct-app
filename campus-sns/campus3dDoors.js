// 自動ドア（2026-11-09、ユーザー「自動ドアにしてほしい」）：buildMesh が集めた扉の口（doors）に、ガラスの引き戸の板（枠とガラス）を
// 開き具合（open：0 閉じ 〜 1 開き）ごとに作る。歩く人が DOOR_TRIGGER m まで近づくと開き、離れると閉じる（CampusMap3D の walkTick が
// stepDoors で開き具合を進め、campus3dLayer の createDoorsLayer が毎フレーム doorLeaves の形を描く）。歩く当たりは扉の口のまま（通れる）。
// 扉の口 door：{ a, b（口の両端。平面 m）, z0, z1（板の下・上の標高）, n（壁の外向き [x, y]）, off（板を置く面の、壁の線からの出 m）,
//   kind（"bi" 両引き＝2 枚が両わきへ / "single" 片引き＝1 枚が a の側へ）, side（あれば、口の両わきの side m ははめ殺しのガラス。
//   板はまん中だけで、開くとはめ殺しの裏（off の側）へ引く） }
import { Mesh } from "./campus3dMesh.js";

export const DOOR_TRIGGER = 2.5; // この距離（水平 m）まで近づくと開く
const OPEN_S = 0.6; // 開くのにかかる秒
const CLOSE_S = 1.2; // 閉じるのにかかる秒
const STILE = 0.055; // 板の枠の幅
const LEAF_T = 0.04; // 板の厚さ
export const DOOR_FRAME = [0.74, 0.76, 0.78, 1]; // 枠（アルミ）
export const DOOR_GLASS = [0.8, 0.88, 0.92, 1]; // ガラス（レイヤーで半透明に重ねる）

// 開き具合を dt 秒すすめる。who（歩く人の足もと { x, y, z }。歩いていなければ null）の近くの扉は開く。動いている扉があれば true
export function stepDoors(doors, open, who, dt) {
  let moving = false;
  doors.forEach((d, i) => {
    const cx = (d.a[0] + d.b[0]) / 2;
    const cy = (d.a[1] + d.b[1]) / 2;
    const near = !!who && Math.hypot(who.x - cx, who.y - cy) < DOOR_TRIGGER && who.z > d.z0 - 1.5 && who.z < d.z1;
    const target = near ? 1 : 0;
    const v = open[i] || 0;
    if (Math.abs(target - v) < 1e-4) {
      open[i] = target;
      return;
    }
    moving = true;
    open[i] = target > v ? Math.min(1, v + dt / OPEN_S) : Math.max(0, v - dt / CLOSE_S);
  });
  return moving;
}

// 開き具合のなめらかな動き（はじめと終わりがゆっくり）
const ease = (t) => t * t * (3 - 2 * t);

// 扉の板：{ solid（枠）, glass（ガラス） }（Mesh の result）
export function doorLeaves(doors, open) {
  const solid = new Mesh();
  const glass = new Mesh();
  doors.forEach((d, i) => {
    const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    if (L < 0.2) return;
    const u = [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L];
    const n = d.n;
    let off = d.off ?? 0.05; // はめ殺しを描くあいだだけ壁の線の側へずらす
    const f = ease(Math.min(1, Math.max(0, open[i] || 0)));
    // 板（s0〜s1。辺の上の a からの長さ）を、面から off 出したところに
    const at = (s, dd) => [d.a[0] + u[0] * s + n[0] * (off + dd), d.a[1] + u[1] * s + n[1] * (off + dd)];
    const leaf = (s0, s1) => {
      const z0 = d.z0, z1 = d.z1;
      // ガラス（両面。枠の内）
      const A = at(s0 + STILE, 0), B = at(s1 - STILE, 0);
      glass.quad([[A, z0 + STILE], [B, z0 + STILE], [B, z1 - STILE], [A, z1 - STILE]], [n[0], n[1], 0], DOOR_GLASS);
      // 枠：両わきの縦の枠・上と下の横の枠（厚さ LEAF_T の角材）
      const beam = (sa, sb, za, zb) => {
        const p = [at(sa, -LEAF_T / 2), at(sb, -LEAF_T / 2), at(sb, LEAF_T / 2), at(sa, LEAF_T / 2)];
        solid.quad([[p[3], za], [p[2], za], [p[2], zb], [p[3], zb]], [n[0], n[1], 0], DOOR_FRAME);
        solid.quad([[p[1], za], [p[0], za], [p[0], zb], [p[1], zb]], [-n[0], -n[1], 0], DOOR_FRAME);
        solid.quad([[p[0], zb], [p[1], zb], [p[2], zb], [p[3], zb]], [0, 0, 1], DOOR_FRAME);
        solid.quad([[p[0], za], [p[3], za], [p[2], za], [p[1], za]], [0, 0, -1], DOOR_FRAME);
        solid.quad([[p[0], za], [p[3], za], [p[3], zb], [p[0], zb]], [-u[0], -u[1], 0], DOOR_FRAME);
        solid.quad([[p[2], za], [p[1], za], [p[1], zb], [p[2], zb]], [u[0], u[1], 0], DOOR_FRAME);
      };
      beam(s0, s0 + STILE, z0, z1);
      beam(s1 - STILE, s1, z0, z1);
      beam(s0 + STILE, s1 - STILE, z0, z0 + STILE * 1.6);
      beam(s0 + STILE, s1 - STILE, z1 - STILE, z1);
    };
    // はめ殺し（side）：板より外（壁の線の側）に、板と同じ枠とガラス。板はその裏を通る
    const sd = Math.min(Math.max(0, d.side || 0), L / 3);
    if (sd > 0) {
      const fixed = (s0, s1) => {
        const keep = off;
        off = keep + LEAF_T + 0.012;
        leaf(s0, s1);
        off = keep;
      };
      fixed(0, sd);
      fixed(L - sd, L);
    }
    const o0 = sd, Lo = L - 2 * sd;
    if (d.kind === "single") {
      const sh = f * Lo;
      leaf(o0 - sh, o0 + Lo - sh);
    } else {
      const sh = (f * Lo) / 2;
      leaf(o0 - sh, o0 + Lo / 2 - sh);
      leaf(o0 + Lo / 2 + sh, o0 + Lo + sh);
    }
  });
  return { solid: solid.result(), glass: glass.result() };
}
