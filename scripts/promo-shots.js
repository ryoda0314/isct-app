// Twitter宣伝用スクショ撮影スクリプト (デモ "ss" ペルソナ = バナー非表示)
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3007";
const OUT = path.join(__dirname, "..", "promo-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 指定テキストを含むクリック可能要素を探してクリック (可視&最短テキスト優先)
async function clickByText(page, text) {
  const ok = await page.evaluate((t) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cands = [...document.querySelectorAll("button, a, [role='button'], div[onclick], div, span")]
      .filter((e) => e.textContent.trim().includes(t) && vis(e));
    if (!cands.length) return false;
    // 完全一致を最優先、次にテキストが短い(=具体的)要素
    cands.sort((a, b) => {
      const ea = a.textContent.trim() === t ? 0 : 1;
      const eb = b.textContent.trim() === t ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return a.textContent.trim().length - b.textContent.trim().length;
    });
    const target = cands[0];
    const btn = target.closest("button") || target;
    btn.click();
    return true;
  }, text);
  return ok;
}

async function enterDemo(page) {
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1500);
  // 「スキップ（デモモードで表示）」
  let clicked = await clickByText(page, "スキップ（デモモードで表示）");
  if (!clicked) clicked = await clickByText(page, "スキップ");
  if (!clicked) throw new Error("スキップボタンが見つからない");
  await sleep(800);
  // ペルソナ: 📱 藤原 陽翔 (ss = スクショモード)
  let p = await clickByText(page, "藤原 陽翔");
  if (!p) throw new Error("ssペルソナが見つからない");
  await sleep(3000); // データロード待ち
}

async function shoot(page, label, navText, wait = 1800) {
  if (navText) {
    const ok = await clickByText(page, navText);
    if (!ok) console.warn(`  [warn] nav "${navText}" not found`);
    await sleep(wait);
  }
  const file = path.join(OUT, label);
  await page.screenshot({ path: file });
  console.log("  saved", label);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=ja-JP"],
  });

  // ── デスクトップ ──
  console.log("=== Desktop ===");
  const dpage = await browser.newPage();
  await dpage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await enterDemo(dpage);
  await shoot(dpage, "desktop-01-home.png", null);
  await shoot(dpage, "desktop-02-timetable.png", "時間割");
  await shoot(dpage, "desktop-03-tasks.png", "課題");
  await shoot(dpage, "desktop-04-textbooks.png", "マイ教科書");
  await shoot(dpage, "desktop-05-grading.png", "成績割合");
  await shoot(dpage, "desktop-06-dm.png", "DM");
  await shoot(dpage, "desktop-07-navigation.png", "キャンパスナビ", 3500);
  await dpage.close();

  // ── モバイル ──
  console.log("=== Mobile ===");
  const mpage = await browser.newPage();
  await mpage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await enterDemo(mpage);
  await shoot(mpage, "mobile-01-home.png", null);
  await shoot(mpage, "mobile-02-timetable.png", "時間割");
  await shoot(mpage, "mobile-03-tasks.png", "課題");
  await shoot(mpage, "mobile-04-map.png", "マップ", 3500);
  await shoot(mpage, "mobile-05-dm.png", "DM");
  await mpage.close();

  await browser.close();
  console.log("DONE ->", OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });
