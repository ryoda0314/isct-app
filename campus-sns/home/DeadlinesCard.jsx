import { useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { examStart } from "./todayPlan.js";
import { fm, dayWord, SectionHead, card, rowStyle } from "./ui.jsx";

// ホームの「締切」。まだ終わっていない課題を締切の近い順に数件と、7 日以内の自分の試験（明日から）を時刻順に並べる。
// 今日の締切もここだけに出す（今日の予定には入れない）。

const dueColor = (at, now) => {
  const ms = at - now;
  if (ms < 24 * 3600e3) return T.red;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - a) / 864e5);
  return days <= 2 ? T.orange : T.txD;
};

export function DeadlinesCard({ asgn, hiddenSet, courses, exams, now, mob, setView }) {
  const list = useMemo(() => {
    const dues = asgn
      .filter((a) => !hiddenSet.has(a.id) && a.st !== "completed" && a.due && a.due >= now)
      .sort((a, b) => a.due - b.due)
      .slice(0, mob ? 4 : 5)
      .map((a) => ({ kind: "due", at: a.due, a, co: courses.find((c) => c.id === a.cid) }));
    const xs = exams.map((ex) => ({ kind: "exam", at: examStart(ex), ex, co: courses.find((c) => c.codeRaw === ex.code_raw || (c.code && c.code === ex.code)) }));
    return [...dues, ...xs].sort((p, q) => p.at - q.at);
  }, [asgn, hiddenSet, courses, exams, now, mob]);
  if (!list.length) return null;

  return (
    <section>
      <SectionHead title={exams.length ? t("home.dueExamTitle") : t("home.dueTitle")} action={t("home.viewAll")} onAction={() => setView("tasks")} />
      <div style={card()}>
        {list.map((x, i) => {
          if (x.kind === "exam") {
            return (
              <button key={`x${x.ex.code}-${x.ex.date}-${x.ex.period}`} type="button" onClick={() => setView("exams")} style={rowStyle(i === 0)}>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#d97706", background: "#d9770617", padding: "3px 6px", borderRadius: 5 }}>{t("home.itemExam")}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 650, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.ex.name}</span>
                  {x.ex.room && <span style={{ display: "block", marginTop: 2, fontSize: 12, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.ex.room}</span>}
                </span>
                <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: T.txH, whiteSpace: "nowrap" }}>{dayWord(x.at, now)} {t("home.periodLabel", { p: x.ex.period })}</span>
              </button>
            );
          }
          return (
            <button key={x.a.id} type="button" onClick={() => setView("tasks")} style={rowStyle(i === 0)}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: x.co?.col || T.txD }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {x.co && <span style={{ display: "block", fontSize: 11.5, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.co.name || x.co.code}</span>}
                <span style={{ display: "block", fontSize: 14, fontWeight: 650, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.a.title}</span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: dueColor(x.at, now), whiteSpace: "nowrap" }}>{dayWord(x.at, now)} {fm(x.at.getHours() * 60 + x.at.getMinutes())}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
