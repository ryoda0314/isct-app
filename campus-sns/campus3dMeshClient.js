// 形（buildMesh）を Web Worker（campus3dMeshWorker.js）で作る窓口（2026-11-24）。Worker が使えない・こわれたときは null を返すので、
// 呼ぶ側はいままでどおりその場で作る。
// buildMeshOff(view, near, opts, { burns, bldColor, needClip, dem }) → Promise<res | null>（同じ view は 2 回目から送らない。標高のタイルも新しいものだけ）
// 一度に作るのは 1 つだけ。作っているあいだに頼まれた物は、いちばん新しい 1 つだけを次に作り、追い越された頼みは作らずに null を返す
// （2026-11-25：起動中に作り直しの頼みが重なると、Worker が古い物から順に全部作り、新しい形が出るまで何倍も待っていた）
let worker = null;
let broken = false;
let seq = 0;
const waiting = new Map();
let sentView = null;
const sentTiles = new Set();
let busy = false; // Worker が作っているところ
let next = null; // まだ送っていない頼み（いちばん新しい 1 つ）：{ args, resolve, reject }

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
      try { worker.terminate(); } catch { /* もう止まっている */ }
      worker = null;
      const err = new Error(ev?.message || "mesh worker failed");
      const list = [...waiting.values()];
      waiting.clear();
      for (const w of list) w.reject(err);
      if (next) {
        const job = next;
        next = null;
        job.reject(err);
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

// toneF：時刻の色の割合（campus3dSky の lookFor の f。tone の関数は送れないので、Worker の側で同じ toneOf を作る）
export function buildMeshOff(view, near, opts, extra = {}) {
  if (Object.values(opts || {}).some((v) => typeof v === "function")) return null; // 関数は送れない（その場で作る）
  if (!start()) return null;
  return new Promise((resolve, reject) => {
    if (next) next.resolve(null); // 追い越された頼み：作らない
    next = { args: [view, near, opts, extra], resolve, reject };
    pump();
  });
}

// 空いていれば、待っている頼みを送る。送る物（view・標高のタイル・建物の色）は送るときに決める
function pump() {
  if (busy || !next) return;
  const job = next;
  next = null;
  const w = start();
  if (!w) {
    job.reject(new Error("mesh worker unavailable"));
    return;
  }
  const [view, near, opts, { burns = [], bldColor = null, needClip = false, dem, chunks = true, toneF = null } = {}] = job.args;
  const id = ++seq;
  const msg = { id, near: near ? [...near] : null, burns, opts, needClip, chunks, toneF };
  if (bldColor) msg.bldColors = Object.fromEntries(view.filter((f) => f.type === "building").map((f) => [f.id, bldColor(f)]));
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
