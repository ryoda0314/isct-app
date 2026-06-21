import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { QRScanner } from "../components/QRScanner.jsx";
import { useGym } from "../hooks/useGym.js";
import {
  GYM_QR, todayHours, isOpenNow, lastEntry, monthSchedule,
  congestionKey, STATUS_META, toISO,
} from "../gymSchedule.js";

// AnnouncementBanner.jsx と揃えたお知らせタイプ別スタイル（テーマ切替に追従するよう描画時に解決）
const annStyles = () => ({
  info:        { color: T.accent, icon: I.bell,  labelKey: "announce.typeInfo" },
  maintenance: { color: T.orange, icon: I.alert, labelKey: "announce.typeMaintenance" },
  update:      { color: T.green,  icon: I.star,  labelKey: "announce.typeUpdate" },
  urgent:      { color: T.red,    icon: I.alert, labelKey: "announce.typeUrgent" },
});

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const fmtTime = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]})`; };
const fmtDur = (min) => (min == null ? "" : min >= 60 ? `${Math.floor(min / 60)}${t("gym.hour")}${min % 60}${t("gym.min")}` : `${min}${t("gym.min")}`);

const Card = ({ children, style }) => (
  <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 12, padding: 16, ...style }}>{children}</div>
);
export function GymView({ mob = false }) {
  const { state, announcements, history, workouts, loading, checkin, addWorkout, removeWorkout } = useGym();
  const [tab, setTab] = useState("home");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null); // { ok, text }

  const now = new Date();
  const today = todayHours(now);
  const open = isOpenNow(now);
  const lastIn = lastEntry(today);

  // QR 読み取り：自分のQRなら true を返してカメラ停止 → 非同期で入退館記録
  const onQr = (raw) => {
    if (raw !== GYM_QR) return false;
    setBusy(true);
    checkin(raw)
      .then((res) => {
        const time = fmtTime(res.at);
        setFlash({
          ok: true,
          text: res.state === "in" ? t("gym.checkedIn", { time }) : t("gym.checkedOut", { time, dur: fmtDur(res.durationMin) }),
        });
      })
      .catch(() => setFlash({ ok: false, text: t("gym.checkinFailed") }))
      .finally(() => { setBusy(false); setScanning(false); });
    return true;
  };

  const TABS = [
    { id: "home", label: t("gym.tabHome") },
    { id: "schedule", label: t("gym.tabSchedule") },
    { id: "announce", label: t("gym.tabAnnounce") },
    { id: "history", label: t("gym.tabHistory") },
    { id: "workout", label: t("gym.tabWorkout") },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: mob ? "12px 14px 40px" : "20px 24px 48px" }}>
        {!mob && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ color: T.accent, display: "flex" }}>{I.dumbbell}</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: T.txH, margin: 0 }}>{t("tool.gym")}</h1>
          </div>
        )}

        {/* タブ */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0", marginBottom: 4 }}>
          {TABS.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              flexShrink: 0, padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${tab === tb.id ? T.accent : T.bd}`,
              background: tab === tb.id ? `${T.accent}1a` : T.bg2,
              color: tab === tb.id ? T.accent : T.txD,
            }}>{tb.label}</button>
          ))}
        </div>

        {flash && (
          <div style={{
            margin: "8px 0", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: flash.ok ? `${T.green}1a` : `${T.red}1a`, color: flash.ok ? T.green : T.red,
            border: `1px solid ${(flash.ok ? T.green : T.red)}40`,
          }}>{flash.text}</div>
        )}

        {tab === "home" && (
          <HomeTab {...{ today, open, lastIn, state, scanning, setScanning, busy, onQr }} />
        )}
        {tab === "schedule" && <ScheduleTab now={now} />}
        {tab === "announce" && <AnnounceTab announcements={announcements} loading={loading} />}
        {tab === "history" && <HistoryTab history={history} loading={loading} />}
        {tab === "workout" && <WorkoutTab workouts={workouts} addWorkout={addWorkout} removeWorkout={removeWorkout} />}
      </div>
    </div>
  );
}

