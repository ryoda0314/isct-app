import { useState, useEffect, useCallback, useRef } from "react";
import { T } from "../theme.js";
import { t, getLang } from "../i18n.js";
import { I } from "../icons.jsx";
import { useTrainRoutes } from "../hooks/useTrainRoutes.js";

const fmtUntil = (min) => min <= 0 ? t("train.soon") : t("train.inMin", { n: min });

// 種別→色（速い種別ほど暖色で目立たせる）
function typeColor(title) {
  if (!title) return T.txD;
  if (title.includes("特急")) return T.red;
  if (title.includes("急")) return T.orange; // 急行 / 通勤急行
  return T.txD;                              // 各停
}

const TypePill = ({ title }) => {
  const c = typeColor(title);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, color: c, background: `${c}1a`, border: `1px solid ${c}33`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap", flexShrink: 0 }}>
      {title || "—"}
    </span>
  );
};

const pad2 = (n) => String(n).padStart(2, "0");

// 秒境界に同期したリアルタイム時計（setInterval のドリフトによる秒飛び/カクつきを防ぐ）
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const tick = () => { setNow(new Date()); id = setTimeout(tick, 1000 - (Date.now() % 1000)); };
    id = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(id);
  }, []);
  return now;
}

// 取得時点で各電車の絶対発車時刻(ms)を確定する。
// 終電後(翌0〜時台)の列車だけ翌日扱いにしたいので、しきい値は十分大きく取る(4h)。
// ※ ちょうど発車する列車(HH:MM:00 を数十秒過ぎても取得時点では「あと0分」で含まれる)を
//   誤って翌日にしないため。小さいしきい値だと "あと1439:15" の暴発になる。
function withTargets(trains, baseMs) {
  return (trains || []).map((d) => {
    const [h, m] = d.time.split(":").map(Number);
    const tg = new Date(baseMs); tg.setHours(h, m, 0, 0);
    let ms = tg.getTime();
    if (ms < baseMs - 4 * 60 * 60 * 1000) ms += 86400000;
    return { ...d, targetMs: ms };
  });
}

const Meta = ({ d }) => (
  <span style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
    {d.time}
    {d.requiredMin != null ? ` ・ ${t("train.takesMin", { n: d.requiredMin })}` : ""}
    {d.destination ? ` ・ ${t("train.bound", { dest: d.destination })}` : ""}
  </span>
);

