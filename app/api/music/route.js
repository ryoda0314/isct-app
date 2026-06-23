import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// 自分専用ミュージックライブラリ（ScienceTokyo Music）。owner_id = 認証ユーザー でのみ読み書き可能。
// 音源/カバーは非公開バケット post-attachments の music/<owner_id>/ 配下に保存し署名URLで返す。
// 実体はクライアントから署名URLで直接アップロードするため Vercel の本文サイズ制限を受けない（pocket と同じ）。

const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB（曲1本）
const MAX_USER_STORAGE = 500 * 1024 * 1024; // ユーザー合計 500MB
const SIGN_TTL = 21600; // 署名URL有効期限(秒) = 6時間（長尺再生中に切れないように）
const BUCKET = 'post-attachments';
// 公式曲(is_public)は公開バケットへ。安定した getPublicUrl で配信することで CDN キャッシュが効き、
// 全員が繰り返し再生しても Storage egress が増え続けない（署名URLはトークンが毎回変わりキャッシュ不成立）。
const PUBLIC_BUCKET = 'music-public';
const MAX_TITLE = 200;
const MAX_LYRICS = 20000; // 歌詞（LRC含む）の最大文字数

// 管理者判定（admin/route.js と同じ仕組み: ENV_ADMIN_IDS + admin_users テーブル）
const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
async function isAdmin(sb, userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

// 音源・カバーのURLを付与。
//   公式曲(is_public): 公開バケットの安定 getPublicUrl（CDNキャッシュが効き egress を抑える）
//   個人曲          : 非公開バケットの署名URL（取得のたびに再署名・6時間有効）
async function signTrack(sb, row) {
  const out = { ...row };
  if (row.is_public) {
    if (row.audio?.path) {
      const { data } = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(row.audio.path);
      out.audio = { ...row.audio, url: data?.publicUrl || '' };
    }
    if (row.cover?.path) {
      const { data } = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(row.cover.path);
      out.cover = { ...row.cover, url: data?.publicUrl || '' };
    }
    return out;
  }
  if (row.audio?.path) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(row.audio.path, SIGN_TTL);
    out.audio = { ...row.audio, url: data?.signedUrl || '' };
  }
  if (row.cover?.path) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(row.cover.path, SIGN_TTL);
    out.cover = { ...row.cover, url: data?.signedUrl || '' };
  }
  return out;
}

