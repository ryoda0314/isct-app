import React, { useState, useEffect } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";

const TYPE_STYLES = {
  info: { color: T.accent, icon: I.bell, label: "お知らせ" },
  maintenance: { color: T.orange, icon: I.alert, label: "メンテナンス" },
  update: { color: T.green, icon: I.star, label: "アップデート" },
  urgent: { color: T.red, icon: I.alert, label: "緊急" },
};

// 折りたたみ表示にする本文の長さ/行数のしきい値
const COLLAPSE_LEN = 140;
const COLLAPSE_LINES = 4;
const isLong = (s = "") => s.length > COLLAPSE_LEN || s.split("\n").length > COLLAPSE_LINES;

const Chevron = ({ open, color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * AnnouncementBanner — アクティブなお知らせを表示するバナー
 * ホーム画面などに配置。長文は折りたたみ、「続きを読む」で展開。
 */
export const AnnouncementBanner = () => {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState({});
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

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const visible = items.filter(a => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 0 8px" }}>
      {visible.map(a => {
        const s = TYPE_STYLES[a.type] || TYPE_STYLES.info;
        const long = isLong(a.body);
        const open = !!expanded[a.id];
        const collapsed = long && !open;
        return (
          <div key={a.id} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}10`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: s.color, display: "flex", flexShrink: 0, marginTop: 2 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{a.title}</span>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{
                  fontSize: 12, color: T.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: collapsed ? 88 : "none", overflow: "hidden",
                }}>{a.body}</div>
                {collapsed && (
                  <div style={{
                    position: "absolute", left: 0, right: 0, bottom: 0, height: 40, pointerEvents: "none",
                    background: `linear-gradient(to bottom, ${s.color}00, ${s.color}10 60%, ${s.color}1a)`,
                  }} />
                )}
              </div>
              {long && (
                <button onClick={() => toggle(a.id)} style={{
                  marginTop: 6, background: "none", border: "none", color: s.color, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0,
                }}>
                  {open ? "折りたたむ" : "続きを読む"}<Chevron open={open} color={s.color} />
                </button>
              )}
            </div>
            <button onClick={() => dismiss(a.id)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", flexShrink: 0, padding: 2 }}>{I.x}</button>
          </div>
        );
      })}
    </div>
  );
};
