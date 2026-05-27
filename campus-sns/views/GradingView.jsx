import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Loader } from '../shared.jsx';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../lib/api/grading-parser.js';

// =============================================================
// 成績割合一覧ビュー
//  - タブ1: マイ履修 (Moodle 由来の登録科目だけを表示)
//  - タブ2: 全科目検索 (DB全件から年度/学系/Quarter/カテゴリで絞り込み)
// =============================================================

const CATEGORY_ORDER = [
  'exam', 'quiz', 'report', 'exercise', 'practice',
  'presentation', 'attendance', 'participation',
  'project', 'discussion', 'other',
];

// 範囲表記用の表示文字列: "60-70%" / "65%"
const formatPercent = (b) => {
  if (b.is_range && b.percent_min != null && b.percent_max != null) {
    return `${b.percent_min}-${b.percent_max}%`;
  }
  // 小数1桁まで、整数なら整数で
  const v = b.percent;
  return Number.isInteger(v) ? `${v}%` : `${Math.round(v * 10) / 10}%`;
};

// 横帯グラフ (range の場合は中央値ベースの percent を使用 = 合計100%にスケール済)
const BreakdownBar = ({ breakdown }) => {
  if (!breakdown || breakdown.length === 0) return null;
  const total = breakdown.reduce((s, b) => s + (b.percent || 0), 0) || 1;
  return (
    <div style={{
      width: '100%', height: 10, borderRadius: 5, overflow: 'hidden',
      display: 'flex', background: T.bg3, border: `1px solid ${T.bd}`,
      position: 'relative',
    }}>
      {breakdown.map((b, i) => (
        <div
          key={`${b.label}-${i}`}
          title={`${b.label} ${formatPercent(b)}`}
          style={{
            width: `${(b.percent / total) * 100}%`,
            background: CATEGORY_COLORS[b.category] || CATEGORY_COLORS.other,
            // 範囲表記の項目は斜めストライプで「幅に幅がある」事を示す
            backgroundImage: b.is_range
              ? `repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 4px, transparent 4px 8px)`
              : 'none',
          }}
        />
      ))}
    </div>
  );
};

