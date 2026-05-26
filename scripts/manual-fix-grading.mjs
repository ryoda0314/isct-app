// 特定の course_code に対して breakdown を手動で書き込むスクリプト。
// 自動パースで取れないシラバス文 (例: 「成績配分は30：70」) に対応する。
//
// 使い方: node scripts/manual-fix-grading.mjs [--apply]

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes('--apply');

// 手動オーバーライド辞書。
//   course_code に一致 (セクション込みも完全一致するキーを使う)
//   全 syllabus_year の行に適用される
const OVERRIDES = {
  'MEC.I212': {
    breakdown: [
      { label: '小テスト', percent: 30, category: 'quiz' },
      { label: '期末試験', percent: 70, category: 'exam' },
    ],
    total_percent: 100,
    has_breakdown: true,
    note: '原文「成績配分は30：70．」の比率記法を手動マッピング',
  },
};

async function main() {
  for (const [code, ovr] of Object.entries(OVERRIDES)) {
    // 全年度の該当行 (セクション付きも含む) を取得
    const { data, error } = await sb.from('course_grading')
      .select('id, course_code, syllabus_year, raw_text, breakdown, has_breakdown')
      .or(`course_code.eq.${code},course_code.like.${code}:%`);
    if (error) { console.error(error); continue; }
    if (!data || data.length === 0) {
      console.log(`  ${code}: 対象なし`);
      continue;
    }
    console.log(`\n=== ${code} (${data.length} 行) ===`);
    console.log(`  note: ${ovr.note}`);
    for (const r of data) {
      console.log(`  - id=${r.id} year=${r.syllabus_year} code=${r.course_code}`);
      console.log(`    raw : ${(r.raw_text || '').slice(0, 80)}`);
      console.log(`    cur : ${JSON.stringify(r.breakdown)}`);
      console.log(`    new : ${JSON.stringify(ovr.breakdown)}`);
    }

    if (!apply) continue;

    for (const r of data) {
      const { error } = await sb.from('course_grading').update({
        breakdown: ovr.breakdown,
        total_percent: ovr.total_percent,
        has_breakdown: ovr.has_breakdown,
      }).eq('id', r.id);
      if (error) console.error(`    update err id=${r.id}:`, error.message);
      else console.log(`    ✓ updated id=${r.id}`);
    }
  }

  if (!apply) console.log('\n(dry-run — use --apply to write)');
}

main().catch(e => { console.error(e); process.exit(1); });
