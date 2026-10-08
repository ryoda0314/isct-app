// 工大祭の出店団体むけ縦動画（FestPromo）で使う、アプリの実画面を撮る。
//
//   1) 別ターミナルで開発サーバを起動:  npx next dev -p 3123
//   2) node promo-video/capture/capture_fest.mjs [名前,名前,...]   （省略で全部）
//
// デモモード（#demo）では工大祭の出店・申請がその端末の中だけで動く（申請・下書き・メンバー用QR・読み取り・クーポン）。
// 撮影時だけ画面上の文字を整える（アプリのデータは変えない）:
//   - デモの出店には【テスト】や「テスト団体A」などの印があるので外し、架空の団体名にする（動画では「出店はサンプル」と注記する）
//   - デモでメンバーを読み取ると「テスト メンバーNNN」が加わるので、架空の名前に置き換える
// 出力: promo-video/public/promo2/screens/fx_*.png（390 幅の3倍。縦長のものは動画側でスクロールさせる）
//       撮ったあと python promo-video/capture/measure_screens.py で色と高さを測る
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickText, launch, openApp, scrollMain, shot, sleep } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'promo2', 'screens'); // ver2 の画面と同じ場所（名前は fx_ で始める）
const ASSETS = resolve(__dirname, 'assets');
mkdirSync(OUT, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

const NOW = '2026-10-08T12:20:00+09:00'; // 工大祭（10/10・11）の前に申請する想定
const STORAGE = { quarter: '2', navBasemap: 'illust', navView3d: '1' };
const ORGS = {
  A: '料理サークル', B: 'ロボット研究室', C: 'ティー同好会', D: '軽音部',
  E: '縁日サークル', F: 'イラスト研究会', G: 'スイーツ同好会', H: '学生相談ボランティア',
};
const MEMBERS = ['佐藤 健太', '山田 花子'];

// メンバー用QR（デモでは中身が ISCTFEST1: で始まっていれば読み取れる）
const QR = [1, 2].map((i) => join(ASSETS, `member_qr_${i}.png`));
execFileSync('python', ['-c', `import qrcode\nfor i,p in enumerate(${JSON.stringify(QR)}):\n    qrcode.make(f"ISCTFEST1:demo.member{i+1}").save(p)`]);

async function cleanFestival(page, { hideRejected = true, hideMyApps = false } = {}) {
  await page.evaluate((orgs, members, hideRejected, hideMyApps) => {
    let mi = 0;
    const named = new Map();
    const walk = (n) => {
      if (n.nodeType === 3) {
        let s = n.textContent;
        if (!/テスト|ダミー/.test(s)) return;
        s = s.replace(/【テスト】/g, '')
          .replace(/テスト団体([A-H])（[^）]*）/g, (_, k) => orgs[k])
          .replace(/テスト(?:団体|研究室)([A-H])/g, (_, k) => orgs[k])
          .replace(/※これはテスト用のダミーデータです。実在の出店ではありません。/g, '')
          .replace(/（テスト）/g, '')
          .replace(/テスト メンバー\d+/g, (m) => {
            if (!named.has(m)) named.set(m, members[mi++ % members.length]);
            return named.get(m);
          });
        n.textContent = s;
      } else n.childNodes.forEach(walk);
    };
    walk(document.body);
    // 入力欄に入っている文字も同じように
    document.querySelectorAll('input, textarea').forEach((el) => {
      if (/テスト|ダミー/.test(el.value)) el.value = el.value.replace(/【テスト】/g, '').replace(/※これはテスト用のダミーデータです。実在の出店ではありません。/g, '').trim();
    });
    // 「あなたの申請」：見送りの行は隠す（hideMyApps なら欄ごと）
    for (const el of document.querySelectorAll('div')) {
      const first = el.firstElementChild;
      if (!first || first.textContent.trim() !== 'あなたの申請' || el.getBoundingClientRect().height > 600) continue;
      if (hideMyApps) { el.style.display = 'none'; continue; }
      if (hideRejected) [...el.children].forEach((row) => { if (/見送り/.test(row.textContent) && row !== first) row.style.display = 'none'; });
    }
    // ポスター画像（SVG）の TEST の帯を外す
    document.querySelectorAll('img').forEach((img) => {
      if (!img.src.startsWith('data:image/svg+xml')) return;
      const i = img.src.indexOf(',');
      let svg = decodeURIComponent(img.src.slice(i + 1));
      svg = svg.replace(/<rect x="490" y="108"[^>]*\/>\s*<text[^>]*>TEST<\/text>/, '');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }, ORGS, MEMBERS, hideRejected, hideMyApps);
  await sleep(300);
}

// 文字がちょうど一致する、いちばん内側の要素を押す（同じ文字を持つ外側の枠を押しても反応しないので）
const clickLeaf = (page, text) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('div,span,button')].filter((e) => e.textContent.trim() === t && ![...e.children].some((c) => c.textContent.trim() === t));
  els[0]?.click();
  return els.length;
}, text);

