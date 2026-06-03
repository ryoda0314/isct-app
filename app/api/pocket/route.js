import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// 自分専用クリップボード（端末間同期）。owner_id = 認証ユーザー でのみ読み書き可能。
// 添付は非公開バケット post-attachments の pocket/<owner_id>/ 配下に保存し署名URLで返す。

const MAX_TEXT_LENGTH = 10000;
// ファイルはクライアントから署名URLで直接アップロードするため Vercel の本文サイズ制限を受けない
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: 3つのモード
//   1) { action:'sign-upload', name, type, size } → 署名付きアップロードURLを発行（クライアントが直接Supabaseへ）
//   2) { attachment:{name,path,size,type}, text? } → アップロード済みファイルをDBに記録
//   3) { text } → テキスト/URL を保存
// ファイル本体はサーバーを経由せず、クライアント→Supabase に直接アップロードする（Vercelの本文サイズ制限を回避）。
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const body = await request.json().catch(() => ({}));

    // 1) 署名付きアップロードURLの発行
    if (body.action === 'sign-upload') {
      const size = Number(body.size) || 0;
      if (size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
      }
      const safeName = (body.name || 'file').toString().replace(/[/\\]/g, '_').replace(/\.\./g, '_');
      const ts = Date.now();
      const path = `pocket/${userid}/${ts}_${safeName}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) {
        console.error('[Pocket] createSignedUploadUrl:', error.message);
        return NextResponse.json({ error: 'sign failed', _debug: { message: error.message } }, { status: 500 });
      }
      return NextResponse.json({ path, token: data.token });
    }

    // 2) アップロード済みファイルの記録
    if (body.attachment) {
      const a = body.attachment;
      // セキュリティ: 自分のプレフィックス配下のパスのみ記録可
      if (typeof a.path !== 'string' || !a.path.startsWith(`pocket/${userid}/`)) {
        return NextResponse.json({ error: 'invalid path' }, { status: 400 });
      }
      const row = {
        owner_id: userid,
        kind: (a.type || '').startsWith('image/') ? 'image' : 'file',
        attachment: { name: a.name || 'file', path: a.path, size: Number(a.size) || 0, type: a.type || '' },
      };
      const caption = (body.text || '').toString().trim();
      if (caption) row.text = caption;
      const { data, error } = await sb
        .from('pocket_items')
        .insert(row)
        .select('id, kind, text, attachment, pinned, created_at')
        .single();
      if (error) throw error;
      return NextResponse.json(await signAttachment(sb, data));
    }

    // 3) テキスト/URL
    const text = (body.text || '').toString().trim();
    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    const { data, error } = await sb
      .from('pocket_items')
      .insert({ owner_id: userid, kind: 'text', text })
      .select('id, kind, text, attachment, pinned, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Pocket] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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
