import React from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";

// 「時間割をつくる」で追加した授業のページ（ログイン任意化 Phase 6）。
// LMS の授業ページ（教材・課題・タイムライン）は無いので、授業の基本情報と、使える画面への入口だけを出す。
export function LocalCourseCard({ course, mob, acct, onLogin, setView, goToBuilding }) {
  if (!course) return null;
  const c = course;
  const slots = [c.per, ...(c.extraSlots || []).map((s) => s.per)].filter((x) => x && x !== "未設定");
  const rooms = [c.room, ...(c.extraSlots || []).map((s) => s.room)].filter((x) => x && x !== "未設定");
  const btn = { flex: 1, minWidth: 120, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: mob ? 14 : 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 14, background: `linear-gradient(135deg, ${c.col}20, ${c.col}08)`, border: `1px solid ${c.col}30` }}>
          <div style={{ fontSize: 12, color: T.txD }}>{[c.code, c.section].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.txH, marginTop: 2 }}>{c.name}</div>
          <div style={{ fontSize: 13, color: T.tx, marginTop: 8 }}>{slots.join(" / ")}{rooms.length ? ` · ${rooms.join(" / ")}` : ""}{c.credits != null ? ` · ${t("ttb.creditsN", { n: c.credits })}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {c.building && goToBuilding && <button onClick={() => goToBuilding(c.building)} style={btn}>{I.map}{t("ttb.map")}</button>}
          {c.code && <button onClick={() => setView("grading")} style={btn}>{I.bar}{t("lcourse.grading")}</button>}
          {c.code && <button onClick={() => setView("textbooks")} style={btn}>{I.book}{t("lcourse.textbooks")}</button>}
          <button onClick={() => setView("ttbuild")} style={btn}>{I.pen}{t("lcourse.edit")}</button>
        </div>
        <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.7, padding: "10px 12px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}` }}>
          {t("lcourse.note")} {t("lcourse.lmsNote")}
          {!acct && onLogin && <button onClick={onLogin} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>{t("setup.login")}</button>}
        </div>
      </div>
    </div>
  );
}
