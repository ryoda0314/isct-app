import React, { useState, useEffect, useMemo } from 'react';
import { T } from '../theme.js';
import { t } from '../i18n.js';
import { I } from '../icons.jsx';
import { Loader, Tag } from '../shared.jsx';

/**
 * マイ教科書ビュー
 *  - props.courses: App.jsx の allCourses (transformCourses 結果)
 *  - props.academicYear: App.jsx の _selY と連動
 *  - props.setAcademicYear: 年度変更
 */

// Cover gradient by ISBN hash (fallback when no cover_url)
const COVER_GRADIENTS = [
  ['#6375f0', '#7b8bf5'], ['#e5534b', '#f07670'], ['#3dae72', '#5cc28e'],
  ['#d4843e', '#e6a45f'], ['#a855c7', '#c478dd'], ['#2d9d8f', '#4ab8aa'],
  ['#c75d8e', '#dc7fa9'], ['#c6a236', '#dab958'], ['#61afef', '#84c2f3'],
];
const hashStr = (s) => { let h = 0; for (const c of (s || 'x')) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return Math.abs(h); };

// Convert ISBN-13 → ISBN-10 for Amazon image URLs
function isbn13to10(isbn13) {
  if (!isbn13 || !/^978\d{10}$/.test(isbn13)) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : check);
}

