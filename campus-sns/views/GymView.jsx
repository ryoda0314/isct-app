import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { QRScanner } from "../components/QRScanner.jsx";
import { useGym } from "../hooks/useGym.js";
import {
  GYM_QR, todayHours, isOpenNow, lastEntry, monthSchedule,
  congestionKey, STATUS_META, CONGESTION, toISO,
} from "../gymSchedule.js";

// ── ラインアイコン（24 viewBox / stroke=currentColor）────────
const svg = (children, sz = 18) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const G = {
  cal: (s) => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>, s),
  announce: (s) => svg(<><path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z" /><path d="M16 8a5 5 0 010 8" /></>, s),
  chart: (s) => svg(<><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 5-7" /></>, s),
  dumbbell: (s) => svg(<><path d="M2 9v6M5 7v10M19 7v10M22 9v6M7 12h10" /></>, s),
  flame: (s) => svg(<><path d="M12 2s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s0 2 2 2c0-3 2-5 2-8z" /></>, s),
  timer: (s) => svg(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>, s),
  note: (s) => svg(<><path d="M4 4h11l5 5v11a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" /><path d="M8 12h8M8 16h6" /></>, s),
  check: (s) => svg(<><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></>, s),
  pin: (s) => svg(<><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>, s),
  bell: (s) => svg(<><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>, s),
  star: (s) => svg(<polygon points="12 2 15 9 22 9.3 16.5 14 18.3 21 12 17 5.7 21 7.5 14 2 9.3 9 9" />, s),
  qr: (s) => svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>, s),
  inbox: (s) => svg(<><path d="M3 12l3-8h12l3 8M3 12v6a1 1 0 001 1h16a1 1 0 001-1v-6M3 12h5l1 2h6l1-2h5" /></>, s),
  shoe: (s) => svg(<><path d="M2 16h20v3H2zM2 16l1-6 4 2 3-4 4 5 8 1v2" /></>, s),
  chevron: (s) => svg(<polyline points="9 6 15 12 9 18" />, s),
  arrowLeft: (s) => svg(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>, s),
};

