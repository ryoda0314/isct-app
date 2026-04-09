import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';

/**
 * Return the user's Moodle wstoken and basic info to the client.
 * The client uses this to call Moodle API directly (bypassing server-side 403 blocks).
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  return NextResponse.json({
    wstoken: auth.wstoken,
    userid: auth.userid,
    fullname: auth.fullname,
    loginId: auth.loginId,
  });
}
