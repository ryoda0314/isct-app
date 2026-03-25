import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const VALID_REASONS = ['spam', 'harassment', 'inappropriate', 'copyright', 'other'];
const VALID_TARGETS = ['post', 'comment', 'message', 'dm', 'user', 'circle'];

// POST /api/reports — ユーザーが通報を送信
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { targetType, targetId, targetUserId, reason, detail } = await request.json();

    if (!targetType || !targetId || !reason) {
      return NextResponse.json({ error: 'targetType, targetId, and reason required' }, { status: 400 });
    }
    if (!VALID_TARGETS.includes(targetType)) {
      return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
    }
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Prevent duplicate reports from same user on same target
    const { data: existing } = await sb
      .from('reports')
      .select('id')
      .eq('reporter_id', auth.userid)
      .eq('target_type', targetType)
      .eq('target_id', String(targetId))
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '既にこのコンテンツを通報済みです' }, { status: 409 });
    }

    const { error } = await sb.from('reports').insert({
      reporter_id: auth.userid,
      target_type: targetType,
      target_id: String(targetId),
      target_user_id: targetUserId || null,
      reason,
      detail: detail?.trim() || null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[Reports POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
