import { NextResponse } from 'next/server';
import { loadCredentials } from '../../../../../lib/credentials.js';
import { COOKIE_NAME, verifySession } from '../../../../../lib/auth/session.js';

/**
 * GET /api/auth/credentials/bundle
 *
 * One-time migration endpoint: returns the FULL credential bundle (including
 * totpSecret) so the native app can store it in the device Keychain via the
 * SecureCreds plugin. After migration the device is the source of truth and
 * the server-side copy is retired (Phase 3).
 *
 * Restricted to the Capacitor native app context only, same layered checks as
 * /api/auth/credentials:
 *   1. Origin (if present) must be an allowed Capacitor origin
 *   2. x-app-platform: capacitor
 *   3. Valid signed session cookie
 *
 * This deliberately exposes totpSecret (unlike /api/auth/credentials, which
 * only returns a generated code). Keep it native-only and migration-scoped.
 */

const CAPACITOR_ORIGINS = new Set([
  'capacitor://localhost', 'https://localhost', 'http://localhost',
  'https://sciencetokyo.app',
]);

export async function GET(request) {
  const origin = request.headers.get('origin');
  const platform = request.headers.get('x-app-platform');

  if (origin && !CAPACITOR_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
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

  try {
    const creds = await loadCredentials(session.loginId);
    const { password, totpSecret, portalUserId, portalPassword, matrix } = creds;
    if (!password || !totpSecret) {
      return NextResponse.json({ error: 'ISCT credentials not configured' }, { status: 400 });
    }

    return NextResponse.json({
      loginId: session.loginId,
      moodleUserId: session.userid ?? null,
      userId: session.loginId,
      password,
      totpSecret,
      portalUserId: portalUserId ?? null,
      portalPassword: portalPassword ?? null,
      matrix: matrix ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
  }
}
