import { useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { T } from "../theme.js";
import { getLang, t } from "../i18n.js";
import { I } from "../icons.jsx";
import { openMaterial } from "../openMaterial.js";
import { takiClock, takiDay } from "../takiAvailability.js";
import s from "./takiPlaza.module.css";

const Model = dynamic(() => import("../components/TakiPlazaModel.jsx"), {
  ssr: false,
  loading: () => <div className={s.modelLoading}>{t("taki.modelLoading")}</div>,
});
const GUIDE = "https://www.titech.ac.jp/student-support/students/facilities/takiplaza";
const WEBSITE = "https://takiplaza.gakumu.titech.ac.jp/";
const PORTAL = "https://portal.titech.ac.jp/";
const time = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const locale = () => ({ ja: "ja-JP", en: "en-GB", zh: "zh-CN", ko: "ko-KR", tp: "en-GB" }[getLang()] || "ja-JP");

function shiftDay(date, offset) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date, options) {
  return new Intl.DateTimeFormat(locale(), { timeZone: "Asia/Tokyo", ...options }).format(new Date(date));
}

function useWeek(date) {
  const monday = shiftDay(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(`/api/data/facility-reservations?date=${monday.replaceAll("-", "")}&b=1`, {
          credentials: "include", cache: "no-store", signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (data.error) throw new Error("reservations");
        if (!controller.signal.aborted) setResult({ monday, version, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ monday, version, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [monday, version]);
  return { result: result?.monday === monday && result.version === version ? result : null, reload: () => setVersion(v => v + 1) };
}

function floorLabel(room) {
  if (room.name === "大階段エリア") return "B1–B2F";
  return room.floor === "その他" ? t("facility.floorOther") : room.floor;
}
const roomLabel = room => getLang() === "ja" ? room.name : room.englishName || room.rawName;
const roomKey = room => JSON.stringify([room.group, room.rawName]);

function opening(room, day, duration) {
  const from = day.isToday ? day.nowMin : day.open;
  for (const { start, end } of room.free) {
    const begin = Math.max(start, from);
    if (end > begin && end - begin >= duration) return { start: begin, end };
  }
  return null;
}

function roomStatus(room, day) {
  if (room.state === "unknown") return t("taki.unavailableData");
  if (day.close === day.open) return t("taki.closedDay");
  if (room.weekdayOnly && day.weekendHours) return t("taki.weekdays");
  if (day.phase === "after") return t("facility.closedToday");
  if (room.state === "busy") return t("taki.bookedNow");
  if (room.state === "free") return t("taki.freeNow");
  return t(room.free.length ? "taki.hasGap" : "taki.noGap");
}

function TimeBar({ room, day, legend = false }) {
  const span = day.close - day.open;
  if (!span) return null;
  const position = m => Math.max(0, Math.min(100, 100 * (m - day.open) / span));
  const restricted = room.state === "unknown" || (room.weekdayOnly && day.weekendHours);
  return <span className={s.barWrap} aria-hidden="true">
    <span className={s.timeBar} data-muted={restricted || undefined}>
      {room.slots.map((slot, i) => <i key={i} style={{
        left: position(slot.startMin) + "%", width: (position(slot.endMin) - position(slot.startMin)) + "%",
      }} />)}
      {day.phase === "open" && <b style={{ left: position(day.nowMin) + "%" }} />}
    </span>
    {legend && <span className={s.axis}><span>{time(day.open)}</span><span>{time(day.close)}</span></span>}
  </span>;
}

function RoomRow({ room, day, gap, expanded, onToggle, onLocate, register, openLink }) {
  const panelId = useId();
  const status = roomStatus(room, day);
  const openNow = room.state === "free";
  const inUse = room.state === "busy";
  const tone = openNow ? "free" : inUse ? "booked" : "neutral";
  const windowLabel = gap ? t(day.phase === "open" && gap.start > day.nowMin ? "taki.nextGapTime" : "taki.gapTime", { start: time(gap.start), end: time(gap.end) })
    : room.current ? t("taki.bookingEnds", { time: room.current.end }) : null;
  return <article className={s.room} data-expanded={expanded || undefined}>
    <button ref={register} className={s.roomToggle} onClick={onToggle} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}>
      <span className={s.floorBadge}>{floorLabel(room)}</span>
      <span className={s.roomTitle}><strong>{roomLabel(room) || t("facility.untitled")}</strong>
        {windowLabel && <span>{windowLabel}</span>}
      </span>
      <span className={s.miniBar}><TimeBar room={room} day={day} /></span>
      <span className={s.status} data-tone={tone}>{status}</span>
      <span className={s.disclose}>{I.chevDown}</span>
    </button>
    {expanded && <div id={panelId} className={s.roomDetails}>
      <div className={s.detailHead}>
        <h3>{t("taki.dayPlan")}</h3>
        {room.floor !== "その他" && <button className={s.textAction} onClick={onLocate}>{I.map}{t("taki.locate")}</button>}
      </div>
      <TimeBar room={room} day={day} legend />
      {room.weekdayOnly && <p className={s.hint}>{t("taki.podUse")}</p>}
      {room.state === "unknown" ? <p>{t("taki.unavailableData")}</p> : <>
        {room.free.length > 0 && <div className={s.gaps}>
          <strong>{t("taki.freeSlots")}</strong>
          {room.free.map(({ start, end }) => <span key={start}>{time(start)}–{time(end)}</span>)}
        </div>}
        {room.slots.length > 0 && <ul className={s.agenda}>
          {room.slots.map((slot, i) => <li key={i}>
            <time>{slot.start}–{slot.end}</time>
            <span>{slot.title || t("facility.untitled")}{slot.org && <small>{slot.org}</small>}</span>
          </li>)}
        </ul>}
      </>}
      <button className={s.textAction} onClick={() => openLink(PORTAL)}>{t("taki.portal")} <span aria-hidden="true">↗</span></button>
    </div>}
  </article>;
}

function DatePicker({ date, today, onChange }) {
  return <div className={s.dateTools}>
    {date !== today && <button className={s.today} onClick={() => onChange(today)}>{t("facility.backToToday")}</button>}
    <div className={s.dateGroup}>
      <button disabled={date <= "1000-01-01"} onClick={() => onChange(shiftDay(date, -1))} aria-label={t("taki.previous")}>‹</button>
      <label className={s.dateInput}>
        {I.cal}<span>{dayLabel(date, { month: "short", day: "numeric", weekday: "short", ...(date.slice(0, 4) !== today.slice(0, 4) && { year: "numeric" }) })}</span>
        <input type="date" aria-label={t("facility.pickDate")} value={date} min="1000-01-01" max="9999-12-31"
          onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
          onChange={e => { if (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(e.target.value)) onChange(e.target.value); }} />
      </label>
      <button disabled={date >= "9999-12-31"} onClick={() => onChange(shiftDay(date, 1))} aria-label={t("taki.next")}>›</button>
    </div>
  </div>;
}

export function FacilityReservationView({ mob, onBack, onNavigate }) {
  const [now, setNow] = useState(() => new Date());
  const [picked, setPicked] = useState(null);
  const [duration, setDuration] = useState(0);
  const [floor, setFloor] = useState("all");
  const [selected, setSelected] = useState(null);
  const [scene, setScene] = useState({ floor: "all", space: null });
  const modelRef = useRef(null);
  const rowRefs = useRef(new Map());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const today = takiClock(now).date;
  const date = picked || today;
  const { result, reload } = useWeek(date);
  const day = useMemo(() => takiDay(result?.data, date, now), [result, date, now]);
  const building = day.isToday ? day : takiDay(null, today, now);
  const freeCount = day.rooms.filter(room => room.state === "free").length;
  const rooms = day.rooms.map(room => ({ room, gap: opening(room, day, duration) }))
    .filter(({ room, gap }) => (floor === "all" || room.floor === floor || (room.name === "大階段エリア" && floor === "B1F")) && (!duration || gap))
    .sort((a, b) => (a.gap?.start ?? Infinity) - (b.gap?.start ?? Infinity)
      || a.room.floor.localeCompare(b.room.floor) || a.room.name.localeCompare(b.room.name, locale(), { numeric: true }));
  const floorOptions = [...new Set(day.rooms.map(room => room.floor))].sort();
  const openLink = url => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });
  function pickDate(value) {
    setPicked(value === today ? null : value);
    setSelected(null);
    setFloor("all");
    setScene({ floor: "all", space: null });
  }
  function locate(room) {
    setScene({ floor: room.floor, space: room.name });
    modelRef.current?.scrollIntoView({ block: "center" });
    modelRef.current?.focus({ preventScroll: true });
  }
  function fromModel(name, modelFloor) {
    const room = day.rooms.find(r => r.name === name || r.englishName === name || r.rawName === name);
    if (!room) {
      setScene({ floor: modelFloor, space: name, retainCut: true });
      return;
    }
    setSelected(roomKey(room));
    setFloor("all");
    setDuration(0);
    setScene({ floor: room.floor, space: room.name, retainCut: true });
    requestAnimationFrame(() => {
      const btn = rowRefs.current.get(roomKey(room));
      btn?.scrollIntoView({ block: "center" });
      btn?.focus({ preventScroll: true });
    });
  }
  const theme = {
    "--tp-bg": T.bg, "--tp-card": T.bg2, "--tp-surface": T.bg3, "--tp-ink": T.txH,
    "--tp-secondary": T.tx, "--tp-border": T.bd, "--tp-accent": T.accent,
    "--tp-green": T.green, "--tp-orange": T.orange,
  };
  return <main className={s.screen} style={theme}>
    <div className={s.page}>
      <section className={s.hero} aria-label="Taki Plaza">
        <div className={s.intro}>
          <div className={s.place}>{mob && onBack && <button className={s.back} onClick={onBack} aria-label={t("common.back")}>{I.back}</button>}{I.pin}{t("library.ookayama")}</div>
          <h1>Taki Plaza</h1>
          <div className={s.hours}><span className={s.openBadge} data-open={building.phase === "open" || undefined}>
            <i />{t(building.phase === "open" ? (building.close - building.nowMin <= 60 ? "facility.closingSoon" : "facility.openNow") : building.phase === "before" ? "facility.beforeOpen" : "taki.closed")}
          </span><span>{building.open === building.close ? t("taki.closedDay") : time(building.open) + "–" + time(building.close)}</span></div>
          {onNavigate && <button className={s.route} onClick={() => onNavigate("taki")}>{I.map}{t("taki.route")}<span aria-hidden="true">→</span></button>}
        </div>
        <div className={s.model} ref={modelRef} tabIndex={-1} aria-label={t("taki.floorGuide")}>
          <Model focus={scene} onSpaceSelect={fromModel} />
        </div>
      </section>

      <section className={s.planner} aria-labelledby="taki-search-heading">
        <div className={s.plannerHead}><div>
          <h2 id="taki-search-heading">{t("taki.find")}</h2>
          <p aria-live="polite">{day.cached && day.phase === "open" ? t("taki.countNow", { n: freeCount, all: day.rooms.length })
            : day.phase === "closed" ? t("taki.closedDay") : t("taki.scheduleHours", { hours: time(day.open) + "–" + time(day.close) })}</p>
        </div><DatePicker date={date} today={today} onChange={pickDate} /></div>
        {day.cached && <div className={s.filters}>
          <div className={s.lengths} role="group" aria-label={t("taki.findLength")}>
            {[0, 30, 60, 120].map(n => <button key={n} aria-pressed={duration === n} onClick={() => setDuration(n)}>
              {n ? t("taki.duration", { n }) : t("taki.allLengths")}</button>)}
          </div>
          <select className={s.floorSelect} aria-label={t("taki.floor")} value={floor} onChange={e => setFloor(e.target.value)}>
            <option value="all">{t("taki.allFloors")}</option>
            {floorOptions.map(f => <option key={f} value={f}>{f === "その他" ? t("facility.floorOther") : f}</option>)}
          </select>
        </div>}
        {!result ? <div className={s.blank} role="status">{t("facility.loadingStatus")}</div>
          : result.error ? <div className={s.blank} role="alert">{t(result.error === "401" ? "taki.needsLogin" : "facility.errFetchLine1")}
            <button className={s.textAction} onClick={reload}>{I.reset}{t("facility.retry")}</button></div>
          : !day.cached ? <div className={s.blank} role="status">{I.cal}{t("facility.notCached")}</div>
          : <>
            <div className={s.listCaption}><span>{t("taki.rooms", { n: rooms.length })}</span>
              <span className={s.legend}><i />{t("taki.freeSlots")}<i />{t("taki.reservations")}
                {day.phase === "open" && <span className={s.nowMark}>{t("taki.nowMark", { time: time(day.nowMin) })}</span>}
              </span></div>
            <div className={s.roomList}>
              {rooms.length ? rooms.map(({ room, gap }) => {
                const key = roomKey(room);
                return <RoomRow key={key} room={room} day={day} gap={gap} expanded={selected === key}
                  register={btn => { if (btn) rowRefs.current.set(key, btn); else rowRefs.current.delete(key); }}
                  onToggle={() => {
                    setSelected(selected === key ? null : key);
                    if (selected !== key && room.floor !== "その他") setScene({ floor: room.floor, space: room.name });
                  }} onLocate={() => locate(room)} openLink={openLink} />;
              }) : <div className={s.blank}>{t("taki.noMatches")}<button className={s.textAction}
                onClick={() => { setFloor("all"); setDuration(0); }}>{t("taki.resetFilters")}</button></div>}
            </div>
          </>}
        <div className={s.source}><span>{result?.data?.fetchedAt ? t("facility.asOf", { d: dayLabel(result.data.fetchedAt, { month: "short", day: "numeric" }) }) : t("taki.source")}</span>
          <button onClick={reload} disabled={!result}>{I.reset}{t("facility.refresh")}</button></div>
      </section>
      <footer className={s.footer}><p>{t("taki.note")}</p>
        <div>{[[GUIDE,"facility.linkStudentGuide"],[WEBSITE,"facility.linkOfficial"]].map(([url,key]) =>
          <button key={url} onClick={() => openLink(url)}>{t(key)} <span aria-hidden="true">↗</span></button>)}</div>
      </footer>
    </div>
  </main>;
}