const BreakdownItems = ({ breakdown, compact = false }) => {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
      {breakdown.map((b, i) => {
        const color = CATEGORY_COLORS[b.category] || CATEGORY_COLORS.other;
        return (
          <span key={`${b.label}-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: compact ? '2px 7px' : '3px 9px',
            borderRadius: 10,
            background: `${color}1c`,
            color,
            fontSize: compact ? 10 : 11, fontWeight: 600,
            maxWidth: 240,
            border: b.is_range ? `1px dashed ${color}80` : 'none',
          }}>
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{b.label}</span>
            <span style={{ fontWeight: 800 }}>{formatPercent(b)}</span>
          </span>
        );
      })}
    </div>
  );
};

const GradingCard = ({ row, dense = false }) => {
  const [expanded, setExpanded] = useState(false);
  const totalPct = row.total_percent;
  const hasFullPct = row.has_breakdown;
  const isPassFail = row.is_pass_fail;
  return (
    <div style={{
      padding: dense ? 10 : 12,
      background: T.bg2,
      border: `1px solid ${isPassFail ? '#8a9c5a' : T.bd}`,
      borderRadius: 10,
      transition: 'border-color .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{
          fontFamily: 'monospace', fontSize: 11, color: T.txD, fontWeight: 600,
        }}>{row.course_code}{row.section ? ` (${row.section})` : ''}</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: T.txH, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{row.name || '(無題)'}</div>
        {row.quarter && (
          <span style={{
            padding: '1px 7px', borderRadius: 8,
            background: `${T.accent}1c`, color: T.accent,
            fontSize: 10, fontWeight: 700,
          }}>{row.quarter}</span>
        )}
        {row.day && (
          <span style={{
            fontSize: 10, color: T.txD,
          }}>{row.day}{row.per ? row.per.replace(row.day, '') : ''}</span>
        )}
        {isPassFail && (
          <span style={{
            padding: '1px 8px', borderRadius: 8,
            background: '#8a9c5a22', color: '#6b7e3c',
            fontSize: 10, fontWeight: 800,
            border: '1px solid #8a9c5a55',
          }}>合否科目</span>
        )}
      </div>

      {isPassFail ? (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: '#8a9c5a14',
          border: '1px dashed #8a9c5a66',
          fontSize: 12, color: '#6b7e3c', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span>合格・不合格で評価される科目（%による配点なし）</span>
        </div>
      ) : hasFullPct ? (
        <>
          <BreakdownBar breakdown={row.breakdown} />
          <BreakdownItems breakdown={row.breakdown} compact={dense} />
          {(() => {
            const hasRange = (row.breakdown || []).some(b => b.is_range);
            const hasInferred = (row.breakdown || []).some(b => b.is_inferred);
            const totalOff = totalPct != null && Math.abs(totalPct - 100) >= 1;
            if (!hasRange && !hasInferred && !totalOff) return null;
            return (
              <div style={{ marginTop: 4, fontSize: 10, color: T.txD, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {hasInferred && (
                  <span style={{ color: T.accent }}>※ 単一手段から推定（%表記なし）</span>
                )}
                {hasRange && (
                  <span>※ 斜線/破線の項目は範囲表記（描画は中央値、合計100%に正規化）</span>
                )}
                {!hasRange && !hasInferred && totalOff && (
                  <span>合計 {totalPct}% (端数記載/100%に正規化)</span>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <div style={{
          padding: '6px 10px', borderRadius: 6,
          background: T.bg3, border: `1px dashed ${T.bd}`,
          fontSize: 11, color: T.txD,
        }}>
          割合の明示なし — 下の本文を参照
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10, color: T.accent, padding: 0,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
          {expanded ? '本文を閉じる' : '本文を表示'}
        </button>
        {expanded && (
          <div style={{
            marginTop: 6, padding: 8, borderRadius: 6,
            background: T.bg3, border: `1px solid ${T.bd}`,
            fontSize: 11, color: T.tx, lineHeight: 1.55,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{row.raw_text}</div>
        )}
        {row.source_url && (
          <a href={row.source_url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block', marginTop: 6,
              fontSize: 10, color: T.txD, textDecoration: 'none',
              border: `1px solid ${T.bd}`, padding: '1px 7px', borderRadius: 4,
            }}>シラバスを開く</a>
        )}
      </div>
    </div>
  );
};

const Pill = ({ value, label, current, onClick, color }) => (
  <button
    onClick={() => onClick(value)}
    style={{
      padding: '4px 11px', borderRadius: 14, border: 'none', cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      background: current === value ? (color || T.accent) : T.bg3,
      color: current === value ? '#fff' : T.txD,
      transition: 'all .12s',
    }}>{label}</button>
);

// アクティブ時にアクセントカラーで縁取りされるコンパクトなセレクトボックス
const FilterSelect = ({ value, onChange, active, activeColor, children }) => {
  const accent = activeColor || T.accent;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        background: active ? `${accent}1a` : T.bg3,
        color: active ? accent : T.txH,
        border: `1px solid ${active ? accent : T.bd}`,
        maxWidth: 180,
      }}>
      {children}
    </select>
  );
};

// =============================================================
// マイ履修タブ
// =============================================================
const MyGradingPanel = ({ courses = [], academicYear, setAcademicYear }) => {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState({ courses: [], summary: { total: 0, with_breakdown: 0 } });
  const [quarter, setQuarter] = useState('');
  const [level, setLevel] = useState('');

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

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const payload = yearCourses
        .filter(c => c && c.code && !/^\d{6}$/.test(c.section || ''))
        .map(c => ({
          code: c.code, section: c.section || null,
          name: c.name || c.code, quarter: c.quarter || null,
        }));
      const r = await fetch('/api/data/my-grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courses: payload, year: yearStr }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${j.detail || j.error || ''}`);
      setData(j);
    } catch (e) {
      console.error('[GradingView/My]', e);
      setErr(e.message || '読み込みに失敗しました');
    }
    setLoading(false);
  }, [yearCourses, yearStr]);

  useEffect(() => { load(); }, [load]);

  const availableYears = useMemo(() => {
    const years = new Set();
    for (const c of (courses || [])) if (c?.year) years.add(c.year);
    years.add(currentJpYear);
    return [...years].sort((a, b) => b - a);
  }, [courses, currentJpYear]);

  const filtered = useMemo(() => {
    let list = data.courses || [];
    if (quarter) {
      const digit = quarter.replace(/[Qq]/, '');
      const re = new RegExp(`(?:^|[^0-9])${digit}(?:[^0-9]|$)`);
      list = list.filter(c => c.quarter && re.test(String(c.quarter)));
    }
    if (level) {
      // "MEC.A211" → A211 → "2" がレベル数字
      const re = new RegExp(`\\.[A-Z]${level}[0-9]{2}`);
      list = list.filter(c => c.course_code && re.test(c.course_code));
    }
    return list;
  }, [data.courses, quarter, level]);

  const parsedCount = filtered.filter(c => c.has_breakdown).length;
  const passFailCount = filtered.filter(c => c.is_pass_fail).length;

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: T.bg, padding: '10px 14px',
        borderBottom: `1px solid ${T.bd}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {availableYears.length > 1 && setAcademicYear ? (
            <FilterSelect
              value={year}
              onChange={v => setAcademicYear(Number(v))}
              active={false}>
              {availableYears.map(y => <option key={y} value={y}>{y}年度</option>)}
            </FilterSelect>
          ) : (
            <div style={{ fontSize: 12, color: T.txD, background: T.bg3, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.bd}` }}>{year}年度</div>
          )}
          <FilterSelect value={quarter} onChange={setQuarter} active={!!quarter}>
            <option value="">全Q</option>
            <option value="1Q">1Q</option>
            <option value="2Q">2Q</option>
            <option value="3Q">3Q</option>
            <option value="4Q">4Q</option>
          </FilterSelect>
          <FilterSelect value={level} onChange={setLevel} active={!!level}>
            <option value="">全レベル</option>
            <option value="1">100番台</option>
            <option value="2">200番台</option>
            <option value="3">300番台</option>
            <option value="4">400番台</option>
            <option value="5">500番台</option>
            <option value="6">600番台</option>
          </FilterSelect>
          <div style={{ flex: 1 }} />
          {!loading && (
            <div style={{ fontSize: 11, color: T.txD, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>
                <span style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>{parsedCount}</span>
                <span style={{ marginLeft: 3 }}>/ {filtered.length} 件で割合解析</span>
              </span>
              {passFailCount > 0 && (
                <span style={{ color: '#6b7e3c' }}>
                  · <span style={{ fontWeight: 700, fontSize: 13 }}>{passFailCount}</span> 件は合否
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 14px 16px' }}>
        {loading && <div style={{ padding: 20 }}><Loader msg="成績割合を集計中" size="sm" /></div>}
        {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>エラー: {err}</div>}
        {!loading && !err && yearCourses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            {year}年度に履修中の講義はありません
          </div>
        )}
        {!loading && !err && yearCourses.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.txD, fontSize: 13 }}>
            条件に合う成績割合データがありません
            <div style={{ fontSize: 11, marginTop: 6 }}>
              (DBにシラバスデータが登録されていない可能性。管理画面から取得してください)
            </div>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {filtered.map(row => <GradingCard key={`${row.course_code}-${row.section || ''}`} row={row} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================
// 全科目検索タブ
// =============================================================
const SearchGradingPanel = () => {
  const [meta, setMeta] = useState({ years: [], depts: [], quarters: [] });
  const [metaLoading, setMetaLoading] = useState(true);
  const [year, setYear] = useState('2026');
  const [dept, setDept] = useState('');
  const [quarter, setQuarter] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [searchDeferred, setSearchDeferred] = useState('');
  const [onlyParsed, setOnlyParsed] = useState(true);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState({ rows: [], total: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      setMetaLoading(true);
      try {
        const r = await fetch('/api/data/grading-search?meta=1', { credentials: 'include' });
        const j = await r.json();
        if (r.ok) {
          setMeta(j);
          if (j.years?.length && !j.years.includes(year)) {
            setYear(j.years[0]);
          }
        }
      } catch (e) { console.error('[GradingView/meta]', e); }
      setMetaLoading(false);
    })();
  }, []); // eslint-disable-line

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDeferred(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ year });
      if (dept) params.set('dept', dept);
      if (quarter) params.set('quarter', quarter);
      if (level) params.set('level', level);
      if (searchDeferred) params.set('search', searchDeferred);
      if (onlyParsed) params.set('only_parsed', '1');
      if (category) params.set('category', category);
      params.set('page', String(page));
      const r = await fetch(`/api/data/grading-search?${params}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      console.error('[GradingView/search]', e);
      setErr(e.message || '読み込みに失敗しました');
    }
    setLoading(false);
  }, [year, dept, quarter, level, searchDeferred, onlyParsed, category, page]);

  useEffect(() => { load(); }, [load]);

  // when filters change reset page to 0
  useEffect(() => { setPage(0); }, [year, dept, quarter, level, searchDeferred, onlyParsed, category]);

  const deptsBySchool = useMemo(() => {
    const m = {};
    for (const d of (meta.depts || [])) {
      const s = d.school || 'その他';
      if (!m[s]) m[s] = [];
      m[s].push(d);
    }
    return m;
  }, [meta.depts]);

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: T.bg, padding: '10px 14px',
        borderBottom: `1px solid ${T.bd}`,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterSelect value={year} onChange={setYear} active={false}>
            {(meta.years || ['2026']).map(y => <option key={y} value={y}>{y}年度</option>)}
          </FilterSelect>
          <FilterSelect value={dept} onChange={setDept} active={!!dept}>
            <option value="">全学系</option>
            {Object.entries(deptsBySchool).map(([school, ds]) => (
              <optgroup key={school} label={school}>
                {ds.map(d => (
                  <option key={d.key} value={d.key}>
                    {d.label ? `${d.label} (${d.key})` : d.key}
                  </option>
                ))}
              </optgroup>
            ))}
          </FilterSelect>
          <FilterSelect value={quarter} onChange={setQuarter} active={!!quarter}>
            <option value="">全Q</option>
            <option value="1Q">1Q</option>
            <option value="2Q">2Q</option>
            <option value="3Q">3Q</option>
            <option value="4Q">4Q</option>
          </FilterSelect>
          <FilterSelect value={level} onChange={setLevel} active={!!level}>
            <option value="">全レベル</option>
            <option value="1">100番台 (1年)</option>
            <option value="2">200番台 (2年)</option>
            <option value="3">300番台 (3年)</option>
            <option value="4">400番台 (4年・院)</option>
            <option value="5">500番台 (修士)</option>
            <option value="6">600番台 (博士)</option>
          </FilterSelect>
          <FilterSelect value={category} onChange={setCategory} active={!!category}
            activeColor={category ? CATEGORY_COLORS[category] : null}>
            <option value="">全カテゴリ</option>
            {CATEGORY_ORDER.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </FilterSelect>
          <input
            type="text" placeholder="科目コード/名/本文で検索"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 140, padding: '5px 10px', borderRadius: 6,
              background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 12,
            }}/>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.txD, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyParsed} onChange={e => setOnlyParsed(e.target.checked)} />
            割合解析済のみ
          </label>
        </div>
      </div>

      <div style={{ padding: '12px 14px 16px' }}>
        {metaLoading && <div style={{ padding: 20 }}><Loader msg="メタデータ取得中" size="sm" /></div>}
        {loading && <div style={{ padding: 20 }}><Loader msg="検索中" size="sm" /></div>}
        {err && <div style={{ padding: 16, color: T.red, fontSize: 13 }}>エラー: {err}</div>}

        {!loading && !err && (
          <>
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>
              {data.total}件ヒット {data.hasMore && '(続きあり)'}
              {category && (
                <span style={{ marginLeft: 8 }}>
                  · {CATEGORY_LABELS[category]} の割合で絞り込み中
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
              {(data.rows || []).map(row => (
                <GradingCard key={`${row.course_code}-${row.section || ''}`} row={row} dense />
              ))}
            </div>

            {(data.total > 0) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH,
                    cursor: page === 0 ? 'default' : 'pointer', fontSize: 12,
                    opacity: page === 0 ? 0.4 : 1,
                  }}>← 前へ</button>
                <span style={{ alignSelf: 'center', fontSize: 11, color: T.txD }}>
                  ページ {page + 1}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.hasMore}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH,
                    cursor: !data.hasMore ? 'default' : 'pointer', fontSize: 12,
                    opacity: !data.hasMore ? 0.4 : 1,
                  }}>次へ →</button>
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
export const GradingView = ({ courses = [], academicYear, setAcademicYear }) => {
  const [tab, setTab] = useState('my'); // 'my' | 'search'

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '12px 14px 0',
        borderBottom: `1px solid ${T.bd}`, background: T.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: T.accent, display: 'flex' }}>{I.bar}</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.txH, letterSpacing: 0.3 }}>成績割合</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'my', label: 'マイ履修' },
            { id: 'search', label: '全科目検索' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
                color: tab === t.id ? T.txH : T.txD,
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                transition: 'color .12s',
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'my'
        ? <MyGradingPanel courses={courses} academicYear={academicYear} setAcademicYear={setAcademicYear} />
        : <SearchGradingPanel />}
    </div>
  );
};

export default GradingView;