// ── ホーム：開館状況 + 現在人数（参考値）+ QR入退場 ──────────
function HomeTab({ today, open, lastIn, state, scanning, setScanning, busy, onQr }) {
  const congLabel = t(congestionKey(state.count));
  const inMe = state.myState === "in";
  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
            background: open ? `${T.green}1a` : `${T.off}22`, color: open ? T.green : T.txD,
          }}>{open ? t("gym.open") : t("gym.closed")}</span>
        </div>
        <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.9 }}>
          <div>{t("gym.todayHours")}：{today.closed ? t("gym.statusClosed") : `${today.open}〜${today.close}`}{today.label ? `（${today.label}）` : ""}</div>
          {!today.closed && lastIn && <div>{t("gym.lastEntry")}：{lastIn}</div>}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: T.txH }}>{state.count}</span>
          <span style={{ fontSize: 14, color: T.tx }}>{t("gym.peopleNow")}</span>
          <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: T.accent }}>{congLabel}</span>
        </div>
        {/* 誤認防止のための必須注記 */}
        <div style={{ marginTop: 8, fontSize: 11, color: T.txD, lineHeight: 1.5 }}>※ {t("gym.refNote")}</div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        {!scanning ? (
          <button onClick={() => setScanning(true)} disabled={busy} style={{
            width: "100%", padding: "13px 0", borderRadius: 10, cursor: "pointer",
            border: "none", background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            {inMe ? t("gym.scanCheckout") : t("gym.scanCheckin")}
          </button>
        ) : (
          <QRScanner onResult={onQr} onClose={() => setScanning(false)} />
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: T.txD }}>
          {inMe ? t("gym.youAreIn") : t("gym.scanHint")}
        </div>
      </Card>
    </>
  );
}

