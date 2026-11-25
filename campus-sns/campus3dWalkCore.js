// 歩く体の動きの芯（Minecraft と同じ感じ）：大岡山（campus3dWalk.js・CampusMap3D）と横浜・湯島（campusMap/scene.js）で同じものを使う。
// 2026-11-26 ユーザー「大岡山キャンパスと湯島、横浜でマイクラ操作のUXUIは同じでも内部処理が全然違う…大岡山キャンパスのほうに合わせて」。
// 地図の形・建物などの重い物は読み込まない（横浜・湯島の地図が軽いまま使えるように）。値と式は campus3dWalk.js にあったものをそのまま移した
const DEG = Math.PI / 180;
export const EYE = 1.62; // 目の高さ（m。Minecraft と同じ）
export const SPEED = { sneak: 1.3, walk: 4.3, sprint: 5.6 }; // m/s（Minecraft と同じ）
export const JUMP = 8.4; // ジャンプの初速（m/s）。重力 GRAVITY で 1.25m 上がる
export const GRAVITY = 28; // m/s²（Minecraft の重力はこのくらい強い。ふわっとしない）
export const TURN = 120; // Q・E で向きを変える速さ（度/秒）
export const PITCH = { min: 5, max: 175, start: 88 }; // MapLibre の pitch（0 真下・90 水平・180 真上）
export const WALK_FOV = 70; // 縦の画角（度。Minecraft の「標準」）
export const SPRINT_FOV = 8; // ダッシュ中は画角を少し広げる（Minecraft と同じ）
export const BODY = 0.3; // 体の半径：壁にこれより近づかない（Minecraft と同じ）
export const STEP = 0.6; // 歩いて上れる段（Minecraft と同じ）。地面に沿って下りる段も
export const AIR_STEP = 0.05; // 空中では段を上らない（ジャンプで足が上まで来たら乗れる）
export const PROBE = 0.4; // 少し先の足もとも見る：なだらかに焼き込んだ平地の壁（0.3〜0.9m で 5m 上がる）を少しずつ登らないように
export const GROUND_K = 14; // 速さを目標の速さへ寄せる強さ（地面。0.07 秒ほどで追いつく）
export const AIR_K = 2.5; // 空中（ジャンプ中は向きを変えにくい）
export const MAX_FALL = 50;
export const DROP_OFF = 1.5; // 橋・階段の端の近くで横へ降りられる高さ
export const APEX = (JUMP * JUMP) / (2 * GRAVITY); // ジャンプで上がる高さ
export const angle = (v) => ((v % 360) + 360) % 360;
export const angDiff = (to, from) => ((((to - from) % 360) + 540) % 360) - 180;

/**
 * 体を1フレーム動かす（Minecraft と同じ感じ）。s は { x, y, z（足の標高）, vx, vy, vz, onGround, deck, yaw（方位、度）, pitch }、
 * input は { fwd, side（-1〜1。前・右が +）, turn（右が +）, jump, sprint, sneak, autoJump（低い段の前で自動でジャンプ。スマホ） }
 * @returns 新しい状態と、段を上り下りした高さ stepUp（目をなめらかに動かすため）
 */
