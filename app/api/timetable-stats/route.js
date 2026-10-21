import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getTimetableStatsOptOut, setTimetableStatsOptOut } from '../../../lib/timetable-stats.js';

// 本人の「時間割の統計に協力」設定（プロフィール画面）。記録そのものは lib/timetable-stats.js。

// GET: { optOut }
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    return NextResponse.json({ optOut: await getTimetableStatsOptOut(auth.userid) });
  } catch (err) {
    console.error('[TimetableStats] GET error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT { optOut: boolean } — true にすると、これまでの記録も削除する
export async function PUT(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { optOut } = await request.json().catch(() => ({}));
    if (typeof optOut !== 'boolean') return NextResponse.json({ error: 'optOut (boolean) required' }, { status: 400 });
    await setTimetableStatsOptOut(auth.userid, optOut);
    return NextResponse.json({ optOut });
  } catch (err) {
    console.error('[TimetableStats] PUT error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
