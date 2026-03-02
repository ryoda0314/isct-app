import { NextResponse } from 'next/server';
import { hasCredentials } from '../../../../lib/credentials.js';
import { isAuthenticated } from '../../../../lib/auth/token-manager.js';

export async function GET() {
  try {
    const hasCreds = await hasCredentials();
    return NextResponse.json({ hasCredentials: hasCreds, isAuthenticated: isAuthenticated() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
