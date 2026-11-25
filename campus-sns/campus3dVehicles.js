// バーチャルキャンパスの乗り物。クーペとジェットの運動は campus3dCar・campus3dJet に置く。
// 持ち物（campus3dInventory）と同じくゲームの中のもの（構想書 v0.3 の Layer B：仮想の拡張）：建物のデータ（features.json）とは混ぜず、
// 歩いて見ているあいだだけ出す。置いた所は端末の中だけ（localStorage。外へは送らない）。
// ここは動き・置き場所・カメラの計算（DOM も MapLibre も使わない。歩ける世界 campus3dWalk の walkWorld を使う）。形は campus3dVehicleMesh.js
// 座標は平面の m（x 東・y 北）、高さは標高 m、向き yaw は北から時計回りの度（歩く人と同じ）。乗り物の基準の点は地面の上のまん中

import { DEG, clamp, norm360, angDiffV, fwdOf, leftOf, spanBlocked, floorZ } from "./campus3dVehicleMath.js";
import { CAR, carFits } from "./campus3dCar.js";
import { JET, launchJet } from "./campus3dJet.js";
export { angDiffV, fwdOf, leftOf, CAR, carFits };
export { stepCar } from "./campus3dCar.js";
export { stepJet } from "./campus3dJet.js";

const lerp = (a, b, t) => a + (b - a) * t;
const G = 9.8;

export const VEHICLE_KINDS = ["car", "jet", "bike", "drone"];

// 自転車（26 インチのママチャリ：前かご・どろよけ・荷台・チェーンケース・両立スタンド）。速さは歩く 4.3m/s より少し速いくらい（16 km/h）、
// 立ちこぎ（Shift・「走る」）で 23 km/h。階段・崖（0.9m 先までで 0.26m より上り下りする所）は通れない。縁石（0.16m まで）はこえる
export const BIKE = {
  wheelbase: 1.12, wheelR: 0.33, half: 0.93, width: 0.6,
  speed: 4.4, sprint: 6.4, accel: 1.1, sprintAccel: 1.8, brake: 4.2, drag: 0.1, back: 0.9, coastMax: 8.5,
  steerMax: 38, steerMin: 8, steerRate: 170, pivot: 55, // 速いほど切れない（16 km/h で半径 4m ほど・23 km/h で 8m ほど）
  step: 0.16, stairsRise: 0.26, gear: 2.06,
  eye: 1.58, eyeBack: 0.1, // 座った目の高さ（地面から）・まん中から後ろへ
};
// ドローン（対角 0.35m の小さな 4 枚羽根）：前後左右 8m/s（スポーツ 15m/s）、上 3.5m/s・下 3m/s。離陸した地面から 120m・操縦する人から 500m まで。
// 電池は 15 分（スポーツは 1.5 倍の速さで減る）。15% で知らせ、8% で操縦する人のところへ戻る
export const DRONE = {
  speed: 8, sprint: 15, up: 3.5, down: 3, accel: 2.4, vaccel: 4, turn: 90,
  radius: 0.24, half: 0.07, legs: 0.065, maxAlt: 120, maxDist: 500, battery: 15 * 60, sportDrain: 1.5, warn: 0.15, rthAt: 0.08,
  rthAlt: 30, rthSpeed: 9, liftOff: 1.4,
};

function stairsAhead(world, px, py, ux, uy, z, step, rise) {
  let prev = z;
  for (const d of [0.3, 0.6, 0.9]) {
    const q = floorZ(world, px + ux * d, py + uy * d, z, 0.5);
    if (q == null) return true;
    if (Math.abs(q - prev) > step + 0.02) return true;
    prev = q;
  }
  return Math.abs(prev - z) > rise;
}

