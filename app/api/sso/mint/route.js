import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { signCode, getClientSecret, originOf } from '../../../../lib/auth/app-sso.js';

// POST /api/sso/mint  { appId }
// ScienceTokyo アプリ内(同一オリジン=セッションCookie送信可)から呼ぶ。
// マイアプリで SSO 対応アプリを開くときに使い、その場で認可 code を発行する。
// これにより外部ブラウザ/ネイティブでも(クロスサイトCookie無しで)自動ログインできる。
export async function POST(request) {
  if (!getClientSecret()) return NextResponse.json({ error: 'SSO not configured' }, { status: 503 });

  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const appId = parseInt(body.appId);
  if (!appId) return NextResponse.json({ error: 'appId required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: app } = await sb.from('store_apps')
    .select('id, enabled, target_type, target, sso_enabled, admin_only')
    .eq('id', appId).maybeSingle();

  if (!app || !app.enabled || app.target_type !== 'url' || !app.sso_enabled) {
    return NextResponse.json({ error: 'SSO not available for this app' }, { status: 404 });
  }

  const dest = originOf(app.target);
  if (!dest) return NextResponse.json({ error: 'invalid app target' }, { status: 400 });

  const code = signCode({ sub: auth.userid, name: auth.fullname || '', aud: dest });
  // 外部アプリの callback を組み立てて返す(オリジン直下の /auth/callback 規約)
  const callback = `${dest}/auth/callback`;
  return NextResponse.json({ code, callback });
}
