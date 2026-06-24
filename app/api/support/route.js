import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { broadcast, supportAdminTopic, supportUserTopic, supportTicketTopic } from '../../../lib/realtime.js';

const VALID_CATEGORIES = ['bug', 'feature', 'question', 'account', 'other'];

function sanitizeDiagnostics(d) {
  if (!d || typeof d !== 'object') return null;
  const pick = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : (typeof v === 'number' ? v : undefined));
  const out = {
    appVersion: pick(d.appVersion, 40), platform: pick(d.platform, 40),
    userAgent: pick(d.userAgent, 400), screen: pick(d.screen, 40),
    lang: pick(d.lang, 16), view: pick(d.view, 60),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

// GET /api/support?action=tickets | thread&ticketId=
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'tickets';

    if (action === 'tickets') {
      const { data: tickets, error } = await sb
        .from('support_tickets')
        .select('id, subject, category, status, last_message_at, last_sender_role, user_last_read_at, created_at')
        .eq('user_id', auth.userid)
        .order('last_message_at', { ascending: false });
      if (error) { console.error('[Support GET tickets]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

      const ids = (tickets || []).map(t => t.id);
      let previews = {};
      if (ids.length) {
        const { data: msgs } = await sb
          .from('support_messages')
          .select('ticket_id, body, created_at, sender_role')
          .in('ticket_id', ids)
          .order('created_at', { ascending: true });
        for (const m of msgs || []) previews[m.ticket_id] = m; // last wins (ascending)
      }

      // unread = admin messages newer than user_last_read_at
      const enriched = await Promise.all((tickets || []).map(async t => {
        let unread = 0;
        if (t.last_sender_role === 'admin' && (!t.user_last_read_at || t.last_message_at > t.user_last_read_at)) {
          const { count } = await sb
            .from('support_messages')
            .select('*', { count: 'exact', head: true })
            .eq('ticket_id', t.id)
            .eq('sender_role', 'admin')
            .gt('created_at', t.user_last_read_at || '1970-01-01');
          unread = count || 0;
        }
        return { ...t, lastPreview: previews[t.id]?.body || null, unread };
      }));

      const totalUnread = enriched.reduce((s, t) => s + (t.unread || 0), 0);
      return NextResponse.json({ tickets: enriched, totalUnread });
    }

    if (action === 'thread') {
      const ticketId = searchParams.get('ticketId');
      if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });
      const { data: ticket } = await sb
        .from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
      if (!ticket || ticket.user_id !== auth.userid) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const { data: messages } = await sb
        .from('support_messages')
        .select('id, sender_role, sender_id, body, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      // mark read for user
      await sb.from('support_tickets').update({ user_last_read_at: new Date().toISOString() }).eq('id', ticketId);
      broadcast(supportUserTopic(auth.userid), 'new');
      return NextResponse.json({ ticket, messages: messages || [] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Support GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/support  { action: create | send | read }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const body = await request.json();
    const { action } = body;
    const nowIso = new Date().toISOString();

    if (action === 'create') {
      const { subject, category, body: text, diagnostics } = body;
      if (!subject?.trim()) return NextResponse.json({ error: '件名を入力してください' }, { status: 400 });
      if (!text?.trim()) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 });

      // rate-limit: 直近1時間に作成5件まで
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await sb.from('support_tickets').select('*', { count: 'exact', head: true })
        .eq('user_id', auth.userid).gte('created_at', hourAgo);
      if ((count || 0) >= 5) return NextResponse.json({ error: '送信が多すぎます。しばらくしてからお試しください' }, { status: 429 });

      const cat = VALID_CATEGORIES.includes(category) ? category : 'other';
      const { data: ticket, error } = await sb.from('support_tickets').insert({
        user_id: auth.userid,
        subject: subject.trim().slice(0, 120),
        category: cat,
        diagnostics: sanitizeDiagnostics(diagnostics),
        last_message_at: nowIso, last_sender_role: 'user', user_last_read_at: nowIso,
      }).select().single();
      if (error) { console.error('[Support create]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

      await sb.from('support_messages').insert({
        ticket_id: ticket.id, sender_role: 'user', sender_id: auth.userid, body: text.trim().slice(0, 4000),
      });
      broadcast([supportAdminTopic(), supportUserTopic(auth.userid)], 'new');
      return NextResponse.json({ ok: true, ticketId: ticket.id });
    }

    if (action === 'send') {
      const { ticketId, body: text } = body;
      if (!ticketId || !text?.trim()) return NextResponse.json({ error: 'ticketId and body required' }, { status: 400 });
      const { data: ticket } = await sb.from('support_tickets').select('id, user_id, status').eq('id', ticketId).maybeSingle();
      if (!ticket || ticket.user_id !== auth.userid) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      await sb.from('support_messages').insert({
        ticket_id: ticketId, sender_role: 'user', sender_id: auth.userid, body: text.trim().slice(0, 4000),
      });
      // ユーザーが返信したら resolved/closed は open に戻す
      const reopened = (ticket.status === 'resolved' || ticket.status === 'closed');
      await sb.from('support_tickets').update({
        last_message_at: nowIso, last_sender_role: 'user', user_last_read_at: nowIso,
        ...(reopened ? { status: 'open', resolved_at: null, resolved_by: null } : {}),
      }).eq('id', ticketId);
      broadcast([supportAdminTopic(), supportTicketTopic(ticketId), supportUserTopic(auth.userid)], 'new');
      return NextResponse.json({ ok: true });
    }

    if (action === 'read') {
      const { ticketId } = body;
      if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });
      const { data: ticket } = await sb.from('support_tickets').select('user_id').eq('id', ticketId).maybeSingle();
      if (!ticket || ticket.user_id !== auth.userid) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await sb.from('support_tickets').update({ user_last_read_at: nowIso }).eq('id', ticketId);
      broadcast(supportUserTopic(auth.userid), 'new');
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Support POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
