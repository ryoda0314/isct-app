// 水曇り（テーマ mizukumori）のガラスの状態。DOM は使わない（FogOverlay が入力と時間を渡し、fogGL.js が描く）。
//
// 画面を cell px 角のマスに分け、マスごとに次の値を持つ。
//   fog   曇りの濃さ。0 = 拭いた直後、1 = 真っ白
//   hold  曇り直しが始まるまでの残り秒
//   rim   拭いた縁に押し寄せた水。大粒として描き、ゆっくり乾く
//   fresh 最近拭いた印。晴れている間は濡れたつや、曇り直したあとは粒の細かい「跡」になる
// 指で拭き取った水は水滴になり、重力の向きに垂れて通り道を晴らす。

const HOLD = 8;                 // 拭いてから曇り直しが始まるまで（秒。場所によって最大 1.3 倍）
const REFOG = 9;                // 曇り直しにかかる時間（秒。場所によって 0.7〜1.4 倍の速さ）
const R_MOVE = 3.8;             // これより大きい水滴は垂れる（px）
const TRAIL_HOLD = 10;          // 水滴の通り道は長めに晴れたまま
const RIM_LIFE = 25;            // 縁の水が乾く速さ（秒）
const FRESH_LIFE = 40;          // 拭いた跡が消えるまで（秒）
const INTRO = 4;                // 最初に曇っていく演出の長さ（秒。画面の端から真ん中へ）
const DROP_WATER = 6000;        // 水滴 1 つぶんの水（拭き取った曇り × 面積 px²）
const SPEED = 32;               // 垂れる速さの係数（px/s）
const V_STOP = 8;               // これより遅くなったら止まって粒になる（px/s）
const PICKUP = 0.004;           // 曇りの中を通ると水を集めて大きくなる
const FILM = 0.025;             // 通った跡に残る水（進んだ距離 × 半径 あたり）
const SEEP = 0.4;               // 動いている間に失う水（半径² / 秒。のろのろ這い続けないように）
const EVAP = 0.03;              // 止まった粒が乾く速さ（px/s）
const R_MAX = 9;
const MAX_DROPS = 160;
// 垂れる速さ（px/s）。gm: 画面の中での重力の強さ
const speedOf = (r, gm) => SPEED * gm * Math.max(0, r - R_MOVE * 0.8);

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const hash = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const sx = smooth(x - xi), sy = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
// マスごとの性格（0〜1）。曇り直す速さと最初に曇る順番を、まとまりのあるむらにする
const seedAt = (x, y) => Math.min(1, Math.max(0, (vnoise(x / 90, y / 90) * 0.6 + vnoise(x / 28 + 7.1, y / 28 + 3.3) * 0.4 - 0.5) * 1.8 + 0.5));