// 申請フォーム：焼きそば屋の内容を入れる（掲載後の出店ページと同じ中身）
async function fillForm(page) {
  const type = async (sel, text, n = 0) => {
    const els = await page.$$(sel);
    if (!els[n]) throw new Error(`入力欄が見つかりません: ${sel} [${n}]（${els.length}個）`);
    await els[n].click({ clickCount: 3 });
    await els[n].type(text, { delay: 5 });
  };
  await type('input[placeholder="例: 焼きそば屋さん"]', 'ソース焼きそば屋');
  await type('input[placeholder="例: ○○サークル / ○○研究室"]', '料理サークル');
  await clickLeaf(page, 'フード'); await sleep(200);
  await type('textarea', '鉄板で焼く特製ソースの焼きそばです。数量限定のトッピングもあります！');
  for (let i = 0; i < 3; i++) { await clickLeaf(page, '＋ メニューを追加'); await sleep(150); }
  const menu = [['ソース焼きそば', '400', '定番。キャベツ多め'], ['目玉焼きのせ焼きそば', '500', '半熟の目玉焼きをのせます'], ['お茶', '100', '']];
  for (let i = 0; i < menu.length; i++) {
    await type('input[placeholder="メニュー名"]', menu[i][0], i);
    await type('input[placeholder="価格"]', menu[i][1], i);
    if (menu[i][2]) await type('input[placeholder="説明（任意）"]', menu[i][2], i);
  }
  await page.evaluate(() => {
    const sel = document.querySelector('select');
    const opt = [...sel.options].find((o) => o.textContent.trim() === '本館');
    if (opt) {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await type('input[placeholder="例: 本館前 3番テント / W531教室"]', '本館 正面玄関前 3番テント');
  await type('input[placeholder="例: 両日 10:00–16:00（売り切れ次第終了）"]', '両日 10:00–16:00（売り切れ次第終了）');
  await page.click('[role="switch"]'); await sleep(300);
  await type('input[placeholder="例: 50円引き / トッピング1つ無料"]', '50円引き');
  await type('input[placeholder="例: 1皿につき1回。他の割引との併用不可。"]', '1皿につき1回');
  await type('input[placeholder="例: 100"]', '100');
}

// メンバーのQRを、スクリーンショットから読み取る（撮影ではカメラが使えないので）
async function scanMembers(page) {
  for (const file of QR) {
    await clickText(page, 'メンバーのQRを読み取る'); await sleep(600);
    const [input] = await page.$$('input[type=file]'); // 読み取り画面の入力欄が、写真の入力欄より先にある
    await input.uploadFile(file);
    await sleep(1500);
  }
}

// 撮った画面の中の、動画で指し示す要素の位置（CSS px。画面の左上から）を fx_rects.json に残す
const RECTS = {};
const measure = async (page, name, pairs) => {
  RECTS[name] = await page.evaluate((pairs) => {
    const out = {};
    for (const [key, text, mode] of pairs) {
      const els = [...document.querySelectorAll('div,span,button,a')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && e.offsetParent !== null && (mode === 'exact' ? e.textContent.trim() === text : e.textContent.trim().includes(text));
      });
      els.sort((a, b) => a.textContent.length - b.textContent.length);
      let el = els[0];
      if (mode === 'box') while (el && el.parentElement && el.getBoundingClientRect().height < 60) el = el.parentElement;
      if (el) { const r = el.getBoundingClientRect(); out[key] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }
    }
    return out;
  }, pairs);
};

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (n) => !only || only.has(n);
const browser = await launch();
const run = async (name, o, act) => {
  if (!want(name)) return;
  const { page, context } = await openApp(browser, { view: 'festival', time: NOW, height: o.height, dsf: o.dsf ?? 3, storage: STORAGE, geo: o.geo });
  page.on('dialog', (d) => d.accept());
  try {
    await act(page, (n) => shot(page, join(OUT, `${n}.png`)));
  } catch (e) {
    console.error(`  [失敗] ${name}: ${e.message}`);
  } finally {
    await context.close();
  }
};

try {
  // 工大祭ページの上から（「出店を宣伝しませんか？」と出店の一覧）。縦長で撮って動画でスクロールする
  await run('fx_top', { height: 2400 }, async (page, save) => {
    await sleep(1200); await cleanFestival(page, { hideMyApps: true });
    await measure(page, 'fx_top', [['promo', '出店を宣伝しませんか？', 'box'], ['apply', '掲載を申請する', 'exact'], ['showqr', 'メンバー用QRを表示', 'exact']]);
    await save('fx_top');
  });
  // 一覧のポスター（デモのサンプル画像）を1枚ずつ。動画の冒頭で背景に漂わせる
  await run('fx_posters', { height: 1900 }, async (page) => {
    await sleep(1200); await cleanFestival(page, { hideMyApps: true }); await sleep(400);
    const dir = resolve(__dirname, '..', 'public', 'fest', 'posters');
    mkdirSync(dir, { recursive: true });
    const imgs = await page.$$('img[src^="data:image/svg+xml"]');
    let n = 0;
    for (const img of imgs) {
      await img.screenshot({ path: join(dir, `poster_${n}.png`) });
      n++;
    }
    console.log(`  saved ${n} posters`);
  });
  // 自分の出店ページ（クーポンの利用数・メニュー・マップで見る）
  await run('fx_mine', { height: 1900 }, async (page, save) => {
    await sleep(1200); await cleanFestival(page);
    await clickText(page, 'ソース焼きそば屋'); await sleep(1500);
    await cleanFestival(page);
    await measure(page, 'fx_mine', [['coupon', '学生限定クーポン', 'box'], ['used', '利用数', ''], ['map', 'マップで見る', 'exact'], ['menu', 'メニュー', 'exact'], ['change', '内容の変更を申請', 'exact']]);
    await save('fx_mine');
  });
  // 「マップで見る」→ キャンパスナビ（3D）で本館へ
  await run('fx_map', { geo: { latitude: 35.60705, longitude: 139.68518 } }, async (page, save) => {
    await sleep(1200); await cleanFestival(page);
    await clickText(page, 'ソース焼きそば屋'); await sleep(1500);
    await clickText(page, 'マップで見る'); await sleep(4500);
    await save('fx_map');
  });
  // メンバー用QR（メンバーが代表者に見せる画面）
  await run('fx_qr', {}, async (page, save) => {
    await sleep(1200); await cleanFestival(page, { hideMyApps: true });
    await clickText(page, 'メンバー用QRを表示'); await sleep(2500);
    await save('fx_qr');
  });
  // 申請フォーム（メンバー2人を読み取り、焼きそば屋の内容を入れて自動保存されたところ）→ 申請する
  await run('fx_form', { height: 2400 }, async (page, save) => {
    await sleep(1200);
    // 写真：一覧にある焼きそば屋のポスター（デモの SVG）を、TEST の帯を外して使う
    const posterPath = join(ASSETS, 'poster_yakisoba.svg');
    const data = await page.evaluate(() => {
      const img = [...document.querySelectorAll('img')].find((i) => i.src.startsWith('data:image/svg+xml') && decodeURIComponent(i.src).includes('ソース焼きそば'));
      return img ? img.src : null;
    });
    if (data) {
      const svg = decodeURIComponent(data.slice(data.indexOf(',') + 1)).replace(/<rect x="490" y="108"[^>]*\/>\s*<text[^>]*>TEST<\/text>/, '');
      writeFileSync(posterPath, svg);
    }
    await clickText(page, '掲載を申請する'); await sleep(1500);
    await save('fx_form_empty');
    await scanMembers(page);
    try {
      const inputs = await page.$$('input[type=file]');
      await inputs[inputs.length - 1].uploadFile(posterPath);
      await sleep(800);
    } catch (e) { console.error('  写真を入れられませんでした:', e.message); }
    await fillForm(page);
    await sleep(2600); // 自動保存（1.5秒後）
    await cleanFestival(page);
    // 「※画像は「一時保存」を押すと保存されます」（自動保存は画像を含めない、という赤字の注意）と入力中のカーソルは外して撮る
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.querySelectorAll('span').forEach((s) => { if (/一時保存」を押すと/.test(s.textContent)) s.style.display = 'none'; });
    });
    await measure(page, 'fx_form', [['members', '団体メンバー', 'box'], ['photo', '写真・ポスター', 'exact'], ['menu', 'メニュー', 'exact'], ['coupon', '学生限定クーポンを出す', 'box'], ['autosave', 'に自動保存', ''], ['submit', '申請する', 'exact']]);
    await save('fx_form');
    await clickText(page, '申請する', { exact: true }); await sleep(700);
    await cleanFestival(page);
    await scrollMain(page, 0); await sleep(300);
    await measure(page, 'fx_applied', [['toast', '申請しました', ''], ['myapps', 'あなたの申請', 'box']]);
    await save('fx_applied');
  });
} finally {
  await browser.close();
}
if (Object.keys(RECTS).length) {
  const file = resolve(__dirname, '..', 'src', 'fest', 'rects.json');
  let prev = {};
  try { prev = JSON.parse((await import('node:fs')).readFileSync(file, 'utf8')); } catch {}
  writeFileSync(file, JSON.stringify({ ...prev, ...RECTS }, null, 1));
}
console.log(`[完了] ${OUT}`);
