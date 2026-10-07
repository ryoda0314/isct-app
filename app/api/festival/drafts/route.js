import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { TABLE, BUCKET, APP_TABLE, LINK_TABLE, DRAFT_TABLE } from '../../../../lib/festival.js';

// 掲載申請の下書き（サーバー保存）と、代表者の確認済みメンバー名簿の取得。
// 下書きは入力途中の未検証データ。申請時に /api/festival/applications で改めて検証する。

const MAX_FORM_CHARS = 20000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 'new' か、自分が代表者の出店の id だけを受け付ける
async function checkKey(sb, key, userid) {
  if (key === 'new') return true;
  if (typeof key !== 'string' || !UUID_RE.test(key)) return false;
  const { data } = await sb.from(TABLE).select('owner_id').eq('id', key).maybeSingle();
  return data?.owner_id === userid;
}

async function roster(sb, userid) {
  const { data: links } = await sb.from(LINK_TABLE).select('member_id, verified_at').eq('rep_id', userid).order('verified_at');
  const ids = (links || []).map(l => l.member_id);
  if (!ids.length) return [];
  const { data: profiles } = await sb.from('profiles').select('moodle_id, name, avatar, color, banned').in('moodle_id', ids);
  const pMap = new Map((profiles || []).map(p => [p.moodle_id, p]));
  return (links || []).map(l => {
    const p = pMap.get(l.member_id);
    return { id: l.member_id, name: p?.name || null, avatar: p?.avatar || null, color: p?.color || null, active: !!p && !p.banned, verifiedAt: l.verified_at };
  });
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();
    const key = new URL(request.url).searchParams.get('key');

    const members = await roster(sb, userid);
    if (key) {
      const { data } = await sb.from(DRAFT_TABLE).select('form, updated_at').eq('applicant_id', userid).eq('draft_key', key).maybeSingle();
      return NextResponse.json({ draft: data ? { form: data.form, updatedAt: data.updated_at } : null, members });
    }
    const { data, error } = await sb.from(DRAFT_TABLE).select('draft_key, form, updated_at').eq('applicant_id', userid).order('updated_at', { ascending: false });
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.error('[FestivalDrafts GET]', error.message);
    return NextResponse.json({
      drafts: (data || []).map(d => ({ key: d.draft_key, name: d.form?.f?.name || '', updatedAt: d.updated_at })),
      members,
    });
  } catch (err) {
    console.error('[FestivalDrafts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 下書きを保存（上書き）
export async function PUT(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { key, form } = await request.json();
    const sb = getSupabaseAdmin();

    if (!(await checkKey(sb, key, userid))) return NextResponse.json({ error: 'invalid key' }, { status: 400 });
    if (!form || typeof form !== 'object' || JSON.stringify(form).length > MAX_FORM_CHARS) return NextResponse.json({ error: '下書きが大きすぎます' }, { status: 400 });
    if (form.image?.path && (typeof form.image.path !== 'string' || !form.image.path.startsWith(`festival/${userid}/`))) {
      return NextResponse.json({ error: 'invalid image path' }, { status: 400 });
    }

    const updated_at = new Date().toISOString();
    const { error } = await sb.from(DRAFT_TABLE).upsert({ applicant_id: userid, draft_key: key, form, updated_at }, { onConflict: 'applicant_id,draft_key' });
    if (error) {
      console.error('[FestivalDrafts PUT]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ updatedAt: updated_at });
  } catch (err) {
    console.error('[FestivalDrafts PUT]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 下書きを破棄。一時保存で上げた画像がどこにも使われていなければ消す。
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { key } = await request.json();
    const sb = getSupabaseAdmin();

    const { data } = await sb.from(DRAFT_TABLE).select('form').eq('applicant_id', userid).eq('draft_key', key).maybeSingle();
    await sb.from(DRAFT_TABLE).delete().eq('applicant_id', userid).eq('draft_key', key);

    const path = data?.form?.image?.path;
    if (path) {
      const [{ count: inBooths }, { count: inApps }] = await Promise.all([
        sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('image->>path', path),
        sb.from(APP_TABLE).select('id', { count: 'exact', head: true }).eq('payload->image->>path', path),
      ]);
      if (!inBooths && !inApps) await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[FestivalDrafts DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