export function createFogSim(width, height, { reduced = false, intro = true } = {}) {
  let w = 0, h = 0, cell = 3, gw = 0, gh = 0;
  let fog = null, hold = null, rim = null, fresh = null, seed = null, bytes = null;
  // 変化中のマスを囲む四角（曇り直しはここだけ見回る）。ri1 < ri0 なら空
  let ri0 = 0, ri1 = -1, rj0 = 0, rj1 = -1;
  const mark = (i0, i1, j0, j1) => {
    if (ri1 < ri0) { ri0 = i0; ri1 = i1; rj0 = j0; rj1 = j1; return; }
    if (i0 < ri0) ri0 = i0;
    if (i1 > ri1) ri1 = i1;
    if (j0 < rj0) rj0 = j0;
    if (j1 > rj1) rj1 = j1;
  };
  let dirty = true;        // bytes が変わった
  let t = 0, introUntil = 0, pend = 0, cells = null;
  let gx = 0, gy = 0.85;   // 画面の中での重力（長さ = 傾きの強さ 0〜1）
  const drops = [];
  const strokes = new Map();
  const sim = { drops, grid: null };

  const put = (n) => {
    const o = n << 2;
    bytes[o] = fog[n] * 255 + 0.5;
    bytes[o + 1] = rim[n] * 255 + 0.5;
    bytes[o + 2] = fresh[n] * 255 + 0.5;
  };

  // (x, y) を中心に半径 r を拭く。strength: 1 回で取れる割合、holdT: 曇り直しまでの秒、rimGain: 縁に寄せる水
  // 返り値は拭き取った曇り × 面積（px²）
  const stamp = (x, y, r, strength, holdT, rimGain) => {
    const reach = r * 1.3;
    const i0 = Math.max(0, Math.floor((x - reach) / cell)), i1 = Math.min(gw - 1, Math.floor((x + reach) / cell));
    const j0 = Math.max(0, Math.floor((y - reach) / cell)), j1 = Math.min(gh - 1, Math.floor((y + reach) / cell));
    if (i0 > i1 || j0 > j1) return 0;
    let removed = 0;
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) * cell - y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * cell - x;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d >= 1.3) continue;
        const n = j * gw + i;
        const f = fog[n];
        const k = d < 0.55 ? 1 : smooth((1 - d) / 0.45);
        if (k > 0) {
          const take = f * k * strength;
          fog[n] = f - take;
          removed += take;
          const ht = holdT * (1 + 0.3 * seed[n]);
          if (k > 0.15 && hold[n] < ht) hold[n] = ht;
          if (fresh[n] < k) fresh[n] = k;
          rim[n] *= 1 - k;
        }
        if (rimGain > 0 && d > 0.8) {
          const ring = 1 - Math.abs(d - 1.05) / 0.25;
          if (ring > 0) rim[n] = Math.min(1, rim[n] + ring * f * rimGain);
        }
        put(n);
      }
    }
    mark(i0, i1, j0, j1);
    dirty = true;
    return removed * cell * cell;
  };

  // 粒の下は曇らせない（hold を延ばすだけ。見た目は変わらない）
  const keepClear = (x, y, r, secs) => {
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(gw - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(gh - 1, Math.floor((y + r) / cell));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const n = j * gw + i;
      if (hold[n] < secs) hold[n] = secs;
    }
    mark(i0, i1, j0, j1);
  };

  const addDrop = (x, y, r, { moving = r >= R_MOVE, stuck = 0, growT = 0.25 } = {}) => {
    if (drops.length >= MAX_DROPS) {
      // いちばん古い止まった粒から消す
      const i = drops.findIndex((d) => !d.moving && !d.dying);
      if (i < 0) return null;
      drops[i].dying = true;
    }
    const d = {
      x, y, r, moving: moving && !reduced, stuck, v: 0, age: 0, grow: 0, growT, turn: 0, trail: 0,
      alpha: 1, dying: false, seed: Math.random(), bead: 0, nextBead: 8 + Math.random() * 20,
    };
    drops.push(d);
    return d;
  };

  // 拭いた水を、重力の側の縁に水滴として置く
  const spawnFromStroke = (st, x, y, water) => {
    const g = Math.hypot(gx, gy), ux = g > 1e-3 ? gx / g : 0, uy = g > 1e-3 ? gy / g : 1;
    const side = (Math.random() - 0.5) * st.r * 0.9;
    const px = x + ux * st.r * 0.92 - uy * side, py = y + uy * st.r * 0.92 + ux * side;
    if (px < 0 || py < 0 || px > w || py > h) return;
    const r = Math.min(6.2, Math.max(2.2, Math.sqrt(water * 0.0085)));
    const d = addDrop(px, py, r, { stuck: 0.35 + Math.random() * 1.1, growT: 0.3 + Math.random() * 0.5 });
    if (d) stamp(px, py, r * 0.9, 0.95, TRAIL_HOLD, 0);
  };

  sim.has = (id) => strokes.has(id);
  sim.begin = (id, x, y, r) => {
    const st = { x, y, r, water: 0 };
    strokes.set(id, st);
    st.water += stamp(x, y, r, 0.92, HOLD, 0.25);
  };
  sim.move = (id, x, y) => {
    const st = strokes.get(id);
    if (!st) return;
    const dx = x - st.x, dy = y - st.y, len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    // 速く動かしても途切れないよう、半径の 0.28 倍おきに拭く
    const n = Math.ceil(len / (st.r * 0.28));
    for (let k = 1; k <= n; k++) {
      const px = st.x + (dx * k) / n, py = st.y + (dy * k) / n;
      st.water += stamp(px, py, st.r, 0.8, HOLD, 0.22);
      if (st.water > DROP_WATER) {
        const use = DROP_WATER * (0.75 + Math.random() * 0.5);
        spawnFromStroke(st, px, py, use);
        st.water = Math.max(0, st.water - use);
      }
    }
    st.x = x;
    st.y = y;
  };
  sim.end = (id) => {
    const st = strokes.get(id);
    if (!st) return;
    strokes.delete(id);
    // 軽く触れただけ（タップ）では水滴を作らない
    if (st.water > DROP_WATER * 0.45) spawnFromStroke(st, st.x, st.y, st.water);
  };
  sim.setGravity = (x, y) => { gx = x; gy = y; };

  sim.resize = (nw, nh) => {
    nw = Math.max(1, Math.round(nw));
    nh = Math.max(1, Math.round(nh));
    if (nw === w && nh === h) return false;
    const nc = Math.min(6, Math.max(3, Math.round(Math.sqrt((nw * nh) / 48000))));
    const ngw = Math.ceil(nw / nc) + 1, ngh = Math.ceil(nh / nc) + 1, N = ngw * ngh;
    const nf = new Float32Array(N).fill(1), nhd = new Float32Array(N), nr = new Float32Array(N), nfr = new Float32Array(N), ns = new Float32Array(N);
    for (let j = 0; j < ngh; j++) for (let i = 0; i < ngw; i++) {
      const n = j * ngw + i, x = (i + 0.5) * nc, y = (j + 0.5) * nc;
      ns[n] = seedAt(x, y);
      // 回転やキーボードで大きさが変わっても、拭いた所はそのまま残す
      if (fog) {
        const oi = Math.floor(x / cell), oj = Math.floor(y / cell);
        if (oi < gw && oj < gh) {
          const o = oj * gw + oi;
          nf[n] = fog[o]; nhd[n] = hold[o]; nr[n] = rim[o]; nfr[n] = fresh[o];
        }
      }
    }
    const first = !fog;
    fog = nf; hold = nhd; rim = nr; fresh = nfr; seed = ns;
    w = nw; h = nh; cell = nc; gw = ngw; gh = ngh;
    bytes = new Uint8Array(N * 4);
    if (first && intro && !reduced) {
      // 画面の端（特に下）から真ん中へ曇っていく
      fog.fill(0);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const n = j * gw + i, x = (i + 0.5) * cell / w, y = (j + 0.5) * cell / h;
        const edge = Math.min(x, 1 - x, y * 0.8, (1 - y) * 0.5) * 2;
        hold[n] = 0.05 + 1.5 * (0.3 * seed[n] + 0.7 * Math.min(1, edge));
      }
      introUntil = t + INTRO;
    }
    for (let n = 0; n < N; n++) { bytes[(n << 2) + 3] = 255; put(n); }
    sim.grid = { gw, gh, cell, bytes };
    ri0 = 0; ri1 = gw - 1; rj0 = 0; rj1 = gh - 1;
    dirty = true;
    return true;
  };

  const refog = (dt) => {
    let refogging = 0, decaying = 0, holding = 0, minHold = Infinity, changed = false;
    let ni0 = gw, ni1 = -1, nj0 = gh, nj1 = -1;
    const rate = (t < introUntil ? 5 : 1) / REFOG;
    const rimK = Math.exp(-dt / RIM_LIFE), frK = dt / FRESH_LIFE;
    for (let j = rj0; j <= rj1; j++) {
      for (let i = ri0, n = j * gw + ri0; i <= ri1; i++, n++) {
        let f = fog[n], r = rim[n], fr = fresh[n], tt = dt;
        const hd = hold[n];
        if (f >= 1 && r === 0 && fr === 0) { if (hd > 0) hold[n] = 0; continue; }
        if (hd > 0) {
          if (hd > tt) { hold[n] = hd - tt; tt = 0; holding++; if (hd - dt < minHold) minHold = hd - dt; }
          else { hold[n] = 0; tt -= hd; }
        }
        let ch = false;
        if (tt > 0 && f < 1) {
          f = Math.min(1, f + tt * rate * (0.7 + 0.7 * seed[n]));
          fog[n] = f;
          ch = true;
          if (f < 1) refogging++;
        }
        if (r > 0) { r *= rimK; if (r < 0.03) r = 0; rim[n] = r; ch = true; if (r) decaying++; }
        if (fr > 0) { fr -= frK; if (fr < 0) fr = 0; fresh[n] = fr; ch = true; if (fr) decaying++; }
        if (ch) { put(n); changed = true; }
        if (f < 1 || r > 0 || fr > 0) {
          if (i < ni0) ni0 = i;
          if (i > ni1) ni1 = i;
          if (j < nj0) nj0 = j;
          if (j > nj1) nj1 = j;
        }
      }
    }
    if (changed) dirty = true;
    ri0 = ni0; ri1 = ni1; rj0 = nj0; rj1 = nj1;
    return { refogging, decaying, holding, minHold };
  };

  // 水滴を動かす（1 回ぶん、dt ≤ 1/60 秒）。動きがあれば true
  const moveDrops = (dt) => {
    const g = Math.hypot(gx, gy), gm = Math.pow(Math.max(g, 0.08), 0.8);
    const ux = g > 1e-3 ? gx / g : 0, uy = g > 1e-3 ? gy / g : 1;
    let busy = false;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;
      if (d.grow < 1) { d.grow = Math.min(1, d.grow + dt / d.growT); busy = true; }
      if (d.dying) {
        d.alpha -= dt * 2.5;
        busy = true;
        if (d.alpha <= 0) drops.splice(i, 1);
        continue;
      }
      if (!d.moving) continue;
      busy = true;
      if (d.stuck > 0) { d.stuck -= dt; continue; }
      // 大きいほど速い。遅くなりきったら止まって粒になる
      const target = speedOf(d.r, gm);
      d.v += (target - d.v) * Math.min(1, dt * 4);
      if (target < V_STOP && d.v < V_STOP) { d.moving = false; d.v = 0; continue; }
      // ときどき引っかかって止まり、向きが少し折れる
      if (Math.random() < dt * 0.7) {
        d.stuck = 0.05 + Math.random() * Math.random() * 0.6;
        d.v *= 0.3;
        d.turn += (Math.random() - 0.5) * 0.5;
        continue;
      }
      // 向きはゆっくりさまよう（真下へ戻ろうとする。揺らぎは √dt に比例させ、フレームの細かさに左右されないように）
      d.turn += -d.turn * 1.5 * dt + (Math.random() - 0.5) * 1.2 * Math.sqrt(dt);
      const a = d.turn + Math.sin(d.age * 4.7 + d.seed * 30) * 0.06, ca = Math.cos(a), sa = Math.sin(a);
      const vx = ux * ca - uy * sa, vy = ux * sa + uy * ca;
      const step = d.v * dt;
      d.x += vx * step;
      d.y += vy * step;
      // 通り道を晴らし（幅は水滴より細く、少し揺らぐ）、曇りの水を集めて育つ。通った跡に水を取られて痩せる
      d.trail += step;
      const tw = d.r * (0.5 + 0.12 * Math.sin(d.trail * 0.21 + d.seed * 9) + 0.06 * Math.sin(d.trail * 0.67));
      const got = stamp(d.x, d.y, tw, 0.8, TRAIL_HOLD, 0.05);
      const A = d.r * d.r + got * PICKUP - FILM * step * d.r - SEEP * dt;
      d.r = Math.min(R_MAX, Math.sqrt(Math.max(0, A)));
      // ところどころに小さな粒を残す（自分の残した粒は吸い込まない）
      d.bead += step;
      if (d.bead > d.nextBead) {
        d.bead = 0;
        d.nextBead = 8 + Math.random() * 22;
        if (Math.random() < 0.6 && d.r > 2.8) {
          const rb = d.r * (0.22 + Math.random() * 0.16), back = d.r * 1.1 + rb;
          const b = addDrop(d.x - vx * back, d.y - vy * back, rb, { moving: false, growT: 0.15 });
          if (b) { b.grow = 1; b.owner = d; d.r = Math.sqrt(Math.max(0, d.r * d.r - rb * rb * 0.8)); }
        }
      }
      if (d.x < -20 || d.y < -20 || d.x > w + 20 || d.y > h + 20) drops.splice(i, 1);
    }
    // 動いている水滴が他の水滴に触れたら合体する（大きくなって速くなる）
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (!a.moving || a.dying) continue;
      for (let j = 0; j < drops.length; j++) {
        const b = drops[j];
        if (j === i || b.dying || b.owner === a) continue;
        const dx = b.x - a.x, dy = b.y - a.y, m = (a.r + b.r) * 0.85;
        if (dx * dx + dy * dy >= m * m) continue;
        const A = a.r * a.r, B = b.r * b.r;
        a.x = (a.x * A + b.x * B) / (A + B);
        a.y = (a.y * A + b.y * B) / (A + B);
        a.r = Math.min(R_MAX, Math.sqrt(A + B));
        a.grow = 1;
        if (b.moving) a.v = Math.max(a.v, b.v);
        drops.splice(j, 1);
        if (j < i) i--;
        j--;
      }
    }
    return busy;
  };

  // 止まった粒は少しずつ乾く。粒の下は晴れたまま。大きい粒は端末を傾けるとまた垂れ出す
  const settleBeads = (dt) => {
    let any = false;
    const gm = Math.pow(Math.max(Math.hypot(gx, gy), 0.08), 0.8);
    for (const d of drops) {
      if (d.moving || d.dying) continue;
      any = true;
      d.r -= dt * EVAP;
      if (d.r < 0.8) d.dying = true;
      else if (!reduced && d.r >= R_MOVE && speedOf(d.r, gm) > V_STOP * 3) { d.moving = true; d.stuck = 0.2; }
      else keepClear(d.x, d.y, d.r * 0.8, 1.6);
    }
    return any;
  };

  // dt 秒進める。返り値 next: 次に呼べばよい秒数（0 = 次のフレーム、Infinity = 入力があるまで不要）
  sim.step = (dtIn) => {
    // 曇っていく演出の間は、起動の重さでフレームが飛んでも一気に進めない
    const dt = Math.min(Math.max(dtIn, 0), t < introUntil ? 0.1 : 120);
    t += dt;
    // マスの曇り直しは 20Hz にまとめる（拭く・垂れるはその場で書き込むので、遅れは見えない）
    pend += dt;
    if (pend >= 0.05) { cells = ri1 >= ri0 ? refog(pend) : null; pend = 0; }
    let left = Math.min(dt, 0.1), dropsBusy = false;
    while (left > 1e-4) {
      const s = Math.min(left, 1 / 60);
      if (moveDrops(s)) dropsBusy = true;
      left -= s;
    }
    const beads = settleBeads(dt);
    let next = Infinity;
    if (strokes.size || dropsBusy || t < introUntil) next = 0;
    // 曇り直しはゆっくりなので 20fps で足りる（粒が乾いた跡など、わずかな所だけなら 8fps）
    else if (cells && cells.refogging) next = cells.refogging > 400 ? 1 / 20 : 1 / 8;
    else {
      if (cells && cells.decaying) next = 0.5;
      if (cells && cells.holding) next = Math.min(next, Math.max(0.05, cells.minHold));
      if (beads) next = Math.min(next, 1);
    }
    const changed = dirty;
    dirty = false;
    return { changed, dropsChanged: dropsBusy || beads, next };
  };

  // ぼかし用のマスク（不透明度 = 曇りの濃さ）を ImageData に書く
  sim.buildMask = (data) => {
    for (let n = 0, N = fog.length; n < N; n++) data[(n << 2) + 3] = smooth((fog[n] - 0.06) / 0.74) * 255;
  };

  sim.resize(width, height);
  return sim;
}
