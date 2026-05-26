// 実シラバスを横断して grading パーサの精度を計測するスクリプト。
//   node scripts/test-grading-parser.mjs
//
// - 複数学院の一覧ページを取得 → URLを収集
// - 各シラバス詳細をフェッチ → grading セクション抽出 → パース
// - 集計: 取得成功 / 解析成功 / 合計100%近辺 / 怪しいラベル など

import { parseGradingBreakdown } from '../lib/api/grading-parser.js';

const BASE = 'https://syllabus.s.isct.ac.jp';
const YEAR = '2026';
const SAMPLE_DEPTS = [
  // 主要学院から偏りなく
  ['MEC', `/courses/${YEAR}/2/0-902-321500-0-0`], // 機械
  ['CSC', `/courses/${YEAR}/4/0-904-342300-0-0`], // 情工
  ['EEE', `/courses/${YEAR}/2/0-902-321700-0-0`], // 電電
  ['MTH', `/courses/${YEAR}/1/0-901-311100-0-0`], // 数学
  ['CHM', `/courses/${YEAR}/1/0-901-311300-0-0`], // 化学
  ['LST', `/courses/${YEAR}/5/0-905-352400-0-0`], // 生命
  ['LAH', `/courses/${YEAR}/7/0-907-0-110100-0`], // 文系教養
  ['LAE', `/courses/${YEAR}/7/0-907-0-110200-0`], // 英語
  ['ARC', `/courses/${YEAR}/6/0-906-362500-0-0`], // 建築
  ['IEE', `/courses/${YEAR}/2/0-902-321900-0-0`], // 経営
];

const PER_DEPT_LIMIT = 25; // 各学院から 最大25科目
const CONCURRENCY = 8;
const SLEEP_MS = 100;

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

function extractGradingSection(html) {
  const re = /<h3 class="c-h3">([^<]*?(?:評価|Evaluation|Grading|Assessment)[^<]*?)<\/h3>\s*<p class="c-p">([\s\S]*?)<\/p>/gi;
  const candidates = [];
  let m;
  while ((m = re.exec(html)) !== null) candidates.push({ heading: m[1], body: m[2] });
  if (candidates.length === 0) return null;
  const pick = candidates.find(c => /成績|評価.*方法|Grading|Evaluation method|Assessment/i.test(c.heading)) || candidates[0];
  let body = pick.body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  body = body.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').trim();
  return body || null;
}

async function listDeptUrls(deptPath) {
  const r = await fetch(BASE + deptPath, { headers: UA });
  const html = await r.text();
  const urls = new Set();
  const re = /href="((?:https?:\/\/[^"]*)?\/courses\/\d{4}\/[^"]*\/(\d{6,}))"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1].startsWith('http') ? m[1] : BASE + m[1];
    urls.add(u);
  }
  return [...urls];
}

