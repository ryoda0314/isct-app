import React, { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { openLogin } from "../authState.js";

// ホームの「はじめに」（ログインしていない人だけ）。初めて開いた人が「何ができるのか・何をすればいいのか」分かるように、
// ログインなしで役立つ 4 つだけを大きく出す。閉じたら出さない（端末に記録。accountStorage.js の残すキー）。
const KEY = "guideDismissed";

export function GuestGuide({ setView, mob, hasTimetable }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  if (hidden) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch {} setHidden(true); };
  const tiles = [
    { id: "ttbuild", i: I.cal, tk: "guide.ttT", dk: hasTimetable ? "guide.ttDone" : "guide.ttD" },
    { id: "navigation", i: I.map, tk: "guide.mapT", dk: "guide.mapD" },
    { id: "lookup", i: I.search, tk: "guide.lookupT", dk: "guide.lookupD" },
    mob ? { id: "moreMenu", i: I.more, tk: "guide.moreT", dk: "guide.moreD" } : { id: "train", i: I.train, tk: "guide.trainT", dk: "guide.trainD" },
  ];
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${T.accent}30`, background: `${T.accent}0c`, padding: mob ? 14 : 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.txH }}>{t("guide.title")}</div>
          <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{t("guide.sub")}</div>
        </div>
        <button onClick={close} aria-label={t("guide.close")} title={t("guide.close")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.x}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
        {tiles.map((x) => (
          <button key={x.id} onClick={() => setView(x.id)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "12px 12px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, cursor: "pointer", textAlign: "left", font: "inherit", minHeight: 92 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, background: `${T.accent}16` }}>{x.i}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.txH, lineHeight: 1.3 }}>{t(x.tk)}</span>
            <span style={{ fontSize: 11, color: T.txD, lineHeight: 1.4 }}>{t(x.dk)}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: T.txD, lineHeight: 1.5, flexWrap: "wrap" }}>
        <span>{t("guide.loginLine")}</span>
        <button onClick={() => openLogin({})} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{t("setup.login")} →</button>
      </div>
    </div>
  );
}
