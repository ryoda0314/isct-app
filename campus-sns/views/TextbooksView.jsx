import React, { useState, useEffect, useMemo } from 'react';
import { T } from '../theme.js';
import { Loader, Tag } from '../shared.jsx';

/**
 * マイ教科書ビュー
 *  - props.courses: App.jsx の allCourses (transformCourses 結果)
 *    各要素は { code, section, name, quarter, ... } を持つ。
 *  - section は Moodle fullname の【XX】から抽出される。
 *  - クライアント側で取得済みの履修データをサーバへ POST し、
 *    サーバは course_books DB の lookup のみ行う (Moodle 再呼び出しなし)。
 */

const BookCard = ({ entry, kindLabel, kindColor }) => {
  const b = entry.book;
  if (!b) return null;
  const isbn = b.isbn13;
  const amazonUrl = isbn ? `https://www.amazon.co.jp/s?k=${isbn}&i=stripbooks` : null;
  const ndlUrl = isbn ? `https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=${isbn}` : null;
  return (
    <div style={{
      display: 'flex', gap: 12, padding: 12, marginBottom: 8,
      background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8,
    }}>
      <div style={{
        width: 60, minWidth: 60, height: 84,
        background: T.bg3, borderRadius: 4, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {b.cover_url
          ? <img src={b.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 24, opacity: 0.3 }}>📖</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {kindLabel && (
          <div style={{ marginBottom: 4 }}>
            <Tag color={kindColor}>{kindLabel}</Tag>
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, lineHeight: 1.3, marginBottom: 4 }}>
          {b.title || '(タイトル不明)'}
        </div>
        {b.author && <div style={{ fontSize: 11, color: T.tx, marginBottom: 2 }}>{b.author}</div>}
        {b.publisher && (
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>
            {b.publisher}{b.published_year ? ` (${b.published_year})` : ''}
          </div>
        )}
        <div style={{ fontSize: 10, color: T.txD, marginBottom: 6 }}>
          {entry.courses.map((c, i) => (
            <span key={i} style={{ marginRight: 8 }}>
              {c.quarter ? `${c.quarter}Q ` : ''}{c.name}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isbn && <span style={{ fontSize: 10, color: T.txD, fontFamily: 'monospace' }}>ISBN {isbn}</span>}
          {amazonUrl && (
            <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: T.accent, textDecoration: 'none', fontWeight: 600 }}>
              🛒 Amazon
            </a>
          )}
          {ndlUrl && (
            <a href={ndlUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: T.txD, textDecoration: 'none' }}>
              📚 NDL
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon, title, count, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 4px', marginBottom: 8, marginTop: 16,
    borderBottom: `2px solid ${color}40`,
  }}>
    <span style={{ fontSize: 18 }}>{icon}</span>
    <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{title}</span>
    <span style={{
      padding: '2px 8px', borderRadius: 10, background: `${color}20`,
      color, fontSize: 11, fontWeight: 700,
    }}>{count}冊</span>
  </div>
);

export const TextbooksView = ({ courses = [] }) => {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState({ courses: [], books: [], summary: {} });
  const [quarter, setQuarter] = useState('');
  const [year] = useState('2026');

  const load = async (q = quarter) => {
    setLoading(true); setErr(null);
    try {
      const payload = (courses || [])
        .filter(c => c && c.code && !/^\d{6}$/.test(c.section || ''))
        .map(c => ({
          code: c.code,
          section: c.section || null,
          name: c.name || c.code,
          quarter: c.quarter || null,
        }));

      const r = await fetch('/api/data/my-textbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courses: payload, year, quarter: q }),
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

  useEffect(() => { load(quarter); /* eslint-disable-next-line */ }, [quarter, courses?.length]);

  // 教科書/参考書を分離 (必修+参考の本は必修側に入れる)
  const { textbooks, references } = useMemo(() => {
    const tx = [], rf = [];
    for (const b of (data.books || [])) {
      if (b.isTextbook) tx.push(b);
      else if (b.isReference) rf.push(b);
    }
    return { textbooks: tx, references: rf };
  }, [data.books]);

  const Pill = ({ value, label, current, onClick }) => (
    <button
      onClick={() => onClick(value)}
      style={{
        padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 600,
        background: current === value ? T.accent : T.bg3,
        color: current === value ? '#fff' : T.txD,
        transition: 'all .12s',
      }}>{label}</button>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>📚 マイ教科書</div>
          <div style={{ fontSize: 11, color: T.txD }}>{year}年度</div>
        </div>
        <div style={{ fontSize: 12, color: T.txD, marginBottom: 10 }}>
          履修中の講義から自動抽出。
          {textbooks.length > 0 && <>必修 <b style={{ color: T.accent }}>{textbooks.length}</b>冊</>}
          {references.length > 0 && <> ／ 参考 <b style={{ color: T.txD }}>{references.length}</b>冊</>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill value="" label="全Q" current={quarter} onClick={setQuarter} />
          {[1, 2, 3, 4].map(q => (
            <Pill key={q} value={String(q)} label={`${q}Q`} current={quarter} onClick={setQuarter} />
          ))}
        </div>
      </div>

      {loading && <Loader msg="教科書を集計中" size="sm" />}
      {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>エラー: {err}</div>}

      {!loading && !err && (courses?.length || 0) === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>
          履修中の講義が読み込まれていません
        </div>
      )}

      {!loading && !err && (courses?.length || 0) > 0 && textbooks.length === 0 && references.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>
          条件に合う教科書はありません
        </div>
      )}

      {/* 教科書 (必修) */}
      {!loading && textbooks.length > 0 && (
        <>
          <SectionHeader icon="📕" title="教科書 (必修)" count={textbooks.length} color={T.accent} />
          {textbooks.map((entry, idx) => (
            <BookCard
              key={`tx-${entry.book?.isbn13 || entry.book?.id}-${idx}`}
              entry={entry}
              kindLabel={entry.isReference ? '必修+参考' : null}
              kindColor={T.accent}
            />
          ))}
        </>
      )}

      {/* 参考書 */}
      {!loading && references.length > 0 && (
        <>
          <SectionHeader icon="📘" title="参考書" count={references.length} color={T.txD} />
          {references.map((entry, idx) => (
            <BookCard
              key={`rf-${entry.book?.isbn13 || entry.book?.id}-${idx}`}
              entry={entry}
              kindLabel={null}
              kindColor={T.txD}
            />
          ))}
        </>
      )}
    </div>
  );
};