async function fetchOne(url) {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return { url, error: `HTTP ${r.status}` };
    const html = await r.text();
    const codeM = html.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);
    const code = codeM ? codeM[1] : null;
    const grading = extractGradingSection(html);
    if (!grading) return { url, code, raw: null, parsed: null };
    const parsed = parseGradingBreakdown(grading);
    return { url, code, raw: grading, parsed };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function main() {
  const allUrls = [];
  for (const [dept, path] of SAMPLE_DEPTS) {
    const urls = await listDeptUrls(path);
    const slice = urls.slice(0, PER_DEPT_LIMIT);
    for (const u of slice) allUrls.push({ dept, url: u });
    console.log(`[list] ${dept}: ${slice.length} URLs (from ${urls.length})`);
  }
  console.log(`[total] ${allUrls.length} courses to fetch`);

  const results = [];
  for (let i = 0; i < allUrls.length; i += CONCURRENCY) {
    const batch = allUrls.slice(i, i + CONCURRENCY);
    const out = await Promise.all(batch.map(async ({ dept, url }) => ({
      dept, ...(await fetchOne(url)),
    })));
    results.push(...out);
    await new Promise(r => setTimeout(r, SLEEP_MS));
    process.stdout.write(`\r[fetch] ${results.length}/${allUrls.length}`);
  }
  console.log();

  // 集計
  const stats = {
    total: results.length,
    fetchErr: 0,
    noGradingSection: 0,
    rawOnly: 0,
    parsed: 0,
    totalNear100: 0,
    totalOff: 0,
    withRange: 0,           // 範囲表記を1つ以上含む
    scaledSumIs100: 0,      // breakdown の percent 合計が100%
    suspiciousLabel: 0,
    longLabel: 0,
  };
  const samplesByOutcome = { rawOnly: [], parsed: [], suspicious: [], longLabel: [], off: [] };

  for (const r of results) {
    if (r.error) { stats.fetchErr++; continue; }
    if (!r.raw) { stats.noGradingSection++; continue; }
    if (!r.parsed?.has_breakdown) {
      stats.rawOnly++;
      if (samplesByOutcome.rawOnly.length < 8) {
        samplesByOutcome.rawOnly.push({ code: r.code, raw: r.raw.slice(0, 150) });
      }
      continue;
    }
    stats.parsed++;
    const total = r.parsed.total_percent;
    if (total >= 95 && total <= 105) stats.totalNear100++;
    if (r.parsed.breakdown.some(b => b.is_range)) stats.withRange++;
    if (r.parsed.breakdown.some(b => b.is_inferred)) {
      stats.inferred = (stats.inferred || 0) + 1;
    } else {
      stats.explicit = (stats.explicit || 0) + 1;
    }
    const scaledSum = r.parsed.breakdown.reduce((s, b) => s + b.percent, 0);
    if (Math.abs(scaledSum - 100) < 0.5) stats.scaledSumIs100++;
    else { stats.totalOff++; samplesByOutcome.off.push({ code: r.code, total, items: r.parsed.breakdown, raw: r.raw.slice(0, 120) }); }

    for (const item of r.parsed.breakdown) {
      if (item.label.length > 15) {
        stats.longLabel++;
        if (samplesByOutcome.longLabel.length < 8) {
          samplesByOutcome.longLabel.push({ code: r.code, label: item.label, raw: r.raw.slice(0, 120) });
        }
      }
      // 「を」「により」「は」が含まれている = 文中断片
      if (/(?:を|により|について)/.test(item.label) && item.label.length > 6) {
        stats.suspiciousLabel++;
        if (samplesByOutcome.suspicious.length < 8) {
          samplesByOutcome.suspicious.push({ code: r.code, label: item.label, raw: r.raw.slice(0, 120) });
        }
      }
    }
    if (samplesByOutcome.parsed.length < 5) {
      samplesByOutcome.parsed.push({ code: r.code, total, items: r.parsed.breakdown });
    }
  }

  console.log('\n===== STATS =====');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);

  console.log('\n===== sample: parsed OK =====');
  for (const s of samplesByOutcome.parsed) console.log(s.code, s.total, JSON.stringify(s.items));

  console.log('\n===== sample: total off (合計が95-105%外) =====');
  for (const s of samplesByOutcome.off.slice(0, 8)) {
    console.log(s.code, 'total=', s.total);
    console.log('  RAW:', s.raw);
    console.log('  ITEMS:', JSON.stringify(s.items));
  }

  console.log('\n===== sample: suspicious label (「を」「により」混入) =====');
  for (const s of samplesByOutcome.suspicious) {
    console.log(s.code, 'label=', JSON.stringify(s.label));
    console.log('  RAW:', s.raw);
  }

  console.log('\n===== sample: long label (>15 chars) =====');
  for (const s of samplesByOutcome.longLabel) {
    console.log(s.code, 'label=', JSON.stringify(s.label));
    console.log('  RAW:', s.raw);
  }

  console.log('\n===== sample: no-breakdown (rawOnly) =====');
  for (const s of samplesByOutcome.rawOnly) {
    console.log(s.code);
    console.log('  RAW:', s.raw);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
