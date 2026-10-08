// 最高傑作版で使う、アプリを実際に操作している動画（連番）を撮る。
//
//   1) 別ターミナルで開発サーバを起動:  npx next dev -p 3123
//      （isct で別の next dev がもう動いているなら起動しない。.next を取り合って壊れるので、APP_URL=http://localhost:3000 などでそれを使う）
//   2) node promo-video/capture/record_film.mjs [名前,...]   （省略で全部）
//   3) python promo-video/capture/measure_recs.py と make_rec_thumbs.py（npm run film:record で 2〜3 をまとめて）
//
// 出力: public/film/rec/<名前>/NNNN.jpg（390x770 の2倍・30fps。PC は 1440x900 の1倍）と
//       log.json（タップした位置とフレーム、分解図に使うカードの位置）
// 時間は timeweb で仮想にしてあるので、1コマずつ「操作 → 1/30 秒進める → 撮る」を繰り返す（capture/record_lib.mjs）。
// 操作のフレーム番号は、動画の側（src/film/scenes）で拍に合わせて使う位置から逆算してある。
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanFestival, fixUndefinedPoints, hookMap, launch, sleep } from './lib.mjs';
import { centerOf, easeScroll, logCards, merge, openRecorder, record, setAppState, tap } from './record_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'film', 'rec');
mkdirSync(OUT, { recursive: true });

const HERE = { latitude: 35.60705, longitude: 139.68518 }; // 大岡山駅の改札を出たあたり
const DAY = { spring: '2026-04-08', summer: '2026-06-17', autumn: '2026-10-10', winter: '2027-01-27' };
const at = (d, hm) => `${d}T${hm}:00+09:00`;
const Q = { spring: '1', summer: '2', autumn: '3', winter: '4' };
const st = (theme, season, extra = {}) => ({ themePref: theme, quarter: Q[season], ...extra });

// キー入力を1文字ずつ、決めたフレームに割り付ける
const typeAt = (from, text, every = 3) => {
  const out = {};
  [...text].forEach((ch, i) => { out[from + i * every] = async (p) => { await p.keyboard.type(ch); return null; }; });
  return out;
};
const fn = (f) => async (p) => { await f(p); return null; };

// 季節の扉：その季節の日付のホームを前の季節のテーマで見せ、48 フレーム目（扉の2小節目の頭）でテーマだけを切り替える。
// 設定の画面は出さない（映像の側で、切り替わる前のコマから後のコマへ斜めに塗り替える）。時刻はその季節の次の動画と同じにして、つなぎ目をそろえる
const homeGate = (from, to, season, hm, extra = {}) => ({
  open: { view: 'home', time: at(DAY[season], hm), storage: st(from, season) },
  frames: 130,
  actions: () => ({ 48: setAppState('themePref', to) }),
  ...extra,
});
// 17のテーマを切り替える順（映像の src/film/scenes/You.jsx の THEMES と同じ順）
const THEME_ORDER = ['dark', 'titech', 'tmdu', 'scitokyo', 'sakura', 'lavender', 'mint', 'sky', 'peach', 'lemon', 'coral', 'shinryoku', 'koyo', 'yuki', 'light', 'tsubame'];

// 空き教室：画面の中ほどに見えている教室の行を1つ押す
const tapVisibleRoom = async (page) => {
  const p = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.fr-row')].map((e) => e.getBoundingClientRect()).filter((r) => r.top > 260 && r.bottom < 640);
    const r = rows[0];
    return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  });
  if (!p) throw new Error('押せる教室の行が見えていません');
  await page.mouse.click(p.x, p.y);
  return { tap: [p.x, p.y] };
};

