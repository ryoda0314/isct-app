import { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { openMaterial } from "../openMaterial.js";

// ── Taki Plaza facility info. sched = [openMin, closeMin] for weekday(wd)/weekend(we) ──
const TAKI = {
  spotId: "taki", name: "Taki Plaza",
  sched: { wd: [510, 1260], we: [540, 1200] }, // 平日 8:30–21:00 / 土日祝 9:00–20:00
  hoursTextKey: "facility.hoursText",
  links: [
    { labelKey: "facility.linkStudentGuide", url: "https://www.titech.ac.jp/student-support/students/facilities/takiplaza" },
    { labelKey: "facility.linkOfficial", url: "https://takiplaza.gakumu.titech.ac.jp/" },
  ],
};

// Spaces that students use freely until a reservation kicks them out.
const FREE_USE = /WORK\s*POD|ワークショップ|Workshop/i;
// Japanese display labels for English facility names from the portal.
const NAME_JA = {
  "Event space(Library Side)": "イベントスペース（図書館側）",
  "Event space(Dry Garden Side)": "イベントスペース（ドライガーデン側）",
  "Event space (Kitchen)": "キッチンエリア",
  "Grand Staircase": "大階段エリア",
  "Workshop Room 1": "ワークショップルーム1",
  "Workshop Room 2": "ワークショップルーム2",
  "WORK POD A": "WORK POD A",
  "WORK POD B": "WORK POD B",
};
const jaName = (n) => NAME_JA[n] || n;

// フロア分け（暫定: 要確認）。B1F=ワークショップ/WORK POD, B2F=イベント/キッチン/大階段。
const FLOOR_ORDER = ["B1F", "B2F"];
const FLOOR_OF = {
  "WORK POD A": "B1F", "WORK POD B": "B1F",
  "ワークショップルーム1": "B2F", "ワークショップルーム2": "B2F",
  "イベントスペース（図書館側）": "B2F", "イベントスペース（ドライガーデン側）": "B2F", "キッチンエリア": "B2F", "大階段エリア": "B2F",
};
const floorOf = (jaNm) => FLOOR_OF[jaNm] || "その他";
const floorLabel = (fl) => fl === "その他" ? t("facility.floorOther") : fl;
const groupByFloor = (arr) => {
  const order = [...FLOOR_ORDER, "その他"];
  return order.map((fl) => ({ fl, list: arr.filter((it) => floorOf(it.name) === fl) })).filter((g) => g.list.length > 0);
};

const pad = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const dowColor = (dow) => dow === "日" ? "#ef4444" : dow === "土" ? "#3b82f6" : T.txH;

const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// Today's open status for a facility (weekday vs weekend hours; holidays not detected).
function facilityStatus(sched, now) {
  const we = now.getDay() === 0 || now.getDay() === 6;
  const [o, c] = we ? sched.we : sched.wd;
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < o) return { col: T.txD, label: t("facility.beforeOpen"), detail: t("facility.opensAt", { time: fmtMin(o) }) };
  if (m >= c) return { col: T.red, label: t("facility.closedToday"), detail: t("facility.nextFrom", { time: fmtMin(o) }) };
  const rem = c - m;
  if (rem <= 60) return { col: T.orange, label: t("facility.closingSoon"), detail: t("facility.untilWithRemain", { time: fmtMin(c), min: rem }) };
  return { col: T.green, label: t("facility.openNow"), detail: t("facility.until", { time: fmtMin(c) }) };
}

function computeNextEviction(slots, nowMin) {
  const sorted = [...slots].sort((a, b) => toMin(a.start) - toMin(b.start));
  for (const s of sorted) {
    if (toMin(s.start) <= nowMin && nowMin < toMin(s.end)) return { state: "occupied", until: s.end, slot: s };
  }
  const next = sorted.find((s) => toMin(s.start) > nowMin);
  if (next) return { state: "next", at: next.start, minsUntil: toMin(next.start) - nowMin, slot: next };
  return { state: "free" };
}

