// ver2（AppPromoV2）で使うアプリの実画面を撮る。
//
//   1) 別ターミナルで開発サーバを起動:  npx next dev -p 3123
//   2) node promo-video/capture/capture_v2.mjs [名前,名前,...]   （省略で全部）
//
// デモモード（#demo = スクショ用ペルソナ。認証も通信もしない）で、端末の時刻と現在地を差し替えて撮る。
// 出力: promo-video/public/promo2/screens/*.png（390x770 の3倍。ステータスバーとホームインジケータは動画側で描く）
//
// 撮影時だけ画面上の文字を少し整える（アプリのデータは変えない）:
//   - デモの課題データに配点がなく「undefined点」と出るので消す
//   - 工大祭のデモ出店は【テスト】や TEST の印が付いているので外し、架空の団体名にする（動画では「出店はサンプル」と注記する）
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickText, launch, openApp, scrollMain, shot, sleep } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'promo2', 'screens');
mkdirSync(OUT, { recursive: true });

const DAY = '2026-06-17'; // 2Q の水曜（デモの時間割に水曜の授業がある）
const at = (hm) => `${DAY}T${hm}:00+09:00`;
const FEST = '2026-10-10T12:20:00+09:00';
const HERE = { latitude: 35.60705, longitude: 139.68518 }; // 大岡山駅の改札を出たあたり

async function fixUndefinedPoints(page) {
  await page.evaluate(() => {
    const walk = (n) => {
      if (n.nodeType === 3) {
        if (n.textContent.includes('undefined')) n.textContent = n.textContent.replace(/undefined点\s*・?\s*/g, '').replace(/undefined/g, '');
      } else n.childNodes.forEach(walk);
    };
    walk(document.body);
  });
}