// DM：デモには送信を受けるサーバがないので、撮影では POST /api/dm に送った内容をそのまま返す（アプリの送信と表示の流れはそのまま動く）
const stubDMSend = () => {
  const realFetch = window.fetch.bind(window);
  let n = 0;
  window.fetch = (url, opts = {}) => {
    if (String(url).endsWith('/api/dm') && opts.method === 'POST') {
      const b = JSON.parse(opts.body || '{}');
      const body = { id: `rec-${++n}`, text: b.text || '', stamp_id: b.stamp_id || null, created_at: new Date().toISOString() };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(url, opts);
  };
};
// DM の入力欄（input）・スタンプのボタン（stamps）・スタンプ（その id）を押す
const tapDM = (what) => async (page) => {
  const r = await page.evaluate((what) => {
    const input = document.querySelector('input[placeholder]');
    const el = what === 'input' ? input
      : what === 'stamps' ? input?.parentElement?.querySelector('button')
      : document.querySelector(`button img[src*="/${what}.webp"]`)?.closest('button');
    const b = el?.getBoundingClientRect();
    return b ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } : null;
  }, what);
  if (!r) throw new Error(`DM の ${what} が見つかりません`);
  await page.mouse.click(r.x, r.y);
  return { tap: [r.x, r.y] };
};

// X（Twitter）用：ホームの上の工大祭のお知らせを撮影のときだけ隠す（X 用の動画では工大祭に触れない）
const hideFestBanner = (page) => page.evaluate(() => {
  for (const e of document.querySelectorAll('div,button,a')) {
    const h = e.offsetHeight;
    if (h > 40 && h < 90 && (e.textContent || '').includes('工大祭')) e.style.display = 'none';
  }
});

// 課題をアプリで提出：「ファイルを選択」を押して撮影用の PDF を渡す（OS のファイル選択の画面は出さない）
const SUBMIT_PDF = join(__dirname, 'assets', 'fibonacci_report.pdf');
const pickFile = (label) => async (page) => {
  const p = await centerOf(page, label, { exact: true });
  if (!p) throw new Error(`見つかりません: ${label}`);
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 15000 }), page.mouse.click(p.x, p.y)]);
  await chooser.accept([SUBMIT_PDF]);
  return { tap: [p.x, p.y] };
};
const okConfirm = () => { window.confirm = () => true; }; // 提出の確認ダイアログは OK

