import { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { openMaterial } from "../openMaterial.js";

// ── Static facility info (hours + official links) ──
const FACILITIES = [
  {
    id: "taki", spotId: "taki", name: "Taki Plaza", sub: "Hisao & Hiroko Taki Plaza",
    hours: [
      { label: "平日", time: "8:30 – 21:00" },
      { label: "土日祝", time: "9:00 – 20:00" },
      { label: "長期休暇中(8/9/2/3月)", time: "平日 8:30–21:00 / 土 11:00–17:00 / 日祝 閉館" },
    ],
    links: [
      { label: "学生向け案内", url: "https://www.titech.ac.jp/student-support/students/facilities/takiplaza" },
      { label: "TAKI PLAZA 公式", url: "https://takiplaza.gakumu.titech.ac.jp/" },
    ],
  },
  {
    id: "lib", spotId: "lib", name: "大岡山図書館", sub: "附属図書館",
    hours: [
      { label: "平日", time: "8:45 – 21:00" },
      { label: "土日", time: "11:00 – 20:00" },
      { label: "備考", time: "試験期は延長 / 夏季は短縮。正確な日程はカレンダー参照" },
    ],
    links: [
      { label: "公式サイト", url: "https://www.libra.titech.ac.jp/" },
      { label: "図書館カレンダー", url: "https://www.libra.titech.ac.jp/calendar" },
    ],
  },
];

// Spaces that students use freely until a reservation kicks them out.
const FREE_USE = /WORK\s*POD|ワークショップ/i;

const pad = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

const dowColor = (dow) => dow === "日" ? "#ef4444" : dow === "土" ? "#3b82f6" : T.txH;

/**
 * Given today's reservation slots and current time (minutes), figure out the
 * "退出時刻" — when the next reservation forces you out.
 */
function computeNextEviction(slots, nowMin) {
  const sorted = [...slots].sort((a, b) => toMin(a.start) - toMin(b.start));
  for (const s of sorted) {
    if (toMin(s.start) <= nowMin && nowMin < toMin(s.end)) {
      return { state: "occupied", until: s.end, slot: s };
    }
  }
  const next = sorted.find((s) => toMin(s.start) > nowMin);
  if (next) {
    return { state: "next", at: next.start, minsUntil: toMin(next.start) - nowMin, slot: next };
  }
  return { state: "free" };
}

export const FacilityReservationView = ({ mob, onNavigate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // 'portal' | 'fetch' | 'grid'
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [showInfo, setShowInfo] = useState(false);

  // tick the clock every minute so "あとN分" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/data/facility-reservations?date=${toYMD(targetDate)}&b=1`, { credentials: "include" });
      if (!r.ok) {
        setError(r.status === 400 ? "portal" : "fetch");
        setLoading(false);
        return;
      }
      const d = await r.json();
      if (d?.error) { setError("grid"); setLoading(false); return; }
      setData(d);
    } catch { setError("fetch"); }
    setLoading(false);
  }, [targetDate]);

  useEffect(() => { load(); }, [load]);

  const openLink = (url) => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });

  const todayISO = toISO(now);
  const todayIdx = data?.days?.findIndex((d) => d.date === todayISO) ?? -1;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // ── Header ──
  const Header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.accent}14`, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}>
        {I.clock}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: mob ? 17 : 19, fontWeight: 800, color: T.txH }}>スペース予約状況</div>
        <div style={{ fontSize: 12, color: T.txD }}>Taki Plaza ・ 追い出される時間をチェック</div>
      </div>
      <button onClick={load} title="再取得" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, cursor: "pointer" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
    </div>
  );

  const wrap = (children) => (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ padding: mob ? "16px 14px 40px" : "24px 28px 48px", maxWidth: 900, margin: "0 auto", boxSizing: "border-box" }}>
        {Header}
        {children}
      </div>
    </div>
  );

  if (error === "portal") {
    return wrap(
      <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>
        ポータル（マトリクス認証）が設定されていません。<br />
        セットアップ画面からポータルアカウントとマトリクスカードを登録してください。
      </div>
    );
  }
  if (error === "fetch" || error === "grid") {
    return wrap(
      <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 13, lineHeight: 1.8 }}>
        予約状況を取得できませんでした。<br />
        ポータルのメンテナンス中か、通信に問題がある可能性があります。
        <div><button onClick={load} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>再試行</button></div>
      </div>
    );
  }
  if (loading || !data) {
    return wrap(
      <div style={{ textAlign: "center", padding: 60, color: T.txD, fontSize: 13 }}>
        <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "mnSpin .6s linear infinite", verticalAlign: "middle", marginRight: 10 }} />
        予約状況を読み込み中…
      </div>
    );
  }

  // sort: free-use spaces first
  const sortedSpaces = [...data.spaces].sort((a, b) => {
    const fa = FREE_USE.test(`${a.group} ${a.name}`) ? 0 : 1;
    const fb = FREE_USE.test(`${b.group} ${b.name}`) ? 0 : 1;
    return fa - fb;
  });

  const showSummary = todayIdx >= 0;

  return wrap(
    <>
      {/* ── Facility info (collapsible) ── */}
      <div style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, overflow: "hidden" }}>
        <button onClick={() => setShowInfo((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: "transparent", border: "none", cursor: "pointer", color: T.txH, fontSize: 14, fontWeight: 600, textAlign: "left" }}>
          <span style={{ color: T.accent, display: "flex" }}>{I.book}</span>
          <span style={{ flex: 1 }}>施設案内（開館時間・公式リンク）</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showInfo ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {showInfo && (
          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
            {FACILITIES.map((f) => (
              <div key={f.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: T.txD }}>{f.sub}</span>
                  {onNavigate && (
                    <button onClick={() => onNavigate(f.spotId)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 7, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txD, fontSize: 11, cursor: "pointer" }}>
                      <span style={{ display: "flex" }}>{I.pin}</span>地図
                    </button>
                  )}
                </div>
                {f.hours.map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: T.tx, padding: "1px 0" }}>
                    <span style={{ color: T.txD, minWidth: 132, flexShrink: 0 }}>{h.label}</span>
                    <span>{h.time}</span>
                  </div>
                ))}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {f.links.map((l) => (
                    <button key={l.url} onClick={() => openLink(l.url)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {l.label}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Eviction summary (today) ── */}
      {showSummary && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.txD, letterSpacing: .4, marginBottom: 8 }}>
            今日（{data.days[todayIdx]?.dow}）の空き状況・退出時刻
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 8 }}>
            {sortedSpaces.map((sp, i) => {
              const ev = computeNextEviction(sp.slots[todayIdx] || [], nowMin);
              const free = FREE_USE.test(`${sp.group} ${sp.name}`);
              let col = T.green, label = "現在 空き", detail = "本日この後の予約なし";
              if (ev.state === "occupied") { col = T.red; label = "予約中"; detail = `${ev.until} まで使用中（${ev.slot.title}）`; }
              else if (ev.state === "next") {
                col = ev.minsUntil <= 30 ? T.orange : T.accent;
                label = `あと ${ev.minsUntil}分で退出`;
                detail = `次の予約 ${ev.at}〜（${ev.slot.title}）`;
              }
              return (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: T.bg2, border: `1px solid ${free ? `${col}40` : T.bd}`, borderLeft: `3px solid ${col}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    {sp.group && <span style={{ fontSize: 10, color: T.txD, background: T.bg3, padding: "1px 5px", borderRadius: 4 }}>{sp.group}</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{sp.name}</span>
                    {free && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: `${T.accent}15`, padding: "1px 5px", borderRadius: 4 }}>自由利用</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{label}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Week navigation ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
        <button onClick={() => setWeekOffset((w) => w - 1)} style={navBtn}>‹ 前週</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>
          {data.weekStart && data.weekEnd ? `${data.weekStart.replace(/-/g, "/").slice(5)} 〜 ${data.weekEnd.replace(/-/g, "/").slice(5)}` : "今週"}
          {weekOffset === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: T.accent }}>今週</span>}
        </span>
        <button onClick={() => setWeekOffset((w) => w + 1)} style={navBtn}>翌週 ›</button>
      </div>

      {/* ── Week grid ── */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", border: `1px solid ${T.bd}`, borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 2, background: T.bg2, minWidth: 110, textAlign: "left" }}>スペース</th>
              {data.days.map((d, i) => (
                <th key={i} style={{ ...thStyle, background: i === todayIdx ? `${T.accent}12` : T.bg2 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: i === todayIdx ? T.accent : dowColor(d.dow) }}>{d.date ? parseInt(d.date.slice(8)) : ""}</div>
                  <div style={{ fontSize: 10, color: i === todayIdx ? T.accent : dowColor(d.dow), opacity: .8 }}>{d.dow}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedSpaces.map((sp, ri) => (
              <tr key={ri}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 1, background: T.bg, textAlign: "left", verticalAlign: "top" }}>
                  {sp.group && <div style={{ fontSize: 9, color: T.txD }}>{sp.group}</div>}
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.txH }}>{sp.name}</div>
                </td>
                {sp.slots.map((daySlots, di) => (
                  <td key={di} style={{ ...tdStyle, verticalAlign: "top", background: di === todayIdx ? `${T.accent}07` : "transparent" }}>
                    {daySlots.length === 0 ? (
                      <span style={{ color: T.txD, opacity: .4, fontSize: 11 }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {daySlots.map((s, si) => (
                          <div key={si} style={{ fontSize: 10.5, lineHeight: 1.3, padding: "3px 5px", borderRadius: 5, background: `${T.red}10`, borderLeft: `2px solid ${T.red}90` }}>
                            <div style={{ fontWeight: 700, color: T.txH }}>{s.start}–{s.end}</div>
                            <div style={{ color: T.txD, overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: T.txD, marginTop: 10, lineHeight: 1.6 }}>
        ※ 教務 施設予約システムの週表示を取得して表示しています。最新の状況は数分遅れる場合があります。
      </div>
    </>
  );
};

const navBtn = { padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const thStyle = { padding: "8px 6px", borderBottom: `2px solid ${T.bd}`, textAlign: "center", fontSize: 11, color: T.txD, fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "6px 6px", borderBottom: `1px solid ${T.bd}`, borderLeft: `1px solid ${T.bd}`, textAlign: "center", fontSize: 11 };
