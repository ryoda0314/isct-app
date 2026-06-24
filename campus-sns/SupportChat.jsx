import React, { useState, useEffect, useCallback, useRef } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { t } from "./i18n.js";
import { isNative } from "./capacitor.js";
import { getSupabaseClient } from "../lib/supabase/client.js";

const APP_VERSION = "1.0.0";

const CATEGORIES = [
  { id: "bug", labelKey: "support.catBug" },
  { id: "feature", labelKey: "support.catFeature" },
  { id: "question", labelKey: "support.catQuestion" },
  { id: "account", labelKey: "support.catAccount" },
  { id: "other", labelKey: "support.catOther" },
];
const STATUS_KEYS = { open: "support.statusOpen", in_progress: "support.statusInProgress", resolved: "support.statusResolved", closed: "support.statusClosed" };
const STATUS_COLORS = { open: T.orange, in_progress: T.accent, resolved: T.green, closed: T.txD };

function collectDiagnostics({ langPref, view } = {}) {
  if (typeof window === "undefined") return {};
  let platform = "web";
  try { platform = isNative() ? `native:${window.Capacitor?.getPlatform?.() || "?"}` : "web"; } catch {}
  return {
    appVersion: APP_VERSION, platform,
    userAgent: navigator.userAgent || "",
    screen: `${window.innerWidth}x${window.innerHeight}`,
    lang: langPref || (typeof navigator !== "undefined" ? navigator.language : ""),
    view: view || "",
  };
}

