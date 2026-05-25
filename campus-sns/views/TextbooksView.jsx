import React, { useState, useEffect, useMemo } from 'react';
import { T } from '../theme.js';
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

const BookCover = ({ book, size = 'md' }) => {
  const W = size === 'sm' ? 48 : 64;
  const H = size === 'sm' ? 68 : 90;
  const grad = COVER_GRADIENTS[hashStr(book?.isbn13 || book?.title) % COVER_GRADIENTS.length];
  const initial = (book?.title || '?').replace(/^[「『"]/, '').slice(0, 1);

  if (book?.cover_url) {
    return (
      <div style={{
        width: W, minWidth: W, height: H, borderRadius: 5, overflow: 'hidden',
        boxShadow: '0 2px 5px rgba(0,0,0,0.12)', background: T.bg3,
      }}>
        <img src={book.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            {b.title || '(タイトル不明)'}
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
          {/* Course list */}
          <div style={{
            fontSize: 10, color: T.txD, marginBottom: 6,
            display: 'flex', gap: 4, flexWrap: 'wrap',
          }}>
            {entry.courses.slice(0, 3).map((c, i) => (
              <span key={i} style={{
                padding: '1px 6px', borderRadius: 8,
                background: `${kindAccent}14`, color: kindAccent,
                fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap',
              }}>
                {c.quarter ? `${c.quarter}Q ` : ''}{(c.name || '').slice(0, 18)}
              </span>
            ))}
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
                }}>Amazon で見る</a>
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

export const TextbooksView = ({ courses = [], academicYear, setAcademicYear }) => {
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
      setErr(e.message || '読み込みに失敗しました');
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

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: T.bg, padding: '12px 14px 10px',
        borderBottom: `1px solid ${T.bd}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.accent, display: 'flex' }}>{I.book}</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: T.txH, letterSpacing: 0.3 }}>マイ教科書</span>
          </div>
          {availableYears.length > 1 && setAcademicYear ? (
            <select value={year} onChange={(e) => setAcademicYear(Number(e.target.value))}
              style={{
                fontSize: 12, fontWeight: 600, color: T.txH, background: T.bg3,
                border: `1px solid ${T.bd}`, borderRadius: 6, padding: '3px 8px',
                cursor: 'pointer',
              }}>
              {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
            </select>
          ) : (
            <div style={{
              fontSize: 11, color: T.txD, background: T.bg3,
              padding: '3px 8px', borderRadius: 10,
            }}>{year}年度</div>
          )}
          <div style={{ flex: 1 }} />
          {!loading && totalBooks > 0 && (
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <div>
                <span style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>{textbooks.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>必修</span>
              </div>
              <div>
                <span style={{ color: T.txH, fontWeight: 700, fontSize: 14 }}>{references.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>参考</span>
              </div>
              <div>
                <span style={{ color: T.txH, fontWeight: 700, fontSize: 14 }}>{yearCourses.length}</span>
                <span style={{ color: T.txD, marginLeft: 3 }}>講義</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Pill value="" label="全Q" current={quarter} onClick={setQuarter} />
          {[1, 2, 3, 4].map(q => (
            <Pill key={q} value={String(q)} label={`${q}Q`} current={quarter} onClick={setQuarter} />
          ))}
        </div>
      </div>

      <div style={{ padding: '0 14px 16px' }}>
        {loading && <div style={{ padding: 20 }}><Loader msg="教科書を集計中" size="sm" /></div>}
        {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>エラー: {err}</div>}

        {!loading && !err && (courses?.length || 0) === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.inbox}</div>
            履修中の講義が読み込まれていません
          </div>
        )}

        {!loading && !err && (courses?.length || 0) > 0 && yearCourses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.cal}</div>
            {year}年度に履修中の講義はありません
          </div>
        )}

        {!loading && !err && yearCourses.length > 0 && textbooks.length === 0 && references.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            <div style={{ color: T.bd, display: 'flex', justifyContent: 'center', marginBottom: 10, transform: 'scale(2)' }}>{I.book}</div>
            {year !== 2026 ? (
              <>{year}年度の教科書データは現在登録されていません<br/>
                <span style={{ fontSize: 11 }}>(2026年度シラバスのみ DB 整備済み)</span></>
            ) : (
              '条件に合う教科書はありません'
            )}
          </div>
        )}

        {!loading && textbooks.length > 0 && (
          <>
            <SectionHeader title="教科書 (必修)" count={textbooks.length} color={T.accent} accent />
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
            <SectionHeader title="参考書" count={references.length} color={T.txD} />
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
