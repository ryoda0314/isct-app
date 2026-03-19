import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function isAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

// GET /api/admin?action=stats|users|posts|messages|admins
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (!(await isAdmin(auth.userid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const sb = getSupabaseAdmin();

    if (action === 'stats') {
      const [users, posts, messages, dms] = await Promise.all([
        sb.from('profiles').select('*', { count: 'exact', head: true }),
        sb.from('posts').select('*', { count: 'exact', head: true }),
        sb.from('messages').select('*', { count: 'exact', head: true }),
        sb.from('dm_messages').select('*', { count: 'exact', head: true }),
      ]);
      return NextResponse.json({
        users: users.count || 0,
        posts: posts.count || 0,
        messages: messages.count || 0,
        dms: dms.count || 0,
      });
    }

    if (action === 'users') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const { data, error, count } = await sb
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ users: data || [], total: count || 0, page });
    }

    if (action === 'posts') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const search = searchParams.get('search') || '';
      const courseId = searchParams.get('course_id') || '';
      let query = sb
        .from('posts')
        .select('*, profiles(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (courseId) query = query.eq('course_id', courseId);
      if (search) query = query.ilike('text', `%${search}%`);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ posts: data || [], total: count || 0, page });
    }

    if (action === 'messages') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const search = searchParams.get('search') || '';
      const courseId = searchParams.get('course_id') || '';
      let query = sb
        .from('messages')
        .select('*, profiles(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (courseId) query = query.eq('course_id', courseId);
      if (search) query = query.ilike('text', `%${search}%`);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ messages: data || [], total: count || 0, page });
    }

    if (action === 'admins') {
      const { data } = await sb
        .from('admin_users')
        .select('moodle_user_id, created_at, profiles(name, avatar, color)')
        .order('created_at', { ascending: true });
      const dbAdmins = (data || []).map(a => ({
        moodleId: a.moodle_user_id,
        name: a.profiles?.name || null,
        avatar: a.profiles?.avatar || null,
        color: a.profiles?.color || null,
        createdAt: a.created_at,
        source: 'db',
      }));
      const dbIds = new Set(dbAdmins.map(a => String(a.moodleId)));
      const envAdmins = ENV_ADMIN_IDS.filter(id => !dbIds.has(id)).map(id => ({
        moodleId: Number(id),
        name: null,
        avatar: null,
        color: null,
        createdAt: null,
        source: 'env',
      }));
      // resolve env admin profiles
      for (const ea of envAdmins) {
        const { data: p } = await sb.from('profiles').select('name, avatar, color').eq('moodle_id', ea.moodleId).maybeSingle();
        if (p) { ea.name = p.name; ea.avatar = p.avatar; ea.color = p.color; }
      }
      return NextResponse.json({ admins: [...envAdmins, ...dbAdmins] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Admin GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/admin  { action: 'add_admin', moodleUserId }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (!(await isAdmin(auth.userid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action, moodleUserId } = body;

    if (action === 'add_admin') {
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      const sb = getSupabaseAdmin();
      const { error } = await sb.from('admin_users').upsert({ moodle_user_id: moodleUserId, added_by: auth.userid }, { onConflict: 'moodle_user_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_admin') {
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      if (ENV_ADMIN_IDS.includes(String(moodleUserId))) {
        return NextResponse.json({ error: '環境変数で設定された管理者は削除できません' }, { status: 400 });
      }
      const sb = getSupabaseAdmin();
      const { error } = await sb.from('admin_users').delete().eq('moodle_user_id', moodleUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Admin POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/admin  { type: 'post'|'message', id }
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (!(await isAdmin(auth.userid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { type, id } = body;
    if (!type || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    if (type === 'post') {
      await sb.from('comments').delete().eq('post_id', id);
      const { error } = await sb.from('posts').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (type === 'message') {
      const { error } = await sb.from('messages').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    console.error('[Admin DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