// 自転車がその位置・向きに置けるか：前輪・後輪・まん中の足場と、乗る人の体（足の高さで blocked）。dir は進む向き（1 前・-1 後ろ・0 置くだけ）
export function bikeFits(world, x, y, z, yaw, dir = 0) {
  const S = BIKE;
  const [fx, fy] = fwdOf(yaw);
  const pts = [[0.56, 0], [0, 0], [-0.56, 0], [0.86, 0], [-0.86, 0]];
  let zc = null;
  const zs = [];
  for (const [a] of pts) {
    const px = x + fx * a, py = y + fy * a;
    const q = floorZ(world, px, py, z, S.step);
    if (q == null) return { ok: false };
    if (world.blocked(px, py, q)) return { ok: false };
    zs.push(q);
    if (a === 0) zc = q;
  }
  if (Math.abs(zs[0] - zs[2]) > 0.32) return { ok: false, stairs: true };
  if (dir) {
    const a = dir > 0 ? 0.86 : -0.86;
    if (stairsAhead(world, x + fx * a, y + fy * a, fx * dir, fy * dir, dir > 0 ? zs[3] : zs[4], S.step, S.stairsRise)) return { ok: false, stairs: true };
  }
  return { ok: true, z: zc, zf: zs[0], zr: zs[2] };
}

/**
 * 自転車を 1 フレーム動かす。b は { x, y, z, yaw, v（前へ m/s）, steer（ハンドルの角度、度。左が +）, lean, pitch, crank, wheel, vz, air }、
 * input は { fwd（こぐ + / ブレーキ −）, side（右が +）, turn, sprint }。ぶつかると止まる（hit）。階段・崖の手前では止まる（stairs）。
 * 後輪の点を基準に曲がる（前輪が外を回る）
 */
