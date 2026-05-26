// noGradingSection の実態を確認: h3 一覧を出して見出し名のバリエーションを掴む。
const BASE = 'https://syllabus.s.isct.ac.jp';
const YEAR = '2026';
const UA = { 'User-Agent': 'Mozilla/5.0' };

async function listDeptUrls(deptPath) {
  const r = await fetch(BASE + deptPath, { headers: UA });
  const html = await r.text();
  const urls = new Set();
  const re = /href="((?:https?:\/\/[^"]*)?\/courses\/\d{4}\/[^"]*\/(\d{6,}))"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.add(m[1].startsWith('http') ? m[1] : BASE + m[1]);
  }
  return [...urls];
}

function findGrading(html) {
  const re = /<h3 class="c-h3">([^<]*?(?:評価|Evaluation|Grading|Assessment)[^<]*?)<\/h3>\s*<p class="c-p">([\s\S]*?)<\/p>/gi;
  const cands = [];
  let m;
  while ((m = re.exec(html)) !== null) cands.push({ h: m[1], hasGradingKeyword: /成績|Grading|Assessment|評価.*方法|Evaluation.*method/i.test(m[1]) });
  return cands;
}

async function main() {
  const depts = [
    ['MEC', `/courses/${YEAR}/2/0-902-321500-0-0`],
    ['LAE', `/courses/${YEAR}/7/0-907-0-110200-0`],
    ['LAH', `/courses/${YEAR}/7/0-907-0-110100-0`],
  ];

  const missing = [];
  for (const [dept, path] of depts) {
    const urls = (await listDeptUrls(path)).slice(0, 30);
    for (const u of urls) {
      const html = await (await fetch(u, { headers: UA })).text();
      const cands = findGrading(html);
      if (cands.length === 0) {
        // h3 一覧を全部見る
        const allH3 = [...html.matchAll(/<h3 class="c-h3">([^<]+)<\/h3>/g)].map(m => m[1]);
        missing.push({ dept, url: u, allH3 });
      }
    }
  }

  console.log('Missing grading section:', missing.length);
  for (const m of missing.slice(0, 8)) {
    console.log('---', m.url);
    console.log('  h3s:', JSON.stringify(m.allH3));
  }
}
main();
