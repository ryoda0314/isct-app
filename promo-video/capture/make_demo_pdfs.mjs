// デモモードの授業の教材（講義スライドの PDF）を作る → isct/public/demo/materials/lecture_ja.pdf・lecture_en.pdf
//   node promo-video/capture/make_demo_pdfs.mjs
// アプリのデモの教材（campus-sns/demoData.js の demoCourseContents）が、この 2 つを指す（英語の授業は en）。
// 科目ごとに作ると、日本語のフォントが 1 つずつ埋め込まれて 120 科目で 13MB になるので、科目名を入れない共通の 2 つにしている。
// 16:9 のスライド 3 枚（表紙・本日の内容・図）。英語の授業（LAS.A*）は英語のスライド。
// 影・グラデーション・半透明は PDF の中で画像になって重くなる（1 枚 160KB → 数十KB）ので使わない。
// ページは 480x270px（360x202.5pt）。アプリの PDF ビューアは 75% で開くので、スマホの幅にちょうど収まる大きさ（中身は 1280x720 で組んで縮める）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', '..', 'public', 'demo', 'materials');
mkdirSync(OUT, { recursive: true });
// 共通の 2 つ（code は英語かどうかの判定にだけ使う）
const decks = [
  { file: 'lecture_ja.pdf', c: { code: 'JA', name: '講義スライド', col: '#3a7bd5' } },
  { file: 'lecture_en.pdf', c: { code: 'LAS.A', name: 'Academic English', col: '#3dae72' } },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const slides = (c) => {
  const col = c.col || '#3a7bd5';
  const en = /^LAS\.A/.test(c.code);
  const title = en ? 'Paragraph Structure' : '基本概念';
  const week = en ? 'Week 2' : '第2回';
  const agenda = en
    ? ['What makes a good paragraph?', 'Topic sentence', 'Supporting sentences', 'Concluding sentence', 'Practice: write your own']
    : ['前回の復習', '今回のキーワード', '例題で確かめる', '演習（10分）', '次回の予告'];
  const box = en
    ? [['Topic sentence', 'States the main idea of the paragraph.'], ['Supporting sentences', 'Give reasons, examples, and evidence.'], ['Concluding sentence', 'Wraps up and links to the next idea.']]
    : [['定義', 'ことばの意味をそろえる'], ['性質', '成り立つことを確かめる'], ['応用', '実際の問題に使ってみる']];
  return `
  <section class="slide cover">
    <div class="band" style="background:${col}"></div>
    <div class="code" style="color:${col}">${en ? 'LECTURE SLIDES' : 'LECTURE'}</div>
    <div class="course">${esc(c.name)}</div>
    <div class="title">${week}　${esc(title)}</div>
    <div class="meta">${en ? '2026 · Section S' : '2026年度'}</div>
  </section>
  <section class="slide">
    <div class="h" style="border-color:${col}">${en ? "Today's plan" : '本日の内容'}</div>
    <ol>${agenda.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
    <div class="page">2</div>
  </section>
  <section class="slide">
    <div class="h" style="border-color:${col}">${esc(title)}</div>
    <div class="row">${box.map(([h, b]) => `<div class="card" style="border-top:10px solid ${col}"><div class="ch">${esc(h)}</div><div class="cb">${esc(b)}</div></div>`).join('<div class="arrow">→</div>')}</div>
    <div class="page">3</div>
  </section>`;
};
const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 480px 270px; margin: 0; }
  html { zoom: 0.375; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Yu Gothic UI", "Yu Gothic", "Meiryo", "Segoe UI", sans-serif; color: #1d2733; }
  .slide { width: 1280px; height: 720px; position: relative; overflow: hidden; page-break-after: always; background: #fbfcfe; padding: 80px 96px; }
  .cover { background: #f4f7fb; }
  .band { position: absolute; left: 0; top: 0; bottom: 0; width: 28px; }
  .code { font-size: 34px; font-weight: 700; letter-spacing: 0.08em; margin-top: 120px; }
  .course { font-size: 44px; font-weight: 700; margin-top: 18px; color: #4a5866; }
  .title { font-size: 84px; font-weight: 800; margin-top: 30px; line-height: 1.15; }
  .meta { position: absolute; left: 96px; bottom: 70px; font-size: 26px; color: #7a8796; }
  .h { font-size: 54px; font-weight: 800; padding-left: 26px; border-left: 14px solid; margin-bottom: 50px; }
  ol { font-size: 40px; line-height: 1.9; margin: 0; padding-left: 70px; }
  .row { display: flex; align-items: center; gap: 22px; margin-top: 40px; }
  .card { flex: 1; height: 300px; border-radius: 20px; background: #fff; border: 2px solid #e3e9f0; padding: 34px 30px; }
  .ch { font-size: 36px; font-weight: 800; }
  .cb { font-size: 27px; color: #4a5866; margin-top: 20px; line-height: 1.5; }
  .arrow { font-size: 54px; color: #9aa7b5; }
  .page { position: absolute; right: 60px; bottom: 40px; font-size: 22px; color: #9aa7b5; }
</style></head><body>${slides(c)}</body></html>`;

const browser = await launch();
try {
  const page = await browser.newPage();
  for (const { file, c } of decks) {
    await page.setContent(html(c), { waitUntil: 'load' });
    const pdf = await page.pdf({ width: '480px', height: '270px', printBackground: true });
    writeFileSync(join(OUT, file), pdf);
  }
  console.log(`${decks.length} PDFs → ${OUT}`);
} finally {
  await browser.close();
}
