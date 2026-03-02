import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../lib/auth/token-manager.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .select('*, profiles(name, avatar, color)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const { course_id, text } = await request.json();
    if (!course_id || !text?.trim()) {
      return NextResponse.json({ error: 'course_id and text required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Ensure profile exists
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const { data, error } = await sb
      .from('messages')
      .insert({ course_id, moodle_user_id: userid, text: text.trim() })
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