const annStyles = () => ({
  info:        { color: T.accent, icon: G.bell,     labelKey: "announce.typeInfo" },
  maintenance: { color: T.orange, icon: G.pin,      labelKey: "announce.typeMaintenance" },
  update:      { color: T.green,  icon: G.announce, labelKey: "announce.typeUpdate" },
  urgent:      { color: T.red,    icon: () => I.alert, labelKey: "announce.typeUrgent" },
});

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const fmtTime = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]})`; };
const fmtDur = (min) => (min == null ? "" : min >= 60 ? `${Math.floor(min / 60)}${t("gym.hour")}${min % 60}${t("gym.min")}` : `${min}${t("gym.min")}`);
const congColor = (lvl) => [T.green, T.yellow, T.orange, T.red][lvl] || T.green;
const congLevel = (count) => Math.max(0, CONGESTION.findIndex((c) => count <= c.max));

const Card = ({ children, style }) => (
  <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, padding: 16, ...style }}>{children}</div>
);

export function GymView({ mob = false }) {
  const { state, announcements, history, workouts, loading, checkin, addWorkout, removeWorkout } = useGym();
  const [mode, setMode] = useState("facility");   // facility | workout
  const [section, setSection] = useState(null);   // null | schedule | announce | history
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const now = new Date();
  const today = todayHours(now);
  const open = isOpenNow(now);
  const lastIn = lastEntry(today);

  const onQr = (raw) => {
    if (raw !== GYM_QR) return false;
    setBusy(true);
    checkin(raw)
      .then((res) => {
        const time = fmtTime(res.at);
        setFlash({ ok: true, text: res.state === "in" ? t("gym.checkedIn", { time }) : t("gym.checkedOut", { time, dur: fmtDur(res.durationMin) }) });
      })
      .catch(() => setFlash({ ok: false, text: t("gym.checkinFailed") }))
      .finally(() => { setBusy(false); setScanning(false); });
    return true;
  };

  const switchMode = (m) => { setMode(m); setSection(null); setFlash(null); };

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: T.bg }}>
      <style>{`
        @keyframes gymPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
        @keyframes gymGlow{0%,100%{box-shadow:0 6px 20px ${T.accent}40}50%{box-shadow:0 8px 30px ${T.accent}80}}
        @keyframes gymRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .gymRise{animation:gymRise .26s ease both}
      `}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: mob ? "12px 14px 48px" : "20px 24px 56px" }}>
        {!mob && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})` }}>{G.dumbbell(22)}</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txH, margin: 0, letterSpacing: -0.3 }}>{t("tool.gym")}</h1>
              <div style={{ fontSize: 12, color: T.txD }}>{open ? t("gym.greeting") : t("gym.greetingClosed")}</div>
            </div>
          </div>
        )}

        {/* 最上位：施設 / 筋トレ の2モード */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: T.bg3, borderRadius: 14, marginBottom: 16 }}>
          {[{ id: "facility", label: t("gym.modeFacility"), icon: G.dumbbell }, { id: "workout", label: t("gym.modeWorkout"), icon: G.flame }].map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                flex: 1, padding: "10px 0", borderRadius: 11, border: "none", cursor: "pointer",
                background: on ? `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})` : "transparent",
                color: on ? "#fff" : T.txD, fontSize: 14, fontWeight: 800,
                boxShadow: on ? `0 4px 12px ${T.accent}40` : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all .15s",
              }}>{m.icon(16)}{m.label}</button>
            );
          })}
        </div>

        {flash && (
          <div className="gymRise" style={{
            margin: "0 0 14px", padding: "13px 16px", borderRadius: 14, fontSize: 14, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 9,
            background: flash.ok ? `linear-gradient(135deg, ${T.green}, ${T.green}cc)` : `${T.red}1a`,
            color: flash.ok ? "#fff" : T.red,
            boxShadow: flash.ok ? `0 6px 18px ${T.green}50` : "none",
            border: flash.ok ? "none" : `1px solid ${T.red}40`,
          }}><span style={{ display: "flex" }}>{flash.ok ? G.check(20) : I.alert}</span>{flash.text}</div>
        )}

        {mode === "workout" ? (
          <div className="gymRise"><WorkoutMode workouts={workouts} addWorkout={addWorkout} removeWorkout={removeWorkout} /></div>
        ) : section ? (
          <div className="gymRise" key={section}>
            <BackHeader title={section === "schedule" ? t("gym.tabSchedule") : section === "announce" ? t("gym.tabAnnounce") : t("gym.tabHistory")} onBack={() => setSection(null)} />
            {section === "schedule" && <ScheduleFull now={now} />}
            {section === "announce" && <AnnounceList announcements={announcements} loading={loading} />}
            {section === "history" && <HistoryFull history={history} loading={loading} />}
          </div>
        ) : (
          <div className="gymRise">
            <FacilityDashboard {...{ today, open, lastIn, state, scanning, setScanning, busy, onQr, announcements, history, loading, goto: setSection }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 施設ダッシュボード（優先順位つき）──────────────────────
function FacilityDashboard({ today, open, lastIn, state, scanning, setScanning, busy, onQr, announcements, history, loading, goto }) {
  const lvl = congLevel(state.count);
  const inMe = state.myState === "in";
  const heroBg = today.closed ? `linear-gradient(135deg, ${T.bg4}, ${T.bg3})` : `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})`;
  const heroTx = today.closed ? T.txH : "#fff";
  const heroSub = today.closed ? T.txD : "rgba(255,255,255,.85)";
  const topAnn = announcements[0];
  const recent = (history.sessions || []).slice(0, 2);

  return (
    <>
      {/* 1) 状況（主役）*/}
      <div style={{ borderRadius: 20, padding: 20, background: heroBg, color: heroTx, boxShadow: today.closed ? "none" : `0 10px 30px ${T.accent}38` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: open ? "#fff" : heroSub, animation: open ? "gymPulse 1.4s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{open ? t("gym.open") : t("gym.closed")}</span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>{today.closed ? t("gym.statusClosed") : `${today.open}–${today.close}`}</div>
        <div style={{ fontSize: 13, color: heroSub, marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {today.label && <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{G.pin(14)} {today.label}</span>}
          {!today.closed && lastIn && <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{G.bell(14)} {t("gym.lastEntry")} {lastIn}</span>}
        </div>
      </div>

      {/* 2) QR（主要アクション）*/}
      <div style={{ marginTop: 12 }}>
        {!scanning ? (
          <button onClick={() => setScanning(true)} disabled={busy} style={{
            width: "100%", padding: "16px 0", borderRadius: 18, cursor: busy ? "default" : "pointer", border: "none",
            background: inMe ? `linear-gradient(135deg, ${T.orange}, ${T.red})` : `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})`,
            color: "#fff", fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            animation: busy ? "none" : "gymGlow 2.6s ease-in-out infinite",
          }}>{G.qr(22)}{inMe ? t("gym.scanCheckout") : t("gym.scanCheckin")}</button>
        ) : (
          <Card><QRScanner onResult={onQr} onClose={() => setScanning(false)} /></Card>
        )}
        {inMe && <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: T.green, fontWeight: 700 }}>{G.check(15)}{t("gym.youAreIn")}</div>}
      </div>

      {/* 3) 混雑（参考値）*/}
      <Card style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: T.txH, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{state.count}</span>
          <span style={{ fontSize: 14, color: T.tx, marginBottom: 5 }}>{t("gym.peopleNow")}</span>
          <span style={{ marginLeft: "auto", marginBottom: 3, fontSize: 14, fontWeight: 800, color: congColor(lvl) }}>{t(congestionKey(state.count))}</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 8, borderRadius: 999, background: i <= lvl ? congColor(lvl) : T.bg4, opacity: i <= lvl ? 1 : 0.6 }} />)}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.txD, lineHeight: 1.5 }}>※ {t("gym.refNote")}</div>
      </Card>

      {/* 4) 開館予定（深掘りへの導線）*/}
      <RowLink icon={G.cal} title={t("gym.tabSchedule")} sub={today.closed ? t("gym.statusClosed") : `${t("gym.todayHours")} ${today.open}–${today.close}`} onClick={() => goto("schedule")} />

      {/* 5) お知らせ（要約 + すべて見る）*/}
      <SectionHead title={t("gym.tabAnnounce")} onAll={announcements.length ? () => goto("announce") : null} />
      {loading ? null : topAnn ? <AnnItem a={topAnn} /> : <MiniEmpty icon={G.inbox} text={t("gym.noAnnounce")} />}

      {/* 6) 最近の利用（要約 + すべて見る）*/}
      <SectionHead title={t("gym.recentUse")} onAll={recent.length ? () => goto("history") : null} />
      {loading ? null : recent.length ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{recent.map((s, i) => <SessionItem key={i} s={s} />)}</div> : <MiniEmpty icon={G.shoe} text={t("gym.noHistory")} />}
    </>
  );
}

