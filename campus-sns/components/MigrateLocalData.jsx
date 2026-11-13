import React, { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { pendingMigrations, runMigrations } from "../localStore.js";
import { getGuestProfile, updateUserPref } from "../hooks/useCurrentUser.js";
import { showToast } from "../hooks/useToast.js";

// ログインした直後に「この端末のデータをアカウントに移しますか？」と聞く（ログイン任意化）。
// ゲストの間に端末に保存したタスク・予定・電車の経路・出欠・トレーニング記録と、所属（アカウント側が未設定のものだけ）。
// ［端末に残す］なら何もしない（端末のデータはそのまま。次にログインしたときもまた聞く）。

const AFF_KEYS = ["myDept", "yearGroup", "myUnit"];

/** アカウントに無く、ゲストの所属にあるもの */
export function guestAffiliationToMove(user) {
  const gp = getGuestProfile();
  const out = {};
  for (const k of AFF_KEYS) if (gp[k] && !user?.[k]) out[k] = gp[k];
  return out;
}

export function hasLocalDataToMove(user) {
  return pendingMigrations().length > 0 || Object.keys(guestAffiliationToMove(user)).length > 0;
}

export function MigrateLocalData({ user, onClose }) {
  const [items] = useState(() => pendingMigrations());
  const [aff] = useState(() => guestAffiliationToMove(user));
  const [busy, setBusy] = useState(false);
  const affN = Object.keys(aff).length;

  const move = async () => {
    setBusy(true);
    try {
      if (affN) updateUserPref(aff); // アカウントなのでサーバー（/api/auth/me）にも保存される
      const { moved, failed } = await runMigrations();
      if (moved + affN > 0) showToast(t("migrate.done", { n: moved + affN }), "success");
      if (failed > 0) showToast(t("migrate.partial", { n: failed }));
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 380, background: T.bg2, borderRadius: 16, border: `1px solid ${T.bd}`, padding: "18px 18px 14px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("migrate.title")}</div>
        <div style={{ fontSize: 12, color: T.txD, marginTop: 6, lineHeight: 1.6 }}>{t("migrate.desc")}</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.txH, padding: "8px 12px", borderRadius: 10, background: T.bg3 }}>
              <span>{t(it.labelKey)}</span><span style={{ color: T.txD }}>{t("migrate.count", { n: it.n })}</span>
            </div>
          ))}
          {affN > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.txH, padding: "8px 12px", borderRadius: 10, background: T.bg3 }}>
              <span>{t("migrate.affiliation")}</span><span style={{ color: T.txD }}>{Object.values(aff).join(" / ")}</span>
            </div>
          )}
        </div>
        <button onClick={move} disabled={busy} style={{ width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 12, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? t("migrate.moving") : t("migrate.move")}
        </button>
        <button onClick={onClose} disabled={busy} style={{ width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 12, border: `1px solid ${T.bd}`, background: "transparent", color: T.txH, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
          {t("migrate.keep")}
        </button>
      </div>
    </div>
  );
}
