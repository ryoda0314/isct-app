import React from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { useCareerVisible } from "../careerAccess.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

// 「しらべる」: 授業・キャンパスについて調べられる機能の入口（ゲストの下部メニュー・ホームの「はじめに」から）。
// どれもログインなしで使える。機能が多すぎて何ができるか分からない、への対策として 1 か所にまとめる。
const ITEMS = [
  { id: "grading", i: I.bar, tk: "lookup.gradingT", dk: "lookup.gradingD" },
  { id: "textbooks", i: I.book, tk: "lookup.textbooksT", dk: "lookup.textbooksD" },
  { id: "exams", i: I.clip, tk: "lookup.examsT", dk: "lookup.examsD" },
  { id: "freeroom", i: I.pin, tk: "lookup.freeroomT", dk: "lookup.freeroomD" },
  { id: "library", i: I.tgt, tk: "lookup.libraryT", dk: "lookup.libraryD" },
  { id: "reg", i: I.chk, tk: "lookup.regT", dk: "lookup.regD" },
  { id: "acadCal", i: I.flag, tk: "lookup.acadCalT", dk: "lookup.acadCalD" },
];
// インターン・就職・イベント（一般公開するまでは管理者だけ。campus-sns/careerAccess.js）
const CAREER_ITEM = { id: "career", i: I.briefcase, tk: "lookup.careerT", dk: "lookup.careerD" };

export function LookupHub({ setView, mob }) {
  const user = useCurrentUser();
  const careerOn = useCareerVisible(user?.isAdmin);
  const items = careerOn ? [...ITEMS.slice(0, 5), CAREER_ITEM, ...ITEMS.slice(5)] : ITEMS;
  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: mob ? 12 : 20 }}>
        <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.6, margin: "2px 4px 12px" }}>{t("lookup.intro")}</div>
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 10 }}>
          {items.map((it) => (
            <button key={it.id} onClick={() => setView(it.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, cursor: "pointer", textAlign: "left", font: "inherit" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, background: `${T.accent}14` }}>{it.i}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.txH }}>{t(it.tk)}</span>
                <span style={{ display: "block", fontSize: 12, color: T.txD, marginTop: 2, lineHeight: 1.5 }}>{t(it.dk)}</span>
              </span>
              <span style={{ color: T.txD, display: "flex" }}>{I.arr}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