// 導線行
const RowLink = ({ icon, title, sub, onClick }) => (
  <button onClick={onClick} style={{ width: "100%", marginTop: 12, padding: "14px 16px", borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
    <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, background: `${T.accent}14` }}>{icon(18)}</span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: T.txH }}>{title}</span>
      <span style={{ display: "block", fontSize: 12, color: T.txD, marginTop: 1 }}>{sub}</span>
    </span>
    <span style={{ color: T.txD, display: "flex" }}>{G.chevron(18)}</span>
  </button>
);

// セクション見出し（タイトル + すべて見る）
const SectionHead = ({ title, onAll }) => (
  <div style={{ display: "flex", alignItems: "center", margin: "22px 2px 10px" }}>
    <span style={{ fontSize: 13, fontWeight: 800, color: T.txH }}>{title}</span>
    {onAll && <button onClick={onAll} style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>{t("gym.viewAll")}{G.chevron(14)}</button>}
  </div>
);

const BackHeader = ({ title, onBack }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
    <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{G.arrowLeft(18)}</button>
    <span style={{ fontSize: 17, fontWeight: 800, color: T.txH }}>{title}</span>
  </div>
);

// ── 共有アイテム ─────────────────────────────────────
const AnnItem = ({ a }) => {
  const s = annStyles()[a.type] || annStyles().info;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, borderLeft: `4px solid ${s.color}`, display: "flex", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, background: `${s.color}18` }}>{s.icon(18)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
          {a.pinned && <span style={{ display: "flex", color: s.color }}>{G.pin(13)}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: `${s.color}18`, padding: "1px 8px", borderRadius: 999 }}>{t(s.labelKey)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{a.title}</span>
        </div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
        <div style={{ fontSize: 10, color: T.txD, marginTop: 6 }}>{fmtDate(a.created_at)}</div>
      </div>
    </div>
  );
};