export function stepBike(b, input, dt, world) {
  const S = BIKE;
  let { x, y, z, yaw } = b;
  let v = b.v || 0, steer = b.steer || 0, vz = b.vz || 0;
  let air = !!b.air;
  const fin = clamp(input.fwd || 0, -1, 1);
  const sin = clamp((input.side || 0) + (input.turn || 0), -1, 1);
  // 坂（進む向きの傾き。前・後ろの車輪の足場の差）
  const [fx, fy] = fwdOf(yaw);
  const zf = floorZ(world, x + fx * 0.56, y + fy * 0.56, z, S.step) ?? z;
  const zr = floorZ(world, x - fx * 0.56, y - fy * 0.56, z, S.step) ?? z;
  const grade = clamp((zf - zr) / S.wheelbase, -0.4, 0.4);
  const pedal = fin > 0.05 && !air;
  if (!air) {
    if (pedal) {
      // こぐ：上り坂は目標の速さが下がる（ふつうの人がこげる速さ）
      const tgt = fin * (input.sprint ? S.sprint : S.speed) * (grade > 0 ? Math.max(0.35, 1 - grade * 4) : 1);
      const a = input.sprint ? S.sprintAccel : S.accel;
      if (v < tgt) v = Math.min(tgt, v + a * dt);
      else v = Math.max(tgt, v - (S.drag + 0.02 * v * v) * dt - G * Math.sin(Math.atan(grade)) * 0.9 * dt);
    } else if (fin < -0.05) {
      if (v > 0.05) v = Math.max(0, v - S.brake * -fin * dt);
      else v = Math.max(-S.back * -fin, v - 2 * dt); // 止まっていれば、押して後ろへ
    } else {
      // こがない：坂なりに転がり、ころがる抵抗と風でゆっくり止まる
      v -= G * Math.sin(Math.atan(grade)) * 0.9 * dt;
      const d = (S.drag + 0.015 * v * v) * dt;
      v = Math.abs(v) <= d && Math.abs(grade) < 0.03 ? 0 : v - Math.sign(v) * d;
      v = clamp(v, -S.back, S.coastMax);
    }
  }
  // ハンドル：速いほど切れる角度が小さい。止まりかけは押して向きを変える
  const vm = Math.abs(v);
  const dmax = lerp(S.steerMax, S.steerMin, clamp((vm - 0.5) / 4.5, 0, 1));
  const tgtSteer = -sin * dmax;
  steer += clamp(tgtSteer - steer, -S.steerRate * dt, S.steerRate * dt);
  const rate = vm < 0.35 ? sin * S.pivot : -((v * Math.tan(steer * DEG)) / S.wheelbase) / DEG; // 度/秒（右へ +）
  // 後輪の点を基準に、少しずつ動かす（0.2m ずつ。柱をすり抜けない）
  const dist = v * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.2));
  let hit = false;
  let stairs = false;
  let cur = { x, y, yaw };
  for (let i = 0; i < n; i++) {
    const y0 = cur.yaw;
    const y1 = norm360(y0 + (rate * dt) / n);
    const [ax, ay] = fwdOf(y0);
    const rx = cur.x - ax * 0.56, ry = cur.y - ay * 0.56; // 後輪
    const [bx, by] = fwdOf(y0 + angDiffV(y1, y0) / 2);
    const nrx = rx + bx * (dist / n), nry = ry + by * (dist / n);
    const [cx, cy] = fwdOf(y1);
    const nx = nrx + cx * 0.56, ny = nry + cy * 0.56;
    const r = Math.abs(dist) > 1e-6 || Math.abs(y1 - y0) > 1e-6 ? bikeFits(world, nx, ny, z, y1, Math.sign(dist)) : { ok: true, z };
    if (!r.ok) {
      hit = true;
      stairs = !!r.stairs;
      v = stairs ? 0 : -v * 0.15;
      break;
    }
    cur = { x: nx, y: ny, yaw: y1 };
    if (!air) {
      if (r.z >= z - S.step - 0.02) z = r.z;
      else air = true;
    }
  }
  ({ x, y, yaw } = cur);
  // 落ちる（ふちから出た）：重力で落ちて、足場に着く
  if (air) {
    const z1 = z + vz * dt - 0.5 * 20 * dt * dt;
    vz -= 20 * dt;
    const f = world.floorBelow(x, y, z + 0.05);
    if (f && z1 <= f.z) {
      z = f.z;
      vz = 0;
      air = false;
    } else z = z1;
  } else {
    const q = floorZ(world, x, y, z, S.step);
    if (q == null || q < z - S.step - 0.02) air = true;
    else z = q;
  }
  // 見た目：車体の傾き（曲がるとき内へ倒れる）・前後の傾き・ペダル・車輪
  const leanT = clamp(Math.atan((v * rate * DEG) / G) / DEG, -24, 24);
  const lean = (b.lean || 0) + (leanT - (b.lean || 0)) * Math.min(1, dt * 6);
  const pitch = (b.pitch || 0) + (Math.atan(grade) / DEG - (b.pitch || 0)) * Math.min(1, dt * 8);
  const wheel = ((b.wheel || 0) + (v * dt) / S.wheelR) % (Math.PI * 2);
  const crank = pedal && v > 0.1 ? ((b.crank || 0) + ((v / S.wheelR) * dt) / S.gear) % (Math.PI * 2) : b.crank || 0;
  return { ...b, x, y, z, yaw, v, steer, vz, air, lean, pitch, wheel, crank, hit, stairs, pedal };
}

// ドローンの体（まん中から半径 radius・上下 half）がぶつかるか
function droneHit(world, x, y, z, yaw) {
  const S = DRONE;
  const lo = z - S.half, hi = z + S.half;
  if (spanBlocked(world, x, y, lo, hi)) return true;
  const [fx, fy] = fwdOf(yaw);
  const [lx, ly] = leftOf(yaw);
  for (const [a, l] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (spanBlocked(world, x + (fx * a + lx * l) * S.radius * 0.7, y + (fy * a + ly * l) * S.radius * 0.7, lo, hi)) return true;
  }
  return false;
}

/**
 * ドローンを 1 フレーム動かす。d は { x, y, z（体のまん中の標高）, yaw, vx, vy, vz, tilt: [前後, 左右], spin（羽根の回る速さ 0〜1）, battery（0〜1）,
 * rth（戻っている）, landed }、input は { fwd, side, turn, up, down, sprint }、home は { x, y, gz（離陸した地面）, px, py（操縦する人） }。
 * 戻る（rth）：離陸した地面から rthAlt m まで上がってから操縦する人の前へまっすぐ飛び、下りて着いたら done
 * @returns 新しい状態と、知らせ（note：low 電池が少ない・rth 戻りはじめた・far 離れすぎ・high 高すぎ・landed 着いた）
 */
