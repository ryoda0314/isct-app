// 最高傑作版（AppPromoFilm・約3分）で使う、アプリの実画面と3Dキャンパスの連番を撮る。
//
//   1) 別ターミナルで開発サーバを起動:  npx next dev -p 3123
//   2) node promo-video/capture/capture_film.mjs [グループや画面の名前,...] [--preview]
//        グループ: screens themes langs wall desk hero route night winter（省略で全部）
//        --preview: 連番を等倍・6コマおきに撮る（カメラの動きを確かめる用。public/film/map/<名前>_preview/）
//
// 出力:
//   public/film/screens/*.png        … スマホの画面（390x770 の3倍。テーマ・言語違いと機能の壁は2倍）
//   public/film/desk/*.png           … PC の画面（1440x900 の2倍）
//   public/film/map/<名前>/NNNN.jpg  … 3Dキャンパスの連番（2倍で撮って 1920x1080 に縮める）。NNNN は動画のフレーム番号
//   src/film/maps/<名前>.json        … 連番の各コマで、建物の名前・駅・地点が画面のどこにあるか
//   src/film/rects.json              … 画面の中のカード（天気・締切など）の位置（切り出して浮かせる用）
//
// 3Dキャンパスはアプリのコードを変えずに撮る：MapLibre の地図をページの外から取り出して画面いっぱいに広げ、
// カメラ・建物の高さ・ルートの線を1コマずつ動かす。アプリの名前ラベルは消して位置だけ記録し、動画の側で描き直す。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanFestival, clickText, fixUndefinedPoints, hookMap, launch, openApp, scrollMain, shot, sleep } from './lib.mjs';
import ROUTE from '../src/promo2/campusRoute.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCREENS = join(ROOT, 'public', 'film', 'screens');
const DESK = join(ROOT, 'public', 'film', 'desk');
const MAPS = join(ROOT, 'public', 'film', 'map');
const META = join(ROOT, 'src', 'film');
const FFMPEG = join(ROOT, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
[SCREENS, DESK, MAPS, join(META, 'maps')].forEach((d) => mkdirSync(d, { recursive: true }));

const args = process.argv.slice(2);
const PREVIEW = args.includes('--preview');
const only = args.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(','));
const want = (...names) => !only.length || names.some((n) => only.includes(n));

// 季節ごとのテーマと日付（デモのデータは日付に合わせて「1Q 水曜授業 第1回」などが変わる）
const SEASON = {
  spring: { theme: 'sakura', day: '2026-04-08', quarter: '1' },
  summer: { theme: 'shinryoku', day: '2026-06-17', quarter: '2' },
  autumn: { theme: 'koyo', day: '2026-10-10', quarter: '3' },
  winter: { theme: 'yuki', day: '2027-01-27', quarter: '4' },
  plain: { theme: 'tsubame', day: '2026-06-17', quarter: '2' },
};
const HERE = { latitude: 35.60705, longitude: 139.68518 }; // 大岡山駅の改札を出たあたり
const NAVI = { navBasemap: 'illust', navView3d: '1' };

// ── 画面の中のカード（角丸で、背景か枠のある箱）の位置と文字を記録する ──
const RECTS_FILE = join(META, 'rects.json');
const rects = existsSync(RECTS_FILE) ? JSON.parse(readFileSync(RECTS_FILE, 'utf8')) : {};
let rectsDirty = false; // 画面を撮ったときだけ書き戻す（連番だけの実行と並べて走らせても消し合わない）
const cardsOf = (page) => page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 100 || r.height < 30 || r.height > 560 || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(e);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    const hasBd = parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none';
    if (rad < 6 || !(hasBg || hasBd)) continue;
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!t) continue;
    out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), t });
  }
  return out;
});

