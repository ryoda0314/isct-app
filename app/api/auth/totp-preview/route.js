import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';

// Called from the registration flow before a session exists, so this endpoint
// is intentionally unauthenticated. Safe because the caller must already
// possess the secret to get a code — we're not a TOTP oracle for unknown secrets.
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
