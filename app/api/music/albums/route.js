import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// ScienceTokyo Music のアルバム管理。作成/編集/削除は管理者のみ（配信は全員向け=公式）。
// カバー画像のアップロードは /api/music の sign-upload(kind:'cover', public:true) を流用し、
// music/public/cover/ 配下に置く。ここではメタデータ(music_albums)のみ扱う。

const PUBLIC_BUCKET = 'music-public';
const MAX_TITLE = 200;

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
async function isAdmin(sb, userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

function coverFromBody(body) {
  // 公式アルバムのカバーは music/public/cover/ 配下のパスのみ受理
  if (!body.cover?.path) return null;
  if (typeof body.cover.path !== 'string' || !body.cover.path.startsWith('music/public/cover/')) return undefined; // invalid
  return { path: body.cover.path };
}

// POST: アルバム作成  { title, artist?, cover?:{path} }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    if (!(await isAdmin(sb, userid))) {
      return NextResponse.json({ error: 'アルバムの作成は管理者のみ可能です' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').toString().trim().slice(0, MAX_TITLE);
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const artist = body.artist ? body.artist.toString().trim().slice(0, MAX_TITLE) : null;
    const cover = coverFromBody(body);
    if (cover === undefined) return NextResponse.json({ error: 'invalid cover path' }, { status: 400 });

    const { data, error } = await sb
      .from('music_albums')
      .insert({ owner_id: userid, title, artist, cover, is_public: true })
      .select('id, title, artist, cover, is_public, owner_id, sort_order, created_at')
      .single();
    if (error?.code === '42P01') {
      return NextResponse.json({ error: 'music_albums テーブルが未作成です（supabase/music-albums.sql を実行してください）' }, { status: 500 });
    }
    if (error) throw error;

    // カバーURLを付与して返す（公式=公開バケットの安定URL）
    let out = { ...data };
    if (data.cover?.path) {
      const { data: pub } = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(data.cover.path);
      out.cover = { ...data.cover, url: pub?.publicUrl || '' };
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error('[MusicAlbum] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: 編集 { id, title?, artist?, cover? } または 並び替え { order:[id,...] }
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const body = await request.json().catch(() => ({}));

    if (Array.isArray(body.order)) {
      const ids = body.order.filter((x) => typeof x === 'string').slice(0, 200);
      await Promise.all(
        ids.map((id, i) => sb.from('music_albums').update({ sort_order: i + 1 }).eq('id', id).eq('owner_id', userid))
      );
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const patch = {};
    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, MAX_TITLE) || 'アルバム';
    if (typeof body.artist === 'string') patch.artist = body.artist.trim().slice(0, MAX_TITLE) || null;
    if ('cover' in body) {
      const cover = coverFromBody(body);
      if (cover === undefined) return NextResponse.json({ error: 'invalid cover path' }, { status: 400 });
      patch.cover = cover; // null でカバー解除も可
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    const { data: row } = await sb.from('music_albums').select('owner_id, is_public').eq('id', body.id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const canManage = String(row.owner_id) === String(userid) || (row.is_public && (await isAdmin(sb, userid)));
    if (!canManage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { error } = await sb.from('music_albums').update(patch).eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[MusicAlbum] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: アルバム削除 ?id=  （曲は消さず album_id=null へ戻る＝DBの on delete set null）
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: row } = await sb.from('music_albums').select('id, cover, owner_id, is_public').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const canManage = String(row.owner_id) === String(userid) || (row.is_public && (await isAdmin(sb, userid)));
    if (!canManage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    if (row.cover?.path) {
      const { error: rmErr } = await sb.storage.from(PUBLIC_BUCKET).remove([row.cover.path]);
      if (rmErr) console.error('[MusicAlbum] cover remove:', rmErr.message);
    }

    const { error } = await sb.from('music_albums').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[MusicAlbum] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
