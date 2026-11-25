// キャンパスロワイヤルの効果音。音声ファイルは足さず、Web Audio でその場で合成する。
//
// 流れ：1 回ぶんの音（声）→ [遠い音だけ低域通過] → [左右] ─┬→ 原音 ──────────────────────┐
//                                                    ├→ 残響（作った約 1.2 秒のステレオ IR を畳み込む）┼→ マスター → ゆるいコンプ → 安全のソフトクリップ → 出力
//                                                    └→ やまびこ（建物の反射。左右で遅れの違うピンポン）┘
// 撃つ音は層を重ねる：アタックのクリック・高い「パキッ」・周波数が下がる帯域ノイズの胴・ピッチの落ちる低い「ドン」
// （歪ませてスマホでも聞こえる倍音を足す）・エネルギーの「ザップ」（FM のスイープ）・電気の「パチパチ」・低い尾・自分の銃だけの機械音。
// ほかの人の音は音速（343 m/s）で遅らせ、距離で小さく・こもらせ（約 16 kHz → 150 m で 1.5 kHz）、残響の割合を増やす。
// 150 m より遠い撃つ音・30 m より遠い足音は鳴らさない。同時に鳴る単発音は 24 まで（超えたら、いちばん小さく古い音を短く消す）。
// AudioContext ははじめのタップ・クリック（unlock）で作る（ブラウザの決まり）。止まっていれば呼ばれるたびに resume し、
// 止まっているあいだの単発音は予約しない（再開したときにまとめて鳴らないように）。
// createRoyaleAudio({ context }) で AudioContext / OfflineAudioContext を渡せる（テスト・共有用。渡した物は close で閉じない）。

const SPEED = 343; // 音速 m/s
const MAX_VOICES = 24;
const SHOT_FAR = 150;
const STEP_FAR = 30;
const LEAD = 0.004; // 予約の前置き（秒）
const MASTER = 0.47;
const POST = 1;
const WIND_LV = 0.35;
const PLANE_LV = 0.32;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fin = (x, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const isOffline = (c) => typeof c?.startRendering === "function";

// 装備ごとの音。lv 全体の大きさ、far 遠くまで届く度合い、rev/echo 残響・やまびこへ送る量、vr 1 発ごとの高さの揺らぎ。
// click [f, g]、crack 高域ノイズ、body 帯域ノイズの胴（f0→f1）、punch 中低域のノイズ、thump 低いドン（f0→f1 を sw 秒で、
// drive は歪み）、zap FM のスイープ（fr 比、i 深さ）、fizz 電気のパチパチ、tail 低い尾、wide 左右への広がり。
// d はどれも −60 dB までの秒。ノイズの g は帯域をならした後の大きさ（白色ノイズ全帯域 = 1）。
const GUN = {
  fist: { lv: 0.22, far: 0.35, rev: 0.04, echo: 0, vr: 0.06 },
  pistol: {
    lv: 0.74, far: 1, rev: 0.15, echo: 0.06, vr: 0.035,
    click: { f: 3600, g: 0.8 },
    crack: { f: 3600, d: 0.024, g: 0.6 },
    body: { f0: 2800, f1: 700, d: 0.085, q: 0.9, g: 0.7 },
    punch: { f: 1000, d: 0.055, g: 0.5 },
    thump: { f0: 185, f1: 62, sw: 0.045, d: 0.1, drive: 2.6, g: 0.4 },
    zap: { f0: 2100, f1: 250, d: 0.12, fr: 1.41, i: 3.2, g: 0.26 },
    fizz: { f: 4200, d: 0.12, g: 0.09 },
    tail: { f: 1100, d: 0.3, g: 0.1 },
  },
  smg: {
    lv: 0.88, far: 0.85, rev: 0.1, echo: 0.035, vr: 0.045,
    click: { f: 4200, g: 0.7 },
    crack: { f: 4400, d: 0.018, g: 0.55 },
    body: { f0: 3400, f1: 1100, d: 0.055, q: 1, g: 0.65 },
    punch: { f: 1200, d: 0.04, g: 0.45 },
    thump: { f0: 215, f1: 85, sw: 0.03, d: 0.065, drive: 2.2, g: 0.32 },
    zap: { f0: 2600, f1: 430, d: 0.07, fr: 1.5, i: 2.6, g: 0.22 },
    fizz: { f: 5200, d: 0.06, g: 0.08 },
    tail: null,
  },
  ar: {
    lv: 0.8, far: 1.15, rev: 0.17, echo: 0.08, vr: 0.03,
    click: { f: 3200, g: 0.65 },
    crack: { f: 3400, d: 0.03, g: 0.6 },
    body: { f0: 2500, f1: 520, d: 0.1, q: 0.85, g: 0.7 },
    punch: { f: 900, d: 0.065, g: 0.55 },
    thump: { f0: 165, f1: 54, sw: 0.055, d: 0.12, drive: 3, g: 0.42 },
    zap: { f0: 1600, f1: 175, d: 0.14, fr: 2.73, i: 2.8, g: 0.24 },
    fizz: { f: 3800, d: 0.14, g: 0.09 },
    tail: { f: 900, d: 0.4, g: 0.14 },
  },
  shotgun: {
    lv: 0.66, far: 1.3, rev: 0.24, echo: 0.12, vr: 0.03, wide: 0.55,
    click: { f: 2600, g: 0.75 },
    crack: { f: 2900, d: 0.04, g: 0.65 },
    body: { f0: 2000, f1: 320, d: 0.18, q: 0.7, g: 0.75 },
    punch: { f: 750, d: 0.1, g: 0.7 },
    thump: { f0: 125, f1: 44, sw: 0.09, d: 0.22, drive: 4, g: 0.5 },
    zap: { f0: 1000, f1: 90, d: 0.18, fr: 1.41, i: 3.5, g: 0.22 },
    fizz: { f: 3200, d: 0.22, g: 0.11 },
    tail: { f: 650, d: 0.6, g: 0.22 },
  },
  sniper: {
    lv: 0.7, far: 1.7, rev: 0.32, echo: 0.2, vr: 0.02,
    click: { f: 4500, g: 0.9 },
    crack: { f: 3200, d: 0.05, g: 0.75 },
    body: { f0: 2600, f1: 300, d: 0.22, q: 0.75, g: 0.75 },
    punch: { f: 850, d: 0.11, g: 0.65 },
    thump: { f0: 145, f1: 40, sw: 0.12, d: 0.3, drive: 4.5, g: 0.5 },
    zap: { f0: 3400, f1: 130, d: 0.32, fr: 2.73, i: 4, g: 0.24 },
    fizz: { f: 4500, d: 0.45, g: 0.1 },
    tail: { f: 520, d: 1.1, g: 0.26 },
    ring: { f: 2950, d: 0.9, g: 0.045 },
  },
};

// ---- バッファ（文脈ごとに 1 回だけ作って使い回す） ----

// ループできるノイズ（終わりを頭へ 40 ms で重ねて継ぎ目を消す）。RMS は 0.5 にそろえる。
function makeNoise(ac, sec, color, chans) {
  const sr = ac.sampleRate;
  const n = Math.max(512, Math.floor(sr * sec));
  const x = Math.floor(sr * 0.04);
  const buf = ac.createBuffer(chans, n, sr);
  for (let c = 0; c < chans; c++) {
    const raw = new Float32Array(n + x);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n + x; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "pink") {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      } else if (color === "brown") {
        br = (br + 0.02 * w) / 1.02;
        raw[i] = br;
      } else raw[i] = w;
    }
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = raw[i];
    for (let i = 0; i < x; i++) {
      const k = i / x;
      d[i] = raw[i] * k + raw[n + i] * (1 - k);
    }
    let m = 0;
    for (let i = 0; i < n; i++) m += d[i];
    m /= n;
    let e = 0;
    for (let i = 0; i < n; i++) {
      d[i] -= m;
      e += d[i] * d[i];
    }
    const s = 0.5 / Math.sqrt(e / n || 1);
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  return buf;
}

