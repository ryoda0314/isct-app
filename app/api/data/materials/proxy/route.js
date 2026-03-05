import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth/require-auth.js';

/**
 * Proxy endpoint for Moodle file downloads.
 * Fetches the file server-side to bypass CORS restrictions.
 * Usage: GET /api/data/materials/proxy?url=<encoded_moodle_fileurl>
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const fileurl = searchParams.get('url');
    if (!fileurl) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    // Security: parse URL and validate hostname to prevent SSRF
    let parsed;
    try {
      parsed = new URL(fileurl);
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    if (parsed.hostname !== 'lms.s.isct.ac.jp') {
      return NextResponse.json({ error: 'invalid url domain' }, { status: 403 });
    }

    const { wstoken } = auth;
    const sep = fileurl.includes('?') ? '&' : '?';
    const fullUrl = `${fileurl}${sep}token=${wstoken}`;

    const resp = await fetch(fullUrl, { redirect: 'error' });
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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
