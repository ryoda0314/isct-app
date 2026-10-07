import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { COOKIE_NAME } from '../../../lib/auth/session.js';
import { isAdmin } from '../../../lib/auth/is-admin.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { TABLE, BUCKET, CURRENT_FESTIVAL, MAX_IMAGE_SIZE, COUPON_START, COUPON_END, COLS, toClient, buildRow } from '../../../lib/festival.js';

// 学園祭の出店・展示の宣伝。閲覧は来場者（未ログイン）にも公開。掲載は代表者の申請 → 運営の承認で行う。
// ログインしていれば auth を返し、未ログイン（またはセッション無効）なら null。
async function optionalAuth(request) {
  if (!request.cookies.get(COOKIE_NAME)?.value) return null;
  const auth = await requireAuth(request);
  return auth.error ? null : auth;
}

export async function GET(request) {
  try {
    const auth = await optionalAuth(request);
    const userid = auth?.userid || null;
    const admin = userid ? await isAdmin(userid) : false;
    const sb = getSupabaseAdmin();

    let query = sb.from(TABLE).select(COLS).eq('festival', CURRENT_FESTIVAL).order('created_at', { ascending: false }).limit(500);
    if (!admin) query = query.eq('hidden', false);
    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ booths: [] });
      console.error('[Festival GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    let list = data || [];
    let myUses = null;
    if (userid) {
      // 出店は運営が登録するので、ブロック・ミュートでの除外はしない
      const uses = await sb.from('festival_coupon_uses').select('booth_id, used_at').eq('user_id', userid);
      myUses = new Map((uses.data || []).map(u => [u.booth_id, u.used_at]));
    }
    return NextResponse.json({
      booths: list.map(b => toClient(sb, b, userid, admin, myUses)),
      isAdmin: admin,
      couponWindow: { start: COUPON_START.toISOString(), end: COUPON_END.toISOString() },
    });
  } catch (err) {
    console.error('[Festival GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const body = await request.json();
    const sb = getSupabaseAdmin();

    // 1) 画像アップロード用の署名URL（掲載申請・運営の登録の両方で使う）
    if (body.action === 'sign-upload') {
      const { type, size } = body;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return NextResponse.json({ error: '画像ファイル（JPEG/PNG/WebP）を選択してください' }, { status: 400 });
      if (!(size > 0) || size > MAX_IMAGE_SIZE) return NextResponse.json({ error: '画像が大きすぎます（最大2MB）' }, { status: 400 });
      const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
      const path = `festival/${userid}/${Date.now()}${ext}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) {
        console.error('[Festival] createSignedUploadUrl:', error.message);
        return NextResponse.json({ error: 'sign failed' }, { status: 500 });
      }
      return NextResponse.json({ path, token: data.token, bucket: BUCKET });
    }

    // 2) クーポンを使う
    if (body.action === 'use-coupon') {
      const now = new Date();
      if (now < COUPON_START || now >= COUPON_END) return NextResponse.json({ error: 'クーポンは工大祭の開催期間中のみ使えます' }, { status: 400 });
      const { data: booth } = await sb.from(TABLE).select('owner_id').eq('id', body.id).maybeSingle();
      if (!booth) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (booth.owner_id === userid) return NextResponse.json({ error: '登録した出店のクーポンは使えません' }, { status: 400 });

      const { data, error } = await sb.rpc('use_festival_coupon', { p_booth_id: body.id, p_user_id: userid });
      if (error) {
        console.error('[Festival use-coupon]', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      const r = data?.[0];
      if (r?.r_status === 'sold_out') return NextResponse.json({ error: 'このクーポンは配布終了しました' }, { status: 409 });
      if (!r || r.r_status === 'no_coupon') return NextResponse.json({ error: 'このクーポンは利用できません' }, { status: 404 });
      // ok / already のどちらでも使用済み画面を出せるよう used_at を返す
      return NextResponse.json({ usedAt: r.r_used_at, used: r.r_used_count, already: r.r_status === 'already' });
    }

    // 3) 出店の登録（運営のみ）
    if (!(await isAdmin(userid))) return NextResponse.json({ error: '出店の掲載は申請フォームから申請してください' }, { status: 403 });

    const { row, error: vErr } = await buildRow(body, userid);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

    const { data, error } = await sb.from(TABLE).insert({ ...row, owner_id: userid, festival: CURRENT_FESTIVAL }).select(COLS).single();
    if (error) {
      console.error('[Festival POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(toClient(sb, data, userid, true));
  } catch (err) {
    console.error('[Festival POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const body = await request.json();
    const { id, action } = body;
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data: booth } = await sb.from(TABLE).select(COLS).eq('id', id).maybeSingle();
    if (!booth) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'like') {
      const { data: likes, error } = await sb.rpc('toggle_festival_like', { p_booth_id: id, p_user_id: userid });
      if (error) {
        console.error('[Festival like]', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      const arr = likes || [];
      return NextResponse.json({ likeCount: arr.length, liked: arr.includes(userid) });
    }

    if (action === 'edit') {
      if (!(await isAdmin(userid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const { row, error: vErr } = await buildRow(body, userid);
      if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
      const { data, error } = await sb.from(TABLE).update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select(COLS).single();
      if (error) {
        console.error('[Festival edit]', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      // 差し替えた古い画像は消す
      if (booth.image?.path && booth.image.path !== data.image?.path) await sb.storage.from(BUCKET).remove([booth.image.path]).catch(() => {});
      return NextResponse.json(toClient(sb, data, userid, true));
    }

    if (action === 'hide') {
      if (!(await isAdmin(userid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const { data, error } = await sb.from(TABLE).update({ hidden: !booth.hidden }).eq('id', id).select(COLS).single();
      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(toClient(sb, data, userid, true));
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[Festival PATCH]', err);
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
    const { data: booth } = await sb.from(TABLE).select('owner_id, image').eq('id', id).maybeSingle();
    if (!booth) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await isAdmin(userid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) {
      console.error('[Festival DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    if (booth.image?.path) await sb.storage.from(BUCKET).remove([booth.image.path]).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Festival DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
