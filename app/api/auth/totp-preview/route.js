import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';

/**
 * POST /api/auth/totp-preview
 * Generate a TOTP code from a secret for preview purposes.
 * Uses POST to avoid exposing the secret in URL/query parameters/logs.
 * Returns the 6-digit code and seconds remaining until expiry.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const secret = body?.secret;

    if (!secret || secret.length < 6) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 400 });
    }

    const code = authenticator.generate(secret);
    const remaining = authenticator.timeRemaining();
    return NextResponse.json({ code, remaining });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate TOTP' }, { status: 400 });
  }
}
