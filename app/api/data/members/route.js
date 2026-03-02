import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchEnrolledUsers } from '../../../../lib/api/courses.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const courseid = searchParams.get('courseid');
    if (!courseid) {
      return NextResponse.json({ error: 'courseid required' }, { status: 400 });
    }

    const { wstoken } = await getToken();
    const users = await fetchEnrolledUsers(wstoken, Number(courseid));

    const members = users.map(u => ({
      id: u.id,
      name: u.fullname || '',
      avatar: u.profileimageurl || '',
    }));

    return NextResponse.json({ members });
  } catch (err) {
    console.error('[members]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