// ── 1 ルート(出発→目的地)のカード。目的地に停車する直近の電車を表示 ──
function RouteCard({ route, now, onRemove, onToggleHome, onSetFilter, variant = "full", onOpen }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | unavailable | error
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ origin: route.origin_station, dest: route.dest_station, lang: getLang() });
    if (route.type_filter && route.type_filter.length) qs.set("types", route.type_filter.join(","));
    try {
      const r = await fetch(`/api/train/departures?${qs.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setState("error"); return; }
      if (!j.available) { setState("unavailable"); return; }
      setData({ finished: !!j.finished, availableTypes: j.availableTypes || [], trains: withTargets(j.trains, Date.now()) });
      setState("ok");
    } catch { setState("error"); }
  }, [route.origin_station, route.dest_station, route.type_filter]);

  useEffect(() => { load(); const id = setInterval(load, 30 * 1000); return () => clearInterval(id); }, [load]);

  const nowMs = now.getTime();
  const countdown = (targetMs) => Math.max(0, Math.floor((targetMs - nowMs) / 1000)); // 残り秒
  // 登録された種別フィルタ（null/空 = 全種別表示）。絞り込み自体はサーバー側で実施済み。
  // ここでは funnel の点灯／フィルタパネルの選択状態にのみ使う。
  const tf = route.type_filter && route.type_filter.length ? new Set(route.type_filter) : null;
  const availableTypes = (state === "ok" && data ? data.availableTypes : []) || [];
  // 発車20秒後までは「まもなく」で残し、その後ドロップ（出払ったら下のeffectで補充）
  const visible = (state === "ok" && data ? data.trains : []).filter((d) => d.targetMs - nowMs > -20000);
  const hero = visible[0];

  // 表示中が出払ったら補充取得。finished（=対象種別が本日もう無い）なら再取得しない（ループ防止）。
  useEffect(() => {
    if (state === "ok" && data && !data.finished && visible.length === 0) load();
  }, [visible.length, state, data, load]);

  const labelParts = (route.label || route.dest_station || "").split("→").map((s) => s.trim());

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
      {/* ヘッダー: 出発 → 目的地 */}
      <div onClick={variant === "home" ? onOpen : undefined}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${T.bd}`, cursor: variant === "home" ? "pointer" : "default" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${T.accent}1a`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.train}</div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: T.txH, fontSize: 15, overflow: "hidden", whiteSpace: "nowrap" }}>
          {labelParts.length === 2
            ? <>{labelParts[0]}<span style={{ color: T.txD, display: "flex" }}>{I.arr}</span><span style={{ color: T.accent }}>{labelParts[1]}</span></>
            : (route.label || route.dest_station)}
        </div>
        {variant === "full" ? <>
          {availableTypes.length > 1 && (
            <button onClick={() => setFilterOpen((o) => !o)} title={t("train.filter")}
              style={{ width: 26, height: 26, borderRadius: "50%", background: (tf || filterOpen) ? `${T.accent}1a` : T.bg3, border: "none", color: (tf || filterOpen) ? T.accent : T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.filter}</button>
          )}
          <button onClick={() => onToggleHome(route.id, !route.on_home)} title={route.on_home ? t("train.removeHome") : t("train.addHome")}
            style={{ width: 26, height: 26, borderRadius: "50%", background: route.on_home ? `${T.accent}1a` : T.bg3, border: "none", color: route.on_home ? T.accent : T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.home}</button>
          <button onClick={() => onRemove(route.id)} title={t("train.remove")}
            style={{ width: 26, height: 26, borderRadius: "50%", background: T.bg3, border: "none", color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.x}</button>
        </> : <span style={{ color: T.txD, display: "flex", flexShrink: 0 }}>{I.arr}</span>}
      </div>

      <div style={{ padding: "4px 14px 12px" }}>
        {/* 種別フィルタ */}
        {filterOpen && variant === "full" && availableTypes.length > 1 && (
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.bd}`, marginBottom: 4 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.txD, letterSpacing: .4, marginBottom: 7 }}>{t("train.filterHeading")}</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {availableTypes.map((ty) => {
                const on = tf ? tf.has(ty.id) : true;
                return (
                  <button key={ty.id} onClick={() => {
                    const allIds = availableTypes.map((a) => a.id);
                    const sel = new Set(tf ? allIds.filter((x) => tf.has(x)) : allIds);
                    if (sel.has(ty.id)) sel.delete(ty.id); else sel.add(ty.id);
                    let next = allIds.filter((x) => sel.has(x));
                    if (next.length === 0 || next.length === allIds.length) next = []; // 全て/ゼロ = 絞り込み解除
                    onSetFilter(route.id, next);
                  }}
                    style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}1a` : T.bg3, color: on ? T.accent : T.txD, fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                    {ty.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {state === "loading" && <div style={{ color: T.txD, fontSize: 13, padding: "10px 0" }}>{t("train.loading")}</div>}
        {state === "error" && <div style={{ color: T.red, fontSize: 12.5, padding: "10px 0" }}>{t("train.fetchError")}</div>}
        {state === "unavailable" && <div style={{ color: T.txD, fontSize: 12.5, padding: "10px 0" }}>{t("train.noOpenData")}</div>}
        {state === "ok" && !hero &&
          <div style={{ color: T.txD, fontSize: 13, padding: "10px 0" }}>
            {data?.finished ? (tf ? t("train.noMoreFilteredToday") : t("train.serviceEnded"))
              : t("train.loading")}
          </div>}

        {/* 次発（ヒーロー） */}
        {hero && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 10px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
            <TypePill title={hero.trainTypeTitle} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {(() => {
                const s = countdown(hero.targetMs);
                if (s <= 0) return <div style={{ fontSize: 26, fontWeight: 800, color: T.green, lineHeight: 1.05, letterSpacing: -.5 }}>{t("train.soon")}</div>;
                return (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>{t("train.untilLabel")}</span>
                    <span style={{ fontSize: 30, fontWeight: 800, color: T.txH, lineHeight: 1, letterSpacing: -.5, fontVariantNumeric: "tabular-nums" }}>{Math.floor(s / 60)}:{pad2(s % 60)}</span>
                  </div>
                );
              })()}
              <div style={{ marginTop: 4 }}><Meta d={hero} /></div>
            </div>
          </div>
        )}

        {/* 以降の発車 */}
        {(variant === "home" ? visible.slice(1, 2) : visible.slice(1)).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${T.bd}` }}>
            <span style={{ width: 7, flexShrink: 0 }} />
            <TypePill title={d.trainTypeTitle} />
            <span style={{ fontSize: 15, fontWeight: 700, color: T.txH, minWidth: 64 }}>{fmtUntil(Math.floor(countdown(d.targetMs) / 60))}</span>
            <Meta d={d} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 目的地を検索して登録するモーダル ──
function AddModal({ onClose, onSave }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState(null);
  const debRef = useRef(null);

  const doSearch = useCallback(async (query) => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    setSearching(true); setErr(null);
    try {
      const r = await fetch(`/api/train/search?q=${encodeURIComponent(term)}&lang=${getLang()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr("error"); setResults([]); }
      else setResults(j.results || []);
    } catch { setErr("error"); setResults([]); }
    setSearching(false);
  }, []);

  const onChange = (v) => {
    setQ(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => doSearch(v), 350);
  };

  const pick = (r) => {
    onSave({
      origin_station: r.origin,
      dest_station: r.dest,
      label: `${r.originTitle} → ${r.destTitle}`,
    });
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 998 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(440px,92vw)", maxHeight: "86vh", overflowY: "auto", background: T.bg2, border: `1px solid ${T.bdL}`, borderRadius: 16, padding: 18, zIndex: 999, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: T.txH, fontSize: 16 }}>{t("train.addTitle")}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        <p style={{ color: T.txD, fontSize: 12, margin: "0 0 12px" }}>{t("train.addHint")}</p>

        <input autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder={t("train.searchPlaceholder")}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none" }} />

        {searching && <div style={{ color: T.txD, fontSize: 12.5, marginTop: 8 }}>{t("train.searching")}</div>}
        {err === "error" && <div style={{ color: T.red, fontSize: 12.5, marginTop: 8 }}>{t("train.fetchError")}</div>}
        {!searching && !err && q.trim() && results.length === 0 && <div style={{ color: T.txD, fontSize: 12.5, marginTop: 8 }}>{t("train.noResults")}</div>}

        {results.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => pick(r)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, cursor: "pointer" }}>
                <div style={{ color: T.txH, fontWeight: 600, fontSize: 14 }}>{r.destTitle}</div>
                <div style={{ color: T.txD, fontSize: 12 }}>{t("train.fromOrigin", { origin: r.originTitle })}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ホーム画面用ウィジェット: on_home のルートだけをコンパクト表示
export function HomeTrainWidget({ setView }) {
  const { routes } = useTrainRoutes(true);
  const now = useNow();
  const pinned = routes.filter((r) => r.on_home);
  if (!pinned.length) return null;
  return (
    <div style={{ padding: "0 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 2px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.txH, fontWeight: 700, fontSize: 13 }}>
          <span style={{ color: T.accent, display: "flex" }}>{I.train}</span>{t("nav.train")}
        </div>
        <button onClick={() => setView("train")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("train.seeAll")}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pinned.map((r) => <RouteCard key={r.id} route={r} now={now} variant="home" onOpen={() => setView("train")} />)}
      </div>
    </div>
  );
}

export const TrainView = ({ mob }) => {
  const { routes, loading, addRoute, removeRoute, toggleHome, setFilter } = useTrainRoutes(true);
  const [adding, setAdding] = useState(false);
  const now = useNow();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? 14 : 24, maxWidth: 720, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ color: T.txH, fontSize: 20, fontWeight: 800, margin: 0 }}>{t("nav.train")}</h2>
        <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {I.plus}<span>{t("train.add")}</span>
        </button>
      </div>
      <p style={{ color: T.txD, fontSize: 12.5, margin: "6px 0 18px" }}>{t("train.subtitle")}</p>

      {loading && routes.length === 0 && <div style={{ color: T.txD, fontSize: 13 }}>{t("train.loading")}</div>}

      {!loading && routes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px", color: T.txD }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: .5 }}>{I.train}</div>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{t("train.emptyTitle")}</div>
          <div style={{ fontSize: 12.5 }}>{t("train.emptyHint")}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {routes.map((r) => <RouteCard key={r.id} route={r} now={now} onRemove={removeRoute} onToggleHome={toggleHome} onSetFilter={setFilter} />)}
        </div>
      )}

      <div style={{ marginTop: 24, color: T.txD, fontSize: 10.5, textAlign: "center" }}>{t("train.credit")}</div>

      {adding && <AddModal onClose={() => setAdding(false)} onSave={(route) => { addRoute(route); setAdding(false); }} />}
    </div>
  );
};
