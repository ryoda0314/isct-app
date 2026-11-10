// 実物のコントローラー（2026-11-10、ユーザー「（実物とつながる3Dベンチ）これを利用して学内移動したい」）：
// Arduino Nano＋GY-521（6 軸の傾き）＋エンコーダ付きモータとタイヤ（Arduino には twin_arduino をそのまま書き込む）を Chrome・Edge の
// Web Serial（115200）でつなぎ、歩いて見る（campus3dWalk）の入力にする。
//   届く：20ms ごとに「D,roll,pitch,yaw（0.1 度）,カウント,目標カウント,PWM」
//   送る：T角度（タイヤを目標の角度まで回して止める）／Z（yaw とカウントを 0 に）／E・F（モータ ON・OFF）
// 動かし方：タイヤを手で回す → 前・後ろへ歩く（回す速さが歩く速さ、速く回すと走る）。基板を机の上で回す（yaw）→ 回した角度 × 向きの
// 感度（yawGain。初めは 1 倍）だけ向きが変わる。基板を前・後ろへ傾ける → 前・後ろへ歩く（傾けるほど速い）、左右に傾ける → 横へ。
// 手ごたえ：タイヤで壁に向かって進もうとすると、モータがタイヤをその角度で止める（壁の重さ）。後ろへ回すか、向きを変えて前があくか、
// 1 秒押さなければ放す。
// 向き合わせ（twinCalStart）：前に傾ける → 机の上で右に回す → タイヤを前へ回す、の 3 つで軸と向きを決めて localStorage に覚える。
// Arduino の int は 16 ビット：カウントは ±32767（タイヤ約 160 周）、yaw は ±3276.7° で一周する → 差は 16 ビットで戻して足す。
// 止めるときの目標（T）は Arduino のカウントのまま送り、一周しそうなら（タイヤを回していないときに）Z で 0 に戻す。
export const TWIN_BAUD = 115200;
export const TWIN_CPR = 205.3; // タイヤ 1 周のカウント（twin_arduino と同じ）
export const TWIN_SCALES = [1, 1.6, 2.5, 4]; // タイヤ 1 周で進む距離（m）の選べる値
// 向きの感度（基板を回した角度の何倍だけ歩く人が向くか）の選べる値。2 なら基板を 45° 回すと 90° 向く（ケーブルがあって大きく回しにくい）、
// 0.5 なら細かく向きを合わせられる
export const TWIN_YAW_GAINS = [0.5, 1, 1.5, 2, 3];
// 壁の固さ（twin_walk 第 3 版の K固さ,ふえ方,ダンピング：押しこみ x カウントで PWM = 固さ·x + ふえ方·x² + ダンピング·速さ）。
// モータと指のモデルで、摩擦が小さくても・押す力を変えても振動しない値（v723l/fw/wall_sim*.py・fw_port_sim.py）
export const TWIN_WALLS = ["soft", "mid", "hard"];
const WALL_K = { soft: "K10,1.5,0.15", mid: "K16,3,0.22", hard: "K20,4,0.3" };
const WALL_BAND = 4; // 止めているあいだ、壁から後ろへこのカウントまでのタイヤの動き（押しこみ・はね返り）では歩かない
const TILT_DEAD = 6; // 傾きの遊び（度）
const TILT_FULL = 24; // いちばん速くなる傾き（度）
const SPEED_WIN = 160; // タイヤの速さを測る時間（ms）
const STALE = 500; // これより長く届かなければ止める（ms）
const HOLD_MAX = 30000; // これより大きいカウントでは止めない（止めているあいだに一周すると、モータが反対へ回り続ける）
const RECENTER = 20000; // タイヤを回していないとき、これより大きいカウントは Z で 0 に戻す
const LS_KEY = "cb3Twin";
const wrap16 = (d) => ((((d + 32768) % 65536) + 65536) % 65536) - 32768;

const DEFAULT_CAL = { fwd: "pitch", fwdSign: 1, sideSign: 1, yawSign: -1, tireSign: 1, mpt: 1.6, yawGain: 1, wall: "mid", tilt: true, haptic: true };
function loadCal() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (v && (v.fwd === "pitch" || v.fwd === "roll") && [v.fwdSign, v.sideSign, v.yawSign, v.tireSign].every((s) => s === 1 || s === -1)) {
      const c = { ...DEFAULT_CAL, ...v };
      if (!TWIN_SCALES.includes(c.mpt)) c.mpt = DEFAULT_CAL.mpt;
      if (!TWIN_YAW_GAINS.includes(c.yawGain)) c.yawGain = DEFAULT_CAL.yawGain;
      if (!TWIN_WALLS.includes(c.wall)) c.wall = DEFAULT_CAL.wall;
      c.tilt = c.tilt !== false;
      c.haptic = c.haptic !== false;
      return c;
    }
  } catch {
    /* 保存できないブラウザ・サーバー */
  }
  return { ...DEFAULT_CAL };
}
function saveCal(cal) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cal));
  } catch {
    /* 保存できないブラウザ */
  }
}