// ── スマホの画面 ──
// [名前, { season, hm, view, height?, dsf?, act?(page, save), fix?, clean?, geo?, storage?, lang? }]
const SHOTS = [
  // 春（桜）：新しい一年。ホーム・時間割・行事・キャンパスナビ（3D）
  ['sp_home', { season: 'spring', hm: '08:40', view: 'home' }],
  ['sp_home_tall', { season: 'spring', hm: '08:40', view: 'home', height: 1500 }],
  ['sp_tt', { season: 'spring', hm: '08:40', view: 'timetable' }],
  ['sp_events', { season: 'spring', hm: '08:40', view: 'events' }],
  ['sp_circles', { season: 'spring', hm: '12:30', view: 'circles' }],
  ['sp_navi', {
    season: 'spring', hm: '08:42', view: 'navigation', geo: HERE, storage: NAVI,
    act: async (page, save) => {
      await page.waitForSelector('.cb3-map canvas', { timeout: 60000 }); await sleep(3000);
      await save('sp_navi_map');
      await clickText(page, '建物・教室・スポットを検索'); await sleep(700);
      await page.keyboard.type('西9号館'); await sleep(700);
      await page.keyboard.press('Enter'); await sleep(2600);
      await save('sp_navi_spot');
      await clickText(page, 'ここへ案内'); await sleep(3200);
      await save('sp_navi_route');
      await clickText(page, '案内を開始'); await sleep(3800);
      await save('sp_navi_guide');
    },
  }],
  // 夏（新緑）：授業と課題。出欠・課題・提出・空き教室・DM・友達
  ['su_home', { season: 'summer', hm: '08:40', view: 'home' }],
  ['su_attendance', { season: 'summer', hm: '08:50', view: 'attendance' }],
  ['su_tasks', { season: 'summer', hm: '17:20', view: 'tasks', fix: true }],
  ['su_asgn', {
    season: 'summer', hm: '17:20', view: 'tasks', fix: true,
    act: async (page, save) => { await clickText(page, '実験レポート第2回'); await sleep(1500); await save('su_asgn'); },
  }],
  ['su_free', {
    season: 'summer', hm: '12:40', view: 'freeroom',
    act: async (page, save) => {
      await save('su_free');
      await clickText(page, '使用中も表示', { exact: true }); await sleep(400);
      await save('su_free_busy');
      await clickText(page, '使用中も表示', { exact: true }); await sleep(400);
      await clickText(page, 'M-B07'); await sleep(900);
      await save('su_free_modal');
    },
  }],
  ['su_dm', {
    season: 'summer', hm: '12:40', view: 'dm',
    act: async (page, save) => {
      await save('su_dm');
      const box = await page.evaluate(() => {
        const c = [...document.querySelectorAll('*')].filter((e) => (e.textContent || '').includes('鈴木一郎') && (e.textContent || '').includes('ありがとう'));
        c.sort((a, b) => a.textContent.length - b.textContent.length);
        const r = c[0]?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
      if (box) { await page.mouse.click(box.x, box.y); await sleep(2200); await save('su_dm_chat'); }
    },
  }],
  ['su_friends', { season: 'summer', hm: '12:30', view: 'friends' }],
  ['su_notif', { season: 'summer', hm: '17:20', view: 'notif' }],
  // 秋（紅葉）：工大祭
  ['au_home', { season: 'autumn', hm: '17:40', view: 'home' }],
  ['au_fest', {
    season: 'autumn', hm: '12:20', view: 'festival', clean: true,
    act: async (page, save) => {
      await save('au_fest');
      const r = await scrollMain(page, 9999);
      await scrollMain(page, Math.min(r?.max ?? 0, 600)); await sleep(500);
      await save('au_fest_grid');
    },
  }],
  ['au_booth', {
    season: 'autumn', hm: '12:20', view: 'festival', clean: true,
    act: async (page, save) => {
      await clickText(page, 'タピオカミルクティー'); await sleep(1600);
      await save('au_booth');
      await scrollMain(page, 260); await sleep(500);
      await save('au_booth_coupon');
    },
  }],
  // 冬（雪）：試験・成績・カレンダー
  ['wi_home', { season: 'winter', hm: '10:00', view: 'home' }],
  ['wi_exams', {
    season: 'winter', hm: '10:00', view: 'exams',
    act: async (page, save) => {
      // 冬なので 2025年度 4Q（1〜2月）の期末試験に切り替える
      await page.evaluate(() => {
        const sel = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === '2025_4'));
        if (!sel) return;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '2025_4');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(900);
      await clickText(page, '全試験一覧'); await sleep(900);
      await save('wi_exams');
    },
  }],
  ['wi_grades', { season: 'winter', hm: '10:00', view: 'grades' }],
  ['wi_gpa', {
    season: 'winter', hm: '10:00', view: 'grades',
    act: async (page, save) => { await clickText(page, 'GPA', { exact: true }); await sleep(1200); await save('wi_gpa'); },
  }],
  ['wi_grading', { season: 'winter', hm: '10:00', view: 'grading' }],
  ['wi_calendar', { season: 'winter', hm: '10:00', view: 'calendar' }],
  ['wi_acadcal', { season: 'winter', hm: '10:00', view: 'acadCal' }],
];

// テーマ違いのホーム（テーマを次々に切り替える場面）
const THEMES = ['tsubame', 'light', 'dark', 'sakura', 'shinryoku', 'koyo', 'yuki', 'titech', 'scitokyo', 'tmdu', 'lavender', 'mint', 'sky', 'peach', 'lemon', 'coral', 'mizukumori'];
// 言語違いのホーム（トキポナは文字を sitelen pona にしたものも）
const LANGS = [['ja'], ['en'], ['zh'], ['ko'], ['tp'], ['tp', 'sp']];
// 機能の壁（ふつうのテーマ。2倍）
const WALL = ['home', 'timetable', 'attendance', 'tasks', 'dm', 'friends', 'circles', 'languages', 'notif', 'calendar', 'acadCal', 'events',
  'freeroom', 'grades', 'exams', 'reviews', 'gym', 'takiplaza', 'tsubame', 'train', 'pocket', 'pomo', 'pdftools', 'qr', 'festival', 'notes',
  'freshman', 'search', 'moreMenu', 'profile', 'textbooks', 'library', 'music', 'lecrec'];
// PC の画面（スマホと PC の場面）
const DESKS = [
  ['dk_home', { season: 'plain', hm: '08:40', view: 'home' }],
  ['dk_tt', { season: 'plain', hm: '08:50', view: 'timetable' }],
  ['dk_free', { season: 'plain', hm: '12:40', view: 'freeroom' }],
  ['dk_tasks', { season: 'plain', hm: '17:20', view: 'tasks', fix: true }],
];

const at = (season, hm) => `${SEASON[season].day}T${hm}:00+09:00`;
const storageOf = (o) => ({ themePref: SEASON[o.season].theme, quarter: SEASON[o.season].quarter, ...(o.storage || {}) });

const browser = await launch();
const run = async (name, o, out = SCREENS, extra = {}) => {
  const { page, context } = await openApp(browser, {
    view: o.view, time: at(o.season, o.hm), geo: o.geo, height: o.height, dsf: o.dsf ?? 3, storage: storageOf(o), ...extra,
  });
  try {
    if (o.wait) await sleep(o.wait);
    const save = async (n) => {
      if (o.fix) await fixUndefinedPoints(page);
      if (o.clean) await cleanFestival(page);
      await shot(page, join(out, `${n}.png`));
      rects[n] = await cardsOf(page);
      rectsDirty = true;
    };
    if (o.act) await o.act(page, save);
    else await save(name);
  } catch (e) {
    console.error(`  [失敗] ${name}: ${e.message}`);
  } finally {
    await context.close();
  }
};

// ── 3Dキャンパスの連番 ─────────────────────────────────────────
// カメラはキーフレーム（動画のフレーム番号ごとの位置）を、なめらかな3次曲線（Catmull-Rom）で結ぶ。
// 最初のキーでは止まった状態から動き出し、最後のキーでは動いたまま終える（次のカットへ勢いを渡す）。
const camAt = (keys, f) => {
  const K = keys;
  if (f <= K[0].f) return { ...K[0], c: [...K[0].c] };
  const last = K[K.length - 1];
  const val = (k) => [k.c[0], k.c[1], k.z, k.p, k.b];
  let i = 0;
  while (i < K.length - 2 && f > K[i + 1].f) i++;
  const a = K[i];
  const b = K[i + 1];
  const tan = (j) => {
    if (j === 0) return [0, 0, 0, 0, 0];
    const p = K[j - 1];
    const n = K[Math.min(K.length - 1, j + 1)];
    const span = (n.f - p.f) || 1;
    return val(n).map((v, q) => (v - val(p)[q]) / span);
  };
  const h = b.f - a.f;
  const u = Math.min(1, Math.max(0, (f - a.f) / h));
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const ma = tan(i);
  const mb = tan(i + 1);
  const v = val(a).map((x, q) => h00 * x + h10 * h * ma[q] + h01 * val(b)[q] + h11 * h * mb[q]);
  if (f > last.f) return { ...last, c: [...last.c] };
  return { c: [v[0], v[1]], z: v[2], p: v[3], b: v[4] };
};
const easeOut3 = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const easeIO = (x) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; };

