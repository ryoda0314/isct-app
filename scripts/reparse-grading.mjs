// course_grading テーブルの raw_text を現在のパーサで再パースし、
// breakdown / total_percent / has_breakdown を書き戻す。
// 再スクレイプは不要 (HTMLは触らないので速い)。
//
// 使い方:
//   node scripts/reparse-grading.mjs            # dry-run (差分件数のみ表示)
//   node scripts/reparse-grading.mjs --apply    # 実DB更新
//   node scripts/reparse-grading.mjs --apply 2026  # 特定年度のみ

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseGradingBreakdown } from '../lib/api/grading-parser.js';

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
if (!SB_URL || !SB_KEY) { console.error('missing SUPABASE env'); process.exit(1); }
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const apply = process.argv.includes('--apply');
const yearArg = process.argv.find(a => /^\d{4}$/.test(a));

function breakdownsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label) return false;
    if (Math.abs((a[i].percent || 0) - (b[i].percent || 0)) > 0.001) return false;
    if (a[i].category !== b[i].category) return false;
  }
  return true;
}

async function main() {
  console.log(`mode: ${apply ? 'APPLY (will write to DB)' : 'DRY-RUN'}`);
  if (yearArg) console.log(`year filter: ${yearArg}`);

  const PAGE = 1000;
  let from = 0;
  let totalScanned = 0;
  let changed = 0;
  let newlyParsed = 0;       // 以前 rawOnly → 今回 parsed
  let nowRawOnly = 0;         // 以前 parsed → 今回 rawOnly
  let breakdownChanged = 0;   // breakdown が変化
  let updates = [];

  while (true) {
    let q = sb.from('course_grading')
      .select('id, course_code, syllabus_year, raw_text, breakdown, has_breakdown, is_pass_fail')
      .order('id')
      .range(from, from + PAGE - 1);
    if (yearArg) q = q.eq('syllabus_year', yearArg);
    const { data, error } = await q;
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      totalScanned++;
      const re = parseGradingBreakdown(row.raw_text || '');
      const oldHas = !!row.has_breakdown;
      const newHas = !!re.has_breakdown;
      const oldPF = !!row.is_pass_fail;
      const newPF = !!re.is_pass_fail;
      const oldB = row.breakdown || null;
      const newB = re.breakdown || null;

      const diff = (oldHas !== newHas) || (oldPF !== newPF) || !breakdownsEqual(oldB, newB);
      if (!diff) continue;
      changed++;
      if (!oldHas && newHas) newlyParsed++;
      else if (oldHas && !newHas) nowRawOnly++;
      else breakdownChanged++;

      updates.push({
        id: row.id,
        breakdown: newB,
        total_percent: re.total_percent != null ? Math.round(re.total_percent) : null,
        has_breakdown: newHas,
        is_pass_fail: newPF,
      });
    }

    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\rscanned ${totalScanned}, changed ${changed}`);
  }
  process.stdout.write('\n');

  console.log(`\n===== summary =====`);
  console.log(`  scanned       : ${totalScanned}`);
  console.log(`  changed       : ${changed}`);
  console.log(`  └ newly parsed : ${newlyParsed}  (rawOnly → parsed)`);
  console.log(`  └ now rawOnly  : ${nowRawOnly}  (parsed → rawOnly)`);
  console.log(`  └ breakdown ↺  : ${breakdownChanged}`);

  if (!apply) {
    console.log('\n(dry-run — use --apply to write changes)');
    // 変化サンプル
    console.log('\n--- sample of changed rows (first 10) ---');
    for (const u of updates.slice(0, 10)) {
      console.log(`  id=${u.id} has_breakdown=${u.has_breakdown} total=${u.total_percent}`);
      console.log(`    breakdown=${JSON.stringify(u.breakdown)}`);
    }
    return;
  }

  // 書き戻し (id は generated always なので upsert ではなく id 単位の update)
  let ok = 0, fail = 0;
  const CONC = 8;
  for (let i = 0; i < updates.length; i += CONC) {
    const batch = updates.slice(i, i + CONC);
    await Promise.all(batch.map(async u => {
      const { error } = await sb.from('course_grading').update({
        breakdown: u.breakdown,
        total_percent: u.total_percent,
        has_breakdown: u.has_breakdown,
        is_pass_fail: u.is_pass_fail,
      }).eq('id', u.id);
      if (error) { fail++; console.error('update err', u.id, error.message); }
      else ok++;
    }));
    process.stdout.write(`\rupdated ok=${ok} fail=${fail} / ${updates.length}`);
  }
  process.stdout.write('\n');
  console.log(`done. ok=${ok}, fail=${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