export const FacilityReservationView = ({ mob, onNavigate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [viewISO, setViewISO] = useState(null); // null = 今日
  const [showCal, setShowCal] = useState(false);
  const [calMonth, setCalMonth] = useState(null); // first-of-month Date for the picker
  const [roomModal, setRoomModal] = useState(null); // {name, slots} of tapped room

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  const todayISO = toISO(now);
  const effISO = viewISO || todayISO; // 表示中の日付
  const targetDate = useMemo(() => { const [y, m, d] = effISO.split("-").map(Number); return new Date(y, m - 1, d); }, [effISO]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/data/facility-reservations?date=${toYMD(targetDate)}&b=1`, { credentials: "include" });
      if (!r.ok) { setError(r.status === 400 ? "portal" : "fetch"); setLoading(false); return; }
      const d = await r.json();
      if (d?.error) { setError("grid"); setLoading(false); return; }
      setData(d);
    } catch { setError("fetch"); }
    setLoading(false);
  }, [targetDate]);

  useEffect(() => { load(); }, [load]);

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const openLink = (url) => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });

  const Header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.accent}14`, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}>{I.clock}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: mob ? 18 : 20, fontWeight: 800, color: T.txH }}>Taki Plaza</div>
      </div>
      <button onClick={load} title={t("facility.refresh")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, cursor: "pointer" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
    </div>
  );

  const wrap = (children) => (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ padding: mob ? "16px 14px 40px" : "24px 28px 48px", maxWidth: 760, margin: "0 auto", boxSizing: "border-box" }}>
        {Header}{children}
      </div>
    </div>
  );

  if (error === "portal") return wrap(<div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>{t("facility.errPortalLine1")}<br />{t("facility.errPortalLine2")}</div>);
  if (error === "fetch" || error === "grid") return wrap(<div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>{t("facility.errFetchLine1")}<br />{t("facility.errFetchLine2")}<div><button onClick={load} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("facility.retry")}</button></div></div>);
  if (loading || !data) return wrap(<div style={{ textAlign: "center", padding: 60, color: T.txD, fontSize: 13 }}><span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "mnSpin .6s linear infinite", verticalAlign: "middle", marginRight: 10 }} />{t("facility.loadingStatus")}</div>);

  const sortedSpaces = [...data.spaces].sort((a, b) => (FREE_USE.test(`${a.group} ${a.name}`) ? 0 : 1) - (FREE_USE.test(`${b.group} ${b.name}`) ? 0 : 1));
  const selIdx0 = data.days.findIndex((d) => d.date === effISO);
  const sel = selIdx0 >= 0 ? selIdx0 : 0;
  const selDay = data.days[sel];
  const selIsToday = selDay?.date === todayISO;

  // ── Taki Plaza today status (always visible) ──
  const fs = facilityStatus(TAKI.sched, now);
  const weToday = now.getDay() === 0 || now.getDay() === 6;
  const [tOpen, tClose] = weToday ? TAKI.sched.we : TAKI.sched.wd;
  const infoBlock = (
    <div style={{ marginBottom: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, padding: "12px 14px" }}>
      {/* 状態 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: fs.col, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: fs.col }}>{fs.label}</span>
        {onNavigate && <button onClick={() => onNavigate(TAKI.spotId)} title={t("facility.viewOnMap")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 7, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txD, fontSize: 11, cursor: "pointer" }}><span style={{ display: "flex" }}>{I.pin}</span>{t("facility.map")}</button>}
      </div>
      {/* 本日の営業時間（主役） */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.txD }}>{t("facility.todayHours")}</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: T.txH, lineHeight: 1.1 }}>{fmtMin(tOpen)} – {fmtMin(tClose)}</span>
        <span style={{ fontSize: 11, color: T.txD }}>（{weToday ? t("facility.weekend") : t("facility.weekday")}）</span>
        <span style={{ fontSize: 12.5, color: fs.col, fontWeight: 600 }}>{fs.detail}</span>
      </div>
      {/* 補助: 全体の時間 + リンク */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 10px", marginTop: 8 }}>
        <span style={{ fontSize: 10.5, color: T.txD, opacity: .9 }}>{t(TAKI.hoursTextKey)}</span>
        {TAKI.links.map((l) => (
          <button key={l.url} onClick={() => openLink(l.url)} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 0, border: "none", background: "transparent", color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {t(l.labelKey)}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Day view (minimal): summary + only what matters (使用中 / 予約) ──
  const items = sortedSpaces.map((sp) => ({
    key: sp.name,
    name: jaName(sp.name),
    free: FREE_USE.test(`${sp.group} ${sp.name}`),
    slots: sp.slots[sel] || [],
    ev: computeNextEviction(sp.slots[sel] || [], nowMin),
  }));
  const total = items.length;
  const inUse = selIsToday ? items.filter((it) => it.ev.state === "occupied") : [];
  const reserved = !selIsToday ? items.filter((it) => it.slots.length > 0) : [];
  const freeCount = total - (selIsToday ? inUse.length : reserved.length);

  const Summary = ({ label, n, col }) => (
    <div style={{ fontSize: 13, color: T.txD, marginBottom: 14 }}>
      {label} <span style={{ fontSize: 22, fontWeight: 800, color: col }}>{n}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.txD }}> {t("facility.ofSpaces", { total })}</span>
    </div>
  );
  const AllFree = ({ text }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.green, padding: "4px 0" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{text}</span>
    </div>
  );
  const restLine = (n, msgKey) => n > 0 && <div style={{ fontSize: 12.5, color: T.txD, marginTop: 12, paddingLeft: 2 }}>{t(msgKey, { n })}</div>;
  const FloorLabel = ({ fl }) => (
    <div style={{ fontSize: 10.5, fontWeight: 800, color: T.txD, letterSpacing: .5, margin: "12px 0 2px" }}>{floorLabel(fl)}</div>
  );

  const dayView = (
    <div>
      {selIsToday ? (
        <>
          <Summary label={t("facility.usableNow")} n={freeCount} col={T.green} />
          {inUse.length === 0 ? <AllFree text={t("facility.allFreeNow")} /> : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>{t("facility.inUse")}</div>
              {groupByFloor(inUse).map(({ fl, list }) => (
                <div key={fl}>
                  <FloorLabel fl={fl} />
                  {list.map((it) => (
                    <div key={it.key} onClick={() => setRoomModal(it)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 2px", borderBottom: `1px solid ${T.bd}`, cursor: "pointer" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{it.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 13, color: T.txD }}><span style={{ fontSize: 15, fontWeight: 800, color: T.txH }}>{it.ev.until}</span> {t("facility.freesAtSuffix")}</span>
                      <span style={{ display: "flex", color: T.txD }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
                    </div>
                  ))}
                </div>
              ))}
              {restLine(freeCount, "facility.restFree")}
            </>
          )}
        </>
      ) : (
        <>
          <Summary label={t("facility.hasReservations")} n={reserved.length} col={reserved.length ? T.txH : T.green} />
          {reserved.length === 0 ? <AllFree text={t("facility.allFreeAllDay")} /> : (
            <>
              {groupByFloor(reserved).map(({ fl, list }) => (
                <div key={fl}>
                  <FloorLabel fl={fl} />
                  {list.map((it) => (
                    <div key={it.key} onClick={() => setRoomModal(it)} style={{ padding: "10px 2px", borderBottom: `1px solid ${T.bd}`, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{it.name}</span>
                        <span style={{ marginLeft: "auto", display: "flex", color: T.txD }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {it.slots.map((s, si) => <span key={si} style={{ fontSize: 12.5, fontWeight: 700, color: T.red, background: `${T.red}14`, padding: "2px 8px", borderRadius: 6 }}>{s.start}<span style={{ opacity: .55, margin: "0 1px" }}>–</span>{s.end}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {restLine(total - reserved.length, "facility.restFreeAllDay")}
            </>
          )}
        </>
      )}
    </div>
  );

  // ── 月カレンダー（日付ピッカー） ──
  const calNav = { width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg, color: T.txD, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0 };
  const cm = calMonth || new Date(parseInt(effISO.slice(0, 4)), parseInt(effISO.slice(5, 7)) - 1, 1);
  const cy = cm.getFullYear(), cmo = cm.getMonth();
  const firstDow = new Date(cy, cmo, 1).getDay();
  const dim = new Date(cy, cmo + 1, 0).getDate();
  const calendar = (
    <>
      <div onClick={() => setShowCal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 998 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(330px, 90vw)", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, padding: 16, zIndex: 999, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{t("facility.pickDate")}</span>
          <button onClick={() => setShowCal(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={() => setCalMonth(new Date(cy, cmo - 1, 1))} style={calNav}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{t("facility.yearMonth", { year: cy, month: cmo + 1 })}</span>
          <button onClick={() => setCalMonth(new Date(cy, cmo + 1, 1))} style={calNav}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : T.txD }}>{t("dow.s." + w)}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={"p" + i} />)}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1;
            const iso = `${cy}-${pad(cmo + 1)}-${pad(day)}`;
            const isToday = iso === todayISO, isSel = iso === effISO;
            const dow = new Date(cy, cmo, day).getDay();
            return (
              <button key={day} onClick={() => { setViewISO(iso); setShowCal(false); }} style={{
                aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                borderRadius: 8, cursor: "pointer", border: isSel ? `1px solid ${T.accent}` : `1px solid ${T.bd}`,
                background: isSel ? T.accent : T.bg,
                color: isSel ? "#fff" : (dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : T.txH),
                fontSize: 14, fontWeight: (isToday || isSel) ? 800 : 500,
              }}>
                {day}
                {isToday && !isSel && <span style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: T.accent }} />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  // ── ルーム予約の詳細モーダル（誰がいつ取っているか） ──
  const roomModalEl = roomModal && (
    <>
      <div onClick={() => setRoomModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 998 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(360px, 92vw)", maxHeight: "80vh", overflowY: "auto", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, padding: 16, zIndex: 999, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.txH }}>{roomModal.name}</span>
          <button onClick={() => setRoomModal(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{floorLabel(floorOf(roomModal.name))} ・ {selDay ? `${parseInt(selDay.date.slice(5, 7))}/${parseInt(selDay.date.slice(8))}(${t("dow.s." + selDay.dow)})` : ""} {t("facility.reservationsSuffix")}</div>
        {roomModal.slots.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.green, padding: "6px 0" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t("facility.freeAllDayNoRes")}</span>
          </div>
        ) : (
          roomModal.slots.map((s, si) => {
            const ongoing = selIsToday && toMin(s.start) <= nowMin && nowMin < toMin(s.end);
            return (
              <div key={si} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: si < roomModal.slots.length - 1 ? `1px solid ${T.bd}` : "none" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: ongoing ? T.red : T.txH, minWidth: 100, flexShrink: 0 }}>{s.start}–{s.end}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.txH }}>{s.title || t("facility.untitled")}{ongoing && <span style={{ fontSize: 10, fontWeight: 700, color: T.red, marginLeft: 6 }}>{t("facility.inUse")}</span>}</div>
                  {s.org && <div style={{ fontSize: 11.5, color: T.txD, marginTop: 1 }}>{s.org}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return wrap(
    <>
      {infoBlock}
      {roomModalEl}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.txH }}>
          {selDay ? `${selIsToday ? t("facility.todayPrefix") + " " : ""}${parseInt(selDay.date.slice(5, 7))}/${parseInt(selDay.date.slice(8))}(${t("dow.s." + selDay.dow)})` : ""}
        </span>
        {!selIsToday && <button onClick={() => { setViewISO(null); setShowCal(false); }} style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: `${T.accent}15`, color: T.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t("facility.backToToday")}</button>}
        <button onClick={() => setShowCal((v) => !v)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: showCal ? `${T.accent}12` : T.bg2, color: showCal ? T.accent : T.txD, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <span style={{ display: "flex" }}>{I.cal}</span>{showCal ? t("common.close") : t("facility.pickDate")}
        </button>
      </div>

      {showCal && calendar}

      {dayView}

      <div style={{ fontSize: 11, color: T.txD, marginTop: 16, lineHeight: 1.6 }}>
        {t("facility.footerNote")}
      </div>
    </>
  );
};

