import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { openMaterial } from "../openMaterial.js";

// 附属図書館ページ：開館カレンダー（/api/data/library-hours）＋ 蔵書検索（/api/data/book-search）。

const OFFICIAL_URL = "https://www.libra.titech.ac.jp/calendar";
const OPAC_URL = "https://topics.libra.titech.ac.jp";

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const dowColor = (dow) => (dow === "日" || dow === "祝" ? "#ef4444" : dow === "土" ? "#3b82f6" : T.txH);

// 開館ステータス（FacilityReservationView と同じ4状態）
function libStatus(today, now) {
  if (!today) return { col: T.txD, label: "—", detail: "", dot: T.txD };
  if (today.closed) return { col: T.red, label: t("library.closedDay"), detail: "", dot: T.red };
  const o = toMin(today.open), c = toMin(today.close);
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < o) return { col: T.txD, label: t("facility.beforeOpen"), detail: t("facility.opensAt", { time: today.open }), dot: T.txD };
  if (m >= c) return { col: T.red, label: t("facility.closedToday"), detail: "", dot: T.red };
  const rem = c - m;
  if (rem <= 60) return { col: T.orange, label: t("facility.closingSoon"), detail: t("facility.untilWithRemain", { time: today.close, min: rem }), dot: T.orange };
  return { col: T.green, label: t("facility.openNow"), detail: t("facility.until", { time: today.close }), dot: T.green };
}

const LIBS = [
  { id: "ookayama", labelKey: "library.ookayama" },
  { id: "suzukakedai", labelKey: "library.suzukakedai" },
];
const FORMAT_OPTS = [
  { id: "Book", labelKey: "library.typeBook" },
  { id: "eBook", labelKey: "library.typeEbook" },
  { id: "Journal", labelKey: "library.typeJournal" },
];
const JW_OPTS = [
  { id: "japanese", labelKey: "library.langJapanese" },
  { id: "foreign", labelKey: "library.langForeign" },
];

// ── 小さな共通UI ──────────────────────────────────────────────
const Spinner = ({ label }) => (
  <div style={{ textAlign: "center", padding: 48, color: T.txD, fontSize: 13 }}>
    <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "mnSpin .6s linear infinite", verticalAlign: "middle", marginRight: label ? 10 : 0 }} />
    {label}
  </div>
);

const ExtIcon = ({ sz = 11 }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
);

