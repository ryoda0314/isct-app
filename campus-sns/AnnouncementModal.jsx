import React, { useState, useEffect } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { t } from "./i18n.js";
import { isDemoMode } from "./demoMode.js";
import { announceLinkLabelKey } from "./announceLinks.js";

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
export const AnnouncementModal = ({ setView }) => {
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

  const markSeen = () => {
    try {
      const seen = readSeen();
      if (!seen.includes(current.id)) {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, current.id]));
      }
    } catch {}
  };

  const confirm = () => { markSeen(); setIdx(i => i + 1); };
  // CTA: このお知らせを既読にしてポップアップを閉じ、対象画面へ遷移
  const goLink = () => { markSeen(); setQueue([]); setView?.(current.link); };

  const s = TYPE_STYLES[current.type] || TYPE_STYLES.info;
  const multiple = queue.length > 1;
  const linkLabelKey = current.link ? announceLinkLabelKey(current.link) : null;
  const showCta = !!(current.link && setView && linkLabelKey);

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

        {/* フッター: CTA(任意) + 確認ボタン */}
        <div style={{ padding: "12px 20px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {showCta && (
            <button onClick={goLink} style={{
              width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
              background: s.color, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {t(linkLabelKey)}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}
          <button onClick={confirm} style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            border: showCta ? `1px solid ${T.bd}` : "none",
            background: showCta ? "transparent" : s.color,
            color: showCta ? T.txD : "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>{t("announce.gotIt")}</button>
        </div>
      </div>
    </div>
  );
};
