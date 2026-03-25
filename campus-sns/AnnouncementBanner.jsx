import React, { useState, useEffect } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";

const TYPE_STYLES = {
  info: { color: T.accent, icon: I.bell, label: "お知らせ" },
  maintenance: { color: T.orange, icon: I.alert, label: "メンテナンス" },
  update: { color: T.green, icon: I.star, label: "アップデート" },
  urgent: { color: T.red, icon: I.alert, label: "緊急" },
};

/**
 * AnnouncementBanner — アクティブなお知らせを表示するバナー
 * ホーム画面などに配置
 */
export const AnnouncementBanner = () => {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissed_announcements") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.ok ? r.json() : [])
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem("dismissed_announcements", JSON.stringify(next)); } catch {}
  };

  const visible = items.filter(a => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 0 8px" }}>
      {visible.map(a => {
        const s = TYPE_STYLES[a.type] || TYPE_STYLES.info;
        return (
          <div key={a.id} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}10`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: s.color, display: "flex", flexShrink: 0, marginTop: 2 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{a.title}</span>
              </div>
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
            </div>
            <button onClick={() => dismiss(a.id)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", flexShrink: 0, padding: 2 }}>{I.x}</button>
          </div>
        );
      })}
    </div>
  );
};
