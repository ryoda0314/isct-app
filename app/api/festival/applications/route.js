import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { isAdmin } from '../../../../lib/auth/is-admin.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { createNotification } from '../../../../lib/notify.js';
import {
  TABLE, BUCKET, CURRENT_FESTIVAL, COLS, APP_TABLE, MIN_MEMBERS, MAX_MEMBERS,
  buildRow, normalizeLogin, isValidLogin, lookupMembers,
} from '../../../../lib/festival.js';

// 出店の掲載申請。代表者が申請し、運営（管理者）が承認すると festival_booths に掲載される。
// 条件: 代表者を含むメンバー MIN_MEMBERS 人以上がアプリに登録済み（Science Tokyo ID で確認）。

const MAX_PENDING = 3;
const ADMIN_ENV_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean);

const imageUrl = (sb, image) => image?.path ? sb.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl : null;

// 申請で上げた画像が掲載中の出店で使われていなければ消す
async function removeUnusedImage(sb, app, boothImagePath) {
  const p = app.payload?.image?.path;
  if (p && p !== boothImagePath) await sb.storage.from(BUCKET).remove([p]).catch(() => {});
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    // 管理者: 審査一覧
    if (searchParams.get('scope') === 'admin') {
      if (!(await isAdmin(userid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const status = searchParams.get('status') || 'pending';
      let q = sb.from(APP_TABLE).select('*').eq('festival', CURRENT_FESTIVAL).order('created_at', { ascending: status !== 'pending' ? false : true }).limit(100);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ applications: [] });
        console.error('[FestivalApps GET admin]', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      const apps = data || [];
      const applicantIds = [...new Set(apps.map(a => a.applicant_id))];
      const boothIds = [...new Set(apps.map(a => a.booth_id).filter(Boolean))];
      const allLogins = [...new Set(apps.flatMap(a => a.member_logins || []))];
      const [profiles, booths, members] = await Promise.all([
        applicantIds.length ? sb.from('profiles').select('moodle_id, name, avatar, color').in('moodle_id', applicantIds) : { data: [] },
        boothIds.length ? sb.from(TABLE).select('id, name').in('id', boothIds) : { data: [] },
        allLogins.length ? lookupMembers(sb, allLogins) : new Map(),
      ]);
      const pMap = new Map((profiles.data || []).map(p => [p.moodle_id, p]));
      const bMap = new Map((booths.data || []).map(b => [b.id, b]));
      return NextResponse.json({
        applications: apps.map(a => ({
          id: a.id,
          status: a.status,
          createdAt: a.created_at,
          reviewedAt: a.reviewed_at,
          rejectReason: a.reject_reason,
          applicant: { id: a.applicant_id, login: a.applicant_login, ...(pMap.get(a.applicant_id) || {}) },
          boothId: a.booth_id,
          currentBoothName: a.booth_id ? bMap.get(a.booth_id)?.name || null : null,
          booth: { ...a.payload, imageUrl: imageUrl(sb, a.payload?.image) },
          // 審査時点の登録状況（申請後にアカウント削除された場合も分かるよう毎回確認）
          members: (a.member_logins || []).map(l => ({ login: l, ...(members.get(l) || { registered: false }) })),
        })),
      });
    }

    // 本人: 自分の申請
    const { data, error } = await sb.from(APP_TABLE).select('id, status, booth_id, payload, reject_reason, created_at, reviewed_at')
      .eq('festival', CURRENT_FESTIVAL).eq('applicant_id', userid).order('created_at', { ascending: false }).limit(20);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ applications: [] });
      console.error('[FestivalApps GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({
      applications: (data || []).map(a => ({
        id: a.id, status: a.status, boothId: a.booth_id, name: a.payload?.name,
        rejectReason: a.reject_reason, createdAt: a.created_at, reviewedAt: a.reviewed_at,
      })),
      minMembers: MIN_MEMBERS,
    });
  } catch (err) {
    console.error('[FestivalApps GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 申請を出す
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, loginId, fullname } = auth;
    const body = await request.json();
    const sb = getSupabaseAdmin();

    const { row, error: vErr } = await buildRow(body, userid);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

    // 変更申請は自分が代表者の出店のみ
    let boothId = null;
    if (body.boothId) {
      const { data: booth } = await sb.from(TABLE).select('id, owner_id').eq('id', body.boothId).maybeSingle();
      if (!booth || booth.owner_id !== userid) return NextResponse.json({ error: 'この出店の変更は申請できません' }, { status: 403 });
      boothId = booth.id;
    }

    // メンバー（代表者以外）の Science Tokyo ID
    const self = normalizeLogin(loginId);
    const logins = [...new Set((Array.isArray(body.members) ? body.members : []).map(normalizeLogin).filter(Boolean))].filter(l => l !== self);
    const bad = logins.filter(l => !isValidLogin(l));
    if (bad.length) return NextResponse.json({ error: `Science Tokyo ID の形式が正しくありません: ${bad.join(', ')}` }, { status: 400 });
    if (logins.length > MAX_MEMBERS) return NextResponse.json({ error: `メンバーは${MAX_MEMBERS}人までです` }, { status: 400 });
    if (logins.length + 1 < MIN_MEMBERS) {
      return NextResponse.json({ error: `代表者を含めて${MIN_MEMBERS}人以上のメンバーが必要です（あと${MIN_MEMBERS - 1 - logins.length}人）` }, { status: 400 });
    }
    const found = await lookupMembers(sb, logins);
    const unregistered = logins.filter(l => !found.get(l)?.registered);
    if (unregistered.length) {
      return NextResponse.json({ error: `アプリへの登録が確認できないメンバーがいます: ${unregistered.join(', ')}`, unregistered }, { status: 400 });
    }

    // 審査待ちが溜まりすぎないように
    const { data: pending } = await sb.from(APP_TABLE).select('id, booth_id').eq('festival', CURRENT_FESTIVAL).eq('applicant_id', userid).eq('status', 'pending');
    if ((pending || []).length >= MAX_PENDING) return NextResponse.json({ error: `審査待ちの申請は${MAX_PENDING}件までです` }, { status: 400 });
    if (boothId && (pending || []).some(p => p.booth_id === boothId)) return NextResponse.json({ error: 'この出店の変更申請はすでに審査待ちです' }, { status: 400 });

    const { data, error } = await sb.from(APP_TABLE).insert({
      festival: CURRENT_FESTIVAL,
      applicant_id: userid,
      applicant_login: self,
      booth_id: boothId,
      payload: row,
      member_logins: logins,
    }).select('id, status, booth_id, payload, created_at').single();
    if (error) {
      console.error('[FestivalApps POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    for (const adminId of ADMIN_ENV_IDS) {
      createNotification({
        userId: adminId, type: 'festival', dedupKey: `festival_app:${data.id}`,
        text: `工大祭の${boothId ? '変更' : '掲載'}申請が届きました: ${row.name}（${fullname || '代表者'}）`,
      }).catch(() => {});
    }

    return NextResponse.json({ id: data.id, status: data.status, boothId: data.booth_id, name: data.payload?.name, createdAt: data.created_at });
  } catch (err) {
    console.error('[FestivalApps POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 取り下げ（本人） / 承認・却下（管理者）
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { id, action, reason } = await request.json();
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data: app } = await sb.from(APP_TABLE).select('*').eq('id', id).maybeSingle();
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (app.status !== 'pending') return NextResponse.json({ error: 'この申請はすでに処理済みです' }, { status: 409 });

    let boothImagePath = null;
    if (app.booth_id) {
      const { data: b } = await sb.from(TABLE).select('image').eq('id', app.booth_id).maybeSingle();
      boothImagePath = b?.image?.path || null;
    }

    if (action === 'withdraw') {
      if (app.applicant_id !== userid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      await sb.from(APP_TABLE).update({ status: 'withdrawn' }).eq('id', id).eq('status', 'pending');
      await removeUnusedImage(sb, app, boothImagePath);
      return NextResponse.json({ ok: true });
    }

    if (!(await isAdmin(userid))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const now = new Date().toISOString();
    const name = app.payload?.name || '出店';

    if (action === 'approve') {
      let boothId = app.booth_id;
      if (boothId) {
        const { error } = await sb.from(TABLE).update({ ...app.payload, updated_at: now }).eq('id', boothId);
        if (error) { console.error('[FestivalApps approve]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
        if (boothImagePath && boothImagePath !== app.payload?.image?.path && app.payload?.image !== undefined) {
          await sb.storage.from(BUCKET).remove([boothImagePath]).catch(() => {});
        }
      } else {
        const { data, error } = await sb.from(TABLE).insert({ ...app.payload, owner_id: app.applicant_id, festival: app.festival }).select('id').single();
        if (error) { console.error('[FestivalApps approve]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
        boothId = data.id;
      }
      await sb.from(APP_TABLE).update({ status: 'approved', booth_id: boothId, reviewed_by: userid, reviewed_at: now }).eq('id', id);
      createNotification({
        userId: app.applicant_id, type: 'festival', dedupKey: `festival_app_done:${id}`,
        text: app.booth_id ? `「${name}」の変更が反映されました` : `「${name}」が工大祭の出店ページに掲載されました`,
      }).catch(() => {});
      const { data: booth } = await sb.from(TABLE).select(COLS).eq('id', boothId).single();
      return NextResponse.json({ ok: true, boothId, booth });
    }

    if (action === 'reject') {
      const r = typeof reason === 'string' ? reason.trim().slice(0, 300) || null : null;
      await sb.from(APP_TABLE).update({ status: 'rejected', reject_reason: r, reviewed_by: userid, reviewed_at: now }).eq('id', id);
      await removeUnusedImage(sb, app, boothImagePath);
      createNotification({
        userId: app.applicant_id, type: 'festival', dedupKey: `festival_app_done:${id}`,
        text: `「${name}」の${app.booth_id ? '変更' : '掲載'}申請は承認されませんでした${r ? `（理由: ${r}）` : ''}`,
      }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[FestivalApps PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
