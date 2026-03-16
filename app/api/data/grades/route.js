import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { fetchGrades } from '../../../../lib/api/grades.js';

export const maxDuration = 60;

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const loginId = session.loginId;

  let creds;
  try {
    creds = await loadCredentials(loginId);
  } catch {
    return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
  }

  const portalUser = creds.portalUserId;
  const portalPass = creds.portalPassword;
  const matrix = creds.matrix;

  if (!portalUser || !portalPass || !matrix) {
    return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });
  }

  const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  try {
    const data = await fetchGrades({ userId: portalUser, password: portalPass, matrix });
    return NextResponse.json(data, { headers });
  } catch (err) {
    console.error('[Grades API] Error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500, headers });
  }
}
