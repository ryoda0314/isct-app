import { useState, useEffect } from 'react';
import { T } from '../theme.js';

function gradeStatus(c) {
  if (c.grade === '合格') return 'passed';
  if (c.grade === '未報告') return 'pending';
  if (c.grade === '不合格') return 'failed';
  const n = parseInt(c.grade);
  if (isNaN(n)) return 'pending';
  return n >= 60 ? 'passed' : 'failed';
}

function gradeColor(grade) {
  if (grade === '合格') return T.green;
  if (grade === '不合格' || grade === '未報告') return T.red;
  const n = parseInt(grade);
  if (isNaN(n)) return T.txD;
  if (n >= 90) return T.green;
  if (n >= 80) return T.accent;
  if (n >= 70) return T.yellow;
  if (n >= 60) return T.orange;
  return T.red;
}

function recLabel(rec) {
  if (rec.includes('R') || rec.includes('◎')) return { text: '必修', bg: T.red };
  if (rec.includes('A') || rec.includes('○')) return { text: '選必', bg: T.orange };
  if (rec.includes('L') || rec === '*') return { text: '選択', bg: T.txD };
  return null;
}

function CategorySection({ name, courses: items, mob }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const nums = items.filter(c => c.gradeNum);
  const avg = nums.length ? nums.reduce((s, c) => s + c.gradeNum, 0) / nums.length : 0;

  return (
    <div style={{ marginBottom: mob ? 10 : 14 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: mob ? '8px 10px' : '8px 12px', borderRadius: open ? '8px 8px 0 0' : 8,
        background: T.bg3, border: `1px solid ${T.bd}`, cursor: 'pointer', color: T.txH,
      }}>
        <span style={{ fontWeight: 600, fontSize: mob ? 13 : 14 }}>{name} ({items.length})</span>
        <span style={{ fontSize: 12, color: T.txD }}>
          {avg > 0 && `平均 ${avg.toFixed(1)}`}
          <span style={{ marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && items.map((c, i) => {
        const rl = recLabel(c.recommendation);
        return (
          <div key={`${c.code}-${i}`} style={{
            padding: mob ? '8px 10px' : '10px 14px', background: T.bg2,
            border: `1px solid ${T.bd}`, borderTop: 'none', display: 'flex',
            alignItems: 'center', gap: mob ? 6 : 10,
            ...(i === items.length - 1 ? { borderRadius: '0 0 8px 8px' } : {}),
          }}>
            {rl && <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
              background: `${rl.bg}18`, color: rl.bg, flexShrink: 0,
            }}>{rl.text}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 11, color: T.txD, fontFamily: 'monospace', flexShrink: 0 }}>{c.code}</span>
                <span style={{ fontSize: mob ? 12 : 13, color: T.txH, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>
                {c.instructor} · {c.credits} · {c.period}
              </div>
            </div>
            <div style={{
              fontSize: mob ? 16 : 18, fontWeight: 700, color: gradeColor(c.grade),
              flexShrink: 0, minWidth: 40, textAlign: 'right',
            }}>
              {c.grade}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const GradeView = ({ mob }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [year, setYear] = useState('all');
  const [qtr, setQtr] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/data/grades');
        if (!r.ok) {
          setError(r.status === 400 ? 'portal' : 'fetch');
          setLoading(false);
          return;
        }
        const d = await r.json();
        if (!cancelled) setData(d);
      } catch { if (!cancelled) setError('fetch'); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error === 'portal') {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: mob ? 12 : 20 }}>
        <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 16 : 18, marginBottom: 10 }}>成績</div>
        <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>
          ポータルのマトリクス認証が設定されていません。<br />
          セットアップ画面からマトリクスカードを登録してください。
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.txD, fontSize: 13 }}>成績を取得中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: mob ? 12 : 20 }}>
        <div style={{ textAlign: 'center', padding: 40, color: T.red, fontSize: 13 }}>成績の取得に失敗しました</div>
      </div>
    );
  }

  const { summary, categories, courses: allCourses } = data;
  const gpa = summary?.gpa || {};

  // Extract unique years and quarters from data
  const years = [...new Set((allCourses || []).map(c => c.period?.match(/^(\d{4})/)?.[1]).filter(Boolean))].sort();
  const quarters = [...new Set((allCourses || []).flatMap(c => {
    const q = c.quarter;
    if (!q) return [];
    if (q.includes('-')) return q.split('-');
    return [q];
  }))].sort();

  let filtered = allCourses || [];
  if (filter === 'passed') filtered = filtered.filter(c => gradeStatus(c) === 'passed');
  if (filter === 'failed') filtered = filtered.filter(c => gradeStatus(c) === 'failed');
  if (filter === 'pending') filtered = filtered.filter(c => gradeStatus(c) === 'pending');
  if (year !== 'all') filtered = filtered.filter(c => c.period?.startsWith(year));
  if (qtr !== 'all') filtered = filtered.filter(c => {
    const q = c.quarter;
    if (!q) return false;
    if (q.includes('-')) return q.split('-').includes(qtr);
    return q === qtr;
  });

  // Group by category based on course code prefix
  const grouped = {};
  for (const c of filtered) {
    const prefix = c.code.substring(0, 3);
    const catName =
      prefix === 'LAH' ? '文系教養科目' :
      prefix === 'LAE' ? '英語科目' :
      prefix === 'LAS' ? '理工系教養科目' :
      prefix === 'LAL' ? '第二外国語科目' :
      prefix === 'LAW' ? '広域教養科目' :
      prefix === 'ENT' ? 'アントレプレナーシップ科目' :
      prefix === 'DSA' ? 'データサイエンス・AI' :
      prefix === 'MEC' ? '機械系専門科目' :
      prefix === 'XEG' ? '工学院共通科目' :
      prefix === 'TMD' ? '医歯学系科目' :
      '専門科目';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(c);
  }

  const statBox = (value, label, color) => (
    <div style={{
      padding: mob ? 10 : 14, borderRadius: 10,
      background: `${color}08`, border: `1px solid ${color}20`, textAlign: 'center',
    }}>
      <div style={{ fontSize: mob ? 20 : 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: mob ? 10 : 11, color: T.txD }}>{label}</div>
    </div>
  );

  const filterBtn = (id, label) => (
    <button onClick={() => setFilter(id)} style={{
      padding: '5px 14px', borderRadius: 20, border: 'none',
      background: filter === id ? T.accent : T.bg3,
      color: filter === id ? '#fff' : T.txD, fontSize: 12, cursor: 'pointer', fontWeight: filter === id ? 600 : 400,
      transition: 'all 0.15s',
    }}>{label}</button>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: mob ? 12 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 16 : 18 }}>
          成績一覧
          {summary?.name && <span style={{ fontSize: 12, fontWeight: 400, color: T.txD, marginLeft: 8 }}>{summary.name}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: mob ? 6 : 8, marginBottom: 16 }}>
        {statBox(gpa.overall?.toFixed(1) || '--', '全体平均', T.accent)}
        {statBox(gpa.major?.toFixed(1) || '--', '専門平均', T.green)}
        {statBox(gpa.liberal?.toFixed(1) || '--', '教養平均', T.orange)}
        {statBox(summary?.totalCredits || '--', '修得単位', T.yellow)}
      </div>

      {categories.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
          padding: mob ? 10 : 12, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`,
        }}>
          {categories.filter(c => c.credits > 0).map(c => (
            <span key={c.name} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: T.bg3, color: T.txH, border: `1px solid ${T.bd}`,
            }}>{c.name} <strong>{c.credits}</strong></span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {filterBtn('all', `全て (${allCourses?.length || 0})`)}
        {filterBtn('passed', '合格')}
        {filterBtn('failed', '不合格')}
        {filterBtn('pending', '未報告')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.txD, fontWeight: 500 }}>期間</span>
        <select value={year} onChange={e => setYear(e.target.value)} style={{
          padding: '4px 8px', borderRadius: 4, border: `1px solid ${T.bd}`,
          background: T.bg2, color: year !== 'all' ? T.txH : T.txD,
          fontSize: 12, cursor: 'pointer', outline: 'none',
        }}>
          <option value="all">全年度</option>
          {years.map(y => <option key={y} value={y}>{y}年度</option>)}
        </select>
        <select value={qtr} onChange={e => setQtr(e.target.value)} style={{
          padding: '4px 8px', borderRadius: 4, border: `1px solid ${T.bd}`,
          background: T.bg2, color: qtr !== 'all' ? T.txH : T.txD,
          fontSize: 12, cursor: 'pointer', outline: 'none',
        }}>
          <option value="all">全Q</option>
          {quarters.map(q => <option key={q} value={q}>{q}Q</option>)}
        </select>
        {(year !== 'all' || qtr !== 'all') && (
          <button onClick={() => { setYear('all'); setQtr('all'); }} style={{
            padding: '3px 8px', borderRadius: 4, border: `1px solid ${T.bd}`,
            background: 'transparent', color: T.txD, fontSize: 11, cursor: 'pointer',
          }}>×</button>
        )}
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <CategorySection key={cat} name={cat} courses={items} mob={mob} />
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>該当する科目はありません</div>
      )}
    </div>
  );
};