const SessionItem = ({ s }) => {
  const ref = s.in || s.out;
  const live = !s.out;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}`, borderLeft: `4px solid ${live ? T.green : T.accent}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{fmtDate(ref)}</div>
        <div style={{ fontSize: 13, color: T.tx, marginTop: 2 }}>{s.in ? fmtTime(s.in) : "—"} → {s.out ? fmtTime(s.out) : t("gym.inNow")}</div>
      </div>
      {s.durationMin != null ? (
        <span style={{ fontSize: 13, fontWeight: 800, color: T.accent, background: `${T.accent}14`, padding: "5px 12px", borderRadius: 999 }}>{fmtDur(s.durationMin)}</span>
      ) : live ? (
        <span style={{ fontSize: 12, fontWeight: 800, color: T.green, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, animation: "gymPulse 1.4s ease-in-out infinite" }} />{t("gym.inNow")}</span>
      ) : null}
    </div>
  );
};

// ── サブ画面：開館予定カレンダー ──────────────────────────
function ScheduleFull({ now }) {
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const days = useMemo(() => monthSchedule(ym.y, ym.m), [ym]);
  const lead = days.length ? days[0].dow : 0;
  const todayIso = toISO(now);
  const shift = (d) => setYm(({ y, m }) => { const nm = m + d; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
  const cellColor = (type) => ({ open: T.green, short: T.yellow, closed: T.off, class: T.orange, inspection: T.orange, special: T.red }[type] || T.off);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 14px" }}>
        <button onClick={() => shift(-1)} style={navBtn()}>‹</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.txH }}>{ym.y}<span style={{ color: T.txD, fontWeight: 600 }}> / </span>{ym.m + 1}月</div>
        <button onClick={() => shift(1)} style={navBtn()}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? T.red : i === 6 ? T.accent : T.txD, padding: "2px 0" }}>{d}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((day) => {
          const isToday = day.iso === todayIso;
          const c = cellColor(day.type);
          const mark = STATUS_META[day.type]?.mark || "";
          return (
            <div key={day.iso} style={{ minHeight: 56, borderRadius: 12, padding: "5px 2px", textAlign: "center", background: isToday ? `linear-gradient(160deg, ${T.accent}1f, ${T.bg2})` : T.bg2, border: `1.5px solid ${isToday ? T.accent : T.bd}`, boxShadow: isToday ? `0 4px 12px ${T.accent}28` : "none" }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? T.accent : T.tx }}>{day.date.getDate()}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c, lineHeight: 1.2 }}>{mark}</div>
              {!day.closed && <div style={{ fontSize: 8.5, color: T.txD, lineHeight: 1.1 }}>{day.open}<br />{day.close}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {Object.entries(STATUS_META).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.tx, background: T.bg2, border: `1px solid ${T.bd}`, padding: "4px 10px", borderRadius: 999 }}>
            <span style={{ fontWeight: 800, color: cellColor(k) }}>{v.mark}</span>{t(v.labelKey)}
          </span>
        ))}
      </div>
    </>
  );
}
const navBtn = () => ({ width: 38, height: 38, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 20, cursor: "pointer", fontWeight: 700 });

