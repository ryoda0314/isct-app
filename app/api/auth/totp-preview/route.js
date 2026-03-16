import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';

/**
 * GET /api/auth/totp-preview?secret=XXXX
 * Generate a TOTP code from a secret for preview purposes.
 * Returns the 6-digit code and seconds remaining until expiry.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (!secret || secret.length < 6) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 400 });
  }

  try {
    const code = authenticator.generate(secret);
    const remaining = authenticator.timeRemaining();
    return NextResponse.json({ code, remaining });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate TOTP' }, { status: 400 });
  }
}
