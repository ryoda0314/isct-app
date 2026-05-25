import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

/**
 * Look up textbooks for the user's enrolled courses.
 *
 * Body (POST): { courses: [{ code, section?, name?, quarter? }], year?, quarter?, kind? }
 *  - `courses`: course list extracted client-side from Moodle's response.
 *    Each item: { code: "CAP.H201", section: "B"|null, name: "...", quarter: 1|2|3|4|null }
 *  - `year` (query/body): syllabus year, default "2026"
 *  - `quarter` (query): "1"|"2"|"3"|"4" filter — only books for courses in this Q
 *  - `kind` (query): "textbook"|"reference" filter
 *
 * Server-side Moodle calls fail with 403 (LMS blocks server IPs), so we
 * accept the course list from the client and only do the DB lookup here.
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const year = String(body.year || searchParams.get('year') || '2026');
    const quarterFilter = String(body.quarter || searchParams.get('quarter') || '');
    const kindFilter = String(body.kind || searchParams.get('kind') || '');
    const courses = Array.isArray(body.courses) ? body.courses : [];

    if (courses.length === 0) {
      return NextResponse.json({ courses: [], books: [], summary: { textbook: 0, reference: 0, total_books: 0 } });
    }

    // Build lookup keys: prefer `${code}:${section}`, also include bare `code` as fallback
    const keysToCourse = new Map();
    for (const c of courses) {
      if (!c?.code || typeof c.code !== 'string') continue;
      const meta = { code: c.code, section: c.section || null, name: c.name || c.code, quarter: c.quarter || null };
      if (meta.section) {
        const k = `${meta.code}:${meta.section}`;
        if (!keysToCourse.has(k)) keysToCourse.set(k, meta);
      }
      if (!keysToCourse.has(meta.code)) keysToCourse.set(meta.code, meta);
    }
    const allKeys = [...keysToCourse.keys()];
    if (allKeys.length === 0) {
      return NextResponse.json({ courses: [], books: [], summary: { textbook: 0, reference: 0, total_books: 0 } });
    }

    const sb = getSupabaseAdmin();
    let q = sb.from('course_books')
      .select('id, course_code, kind, raw_line, confidence, status, books:book_id(id, isbn13, title, author, publisher, published_year, cover_url)')
      .eq('syllabus_year', year)
      .in('status', ['pending', 'confirmed'])
      .not('book_id', 'is', null)
      .in('course_code', allKeys);
    if (kindFilter) q = q.eq('kind', kindFilter);

    const { data, error } = await q;
    if (error) {
      console.error('[MyTextbooks] DB error:', error);
      return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
    }

    const byCourse = new Map();
    for (const row of (data || [])) {
      const meta = keysToCourse.get(row.course_code);
      if (!meta) continue;
      if (quarterFilter && meta.quarter && String(meta.quarter) !== quarterFilter) continue;
      const key = row.course_code;
      if (!byCourse.has(key)) byCourse.set(key, { course_code: key, course: meta, items: [] });
      byCourse.get(key).items.push({
        id: row.id, kind: row.kind, raw_line: row.raw_line,
        confidence: row.confidence, book: row.books,
      });
    }

    const sortedCourses = [...byCourse.values()].sort((a, b) =>
      (a.course.quarter || 9) - (b.course.quarter || 9) ||
      (a.course.name || '').localeCompare(b.course.name || '', 'ja')
    );

    const booksMap = new Map();
    let nTextbook = 0, nReference = 0;
    for (const c of sortedCourses) {
      for (const it of c.items) {
        if (!it.book) continue;
        const isbn = it.book.isbn13 || `null:${it.book.id}`;
        if (!booksMap.has(isbn)) booksMap.set(isbn, { book: it.book, courses: [], kinds: new Set() });
        const e = booksMap.get(isbn);
        e.courses.push({ course_code: c.course_code, name: c.course.name, quarter: c.course.quarter, kind: it.kind });
        e.kinds.add(it.kind);
        if (it.kind === 'textbook') nTextbook++;
        else if (it.kind === 'reference') nReference++;
      }
    }

    const books = [...booksMap.values()].map(e => ({
      book: e.book,
      courses: e.courses,
      isTextbook: e.kinds.has('textbook'),
      isReference: e.kinds.has('reference'),
    })).sort((a, b) => Number(b.isTextbook) - Number(a.isTextbook));

    return NextResponse.json({
      courses: sortedCourses,
      books,
      summary: { textbook: nTextbook, reference: nReference, total_books: books.length },
      year,
    });
  } catch (err) {
    console.error('[MyTextbooks] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error', detail: err.message }, { status: 500 });
  }
}
