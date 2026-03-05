import { NextResponse } from 'next/server';
import { deleteCredentials } from '../../../../lib/credentials.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { COOKIE_NAME } from '../../../../lib/auth/session.js';

export async function DELETE(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  await deleteCredentials();
  invalidateToken();

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
