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

// 蔵書検索の所蔵館フィルタ（topics.libra は理工2館のみ対応）
const LIBS = [
  { id: "ookayama", labelKey: "library.ookayama" },
  { id: "suzukakedai", labelKey: "library.suzukakedai" },
];
// 開館カレンダーの館切替（4キャンパス）。医歯学系は ufinity から今日/明日のみ取得
const HOURS_LIBS = [
  { id: "ookayama", labelKey: "library.ookayama" },
  { id: "suzukakedai", labelKey: "library.suzukakedai" },
  { id: "ochanomizu", labelKey: "library.ochanomizu" },
  { id: "kohnodai", labelKey: "library.kohnodai" },
];
const TMDU_CAL_URL = "https://www01s.ufinity.jp/tmdu_lib/?page_id=16&lang=japanese";
const isTmduCampus = (id) => id === "ochanomizu" || id === "kohnodai";
const campusLabelKey = (id) => (HOURS_LIBS.find((l) => l.id === id)?.labelKey) || "library.ookayama";
const officialCalUrl = (id) => (isTmduCampus(id) ? TMDU_CAL_URL : OFFICIAL_URL);
// 結果ページ上部のスライドトグル（資料種別・単一選択）
const TYPE_TOGGLE = [
  { id: "", labelKey: "library.typeAll" },
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

// 4キャンパスのバッジ（色分け）
const CAMPUS = {
  ookayama: { labelKey: "library.ookayama", color: "#3b82f6" },
  suzukakedai: { labelKey: "library.suzukakedai", color: "#10b981" },
  ochanomizu: { labelKey: "library.ochanomizu", color: "#8b5cf6" },
  kohnodai: { labelKey: "library.kohnodai", color: "#f59e0b" },
};
// topics.libra の所蔵 location 文字列からキャンパスを判定
const campusFromLocation = (loc) => /大岡山/.test(loc || "") ? "ookayama" : /すずかけ/.test(loc || "") ? "suzukakedai" : null;
// 場所から冗長な館名を除いて読みやすく（「大岡山図書館B1F-一般図書」→「B1F・一般図書」）
const cleanLoc = (loc) => {
  if (!loc) return "";
  const s = loc.replace(/^(大岡山|すずかけ台|お茶の水|国府台|御茶ノ水|湯島)図書館/, "").replace(/^[\s\-・:：]+/, "").replace(/-/g, "・");
  return s || loc;
};
// 資料種別の判定（取得済み結果のクライアント側フィルタ用）
const matchesType = (type, tf) => {
  if (!tf) return true;
  const t = type || "";
  if (tf === "Book") return /図書/.test(t) && !/電子/.test(t);
  if (tf === "eBook") return /電子/.test(t);
  if (tf === "Journal") return /雑誌|ジャーナル/.test(t) && !/電子/.test(t);
  return true;
};
const CampusChip = ({ id }) => {
  const c = CAMPUS[id]; if (!c) return null;
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: c.color, padding: "2px 8px", borderRadius: 5 }}>{t(c.labelKey)}</span>;
};

