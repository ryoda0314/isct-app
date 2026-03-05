import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../../../lib/auth/token-manager.js';
import { LMS_BASE } from '../../../../../lib/config.js';

/**
 * Proxy endpoint for Moodle file downloads.
 * Fetches the file server-side to bypass CORS restrictions.
 * Usage: GET /api/data/materials/proxy?url=<encoded_moodle_fileurl>
 */
export async function GET(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileurl = searchParams.get('url');
    if (!fileurl) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    // Security: only allow fetching from the LMS domain
    if (!fileurl.startsWith(LMS_BASE) && !fileurl.startsWith('https://lms.s.isct.ac.jp/')) {
      return NextResponse.json({ error: 'invalid url domain' }, { status: 403 });
    }

    const { wstoken } = await getToken();
    const sep = fileurl.includes('?') ? '&' : '?';
    const fullUrl = `${fileurl}${sep}token=${wstoken}`;

    const resp = await fetch(fullUrl);
    if (!resp.ok) {
      return NextResponse.json({ error: `upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await resp.arrayBuffer());

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[materials/proxy]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