export function stepDrone(d, input, dt, world, home) {
  const S = DRONE;
  let { x, y, z, yaw } = d;
  let vx = d.vx || 0, vy = d.vy || 0, vz = d.vz || 0;
  let battery = d.battery ?? 1;
  let rth = !!d.rth;
  let note = null;
  const sport = !!input.sprint && !rth;
  let tvx = 0, tvy = 0, tvz = 0;
  if (rth) {
    // 戻る：上がる → まっすぐ飛ぶ → 下りる
    const hx = home.x - x, hy = home.y - y;
    const hd = Math.hypot(hx, hy);
    const safe = Math.max(home.gz + S.rthAlt, d.rthZ || 0);
    if (hd > 2.5) {
      if (z < safe - 0.5 && hd > 8) tvz = S.up;
      else {
        const sp = Math.min(S.rthSpeed, hd * 0.9);
        tvx = (hx / hd) * sp;
        tvy = (hy / hd) * sp;
        tvz = hd > 8 ? clamp((safe - z) * 1.5, -S.down, S.up) : 0;
      }
      yaw = norm360(yaw + clamp(angDiffV(Math.atan2(hx, hy) / DEG, yaw), -S.turn * dt, S.turn * dt));
    } else {
      tvx = hx * 0.8;
      tvy = hy * 0.8;
      tvz = -Math.min(S.down, Math.max(0.6, (z - home.gz) * 0.8));
    }
  } else {
    yaw = norm360(yaw + (input.turn || 0) * S.turn * dt);
    const fin = clamp(input.fwd || 0, -1, 1);
    let sin = clamp(input.side || 0, -1, 1);
    const mag = Math.hypot(fin, sin);
    const f2 = mag > 1 ? fin / mag : fin;
    sin = mag > 1 ? sin / mag : sin;
    const sp = sport ? S.sprint : S.speed;
    const b = yaw * DEG;
    tvx = (Math.sin(b) * f2 + Math.cos(b) * sin) * sp;
    tvy = (Math.cos(b) * f2 - Math.sin(b) * sin) * sp;
    tvz = input.up ? S.up : input.down ? -S.down : 0;
  }
  const k = 1 - Math.exp(-S.accel * dt);
  const kz = 1 - Math.exp(-S.vaccel * dt);
  const ax = ((tvx - vx) * k) / Math.max(dt, 1e-3);
  const ay = ((tvy - vy) * k) / Math.max(dt, 1e-3);
  vx += (tvx - vx) * k;
  vy += (tvy - vy) * k;
  vz += (tvz - vz) * kz;
  if (Math.abs(vx) < 0.005 && !tvx) vx = 0;
  if (Math.abs(vy) < 0.005 && !tvy) vy = 0;
  // 動かす：0.2m ずつ、ぶつかった向きは止めて軸ごとにすべる
  let hit = false;
  const steps = Math.max(1, Math.ceil((Math.hypot(vx, vy, vz) * dt) / 0.2));
  for (let i = 0; i < steps; i++) {
    const dx = (vx * dt) / steps, dy = (vy * dt) / steps, dz = (vz * dt) / steps;
    if (!droneHit(world, x + dx, y + dy, z, yaw)) {
      x += dx;
      y += dy;
    } else {
      hit = true;
      if (!droneHit(world, x + dx, y, z, yaw)) { x += dx; vy *= -0.2; }
      else if (!droneHit(world, x, y + dy, z, yaw)) { y += dy; vx *= -0.2; }
      else { vx *= -0.2; vy *= -0.2; }
    }
    if (dz > 0) {
      if (!droneHit(world, x, y, z + dz, yaw)) z += dz;
      else { vz = 0; hit = true; }
    } else if (dz < 0) {
      const f = world.floorBelow(x, y, z - S.legs + 0.02);
      const nz = z + dz;
      if (f && nz - S.legs <= f.z) { z = f.z + S.legs; vz = 0; }
      else if (!droneHit(world, x, y, nz, yaw)) z = nz;
      else { vz = 0; hit = true; }
    }
  }
  // 足場に着いている
  const f = world.floorBelow(x, y, z - S.legs + 0.03);
  const landed = !!f && z - S.legs <= f.z + 0.02 && vz <= 0.05;
  if (landed && f) z = f.z + S.legs;
  // 高さ・距離の上限
  const top = home.gz + S.maxAlt;
  if (z > top) {
    z = top;
    vz = Math.min(0, vz);
    if (!d.highNoted) note = "high";
  }
  const ox = x - home.px, oy = y - home.py;
  const od = Math.hypot(ox, oy);
  if (od > S.maxDist) {
    x = home.px + (ox / od) * S.maxDist;
    y = home.py + (oy / od) * S.maxDist;
    vx *= 0.3;
    vy *= 0.3;
    if (!d.farNoted) note = "far";
  }
  // 電池（飛んでいるあいだ。着いていて止まっていれば減らない）
  const flying = !landed || Math.abs(tvz) > 0 || Math.hypot(tvx, tvy) > 0.1;
  if (flying) battery = Math.max(0, battery - (dt / S.battery) * (sport ? S.sportDrain : 1));
  if (!d.lowNoted && battery <= S.warn) note = "low";
  if (!rth && battery <= S.rthAt) {
    rth = true;
    note = "rth";
  }
  let done = false;
  if (rth && landed && Math.hypot(home.x - x, home.y - y) < 3) done = true;
  // 見た目：進む向きへ傾く（加速の向き）・羽根
  const [fx, fy] = fwdOf(yaw);
  const [lx, ly] = leftOf(yaw);
  const af = ax * fx + ay * fy;
  const al = ax * lx + ay * ly;
  const tiltT = [clamp(-Math.atan((af + (vx * fx + vy * fy) * 0.35) / G) / DEG, -28, 28), clamp(-Math.atan((al + (vx * lx + vy * ly) * 0.35) / G) / DEG, -28, 28)];
  const t0 = d.tilt || [0, 0];
  const kt = Math.min(1, dt * 7);
  const tilt = [t0[0] + (tiltT[0] - t0[0]) * kt, t0[1] + (tiltT[1] - t0[1]) * kt];
  const spinT = landed && !rth && !input.up && Math.hypot(tvx, tvy) < 0.1 ? 0.35 : 1; // 着いて止まっていれば、羽根はゆっくり（アイドリング）
  const spin = (d.spin ?? 0) + (spinT - (d.spin ?? 0)) * Math.min(1, dt * 3);
  const rotor = ((d.rotor || 0) + spin * 140 * dt) % (Math.PI * 2);
  return {
    ...d, x, y, z, yaw, vx, vy, vz, tilt, spin, rotor, battery, rth, landed, hit, done, note,
    lowNoted: d.lowNoted || note === "low" || battery <= S.warn, farNoted: note === "far" ? true : od < S.maxDist - 20 ? false : d.farNoted, highNoted: note === "high" ? true : z < top - 5 ? false : d.highNoted,
  };
}