// ── 図書館ホーム：本日の開館時間（hoursSlot）＋ 簡易検索＋詳細検索 ──
const LibrarySearchPanel = ({ mob, openLink, hoursSlot }) => {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [adv, setAdv] = useState(false);
  const [focused, setFocused] = useState(false); // 検索モード（タップで連続モーフ）
  const [formats, setFormats] = useState([]);
  const [locations, setLocations] = useState([]);
  const [jw, setJw] = useState([]);
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  const [records, setRecords] = useState([]);
  const [typeFilter, setTypeFilter] = useState(""); // 資料種別の即時フィルタ（クライアント側）
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  // 医歯学系（お茶の水・国府台）= Puppeteer。ボタンで必要時のみ取得
  const [medRecords, setMedRecords] = useState(null);
  const [medTotal, setMedTotal] = useState(null);
  const [medLoading, setMedLoading] = useState(false);
  const [medError, setMedError] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDq(q), 250); return () => clearTimeout(id); }, [q]);

  const toggle = (arr, setArr, id) => () => setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const activeFilters = formats.length + locations.length + jw.length + (author ? 1 : 0) + (isbn ? 1 : 0) + (yearFrom ? 1 : 0) + (yearTo ? 1 : 0);
  const filterKey = JSON.stringify({ formats, locations, jw, author, isbn, yearFrom, yearTo });
  const hasQuery = dq.trim() || author.trim() || isbn.trim();
  // 検索モード：タップ（フォーカス）or 入力/絞り込みで、ホームを畳んで検索バーだけに
  const searchMode = focused || !!(q.trim() || activeFilters || adv);
  const exitSearch = () => {
    setFocused(false); setQ(""); setDq(""); setAuthor(""); setIsbn("");
    setYearFrom(""); setYearTo(""); setFormats([]); setLocations([]); setJw([]); setAdv(false);
  };

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
    // 検索条件が変わったら医歯学系の結果と種別フィルタはリセット
    setMedRecords(null); setMedError(false); setMedLoading(false); setTypeFilter("");
    if (!hasQuery) { setRecords([]); setTotal(null); setHasMore(false); setSearched(false); return; }
    search(0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, filterKey]);

  // 医歯学系（お茶の水・国府台）をボタンで検索（Puppeteer・時間がかかる）
  const searchMed = useCallback(async () => {
    const term = dq.trim() || author.trim() || isbn.trim();
    if (!term) return;
    setMedLoading(true); setMedError(false);
    try {
      const r = await fetch(`/api/data/book-search-med?q=${encodeURIComponent(dq.trim() || author.trim() || isbn.trim())}`, { credentials: "include" });
      if (!r.ok) { setMedError(true); setMedLoading(false); return; }
      const d = await r.json();
      if (d?.error) { setMedError(true); setMedLoading(false); return; }
      setMedRecords(d.records || []); setMedTotal(d.total ?? null);
    } catch { setMedError(true); }
    setMedLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, author, isbn]);

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
      {/* ホーム（本日の開館時間など）：検索モードで上方向へ連続的に畳む */}
      <div style={{ overflow: "hidden", maxHeight: searchMode ? 0 : 1600, opacity: searchMode ? 0 : 1, transform: searchMode ? "translateY(-6px)" : "none", transition: "max-height .42s cubic-bezier(.4,0,.2,1), opacity .22s ease, transform .42s cubic-bezier(.4,0,.2,1)", pointerEvents: searchMode ? "none" : "auto" }}>
        {hoursSlot}
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.txD, letterSpacing: .4, margin: "20px 0 8px", textTransform: "uppercase" }}>{t("library.tabSearch")}</div>
      </div>

      {/* 検索バー：同一要素のまま sticky で上部へ。図書館は MHdr 配下なので top:0 でノッチに被らない */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: T.bg, paddingTop: searchMode ? 8 : 0, paddingBottom: searchMode ? 10 : 0, transition: "padding .35s cubic-bezier(.4,0,.2,1)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {searchMode && (
            <button onClick={exitSearch} title={t("common.cancel")} style={{ flexShrink: 0, width: 34, height: 44, border: "none", background: "transparent", color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 13, background: T.bg2, border: `1px solid ${searchMode ? T.accent : T.bd}`, boxShadow: "0 1px 3px rgba(0,0,0,.06)", transition: "border-color .2s ease" }}>
            <span style={{ color: searchMode ? T.accent : T.txD, display: "flex" }}>{I.search}</span>
            <input value={q} onFocus={() => setFocused(true)} onChange={(e) => setQ(e.target.value)} placeholder={t("library.searchPlaceholder")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 15 }} />
            {q && <button onClick={() => setQ("")} style={{ border: "none", background: T.bg3, borderRadius: "50%", width: 22, height: 22, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.x}</button>}
          </div>
          <button onClick={() => setAdv((v) => !v)} title={t("library.advanced")} style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center", gap: 6, padding: mob ? "0 13px" : "0 16px", height: 44, borderRadius: 13, border: `1px solid ${adv || activeFilters ? T.accent : T.bd}`, background: adv || activeFilters ? `${T.accent}1f` : T.bg2, color: adv || activeFilters ? T.accent : T.txD, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            {!mob && t("library.advanced")}
            {activeFilters > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 9, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{activeFilters}</span>}
          </button>
        </div>
      </div>

      {adv && (
        <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 13, background: T.bg2, border: `1px solid ${T.bd}`, display: "flex", flexDirection: "column", gap: 13 }}>
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

      {/* 検索結果（検索モードのみ表示） */}
      {searchMode && (error ? (
        <div style={{ textAlign: "center", padding: 36, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>
          {t("library.searchError")}
          <div style={{ marginTop: 14 }}><button onClick={() => openLink(OPAC_URL)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("library.openOpac")} <ExtIcon /></button></div>
        </div>
      ) : (
        <>
          {/* 資料種別スライドトグル（控えめ・即時フィルタ） */}
          <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 12 }}>
            {TYPE_TOGGLE.map((o) => {
              const on = typeFilter === o.id;
              return (
                <button key={o.id || "all"} onClick={() => setTypeFilter(o.id)} style={{ padding: "3px 11px", borderRadius: 6, border: "none", background: on ? `${T.accent}1f` : "transparent", color: on ? T.accent : T.txD, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .12s" }}>{t(o.labelKey)}</button>
              );
            })}
          </div>

          {searched && total != null && <div style={{ fontSize: 12.5, color: T.txD, marginBottom: 10, fontWeight: 600 }}>{t("library.hits", { n: total.toLocaleString() })}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {records.filter((r) => matchesType(r.type, typeFilter)).map((rec) => {
              const h = rec.holdings;
              const stat = (h && h.status) || "";
              const onLoan = /貸出中|不可|館外/.test(stat);
              const inLib = /可/.test(stat) && !/不可/.test(stat);
              const hasHold = !!(h && h.location);
              const stCol = onLoan ? T.orange : inLib ? T.green : T.txD;
              const campus = h && campusFromLocation(h.location);
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
                  {/* 所蔵バー（館・状態・場所・請求記号を整理） */}
                  <div style={{ marginTop: 11, padding: "9px 11px", borderRadius: 9, background: inLib ? `${T.green}14` : onLoan ? `${T.orange}12` : T.bg3, border: `1px solid ${inLib ? `${T.green}33` : onLoan ? `${T.orange}30` : T.bd}` }}>
                    {/* 1段目: 館 + 状態 + 巻号 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {campus && <CampusChip id={campus} />}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: stCol }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: stCol, flexShrink: 0 }} />
                        {hasHold ? (stat || t("library.statusAvailable")) : t("library.statusUnavailable")}
                      </span>
                      {h && h.volume && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.txD, background: T.bg3, borderRadius: 5, padding: "1px 6px" }}>{h.volume}</span>}
                    </div>
                    {/* 2段目: 場所（伸縮・省略） + 請求記号（右・固定幅で見切れ防止） */}
                    {hasHold && (h.location || h.callNumber) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                        {h.location && (
                          <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.tx }}>
                            <span style={{ display: "flex", color: stCol, flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanLoc(h.location)}</span>
                          </span>
                        )}
                        {h.callNumber && <span style={{ flexShrink: 0, fontSize: 11, color: T.txH, fontFamily: "ui-monospace, monospace", background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" }}>{h.callNumber}</span>}
                      </div>
                    )}
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

          {!loading && searched && records.length > 0 && typeFilter && records.filter((r) => matchesType(r.type, typeFilter)).length === 0 && (
            <div style={{ textAlign: "center", padding: 24, color: T.txD, fontSize: 12.5 }}>{t("library.noTypeLoaded")}</div>
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

          {/* ── 医歯学系（お茶の水・国府台）: ボタンで取得 ── */}
          {!loading && searched && hasQuery && (
            <div style={{ marginTop: 22 }}>
              {medRecords == null && !medLoading && (
                <button onClick={searchMed} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 16px", borderRadius: 13, border: `1px dashed ${CAMPUS.ochanomizu.color}`, background: `${CAMPUS.ochanomizu.color}10`, color: CAMPUS.ochanomizu.color, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                  {I.search}{t("library.searchMed")}
                </button>
              )}
              {medLoading && <Spinner label={t("library.medSearching")} />}
              {medError && (
                <div style={{ textAlign: "center", padding: 20, color: T.txD, fontSize: 12.5 }}>
                  {t("library.medError")}
                  <div style={{ marginTop: 10 }}><button onClick={searchMed} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("facility.retry")}</button></div>
                </div>
              )}
              {medRecords != null && !medLoading && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: T.txD, letterSpacing: .4, textTransform: "uppercase" }}>{t("library.medSection")}</span>
                    {medTotal != null && <span style={{ fontSize: 11.5, color: T.txD }}>{t("library.hits", { n: medTotal.toLocaleString() })}</span>}
                  </div>
                  {medRecords.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 24, color: T.txD, fontSize: 13 }}>{t("library.noResults")}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {medRecords.map((rec) => {
                        const h = rec.holdings; // undefined=未取得, null=なし, {campuses,location,callNumber,electronic}
                        const has = h && h.campuses && h.campuses.length;
                        const primary = has ? h.campuses[0] : null;
                        return (
                          <div key={rec.bibid} onClick={() => openLink(rec.detailUrl)} role="button" style={{ borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, padding: 13, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
                            <div style={{ display: "flex", gap: 13 }}>
                              <BookCover rec={rec} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.txH, lineHeight: 1.32, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{rec.title}</div>
                                {rec.author && <div style={{ fontSize: 12, color: T.tx, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.author}</div>}
                                {rec.published && <div style={{ fontSize: 11, color: T.txD, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.published}</div>}
                              </div>
                              <span style={{ display: "flex", color: T.txD, alignSelf: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
                            </div>
                            <div style={{ marginTop: 11, padding: "9px 11px", borderRadius: 9, background: has ? `${CAMPUS[primary].color}12` : T.bg3, border: `1px solid ${has ? `${CAMPUS[primary].color}33` : T.bd}` }}>
                              {has ? (
                                <>
                                  {/* 1段目: 館 + 電子 */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    {h.campuses.map((c) => <CampusChip key={c} id={c} />)}
                                    {h.electronic && <span style={{ fontSize: 11.5, fontWeight: 800, color: CAMPUS.ochanomizu.color }}>{t("library.electronic")}</span>}
                                  </div>
                                  {/* 2段目: 場所（伸縮） + 請求記号（右・固定） */}
                                  {(h.location || h.callNumber) && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                                      {h.location && (
                                        <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.tx }}>
                                          <span style={{ display: "flex", color: CAMPUS[primary].color, flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.location}</span>
                                        </span>
                                      )}
                                      {h.callNumber && <span style={{ flexShrink: 0, fontSize: 11, color: T.txH, fontFamily: "ui-monospace, monospace", background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" }}>{h.callNumber}</span>}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.accent, fontWeight: 700 }}>{t("library.viewDetail")} <ExtIcon sz={10} /></span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: T.txD, opacity: .85, marginTop: 10 }}>{t("library.medNote")}</div>
                </>
              )}
            </div>
          )}
        </>
      ))}
    </div>
  );
};

// 小さなインライン館切替（4キャンパス・折返し可）
const LibSwitch = ({ value, onChange }) => (
  <div style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: 4, padding: 3, borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}` }}>
    {HOURS_LIBS.map((l) => {
      const on = value === l.id;
      return (
        <button key={l.id} onClick={() => onChange(l.id)} style={{ padding: "5px 13px", borderRadius: 999, border: "none", background: on ? T.accent : "transparent", color: on ? "#fff" : T.txD, fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" }}>{t(l.labelKey)}</button>
      );
    })}
  </div>
);

const WD = ["日", "月", "火", "水", "木", "金", "土"];

// 月間カレンダー（7列グリッド・月切替）。ボタンで開くボトムシート。
const CalendarModal = ({ days, todayISO, lib, onClose, openLink }) => {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  // データに存在する月（YYYY-MM）の昇順リスト
  const monthsList = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(), [days]);
  const [mi, setMi] = useState(() => {
    const cur = todayISO.slice(0, 7);
    const i = monthsList.indexOf(cur);
    return i >= 0 ? i : 0;
  });
  const ym = monthsList[mi] || todayISO.slice(0, 7);
  const [yy, mm] = ym.split("-").map(Number);

  // グリッド（日曜始まり）。先頭空白＋1..末日＋末尾空白で7の倍数に
  const cells = useMemo(() => {
    const firstDow = new Date(yy, mm - 1, 1).getDay();
    const dim = new Date(yy, mm, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [yy, mm]);

  const cell = (d) => {
    if (!d) return <div key={Math.random()} style={{ minHeight: 50 }} />;
    const date = `${ym}-${pad(d)}`;
    const rec = byDate.get(date);
    const dow = new Date(yy, mm - 1, d).getDay();
    const isToday = date === todayISO;
    const past = date < todayISO;
    const closed = rec?.closed;
    const numColor = isToday ? "#fff" : dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : T.txH;
    return (
      <div key={date} style={{
        minHeight: 50, borderRadius: 9, padding: "5px 2px 4px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
        background: isToday ? T.accent : closed ? `${T.red}14` : T.bg2,
        border: `1px solid ${isToday ? T.accent : closed ? `${T.red}33` : T.bd}`,
        opacity: past && !isToday ? .55 : 1,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: numColor, lineHeight: 1 }}>{d}</span>
        {!rec ? (
          <span style={{ fontSize: 9, color: T.txD }}>–</span>
        ) : closed ? (
          <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? "#fff" : T.red, marginTop: 3 }}>{t("library.closedDay")}</span>
        ) : (
          <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.25, color: isToday ? "rgba(255,255,255,.95)" : T.txD }}>
            <div>{rec.open}</div>
            <div>{rec.close}</div>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "libCalFade .2s ease" }}>
      <style>{`@keyframes libCalFade{from{opacity:0}to{opacity:1}}@keyframes libCalSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", background: T.bg, borderRadius: "18px 18px 0 0", border: `1px solid ${T.bd}`, display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,.4)", animation: "libCalSheet .3s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ padding: "10px 0 6px", display: "flex", justifyContent: "center" }}><div style={{ width: 38, height: 4, borderRadius: 2, background: T.bd }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 18px 12px", borderBottom: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.txH }}>{t("library.calendar")}</span>
          <span style={{ fontSize: 11.5, color: T.txD, fontWeight: 600 }}>{t(campusLabelKey(lib))}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: "none", background: T.bg3, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
        </div>

        <div style={{ overflowY: "auto", padding: "12px 16px 20px", WebkitOverflowScrolling: "touch" }}>
          {/* 月切替 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 12 }}>
            <button onClick={() => setMi((i) => Math.max(0, i - 1))} disabled={mi <= 0} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: mi <= 0 ? T.bd : T.txH, cursor: mi <= 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.txH, minWidth: 120, textAlign: "center" }}>{t("facility.yearMonth", { year: yy, month: mm })}</span>
            <button onClick={() => setMi((i) => Math.min(monthsList.length - 1, i + 1))} disabled={mi >= monthsList.length - 1} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: mi >= monthsList.length - 1 ? T.bd : T.txH, cursor: mi >= monthsList.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* 曜日見出し */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
            {WD.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : T.txD }}>{w}</div>)}
          </div>
          {/* 日付グリッド */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((d, i) => <div key={i}>{cell(d)}</div>)}
          </div>

          <button onClick={() => openLink(officialCalUrl(lib))} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 16, padding: 0, border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("library.officialLink")} <ExtIcon /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── 開館パネル（理工=本日＋今週＋月間。医歯学系=本日＋明日のみ）─────
const HoursPanel = ({ days, now, todayISO, openLink, lib, setLib, mob, onRefresh }) => {
  const [calOpen, setCalOpen] = useState(false);
  // 理工(大岡山/すずかけ台)=配列、医歯学系(お茶の水/国府台)={today,tomorrow}
  const isTmdu = days && !Array.isArray(days);
  const today = useMemo(
    () => (Array.isArray(days) ? days.find((d) => d.date === todayISO) : (days?.today || null)),
    [days, todayISO],
  );
  const tomorrow = isTmdu ? (days?.tomorrow || null) : null;
  const status = libStatus(today, now);
  const dateLabel = `${now.getMonth() + 1}/${now.getDate()}（${"日月火水木金土"[now.getDay()]}）`;

  // 今日の開館時間内での現在位置（プログレスバー用）
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const prog = today && !today.closed
    ? Math.max(0, Math.min(1, (nowMin - toMin(today.open)) / Math.max(1, toMin(today.close) - toMin(today.open))))
    : null;

  // 今週（月曜始まり）— 理工のみ（医歯学系は日次データなし）
  const week = useMemo(() => {
    if (!Array.isArray(days)) return [];
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

      {/* 理工: 今週 + 月間カレンダー */}
      {!isTmdu && (
        <>
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
          <button onClick={() => setCalOpen(true)} style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 13, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ display: "flex", color: T.accent }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
            {t("library.calendar")}
            <span style={{ marginLeft: "auto", display: "flex", color: T.txD }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
          </button>
        </>
      )}

      {/* 医歯学系: 本日・明日（実データ）＋ 公式の月間カレンダー */}
      {isTmdu && (
        <>
          <div style={{ marginTop: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, overflow: "hidden" }}>
            {[{ k: "library.today", rec: today }, { k: "library.tomorrow", rec: tomorrow }].map((row, i) => (
              <div key={row.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i ? `1px solid ${T.bd}` : "none" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.txD }}>{t(row.k)}</span>
                {row.rec && row.rec.date && <span style={{ fontSize: 11, color: T.txD }}>{Number(row.rec.date.split("-")[1])}/{Number(row.rec.date.split("-")[2])}</span>}
                <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: !row.rec ? T.txD : row.rec.closed ? T.red : T.txH }}>
                  {!row.rec ? "—" : row.rec.closed ? t("library.closedDay") : `${row.rec.open} – ${row.rec.close}`}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => openLink(TMDU_CAL_URL)} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 13, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ display: "flex", color: T.accent }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
            {t("library.openCalendarOfficial")}
            <span style={{ marginLeft: "auto", display: "flex", color: T.txD }}><ExtIcon sz={13} /></span>
          </button>
          <div style={{ fontSize: 10.5, color: T.txD, opacity: .9, marginTop: 8, lineHeight: 1.5 }}>{t("library.medMonthNote")}</div>
        </>
      )}

      {/* 公式リンク */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button onClick={() => openLink(officialCalUrl(lib))} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: 0, border: "none", background: "transparent", color: T.txD, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{t("library.officialLink")} <ExtIcon sz={10} /></button>
      </div>

      {calOpen && !isTmdu && <CalendarModal days={days} todayISO={todayISO} lib={lib} openLink={openLink} onClose={() => setCalOpen(false)} />}
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
