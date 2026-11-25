// キャンパスロワイヤルの形（campus3dLayer の createVehiclesLayer へ渡す群。docs/campus-royale-spec.md の 7.4 章）。
// - 物資（loot）：中身が変わったとき・歩く人が遠くへ動いたときだけ作り直す（版を上げる。同じ版なら GPU へ送らない）。近くの物資の脈打つ輪は毎フレーム
// - 円の壁（zone）：縞が上へ流れる（呼ぶ側が 1 秒に 15 回だけ作り直す）
// - 光の線・撃った瞬間の光・当たった火花・壁の火花・アウトの破片・着地の砂ぼこり（fx）、降下中の自分の体（self）、飛行機（plane）：毎フレーム
// 書き出しは campus3dVehicleMesh と同じ（Out・emit・poseOf）。それぞれ別の入れ物に書くので、ほかの層の形を上書きしない。
// 色のアルファ：1 ふつう、0.5 自分で光る、0.4 未満は半透明（screen の群へ）
import { GlowMesh } from "./campus3dMesh.js";
import { Out, emit, peopleMeshes, poseOf, vehicleMeshes, worldPt } from "./campus3dVehicleMesh.js";
import { ID, Part, box, rgb, rotAxis, tube } from "./campus3dVehicleGeometry.js";
import * as Models from "./campus3dRoyaleModels.js";
import { catOf } from "./campus3dRoyaleRules.js";