// ── 開館予定カレンダー ──────────────────────────────
function ScheduleTab({ now }) {
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const days = useMemo(() => monthSchedule(ym.y, ym.m), [ym]);
  const lead = days.length ? days[0].dow : 0;
  const todayIso = toISO(now);
  const shift = (d) => setYm(({ y, m }) => { const nm = m + d; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });

  const cellColor = (type) => ({
    open: T.green, short: T.yellow, closed: T.off, class: T.orange, inspection: T.orange, special: T.red,
  }[type] || T.off);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 2px" }}>
        <button onClick={() => shift(-1)} style={navBtn()}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{ym.y}年{ym.m + 1}月</div>
        <button onClick={() => shift(1)} style={navBtn()}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {DOW.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: i === 0 ? T.red : i === 6 ? T.accent : T.txD, padding: "2px 0" }}>{d}</div>
        ))}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((day) => {
          const isToday = day.iso === todayIso;
          const c = cellColor(day.type);
          const mark = STATUS_META[day.type]?.mark || "";
          return (
            <div key={day.iso} style={{
              minHeight: 52, borderRadius: 8, padding: "4px 2px", textAlign: "center",
              background: T.bg2, border: `1px solid ${isToday ? T.accent : T.bd}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? T.accent : T.tx }}>{day.date.getDate()}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{mark}</div>
              {!day.closed && <div style={{ fontSize: 8.5, color: T.txD, lineHeight: 1.1 }}>{day.open}<br />{day.close}</div>}
            </div>
          );
        })}
      </div>
      {/* 凡例：色だけでなく記号・文字併用 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        {Object.entries(STATUS_META).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.tx }}>
            <span style={{ fontWeight: 700, color: cellColor(k) }}>{v.mark}</span>{t(v.labelKey)}
          </span>
        ))}
      </div>
    </>
  );
}
const navBtn = () => ({ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 18, cursor: "pointer" });

// ── スタッフお知らせ ───────────────────────────────
function AnnounceTab({ announcements, loading }) {
  if (loading) return <Empty text={t("common.loading")} />;
  if (!announcements.length) return <Empty text={t("gym.noAnnounce")} />;
  const styles = annStyles();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      {announcements.map((a) => {
        const s = styles[a.type] || styles.info;
        return (
          <div key={a.id} style={{ padding: "12px 14px", borderRadius: 10, background: `${s.color}10`, border: `1px solid ${s.color}30`, display: "flex", gap: 10 }}>
            <span style={{ color: s.color, display: "flex", flexShrink: 0, marginTop: 2 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                {a.pinned && <span style={{ fontSize: 11, color: s.color }}>📌</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{t(s.labelKey)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{a.title}</span>
              </div>
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
              <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>{fmtDate(a.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 利用履歴 ─────────────────────────────────────
function HistoryTab({ history, loading }) {
  if (loading) return <Empty text={t("common.loading")} />;
  const { sessions, monthCount, monthMin } = history;
  return (
    <>
      <Card style={{ marginTop: 12, display: "flex", gap: 24 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: T.txH }}>{monthCount}</div><div style={{ fontSize: 11, color: T.txD }}>{t("gym.monthCount")}</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: T.txH }}>{fmtDur(monthMin) || "0" + t("gym.min")}</div><div style={{ fontSize: 11, color: T.txD }}>{t("gym.monthTotal")}</div></div>
      </Card>
      {!sessions.length ? <Empty text={t("gym.noHistory")} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {sessions.map((s, i) => {
            const ref = s.in || s.out;
            return (
              <Card key={i} style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{fmtDate(ref)}</div>
                <div style={{ fontSize: 13, color: T.tx, marginTop: 3 }}>
                  {s.in ? fmtTime(s.in) : "—"}〜{s.out ? fmtTime(s.out) : t("gym.inNow")}
                  {s.durationMin != null && <span style={{ marginLeft: 8, color: T.txD }}>{fmtDur(s.durationMin)}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── 筋トレ記録 ───────────────────────────────────
function WorkoutTab({ workouts, addWorkout, removeWorkout }) {
  const [f, setF] = useState({ exercise_name: "", weight_kg: "", reps: "", sets: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // 種目ごとの自己ベスト（最大重量）
  const best = useMemo(() => {
    const m = {};
    for (const w of workouts) {
      if (w.weight_kg != null && (!m[w.exercise_name] || w.weight_kg > m[w.exercise_name])) m[w.exercise_name] = w.weight_kg;
    }
    return m;
  }, [workouts]);

  const submit = async () => {
    if (!f.exercise_name.trim() || saving) return;
    setSaving(true);
    try { await addWorkout(f); setF({ exercise_name: "", weight_kg: "", reps: "", sets: "", notes: "" }); }
    catch {} finally { setSaving(false); }
  };

  const inp = { padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg, color: T.txH, fontSize: 13, width: "100%", boxSizing: "border-box" };

  return (
    <>
      <Card style={{ marginTop: 12 }}>
        <input placeholder={t("gym.exerciseName")} value={f.exercise_name} onChange={set("exercise_name")} style={{ ...inp, marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input type="number" inputMode="decimal" placeholder={t("gym.weight")} value={f.weight_kg} onChange={set("weight_kg")} style={inp} />
          <input type="number" inputMode="numeric" placeholder={t("gym.reps")} value={f.reps} onChange={set("reps")} style={inp} />
          <input type="number" inputMode="numeric" placeholder={t("gym.sets")} value={f.sets} onChange={set("sets")} style={inp} />
        </div>
        <input placeholder={t("gym.memo")} value={f.notes} onChange={set("notes")} style={{ ...inp, marginBottom: 10 }} />
        <button onClick={submit} disabled={saving || !f.exercise_name.trim()} style={{
          width: "100%", padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
          background: f.exercise_name.trim() ? T.accent : T.bg3, color: f.exercise_name.trim() ? "#fff" : T.txD, fontSize: 14, fontWeight: 700,
        }}>{t("gym.addRecord")}</button>
      </Card>

      {!workouts.length ? <Empty text={t("gym.noWorkout")} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {workouts.map((w) => (
            <Card key={w.id} style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{w.exercise_name}</span>
                  {best[w.exercise_name] === w.weight_kg && w.weight_kg != null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.yellow, background: `${T.yellow}1a`, padding: "1px 6px", borderRadius: 6 }}>★ {t("gym.best")}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: T.tx, marginTop: 3 }}>
                  {[w.weight_kg != null && `${w.weight_kg}kg`, w.reps != null && `${w.reps}${t("gym.repsUnit")}`, w.sets != null && `${w.sets}${t("gym.setsUnit")}`].filter(Boolean).join(" × ")}
                </div>
                {w.notes && <div style={{ fontSize: 12, color: T.txD, marginTop: 3, whiteSpace: "pre-wrap" }}>{w.notes}</div>}
                <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>{fmtDate(w.logged_at)} {fmtTime(w.logged_at)}</div>
              </div>
              <button onClick={() => removeWorkout(w.id)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", flexShrink: 0, padding: 2 }}>{I.x}</button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

const Empty = ({ text }) => <div style={{ textAlign: "center", color: T.txD, fontSize: 13, padding: "40px 0" }}>{text}</div>;
