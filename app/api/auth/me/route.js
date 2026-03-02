import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../../lib/auth/token-manager.js';

export async function GET() {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid, fullname } = await getToken();
    return NextResponse.json({ userid, fullname });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
