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

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await resp.arrayBuffer());

    // Moodle's pluginfile serves errors (e.g. filenotfound when a resource was
    // replaced) as a JSON body — sometimes even with HTTP 200 — instead of the
    // file. Detect and surface a clean signal so the client can show a friendly
    // message + refresh the stale list, rather than feeding the error JSON into
    // the PDF viewer or dumping a raw stacktrace into a browser tab.
    if (contentType.includes('application/json') || buf[0] === 0x7b /* { */) {
      try {
        const j = JSON.parse(buf.toString('utf8'));
        if (j && typeof j.errorcode === 'string' && 'reproductionlink' in j) {
          return NextResponse.json(
            { error: j.error || 'file unavailable', errorcode: j.errorcode },
            { status: j.errorcode === 'filenotfound' ? 404 : 403 }
          );
        }
      } catch { /* not a Moodle error envelope — fall through and serve it */ }
    }

    if (!resp.ok) {
      return NextResponse.json({ error: `upstream ${resp.status}`, errorcode: 'upstream' }, { status: resp.status });
    }

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
