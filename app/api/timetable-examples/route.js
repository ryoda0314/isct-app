import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { getExampleSettings, setExampleSettings, listSharedExamples } from '../../../lib/timetable-examples.js';

// 時間割例（lib/timetable-examples.js）の学生側。
//   GET                                  → { settings }                本人の設定（プロフィール画面）
//   GET ?grade=B2&quarter=1&school&dept  → { settings, examples }      公開中の時間割例（履修登録補助）
//   PUT { optOut?, share? }              → { settings }

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const settings = await getExampleSettings(auth.userid);
    const sp = new URL(request.url).searchParams;
    if (!sp.get('grade')) return NextResponse.json({ settings });
    const examples = await listSharedExamples(getSupabaseAdmin(), auth.userid, {
      grade: sp.get('grade'),
      quarter: Number(sp.get('quarter')),
      school: sp.get('school') || null,
      dept: sp.get('dept') || null,
    });
    return NextResponse.json({ settings, examples });
  } catch (err) {
    console.error('[TimetableExamples] GET error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => ({}));
    const patch = {};
    for (const k of ['optOut', 'share']) {
      if (k in body) {
        if (typeof body[k] !== 'boolean') return NextResponse.json({ error: `${k} must be boolean` }, { status: 400 });
        patch[k] = body[k];
      }
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'optOut or share required' }, { status: 400 });
    return NextResponse.json({ settings: await setExampleSettings(auth.userid, patch) });
  } catch (err) {
    console.error('[TimetableExamples] PUT error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
