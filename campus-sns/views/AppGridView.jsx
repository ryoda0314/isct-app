import { useState, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";

/* ── iOS-style app icon colors ── */
const C = {
  blue: "#007AFF", green: "#34C759", orange: "#FF9500", red: "#FF3B30",
  purple: "#AF52DE", pink: "#FF2D55", teal: "#5AC8FA", indigo: "#5856D6",
  yellow: "#FFCC00", mint: "#00C7BE", gray: "#8E8E93", brown: "#A2845E",
};

/* ── App definitions ── */
const APPS = [
  { id: "dm",         icon: I.mail,      label: "メッセージ",   color: C.green,  badge: "dmUnread" },
  { id: "timetable",  icon: I.cal,       label: "時間割",       color: C.blue },
  { id: "tasks",      icon: I.tasks,     label: "課題",         color: C.red,    badge: "ac" },
  { id: "calendar",   icon: I.event,     label: "カレンダー",   color: C.orange },
  { id: "grades",     icon: I.grad,      label: "成績",         color: C.indigo },
  { id: "notif",      icon: I.bell,      label: "通知",         color: C.pink,   badge: "unreadN" },
  { id: "friends",    icon: I.users,     label: "友達",         color: C.teal,   badge: "pendingFriendCount" },
  { id: "circles",    icon: I.circle,    label: "サークル",     color: C.purple },
  { id: "events",     icon: I.event,     label: "イベント",     color: C.yellow },
  { id: "location",   icon: I.pin,       label: "居場所",       color: C.mint },
  { id: "encounter",  icon: I.encounter, label: "すれ違い",     color: C.brown },
  { id: "navigation", icon: I.map,       label: "マップ",       color: C.blue },
  { id: "reviews",    icon: I.star,      label: "レビュー",     color: C.orange },
  { id: "pomo",       icon: I.play,      label: "ポモドーロ",   color: C.red },
  { id: "bmarks",     icon: I.bmark,     label: "ブックマーク", color: C.indigo },
  { id: "search",     icon: I.search,    label: "検索",         color: C.gray },
  { id: "profile",    icon: I.user1,     label: "プロフィール", color: C.teal },
  { id: "courseSelect", icon: I.clip,    label: "コース",       color: C.purple },
];

const COLS = 4;
const PER_PAGE = 16; // 4x4 grid
const PAGES = [];
for (let i = 0; i < APPS.length; i += PER_PAGE) PAGES.push(APPS.slice(i, i + PER_PAGE));

/* ── Icon component ── */
function AppIcon({ app, onTap, badgeCount }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={() => onTap(app.id)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 6, background: "none", border: "none", cursor: "pointer",
        padding: 0, WebkitTapHighlightColor: "transparent",
        transform: pressed ? "scale(0.88)" : "scale(1)",
        transition: "transform .12s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        <div style={{
          width: 58, height: 58, borderRadius: 14,
          background: `linear-gradient(145deg, ${app.color}ee, ${app.color}bb)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          boxShadow: `0 2px 8px ${app.color}40`,
        }}>
          {app.icon}
        </div>
        {badgeCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 20, height: 20, borderRadius: 10,
            background: "#FF3B30", color: "#fff",
            fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px", border: `2px solid ${T.bg}`,
          }}>{badgeCount > 99 ? "99+" : badgeCount}</span>
        )}
      </div>
      <span style={{
        fontSize: 11, color: T.txH, fontWeight: 500,
        maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap", textAlign: "center",
      }}>{app.label}</span>
    </button>
  );
}

/* ── Page dots ── */
function PageDots({ total, current }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 6, padding: "12px 0",
    }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 7 : 6,
          height: i === current ? 7 : 6,
          borderRadius: "50%",
          background: i === current ? T.txH : T.txD,
          opacity: i === current ? 1 : 0.4,
          transition: "all .2s ease",
        }} />
      ))}
    </div>
  );
}

/* ── Search bar (iOS Spotlight style) ── */
function SearchBar({ onSearch }) {
  const [q, setQ] = useState("");
  return (
    <div style={{ padding: "0 20px 8px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 10,
        background: `${T.txH}10`,
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      }}>
        <span style={{ color: T.txD, display: "flex", flexShrink: 0 }}>{I.search}</span>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="検索"
          style={{
            flex: 1, border: "none", background: "transparent",
            color: T.txH, fontSize: 15, outline: "none",
          }}
        />
      </div>
    </div>
  );
}

/* ── Main View ── */
export function AppGridView({ setView, badges = {} }) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);

  // Swipe handling
  const touchRef = useRef({ x: 0, t: 0 });
  const handleTouchStart = (e) => {
    touchRef.current = { x: e.touches[0].clientX, t: Date.now() };
  };
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dt = Date.now() - touchRef.current.t;
    if (dt < 400 && Math.abs(dx) > 50) {
      if (dx < 0 && page < PAGES.length - 1) setPage(p => p + 1);
      if (dx > 0 && page > 0) setPage(p => p - 1);
    }
  };

  // Scroll snap to page
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: page * scrollRef.current.offsetWidth, behavior: "smooth" });
    }
  }, [page]);

  const onTap = (id) => setView(id);

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Search */}
      <div style={{ padding: "12px 0 4px" }}>
        <SearchBar />
      </div>

      {/* Grid pages */}
      <div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          flex: 1, display: "flex",
          overflowX: "hidden",
          scrollSnapType: "x mandatory",
        }}
      >
        {PAGES.map((apps, pi) => (
          <div key={pi} style={{
            minWidth: "100%", scrollSnapAlign: "start",
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridAutoRows: "min-content",
            gap: "20px 0",
            padding: "12px 16px",
            alignContent: "start",
          }}>
            {apps.map(app => (
              <div key={app.id} style={{ display: "flex", justifyContent: "center" }}>
                <AppIcon
                  app={app}
                  onTap={onTap}
                  badgeCount={app.badge ? (badges[app.badge] || 0) : 0}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Page dots */}
      {PAGES.length > 1 && <PageDots total={PAGES.length} current={page} />}
    </div>
  );
}