// 状態（つないでいる口・届いた値・向き合わせ・手ごたえ）
export function twinCreate() {
  return {
    port: null, writer: null, reader: null, connected: false, fake: false, got: false, gotAt: 0, t: 0, err: "",
    roll: 0, pitch: 0, yaw: 0, raw: 0, target: 0, pwm: 0, lines: 0,
    acc: 0, // 16 ビットの一周を戻したカウント（つないでから足していく）
    hist: [], // 直近の { t, acc }
    zero: null, // 平らに置いたときの傾き { roll, pitch }
    lastYaw: null, inAt: 0,
    cal: loadCal(), calStep: null, calBase: null, calAt: 0, calDoneAt: 0,
    hold: null, blockT: 0, quietAt: 0, holdAt: 0, idleAt: 0, zPend: null,
    // Arduino のスケッチ：V の返事「V,twin_walk,1」が来れば壁のコマンド W がある（fw）。届きはじめて 1.5 秒返事がなければ
    // twin_arduino とみなす（fwChecked）。warn：押し返していない（"power"。12V の電源・モータの線の向き）
    fw: null, fwVer: "", fwChecked: false, warn: "", warnAt: 0,
    sent: [], // 送ったコマンド（確かめ用。最後の 30）
    onChange: null, // 状態が変わったとき（画面の作り直し）
  };
}
const changed = (T) => T.onChange && T.onChange(T);

// 1 行を入れる。now は performance.now()（ms）。"D,..."（20ms ごとの値）・"V,名前,版"（スケッチの名前）・"W,カウント"（壁で止めたカウント）
export function twinFeed(T, line, now) {
  if (!line) return false;
  if (line.startsWith("V,")) {
    const [, name, ver] = line.split(",");
    if (!name) return false;
    T.fw = name.trim();
    T.fwVer = (ver || "").trim();
    T.fwChecked = true;
    changed(T);
    return true;
  }
  if (line.startsWith("W,")) {
    const c = Number(line.slice(2));
    if (T.hold != null && Number.isFinite(c)) T.hold = c; // Arduino が実際に止めたカウント
    return Number.isFinite(c);
  }
  if (!line.startsWith("D,")) return false;
  const v = line.split(",").slice(1).map(Number);
  if (v.length < 6 || v.some((x) => !Number.isFinite(x))) return false;
  const raw = v[3];
  let d = T.lines ? wrap16(raw - T.raw) : 0;
  // Z が効いた（大きかったカウントが 0 の近くへ）：そのあと回ったぶんだけ足す。yaw も 0 に戻ったので向きはとり直す
  if (T.zPend && T.lines && Math.abs(raw) < 2000 && Math.abs(T.raw) > RECENTER - 2000) {
    d = raw;
    T.lastYaw = null;
    T.zPend = null;
  } else if (T.zPend && now - T.zPend > 1500) T.zPend = null; // 届かなかった
  T.roll = v[0] / 10;
  T.pitch = v[1] / 10;
  T.yaw = v[2] / 10;
  T.raw = raw;
  T.target = v[4];
  T.pwm = v[5];
  T.t = now;
  T.lines++;
  T.acc += d;
  T.hist.push({ t: now, acc: T.acc });
  while (T.hist.length > 2 && now - T.hist[0].t > 600) T.hist.shift();
  if (!T.got) {
    T.got = true;
    T.gotAt = now;
    changed(T);
  }
  // 平ら：届きはじめて 1 秒（Arduino がジャイロのオフセットを取り終えて落ち着いたころ）の傾き
  if (!T.zero && now - T.gotAt > 1000) {
    T.zero = { roll: T.roll, pitch: T.pitch };
    changed(T);
  }
  if (!T.fwChecked && now - T.gotAt > 1500) {
    T.fwChecked = true; // V に返事がない：twin_arduino（壁は T の弱い PD）
    changed(T);
  }
  calCheck(T, now);
  return true;
}

// 平らを今の傾きに（向き・タイヤはそのまま）
export function twinLevel(T) {
  if (!T.got) return;
  T.zero = { roll: T.roll, pitch: T.pitch };
  changed(T);
}

