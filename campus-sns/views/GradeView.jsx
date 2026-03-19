import { useState, useEffect, useMemo } from 'react';
import { T } from '../theme.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_GRADES } from '../demoData.js';

/* ── Grade helpers ── */

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

/** Parse total credits from various formats: "2", "1-1-0", "2-0-0" */
function parseCredits(credits) {
  if (!credits) return 0;
  const s = String(credits).trim();
  // "1-1-0" format → sum
  if (s.includes('-')) {
    return s.split('-').reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  }
  return parseInt(s) || 0;
}

/** Convert numeric grade to GP (東工大式: (点数-55)/10) */
function toGP(grade) {
  const n = parseInt(grade);
  if (isNaN(n)) return null; // 合格/未報告 etc. → exclude
  return (n - 55) / 10;
}

/** Grade rank label from score */
function rankLabel(score) {
  const n = parseInt(score);
  if (isNaN(n)) return '-';
  if (n >= 90) return 'S';
  if (n >= 80) return 'A';
  if (n >= 70) return 'B';
  if (n >= 60) return 'C';
  return 'F';
}

function gpColor(gp) {
  if (gp >= 3.5) return T.green;
  if (gp >= 2.5) return T.accent;
  if (gp >= 1.5) return T.yellow;
  if (gp >= 0.5) return T.orange;
  return T.red;
}

/** Calculate GPA stats for a set of courses (東工大式) */
function calcGPA(courses) {
  let totalGP = 0, totalCredits = 0, count = 0;
  // Distribution by rank: S(90+), A(80-89), B(70-79), C(60-69), F(<60)
  const dist = { S: 0, A: 0, B: 0, C: 0, F: 0 };

  for (const c of courses) {
    const gp = toGP(c.grade);
    if (gp === null) continue;
    const cr = parseCredits(c.credits);
    if (cr <= 0) continue;
    totalGP += gp * cr;
    totalCredits += cr;
    dist[rankLabel(c.grade)] += cr;
    count++;
  }

  return {
    gpa: totalCredits > 0 ? totalGP / totalCredits : 0,
    gpt: totalGP,
    credits: totalCredits,
    count,
    dist,
  };
}

/* ── Icons ── */
const ICN = {
  calc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>,
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
};

/* ── GPA Calculator Sub-view ── */

