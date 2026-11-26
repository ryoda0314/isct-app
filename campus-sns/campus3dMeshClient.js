// 形（buildMesh）を Web Worker（campus3dMeshWorker.js）で作る窓口（2026-11-24）。Worker が使えない・こわれたときは null を返すので、
// 呼ぶ側はいままでどおりその場で作る。
// buildMeshOff(view, inside, opts, { burns, bldColor, needClip, dem, only, release }) → Promise<res | null>（同じ view は 2 回目から送らない。
// 標高のタイルも新しいものだけ）。inside は中を描く建物（host の id の Set。null は全部）、only なら inside の建物の中だけを作る
// 一度に作るのは 1 つだけ。作っているあいだに頼まれた物は、種類（全体の形・建物の中だけ）ごとにいちばん新しい 1 つだけを次に作り、
// 追い越された頼みは作らずに null を返す（2026-11-25：起動中に作り直しの頼みが重なると、Worker が古い物から順に全部作り、
// 新しい形が出るまで何倍も待っていた）。全体の形を先に作る（建物の中は全体の形の色・時刻に合わせて作り直すので）
let worker = null;
let broken = false;
let seq = 0;
const waiting = new Map();
let sentView = null;
const sentTiles = new Set();
let busy = false; // Worker が作っているところ
// まだ送っていない頼み（種類ごとにいちばん新しい 1 つ）：{ args, resolve, reject }
const next = { base: null, inside: null };
let idleTimer = 0;

function start() {
  if (worker || broken || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./campus3dMeshWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const w = waiting.get(data.id);
      if (!w) return;
      waiting.delete(data.id);
      if (data.error) w.reject(new Error(data.error));
      else w.resolve(data.res);
    };
    worker.onerror = (ev) => {
      // 先に止めてから知らせる（知らせを受けて次の頼みを送るとき、こわれた Worker に送らないように）
      broken = true;
      clearTimeout(idleTimer);
      try { worker.terminate(); } catch { /* もう止まっている */ }
      worker = null;
      const err = new Error(ev?.message || "mesh worker failed");
      const list = [...waiting.values()];
      waiting.clear();
      for (const w of list) w.reject(err);
      for (const k of Object.keys(next)) {
        const job = next[k];
        next[k] = null;
        job?.reject(err);
      }
      busy = false;
    };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

export function meshWorkerReady() {
  return !!start();
}

// Worker を止める（こわれたのではない：次に頼まれたら作り直す）。送った物の覚えも消す
function stop() {
  clearTimeout(idleTimer);
  idleTimer = 0;
  if (!worker) return;
  try { worker.terminate(); } catch { /* もう止まっている */ }
  worker = null;
  sentView = null;
  sentTiles.clear();
}

// toneF：時刻の色の割合（campus3dSky の lookFor の f。tone の関数は送れないので、Worker の側で同じ toneOf を作る）
export function buildMeshOff(view, inside, opts, extra = {}) {
  if (Object.values(opts || {}).some((v) => typeof v === "function")) return null; // 関数は送れない（その場で作る）
  if (!start()) return null;
  const kind = extra.only ? "inside" : "base";
  return new Promise((resolve, reject) => {
    if (next[kind]) next[kind].resolve(null); // 追い越された頼み：作らない
    next[kind] = { args: [view, inside, opts, extra], resolve, reject };
    pump();
  });
}

// 空いていれば、待っている頼みを送る（全体の形が先）。送る物（view・標高のタイル・建物の色）は送るときに決める
function pump() {
  if (busy) return;
  const kind = next.base ? "base" : next.inside ? "inside" : null;
  if (!kind) return;
  const job = next[kind];
  next[kind] = null;
  clearTimeout(idleTimer);
  idleTimer = 0;
  const w = start();
  if (!w) {
    job.reject(new Error("mesh worker unavailable"));
    return;
  }
  const [view, inside, opts, { burns = [], bldColor = null, needClip = false, dem, chunks = true, toneF = null, release = false, only = false } = {}] = job.args;
  const id = ++seq;
  const msg = { id, inside: inside ? [...inside] : null, only, burns, opts, needClip, chunks, toneF };
  if (bldColor && !only) msg.bldColors = Object.fromEntries(view.filter((f) => f.type === "building").map((f) => [f.id, bldColor(f)]));
  if (view !== sentView) {
    msg.view = view;
    sentView = view;
  }
  const tiles = [];
  for (const [k, a] of dem?.tiles || []) if (a && !sentTiles.has(k)) { tiles.push([k, a]); sentTiles.add(k); }
  if (tiles.length) msg.demTiles = tiles;
  busy = true;
  const done = () => {
    busy = false;
    // release（スマホ。2026-11-26）：作り終えて次の頼みがなければ Worker を止める。作るあいだの一時的な配列（できた形の 3 倍ほど）が
    // Worker の中に残り、GC が走るまで数百 MB〜1 GB を持ったままだった（iPhone のタブが落ちる）。止めればすぐ返る。
    // 次に頼むときは Worker を作り直し、view と標高のタイルを送り直す。
    // 建物の中だけ（only）は小さいので、歩いているあいだ続けて頼めるように少し待ってから止める（毎回 view を送り直さない）
    if (release && !next.base && !next.inside) {
      if (only) idleTimer = setTimeout(stop, 20000);
      else stop();
    }
    pump();
  };
  waiting.set(id, { resolve: (res) => { job.resolve(res); done(); }, reject: (err) => { job.reject(err); done(); } });
  try {
    w.postMessage(msg);
  } catch (err) {
    // 送れなかった：次は view をかならず送る。送ったことにしたタイルも戻す
    waiting.delete(id);
    sentView = null;
    for (const [k] of tiles) sentTiles.delete(k);
    job.reject(err);
    done();
  }
}