// ── 蔵書検索：表紙（cover_url → 失敗時はタイトル頭文字のグラデーション）──
const BookCover = ({ rec, w = 54, h = 76 }) => {
  const [err, setErr] = useState(false);
  const base = { width: w, height: h, borderRadius: 7, flexShrink: 0, objectFit: "cover", background: T.bg3, boxShadow: "0 1px 4px rgba(0,0,0,.18)" };
  if (rec.cover && !err) return <img src={rec.cover} alt="" loading="lazy" onError={() => setErr(true)} style={base} />;
  const ch = (rec.title || "?").trim().charAt(0).toUpperCase();
  const hue = ([...(rec.bibid || rec.title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
  return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(150deg, hsl(${hue} 42% 46%), hsl(${(hue + 45) % 360} 42% 34%))`, color: "#fff", fontSize: 22, fontWeight: 800 }}>{ch}</div>
  );
};

// 資料種別バッジの色
const typeColor = (type) => /電子|eBook|eJournal/i.test(type || "") ? "#8b5cf6" : /雑誌|Journal/i.test(type || "") ? "#0ea5e9" : T.accent;

// ── 図書館ホーム：本日の開館時間（hoursSlot）＋ 簡易検索＋詳細検索 ──
const LibrarySearchPanel = ({ mob, openLink, hoursSlot }) => {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [adv, setAdv] = useState(false);
  const [formats, setFormats] = useState([]);
  const [locations, setLocations] = useState([]);
  const [jw, setJw] = useState([]);
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDq(q), 250); return () => clearTimeout(id); }, [q]);

  const toggle = (arr, setArr, id) => () => setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const activeFilters = formats.length + locations.length + jw.length + (author ? 1 : 0) + (isbn ? 1 : 0) + (yearFrom ? 1 : 0) + (yearTo ? 1 : 0);
  const filterKey = JSON.stringify({ formats, locations, jw, author, isbn, yearFrom, yearTo });
  const hasQuery = dq.trim() || author.trim() || isbn.trim();
  // 検索中（=ホームの開館時間を隠して結果に集中する）か
  const searchActive = !!(q.trim() || dq.trim() || author.trim() || isbn.trim() || activeFilters || adv);

  const buildParams = (pg) => {
    const sp = new URLSearchParams();
    if (dq.trim()) sp.set("q", dq.trim());
    if (author.trim()) sp.set("author", author.trim());
    if (isbn.trim()) sp.set("isbn", isbn.trim());
    if (yearFrom.trim()) sp.set("yearFrom", yearFrom.trim());
    if (yearTo.trim()) sp.set("yearTo", yearTo.trim());
    if (formats.length) sp.set("formats", formats.join(","));
    if (locations.length) sp.set("locations", locations.join(","));
    if (jw.length) sp.set("japaneseWestern", jw.join(","));
    sp.set("page", String(pg));
    sp.set("rows", "20");
    return sp;
  };

  const search = useCallback(async (pg, append) => {
    setLoading(true); setError(false); setSearched(true);
    try {
      const r = await fetch(`/api/data/book-search?${buildParams(pg)}`, { credentials: "include" });
      if (!r.ok) { setError(true); setLoading(false); return; }
      const d = await r.json();
      if (d?.error) { setError(true); setLoading(false); return; }
      setRecords((prev) => (append ? [...prev, ...(d.records || [])] : d.records || []));
      setTotal(d.total ?? null);
      setHasMore(!!d.hasMore);
      setPage(d.page ?? pg);
    } catch { setError(true); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, filterKey]);

  useEffect(() => {
    if (!hasQuery) { setRecords([]); setTotal(null); setHasMore(false); setSearched(false); return; }
    search(0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, filterKey]);

  const advField = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 12.5, outline: "none" };
  const Pill = ({ on, onClick, children }) => (
    <button onClick={onClick} style={{ padding: "6px 13px", borderRadius: 20, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}1f` : T.bg2, color: on ? T.accent : T.txD, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .12s" }}>{children}</button>
  );
  const FilterGroup = ({ label, children }) => (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.txD, letterSpacing: .4, marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>
    </div>
  );

  return (
    <div>
      {/* 検索していない時はホーム（本日の開館時間など）を表示 */}
      {!searchActive && hoursSlot}
      {!searchActive && <div style={{ fontSize: 10.5, fontWeight: 800, color: T.txD, letterSpacing: .4, margin: "20px 0 8px", textTransform: "uppercase" }}>{t("library.tabSearch")}</div>}

      {/* 簡易検索欄 ＋ 詳細検索ボタン */}
      <div style={{ display: "flex", gap: 8, marginBottom: adv ? 12 : (searchActive ? 14 : 4) }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 13, background: T.bg2, border: `1px solid ${T.bd}`, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
          <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.searchPlaceholder")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 15 }} />
          {q && <button onClick={() => setQ("")} style={{ border: "none", background: T.bg3, borderRadius: "50%", width: 22, height: 22, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.x}</button>}
        </div>
        <button onClick={() => setAdv((v) => !v)} title={t("library.advanced")} style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center", gap: 6, padding: mob ? "0 13px" : "0 16px", borderRadius: 13, border: `1px solid ${adv || activeFilters ? T.accent : T.bd}`, background: adv || activeFilters ? `${T.accent}1f` : T.bg2, color: adv || activeFilters ? T.accent : T.txD, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          {!mob && t("library.advanced")}
          {activeFilters > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 9, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{activeFilters}</span>}
        </button>
      </div>

      {adv && (
        <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 13, background: T.bg2, border: `1px solid ${T.bd}`, display: "flex", flexDirection: "column", gap: 13 }}>
          <FilterGroup label={t("library.filterType")}>{FORMAT_OPTS.map((o) => <Pill key={o.id} on={formats.includes(o.id)} onClick={toggle(formats, setFormats, o.id)}>{t(o.labelKey)}</Pill>)}</FilterGroup>
          <FilterGroup label={t("library.filterLib")}>{LIBS.map((o) => <Pill key={o.id} on={locations.includes(o.id)} onClick={toggle(locations, setLocations, o.id)}>{t(o.labelKey)}</Pill>)}</FilterGroup>
          <FilterGroup label={t("library.filterLang")}>{JW_OPTS.map((o) => <Pill key={o.id} on={jw.includes(o.id)} onClick={toggle(jw, setJw, o.id)}>{t(o.labelKey)}</Pill>)}</FilterGroup>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t("library.filterAuthor")} style={{ ...advField, flex: "1 1 140px" }} />
            <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder={t("library.filterIsbn")} style={{ ...advField, flex: "1 1 140px" }} />
            <input value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder={t("library.filterYearFrom")} inputMode="numeric" style={{ ...advField, flex: "1 1 90px" }} />
            <input value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder={t("library.filterYearTo")} inputMode="numeric" style={{ ...advField, flex: "1 1 90px" }} />
          </div>
        </div>
      )}

      {/* 検索結果（検索中のみ表示） */}
      {searchActive && (error ? (
        <div style={{ textAlign: "center", padding: 36, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>
          {t("library.searchError")}
          <div style={{ marginTop: 14 }}><button onClick={() => openLink(OPAC_URL)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("library.openOpac")} <ExtIcon /></button></div>
        </div>
      ) : (
        <>
          {searched && total != null && <div style={{ fontSize: 12.5, color: T.txD, marginBottom: 10, fontWeight: 600 }}>{t("library.hits", { n: total.toLocaleString() })}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {records.map((rec) => {
              const h = rec.holdings;
              const avail = h && h.status;
              const tc = typeColor(rec.type);
              return (
                <div key={rec.bibid} onClick={() => openLink(rec.detailUrl)} role="button" style={{ borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, padding: 13, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.05)", transition: "border-color .12s" }}>
                  <div style={{ display: "flex", gap: 13 }}>
                    <BookCover rec={rec} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, color: tc, background: `${tc}1a`, padding: "2px 8px", borderRadius: 5, marginBottom: 4 }}>{rec.type || "—"}</span>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.txH, lineHeight: 1.32, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{rec.title}</div>
                      {rec.author && <div style={{ fontSize: 12, color: T.tx, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.author}</div>}
                      {rec.published && <div style={{ fontSize: 11, color: T.txD, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.published}</div>}
                    </div>
                    <span style={{ display: "flex", color: T.txD, alignSelf: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
                  </div>
                  {/* 所蔵バー */}
                  <div style={{ marginTop: 11, padding: "8px 11px", borderRadius: 9, background: avail ? `${T.green}14` : T.bg3, border: `1px solid ${avail ? `${T.green}33` : T.bd}`, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "3px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: avail ? T.green : T.txD }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: avail ? T.green : T.txD, flexShrink: 0 }} />
                      {avail ? h.status : t("library.statusUnavailable")}
                    </span>
                    {h && h.location && <span style={{ fontSize: 11.5, color: T.tx }}>{h.location}</span>}
                    {h && h.callNumber && <span style={{ fontSize: 11, color: T.txD, fontFamily: "ui-monospace, monospace", marginLeft: "auto" }}>{h.callNumber}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {loading && <Spinner label={t("library.searching")} />}

          {!loading && searched && records.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: T.txD }}>
              <div style={{ fontSize: 30, marginBottom: 8, opacity: .5 }}>🔍</div>
              <div style={{ fontSize: 13 }}>{t("library.noResults")}</div>
            </div>
          )}

          {!loading && !searched && (
            <div style={{ textAlign: "center", padding: 44, color: T.txD }}>
              <div style={{ opacity: .35, display: "flex", justifyContent: "center", marginBottom: 10 }}>{I.book}</div>
              <div style={{ fontSize: 13 }}>{t("library.searchPlaceholder")}</div>
            </div>
          )}

          {!loading && hasMore && records.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={() => search(page + 1, true)} style={{ padding: "10px 28px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("library.loadMore")}</button>
            </div>
          )}
        </>
      ))}
    </div>
  );
};

// 小さなインライン館切替
const LibSwitch = ({ value, onChange }) => (
  <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 999, background: T.bg2, border: `1px solid ${T.bd}` }}>
    {LIBS.map((l) => {
      const on = value === l.id;
      return (
        <button key={l.id} onClick={() => onChange(l.id)} style={{ padding: "5px 14px", borderRadius: 999, border: "none", background: on ? T.accent : "transparent", color: on ? "#fff" : T.txD, fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>{t(l.labelKey)}</button>
      );
    })}
  </div>
);

// 月間カレンダーモーダル（ボタンで開く）
const CalendarModal = ({ days, todayISO, lib, onClose, openLink }) => {
  const [openMonths, setOpenMonths] = useState({});
  const upcomingClosures = useMemo(() => days.filter((d) => d.date >= todayISO && d.closed).slice(0, 8), [days, todayISO]);
  const months = useMemo(() => {
    const fwd = days.filter((d) => d.date >= todayISO);
    const map = new Map();
    for (const d of fwd) { const key = d.date.slice(0, 7); if (!map.has(key)) map.set(key, []); map.get(key).push(d); }
    return [...map.entries()].map(([ym, list]) => { const [y, m] = ym.split("-"); return { ym, label: t("facility.yearMonth", { year: Number(y), month: Number(m) }), list }; });
  }, [days, todayISO]);
  const isOpen = (ym, idx) => (ym in openMonths ? openMonths[ym] : idx === 0);

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", background: T.bg, borderRadius: "18px 18px 0 0", border: `1px solid ${T.bd}`, display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,.4)" }}>
        {/* ハンドル＋ヘッダ */}
        <div style={{ padding: "10px 0 6px", display: "flex", justifyContent: "center" }}><div style={{ width: 38, height: 4, borderRadius: 2, background: T.bd }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 18px 12px", borderBottom: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.txH }}>{t("library.calendar")}</span>
          <span style={{ fontSize: 11.5, color: T.txD, fontWeight: 600 }}>{t(lib === "ookayama" ? "library.ookayama" : "library.suzukakedai")}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: "none", background: T.bg3, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 18px 22px", WebkitOverflowScrolling: "touch" }}>
          {upcomingClosures.length > 0 && (
            <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 12, background: `${T.red}10`, border: `1px solid ${T.red}30` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: T.red, letterSpacing: .4, marginBottom: 7, textTransform: "uppercase" }}>{t("library.notices")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {upcomingClosures.map((d) => { const [, m, day] = d.date.split("-"); return (
                  <span key={d.date} style={{ fontSize: 12, fontWeight: 700, color: T.red, background: T.bg2, border: `1px solid ${T.red}40`, borderRadius: 7, padding: "4px 9px" }}>{Number(m)}/{Number(day)}（{d.dow}）</span>
                ); })}
              </div>
            </div>
          )}

          {months.map((mo, idx) => {
            const open = isOpen(mo.ym, idx);
            return (
              <div key={mo.ym} style={{ marginBottom: 8, borderRadius: 12, border: `1px solid ${T.bd}`, overflow: "hidden", background: T.bg2 }}>
                <button onClick={() => setOpenMonths((s) => ({ ...s, [mo.ym]: !open }))} style={{ width: "100%", display: "flex", alignItems: "center", padding: "11px 14px", border: "none", background: "transparent", color: T.txH, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
                  {mo.label}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: T.txD, fontWeight: 600, marginRight: 8 }}>{mo.list.length}{t("library.daysSuffix")}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {open && (
                  <div style={{ padding: "0 14px 6px" }}>
                    {mo.list.map((d) => {
                      const isToday = d.date === todayISO;
                      const day = Number(d.date.split("-")[2]);
                      return (
                        <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderTop: `1px solid ${T.bd}`, borderRadius: isToday ? 8 : 0, background: isToday ? `${T.accent}14` : "transparent" }}>
                          <span style={{ width: 22, textAlign: "right", fontSize: 14, fontWeight: 700, color: dowColor(d.dow) }}>{day}</span>
                          <span style={{ width: 16, fontSize: 12, color: dowColor(d.dow) }}>{d.dow}</span>
                          {isToday && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 5, padding: "1px 6px" }}>{t("facility.todayPrefix")}</span>}
                          {d.closed ? (
                            <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: T.red, padding: "2px 9px", borderRadius: 6, background: `${T.red}1a` }}>{t("library.closedDay")}</span>
                          ) : (
                            <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: T.txH }}>{d.open} – {d.close}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={() => openLink(OFFICIAL_URL)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: 0, border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("library.officialLink")} <ExtIcon /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── 開館パネル（既定は本日＋今週。月間はモーダル）───────────────
const HoursPanel = ({ days, now, todayISO, openLink, lib, setLib, mob, onRefresh }) => {
  const [calOpen, setCalOpen] = useState(false);
  const today = useMemo(() => days.find((d) => d.date === todayISO), [days, todayISO]);
  const status = libStatus(today, now);
  const dateLabel = `${now.getMonth() + 1}/${now.getDate()}（${"日月火水木金土"[now.getDay()]}）`;

  // 今日の開館時間内での現在位置（プログレスバー用）
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const prog = today && !today.closed
    ? Math.max(0, Math.min(1, (nowMin - toMin(today.open)) / Math.max(1, toMin(today.close) - toMin(today.open))))
    : null;

  // 今週（月曜始まり）
  const week = useMemo(() => {
    const base = new Date(now); base.setHours(0, 0, 0, 0);
    const offset = (base.getDay() + 6) % 7;
    const mon = new Date(base); mon.setDate(base.getDate() - offset);
    const byDate = new Map(days.map((d) => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const iso = toISO(d);
      return { iso, dow: "日月火水木金土"[d.getDay()], day: d.getDate(), rec: byDate.get(iso) || null };
    });
  }, [days, now]);

  return (
    <div>
      {/* 館切替（小）＋ モバイル用リフレッシュ */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: 1 }} />
        <LibSwitch value={lib} onChange={setLib} />
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          {mob && (
            <button onClick={onRefresh} title={t("facility.refresh")} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* 本日のステータス（コンパクト） */}
      <div style={{ borderRadius: 14, border: `1px solid ${status.col}4d`, background: `linear-gradient(135deg, ${status.col}22, ${status.col}0a)`, padding: "13px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: status.dot, boxShadow: `0 0 0 3px ${status.dot}33` }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: status.col }}>{status.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: T.txD, fontWeight: 700 }}>{dateLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {today && !today.closed ? (
            <span style={{ fontSize: 25, fontWeight: 800, color: T.txH, lineHeight: 1, letterSpacing: .3 }}>{today.open}<span style={{ fontSize: 16, color: T.txD, margin: "0 3px" }}>–</span>{today.close}</span>
          ) : (
            <span style={{ fontSize: 22, fontWeight: 800, color: T.red, lineHeight: 1 }}>{t("library.closedDay")}</span>
          )}
          {status.detail && <span style={{ fontSize: 12, color: status.col, fontWeight: 700 }}>{status.detail}</span>}
        </div>

        {/* 開館時間バー（今どこ） */}
        {prog != null && (
          <div style={{ position: "relative", height: 4, borderRadius: 2, background: `${status.col}26`, marginTop: 11 }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, borderRadius: 2, background: status.col }} />
            <div style={{ position: "absolute", left: `calc(${Math.max(2, Math.min(98, prog * 100))}% - 5px)`, top: -3, width: 10, height: 10, borderRadius: "50%", background: "#fff", border: `2.5px solid ${status.col}`, boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
          </div>
        )}
      </div>

      {/* 今週 */}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {week.map((w) => {
          const isToday = w.iso === todayISO;
          const closed = w.rec?.closed;
          return (
            <div key={w.iso} style={{ flex: 1, textAlign: "center", padding: "9px 2px", borderRadius: 12, background: isToday ? T.accent : T.bg2, border: `1px solid ${isToday ? T.accent : T.bd}`, boxShadow: isToday ? `0 2px 8px ${T.accent}44` : "none" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: isToday ? "rgba(255,255,255,.92)" : dowColor(w.dow) }}>{w.dow}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#fff" : T.txH, margin: "2px 0 4px" }}>{w.day}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, lineHeight: 1.15, color: isToday ? "rgba(255,255,255,.92)" : closed ? T.red : T.txD }}>
                {w.rec ? (closed ? t("library.closedDay") : w.rec.close) : "–"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 月間カレンダーを開く */}
      <button onClick={() => setCalOpen(true)} style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 13, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        <span style={{ display: "flex", color: T.accent }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
        {t("library.calendar")}
        <span style={{ marginLeft: "auto", display: "flex", color: T.txD }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
      </button>

      {/* 公式リンク */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button onClick={() => openLink(OFFICIAL_URL)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: 0, border: "none", background: "transparent", color: T.txD, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{t("library.officialLink")} <ExtIcon sz={10} /></button>
      </div>

      {calOpen && <CalendarModal days={days} todayISO={todayISO} lib={lib} openLink={openLink} onClose={() => setCalOpen(false)} />}
    </div>
  );
};

// ── ルート ────────────────────────────────────────────────────
export const LibraryView = ({ mob }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lib, setLib] = useState("ookayama");

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const r = await fetch("/api/data/library-hours", { credentials: "include" });
      if (!r.ok) { setError(true); setLoading(false); return; }
      const d = await r.json();
      if (d?.error) { setError(true); setLoading(false); return; }
      setData(d);
    } catch { setError(true); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const todayISO = toISO(now);
  const days = data?.[lib] || [];

  const openLink = (url) => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });

  const Header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, background: `linear-gradient(145deg, ${T.accent}, ${T.accent}aa)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: `0 2px 8px ${T.accent}44`, flexShrink: 0 }}>{I.book}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: mob ? 19 : 21, fontWeight: 800, color: T.txH, lineHeight: 1.1 }}>{t("nav.library")}</div>
        <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{t("library.subtitle")}</div>
      </div>
      <button onClick={load} title={t("facility.refresh")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, cursor: "pointer", flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
      </button>
    </div>
  );

  const wrap = (children) => (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ padding: mob ? "16px 14px 48px" : "24px 28px 56px", maxWidth: 760, margin: "0 auto", boxSizing: "border-box" }}>
        {!mob && Header}
        {children}
      </div>
    </div>
  );

  // ホーム上部：本日の開館時間（ロード中/失敗時はそれぞれ表示）
  const hoursSlot = (loading && !data) ? <Spinner /> : error ? (
    <div style={{ textAlign: "center", padding: 30, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>
      {t("library.fetchError")}
      <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={load} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("facility.retry")}</button>
        <button onClick={() => openLink(OFFICIAL_URL)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 20px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("library.officialLink")} <ExtIcon /></button>
      </div>
    </div>
  ) : (
    <HoursPanel days={days} now={now} todayISO={todayISO} openLink={openLink} lib={lib} setLib={setLib} mob={mob} onRefresh={load} />
  );

  return wrap(<LibrarySearchPanel mob={mob} openLink={openLink} hoursSlot={hoursSlot} />);
};
