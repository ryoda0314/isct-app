import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

const PAGE_SIZE = 40;

/**
 * 全科目から教科書/参考書を検索/絞り込み。
 * 成績割合の /api/data/grading-search と同じく syllabus_courses を
 * 学系(dept)/レベル(学年)/Quarter/フリーワードで絞り、course_books と JOIN する。
 * 結果は「書籍」単位でまとめ (my-textbooks の books と同じ shape)、ページングして返す。
 *
 * 学系リスト等のメタデータは grading-search?meta=1 が同じ syllabus_courses を
 * 走査するため、クライアントはそちらを再利用する (ここでは meta を実装しない)。
 *
 * Query params:
 *   year     — シラバス年度 (default 2026 / 現状 DB は 2026 のみ)
 *   dept     — 学系コード (e.g. "MEC", "CSC")
 *   quarter  — "1Q".."4Q"
 *   level    — "1".."6" = 100番台..600番台 (学年帯)
 *   kind     — "textbook" | "reference"
 *   search   — 科目コード/名の部分一致
 *   page     — 0始まり
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const year = String(searchParams.get('year') || '2026');
    const dept = searchParams.get('dept') || '';
    const quarter = searchParams.get('quarter') || '';
    const level = searchParams.get('level') || '';
    const kind = searchParams.get('kind') || '';
    const search = (searchParams.get('search') || '').slice(0, 100).replace(/[,%()]/g, '');
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));

    const sb = getSupabaseAdmin();

    // 1) syllabus_courses を dept/quarter/level/search で絞る (grading-search と同ロジック)
    let courseQuery = sb.from('syllabus_courses')
      .select('code, section, name, dept, quarter, school, syllabus_url')
      .eq('year', year);
    if (dept) courseQuery = courseQuery.eq('dept', dept);
    if (quarter) {
      const digit = quarter.replace(/[Qq]/, '');
      if (/^[1-4]$/.test(digit)) {
        courseQuery = courseQuery.or([
          `quarter.eq.${digit}Q`,
          `quarter.like.${digit}-%`,
          `quarter.like.%-${digit}Q`,
          `quarter.like.${digit}・%`,
          `quarter.like.%・${digit}Q`,
        ].join(','));
      }
    }
    if (level && /^[1-9]$/.test(level)) {
      // 科目コード "MEC.A211" のサブ番号の最初の数字 = レベル (学年帯)
      courseQuery = courseQuery.filter('code', 'match', `\\.[A-Z]${level}[0-9]{2}`);
    }
    if (search) courseQuery = courseQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    const { data: courseRows, error: courseErr } = await courseQuery.limit(4000);
    if (courseErr) {
      console.error('[textbook-search] syllabus query error:', courseErr.message);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // course_books.course_code は "code" または "code:section" の両形式を取りうる
    const courseMeta = new Map();   // lookupKey → meta
    const syllabusByKey = new Map(); // lookupKey → syllabus_url
    const lookupKeys = new Set();
    for (const c of (courseRows || [])) {
      const meta = { code: c.code, section: c.section || null, name: c.name, quarter: c.quarter, dept: c.dept, school: c.school };
      const sectionKey = c.section ? `${c.code}:${c.section}` : null;
      if (sectionKey) {
        if (!courseMeta.has(sectionKey)) courseMeta.set(sectionKey, meta);
        if (c.syllabus_url && !syllabusByKey.has(sectionKey)) syllabusByKey.set(sectionKey, c.syllabus_url);
        lookupKeys.add(sectionKey);
      }
      if (!courseMeta.has(c.code)) courseMeta.set(c.code, meta);
      if (c.syllabus_url && !syllabusByKey.has(c.code)) syllabusByKey.set(c.code, c.syllabus_url);
      lookupKeys.add(c.code);
    }

    if (lookupKeys.size === 0) {
      return NextResponse.json({ books: [], total: 0, page, pageSize: PAGE_SIZE, hasMore: false });
    }

    // 2) course_books を該当キーで引く (in() の上限があるためチャンク分割)
    const keysArr = [...lookupKeys];
    const CHUNK = 300;
    let allBooks = [];
    for (let i = 0; i < keysArr.length; i += CHUNK) {
      const chunk = keysArr.slice(i, i + CHUNK);
      let q = sb.from('course_books')
        .select('id, course_code, kind, books:book_id(id, isbn13, title, author, publisher, published_year, cover_url)')
        .eq('syllabus_year', year)
        .in('status', ['pending', 'confirmed'])
        .not('book_id', 'is', null)
        .in('course_code', chunk);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) {
        console.error('[textbook-search] course_books query error:', error.message);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
      if (data) allBooks = allBooks.concat(data);
    }

    // 3) 書籍単位でまとめる (my-textbooks の books と同 shape)
    const booksMap = new Map();
    for (const row of allBooks) {
      const meta = courseMeta.get(row.course_code);
      if (!meta || !row.books) continue;
      const isbn = row.books.isbn13 || `null:${row.books.id}`;
      if (!booksMap.has(isbn)) booksMap.set(isbn, { book: row.books, courses: [], kinds: new Set(), seenCourses: new Set() });
      const e = booksMap.get(isbn);
      // 同一書籍×同一講義の重複 (code と code:section の両ヒット) を抑制
      const dedupKey = `${meta.code}:${meta.section || ''}`;
      if (e.seenCourses.has(dedupKey)) { e.kinds.add(row.kind); continue; }
      e.seenCourses.add(dedupKey);
      e.courses.push({
        course_code: meta.code,
        name: meta.name,
        // syllabus_courses.quarter は "1Q"/"1-2Q" 形式。BookCard 側が "Q" を付けるため末尾の Q を落とす
        quarter: meta.quarter ? String(meta.quarter).replace(/Q\s*$/i, '') : null,
        dept: meta.dept,
        kind: row.kind,
        syllabus_url: syllabusByKey.get(row.course_code) || syllabusByKey.get(meta.code) || null,
      });
      e.kinds.add(row.kind);
    }

    const qNum = (q) => { const m = String(q || '').match(/\d/); return m ? Number(m[0]) : 9; };
    let books = [...booksMap.values()].map(e => ({
      book: e.book,
      courses: e.courses.sort((a, b) => qNum(a.quarter) - qNum(b.quarter) || (a.name || '').localeCompare(b.name || '', 'ja')),
      isTextbook: e.kinds.has('textbook'),
      isReference: e.kinds.has('reference'),
    }));

    // 教科書を先に、次に採用講義数が多い順、最後にタイトル順
    books.sort((a, b) =>
      Number(b.isTextbook) - Number(a.isTextbook) ||
      b.courses.length - a.courses.length ||
      (a.book?.title || '').localeCompare(b.book?.title || '', 'ja')
    );

    const total = books.length;
    const start = page * PAGE_SIZE;
    const paged = books.slice(start, start + PAGE_SIZE);

    return NextResponse.json({
      books: paged,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasMore: start + PAGE_SIZE < total,
    });
  } catch (err) {
    console.error('[textbook-search] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error', detail: err.message }, { status: 500 });
  }
}
