import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { sendPushToUser } from '../../../lib/push.js';
import { createNotification } from '../../../lib/notify.js';
import { broadcast, supportTicketTopic, supportUserTopic, supportAdminTopic } from '../../../lib/realtime.js';
import { getSyllabusFromDB, getSyllabusStats, fetchDeptSyllabus, getDeptList, getScrapeProgress, fetchDeptTextbooks, fetchDeptGrading, getGradingStats } from '../../../lib/api/syllabus-bulk.js';
import { fetchMedFacultySyllabus, getMedFacultyList, getMedScrapeProgress } from '../../../lib/api/syllabus-med.js';

export const maxDuration = 300;

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function isAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

// お知らせの遷移先ボタン: 許可するビューキー（campus-sns/announceLinks.js と同期）
const ANN_LINK_KEYS = ['exams', 'timetable', 'calendar', 'attendance', 'grades', 'tasks', 'events', 'train'];
// 受理: 許可キー→そのまま / null・''→null（ボタン解除） / それ以外→undefined（不正）
const normalizeAnnLink = (v) => {
  if (v === null || v === '') return null;
  if (typeof v === 'string' && ANN_LINK_KEYS.includes(v)) return v;
  return undefined;
};

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
      // H12: Log unauthorized admin access attempts
      try { const sb = getSupabaseAdmin(); await auditLog(sb, null, 'unauthorized_access', 'admin_api', auth.userid, { method: 'GET' }); } catch {}
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    console.log(`[Admin GET] action=${action}`);
    const sb = getSupabaseAdmin();

    if (action === 'stats') {
      const now = new Date();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [users, posts, messages, dms, reportsPending, reportsTotal, banned, dau, wau, mau, circles, supportPendingRes] = await Promise.all([
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
        sb.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
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
        supportPending: supportPendingRes.count || 0,
      });
    }

    if (action === 'users') {
      const page = parseInt(searchParams.get('page')) || 0;
      const search = searchParams.get('search') || '';
      const filter = searchParams.get('filter') || ''; // banned
      const sort = searchParams.get('sort') || ''; // '' = registration order, 'opens' = usage order
      const opensDays = Math.min(365, Math.max(1, parseInt(searchParams.get('opensDays')) || 30));
      const limit = 50;

      let data, count, opensByUser = {};

      if (sort === 'opens') {
        // 利用回数順: usage-analytics.sql の RPC で opens 降順に並べてページング。
        const { data: rows, error } = await sb.rpc('admin_users_by_opens', {
          p_days: opensDays, p_search: search, p_limit: limit, p_offset: page * limit,
        });
        if (error) {
          // RPC 未適用時は登録順にフォールバック（利用回数列は空）。
          console.warn('[Admin] admin_users_by_opens unavailable, falling back:', error.message);
        } else {
          data = rows || [];
          count = data.length ? Number(data[0].total_count) : 0;
          data.forEach(u => { opensByUser[u.moodle_id] = Number(u.opens); });
        }
      }

      if (!data) {
        // 登録順（既定）: profiles をそのまま引き、ページ分の opens を別途まとめて取得。
        let query = sb
          .from('profiles')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1);
        if (filter === 'banned') query = query.eq('banned', true);
        if (search) query = query.ilike('name', `%${search}%`);
        const res = await query;
        if (res.error) { console.error('[Admin]', res.error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
        data = res.data || [];
        count = res.count || 0;
        const ids = data.map(u => u.moodle_id).filter(v => v != null);
        if (ids.length) {
          const { data: op } = await sb.rpc('admin_opens_for_ids', { p_ids: ids, p_days: opensDays });
          (op || []).forEach(r => { opensByUser[r.moodle_id] = Number(r.opens); });
        }
      }

      // Determine ISCT auth status via user_tokens table
      const moodleIds = data.map(u => u.moodle_id);
      let isctSet = new Set();
      if (moodleIds.length > 0) {
        const { data: tokens } = await sb.from('user_tokens').select('moodle_user_id').in('moodle_user_id', moodleIds);
        isctSet = new Set((tokens || []).map(t => t.moodle_user_id));
      }

      const users = data.map(u => ({
        ...u,
        isct_verified: isctSet.has(u.moodle_id),
        portal_verified: !!u.student_id,
        opens: opensByUser[u.moodle_id] || 0,
      }));
      return NextResponse.json({ users, total: count || 0, page, opensDays });
    }

    // --- Active users on a specific day (who was active that day) ---
    if (action === 'active_users_on_day') {
      const day = searchParams.get('day') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: 'day (YYYY-MM-DD) required' }, { status: 400 });
      const { data, error } = await sb.rpc('admin_active_users_on_day', { p_day: day });
      if (error) return NextResponse.json({ day, users: [], unavailable: true });
      return NextResponse.json({
        day,
        users: (data || []).map(r => ({
          moodleId: r.moodle_id, name: r.name, opens: Number(r.opens),
          appOpens: Number(r.app_opens), lastAt: r.last_at,
        })),
      });
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ reports: data || [], total: count || 0, page });
    }

    if (action === 'support_tickets') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const status = searchParams.get('status') || '';
      const category = searchParams.get('category') || '';
      let query = sb
        .from('support_tickets')
        .select('*, user:profiles!support_tickets_user_id_fkey(name, avatar, color)', { count: 'exact' })
        .order('last_message_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (status) query = query.eq('status', status);
      if (category) query = query.eq('category', category);
      const { data, error, count } = await query;
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

      // admin unread = user messages newer than admin_last_read_at
      const tickets = await Promise.all((data || []).map(async t => {
        let unread = 0;
        if (t.last_sender_role === 'user' && (!t.admin_last_read_at || t.last_message_at > t.admin_last_read_at)) {
          const { count: c } = await sb.from('support_messages').select('*', { count: 'exact', head: true })
            .eq('ticket_id', t.id).eq('sender_role', 'user').gt('created_at', t.admin_last_read_at || '1970-01-01');
          unread = c || 0;
        }
        return { ...t, unread };
      }));
      return NextResponse.json({ tickets, total: count || 0, page });
    }

    if (action === 'support_thread') {
      const ticketId = searchParams.get('ticketId');
      if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });
      const { data: ticket } = await sb
        .from('support_tickets')
        .select('*, user:profiles!support_tickets_user_id_fkey(name, avatar, color)')
        .eq('id', ticketId).maybeSingle();
      if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const { data: messages } = await sb
        .from('support_messages').select('id, sender_role, sender_id, body, created_at')
        .eq('ticket_id', ticketId).order('created_at', { ascending: true });
      // mark read for admin
      await sb.from('support_tickets').update({ admin_last_read_at: new Date().toISOString() }).eq('id', ticketId);
      return NextResponse.json({ ticket, messages: messages || [] });
    }

    if (action === 'announcements') {
      const page = parseInt(searchParams.get('page')) || 0;
      const limit = 30;
      const { data, error, count } = await sb
        .from('announcements')
        .select('*, profiles(name, avatar, color)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      const [profile, posts, comments, reportsBy, reportsAgainst, dmCount, featRpc] = await Promise.all([
        sb.from('profiles').select('*').eq('moodle_id', uid).maybeSingle(),
        sb.from('posts').select('id, text, type, course_id, created_at', { count: 'exact' }).eq('moodle_user_id', uid).order('created_at', { ascending: false }).limit(20),
        sb.from('comments').select('id, text, post_id, created_at', { count: 'exact' }).eq('moodle_user_id', uid).order('created_at', { ascending: false }).limit(20),
        sb.from('reports').select('id, target_type, reason, status, created_at', { count: 'exact' }).eq('reporter_id', uid),
        sb.from('reports').select('id, target_type, reason, status, created_at', { count: 'exact' }).eq('target_user_id', uid),
        sb.from('dm_messages').select('*', { count: 'exact', head: true }).eq('sender_id', uid),
        sb.rpc('admin_user_feature_usage', { p_user: uid, p_days: 90 }),  // usage-analytics.sql; empty until applied
      ]);
      const featureUsage = (!featRpc.error && featRpc.data)
        ? featRpc.data.map(r => ({ feature: r.feature, opens: Number(r.opens), lastAt: r.last_at })) : [];
      return NextResponse.json({
        profile: profile.data,
        posts: posts.data || [], postsTotal: posts.count || 0,
        comments: comments.data || [], commentsTotal: comments.count || 0,
        reportsMade: reportsBy.data || [], reportsMadeTotal: reportsBy.count || 0,
        reportsReceived: reportsAgainst.data || [], reportsReceivedTotal: reportsAgainst.count || 0,
        dmsSent: dmCount.count || 0,
        featureUsage,
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
      const parsedUserId = parseInt(userId);
      if (userId && !isNaN(parsedUserId)) query = query.eq('sender_id', parsedUserId);
      const { data, error, count } = await query;
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ dms: data || [], total: count || 0, page });
    }

    // --- NG words list ---
    if (action === 'ng_words') {
      const { data, error } = await sb.from('ng_words').select('*').order('created_at', { ascending: false });
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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

    // --- User demographics analytics ---
    if (action === 'user_analytics') {
      const { data: profiles, error } = await sb
        .from('profiles')
        .select('dept, year_group, student_id, last_active_at, banned');
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

      const DEPT_TO_SCHOOL = {
        MTH:'science',PHY:'science',CHM:'science',EPS:'science',
        MEC:'engineering',SCE:'engineering',EEE:'engineering',ICT:'engineering',IEE:'engineering',
        MAT:'matsci',CAP:'matsci',
        MCS:'computing',CSC:'computing',
        LST:'lifesci',
        ARC:'envsoc',CVE:'envsoc',TSE:'envsoc',SHS:'envsoc',TIM:'envsoc',MOT:'envsoc',
        MED_M:'medicine',MED_N:'medicine',MED_T:'medicine',
        DEN_D:'dentistry',DEN_H:'dentistry',DEN_E:'dentistry',
      };
      const SCHOOL_NAMES = {
        science:'理学院',engineering:'工学院',matsci:'物質理工学院',
        computing:'情報理工学院',lifesci:'生命理工学院',envsoc:'環境・社会理工学院',
        medicine:'医学部',dentistry:'歯学部',
      };
      const DEPT_NAMES = {
        MTH:'数学系',PHY:'物理学系',CHM:'化学系',EPS:'地球惑星科学系',
        MEC:'機械系',SCE:'システム制御系',EEE:'電気電子系',ICT:'情報通信系',IEE:'経営工学系',
        MAT:'材料系',CAP:'応用化学系',
        MCS:'数理・計算科学系',CSC:'情報工学系',
        LST:'生命理工学系',
        ARC:'建築学系',CVE:'土木・環境工学系',TSE:'融合理工学系',SHS:'社会・人間科学系',TIM:'イノベーション科学系',MOT:'技術経営専門職学位課程',
        MED_M:'医学科',MED_N:'保健衛生学科 看護学',MED_T:'保健衛生学科 検査技術学',
        DEN_D:'歯学科',DEN_H:'口腔保健 衛生学',DEN_E:'口腔保健 工学',
      };
      const MED_SCHOOLS = new Set(['medicine','dentistry']);
      const SCHOOL_NUM_MAP = {'0':'science','1':'engineering','2':'matsci','3':'computing','4':'lifesci','5':'envsoc'};
      const MED_NEW_MAP = {'1':'medicine','2':'medicine','3':'medicine','5':'dentistry','6':'dentistry','7':'dentistry'};
      const MED_LEGACY = {'11':'medicine','21':'medicine','22':'medicine','31':'dentistry','32':'dentistry','39':'dentistry'};
      const MED_NEW_DEPT = {'1':'MED_M','2':'MED_N','3':'MED_T','5':'DEN_D','6':'DEN_H','7':'DEN_E'};
      const MED_LEGACY_DEPT = {'11':'MED_M','21':'MED_N','22':'MED_T','31':'DEN_D','32':'DEN_H','39':'DEN_E'};

      function inferFromStudentId(sid) {
        if (!sid) return { schoolKey: null, deptKey: null };
        const m = sid.match(/^(\d{2})([BMDR])(\d)(\d)?/i);
        if (m) {
          const sn = m[3], sub = m[4] || null;
          if (sn === '6' && sub) return { schoolKey: MED_NEW_MAP[sub] || null, deptKey: MED_NEW_DEPT[sub] || null };
          return { schoolKey: SCHOOL_NUM_MAP[sn] || null, deptKey: null };
        }
        const mL = sid.match(/^(\d{2})(\d{2})\d{4}$/);
        if (mL && MED_LEGACY[mL[1]]) return { schoolKey: MED_LEGACY[mL[1]], deptKey: MED_LEGACY_DEPT[mL[1]] || null };
        return { schoolKey: null, deptKey: null };
      }

      const byYearGroup = {}, bySchool = {}, byDept = {}, byDegree = {};
      const byCampus = { science_eng: 0, med_dental: 0, unknown: 0 };
      let withDept = 0, withStudentId = 0;

      for (const p of profiles || []) {
        // Year group (e.g. "21B", "23M") & degree
        const yg = p.year_group || null;
        const degree = yg?.match(/[BMDR]/i)?.[0]?.toUpperCase() || null;
        if (yg) {
          byYearGroup[yg] = (byYearGroup[yg] || 0) + 1;
          if (degree) byDegree[degree] = (byDegree[degree] || 0) + 1;
        } else {
          byYearGroup['不明'] = (byYearGroup['不明'] || 0) + 1;
        }

        // School & dept — prefer profile.dept, fallback to student_id inference
        let schoolKey = p.dept ? DEPT_TO_SCHOOL[p.dept] : null;
        let deptKey = p.dept || null;
        if (!schoolKey) {
          const inferred = inferFromStudentId(p.student_id);
          schoolKey = inferred.schoolKey;
          if (!deptKey) deptKey = inferred.deptKey;
        }
        if (p.dept) withDept++;
        if (p.student_id) withStudentId++;
        if (deptKey) byDept[deptKey] = (byDept[deptKey] || 0) + 1;
        if (schoolKey) {
          bySchool[schoolKey] = (bySchool[schoolKey] || 0) + 1;
          byCampus[MED_SCHOOLS.has(schoolKey) ? 'med_dental' : 'science_eng']++;
        } else {
          byCampus.unknown++;
        }
      }

      return NextResponse.json({
        total: (profiles || []).length, withDept, withStudentId,
        byYearGroup, bySchool, byDept, byCampus, byDegree,
        schoolNames: SCHOOL_NAMES, deptNames: DEPT_NAMES, deptToSchool: DEPT_TO_SCHOOL,
      });
    }

    // --- Exam schedules ---
    if (action === 'exams') {
      const year = searchParams.get('year') || '';
      const quarter = searchParams.get('quarter') || '';
      let query = sb.from('exam_schedules').select('*').order('date').order('period');
      if (year) query = query.eq('year', year);
      if (quarter) query = query.eq('quarter', quarter);
      const { data, error } = await query;
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ exams: data || [], total: (data || []).length });
    }

    // --- Syllabus scrape progress ---
    if (action === 'scrape_progress') {
      const key = searchParams.get('key') || '';
      const progress = getScrapeProgress(key);
      return NextResponse.json({ progress });
    }

    // --- Textbook normalize/enrich progress ---
    if (action === 'normalize_progress') {
      const key = searchParams.get('key') || '';
      const { getNormalizeProgress } = await import('../../../lib/textbooks/normalize.js');
      return NextResponse.json({ progress: getNormalizeProgress(key) });
    }
    if (action === 'enrich_progress') {
      const key = searchParams.get('key') || '';
      const { getEnrichProgress } = await import('../../../lib/textbooks/enrich.js');
      return NextResponse.json({ progress: getEnrichProgress(key) });
    }

    // --- Syllabus / timetable data ---
    if (action === 'syllabus') {
      const dept = searchParams.get('dept') || '';
      const year = searchParams.get('year') || '';
      const quarter = searchParams.get('quarter') || '';
      const day = searchParams.get('day') || '';
      const search = searchParams.get('search') || '';
      console.log(`[Admin syllabus] query: dept=${dept} year=${year} quarter=${quarter} day=${day} search=${search}`);
      const [courses, stats, gradingStatsResult, lookupSetting] = await Promise.all([
        getSyllabusFromDB({ dept, year, quarter, day, search }),
        getSyllabusStats(),
        getGradingStats(),
        sb.from('site_settings').select('value').eq('key', 'syllabus_db_lookup').maybeSingle(),
      ]);
      const deptList = getDeptList();
      console.log(`[Admin syllabus] result: ${courses.length} courses, ${Object.keys(stats).length} stat entries, years=${deptList.years}`);
      const dbLookupEnabled = lookupSetting?.data?.value?.enabled !== false;
      return NextResponse.json({
        courses, stats, dbLookupEnabled,
        gradingStats: gradingStatsResult.stats,
        gradingTotals: gradingStatsResult.totals,
        gradingTableExists: gradingStatsResult.tableExists,
        gradingTableError: gradingStatsResult.error,
        ...deptList,
      });
    }

    // --- Textbooks list (course_textbooks_raw) ---
    if (action === 'textbooks') {
      const dept = searchParams.get('dept') || '';
      const year = searchParams.get('year') || '';
      const faculty = searchParams.get('faculty') || '';
      const kind = searchParams.get('kind') || '';
      const search = searchParams.get('search') || '';

      let query = sb.from('course_textbooks_raw').select('*')
        .order('course_code').order('kind');
      if (year) query = query.eq('syllabus_year', year);
      if (faculty) query = query.eq('faculty', faculty);
      if (kind) query = query.eq('kind', kind);
      if (dept) {
        // course_code like "MEC.C201" or "MEC.C201:14-RW" — match by prefix
        const safeDept = dept.replace(/[%_,]/g, '');
        if (safeDept) query = query.ilike('course_code', `${safeDept}.%`);
      }
      if (search) {
        const safe = search.slice(0, 100).replace(/[,%()]/g, '');
        if (safe) query = query.or(`course_code.ilike.%${safe}%,raw_text.ilike.%${safe}%`);
      }

      const PAGE = 1000;
      let rows = [];
      let from = 0;
      while (true) {
        const { data, error } = await query.range(from, from + PAGE - 1);
        if (error) {
          console.error('[Admin textbooks]', error.message);
          return NextResponse.json({ error: 'Internal error' }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Attach split preview (Stage A normalization preview)
      const { splitTextbookLines } = await import('../../../lib/textbooks/split.js');
      const totals = { book: 0, noise: 0, annotation: 0 };
      for (const r of rows) {
        r.lines = splitTextbookLines(r.raw_text || '');
        for (const l of r.lines) totals[l.kind]++;
      }
      return NextResponse.json({ rows, total: rows.length, lineTotals: totals });
    }

    // --- Grading list (course_grading) ---
    if (action === 'grading') {
      const dept = searchParams.get('dept') || '';
      const year = searchParams.get('year') || '';
      const faculty = searchParams.get('faculty') || '';
      const onlyParsed = searchParams.get('only_parsed') === '1';
      const search = searchParams.get('search') || '';

      let query = sb.from('course_grading').select('*')
        .order('course_code');
      if (year) query = query.eq('syllabus_year', year);
      if (faculty) query = query.eq('faculty', faculty);
      if (onlyParsed) query = query.eq('has_breakdown', true);
      if (dept) {
        const safeDept = dept.replace(/[%_,]/g, '');
        if (safeDept) query = query.ilike('course_code', `${safeDept}.%`);
      }
      if (search) {
        const safe = search.slice(0, 100).replace(/[,%()]/g, '');
        if (safe) query = query.or(`course_code.ilike.%${safe}%,raw_text.ilike.%${safe}%`);
      }

      const PAGE = 1000;
      let rows = [];
      let from = 0;
      while (true) {
        const { data, error } = await query.range(from, from + PAGE - 1);
        if (error) {
          console.error('[Admin grading]', error.message);
          return NextResponse.json({ error: 'Internal error' }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // 集計
      const counts = { total: rows.length, parsed: 0, raw_only: 0 };
      const categoryTotals = {};
      for (const r of rows) {
        if (r.has_breakdown) {
          counts.parsed++;
          for (const item of (r.breakdown || [])) {
            categoryTotals[item.category] = (categoryTotals[item.category] || 0) + 1;
          }
        } else {
          counts.raw_only++;
        }
      }
      return NextResponse.json({ rows, total: rows.length, counts, categoryTotals });
    }

    // --- Books list (Stage B normalized canonical book table) ---
    if (action === 'books') {
      const dept = searchParams.get('dept') || '';
      const year = searchParams.get('year') || '';
      const faculty = searchParams.get('faculty') || '';
      const confidence = searchParams.get('confidence') || '';
      const statusFilter = searchParams.get('status') || '';
      const search = searchParams.get('search') || '';
      const onlyOrphan = searchParams.get('only_orphan') === '1';

      // Pull course_books joined with books for the filter
      let q = sb.from('course_books')
        .select('id, course_code, syllabus_year, faculty, kind, book_id, raw_line, confidence, status, note, books:book_id (id, isbn13, title, author, publisher, published_year, cover_url, source)')
        .order('course_code').order('kind');
      if (year) q = q.eq('syllabus_year', year);
      if (faculty) q = q.eq('faculty', faculty);
      if (confidence) q = q.eq('confidence', confidence);
      if (statusFilter) q = q.eq('status', statusFilter);
      if (onlyOrphan) q = q.is('book_id', null);
      if (dept) {
        const safe = dept.replace(/[%_,]/g, '');
        if (safe) q = q.ilike('course_code', `${safe}.%`);
      }
      if (search) {
        const safe = search.slice(0, 100).replace(/[,%()]/g, '');
        if (safe) q = q.or(`course_code.ilike.%${safe}%,raw_line.ilike.%${safe}%`);
      }

      const PAGE = 1000;
      let rows = [];
      let from = 0;
      while (true) {
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          console.error('[Admin books]', error.message);
          return NextResponse.json({ error: 'Internal error' }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // Summary counts
      const counts = { high: 0, medium: 0, low: 0, none: 0 };
      for (const r of rows) counts[r.confidence] = (counts[r.confidence] || 0) + 1;
      return NextResponse.json({ rows, total: rows.length, counts });
    }

    // --- Guest analytics: overview stats ---
    if (action === 'guest_stats') {
      const now = new Date();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [total, today, week, month, freshman, navi, reg, converted,
             todayFreshman, todayNavi, todayReg] = await Promise.all([
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'freshman'),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'navi'),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'reg'),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('converted', true),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'freshman').gte('created_at', dayAgo),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'navi').gte('created_at', dayAgo),
        sb.from('guest_sessions').select('*', { count: 'exact', head: true }).eq('mode', 'reg').gte('created_at', dayAgo),
      ]);

      return NextResponse.json({
        total: total.count || 0,
        today: today.count || 0,
        week: week.count || 0,
        month: month.count || 0,
        byMode: {
          freshman: freshman.count || 0,
          navi: navi.count || 0,
          reg: reg.count || 0,
        },
        todayByMode: {
          freshman: todayFreshman.count || 0,
          navi: todayNavi.count || 0,
          reg: todayReg.count || 0,
        },
        converted: converted.count || 0,
        conversionRate: total.count ? ((converted.count || 0) / total.count * 100).toFixed(1) : '0.0',
      });
    }

    // --- Guest analytics: daily trends (30 days) ---
    if (action === 'guest_trends') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb.from('guest_sessions').select('mode, created_at').gte('created_at', since);
      const byDay = {};
      const byModeDay = { freshman: {}, navi: {}, reg: {} };
      (data || []).forEach(r => {
        const day = r.created_at?.slice(0, 10);
        if (!day) return;
        byDay[day] = (byDay[day] || 0) + 1;
        if (byModeDay[r.mode]) byModeDay[r.mode][day] = (byModeDay[r.mode][day] || 0) + 1;
      });
      return NextResponse.json({ trends: byDay, byMode: byModeDay });
    }

    // --- Guest analytics: session list (paginated) ---
    if (action === 'guest_sessions') {
      const page = parseInt(searchParams.get('page')) || 0;
      const mode = searchParams.get('mode') || '';
      const limit = 50;
      let query = sb.from('guest_sessions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (mode) query = query.eq('mode', mode);
      const { data, error, count } = await query;
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ sessions: data || [], total: count || 0, page });
    }

    // --- Growth & activity analytics (time-series for the Analytics tab) ---
    if (action === 'analytics') {
      const range = Math.min(365, Math.max(7, parseInt(searchParams.get('range')) || 90));
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Live snapshot (DAU/WAU/MAU + total) — cheap count(head) queries.
      // uRpc/fRpc come from usage-analytics.sql (usage_events); absent until applied.
      const [totalUsers, dau, wau, mau, gRpc, aRpc, uRpc, fRpc] = await Promise.all([
        sb.from('profiles').select('*', { count: 'exact', head: true }),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', dayAgo),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', weekAgo),
        sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', monthAgo),
        sb.rpc('admin_growth_daily', { p_days: range }),
        sb.rpc('admin_activity_daily', { p_days: range }),
        sb.rpc('admin_usage_daily', { p_days: range }),
        sb.rpc('admin_feature_usage', { p_days: range }),
      ]);

      // Most active users (top 20 by opens in the period). Reuses admin_users_by_opens.
      const tRpc = await sb.rpc('admin_users_by_opens', { p_days: range, p_search: '', p_limit: 20, p_offset: 0 });
      const topUsers = (!tRpc.error && tRpc.data)
        ? tRpc.data.filter(r => Number(r.opens) > 0).map(r => ({
            moodleId: r.moodle_id, name: r.name, dept: r.dept, opens: Number(r.opens),
          }))
        : [];

      // Usage (screen-open) time-series + feature ranking. Empty if the SQL
      // isn't applied yet — the UI just hides those charts (no JS fallback:
      // there's no raw source to aggregate from other than usage_events).
      const usage = (!uRpc.error && uRpc.data)
        ? uRpc.data.map(r => ({
            day: r.day, activeUsers: Number(r.active_users), opens: Number(r.opens),
            opensPerUser: Number(r.opens_per_user), appOpens: Number(r.app_opens), resumes: Number(r.resumes),
          }))
        : [];
      const features = (!fRpc.error && fRpc.data)
        ? fRpc.data.map(r => ({ feature: r.feature, opens: Number(r.opens), users: Number(r.users) }))
        : [];

      let growth, activity, source = 'rpc';
      if (!gRpc.error && !aRpc.error && gRpc.data && aRpc.data) {
        growth = gRpc.data.map(r => ({ day: r.day, new: Number(r.new_users), cumulative: Number(r.cumulative) }));
        activity = aRpc.data.map(r => ({
          day: r.day, active: Number(r.active_users), posts: Number(r.posts),
          comments: Number(r.comments), messages: Number(r.messages), dms: Number(r.dms),
        }));
      } else {
        // Fallback: analytics.sql not applied yet — aggregate in JS (heavier).
        source = 'fallback';
        const tokyoDay = (iso) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const todayTokyo = tokyoDay(new Date(now).toISOString());
        const startMs = new Date(`${todayTokyo}T00:00:00+09:00`).getTime() - (range - 1) * 24 * 60 * 60 * 1000;
        const startDay = tokyoDay(new Date(startMs).toISOString());
        const startISO = new Date(startMs).toISOString();
        const days = [];
        for (let i = 0; i < range; i++) days.push(tokyoDay(new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString()));

        const pageAll = async (table, cols) => {
          const PAGE = 1000; let rows = [], from = 0;
          while (true) {
            const { data, error } = await sb.from(table).select(cols).gte('created_at', startISO)
              .order('created_at', { ascending: true }).range(from, from + PAGE - 1);
            if (error || !data?.length) break;
            rows = rows.concat(data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          return rows;
        };

        const [profRows, postRows, commentRows, msgRows, dmRows] = await Promise.all([
          pageAll('profiles', 'created_at'),
          pageAll('posts', 'moodle_user_id, created_at'),
          pageAll('comments', 'moodle_user_id, created_at'),
          pageAll('messages', 'moodle_user_id, created_at'),
          pageAll('dm_messages', 'sender_id, created_at'),
        ]);

        const newByDay = {};
        profRows.forEach(r => { const d = tokyoDay(r.created_at); if (d >= startDay) newByDay[d] = (newByDay[d] || 0) + 1; });
        const baseline = (totalUsers.count || 0) - profRows.filter(r => tokyoDay(r.created_at) >= startDay).length;
        let cum = baseline;
        growth = days.map(d => { cum += (newByDay[d] || 0); return { day: d, new: newByDay[d] || 0, cumulative: cum }; });

        const act = {};
        days.forEach(d => { act[d] = { active: new Set(), posts: 0, comments: 0, messages: 0, dms: 0 }; });
        const tally = (rows, idCol, kind) => rows.forEach(r => {
          const d = tokyoDay(r.created_at); if (!act[d]) return;
          act[d][kind]++; if (r[idCol] != null) act[d].active.add(r[idCol]);
        });
        tally(postRows, 'moodle_user_id', 'posts');
        tally(commentRows, 'moodle_user_id', 'comments');
        tally(msgRows, 'moodle_user_id', 'messages');
        tally(dmRows, 'sender_id', 'dms');
        activity = days.map(d => ({ day: d, active: act[d].active.size, posts: act[d].posts, comments: act[d].comments, messages: act[d].messages, dms: act[d].dms }));
      }

      return NextResponse.json({
        range, source,
        snapshot: { total: totalUsers.count || 0, dau: dau.count || 0, wau: wau.count || 0, mau: mau.count || 0 },
        growth, activity, usage, features, topUsers,
      });
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
      // H12: Log unauthorized admin access attempts
      try { const sb = getSupabaseAdmin(); await auditLog(sb, null, 'unauthorized_access', 'admin_api', auth.userid, { method: 'POST' }); } catch {}
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'ban_user', 'user', moodleUserId, { reason });
      return NextResponse.json({ ok: true });
    }

    if (action === 'unban_user') {
      const { moodleUserId } = body;
      if (!moodleUserId) return NextResponse.json({ error: 'moodleUserId required' }, { status: 400 });
      const { error } = await sb.from('profiles').update({
        banned: false, banned_at: null, ban_reason: null,
      }).eq('moodle_id', moodleUserId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'resolve_report', 'report', reportId, { status, adminNote });
      return NextResponse.json({ ok: true });
    }

    // --- Support chat (運営チャット) ---
    if (action === 'support_reply') {
      const { ticketId, body: text } = body;
      if (!ticketId || !text?.trim()) return NextResponse.json({ error: 'ticketId and body required' }, { status: 400 });
      const { data: ticket } = await sb.from('support_tickets').select('id, user_id, status').eq('id', ticketId).maybeSingle();
      if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const nowIso = new Date().toISOString();
      await sb.from('support_messages').insert({
        ticket_id: ticketId, sender_role: 'admin', sender_id: auth.userid, body: text.trim().slice(0, 4000),
      });
      await sb.from('support_tickets').update({
        last_message_at: nowIso, last_sender_role: 'admin', admin_last_read_at: nowIso,
        ...(ticket.status === 'open' ? { status: 'in_progress' } : {}),
      }).eq('id', ticketId);
      await auditLog(sb, auth.userid, 'support_reply', 'support_ticket', ticketId);
      broadcast([supportTicketTopic(ticketId), supportUserTopic(ticket.user_id), supportAdminTopic()], 'new');
      createNotification({
        userId: ticket.user_id, type: 'support',
        text: `運営からお問い合わせに返信がありました`,
        pushTitle: 'お問い合わせ', url: '/?support=' + ticketId,
        tag: 'support-' + ticketId,
      }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (action === 'support_status') {
      const { ticketId, status } = body;
      if (!ticketId || !status) return NextResponse.json({ error: 'ticketId and status required' }, { status: 400 });
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const { data: ticket } = await sb.from('support_tickets').select('user_id').eq('id', ticketId).maybeSingle();
      if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const updates = { status };
      if (status === 'resolved' || status === 'closed') { updates.resolved_by = auth.userid; updates.resolved_at = new Date().toISOString(); }
      else { updates.resolved_by = null; updates.resolved_at = null; }
      const { error } = await sb.from('support_tickets').update(updates).eq('id', ticketId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'support_status', 'support_ticket', ticketId, { status });
      broadcast([supportTicketTopic(ticketId), supportUserTopic(ticket.user_id), supportAdminTopic()], 'new');
      return NextResponse.json({ ok: true });
    }

    // --- Announcements ---
    // 添付画像の署名アップロードURLを発行（クライアントが直接 announcement-assets バケットへPUTする）
    if (action === 'sign_announcement_image') {
      const { name, type: fileType, size } = body;
      if (fileType && !String(fileType).startsWith('image/')) {
        return NextResponse.json({ error: '画像ファイルを選択してください' }, { status: 400 });
      }
      if (size && Number(size) > 5 * 1024 * 1024) {
        return NextResponse.json({ error: '画像が大きすぎます（最大5MB）' }, { status: 400 });
      }
      // Storageキーは ASCII安全な文字のみ（日本語等は InvalidKey になる）
      const rawName = (name || 'image').toString();
      const dot = rawName.lastIndexOf('.');
      const ext = dot > 0 ? rawName.slice(dot).replace(/[^A-Za-z0-9.]/g, '') : '';
      const base = (dot > 0 ? rawName.slice(0, dot) : rawName).replace(/[^A-Za-z0-9._-]/g, '_') || 'image';
      const path = `announcements/${Date.now()}_${base}${ext}`;
      const { data, error } = await sb.storage.from('announcement-assets').createSignedUploadUrl(path);
      if (error) { console.error('[Admin] sign announcement image:', error.message); return NextResponse.json({ error: 'sign failed' }, { status: 500 }); }
      return NextResponse.json({ path, token: data.token, bucket: 'announcement-assets' });
    }

    if (action === 'create_announcement') {
      const { title, announcementBody, type, popup, imagePath, link } = body;
      const cleanLink = normalizeAnnLink(link);
      if (cleanLink === undefined) return NextResponse.json({ error: 'invalid link' }, { status: 400 });
      const cleanTitle = title?.trim() || null;
      const cleanBody = announcementBody?.trim() || null;
      // imagePath（announcements/ 配下のみ受理）→ 安定した公開URLを保存
      let image_url = null;
      if (imagePath) {
        if (typeof imagePath !== 'string' || !imagePath.startsWith('announcements/')) {
          return NextResponse.json({ error: 'invalid image path' }, { status: 400 });
        }
        const { data: pub } = sb.storage.from('announcement-assets').getPublicUrl(imagePath);
        image_url = pub?.publicUrl || null;
      }
      if (!cleanTitle && !cleanBody && !image_url) {
        return NextResponse.json({ error: 'title, body, or image required' }, { status: 400 });
      }
      const validTypes = ['info', 'maintenance', 'update', 'urgent'];
      const { data, error } = await sb.from('announcements').insert({
        title: cleanTitle,
        body: cleanBody,
        type: validTypes.includes(type) ? type : 'info',
        popup: !!popup,
        image_url,
        link: cleanLink,
        created_by: auth.userid,
      }).select().single();
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'create_announcement', 'announcement', data.id, { title: cleanTitle });
      return NextResponse.json({ ok: true, announcement: data });
    }

    if (action === 'update_announcement') {
      const { announcementId, title, announcementBody, type, active, popup, imagePath, link } = body;
      if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });
      const updates = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title?.trim() || null;
      if (announcementBody !== undefined) updates.body = announcementBody?.trim() || null;
      if (type !== undefined) updates.type = type;
      if (active !== undefined) updates.active = active;
      if (popup !== undefined) updates.popup = !!popup;
      if (link !== undefined) {
        const cleanLink = normalizeAnnLink(link);
        if (cleanLink === undefined) return NextResponse.json({ error: 'invalid link' }, { status: 400 });
        updates.link = cleanLink;
      }
      // imagePath: null/'' で画像解除、announcements/ 配下の新パスで差し替え
      if (imagePath !== undefined) {
        if (!imagePath) {
          updates.image_url = null;
        } else if (typeof imagePath === 'string' && imagePath.startsWith('announcements/')) {
          const { data: pub } = sb.storage.from('announcement-assets').getPublicUrl(imagePath);
          updates.image_url = pub?.publicUrl || null;
        } else {
          return NextResponse.json({ error: 'invalid image path' }, { status: 400 });
        }
      }
      const { error } = await sb.from('announcements').update(updates).eq('id', announcementId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'update_announcement', 'announcement', announcementId, updates);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_announcement') {
      const { announcementId } = body;
      if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });
      const { error } = await sb.from('announcements').delete().eq('id', announcementId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_announcement', 'announcement', announcementId);
      return NextResponse.json({ ok: true });
    }

    // --- NG words CRUD ---
    if (action === 'add_ng_word') {
      const { word, matchType, wordAction, category } = body;
      if (!word?.trim()) return NextResponse.json({ error: 'word required' }, { status: 400 });
      // Validate regex patterns to prevent ReDoS
      if (matchType === 'regex') {
        try { new RegExp(word.trim()); } catch { return NextResponse.json({ error: 'Invalid regex pattern' }, { status: 400 }); }
      }
      const { error } = await sb.from('ng_words').insert({
        word: word.trim(),
        match_type: matchType || 'contains',
        action: wordAction || 'block',
        category: category || 'general',
        added_by: auth.userid,
      });
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'add_ng_word', 'ng_word', word.trim());
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_ng_word') {
      const { wordId } = body;
      if (!wordId) return NextResponse.json({ error: 'wordId required' }, { status: 400 });
      const { data: w } = await sb.from('ng_words').select('word').eq('id', wordId).maybeSingle();
      const { error } = await sb.from('ng_words').delete().eq('id', wordId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_dm', 'dm', messageId);
      return NextResponse.json({ ok: true });
    }

    // --- Delete circle message ---
    if (action === 'delete_circle_message') {
      const { messageId } = body;
      if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
      const { error } = await sb.from('circle_messages').delete().eq('id', messageId);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_circle_message', 'circle_message', messageId);
      return NextResponse.json({ ok: true });
    }

    // --- Communication features kill switch (通信媒介機能の一括制限トグル) ---
    if (action === 'toggle_telecom_restriction') {
      const { enabled, message } = body;
      const { error } = await sb.from('site_settings').upsert({
        key: 'telecom_restriction',
        value: { enabled: !!enabled, message: message || '', updatedAt: new Date().toISOString() },
        updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'toggle_feature', 'setting', feature, { enabled });
      return NextResponse.json({ ok: true });
    }

    // --- Registration limit toggle (新規登録人数制限) ---
    if (action === 'toggle_registration_limit') {
      const { enabled, maxUsers, message } = body;
      const max = Math.max(0, parseInt(maxUsers) || 0);
      const { error } = await sb.from('site_settings').upsert({
        key: 'registration_limit',
        value: { enabled: !!enabled, maxUsers: max, message: message || '', updatedAt: new Date().toISOString() },
        updated_by: auth.userid, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, enabled ? 'enable_registration_limit' : 'disable_registration_limit', 'setting', 'registration_limit', { maxUsers: max });
      return NextResponse.json({ ok: true });
    }

    // --- Clear syllabus schedule cache ---
    if (action === 'clear_schedule_cache') {
      const { clearScheduleCache } = await import('../../../lib/api/syllabus-scraper.js');
      clearScheduleCache();
      await auditLog(sb, auth.userid, 'clear_schedule_cache', 'syllabus', '');
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
        console.error(`[Admin] scrape_syllabus ${dept}_${year} failed:`, e);
        return NextResponse.json({ error: 'Scrape failed' }, { status: 500 });
      }
    }

    // --- Stage D: Update a course_books row's status (and optionally book_id) ---
    if (action === 'update_course_book') {
      const { id, status, book_id, note } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      if (status && !['pending', 'confirmed', 'rejected', 'not_a_book'].includes(status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      const patch = { updated_at: new Date().toISOString() };
      if (status !== undefined) patch.status = status;
      if (book_id !== undefined) patch.book_id = book_id;
      if (note !== undefined) patch.note = note;
      const { data, error } = await sb.from('course_books').update(patch).eq('id', id).select('id').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'update_course_book', 'textbooks', `id=${id} status=${status}`);
      return NextResponse.json({ ok: true, id: data?.id });
    }

    // --- Stage D: Manual ISBN entry → lookup openBD/GBooks → upsert book → link ---
    if (action === 'manual_link_isbn') {
      const { course_book_id, isbn } = body;
      if (!course_book_id || !isbn) return NextResponse.json({ error: 'course_book_id and isbn required' }, { status: 400 });
      const { extractIsbns } = await import('../../../lib/textbooks/isbn.js');
      const validIsbns = extractIsbns(isbn);
      if (validIsbns.length === 0) {
        return NextResponse.json({ error: 'Invalid ISBN format/checksum' }, { status: 400 });
      }
      const isbn13 = validIsbns[0];

      // Lookup openBD first
      const { lookupIsbns } = await import('../../../lib/textbooks/openbd.js');
      const openbdMap = await lookupIsbns([isbn13]);
      let bookData = openbdMap.get(isbn13);
      let source = 'openbd';

      // Fallback to Google Books
      if (!bookData) {
        try {
          const { searchGoogleBooks } = await import('../../../lib/textbooks/googlebooks.js');
          const gbResults = await searchGoogleBooks(`isbn:${isbn13}`, { maxResults: 1 });
          if (gbResults[0] && gbResults[0].isbn13 === isbn13) {
            bookData = {
              isbn13,
              title: gbResults[0].title || '(タイトル不明)',
              author: gbResults[0].author,
              publisher: gbResults[0].publisher,
              published_year: gbResults[0].published_year,
              cover_url: gbResults[0].cover_url,
              source_data: gbResults[0].source_data,
            };
            source = 'google_books';
          }
        } catch {}
      }

      if (!bookData) {
        return NextResponse.json({
          error: 'ISBN not found in openBD or Google Books. Use manual_create_book to enter metadata.',
          isbn13,
        }, { status: 404 });
      }

      // Upsert into books
      const { data: bookRow, error: upsertErr } = await sb.from('books').upsert({
        isbn13,
        title: bookData.title || '(タイトル不明)',
        author: bookData.author || null,
        publisher: bookData.publisher || null,
        published_year: bookData.published_year || null,
        cover_url: bookData.cover_url || null,
        source,
        source_data: bookData.source_data || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'isbn13' }).select('id').single();
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      // Link course_books
      const { error: linkErr } = await sb.from('course_books').update({
        book_id: bookRow.id,
        confidence: 'high',
        status: 'confirmed',
        note: `manually linked via ${source}`,
        updated_at: new Date().toISOString(),
      }).eq('id', course_book_id);
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

      await auditLog(sb, auth.userid, 'manual_link_isbn', 'textbooks', `cb=${course_book_id} isbn=${isbn13}`);
      return NextResponse.json({ ok: true, book_id: bookRow.id, source, title: bookData.title });
    }

    // --- Stage D: Manually create a book entry (no ISBN lookup) and link ---
    if (action === 'manual_create_book') {
      const { course_book_id, title, author, publisher, published_year, isbn13 } = body;
      if (!course_book_id || !title) return NextResponse.json({ error: 'course_book_id and title required' }, { status: 400 });
      const row = {
        isbn13: isbn13 || null,
        title,
        author: author || null,
        publisher: publisher || null,
        published_year: published_year || null,
        source: 'manual',
        updated_at: new Date().toISOString(),
      };
      const upsertQ = isbn13
        ? sb.from('books').upsert(row, { onConflict: 'isbn13' }).select('id').single()
        : sb.from('books').insert(row).select('id').single();
      const { data: bookRow, error: upsertErr } = await upsertQ;
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      const { error: linkErr } = await sb.from('course_books').update({
        book_id: bookRow.id,
        confidence: 'high',
        status: 'confirmed',
        note: 'manually entered',
        updated_at: new Date().toISOString(),
      }).eq('id', course_book_id);
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'manual_create_book', 'textbooks', `cb=${course_book_id}`);
      return NextResponse.json({ ok: true, book_id: bookRow.id });
    }

    // --- Re-cleanup course_books (re-apply splitter noise filters without losing matches) ---
    if (action === 'recleanup_course_books') {
      const { dept, year, faculty } = body;
      if (!year) return NextResponse.json({ error: 'year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'recleanup_course_books', 'textbooks', `${dept || 'all'}_${year}_${faculty || 'isct'}`);
      try {
        const { splitTextbookLines } = await import('../../../lib/textbooks/split.js');
        // Fetch all course_books in scope (paginated)
        const PAGE = 1000;
        const all = [];
        for (let from = 0; ; from += PAGE) {
          let q = sb.from('course_books').select('id, raw_line, book_id, status')
            .eq('syllabus_year', year).order('id').range(from, from + PAGE - 1);
          if (faculty) q = q.eq('faculty', faculty);
          if (dept) {
            const safe = dept.replace(/[%_,]/g, '');
            if (safe) q = q.ilike('course_code', `${safe}.%`);
          }
          const { data, error } = await q;
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < PAGE) break;
        }
        // Re-classify each line and find ones now classified as non-book
        const toDelete = [];
        for (const r of all) {
          // Skip rows already confirmed/rejected manually so we don't lose human work
          if (r.status === 'confirmed' || r.status === 'rejected' || r.status === 'not_a_book') continue;
          const lines = splitTextbookLines(r.raw_line || '');
          const firstKind = lines[0]?.kind;
          if (firstKind && firstKind !== 'book') {
            toDelete.push(r.id);
          }
        }
        // Batch delete
        let deleted = 0;
        const DEL_BATCH = 500;
        for (let i = 0; i < toDelete.length; i += DEL_BATCH) {
          const ids = toDelete.slice(i, i + DEL_BATCH);
          const { error, count } = await sb.from('course_books').delete({ count: 'exact' }).in('id', ids);
          if (error) console.error('[Recleanup] delete batch:', error.message);
          else deleted += count || ids.length;
        }
        return NextResponse.json({ ok: true, scanned: all.length, deleted });
      } catch (e) {
        console.error('[Admin] recleanup failed:', e);
        return NextResponse.json({ error: e.message || 'Recleanup failed' }, { status: 500 });
      }
    }

    // --- Enrich textbooks (Stage C: NDL/Google Books name search) ---
    if (action === 'enrich_textbooks') {
      const { dept, year, faculty, useGoogleBooks } = body;
      if (!year) return NextResponse.json({ error: 'year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'enrich_textbooks', 'textbooks', `${dept || 'all'}_${year}_${faculty || 'isct'}`);
      try {
        const { enrichTextbooks } = await import('../../../lib/textbooks/enrich.js');
        const result = await enrichTextbooks({ year, dept, faculty, useGoogleBooks });
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error('[Admin] enrich_textbooks failed:', e);
        return NextResponse.json({ error: e.message || 'Enrich failed' }, { status: 500 });
      }
    }

    // --- Normalize textbooks (Stage B: ISBN extract + openBD) ---
    if (action === 'normalize_textbooks') {
      const { dept, year, faculty } = body;
      if (!year) return NextResponse.json({ error: 'year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'normalize_textbooks', 'textbooks', `${dept || 'all'}_${year}_${faculty || 'isct'}`);
      try {
        const { normalizeTextbooks } = await import('../../../lib/textbooks/normalize.js');
        const result = await normalizeTextbooks({ year, dept, faculty });
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error('[Admin] normalize_textbooks failed:', e);
        return NextResponse.json({ error: e.message || 'Normalize failed' }, { status: 500 });
      }
    }

    // --- Textbook scrape (per department + year) ---
    if (action === 'scrape_textbooks') {
      const { dept, year } = body;
      if (!dept || !year) return NextResponse.json({ error: 'dept and year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'scrape_textbooks', 'textbooks', `${dept}_${year}`);
      try {
        const result = await fetchDeptTextbooks(dept, year);
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error(`[Admin] scrape_textbooks ${dept}_${year} failed:`, e);
        return NextResponse.json({ error: 'Textbook scrape failed' }, { status: 500 });
      }
    }

    // --- Grading scrape (per department + year) ---
    if (action === 'scrape_grading') {
      const { dept, year } = body;
      if (!dept || !year) return NextResponse.json({ error: 'dept and year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'scrape_grading', 'grading', `${dept}_${year}`);
      try {
        const result = await fetchDeptGrading(dept, year);
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error(`[Admin] scrape_grading ${dept}_${year} failed:`, e);
        return NextResponse.json({ error: 'Grading scrape failed' }, { status: 500 });
      }
    }

    // --- Medical/Dental syllabus scrape (per faculty + year) ---
    if (action === 'scrape_med_syllabus') {
      const { faculty, year } = body;
      if (!faculty || !year) return NextResponse.json({ error: 'faculty and year required' }, { status: 400 });
      await auditLog(sb, auth.userid, 'scrape_med_syllabus', 'syllabus', `${faculty}_${year}`);
      try {
        const result = await fetchMedFacultySyllabus(faculty, year);
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error(`[Admin] scrape_med_syllabus ${faculty}_${year} failed:`, e);
        return NextResponse.json({ error: 'Med scrape failed' }, { status: 500 });
      }
    }

    if (action === 'med_faculty_list') {
      return NextResponse.json(getMedFacultyList());
    }

    if (action === 'med_scrape_progress') {
      const { key } = body;
      return NextResponse.json({ progress: getMedScrapeProgress(key) });
    }

    if (action === 'get_med_sessions') {
      const { faculty, year, search } = body;
      let query = sb.from('med_sessions').select('*').order('lct_cd').order('date').order('time_start');
      if (faculty) query = query.eq('faculty', faculty);
      if (year) query = query.eq('year', year);
      if (search) {
        const safeSearch = search.slice(0, 100).replace(/[,%()]/g, '');
        if (safeSearch) query = query.or(`name.ilike.%${safeSearch}%,lct_cd.ilike.%${safeSearch}%`);
      }
      // Paginate
      const PAGE = 2000;
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await query.range(from, from + PAGE - 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // Build stats
      const facCounts = {};
      const courseSet = new Set();
      for (const r of all) {
        facCounts[r.faculty] = (facCounts[r.faculty] || 0) + 1;
        courseSet.add(r.lct_cd);
      }
      return NextResponse.json({ sessions: all, totalSessions: all.length, totalCourses: courseSet.size, facCounts });
    }

    // --- Moodle data capture (医歯学系データ形式確認) ---
    if (action === 'set_capture_targets') {
      const { user_ids } = body; // array of moodle_user_id
      if (!Array.isArray(user_ids)) return NextResponse.json({ error: 'user_ids array required' }, { status: 400 });
      const { error } = await sb.from('site_settings').upsert({
        key: 'moodle_capture_targets',
        value: { user_ids: user_ids.map(Number) },
        updated_by: auth.userid,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await auditLog(sb, auth.userid, 'set_capture_targets', 'settings', JSON.stringify(user_ids));
      return NextResponse.json({ ok: true });
    }

    if (action === 'get_capture_targets') {
      const { data } = await sb.from('site_settings').select('value').eq('key', 'moodle_capture_targets').maybeSingle();
      return NextResponse.json({ user_ids: data?.value?.user_ids || [] });
    }

    if (action === 'get_captured_moodle') {
      const { filter } = body;
      // filter='med' → paginate through captures and return only those containing
      // med/dental courses (fullname with 【6-digit lct_cd】). Needed because
      // the raw LIMIT-50 list can be dominated by a single heavy user's recent
      // captures, hiding other users' med-bearing captures.
      if (filter === 'med') {
        const MED_RE = /【\d{6}】/;
        const PAGE = 100;
        const out = [];
        for (let from = 0; from < 1000 && out.length < 20; from += PAGE) {
          const { data, error } = await sb.from('moodle_capture')
            .select('*')
            .order('captured_at', { ascending: false })
            .range(from, from + PAGE - 1);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          if (!data || data.length === 0) break;
          for (const c of data) {
            const hasMed = (c.raw_courses || []).some(x => MED_RE.test(x.fullname || ''));
            if (hasMed) out.push(c);
            if (out.length >= 20) break;
          }
          if (data.length < PAGE) break;
        }
        return NextResponse.json({ captures: out });
      }
      const { data, error } = await sb.from('moodle_capture')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ captures: data || [] });
    }

    if (action === 'delete_captured_moodle') {
      const { id, all } = body;
      if (all) {
        const { error } = await sb.from('moodle_capture').delete().neq('id', 0);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else if (id) {
        const { error } = await sb.from('moodle_capture').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await auditLog(sb, auth.userid, 'delete_captured_moodle', 'moodle_capture', all ? 'all' : String(id));
      return NextResponse.json({ ok: true });
    }

    // --- Exam schedules CRUD ---
    if (action === 'add_exam') {
      const { code, code_raw, name, date, day, period, room, instructor, year, quarter } = body;
      if (!code || !name || !date || !period) {
        return NextResponse.json({ error: 'code, name, date, period required' }, { status: 400 });
      }
      // Validate exam fields
      if (year && !/^\d{4}$/.test(year)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
      if (quarter && !['1Q', '2Q', '3Q', '4Q', '1-2Q', '3-4Q'].includes(quarter)) return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      const { data, error } = await sb.from('exam_schedules').insert({
        code, code_raw: code_raw || null, name, date, day: day || null,
        period, room: room || null, instructor: instructor || null,
        year: year || '2025', quarter: quarter || '4Q', created_by: auth.userid,
      }).select().single();
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'add_exam', 'exam', data.id, { code, name });
      return NextResponse.json({ ok: true, exam: data });
    }

    if (action === 'update_exam') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      // Whitelist allowed update fields to prevent arbitrary column overwrites
      const ALLOWED_EXAM_FIELDS = ['code', 'code_raw', 'name', 'date', 'day', 'period', 'room', 'instructor', 'year', 'quarter'];
      const updates = { updated_at: new Date().toISOString() };
      for (const f of ALLOWED_EXAM_FIELDS) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      if (updates.year && !/^\d{4}$/.test(updates.year)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
      if (updates.quarter && !['1Q', '2Q', '3Q', '4Q', '1-2Q', '3-4Q'].includes(updates.quarter)) return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 });
      if (updates.date && !/^\d{4}-\d{2}-\d{2}$/.test(updates.date)) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      const { error } = await sb.from('exam_schedules').update(updates).eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'update_exam', 'exam', id, updates);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_exam') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const { error } = await sb.from('exam_schedules').delete().eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_exam', 'exam', id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'bulk_import_exams') {
      const { entries } = body;
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return NextResponse.json({ error: 'entries array required' }, { status: 400 });
      }
      if (entries.length > 500) return NextResponse.json({ error: 'Too many entries (max 500)' }, { status: 400 });
      const rows = entries.map(e => ({
        code: e.code, code_raw: e.code_raw || null, name: e.name,
        date: e.date, day: e.day || null, period: e.period,
        room: e.room || null, instructor: e.instructor || null,
        year: e.year || '2025', quarter: e.quarter || '4Q',
        created_by: auth.userid,
      })).filter(r => r.code && r.name && r.date && r.period);
      if (rows.length === 0) return NextResponse.json({ error: 'No valid entries' }, { status: 400 });
      const { error } = await sb.from('exam_schedules').upsert(rows, {
        onConflict: 'code_raw,date,period', ignoreDuplicates: false,
      });
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'bulk_import_exams', 'exam', '', { count: rows.length });
      return NextResponse.json({ ok: true, imported: rows.length });
    }

    // --- Bulk update profiles (dept/year) ---
    if (action === 'bulk_update_profiles') {
      const { field, oldValue, newValue } = body;
      if (!field || !newValue) return NextResponse.json({ error: 'field and newValue required' }, { status: 400 });
      if (!['dept'].includes(field)) return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
      if (!oldValue) return NextResponse.json({ error: 'oldValue required for bulk update' }, { status: 400 });
      let query = sb.from('profiles').update({ [field]: newValue }).eq(field, oldValue);
      const { error, count } = await query;
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'bulk_update_profiles', 'profiles', field, { oldValue, newValue, count });
      return NextResponse.json({ ok: true, count });
    }

    // --- T2SCHOLA Moodle API proxy ---
    if (action === 't2schola_call') {
      const { wstoken, wsfunction, params } = body;
      if (!wstoken || !wsfunction) return NextResponse.json({ error: 'wstoken and wsfunction required' }, { status: 400 });
      const T2_API = 'https://t2schola.titech.ac.jp/webservice/rest/server.php';
      const url = new URL(T2_API);
      url.searchParams.set('wstoken', wstoken);
      url.searchParams.set('wsfunction', wsfunction);
      url.searchParams.set('moodlewsrestformat', 'json');
      if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
          if (Array.isArray(v)) {
            v.forEach((item, i) => {
              if (typeof item === 'object' && item !== null) {
                for (const [k2, v2] of Object.entries(item)) url.searchParams.set(`${k}[${i}][${k2}]`, v2);
              } else {
                url.searchParams.set(`${k}[${i}]`, item);
              }
            });
          } else {
            url.searchParams.set(k, v);
          }
        }
      }
      await auditLog(sb, auth.userid, 't2schola_call', 'moodle', wsfunction, { params });
      try {
        const resp = await fetch(url.toString());
        const data = await resp.json();
        return NextResponse.json({ ok: true, data });
      } catch (e) {
        return NextResponse.json({ error: `T2SCHOLA API error: ${e.message}` }, { status: 502 });
      }
    }

    // --- T2SCHOLA token: use provided password with current loginId ---
    if (action === 't2schola_get_token') {
      const { password } = body;
      if (!password) return NextResponse.json({ error: 'password required' }, { status: 400 });
      await auditLog(sb, auth.userid, 't2schola_get_token', 'moodle', auth.loginId);
      try {
        const resp = await fetch('https://t2schola.titech.ac.jp/login/token.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `username=${encodeURIComponent(auth.loginId)}&password=${encodeURIComponent(password)}&service=moodle_mobile_app`,
        });
        const data = await resp.json();
        if (data.token) {
          return NextResponse.json({ ok: true, token: data.token });
        }
        return NextResponse.json({ ok: false, error: data.error || 'Token acquisition failed', errorcode: data.errorcode });
      } catch (e) {
        return NextResponse.json({ error: `T2SCHOLA token error: ${e.message}` }, { status: 502 });
      }
    }

    // --- Curriculum requirement update: parse pasted text and update syllabus_courses ---
    if (action === 'update_curriculum') {
      const { text, dept, year } = body;
      if (!text || !dept) return NextResponse.json({ error: 'text and dept required' }, { status: 400 });
      const targetYear = year || '2026';

      // Parse curriculum text: detect ◎ (必修), ○ (選択必修), or none (選択)
      const courseRe = /([A-Z]{2,4}\.[A-Z]\d{3})(?:\.[A-Z])?\s+(◎|○)?\s*(.+?)\s+(\d+-\d+-\d+)/g;
      const parsed = [];
      let m;
      while ((m = courseRe.exec(text)) !== null) {
        const code = m[1]; // e.g. MTH.A201 (without suffix)
        const symbol = m[2];
        let requirement;
        if (symbol === '◎') requirement = '必修';
        else if (symbol === '○') requirement = '選択必修';
        else requirement = '選択';
        parsed.push({ code, requirement });
      }

      if (parsed.length === 0) {
        return NextResponse.json({ error: 'パースできる科目が見つかりませんでした', parsed: 0 }, { status: 400 });
      }

      // Update syllabus_courses rows matching code + year, collect per-course logs
      let updated = 0;
      const logs = [];
      for (const { code, requirement } of parsed) {
        // Check if any rows exist for this code+year
        const { data: existing, error: selErr } = await sb.from('syllabus_courses')
          .select('id')
          .eq('code', code)
          .eq('year', targetYear)
          .limit(1);
        if (selErr) {
          logs.push({ code, requirement, status: 'error', detail: selErr.message });
          continue;
        }
        if (!existing || existing.length === 0) {
          logs.push({ code, requirement, status: 'not_found', detail: 'シラバスDBに未登録' });
          continue;
        }
        const { error: upErr } = await sb.from('syllabus_courses')
          .update({ requirement })
          .eq('code', code)
          .eq('year', targetYear);
        if (upErr) {
          logs.push({ code, requirement, status: 'error', detail: upErr.message });
        } else {
          updated += existing.length;
          logs.push({ code, requirement, status: 'ok', rows: existing.length });
        }
      }

      const matched = logs.filter(l => l.status === 'ok').length;
      const notFound = logs.filter(l => l.status === 'not_found').length;
      const errors = logs.filter(l => l.status === 'error').length;
      await auditLog(sb, auth.userid, 'update_curriculum', 'syllabus', dept, { parsed: parsed.length, matched, notFound, errors, updated, year: targetYear });
      console.log(`[Curriculum] ${dept} ${targetYear}: parsed=${parsed.length} matched=${matched} notFound=${notFound} errors=${errors} rows=${updated}`);
      return NextResponse.json({ ok: true, parsed: parsed.length, matched, notFound, errors, updated, logs });
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
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_post', 'post', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'message') {
      const { error } = await sb.from('messages').delete().eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_message', 'message', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'comment') {
      const { error } = await sb.from('comments').delete().eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_comment', 'comment', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'dm') {
      const { error } = await sb.from('dm_messages').delete().eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_dm', 'dm', id);
      return NextResponse.json({ ok: true });
    }

    if (type === 'circle_message') {
      const { error } = await sb.from('circle_messages').delete().eq('id', id);
      if (error) { console.error('[Admin]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      await auditLog(sb, auth.userid, 'delete_circle_message', 'circle_message', id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    console.error('[Admin DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