// 乗り物を置く所：歩く人（足 at = { x, y, z, yaw }）の前から、まわりへ広げて探す。置けなければ null
export function placeVehicle(kind, world, at) {
  if (kind === "jet") return launchJet(world, at);
  // 自転車・車は歩く人がそのまま乗れる所から（自転車はまたがる所、車は運転席が歩く人の所）。だめなら前から、まわりへ広げて探す
  const [f0x, f0y] = fwdOf(at.yaw);
  const [l0x, l0y] = leftOf(at.yaw);
  const first = kind === "car" ? [[at.x - f0x * CAR.driver[0] - l0x * CAR.driver[1], at.y - f0y * CAR.driver[0] - l0y * CAR.driver[1]]] : kind === "bike" ? [[at.x + f0x * BIKE.eyeBack, at.y + f0y * BIKE.eyeBack]] : [];
  const dists = kind === "car" ? [3.4, 4.4, 5.6, 7] : kind === "bike" ? [0.8, 1.4, 2, 2.8, 3.6] : [1.2, 1.8, 2.5];
  const angs = [0, 25, -25, 50, -50, 80, -80, 110, -110, 145, -145, 180];
  const cands = [...first];
  for (const dd of dists) {
    for (const da of angs) {
      const [fx, fy] = fwdOf(at.yaw + da);
      cands.push([at.x + fx * dd, at.y + fy * dd]);
    }
  }
  const yaw = norm360(at.yaw); // 歩く人と同じ向き
  for (const [px, py] of cands) {
    const fz = floorZ(world, px, py, at.z, 0.6);
    if (fz == null || Math.abs(fz - at.z) > 1.2) continue;
    if (kind === "bike") {
      const r = bikeFits(world, px, py, fz, yaw, 0);
      if (r.ok) return { x: px, y: py, z: r.z, yaw };
    } else if (kind === "car") {
      const r = carFits(world, px, py, fz, yaw, true);
      if (r.ok) return { x: px, y: py, z: r.z, zr: r.z, yaw, pitch: r.pitch, roll: r.roll,
        roadPitch:r.pitch, roadRoll:r.roll, heights:r.heights };
    } else if (!droneHit(world, px, py, fz + DRONE.legs + 0.01, yaw) && !droneHit(world, px, py, fz + DRONE.liftOff, yaw)) {
      return { x: px, y: py, z: fz + DRONE.legs, yaw };
    }
  }
  return null;
}

