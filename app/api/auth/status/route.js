import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../../lib/auth/token-manager.js';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

export async function GET(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);

    // セッション Cookie がなければ未認証（他人の自動ログインを防止）
    if (!session) {
      return NextResponse.json({ hasCredentials: false, isAuthenticated: false });
    }

    let hasPortal = false;
    let hasEmail = false;
    try {
      const creds = await loadCredentials(session.loginId);
      hasPortal = !!(creds.portalUserId && creds.portalPassword && creds.matrix);
    } catch {}
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb
        .from('email_auth')
        .select('email')
        .eq('login_id', session.loginId)
        .single();
      hasEmail = !!data?.email;
    } catch {}
    return NextResponse.json({
      hasCredentials: true,
      isAuthenticated: isAuthenticated(session.loginId),
      loginId: session.loginId,
      hasPortal,
      hasEmail,
    });
  } catch (err) {
    console.error('[AuthStatus] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