const pool = () => ({ solid: new Out(), glass: new Out(), screen: new Out() });
const P_LOOT = pool(), P_PULSE = pool(), P_ZONE = pool(), P_FX = pool(), P_SELF = pool(), P_PLANE = pool();
const reset = (P) => { P.solid.n = P.glass.n = P.screen.n = 0; };
const res = (P) => ({ solid: P.solid.result(), glass: P.glass.result(), screen: P.screen.result() });
const yawOf = (id) => (Math.imul((id | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 360; // 物資ごとに決まった向き
const hash = (n) => { let t = (n | 0) + 0x6d2b79f5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex3 = (h) => { const c = rgb(/^#[0-9a-fA-F]{6}$/.test(h || "") ? h : "#ffffff"); return [c[0], c[1], c[2]]; };
const litOf = (c, k = 1.15, add = 0.1) => [Math.min(1, c[0] * k + add), Math.min(1, c[1] * k + add), Math.min(1, c[2] * k + add), 0.5];
const fadeOf = (c, a) => [c[0], c[1], c[2], Math.max(0, Math.min(0.38, a))];

/** 物資。items は [{ id, kind, x, y, z }] */
export function lootMesh(items) {
  reset(P_LOOT);
  for (const it of items) {
    const cat = catOf(it.kind);
    if (!cat || !Number.isFinite(it.z)) continue;
    const m = Models.lootModel(it.kind, cat);
    const pose = poseOf(it.x, it.y, it.z, yawOf(it.id));
    emit(P_LOOT.solid, m.solid, ID, pose);
    emit(P_LOOT.screen, m.screen, ID, pose);
  }
  return res(P_LOOT);
}

/** 近くの物資の足もとで脈打つ輪（種類の色。毎フレーム） */
export function lootPulseMesh(items, now) {
  reset(P_PULSE);
  for (const it of items) {
    const cat = catOf(it.kind);
    if (!cat || !Number.isFinite(it.z)) continue;
    const c = hex3(Models.CAT_COL?.[cat] || "#ffffff");
    const k = ((now / 1300 + hash(it.id) ) % 1);
    const r0 = 0.35 + k * 0.55, a = 0.32 * (1 - k);
    const P = new Part();
    const N = 20;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const p = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r, 0.04];
      P.quad(p(a0, r0), p(a1, r0), p(a1, r0 + 0.035), p(a0, r0 + 0.035), fadeOf(c, a), null, [0, 0, 1]);
    }
    emit(P_PULSE.screen, P.freeze(), ID, poseOf(it.x, it.y, it.z, 90));
  }
  return res(P_PULSE);
}

/** 円の壁。z は zoneAt の結果、zLo・zHi は壁の下と上の標高、phase は秒（縞が上へ流れる） */
export function zoneMesh(z, zLo = 5, zHi = 175, phase = 0) {
  reset(P_ZONE);
  if (!(z.r > 0.5)) return res(P_ZONE);
  const P = new Part();
  const wall = rgb("#3f8fff", 0.11), band = rgb("#8cc4ff", 0.3), base = rgb("#cfe6ff", 0.36), tick = rgb("#7ab8ff", 0.2);
  const N = Math.min(140, Math.max(56, Math.round(z.r / 5)));
  const off = (phase * 4.5) % 9; // 縞が 1 秒に 4.5 m 上へ
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const p0 = [Math.cos(a0) * z.r, Math.sin(a0) * z.r], p1 = [Math.cos(a1) * z.r, Math.sin(a1) * z.r];
    const nrm = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0];
    const q = (p, h) => [p[0], p[1], h];
    P.quad(q(p0, zLo), q(p1, zLo), q(p1, zHi), q(p0, zHi), wall, null, nrm);
    // 下のほうは少し濃い帯（地面との境目が分かるように）
    P.quad(q(p0, zLo), q(p1, zLo), q(p1, zLo + 22), q(p0, zLo + 22), wall, null, nrm);
    for (let h = zLo + off; h < zHi; h += 9) P.quad(q(p0, h), q(p1, h), q(p1, h + 0.35), q(p0, h + 0.35), band, null, nrm);
    if (i % 2 === 0) P.quad(q(p0, zLo), q([p0[0] + (p1[0] - p0[0]) * 0.06, p0[1] + (p1[1] - p0[1]) * 0.06], zLo), q([p0[0] + (p1[0] - p0[0]) * 0.06, p0[1] + (p1[1] - p0[1]) * 0.06], zHi), q(p0, zHi), tick, null, nrm);
  }
  // 地面の近くの明るい線（足もとの境目）：地面の高さはまちまちなので、低いところから数本
  for (let k = 0; k < 4; k++) {
    const h = zLo + 18 + k * 7;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const p0 = [Math.cos(a0) * z.r, Math.sin(a0) * z.r], p1 = [Math.cos(a1) * z.r, Math.sin(a1) * z.r];
      P.quad([p0[0], p0[1], h], [p1[0], p1[1], h], [p1[0], p1[1], h + 0.12], [p0[0], p0[1], h + 0.12], base, null, [0, 0, 1]);
    }
  }
  P.freeze();
  emit(P_ZONE.screen, P, ID, poseOf(z.x, z.y, 0, 90)); // 向き 90：ローカルの x が東・y が北
  return res(P_ZONE);
}

// 線分（a → b）を、まわりの方向に放射状の小さな板で（火花・破片）
function spark(P, a, b, w, col) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  if (L < 1e-4) return;
  tube(P, a, b, w, col, 3);
}

/**
 * 効果。fx は [{ kind, a, b（[x, y, z]）, d（向き）, col（装備の id か "#rrggbb"）, t0, dur, seed }]
 * kind：tracer 光の線・flash 撃った瞬間（ほかの人）・hitspark 人に当たった・impact 壁に当たった・burst アウトの破片・dust 着地の砂ぼこり
 */
