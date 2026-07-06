import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { signCode, getClientSecret, originOf } from '../../../../lib/auth/app-sso.js';

// 登録済み外部アプリ(store_apps の url型)の origin を許可リストとして返す。
// これにより ScienceTokyo をトークン発行の踏み台に使われるのを防ぐ。
async function allowedOrigins() {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('store_apps')
      .select('target')
      .eq('enabled', true)
      .eq('target_type', 'url');
    const set = new Set();
    for (const r of data || []) { const o = originOf(r.target); if (o) set.add(o); }
    // 開発用に env でも追加できる(カンマ区切り)
    for (const o of (process.env.APP_SSO_EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)) set.add(o);
    return set;
  } catch { return new Set(); }
}

// GET /api/sso/authorize?redirect_uri=<外部アプリのcallback>&state=<csrf>
export async function GET(request) {
  if (!getClientSecret()) {
    return NextResponse.json({ error: 'SSO not configured' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const redirectUri = searchParams.get('redirect_uri') || '';
  const state = searchParams.get('state') || '';

  const dest = originOf(redirectUri);
  if (!dest) return NextResponse.json({ error: 'invalid redirect_uri' }, { status: 400 });

  const allow = await allowedOrigins();
  if (!allow.has(dest)) {
    return NextResponse.json({ error: 'redirect_uri not allowed' }, { status: 403 });
  }

  // 戻り先 URL を組み立てるヘルパ
  const back = (params) => {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (state) u.searchParams.set('state', state);
    return NextResponse.redirect(u.toString(), 302);
  };

  // ScienceTokyo セッションを確認
  const auth = await requireAuth(request);
  if (auth.error) {
    // 未ログイン: 外部アプリ側でメッセージ表示できるよう error を付けて戻す
    return back({ error: 'login_required' });
  }

  const code = signCode({ sub: auth.userid, name: auth.fullname || '', aud: dest });
  return back({ code });
}
