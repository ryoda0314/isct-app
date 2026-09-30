import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getNotifPrefs, saveNotifPrefs } from '../../../../lib/notif-prefs.js';

// GET: the user's push notification preferences.
// `stored: false` means the user never synced settings (defaults apply), so the
// client may upload its existing localStorage settings once.
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    return NextResponse.json(await getNotifPrefs(auth.userid));
  } catch (err) {
    console.error('[NotifPrefs] GET error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT: { enabled?, course?, deadline?, dm?, event? } — booleans only
export async function PUT(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    return NextResponse.json(await saveNotifPrefs(auth.userid, body));
  } catch (err) {
    console.error('[NotifPrefs] PUT error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
