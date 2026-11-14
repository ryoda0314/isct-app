// ホームの部品が共有する小さな見た目と表記
import { T } from "../theme.js";
import { t } from "../i18n.js";

export const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

/** 分（0 時からの分）→ "8:50" */
export const fm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** 日付の言い方: 今日 / 明日 / 金曜（6 日先まで）/ 11/5 */
export function dayWord(d, now) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((b - a) / 864e5);
  if (days === 0) return t("home.today");
  if (days === 1) return t("home.tomorrow");
  if (days > 1 && days < 7) return t("home.dowWord", { dow: t("dow.s." + DAY_NAMES[d.getDay()]) });
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 欄の見出し（右に「すべて ›」などの移動ボタン） */
export function SectionHead({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 2px 8px" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.txH }}>{title}</h2>
      {action && <button type="button" onClick={onAction} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "4px 2px", whiteSpace: "nowrap" }}>{action} ›</button>}
    </div>
  );
}

/** 欄の入れ物 */
export const card = () => ({ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, overflow: "hidden" });

/** カードの中の行（押せる）。最初の行以外は上に区切り線 */
export const rowStyle = (first) => ({
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", border: "none",
  borderTop: first ? "none" : `1px solid ${T.bd}`, background: "none", cursor: "pointer", font: "inherit", textAlign: "left", color: "inherit",
});