// 降りる所：自転車は左・右・後ろ・前、車は運転席の側（右）・左・後ろ・前。ふさがっていない、同じくらいの高さの足場。なければ null
export function dismountSpot(kind, v, world) {
  const [fx, fy] = fwdOf(v.yaw);
  const [lx, ly] = leftOf(v.yaw);
  const cands = kind === "car"
    ? [[CAR.driver[0], -1.35], [CAR.driver[0], 1.35], [-2.6, 0], [2.6, 0], [CAR.driver[0], -2]]
    : [[0, 0.65], [0, -0.65], [-1.25, 0], [1.25, 0], [0, 1.1], [0, -1.1]];
  for (const [a, l] of cands) {
    const px = v.x + fx * a + lx * l, py = v.y + fy * a + ly * l;
    const f = world.floorBelow(px, py, v.z + 0.6);
    if (!f || Math.abs(f.z - v.z) > 0.65 || world.blocked(px, py, f.z)) continue;
    return [px, py, f.z];
  }
  return null;
}

export function parkRide(v) {
  return { ...v, v: 0, slip: 0, spin: 0, vz: 0, steer: 0, lean: 0, kick: 0, cooldown: 0, impact: 0,
    contact: null, markAnchor: null, marks: [], hit: false, stairs: false, air: false, braking: false, reverse: false,
    z: v.zr ?? v.z, pitch: v.roadPitch ?? v.pitch, roll: v.roadRoll ?? v.roll };
}

// 置いてある自転車・車（乗っているもの ride は除く）が、点 (x, y)・足の高さ z の体（足の 0.1〜1.8m 上）をふさぐか。pad は体の半径（0.3m）。
// 歩ける世界の動く壁（setDyn）に足す：歩く人・ほかの乗り物・ドローンが、止めてある乗り物を通り抜けない（置くときも重ならない）
const VEH_BOX = { bike: [0.93, 0.3, 1.12], car: [CAR.length / 2, CAR.width / 2, CAR.height] };
export function vehicleBlocks(list, ride, x, y, z, pad = 0.3) {
  for (const k of ["bike", "car"]) {
    const v = list?.[k];
    if (!v || k === ride) continue;
    const [hl, hw, h] = VEH_BOX[k];
    const dx = x - v.x, dy = y - v.y;
    if (Math.abs(dx) > hl + pad + 0.5 || Math.abs(dy) > hl + pad + 0.5) continue;
    const [fx, fy] = fwdOf(v.yaw);
    const [lx, ly] = leftOf(v.yaw);
    if (Math.abs(dx * fx + dy * fy) > hl + pad || Math.abs(dx * lx + dy * ly) > hw + pad) continue;
    if (z + 0.1 < v.z + h && z + 1.8 > v.z + 0.05) return true;
  }
  return false;
}

