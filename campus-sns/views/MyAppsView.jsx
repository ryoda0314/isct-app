import { useState, useEffect } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { isNative } from "../capacitor.js";
import { openInSystemBrowser } from "../openMaterial.js";

/** 外部アプリURLを開く: ネイティブはアプリ内ブラウザ、Webは新規タブ。 */
function openExternalApp(url) {
  if (isNative()) openInSystemBrowser(url);
  else window.open(url, "_blank", "noopener");
}

function AppIconGlyph({ icon, size }) {
  const comp = icon && I[icon];
  if (comp) return <span style={{ display: "flex" }}>{comp}</span>;
  return <span style={{ fontSize: size ? size * 0.5 : 24, lineHeight: 1 }}>{icon || "📦"}</span>;
}

/* ── ホーム画面風アイコン ── */
function LauncherIcon({ app, onOpen, editing, onRemove }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={() => editing ? null : onOpen(app)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "none", border: "none", cursor: "pointer", padding: 0,
        WebkitTapHighlightColor: "transparent",
        transform: pressed && !editing ? "scale(0.88)" : "scale(1)",
        transition: "transform .12s ease",
        animation: editing ? "myapps-jiggle .3s infinite" : "none",
      }}
    >
      <div style={{ position: "relative" }}>
        <div style={{
          width: 58, height: 58, borderRadius: 14,
          background: `linear-gradient(145deg, ${app.color}ee, ${app.color}bb)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", boxShadow: `0 2px 8px ${app.color}40`,
        }}>
          <AppIconGlyph icon={app.icon} size={58} />
        </div>
        {editing && (
          <span
            onClick={(e) => { e.stopPropagation(); onRemove(app); }}
            style={{
              position: "absolute", top: -6, left: -6, width: 22, height: 22, borderRadius: 11,
              background: T.bg3, color: T.txH, border: `1px solid ${T.bd}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
            }}
          >−</span>
        )}
      </div>
      <span style={{
        fontSize: 11, color: T.txH, fontWeight: 500, maxWidth: 68,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center",
      }}>{app.title}</span>
    </button>
  );
}

export function MyAppsView({ setView, mob }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/store?mine=1")
      .then(r => r.ok ? r.json() : [])
      .then(d => setApps(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onOpen = async (app) => {
    if (app.target_type !== "url") { setView(app.target); return; }

    // 非SSOアプリはそのまま開く
    if (!app.sso_enabled) { openExternalApp(app.target); return; }

    // SSO: 同一オリジンで code を発行し、callback を code 付きで開く(=自動ログイン)。
    // Web は mint(await)後の window.open がポップアップブロックされるため、
    // クリック直後に空タブを同期で開いておき、後から遷移させる。
    const native = isNative();
    const win = native ? null : window.open("about:blank", "_blank");

    let url = app.target;
    try {
      const r = await fetch("/api/sso/mint", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: app.id }),
      });
      if (r.ok) {
        const { code, callback } = await r.json();
        if (code && callback) {
          const u = new URL(callback);
          u.searchParams.set("code", code);
          url = u.toString();
        }
      }
    } catch {}

    if (native) openInSystemBrowser(url);
    else if (win && !win.closed) win.location.href = url;
    else openExternalApp(url);
  };

  const onRemove = async (app) => {
    setApps(prev => prev.filter(a => a.id !== app.id));
    try {
      await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "uninstall", appId: app.id }) });
    } catch {}
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <style>{`@keyframes myapps-jiggle{0%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}100%{transform:rotate(-1.5deg)}}`}</style>

      {!loading && apps.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px 0" }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setEditing(e => !e)}
            style={{ border: "none", background: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >{editing ? t("common.done") : t("common.edit")}</button>
        </div>
      )}

      {loading && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}

      {!loading && apps.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: T.txD }}>{t("store.myEmpty")}</div>
          <button
            onClick={() => setView("store")}
            style={{ border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, padding: "9px 24px", borderRadius: 999, background: T.accent, color: "#fff" }}
          >{t("store.openStore")}</button>
        </div>
      )}

      {!loading && apps.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: "20px 0", padding: "12px 16px 24px", alignContent: "start",
        }}>
          {apps.map(app => (
            <div key={app.id} style={{ display: "flex", justifyContent: "center" }}>
              <LauncherIcon app={app} onOpen={onOpen} editing={editing} onRemove={onRemove} />
            </div>
          ))}
          {/* 追加タイル → ストアへ */}
          {!editing && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => setView("store")}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <div style={{ width: 58, height: 58, borderRadius: 14, border: `2px dashed ${T.bd}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.txD }}>{I.plus}</div>
                <span style={{ fontSize: 11, color: T.txD, fontWeight: 500 }}>{t("store.addMore")}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
