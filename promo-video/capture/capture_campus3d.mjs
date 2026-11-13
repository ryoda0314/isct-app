// 大岡山キャンパス 3D マップ紹介映像（CampusMapFilm）の 3D の連番を撮る。アプリのコードは変えない。
//
//   開発サーバ（アプリ）が動いていること（既定 http://localhost:3000。APP_URL で変える）
//   node capture/capture_campus3d.mjs [カットの id,...] [--scout] [--step=N]
//     --scout   各カットの 4 点（はじめ・1/3・2/3・おわり）だけ撮って、out/c3d_scout/<id>.jpg に並べる（カメラの確かめ）
//     --step=N  N コマおきに撮る（動きの確かめ）
//
// 出力: out/c3d_public/shots/<id>/NNNN.jpg（1920x1080。NNNN はカットの中のコマ番号）
//
// 撮り方：
// - timeweb（capture/vendor/timeweb.js・BSD-3-Clause）でページの時間を仮想にし、1/30 秒ずつ進めて撮る（重い場面でもコマ落ちしない）。
//   空・雲・雨・木のゆれ・稲妻・電車・世界の時計（campus3dClock）は、どれも仮想の時間で動く。
// - カメラは「歩いて見る」（空を飛ぶ・すり抜け）に入ってから、歩く人の w.anim（はじめのつなぎの動き）に毎コマ同じ位置を入れて決める
//   （アプリが毎コマ eyeCamera で地図のカメラを置く。ほかの動き・当たり判定は止まる）。
// - 時刻・天気・雷はデバッグの window.__campusEnv（MapEnvDebug）で決める。画面の UI（ボタン・ヘッダ）は CSS で隠す。
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, PAD, SHOTS } from '../src/campus3d/shots.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.APP_URL || 'http://localhost:3000';
const TIMEWEB = readFileSync(join(__dirname, 'vendor', 'timeweb.js'), 'utf8');
const OUT = join(ROOT, 'out', 'c3d_public', 'shots');
const SCOUT = join(ROOT, 'out', 'c3d_scout');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const scout = args.includes('--scout');
const step = Number(opt('step', '1'));
const only = args.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(','));
const VIEWS = opt('views', null) ? JSON.parse(readFileSync(opt('views'), 'utf8')) : null;
// 構図を探す 1 枚ずつのカット（pos・look は標高の z。ground 0 として扱う）
const viewShot = (v) => ({
  id: v.id, len: 1, ground: 0, groundZ: 0, fov: v.fov || 60, detail: !!v.detail, warm: 40,
  env: { day: v.day || '2026-05-18', hm: v.hm || '12:00', preset: v.preset || 'fair' },
  cam: () => ({ pos: v.pos, look: v.look }),
});
const list = VIEWS ? VIEWS.map(viewShot) : SHOTS.filter((s) => !only.length || only.includes(s.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// アプリと同じ地図の m ↔ 経緯度（campus3dFeatures の toXY・toLngLat。原点は useLocationSharing の CAMPUS_CENTER）
const LNG0 = 139.6835;
const LAT0 = 35.6048;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110950;
const toLngLat = ([x, y]) => [LNG0 + x / KX, LAT0 + y / KY];
const jst = (day, hm) => Date.parse(`${day}T${hm.length === 5 ? `${hm}:00` : hm}+09:00`);

// カメラの位置・見る点 → 歩く人の向き（yaw：北 0・時計回り）・ピッチ（0 真下・90 水平・180 真上）
function pose(S, G, u) {
  const c = S.cam(u);
  const p = c.pos;
  const l = c.look;
  const dx = l[0] - p[0];
  const dy = l[1] - p[1];
  const dz = l[2] - p[2];
  const yaw = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  let pitch = 90 + (Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI;
  if (Math.abs(pitch - 90) < 0.3) pitch = 90.3; // ちょうど水平は MapLibre が止まる（タイルの範囲の計算）
  return { x: p[0], y: p[1], z: G + p[2], yaw, pitch, fov: c.fov || S.fov || 52 };
}

async function openSession(browser, detail) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.emulateTimezone('Asia/Tokyo');
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument((det) => {
    try {
      localStorage.setItem('navView3d', '1'); localStorage.setItem('langPref', 'ja'); localStorage.setItem('cb3Look', 'auto');
      localStorage.setItem('mapLocConsent', 'denied'); localStorage.setItem('cb3Detail', det ? '1' : '0'); localStorage.setItem('cb3EnvDbg', '0');
      localStorage.removeItem('map3dEditorDraft');
    } catch { /* なくてよい */ }
    // 開発サーバの HMR（ファイルを書き換えたときの読み直し）を止める
    const RealWS = window.WebSocket;
    window.WebSocket = function (u, p) { if (String(u).includes('webpack-hmr')) return { close() {}, send() {}, addEventListener() {}, readyState: 0 }; return new RealWS(u, p); };
    // MapLibre の地図を window.__ml に
    let ml;
    Object.defineProperty(window, 'maplibregl', { configurable: true, get: () => ml, set: (v) => { const Real = v.Map; class M extends Real { constructor(o) { super(o); window.__ml = this; } } ml = new Proxy(v, { get: (t, k) => (k === 'Map' ? M : t[k]) }); } });
  }, detail);
  await page.evaluateOnNewDocument(`${TIMEWEB}\n;window.timeweb.startRealtimeSimulation();`);
  for (let i = 0; i < 4; i++) {
    try { await page.goto(`${BASE}/#navi`, { waitUntil: 'domcontentloaded', timeout: 300000 }); break; } catch (e) { console.log('  retry', e.message.slice(0, 60)); await sleep(3000); }
  }
  await page.waitForFunction(() => window.__ml && window.__ml.loaded() && window.__ml.getLayer('cb-extras') && window.__campusEnv, { timeout: 300000, polling: 500 });
  await sleep(2500);
  await page.evaluate(() => window.__ml.jumpTo({ center: [139.684045, 35.605828], zoom: 19, pitch: 5, bearing: 0 }));
  await sleep(1500);
  await page.click('button[aria-label="歩いて見る"]');
  await sleep(900);
  await page.evaluate(() => [...document.querySelectorAll('.cb3-pick-btns button')].find((b) => b.textContent.includes('まん中')).click());
  await sleep(4500);
  // 歩く人の状態（React の ref）を探す
  const ok = await page.evaluate(() => {
    const el = document.querySelector('.cb3-walking');
    if (!el) return false;
    const seen = new Set();
    let node = el;
    for (let up = 0; node && up < 12; up++, node = node.parentElement) {
      const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
      let fb = key ? node[key] : null;
      for (let d = 0; fb && d < 40; d++, fb = fb.return) {
        if (seen.has(fb)) continue;
        seen.add(fb);
        let h = fb.memoizedState;
        for (let i = 0; h && i < 400; i++, h = h.next) {
          const v = h.memoizedState;
          if (v && typeof v === 'object' && 'current' in v && v.current && typeof v.current === 'object' && 'world' in v.current && 'yaw' in v.current && 'keys' in v.current) {
            window.__walk = v;
            return true;
          }
        }
      }
    }
    return false;
  });
  if (!ok) throw new Error('歩く人が見つかりません');
  // 画面いっぱいに。UI（ヘッダ・ボタン・案内・十字）は隠す
  await page.addStyleTag({
    content: `.cb3-walking{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important}
      .cb3-walking > *:not(.maplibregl-map):not(canvas){visibility:hidden!important}
      .cb3-walking .maplibregl-control-container,.maplibregl-marker,.maplibregl-popup{visibility:hidden!important}
      nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}`,
  });
  await page.evaluate(() => {
    window.__ml.resize();
    const w = window.__walk.current;
    w.fly = true;
    w.noclip = true;
    window.timeweb.stopRealtimeSimulation();
    window.__sky = () => { const l = window.__ml.getLayer('cb-sky'); return l && (l.implementation || l); };
  });
  const vt = await page.evaluate(() => performance.now());
  return { page, logs, vt };
}

// 仮想の時間を 1 コマ進める（その前に歩く人の位置を決める）
async function frame(sess, P) {
  sess.vt += 1000 / FPS;
  await sess.page.evaluate((o) => {
    const w = window.__walk.current;
    w.fly = true;
    w.noclip = true;
    w.vx = 0; w.vy = 0; w.vz = 0;
    // 見る点までの距離 D：画角が狭い（望遠）と、アプリの eyeCamera のズームが地図の上限（24）を超えてカメラがずれ、次のカットまで崩れるので伸ばす
    const D = 8 * Math.max(1, Math.tan((35 * Math.PI) / 180) / Math.tan((o.P.fov * Math.PI) / 360));
    const pp = { x: o.P.x, y: o.P.y, z: o.P.z, yaw: o.P.yaw, pitch: o.P.pitch, D, fov: o.P.fov };
    w.anim = { t0: performance.now(), dur: 1e12, from: pp, to: pp };
    window.timeweb.goTo(o.t);
  }, { P, t: sess.vt });
  // React の更新・タイルの読み込みを実時間でひと呼吸待つ
  await sess.page.evaluate(() => new Promise((r) => window.timeweb.realtime.requestAnimationFrame(() => window.timeweb.realtime.setTimeout(r, 0))));
}

async function setEnv(page, S, ms, speed) {
  await page.evaluate((o) => {
    const E = window.__campusEnv;
    E.reset();
    if (o.env.preset) E.preset(o.env.preset);
    if (o.env.set) E.set(o.env.set);
    E.setTime(o.ms, o.speed);
    const sky = window.__sky();
    if (sky && sky.lightning) sky.lightning.next = Infinity; // 雷は決めたコマだけ（勝手に光らせない）
  }, { env: S.env || {}, ms, speed });
}

async function groundOf(page, S) {
  if (Number.isFinite(S.groundZ)) return S.groundZ;
  const ll = toLngLat(S.ground || [40, 80]);
  const g = await page.evaluate((p) => window.__ml.queryTerrainElevation(p), ll);
  return Number.isFinite(g) ? g : 34;
}

async function captureShot(sess, S) {
  const { page } = sess;
  const n = S.len + PAD;
  const env = S.env || {};
  const ms0 = jst(env.day, env.hm);
  const dur = n / FPS;
  const speed = env.until ? (jst(env.day, env.until) - ms0) / (dur * 1000) : env.speed ?? 0;
  await setEnv(page, S, ms0, 0);
  const uOf = (f) => Math.min(1, f / (n - 1));
  // 基準の地面：地形のタイルがまだ読まれていないと 0 が返る（前のカットのカメラが遠いとき）ので、
  // まずは仮の高さ（34m）ではじめの位置へ行って読ませてから測る
  let G = await groundOf(page, S);
  if (!Number.isFinite(S.groundZ)) {
    for (let k = 0; k < 15; k++) await frame(sess, pose(S, G > 5 ? G : 34, 0));
    for (let k = 0; k < 20; k++) {
      if (await page.evaluate(() => window.__ml.areTilesLoaded())) break;
      await sleep(250);
    }
    const g2 = await groundOf(page, S);
    if (g2 > 5) G = g2;
    else if (!(G > 5)) throw new Error(`${S.id}: 地面の高さが取れません（${G}・${g2}）`);
  }
  const at = (f) => pose(S, G, uOf(f));
  // ならし（タイル・屋根の高さの地図・木の形）：はじめの位置で 1.5 秒（S.warm コマ）
  for (let k = 0; k < (S.warm ?? 45); k++) await frame(sess, at(0));
  for (let k = 0; k < 40; k++) {
    const done = await page.evaluate(() => window.__ml.areTilesLoaded());
    if (done) break;
    await sleep(250);
  }
  const frames = VIEWS ? [0] : scout ? [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1] : Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);
  const dir = scout || VIEWS ? SCOUT : join(OUT, S.id);
  mkdirSync(dir, { recursive: true });
  if (!scout && !VIEWS) for (const f of readdirSync(dir)) if (f.endsWith('.jpg')) unlinkSync(join(dir, f));
  // 時刻：はじめに決めて、あとは速さで進める（コマを飛ばす確かめのときは毎コマ決める）
  await setEnv(page, S, ms0, speed);
  let prevF = -1;
  const shots = [];
  for (const f of frames) {
    const u = uOf(f);
    const jump = f !== prevF + 1;
    if (S.timeline) {
      const tl = S.timeline(u);
      await page.evaluate((ms) => window.__campusEnv.setTime(ms, 0), jst(tl.day, tl.hm));
    } else if (jump && f > 0) {
      await page.evaluate((o) => window.__campusEnv.setTime(o.ms, o.speed), { ms: ms0 + (f / FPS) * 1000 * speed, speed });
    }
    if (S.weather) await page.evaluate((w) => window.__campusEnv.set(w), S.weather(u));
    const P = at(f);
    for (const fl of S.flashes || []) {
      if (fl.f !== f) continue;
      await page.evaluate((o) => { window.__campusEnv.flash(o); const sky = window.__sky(); if (sky && sky.lightning) sky.lightning.next = Infinity; }, { kind: fl.kind, az: (P.yaw + fl.rel + 360) % 360, dist: fl.dist });
    }
    // コマを飛ばしたときは、その位置でひと呼吸（タイル）
    if (jump && f > 0) for (let k = 0; k < 12; k++) await frame(sess, P);
    await frame(sess, P);
    const file = VIEWS ? join(SCOUT, `v_${S.id}.jpg`) : scout ? join(dir, `${S.id}_${shots.length}.jpg`) : join(dir, `${String(f).padStart(4, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: scout ? 82 : 93 });
    shots.push(file);
    prevF = f;
    if (!scout && f % 60 === 0) process.stdout.write(`  ${S.id} ${f}/${n}\r`);
  }
  const info = await page.evaluate(() => { const e = window.__campusEnv.env(); return e && { sun: [+e.sun.elevation.toFixed(1), Math.round(e.sun.azimuth)], moon: [+e.moon.elevation.toFixed(1), Math.round(e.moon.azimuth)] }; });
  console.log(`  ${S.id}: ${shots.length} コマ G=${G.toFixed(1)} ${JSON.stringify(info)}`);
  return shots;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--lang=ja-JP', '--ignore-gpu-blocklist'], protocolTimeout: 1200000 });
try {
  // 建物の中（detail）を見るカットとそうでないカットで、ページを分ける
  for (const detail of [false, true]) {
    const group = list.filter((s) => !!s.detail === detail);
    if (!group.length) continue;
    const t0 = Date.now();
    const sess = await openSession(browser, detail);
    console.log(`session detail=${detail} ready ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const sheets = [];
    for (const S of group) {
      const t1 = Date.now();
      const files = await captureShot(sess, S);
      sheets.push([S.id, files]);
      console.log(`  ${S.id} ${((Date.now() - t1) / 1000).toFixed(0)}s`);
    }
    if (sess.logs.length) console.log(sess.logs.slice(0, 8).join('\n'));
    await sess.page.close();
  }
} finally {
  await browser.close();
}
