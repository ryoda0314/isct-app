import React, { useState, useMemo, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { isDemoMode } from "../demoMode.js";
import { buildDemoMedSessions } from "../demoData.js";

const DAYS = ["月", "火", "水", "木", "金"];

const EXAM_RE = /試験|テスト/;
// instructor 欄の完全一致パターン: "試験"等の短い値のみ。文中に試験を含む長い教員記述は誤検知を防ぐため除外
const EXAM_INSTRUCTOR_RE = /^(試験|追再試験|追試験|筆記試験|ユニット試験|テスト)$/;
const EXAM_COLOR = "#e5534b";
const isExam = (s) =>
  EXAM_RE.test(s.sessionTitle) ||
  EXAM_RE.test(s.sessionContent) ||
  EXAM_INSTRUCTOR_RE.test(s.instructor);
const examLabel = (s) =>
  (s.sessionTitle && EXAM_RE.test(s.sessionTitle)) ? s.sessionTitle :
  (s.sessionContent && EXAM_RE.test(s.sessionContent)) ? s.sessionContent :
  (s.instructor && EXAM_INSTRUCTOR_RE.test(s.instructor)) ? s.instructor : "試験";
const COLORS = [
  "#6375f0", "#e5534b", "#3dae72", "#a855c7", "#d4843e", "#c6a236", "#2d9d8f", "#c75d8e",
  "#5b8def", "#d45d5d", "#46b87a", "#b06fd0", "#c08040", "#b8a830", "#35a898", "#c06090",
  "#4a90d9", "#d97b4a", "#38c78a", "#9b59b6", "#e67e22", "#1abc9c", "#e74c8b", "#7f8cdd",
  "#c0392b", "#27ae60", "#8e44ad", "#f39c12", "#16a085", "#d35498", "#2980b9", "#e84393",
];

// ── Time axis (hourly grid lines, period-system agnostic) ──
const GRID_START_MIN = 8 * 60 + 30;   // 08:30
const GRID_END_MIN   = 19 * 60;       // 19:00
const HOUR_LABELS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const getMonday = (d) => {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const fmtDate = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
const fmtDateShort = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const parseTime = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// WeekGrid (unused — inline rendering below)
const _WeekGrid_unused = ({ weekDates, byDate, gridStart, gridHeight, colorMap, mob, today, goToCourse }) => {
  const PX_PER_MIN = mob ? 1.2 : 1.5;
  const GRID_H = gridHeight * PX_PER_MIN;
  const HDR_H = 28;

  const allDayBlocks = weekDates.map((date) => {
    const dateStr = fmtDate(date);
    const daySessions = byDate[dateStr] || [];
    const seen = new Set();
    const blocks = [];
    for (const s of daySessions) {
      const key = `${s.code}|${s.timeStart}|${s.timeEnd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const startMin = parseTime(s.timeStart) - gridStart;
      const endMin = parseTime(s.timeEnd) - gridStart;
      if (startMin >= 0 && endMin > startMin) blocks.push({ s, startMin, endMin, col: 0, totalCols: 1 });
    }
    for (let i = 0; i < blocks.length; i++) {
      const group = [blocks[i]];
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].startMin < blocks[i].endMin && blocks[j].endMin > blocks[i].startMin) group.push(blocks[j]);
      }
      if (group.length > 1) {
        let nextCol = 0;
        for (const g of group) {
          while (group.filter(o => o !== g && o.col === nextCol).length > 0) nextCol++;
          if (g.col === 0 && group.indexOf(g) > 0) { g.col = nextCol; nextCol++; }
        }
        const sorted = [...group].sort((a, b) => a.col - b.col);
        sorted.forEach((g, idx) => { g.col = idx; g.totalCols = sorted.length; });
      }
    }
    return blocks;
  });

  if (GRID_H <= 0) return null;

  return (
    <div style={{ display: "flex", width: "100%", overflow: "hidden" }}>
      {/* Time labels (hourly) */}
      <div style={{ width: mob ? 36 : 44, flexShrink: 0, paddingTop: HDR_H }}>
        <div style={{ position: "relative", height: GRID_H }}>
          {HOUR_LABELS.map((h) => {
            const top = (h * 60 - gridStart) * PX_PER_MIN;
            return (
              <div key={h} style={{
                position: "absolute", top: top - 6, width: "100%",
                textAlign: "right", paddingRight: 4,
                fontSize: mob ? 9 : 10, fontWeight: 500, color: T.txD,
              }}>
                {h}:00
              </div>
            );
          })}
        </div>
      </div>

      {/* Day columns */}
      {weekDates.map((date, di) => {
        const isToday = isSameDay(date, today);
        const blocks = allDayBlocks[di];
        return (
          <div key={di} style={{ flex: 1, borderLeft: `1px solid ${T.bd}20` }}>
            <div style={{
              height: HDR_H, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600,
              color: isToday ? T.accent : T.txD,
              background: isToday ? `${T.accent}08` : "transparent",
              borderBottom: `1px solid ${T.bd}20`,
            }}>
              {DAYS[di]} {date.getDate()}
            </div>
            <div style={{ position: "relative", height: GRID_H }}>
              {HOUR_LABELS.map((h) => {
                const top = (h * 60 - gridStart) * PX_PER_MIN;
                return <div key={h} style={{ position: "absolute", top, width: "100%", borderTop: `1px solid ${T.bd}15` }} />;
              })}
              {blocks.map((b, bi) => {
                const { s, startMin, endMin } = b;
                const top = startMin * PX_PER_MIN;
                const height = (endMin - startMin) * PX_PER_MIN;
                const col = colorMap[s.code] || COLORS[0];
                return (
                  <div key={bi} onClick={() => goToCourse?.(s.code)} style={{
                    position: "absolute", top, height,
                    left: `calc(${(b.col / b.totalCols) * 100}% + 1px)`,
                    width: `calc(${(1 / b.totalCols) * 100}% - 2px)`,
                    borderRadius: 6, background: `${col}20`, border: `1px solid ${col}50`,
                    padding: "2px 4px", overflow: "hidden", fontSize: mob ? 9 : 11, lineHeight: 1.3,
                    cursor: "pointer",
                  }} title={`${s.name}\n${s.timeStart}～${s.timeEnd}\n${s.room || ""}`}>
                    <div style={{ fontWeight: 700, color: col, fontSize: mob ? 10 : 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {mob ? s.code.split(".")[1] : s.name}
                    </div>
                    {mob && height >= 30 && (
                      <div style={{ fontSize: 8, color: T.txH, fontWeight: 500, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.2, marginTop: 1 }}>{s.name}</div>
                    )}
                    {!mob && height >= 40 && (
                      <div style={{ color: T.txD, fontSize: 9 }}>{s.timeStart}～{s.timeEnd}</div>
                    )}
                    {height >= 60 && s.room && (
                      <div style={{ color: T.txD, fontSize: mob ? 7 : 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.room}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Medical/Dental timetable view.
 * Shows session-based schedule fetched from yushima2 syllabus system.
 */
export const MedTTView = ({ courses = [], mob, setCid, setView, setCh, demoKey, asgn = [], hiddenSet = new Set(), onRefresh }) => {
  const [sessions, setSessions] = useState([]);
  const [courseMeta, setCourseMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [viewMode, setViewMode] = useState("week"); // "week" | "calendar"
  const [calMonth, setCalMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selDay, setSelDay] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [capturedCourses, setCapturedCourses] = useState([]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      await fetchSessions();
    } finally {
      setRefreshing(false);
    }
  };

  // lct_cd to hide (duplicate module entries where the parent course is preferred)
  // 021181(顔面・顎・口腔疾患) → 021180(顎口腔医療) が同一モジュールで完全重複、021180側を優先
  const HIDDEN_LCT_CDS = new Set(["021181"]);

  // Extract medical courses with lct_cd from fullname【XXXXXX】
  const medCourses = useMemo(() => {
    const src = courses.length > 0 ? courses : capturedCourses;
    return src.filter(c => {
      const m = c.fullname?.match(/【(\d{6})】/);
      return m && !HIDDEN_LCT_CDS.has(m[1]);
    }).map(c => {
      const m = c.fullname.match(/【(\d{6})】/);
      const codeMatch = c.shortname?.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);
      return {
        code: codeMatch ? codeMatch[1] : c.shortname,
        lctCd: m[1],
        name: c.fullname.split(" / ")[0].replace(/\s*\/?\s*【\d{6}】/, "").trim(),
        moodleId: c.id,
      };
    });
  }, [courses, capturedCourses]);

  // Admin fallback: load from captured moodle data
  useEffect(() => {
    if (courses.length > 0) return;
    (async () => {
      try {
        console.log("[MedTT] Loading captured moodle data (filter=med)...");
        const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_captured_moodle", filter: "med" }),
        });
        if (!r.ok) { console.error("[MedTT] admin API error:", r.status); return; }
        const d = await r.json();
        const caps = d.captures || [];
        if (caps.length === 0) { console.log("[MedTT] No captures found"); return; }
        // Find the most recent capture that actually contains med/dental courses
        // (a capture from a non-med user would have 0 med courses and be useless)
        let pickedMed = null;
        let pickedUser = null;
        for (const cap of caps) {
          if (!cap?.raw_courses) continue;
          const med = cap.raw_courses.filter(c => /【\d{6}】/.test(c.fullname));
          if (med.length > 0) { pickedMed = med; pickedUser = cap.moodle_user_id; break; }
        }
        if (pickedMed) {
          console.log(`[MedTT] Using capture from user=${pickedUser} with ${pickedMed.length} med courses (scanned ${caps.length} captures)`);
          setCapturedCourses(pickedMed);
        } else {
          console.log(`[MedTT] No capture contains med courses (scanned ${caps.length})`);
        }
      } catch (e) { console.error("[MedTT] capture load error:", e); }
    })();
  }, [courses]);

  // Color map for courses (medCourses + any additional codes from sessions)
  const colorMap = useMemo(() => {
    const map = {};
    let idx = 0;
    medCourses.forEach((c) => { map[c.code] = COLORS[idx++ % COLORS.length]; });
    // Also assign colors to session codes not in medCourses (e.g. LIB courses)
    const sessionCodes = new Set(sessions.map(s => s.code));
    for (const code of sessionCodes) {
      if (!map[code]) map[code] = COLORS[idx++ % COLORS.length];
    }
    return map;
  }, [medCourses, sessions]);

  // code → moodleId map for navigation
  const moodleIdMap = useMemo(() => {
    const map = {};
    medCourses.forEach(c => { if (c.moodleId) map[c.code] = c.moodleId; });
    return map;
  }, [medCourses]);

  // Count pending assignments for a moodle course id
  const cntByCode = useCallback((code) => {
    const mid = moodleIdMap[code];
    if (!mid) return 0;
    const cid = `mc_${mid}`;
    return asgn.filter(a => a.cid === cid && a.st !== "completed" && !hiddenSet.has(a.id)).length;
  }, [asgn, hiddenSet, moodleIdMap]);

  const goToCourse = (code) => {
    const mid = moodleIdMap[code];
    if (mid && setCid && setView) {
      setCid(`mc_${mid}`);
      if (setCh) setCh("timeline");
      setView("course");
    }
  };

  // Demo mode: demoKey is passed from App.jsx (e.g. "med", "med_b1", "den_b2", "den")
  const demoPersonaType = useMemo(() => {
    if (!isDemoMode() || medCourses.length === 0) return null;
    return demoKey || (medCourses.some(c => c.code?.startsWith("DEN.")) ? "den" : "med");
  }, [medCourses, demoKey]);

  // Fetch sessions from API (or demo data)
  const fetchSessions = useCallback(async () => {
    if (medCourses.length === 0) { console.log("[MedTT] No med courses, skipping fetch"); return; }

    // Demo mode: use generated session data
    if (isDemoMode() && demoPersonaType) {
      console.log("[MedTT] Demo mode: generating sessions for", demoPersonaType);
      const demo = buildDemoMedSessions(demoPersonaType);
      setSessions(demo.sessions);
      setCourseMeta(demo.courseMeta);
      return;
    }

    console.log("[MedTT] Fetching sessions for", medCourses.length, "courses...");
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/data/med-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: medCourses }),
      });
      if (!resp.ok) { setError(`API error: ${resp.status}`); console.error("[MedTT] API error:", resp.status); return; }
      const d = await resp.json();
      if (d.error) { setError(d.error); return; }
      console.log("[MedTT] Got", d.sessions?.length, "sessions");
      setSessions(d.sessions || []);
      setCourseMeta(d.courseMeta || {});
    } catch (e) {
      console.error("[MedTT] fetch error:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [medCourses, demoPersonaType]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Group sessions by date string "YYYY/MM/DD"
  const byDate = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      if (!s.date) continue;
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  }, [sessions]);

  // Week navigation
  const prevW = () => setWeekStart(p => { const d = new Date(p); d.setDate(d.getDate() - 7); return d; });
  const nextW = () => setWeekStart(p => { const d = new Date(p); d.setDate(d.getDate() + 7); return d; });
  const goToday = () => { setWeekStart(getMonday(new Date())); setCalMonth({ y: new Date().getFullYear(), m: new Date().getMonth() }); };

  // Week dates
  const weekDates = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // Faculty label (医学部 / 歯学部) — derived from course codes
  const faculty = useMemo(() => {
    const hasDEN = medCourses.some(c => c.code?.startsWith("DEN.") || /^02/.test(c.lctCd));
    const hasMED = medCourses.some(c => c.code?.startsWith("MED.") || /^01/.test(c.lctCd));
    if (hasDEN && !hasMED) return "DEN";
    if (hasMED && !hasDEN) return "MED";
    return sessions.some(s => /^[gb]\d|^c\d/.test(s.periodStr)) ? "MED" : "DEN";
  }, [medCourses, sessions]);

  // Fixed time-axis grid (period-system agnostic)
  const gridStart = GRID_START_MIN;
  const gridHeight = GRID_END_MIN - GRID_START_MIN;

  // Calendar data
  const calFirst = new Date(calMonth.y, calMonth.m, 1);
  const calStartOff = (calFirst.getDay() + 6) % 7;
  const calDaysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
  const calWeeks = Math.ceil((calStartOff + calDaysInMonth) / 7);
  const prevM = () => setCalMonth(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 });
  const nextM = () => setCalMonth(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 });

  if (medCourses.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 14 }}>
        医歯学系の科目が見つかりません
      </div>
    );
  }

  const today = new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>医歯学時間割</div>
          <span style={{ fontSize: 11, color: T.txD, background: T.bg3, padding: "2px 8px", borderRadius: 6 }}>{medCourses.length}科目</span>
          {sessions.length > 0 && <span style={{ fontSize: 10, color: T.txD, background: T.bg3, padding: "2px 6px", borderRadius: 6 }}>{faculty === "MED" ? "医学部" : "歯学部"}</span>}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {onRefresh && (
            <>
              <style>{`@keyframes medttSpin{to{transform:rotate(360deg)}}`}</style>
              <button onClick={handleRefresh} disabled={refreshing} title="Moodleから再取得" style={{
                background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 8, padding: "4px 10px",
                cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, fontWeight: 600, color: refreshing ? T.txD : T.txH,
                opacity: refreshing ? .6 : 1, transition: "all .2s",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: refreshing ? "medttSpin 1s linear infinite" : "none" }}>
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                {refreshing ? "更新中..." : "更新"}
              </button>
            </>
          )}
          {["week", "calendar"].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: viewMode === m ? `1px solid ${T.accent}` : `1px solid ${T.bd}`,
              background: viewMode === m ? `${T.accent}15` : T.bg3,
              color: viewMode === m ? T.accent : T.txD,
            }}>{m === "week" ? "週間" : "カレンダー"}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>スケジュール取得中...</div>}
      {error && <div style={{ padding: 12, color: "#e5534b", fontSize: 12 }}>{error}</div>}

      {!loading && viewMode === "week" && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 80 }}>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 14px", flexShrink: 0 }}>
            <button onClick={prevW} style={{ background: "none", border: "none", cursor: "pointer", color: T.txD, fontSize: 18 }}>‹</button>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, minWidth: 160, textAlign: "center" }}>
              {fmtDateShort(weekDates[0])}（月）〜 {fmtDateShort(weekDates[4])}（金）
            </div>
            <button onClick={nextW} style={{ background: "none", border: "none", cursor: "pointer", color: T.txD, fontSize: 18 }}>›</button>
            <button onClick={goToday} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txD, cursor: "pointer" }}>今週</button>
          </div>

          {/* Week grid — time-proportional with session blocks as-is from API */}
          {(() => {
            const PX_PER_MIN = mob ? 1.0 : 1.4;
            const GRID_H = gridHeight * PX_PER_MIN;
            const HDR_H = 30;
            if (GRID_H <= 0) return null;

            // Build day blocks: no merging, deduplicate only exact same entry
            const allDayBlocks = weekDates.map((date) => {
              const dateStr = fmtDate(date);
              const daySessions = byDate[dateStr] || [];
              const seen = new Set();
              const blocks = [];
              for (const s of daySessions) {
                const key = `${s.code}|${s.timeStart}|${s.timeEnd}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const startMin = parseTime(s.timeStart) - gridStart;
                const endMin = parseTime(s.timeEnd) - gridStart;
                if (startMin >= 0 && endMin > startMin) blocks.push({ s, startMin, endMin, col: 0, totalCols: 1 });
              }
              // Overlap detection
              for (let i = 0; i < blocks.length; i++) {
                const group = [blocks[i]];
                for (let j = i + 1; j < blocks.length; j++) {
                  if (blocks[j].startMin < blocks[i].endMin && blocks[j].endMin > blocks[i].startMin) group.push(blocks[j]);
                }
                if (group.length > 1) {
                  const sorted = [...new Set(group)].sort((a, b) => a.startMin - b.startMin || a.col - b.col);
                  sorted.forEach((g, idx) => { g.col = idx; g.totalCols = sorted.length; });
                }
              }
              return blocks;
            });

            return (
              <div style={{ display: "flex" }}>
                {/* Time axis labels (hourly) */}
                <div style={{ width: mob ? 36 : 44, flexShrink: 0, paddingTop: HDR_H }}>
                  <div style={{ position: "relative", height: GRID_H }}>
                    {HOUR_LABELS.map((h) => {
                      const top = (h * 60 - gridStart) * PX_PER_MIN;
                      return (
                        <div key={h} style={{
                          position: "absolute", top: top - 6, width: "100%",
                          textAlign: "right", paddingRight: 4,
                          fontSize: mob ? 9 : 10, fontWeight: 500, color: T.txD,
                        }}>
                          {h}:00
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Day columns */}
                {weekDates.map((date, di) => {
                  const isToday = isSameDay(date, today);
                  const blocks = allDayBlocks[di];
                  return (
                    <div key={di} style={{ flex: 1, minWidth: 0, borderLeft: `1px solid ${T.bd}15` }}>
                      <div style={{
                        height: HDR_H, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 600,
                        color: isToday ? T.accent : T.txD,
                        background: isToday ? `${T.accent}06` : "transparent",
                        borderBottom: `1px solid ${T.bd}20`,
                      }}>
                        {DAYS[di]} {date.getDate()}
                      </div>
                      <div style={{ position: "relative", height: GRID_H }}>
                        {/* Hourly grid lines */}
                        {HOUR_LABELS.map((h) => {
                          const top = (h * 60 - gridStart) * PX_PER_MIN;
                          return <div key={h} style={{ position: "absolute", top, width: "100%", borderTop: `1px solid ${T.bd}${h === 12 ? '25' : '12'}` }} />;
                        })}

                        {/* Session blocks */}
                        {blocks.map((b, bi) => {
                          const { s, startMin, endMin } = b;
                          const top = startMin * PX_PER_MIN;
                          const height = (endMin - startMin) * PX_PER_MIN;
                          const exam = isExam(s);
                          const col = exam ? EXAM_COLOR : (colorMap[s.code] || COLORS[0]);
                          const n = cntByCode(s.code);
                          return (
                            <div key={bi} onClick={() => goToCourse(s.code)} style={{
                              position: "absolute", top, height,
                              left: `calc(${(b.col / b.totalCols) * 100}% + 1px)`,
                              width: `calc(${(1 / b.totalCols) * 100}% - 2px)`,
                              borderRadius: 6,
                              background: exam ? `${EXAM_COLOR}22` : `${col}18`,
                              border: exam ? `1.5px solid ${EXAM_COLOR}80` : `1px solid ${col}40`,
                              boxShadow: exam ? `0 2px 8px ${EXAM_COLOR}30` : "none",
                              padding: "2px 4px", overflow: "hidden", cursor: "pointer",
                              fontSize: mob ? 8 : 10, lineHeight: 1.3,
                            }} title={`${s.name}\n${examLabel(s)}\n${s.timeStart}～${s.timeEnd}\n${s.room || ""}`}>
                              {n > 0 && <div style={{ position: "absolute", top: mob ? 2 : 3, right: mob ? 2 : 3, minWidth: mob ? 14 : 18, height: mob ? 14 : 18, borderRadius: 9, background: T.red, color: "#fff", fontSize: mob ? 7 : 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", boxShadow: `0 2px 6px ${T.red}60`, zIndex: 1 }}>{n}</div>}
                              {exam ? (
                                <>
                                  <div style={{ fontWeight: 800, color: EXAM_COLOR, fontSize: mob ? 9 : 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    ⚠ {examLabel(s)}
                                  </div>
                                  {height >= 25 && (
                                    <div style={{ color: EXAM_COLOR, fontSize: mob ? 7 : 9, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                                  )}
                                  {height >= 40 && (
                                    <div style={{ color: T.txD, fontSize: mob ? 7 : 9 }}>{s.timeStart}～{s.timeEnd}</div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div style={{ fontWeight: 700, color: col, fontSize: mob ? 9 : 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {s.name}
                                  </div>
                                  {height >= 25 && (
                                    <div style={{ color: T.txD, fontSize: mob ? 7 : 9 }}>{s.timeStart}～{s.timeEnd}</div>
                                  )}
                                  {height >= 45 && s.room && (
                                    <div style={{ color: T.txD, fontSize: mob ? 7 : 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.room}</div>
                                  )}
                                  {height >= 60 && s.instructor && (
                                    <div style={{ color: T.txD, fontSize: mob ? 7 : 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.instructor}</div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Course list */}
          <div style={{ padding: mob ? "14px 8px" : "28px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: mob ? 6 : 12 }}>
              <div style={{ fontSize: mob ? 13 : 16, fontWeight: 700, color: T.txH }}>履修科目一覧</div>
              <span style={{ fontSize: 11, color: T.txD, background: T.bg3, padding: "2px 10px", borderRadius: 10 }}>{medCourses.length}科目</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 4 : 8, overflow: "hidden" }}>
              {medCourses.map((c, i) => {
                const col = colorMap[c.code] || COLORS[0];
                const meta = courseMeta[c.code];
                const n = cntByCode(c.code);
                return (
                  <div key={c.code} onClick={() => goToCourse(c.code)} style={{
                    display: "flex", alignItems: "center", gap: mob ? 8 : 12,
                    padding: mob ? "8px 10px" : "12px 14px", borderRadius: 12,
                    background: T.bg2, border: `1.5px solid ${T.bd}`, cursor: "pointer",
                    minWidth: 0, overflow: "hidden",
                  }}>
                    <div style={{
                      width: mob ? 36 : 44, height: mob ? 36 : 44, borderRadius: 12, flexShrink: 0,
                      background: `linear-gradient(135deg, ${col}, ${col}aa)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 2px 8px ${col}30`,
                    }}>
                      <span style={{ color: "#fff", fontWeight: 800, fontSize: mob ? 11 : 13 }}>
                        {c.code.split(".")[1]?.slice(0, 3) || c.code.slice(0, 3)}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: T.txH, fontSize: mob ? 12 : 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: mob ? 10 : 11, color: T.txD, marginTop: 2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <span style={{ background: T.bg3, padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{c.code}</span>
                        {meta?.semester && <span>{meta.semester}</span>}
                        {meta?.credits && <span>{meta.credits}単位</span>}
                        {meta?.instructor && <span>· {meta.instructor}</span>}
                      </div>
                    </div>
                    {n > 0 && <div style={{ padding: "4px 10px", borderRadius: 12, background: `${T.red}15`, color: T.red, fontSize: 11, fontWeight: 700, flexShrink: 0, border: `1px solid ${T.red}30` }}>課題 {n}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && viewMode === "calendar" && (
        <div style={{ flex: 1, overflow: "auto", padding: "8px 14px 80px" }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12 }}>
            <button onClick={prevM} style={{ background: "none", border: "none", cursor: "pointer", color: T.txD, fontSize: 18 }}>‹</button>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{calMonth.y}年 {calMonth.m + 1}月</div>
            <button onClick={nextM} style={{ background: "none", border: "none", cursor: "pointer", color: T.txD, fontSize: 18 }}>›</button>
            <button onClick={goToday} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txD, cursor: "pointer" }}>今月</button>
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {["月", "火", "水", "木", "金", "土", "日"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: T.txD, padding: 4 }}>{d}</div>
            ))}
            {Array.from({ length: calWeeks * 7 }, (_, i) => {
              const dayNum = i - calStartOff + 1;
              const isValid = dayNum >= 1 && dayNum <= calDaysInMonth;
              const date = isValid ? new Date(calMonth.y, calMonth.m, dayNum) : null;
              const dateStr = date ? fmtDate(date) : null;
              const daySessions = dateStr ? (byDate[dateStr] || []) : [];
              const isToday = date && isSameDay(date, today);
              const isSel = date && selDay && isSameDay(date, selDay);
              const uniqueCourses = [...new Set(daySessions.map(s => s.code))];
              const hasExam = daySessions.some(isExam);

              return (
                <div key={i} onClick={() => { if (date) { setSelDay(date); setWeekStart(getMonday(date)); } }}
                  style={{
                    minHeight: mob ? 48 : 60, padding: 3, borderRadius: 6, cursor: isValid ? "pointer" : "default",
                    background: isSel ? `${T.accent}12` : isToday ? `${T.accent}06` : "transparent",
                    border: isSel ? `1px solid ${T.accent}40` : hasExam ? `1px solid ${EXAM_COLOR}40` : `1px solid ${T.bd}`,
                  }}>
                  {isValid && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                        <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? T.accent : T.txH }}>{dayNum}</div>
                        {hasExam && <div style={{ fontSize: 8, fontWeight: 700, color: EXAM_COLOR, background: `${EXAM_COLOR}18`, padding: "0px 3px", borderRadius: 3, lineHeight: "14px" }}>試</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {uniqueCourses.slice(0, 3).map(code => (
                          <div key={code} style={{
                            fontSize: 8, padding: "1px 3px", borderRadius: 3,
                            background: `${colorMap[code] || COLORS[0]}20`,
                            color: colorMap[code] || COLORS[0],
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {(courseMeta[code]?.name || code).slice(0, mob ? 4 : 8)}
                          </div>
                        ))}
                        {uniqueCourses.length > 3 && (
                          <div style={{ fontSize: 8, color: T.txD }}>+{uniqueCourses.length - 3}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selDay && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 8 }}>
                {selDay.getMonth() + 1}/{selDay.getDate()}（{DAYS[(selDay.getDay() + 6) % 7] || "日"}）
              </div>
              {(() => {
                const dateStr = fmtDate(selDay);
                const daySessions = byDate[dateStr] || [];
                if (daySessions.length === 0) return <div style={{ fontSize: 12, color: T.txD }}>この日の授業はありません</div>;
                // Merge consecutive
                const merged = [];
                for (const s of daySessions) {
                  const last = merged[merged.length - 1];
                  if (last && last.code === s.code && last.timeEnd === s.timeStart) {
                    last.timeEnd = s.timeEnd;
                  } else {
                    merged.push({ ...s });
                  }
                }
                return merged.map((s, i) => {
                  const exam = isExam(s);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < merged.length - 1 ? `1px solid ${T.bd}15` : "none" }}>
                      <div style={{ width: 4, height: 28, borderRadius: 2, background: exam ? EXAM_COLOR : (colorMap[s.code] || COLORS[0]), flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.txH }}>{s.name}</div>
                          {exam && <div style={{ fontSize: 10, fontWeight: 700, color: EXAM_COLOR, background: `${EXAM_COLOR}18`, padding: "1px 6px", borderRadius: 4, border: `1px solid ${EXAM_COLOR}40`, whiteSpace: "nowrap" }}>⚠ {examLabel(s)}</div>}
                        </div>
                        <div style={{ fontSize: 11, color: T.txD }}>{s.timeStart}～{s.timeEnd}　{s.room || ""}</div>
                      </div>
                    </div>
                  );
                });
              })()}
              <button onClick={() => { setViewMode("week"); setWeekStart(getMonday(selDay)); }}
                style={{ marginTop: 8, fontSize: 11, padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, cursor: "pointer" }}>
                この週を表示
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