// タイヤの回る速さ（カウント/秒。Arduino のカウントの向きのまま）
function countRate(T, now) {
  const h = T.hist;
  if (h.length < 2 || now - T.t > STALE) return 0;
  const last = h[h.length - 1];
  let k = h.length - 1;
  while (k > 0 && last.t - h[k - 1].t <= SPEED_WIN) k--;
  const first = h[Math.max(0, k - 1)];
  const dt = (last.t - first.t) / 1000;
  if (!(dt > 0.03)) return 0;
  return (last.acc - first.acc) / dt;
}
// タイヤの速さ（m/s。前が +）
export function twinTireSpeed(T, now) {
  return ((countRate(T, now) / TWIN_CPR) * T.cal.mpt * T.cal.tireSign);
}

const ramp = (d) => {
  const a = Math.abs(d);
  return a < TILT_DEAD ? 0 : Math.sign(d) * Math.min(1, (a - TILT_DEAD) / (TILT_FULL - TILT_DEAD));
};
// 傾き（平らからの差。前・右が +、度）
export function twinTilt(T) {
  const z = T.zero || { roll: T.roll, pitch: T.pitch };
  const dr = T.roll - z.roll;
  const dp = T.pitch - z.pitch;
  const C = T.cal;
  return C.fwd === "pitch" ? { fwd: dp * C.fwdSign, side: dr * C.sideSign } : { fwd: dr * C.fwdSign, side: dp * C.sideSign };
}

// 1 フレームぶんの入力 { fwd, side（-1〜1）, dYaw（歩く人の向き（北から右回り）に足す度）, sprint, tireV（m/s） }。
// speed は歩く・走る速さ（campus3dWalk の SPEED）。届いていなければ null
export function twinInput(T, now, speed = { walk: 4.3, sprint: 5.6 }) {
  const gap = now - T.inAt;
  T.inAt = now;
  if (!T.connected || !T.got || now - T.t > STALE) {
    T.lastYaw = null;
    return null;
  }
  if (gap > 250) T.lastYaw = null; // しばらく使っていなかった（歩いていなかった）あいだに回したぶんは足さない
  const calib = T.calStep != null;
  let tireV = calib ? 0 : twinTireSpeed(T, now);
  // 壁で止めているあいだ：壁へ押しこんだ・はね返ったタイヤの小さな動きでは歩かない（画面がゆれない）。後ろへ WALL_BAND より回したら下がる
  if (T.hold != null && wrap16(T.raw - T.hold) * T.cal.tireSign > -WALL_BAND) tireV = 0;
  const tl = twinTilt(T);
  const tiltOn = T.cal.tilt && T.zero && !calib;
  let dYaw = 0;
  if (T.lastYaw != null && !calib) {
    const dy = T.yaw - T.lastYaw;
    // yaw の一周（±3276.7°）・Z で 0 に戻ったときの跳びは足さない（感度をかける前の角度で見る）
    if (Math.abs(dy) <= 90) dYaw = dy * T.cal.yawSign * T.cal.yawGain;
  }
  T.lastYaw = T.yaw;
  // 速さ：タイヤの速さそのまま（歩く速さを超えたら走る。走る速さまで）＋傾き
  const sprint = tireV > speed.walk * 1.02;
  const tireF = sprint ? Math.min(1, tireV / speed.sprint) : tireV / speed.walk;
  const fwd = Math.max(-1, Math.min(1, tireF + (tiltOn ? ramp(tl.fwd) : 0)));
  // タイヤを回していない（Z で 0 に戻してよい）時刻
  if (Math.abs(tireV) > 0.05) T.idleAt = now;
  return { fwd, side: tiltOn ? ramp(tl.side) : 0, dYaw, sprint, tireV };
}

