import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { SCHOOLS, DEPTS } from "../data.js";

// 時間割例（lib/timetable-examples.js の1行）を小さな時間割表で見せる。履修登録補助と管理画面で共通。
// ex = { year, quarter, degree, grade, school, dept, courses:[{ code, name, slots, credits, requirement }] }

const DAYS = ["月", "火", "水", "木", "金"];
const DAY_IDX = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4 };
const REQ_LABEL = { 必修: "reg.reqRequired", 選択必修: "reg.reqElectiveReq", 選択: "reg.reqElective" };
// テーマのアクセント色に左右されない固定色（アクセントが緑だと「必修」と「選択」が同じ色になるため）
const REQ_COLOR = { 必修: "#6375f0", 選択必修: "#d4843e", 選択: "#3dae72" };
const reqColor = (r) => REQ_COLOR[r] || T.txD;

export const exampleGradeLabel = (degree, grade) =>
  degree && grade ? t("tte.gradeN", { deg: t(`tte.deg.${degree}`), n: grade }) : t("tte.unknown");

/** "月3-4" → 時間割の行（2時限で1行）。5-8 なら2行にまたがる */
function placeSlots(courses) {
  const taken = new Set();
  const cells = [];
  for (const c of courses) {
    for (const s of c.slots || []) {
      const m = s.match(/([月火水木金])(\d+)[-–ー](\d+)/);
      if (!m) continue;
      const di = DAY_IDX[m[1]];
      const r0 = Math.max(0, Math.floor((m[2] - 1) / 2)), r1 = Math.min(4, Math.floor((m[3] - 1) / 2));
      let free = true;
      for (let r = r0; r <= r1; r++) if (taken.has(`${r}-${di}`)) free = false;
      if (!free || r1 < r0) continue;
      for (let r = r0; r <= r1; r++) taken.add(`${r}-${di}`);
      cells.push({ di, r0, span: r1 - r0 + 1, c });
    }
  }
  return cells;
}

export const TimetableExampleCard = ({ ex, mob, extra }) => {
  const [open, setOpen] = useState(false);
  const courses = Array.isArray(ex.courses) ? ex.courses : [];
  const known = courses.filter((c) => c.credits != null);
  const credits = known.length ? Math.round(known.reduce((s, c) => s + Number(c.credits), 0) * 10) / 10 : null;
  const cells = placeSlots(courses);
  const unplaced = courses.filter((c) => !(c.slots || []).length);
  const school = ex.school ? SCHOOLS[ex.school]?.name || ex.school : null;
  const dept = ex.dept ? DEPTS[ex.dept]?.name || ex.dept : null;
  const cellH = mob ? 34 : 40;

  return (
    <div style={{ background: T.bg2, borderRadius: 12, border: `1px solid ${T.bd}`, padding: mob ? 10 : 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.txH }}>{t("tte.yearN", { y: ex.year })} {ex.quarter}Q</span>
        <span style={{ fontSize: 11, color: T.txD }}>· {exampleGradeLabel(ex.degree, ex.grade)}</span>
        {(school || dept) && <span style={{ fontSize: 11, color: T.txD }}>· {[school, dept].filter(Boolean).join(" ")}</span>}
        {extra}
        <span style={{ flex: 1 }} />
        {credits != null && <span style={{ fontSize: 11, fontWeight: 700, color: T.green }}>{t("tte.totalCredits", { n: credits })}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `${mob ? 18 : 22}px repeat(5, minmax(0, 1fr))`, gridTemplateRows: `16px repeat(5, ${cellH}px)`, gap: 2 }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ gridColumn: i + 2, gridRow: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: T.txD }}>{t("dow.s." + d)}</div>
        ))}
        {[0, 1, 2, 3, 4].map((r) => (
          <div key={r} style={{ gridColumn: 1, gridRow: r + 2, fontSize: 9, color: T.txD, display: "flex", alignItems: "center", justifyContent: "center" }}>{r + 1}</div>
        ))}
        {[0, 1, 2, 3, 4].flatMap((r) => DAYS.map((_, di) => (
          <div key={`bg${r}-${di}`} style={{ gridColumn: di + 2, gridRow: r + 2, borderRadius: 6, background: T.bg3 }} />
        )))}
        {cells.map(({ di, r0, span, c }) => {
          const col = reqColor(c.requirement);
          return (
            <div key={`${c.code}-${di}-${r0}`} title={`${c.code} ${c.name}`} style={{
              gridColumn: di + 2, gridRow: `${r0 + 2} / span ${span}`, borderRadius: 6, overflow: "hidden",
              background: `${col}1f`, borderLeft: `3px solid ${col}`, padding: "2px 4px",
              fontSize: mob ? 8 : 9, lineHeight: 1.25, color: T.txH, fontWeight: 600,
              display: "-webkit-box", WebkitLineClamp: span * 2, WebkitBoxOrient: "vertical",
            }}>{c.name}</div>
          );
        })}
      </div>

      {unplaced.length > 0 && (
        <div style={{ fontSize: 10, color: T.txD, marginTop: 6 }}>{t("tte.noSlot")}: {unplaced.map((c) => c.name).join("、")}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={() => setOpen((p) => !p)} style={{ padding: 0, border: "none", background: "none", color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          {open ? t("tte.hideCourses") : t("tte.showCourses", { n: courses.length })}
        </button>
        <span style={{ flex: 1 }} />
        {Object.keys(REQ_COLOR).filter((r) => courses.some((c) => c.requirement === r)).map((r) => (
          <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: T.txD }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: REQ_COLOR[r] }} />{t(REQ_LABEL[r])}
          </span>
        ))}
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {courses.map((c) => (
            <div key={`${c.code}-${c.section || ""}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderTop: `1px solid ${T.bd}` }}>
              {c.requirement && REQ_LABEL[c.requirement] && (
                <span style={{ fontSize: 9, fontWeight: 700, color: reqColor(c.requirement), background: `${reqColor(c.requirement)}18`, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{t(REQ_LABEL[c.requirement])}</span>
              )}
              <span style={{ fontSize: 10, color: T.txD, fontFamily: "monospace", flexShrink: 0 }}>{c.code}</span>
              <span style={{ fontSize: 12, color: T.txH, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 10, color: T.txD, flexShrink: 0 }}>{(c.slots || []).join(" ")}</span>
              {c.credits != null && <span style={{ fontSize: 10, color: T.txD, flexShrink: 0 }}>{t("tte.creditsN", { n: c.credits })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
