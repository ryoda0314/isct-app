// キャンパスロワイヤルの一人称の手とブラスター（ビューモデル）。カメラのすぐ前に描く（CampusMap3D の cb-royale-vm 層：
// 深さを消してからいちばん上に描くので、壁ぎわでもめりこまない）。
// カメラのローカル座標（前 x・左 y・上 z、m）で手と装備を置き、目の位置と向き（poseOf：向き＝地図の方位、上下＝地図の pitch − 90）で世界へ。
// 動き：歩く揺れ・視点を動かしたときの遅れ・撃った反動・構え（照準を目の線に合わせる）・リロード（弾倉を抜いて入れる）・持ちかえ・
// 走るときに下げる・回復（飲む）・素手のパンチ・着地の沈み・撃った瞬間の光。
import { GlowMesh } from "./campus3dMesh.js";
import { Out, emit, poseOf, worldPt } from "./campus3dVehicleMesh.js";
import { DEG, I3, Part, box, compose, ellipsoid, mm, mv, rgb, rotAxis, tube } from "./campus3dVehicleGeometry.js";
import * as Models from "./campus3dRoyaleModels.js";

// 手袋（暗い灰色）と袖口。袖は本人の色を暗く落とした色、袖口に本人の色の細い光る帯（2026-11-25「安っぽい」：肌色の角ばった手と真っ青な袖をやめた）
const GLOVE = rgb("#2a2e35"), GLOVE_L = rgb("#3d424b"), CUFF = rgb("#1b1f25");
const KICK = { fist: 0.25, pistol: 0.55, smg: 0.32, ar: 0.45, shotgun: 1.25, sniper: 1.4 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const angDiff = (to, from) => ((((to - from) % 360) + 540) % 360) - 180;

// 装備の寸法（模型の blasterDims。古い模型でも動くよう、なければ大まかに）
function dimsOf(kind) {
  const d = Models.blasterDims?.(kind);
  if (d) return d;
  const B = Models.BLASTER?.[kind] || { body: 0.3, barrel: 0.15 };
  const body = B.body || 0.3, barrel = B.barrel || 0.15;
  return { muzzle: [body * 0.88 + barrel, 0, 0.045], sight: [body * 0.35, 0, 0.1], mag: [body * 0.45, 0, -0.06], length: body + barrel };
}
const cache = new Map();
function weaponPart(kind, withMag) {
  const k = `${kind}:${withMag ? 1 : 0}`;
  if (!cache.has(k)) {
    const P = new Part();
    Models.addBlaster(P, kind, [0, 0, 0], { mag: withMag });
    cache.set(k, P.freeze());
  }
  return cache.get(k);
}
function magPart(kind) {
  const k = `${kind}:mag`;
  if (!cache.has(k)) {
    const P = new Part();
    if (Models.addMag) Models.addMag(P, kind, [0, 0, 0]);
    else { const d = dimsOf(kind); box(P, d.mag, [0.05, 0.035, 0.1], rgb("#2a2f36")); }
    cache.set(k, P.freeze());
  }
  return cache.get(k);
}
function healPart(kind) {
  const k = `heal:${kind}`;
  if (!cache.has(k)) cache.set(k, Models.lootModel ? Models.lootModel(kind, "heal").solid : new Part().freeze());
  return cache.get(k);
}

// 手（手袋で握った形）と前腕。sleeve は袖の色、accent は袖口の光る帯の色
function addArm(P, hand, elbow, sleeve, accent, { fist = false } = {}) {
  const dir = [hand[0] - elbow[0], hand[1] - elbow[1], hand[2] - elbow[2]];
  const L = Math.hypot(...dir) || 1;
  const u = [dir[0] / L, dir[1] / L, dir[2] / L];
  const at = (k) => [hand[0] - u[0] * k, hand[1] - u[1] * k, hand[2] - u[2] * k];
  tube(P, elbow, at(0.1), 0.042, sleeve, 12, false);
  tube(P, at(0.1), at(0.088), 0.0435, accent, 12, false);
  tube(P, at(0.088), at(0.07), 0.044, CUFF, 12, true);
  tube(P, at(0.07), at(0.04), 0.031, GLOVE, 10, false);
  ellipsoid(P, hand, fist ? [0.049, 0.042, 0.046] : [0.05, 0.039, 0.048], GLOVE, 12, 7);
  // 指（握り）と、こぶしの当て
  ellipsoid(P, [hand[0] + u[0] * 0.034, hand[1] + u[1] * 0.034, hand[2] + u[2] * 0.034 - 0.008], [0.03, 0.046, 0.028], GLOVE, 10, 5);
  ellipsoid(P, [hand[0] + u[0] * 0.03, hand[1] + u[1] * 0.03, hand[2] + u[2] * 0.03 + 0.016], [0.022, 0.036, 0.012], GLOVE_L, 8, 4);
}

const POOL = { solid: new Out(), glass: new Out(), screen: new Out() };
const VM_SIZE = 0.84; // 手元の大きさ（1 ＝ 世界と同じ画角）
// 画角 fov（度）のとき、手元の横・縦を何倍にするか（ふだんの画角 baseFov のときと同じ大きさに見えるように）
export const vmScale = (fov = 70, baseFov = 70) => (Math.tan((fov * DEG) / 2) / Math.tan((baseFov * DEG) / 2)) * VM_SIZE;

// 銃口の位置（カメラのローカル：前・左・上 m）。光の線を手の中の銃口から出すため。ads は 0〜1、kz は vmScale
export function muzzleLocal(kind, ads = 0, kz = VM_SIZE) {
  const m = kind === "fist" ? [0.5, -0.15, -0.17] : (() => {
    const d = dimsOf(kind);
    const k = ease(ads);
    const hip = [0.36, -0.165, -0.2], aim = [0.25 - d.sight[0], -d.sight[1], -d.sight[2]];
    return add3(lerp3(hip, aim, k), d.muzzle);
  })();
  return [m[0], m[1] * kz, m[2] * kz];
}

export function createViewmodel() {
  const S = { kind: null, swAt: -1e9, last: null, sway: [0, 0], bob: 0, ads: 0, low: 0, kick: 0, flashAt: -1e9, punchAt: -1e9, punchSide: 0, landAt: -1e9, landK: 0 };
  return {
    // 撃った（反動・光・素手ならパンチ）
    fire(kind, now) {
      S.kick = Math.min(1.8, S.kick + (KICK[kind] ?? 0.5));
      S.flashAt = now;
      if (kind === "fist") { S.punchAt = now; S.punchSide ^= 1; }
    },
    // 着地（沈む）。v は下りる速さ m/s
    land(now, v = 6) { S.landAt = now; S.landK = Math.min(1, v / 7); },
    /**
     * 毎フレームの形。st = { kind, col, eye:[x,y,z], yaw, pitch（地図の pitch）, speed, onGround, sprint, ads, reload（0〜1 か null）,
     * heal（{ kind, t } か null）, dt }。描かないときは null
     */
    frame(st, now) {
      const dt = Math.min(0.1, st.dt || 1 / 60);
      if (!st.kind) return null;
      if (st.kind !== S.kind) { S.kind = st.kind; S.swAt = now; }
      // 視点を動かした速さで少し遅れる（揺れ）
      if (S.last) {
        const vy = angDiff(st.yaw, S.last[0]) / dt, vp = (st.pitch - S.last[1]) / dt;
        const ty = Math.max(-0.035, Math.min(0.035, -vy * 0.00028)), tp = Math.max(-0.03, Math.min(0.03, -vp * 0.00025));
        const k = Math.min(1, dt * 9);
        S.sway[0] += (ty - S.sway[0]) * k;
        S.sway[1] += (tp - S.sway[1]) * k;
      }
      S.last = [st.yaw, st.pitch];
      S.ads += ((st.ads ? 1 : 0) - S.ads) * Math.min(1, dt * 13);
      const adsK = ease(S.ads);
      const sw = (now - S.swAt) / 1000;
      const lowT = st.heal ? 1 : sw < 0.22 ? 1 - ease(sw / 0.22) : st.sprint && st.onGround && st.speed > 4.6 && !st.ads ? 0.65 : 0;
      S.low += (lowT - S.low) * Math.min(1, dt * (sw < 0.22 ? 30 : 10));
      S.kick *= Math.exp(-dt * 13);
      const land = Math.max(0, 1 - (now - S.landAt) / 350) * S.landK;
      // 歩く揺れ（構えると小さく）
      if (st.onGround) S.bob += dt * Math.min(st.speed, 6) * 1.45;
      const amp = Math.min(1, st.speed / 4.3) * (1 - 0.8 * adsK) * 0.011;
      const bobY = Math.sin(S.bob) * amp, bobZ = -Math.abs(Math.cos(S.bob)) * amp * 0.9 + Math.sin(now / 1100) * 0.0025 * (1 - adsK);
      const P = new Part();
      const ST = POOL;
      ST.solid.n = ST.glass.n = ST.screen.n = 0;
      const pose = poseOf(st.eye[0], st.eye[1], st.eye[2], st.yaw, st.pitch - 90, 0);
      // 手元はズームと切り離す（ゲームの「手元の画角」）：画角が狭くなったぶん横・縦を縮めて、構えても大きくならない。ふだんも少し小さく
      const kz = vmScale(st.fov, st.baseFov);
      pose.R = mm(pose.R, [1, 0, 0, 0, kz, 0, 0, 0, kz]);
      const base = rgb(/^#[0-9a-fA-F]{6}$/.test(st.col || "") ? st.col : "#3d8bfd");
      const sleeve = [base[0] * 0.38 + 0.07, base[1] * 0.38 + 0.075, base[2] * 0.38 + 0.09, 1];
      const accent = [Math.min(1, base[0] * 1.1 + 0.05), Math.min(1, base[1] * 1.1 + 0.05), Math.min(1, base[2] * 1.1 + 0.05), 0.5];
      const glow = new GlowMesh();
      const elbowR = [0.04, -0.28, -0.47], elbowL = [0.2, 0.03, -0.55];
      if (st.kind === "fist") {
        // 素手：両手の拳を前に。パンチは交互に前へ突く
        const p = (now - S.punchAt) / 300;
        const jab = p >= 0 && p < 1 ? Math.sin(Math.PI * Math.min(1, p * 1.25)) : 0;
        // 構えは少し高く前に、肘は外へ（前腕の袖が見えるように。引く手はカメラに寄りすぎない）
        const base = [[0.38, -0.15, -0.16], [0.38, 0.14, -0.16]];
        const hands = base.map((h, i) => {
          const me = (i === 0) === (S.punchSide === 1);
          const ext = me ? jab : -jab * 0.12;
          return add3(h, [ext * 0.2 - land * 0.0, (i === 0 ? 1 : -1) * ext * 0.05 + S.sway[0] + bobY, ext * 0.03 + S.sway[1] + bobZ - S.low * 0.12 - land * 0.05]);
        });
        addArm(P, hands[0], [0.14, -0.31, -0.43], sleeve, accent, { fist: true });
        addArm(P, hands[1], [0.15, 0.29, -0.43], sleeve, accent, { fist: true });
        emit(ST.solid, P.freeze(), { R: I3, t: [0, 0, 0] }, pose);
        return { groups: [{ id: "vm", ver: null, solid: ST.solid.result(), glass: ST.glass.result(), screen: ST.screen.result(), glow: glow.result() }] };
      }
      const d = dimsOf(st.kind);
      // 握りの位置：腰だめ（右下）と、構え（照準を目の線の 0.25 m 先に）
      const hip = [0.36, -0.165, -0.2];
      const aim = [0.25 - d.sight[0], -d.sight[1], -d.sight[2]];
      const G = lerp3(hip, aim, adsK);
      G[0] -= S.kick * 0.03 * (1 - 0.45 * adsK) + land * 0.01;
      G[1] += S.sway[0] * (1 - 0.6 * adsK) + bobY;
      G[2] += S.sway[1] * (1 - 0.6 * adsK) + bobZ - S.low * 0.13 - land * 0.045;
      // 回し方：反動で銃口が上がる・下げると銃口が下がって内へ・リロードで傾く
      const r = st.reload;
      const tilt = r == null ? 0 : ease(r / 0.16) * (1 - ease((r - 0.84) / 0.16));
      const charge = r == null ? 0 : Math.max(0, Math.sin(Math.PI * clamp01((r - 0.72) / 0.14)));
      const pitchUp = S.kick * (st.kind === "sniper" || st.kind === "shotgun" ? 7 : 4) + charge * 4;
      const R = mm(rotAxis([0, 0, 1], (S.low * 16 + tilt * 8) * DEG), mm(rotAxis([0, 1, 0], (S.low * 24 + tilt * 10 - pitchUp) * DEG), rotAxis([1, 0, 0], (tilt * 32 - 4 * (1 - adsK)) * DEG)));
      const A = compose({ R: I3, t: G }, { R, t: [0, 0, 0] });
      const at = (p) => add3(mv(R, p), G); // 装備のローカル → カメラのローカル
      // 弾倉：リロードの途中は抜いて（下へ）、新しいのを下から入れる
      const md = d.magDir || [0, 0, -1];
      const along = (k) => [md[0] * 0.2 * k, md[1] * 0.2 * k, md[2] * 0.2 * k];
      let magOff = null;
      if (r != null) {
        if (r < 0.18) magOff = [0, 0, 0];
        else if (r < 0.42) magOff = along(ease((r - 0.18) / 0.24));
        else if (r < 0.46) magOff = null;
        else if (r < 0.72) magOff = along(1 - ease((r - 0.46) / 0.26));
        else magOff = [0, 0, 0];
      }
      emit(ST.solid, weaponPart(st.kind, r == null), A, pose);
      if (r != null && magOff) emit(ST.solid, magPart(st.kind), compose(A, { R: I3, t: magOff }), pose);
      // 右手は握り、左手は前（リロードの途中は弾倉へ、回復のときは飲み物を口へ）
      const handR = at([-0.012, -0.004, -0.035]);
      let handL = at(d.fore ? add3(d.fore, [0.004, 0.006, -0.032]) : [d.length * 0.56, 0.012, -0.04]);
      if (r != null && r > 0.16 && r < 0.78) {
        const toMag = ease((r - 0.16) / 0.1) * (1 - ease((r - 0.68) / 0.1));
        handL = lerp3(handL, at(add3(d.mag, add3(magOff || along(1), [0, 0.01, -0.05]))), toMag);
      }
      if (st.heal) {
        // 回復：左手で飲み物を口の前へ（小さめに、画面の左下寄り）
        const t = clamp01(st.heal.t);
        const up = ease(t / 0.25);
        handL = lerp3([0.34, 0.17, -0.34], [0.33, 0.07, -0.16], up);
        const tiltH = up * 30 + Math.sin(t * 9) * 2;
        const s = 0.55;
        const Rh = mm(rotAxis([0, 1, 0], -tiltH * DEG), rotAxis([0, 0, 1], 20 * DEG)).map((v) => v * s);
        const H = compose({ R: I3, t: add3(handL, [0.004, -0.008, 0.02]) }, { R: Rh, t: [0, 0, -0.065] });
        emit(ST.solid, healPart(st.heal.kind), H, pose);
      }
      addArm(P, handR, elbowR, sleeve, accent);
      addArm(P, handL, elbowL, sleeve, accent);
      emit(ST.solid, P.freeze(), { R: I3, t: [0, 0, 0] }, pose);
      // 撃った瞬間の光（銃口の星形と、にじみ）
      const fl = (now - S.flashAt) / 55;
      if (fl >= 0 && fl < 1) {
        const m = at(add3(d.muzzle, [0.02, 0, 0]));
        const ax = mv(R, [1, 0, 0]);
        const hex = Models.TRACER?.[st.kind] || "#fff2c4";
        const c = rgb(hex);
        const hot = [Math.min(1, c[0] * 0.5 + 0.6), Math.min(1, c[1] * 0.5 + 0.6), Math.min(1, c[2] * 0.5 + 0.6), 0.5];
        const F = new Part();
        const s = (1 - fl) * (st.kind === "shotgun" || st.kind === "sniper" ? 0.09 : 0.06);
        const tip = add3(m, ax.map((v) => v * s * 1.6));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI + now * 0.01;
          const side = mv(R, [0, Math.cos(a), Math.sin(a)]);
          const p1 = add3(m, side.map((v) => v * s * 0.55)), p2 = add3(m, side.map((v) => -v * s * 0.55));
          F.tri(p1, tip, p2, hot, ax);
          F.tri(p2, tip, p1, hot, ax.map((v) => -v));
        }
        emit(ST.solid, F.freeze(), { R: I3, t: [0, 0, 0] }, pose);
        glow.sprite(worldPt(pose, { R: I3, t: [0, 0, 0] }, m), 0.07 + s * 0.6, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55], 1, 0.0);
      }
      return { groups: [{ id: "vm", ver: null, solid: ST.solid.result(), glass: ST.glass.result(), screen: ST.screen.result(), glow: glow.result() }] };
    },
  };
}