// 手ごたえ：タイヤで前へ進もうとして壁に当たる（blocked が 0.04 秒続く）と、タイヤを止める。
//  twin_walk（V に返事がある）：W向き。Arduino がその場のカウントで止め、前へ押しこまれた 1 カウントから強く押し返す（後ろへは回せる）。
//    前があいた（free）・手ごたえを切った、で放す（F）。押されていなければ電気は流れないので、壁の前にいるあいだは止めたまま
//  twin_arduino：T角度（PD の kp 3.6 で弱い）。止める角度は、コマンドが届くまで（約 0.05 秒）に回るぶん先。前後どちらへも
//    同じ力なので、後ろへ 8 カウント（約 14°）回した・1 秒押していない、でも放す
// どちらも、PWM は大きいのに 60 カウント（約 105°）より押しこまれたら放して warn "power"（モータに 12V が来ていない・線が逆）。
// 止めていないとき、カウントが大きくなっていてタイヤを 0.5 秒回していなければ Z で 0 に戻す
export function twinHaptics(T, { blocked = false, free = true, dt = 0 }, now, send) {
  if (!T.connected || !T.got) return;
  if (T.warn && now - T.warnAt > 6000) {
    T.warn = "";
    changed(T);
  }
  const walkFw = T.fw === "twin_walk";
  if (T.hold == null) {
    T.blockT = blocked ? T.blockT + dt : 0;
    const resting = T.warn === "power" && now - T.warnAt < 3000; // 押し返さなかったすぐあとは、止めなおさない
    if (T.cal.haptic && T.blockT > 0.04 && Math.abs(T.raw) < HOLD_MAX && !resting) {
      if (walkFw) {
        T.hold = T.raw; // Arduino が「W,カウント」で返すまでの仮
        send("W" + T.cal.tireSign);
      } else {
        const ahead = Math.max(-30, Math.min(30, Math.round(countRate(T, now) * 0.05)));
        T.hold = T.raw + ahead;
        send("T" + ((T.hold / TWIN_CPR) * 360).toFixed(1));
      }
      T.holdAt = now;
      T.quietAt = now;
      changed(T);
    } else if (!T.zPend && Math.abs(T.raw) > RECENTER && now - T.idleAt > 500 && T.calStep == null) {
      T.zPend = now;
      send("Z");
    }
    return;
  }
  const push = wrap16(T.raw - T.hold) * T.cal.tireSign; // 前へ押しこんだ（+）・後ろへ回した（-）カウント
  if (push > 60 && Math.abs(T.pwm) >= 150) {
    T.warn = "power";
    T.warnAt = now;
    twinRelease(T, send);
    return;
  }
  if (Math.abs(push) > 2) T.quietAt = now;
  const release = walkFw ? !T.cal.haptic || free : !T.cal.haptic || free || (push < -8 && now - T.holdAt > 250) || now - T.quietAt > 1000;
  if (release) twinRelease(T, send);
}
export function twinRelease(T, send) {
  if (T.hold == null) return;
  T.hold = null;
  T.blockT = 0;
  send("F");
  changed(T);
}

// 設定（傾けて歩く・手ごたえ・1 周の距離・向きの感度・壁の固さ）。壁の固さは twin_walk につないでいればすぐ送る
export function twinSet(T, patch) {
  T.cal = { ...T.cal, ...patch };
  saveCal(T.cal);
  if ("wall" in patch && T.connected && T.fw === "twin_walk") twinSend(T, WALL_K[T.cal.wall] || WALL_K.mid);
  changed(T);
}

// 届いた 1 行を入れて、返事をする（つないだ口からも、確かめ用の口なしからも）：
//  最初の D 行のあと F（前に使ったときモータが ON のままでも、タイヤを手で回せるように）と V（twin_walk なら「V,twin_walk,版」が返る）。
//  つないだとき Arduino が再起動するなら、ブートローダーのあいだに送ると届かないので、最初の行が届いて（スケッチが動いて）から。
//  「V,twin_walk,…」が来たら壁の固さ（K）を送る
export function twinLine(T, line, now) {
  const ok = twinFeed(T, line, now);
  if (T.got && !T.sentF) {
    T.sentF = true;
    twinSend(T, "F");
    twinSend(T, "V");
  }
  if (ok && line.startsWith("V,") && T.fw === "twin_walk") twinSend(T, WALL_K[T.cal.wall] || WALL_K.mid);
  return ok;
}