const fmtTime = (iso) => { try { return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

/**
 * SupportChat — 運営とのお問い合わせチャット（複数チケット制）
 * Props: onClose, userId, langPref, currentView, initialTicketId?
 */
export const SupportChat = ({ onClose, userId, langPref, currentView, initialTicketId }) => {
  const [screen, setScreen] = useState("list"); // list | new | thread
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // new ticket form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("bug");
  const [bodyText, setBodyText] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [creating, setCreating] = useState(false);

  const scrollRef = useRef(null);
  const scrollToBottom = () => { requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }); };

  const fetchTickets = useCallback(async () => {
    try {
      const r = await fetch("/api/support?action=tickets");
      if (!r.ok) return;
      const d = await r.json();
      setTickets(d.tickets || []);
    } catch {} finally { setLoading(false); }
  }, []);

  const openThread = useCallback(async (id) => {
    setActiveId(id); setScreen("thread"); setError("");
    try {
      const r = await fetch(`/api/support?action=thread&ticketId=${id}`);
      if (!r.ok) { setError(t("support.failed")); return; }
      const d = await r.json();
      setTicket(d.ticket); setMessages(d.messages || []);
      scrollToBottom();
    } catch { setError(t("support.networkError")); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { if (initialTicketId) openThread(initialTicketId); }, [initialTicketId, openThread]);

  // Realtime: server pings support_user:<userId> on any change touching this user.
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    const ch = sb.channel(`support_user:${userId}`)
      .on("broadcast", { event: "new" }, () => {
        fetchTickets();
        if (screen === "thread" && activeId) {
          fetch(`/api/support?action=thread&ticketId=${activeId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) { setTicket(d.ticket); setMessages(d.messages || []); scrollToBottom(); } })
            .catch(() => {});
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, screen, activeId, fetchTickets]);

  const handleCreate = async () => {
    if (!subject.trim()) { setError(t("support.subjectRequired")); return; }
    if (!bodyText.trim()) { setError(t("support.bodyRequired")); return; }
    setCreating(true); setError("");
    try {
      const r = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", subject, category, body: bodyText, diagnostics: includeDiag ? collectDiagnostics({ langPref, view: currentView }) : undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || t("support.failed")); return; }
      setSubject(""); setBodyText(""); setCategory("bug");
      await fetchTickets();
      openThread(d.ticketId);
    } catch { setError(t("support.networkError")); }
    finally { setCreating(false); }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError("");
    // optimistic
    const optimistic = { id: `tmp-${Date.now()}`, sender_role: "user", body: text, created_at: new Date().toISOString() };
    setMessages(m => [...m, optimistic]); setDraft(""); scrollToBottom();
    try {
      const r = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ticketId: activeId, body: text }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || t("support.failed")); setMessages(m => m.filter(x => x.id !== optimistic.id)); setDraft(text); return; }
      const rr = await fetch(`/api/support?action=thread&ticketId=${activeId}`);
      if (rr.ok) { const d = await rr.json(); setTicket(d.ticket); setMessages(d.messages || []); scrollToBottom(); }
    } catch { setError(t("support.networkError")); setMessages(m => m.filter(x => x.id !== optimistic.id)); setDraft(text); }
    finally { setSending(false); }
  };

  const overlay = { position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  const card = { width: "100%", maxWidth: 460, height: "85vh", display: "flex", flexDirection: "column", borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" };
  const headerBtn = { background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 };

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={card}>
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
          {screen !== "list"
            ? <button onClick={() => { setScreen("list"); setActiveId(null); fetchTickets(); }} style={headerBtn}>{I.back}</button>
            : <span style={{ color: T.accent, display: "flex" }}>{I.mail}</span>}
          <span style={{ fontSize: 15, fontWeight: 700, color: T.txH, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {screen === "list" ? t("support.title") : screen === "new" ? t("support.newTicket") : (ticket?.subject || t("support.title"))}
          </span>
          {screen === "thread" && ticket && <Badge text={t(STATUS_KEYS[ticket.status] || ticket.status)} color={STATUS_COLORS[ticket.status] || T.txD} />}
          <button onClick={onClose} style={headerBtn}>{I.x}</button>
        </div>

        {/* ── List ── */}
        {screen === "list" && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {loading && <div style={{ color: T.txD, fontSize: 13, textAlign: "center", padding: 24 }}>{t("common.loading")}</div>}
              {!loading && tickets.length === 0 && <div style={{ color: T.txD, fontSize: 13, textAlign: "center", padding: 32, lineHeight: 1.8 }}>{t("support.empty")}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tickets.map(tk => (
                  <button key={tk.id} onClick={() => openThread(tk.id)}
                    style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge text={t(STATUS_KEYS[tk.status] || tk.status)} color={STATUS_COLORS[tk.status] || T.txD} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.txH, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.subject}</span>
                      {tk.unread > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: T.red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tk.unread}</span>}
                    </div>
                    {tk.lastPreview && <div style={{ fontSize: 12, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.last_sender_role === "admin" ? "運営: " : ""}{tk.lastPreview}</div>}
                    <div style={{ fontSize: 10, color: T.txD }}>{fmtTime(tk.last_message_at)}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${T.bd}`, flexShrink: 0 }}>
              <button onClick={() => { setScreen("new"); setError(""); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{t("support.newTicket")}</button>
            </div>
          </>
        )}

        {/* ── New ticket ── */}
        {screen === "new" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, lineHeight: 1.7 }}>{t("support.intro")}</div>
            <label style={lbl}>{t("support.categoryLabel")}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} style={{ padding: "7px 12px", borderRadius: 18, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${category === c.id ? T.accent : T.bd}`, background: category === c.id ? `${T.accent}18` : T.bg3, color: category === c.id ? T.accent : T.txH }}>{t(c.labelKey)}</button>
              ))}
            </div>
            <label style={lbl}>{t("support.subjectLabel")}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} placeholder={t("support.subjectPlaceholder")} style={{ ...inp, marginBottom: 16 }} />
            <label style={lbl}>{t("support.bodyLabel")}</label>
            <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={5} maxLength={4000} placeholder={t("support.bodyPlaceholder")} style={{ ...inp, resize: "vertical", marginBottom: 16 }} />
            <label onClick={() => setIncludeDiag(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
              <input type="checkbox" checked={includeDiag} onChange={() => setIncludeDiag(v => !v)} style={{ accentColor: T.accent }} />
              <span style={{ fontSize: 12, color: T.txD }}>{t("support.includeDiag")}</span>
            </label>
            {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>{error}</div>}
            <button onClick={handleCreate} disabled={creating || !subject.trim() || !bodyText.trim()} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: creating ? "default" : "pointer", opacity: creating || !subject.trim() || !bodyText.trim() ? 0.5 : 1 }}>{creating ? t("support.creating") : t("support.create")}</button>
          </div>
        )}

        {/* ── Thread ── */}
        {screen === "thread" && (
          <>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map(m => {
                const mine = m.sender_role === "user";
                return (
                  <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                    <div style={{ fontSize: 10, color: T.txD, marginBottom: 2, textAlign: mine ? "right" : "left" }}>{mine ? t("support.you") : t("support.staff")} · {fmtTime(m.created_at)}</div>
                    <div style={{ padding: "9px 13px", borderRadius: 14, background: mine ? T.accent : T.bg3, color: mine ? "#fff" : T.txH, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", border: mine ? "none" : `1px solid ${T.bd}` }}>{m.body}</div>
                  </div>
                );
              })}
              {ticket?.status === "closed" && <div style={{ textAlign: "center", fontSize: 11, color: T.txD, padding: "8px 0" }}>{t("support.closedNotice")}</div>}
            </div>
            {error && <div style={{ fontSize: 12, color: T.red, padding: "0 16px 6px" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${T.bd}`, flexShrink: 0 }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={t("support.messagePlaceholder")}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", maxHeight: 120 }} />
              <button onClick={handleSend} disabled={sending || !draft.trim()} style={{ padding: "0 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: sending || !draft.trim() ? "default" : "pointer", opacity: sending || !draft.trim() ? 0.5 : 1, flexShrink: 0 }}>{t("support.send")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const lbl = { fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box" };

const Badge = ({ text, color }) => (
  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: `${color}18`, color, flexShrink: 0, whiteSpace: "nowrap" }}>{text}</span>
);
