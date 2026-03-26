import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { sendPushToUser } from '../../../lib/push.js';
import { getSyllabusFromDB, getSyllabusStats, fetchDeptSyllabus, getDeptList } from '../../../lib/api/syllabus-bulk.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function isAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

// Audit log helper
async function auditLog(sb, adminId, action, targetType, targetId, detail) {
  try {
    await sb.from('admin_audit_log').insert({
      admin_id: adminId, action, target_type: targetType,
      target_id: String(targetId || ''), detail: detail || null,
    });
  } catch (e) { console.error('[AuditLog]', e); }
}

// NG word check helper — returns matched words (empty array = clean)
async function checkNgWords(sb, text) {
  if (!text) return [];
  const { data } = await sb.from('ng_words').select('word, match_type, action');
  if (!data || !data.length) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const w of data) {
    if (w.match_type === 'exact' && lower === w.word.toLowerCase()) hits.push(w);
    else if (w.match_type === 'regex') {
      try { if (new RegExp(w.word, 'i').test(text)) hits.push(w); } catch {}
    } else if (lower.includes(w.word.toLowerCase())) hits.push(w);
  }
  return hits;
}

// GET /api/admin?action=stats|users|posts|messages|admins|reports|announcements|audit_log|comments|...
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
      const now = new Date();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [users, posts, messages, dms, reportsPending, reportsTotal, banned, dau, wau, mau, circles] = await Promise.all([
        sb.from('profiles').select('*', { count: 'exact', head: true }),
        sb.from('posts').select('*', { count: 'exact', head: true }),
        sb.from('messages').select('*', { count: 'exact', head: true }),
        sb.from('dm_messages').select('*', { count: 'exact', head: true }),
        sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('reports').select('*', { count: 'exact', head: true }),
        sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', dayAgo),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', weekAgo),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', monthAgo),
        sb.from('circles').select('*', { count: 'exact', head: true }),
      ]);
      return NextResponse.json({
        users: users.count || 0,
        posts: posts.count || 0,
        messages: messages.count || 0,
        dms: dms.count || 0,
        reportsPending: reportsPending.count || 0,
        reportsTotal: reportsTotal.count || 0,
        bannedUsers: banned.count || 0,
        dau: dau.count || 0,
        wau: wau.count || 0,
        mau: mau.count || 0,
        circles: circles.count || 0,
      });
    }

    if (action === 'users') {
      const page = parseInt(searchParams.get('page')) || 0;
      const search = searchParams.get('search') || '';
      const filter = searchParams.get('filter') || ''; // banned
      const limit = 50;
      let query = sb
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (filter === 'banned') query = query.eq('banned', true);
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error, count } = await query;
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

    if (action === 'comments') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const search = searchParams.get('search') || '';
      let query = sb
        .from('comments')
        .select('*, profiles(name, avatar, color), posts(course_id, text)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (search) query = query.ilike('text', `%${search}%`);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ comments: data || [], total: count || 0, page });
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

    if (action === 'reports') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const status = searchParams.get('status') || '';
      let query = sb
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(name, avatar, color), target_user:profiles!reports_target_user_id_fkey(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ reports: data || [], total: count || 0, page });
    }

    if (action === 'announcements') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const { data, error, count } = await sb
        .from('announcements')
        .select('*, profiles(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ announcements: data || [], total: count || 0, page });
    }

    if (action === 'audit_log') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const { data, error, count } = await sb
        .from('admin_audit_log')
        .select('*, profiles(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ logs: data || [], total: count || 0, page });
    }

    if (action === 'circles') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const search = searchParams.get('search') || '';
      let query = sb
        .from('circles')
        .select('*, profiles!circles_owner_id_fkey(name, avatar, color), circle_members(count)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const circles = (data || []).map(c => ({
        ...c,
        member_count: c.circle_members?.[0]?.count || 0,
        circle_members: undefined,
        owner: c.profiles || null,
        profiles: undefined,
      }));
      return NextResponse.json({ circles, total: count || 0, page });
    }

    if (action === 'anon_author') {
      const postId = searchParams.get('post_id');
      if (!postId) return NextResponse.json({ error: 'post_id required' }, { status: 400 });
      const { data, error } = await sb
        .from('posts')
        .select('moodle_user_id, type, profiles(name, avatar, color)')
        .eq('id', postId)
        .single();
      if (error || !data) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      await auditLog(sb, auth.userid, 'identify_anon', 'post', postId);
      return NextResponse.json({
        moodleUserId: data.moodle_user_id,
        name: data.profiles?.name || null,
        avatar: data.profiles?.avatar || null,
        color: data.profiles?.color || null,
        isAnon: data.type === 'anon',
      });
    }

    if (action === 'site_settings') {
      const { data } = await sb.from('site_settings').select('*');
      const settings = {};
      (data || []).forEach(s => { settings[s.key] = s.value; });
      return NextResponse.json({ settings });
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
      for (const ea of envAdmins) {
        const { data: p } = await sb.from('profiles').select('name, avatar, color').eq('moodle_id', ea.moodleId).maybeSingle();
        if (p) { ea.name = p.name; ea.avatar = p.avatar; ea.color = p.color; }
      }
      return NextResponse.json({ admins: [...envAdmins, ...dbAdmins] });
    }

    // --- User detail (posts/comments/reports history) ---
    if (action === 'user_detail') {
      const uid = parseInt(searchParams.get('user_id'));
      if (!uid) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
      const [profile, posts, comments, reportsBy, reportsAgainst, dmCount] = await Promise.all([
        sb.from('profiles').select('*').eq('moodle_id', uid).maybeSingle(),
        sb.from('posts').select('id, text, type, course_id, created_at', { count: 'exact' }).eq('moodle_user_id', uid).order('created_at', { ascending: false }).limit(20),
        sb.from('comments').select('id, text, post_id, created_at', { count: 'exact' }).eq('moodle_user_id', uid).order('created_at', { ascending: false }).limit(20),
        sb.from('reports').select('id, target_type, reason, status, created_at', { count: 'exact' }).eq('reporter_id', uid),
        sb.from('reports').select('id, target_type, reason, status, created_at', { count: 'exact' }).eq('target_user_id', uid),
        sb.from('dm_messages').select('*', { count: 'exact', head: true }).eq('sender_id', uid),
      ]);
      return NextResponse.json({
        profile: profile.data,
        posts: posts.data || [], postsTotal: posts.count || 0,
        comments: comments.data || [], commentsTotal: comments.count || 0,
        reportsMade: reportsBy.data || [], reportsMadeTotal: reportsBy.count || 0,
        reportsReceived: reportsAgainst.data || [], reportsReceivedTotal: reportsAgainst.count || 0,
        dmsSent: dmCount.count || 0,
      });
    }

    // --- DM monitoring ---
    if (action === 'dms') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const search = searchParams.get('search') || '';
      const userId = searchParams.get('user_id') || '';
      let query = sb
        .from('dm_messages')
        .select('*, profiles:profiles!dm_messages_sender_id_fkey(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (search) query = query.ilike('text', `%${search}%`);
      if (userId) query = query.eq('sender_id', parseInt(userId));
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ dms: data || [], total: count || 0, page });
    }

    // --- NG words list ---
    if (action === 'ng_words') {
      const { data, error } = await sb.from('ng_words').select('*').order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ words: data || [] });
    }

    // --- Circle messages ---
    if (action === 'circle_messages') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 50;
      const circleId = searchParams.get('circle_id') || '';
      const search = searchParams.get('search') || '';
      let query = sb
        .from('circle_messages')
        .select('*, profiles:profiles!circle_messages_sender_id_fkey(name, avatar, color), circle_channels!inner(name, circle_id, circles!inner(name))', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (circleId) query = query.eq('circle_channels.circle_id', circleId);
      if (search) query = query.ilike('text', `%${search}%`);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ messages: data || [], total: count || 0, page });
    }

    // --- Report trends (last 30 days) ---
    if (action === 'report_trends') {
      const { data } = await sb.from('reports').select('status, created_at').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      const byDay = {};
      (data || []).forEach(r => {
        const day = r.created_at?.slice(0, 10);
        if (!day) return;
        if (!byDay[day]) byDay[day] = { total: 0, pending: 0, resolved: 0, dismissed: 0 };
        byDay[day].total++;
        if (r.status === 'pending') byDay[day].pending++;
        else if (r.status === 'resolved') byDay[day].resolved++;
        else if (r.status === 'dismissed') byDay[day].dismissed++;
      });
      return NextResponse.json({ trends: byDay });
    }

    // --- Registration stats (last 90 days) ---
    if (action === 'registration_stats') {
      const { data } = await sb.from('profiles').select('created_at').gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      const byDay = {};
      (data || []).forEach(r => {
        const day = r.created_at?.slice(0, 10);
        if (!day) return;
        byDay[day] = (byDay[day] || 0) + 1;
      });
      return NextResponse.json({ registrations: byDay });
    }

    // --- Feature usage stats ---
    if (action === 'feature_stats') {
      const [posts, comments, msgs, dms, circles, circleMembers, circleMessages] = await Promise.all([
        sb.from('posts').select('type', { count: 'exact' }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        sb.from('comments').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        sb.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        sb.from('dm_messages').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        sb.from('circles').select('*', { count: 'exact', head: true }),
        sb.from('circle_members').select('*', { count: 'exact', head: true }),
        sb.from('circle_messages').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);
      // Count post types
      const postTypes = {};
      (posts.data || []).forEach(p => { postTypes[p.type || 'normal'] = (postTypes[p.type || 'normal'] || 0) + 1; });
      return NextResponse.json({
        week: {
          posts: posts.count || 0, postTypes,
          comments: comments.count || 0,
          messages: msgs.count || 0,
          dms: dms.count || 0,
          circleMessages: circleMessages.count || 0,
        },
        totals: { circles: circles.count || 0, circleMembers: circleMembers.count || 0 },
      });
    }

    // --- Syllabus / timetable data ---
    if (action === 'syllabus') {
      const dept = searchParams.get('dept') || '';
      const year = searchParams.get('year') || '';
      const quarter = searchParams.get('quarter') || '';
      const day = searchParams.get('day') || '';
      const search = searchParams.get('search') || '';
      const [courses, stats, lookupSetting] = await Promise.all([
        getSyllabusFromDB({ dept, year, quarter, day, search }),
        getSyllabusStats(),
        sb.from('site_settings').select('value').eq('key', 'syllabus_db_lookup').maybeSingle(),
      ]);
      const dbLookupEnabled = lookupSetting?.data?.value?.enabled !== false;
      return NextResponse.json({ courses, stats, dbLookupEnabled, ...getDeptList() });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Admin GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/admin
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (!(await isAdmin(auth.userid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;
    const sb = getSupabaseAdmin();

    // --- Admin management ---
    if (action === 'add_admin') {
      const { moodleUserId } = body;
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      const { error } = await sb.from('admin_users').upsert({ moodle_user_id: moodleUserId, added_by: auth.userid }, { onConflict: 'moodle_user_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'add_admin', 'user', moodleUserId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_admin') {
      const { moodleUserId } = body;
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      if (ENV_ADMIN_IDS.includes(String(moodleUserId))) {
        return NextResponse.json({ error: '環境変数で設定された管理者は削除できません' }, { status: 400 });
      }
      const { error } = await sb.from('admin_users').delete().eq('moodle_user_id', moodleUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'remove_admin', 'user', moodleUserId);
      return NextResponse.json({ ok: true });
    }

    // --- Ban/Unban ---
    if (action === 'ban_user') {
      const { moodleUserId, reason } = body;
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      const { error } = await sb.from('profiles').update({
        banned: true, banned_at: new Date().toISOString(), ban_reason: reason || null,
      }).eq('moodle_id', moodleUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'ban_user', 'user', moodleUserId, { reason });
      return NextResponse.json({ ok: true });
    }

    if (action === 'unban_user') {
      const { moodleUserId } = body;
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      const { error } = await sb.from('profiles').update({
        banned: false, banned_at: null, ban_reason: null,
      }).eq('moodle_id', moodleUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'unban_user', 'user', moodleUserId);
      return NextResponse.json({ ok: true });
    }

    // --- Edit profile (admin forced name change) ---
    if (action === 'edit_profile') {
      const { moodleUserId, name } = body;
      if (!moodleUserId || !name?.trim()) return NextResponse.json({ error: 'moodleUserId and name required' }, { status: 400 });
      // NG word check
      const ngHits = await checkNgWords(sb, name.trim());
      if (ngHits.length > 0) {
        return NextResponse.json({ error: `NGワードが含まれています: ${ngHits.map(w => w.word).join(', ')}` }, { status: 400 });
      }
      const { data: oldProfile } = await sb.from('profiles').select('name').eq('moodle_id', moodleUserId).maybeSingle();
      const { error } = await sb.from('profiles').update({ name: name.trim() }).eq('moodle_id', moodleUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'edit_profile', 'user', moodleUserId, { oldName: oldProfile?.name, newName: name.trim() });
      // Notify the user
      const notifText = `管理者によって表示名が「${name.trim()}」に変更されました`;
      await sb.from('notifications').insert({ moodle_user_id: moodleUserId, type: 'system', text: notifText });
      sendPushToUser(moodleUserId, { title: 'お知らせ', body: notifText }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // --- Circle management ---
    if (action === 'delete_circle') {
      const { circleId } = body;
      if (!circleId) return NextResponse.json({ error: 'circleId required' }, { status: 400 });
      // cascade deletes members, channels, messages, etc.
      const { error } = await sb.from('circles').delete().eq('id', circleId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_circle', 'circle', circleId);
      return NextResponse.json({ ok: true });
    }

    // --- Site settings ---
    if (action === 'update_site_setting') {
      const { key, value } = body;
      if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
      const { error } = await sb.from('site_settings').upsert({
        key, value: value || {}, updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'update_site_setting', 'setting', key, { value });
      return NextResponse.json({ ok: true });
    }

    // --- Reports ---
    if (action === 'resolve_report') {
      const { reportId, status, adminNote } = body;
      if (!reportId || !status) return NextResponse.json({ error: 'reportId and status required' }, { status: 400 });
      if (!['reviewed', 'resolved', 'dismissed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const { error } = await sb.from('reports').update({
        status, admin_note: adminNote || null,
        resolved_by: auth.userid, resolved_at: new Date().toISOString(),
      }).eq('id', reportId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'resolve_report', 'report', reportId, { status, adminNote });
      return NextResponse.json({ ok: true });
    }

    // --- Announcements ---
    if (action === 'create_announcement') {
      const { title, announcementBody, type } = body;
      if (!title?.trim() || !announcementBody?.trim()) {
        return NextResponse.json({ error: 'title and body required' }, { status: 400 });
      }
      const validTypes = ['info', 'maintenance', 'update', 'urgent'];
      const { data, error } = await sb.from('announcements').insert({
        title: title.trim(),
        body: announcementBody.trim(),
        type: validTypes.includes(type) ? type : 'info',
        created_by: auth.userid,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'create_announcement', 'announcement', data.id, { title });
      return NextResponse.json({ ok: true, announcement: data });
    }

    if (action === 'update_announcement') {
      const { announcementId, title, announcementBody, type, active } = body;
      if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });
      const updates = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title.trim();
      if (announcementBody !== undefined) updates.body = announcementBody.trim();
      if (type !== undefined) updates.type = type;
      if (active !== undefined) updates.active = active;
      const { error } = await sb.from('announcements').update(updates).eq('id', announcementId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'update_announcement', 'announcement', announcementId, updates);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_announcement') {
      const { announcementId } = body;
      if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });
      const { error } = await sb.from('announcements').delete().eq('id', announcementId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_announcement', 'announcement', announcementId);
      return NextResponse.json({ ok: true });
    }

    // --- NG words CRUD ---
    if (action === 'add_ng_word') {
      const { word, matchType, wordAction, category } = body;
      if (!word?.trim()) return NextResponse.json({ error: 'word required' }, { status: 400 });
      const { error } = await sb.from('ng_words').insert({
        word: word.trim(),
        match_type: matchType || 'contains',
        action: wordAction || 'block',
        category: category || 'general',
        added_by: auth.userid,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'add_ng_word', 'ng_word', word.trim());
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_ng_word') {
      const { wordId } = body;
      if (!wordId) return NextResponse.json({ error: 'wordId required' }, { status: 400 });
      const { data: w } = await sb.from('ng_words').select('word').eq('id', wordId).maybeSingle();
      const { error } = await sb.from('ng_words').delete().eq('id', wordId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_ng_word', 'ng_word', w?.word || wordId);
      return NextResponse.json({ ok: true });
    }

    // --- Circle owner transfer ---
    if (action === 'transfer_circle_owner') {
      const { circleId, newOwnerId } = body;
      if (!circleId || !newOwnerId) return NextResponse.json({ error: 'circleId and newOwnerId required' }, { status: 400 });
      // Verify user exists
      const { data: user } = await sb.from('profiles').select('moodle_id').eq('moodle_id', newOwnerId).maybeSingle();
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const { error } = await sb.from('circles').update({ owner_id: newOwnerId }).eq('id', circleId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Ensure new owner is a member
      await sb.from('circle_members').upsert({ circle_id: circleId, user_id: newOwnerId }, { onConflict: 'circle_id,user_id' });
      await auditLog(sb, auth.userid, 'transfer_circle_owner', 'circle', circleId, { newOwnerId });
      return NextResponse.json({ ok: true });
    }

    // --- Delete DM ---
    if (action === 'delete_dm') {
      const { messageId } = body;
      if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
      const { error } = await sb.from('dm_messages').delete().eq('id', messageId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_dm', 'dm', messageId);
      return NextResponse.json({ ok: true });
    }

    // --- Delete circle message ---
    if (action === 'delete_circle_message') {
      const { messageId } = body;
      if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
      const { error } = await sb.from('circle_messages').delete().eq('id', messageId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_circle_message', 'circle_message', messageId);
      return NextResponse.json({ ok: true });
    }

    // --- Telecom restriction toggle (電気通信事業の届出前制限) ---
    if (action === 'toggle_telecom_restriction') {
      const { enabled, message } = body;
      const { error } = await sb.from('site_settings').upsert({
        key: 'telecom_restriction',
        value: { enabled: !!enabled, message: message || '', updatedAt: new Date().toISOString() },
        updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, enabled ? 'enable_telecom_restriction' : 'disable_telecom_restriction', 'setting', 'telecom_restriction');
      return NextResponse.json({ ok: true });
    }

    // --- Maintenance mode toggle ---
    if (action === 'toggle_maintenance') {
      const { enabled, message } = body;
      const { error } = await sb.from('site_settings').upsert({
        key: 'maintenance_mode',
        value: { enabled: !!enabled, message: message || '', updatedAt: new Date().toISOString() },
        updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, enabled ? 'enable_maintenance' : 'disable_maintenance', 'setting', 'maintenance_mode');
      return NextResponse.json({ ok: true });
    }

    // --- Feature flag toggle ---
    if (action === 'toggle_feature') {
      const { feature, enabled } = body;
      if (!feature) return NextResponse.json({ error: 'feature required' }, { status: 400 });
      // Get current flags
      const { data: current } = await sb.from('site_settings').select('value').eq('key', 'feature_flags').maybeSingle();
      const flags = current?.value || {};
      flags[feature] = !!enabled;
      const { error } = await sb.from('site_settings').upsert({
        key: 'feature_flags', value: flags,
        updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'toggle_feature', 'setting', feature, { enabled });
      return NextResponse.json({ ok: true });
    }

    // --- Syllabus scrape (per department + year) ---
    if (action === 'scrape_syllabus') {
      const { dept, year } = body;
      if (!dept || !year) return NextResponse.json({ error: 'dept and year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'scrape_syllabus', 'syllabus', `${dept}_${year}`);
      try {
        const result = await fetchDeptSyllabus(dept, year);
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }

    // --- Bulk update profiles (dept/year) ---
    if (action === 'bulk_update_profiles') {
      const { field, oldValue, newValue } = body;
      if (!field || !newValue) return NextResponse.json({ error: 'field and newValue required' }, { status: 400 });
      if (!['dept', 'name'].includes(field)) return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
      let query = sb.from('profiles').update({ [field]: newValue });
      if (oldValue) query = query.eq(field, oldValue);
      const { error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'bulk_update_profiles', 'profiles', field, { oldValue, newValue, count });
      return NextResponse.json({ ok: true, count });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Admin POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/admin  { type: 'post'|'message'|'comment', id }
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
      await auditLog(sb, auth.userid, 'delete_post', 'post', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'message') {
      const { error } = await sb.from('messages').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_message', 'message', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'comment') {
      const { error } = await sb.from('comments').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_comment', 'comment', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'dm') {
      const { error } = await sb.from('dm_messages').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_dm', 'dm', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'circle_message') {
      const { error } = await sb.from('circle_messages').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'delete_circle_message', 'circle_message', id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    console.error('[Admin DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