// ルート（大岡山駅の改札前 → 西9号館。アプリと同じ経路グラフで求めたもの）を、長さの割合 s で切る
const RPTS = ROUTE.points.map(([lat, lng]) => [lng, lat]);
const RLEN = (() => {
  const d = [0];
  for (let i = 1; i < RPTS.length; i++) {
    const dx = (RPTS[i][0] - RPTS[i - 1][0]) * 90500;
    const dy = (RPTS[i][1] - RPTS[i - 1][1]) * 110950;
    d.push(d[i - 1] + Math.hypot(dx, dy));
  }
  return d;
})();
const routeCut = (s) => {
  const L = RLEN[RLEN.length - 1] * Math.min(1, Math.max(0, s));
  const out = [RPTS[0]];
  for (let i = 1; i < RPTS.length; i++) {
    if (RLEN[i] <= L) { out.push(RPTS[i]); continue; }
    const k = (L - RLEN[i - 1]) / (RLEN[i] - RLEN[i - 1] || 1);
    out.push([RPTS[i - 1][0] + (RPTS[i][0] - RPTS[i - 1][0]) * k, RPTS[i - 1][1] + (RPTS[i][1] - RPTS[i - 1][1]) * k]);
    break;
  }
  return out;
};

// 工大祭の夜：提灯を灯す地点（駅前から本館前広場を通る大通り）
const FEST_POINTS = ROUTE.points.slice(0, 9).map(([lat, lng], i) => ({ id: `r${i}`, lng, lat }))
  .concat([
    { id: 'lawnN', lng: 139.68410, lat: 35.60585 }, { id: 'lawnC', lng: 139.68415, lat: 35.60555 }, { id: 'lawnS', lng: 139.68405, lat: 35.60525 },
    { id: 'mainF', lng: 139.68394, lat: 35.60505 }, { id: 'taki', lng: 139.68460, lat: 35.60620 }, { id: 'lib', lng: 139.68400, lat: 35.60636 },
  ]);

