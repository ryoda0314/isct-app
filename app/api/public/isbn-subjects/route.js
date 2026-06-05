import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { getDeptList } from '../../../../lib/api/syllabus-bulk.js';

/**
 * Public (shared-secret) lookup: ISBN -> academic subject classification.
 *
 * Used by the AntiTextNext marketplace to classify listings by 学院(school) + 系(dept)
 * without granting it direct access to this project's database. Only this endpoint is
 * exposed; the underlying syllabus tables stay service_role-only.
 *
 * Auth: header `x-api-key` must equal process.env.SUBJECTS_API_KEY.
 *
 * Body (POST): { isbns: string[] }  // 13-digit, no hyphens
 * Response: { subjects: { [isbn13]: Array<{ school, dept, dept_label }> } }
 *           (each (school,dept) pair de-duplicated per ISBN)
 */
export async function POST(request) {
  try {
    const expected = process.env.SUBJECTS_API_KEY;
    if (!expected) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    if (request.headers.get('x-api-key') !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const isbns = Array.isArray(body.isbns)
      ? [...new Set(body.isbns.filter((x) => typeof x === 'string' && /^97[89][0-9]{10}$/.test(x)))]
      : [];

    if (isbns.length === 0) {
      return NextResponse.json({ subjects: {} });
    }

    const sb = getSupabaseAdmin();

    // Step 1: ISBN13 -> books.id
    const { data: books, error: bookErr } = await sb
      .from('books')
      .select('id, isbn13')
      .in('isbn13', isbns);
    if (bookErr) {
      console.error('[ISBN-Subjects] books error:', bookErr);
      return NextResponse.json({ error: 'DB error', detail: bookErr.message }, { status: 500 });
    }
    const idToIsbn = new Map();
    for (const b of books || []) {
      if (b.isbn13) idToIsbn.set(b.id, b.isbn13);
    }
    if (idToIsbn.size === 0) {
      return NextResponse.json({ subjects: {} });
    }

    // Step 2: book_id -> course_code(s)
    const { data: links, error: linkErr } = await sb
      .from('course_books')
      .select('course_code, book_id')
      .in('book_id', [...idToIsbn.keys()])
      .in('status', ['pending', 'confirmed'])
      .not('book_id', 'is', null);
    if (linkErr) {
      console.error('[ISBN-Subjects] course_books error:', linkErr);
      return NextResponse.json({ error: 'DB error', detail: linkErr.message }, { status: 500 });
    }

    // course_code may carry a section suffix ("MEC.C201:B") -> strip to base code
    const baseCode = (code) => (code && code.includes(':') ? code.split(':')[0] : code);
    const baseCodes = [...new Set((links || []).map((l) => baseCode(l.course_code)).filter(Boolean))];
    if (baseCodes.length === 0) {
      return NextResponse.json({ subjects: {} });
    }

    // Step 3: course_code -> { dept, school }
    const { data: courses, error: courseErr } = await sb
      .from('syllabus_courses')
      .select('code, dept, school')
      .in('code', baseCodes);
    if (courseErr) {
      console.error('[ISBN-Subjects] syllabus_courses error:', courseErr);
      return NextResponse.json({ error: 'DB error', detail: courseErr.message }, { status: 500 });
    }
    const codeToSubject = new Map(); // base code -> { dept, school }
    for (const c of courses || []) {
      if (!c.code || codeToSubject.has(c.code)) continue;
      if (c.dept && c.school) codeToSubject.set(c.code, { dept: c.dept, school: c.school });
    }

    // dept key -> Japanese label (機械系 等)
    const deptLabel = new Map();
    for (const d of getDeptList().departments) deptLabel.set(d.key, d.label);

    // Step 4: accumulate distinct (school, dept) per ISBN
    const subjects = {}; // isbn13 -> Map("school|dept" -> {school, dept, dept_label})
    for (const l of links || []) {
      const isbn = idToIsbn.get(l.book_id);
      if (!isbn) continue;
      const subj = codeToSubject.get(baseCode(l.course_code));
      if (!subj) continue;
      const key = `${subj.school}|${subj.dept}`;
      if (!subjects[isbn]) subjects[isbn] = new Map();
      if (!subjects[isbn].has(key)) {
        subjects[isbn].set(key, {
          school: subj.school,
          dept: subj.dept,
          dept_label: deptLabel.get(subj.dept) || subj.dept,
        });
      }
    }

    const out = {};
    for (const [isbn, m] of Object.entries(subjects)) out[isbn] = [...m.values()];

    return NextResponse.json({ subjects: out });
  } catch (err) {
    console.error('[ISBN-Subjects] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error', detail: err.message }, { status: 500 });
  }
}
