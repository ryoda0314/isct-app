// アプリのスクショを自動撮影する。
// 内蔵のスクリーンショット用デモ（"ss"ペルソナ＝認証不要・ダミーデータ・バナー無し）に入り、
// localStorage の lastView で各画面に直行して撮影 → promo-video/public/screens/*.png
//
// 前提: 別ターミナルで開発サーバを起動しておく:  npm run dev  （http://localhost:3000）
// 実行:  node promo-video/capture_screens.mjs
//
// puppeteer はリポジトリ直下の node_modules から解決される。

import puppeteer from 'puppeteer';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'public', 'screens');
const BASE = process.env.APP_URL || 'http://localhost:3000';
const VW = 412, VH = 915, DSF = 2;   // スマホ相当 + Retina

// [viewキー, 出力ファイル名]
const TARGETS = [
  ['home', 'home'],
  ['timetable', 'timetable'],
  ['attendance', 'attendance'],
  ['grades', 'grades'],
  ['navigation', 'map'],
];

async function clickByText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('button')];
    // テキストを含む最小の(=最も内側の)ボタンを選ぶ
    const matches = els.filter((e) => e.offsetParent !== null && (e.textContent || '').includes(t));
    matches.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    const el = matches[0];
    if (el) { el.click(); return true; }
    return false;
  }, text);
}

async function capture(browser, view, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DSF, isMobile: true, hasTouch: true });
  // 起動時の画面・言語・クォーターを指定
  await page.evaluateOnNewDocument((v) => {
    try {
      localStorage.setItem('lastView', v);
      localStorage.setItem('langPref', 'ja');
      localStorage.setItem('quarter', '2');
    } catch {}
  }, view);

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90_000 });

  // SetupView の「スキップ（デモモードで表示）」を待ってクリック
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('スキップ')), { timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 400));
  await clickByText(page, 'スキップ');

  // ペルソナ選択モーダルで "藤原 陽翔"（ss=スクショ用）を選ぶ
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('藤原 陽翔')), { timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 300));
  await clickByText(page, '藤原 陽翔');

  // 描画安定待ち（デモデータ反映＋アニメ）
  await new Promise((r) => setTimeout(r, 4500));

  // Next.js の開発インジケータ（「N」バッジ / Issues トースト）を除去
  await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-toast],[data-next-badge-root],[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important;visibility:hidden!important;}' }).catch(() => {});
  await page.evaluate(() => { document.querySelectorAll('nextjs-portal').forEach((e) => e.remove()); }).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));

  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  console.log(`  撮影: ${name}.png  (view=${view})`);
  await page.close();
}

(async () => {
  console.log(`[capture] ${BASE} へ接続して撮影します...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    for (const [view, name] of TARGETS) {
      try { await capture(browser, view, name); }
      catch (e) { console.error(`  [失敗] ${name}: ${e.message}`); }
    }
  } finally {
    await browser.close();
  }
  console.log(`[完了] ${OUT}`);
})();
