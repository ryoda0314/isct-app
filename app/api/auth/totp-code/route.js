import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { generateTOTP } from '../../../../lib/auth/totp.js';
import { authenticator } from 'otplib';

/**
 * GET /api/auth/totp-code
 * Returns the current TOTP 6-digit code and seconds remaining.
 * Uses server-stored credentials — the secret never leaves the server.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const creds = await loadCredentials(auth.loginId);
    if (!creds?.totpSecret) {
      return NextResponse.json({ error: 'TOTP not configured' }, { status: 400 });
    }

    const code = generateTOTP(creds.totpSecret);
    const remaining = authenticator.timeRemaining();
    return NextResponse.json({ code, remaining });
  } catch {
    return NextResponse.json({ error: 'Failed to load credentials' }, { status: 500 });
  }
}