// 向き合わせ：前に傾ける → 机の上で右に回す → タイヤを前へ回す（20 秒で止める）
export function twinCalStart(T) {
  if (!T.got) return;
  T.calStep = "tilt";
  T.calBase = { roll: T.roll, pitch: T.pitch, yaw: T.yaw, acc: T.acc };
  T.calAt = T.t;
  changed(T);
}
export function twinCalCancel(T) {
  T.calStep = null;
  T.calBase = null;
  changed(T);
}
function calCheck(T, now) {
  if (!T.calStep || !T.calBase) return;
  if (now - T.calAt > 20000) {
    twinCalCancel(T);
    return;
  }
  const B = T.calBase;
  if (T.calStep === "tilt") {
    const dr = T.roll - B.roll;
    const dp = T.pitch - B.pitch;
    if (Math.max(Math.abs(dr), Math.abs(dp)) < 12) return;
    const c = Math.abs(dp) >= Math.abs(dr) ? { fwd: "pitch", fwdSign: dp > 0 ? 1 : -1 } : { fwd: "roll", fwdSign: dr > 0 ? 1 : -1 };
    // 横は前に直角の軸。GY-521 の Z が上（部品の面が上）なら右手系で：pitch が前 +（X が前）→ Y は左 → 右に傾けると roll +。
    // pitch が前 −（X が後ろ）→ roll −。roll が前 +（Y が後ろ・X が左）→ 右に傾けると pitch −。roll が前 −（X が右）→ pitch +
    c.sideSign = c.fwd === "pitch" ? c.fwdSign : -c.fwdSign;
    T.cal = { ...T.cal, ...c };
    T.calStep = "yaw";
    T.calBase = { ...B, yaw: T.yaw };
    T.calAt = now;
    changed(T);
  } else if (T.calStep === "yaw") {
    const dy = T.yaw - B.yaw;
    if (Math.abs(dy) < 30 || Math.abs(dy) > 1000) return;
    T.cal = { ...T.cal, yawSign: dy > 0 ? 1 : -1 };
    T.calStep = "tire";
    T.calBase = { ...B, acc: T.acc };
    T.calAt = now;
    changed(T);
  } else if (T.calStep === "tire") {
    const dc = T.acc - B.acc;
    if (Math.abs(dc) < TWIN_CPR / 4) return;
    T.cal = { ...T.cal, tireSign: dc > 0 ? 1 : -1 };
    T.calStep = null;
    T.calBase = null;
    T.calDoneAt = now;
    T.lastYaw = null;
    saveCal(T.cal);
    changed(T);
  }
}

// ── つなぐ（Web Serial） ──
export const twinSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

function resetLink(T) {
  T.got = false;
  T.sentF = false;
  T.fw = null;
  T.fwVer = "";
  T.fwChecked = false;
  T.warn = "";
  T.zero = null;
  T.hist = [];
  T.lines = 0;
  T.acc = 0;
  T.lastYaw = null;
  T.hold = null;
  T.blockT = 0;
  T.zPend = null;
  T.calStep = null;
  T.calBase = null;
  T.err = "";
}

// つなぐ（クリックの中で呼ぶ）：前に許可した口が 1 つならそれ、なければ選ぶ画面。onLine は 1 行ごと（ふつうは twinLine）
export async function twinConnect(T, onLine) {
  if (!twinSupported()) throw new Error("no-serial");
  const ports = await navigator.serial.getPorts();
  const port = ports.length === 1 ? ports[0] : await navigator.serial.requestPort();
  await port.open({ baudRate: TWIN_BAUD });
  T.port = port;
  T.writer = port.writable.getWriter();
  resetLink(T);
  T.connected = true;
  T.fake = false;
  changed(T);
  T.loop = readLoop(T, onLine);
}
// 読み続ける。終わる（抜いた・切った）と、読み口のロックが外れてから resolve する
async function readLoop(T, onLine) {
  const port = T.port;
  const dec = new TextDecoderStream();
  const done = port.readable.pipeTo(dec.writable).catch(() => {});
  const reader = dec.readable.getReader();
  T.reader = reader;
  let buf = "";
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
      if (buf.length > 4096) buf = "";
    }
  } catch {
    /* 抜いた・切った */
  }
  await done;
  // 抜かれた（切るを押したときは twinDisconnect が片づける）
  if (T.port === port && T.connected) {
    try {
      T.writer?.releaseLock();
    } catch {
      /* すでに */
    }
    try {
      await port.close();
    } catch {
      /* すでに */
    }
    T.port = T.writer = T.reader = null;
    T.connected = false;
    resetLink(T);
    T.err = "lost";
    changed(T);
  }
}
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
export function twinSend(T, cmd) {
  T.sent.push(cmd);
  if (T.sent.length > 30) T.sent.shift();
  if (!T.writer || !enc) return Promise.resolve();
  return T.writer.write(enc.encode(cmd + "\n")).catch(() => {});
}
export async function twinDisconnect(T) {
  const port = T.port;
  if (T.connected) await twinSend(T, "F");
  T.connected = false;
  try {
    if (T.reader) await T.reader.cancel();
    if (T.loop) await T.loop; // 読み口のロックが外れるまで（外れる前に閉じると close が失敗して、次につなげない）
  } catch {
    /* すでに */
  }
  T.loop = null;
  try {
    T.writer?.releaseLock();
  } catch {
    /* すでに */
  }
  try {
    if (port) await port.close();
  } catch {
    /* すでに */
  }
  T.port = T.writer = T.reader = null;
  T.fake = false;
  resetLink(T);
  changed(T);
}

// 確かめ用（デバッグの道具があるときだけ使う）：口なしでつないだことにして、行は twinFeed で入れる
export function twinFake(T) {
  resetLink(T);
  T.connected = true;
  T.fake = true;
  changed(T);
}
