import { NextResponse } from 'next/server';
import { deleteCredentials } from '../../../../lib/credentials.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';

export async function DELETE() {
  await deleteCredentials();
  invalidateToken();
  return NextResponse.json({ success: true });
}
