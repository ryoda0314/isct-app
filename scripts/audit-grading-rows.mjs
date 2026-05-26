// course_grading テーブルを DB から走査し、ラベルが崩れている行を抽出する。
// 環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を使用。
//
// 使い方:
//   node scripts/audit-grading-rows.mjs [year]
//   year を省略すると全年度。

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseGradingBreakdown } from '../lib/api/grading-parser.js';

// .env.local を最小パーサで読み込む
function loadEnv() {
  try {
    const txt = readFileSync('.env.local', 'utf-8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
}
loadEnv();

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('missing SUPABASE env');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const yearArg = process.argv[2];

// 「壊れている」ラベルの判定ルール
function judgeIssues(b, raw) {
  const issues = [];
  const label = b.label || '';
  // (1) 異常に長い (>= 25文字)
  if (label.length >= 25) issues.push(`long(${label.length})`);

  // (2) 文の途中から始まる助詞/接続助詞
  if (/^(?:ける|ため|ても|など|まで|から|として|により|について|を|に|の|や|と|や|及び|または|また|なお|さらに|加えて|主に|総合的に|以下の)/.test(label)) {
    issues.push('starts-with-particle');
  }

  // (3) 括弧の不均衡
  const openN = (label.match(/[(（]/g) || []).length;
  const closeN = (label.match(/[)）]/g) || []).length;
  if (openN !== closeN) issues.push(`paren-imbalanced(${openN}/${closeN})`);

  // (4) ラベル中に教員名/個人名らしき塊 (フルネーム or 苗字+)
  if (/[山田川島内海井上田中佐藤鈴木高橋松本斎藤吉田渡辺]\)/.test(label)) issues.push('teacher-name?');

  // (5) ラベル末尾が記号
  if (/[(（、,:：;；·・]$/.test(label)) issues.push('ends-with-punct');

  // (6) ラベルに改行や連続スペース
  if (/\s{2,}|\n/.test(label)) issues.push('whitespace');

  // (7) 「以下の通り」「下記の通り」「次のように」等の文書定型句
  if (/(?:以下の通り|下記の通り|次のように|次の通り|次のとおり)/.test(label)) issues.push('document-template');

  // (8) ラベルに数字 (% 以外の数値) — おそらく範囲表記残骸など
  if (!b.is_range && /\d/.test(label) && !/^第\d/.test(label)) issues.push('has-digit');

  return issues;
}

async function main() {
  const PAGE = 1000;
  let from = 0;
  const issues = [];
  let totalScanned = 0;
  let totalParsed = 0;

  while (true) {
    let q = sb.from('course_grading')
      .select('course_code, syllabus_year, raw_text, breakdown, has_breakdown, source_url')
      .order('course_code')
      .range(from, from + PAGE - 1);
    if (yearArg) q = q.eq('syllabus_year', yearArg);
    const { data, error } = await q;
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalScanned++;
      if (!row.has_breakdown || !row.breakdown) continue;
      totalParsed++;
      const rowIssues = [];
      for (const b of row.breakdown) {
        const found = judgeIssues(b, row.raw_text);
        if (found.length > 0) {
          rowIssues.push({ label: b.label, percent: b.percent, category: b.category, issues: found });
        }
      }
      if (rowIssues.length > 0) {
        issues.push({
          code: row.course_code,
          year: row.syllabus_year,
          raw: row.raw_text,
          source_url: row.source_url,
          items: rowIssues,
        });
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\rscanned ${totalScanned}`);
  }
  process.stdout.write('\n');

  // パーサ再実行で違う結果になるかも合わせて見る (パーサ改善後で DB が古い場合)
  console.log(`\n===== Scanned: ${totalScanned} rows / Parsed: ${totalParsed} / Issues: ${issues.length} =====`);

  // 問題タイプ別集計
  const byKind = {};
  for (const r of issues) for (const it of r.items) for (const k of it.issues) {
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log('\n--- issue kind counts ---');
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  // 直近のリパース結果も比較
  console.log('\n--- sample broken rows + reparse result ---');
  for (const r of issues.slice(0, 25)) {
    console.log('\n##', r.code, '(', r.year, ')');
    console.log('  raw:', (r.raw || '').slice(0, 160).replace(/\n/g, ' / '));
    console.log('  current breakdown:');
    for (const it of r.items) {
      console.log(`    - [${it.category}] "${it.label}" ${it.percent}%  ← ${it.issues.join(',')}`);
    }
    const re = parseGradingBreakdown(r.raw || '');
    console.log('  reparse with current parser:');
    if (!re.has_breakdown) console.log('    (rawOnly)');
    else for (const b of (re.breakdown || [])) {
      console.log(`    - [${b.category}] "${b.label}" ${b.percent}%${b.is_range ? ' (range)' : ''}${b.is_inferred ? ' (inferred)' : ''}`);
    }
  }

  if (issues.length > 25) {
    console.log(`\n... and ${issues.length - 25} more`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
