import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// 自分専用クリップボード（端末間同期）。owner_id = 認証ユーザー でのみ読み書き可能。
// 添付は非公開バケット post-attachments の pocket/<owner_id>/ 配下に保存し署名URLで返す。

const MAX_TEXT_LENGTH = 10000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB（投稿添付と同じ。Vercel本文サイズ制限に合わせる）
const SIGN_TTL = 3600; // 署名URL有効期限(秒)
const BUCKET = 'post-attachments';

// 添付の署名URLを付与（取得のたびに再署名）
async function signAttachment(sb, item) {
  if (!item.attachment?.path) return item;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(item.attachment.path, SIGN_TTL);
  return { ...item, attachment: { ...item.attachment, url: data?.signedUrl || '' } };
}

// GET: 自分のポケット一覧
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 200);

    const { data, error } = await sb
      .from('pocket_items')
      .select('id, kind, text, attachment, pinned, created_at')
      .eq('owner_id', userid)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    // テーブル未作成（supabase/pocket.sql 未実行）の場合は空一覧として扱う
    if (error?.code === '42P01') {
      console.warn('[Pocket] pocket_items テーブルが未作成です。supabase/pocket.sql を実行してください。');
      return NextResponse.json([]);
    }
    if (error) throw error;

    const items = await Promise.all((data || []).map(it => signAttachment(sb, it)));
    return NextResponse.json(items);
  } catch (err) {
    console.error('[Pocket] GET error:', err.message, err.stack);
    // TODO(debug): 一時的に実エラーを返す。原因特定後に削除すること。
    return NextResponse.json({ error: 'Internal error', _debug: { message: err.message, code: err.code, name: err.name } }, { status: 500 });
  }
}

// POST: テキスト/URL を保存、またはファイル/画像をアップロード
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const contentType = request.headers.get('content-type') || '';
    let text = '';
    let file = null;

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      const jsonStr = fd.get('json');
      if (jsonStr) {
        try { text = (JSON.parse(jsonStr).text || '').toString(); } catch {}
      }
      const f = fd.get('file');
      if (f instanceof File && f.size > 0) file = f;
    } else {
      const body = await request.json();
      text = (body.text || '').toString();
    }

    text = text.trim();
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    if (!file && !text) {
      return NextResponse.json({ error: 'text or file required' }, { status: 400 });
    }

    const row = { owner_id: userid };

    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
      }
      // ファイル名をサニタイズ（ディレクトリ区切り・親参照を除去）
      const safeName = (file.name || 'file').replace(/[/\\]/g, '_').replace(/\.\./g, '_');
      const ts = Date.now();
      const path = `pocket/${userid}/${ts}_${safeName}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: file.type || 'application/octet-stream' });
      if (upErr) {
        console.error('[Pocket] upload:', upErr.message);
        // TODO(debug): 一時的に実エラーを返す。原因特定後に削除すること。
        return NextResponse.json({ error: 'Upload failed', _debug: { message: upErr.message, name: upErr.name, status: upErr.statusCode || upErr.status } }, { status: 500 });
      }
      row.kind = (file.type || '').startsWith('image/') ? 'image' : 'file';
      row.attachment = { name: file.name || safeName, path, size: file.size, type: file.type || '' };
      if (text) row.text = text; // キャプション
    } else {
      row.kind = 'text';
      row.text = text;
    }

    const { data, error } = await sb
      .from('pocket_items')
      .insert(row)
      .select('id, kind, text, attachment, pinned, created_at')
      .single();
    if (error) throw error;

    const signed = await signAttachment(sb, data);
    return NextResponse.json(signed);
  } catch (err) {
    console.error('[Pocket] POST error:', err.message, err.stack);
    // TODO(debug): 一時的に実エラーを返す。原因特定後に削除すること。
    return NextResponse.json({ error: 'Internal error', _debug: { message: err.message, code: err.code, name: err.name } }, { status: 500 });
  }
}

// PATCH: ピン留めトグル
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { id, pinned } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await sb
      .from('pocket_items')
      .update({ pinned: !!pinned })
      .eq('id', id)
      .eq('owner_id', userid); // 自分のアイテムのみ
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Pocket] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: アイテム削除（添付の実体も削除）
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // 自分のアイテムであることを確認しつつ添付パスを取得
    const { data: item, error: fetchErr } = await sb
      .from('pocket_items')
      .select('id, attachment, owner_id')
      .eq('id', id)
      .eq('owner_id', userid)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (item.attachment?.path) {
      const { error: rmErr } = await sb.storage.from(BUCKET).remove([item.attachment.path]);
      if (rmErr) console.error('[Pocket] storage remove:', rmErr.message);
    }

    const { error } = await sb
      .from('pocket_items')
      .delete()
      .eq('id', id)
      .eq('owner_id', userid);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Pocket] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
