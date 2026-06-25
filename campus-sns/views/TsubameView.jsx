import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Av } from "../shared.jsx";
import { useTsubamePoints } from "../hooks/useTsubamePoints.js";
import { levelInfo, nextMilestone, REASON_KEY } from "../tsubamePoints.js";

// ── ラインアイコン（GymView と同じ stroke=currentColor 方式）──
const svg = (children, sz = 18) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const G = {
  flame: (s) => svg(<path d="M12 2s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s0 2 2 2c0-3 2-5 2-8z" />, s),
  history: (s) => svg(<><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 106 5.3L3 8" /><path d="M12 7v5l4 2" /></>, s),
  info: (s) => svg(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>, s),
  login: (s) => svg(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>, s),
  pin: (s) => svg(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></>, s),
  friend: (s) => svg(<><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>, s),
};

const Card = ({ children, style }) => (
  <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, padding: 16, ...style }}>{children}</div>
);

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 順位メダル色（1〜3位）
const medalColor = (rank) => (rank === 1 ? "#d4af37" : rank === 2 ? "#9fb0bd" : rank === 3 ? "#b87333" : null);

export function TsubameView({ mob = false }) {
  const { state, ranking, loading, claim } = useTsubamePoints();
  const [tab, setTab] = useState("rank"); // rank | history
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const lv = levelInfo(state.totalEarned);
  const nextMs = nextMilestone(state.currentStreak);

  const onClaim = async () => {
    if (busy || state.claimedToday) return;
    setBusy(true);
    try {
      const res = await claim();
      if (res.claimed) setFlash(`+${res.awarded}`);
      setTimeout(() => setFlash(null), 2200);
    } catch {}
    finally { setBusy(false); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: T.txD }}>…</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
    <div style={{ maxWidth: 640, margin: "0 auto", padding: mob ? "8px 12px 80px" : "8px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── ヒーロー: レベル + 保有ポイント + 次レベルまで ── */}
      <Card style={{ background: `linear-gradient(135deg, ${T.accent}14, ${T.bg2})`, borderColor: `${T.accent}40` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `${T.accent}1c`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {I.swallow}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: T.txD, fontWeight: 600 }}>{t("tsubame.balance")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{state.balance.toLocaleString()}</span>
              <span style={{ fontSize: 13, color: T.txD, fontWeight: 600 }}>pt</span>
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T.txD, fontWeight: 600, letterSpacing: 1 }}>{t("tsubame.level").toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.accent, lineHeight: 1.1 }}>{lv.level}</div>
          </div>
        </div>

        {/* 次レベルまでのプログレスバー */}
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 8, background: T.bg3, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(lv.progress * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${T.accentSoft}, ${T.accent})`, borderRadius: 99, transition: "width .4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.txD }}>
            <span>{t("tsubame.totalEarned")}: {state.totalEarned.toLocaleString()}pt</span>
            <span>{t("tsubame.toNext", { n: lv.toNext.toLocaleString() })}</span>
          </div>
        </div>
      </Card>

      {/* ── ストリーク + デイリー受け取り ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: state.currentStreak > 0 ? T.orange : T.txD, display: "flex" }}>{G.flame(26)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: T.txD, fontWeight: 600 }}>{t("tsubame.streak")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{state.currentStreak}</span>
              <span style={{ fontSize: 13, color: T.txD }}>{t("tsubame.days")}</span>
              {state.longestStreak > 0 && (
                <span style={{ fontSize: 11, color: T.txD, marginLeft: 4 }}>· {t("tsubame.longest", { n: state.longestStreak })}</span>
              )}
            </div>
          </div>
        </div>

        {nextMs && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: T.txD }}>
            {t("tsubame.nextMilestone", { n: nextMs - state.currentStreak })}
          </div>
        )}

        <button
          onClick={onClaim}
          disabled={state.claimedToday || busy}
          style={{
            marginTop: 12, width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
            fontSize: 14, fontWeight: 700, cursor: state.claimedToday || busy ? "default" : "pointer",
            background: state.claimedToday ? T.bg3 : T.accent,
            color: state.claimedToday ? T.txD : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background .2s",
          }}
        >
          {state.claimedToday ? <>{I.chk} {t("tsubame.claimed")}</> : (busy ? "…" : t("tsubame.claimToday"))}
        </button>

        {flash && (
          <div style={{ marginTop: 8, textAlign: "center", color: T.green, fontWeight: 800, fontSize: 16, animation: "toastIn .2s ease-out" }}>
            {flash} pt
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: T.txD, lineHeight: 1.5 }}>{t("tsubame.about")}</div>
      </Card>

      {/* ── タブ: ランキング / 履歴 ── */}
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { id: "rank", label: t("tsubame.ranking"), icon: I.trophy },
          { id: "history", label: t("tsubame.history"), icon: G.history(16) },
          { id: "earn", label: t("tsubame.tabEarn"), icon: G.info(16) },
        ].map((s) => (
          <button key={s.id} onClick={() => setTab(s.id)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${tab === s.id ? T.accent : T.bd}`,
              background: tab === s.id ? `${T.accent}12` : T.bg2,
              color: tab === s.id ? T.accent : T.txD, fontWeight: 700, fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {tab === "rank" && (
        <Card style={{ padding: 8 }}>
          {ranking.myRank && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: `${T.accent}10` }}>
              <span style={{ fontSize: 12, color: T.txD, fontWeight: 600 }}>{t("tsubame.myRank")}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{ranking.myRank}<span style={{ fontSize: 12, fontWeight: 600 }}>{t("tsubame.rankSuffix")}</span></span>
            </div>
          )}
          {ranking.ranking.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.txD, fontSize: 13 }}>{t("tsubame.noRank")}</div>
          ) : (
            ranking.ranking.map((r) => {
              const medal = medalColor(r.rank);
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
                  background: r.me ? `${T.accent}10` : "transparent",
                }}>
                  <span style={{ width: 26, textAlign: "center", fontWeight: 800, fontSize: 14, color: medal || T.txD, flexShrink: 0 }}>{r.rank}</span>
                  <Av u={{ av: r.avatar, col: r.color }} sz={30} uid={r.id} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: r.me ? 700 : 500, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{r.totalEarned.toLocaleString()}<span style={{ fontSize: 10, color: T.txD, fontWeight: 600 }}> pt</span></span>
                </div>
              );
            })
          )}
        </Card>
      )}

      {tab === "history" && (
        <Card style={{ padding: 8 }}>
          {state.ledger.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.txD, fontSize: 13 }}>{t("tsubame.empty")}</div>
          ) : (
            state.ledger.map((e) => {
              const labelKey = REASON_KEY[e.reason];
              const label = labelKey ? t(labelKey) : e.reason;
              const streak = e.meta?.streak;
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: `1px solid ${T.bd}55` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{label}{streak ? ` · ${streak}${t("tsubame.days")}` : ""}</div>
                    <div style={{ fontSize: 11, color: T.txD }}>{fmtDate(e.created_at)}</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: e.amount >= 0 ? T.green : T.red, flexShrink: 0 }}>
                    {e.amount >= 0 ? "+" : ""}{e.amount}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      )}

      {tab === "earn" && (
        <Card style={{ padding: 8 }}>
          {[
            { key: "daily", icon: G.login(18), title: t("tsubame.earnDailyTitle"), desc: t("tsubame.earnDailyDesc"), pts: t("tsubame.earnDailyPts") },
            { key: "attend", icon: G.pin(18), title: t("tsubame.earnAttendTitle"), desc: t("tsubame.earnAttendDesc"), pts: t("tsubame.earnAttendPts") },
            { key: "friend", icon: G.friend(18), title: t("tsubame.earnFriendTitle"), desc: t("tsubame.earnFriendDesc"), pts: t("tsubame.earnFriendPts") },
          ].map((m, i, arr) => (
            <div key={m.key} style={{ display: "flex", gap: 12, padding: "12px 10px", borderBottom: i < arr.length - 1 ? `1px solid ${T.bd}55` : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${T.accent}14`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{m.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.accent, flexShrink: 0 }}>{m.pts}</span>
                </div>
                <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.55, marginTop: 2 }}>{m.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: "10px 10px 4px", fontSize: 11, color: T.txD, lineHeight: 1.5 }}>{t("tsubame.earnSoon")}</div>
        </Card>
      )}
    </div>
    </div>
  );
}