function GPACalcView({ courses, mob, onBack }) {
  const [yearFilter, setYearFilter] = useState('all');

  const years = useMemo(() =>
    [...new Set(courses.map(c => c.period?.match(/^(\d{4})/)?.[1]).filter(Boolean))].sort(),
    [courses]
  );

  const filtered = yearFilter === 'all' ? courses : courses.filter(c => c.period?.startsWith(yearFilter));

  const overall = useMemo(() => calcGPA(filtered), [filtered]);

  // By category (教養 vs 専門)
  const liberal = useMemo(() => calcGPA(filtered.filter(c => /^LA[HESLW]/.test(c.code))), [filtered]);
  const major = useMemo(() => calcGPA(filtered.filter(c => !/^LA[HESLW]/.test(c.code))), [filtered]);

  // By year
  const byYear = useMemo(() => {
    const map = {};
    for (const y of years) {
      map[y] = calcGPA(courses.filter(c => c.period?.startsWith(y)));
    }
    return map;
  }, [courses, years]);

  // Per-course list with GP
  const courseGPs = useMemo(() =>
    filtered
      .map(c => ({ ...c, gp: toGP(c.grade), cr: parseCredits(c.credits) }))
      .filter(c => c.gp !== null && c.cr > 0),
    [filtered]
  );

  const maxDist = Math.max(...Object.values(overall.dist), 1);

  const statCard = (value, label, sub, color) => (
    <div style={{
      padding: mob ? 14 : 18, borderRadius: 12,
      background: `${color}08`, border: `1px solid ${color}20`, textAlign: 'center',
    }}>
      <div style={{ fontSize: mob ? 28 : 34, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: T.txD, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: mob ? 12 : 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: T.txD, cursor: 'pointer',
          display: 'flex', padding: 4,
        }}>{ICN.back}</button>
        <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 16 : 18 }}>GPA / GPT</div>
      </div>

      {/* Year filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setYearFilter('all')} style={{
          padding: '5px 14px', borderRadius: 20, border: 'none',
          background: yearFilter === 'all' ? T.accent : T.bg3,
          color: yearFilter === 'all' ? '#fff' : T.txD, fontSize: 12, cursor: 'pointer',
          fontWeight: yearFilter === 'all' ? 600 : 400,
        }}>全年度</button>
        {years.map(y => (
          <button key={y} onClick={() => setYearFilter(y)} style={{
            padding: '5px 14px', borderRadius: 20, border: 'none',
            background: yearFilter === y ? T.accent : T.bg3,
            color: yearFilter === y ? '#fff' : T.txD, fontSize: 12, cursor: 'pointer',
            fontWeight: yearFilter === y ? 600 : 400,
          }}>{y}</button>
        ))}
      </div>

      {/* Main stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: mob ? 6 : 8, marginBottom: 16 }}>
        {statCard(overall.gpa.toFixed(2), 'GPA', `${overall.credits}単位`, T.accent)}
        {statCard(overall.gpt.toFixed(1), 'GPT', `${overall.count}科目`, T.green)}
        {statCard(overall.credits, '修得単位', null, T.yellow)}
      </div>

      {/* 教養 / 専門 breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: mob ? 6 : 8, marginBottom: 16 }}>
        <div style={{
          padding: mob ? 12 : 14, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`,
        }}>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>教養科目</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.orange }}>{liberal.gpa.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: T.txD }}>{liberal.credits}単位 / GPT {liberal.gpt.toFixed(1)}</div>
        </div>
        <div style={{
          padding: mob ? 12 : 14, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`,
        }}>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>専門科目</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>{major.gpa.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: T.txD }}>{major.credits}単位 / GPT {major.gpt.toFixed(1)}</div>
        </div>
      </div>

      {/* Grade distribution */}
      <div style={{
        padding: mob ? 12 : 16, borderRadius: 12, background: T.bg2,
        border: `1px solid ${T.bd}`, marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 12 }}>成績分布（単位数）</div>
        {[
          { rank: 'S', label: '90-100', gp: 3.5, color: T.green },
          { rank: 'A', label: '80-89', gp: 2.5, color: T.accent },
          { rank: 'B', label: '70-79', gp: 1.5, color: T.yellow },
          { rank: 'C', label: '60-69', gp: 0.5, color: T.orange },
          { rank: 'F', label: '0-59', gp: -2, color: T.red },
        ].map(r => (
          <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: r.color, width: 16, textAlign: 'center',
            }}>{r.rank}</span>
            <span style={{ fontSize: 10, color: T.txD, width: 38 }}>{r.label}</span>
            <div style={{ flex: 1, height: 18, background: T.bg3, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${(overall.dist[r.rank] / maxDist) * 100}%`,
                background: r.color, transition: 'width 0.3s',
                minWidth: overall.dist[r.rank] > 0 ? 4 : 0,
              }} />
            </div>
            <span style={{ fontSize: 11, color: T.txH, fontWeight: 600, width: 28 }}>{overall.dist[r.rank]}</span>
          </div>
        ))}
      </div>

      {/* GPA by year */}
      {yearFilter === 'all' && years.length > 1 && (
        <div style={{
          padding: mob ? 12 : 16, borderRadius: 12, background: T.bg2,
          border: `1px solid ${T.bd}`, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 12 }}>年度別GPA</div>
          {years.map(y => {
            const s = byYear[y];
            if (!s || s.count === 0) return null;
            return (
              <div key={y} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: `1px solid ${T.bd}`,
              }}>
                <span style={{ fontSize: 13, color: T.txH, fontWeight: 500 }}>{y}年度</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: T.txD }}>{s.credits}単位</span>
                  <span style={{ fontSize: 11, color: T.txD }}>GPT {s.gpt.toFixed(1)}</span>
                  <span style={{
                    fontSize: 16, fontWeight: 700,
                    color: s.gpa >= 3 ? T.green : s.gpa >= 2 ? T.yellow : T.orange,
                  }}>{s.gpa.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-course GP list */}
      <div style={{
        padding: mob ? 12 : 16, borderRadius: 12, background: T.bg2,
        border: `1px solid ${T.bd}`, marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>
          科目別GP（{courseGPs.length}科目）
        </div>
        {courseGPs.map((c, i) => (
          <div key={`${c.code}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', borderBottom: i < courseGPs.length - 1 ? `1px solid ${T.bd}` : 'none',
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: gpColor(c.gp),
              width: 30, textAlign: 'center', flexShrink: 0,
            }}>{c.gp.toFixed(1)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, color: T.txH, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c.name}</div>
              <div style={{ fontSize: 10, color: T.txD }}>{c.code} · {c.credits}単位 · {c.grade}点</div>
            </div>
            <span style={{
              fontSize: 11, color: T.txD, flexShrink: 0,
            }}>{c.gp.toFixed(1)}×{c.cr}={(c.gp * c.cr).toFixed(1)}</span>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <div style={{
        padding: mob ? 10 : 12, borderRadius: 10,
        background: `${T.accent}06`, border: `1px solid ${T.accent}15`,
        fontSize: 11, color: T.txD, lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600, color: T.txH, marginBottom: 4 }}>計算方法（東工大式）</div>
        GP = (点数 - 55) / 10<br />
        GPT = Σ(GP × 単位数)<br />
        GPA = GPT / 修得単位数<br />
        <span style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          例: 90点×2単位 → GP=3.5, 寄与=7.0<br />
          合格・未報告の科目はGPA計算から除外
        </span>
      </div>
    </div>
  );
}

