import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth/require-auth.js';
import { isAdmin } from '../../../../lib/auth/is-admin.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { auditLog } from '../../../../lib/admin-audit.js';
import { CAREER_TABLE, buildListing } from '../../../../lib/career.js';
import { LISTING_STATUSES } from '../../../../lib/career-tags.js';

// 管理画面のキャリア（インターン・就職・イベント）の掲載管理。管理者だけ。操作は admin_audit_log に残す。
//   GET                         … 全件（状態を問わず）＋ 公開設定
//   POST   { data }             … 新規（同じ応募先が既にあれば 409 と既存の id）
//   PATCH  { id, data }         … 編集
//   PATCH  { id, action:'checked' }          … 最終確認日を今にする
//   PATCH  { id, action:'status', status }   … 状態だけ変える（公開 / 終了 / 非表示 / 下書き）
//   PATCH  { action:'public', value:bool }   … 一般に公開するか（site_settings.career.public）
//   DELETE { id }

async function guard(request) {
  const auth = await requireSession(request);
  if (auth.error) return { error: auth.error };
  if (!(await isAdmin(auth.userid))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { auth, sb: getSupabaseAdmin() };
}

const missingTable = (error) => error && (error.code === '42P01' || error.code === 'PGRST205');

export async function GET(request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { sb } = g;
  const [{ data, error }, { data: setting }] = await Promise.all([
    sb.from(CAREER_TABLE).select('*').order('updated_at', { ascending: false }).limit(2000),
    sb.from('site_settings').select('value').eq('key', 'career').maybeSingle(),
  ]);
  if (missingTable(error)) return NextResponse.json({ items: [], public: false, tableMissing: true });
  if (error) { console.error('[Admin career GET]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
  return NextResponse.json({ items: data || [], public: setting?.value?.public === true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { auth, sb } = g;
  const body = await request.json().catch(() => ({}));
  const { row, error } = buildListing(body.data || {});
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { data: dup } = await sb.from(CAREER_TABLE).select('id, title, status').eq('apply_url_norm', row.apply_url_norm).maybeSingle();
  if (dup) return NextResponse.json({ error: '同じ応募先の掲載がすでにあります', duplicate: dup }, { status: 409 });
  const now = new Date().toISOString();
  const { data, error: insErr } = await sb.from(CAREER_TABLE)
    .insert({ ...row, status: row.status || 'draft', created_by: auth.userid, checked_at: now, created_at: now, updated_at: now })
    .select('*').single();
  if (insErr) { console.error('[Admin career POST]', insErr.message); return NextResponse.json({ error: '保存できませんでした' }, { status: 500 }); }
  await auditLog(sb, auth.userid, 'career_create', 'career', data.id, { title: data.title, status: data.status });
  return NextResponse.json({ item: data });
}

export async function PATCH(request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { auth, sb } = g;
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (body.action === 'public') {
    const value = { public: body.value === true };
    const { error } = await sb.from('site_settings').upsert({ key: 'career', value }, { onConflict: 'key' });
    if (error) { console.error('[Admin career public]', error.message); return NextResponse.json({ error: '保存できませんでした' }, { status: 500 }); }
    await auditLog(sb, auth.userid, 'career_public', 'site_settings', 'career', value);
    return NextResponse.json({ ok: true, public: value.public });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id がありません' }, { status: 400 });

  let patch;
  if (body.action === 'checked') {
    patch = { checked_at: now };
  } else if (body.action === 'status') {
    if (!LISTING_STATUSES.includes(body.status)) return NextResponse.json({ error: '状態が正しくありません' }, { status: 400 });
    patch = { status: body.status };
  } else {
    const { row, error } = buildListing(body.data || {});
    if (error) return NextResponse.json({ error }, { status: 400 });
    const { data: dup } = await sb.from(CAREER_TABLE).select('id, title').eq('apply_url_norm', row.apply_url_norm).neq('id', id).maybeSingle();
    if (dup) return NextResponse.json({ error: '同じ応募先の掲載がほかにあります', duplicate: dup }, { status: 409 });
    // 編集した = 内容を確認した、とみなして最終確認日も更新する
    patch = { ...row, checked_at: now };
  }
  const { data, error } = await sb.from(CAREER_TABLE).update({ ...patch, updated_at: now }).eq('id', id).select('*').maybeSingle();
  if (error) { console.error('[Admin career PATCH]', error.message); return NextResponse.json({ error: '保存できませんでした' }, { status: 500 }); }
  if (!data) return NextResponse.json({ error: '見つかりません' }, { status: 404 });
  await auditLog(sb, auth.userid, `career_${body.action || 'update'}`, 'career', id, body.action === 'status' ? { status: body.status } : { title: data.title });
  return NextResponse.json({ item: data });
}

export async function DELETE(request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { auth, sb } = g;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id がありません' }, { status: 400 });
  const { data, error } = await sb.from(CAREER_TABLE).delete().eq('id', id).select('id, title').maybeSingle();
  if (error) { console.error('[Admin career DELETE]', error.message); return NextResponse.json({ error: '削除できませんでした' }, { status: 500 }); }
  await auditLog(sb, auth.userid, 'career_delete', 'career', id, data ? { title: data.title } : null);
  return NextResponse.json({ ok: true });
}