const ORGS = {
  A: '料理サークル', B: 'ロボット研究室', C: 'ティー同好会', D: '軽音部',
  E: '縁日サークル', F: 'イラスト研究会', G: 'スイーツ同好会', H: '学生相談ボランティア',
};
async function cleanFestival(page) {
  await page.evaluate((orgs) => {
    const walk = (n) => {
      if (n.nodeType === 3) {
        let s = n.textContent;
        if (!/テスト|ダミー/.test(s)) return;
        s = s.replace(/【テスト】/g, '')
          .replace(/テスト団体([A-H])（[^）]*）/g, (_, k) => orgs[k])
          .replace(/テスト(?:団体|研究室)([A-H])/g, (_, k) => orgs[k])
          .replace(/※これはテスト用のダミーデータです。実在の出店ではありません。/g, '')
          .replace(/（テスト）/g, '');
        n.textContent = s.trim() ? s : s;
      } else n.childNodes.forEach(walk);
    };
    walk(document.body);
    // 「あなたの申請」欄（出店の申請をした人にだけ出る。デモでは見送りの申請も入っている）は隠す
    for (const el of document.querySelectorAll('div')) {
      const first = el.firstElementChild;
      if (first && first.textContent.trim() === 'あなたの申請' && el.getBoundingClientRect().height < 500) el.style.display = 'none';
    }
    // ポスター画像（SVG）の TEST の帯を外す
    document.querySelectorAll('img').forEach((img) => {
      if (!img.src.startsWith('data:image/svg+xml')) return;
      const i = img.src.indexOf(',');
      let svg = decodeURIComponent(img.src.slice(i + 1));
      svg = svg.replace(/<rect x="490" y="108"[^>]*\/>\s*<text[^>]*>TEST<\/text>/, '');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }, ORGS);
  await sleep(300);
}

// [名前, 撮り方]
const SHOTS = [
  // 朝 8:40 ホーム（通常の高さと、スクロール用の縦長）
  ['home', { view: 'home', time: at('08:40') }],
  ['home_tall', { view: 'home', time: at('08:40'), height: 1540 }],
  // 8:42 キャンパスナビ：西9号館を検索 → ここへ案内 → 案内を開始
  ['navi_map', { view: 'navigation', time: at('08:42'), geo: HERE, storage: { navBasemap: 'illust' }, wait: 2000 }],
  ['navi_route', {
    view: 'navigation', time: at('08:42'), geo: HERE, storage: { navBasemap: 'illust' },
    act: async (page, save) => {
      await sleep(2000);
      await clickText(page, '建物・教室・スポットを検索'); await sleep(700);
      await page.keyboard.type('西9号館'); await sleep(700);
      await save('navi_search');
      await page.keyboard.press('Enter'); await sleep(1800);
      await save('navi_spot');
      await clickText(page, 'ここへ案内'); await sleep(2600);
      await save('navi_route');
      await clickText(page, '案内を開始'); await sleep(3200);
      await save('navi_guide');
    },
  }],
  // 8:50 1限（西9号館の英語第二 S）
  ['timetable', { view: 'timetable', time: at('08:50') }],
  ['attendance', { view: 'attendance', time: at('08:50') }],
  // 12:40 昼休み（2限は 12:25 まで）
  ['freeroom', { view: 'freeroom', time: at('12:40') }],
  ['dm', {
    view: 'dm', time: at('12:40'),
    act: async (page, save) => {
      await save('dm');
      // 一覧の行は div なので、名前と最後のメッセージを含む行の中心をマウスで押す
      const box = await page.evaluate(() => {
        const c = [...document.querySelectorAll('*')].filter((e) => (e.textContent || '').includes('鈴木一郎') && (e.textContent || '').includes('ありがとう'));
        c.sort((a, b) => a.textContent.length - b.textContent.length);
        const r = c[0]?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
      if (box) { await page.mouse.click(box.x, box.y); await sleep(2200); await save('dm_chat'); }
    },
  }],
  // 17:20 放課後の課題（3・4限の実験は 17:05 まで）
  ['tasks', { view: 'tasks', time: at('17:20'), fix: true }],
  ['asgn_detail', {
    view: 'tasks', time: at('17:20'), fix: true,
    act: async (page, save) => {
      await clickText(page, '実験レポート第2回'); await sleep(1500);
      await fixUndefinedPoints(page);
      await save('asgn_detail');
    },
  }],
  // 工大祭（10/10 昼）
  ['festival', {
    view: 'festival', time: FEST, clean: true,
    act: async (page, save) => {
      await save('festival');
      const r = await scrollMain(page, 9999);
      // 出店の一覧（検索欄とカテゴリ）が上に来るあたり
      await scrollMain(page, Math.min(r?.max ?? 0, 600)); await sleep(500);
      await cleanFestival(page);
      await save('festival_grid');
    },
  }],
  ['festival_tall', { view: 'festival', time: FEST, clean: true, height: 2600 }],
  ['booth', {
    view: 'festival', time: FEST, clean: true,
    act: async (page, save) => {
      await clickText(page, 'タピオカミルクティー'); await sleep(1600);
      await cleanFestival(page);
      await save('booth');
      await scrollMain(page, 260); await sleep(500);
      await cleanFestival(page);
      await save('booth_coupon');
    },
  }],
];

// 機能の壁に並べる画面（2倍で十分）
const WALL = ['grades', 'calendar', 'events', 'gym', 'exams', 'acadCal', 'reviews', 'circles', 'languages', 'freshman', 'notes', 'pdftools', 'pomo', 'music', 'pocket', 'notif', 'moreMenu', 'friends', 'qr', 'lecrec'];
// テーマ違いのホーム
const THEMES = ['dark', 'light', 'sakura', 'koyo', 'yuki', 'titech', 'scitokyo', 'lavender', 'shinryoku', 'mizukumori', 'peach', 'sky'];

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (name) => !only || only.has(name);

const browser = await launch();
const run = async (name, o) => {
  const { page, context } = await openApp(browser, {
    view: o.view, time: o.time, geo: o.geo, height: o.height, dsf: o.dsf ?? 3,
    storage: { quarter: '2', ...(o.storage || {}) },
  });
  try {
    if (o.wait) await sleep(o.wait);
    const save = async (n) => {
      if (o.fix) await fixUndefinedPoints(page);
      if (o.clean) await cleanFestival(page);
      await shot(page, join(OUT, `${n}.png`));
    };
    if (o.act) await o.act(page, save);
    else await save(name);
  } catch (e) {
    console.error(`  [失敗] ${name}: ${e.message}`);
  } finally {
    await context.close();
  }
};

try {
  for (const [name, o] of SHOTS) if (want(name)) await run(name, o);
  for (const v of WALL) if (want(`wall_${v}`) || want('wall')) await run(`wall_${v}`, { view: v, time: at('12:30'), dsf: 2, fix: true });
  for (const th of THEMES) if (want(`theme_${th}`) || want('theme')) await run(`theme_${th}`, { view: 'home', time: at('08:40'), dsf: 2, storage: { themePref: th } });
} finally {
  await browser.close();
}
console.log(`[完了] ${OUT}`);