const SEQS = {
  // 冒頭〜タイトル前：真上から見下ろした春のキャンパス → 建物が立ち上がる（4小節目の頭 = 192f）→ 傾いて低く滑る → 本館のまわりを回る
  hero: {
    season: 'spring', hm: '06:40', f0: 144, f1: 780,
    keys: [
      { f: 144, c: [139.68385, 35.60500], z: 16.25, p: 0, b: -32 },
      { f: 192, c: [139.68385, 35.60500], z: 16.35, p: 0, b: -29 },
      { f: 252, c: [139.68390, 35.60495], z: 16.55, p: 32, b: -22 },
      { f: 336, c: [139.68390, 35.60490], z: 16.8, p: 52, b: -14 },
      { f: 462, c: [139.68390, 35.60485], z: 17.05, p: 60, b: 2 },
      { f: 576, c: [139.68392, 35.60482], z: 17.3, p: 62, b: 18 },
      { f: 680, c: [139.68396, 35.60480], z: 17.55, p: 64, b: 50 },
      { f: 780, c: [139.68398, 35.60480], z: 17.75, p: 66, b: 84 },
    ],
    rise: (f) => (f < 192 ? 0 : easeOut3((f - 192) / 54)),
  },
  // キャンパスナビ：大岡山駅から西9号館へ、ルートの線が伸びていくのを追う
  route: {
    season: 'spring', hm: '08:42', f0: 2496, f1: 2700, geo: HERE,
    keys: [
      { f: 2496, c: [139.68505, 35.60692], z: 18.0, p: 52, b: 232 },
      { f: 2550, c: [139.68470, 35.60672], z: 18.15, p: 56, b: 236 },
      { f: 2610, c: [139.68410, 35.60636], z: 18.25, p: 58, b: 244 },
      { f: 2660, c: [139.68350, 35.60612], z: 18.3, p: 58, b: 252 },
      { f: 2700, c: [139.68300, 35.60595], z: 18.35, p: 58, b: 258 },
    ],
    route: (f) => easeIO((f - 2506) / 172),
    follow: { lead: 0.08, from: 2500, to: 2540 }, // カメラの中心をルートの少し先へ寄せる
  },
  // 工大祭の夜：本館前広場のまわりをゆっくり回る（暗いテーマなので地図も夜の色）
  night: {
    season: 'autumn', hm: '18:30', f0: 3744, f1: 3950,
    keys: [
      { f: 3744, c: [139.68418, 35.60575], z: 17.55, p: 60, b: 155 },
      { f: 3850, c: [139.68415, 35.60565], z: 17.7, p: 62, b: 182 },
      { f: 3950, c: [139.68410, 35.60555], z: 17.85, p: 63, b: 210 },
    ],
    points: FEST_POINTS,
  },
  // 冬：雪のキャンパス（明るいテーマの地図）を斜め上からゆっくり
  winter: {
    season: 'winter', hm: '10:00', f0: 4032, f1: 4140,
    keys: [
      { f: 4032, c: [139.68395, 35.60490], z: 16.95, p: 42, b: -58 },
      { f: 4140, c: [139.68395, 35.60490], z: 17.1, p: 48, b: -44 },
    ],
  },
};

