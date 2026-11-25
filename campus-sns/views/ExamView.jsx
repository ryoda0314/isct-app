import React, { useState, useMemo, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { PERIOD_TIMES } from "../examData.js";
import { isDemoMode } from "../demoMode.js";
import { DEMO_EXAMS } from "../demoData.js";
import {
  matchMyExams, matchMyClasses, applyExamPrefs, examKeys, periodTimes, courseOf,
  setExamEdit, clearExamEdit, keepExamEdit, linkExam, unlinkExam, hideExam, unhideExam,
} from "../myExams.js";
import { useExamPrefs } from "../hooks/useExamPrefs.js";

const API = "";

const DAY_COLORS = { "月": "#6375f0", "火": "#e5534b", "水": "#3dae72", "木": "#d4843e", "金": "#a855c7" };
const PERIOD_CHOICES = ["1-2", "3-4", "5-6", "7-8", "9-10", "1-4", "3-6", "5-8", "3-8"];
// 公式の試験時間割（毎朝 lib/exam-import が取り込む元の PDF のページ）
const OFFICIAL_PAGES = [
  { key: "exam.officialUndergrad", url: "https://www.titech.ac.jp/student/students/life/undergraduate-exam" },
  { key: "exam.officialGrad", url: "https://www.titech.ac.jp/student/students/life/graduate-exam" },
];

const fmtDate = d => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};
const fmtDateFull = d => {
  const dt = new Date(d + "T00:00:00");
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return t("exam.dateFull", { m: dt.getMonth() + 1, d: dt.getDate(), dow: t("dow.s." + days[dt.getDay()]) });
};
const timeOf = (period) => PERIOD_TIMES[period] || periodTimes(period);

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/**
 * 「今日」「明日」「あとN日」「終了」。日付は日単位で比べる（以前は試験日の 0 時と今を比べていて、
 * 試験当日は朝から「終了」になっていた）。period を渡すと、当日はその時限が終わるまで「今日」。
 */
const countdownText = (dateStr, period) => {
  const now = new Date();
  const today = ymdOf(now);
  if (dateStr < today) return t("exam.ended");
  if (dateStr === today) {
    const pt = period ? timeOf(period) : null;
    if (pt) {
      const [h, m] = pt.end.split(":").map(Number);
      if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) return t("exam.ended");
    }
    return t("exam.today");
  }
  const days = Math.round((new Date(`${dateStr}T00:00:00`) - new Date(`${today}T00:00:00`)) / 864e5);
  if (days === 1) return t("exam.tomorrow");
  return t("exam.daysLeft", { days });
};

const fieldLabel = (f) => t(`exam.field.${f}`);
const valueText = (f, v) => (v == null || v === "" ? "—" : f === "date" ? fmtDateFull(v) : f === "period" ? t("exam.period", { n: v }) : v);

const smallBtn = (col) => ({
  padding: "4px 10px", borderRadius: 7, border: `1px solid ${col}40`, background: `${col}10`, color: col,
  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});

/** 試験 1 件の日時・教室を自分で直すフォーム */
function ExamEditor({ exam, onSave, onReset, onCancel }) {
  const [form, setForm] = useState({ date: exam.date || "", period: exam.period || "", room: exam.room || "" });
  const input = { padding: "6px 8px", borderRadius: 7, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, fontFamily: "inherit", outline: "none" };
  const periods = PERIOD_CHOICES.includes(form.period) || !form.period ? PERIOD_CHOICES : [form.period, ...PERIOD_CHOICES];
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg }}>
      <div style={{ fontSize: 11, color: T.txD, marginBottom: 8, lineHeight: 1.5 }}>{t("exam.editHint")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...input, width: 140 }} aria-label={fieldLabel("date")} />
        <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} style={input} aria-label={fieldLabel("period")}>
          {periods.map((p) => <option key={p} value={p}>{t("exam.period", { n: p })}</option>)}
        </select>
        <input value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} placeholder={fieldLabel("room")} style={{ ...input, width: 140 }} aria-label={fieldLabel("room")} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onSave(form)} style={smallBtn(T.accent)}>{t("common.save")}</button>
        {exam._edited?.length > 0 && <button type="button" onClick={onReset} style={smallBtn(T.txD)}>{t("exam.resetToOfficial")}</button>}
        <button type="button" onClick={onCancel} style={smallBtn(T.txD)}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

