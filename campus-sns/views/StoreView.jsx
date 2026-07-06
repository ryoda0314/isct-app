import { useState, useEffect, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";

/** icon フィールドが I.* のキーならコンポーネント、そうでなければ絵文字/テキストとして描画。 */
function AppIconGlyph({ icon, size }) {
  const comp = icon && I[icon];
  if (comp) return <span style={{ display: "flex" }}>{comp}</span>;
  return <span style={{ fontSize: size ? size * 0.55 : 26, lineHeight: 1 }}>{icon || "📦"}</span>;
}

const CATEGORIES = [
  { id: "learning", labelKey: "store.cat.learning" },
  { id: "campus",   labelKey: "store.cat.campus" },
  { id: "social",   labelKey: "store.cat.social" },
  { id: "tools",    labelKey: "store.cat.tools" },
  { id: "other",    labelKey: "store.cat.other" },
];

/* ── 角丸アイコンタイル ── */
function IconTile({ app, size = 56, radius = 14 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(145deg, ${app.color}ee, ${app.color}bb)`,
      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
      boxShadow: `0 2px 8px ${app.color}40`,
    }}>
      <AppIconGlyph icon={app.icon} size={size} />
    </div>
  );
}

function Badge({ text }) {
  if (!text) return null;
  const isNew = text.toLowerCase() === "new";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
      background: isNew ? T.green : T.accent, color: "#fff", textTransform: "uppercase", letterSpacing: .3,
    }}>{text}</span>
  );
}

/* ── 入手ボタン(ストアの主アクション。開くのはマイアプリ側) ── */
function GetBtn({ app, onInstall, busy, light }) {
  const installed = app.installed;
  const base = {
    border: "none", cursor: installed || busy ? "default" : "pointer", fontWeight: 700,
    fontSize: 12, padding: "5px 16px", borderRadius: 999,
    WebkitTapHighlightColor: "transparent", display: "inline-flex", alignItems: "center", gap: 4,
  };
  if (installed) {
    return <span style={{ ...base, background: light ? "#ffffff33" : `${T.txH}12`, color: light ? "#fff" : T.txD }}>{t("store.installed")}</span>;
  }
  return (
    <button
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onInstall(app); }}
      style={{ ...base, background: light ? "#fff" : `${T.txH}12`, color: light ? app.color : T.accent, opacity: busy ? 0.6 : 1 }}
    >{app.target_type === "url" ? t("store.getUrl") : t("store.get")}</button>
  );
}

/* ── 注目バナー(大カード) ── */
function FeaturedCard({ app, onInstall, onDetail, busy }) {
  return (
    <div
      onClick={() => onDetail(app)}
      style={{
        minWidth: 280, maxWidth: 280, scrollSnapAlign: "start", cursor: "pointer",
        borderRadius: 18, overflow: "hidden", flexShrink: 0,
        background: `linear-gradient(135deg, ${app.color}, ${app.color}99)`,
        padding: 18, display: "flex", flexDirection: "column", gap: 12,
        boxShadow: `0 4px 16px ${app.color}33`, position: "relative", minHeight: 150,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffffcc", textTransform: "uppercase", letterSpacing: .5 }}>
        {app.subtitle || t("store.featured")}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{app.title}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: "#ffffff22",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", backdropFilter: "blur(4px)",
        }}>
          <AppIconGlyph icon={app.icon} size={48} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#ffffffdd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {app.description || app.subtitle}
          </div>
        </div>
        <GetBtn app={app} onInstall={onInstall} busy={busy} light />
      </div>
    </div>
  );
}

/* ── 一覧の行カード ── */
function AppRow({ app, onInstall, onDetail, busy }) {
  return (
    <div
      onClick={() => onDetail(app)}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer" }}
    >
      <IconTile app={app} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.title}</span>
          <Badge text={app.badge} />
        </div>
        <div style={{ fontSize: 12, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.subtitle}</div>
      </div>
      <GetBtn app={app} onInstall={onInstall} busy={busy} />
    </div>
  );
}

/* ── 詳細オーバーレイ ── */
function DetailSheet({ app, onInstall, onClose, busy }) {
  const shots = Array.isArray(app.screenshots) ? app.screenshots : [];
  return (
    <div
      onClick={onClose}
      style={{ position: "absolute", inset: 0, zIndex: 30, background: `${T.bg}f2`, display: "flex", flexDirection: "column", overflowY: "auto" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ padding: "16px 18px 40px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ border: "none", background: `${T.txH}12`, color: T.txH, width: 30, height: 30, borderRadius: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <IconTile app={app} size={80} radius={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.txH }}>{app.title}</span>
              <Badge text={app.badge} />
            </div>
            <div style={{ fontSize: 13, color: T.txD, marginTop: 4 }}>{app.subtitle}</div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <GetBtn app={app} onInstall={onInstall} busy={busy} />
              {app.installed && <span style={{ fontSize: 12, color: T.txD }}>{t("store.installedHint")}</span>}
            </div>
          </div>
        </div>

        {shots.length > 0 && (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 0 16px", scrollSnapType: "x mandatory" }}>
            {shots.map((src, i) => (
              <img key={i} src={src} alt="" style={{ height: 320, borderRadius: 14, border: `1px solid ${T.bd}`, scrollSnapAlign: "start", flexShrink: 0, objectFit: "cover" }} />
            ))}
          </div>
        )}

        {app.description && (
          <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{app.description}</div>
        )}
      </div>
    </div>
  );
}

/* ── メインビュー ── */
export function StoreView({ mob }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/store")
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (alive) setApps(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const install = async (app) => {
    if (app.installed || busyId) return;
    setBusyId(app.id);
    try {
      const r = await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "install", appId: app.id }) });
      if (r.ok) {
        setApps(prev => prev.map(a => a.id === app.id ? { ...a, installed: true } : a));
        setDetail(d => d && d.id === app.id ? { ...d, installed: true } : d);
      }
    } catch {}
    setBusyId(null);
  };

  const featured = useMemo(() => apps.filter(a => a.featured), [apps]);
  const byCategory = useMemo(() => {
    const m = {};
    for (const a of apps) (m[a.category] ||= []).push(a);
    return m;
  }, [apps]);

  return (
    <div style={{ flex: 1, position: "relative", overflowY: "auto", padding: mob ? "8px 16px 24px" : "12px 20px 32px" }}>
      {loading && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}

      {!loading && apps.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: T.txD, fontSize: 14 }}>{t("store.empty")}</div>
      )}

      {!loading && featured.length > 0 && (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 0 8px", scrollSnapType: "x mandatory", margin: "0 -2px" }}>
          {featured.map(app => (
            <FeaturedCard key={app.id} app={app} onInstall={install} onDetail={setDetail} busy={busyId === app.id} />
          ))}
        </div>
      )}

      {!loading && CATEGORIES.map(cat => {
        const list = byCategory[cat.id];
        if (!list || list.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 4 }}>{t(cat.labelKey)}</div>
            <div style={{ borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}`, padding: "4px 12px" }}>
              {list.map((app, i) => (
                <div key={app.id}>
                  {i > 0 && <div style={{ height: 1, background: T.bd, marginLeft: 68 }} />}
                  <AppRow app={app} onInstall={install} onDetail={setDetail} busy={busyId === app.id} />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {detail && <DetailSheet app={detail} onInstall={install} onClose={() => setDetail(null)} busy={busyId === detail.id} />}
    </div>
  );
}