async function captureSeq(name, S) {
  const step = PREVIEW ? 6 : 1;
  const dsf = PREVIEW ? 1 : 2;
  const dir = join(MAPS, PREVIEW ? `${name}_preview` : name);
  const raw = join(MAPS, `_raw_${name}`);
  rmSync(PREVIEW ? dir : raw, { recursive: true, force: true });
  mkdirSync(PREVIEW ? dir : raw, { recursive: true });
  const { page, context } = await openApp(browser, {
    view: 'navigation', time: at(S.season, S.hm), geo: S.geo, width: 1920, height: 1080, dsf, mobile: false,
    storage: { ...storageOf(S), ...NAVI }, init: hookMap,
  });
  try {
    await page.waitForSelector('.cb3-map canvas', { timeout: 120000 });
    await sleep(4500); // アプリ自身の立ち上がりアニメーションが終わるまで
    const ok = await page.evaluate(() => {
      const map = (window.__maps || []).filter((m) => !m._removed && m.style).pop();
      if (!map) return false;
      window.__m = map;
      // 地図の箱をページの外に出して画面いっぱいに。ほかの画面は隠す
      const wrap = map.getContainer().parentElement;
      document.body.appendChild(wrap);
      wrap.style.cssText += ';position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;';
      [...document.body.children].forEach((el) => { if (el !== wrap && el.tagName !== 'SCRIPT') el.style.visibility = 'hidden'; });
      // 撮影中はアプリの「画面の外に出ないよう戻す」動きを止め、カメラを自由に動かす
      map.transform.setConstrainOverride((c, z) => ({ center: c, zoom: z }));
      map.easeTo = function () { return this; };
      if (map.getLayer('nav-spots')) map.setLayoutProperty('nav-spots', 'visibility', 'none');
      map.resize();
      return true;
    });
    if (!ok) throw new Error('地図を取り出せませんでした');
    // ラベルと駅名は位置だけ使う（見えなくする）。ズームの段階で消えるものも位置は取れるようにする
    await page.addStyleTag({
      content: '*{animation-play-state:paused!important;transition:none!important}'
        + ' .cb3-map .cb3-lbl,.cb3-map .cb3-sta{display:block!important;opacity:0!important}'
        + ' .cb3-zoom,.cb3-attr,.nav-here{display:none!important}',
    });
    if (S.route) {
      // ルートの下に光のにじみを足す（線そのものはアプリと同じ）
      await page.evaluate(() => {
        const map = window.__m;
        if (!map.getLayer('film-route-glow')) {
          map.addLayer({ id: 'film-route-glow', type: 'line', source: 'navRoute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4fb3ff', 'line-width': 46, 'line-blur': 24, 'line-opacity': 0.5 } }, 'nav-route-case');
        }
        map.setPaintProperty('nav-route', 'line-width', 10);
        map.setPaintProperty('nav-route-case', 'line-width', 17);
      });
    }
    const names = [];
    const nameIdx = new Map();
    const frames = [];
    for (let f = S.f0; f <= S.f1; f += step) {
      const cam = camAt(S.keys, f);
      if (S.follow) {
        const p = routeCut(Math.min(1, S.route(f) + S.follow.lead)).pop();
        const w = easeIO((f - S.follow.from) / (S.follow.to - S.follow.from));
        cam.c = [cam.c[0] + (p[0] - cam.c[0]) * w, cam.c[1] + (p[1] - cam.c[1]) * w];
      }
      const r = S.rise ? S.rise(f) : null;
      const line = S.route ? routeCut(S.route(f)) : null;
      const info = await page.evaluate(async ({ cam, r, line, points }) => {
        const map = window.__m;
        map.stop();
        if (r != null) map.setPaintProperty('cb-buildings', 'fill-extrusion-height', ['*', ['get', 'h'], r]);
        if (line) map.getSource('navRoute')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] });
        map.jumpTo({ center: cam.c, zoom: cam.z, pitch: cam.p, bearing: cam.b });
        await new Promise((res) => { map.once('idle', res); map.triggerRepaint(); });
        // ラベルを屋上へ持ち上げる処理（アプリ側）は次の描画で走るので、2回待つ
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const lbl = [];
        document.querySelectorAll('.cb3-map .cb3-lbl, .cb3-map .cb3-sta').forEach((n) => {
          const full = n.querySelector('.cb-f')?.textContent || n.textContent;
          const b = n.getBoundingClientRect();
          if (!b.width) return;
          lbl.push([full.trim(), Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2), n.classList.contains('cb3-sta') ? 1 : 0]);
        });
        const pts = (points || []).map((p) => { const q = map.project([p.lng, p.lat]); return [p.id, Math.round(q.x), Math.round(q.y)]; });
        const head = line ? (() => { const q = map.project(line[line.length - 1]); return [Math.round(q.x), Math.round(q.y)]; })() : null;
        return { lbl, pts, head };
      }, { cam, r, line, points: S.points });
      const fr = { f, l: [] };
      for (const [nm, x, y, sta] of info.lbl) {
        const key = sta ? `駅:${nm}` : nm;
        if (!nameIdx.has(key)) { nameIdx.set(key, names.length); names.push(key); }
        if (x < -200 || x > 2120 || y < -200 || y > 1280) continue;
        fr.l.push([nameIdx.get(key), x, y]);
      }
      if (info.pts.length) fr.p = Object.fromEntries(info.pts.map(([id, x, y]) => [id, [x, y]]));
      if (info.head) fr.h = info.head;
      if (S.route) fr.s = +S.route(f).toFixed(4);
      if (r != null) fr.r = +r.toFixed(4);
      frames.push(fr);
      await page.screenshot({ path: join(PREVIEW ? dir : raw, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: PREVIEW ? 80 : 94 });
      if ((f - S.f0) % (step * 40) === 0) console.log(`  ${name} ${f}/${S.f1}`);
    }
    if (!PREVIEW) {
      writeFileSync(join(META, 'maps', `${name}.json`), JSON.stringify({ f0: S.f0, f1: S.f1, names, frames }));
      // 2倍で撮ったものを 1920x1080 に縮める（建物の輪郭のギザギザが消える）
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      execFileSync(FFMPEG, ['-v', 'error', '-y', '-start_number', String(S.f0), '-i', join(raw, '%04d.jpg'),
        '-vf', 'scale=1920:1080:flags=lanczos', '-q:v', '2', '-start_number', String(S.f0), join(dir, '%04d.jpg')]);
      rmSync(raw, { recursive: true, force: true });
      console.log(`  saved map/${name}/${S.f0}〜${S.f1}.jpg（${readdirSync(dir).length}枚）`);
    } else {
      console.log(`  saved map/${name}_preview（${frames.length}枚）`);
    }
  } finally {
    await context.close();
  }
}

