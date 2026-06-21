import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// 管理者判定（admin/route.js・music/route.js と同じ仕組み: ENV_ADMIN_IDS + admin_users テーブル）
const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
async function isAdmin(sb, userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

const TYPES = new Set(['info', 'maintenance', 'update', 'urgent']);

// GET: アクティブなお知らせ一覧（ピン留め優先 → 新しい順）
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('gym_announcements')
      .select('id, title, body, type, pinned, created_at, updated_at')
      .eq('active', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error?.code === '42P01') return NextResponse.json([]);
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[Gym announcements GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: お知らせ作成（管理者のみ）
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    if (!(await isAdmin(sb, userid))) {
      return NextResponse.json({ error: '管理権限が必要です' }, { status: 403 });
    }

    const { title, body, type = 'info', pinned = false } = await request.json().catch(() => ({}));
    if (!title || !body) return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    const t = TYPES.has(type) ? type : 'info';

    const { data, error } = await sb
      .from('gym_announcements')
      .insert({ title, body, type: t, pinned: !!pinned, created_by: userid })
      .select('id, title, body, type, pinned, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Gym announcements POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