export function fxMesh(fx, now) {
  reset(P_FX);
  const glow = new GlowMesh();
  if (!fx.length) return { ...res(P_FX), glow: glow.result() };
  const o = fx[0].a;
  const pose = poseOf(o[0], o[1], o[2], 90);
  const L = (p) => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const S = new Part(), T = new Part();
  for (const e of fx) {
    const k = (now - e.t0) / e.dur;
    if (k < 0 || k > 1) continue;
    const c = hex3(Models.TRACER?.[e.col] || e.col);
    if (e.kind === "tracer") {
      // 芯（細く明るい）と、まわりのにじみ（半透明）。弾は先へ進み、尾が短くなって消える
      const k1 = Math.min(1, k * 2.2), k0 = Math.max(0, k * 2.2 - 0.55);
      const a = e.a.map((v, i) => v + (e.b[i] - v) * k0), b = e.a.map((v, i) => v + (e.b[i] - v) * k1);
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 0.05) {
        tube(S, L(a), L(b), 0.0075, litOf(c, 1.2, 0.25), 4);
        tube(T, L(a), L(b), 0.03, fadeOf(c, 0.22 * (1 - k)), 5);
      }
    } else if (e.kind === "flash") {
      const s = 0.05 * (1 - k) + 0.012;
      box(S, L(e.a), [s, s, s], litOf(c));
      glow.sprite(worldPt(pose, ID, L(e.a)), 0.16 * (1 - k) + 0.05, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], 1, 0.02);
    } else if (e.kind === "hitspark" || e.kind === "impact") {
      // 火花：決まった乱数で 6〜9 本、外へ飛んで落ちる。壁は小さな光も
      // 火花は細い筋（速さの向きに伸びる）。人に当たったときは少なく短い
      const n = e.kind === "impact" ? 7 : 5;
      const back = e.d ? e.d.map((v) => -v) : [0, 0, 1];
      const hot = litOf([Math.min(1, c[0] * 0.6 + 0.45), Math.min(1, c[1] * 0.6 + 0.4), Math.min(1, c[2] * 0.5 + 0.3)], 1.05, 0.08);
      for (let i = 0; i < n; i++) {
        const r1 = hash((e.seed | 0) * 31 + i), r2 = hash((e.seed | 0) * 17 + i * 7), r3 = hash((e.seed | 0) * 13 + i * 3);
        const dir = [back[0] * 0.9 + (r1 - 0.5) * 1.2, back[1] * 0.9 + (r2 - 0.5) * 1.2, back[2] * 0.9 + r3 * 0.9];
        const sp = (e.kind === "impact" ? 4.2 : 3.0) * (0.55 + r3);
        const tt = k * (e.dur / 1000);
        const pos = (t) => [e.b[0] + dir[0] * sp * t, e.b[1] + dir[1] * sp * t, e.b[2] + dir[2] * sp * t - 4.9 * t * t];
        spark(S, L(pos(Math.max(0, tt - 0.045))), L(pos(tt)), 0.0035 * (1 - k) + 0.0012, hot);
      }
      if (k < 0.35) glow.sprite(worldPt(pose, ID, L(e.b)), (e.kind === "impact" ? 0.22 : 0.16) * (1 - k / 0.35), [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 1, 0.03);
      if (e.kind === "impact" && k < 0.6) {
        // 当たった所の小さな焦げ（壁の面の向きは分からないので、弾の向きに向けた小さな板）
        const sz = 0.07;
        box(T, L(e.b), [sz, sz, sz], fadeOf([0.08, 0.08, 0.09], 0.35 * (1 - k / 0.6)));
      }
    } else if (e.kind === "burst") {
      // アウト：その人の色の小さなかけらが、ふわっと上へ散って消える。足もとに広がる輪
      const t = k * (e.dur / 1000);
      for (let i = 0; i < 34; i++) {
        const r1 = hash((e.seed | 0) * 97 + i), r2 = hash((e.seed | 0) * 53 + i * 5), r3 = hash((e.seed | 0) * 29 + i * 11);
        const ang = r1 * Math.PI * 2, out = 0.5 + r2 * 2.0;
        const p = [e.a[0] + Math.cos(ang) * out * t, e.a[1] + Math.sin(ang) * out * t, e.a[2] + 0.25 + r3 * 1.5 + (2.2 + r2) * t - 1.2 * t * t];
        const s = (0.12 + r3 * 0.07) * (1 - k * 0.85);
        box(k < 0.55 ? S : T, L(p), [s, s, s], k < 0.55 ? litOf(c, 1.05, 0.12) : fadeOf(c, 0.38 * (1 - k)));
      }
      // その人の色の光の柱（すっと上へ伸びて消える）
      const hgt = 1.5 + k * 4, cw = 0.32 * (1 - k * 0.6);
      for (const [ax, ay] of [[1, 0], [0, 1]]) {
        const a0 = L([e.a[0] - ax * cw, e.a[1] - ay * cw, e.a[2]]), a1 = L([e.a[0] + ax * cw, e.a[1] + ay * cw, e.a[2]]);
        const b1 = [a1[0], a1[1], a1[2] + hgt], b0 = [a0[0], a0[1], a0[2] + hgt];
        T.quad(a0, a1, b1, b0, fadeOf(c, 0.3 * (1 - k)), null, [ay, -ax, 0]);
      }
      const R0 = 0.4 + k * 2.6, N = 28;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        const p = (ang, r) => L([e.a[0] + Math.cos(ang) * r, e.a[1] + Math.sin(ang) * r, e.a[2] + 0.05]);
        T.quad(p(a0, R0), p(a1, R0), p(a1, R0 + 0.12), p(a0, R0 + 0.12), fadeOf(c, 0.34 * (1 - k)), null, [0, 0, 1]);
      }
      if (k < 0.3) glow.sprite(worldPt(pose, ID, L([e.a[0], e.a[1], e.a[2] + 1])), 0.9 * (1 - k / 0.3), [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 2, 0.1);
    } else if (e.kind === "dust") {
      // 着地：足もとに砂ぼこりの輪
      const N = 16, R0 = 0.3 + k * 1.6;
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 + hash(i) * 0.3;
        const p = L([e.a[0] + Math.cos(ang) * R0, e.a[1] + Math.sin(ang) * R0, e.a[2] + 0.12 + k * 0.25]);
        const s = 0.22 + k * 0.3;
        box(T, p, [s, s, s * 0.6], fadeOf(c, 0.3 * (1 - k)));
      }
    }
  }
  if (S.p.length) emit(P_FX.solid, S.freeze(), ID, pose);
  if (T.p.length) emit(P_FX.screen, T.freeze(), ID, pose);
  return { ...res(P_FX), glow: glow.result() };
}

