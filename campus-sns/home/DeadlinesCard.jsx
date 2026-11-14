import { useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { examStart, ymd } from "./todayPlan.js";
import { DAY_NAMES, fm, dayWord, SectionHead, card } from "./ui.jsx";

// ホームの「締切」。まだ終わっていない課題を締切の近い順に数件と、7 日以内の自分の試験（明日から）を、
// 日付ごと（今日・明日・金曜 …）にまとめて時刻順に並べる。今日の締切もここだけに出す（今日の予定には入れない）。
// 締切まで 24 時間を切った課題は、時刻より残り時間（あと○時間）を目立たせる。

const EXAM = "#d97706";
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const daysBetween = (at, now) => Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
const clock = (at) => fm(at.getHours() * 60 + at.getMinutes());
const titleOf = (x) => (x.kind === "exam" ? x.ex.name : x.a.title);
const colOf = (x) => (x.kind === "exam" ? EXAM : x.co?.col || T.txD);
const courseOf = (x) => (x.kind === "exam" ? [t("home.itemExam"), x.ex.room].filter(Boolean).join(" · ") : x.co?.name || x.co?.code || "");
const keyOf = (x) => (x.kind === "exam" ? `x${x.ex.code}-${x.ex.date}-${x.ex.period}` : `a${x.a.id}`);

/** 締切まで 24 時間を切ったときの残り時間（あと38分 / あと2時間29分 / あと13時間）。それより先なら null */
function leftText(at, now) {
  const mins = Math.floor((at - now) / 60000);
  if (mins < 0 || mins >= 24 * 60) return null;
  if (mins < 60) return t("home.inMin", { n: mins });
  const h = Math.floor(mins / 60), m = mins % 60;
  return h < 3 ? t("home.inHM", { h, m }) : t("home.inH", { h });
}

export function DeadlinesCard({ asgn, hiddenSet, courses, exams, now, mob, setView }) {
  // 課題と近い試験を時刻順に、日付ごとにまとめる
  const groups = useMemo(() => {
    const dues = asgn
      .filter((a) => !hiddenSet.has(a.id) && a.st !== "completed" && a.due && a.due >= now)
      .sort((a, b) => a.due - b.due)
      .slice(0, mob ? 4 : 5)
      .map((a) => ({ kind: "due", at: a.due, a, co: courses.find((c) => c.id === a.cid) }));
    const xs = exams.map((ex) => ({ kind: "exam", at: examStart(ex), ex, co: courses.find((c) => c.codeRaw === ex.code_raw || (c.code && c.code === ex.code)) }));
    const out = [];
    for (const x of [...dues, ...xs].sort((p, q) => p.at - q.at)) {
      const k = ymd(x.at);
      let g = out.find((y) => y.k === k);
      if (!g) out.push((g = { k, at: x.at, items: [] }));
      g.items.push(x);
    }
    return out;
  }, [asgn, hiddenSet, courses, exams, now, mob]);
  if (!groups.length) return null;
  const open = (x) => setView(x.kind === "exam" ? "exams" : "tasks");

  return (
    <section>
      <SectionHead icon={I.tasks} title={exams.length ? t("home.dueExamTitle") : t("home.dueTitle")} action={t("home.viewAll")} onAction={() => setView("tasks")} />
      <div style={card()}>
        {groups.map((g, gi) => {
          const d = daysBetween(g.at, now);
          const w = dayWord(g.at, now), md = `${g.at.getMonth() + 1}/${g.at.getDate()}`;
          return (
            <div key={g.k} style={{ borderTop: gi ? `1px solid ${T.bd}` : "none", padding: "8px 0 4px" }}>
              {/* 日付の見出し: 今日は赤、2 日以内は橙。曜日より先は日付と曜日 */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 14px 2px" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: d === 0 ? T.red : d <= 2 ? T.orange : T.txH }}>{w === md ? `${md}（${t("dow.s." + DAY_NAMES[g.at.getDay()])}）` : w}</span>
                {w !== md && <span style={{ fontSize: 11.5, color: T.txD }}>{md}</span>}
              </div>
              {g.items.map((x) => {
                // 締切まで 24 時間を切った課題は、時刻を灰色にして右に「あと○時間」
                const left = x.kind === "exam" ? null : leftText(x.at, now);
                return (
                  <button key={keyOf(x)} type="button" onClick={() => open(x)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "6px 14px", border: "none", background: "none", cursor: "pointer", font: "inherit", textAlign: "left", color: "inherit" }}>
                    <span style={{ width: 38, flexShrink: 0, fontSize: 12, fontWeight: 700, color: x.kind === "exam" ? EXAM : left ? T.txD : T.txH }}>{x.kind === "exam" ? t("home.periodLabel", { p: x.ex.period }) : clock(x.at)}</span>
                    <span style={{ alignSelf: "stretch", width: 3, borderRadius: 2, background: colOf(x), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: T.txH, ...ell }}>{titleOf(x)}</span>
                      <span style={{ display: "block", marginTop: 1, fontSize: 11, fontWeight: 600, color: colOf(x), ...ell }}>{courseOf(x)}</span>
                    </span>
                    {left && <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: T.red, whiteSpace: "nowrap" }}>{left}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