try {
  for (const [name, o] of SHOTS) if (want('screens', name)) await run(name, o);
  for (const th of THEMES) if (want('themes', `th_${th}`)) await run(`th_${th}`, { season: 'plain', hm: '08:40', view: 'home', dsf: 2, storage: { themePref: th } });
  for (const [lg, sp] of LANGS) {
    const n = `lang_${lg}${sp ? '_sp' : ''}`;
    if (want('langs', n)) await run(n, { season: 'plain', hm: '08:40', view: 'home', dsf: 2, storage: { langPref: lg, sitelenPona: sp ? '1' : '0' } });
  }
  for (const v of WALL) if (want('wall', `wall_${v}`)) await run(`wall_${v}`, { season: 'plain', hm: '12:30', view: v, dsf: 2, fix: true, clean: v === 'festival', geo: v === 'navigation' ? HERE : undefined, storage: v === 'navigation' ? NAVI : undefined, wait: v === 'navigation' ? 3000 : 0 });
  for (const [name, o] of DESKS) if (want('desk', name)) await run(name, { ...o, dsf: 2 }, DESK, { width: 1440, height: 900, mobile: false });
  for (const [name, S] of Object.entries(SEQS)) if (want(name)) await captureSeq(name, S);
} finally {
  if (rectsDirty) {
    const now = existsSync(RECTS_FILE) ? JSON.parse(readFileSync(RECTS_FILE, 'utf8')) : {};
    writeFileSync(RECTS_FILE, JSON.stringify({ ...now, ...rects }));
  }
  await browser.close();
}
console.log('[完了]');