/** 降下中の自分の体（三人称のとき）。person は peopleMeshes の 1 人ぶん */
export function selfMesh(person, now) {
  return peopleMeshes([person], { now, pool: P_SELF });
}

/** 飛行機：大きな輸送機（模型が planeParts を持っていれば）。なければ小さなジェット機の形 */
export function planeMesh(s, now) {
  const PP = Models.planeParts?.();
  if (!PP) return vehicleMeshes([{ kind: "jet", s, rider: null, view: null }], { now, pool: P_PLANE });
  reset(P_PLANE);
  const pose = poseOf(s.x, s.y, s.z, s.yaw, s.pitch || 0, s.bank || 0);
  emit(P_PLANE.solid, PP.body, ID, pose);
  const spin = (now / 1000) * 26;
  for (const h of PP.hubs || []) {
    emit(P_PLANE.solid, PP.prop, { R: rotAxis([1, 0, 0], spin), t: h }, pose);
    if (PP.blur) emit(P_PLANE.screen, PP.blur, { R: rotAxis([1, 0, 0], spin * 0.5), t: h }, pose); // 回るプロペラの残像
  }
  const glow = new GlowMesh();
  // 翼の端の灯（左 赤・右 緑）と、尾の白い点滅
  const span = (PP.span || 40) / 2;
  glow.sprite(worldPt(pose, ID, [0, span, 1.2]), 0.5, [0.9, 0.05, 0.05], 3, 0.1);
  glow.sprite(worldPt(pose, ID, [0, -span, 1.2]), 0.5, [0.05, 0.85, 0.3], 3, 0.1);
  if (now % 1300 < 120) glow.sprite(worldPt(pose, ID, [-(PP.length || 30) / 2, 0, 3]), 0.7, [1, 1, 0.9], 3, 0.1);
  return { ...res(P_PLANE), glow: glow.result() };
}
