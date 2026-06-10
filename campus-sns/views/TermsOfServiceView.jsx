import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";

const SECTIONS = [
  { titleKey: "terms.s1Title", bodyKey: "terms.s1Body" },
  { titleKey: "terms.s2Title", bodyKey: "terms.s2Body" },
  { titleKey: "terms.s3Title", bodyKey: "terms.s3Body" },
  { titleKey: "terms.s4Title", bodyKey: "terms.s4Body" },
  { titleKey: "terms.s5Title", bodyKey: "terms.s5Body" },
  { titleKey: "terms.s6Title", bodyKey: "terms.s6Body" },
  { titleKey: "terms.s7Title", bodyKey: "terms.s7Body" },
  { titleKey: "terms.s8Title", bodyKey: "terms.s8Body" },
  { titleKey: "terms.s9Title", bodyKey: "terms.s9Body" },
  { titleKey: "terms.s10Title", bodyKey: "terms.s10Body" },
  { titleKey: "terms.s11Title", bodyKey: "terms.s11Body" },
  { titleKey: "terms.s12Title", bodyKey: "terms.s12Body" },
];

export const TermsOfServiceView = ({ mob, embedded }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{
        padding: mob ? "20px 18px 40px" : "32px 40px 48px",
        maxWidth: 640, margin: "0 auto", boxSizing: "border-box",
      }}>
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: `${T.accent}12`, border: `1px solid ${T.accent}33`,
          fontSize: 12.5, color: T.txH, lineHeight: 1.6, fontWeight: 600,
        }}>
          {t("terms.authoritativeNotice")}
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
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.txH }}>{t("terms.title")}</h2>
                <p style={{ margin: 0, fontSize: 12, color: T.txD }}>{t("terms.lastUpdated")}</p>
              </div>
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: `${T.accent}08`, border: `1px solid ${T.accent}20`,
              fontSize: 13, color: T.tx, lineHeight: 1.7,
            }}>
              {t("terms.intro")}
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
};
