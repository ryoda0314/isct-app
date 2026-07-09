import React, { useState, useEffect } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { t } from "./i18n.js";
import { isDemoMode } from "./demoMode.js";

const TYPE_STYLES = {
  info: { color: T.accent, icon: I.bell, labelKey: "announce.typeInfo" },
  maintenance: { color: T.orange, icon: I.alert, labelKey: "announce.typeMaintenance" },
  update: { color: T.green, icon: I.star, labelKey: "announce.typeUpdate" },
  urgent: { color: T.red, icon: I.alert, labelKey: "announce.typeUrgent" },
};

const SEEN_KEY = "seen_announcement_popups";
const readSeen = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
};

/**
 * AnnouncementModal — popup=true のお知らせを起動時にモーダルで表示する。
 * 一度「確認」したものは localStorage(seen_announcement_popups) に記録し、二度と表示しない。
 * 未読が複数ある場合は 1 件ずつ順番に表示する。
 */
export const AnnouncementModal = () => {
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (isDemoMode()) return;
    fetch("/api/announcements")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!Array.isArray(data)) return;
        const seen = readSeen();
        setQueue(data.filter(a => a.popup && !seen.includes(a.id)));
      })
      .catch(() => {});
  }, []);

  const current = queue[idx];
  if (!current) return null;

  const confirm = () => {
    try {
      const seen = readSeen();
      if (!seen.includes(current.id)) {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, current.id]));
      }
    } catch {}
    setIdx(i => i + 1);
  };

  const s = TYPE_STYLES[current.type] || TYPE_STYLES.info;
  const multiple = queue.length > 1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9990,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420, borderRadius: 16,
        background: T.bg2, border: `1px solid ${T.bd}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        maxHeight: "80dvh", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* ヘッダー: 種別バー */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "16px 20px", background: `${s.color}12`,
          borderBottom: `1px solid ${s.color}30`,
        }}>
          <span style={{ color: s.color, display: "flex", flexShrink: 0 }}>{s.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{t(s.labelKey)}</span>
          {multiple && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.txD, fontVariantNumeric: "tabular-nums" }}>
              {idx + 1} / {queue.length}
            </span>
          )}
        </div>

        {/* 本文 */}
        <div style={{ padding: "20px", overflowY: "auto" }}>
          {current.title && (
            <h2 style={{ fontSize: 18, fontWeight: 700, color: T.txH, margin: "0 0 12px", lineHeight: 1.4 }}>
              {current.title}
            </h2>
          )}
          {current.image_url && (
            <img src={current.image_url} alt="" style={{
              width: "100%", maxHeight: 360, objectFit: "contain",
              borderRadius: 10, display: "block", marginBottom: current.body ? 12 : 0,
            }} />
          )}
          {current.body && (
            <div style={{
              fontSize: 14, color: T.tx, lineHeight: 1.7,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{current.body}</div>
          )}
        </div>

        {/* フッター: 確認ボタン */}
        <div style={{ padding: "12px 20px 20px", flexShrink: 0 }}>
          <button onClick={confirm} style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
            background: s.color, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>{t("announce.gotIt")}</button>
        </div>
      </div>
    </div>
  );
};
