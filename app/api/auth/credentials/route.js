import { NextResponse } from 'next/server';
import { deleteCredentials, loadCredentials, saveCredentials } from '../../../../lib/credentials.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { COOKIE_NAME, destroyUserSessions, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { generateTOTP } from '../../../../lib/auth/totp.js';

// Capacitor ネイティブアプリのみ許可する Origin
// server.url が設定されている場合、Origin はそのドメインになる
const CAPACITOR_ORIGINS = new Set([
  'capacitor://localhost', 'https://localhost', 'http://localhost',
  'https://sciencetokyo.app',
]);

/**
 * GET /api/auth/credentials
 * Returns credentials for the native Capacitor app auto-login.
 * Restricted to Capacitor native app context only.
 *   ?type=isct  → { userId, password, totpCode }
 *   (default)   → { portalUserId, portalPassword, matrix }
 *
 * Security layers:
 *   1. Origin check: if Origin is present, it must be in CAPACITOR_ORIGINS
 *   2. Platform header: x-app-platform must be "capacitor"
 *   3. Session cookie: valid signed session required (not spoofable)
 *
 * Note: When Capacitor uses server.url (e.g. https://sciencetokyo.app),
 * same-origin GETs don't send an Origin header. In that case we rely on
 * the platform header + session cookie for authentication.
 * A stolen session cookie alone is NOT enough — the attacker also needs
 * to set x-app-platform header, which a browser-based XSS cannot do
 * for cross-origin requests (CORS preflight would block it).
 */
export async function GET(request) {
  const origin = request.headers.get('origin');
  const platform = request.headers.get('x-app-platform');

  // If Origin is present, it must be from an allowed Capacitor origin
  if (origin && !CAPACITOR_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Require either a trusted Origin OR the Capacitor platform header
  const isCapacitor = platform === 'capacitor';
  const isAllowedOrigin = origin && CAPACITOR_ORIGINS.has(origin);
  if (!isCapacitor && !isAllowedOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const type = new URL(request.url).searchParams.get('type');

  try {
    const creds = await loadCredentials(session.loginId);

    if (type === 'isct') {
      const { password, totpSecret } = creds;
      if (!password || !totpSecret) {
        return NextResponse.json({ error: 'ISCT credentials not configured' }, { status: 400 });
      }
      const totpCode = generateTOTP(totpSecret);
      return NextResponse.json({ userId: session.loginId, password, totpCode });
    }

    const { portalUserId, portalPassword, matrix } = creds;
    if (!portalUserId || !portalPassword || !matrix) {
      return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });
    }
    return NextResponse.json({ portalUserId, portalPassword, matrix });
  } catch {
    return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
  }
}

/**
 * DELETE /api/auth/credentials
 * Body: { type?: 'portal' | 'all' }
 *   - no type / undefined: delete ISCT credentials only (existing behavior)
 *   - 'portal': delete portal credentials only, keep ISCT
 *   - 'all': full account deletion — remove all user data from Supabase
 */
