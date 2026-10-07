import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { COOKIE_NAME } from '../../../lib/auth/session.js';
import { isAdmin } from '../../../lib/auth/is-admin.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';
import { getMutedIds } from '../../../lib/mutes.js';

// 学園祭の出店・展示の宣伝。閲覧は来場者（未ログイン）にも公開、投稿は学生のみ。
const TABLE = 'festival_booths';
const BUCKET = 'festival-public';
const CURRENT_FESTIVAL = 'koudaisai2026';
const VALID_CATEGORIES = ['food', 'drink', 'exhibit', 'game', 'stage', 'goods', 'other'];
const MAX_PER_USER = 5;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const LIMITS = { name: 60, org: 60, description: 2000, location: 100, hours: 100, link: 300, building: 40, couponTitle: 40, couponDetail: 200 };
// クーポンを使える期間（工大祭の2日間, JST）
const COUPON_START = new Date('2026-10-10T00:00:00+09:00');
const COUPON_END = new Date('2026-10-12T00:00:00+09:00');

const COLS = 'id, festival, owner_id, name, org, category, description, building, location, hours, link, image, likes, hidden, coupon_title, coupon_detail, coupon_limit, coupon_used, created_at, updated_at';

// ログインしていれば auth を返し、未ログイン（またはセッション無効）なら null。
async function optionalAuth(request) {
  if (!request.cookies.get(COOKIE_NAME)?.value) return null;
  const auth = await requireAuth(request);
  return auth.error ? null : auth;
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

function toClient(sb, b, userid, admin, myUses) {
  const likes = b.likes || [];
  return {
    id: b.id,
    name: b.name,
    org: b.org,
    category: b.category,
    description: b.description,
    building: b.building,
    location: b.location,
    hours: b.hours,
    link: b.link,
    imageUrl: b.image?.path ? sb.storage.from(BUCKET).getPublicUrl(b.image.path).data.publicUrl : null,
    likeCount: likes.length,
    liked: userid ? likes.includes(userid) : false,
    isMine: !!userid && b.owner_id === userid,
    // 投稿者IDは通報・管理用にログイン中のみ返す
    ownerId: userid ? b.owner_id : undefined,
    hidden: admin ? b.hidden : undefined,
    coupon: b.coupon_title ? {
      title: b.coupon_title,
      detail: b.coupon_detail,
      limit: b.coupon_limit,
      used: b.coupon_used || 0,
      myUsedAt: myUses?.get(b.id) || null,
    } : null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

// 入力のバリデーション。成功時は { row }、失敗時は { error }。
async function buildRow(body, userid) {
  const name = clean(body.name, LIMITS.name);
  if (!name) return { error: '出店名を入力してください' };
  if (!VALID_CATEGORIES.includes(body.category)) return { error: 'カテゴリが不正です' };

  const row = {
    name,
    category: body.category,
    org: clean(body.org, LIMITS.org),
    description: clean(body.description, LIMITS.description),
    building: clean(body.building, LIMITS.building),
    location: clean(body.location, LIMITS.location),
    hours: clean(body.hours, LIMITS.hours),
    link: clean(body.link, LIMITS.link),
  };
  if (row.link && !/^https?:\/\/[^\s]+$/i.test(row.link)) return { error: 'リンクは http(s):// から始まるURLにしてください' };

  // クーポン: null / 未指定ならなし。上限は 1〜10000 の整数か null（上限なし）。
  const c = body.coupon;
  row.coupon_title = c ? clean(c.title, LIMITS.couponTitle) : null;
  row.coupon_detail = row.coupon_title ? clean(c.detail, LIMITS.couponDetail) : null;
  row.coupon_limit = null;
  if (row.coupon_title && c.limit != null && c.limit !== '') {
    const n = Number(c.limit);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return { error: 'クーポンの枚数は1〜10000で入力してください' };
    row.coupon_limit = n;
  }

  const ng = await checkNgWords([row.name, row.org, row.description, row.location, row.hours, row.coupon_title, row.coupon_detail].filter(Boolean).join('\n'), { userId: userid, type: 'festival_booth' });
  if (ng.blocked) return { error: '禁止ワードが含まれています' };

  // 画像: 自分のプレフィックス配下のパスのみ受理。null 指定で削除。
  if (body.image === null) row.image = null;
  else if (body.image?.path) {
    if (typeof body.image.path !== 'string' || !body.image.path.startsWith(`festival/${userid}/`)) return { error: 'invalid image path' };
    row.image = { path: body.image.path };
  }
  return { row };
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
      const [blockedIds, mutedIds, uses] = await Promise.all([
        getBlockedIds(userid),
        getMutedIds(userid),
        sb.from('festival_coupon_uses').select('booth_id, used_at').eq('user_id', userid),
      ]);
      if (blockedIds.size || mutedIds.size) list = list.filter(b => !blockedIds.has(b.owner_id) && !mutedIds.has(b.owner_id));
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

    // 1) 画像アップロード用の署名URL
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
      if (booth.owner_id === userid) return NextResponse.json({ error: '自分の出店のクーポンは使えません' }, { status: 400 });

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

    // 3) 出店の登録
    const { count } = await sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('festival', CURRENT_FESTIVAL).eq('owner_id', userid);
    if ((count || 0) >= MAX_PER_USER) return NextResponse.json({ error: `登録できるのは1人${MAX_PER_USER}件までです` }, { status: 400 });

    const { row, error: vErr } = await buildRow(body, userid);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

    const { data, error } = await sb.from(TABLE).insert({ ...row, owner_id: userid, festival: CURRENT_FESTIVAL }).select(COLS).single();
    if (error) {
      console.error('[Festival POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(toClient(sb, data, userid, false));
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
      if (booth.owner_id !== userid) return NextResponse.json({ error: 'Not your booth' }, { status: 403 });
      const { row, error: vErr } = await buildRow(body, userid);
      if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
      const { data, error } = await sb.from(TABLE).update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select(COLS).single();
      if (error) {
        console.error('[Festival edit]', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      // 差し替えた古い画像は消す
      if (booth.image?.path && booth.image.path !== data.image?.path) await sb.storage.from(BUCKET).remove([booth.image.path]).catch(() => {});
      return NextResponse.json(toClient(sb, data, userid, false));
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
    if (booth.owner_id !== userid && !(await isAdmin(userid))) return NextResponse.json({ error: 'Not your booth' }, { status: 403 });

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