// 照準の線（目 o・向き d、世界の m）が当たる、置いてある乗り物（list: [{ kind, x, y, z, yaw }]）。reach m まで。いちばん近いもの { kind, t } か null
export function pickVehicle(list, o, d, reach = 3.5) {
  let best = null;
  for (const v of list) {
    if (!v) continue;
    const dims = v.kind === "car" ? [CAR.length / 2, CAR.width / 2, CAR.height] : v.kind === "bike" ? [0.95, 0.32, 1.12] : [0.2, 0.2, 0.14];
    const [fx, fy] = fwdOf(v.yaw);
    const [lx, ly] = leftOf(v.yaw);
    const ox = o[0] - v.x, oy = o[1] - v.y, oz = o[2] - v.z + (v.kind === "drone" ? DRONE.legs : 0);
    const lo = [ox * fx + oy * fy, ox * lx + oy * ly, oz];
    const ld = [d[0] * fx + d[1] * fy, d[0] * lx + d[1] * ly, d[2]];
    let t0 = 0, t1 = reach + (v.kind === "car" ? 1.5 : 0);
    const mins = [-dims[0], -dims[1], 0], maxs = [dims[0], dims[1], dims[2]];
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (Math.abs(ld[i]) < 1e-9) {
        if (lo[i] < mins[i] || lo[i] > maxs[i]) ok = false;
        continue;
      }
      let a = (mins[i] - lo[i]) / ld[i], b = (maxs[i] - lo[i]) / ld[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) ok = false;
    }
    if (ok && (!best || t0 < best.t)) best = { kind: v.kind, t: t0 };
  }
  return best;
}

/**
 * 乗っているあいだのカメラ。view は "fp"（乗っている人の目・ドローンのカメラ）か "tp"（後ろから）、look は { yaw（向きの差、度）, pitch }（マウス・指で見回した分）、
 * prev は前のフレームの後ろからのカメラ（なめらかに追う）。world があれば、後ろからのカメラが建物の中へ入らないよう手前に寄せる
 * @returns { x, y, z（カメラの標高）, yaw, pitch, camYaw（次のフレームへ） }
 */