/** 自分の修正のあとで公式の値が変わった・公式から消えた、の知らせ */
function ExamNotice({ exam, onUseOfficial, onKeepMine }) {
  const box = { marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.orange}40`, background: `${T.orange}0d`, fontSize: 11, color: T.tx, lineHeight: 1.6 };
  if (exam._gone) {
    return <div style={box}>{t("exam.goneFromOfficial")}</div>;
  }
  if (!exam._conflict?.length) return null;
  return (
    <div style={box} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 700 }}>{t("exam.officialChanged")}</div>
      {exam._conflict.map((f) => (
        <div key={f}>{fieldLabel(f)}: {t("exam.officialNow", { value: valueText(f, exam._official?.[f]) })} / {t("exam.yourEdit", { value: valueText(f, exam[f]) })}</div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={onUseOfficial} style={smallBtn(T.accent)}>{t("exam.useOfficial")}</button>
        <button type="button" onClick={onKeepMine} style={smallBtn(T.txD)}>{t("exam.keepMine")}</button>
      </div>
    </div>
  );
}

export const ExamView = ({ courses = [], mob, goToBuilding, setCid, setView, setCh }) => {
  const [showAll, setShowAll] = useState(false);
  const [allExams, setAllExams] = useState([]);
  const [classesBlock, setClassesBlock] = useState(null);
  const [quarters, setQuarters] = useState([]);
  const [selYear, setSelYear] = useState("");
  const [selQ, setSelQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [prefs, updatePrefs] = useExamPrefs();

  const fetchExams = useCallback((year, quarter) => {
    if (isDemoMode()) {
      const filtered = (DEMO_EXAMS.exams || []).filter(e => (!year || e.year === year) && (!quarter || e.quarter === Number(quarter)));
      setAllExams(filtered);
      setClassesBlock(DEMO_EXAMS.examWeekClasses || null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ classes: "1" });
    if (year) params.set("year", year);
    if (quarter) params.set("quarter", quarter);
    fetch(`${API}/api/exams?${params}`)
      .then(r => r.json())
      .then(d => {
        setAllExams(d.exams || []);
        setClassesBlock(d.examWeekClasses || null);
        if (d.quarters) setQuarters(d.quarters);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 初回: クォーター一覧取得 → 最新を自動選択
  useEffect(() => {
    if (isDemoMode()) {
      const qs = DEMO_EXAMS.quarters || [];
      setQuarters(qs);
      setAllExams(DEMO_EXAMS.exams || []);
      setClassesBlock(DEMO_EXAMS.examWeekClasses || null);
      if (qs.length > 0) { setSelYear(qs[0].year); setSelQ(qs[0].quarter); }
      setLoading(false);
      return;
    }
    fetch(`${API}/api/exams`)
      .then(r => r.json())
      .then(d => {
        const qs = d.quarters || [];
        setQuarters(qs);
        if (qs.length > 0) {
          setSelYear(qs[0].year);
          setSelQ(qs[0].quarter);
          // 最新のクォーターのデータだけ再取得
          fetchExams(qs[0].year, qs[0].quarter);
        } else {
          setAllExams(d.exams || []);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [fetchExams]);

  const handleQChange = (year, quarter) => {
    setSelYear(year);
    setSelQ(quarter);
    setEditingKey(null);
    fetchExams(year, quarter);
  };

  // 試験ごとのキー（自分用の修正・追加・非表示はこのキーで覚える。myExams.js）
  const keys = useMemo(() => examKeys(allExams), [allExams]);
  const officialMine = useMemo(() => matchMyExams(allExams, courses), [allExams, courses]);
  const myExams = useMemo(() => applyExamPrefs(officialMine, allExams, prefs), [officialMine, allExams, prefs]);
  const myKeys = useMemo(() => new Set(myExams.map(e => e._key)), [myExams]);
  const enrolledKeys = useMemo(() => new Set(officialMine.map(e => keys.get(e))), [officialMine, keys]);
  const myClasses = useMemo(() => matchMyClasses(classesBlock, courses), [classesBlock, courses]);
  const hiddenHere = useMemo(() => allExams.filter(e => prefs.hidden[keys.get(e)]), [allExams, prefs, keys]);

  const displayExams = useMemo(() => {
    if (!showAll) return myExams;
    const s = search.trim().toLowerCase();
    if (!s) return allExams;
    return allExams.filter(e => [e.code_raw, e.code, e.name, e.instructor, e.room].some(v => v && String(v).toLowerCase().includes(s)));
  }, [showAll, myExams, allExams, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayExams.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayExams]);

  const classesGrouped = useMemo(() => {
    const map = new Map();
    myClasses.forEach(c => { if (!map.has(c.date)) map.set(c.date, []); map.get(c.date).push(c); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [myClasses]);

  // まだ終わっていない最初の試験（当日でも時限が終わったものは飛ばす）
  const nextExam = useMemo(() => myExams.find(e => countdownText(e.date, e.period) !== t("exam.ended")) || null, [myExams]);

  const label = selYear && selQ ? t("exam.titleYQ", { year: selYear, q: selQ }) : t("exam.title");

  const ExamCard = ({ exam }) => {
    const key = exam._key || keys.get(exam);
    const c = courseOf(exam, courses);
    const col = c?.col || DAY_COLORS[exam.day] || T.accent;
    const pt = timeOf(exam.period);
    const timeStr = pt ? `${pt.start}〜${pt.end}` : exam.period;
    const isMine = myKeys.has(key);
    const enrolled = enrolledKeys.has(key);
    const editing = editingKey === key;
    const edited = exam._edited || [];
    // 今日の試験のうち、時限が終わったもの（日ごと薄くするのは前日まで）
    const endedToday = exam.date === ymdOf(new Date()) && countdownText(exam.date, exam.period) === t("exam.ended");

    return (
      <div style={{
        padding: mob ? "10px 12px" : "10px 14px",
        borderRadius: 10, background: isMine ? `${col}10` : T.bg2,
        border: `1px solid ${isMine ? `${col}30` : T.bd}`,
        opacity: endedToday ? 0.55 : 1,
        transition: "all .15s"
      }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flexShrink: 0, width: mob ? 56 : 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <div style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: col }}>{t("exam.period", { n: exam.period })}</div>
            <div style={{ fontSize: 10, color: T.txD }}>{timeStr}</div>
          </div>
          <div style={{ width: 3, borderRadius: 2, background: col, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: col }}>{exam.code_raw || exam.code}</span>
              {enrolled && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: `${col}20`, color: col }}>{t("exam.enrolled")}</span>}
              {exam._linked && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: `${T.accent}18`, color: T.accent }}>{t("exam.linked")}</span>}
              {edited.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.bg3, color: T.txD }}>{t("exam.edited")}</span>}
            </div>
            <div style={{
              fontSize: mob ? 13 : 14, fontWeight: 600, color: T.txH, marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>{exam.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: edited.includes("room") ? T.txH : T.txD, fontWeight: edited.includes("room") ? 700 : 400 }}>
                {I.pin}<span>{exam.room}</span>
              </span>
              {exam.instructor && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: T.txD }}>
                {I.user1}<span style={{ fontSize: 11 }}>{exam.instructor}</span>
              </span>}
            </div>
            {edited.length > 0 && !exam._conflict?.length && (
              <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>
                {edited.map(f => `${fieldLabel(f)} ${t("exam.officialNow", { value: valueText(f, exam._official?.[f]) })}`).join(" · ")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
            {isMine && !editing && <button type="button" onClick={() => setEditingKey(key)} style={smallBtn(T.txD)}>{t("exam.edit")}</button>}
            {isMine && !editing && (
              <button type="button" onClick={() => updatePrefs(p => (exam._linked && !enrolled ? unlinkExam(p, key) : hideExam(p, key)))} style={smallBtn(T.txD)}>
                {t("exam.removeFromMine")}
              </button>
            )}
            {!isMine && <button type="button" onClick={() => updatePrefs(p => (prefs.hidden[key] ? unhideExam(p, key) : linkExam(p, key, exam)))} style={smallBtn(T.accent)}>{t("exam.addToMine")}</button>}
          </div>
        </div>
        {isMine && <ExamNotice exam={exam}
          onUseOfficial={() => updatePrefs(p => clearExamEdit(p, key))}
          onKeepMine={() => updatePrefs(p => keepExamEdit(p, key, exam._official))} />}
        {editing && (
          <ExamEditor exam={exam}
            onSave={(form) => { updatePrefs(p => setExamEdit(p, exam, key, form)); setEditingKey(null); }}
            onReset={() => { updatePrefs(p => clearExamEdit(p, key)); setEditingKey(null); }}
            onCancel={() => setEditingKey(null)} />
        )}
      </div>
    );
  };

  const dateHeader = (date, list, cdText) => {
    const dayCol = DAY_COLORS[list[0]?.day] || T.accent;
    const isPast = cdText === t("exam.ended");
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 0", borderBottom: `2px solid ${dayCol}30` }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${dayCol}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: dayCol }}>
          {fmtDate(date).split("/")[1]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{fmtDateFull(date)}</div>
        </div>
        {cdText && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: isPast ? `${T.txD}15` : `${dayCol}15`, color: isPast ? T.txD : dayCol }}>{cdText}</span>}
      </div>
    );
  };

  const tabBtn = (on) => ({
    padding: "6px 14px", borderRadius: 8, border: `1px solid ${on ? T.accent : T.bd}`,
    background: on ? `${T.accent}15` : T.bg2, color: on ? T.accent : T.txD,
    fontSize: 12, fontWeight: 600, cursor: "pointer"
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: mob ? 18 : 20, fontWeight: 800, color: T.txH }}>{label}</h2>
          <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>
            {loading ? t("common.loading") : myExams.length > 0
              ? t("exam.foundCount", { n: myExams.length })
              : t("exam.noMyExams")}
          </div>
        </div>
        {/* クォーターセレクター */}
        {quarters.length > 1 && (
          <select
            value={`${selYear}_${selQ}`}
            onChange={e => { const [y, q] = e.target.value.split("_"); handleQChange(y, q); }}
            style={{
              padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`,
              background: T.bg2, color: T.txH, fontSize: 12, fontWeight: 600,
              cursor: "pointer", outline: "none"
            }}
          >
            {quarters.map(q => (
              <option key={`${q.year}_${q.quarter}`} value={`${q.year}_${q.quarter}`}>
                {t("exam.yearQuarter", { year: q.year, q: q.quarter })}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 次の試験カウントダウン */}
      {nextExam && (
        <div style={{
          padding: mob ? 14 : 16, borderRadius: 14,
          background: `linear-gradient(135deg, ${T.accent}15, ${T.accent}05)`,
          border: `1px solid ${T.accent}25`, marginBottom: 16
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${T.accent}20`, display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.txD }}>{t("exam.nextExam")}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{nextExam.name}</div>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: T.accent,
              padding: "4px 12px", borderRadius: 8, background: `${T.accent}15`
            }}>
              {countdownText(nextExam.date, nextExam.period)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 12, color: T.txD }}>
            <span>{fmtDateFull(nextExam.date)}</span>
            {timeOf(nextExam.period) && <span>{timeOf(nextExam.period).start}〜{timeOf(nextExam.period).end}</span>}
            <span>{nextExam.room}</span>
          </div>
        </div>
      )}

      {/* フィルタートグル */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setShowAll(false)} style={tabBtn(!showAll)}>{t("exam.myExams", { n: myExams.length })}</button>
        <button onClick={() => setShowAll(true)} style={tabBtn(showAll)}>{t("exam.allExams", { n: allExams.length })}</button>
        {showAll && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("exam.searchPh")}
            style={{ flex: "1 1 180px", minWidth: 0, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
        )}
      </div>
      {showAll && <div style={{ fontSize: 11, color: T.txD, margin: "-6px 0 12px" }}>{t("exam.addHint")}</div>}

      {/* 試験一覧 (日付グループ) */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>{t("common.loading")}</div>
      )}

      {!loading && grouped.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>
          {showAll ? (search ? t("exam.noSearchResults") : t("exam.noExamData")) : t("exam.noMatchingExams")}
        </div>
      )}

      {!loading && grouped.map(([date, exams]) => {
        const cd = countdownText(date);
        const isPast = cd === t("exam.ended");
        return (
          <div key={date} style={{ marginBottom: 20, opacity: isPast ? 0.5 : 1 }}>
            {dateHeader(date, exams, cd)}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {exams.map((exam, i) => <ExamCard key={`${exam._key || keys.get(exam) || exam.code_raw}-${i}`} exam={exam} />)}
            </div>
          </div>
        );
      })}

      {/* 試験期間中の授業・補講（自分の授業のもの） */}
      {!loading && !showAll && classesGrouped.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.txH, marginBottom: 4 }}>{t("exam.classesTitle", { n: myClasses.length })}</div>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 10, lineHeight: 1.6 }}>{t("exam.classesHint")}</div>
          {classesGrouped.map(([date, list]) => {
            const cd = countdownText(date);
            return (
              <div key={date} style={{ marginBottom: 14, opacity: cd === t("exam.ended") ? 0.5 : 1 }}>
                {dateHeader(date, list, cd)}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((cl, i) => {
                    const pt = timeOf(cl.period);
                    const col = courseOf(cl, courses)?.col || T.accent;
                    return (
                      <div key={`${cl.code_raw}-${cl.period}-${i}`} style={{ display: "flex", gap: 10, padding: mob ? "10px 12px" : "10px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}` }}>
                        <div style={{ flexShrink: 0, width: mob ? 56 : 64, textAlign: "center" }}>
                          <div style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: col }}>{t("exam.period", { n: cl.period })}</div>
                          <div style={{ fontSize: 10, color: T.txD }}>{pt ? `${pt.start}〜${pt.end}` : ""}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{cl.code_raw}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.bg3, color: T.txD }}>{t("home.itemExamWeekClass")}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.name}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: T.txD, flexWrap: "wrap" }}>
                            {cl.room && <span style={{ display: "flex", alignItems: "center", gap: 3 }}>{I.pin}<span>{cl.room}</span></span>}
                            {cl.instructor && <span style={{ display: "flex", alignItems: "center", gap: 3 }}>{I.user1}<span>{cl.instructor}</span></span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 自分の試験から外したもの */}
      {!loading && !showAll && hiddenHere.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => setShowHidden(v => !v)} style={{ ...smallBtn(T.txD), border: "none", background: "none", padding: 0 }}>
            {t("exam.hiddenCount", { n: hiddenHere.length })} {showHidden ? "▲" : "▼"}
          </button>
          {showHidden && hiddenHere.map(e => (
            <div key={keys.get(e)} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: T.txD }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(e.date)} {t("exam.period", { n: e.period })} {e.name}</span>
              <button type="button" onClick={() => updatePrefs(p => unhideExam(p, keys.get(e)))} style={smallBtn(T.accent)}>{t("exam.restore")}</button>
            </div>
          ))}
        </div>
      )}

      {/* 注意書き（データの出どころ・公式の確認・誤りの報告） */}
      {!loading && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, fontSize: 11, color: T.txD, lineHeight: 1.7 }}>
          <div>{t("exam.disclaimer")}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            {OFFICIAL_PAGES.map(p => <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontWeight: 600 }}>{t(p.key)}</a>)}
            {setView && <button type="button" onClick={() => setView("support")} style={{ ...smallBtn(T.accent), border: "none", background: "none", padding: 0 }}>{t("exam.reportProblem")}</button>}
          </div>
        </div>
      )}
    </div>
  );
};
