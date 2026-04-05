import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const VALID_MODES = ['freshman', 'navi', 'reg'];

// POST /api/guest-track — ゲストセッション記録（認証不要）
export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, mode, action } = body;

    if (!sessionId || !VALID_MODES.includes(mode)) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // action=heartbeat: 既存セッションの page_views をインクリメント
    if (action === 'heartbeat') {
      const { data: existing } = await sb
        .from('guest_sessions')
        .select('id, page_views')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await sb.from('guest_sessions')
          .update({ page_views: (existing.page_views || 1) + 1, last_active_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return NextResponse.json({ ok: true });
    }

    // action=convert: ゲストがログイン画面に遷移した
    if (action === 'convert') {
      await sb.from('guest_sessions')
        .update({ converted: true, last_active_at: new Date().toISOString() })
        .eq('session_id', sessionId);
      return NextResponse.json({ ok: true });
    }

    // デフォルト: 新規セッション作成
    const ua = request.headers.get('user-agent') || '';
    const ref = request.headers.get('referer') || '';

    await sb.from('guest_sessions').insert({
      session_id: sessionId,
      mode,
      user_agent: ua.slice(0, 500),
      referrer: ref.slice(0, 500),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[GuestTrack]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
