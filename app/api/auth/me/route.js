import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    return NextResponse.json({ userid: auth.userid, fullname: auth.fullname });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
