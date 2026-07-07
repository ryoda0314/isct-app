import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isLangCode, isLangRole } from '../../../campus-sns/languages.js';

// GET /api/languages
// → { counts: { <code>: { learner, native } }, mine: { <code>: role } }
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('language_members')
      .select('lang_code, role, user_id');

    if (error) {
      console.error('[Languages GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const counts = {};
    const mine = {};
    for (const row of data || []) {
      const c = counts[row.lang_code] || (counts[row.lang_code] = { learner: 0, native: 0 });
      if (row.role === 'native') c.native++; else c.learner++;
      if (Number(row.user_id) === Number(userid)) mine[row.lang_code] = row.role;
    }
    return NextResponse.json({ counts, mine });
  } catch (err) {
    console.error('[Languages GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/languages  { lang_code, role }
// Join a language community, or change your role in one (upsert on (lang_code,user_id)).
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const { lang_code, role } = await request.json();
    if (!isLangCode(lang_code)) {
      return NextResponse.json({ error: 'Invalid lang_code' }, { status: 400 });
    }
    if (!isLangRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Ensure a profile row exists (mirrors the messages POST convention).
    const { error: profileErr } = await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );
    if (profileErr) console.error('[Languages POST] profile upsert:', profileErr.message);

    const { data, error } = await sb
      .from('language_members')
      .upsert(
        { lang_code, user_id: userid, role },
        { onConflict: 'lang_code,user_id' }
      )
      .select('lang_code, role')
      .single();

    if (error) {
      console.error('[Languages POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Languages POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/languages  { lang_code }  — leave a community
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { lang_code } = await request.json();
    if (!isLangCode(lang_code)) {
      return NextResponse.json({ error: 'Invalid lang_code' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('language_members')
      .delete()
      .eq('lang_code', lang_code)
      .eq('user_id', userid);

    if (error) {
      console.error('[Languages DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Languages DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
