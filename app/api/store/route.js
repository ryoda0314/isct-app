import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function isAdmin(sb, userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

const APP_COLS = 'id, slug, title, subtitle, description, icon, color, category, target_type, target, screenshots, featured, badge, sort_order, admin_only, sso_enabled';

// GET /api/store           → カタログ(公開中)。各アプリに installed フラグ付き。
// GET /api/store?mine=1     → 入手済みのアプリのみ(マイアプリ用)。
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const sb = getSupabaseAdmin();
    const admin = await isAdmin(sb, auth.userid);
    const { searchParams } = new URL(request.url);
    const mine = searchParams.get('mine') === '1';

    // 入手済み app_id の集合
    const { data: installs } = await sb
      .from('store_app_installs')
      .select('app_id')
      .eq('user_id', auth.userid);
    const installedIds = new Set((installs || []).map(r => r.app_id));

    let q = sb
      .from('store_apps')
      .select(APP_COLS)
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (!admin) q = q.eq('admin_only', false);

    const { data, error } = await q;
    if (error) { console.error('[Store GET]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

    let apps = (data || []).map(a => ({ ...a, installed: installedIds.has(a.id) }));
    if (mine) apps = apps.filter(a => a.installed);
    return NextResponse.json(apps);
  } catch (e) {
    console.error('[Store GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/store  { action: 'install' | 'uninstall', appId }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => ({}));
    const { action, appId } = body;
    const id = parseInt(appId);
    if (!id) return NextResponse.json({ error: 'appId required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    if (action === 'install') {
      // 公開中(かつ権限のある)アプリのみ入手可
      const admin = await isAdmin(sb, auth.userid);
      const { data: app } = await sb.from('store_apps').select('id, enabled, admin_only').eq('id', id).maybeSingle();
      if (!app || !app.enabled || (app.admin_only && !admin)) {
        return NextResponse.json({ error: 'Not available' }, { status: 404 });
      }
      const { error } = await sb.from('store_app_installs')
        .upsert({ user_id: auth.userid, app_id: id }, { onConflict: 'user_id,app_id' });
      if (error) { console.error('[Store POST]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ ok: true, installed: true });
    }

    if (action === 'uninstall') {
      const { error } = await sb.from('store_app_installs')
        .delete().eq('user_id', auth.userid).eq('app_id', id);
      if (error) { console.error('[Store POST]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
      return NextResponse.json({ ok: true, installed: false });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[Store POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
