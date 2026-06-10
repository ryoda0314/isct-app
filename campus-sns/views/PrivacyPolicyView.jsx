import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";

const SECTIONS = [
  { titleKey: "privacy.s1.title", bodyKey: "privacy.s1.body" },
  { titleKey: "privacy.s2.title", bodyKey: "privacy.s2.body" },
  { titleKey: "privacy.s3.title", bodyKey: "privacy.s3.body" },
  { titleKey: "privacy.s4.title", bodyKey: "privacy.s4.body" },
  { titleKey: "privacy.s5.title", bodyKey: "privacy.s5.body" },
  { titleKey: "privacy.s6.title", bodyKey: "privacy.s6.body" },
  { titleKey: "privacy.s7.title", bodyKey: "privacy.s7.body" },
  { titleKey: "privacy.s8.title", bodyKey: "privacy.s8.body" },
  { titleKey: "privacy.s9.title", bodyKey: "privacy.s9.body" },
  { titleKey: "privacy.s10.title", bodyKey: "privacy.s10.body" },
  { titleKey: "privacy.s11.title", bodyKey: "privacy.s11.body" },
  { titleKey: "privacy.s12.title", bodyKey: "privacy.s12.body" },
  { titleKey: "privacy.s13.title", bodyKey: "privacy.s13.body" },
];

export const PrivacyPolicyView = ({ mob, onBack, embedded }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const content = (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={{
        padding: mob ? "20px 18px 40px" : "32px 40px 48px",
        maxWidth: 640, margin: "0 auto", boxSizing: "border-box",
      }}>
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: `${T.warn || T.accent}14`, border: `1px solid ${T.warn || T.accent}40`,
          fontSize: 12.5, color: T.txH, lineHeight: 1.6, fontWeight: 600,
        }}>
          {t("privacy.authoritativeNotice")}
        </div>

        {!embedded && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${T.accent}14`, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.txH }}>{t("privacy.heading")}</h2>
                <p style={{ margin: 0, fontSize: 12, color: T.txD }}>{t("privacy.lastUpdated")}</p>
              </div>
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: `${T.accent}08`, border: `1px solid ${T.accent}20`,
              fontSize: 13, color: T.tx, lineHeight: 1.7,
            }}>
              {t("privacy.intro")}
            </div>
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SECTIONS.map((s, i) => {
            const open = expandedIdx === i;
            return (
              <div key={i} style={{
                borderRadius: 10, border: `1px solid ${T.bd}`,
                background: T.bg2, overflow: "hidden",
              }}>
                <button
                  onClick={() => setExpandedIdx(open ? null : i)}
                  style={{
                    width: "100%", padding: "12px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "transparent", border: "none",
                    cursor: "pointer", color: T.txH, fontSize: 14, fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <span>{t(s.titleKey)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {open && (
                  <div style={{
                    padding: "0 14px 14px", fontSize: 13,
                    color: T.tx, lineHeight: 1.8, whiteSpace: "pre-wrap",
                    borderTop: `1px solid ${T.bd}`,
                    paddingTop: 12,
                  }}>
                    {t(s.bodyKey)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return content;
};