// ── サブ画面：お知らせ一覧 ───────────────────────────────
function AnnounceList({ announcements, loading }) {
  if (loading) return <Empty icon={G.timer} text={t("common.loading")} />;
  if (!announcements.length) return <Empty icon={G.inbox} text={t("gym.noAnnounce")} />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{announcements.map((a) => <AnnItem key={a.id} a={a} />)}</div>;
}

// ── サブ画面：利用履歴 ───────────────────────────────────
function HistoryFull({ history, loading }) {
  if (loading) return <Empty icon={G.timer} text={t("common.loading")} />;
  const { sessions, monthCount, monthMin } = history;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <StatTile icon={G.flame} value={monthCount} unit={t("gym.repsUnit")} label={t("gym.monthCount")} color={T.orange} />
        <StatTile icon={G.timer} value={fmtDur(monthMin) || `0${t("gym.min")}`} label={t("gym.monthTotal")} color={T.accent} />
      </div>
      {!sessions.length ? <Empty icon={G.shoe} text={t("gym.noHistory")} /> : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{sessions.map((s, i) => <SessionItem key={i} s={s} />)}</div>}
    </>
  );
}

// ── 筋トレモード（Studyplus 風）─────────────────────────────
const fmtVol = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
const volOf = (w) => (w.weight_kg || 0) * (w.reps || 0) * (w.sets || 0);

