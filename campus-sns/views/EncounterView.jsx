import React, { useState, useMemo, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { getSpot } from "../hooks/useLocationSharing.js";

const CARD_TYPES = [
  { id: "pastexam", label: "過去問ヒント", emoji: "📝", col: "#e5534b" },
  { id: "tip",      label: "授業攻略法",   emoji: "💡", col: "#c6a236" },
  { id: "note",     label: "ノート切れ端", emoji: "📓", col: "#3dae72" },
  { id: "secret",   label: "裏情報",       emoji: "🤫", col: "#a855c7" },
  { id: "meshi",    label: "飯テロ",       emoji: "🍜", col: "#d4843e" },
];

const typeMap = Object.fromEntries(CARD_TYPES.map(t => [t.id, t]));

const fmtTime = ts => {
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 60000) return "たった今";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ── Sealed card (tap to open) ──
const SealedCard = ({ card, onOpen, mob }) => {
  const [flipping, setFlipping] = useState(false);
  const handleTap = () => {
    if (flipping) return;
    setFlipping(true);
    setTimeout(() => onOpen(card.id), 600);
  };
  return (
    <div onClick={handleTap} style={{ perspective: 600, cursor: "pointer" }}>
      <div style={{
        width: "100%", padding: "20px 16px", borderRadius: 14,
        background: `linear-gradient(135deg, ${T.accent}30, ${T.green}20)`,
        border: `2px dashed ${T.accent}50`,
        textAlign: "center", position: "relative", overflow: "hidden",
        transform: flipping ? "rotateY(90deg)" : "rotateY(0)",
        transition: "transform .3s ease-in",
      }}>
        <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, transparent, transparent 10px, ${T.accent}05 10px, ${T.accent}05 20px)` }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>📦</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{card.from.name} からのカード</div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>
            {getSpot(card.spot)?.label || "???"}で受け取った
          </div>
          <div style={{ fontSize: 11, color: T.accent, marginTop: 6, fontWeight: 600 }}>タップして開封</div>
        </div>
      </div>
    </div>
  );
};

// ── Opened card (full content) ──
const OpenCard = ({ card, mob, isNew }) => {
  const ct = typeMap[card.type] || CARD_TYPES[0];
  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      border: `1px solid ${card.coursCol || ct.col}40`,
      background: T.bg2,
      animation: isNew ? "cardReveal .5s ease-out" : undefined,
    }}>
      {/* Card header band */}
      <div style={{
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
        background: `linear-gradient(90deg, ${card.coursCol || ct.col}25, transparent)`,
        borderBottom: `1px solid ${card.coursCol || ct.col}20`,
      }}>
        <span style={{ fontSize: 20 }}>{ct.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: ct.col, letterSpacing: .5 }}>{ct.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.courseCode} {card.courseName}
          </div>
        </div>
      </div>
      {/* Card body */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 4 }}>{card.title}</div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{card.body}</div>
      </div>
      {/* Card footer */}
      <div style={{
        padding: "8px 14px", display: "flex", alignItems: "center", gap: 6,
        borderTop: `1px solid ${T.bd}`, fontSize: 11, color: T.txD,
      }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: card.from?.col || "#888", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>
          {(card.from?.name || "?")[0]}
        </div>
        <span>{card.from?.name}</span>
        <span style={{ marginLeft: "auto" }}>{fmtTime(card.receivedAt)}</span>
        {card.spot && <><span style={{ display: "flex", color: getSpot(card.spot)?.col }}>{I.pin}</span><span>{getSpot(card.spot)?.short}</span></>}
      </div>
    </div>
  );
};

// ── Card editor (set what you carry) ──
const CardEditor = ({ myCard, setMyCard, courses, mob }) => {
  const [editing, setEditing] = useState(!myCard);
  const [type, setType] = useState(myCard?.type || "pastexam");
  const [courseId, setCourseId] = useState(myCard?.courseId || "");
  const [title, setTitle] = useState(myCard?.title || "");
  const [body, setBody] = useState(myCard?.body || "");

  const handleSave = () => {
    const c = courses.find(x => x.id === courseId);
    if (!c || !title.trim()) return;
    setMyCard({
      type, courseId, courseCode: c.code, courseName: c.name, coursCol: c.col,
      title: title.trim(), body: body.trim(),
    });
    setEditing(false);
  };

  if (!editing && myCard) {
    const ct = typeMap[myCard.type] || CARD_TYPES[0];
    return (
      <div style={{ borderRadius: 14, border: `1px solid ${myCard.coursCol || T.bd}`, background: T.bg2, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", background: `${myCard.coursCol || T.accent}12`, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${myCard.coursCol || T.bd}20` }}>
          <span style={{ fontSize: 18 }}>{ct.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: ct.col, fontWeight: 700 }}>{ct.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{myCard.courseCode} {myCard.courseName}</div>
          </div>
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.pen}</button>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{myCard.title}</div>
          {myCard.body && <div style={{ fontSize: 12, color: T.tx, marginTop: 2 }}>{myCard.body}</div>}
        </div>
        <div style={{ padding: "6px 14px 10px", fontSize: 10, color: T.txD }}>
          この内容がすれ違った人に届きます
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${T.accent}40`, background: T.bg2, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 10 }}>持ち歩くカードを作成</div>
      {/* Type selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {CARD_TYPES.map(ct => (
          <button key={ct.id} onClick={() => setType(ct.id)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8,
            border: type === ct.id ? `2px solid ${ct.col}` : `1px solid ${T.bd}`,
            background: type === ct.id ? `${ct.col}15` : T.bg3,
            color: type === ct.id ? ct.col : T.txD, fontSize: 12, fontWeight: type === ct.id ? 700 : 400, cursor: "pointer",
          }}>
            <span>{ct.emoji}</span>{ct.label}
          </button>
        ))}
      </div>
      {/* Course */}
      <select value={courseId} onChange={e => setCourseId(e.target.value)} style={{
        width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`,
        background: T.bg3, color: T.txH, fontSize: 13, marginBottom: 8, outline: "none",
      }}>
        <option value="">授業を選択...</option>
        {courses.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
      </select>
      {/* Title */}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル（例: 期末の出題傾向）" maxLength={50} style={{
        width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`,
        background: T.bg3, color: T.txH, fontSize: 13, marginBottom: 8, outline: "none",
      }} />
      {/* Body */}
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="内容（例: 3章の証明は毎年出る。教科書p.42の例題をやっとけ）" maxLength={200} rows={3} style={{
        width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`,
        background: T.bg3, color: T.txH, fontSize: 13, marginBottom: 10, outline: "none", resize: "none", lineHeight: 1.5,
      }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={!courseId || !title.trim()} style={{
          flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
          background: courseId && title.trim() ? T.accent : T.bg3,
          color: courseId && title.trim() ? "#fff" : T.txD,
          fontSize: 14, fontWeight: 700, cursor: courseId && title.trim() ? "pointer" : "default",
        }}>
          カードをセット
        </button>
        {myCard && <button onClick={() => setEditing(false)} style={{
          padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.bd}`,
          background: T.bg3, color: T.txD, fontSize: 13, cursor: "pointer",
        }}>
          戻る
        </button>}
      </div>
    </div>
  );
};

// ── Main View ──
export const EncounterView = ({ mob, nearby = [], myCard, setMyCard, inbox = [], collection = [], openCard, clearCollection, stats = {}, courses = [] }) => {
  const [tab, setTab] = useState("inbox");
  const [justOpened, setJustOpened] = useState(null);
  const prevNearbyRef = useRef([]);
  const [showCelebrate, setShowCelebrate] = useState(false);

  // detect new card arrival → celebrate
  useEffect(() => {
    const prevIds = new Set(prevNearbyRef.current.map(u => u.id));
    const newUsers = nearby.filter(u => !prevIds.has(u.id) && u.card);
    if (newUsers.length > 0) {
      setShowCelebrate(true);
      setTimeout(() => setShowCelebrate(false), 2500);
    }
    prevNearbyRef.current = nearby;
  }, [nearby]);

  const handleOpen = (cardId) => {
    openCard(cardId);
    setJustOpened(cardId);
    setTimeout(() => setJustOpened(null), 3000);
  };

  // collection grouped by course
  const byCourse = useMemo(() => {
    const map = {};
    for (const c of collection) {
      const key = c.courseCode || "???";
      if (!map[key]) map[key] = { courseCode: c.courseCode, courseName: c.courseName, coursCol: c.coursCol, cards: [] };
      map[key].cards.push(c);
    }
    return Object.values(map).sort((a, b) => b.cards.length - a.cards.length);
  }, [collection]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
      {/* ── Hero ── */}
      <div style={{ position: "relative", borderRadius: 16, padding: "18px 16px", marginBottom: 14, background: `linear-gradient(135deg, ${T.accent}18, ${T.orange}12)`, border: `1px solid ${T.accent}25`, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -10, right: -10, fontSize: 60, opacity: .08, transform: "rotate(15deg)" }}>📦</div>
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: mob ? 18 : 22, fontWeight: 900, color: T.txH, marginBottom: 2, letterSpacing: -.5 }}>すれ違い通信</div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>カードを持ち歩いて、すれ違った人と自動で交換しよう</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { v: stats.totalCards || 0, l: "枚 受け取り", emoji: "📬" },
              { v: stats.uniquePeople || 0, l: "人 と交換", emoji: "👤" },
              { v: stats.uniqueCourses || 0, l: "科目", emoji: "📚" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 16, background: `${T.bg}80` }}>
                <span style={{ fontSize: 13 }}>{s.emoji}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.txH }}>{s.v}</span>
                <span style={{ fontSize: 10, color: T.txD }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Celebrate overlay ── */}
      {showCelebrate && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", zIndex: 1000, animation: "fadeIn .2s" }}>
          <div style={{ background: T.bg2, borderRadius: 20, padding: "28px 36px", textAlign: "center", animation: "popIn .35s ease", boxShadow: `0 0 80px ${T.accent}30` }}>
            <div style={{ fontSize: 44, marginBottom: 6, animation: "bounce .8s infinite" }}>📬</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.txH, marginBottom: 4 }}>カード交換成立!</div>
            <div style={{ fontSize: 13, color: T.txD }}>受信箱にカードが届きました</div>
          </div>
        </div>
      )}

      {/* ── Nearby bar ── */}
      {nearby.length > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 12, background: `${T.green}12`, border: `1px solid ${T.green}30`, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, animation: "pulse 1.5s infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.green, flex: 1 }}>
            {nearby.length}人が近くにいます
          </span>
          <div style={{ display: "flex", gap: -4 }}>
            {nearby.slice(0, 5).map(u => (
              <div key={u.id} title={u.name} style={{ width: 24, height: 24, borderRadius: "50%", background: u.col || "#888", border: `2px solid ${T.bg}`, marginLeft: -6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>
                {(u.name || "?")[0]}
              </div>
            ))}
          </div>
          {!myCard && <span style={{ fontSize: 10, color: T.txD }}>カード未設定</span>}
        </div>
      )}

      {/* ── My Card (always visible) ── */}
      <div style={{ marginBottom: 14 }}>
        <CardEditor myCard={myCard} setMyCard={setMyCard} courses={courses} mob={mob} />
        {!myCard && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: `${T.orange}10`, border: `1px solid ${T.orange}25`, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.orange }}>カードを設定するとすれ違い交換が有効になります</div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${T.bd}` }}>
        {[
          { id: "inbox", label: "受信箱", icon: I.mail, badge: inbox.length },
          { id: "collection", label: `コレクション (${collection.length})`, icon: I.star },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            position: "relative", display: "flex", alignItems: "center", gap: 4,
            padding: "8px 14px", border: "none",
            borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
            background: "transparent",
            color: tab === t.id ? T.txH : T.txD,
            fontSize: 12, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {t.icon}<span>{t.label}</span>
            {t.badge > 0 && <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: T.red, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Inbox Tab ── */}
      {tab === "inbox" && (
        inbox.length === 0
          ? <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 8, opacity: .5 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>受信箱は空です</div>
              <div style={{ fontSize: 12, color: T.txD }}>カードを設定して歩き回ると、<br/>すれ違った人のカードが届きます</div>
            </div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: T.txD, marginBottom: 2 }}>未開封のカードが {inbox.length}枚 あります。タップして開封!</div>
              {inbox.map(c => <SealedCard key={c.id} card={c} onOpen={handleOpen} mob={mob} />)}
            </div>
      )}

      {/* ── Collection Tab ── */}
      {tab === "collection" && (
        collection.length === 0
          ? <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 8, opacity: .5 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>コレクションはまだ空です</div>
              <div style={{ fontSize: 12, color: T.txD }}>受信箱のカードを開封するとここに追加されます</div>
            </div>
          : <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: T.txD }}>{collection.length}枚のカード / {byCourse.length}科目</span>
                <button onClick={clearCollection} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, fontSize: 11, cursor: "pointer" }}>全削除</button>
              </div>
              {byCourse.map(g => (
                <div key={g.courseCode} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: g.coursCol || T.accent }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{g.courseCode}</span>
                    <span style={{ fontSize: 12, color: T.txD }}>{g.courseName}</span>
                    <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{g.cards.length}枚</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.cards.map(c => <OpenCard key={c.id} card={c} mob={mob} isNew={c.id === justOpened} />)}
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes popIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes cardReveal{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
      `}</style>
    </div>
  );
};
