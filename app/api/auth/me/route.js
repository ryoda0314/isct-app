import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function checkAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const sb = getSupabaseAdmin();
    const [isAdmin, profile] = await Promise.all([
      checkAdmin(auth.userid),
      sb.from('profiles').select('banned, ban_reason, dept').eq('moodle_id', auth.userid).maybeSingle().then(r => r.data),
    ]);

    if (profile?.banned) {
      return NextResponse.json({
        error: 'アカウントが停止されています',
        banned: true,
        banReason: profile.ban_reason || null,
      }, { status: 403 });
    }

    return NextResponse.json({ userid: auth.userid, fullname: auth.fullname, isAdmin, dept: profile?.dept || null });
  } catch (err) {
    console.error('[AuthMe] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const updates = {};

    // dept: validate it's a known department prefix or null (to reset)
    if ('dept' in body) {
      const dept = body.dept;
      if (dept !== null && (typeof dept !== 'string' || dept.length > 10)) {
        return NextResponse.json({ error: 'Invalid dept' }, { status: 400 });
      }
      updates.dept = dept;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    await sb.from('profiles').update(updates).eq('moodle_id', auth.userid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AuthMe] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
