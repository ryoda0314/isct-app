import { NextResponse } from 'next/server';
import { deleteCredentials, loadCredentials, saveCredentials } from '../../../../lib/credentials.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { COOKIE_NAME, destroyUserSessions, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { generateTOTP } from '../../../../lib/auth/totp.js';

/**
 * GET /api/auth/credentials
 * Returns credentials for the native Capacitor app auto-login.
 * Restricted to native app requests only (x-app-platform: capacitor).
 *   ?type=isct  → { userId, password, totpCode }
 *   (default)   → { portalUserId, portalPassword, matrix }
 */
export async function GET(request) {
  // Only allow requests from the native Capacitor app
  if (request.headers.get('x-app-platform') !== 'capacitor') {
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
      // Delete in dependency order to avoid FK issues
      // 1. Comments by this user
      await sb.from('comments').delete().eq('moodle_user_id', userId);
      // 2. Posts by this user (and their comments)
      const { data: userPosts } = await sb.from('posts').select('id').eq('moodle_user_id', userId);
      if (userPosts?.length) {
        const postIds = userPosts.map(p => p.id);
        await sb.from('comments').delete().in('post_id', postIds);
        await sb.from('posts').delete().in('id', postIds);
      }
      // 3. Messages (course chat)
      await sb.from('messages').delete().eq('moodle_user_id', userId);
      // 4. DM messages & conversations
      await sb.from('dm_messages').delete().eq('sender_id', userId);
      const { data: convs } = await sb.from('dm_conversations').select('id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
      if (convs?.length) {
        const convIds = convs.map(c => c.id);
        await sb.from('dm_messages').delete().in('conversation_id', convIds);
        await sb.from('dm_conversations').delete().in('id', convIds);
      }
      // 5. Friendships
      await sb.from('friendships').delete().or(`user_id.eq.${userId},friend_id.eq.${userId}`);
      // 6. Group memberships (and empty groups)
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
      // 7. Notifications
      await sb.from('notifications').delete().eq('user_id', userId);
      // 8. Event RSVPs
      await sb.from('event_rsvps').delete().eq('user_id', userId);
      // 9. Bookmarks
      await sb.from('bookmarks').delete().eq('user_id', userId);
      // 10. Shared materials
      const { data: mats } = await sb.from('shared_materials').select('id, storage_path').eq('uploader_id', userId);
      if (mats?.length) {
        const paths = mats.map(m => m.storage_path).filter(Boolean);
        if (paths.length) await sb.storage.from('shared-materials').remove(paths);
        await sb.from('shared_materials').delete().eq('uploader_id', userId);
      }
      // 11. Profile
      await sb.from('profiles').delete().eq('moodle_id', userId);
      // 12. Admin entry (if any)
      await sb.from('admin_users').delete().eq('moodle_user_id', userId);
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
