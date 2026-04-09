import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';

/**
 * Return the user's Moodle wstoken and basic info to the client.
 * The client uses this to call Moodle API directly (bypassing server-side 403 blocks).
 *
 * Security:
 * - Rate limited to 5 req/min per IP (middleware)
 * - Requires authenticated session (cookie)
 * - loginId is NOT returned (unnecessary for client)
 * - Cache-Control: no-store (already set by middleware for all API routes)
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // Only return what the client needs — no loginId
  return NextResponse.json({
    wstoken: auth.wstoken,
    userid: auth.userid,
    fullname: auth.fullname,
  });
}
