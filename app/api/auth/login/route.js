import { NextResponse } from 'next/server';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';

export async function POST() {
  try {
    invalidateToken();
    const { userid } = await getToken();
    return NextResponse.json({ success: true, moodleUserId: userid });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