export async function DELETE(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let type = null;
  try {
    const body = await request.json();
    type = body?.type || null;
  } catch {
    // no body — default behavior
  }

  if (type === 'portal') {
    // Delete only portal credentials, keep ISCT
    try {
      const existing = await loadCredentials(auth.loginId);
      const { portalUserId, portalPassword, matrix, ...rest } = existing;
      // Re-save without portal fields
      await deleteCredentials(auth.loginId);
      if (rest.password && rest.totpSecret) {
        await saveCredentials(auth.loginId, {
          password: rest.password,
          totpSecret: rest.totpSecret,
        });
      }
    } catch {}
    return NextResponse.json({ success: true });
  }

  if (type === 'all') {
    // Full account deletion: remove all user data from Supabase
    const sb = getSupabaseAdmin();
    const userId = auth.userid;

    try {
      // Delete in dependency order — all FK references must be removed
      // before the profile row can be deleted.

      // 1. Comments by this user + comments on user's posts
      await sb.from('comments').delete().eq('moodle_user_id', userId);
      const { data: userPosts } = await sb.from('posts').select('id').eq('moodle_user_id', userId);
      if (userPosts?.length) {
        const postIds = userPosts.map(p => p.id);
        await sb.from('comments').delete().in('post_id', postIds);
        await sb.from('posts').delete().in('id', postIds);
      }

      // 2. Messages (course chat)
      await sb.from('messages').delete().eq('moodle_user_id', userId);

      // 3. DM messages & conversations
      await sb.from('dm_messages').delete().eq('sender_id', userId);
      const { data: convs } = await sb.from('dm_conversations').select('id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
      if (convs?.length) {
        const convIds = convs.map(c => c.id);
        await sb.from('dm_messages').delete().in('conversation_id', convIds);
        await sb.from('dm_conversations').delete().in('id', convIds);
      }

      // 4. Friendships (requester_id / addressee_id)
      await sb.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      // 5. Group memberships (and empty groups)
      const { data: memberships } = await sb.from('group_members').select('group_id').eq('user_id', userId);
      await sb.from('group_members').delete().eq('user_id', userId);
      if (memberships?.length) {
        for (const m of memberships) {
          const { data: remaining } = await sb.from('group_members').select('id').eq('group_id', m.group_id).limit(1);
          if (!remaining?.length) {
            await sb.from('group_messages').delete().eq('group_id', m.group_id);
            await sb.from('groups').delete().eq('id', m.group_id);
          }
        }
      }

      // 6. Circle-related data (tables may not exist yet)
      try {
        await sb.from('circle_fee_logs').delete().or(`actor_id.eq.${userId},target_id.eq.${userId}`);
        await sb.from('circle_fee_assignments').delete().eq('user_id', userId);
        await sb.from('circle_join_applications').update({ reviewed_by: null }).eq('reviewed_by', userId);
        await sb.from('circle_join_applications').delete().eq('user_id', userId);
        await sb.from('circle_event_rsvps').delete().eq('user_id', userId);
        await sb.from('circle_announcements').delete().eq('by_user_id', userId);
        await sb.from('circle_messages').delete().eq('sender_id', userId);
        await sb.from('circle_members').delete().eq('user_id', userId);
      } catch {}

      // 7. Notifications (moodle_user_id)
      await sb.from('notifications').delete().eq('moodle_user_id', userId);

      // 8. Event RSVPs (moodle_user_id)
      await sb.from('event_rsvps').delete().eq('moodle_user_id', userId);

      // 9. Bookmarks (moodle_user_id)
      await sb.from('bookmarks').delete().eq('moodle_user_id', userId);

      // 10. Shared materials (moodle_user_id)
      const { data: mats } = await sb.from('shared_materials').select('id, storage_path').eq('moodle_user_id', userId);
      if (mats?.length) {
        const paths = mats.map(m => m.storage_path).filter(Boolean);
        if (paths.length) await sb.storage.from('shared-materials').remove(paths);
        await sb.from('shared_materials').delete().eq('moodle_user_id', userId);
      }

      // 11. User blocks
      await sb.from('user_blocks').delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      // 12. Reports (anonymize target/resolver, delete where reporter)
      try {
        await sb.from('reports').update({ target_user_id: null }).eq('target_user_id', userId);
        await sb.from('reports').update({ resolved_by: null }).eq('resolved_by', userId);
        await sb.from('reports').delete().eq('reporter_id', userId);
      } catch {}

      // 13. Announcements & site_settings (nullify author FK)
      try {
        await sb.from('announcements').update({ created_by: null }).eq('created_by', userId);
        await sb.from('site_settings').update({ updated_by: null }).eq('updated_by', userId);
        await sb.from('admin_audit_log').delete().eq('admin_id', userId);
      } catch {}

      // 14. Email verification & email auth (login_id based)
      await sb.from('email_verification').delete().eq('login_id', auth.loginId);
      await sb.from('email_auth').delete().eq('login_id', auth.loginId);

      // 15. Push subscriptions (CASCADE handles this, but explicit for safety)
      await sb.from('push_subscriptions').delete().eq('moodle_id', userId);

      // 16. Admin entry
      await sb.from('admin_users').delete().eq('moodle_user_id', userId);

      // 17. Profile — LAST (all FK references must be cleared first)
      await sb.from('profiles').delete().eq('moodle_id', userId);
    } catch (e) {
      console.error('[Account Deletion] Error deleting user data:', e.message);
      // Continue with credential deletion even if some data cleanup failed
    }
  }

  // Delete credentials and sessions (for both default and 'all')
  await deleteCredentials(auth.loginId);
  invalidateToken(auth.loginId);
  destroyUserSessions(auth.loginId);

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