// 12 ms のアタック（減衰するノイズ＋減衰する 2.2 kHz）。ピーク 1。
function makeClick(ac) {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * 0.012);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.0011) + Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t / 0.0016) * 0.8;
    pk = Math.max(pk, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= pk || 1;
  return buf;
}

// 電気のパチパチ：まばらな火花（指数分布の間隔、1 つずつ短く減衰）。RMS 0.5。
function makeCrackle(ac, sec) {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * sec);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const rate = 700;
  let i = 0;
  while (i < n) {
    i += Math.floor((-Math.log(1 - Math.random()) * sr) / rate) + 1;
    const amp = Math.random() ** 2 * (Math.random() < 0.5 ? -1 : 1);
    const len = 4 + Math.floor(Math.random() * 18);
    for (let j = 0; j < len && i + j < n; j++) d[i + j] += amp * Math.exp(-j / (len * 0.3)) * (j % 2 ? -0.7 : 1);
  }
  let e = 0;
  for (let k = 0; k < n; k++) {
    d[k] += (Math.random() * 2 - 1) * 0.03;
    e += d[k] * d[k];
  }
  const s = 0.5 / Math.sqrt(e / n || 1);
  for (let k = 0; k < n; k++) d[k] *= s;
  return buf;
}

// 残響のインパルス：建物の初期反射＋後ろほど暗くなる減衰ノイズ（左右で別のノイズ＝広がり）。
// 暗い IR は中低域に寄るので、全体のエネルギーを 1/8 にして中域の増幅がほぼ 1 になるようにする。
function makeIR(ac, sec) {
  const sr = ac.sampleRate;
  const n = Math.max(2, Math.floor(sr * sec));
  const buf = ac.createBuffer(2, n, sr);
  let e = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(sr * (0.007 + ch * 0.0013));
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const fc = 8500 * Math.pow(1300 / 8500, t / sec);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      y = a * y + (1 - a) * (Math.random() * 2 - 1);
      const g = Math.exp(-t / 0.17) * (t < 0.03 ? t / 0.03 : 1) * (1 - smooth((t - (sec - 0.15)) / 0.15));
      d[i] = y * Math.sqrt((1 + a) / (1 - a)) * g * 0.6;
    }
    for (let k = 0; k < 16; k++) {
      const tt = 0.011 + Math.random() ** 1.6 * 0.15;
      const amp = (Math.random() < 0.5 ? -1 : 1) * rnd(0.35, 1) * Math.exp(-tt / 0.09);
      const i0 = Math.floor(tt * sr);
      for (let j = 0; j < 40 && i0 + j < n; j++) d[i0 + j] += amp * Math.exp(-j / 6) * (j ? (Math.random() * 2 - 1) * 0.5 : 1);
    }
    for (let i = 0; i < n; i++) e += d[i] * d[i];
  }
  const s = Math.sqrt(1 / 8) / Math.sqrt(e / 2 || 1);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  return buf;
}

// 出口の安全装置：0.75 まではそのまま、その先はなめらかに 0.985 で頭打ち（前段で半分にして ±2 まで受ける）。
function softClip() {
  const n = 4097;
  const c = new Float32Array(n);
  const T = 0.75;
  const L = 0.985;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= T ? a : T + (L - T) * Math.tanh((a - T) / (L - T));
    c[i] = x < 0 ? -y : y;
  }
  return c;
}

const driveCurves = new Map();
function driveCurve(k) {
  const key = Math.round(k * 10) / 10;
  let c = driveCurves.get(key);
  if (!c) {
    c = new Float32Array(1025);
    const th = Math.tanh(key);
    for (let i = 0; i < 1025; i++) c[i] = Math.tanh(key * ((i / 1024) * 2 - 1)) / th;
    driveCurves.set(key, c);
  }
  return c;
}

/**
 * @param opts { context?: AudioContext | OfflineAudioContext（渡せばそれを使い、close でも閉じない）, volume?: 0..2 }
 */
