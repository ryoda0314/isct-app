import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// 個人の筋トレ記録。moodle_user_id = 認証ユーザー でのみ読み書き可能（service_role 経由）。
const MAX_NAME = 100;
const MAX_NOTES = 1000;
const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// GET: 自分の記録一覧（新しい順）
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('workout_logs')
      .select('id, exercise_name, weight_kg, reps, sets, notes, logged_at')
      .eq('moodle_user_id', userid)
      .order('logged_at', { ascending: false })
      .limit(500);

    if (error?.code === '42P01') return NextResponse.json([]);
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[Gym workouts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: 記録を追加
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const b = await request.json().catch(() => ({}));
    const exercise_name = (b.exercise_name || '').toString().trim().slice(0, MAX_NAME);
    if (!exercise_name) return NextResponse.json({ error: 'invalid params' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('workout_logs')
      .insert({
        moodle_user_id: userid,
        exercise_name,
        weight_kg: numOrNull(b.weight_kg),
        reps: numOrNull(b.reps),
        sets: numOrNull(b.sets),
        notes: (b.notes || '').toString().slice(0, MAX_NOTES) || null,
        logged_at: b.logged_at || new Date().toISOString(),
      })
      .select('id, exercise_name, weight_kg, reps, sets, notes, logged_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Gym workouts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: 自分の記録を削除（?id=）
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('workout_logs')
      .delete()
      .eq('id', id)
      .eq('moodle_user_id', userid); // 本人のレコードのみ

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Gym workouts DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
