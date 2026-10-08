// インスタのストーリー用（StoryPromo）に、キャンパスナビの3D表示を撮る。
//
//   1) 別ターミナルで開発サーバを起動:  npx next dev -p 3123
//   2) node promo-video/capture/capture_story.mjs [shots,rise]   （省略で両方）
//
// shots: 3D表示の静止画（public/promo2/screens/navi3d_*.png。390x770 の3倍）
// rise : 建物が地面から立ち上がって地図が傾くところを、1コマずつカメラを動かして撮った連番
//        （public/story/rise/rise_000.jpg …。390x770 の2倍）
// アプリのコードは変えず、撮影するときだけ MapLibre の地図をページの外から取り出して動かす。
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickText, launch, openApp, shot, sleep } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, '..', 'public', 'promo2', 'screens');
const SEQ = resolve(__dirname, '..', 'public', 'story', 'rise');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(SEQ, { recursive: true });

const at = (hm) => `2026-06-17T${hm}:00+09:00`; // 2Q の水曜（ver2 と同じ日）
const HERE = { latitude: 35.60705, longitude: 139.68518 }; // 大岡山駅の改札を出たあたり
const STORAGE = { navBasemap: 'illust', navView3d: '1', quarter: '2' };
export const RISE_FRAMES = 56;

// 読み込み前に仕込む：MapLibre の地図が作られるたびに window.__maps に入れる
// （開発時は React の StrictMode で1回作って捨てるので、使うときは生きている地図を選ぶ）
function hookMap() {
  let ml;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => ml,
    set: (v) => {
      ml = v;
      const on = v.Map.prototype.on;
      v.Map.prototype.on = function (...a) {
        window.__maps = window.__maps || [];
        if (!window.__maps.includes(this)) window.__maps.push(this);
        return on.apply(this, a);
      };
    },
  });
}

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (n) => !only || only.has(n);
const browser = await launch();
try {
  // ── 静止画：3D表示のまま、西9号館を検索 → ここへ案内 → 案内を開始 ──
  if (want('shots')) {
    const { page, context } = await openApp(browser, { view: 'navigation', time: at('08:42'), geo: HERE, storage: STORAGE });
    try {
      await page.waitForSelector('.cb3-map canvas', { timeout: 60000 });
      await sleep(3000);
      await shot(page, join(SHOTS, 'navi3d_map.png'));
      await clickText(page, '建物・教室・スポットを検索'); await sleep(700);
      await page.keyboard.type('西9号館'); await sleep(700);
      await page.keyboard.press('Enter'); await sleep(2600);
      await shot(page, join(SHOTS, 'navi3d_spot.png'));
      await clickText(page, 'ここへ案内'); await sleep(3200);
      await shot(page, join(SHOTS, 'navi3d_route.png'));
      await clickText(page, '案内を開始'); await sleep(3800);
      await shot(page, join(SHOTS, 'navi3d_guide.png'));
    } finally {
      await context.close();
    }
  }

  // ── 連番：建物が立ち上がり、地図が傾きながら少し回る ──
  if (want('rise')) {
    const { page, context } = await openApp(browser, { view: 'navigation', time: at('08:42'), geo: HERE, dsf: 2, storage: STORAGE, init: hookMap });
    try {
      await page.waitForSelector('.cb3-map canvas', { timeout: 60000 });
      await sleep(3500); // アプリ自身の立ち上がりアニメーションが終わるまで
      const found = await page.evaluate(() => {
        window.__map3d = (window.__maps || []).filter((m) => !m._removed && m.style).pop();
        return !!window.__map3d;
      });
      if (!found) throw new Error('地図を取り出せませんでした');
      // コマごとに変わらないよう CSS のアニメーションを止め、建物のラベルは最後に --lo でふわっと出す
      await page.addStyleTag({ content: '*{animation-play-state:paused!important} .cb3-lbl{transition:none!important} .cb3-map .cb3-lbl:not(.cb-off){opacity:var(--lo,1)!important}' });
      for (let i = 0; i < RISE_FRAMES; i++) {
        const t = i / (RISE_FRAMES - 1);
        await page.evaluate(async (t) => {
          const map = window.__map3d;
          const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
          const mix = (a, b, k) => a + (b - a) * k;
          const k = io(t);
          const r = Math.min(1, Math.max(0, (t - 0.04) / 0.66));
          map.stop();
          map.jumpTo({ center: [mix(139.6830, 139.6836, k), mix(35.6043, 35.6051, k)], zoom: mix(15.6, 16.2, k), pitch: mix(0, 56, k), bearing: mix(-30, 6, k) });
          map.setPaintProperty('cb-buildings', 'fill-extrusion-height', ['*', ['get', 'h'], 1 - (1 - r) ** 3]);
          map.getContainer().parentElement.style.setProperty('--lo', String(Math.min(1, Math.max(0, (t - 0.78) / 0.16))));
          await new Promise((res) => { map.once('idle', res); map.triggerRepaint(); });
        }, t);
        await sleep(t > 0.7 ? 280 : 80); // ラベルの重なりの整理（0.16秒ごと）を待つ
        await page.screenshot({ path: join(SEQ, `rise_${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 90 });
      }
      console.log(`  saved rise_000〜${String(RISE_FRAMES - 1).padStart(3, '0')}.jpg`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
