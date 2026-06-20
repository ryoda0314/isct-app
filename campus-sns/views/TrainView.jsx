import { useState, useEffect, useCallback, useRef } from "react";
import { T } from "../theme.js";
import { t, getLang } from "../i18n.js";
import { I } from "../icons.jsx";
import { useTrainRoutes } from "../hooks/useTrainRoutes.js";

// 「あと◯分」表記
const fmtUntil = (min) => min <= 0 ? t("train.soon") : t("train.inMin", { n: min });

// ── 1 ルートのカード（自前で発車を取得し1分ごとに再計算） ──
function RouteCard({ route, onRemove }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | unavailable | error | keymissing
  const [, force] = useState(0);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      railway: route.railway, station: route.station, direction: route.direction, lang: getLang(),
    });
    if (route.train_type) qs.set("type", route.train_type);
    try {
      const r = await fetch(`/api/train/departures?${qs.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (r.status === 503 || j.reason === "odpt_key_missing") { setState("keymissing"); return; }
      if (!r.ok) { setState("error"); return; }
      if (!j.available) { setState("unavailable"); return; }
      setData(j); setState("ok");
    } catch { setState("error"); }
  }, [route.railway, route.station, route.direction, route.train_type]);

  // 取得は10分ごと再取得、表示の残り分は1分ごとに再描画
  useEffect(() => { load(); const id = setInterval(load, 10 * 60 * 1000); return () => clearInterval(id); }, [load]);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 60 * 1000); return () => clearInterval(id); }, []);

  const titleLine = route.label || route.station;

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 14, padding: 14, position: "relative" }}>
      <button onClick={() => onRemove(route.id)} title={t("train.remove")}
        style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingRight: 24 }}>
        <span style={{ color: T.accent, display: "flex" }}>{I.train}</span>
        <span style={{ fontWeight: 700, color: T.txH, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleLine}</span>
      </div>

      {state === "loading" && <div style={{ color: T.txD, fontSize: 13 }}>{t("train.loading")}</div>}
      {state === "keymissing" && <div style={{ color: T.orange, fontSize: 12.5 }}>{t("train.keyMissing")}</div>}
      {state === "error" && <div style={{ color: T.red, fontSize: 12.5 }}>{t("train.fetchError")}</div>}
      {state === "unavailable" && <div style={{ color: T.txD, fontSize: 12.5 }}>{t("train.noOpenData")}</div>}

      {state === "ok" && data && (
        data.finished || (data.main.length === 0 && data.supplement.length === 0)
          ? <div style={{ color: T.txD, fontSize: 13 }}>{t("train.serviceEnded")}</div>
          : <>
            {/* 主種別（登録した種別）の直近2本 */}
            {data.main.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.main.map((d, i) => <DepRow key={i} d={d} primary={i === 0} typeTitle={data.registeredTypeTitle} />)}
              </div>
            ) : (
              data.registeredType && <div style={{ color: T.txD, fontSize: 12.5 }}>{t("train.noMoreOfType", { type: data.registeredTypeTitle })}</div>
            )}

            {/* 補足: 種別問わず直近（主種別と重複する先頭は除く） */}
            {data.supplement.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.bd}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: .4, marginBottom: 6 }}>{t("train.othersHeading")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {data.supplement.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: T.tx }}>
                      <span style={{ color: d.isRegisteredType ? T.accent : T.txD, fontWeight: d.isRegisteredType ? 700 : 500, minWidth: 52 }}>{d.trainTypeTitle || "—"}</span>
                      <span style={{ color: T.txH, fontWeight: 600 }}>{fmtUntil(d.minutesUntil)}</span>
                      <span style={{ color: T.txD }}>{d.time}{d.destination ? ` ・ ${t("train.bound", { dest: d.destination })}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
      )}
    </div>
  );
}

function DepRow({ d, primary, typeTitle }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: primary ? 13 : 12, fontWeight: 700, color: T.accent, minWidth: 52 }}>{d.trainTypeTitle || typeTitle || ""}</span>
      <span style={{ fontSize: primary ? 22 : 16, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{fmtUntil(d.minutesUntil)}</span>
      <span style={{ fontSize: 12.5, color: T.txD }}>{d.time}{d.destination ? ` ・ ${t("train.bound", { dest: d.destination })}` : ""}{d.isLast ? ` ・ ${t("train.lastTrain")}` : ""}</span>
    </div>
  );
}

