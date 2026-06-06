import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { getSciSessions, defaultAbsenceLimit } from "../attendanceUtils.js";

const STATUS = [
  { k: "present", l: "出席", c: T.green },
  { k: "absent", l: "欠席", c: T.red },
  { k: "late", l: "遅刻", c: T.orange },
];

// 出席/欠席/遅刻 の3トグル（アクティブを再タップで未記録に戻す）
const Toggle = ({ value, onPick, mob }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {STATUS.map((s) => {
      const on = value === s.k;
      return (
        <button
          key={s.k}
          onClick={() => onPick(on ? null : s.k)}
          style={{
            border: `1px solid ${on ? s.c : T.bd}`,
            background: on ? s.c : "transparent",
            color: on ? "#fff" : T.txD,
            borderRadius: 6,
            padding: mob ? "3px 8px" : "4px 10px",
            fontSize: mob ? 11 : 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all .12s",
          }}
        >
          {s.l}
        </button>
      );
    })}
  </div>
);

const limitKey = (courseKey) => `attLimit:sci:${courseKey}`;
const loadLimit = (courseKey, fallback) => {
  try {
    const v = localStorage.getItem(limitKey(courseKey));
    return v != null ? parseInt(v, 10) : fallback;
  } catch {
    return fallback;
  }
};

const CourseCard = ({ co, statuses, setStatus, mob }) => {
  const [open, setOpen] = useState(false);
  const sessions = useMemo(() => getSciSessions(co), [co]);
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
  const [limit, setLimit] = useState(() => loadLimit(co.id, defLimit));
  const remaining = limit - absent;
  const danger = total > 0 && remaining <= 0;
  const warn = total > 0 && !danger && remaining <= 1;

  const changeLimit = (delta) => {
    setLimit((p) => {
      const nv = Math.max(0, p + delta);
      try { localStorage.setItem(limitKey(co.id), String(nv)); } catch {}
      return nv;
    });
  };

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 12, marginBottom: 10, overflow: "hidden", borderLeft: `3px solid ${co.col}` }}>
      <div onClick={() => setOpen((p) => !p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: mob ? "10px 12px" : "12px 14px", cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: T.txH, fontSize: mob ? 13 : 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{co.name}</div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: T.bg3, padding: "1px 6px", borderRadius: 4 }}>{co.code}</span>
            <span>全{total}回</span>
            {recorded > 0 && <span style={{ color: T.green }}>出{present}</span>}
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
          <span style={{ color: T.txD, fontSize: 11 }}>{open ? "閉じる ▲" : "授業回 ▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${T.bd}`, padding: mob ? "8px 12px 12px" : "10px 14px 14px" }}>
          {/* 欠席上限の調整 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: T.txD }}>
            <span>欠席可能上限</span>
            <button onClick={() => changeLimit(-1)} style={stepBtn}>−</button>
            <span style={{ fontWeight: 700, color: T.txH, minWidth: 28, textAlign: "center" }}>{limit}回</span>
            <button onClick={() => changeLimit(1)} style={stepBtn}>＋</button>
            <span style={{ fontSize: 11 }}>（初期値: 全{total}回の1/3＝{defLimit}回）</span>
          </div>
          {total === 0 ? (
            <div style={{ fontSize: 12, color: T.txD, padding: "8px 0" }}>この年度・クォーターの授業日が学年暦に見つかりませんでした。</div>
          ) : (
            sessions.map((s) => {
              const st = statuses[s.sessionKey] || null;
              return (
                <div key={s.sessionKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.bd}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: mob ? 12 : 13, color: T.txH, fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: T.txD }}>{s.dateStr}</div>
                  </div>
                  <Toggle value={st} mob={mob} onPick={(v) => setStatus("sci", co.id, s, v)} />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const stepBtn = {
  width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg3,
  color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

export const SciAttendanceView = ({ courses = [], records = {}, setStatus, quarter, setQuarter, mob }) => {
  const [qOpen, setQOpen] = useState(false);
  const sciRecords = records.sci || {};
  const list = useMemo(() => courses.filter((c) => c.quarter === quarter), [courses, quarter]);

  const QDrop = () => (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setQOpen((p) => !p)} style={{ background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: mob ? 12 : 13, fontWeight: 700, color: T.accent }}>
        {quarter}Q
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {qOpen && <><div onClick={() => setQOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.4)", overflow: "hidden", zIndex: 50, minWidth: 80 }}>
          {[1, 2, 3, 4].map((q) => (
            <div key={q} onClick={() => { setQuarter(q); setQOpen(false); }} style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: q === quarter ? 700 : 400, color: q === quarter ? T.accent : T.txH, background: q === quarter ? `${T.accent}10` : "transparent" }}>{q}Q</div>
          ))}
        </div></>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: mob ? 12 : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {!mob && <h2 style={{ color: T.txH, margin: 0, fontSize: 20, fontWeight: 800 }}>出欠管理</h2>}
        <QDrop />
        {mob && <span style={{ fontSize: 12, color: T.txD }}>{quarter}Qの履修科目</span>}
      </div>
      {list.length === 0 ? (
        <div style={{ textAlign: "center", color: T.txD, fontSize: 13, marginTop: 40 }}>{quarter}Qの履修科目がありません</div>
      ) : (
        list.map((co) => (
          <CourseCard key={co.id} co={co} statuses={sciRecords[String(co.id)] || {}} setStatus={setStatus} mob={mob} />
        ))
      )}
    </div>
  );
};