// GET: 自分のライブラリ一覧
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    // 自分の曲 + 管理者が全員へ配信した公式曲（is_public）の両方を返す
    const { data, error } = await sb
      .from('music_tracks')
      .select('id, title, artist, audio, cover, duration, lyrics, is_public, owner_id, sort_order, created_at')
      .or(`owner_id.eq.${userid},is_public.eq.true`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500);

    // テーブル未作成（supabase/music.sql 未実行）の場合は空一覧として扱う
    if (error?.code === '42P01') {
      console.warn('[Music] music_tracks テーブルが未作成です。supabase/music.sql を実行してください。');
      return NextResponse.json([]);
    }
    if (error) throw error;

    const tracks = await Promise.all((data || []).map((t) => signTrack(sb, t)));
    return NextResponse.json(tracks);
  } catch (err) {
    console.error('[Music] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: 2つのモード
//   1) { action:'sign-upload', kind:'audio'|'cover', name, type, size } → 署名付きアップロードURLを発行
//   2) { audio:{name,path,size,type}, title, artist?, cover?:{path}, duration? } → アップロード済みをDBに記録
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const body = await request.json().catch(() => ({}));

    // 1) 署名付きアップロードURLの発行
    if (body.action === 'sign-upload') {
      const kind = body.kind === 'cover' ? 'cover' : 'audio';
      const size = Number(body.size) || 0;
      const type = (body.type || '').toString();
      // 全員配信（公式曲）は管理者のみ。保存先を music/public/ に分ける
      // アップロードは管理者のみ（一般ユーザーは配信曲を聴くだけ）
      if (!(await isAdmin(sb, userid))) {
        return NextResponse.json({ error: 'アップロード権限がありません（管理者のみ）' }, { status: 403 });
      }
      const wantPublic = !!body.public;

      if (kind === 'audio') {
        if (size > MAX_AUDIO_SIZE) {
          return NextResponse.json({ error: 'ファイルが大きすぎます（最大50MB）' }, { status: 400 });
        }
        if (type && !type.startsWith('audio/')) {
          return NextResponse.json({ error: '音声ファイルを選択してください' }, { status: 400 });
        }
        // 個人ライブラリのみ合計ストレージ上限チェック（公式曲は対象外）
        if (!wantPublic) {
          const { data: tracks } = await sb
            .from('music_tracks')
            .select('audio')
            .eq('owner_id', userid)
            .eq('is_public', false);
          const used = (tracks || []).reduce((s, t) => s + (Number(t.audio?.size) || 0), 0);
          if (used + size > MAX_USER_STORAGE) {
            return NextResponse.json({ error: 'ストレージ上限(500MB)に達しています' }, { status: 400 });
          }
        }
      } else {
        if (size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'カバー画像が大きすぎます（最大5MB）' }, { status: 400 });
        }
        if (type && !type.startsWith('image/')) {
          return NextResponse.json({ error: '画像ファイルを選択してください' }, { status: 400 });
        }
      }

      // Storageキーは ASCII安全な文字のみ（日本語等は InvalidKey になる）。表示名は audio.name に保持。
      const rawName = (body.name || (kind === 'cover' ? 'cover' : 'track')).toString();
      const dot = rawName.lastIndexOf('.');
      const ext = dot > 0 ? rawName.slice(dot).replace(/[^A-Za-z0-9.]/g, '') : '';
      const base = (dot > 0 ? rawName.slice(0, dot) : rawName).replace(/[^A-Za-z0-9._-]/g, '_') || kind;
      const ts = Date.now();
      const prefix = wantPublic ? `music/public/${kind}` : `music/${userid}/${kind}`;
      const path = `${prefix}/${ts}_${base}${ext}`;
      // 公式曲は公開バケット、個人曲は非公開バケットへアップロード
      const uploadBucket = wantPublic ? PUBLIC_BUCKET : BUCKET;
      const { data, error } = await sb.storage.from(uploadBucket).createSignedUploadUrl(path);
      if (error) {
        console.error('[Music] createSignedUploadUrl:', error.message);
        return NextResponse.json({ error: 'sign failed' }, { status: 500 });
      }
      // bucket もクライアントへ返す（署名トークンはバケット固有のため、同じバケットへアップロードする必要がある）
      return NextResponse.json({ path, token: data.token, bucket: uploadBucket });
    }

    // 2) アップロード済みの記録（アップロードは管理者のみ）
    if (!(await isAdmin(sb, userid))) {
      return NextResponse.json({ error: 'アップロード権限がありません（管理者のみ）' }, { status: 403 });
    }
    const wantPublic = !!body.public;
    // 公式曲は music/public/ 配下、個人曲は music/<userid>/ 配下のパスのみ受理
    const audioPrefix = wantPublic ? 'music/public/audio/' : `music/${userid}/audio/`;
    const coverPrefix = wantPublic ? 'music/public/cover/' : `music/${userid}/cover/`;

    const a = body.audio;
    if (!a || typeof a.path !== 'string' || !a.path.startsWith(audioPrefix)) {
      return NextResponse.json({ error: 'invalid audio path' }, { status: 400 });
    }
    let cover = null;
    if (body.cover?.path) {
      if (typeof body.cover.path !== 'string' || !body.cover.path.startsWith(coverPrefix)) {
        return NextResponse.json({ error: 'invalid cover path' }, { status: 400 });
      }
      cover = { path: body.cover.path };
    }
    const title = (body.title || a.name || '無題').toString().trim().slice(0, MAX_TITLE) || '無題';
    const artist = body.artist ? body.artist.toString().trim().slice(0, MAX_TITLE) : null;
    const duration = Number.isFinite(Number(body.duration)) ? Number(body.duration) : null;
    const lyrics = typeof body.lyrics === 'string' ? (body.lyrics.slice(0, MAX_LYRICS).trim() || null) : null;

    const { data, error } = await sb
      .from('music_tracks')
      .insert({
        owner_id: userid, // 公式曲でも投稿した管理者を owner として記録
        title,
        artist,
        audio: { name: a.name || 'track', path: a.path, size: Number(a.size) || 0, type: a.type || '' },
        cover,
        duration,
        lyrics,
        is_public: wantPublic,
      })
      .select('id, title, artist, audio, cover, duration, lyrics, is_public, owner_id, sort_order, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json(await signTrack(sb, data));
  } catch (err) {
    console.error('[Music] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: 曲名/アーティストの編集、または並び順の更新
//   { id, title?, artist? }  または  { order: [id, id, ...] }
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const body = await request.json().catch(() => ({}));

    // 並び替え
    if (Array.isArray(body.order)) {
      const ids = body.order.filter((x) => typeof x === 'string').slice(0, 500);
      await Promise.all(
        ids.map((id, i) =>
          sb.from('music_tracks').update({ sort_order: i + 1 }).eq('id', id).eq('owner_id', userid)
        )
      );
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const patch = {};
    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, MAX_TITLE) || '無題';
    if (typeof body.artist === 'string') patch.artist = body.artist.trim().slice(0, MAX_TITLE) || null;
    if (typeof body.lyrics === 'string') patch.lyrics = body.lyrics.slice(0, MAX_LYRICS).trim() || null;
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    // 権限: 自分の曲、または 公式曲(is_public)なら管理者
    const { data: row } = await sb
      .from('music_tracks')
      .select('owner_id, is_public')
      .eq('id', body.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const canManage = String(row.owner_id) === String(userid) || (row.is_public && (await isAdmin(sb, userid)));
    if (!canManage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { error } = await sb
      .from('music_tracks')
      .update(patch)
      .eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Music] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: 曲削除（音源・カバーの実体も削除）
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: row, error: fetchErr } = await sb
      .from('music_tracks')
      .select('id, audio, cover, owner_id, is_public')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // 権限: 自分の曲、または 公式曲(is_public)なら管理者
    const canManage = String(row.owner_id) === String(userid) || (row.is_public && (await isAdmin(sb, userid)));
    if (!canManage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const paths = [row.audio?.path, row.cover?.path].filter(Boolean);
    if (paths.length) {
      // 公式曲は公開バケット、個人曲は非公開バケットから実体を削除
      const delBucket = row.is_public ? PUBLIC_BUCKET : BUCKET;
      const { error: rmErr } = await sb.storage.from(delBucket).remove(paths);
      if (rmErr) console.error('[Music] storage remove:', rmErr.message);
    }

    const { error } = await sb
      .from('music_tracks')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Music] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
