import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { runExamImport } from '../../../../lib/exam-import/run.js';

// 大学公式の期末試験時間割 PDF（学士・大学院）を毎日確認し、変わっていれば取り込む。
// Vercel Cron（vercel.json）から `Authorization: Bearer <CRON_SECRET>` 付きで呼ばれる。
// 中身は lib/exam-import/run.js。?dry=1 で書き込まずに差分だけ返す。

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  try {
    const result = await runExamImport(getSupabaseAdmin(), {
      dryRun: searchParams.get('dry') === '1',
      force: searchParams.get('force') === '1',
    });
    for (const s of result.sources) {
      const line = `[ExamImport] ${s.level}: ${s.status} ${s.year || ''}${s.quarter || ''} exams=${s.exams ?? '-'} classes=${s.classes ?? '-'} +${s.added?.length ?? 0} ~${s.updated?.length ?? 0} -${s.removed?.length ?? 0}`;
      if (s.status === 'invalid' || s.status === 'error' || s.problems?.length) console.error(line, s.problems);
      else console.log(line);
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[ExamImport] failed:', e?.message || e);
    return NextResponse.json({ error: 'import failed' }, { status: 500 });
  }
}
