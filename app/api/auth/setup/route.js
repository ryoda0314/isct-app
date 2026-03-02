import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials } from '../../../../lib/credentials.js';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';

export async function POST(request) {
  try {
    const { userId, password, totpSecret } = await request.json();
    if (!userId || !password || !totpSecret) {
      return NextResponse.json({ error: 'userId, password, totpSecret are required' }, { status: 400 });
    }

    await saveCredentials({ userId, password, totpSecret });
    const { userid } = await getToken();
    return NextResponse.json({ success: true, moodleUserId: userid });
  } catch (err) {
    await deleteCredentials();
    invalidateToken();
    return NextResponse.json({ error: 'Login failed', detail: err.message }, { status: 401 });
  }
}
