import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { getMedSessionsByCourse, defaultAbsenceLimit } from "../attendanceUtils.js";

const STATUS = [
  { k: "present", l: "出席", c: T.green },
  { k: "absent", l: "欠席", c: T.red },
  { k: "late", l: "遅刻", c: T.orange },
];

const Toggle = ({ value, onPick, mob }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {STATUS.map((s) => {
      const on = value === s.k;
      return (
        <button key={s.k} onClick={() => onPick(on ? null : s.k)}
          style={{ border: `1px solid ${on ? s.c : T.bd}`, background: on ? s.c : "transparent", color: on ? "#fff" : T.txD, borderRadius: 6, padding: mob ? "3px 8px" : "4px 10px", fontSize: mob ? 11 : 12, fontWeight: 700, cursor: "pointer", transition: "all .12s" }}>
          {s.l}
        </button>
      );
    })}
  </div>
);

const MED_COL = "#e04e6a";

const limitKey = (code) => `attLimit:med:${code}`;
const loadLimit = (code, fallback) => {
  try {
    const v = localStorage.getItem(limitKey(code));
    return v != null ? parseInt(v, 10) : fallback;
  } catch {
    return fallback;
  }
};

const stepBtn = {
  width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg3,
  color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

const CourseCard = ({ course, statuses, setStatus, mob }) => {
  const [open, setOpen] = useState(false);
  const sessions = course.sessions;
  const total = sessions.length;

  let present = 0, absent = 0, late = 0;
  for (const s of sessions) {
    const st = statuses[s.sessionKey];
    if (st === "present") present++;
    else if (st === "absent") absent++;
    else if (st === "late") late++;
  }
  const recorded = present + absent + late;
  const rate = recorded ? Math.round((present / recorded) * 100) : null;

  const defLimit = defaultAbsenceLimit(total);
  const [limit, setLimit] = useState(() => loadLimit(course.code, defLimit));
  const remaining = limit - absent;
  const danger = total > 0 && remaining <= 0;
  const warn = total > 0 && !danger && remaining <= 1;

  const changeLimit = (delta) => {
    setLimit((p) => {
      const nv = Math.max(0, p + delta);
      try { localStorage.setItem(limitKey(course.code), String(nv)); } catch {}
      return nv;
    });
  };

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 12, marginBottom: 10, overflow: "hidden", borderLeft: `3px solid ${MED_COL}` }}>
      <div onClick={() => setOpen((p) => !p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: mob ? "10px 12px" : "12px 14px", cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 13 : 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: T.bg3, padding: "1px 6px", borderRadius: 4 }}>{course.code}</span>
            <span>全{total}回</span>
            {present > 0 && <span style={{ color: T.green }}>出{present}</span>}
            {absent > 0 && <span style={{ color: T.red }}>欠{absent}</span>}
            {late > 0 && <span style={{ color: T.orange }}>遅{late}</span>}
            {rate != null && <span>· 出席率{rate}%</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {total > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: danger ? "#fff" : warn ? T.red : T.txD, background: danger ? T.red : warn ? `${T.red}18` : T.bg3, border: warn && !danger ? `1px solid ${T.red}40` : "none" }}>
              {danger ? "欠席上限超過" : `あと${remaining}回欠席可`}
            </span>
          )}
          <span style={{ color: T.txD, fontSize: 11 }}>{open ? "閉じる ▲" : "日程 ▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${T.bd}`, padding: mob ? "8px 12px 12px" : "10px 14px 14px" }}>
          {/* 欠席上限の調整 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: T.txD, flexWrap: "wrap" }}>
            <span>欠席可能上限</span>
            <button onClick={() => changeLimit(-1)} style={stepBtn}>−</button>
            <span style={{ fontWeight: 700, color: T.txH, minWidth: 28, textAlign: "center" }}>{limit}回</span>
            <button onClick={() => changeLimit(1)} style={stepBtn}>＋</button>
            <span style={{ fontSize: 11 }}>（初期値: 全{total}回の1/3＝{defLimit}回）</span>
          </div>
          {sessions.map((s) => {
            const st = statuses[s.sessionKey] || null;
            return (
              <div key={s.sessionKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.bd}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: mob ? 12 : 13, color: T.txH, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.date}（{s.day}）{s.timeStart && `${s.timeStart}〜${s.timeEnd || ""}`}
                  </div>
                  <div style={{ fontSize: 11, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[s.room, s.title].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <Toggle value={st} mob={mob} onPick={(v) => setStatus("med", course.code, s, v)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const MedAttendanceView = ({ medSessions = [], records = {}, setStatus, mob }) => {
  const medRecords = records.med || {};
  const courses = useMemo(() => getMedSessionsByCourse(medSessions), [medSessions]);

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: mob ? 12 : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {!mob && <h2 style={{ color: T.txH, margin: 0, fontSize: 20, fontWeight: 800 }}>出欠管理</h2>}
        <span style={{ fontSize: 11, background: `${MED_COL}18`, color: MED_COL, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>医歯学系</span>
      </div>
      {courses.length === 0 ? (
        <div style={{ textAlign: "center", color: T.txD, fontSize: 13, marginTop: 40 }}>授業日程が見つかりませんでした</div>
      ) : (
        courses.map((c) => (
          <CourseCard key={c.code} course={c} statuses={medRecords[c.code] || {}} setStatus={setStatus} mob={mob} />
        ))
      )}
    </div>
  );
};