/* ── Category Section ── */

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

/* ── Main GradeView ── */

export const GradeView = ({ mob }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maintInfo, setMaintInfo] = useState(null);
  const [filter, setFilter] = useState('all');
  const [year, setYear] = useState('all');
  const [qtr, setQtr] = useState('all');
  const [subView, setSubView] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (isDemoMode()) {
      setData(DEMO_GRADES);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch('/api/data/grades');
        if (!r.ok) {
          if (r.status === 503) {
            const body = await r.json().catch(() => ({}));
            setMaintInfo(body);
            setError('maintenance');
          } else {
            setError(r.status === 400 ? 'portal' : 'fetch');
          }
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

  if (error === 'maintenance') {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: mob ? 12 : 20 }}>
        <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 16 : 18, marginBottom: 10 }}>成績</div>
        <div style={{
          padding: mob ? 16 : 24, borderRadius: 12,
          background: `${T.yellow}08`, border: `1px solid ${T.yellow}20`, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.yellow, marginBottom: 8 }}>
            教務Webシステム メンテナンス中
          </div>
          {maintInfo?.schedules?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {maintInfo.schedules.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: T.txH, lineHeight: 1.8 }}>{s}</div>
              ))}
            </div>
          )}
          {maintInfo?.recurring && (
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>{maintInfo.recurring}</div>
          )}
          <div style={{ fontSize: 11, color: T.txD }}>メンテナンス終了後に再度お試しください。</div>
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

  // GPA sub-view
  if (subView === 'gpa' && allCourses?.length > 0) {
    return <GPACalcView courses={allCourses} mob={mob} onBack={() => setSubView(null)} />;
  }

  const gpa = summary?.gpa || {};

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
        {allCourses?.length > 0 && (
          <button onClick={() => setSubView('gpa')} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
            borderRadius: 8, border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {ICN.calc}
            GPA
          </button>
        )}
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
        <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>
          {allCourses?.length === 0
            ? <>成績データを取得できませんでした。<br /><span style={{ fontSize: 11 }}>ポータル認証後のリダイレクトに失敗した可能性があります。</span>
              {data?._debug && <pre style={{ textAlign: 'left', fontSize: 10, marginTop: 10, color: T.txD, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {`URL: ${data._debug.finalUrl}\nTitle: ${data._debug.pageTitle}\nTables: ${data._debug.tables?.length || 0}`}
              </pre>}
            </>
            : '該当する科目はありません'}
        </div>
      )}
    </div>
  );
};