function WorkoutMode({ workouts, addWorkout, removeWorkout }) {
  const [f, setF] = useState({ exercise_name: "", weight_kg: "", reps: "", sets: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const now = new Date();
  const todayIso = toISO(now);

  // 教材(=種目)ごとの累計
  const exercises = useMemo(() => {
    const m = {};
    for (const w of workouts) {
      const e = m[w.exercise_name] || (m[w.exercise_name] = { name: w.exercise_name, count: 0, vol: 0, pb: null, last: null });
      e.count++; e.vol += volOf(w);
      if (w.weight_kg != null && (e.pb == null || w.weight_kg > e.pb)) e.pb = w.weight_kg;
      if (!e.last || w.logged_at > e.last) e.last = w.logged_at;
    }
    return Object.values(m).sort((a, b) => (b.last > a.last ? 1 : -1));
  }, [workouts]);
  const best = useMemo(() => Object.fromEntries(exercises.map((e) => [e.name, e.pb])), [exercises]);

  // 継続日数（今日 or 昨日から遡って連続記録）
  const streak = useMemo(() => {
    const days = new Set(workouts.map((w) => toISO(new Date(w.logged_at))));
    const c = new Date(now); c.setHours(0, 0, 0, 0);
    if (!days.has(toISO(c))) c.setDate(c.getDate() - 1);
    let s = 0; while (days.has(toISO(c))) { s++; c.setDate(c.getDate() - 1); }
    return s;
  }, [workouts]);

  // 直近7日のボリューム（週間グラフ用）
  const week = useMemo(() => {
    const base = new Date(now); base.setHours(0, 0, 0, 0);
    const arr = []; const idx = {};
    for (let i = 6; i >= 0; i--) { const d = new Date(base); d.setDate(base.getDate() - i); arr.push({ date: d, iso: toISO(d), vol: 0 }); idx[toISO(d)] = arr.length - 1; }
    for (const w of workouts) { const k = toISO(new Date(w.logged_at)); if (k in idx) arr[idx[k]].vol += volOf(w); }
    return arr;
  }, [workouts]);
  const weekVol = week.reduce((a, d) => a + d.vol, 0);

  // 日付ごとのタイムライン（workouts は新しい順）
  const groups = useMemo(() => {
    const g = []; let cur = null;
    for (const w of workouts) { const k = toISO(new Date(w.logged_at)); if (!cur || cur.key !== k) { cur = { key: k, items: [] }; g.push(cur); } cur.items.push(w); }
    return g;
  }, [workouts]);

  // 種目ごとの「前回値」（workouts は新しい順なので最初に見つかったものが直近）
  const lastByName = useMemo(() => {
    const m = {};
    for (const w of workouts) if (!(w.exercise_name in m)) m[w.exercise_name] = { weight_kg: w.weight_kg, reps: w.reps, sets: w.sets };
    return m;
  }, [workouts]);
  const lastOf = lastByName[f.exercise_name.trim()];

  const submit = async () => {
    if (!f.exercise_name.trim() || saving) return;
    setSaving(true);
    try { await addWorkout(f); setF({ exercise_name: "", weight_kg: "", reps: "", sets: "", notes: "" }); setShowForm(false); } catch {} finally { setSaving(false); }
  };
  // 種目を選ぶと前回値を自動入力（そのまま保存 or 微調整できる）
  const applyExercise = (name) => {
    const last = lastByName[name];
    setF((p) => ({ ...p, exercise_name: name, weight_kg: last?.weight_kg ?? "", reps: last?.reps ?? "", sets: last?.sets ?? "" }));
  };
  const pick = (name) => { applyExercise(name); setShowForm(true); };

  const inp = { padding: "11px 13px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg, color: T.txH, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const canSave = f.exercise_name.trim();

  return (
    <>
      {/* 記録する（常設の入口）*/}
      <button onClick={() => setShowForm((v) => !v)} style={{
        width: "100%", padding: "14px 0", borderRadius: 16, border: "none", cursor: "pointer",
        background: showForm ? T.bg3 : `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})`,
        color: showForm ? T.txH : "#fff", fontSize: 15, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: showForm ? "none" : `0 6px 16px ${T.accent}40`,
      }}>{showForm ? t("common.close") : `+ ${t("gym.logIt")}`}</button>

      {showForm && (
        <Card className="gymRise" style={{ marginTop: 10 }}>
          {/* 種目クイック選択（タップで前回値ごと呼び出し）*/}
          {exercises.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {exercises.slice(0, 8).map((e) => (
                <button key={e.name} onClick={() => applyExercise(e.name)} style={{
                  fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${f.exercise_name === e.name ? T.accent : T.bd}`,
                  background: f.exercise_name === e.name ? `${T.accent}1a` : T.bg2, color: f.exercise_name === e.name ? T.accent : T.tx,
                }}>{e.name}</button>
              ))}
            </div>
          )}
          <input placeholder={t("gym.exerciseName")} value={f.exercise_name} onChange={set("exercise_name")} style={{ ...inp, fontWeight: 600 }} />
          {lastOf && (
            <div style={{ marginTop: 7, fontSize: 11, color: T.txD }}>
              {t("gym.lastTime")} {[lastOf.weight_kg != null && `${lastOf.weight_kg}kg`, lastOf.reps != null && `${lastOf.reps}${t("gym.repsUnit")}`, lastOf.sets != null && `${lastOf.sets}${t("gym.setsUnit")}`].filter(Boolean).join(" × ")}
            </div>
          )}

          {/* ステッパー：タップで増減・直接入力も可 */}
          <div style={{ marginTop: 12, borderTop: `1px solid ${T.bd}` }}>
            <Stepper label={t("gym.weight")} unit="kg" step={2.5} value={f.weight_kg} onChange={(v) => setF((p) => ({ ...p, weight_kg: v }))} />
            <Stepper label={t("gym.reps")} unit={t("gym.repsUnit")} step={1} value={f.reps} onChange={(v) => setF((p) => ({ ...p, reps: v }))} />
            <Stepper label={t("gym.sets")} unit={t("gym.setsUnit")} step={1} value={f.sets} onChange={(v) => setF((p) => ({ ...p, sets: v }))} />
          </div>

          <input placeholder={t("gym.memo")} value={f.notes} onChange={set("notes")} style={{ ...inp, marginTop: 12, marginBottom: 12 }} />
          <button onClick={submit} disabled={saving || !canSave} style={{
            width: "100%", padding: "14px 0", borderRadius: 14, border: "none", cursor: canSave ? "pointer" : "default",
            background: canSave ? `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})` : T.bg3,
            color: canSave ? "#fff" : T.txD, fontSize: 15, fontWeight: 800, boxShadow: canSave ? `0 6px 16px ${T.accent}40` : "none",
          }}>{t("gym.addRecord")}</button>
        </Card>
      )}

      {/* サマリー：継続・今週・記録数 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
        <StatTile icon={G.flame} value={streak} unit={t("gym.dayUnit")} label={t("gym.streak")} color={T.orange} />
        <StatTile icon={G.dumbbell} value={fmtVol(weekVol)} unit={t("gym.kg")} label={t("gym.weekVolume")} color={T.accent} />
        <StatTile icon={G.note} value={workouts.length} unit={t("gym.repsUnit")} label={t("gym.records")} color={T.green} />
      </div>

      {/* 週間ボリュームグラフ */}
      <WeekChart week={week} weekVol={weekVol} todayIso={todayIso} />

      {/* 種目（教材棚）*/}
      {exercises.length > 0 && (
        <>
          <SectionHead title={t("gym.menuTitle")} />
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {exercises.map((e) => (
              <button key={e.name} onClick={() => pick(e.name)} style={{
                flexShrink: 0, width: 150, textAlign: "left", padding: 14, borderRadius: 16, cursor: "pointer",
                background: T.bg2, border: `1px solid ${T.bd}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, background: `${T.accent}14` }}>{G.dumbbell(16)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                </div>
                <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{fmtVol(e.vol)}<span style={{ fontSize: 11, color: T.tx, fontWeight: 600 }}> {t("gym.kg")}</span></div>
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {e.pb != null && <span style={{ fontSize: 10, fontWeight: 700, color: T.orange, background: `${T.orange}14`, padding: "1px 7px", borderRadius: 999 }}>PB {e.pb}kg</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.txD }}>{e.count}{t("gym.repsUnit")}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* タイムライン */}
      <SectionHead title={t("gym.timelineTitle")} />
      {!groups.length ? <Empty icon={G.dumbbell} text={t("gym.noWorkout")} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => {
            const dayVol = g.items.reduce((a, w) => a + volOf(w), 0);
            return (
              <div key={g.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 8px" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.txH }}>{fmtDate(g.items[0].logged_at)}</span>
                  {dayVol > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: `${T.accent}14`, padding: "1px 8px", borderRadius: 999 }}>{fmtVol(dayVol)} {t("gym.kg")}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.items.map((w) => <WorkoutItem key={w.id} w={w} isPB={best[w.exercise_name] === w.weight_kg && w.weight_kg != null} onDelete={() => removeWorkout(w.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// 週間ボリュームグラフ（Studyplus の週間棒グラフ相当）
const WeekChart = ({ week, weekVol, todayIso }) => {
  const max = Math.max(1, ...week.map((d) => d.vol));
  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.txH }}>{t("gym.weeklyChart")}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: T.accent }}>{fmtVol(weekVol)} {t("gym.kg")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 96 }}>
        {week.map((d) => {
          const today = d.iso === todayIso;
          const h = d.vol > 0 ? Math.max(8, Math.round((d.vol / max) * 74)) : 3;
          return (
            <div key={d.iso} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: d.vol > 0 ? T.tx : "transparent", height: 11 }}>{d.vol > 0 ? fmtVol(d.vol) : "0"}</span>
              <div style={{ width: "100%", maxWidth: 26, height: h, borderRadius: 7, background: today ? `linear-gradient(180deg, ${T.accent}, ${T.accentSoft})` : (d.vol > 0 ? `${T.accent}55` : T.bg4) }} />
              <span style={{ fontSize: 10, fontWeight: today ? 800 : 600, color: today ? T.accent : T.txD }}>{DOW[d.date.getDay()]}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// 記録カード
const WorkoutItem = ({ w, isPB, onDelete }) => (
  <div style={{ padding: "14px 16px", borderRadius: 16, background: T.bg2, border: `1px solid ${isPB ? `${T.yellow}55` : T.bd}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
    <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, background: `${T.accent}14` }}>{G.dumbbell(20)}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: T.txH }}>{w.exercise_name}</span>
        {isPB && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${T.yellow}, ${T.orange})`, padding: "2px 9px 2px 6px", borderRadius: 999, boxShadow: `0 2px 8px ${T.orange}55` }}>{G.star(11)}{t("gym.best")}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {[w.weight_kg != null && `${w.weight_kg}kg`, w.reps != null && `${w.reps}${t("gym.repsUnit")}`, w.sets != null && `${w.sets}${t("gym.setsUnit")}`].filter(Boolean).map((chip, ci) => (
          <span key={ci} style={{ fontSize: 13, fontWeight: 700, color: T.txH, background: T.bg3, padding: "3px 10px", borderRadius: 8 }}>{chip}</span>
        ))}
      </div>
      {w.notes && <div style={{ fontSize: 12, color: T.txD, marginTop: 6, whiteSpace: "pre-wrap" }}>{w.notes}</div>}
      <div style={{ fontSize: 10, color: T.txD, marginTop: 6 }}>{fmtTime(w.logged_at)}</div>
    </div>
    <button onClick={onDelete} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", flexShrink: 0, padding: 2 }}>{I.x}</button>
  </div>
);

// 数値ステッパー（−/＋ で増減、中央は直接入力も可）
const Stepper = ({ label, value, onChange, step = 1, unit, min = 0 }) => {
  const num = value === "" || value == null ? 0 : Number(value) || 0;
  const round = (n) => +n.toFixed(2);
  const dec = () => onChange(String(Math.max(min, round(num - step))));
  const inc = () => onChange(String(round(num + step)));
  const btn = { width: 40, height: 40, borderRadius: 12, border: "none", cursor: "pointer", color: T.accent, background: `${T.accent}16`, fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${T.bd}` }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>{label}</span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={dec} style={btn}>−</button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 3, minWidth: 78, justifyContent: "center" }}>
          <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0" style={{ width: 46, textAlign: "center", fontSize: 22, fontWeight: 800, color: T.txH, background: "transparent", border: "none", outline: "none", padding: 0 }} />
          {unit && <span style={{ fontSize: 12, color: T.txD, fontWeight: 600 }}>{unit}</span>}
        </div>
        <button onClick={inc} style={btn}>+</button>
      </div>
    </div>
  );
};

const StatTile = ({ icon, value, unit, label, color }) => (
  <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, padding: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color, background: `${color}16` }}>{icon(15)}</span>
      <span style={{ fontSize: 11, color: T.txD, fontWeight: 600 }}>{label}</span>
    </div>
    <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 3 }}>
      <span style={{ fontSize: 26, fontWeight: 800, color: T.txH, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {unit && <span style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>{unit}</span>}
    </div>
  </div>
);

const MiniEmpty = ({ icon, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px", borderRadius: 14, background: T.bg2, border: `1px dashed ${T.bd}`, color: T.txD, fontSize: 13 }}>
    <span style={{ display: "flex", color: T.bdL }}>{icon(20)}</span>{text}
  </div>
);

const Empty = ({ icon, text }) => (
  <div style={{ textAlign: "center", color: T.txD, padding: "48px 0" }}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: T.bdL }}>{icon(40)}</div>
    <div style={{ fontSize: 13 }}>{text}</div>
  </div>
);