export function vehicleCamera(kind, v, view, look, dt, world, prev = null) {
  const lyaw = look.yaw || 0;
  const kick = !look.steady && kind === "car" && v.kick ? v.kick*Math.cos(v.fxAge*42) : 0;
  if (kind === "drone") {
    if (view === "fp") {
      const [fx, fy] = fwdOf(v.yaw);
      return { x: v.x + fx * 0.1, y: v.y + fy * 0.1, z: v.z - 0.04, yaw: v.yaw, pitch: clamp(look.pitch, 5, 112) };
    }
  }
  if (view === "fp") {
    const [fx, fy] = fwdOf(v.yaw);
    const [lx, ly] = leftOf(v.yaw);
    if (kind === "car" || kind === "jet") {
      const [a, l, h] = kind === "car" ? CAR.driver : [1.88, 0, 1.99];
      const pitch = (v.pitch || 0)*DEG, roll = (kind === "car" ? -(v.roll || 0) : v.bank || 0)*DEG;
      const side = l*Math.cos(roll) - h*Math.sin(roll), up = l*Math.sin(roll) + h*Math.cos(roll);
      const fore = a*Math.cos(pitch) - up*Math.sin(pitch);
      return { x: v.x+fx*fore+lx*side, y: v.y+fy*fore+ly*side, z: v.z+a*Math.sin(pitch)+up*Math.cos(pitch),
        yaw: norm360(v.yaw+lyaw), pitch: clamp(look.pitch+(v.pitch||0)+kick*1.6,10,125), roll: look.steady ? 0 : roll/DEG*.72 };
    }
    // 曲がるときは内へ倒れる（MapLibre のカメラは横に傾けられないので、目を内へずらすだけ）
    const lean = (v.lean || 0) * DEG;
    return { x: v.x - fx * BIKE.eyeBack - lx * Math.sin(lean) * BIKE.eye * 0.6, y: v.y - fy * BIKE.eyeBack - ly * Math.sin(lean) * BIKE.eye * 0.6, z: v.z + BIKE.eye * Math.cos(lean), yaw: norm360(v.yaw + lyaw), pitch: look.pitch };
  }
  // 後ろから：乗り物の向き＋見回した分の向きへ、なめらかに追う
  const want = norm360(v.yaw + lyaw);
  const cy0 = prev?.camYaw ?? want;
  const camYaw = norm360(cy0 + angDiffV(want, cy0) * Math.min(1, dt * 5));
  const jet = kind === "jet";
  const speedFraction = clamp(Math.abs(v.v || 0)/(jet ? JET.maxSpeed : CAR.sprint),0,1);
  const dist = jet ? 15.5+speedFraction*4 : kind === "car" ? 5.75+speedFraction*2.0 : kind === "bike" ? 3.6 : 2.4;
  const tz = jet ? 2.65 : kind === "car" ? 1.19 : kind === "bike" ? 1.15 : 0.05;
  const pitch = clamp(look.pitch + (jet ? v.pitch*.30 : kick*1.1), kind === "drone" ? 35 : 51, 104);
  const p = pitch * DEG, b = camYaw * DEG;
  const dir = [Math.sin(p) * Math.sin(b), Math.sin(p) * Math.cos(b), -Math.cos(p)];
  const lead = jet ? 1.5 : kind === "car" ? .58 + speedFraction*.85 : 0;
  const tx = v.x+Math.sin(b)*lead, ty = v.y+Math.cos(b)*lead, tzz = v.z + tz + kick*.055;
  let D = dist;
  if (world) {
    // 乗り物から後ろへ線をたどり、建物・壁・地面に入る手前で止める
    for (let s = 0.4; s <= dist; s += jet ? .55 : .22) {
      const px = tx - dir[0] * s, py = ty - dir[1] * s, pz = tzz - dir[2] * s;
      const g = world.floorBelow(px, py, pz + 0.3);
      if (!g || pz < g.z + .25 || spanBlocked(world, px, py, pz - .2, pz + .2)) {
        D = Math.max(0.6, s - 0.35);
        break;
      }
    }
  }
  const D1 = prev?.D != null ? (D < prev.D ? D : prev.D + (D - prev.D) * Math.min(1, dt * 2.5)) : D;
  return { x: tx - dir[0] * D1, y: ty - dir[1] * D1, z: tzz - dir[2] * D1, yaw: camYaw, pitch, camYaw, D: D1,
    roll: jet && !look.steady ? v.bank*.16 : 0 };
}

// ── 置いた所の保存（端末の中だけ）──
export const VEH_KEY = "cb3Vehicles";
export function loadVehicles() {
  const out = { v: 1, parked: { bike: null, car: null }, view: { bike: "fp", car: "tp", drone: "tp", jet: "tp" } };
  try {
    const j = JSON.parse(localStorage.getItem(VEH_KEY) || "null");
    if (j && j.v === 1) {
      for (const k of ["bike", "car"]) {
        const p = j.parked?.[k];
        if (p && [p.x, p.y, p.z, p.yaw].every(Number.isFinite)) {
          out.parked[k] = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
          if (k === "car" && Array.isArray(p.dents) && p.dents.length === 4 && p.dents.every(Number.isFinite))
            out.parked[k].dents = p.dents.map(v => clamp(v, 0, 1));
        }
      }
      for (const k of VEHICLE_KINDS) if (j.view?.[k] === "fp" || j.view?.[k] === "tp") out.view[k] = j.view[k];
    }
  } catch {
    /* 使えない・こわれている */
  }
  return out;
}
export function saveVehicles(st) {
  try {
    localStorage.setItem(VEH_KEY, JSON.stringify({ v: 1, parked: st.parked, view: st.view }));
  } catch {
    /* 保存できない：このあいだだけ */
  }
}