const RECS = {
  // ホーム（スクロールして戻る → 分解図に使う瞬間のカードの位置を記録）。映像は「4月。」から始まるので春の日付。春の扉の動画と同じ画面
  rec_home: {
    open: { view: 'home', time: at(DAY.spring, '08:40'), storage: st('tsubame', 'spring') },
    frames: 130,
    actions: () => merge(easeScroll(40, 75, 0, 380), easeScroll(80, 105, 380, 0), { 112: logCards }),
  },
  rec_gate_spring: homeGate('tsubame', 'sakura', 'spring', '08:40'), // → 時間割（rec_tt）と同じ 08:40
  rec_gate_summer: homeGate('sakura', 'shinryoku', 'summer', '17:20', { each: (p) => fixUndefinedPoints(p) }), // → 課題（rec_asgn）
  rec_gate_autumn: homeGate('shinryoku', 'koyo', 'autumn', '17:40'), // → 工大祭（rec_fest）
  rec_gate_winter: homeGate('koyo', 'yuki', 'winter', '10:00'), // → 成績（rec_grades）
  // 時間割 → 授業を開く → 授業のチャット → アンケートに投票
  rec_tt: {
    open: { view: 'home', time: at(DAY.spring, '08:40'), storage: st('sakura', 'spring') },
    frames: 196,
    actions: () => merge(
      { 6: (p) => tap(p, '時間割', { exact: true }) },
      easeScroll(40, 70, 0, 420), easeScroll(76, 96, 420, 0),
      { 104: (p) => tap(p, '英語第二') },
      // デモでは教材が読めず「教材の取得に失敗しました」が出るので、出る前にチャットへ移る
      { 112: (p) => tap(p, 'チャット', { exact: true }) },
      { 150: (p) => tap(p, 'Grammarly', { exact: true }) }, // アンケートに投票（棒グラフが動く）
    ),
  },
  // 大学の行事：参加を押す
  rec_events: {
    open: { view: 'events', time: at(DAY.spring, '08:40'), storage: st('sakura', 'spring') },
    frames: 100,
    actions: () => merge({ 12: (p) => tap(p, '参加', { exact: true }) }, { 36: (p) => tap(p, '参加', { exact: true }) }, easeScroll(54, 92, 0, 330)),
  },
  // キャンパスナビ（3D）：教室を検索 → 建物へカメラが飛ぶ → ここへ案内 → 案内を開始
  rec_navi: {
    open: { view: 'navigation', time: at(DAY.spring, '08:42'), geo: HERE, storage: st('sakura', 'spring', { navBasemap: 'illust', navView3d: '1' }), boot: 9000 },
    init: hookMap,
    frames: 260,
    actions: () => merge(
      { 10: (p) => tap(p, '建物・教室・スポットを検索') },
      typeAt(22, '西9号館', 4),
      { 46: fn((p) => p.keyboard.press('Enter')) },
      { 120: (p) => tap(p, 'ここへ案内') },
      { 188: (p) => tap(p, '案内を開始') },
    ),
  },
  // 課題：一覧 → 課題を開く → やることにチェック → アプリで提出
  rec_asgn: {
    open: { view: 'home', time: at(DAY.summer, '17:20'), storage: st('shinryoku', 'summer') },
    init: okConfirm,
    frames: 288,
    each: (p) => fixUndefinedPoints(p),
    actions: () => merge(
      { 32: (p) => tap(p, '課題', { exact: true }) },
      easeScroll(52, 80, 0, 160), easeScroll(84, 98, 160, 0),
      { 106: (p) => tap(p, '実験レポート第2回') },
      { 140: (p) => tap(p, '考察', { exact: true }) },
      // アプリで提出 → PDF を選ぶ → 提出する（確認は OK）→「提出しました」（デモでは送らずに同じ段階を進む）
      { 164: (p) => tap(p, 'アプリで提出', { exact: true }) },
      { 188: pickFile('ファイルを選択') },
      { 216: (p) => tap(p, '提出する', { exact: true }) },
    ),
  },
  // 空き教室：時限を切り替える → 使用中も表示 → スクロール → 教室の週間の空き
  rec_free: {
    open: { view: 'freeroom', time: at(DAY.summer, '12:40'), storage: st('shinryoku', 'summer') },
    frames: 196,
    actions: () => merge(
      { 16: (p) => tap(p, '7-8限') },
      { 42: (p) => tap(p, '5-6限') },
      { 68: (p) => tap(p, '使用中も表示', { exact: true }) },
      easeScroll(94, 130, 0, 380),
      { 152: tapVisibleRoom },
    ),
  },
  // DM：メッセージを打って送る → スタンプ
  rec_dm: {
    open: { view: 'dm', time: at(DAY.summer, '12:40'), storage: st('shinryoku', 'summer'), boot: 9000 },
    prepare: async (page) => {
      const box = await page.evaluate(() => {
        const c = [...document.querySelectorAll('*')].filter((e) => (e.textContent || '').includes('鈴木一郎') && (e.textContent || '').includes('ありがとう'));
        c.sort((a, b) => a.textContent.length - b.textContent.length);
        const r = c[0]?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
      if (!box) throw new Error('DM の相手が見つかりません');
      await page.mouse.click(box.x, box.y);
      await sleep(2000);
    },
    init: stubDMSend,
    frames: 196,
    actions: () => merge(
      { 16: tapDM('input') },
      typeAt(26, '了解！あとで送るね', 3),
      { 60: fn((p) => p.keyboard.press('Enter')) },
      { 92: tapDM('stamps') },
      { 112: tapDM('matane') }, // 「またね！」（スタンプの一覧の最初に見えている段）
    ),
  },
  // 友達 → DM の一覧 → DM（DM の横の端末）
  rec_friends: {
    open: { view: 'friends', time: at(DAY.summer, '12:30'), storage: st('shinryoku', 'summer') },
    frames: 196,
    actions: () => merge({ 40: (p) => tap(p, 'CSC 勉強会') }, { 76: (p) => tap(p, '山田花子') }), // 友達 → DM の一覧 → 山田花子とのDM（デモではグループのチャットとプロフィールは中身が出ない）
  },
  // 工大祭：出店一覧をスクロール → 出店を開く → クーポンを使う（確認のダイアログは「OK」）→ 使用済みの画面
  // （confirm() のダイアログが開くとページが止まって撮れないので、撮影では押したら OK を返すだけにする）
  rec_fest: {
    open: { view: 'festival', time: at(DAY.autumn, '17:40'), storage: st('koyo', 'autumn') },
    init: () => { window.confirm = () => true; },
    frames: 220,
    each: (p) => cleanFestival(p, { wait: 0 }),
    actions: () => merge(
      easeScroll(8, 58, 0, 600),
      { 78: (p) => tap(p, 'タピオカミルクティー') },
      easeScroll(108, 134, 0, 260),
      { 150: (p) => tap(p, '店員さんの前で使う') },
    ),
  },
  // 成績 → GPA
  rec_grades: {
    open: { view: 'grades', time: at(DAY.winter, '10:00'), storage: st('yuki', 'winter') },
    frames: 176,
    actions: () => merge(easeScroll(16, 44, 0, 220), easeScroll(50, 66, 220, 0), { 80: (p) => tap(p, 'GPA', { exact: true }) }, easeScroll(108, 160, 0, 300)),
  },
  // 学年暦（月の行事をたどる）
  rec_acad: {
    open: { view: 'acadCal', time: at(DAY.winter, '10:00'), storage: st('yuki', 'winter') },
    frames: 120,
    actions: () => easeScroll(8, 110, 0, 720),
  },
  // 17のテーマ：ホームをゆっくりスクロールしながら、12 フレーム目から1拍ごとにテーマを切り替える（設定の画面は出さない）。
  // 最後はツバメに戻り、スクロールも頭に戻る（次の言語の動画の始まりと同じ画面）
  rec_themes: {
    open: { view: 'home', time: at(DAY.summer, '08:40'), storage: st('tsubame', 'summer') },
    frames: 210,
    actions: () => merge(
      easeScroll(6, 124, 0, 520, 'inout'), easeScroll(132, 196, 520, 0, 'inout'),
      ...THEME_ORDER.map((id, i) => ({ [12 * (i + 1)]: setAppState('themePref', id) })),
    ),
  },
  // 5つの言語：ホームを少しずつスクロールしながら、12 フレーム目から1拍ごとに言語を切り替える（toki pona は2拍）。
  // （sitelen pona は、アプリの外枠の font-family が先に効いてボタンにしか出ないので、いまは入れない）
  // そのまま「スマホでも、PCでも」の端末の画面にも使うので、スクロールは 196 コマ目まで続けて頭に戻る
  rec_langs: {
    open: { view: 'home', time: at(DAY.summer, '08:40'), storage: st('tsubame', 'summer') },
    frames: 196,
    actions: () => merge(
      easeScroll(4, 122, 0, 420, 'inout'), easeScroll(128, 190, 420, 0, 'inout'),
      { 12: setAppState('langPref', 'en') }, { 24: setAppState('langPref', 'zh') }, { 36: setAppState('langPref', 'ko') }, { 48: setAppState('langPref', 'tp') },
      { 72: setAppState('langPref', 'ja') },
    ),
  },
  // ── X（Twitter）用の短い動画（src/x）。どれも 12 フレーム＝1拍ごとの位置で操作する ──
  // ホーム：1拍ごとにテーマが替わる（冒頭のつかみ）
  rec_x_home: {
    open: { view: 'home', time: at(DAY.summer, '08:40'), storage: st('tsubame', 'summer') },
    frames: 110,
    each: hideFestBanner,
    actions: () => merge(...['dark', 'titech', 'sakura', 'mint', 'lavender', 'koyo', 'tsubame'].map((id, i) => ({ [12 * (i + 1)]: setAppState('themePref', id) }))),
  },
  // 時間割：スクロール → 授業 → チャット → 投票
  rec_x_tt: {
    open: { view: 'timetable', time: at(DAY.spring, '08:40'), storage: st('tsubame', 'spring') },
    frames: 100,
    actions: () => merge(
      easeScroll(6, 30, 0, 380, 'inout'), easeScroll(34, 52, 380, 0, 'inout'),
      { 60: (p) => tap(p, '英語第二') },
      { 68: (p) => tap(p, 'チャット', { exact: true }) },
      { 84: (p) => tap(p, 'Grammarly', { exact: true }) },
    ),
  },
  // ナビ：検索 → ここへ案内 → 案内を開始（3小節）
  rec_x_navi: {
    open: { view: 'navigation', time: at(DAY.spring, '08:42'), geo: HERE, storage: st('tsubame', 'spring', { navBasemap: 'illust', navView3d: '1' }), boot: 9000 },
    init: hookMap,
    frames: 150,
    actions: () => merge(
      { 4: (p) => tap(p, '建物・教室・スポットを検索') },
      typeAt(10, '西9号館', 4),
      { 32: fn((p) => p.keyboard.press('Enter')) },
      { 84: (p) => tap(p, 'ここへ案内') },
      { 132: (p) => tap(p, '案内を開始') },
    ),
  },
  // 課題：開く → アプリで提出 → PDF を選ぶ → 提出する →「提出しました」
  rec_x_asgn: {
    open: { view: 'tasks', time: at(DAY.summer, '17:20'), storage: st('tsubame', 'summer') },
    init: okConfirm,
    frames: 100,
    each: (p) => fixUndefinedPoints(p),
    actions: () => merge(
      { 6: (p) => tap(p, '実験レポート第2回') },
      { 24: (p) => tap(p, 'アプリで提出', { exact: true }) },
      { 36: pickFile('ファイルを選択') },
      { 48: (p) => tap(p, '提出する', { exact: true }) },
    ),
  },
  // 空き教室：時限を切り替え → 使用中も表示 → スクロール → 教室の週の空き
  rec_x_free: {
    open: { view: 'freeroom', time: at(DAY.summer, '12:40'), storage: st('tsubame', 'summer') },
    frames: 100,
    actions: () => merge(
      { 12: (p) => tap(p, '7-8限') },
      { 24: (p) => tap(p, '5-6限') },
      { 36: (p) => tap(p, '使用中も表示', { exact: true }) },
      easeScroll(42, 64, 0, 380),
      { 72: tapVisibleRoom },
    ),
  },
  // DM：打って送る → スタンプ
  rec_x_dm: {
    open: { view: 'dm', time: at(DAY.summer, '12:40'), storage: st('tsubame', 'summer'), boot: 9000 },
    prepare: async (page) => {
      const box = await page.evaluate(() => {
        const c = [...document.querySelectorAll('*')].filter((e) => (e.textContent || '').includes('鈴木一郎') && (e.textContent || '').includes('ありがとう'));
        c.sort((a, b) => a.textContent.length - b.textContent.length);
        const r = c[0]?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
      if (!box) throw new Error('DM の相手が見つかりません');
      await page.mouse.click(box.x, box.y);
      await sleep(2000);
    },
    init: stubDMSend,
    frames: 100,
    actions: () => merge(
      { 4: tapDM('input') },
      typeAt(8, '了解！あとで送るね', 3),
      { 36: fn((p) => p.keyboard.press('Enter')) },
      { 60: tapDM('stamps') },
      { 72: tapDM('matane') },
    ),
  },
  // PC：横のメニューで画面を移る
  rec_desk: {
    open: { view: 'home', time: at(DAY.summer, '08:50'), storage: st('tsubame', 'summer', { navBasemap: 'illust', navView3d: '1' }), width: 1440, height: 900, dsf: 1, mobile: false, geo: HERE },
    init: hookMap,
    frames: 100,
    actions: () => merge({ 12: (p) => tap(p, '時間割', { exact: true }) }, { 36: (p) => tap(p, '課題', { exact: true }) }, { 60: (p) => tap(p, 'キャンパスナビ', { exact: true }) }), // 2拍ごと
  },
};

const only = process.argv.slice(2).flatMap((a) => a.split(','));
const browser = await launch();
try {
  for (const [name, R] of Object.entries(RECS)) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const { page, context } = await openRecorder(browser, { ...R.open, init: R.init });
    try {
      if (R.prepare) await R.prepare(page);
      const log = await record(page, join(OUT, name), { frames: R.frames, actions: R.actions(), each: R.each, meta: { name, width: R.open.width || 390, height: R.open.height || 770 } });
      console.log(`  ${name}: ${R.frames}コマ ${((Date.now() - t0) / 1000).toFixed(0)}秒 タップ ${log.filter((l) => l.tap).length}回`);
    } catch (e) {
      console.error(`  [失敗] ${name}: ${e.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