export function stepBody(s, input, dt, world) {
  const yaw = angle(s.yaw + (input.turn || 0) * TURN * dt);
  let fwd = Math.max(-1, Math.min(1, input.fwd || 0));
  let side = Math.max(-1, Math.min(1, input.side || 0));
  const mag = Math.hypot(fwd, side);
  if (mag > 1) {
    fwd /= mag;
    side /= mag;
  }
  // ダッシュは前へ進んでいるときだけ（Minecraft と同じ）
  const speed = input.sneak ? SPEED.sneak : input.sprint && fwd > 0.3 ? SPEED.sprint : SPEED.walk;
  const b = yaw * DEG;
  const tvx = (Math.sin(b) * fwd + Math.cos(b) * side) * speed; // 東へ
  const tvy = (Math.cos(b) * fwd - Math.sin(b) * side) * speed; // 北へ
  const k = 1 - Math.exp(-(s.onGround ? GROUND_K : AIR_K) * dt);
  let vx = s.vx + (tvx - s.vx) * k;
  let vy = s.vy + (tvy - s.vy) * k;
  if (mag < 1e-3 && Math.hypot(vx, vy) < 0.02) {
    vx = 0;
    vy = 0;
  }
  // 水平：柱をすり抜けないよう 0.25m ずつ
  let { x, y, z, deck, onGround } = s;
  let stepUp = 0;
  let hit = false;
  let floor = null;
  const n = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 0.25));
  for (let i = 0; i < n; i++) {
    const r = world.move(x, y, z, (vx * dt) / n, (vy * dt) / n, { onGround, sneak: input.sneak, deck });
    hit ||= r.hit;
    const moved = Math.hypot(r.x - x, r.y - y);
    x = r.x;
    y = r.y;
    floor = r.floor;
    // 地面にいれば、段（STEP m まで上り、下りは坂くらいの急さまで）に沿う。急に低くなったら（ふち・平地の壁の上）落ちはじめる
    if (onGround && floor && floor.z >= z - Math.min(STEP, moved * 2 + 0.02)) {
      stepUp += floor.z - z;
      z = floor.z;
      deck = floor.deck;
    } else if (onGround && (!floor || floor.z < z)) onGround = false;
  }
  // エスカレーター（2026-11-12）：段の帯の上に立っていれば、段の速さで運ばれる（歩いていてもいなくても。壁・手すりにはぶつかる）
  const bv = onGround && world.beltAt ? world.beltAt(x, y, z) : null;
  if (bv) {
    const r = world.move(x, y, z, bv[0] * dt, bv[1] * dt, { onGround, sneak: input.sneak, deck });
    x = r.x;
    y = r.y;
    if (r.floor && Math.abs(r.floor.z - z) < STEP) {
      stepUp += r.floor.z - z;
      z = r.floor.z;
      deck = r.floor.deck;
    }
  }
  // 壁に押しつけているあいだも速さ（進もうとする勢い）は残す：段の前でジャンプすると、足が上に出たとたんに前へ進んで乗れる
  // （Minecraft で W を押したまま跳ぶと 1 段上がれるのと同じ）
  // 上下
  let vz = onGround ? 0 : s.vz;
  const lowStep = () => {
    // 前の少し先（0.5m）に、ジャンプで乗れる高さの段（STEP〜1.2m）がある
    const d = Math.hypot(tvx, tvy);
    if (d < 0.5) return false;
    const px = x + (tvx / d) * 0.5;
    const py = y + (tvy / d) * 0.5;
    return world.surfacesAt(px, py).some((f) => f.z > z + STEP && f.z <= z + 1.2 && !world.blocked(px, py, f.z));
  };
  if (onGround && (input.jump || (input.autoJump && hit && lowStep()))) {
    vz = JUMP;
    onGround = false;
  }
  if (!onGround) {
    // 重力：1フレームの中でも放物線どおりに（ジャンプの高さがフレームの長さで変わらない）
    const z1 = z + vz * dt - 0.5 * GRAVITY * dt * dt;
    vz = Math.max(-MAX_FALL, vz - GRAVITY * dt);
    const land = vz <= 0 ? world.floorBelow(x, y, z + AIR_STEP) : null; // いまの足より下の、いちばん高い足場
    if (land && z1 <= land.z) {
      z = land.z;
      vz = 0;
      onGround = true;
      deck = land.deck;
    } else z = z1;
  }
  return { ...s, x, y, z, vx, vy, vz, onGround, deck, yaw, stepUp, hit };
}

// 歩いているあいだの目の揺れ（Minecraft の「画面の揺れ」）：高さ height（m）と、向き yaw・pitch に足す角（度）
export function stepWalkView(w, distance, dt, fov, steady = false) {
  if (steady) {
    w.bobAmp = 0;
    return { height: 0, yaw: 0, pitch: 0 };
  }
  const speed = dt > 0 ? Math.min(SPEED.sprint, distance / dt) : 0;
  const strength = Math.sqrt(speed / SPEED.walk);
  w.bobAmp += (strength - w.bobAmp) * -Math.expm1(-dt * (strength > w.bobAmp ? 8 : 15));
  if (speed > 0.02) {
    const stepsPerSecond = 1.2 + 0.27 * speed;
    w.bobPhase = (w.bobPhase + Math.PI * stepsPerSecond * dt) % (2 * Math.PI);
  } else if (w.bobAmp < 0.002) {
    w.bobAmp = 0;
  }
  const stride = w.bobPhase;
  // Nearby scenery gets its gait from eye height. Keep residual head rotation
  // below half a pixel at 1080p, and keep a tracking camera on its target.
  const lens = w.moonScope ? 0 : Math.min(1, Math.tan(fov * DEG / 2) / Math.tan(WALK_FOV * DEG / 2));
  return {
    height: -0.025 * (1 - Math.cos(2 * stride)) * w.bobAmp,
    yaw: 0.018 * Math.sin(stride) * w.bobAmp * lens,
    pitch: 0.025 * Math.sin(2 * stride) * w.bobAmp * lens,
  };
}