export function createRoyaleAudio(opts) {
  const cfg = opts && typeof opts === "object" ? opts : {};
  const given = cfg.context || null;
  const vol0 = clamp(fin(cfg.volume, 1), 0, 2);
  let ac = null;
  let E = null;
  let closed = false;
  let failed = false;
  const voices = [];
  let maxSeen = 0;
  let wl = null; // 落下の風
  let pl = null; // 飛行機

  function boot() {
    if (closed) return null;
    if (!ac) {
      if (failed) return null;
      let c = given;
      try {
        if (!c) {
          const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AC) {
            failed = true;
            return null;
          }
          c = new AC();
        }
        E = build(c, vol0);
        ac = c;
      } catch {
        failed = true;
        E = null;
        if (c && c !== given) {
          try { c.close?.()?.catch?.(() => {}); } catch { /* なし */ }
        }
        return null;
      }
    }
    if (ac.state === "closed") return null;
    if (!isOffline(ac) && ac.state !== "running") {
      try { ac.resume?.()?.catch?.(() => {}); } catch { /* 次のタップで */ }
    }
    return ac;
  }
  const live = () => isOffline(ac) || ac.state === "running";

  function build(c, vol) {
    const e = { pan: typeof c.createStereoPanner === "function" };
    const master = c.createGain();
    master.gain.value = MASTER * vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 2.5;
    // Chrome のコンプは検出器が 0 から始まり、はじめて通る音を約 11 dB 下げてしまう（入力が無音のあいだは処理されず、そのまま残る）。
    // 起動直後の 0.15 秒だけ「遅いアタック・速いリリース」にし、−100 dB の直流で一度回して戻しておく。
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    try {
      const t = c.currentTime;
      comp.attack.setValueAtTime(1, t);
      comp.release.setValueAtTime(0.01, t);
      comp.attack.setValueAtTime(0.003, t + 0.15);
      comp.release.setValueAtTime(0.18, t + 0.15);
      if (typeof c.createConstantSource === "function") {
        const k = c.createConstantSource();
        k.offset.value = 1e-5;
        k.connect(comp);
        k.start(t);
        k.stop(t + 0.3);
      }
    } catch {
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
    }
    const post = c.createGain();
    post.gain.value = POST * 0.5;
    const clip = c.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = "none";
    master.connect(comp);
    comp.connect(post);
    post.connect(clip);
    clip.connect(c.destination);
    // 残響
    const rvIn = c.createGain();
    const rvHp = c.createBiquadFilter();
    rvHp.type = "highpass";
    rvHp.frequency.value = 170;
    rvHp.Q.value = 0;
    const conv = c.createConvolver();
    conv.normalize = false;
    conv.buffer = makeIR(c, 1.25);
    rvIn.connect(rvHp);
    rvHp.connect(conv);
    conv.connect(master);
    // やまびこ（左 0.21 s・右 0.32 s、たがいに戻してピンポン、戻るたびに暗く。半分は残響へ流してにじませる）
    const ecIn = c.createGain();
    ecIn.channelCount = 1;
    ecIn.channelCountMode = "explicit";
    const ecHp = c.createBiquadFilter();
    ecHp.type = "highpass";
    ecHp.frequency.value = 300;
    ecHp.Q.value = 0;
    const dl = c.createDelay(1);
    const dr = c.createDelay(1);
    dl.delayTime.value = 0.21;
    dr.delayTime.value = 0.32;
    const fl = c.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = 1900;
    fl.Q.value = 0;
    const fr = c.createBiquadFilter();
    fr.type = "lowpass";
    fr.frequency.value = 1500;
    fr.Q.value = 0;
    const kl = c.createGain();
    const kr = c.createGain();
    kl.gain.value = 0.24;
    kr.gain.value = 0.24;
    const mg = c.createChannelMerger(2);
    const ecRv = c.createGain();
    ecRv.gain.value = 0.55;
    ecIn.connect(ecHp);
    ecHp.connect(dl);
    ecHp.connect(dr);
    dl.connect(fl);
    fl.connect(mg, 0, 0);
    fl.connect(kl);
    kl.connect(dr);
    dr.connect(fr);
    fr.connect(mg, 0, 1);
    fr.connect(kr);
    kr.connect(dl);
    mg.connect(master);
    mg.connect(ecRv);
    ecRv.connect(rvIn);
    Object.assign(e, { master, clip, rvIn, ecIn });
    e.white = makeNoise(c, 2, "white", 1);
    e.pink = makeNoise(c, 2, "pink", 1);
    e.brown = makeNoise(c, 2, "brown", 1);
    e.click = makeClick(c);
    e.crackle = makeCrackle(c, 1.5);
    return e;
  }

  // ---- 声（1 回ぶんの音）と、その管理 ----

  function voice(t0, o) {
    const now = ac.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
    const vol = o.vol ?? 1;
    const lv = vol * Math.max(o.dry ?? 1, o.rev ?? 0) * (o.prio ?? 1);
    if (voices.length >= MAX_VOICES) {
      let wi = -1;
      let wv = Infinity;
      for (let i = 0; i < voices.length; i++) {
        const u = voices[i];
        const s = now <= u.t0 ? u.lv : u.lv * Math.exp((-3 * (now - u.t0)) / Math.max(0.05, u.end - u.t0));
        if (s < wv) {
          wv = s;
          wi = i;
        }
      }
      if (lv <= wv) return null; // 新しい音がいちばん小さい
      hush(voices.splice(wi, 1)[0], now);
    }
    const g = ac.createGain();
    g.gain.value = vol;
    const outs = [g];
    let n = g;
    if (o.lp > 0 && o.lp < 18000) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      f.Q.value = 0;
      n.connect(f);
      n = f;
      outs.push(f);
    }
    if (o.pan && E.pan) {
      // 等パワーの左右振りは真ん中で各 0.707 になるので √2 倍して、振らない音（各 1）と同じ大きさにそろえる
      g.gain.value = vol * Math.SQRT2;
      const p = ac.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      n.connect(p);
      n = p;
      outs.push(p);
    }
    const send = (amt, dst) => {
      if (!(amt > 0)) return;
      if (amt === 1) {
        n.connect(dst);
        return;
      }
      const s = ac.createGain();
      s.gain.value = amt;
      n.connect(s);
      s.connect(dst);
      outs.push(s);
    };
    send(o.dry ?? 1, E.master);
    send(o.rev ?? 0, E.rvIn);
    send(o.echo ?? 0, E.ecIn);
    const v = { t0, in: g, g, outs, srcs: [], end: t0, lv, last: null };
    voices.push(v);
    if (voices.length > maxSeen) maxSeen = voices.length;
    return v;
  }
  function track(v, s, end) {
    v.srcs.push(s);
    if (end >= v.end) {
      v.end = end;
      v.last = s;
    }
  }
  function seal(v) {
    if (v.last) v.last.onended = () => cleanup(v);
    else cleanup(v);
  }
  function cleanup(v) {
    for (const n of v.outs) {
      try { n.disconnect(); } catch { /* 済み */ }
    }
    v.outs.length = 0;
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }
  function hush(v, now) {
    try {
      const p = v.g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 0.012);
    } catch { /* なし */ }
    for (const s of v.srcs) {
      try { s.stop(now + 0.016); } catch { /* 止まっている */ }
    }
    v.end = now + 0.016;
  }

  // ---- 部品：周波数の動き・包絡・ノイズ・音程・クリック ----

  const F = (f) => clamp(f, 20, ac.sampleRate * 0.45);
  // spec は数か [[値, 秒], …]（指数で結ぶ）
  function pts(p, at, spec, k = 1) {
    if (Array.isArray(spec)) {
      p.setValueAtTime(F(spec[0][0] * k), at + (spec[0][1] || 0));
      for (let i = 1; i < spec.length; i++) p.exponentialRampToValueAtTime(F(spec[i][0] * k), at + spec[i][1]);
    } else p.setValueAtTime(F(spec * k), at);
  }
  const first = (spec) => (Array.isArray(spec) ? spec[0][0] : spec);
  const last = (spec) => (Array.isArray(spec) ? spec[spec.length - 1][0] : spec);
  function filt(type, at, spec, q) {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.Q.value = q;
    pts(b.frequency, at, spec);
    return b;
  }
  // a 立ち上がり、h 保持、d −60 dB までの秒（指数で減る）。終わる時刻を返す。
  function env(p, at, a, peak, h, d) {
    let t = at;
    if (a > 0.0004) {
      p.setValueAtTime(0, at);
      p.linearRampToValueAtTime(peak, at + a);
      t = at + a;
    } else p.setValueAtTime(peak, at);
    if (h > 0) {
      t += h;
      p.setValueAtTime(peak, t);
    }
    p.setTargetAtTime(0, t, Math.max(0.0012, d / 6.9));
    return t + d;
  }
  function outTo(v, node, pan) {
    if (pan && E.pan) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p);
      p.connect(v.in);
    } else node.connect(v.in);
  }
  // 白色ノイズ・パチパチを絞ると小さくなるぶんを戻す（等価雑音帯域の平方根。はじめの周波数で決める）
  function nzNorm(o) {
    const b = o.buf || "white";
    if (o.norm === false || (b !== "white" && b !== "crackle")) return 1;
    const nyq = ac.sampleRate / 2;
    let bw = nyq;
    if (o.bp) bw = (1.571 * first(o.bp)) / (o.q ?? 1);
    else {
      const lo = o.hp ? first(o.hp) : 0;
      const hi = o.lp ? 1.2 * first(o.lp) : nyq;
      bw = hi - lo;
    }
    return clamp(Math.sqrt(nyq / Math.max(60, bw)), 1, 8);
  }
  // ノイズの層。buf: white | pink | brown | crackle、hp / bp / lp は周波数の spec、am は { f, depth } の揺れ。
  function nz(v, at, o) {
    const buf = E[o.buf || "white"];
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    let n = s;
    const more = [];
    if (o.hp) {
      const f = filt("highpass", at, o.hp, o.hq ?? 0);
      n.connect(f);
      n = f;
    }
    if (o.bp) {
      const f = filt("bandpass", at, o.bp, o.q ?? 1);
      n.connect(f);
      n = f;
    }
    if (o.lp) {
      const f = filt("lowpass", at, o.lp, o.lq ?? 0);
      n.connect(f);
      n = f;
    }
    if (o.am) {
      const m = ac.createGain();
      m.gain.value = 1 - o.am.depth / 2;
      const l = ac.createOscillator();
      l.frequency.value = o.am.f;
      const lg = ac.createGain();
      lg.gain.value = o.am.depth / 2;
      l.connect(lg);
      lg.connect(m.gain);
      n.connect(m);
      n = m;
      more.push(l);
    }
    const g = ac.createGain();
    g.gain.value = 0;
    n.connect(g);
    outTo(v, g, o.pan);
    const end = env(g.gain, at, o.a || 0, (o.g ?? 1) * nzNorm(o), o.h || 0, o.d ?? 0.1) + 0.01;
    s.start(at, Math.random() * buf.duration * 0.9);
    s.stop(end);
    track(v, s, end);
    for (const l of more) {
      l.start(at);
      l.stop(end);
      track(v, l, end);
    }
  }
  // 音程の層。f は spec、fm は { r 比, i0→i1 深さ, t 秒 }、drive は歪み（tanh）、lp は spec。
  function tn(v, at, o) {
    const osc = ac.createOscillator();
    osc.type = o.type || "sine";
    pts(osc.frequency, at, o.f);
    if (o.det) osc.detune.value = o.det;
    const srcs = [osc];
    if (o.fm) {
      const m = ac.createOscillator();
      pts(m.frequency, at, o.f, o.fm.r);
      const mg = ac.createGain();
      const d0 = Math.max(0.5, o.fm.i0 * first(o.f) * o.fm.r);
      const d1 = Math.max(0.5, (o.fm.i1 ?? 0.2) * last(o.f) * o.fm.r);
      mg.gain.setValueAtTime(d0, at);
      mg.gain.exponentialRampToValueAtTime(d1, at + (o.fm.t ?? (o.d ?? 0.1) * 0.5));
      m.connect(mg);
      mg.connect(osc.frequency);
      srcs.push(m);
    }
    let n = osc;
    if (o.lp) {
      const f = filt("lowpass", at, o.lp, o.lq ?? 0);
      n.connect(f);
      n = f;
    }
    const g = ac.createGain();
    g.gain.value = 0;
    n.connect(g);
    let out = g;
    if (o.drive) {
      const ws = ac.createWaveShaper();
      ws.curve = driveCurve(o.drive);
      const lg = ac.createGain();
      lg.gain.value = o.g ?? 1;
      g.connect(ws);
      ws.connect(lg);
      out = lg;
    }
    outTo(v, out, o.pan);
    const end = env(g.gain, at, o.a ?? 0.001, o.drive ? 1 : (o.g ?? 1), o.h || 0, o.d ?? 0.1) + 0.01;
    for (const s of srcs) {
      s.start(at);
      s.stop(end);
      track(v, s, end);
    }
  }
  // 作ってあるアタック（包絡はバッファの中にあるので、遅れて始まっても欠けない）
  function clk(v, at, f, q, g, pan = 0) {
    const s = ac.createBufferSource();
    s.buffer = E.click;
    const b = ac.createBiquadFilter();
    b.type = "bandpass";
    b.frequency.value = F(f);
    b.Q.value = q;
    const gg = ac.createGain();
    gg.gain.value = g;
    s.connect(b);
    b.connect(gg);
    outTo(v, gg, pan);
    s.start(at);
    track(v, s, at + E.click.duration);
  }
  // 鐘（FM 1:3.5、深さが減って澄む）＋少しの倍音
  function bell(v, at, f, d, g, pan = 0) {
    tn(v, at, { f, a: 0.0015, d, g, fm: { r: 3.5, i0: 2.2, i1: 0.06, t: d * 0.45 }, pan });
    tn(v, at, { f: f * 2.005, a: 0.0015, d: d * 0.45, g: g * 0.22, pan });
  }

  // ---- 撃つ音 ----

  function shotLayers(v, t, K, P, r, remote, dist) {
    if (K === "fist") {
      nz(v, t, { bp: [[550 * r, 0], [1900 * r, 0.08], [800 * r, 0.16]], q: 1.3, a: 0.05, d: 0.13, g: 0.75 });
      nz(v, t + 0.01, { bp: 3200, q: 0.7, a: 0.02, d: 0.07, g: 0.12 });
      tn(v, t + 0.06, { f: [[125 * r, 0], [60, 0.05]], d: 0.08, g: 0.3, drive: 1.6 });
      return;
    }
    const far = remote ? dist : 0;
    if (P.click && far < 40) clk(v, t, P.click.f * r, 0.8, P.click.g);
    if (P.crack && far < 80) nz(v, t, { hp: P.crack.f * r, d: P.crack.d, g: P.crack.g });
    const b = P.body;
    if (P.wide) {
      nz(v, t, { bp: [[b.f0 * r, 0], [b.f1 * r, b.d * 0.8]], q: b.q, d: b.d, g: b.g * 0.75, pan: -P.wide });
      nz(v, t + 0.003, { bp: [[b.f0 * r * 0.88, 0], [b.f1 * r * 1.1, b.d * 0.85]], q: b.q, d: b.d * 1.1, g: b.g * 0.75, pan: P.wide });
    } else nz(v, t, { bp: [[b.f0 * r, 0], [b.f1 * r, b.d * 0.8]], q: b.q, d: b.d, g: b.g });
    if (P.punch) nz(v, t, { lp: [[P.punch.f * r, 0], [P.punch.f * r * 0.5, P.punch.d]], a: 0.0015, d: P.punch.d, g: P.punch.g });
    const th = P.thump;
    tn(v, t, { f: [[th.f0 * r, 0], [th.f1, th.sw]], a: 0.0008, d: th.d, drive: th.drive, g: th.g });
    const z = P.zap;
    const zn = P.wide ? 3 : 1;
    for (let i = 0; i < zn; i++) {
      const k = zn > 1 ? [1, 1.07, 0.93][i] : 1;
      tn(v, t + i * 0.004, {
        f: [[z.f0 * r * k, 0], [z.f1 * r * k, z.d]], a: 0.001, d: z.d, lp: 7500,
        fm: { r: z.fr, i0: z.i, i1: 0.25 }, g: z.g / Math.sqrt(zn), pan: zn > 1 ? (i - 1) * P.wide * 0.8 : 0,
      });
    }
    if (P.fizz && far < 60) nz(v, t + 0.003, { buf: "crackle", bp: P.fizz.f * r, q: 0.8, a: 0.002, d: P.fizz.d, g: P.fizz.g });
    if (P.tail) nz(v, t + 0.002, { buf: "pink", lp: P.tail.f, a: 0.006, d: P.tail.d, g: P.tail.g });
    if (P.ring) tn(v, t + 0.01, { f: P.ring.f * r, a: 0.004, d: P.ring.d, fm: { r: 1.5, i0: 1.2, i1: 0.05, t: P.ring.d * 0.4 }, g: P.ring.g });
    if (K === "sniper" && far < 60) nz(v, t + 0.006, { hp: [[7000, 0], [1800, 0.16]], a: 0.004, d: 0.18, g: 0.18 });
    if (!remote) mech(v, t, K, r);
  }
  // 自分の銃だけの機械音（コイルの戻り・ポンプ・充電）
  function mech(v, t, K, r) {
    if (K === "pistol") {
      nz(v, t + 0.028, { bp: 2300 * r, q: 3, d: 0.03, g: 0.16 });
      tn(v, t + 0.03, { f: [[900, 0], [1500, 0.05]], a: 0.004, d: 0.05, g: 0.025 });
    } else if (K === "smg") {
      nz(v, t + 0.02, { bp: 2800 * r, q: 4, d: 0.016, g: 0.09 });
    } else if (K === "ar") {
      nz(v, t + 0.03, { bp: 1900 * r, q: 2.5, d: 0.04, g: 0.17 });
    } else if (K === "shotgun") {
      tn(v, t + 0.34, { f: [[300, 0], [1150, 0.16]], a: 0.12, d: 0.06, g: 0.045, fm: { r: 2, i0: 0.6, i1: 0.3 } });
      clk(v, t + 0.36, 1500, 1.2, 0.35);
      nz(v, t + 0.36, { bp: 1500, q: 2, d: 0.045, g: 0.3 });
      clk(v, t + 0.5, 2200, 1.2, 0.4);
      nz(v, t + 0.5, { bp: 2100, q: 2, d: 0.05, g: 0.34 });
      tn(v, t + 0.5, { f: [[190, 0], [100, 0.04]], d: 0.06, g: 0.2 });
    } else if (K === "sniper") {
      tn(v, t + 0.5, { f: [[450, 0], [2600, 0.6]], a: 0.58, d: 0.05, g: 0.045, fm: { r: 2, i0: 0.6, i1: 0.4, t: 0.6 } });
      nz(v, t + 0.5, { hp: 3500, a: 0.55, d: 0.06, g: 0.03 });
      clk(v, t + 1.13, 3200, 1.4, 0.5);
      nz(v, t + 1.13, { bp: 2300, q: 3, d: 0.04, g: 0.3 });
      tn(v, t + 1.13, { f: [[200, 0], [100, 0.04]], d: 0.06, g: 0.2 });
    }
  }
  function shot(kind, dist, pan) {
    const K = GUN[kind] ? kind : "pistol";
    const P = GUN[K];
    const d = Math.max(0, fin(dist));
    if (d > SHOT_FAR || (K === "fist" && d > 25)) return;
    const remote = d > 0.05;
    let dry = 1, rev = P.rev, echo = P.echo, lp = 0, delay = 0;
    if (remote) {
      const ref = 14 * P.far;
      const fall = ref / (ref + d);
      const edge = 1 - smooth((d - 120) / (SHOT_FAR - 120));
      dry = fall * edge * 0.92;
      rev = P.rev * 1.2 * Math.pow(fall, 0.4) * edge;
      echo = P.echo * 1.3 * Math.pow(fall, 0.25) * edge;
      lp = 16000 * Math.pow(1500 / 16000, d / SHOT_FAR);
      delay = d / SPEED;
    }
    const t0 = ac.currentTime + LEAD + delay;
    const v = voice(t0, { vol: P.lv * rnd(0.92, 1.06), dry, rev, echo, lp, pan: remote ? clamp(fin(pan), -1, 1) : 0, prio: remote ? 1 : 3 });
    if (!v) return;
    shotLayers(v, t0, K, P, 1 + (Math.random() * 2 - 1) * P.vr, remote, d);
    seal(v);
  }

  // ---- そのほかの音 ----

  const t0n = () => ac.currentTime + LEAD;

  function hit(head) {
    const t = t0n();
    const v = voice(t, { vol: head ? 0.9 : 1, rev: head ? 0.06 : 0.02, prio: 5 });
    if (!v) return;
    const r = rnd(0.97, 1.03);
    clk(v, t, (head ? 5200 : 3900) * r, 1.2, 0.9);
    tn(v, t, { f: [[(head ? 2950 : 1900) * r, 0], [(head ? 2750 : 1700) * r, 0.03]], a: 0.0006, d: 0.045, g: 0.3 });
    nz(v, t, { bp: (head ? 6500 : 4600) * r, q: 1.6, d: 0.035, g: 0.35 });
    tn(v, t, { f: [[430, 0], [240, 0.035]], a: 0.0008, d: 0.045, g: 0.2 });
    if (head) {
      // ヘルメットに当たった金属の「キン」
      tn(v, t + 0.01, { f: 3170 * r, a: 0.001, d: 0.24, g: 0.2, fm: { r: 1.53, i0: 0.9, i1: 0.05, t: 0.08 } });
      tn(v, t + 0.01, { f: 4760 * r, a: 0.001, d: 0.15, g: 0.09 });
      nz(v, t + 0.004, { buf: "crackle", bp: 5500, q: 0.8, d: 0.08, g: 0.2 });
    }
    seal(v);
  }
  function kill() {
    const t = t0n();
    const v = voice(t, { vol: 0.67, rev: 0.22, echo: 0.04, prio: 6 });
    if (!v) return;
    clk(v, t, 2800, 0.7, 0.9);
    tn(v, t, { f: [[160, 0], [50, 0.07]], a: 0.0008, d: 0.18, drive: 3.5, g: 0.4 });
    nz(v, t, { bp: [[2600, 0], [800, 0.06]], q: 1, d: 0.08, g: 0.55 });
    nz(v, t + 0.003, { buf: "crackle", bp: 5200, q: 0.7, d: 0.14, g: 0.25 });
    // 上がる 5 度の鐘（B5 → F#6）
    bell(v, t + 0.015, 987.77, 0.55, 0.3);
    bell(v, t + 0.085, 1479.98, 0.65, 0.28);
    seal(v);
  }
  function hurt() {
    const t = t0n();
    const v = voice(t, { vol: 0.68, rev: 0.06, prio: 4 });
    if (!v) return;
    const r = rnd(0.94, 1.06);
    clk(v, t, 1800 * r, 0.7, 0.5);
    tn(v, t, { f: [[110 * r, 0], [45, 0.09]], a: 0.0008, d: 0.18, drive: 4, g: 0.45 });
    nz(v, t, { bp: [[900 * r, 0], [300, 0.12]], q: 1.1, d: 0.12, g: 0.8 });
    nz(v, t, { lp: [[1400 * r, 0], [600, 0.06]], a: 0.001, d: 0.07, g: 0.45 });
    nz(v, t + 0.006, { buf: "crackle", bp: 3600 * r, q: 0.8, d: 0.16, g: 0.4 });
    tn(v, t + 0.004, { f: [[2400 * r, 0], [1200, 0.1]], a: 0.002, d: 0.1, g: 0.05, fm: { r: 2.3, i0: 1, i1: 0.2 } });
    seal(v);
  }
  function out(me) {
    const t = t0n();
    if (!me) {
      // ほかの人が倒れた：控えめな低い音と、下がる 2 音
      const v = voice(t, { vol: 0.45, rev: 0.25, prio: 2 });
      if (!v) return;
      tn(v, t, { f: [[110, 0], [55, 0.12]], d: 0.3, drive: 2, g: 0.3 });
      nz(v, t, { buf: "pink", lp: [[1200, 0], [300, 0.25]], d: 0.3, g: 0.2 });
      bell(v, t + 0.01, 659.25, 0.35, 0.24);
      bell(v, t + 0.1, 493.88, 0.45, 0.22);
      seal(v);
      return;
    }
    // 自分が倒れた：深く落ちる低音・こもっていく衝撃・暗い和音が半音下がる・耳鳴り
    const v = voice(t, { vol: 0.7, rev: 0.4, echo: 0.12, prio: 8 });
    if (!v) return;
    clk(v, t, 1600, 0.6, 0.7);
    tn(v, t, { f: [[90, 0], [30, 0.9]], a: 0.001, d: 1.3, drive: 3, g: 0.5 });
    nz(v, t, { buf: "pink", lp: [[2500, 0], [160, 1.2]], d: 1.2, g: 0.45 });
    nz(v, t, { bp: [[1800, 0], [500, 0.1]], q: 0.8, d: 0.12, g: 0.7 });
    for (const f of [110, 130.81, 164.81]) {
      tn(v, t + 0.02, { type: "sawtooth", f: [[f, 0], [f * 0.94, 1.6]], det: rnd(-6, 6), a: 0.03, h: 0.2, d: 1.6, g: 0.1, lp: [[1800, 0], [160, 1.6]] });
    }
    tn(v, t + 0.05, { f: 3150, a: 0.05, h: 0.3, d: 1.4, g: 0.035 });
    seal(v);
  }
  function win() {
    const t = t0n();
    const v = voice(t, { vol: 1.1, rev: 0.38, echo: 0.12, prio: 8 });
    if (!v) return;
    tn(v, t, { f: [[70, 0], [40, 0.4]], d: 0.6, drive: 2, g: 0.3 });
    nz(v, t, { buf: "pink", lp: [[3000, 0], [400, 0.5]], d: 0.6, g: 0.3 });
    // C の和音（のこぎり波 2 本ずつ、フィルターが開いてから閉じる）
    for (const f of [130.81, 196, 261.63, 329.63, 392]) {
      for (const det of [-8, 8]) {
        tn(v, t + 0.01, { type: "sawtooth", f, det: det + rnd(-2, 2), a: 0.02, h: 0.6, d: 2.2, g: 0.04, lp: [[400, 0], [3200, 0.35], [900, 2.4]] });
      }
    }
    [659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(v, t + 0.02 + i * 0.11, f, 1, 0.22, (i - 1.5) * 0.25));
    nz(v, t + 0.05, { hp: 6000, a: 0.3, d: 1.5, g: 0.07 });
    seal(v);
  }
  const PICK_VOL = { weapon: 0.38, ammo: 0.63, heal: 0.83, helmet: 0.53 };
  function pick(kind) {
    const t = t0n();
    const v = voice(t, { vol: PICK_VOL[kind] ?? 0.84, rev: kind === "helmet" ? 0.1 : 0.06, prio: 2 });
    if (!v) return;
    if (kind === "weapon") {
      // 金属の「カチャ・ガチッ」＋武器が起動する短いうなり
      clk(v, t, 2200, 1.5, 0.8);
      nz(v, t, { bp: 1700, q: 4, d: 0.05, g: 0.6 });
      nz(v, t + 0.065, { bp: 950, q: 3, d: 0.08, g: 0.7 });
      clk(v, t + 0.065, 1400, 1, 0.6);
      tn(v, t + 0.065, { f: [[160, 0], [85, 0.06]], d: 0.09, g: 0.4, drive: 2 });
      tn(v, t + 0.09, { f: [[220, 0], [660, 0.16]], a: 0.02, d: 0.2, g: 0.12, fm: { r: 2.01, i0: 1.5, i1: 0.3 } });
    } else if (kind === "ammo") {
      // 弾がこすれる小さな金属音
      for (let i = 0, at = t; i < 4; i++, at += rnd(0.022, 0.034)) nz(v, at, { bp: rnd(2800, 4200), q: 5, d: 0.025, g: 0.6 - i * 0.08 });
      nz(v, t, { bp: 600, q: 1, d: 0.06, g: 0.25 });
    } else if (kind === "heal") {
      nz(v, t, { lp: 900, d: 0.06, g: 0.5 });
      clk(v, t, 1200, 0.8, 0.3);
      tn(v, t + 0.03, { type: "triangle", f: 660, d: 0.12, g: 0.14 });
      tn(v, t + 0.09, { type: "triangle", f: 990, d: 0.2, g: 0.12 });
    } else if (kind === "helmet") {
      // 中が空の「コン」
      clk(v, t, 1500, 1, 0.7);
      nz(v, t, { bp: 620, q: 9, d: 0.22, g: 0.8 });
      tn(v, t, { f: 1630, d: 0.18, g: 0.1, fm: { r: 1.41, i0: 1, i1: 0.05 } });
      nz(v, t + 0.05, { bp: 2500, q: 0.7, a: 0.03, d: 0.12, g: 0.15 });
    } else {
      clk(v, t, 2600, 1.2, 0.6);
      nz(v, t + 0.045, { bp: 1500, q: 2.5, d: 0.04, g: 0.5 });
      tn(v, t + 0.045, { f: 880, d: 0.06, g: 0.08 });
    }
    seal(v);
  }
  // stage: "start"（弾倉を抜く）| "end"（入れて充電）。true / false も受ける（true = end）
  function reload(stage) {
    const end = stage === true || stage === "end" || stage === "in" || stage === "done";
    const t = t0n();
    const v = voice(t, { vol: end ? 0.47 : 0.49, rev: 0.05, prio: 2 });
    if (!v) return;
    if (!end) {
      // 留め金・弾倉が抜ける・熱を逃がす「シュー」・電源が落ちるうなり
      clk(v, t, 3000, 2, 0.8);
      nz(v, t, { bp: 2600, q: 3, d: 0.03, g: 0.5 });
      nz(v, t + 0.04, { bp: [[1200, 0], [2600, 0.1]], q: 1.5, a: 0.01, d: 0.1, g: 0.3 });
      nz(v, t + 0.05, { hp: 4500, a: 0.01, d: 0.28, g: 0.12 });
      tn(v, t + 0.03, { f: [[1400, 0], [320, 0.25]], d: 0.25, g: 0.07, fm: { r: 1.5, i0: 1.2, i1: 0.2 } });
      nz(v, t + 0.1, { bp: 700, q: 2, d: 0.05, g: 0.3 });
    } else {
      // 弾倉が入る「ガチッ」・充電で上がるうなり・ロックの「カチッ」
      clk(v, t, 2000, 1, 0.8);
      nz(v, t, { bp: 1300, q: 2.5, d: 0.05, g: 0.6 });
      tn(v, t, { f: [[210, 0], [120, 0.05]], d: 0.06, g: 0.35, drive: 2 });
      tn(v, t + 0.06, { f: [[380, 0], [2400, 0.26]], a: 0.24, d: 0.05, g: 0.09, fm: { r: 2, i0: 0.8, i1: 0.3, t: 0.26 } });
      nz(v, t + 0.06, { hp: 3000, a: 0.22, d: 0.06, g: 0.06 });
      clk(v, t + 0.33, 3400, 1.6, 0.9);
      nz(v, t + 0.33, { bp: 2200, q: 3, d: 0.035, g: 0.55 });
      tn(v, t + 0.33, { f: [[180, 0], [90, 0.04]], d: 0.05, g: 0.3 });
    }
    seal(v);
  }
  function heal() {
    const t = t0n();
    const v = voice(t, { vol: 0.9, rev: 0.12, prio: 3 });
    if (!v) return;
    nz(v, t, { buf: "pink", bp: [[400, 0], [2500, 0.35]], q: 2, a: 0.2, d: 0.3, g: 0.35 });
    tn(v, t + 0.05, { type: "triangle", f: [[523.25 * 0.983, 0], [523.25, 0.12]], a: 0.05, d: 0.6, g: 0.12 });
    tn(v, t + 0.05, { type: "triangle", f: [[783.99 * 0.983, 0], [783.99, 0.12]], a: 0.05, d: 0.6, g: 0.09 });
    bell(v, t + 0.18, 1046.5, 0.5, 0.08);
    seal(v);
  }
  function warn() {
    const t = t0n();
    const v = voice(t, { vol: 0.85, rev: 0.3, echo: 0.08, prio: 6 });
    if (!v) return;
    tn(v, t, { f: [[70, 0], [35, 0.5]], d: 0.6, drive: 2, g: 0.3 });
    // 低い金管のような和音（フィルターが開いて閉じる）＋ 2 回の高い「ピン」
    for (const [f, det] of [[98, -7], [98, 7], [196, 0]]) {
      tn(v, t, { type: "sawtooth", f, det, a: 0.05, h: 0.75, d: 0.5, g: f > 100 ? 0.06 : 0.08, lp: [[200, 0], [1800, 0.12], [400, 1.1]] });
    }
    bell(v, t, 1567.98, 0.25, 0.3);
    bell(v, t + 0.32, 1567.98, 0.25, 0.3);
    seal(v);
  }
  function drop() {
    const t = t0n();
    const v = voice(t, { vol: 0.6, rev: 0.1, prio: 4 });
    if (!v) return;
    // 左右で少しずれた風の「ゴォッ」＋高い空気の擦れ＋低い揺れ
    nz(v, t, { buf: "pink", bp: [[400, 0], [2000, 0.4], [700, 1.3]], q: 0.8, a: 0.25, h: 0.25, d: 0.9, g: 1, pan: -0.35 });
    nz(v, t + 0.03, { buf: "pink", bp: [[450, 0], [2300, 0.45], [800, 1.3]], q: 0.8, a: 0.25, h: 0.25, d: 0.9, g: 1, pan: 0.35 });
    nz(v, t, { hp: [[1500, 0], [4000, 0.4], [1200, 1.3]], a: 0.3, h: 0.15, d: 0.9, g: 0.12 });
    nz(v, t, { buf: "brown", lp: 220, a: 0.15, h: 0.3, d: 1, g: 0.25 });
    tn(v, t, { f: [[90, 0], [45, 0.15]], d: 0.2, g: 0.3, drive: 2 });
    seal(v);
  }
  function chute() {
    const t = t0n();
    const v = voice(t, { vol: 0.73, rev: 0.08, prio: 4 });
    if (!v) return;
    // 布が風をはらむ「バサッ」2 回＋引かれる「ドン」＋はためき
    nz(v, t, { bp: [[1400, 0], [700, 0.06]], q: 0.9, a: 0.002, d: 0.08, g: 0.7 });
    nz(v, t + 0.045, { bp: [[1100, 0], [600, 0.05]], q: 1, a: 0.002, d: 0.07, g: 0.45 });
    clk(v, t, 2500, 0.6, 0.45);
    tn(v, t, { f: [[95, 0], [45, 0.1]], d: 0.18, drive: 2.5, g: 0.4 });
    nz(v, t + 0.06, { buf: "pink", bp: 520, q: 0.8, a: 0.02, d: 0.55, g: 0.8, am: { f: 23, depth: 0.8 } });
    seal(v);
  }
  function land() {
    const t = t0n();
    const v = voice(t, { vol: 0.65, rev: 0.1, prio: 4 });
    if (!v) return;
    // 足もとの「ドスッ」＋砂利＋装備のカチャカチャ
    tn(v, t, { f: [[115, 0], [42, 0.12]], a: 0.0008, d: 0.18, drive: 3, g: 0.45 });
    nz(v, t, { lp: [[1400, 0], [500, 0.1]], d: 0.15, g: 0.7 });
    nz(v, t + 0.004, { buf: "crackle", bp: 2600, q: 0.7, d: 0.2, g: 0.45 });
    for (let i = 0, at = t + 0.04; i < 3; i++, at += rnd(0.03, 0.05)) nz(v, at, { bp: rnd(2800, 4000), q: 4, d: 0.03, g: 0.3 });
    nz(v, t, { bp: 1800, q: 0.6, a: 0.01, d: 0.12, g: 0.15 });
    seal(v);
  }
  function step(dist, pan) {
    const d = Math.max(0, fin(dist));
    if (d > STEP_FAR) return;
    const remote = d > 0.05;
    const near = 4 / (4 + d);
    const dry = remote ? 0.62 * near * (1 - smooth((d - 22) / (STEP_FAR - 22))) : 1;
    const t = t0n() + (remote ? d / SPEED : 0);
    const v = voice(t, {
      vol: (remote ? 1 : 0.28) * rnd(0.85, 1.1), dry, rev: remote ? 0.05 * Math.pow(near, 0.4) : 0.015,
      lp: remote ? 12000 * Math.pow(900 / 12000, d / STEP_FAR) : 0, pan: remote ? clamp(fin(pan), -1, 1) : 0, prio: remote ? 1.5 : 1,
    });
    if (!v) return;
    // かかと（中低域）→ つま先のこすれ（ざらざらの高域）
    const r = rnd(0.9, 1.12);
    nz(v, t, { bp: 380 * r, q: 1.1, a: 0.001, d: 0.05, g: 0.8 });
    tn(v, t, { f: [[95 * r, 0], [60, 0.04]], d: 0.05, g: 0.35 });
    const tt = t + rnd(0.018, 0.032);
    nz(v, tt, { buf: "crackle", bp: 3000 * r, q: 0.7, d: 0.045, g: 0.55 });
    nz(v, tt, { hp: 2200 * r, d: 0.03, g: 0.18 });
    seal(v);
  }
  function ui() {
    const t = t0n();
    const v = voice(t, { vol: 1.1, prio: 2 });
    if (!v) return;
    clk(v, t, 3400, 1.6, 0.7);
    tn(v, t, { f: 2350, a: 0.0005, d: 0.02, g: 0.12 });
    seal(v);
  }

  // ---- 鳴り続ける音（風・飛行機） ----

  const gainN = (x) => {
    const g = ac.createGain();
    g.gain.value = x;
    return g;
  };
  const bq = (type, f, q = 0) => {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const oscN = (type, f) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  };
  // 鳴り続ける音のステレオノイズ（左右で別、3 秒）は使うときにはじめて作る
  const stereo = (color) => E[color + "2"] || (E[color + "2"] = makeNoise(ac, 3, color, 2));
  const loopN = (buf) => {
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  };
  function startAll(srcs, now) {
    for (const s of srcs) {
      if (s.buffer) s.start(now, Math.random() * s.buffer.duration * 0.9);
      else s.start(now);
    }
  }
  function stopLoop(L, tau) {
    const now = ac.currentTime;
    try {
      const p = L.amp.gain;
      p.cancelScheduledValues(now);
      p.setTargetAtTime(0, now, tau);
    } catch { /* なし */ }
    const end = now + tau * 8;
    for (const s of L.srcs) {
      try { s.stop(end); } catch { /* 止まっている */ }
    }
    try {
      L.srcs[0].onended = () => {
        try { L.amp.disconnect(); } catch { /* 済み */ }
      };
    } catch { /* なし */ }
  }
  function makeWind() {
    const now = ac.currentTime;
    const amp = gainN(0);
    amp.connect(E.master);
    const mod = gainN(0.85);
    mod.connect(amp);
    const s1 = loopN(stereo("pink"));
    const bp = bq("bandpass", 400, 0.6);
    s1.connect(bp);
    bp.connect(mod);
    const s2 = loopN(stereo("brown"));
    const lp = bq("lowpass", 170);
    const ru = gainN(0.4);
    s2.connect(lp);
    lp.connect(ru);
    ru.connect(mod);
    const s3 = loopN(E.white);
    const wh = bq("bandpass", 1200, 7);
    const whG = gainN(0);
    s3.connect(wh);
    wh.connect(whG);
    whG.connect(mod);
    // 突風：ゆっくりの揺れを音量とフィルターに
    const l1 = oscN("sine", 0.21);
    const l2 = oscN("sine", 0.53);
    const lg = gainN(0.13);
    const ld = gainN(260);
    l1.connect(lg);
    l2.connect(lg);
    lg.connect(mod.gain);
    l1.connect(ld);
    l2.connect(ld);
    ld.connect(bp.detune);
    ld.connect(wh.detune);
    const srcs = [s1, s2, s3, l1, l2];
    startAll(srcs, now);
    return { amp, bp, ru, wh, whG, srcs, v: -1, at: -1 };
  }
  function windSet(speed) {
    const now = ac.currentTime;
    const v = clamp(fin(speed), 0, 60);
    if (v < 0.5) {
      if (wl) {
        stopLoop(wl, 0.3);
        wl = null;
      }
      return;
    }
    if (!wl) wl = makeWind();
    if (Math.abs(v - wl.v) < 0.3 && now - wl.at < 0.25) return;
    wl.v = v;
    wl.at = now;
    const x = v / 60;
    wl.amp.gain.setTargetAtTime(WIND_LV * (0.04 + 0.96 * Math.pow(x, 1.25)), now, 0.15);
    wl.bp.frequency.setTargetAtTime(230 + 1250 * Math.pow(x, 1.1), now, 0.25);
    wl.ru.gain.setTargetAtTime(0.3 + 0.7 * x, now, 0.25);
    wl.wh.frequency.setTargetAtTime(800 + 1700 * x, now, 0.3);
    wl.whG.gain.setTargetAtTime(0.4 * Math.pow(smooth((v - 18) / 42), 1.5), now, 0.3);
  }
  function makePlane() {
    const now = ac.currentTime;
    const amp = gainN(0);
    amp.connect(E.master);
    amp.gain.setValueAtTime(0, now);
    amp.gain.setTargetAtTime(PLANE_LV, now, 0.7);
    const am = gainN(0.7);
    am.connect(amp);
    // エンジン 2 基（少しずれてうなる）と低い唸り
    const e1 = oscN("sawtooth", 54);
    const e2 = oscN("sawtooth", 54.9);
    const e3 = oscN("triangle", 27.3);
    const elp = bq("lowpass", 340);
    const eg = gainN(0.32);
    e1.connect(elp);
    e2.connect(elp);
    e3.connect(elp);
    elp.connect(eg);
    eg.connect(am);
    // 風切りと機内のこもった音
    const n1 = loopN(stereo("brown"));
    const nlp = bq("lowpass", 700);
    const ng = gainN(0.75);
    n1.connect(nlp);
    nlp.connect(ng);
    ng.connect(am);
    const n2 = loopN(stereo("pink"));
    const nbp = bq("bandpass", 1500, 0.7);
    const ng2 = gainN(0.12);
    n2.connect(nbp);
    nbp.connect(ng2);
    ng2.connect(am);
    // タービンの高い音（少し揺れる）
    const w = oscN("sine", 1730);
    const wv = oscN("sine", 5.3);
    const wvg = gainN(7);
    wv.connect(wvg);
    wvg.connect(w.frequency);
    const wg = gainN(0.012);
    w.connect(wg);
    wg.connect(amp);
    // プロペラの拍（2 基が 0.6 Hz でうなる＋羽根の切れ）
    const p1 = oscN("sine", 18.6);
    const p2 = oscN("sine", 19.2);
    const p3 = oscN("sine", 37.2);
    const pg1 = gainN(0.17);
    const pg2 = gainN(0.1);
    const pg3 = gainN(0.06);
    p1.connect(pg1);
    pg1.connect(am.gain);
    p2.connect(pg2);
    pg2.connect(am.gain);
    p3.connect(pg3);
    pg3.connect(am.gain);
    const srcs = [e1, e2, e3, n1, n2, w, wv, p1, p2, p3];
    startAll(srcs, now);
    return { amp, srcs };
  }
  function planeSet(on) {
    if (on && !pl) pl = makePlane();
    else if (!on && pl) {
      stopLoop(pl, 0.35);
      pl = null;
    }
  }

  // ---- 外へ見せる形 ----

  // 単発音：文脈がなければ作り、止まっていれば resume を頼み、動いていなければ鳴らさない。何があっても投げない。
  const once = (fn) => (...a) => {
    try {
      if (boot() && live()) fn(...a);
    } catch { /* 音が出なくても遊べる */ }
  };

  return {
    unlock() {
      try {
        closed = false;
        failed = false;
        const c = boot();
        if (!c || isOffline(c)) return;
        // iOS：タップの中で無音を 1 つ鳴らすと確実に起きる
        const s = c.createBufferSource();
        s.buffer = c.createBuffer(1, 1, c.sampleRate);
        s.connect(c.destination);
        s.start(0);
      } catch { /* なし */ }
    },
    close() {
      try {
        if (ac && E) {
          const now = ac.currentTime;
          for (const v of voices.splice(0)) hush(v, now);
          if (wl) stopLoop(wl, 0.01);
          if (pl) stopLoop(pl, 0.01);
          if (ac !== given) ac.close?.()?.catch?.(() => {});
          else E.clip.disconnect();
        }
      } catch { /* 閉じている */ }
      ac = null;
      E = null;
      wl = null;
      pl = null;
      closed = true;
    },
    // 撃つ音。kind: fist | pistol | smg | ar | shotgun | sniper、dist はその人までの m（自分は 0）、pan は −1 左〜1 右
    shot: once((kind, dist = 0, pan = 0) => shot(kind, dist, pan)),
    hit: once((head = false) => hit(!!head)),
    kill: once(() => kill()),
    hurt: once(() => hurt()),
    out: once((me = false) => out(!!me)),
    win: once(() => win()),
    // kind: weapon | ammo | heal | helmet | それ以外
    pick: once((kind = "item") => pick(kind)),
    reload: once((stage = "start") => reload(stage)),
    heal: once(() => heal()),
    warn: once(() => warn()),
    drop: once(() => drop()),
    chute: once(() => chute()),
    land: once(() => land()),
    step: once((dist = 0, pan = 0) => step(dist, pan)),
    ui: once(() => ui()),
    // 落下の風（v は速さ m/s、0〜60。0 で消える）。毎フレーム呼んでよい
    wind(v) {
      try {
        if (!(fin(v) >= 0.5) && !wl) return;
        if (boot()) windSet(v);
      } catch { /* なし */ }
    },
    // 飛行機のエンジン（乗っているあいだ）
    plane(on) {
      try {
        if (!on && !pl) return;
        if (boot()) planeSet(!!on);
      } catch { /* なし */ }
    },
    // 確かめ用
    _stats: () => ({ voices: voices.length, maxVoices: maxSeen, state: ac ? ac.state : "none" }),
  };
}
