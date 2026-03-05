import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('shared_materials')
      .select('*, profiles(name, avatar, color)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const files = (data || []).map(row => {
      const { data: urlData } = sb.storage
        .from('shared-materials')
        .getPublicUrl(row.storage_path);
      return { ...row, url: urlData?.publicUrl || '' };
    });

    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const formData = await request.formData();
    const file = formData.get('file');
    const courseId = formData.get('course_id');
    const category = formData.get('category') || 'notes';

    if (!file || !courseId) {
      return NextResponse.json({ error: 'file and course_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const ts = Date.now();
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0];
    const storagePath = `${courseId}/${ts}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await sb.storage
      .from('shared-materials')
      .upload(storagePath, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    const { data: row, error: insertErr } = await sb
      .from('shared_materials')
      .insert({
        course_id: courseId,
        moodle_user_id: userid,
        filename: file.name,
        filesize: file.size,
        mimetype: file.type || null,
        category,
        storage_path: storagePath,
      })
      .select('*, profiles(name, avatar, color)')
      .single();

    if (insertErr) throw insertErr;

    const { data: urlData } = sb.storage
      .from('shared-materials')
      .getPublicUrl(storagePath);
    row.url = urlData?.publicUrl || '';

    return NextResponse.json(row);
  } catch (err) {
    console.error('[shared-materials]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data: row, error: fetchErr } = await sb
      .from('shared_materials')
      .select('id, moodle_user_id, storage_path')
      .eq('id', id)
      .single();

    if (fetchErr || !row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (row.moodle_user_id !== userid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    await sb.storage.from('shared-materials').remove([row.storage_path]);

    const { error: delErr } = await sb.from('shared_materials').delete().eq('id', id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[shared-materials delete]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