const BookCover = ({ book, size = 'md' }) => {
  const W = size === 'sm' ? 48 : 64;
  const H = size === 'sm' ? 68 : 90;
  const grad = COVER_GRADIENTS[hashStr(book?.isbn13 || book?.title) % COVER_GRADIENTS.length];
  const initial = (book?.title || '?').replace(/^[「『"]/, '').slice(0, 1);

  // Build fallback chain: stored cover_url → Amazon JP (.09 then .01) → letter gradient
  const isbn10 = book?.isbn13 ? isbn13to10(book.isbn13) : null;
  const amazonJp = isbn10 ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.09.LZZZZZZZ.jpg` : null;
  const amazonIntl = isbn10 ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg` : null;

  const sources = [book?.cover_url, amazonJp, amazonIntl].filter(Boolean);
  const [srcIdx, setSrcIdx] = React.useState(0);
  const currentSrc = sources[srcIdx];

  if (currentSrc) {
    return (
      <div style={{
        width: W, minWidth: W, height: H, borderRadius: 5, overflow: 'hidden',
        boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
        background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`,  // fallback bg during loading
        position: 'relative',
      }}>
        <img
          src={currentSrc}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setSrcIdx(srcIdx + 1)}
        />
      </div>
    );
  }
  return (
    <div style={{
      width: W, minWidth: W, height: H, borderRadius: 5,
      background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size === 'sm' ? 22 : 28, fontWeight: 700,
      boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
    }}>{initial}</div>
  );
};

const BookCard = ({ entry, kindAccent }) => {
  const b = entry.book;
  if (!b) return null;
  const isbn = b.isbn13;
  const amazonUrl = isbn ? `https://www.amazon.co.jp/s?k=${isbn}&i=stripbooks` : null;
  const ndlUrl = isbn ? `https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=${isbn}` : null;

  return (
    <div style={{
      display: 'flex', gap: 10, padding: 10,
      background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8,
      transition: 'border-color .15s, transform .15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = kindAccent; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.bd; }}>

      <BookCover book={b} size="md" />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: T.txH, lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', wordBreak: 'break-word', marginBottom: 4,
          }}>
            {b.title || t('textbook.unknownTitle')}
          </div>
          {b.author && (
            <div style={{
              fontSize: 11, color: T.tx, marginBottom: 2, lineHeight: 1.3,
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>{b.author}</div>
          )}
          {b.publisher && (
            <div style={{ fontSize: 10, color: T.txD, marginBottom: 4 }}>
              {b.publisher}{b.published_year ? ` · ${b.published_year}` : ''}
            </div>
          )}
        </div>

        <div>
          {/* Course list — clickable chips that link to syllabus */}
          <div style={{
            fontSize: 10, color: T.txD, marginBottom: 6,
            display: 'flex', gap: 4, flexWrap: 'wrap',
          }}>
            {entry.courses.slice(0, 3).map((c, i) => {
              const label = `${c.quarter ? `${c.quarter}Q ` : ''}${(c.name || '').slice(0, 18)}`;
              const chipStyle = {
                padding: '1px 6px', borderRadius: 8,
                background: `${kindAccent}14`, color: kindAccent,
                fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap',
                textDecoration: 'none', cursor: c.syllabus_url ? 'pointer' : 'default',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                border: 'none',
              };
              if (c.syllabus_url) {
                return (
                  <a key={i} href={c.syllabus_url} target="_blank" rel="noopener noreferrer"
                    title={t('textbook.syllabusOf', { name: c.name })} style={chipStyle}>
                    {label}
                    <span style={{ opacity: 0.6, fontSize: 8 }}>↗</span>
                  </a>
                );
              }
              return <span key={i} style={chipStyle}>{label}</span>;
            })}
            {entry.courses.length > 3 && (
              <span style={{ fontSize: 9, color: T.txD }}>+{entry.courses.length - 3}</span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {amazonUrl && (
              <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: 10, color: '#fff', textDecoration: 'none', fontWeight: 600,
                  background: '#ff9900', padding: '3px 8px', borderRadius: 4,
                }}>{t('textbook.viewOnAmazon')}</a>
            )}
            {ndlUrl && (
              <a href={ndlUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: 10, color: T.txD, textDecoration: 'none',
                  border: `1px solid ${T.bd}`, padding: '2px 6px', borderRadius: 4,
                }}>NDL</a>
            )}
            {isbn && (
              <span style={{ fontSize: 9, color: T.txD, fontFamily: 'monospace', marginLeft: 'auto' }}>
                {isbn}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, count, color, accent = false }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 2px', marginBottom: 10, marginTop: 18,
  }}>
    <div style={{
      width: 3, height: 16, borderRadius: 2, background: color,
    }} />
    <span style={{ fontSize: 13, fontWeight: 700, color: T.txH, letterSpacing: 0.3 }}>{title}</span>
    <span style={{
      padding: '1px 8px', borderRadius: 10, background: accent ? color : `${color}1c`,
      color: accent ? '#fff' : color, fontSize: 10, fontWeight: 700,
    }}>{count}</span>
    <div style={{ flex: 1, height: 1, background: T.bd, marginLeft: 4 }} />
  </div>
);

const Pill = ({ value, label, current, onClick }) => (
  <button
    onClick={() => onClick(value)}
    style={{
      padding: '5px 11px', borderRadius: 14, border: 'none', cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      background: current === value ? T.accent : T.bg3,
      color: current === value ? '#fff' : T.txD,
      transition: 'all .12s',
    }}>{label}</button>
);

// スライドトグル: 選択中の項目へインジケータが滑るセグメント型スイッチ (GradingView と同型)
const SlideToggle = ({ options, value, onChange }) => {
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div style={{
      position: 'relative', display: 'inline-flex',
      background: T.bg3, border: `1px solid ${T.bd}`,
      borderRadius: 14, padding: 2,
    }}>
      <div style={{
        position: 'absolute', top: 2, bottom: 2, left: 2,
        width: `calc((100% - 4px) / ${options.length})`,
        transform: `translateX(${idx * 100}%)`,
        background: T.accent, borderRadius: 12,
        transition: 'transform .18s ease',
      }} />
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            position: 'relative', zIndex: 1, flex: 1,
            border: 'none', background: 'none', cursor: 'pointer',
            padding: '4px 14px', fontSize: 11, fontWeight: 700,
            color: value === o.value ? '#fff' : T.txD,
            transition: 'color .18s', whiteSpace: 'nowrap',
          }}>{o.label}</button>
      ))}
    </div>
  );
};

// アクティブ時にアクセントカラーで縁取りされるコンパクトなセレクトボックス
const FilterSelect = ({ value, onChange, active, children }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    style={{
      padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 500,
      cursor: 'pointer',
      background: active ? `${T.accent}1a` : T.bg3,
      color: active ? T.accent : T.txH,
      border: `1px solid ${active ? T.accent : T.bd}`,
      maxWidth: 180,
    }}>
    {children}
  </select>
);

// =============================================================
// マイ教科書タブ (履修中の講義の教科書のみ)
// =============================================================
const MyTextbooksPanel = ({ courses = [], academicYear, setAcademicYear }) => {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState({ courses: [], books: [], summary: {} });
  const [quarter, setQuarter] = useState('');

  const currentJpYear = useMemo(() => {
    const jd = new Date(Date.now() + 9 * 3600000);
    return jd.getUTCMonth() >= 3 ? jd.getUTCFullYear() : jd.getUTCFullYear() - 1;
  }, []);
  const year = academicYear || currentJpYear;
  const yearStr = String(year);

  const yearCourses = useMemo(() => {
    return (courses || []).filter(c => {
      if (!c || !c.code) return false;
      if (!c.year) return true;
      return c.year === year;
    });
  }, [courses, year]);

  const load = async (q = quarter, y = yearStr) => {
    setLoading(true); setErr(null);
    try {
      const payload = yearCourses
        .filter(c => c && c.code && !/^\d{6}$/.test(c.section || ''))
        .map(c => ({
          code: c.code, section: c.section || null,
          name: c.name || c.code, quarter: c.quarter || null,
          // 複数クォーター科目(例:1-2Q)がクォーター絞り込みで消えないよう全クォーターを送る
          quarters: (c.quarters?.length ? c.quarters : (c.quarter ? [c.quarter] : [])),
        }));

      const r = await fetch('/api/data/my-textbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courses: payload, year: y, quarter: q }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${j.detail || j.error || ''}`);
      setData(j);
    } catch (e) {
      console.error('[TextbooksView]', e);
      setErr(e.message || t('textbook.loadFailed'));
    }
    setLoading(false);
  };

  useEffect(() => { load(quarter, yearStr); /* eslint-disable-next-line */ }, [quarter, yearStr, yearCourses.length]);

  const availableYears = useMemo(() => {
    const years = new Set();
    for (const c of (courses || [])) if (c?.year) years.add(c.year);
    years.add(currentJpYear);
    return [...years].sort((a, b) => b - a);
  }, [courses, currentJpYear]);

  const { textbooks, references } = useMemo(() => {
    const tx = [], rf = [];
    for (const b of (data.books || [])) {
      if (b.isTextbook) tx.push(b);
      else if (b.isReference) rf.push(b);
    }
    return { textbooks: tx, references: rf };
  }, [data.books]);

  // Estimate budget (simple heuristic — no price data so this is a placeholder)
  const totalBooks = textbooks.length + references.length;

  // 履修教科書の ISBN13 + タイトルを textnext へ渡すための一覧（重複・無効ISBN除去）
  const textnextBaseUrl = (process.env.NEXT_PUBLIC_TEXTNEXT_URL || 'https://textnext.jp').replace(/\/+$/, '');
  const textnextBooks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const entry of (data.books || [])) {
      const isbn = String(entry?.book?.isbn13 || '').replace(/[^0-9]/g, '');
      if (!/^97[89]\d{10}$/.test(isbn) || seen.has(isbn)) continue;
      seen.add(isbn);
      out.push({ i: isbn, t: entry.book?.title || '' });
    }
    return out;
  }, [data.books]);

  const openInTextnext = () => {
    if (textnextBooks.length === 0) return;
    // textnext 側の decodeBooksParam と対になる base64url(UTF-8 JSON) エンコード
    const bytes = new TextEncoder().encode(JSON.stringify(textnextBooks));
    let bin = '';
    for (const byte of bytes) bin += String.fromCharCode(byte);
    const d = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.open(`${textnextBaseUrl}/textbooks?d=${d}`, '_blank', 'noopener');
  };

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: T.bg, padding: '12px 14px 10px',
        borderBottom: `1px solid ${T.bd}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          {availableYears.length > 1 && setAcademicYear ? (
            <select value={year} onChange={(e) => setAcademicYear(Number(e.target.value))}
              style={{
                fontSize: 12, fontWeight: 600, color: T.txH, background: T.bg3,
                border: `1px solid ${T.bd}`, borderRadius: 6, padding: '3px 8px',
                cursor: 'pointer',
              }}>
              {availableYears.map(y => <option key={y} value={y}>{t('textbook.yearLabel', { year: y })}</option>)}
            </select>
          ) : (
            <div style={{
              fontSize: 11, color: T.txD, background: T.bg3,
              padding: '3px 8px', borderRadius: 10,
            }}>{t('textbook.yearLabel', { year })}</div>
          )}
          <div style={{ flex: 1 }} />
          {!loading && totalBooks > 0 && (
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <div>
                <span style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>{textbooks.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>{t('textbook.required')}</span>
              </div>
              <div>
                <span style={{ color: T.txH, fontWeight: 700, fontSize: 14 }}>{references.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>{t('textbook.reference')}</span>
              </div>
              <div>
                <span style={{ color: T.txH, fontWeight: 700, fontSize: 14 }}>{yearCourses.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>{t('textbook.courses')}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill value="" label={t('textbook.allQuarters')} current={quarter} onClick={setQuarter} />
          {[1, 2, 3, 4].map(q => (
            <Pill key={q} value={String(q)} label={`${q}Q`} current={quarter} onClick={setQuarter} />
          ))}
          {!loading && textnextBooks.length > 0 && (
            <button
              onClick={openInTextnext}
              title={t('textbook.searchTextnextHint')}
              style={{
                marginLeft: 'auto', padding: '5px 12px', borderRadius: 14,
                border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                color: '#fff', background: T.accent,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'all .12s',
              }}>
              <span style={{ display: 'flex', transform: 'scale(0.8)' }}>{I.search}</span>
              {t('textbook.searchTextnext')}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 14px 16px' }}>
        {loading && <div style={{ padding: 20 }}><Loader msg={t('textbook.aggregating')} size="sm" /></div>}
        {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>{t('textbook.errorPrefix')}{err}</div>}

        {!loading && !err && (courses?.length || 0) === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.inbox}</div>
            {t('textbook.noCoursesLoaded')}
          </div>
        )}

        {!loading && !err && (courses?.length || 0) > 0 && yearCourses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.cal}</div>
            {t('textbook.noCoursesInYear', { year })}
          </div>
        )}

        {!loading && !err && yearCourses.length > 0 && textbooks.length === 0 && references.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.book}</div>
            {year !== 2026 ? (
              <>{t('textbook.noDataForYear', { year })}<br/>
                <span style={{ fontSize: 11 }}>{t('textbook.only2026Note')}</span></>
            ) : (
              t('textbook.noMatchingBooks')
            )}
          </div>
        )}

        {!loading && textbooks.length > 0 && (
          <>
            <SectionHeader title={t('textbook.sectionTextbooks')} count={textbooks.length} color={T.accent} accent />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 8,
            }}>
              {textbooks.map((entry, idx) => (
                <BookCard
                  key={`tx-${entry.book?.isbn13 || entry.book?.id}-${idx}`}
                  entry={entry}
                  kindAccent={T.accent}
                />
              ))}
            </div>
          </>
        )}

        {!loading && references.length > 0 && (
          <>
            <SectionHeader title={t('textbook.sectionReferences')} count={references.length} color={T.txD} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 8,
            }}>
              {references.map((entry, idx) => (
                <BookCard
                  key={`rf-${entry.book?.isbn13 || entry.book?.id}-${idx}`}
                  entry={entry}
                  kindAccent={T.txD}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// =============================================================
// 全科目検索タブ (DB全件から学系/学年/Quarter/種別で絞り込み)
//   成績割合の SearchGradingPanel と同型。学系メタは grading-search?meta=1 を再利用。
// =============================================================
const SearchTextbooksPanel = () => {
  const [meta, setMeta] = useState({ depts: [] });
  const [metaLoading, setMetaLoading] = useState(true);
  const year = '2026'; // 教科書DBは当面2026年度のみ
  const [deptCat, setDeptCat] = useState('senmon'); // 'senmon' | 'kyoyo'
  const [dept, setDept] = useState('');
  const [quarter, setQuarter] = useState('');
  const [level, setLevel] = useState('');
  const [kind, setKind] = useState(''); // '' | 'textbook' | 'reference'
  const [search, setSearch] = useState('');
  const [searchDeferred, setSearchDeferred] = useState('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState({ books: [], total: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // 学系リストは成績割合と同じ syllabus_courses 由来なので meta エンドポイントを共用
  useEffect(() => {
    (async () => {
      setMetaLoading(true);
      try {
        const r = await fetch('/api/data/grading-search?meta=1', { credentials: 'include' });
        const j = await r.json();
        if (r.ok) setMeta(j);
      } catch (e) { console.error('[TextbooksView/meta]', e); }
      setMetaLoading(false);
    })();
  }, []); // eslint-disable-line

  // debounce search
  useEffect(() => {
    const tm = setTimeout(() => setSearchDeferred(search), 250);
    return () => clearTimeout(tm);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ year });
      if (dept) params.set('dept', dept);
      if (quarter) params.set('quarter', quarter);
      if (level) params.set('level', level);
      if (kind) params.set('kind', kind);
      if (searchDeferred) params.set('search', searchDeferred);
      params.set('page', String(page));
      const r = await fetch(`/api/data/textbook-search?${params}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      console.error('[TextbooksView/search]', e);
      setErr(e.message || t('textbook.loadFailed'));
    }
    setLoading(false);
  }, [year, dept, quarter, level, kind, searchDeferred, page]);

  useEffect(() => { load(); }, [load]);

  // フィルタ変更時はページを先頭に戻す
  useEffect(() => { setPage(0); }, [dept, deptCat, quarter, level, kind, searchDeferred]);

  // school 名に「教養」を含むものを教養カテゴリとみなす
  const isKyoyoSchool = (school) => (school || '').includes('教養');

  const deptsBySchool = useMemo(() => {
    const m = {};
    for (const d of (meta.depts || [])) {
      const kyoyo = isKyoyoSchool(d.school);
      if ((deptCat === 'kyoyo') !== kyoyo) continue;
      const s = d.school || 'その他';
      if (!m[s]) m[s] = [];
      m[s].push(d);
    }
    return m;
  }, [meta.depts, deptCat]);

  // カテゴリ切替時、選択中の学系が新カテゴリに属さなければクリア
  useEffect(() => {
    if (!dept) return;
    const d = (meta.depts || []).find(x => x.key === dept);
    if (d && (deptCat === 'kyoyo') !== isKyoyoSchool(d.school)) setDept('');
  }, [deptCat]); // eslint-disable-line

  const books = data.books || [];

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: T.bg, padding: '10px 14px',
        borderBottom: `1px solid ${T.bd}`,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: T.txD, background: T.bg3, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.bd}` }}>{t('textbook.yearLabel', { year })}</div>
          <SlideToggle
            value={deptCat}
            onChange={setDeptCat}
            options={[
              { value: 'senmon', label: t('grading.senmon') },
              { value: 'kyoyo', label: t('grading.kyoyo') },
            ]}
          />
          <FilterSelect value={dept} onChange={setDept} active={!!dept}>
            <option value="">{deptCat === 'kyoyo' ? t('grading.allKyoyo') : t('grading.allDepts')}</option>
            {Object.entries(deptsBySchool).map(([school, ds]) => (
              <optgroup key={school} label={school === 'その他' ? t('grading.otherSchool') : school}>
                {ds.map(d => (
                  <option key={d.key} value={d.key}>
                    {d.label ? `${d.label} (${d.key})` : d.key}
                  </option>
                ))}
              </optgroup>
            ))}
          </FilterSelect>
          <FilterSelect value={level} onChange={setLevel} active={!!level}>
            <option value="">{t('grading.allLevels')}</option>
            <option value="1">{t('grading.level100Year')}</option>
            <option value="2">{t('grading.level200Year')}</option>
            <option value="3">{t('grading.level300Year')}</option>
            <option value="4">{t('grading.level400Year')}</option>
            <option value="5">{t('grading.level500Year')}</option>
            <option value="6">{t('grading.level600Year')}</option>
          </FilterSelect>
          <FilterSelect value={quarter} onChange={setQuarter} active={!!quarter}>
            <option value="">{t('grading.allQuarters')}</option>
            <option value="1Q">1Q</option>
            <option value="2Q">2Q</option>
            <option value="3Q">3Q</option>
            <option value="4Q">4Q</option>
          </FilterSelect>
          <input
            type="text" placeholder={t('textbook.searchPlaceholder')}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 140, padding: '5px 10px', borderRadius: 6,
              background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 12,
            }}/>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <Pill value="" label={t('textbook.filterAll')} current={kind} onClick={setKind} />
          <Pill value="textbook" label={t('textbook.filterTextbook')} current={kind} onClick={setKind} />
          <Pill value="reference" label={t('textbook.filterReference')} current={kind} onClick={setKind} />
        </div>
      </div>

      <div style={{ padding: '12px 14px 16px' }}>
        {metaLoading && <div style={{ padding: 20 }}><Loader msg={t('grading.loadingMeta')} size="sm" /></div>}
        {loading && <div style={{ padding: 20 }}><Loader msg={t('textbook.searching')} size="sm" /></div>}
        {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>{t('textbook.errorPrefix')}{err}</div>}

        {!loading && !err && (
          <>
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>
              {t('textbook.hitCount', { total: data.total })} {data.hasMore && t('grading.hasMore')}
            </div>

            {books.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
                <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.book}</div>
                {t('textbook.noSearchResults')}
                <div style={{ fontSize: 11, marginTop: 8 }}>{t('textbook.searchHint')}</div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 8,
              }}>
                {books.map((entry, idx) => (
                  <BookCard
                    key={`sr-${entry.book?.isbn13 || entry.book?.id}-${idx}`}
                    entry={entry}
                    kindAccent={entry.isTextbook ? T.accent : T.txD}
                  />
                ))}
              </div>
            )}

            {data.total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH,
                    cursor: page === 0 ? 'default' : 'pointer', fontSize: 12,
                    opacity: page === 0 ? 0.4 : 1,
                  }}>{t('grading.prevPage')}</button>
                <span style={{ alignSelf: 'center', fontSize: 11, color: T.txD }}>
                  {t('grading.pageNum', { page: page + 1 })}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.hasMore}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH,
                    cursor: !data.hasMore ? 'default' : 'pointer', fontSize: 12,
                    opacity: !data.hasMore ? 0.4 : 1,
                  }}>{t('grading.nextPage')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// =============================================================
// 親コンポーネント (タブ切替)
// =============================================================
export const TextbooksView = ({ courses = [], academicYear, setAcademicYear }) => {
  const [tab, setTab] = useState('my'); // 'my' | 'search'

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '12px 14px 0',
        borderBottom: `1px solid ${T.bd}`, background: T.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: T.accent, display: 'flex' }}>{I.book}</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.txH, letterSpacing: 0.3 }}>{t('nav.textbooks')}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'my', labelKey: 'textbook.tabMy' },
            { id: 'search', labelKey: 'textbook.tabSearch' },
          ].map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              style={{
                padding: '8px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === tabItem.id ? `2px solid ${T.accent}` : '2px solid transparent',
                color: tab === tabItem.id ? T.txH : T.txD,
                fontSize: 13, fontWeight: tab === tabItem.id ? 700 : 500,
                transition: 'color .12s',
              }}>{t(tabItem.labelKey)}</button>
          ))}
        </div>
      </div>

      {tab === 'my'
        ? <MyTextbooksPanel courses={courses} academicYear={academicYear} setAcademicYear={setAcademicYear} />
        : <SearchTextbooksPanel />}
    </div>
  );
};

export default TextbooksView;