// ── ルート追加モーダル ──
function AddModal({ onClose, onSave }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null);   // 選択した駅候補
  const [dir, setDir] = useState(null);          // 選択した方向
  const [type, setType] = useState(null);        // 選択した種別（任意）
  const debRef = useRef(null);

  const doSearch = useCallback(async (query) => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    setSearching(true); setErr(null);
    try {
      const r = await fetch(`/api/train/search?q=${encodeURIComponent(term)}&lang=${getLang()}`);
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) { setErr("keymissing"); setResults([]); }
      else if (!r.ok) { setErr("error"); setResults([]); }
      else setResults(j.results || []);
    } catch { setErr("error"); setResults([]); }
    setSearching(false);
  }, []);

  const onChange = (v) => {
    setQ(v); setPicked(null); setDir(null); setType(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => doSearch(v), 400);
  };

  const save = () => {
    if (!picked || !dir) return;
    const dirTitle = picked.directions.find((d) => d.id === dir)?.title || "";
    const typeTitle = type ? picked.trainTypes.find((tt) => tt.id === type)?.title || "" : "";
    const label = `${picked.stationTitle}・${dirTitle}${t("train.directionSuffix")}${typeTitle ? ` ${typeTitle}` : ""}`;
    onSave({ railway: picked.railway, station: picked.station, direction: dir, train_type: type, label });
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 998 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(440px,92vw)", maxHeight: "86vh", overflowY: "auto", background: T.bg2, border: `1px solid ${T.bdL}`, borderRadius: 16, padding: 18, zIndex: 999, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: T.txH, fontSize: 16 }}>{t("train.addTitle")}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>

        <input autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder={t("train.searchPlaceholder")}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none" }} />

        {searching && <div style={{ color: T.txD, fontSize: 12.5, marginTop: 8 }}>{t("train.searching")}</div>}
        {err === "keymissing" && <div style={{ color: T.orange, fontSize: 12.5, marginTop: 8 }}>{t("train.keyMissing")}</div>}
        {err === "error" && <div style={{ color: T.red, fontSize: 12.5, marginTop: 8 }}>{t("train.fetchError")}</div>}
        {!searching && !err && q.trim() && results.length === 0 && <div style={{ color: T.txD, fontSize: 12.5, marginTop: 8 }}>{t("train.noResults")}</div>}

        {/* 駅×路線 候補 */}
        {!picked && results.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => { setPicked(r); setDir(null); setType(null); }}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, cursor: "pointer" }}>
                <div style={{ color: T.txH, fontWeight: 600, fontSize: 14 }}>{r.stationTitle}</div>
                <div style={{ color: T.txD, fontSize: 12 }}>{r.railwayTitle}</div>
              </button>
            ))}
          </div>
        )}

        {/* 方向・種別の選択 */}
        {picked && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: T.txH, fontWeight: 600, fontSize: 14 }}>{picked.stationTitle} <span style={{ color: T.txD, fontWeight: 400, fontSize: 12 }}>· {picked.railwayTitle}</span></div>
            <button onClick={() => setPicked(null)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 12, padding: "4px 0" }}>← {t("train.changeStation")}</button>

            <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, margin: "10px 0 6px" }}>{t("train.directionLabel")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {picked.directions.map((d) => (
                <Chip key={d.id} on={dir === d.id} onClick={() => setDir(d.id)} label={`${d.title}${t("train.directionSuffix")}`} />
              ))}
            </div>

            {picked.trainTypes.length > 0 && <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, margin: "12px 0 6px" }}>{t("train.typeLabel")} <span style={{ fontWeight: 400 }}>({t("train.optional")})</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip on={type === null} onClick={() => setType(null)} label={t("train.anyType")} />
                {picked.trainTypes.map((tt) => (
                  <Chip key={tt.id} on={type === tt.id} onClick={() => setType(tt.id)} label={tt.title} />
                ))}
              </div>
            </>}

            <button onClick={save} disabled={!dir}
              style={{ marginTop: 16, width: "100%", padding: "11px 0", borderRadius: 10, border: "none", cursor: dir ? "pointer" : "not-allowed", background: dir ? T.accent : T.bg4, color: dir ? "#fff" : T.txD, fontWeight: 700, fontSize: 14 }}>
              {t("train.save")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const Chip = ({ on, onClick, label }) => (
  <button onClick={onClick} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}1a` : T.bg3, color: on ? T.accent : T.tx, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{label}</button>
);

export const TrainView = ({ mob }) => {
  const { routes, loading, addRoute, removeRoute } = useTrainRoutes(true);
  const [adding, setAdding] = useState(false);

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
          {routes.map((r) => <RouteCard key={r.id} route={r} onRemove={removeRoute} />)}
        </div>
      )}

      <div style={{ marginTop: 24, color: T.txD, fontSize: 10.5, textAlign: "center" }}>{t("train.credit")}</div>

      {adding && <AddModal onClose={() => setAdding(false)} onSave={(route) => { addRoute(route); setAdding(false); }} />}
    </div>
  );
};
