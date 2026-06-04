import React, { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { isDemoMode } from "../demoMode.js";

const API = "";

const DAYS = ["月", "火", "水", "木", "金"];
const AREA_ORDER = ["本館・中央", "西地区", "南地区", "東・北地区", "石川台地区", "すずかけ台", "その他"];
const SLOT_LABEL = ["1-2限", "3-4限", "5-6限", "7-8限", "9-10限"];
const SLOT_TIMES = ["8:50–10:30", "10:45–12:25", "13:30–15:10", "15:25–17:05", "17:15–18:55"];
// 各スロットの終了時刻 (分換算) — 現在スロット判定用
const SLOT_END_MIN = [10 * 60 + 30, 12 * 60 + 25, 15 * 60 + 10, 17 * 60 + 5, 18 * 60 + 55];
const DAY_START_MIN = 8 * 60 + 50;

// 建物コード → 表示色 (なんとなく系統で色分け)
const buildingColor = (b) => {
  const palette = ["#6375f0", "#3dae72", "#d4843e", "#a855c7", "#e5534b", "#0ea5e9", "#c6a236", "#14b8a6"];
  let h = 0;
  for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

// JST の現在時刻から (曜日index, スロットindex, 時間外フラグ) を求める
function nowContext() {
  const j = new Date(Date.now() + 9 * 3600000);
  const wd = j.getUTCDay(); // 0=日
  const dayIdx = wd >= 1 && wd <= 5 ? wd - 1 : 0; // 土日は月曜にフォールバック
  const isWeekend = wd === 0 || wd === 6;
  const mins = j.getUTCHours() * 60 + j.getUTCMinutes();
  let slot = 0;
  let offHours = false;
  if (mins < DAY_START_MIN) {
    slot = 0;
  } else {
    const idx = SLOT_END_MIN.findIndex((e) => mins <= e);
    if (idx === -1) {
      slot = 4;
      offHours = true; // 18:55 以降
    } else {
      slot = idx;
    }
  }
  // 月の概算からクォーターを推定 (JST)
  const m = j.getUTCMonth() + 1;
  let q = "1Q";
  if (m >= 4 && m <= 5) q = "1Q";
  else if (m >= 6 && m <= 8) q = "2Q";
  else if (m >= 9 && m <= 11) q = "3Q";
  else q = "4Q"; // 12-3月
  return { dayIdx, slot, offHours, isWeekend, quarter: q };
}

// 学年度 (4月始まり)
function currentAcademicYear() {
  const j = new Date(Date.now() + 9 * 3600000);
  return j.getUTCMonth() >= 3 ? j.getUTCFullYear() : j.getUTCFullYear() - 1;
}

// --- デモ用サンプル (デモモード時のみ使用) ---
const DEMO_DATA = (() => {
  const A = (room, building, campus, area) => ({ room, building, campus, area });
  const rooms = [
    A("W5-104", "W5", "大岡山", "西地区"), A("W5-106", "W5", "大岡山", "西地区"), A("W5-107", "W5", "大岡山", "西地区"),
    A("W9-322", "W9", "大岡山", "西地区"), A("W9-323", "W9", "大岡山", "西地区"), A("W9-324", "W9", "大岡山", "西地区"),
    A("M-B07", "M", "大岡山", "本館・中央"), A("M-110", "M", "大岡山", "本館・中央"), A("M-124", "M", "大岡山", "本館・中央"),
    A("S2-201", "S2", "大岡山", "南地区"), A("S2-203", "S2", "大岡山", "南地区"), A("S2-204", "S2", "大岡山", "南地区"),
    A("I1-256", "I1", "大岡山", "石川台地区"), A("I3-107", "I3", "大岡山", "石川台地区"),
    A("G1-101", "G1", "すずかけ台", "すずかけ台"), A("G1-102", "G1", "すずかけ台", "すずかけ台"),
    A("J2-201", "J2", "すずかけ台", "すずかけ台"), A("J2-202", "J2", "すずかけ台", "すずかけ台"),
    A("B2-301", "B2", "すずかけ台", "すずかけ台"),
  ];
  const empty = () => DAYS.reduce((o, d) => { o[d] = SLOT_TIMES.map(() => []); return o; }, {});
  const occ = { "1Q": empty(), "2Q": empty(), "3Q": empty(), "4Q": empty() };
  const buildings = [...new Set(rooms.map((r) => r.building))];
  const campuses = ["大岡山", "すずかけ台"];
  const areas = ["本館・中央", "西地区", "南地区", "石川台地区", "すずかけ台"];
  // 適当に埋める ({room, classes:[{code,name}]})
  occ["1Q"]["月"][0] = [
    { room: "W5-106", classes: [{ code: "CVE.M203", name: "測量学" }] },
    { room: "M-B07", classes: [{ code: "MAT.P204", name: "物理化学(化学熱力学）" }] },
    { room: "S2-201", classes: [{ code: "TSE.A233", name: "工学計測基礎第二" }] },
  ];
  occ["1Q"]["月"][1] = [
    { room: "W5-107", classes: [{ code: "MCS.T335", name: "数値解析" }] },
    { room: "W9-322", classes: [{ code: "LAL.S204", name: "スペイン語初級４" }] },
  ];
  occ["1Q"]["火"][2] = [
    { room: "M-124", classes: [{ code: "LAS.P104", name: "電磁気学基礎２" }] },
    { room: "S2-204", classes: [{ code: "EEE.C261", name: "制御工学" }] },
  ];
  return { year: String(currentAcademicYear()), rooms, buildings, campuses, areas, quarters: ["1Q", "2Q", "3Q", "4Q"], occ, totalCourses: 0 };
})();

export const FreeRoomView = ({ mob, goToBuilding }) => {
  const nc = useMemo(() => nowContext(), []);
  const [year, setYear] = useState(() => String(currentAcademicYear()));
  const [quarter, setQuarter] = useState(nc.quarter);
  const [dayIdx, setDayIdx] = useState(nc.dayIdx);
  const [slot, setSlot] = useState(nc.slot);
  const [campus, setCampus] = useState("大岡山");
  const [areaFilter, setAreaFilter] = useState(null); // null = 全地域
  const [status, setStatus] = useState("free"); // "free" | "busy" | "all"
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const yearOpts = useMemo(() => {
    const cy = currentAcademicYear();
    return [cy, cy - 1, cy - 2].map(String);
  }, []);

  const load = useCallback((y) => {
    if (isDemoMode()) {
      setData(DEMO_DATA);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API}/api/data/free-rooms?year=${encodeURIComponent(y)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        // 取得したクォーター一覧に現在の選択が無ければ補正
        if (d.quarters && d.quarters.length && !d.quarters.includes(quarter)) {
          setQuarter(d.quarters.includes(nc.quarter) ? nc.quarter : d.quarters[0]);
        }
        // キャンパス一覧に現在の選択が無ければ先頭に補正
        if (d.campuses && d.campuses.length) {
          setCampus((prev) => (d.campuses.includes(prev) ? prev : d.campuses[0]));
        }
      })
      .catch((e) => setError(e.message || "取得に失敗しました"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  const day = DAYS[dayIdx];

  // 選択中スロットの使用中教室 → Map<room, classes[]>
  const occMap = useMemo(() => {
    const arr = data?.occ?.[quarter]?.[day]?.[slot] || [];
    const m = new Map();
    for (const e of arr) m.set(e.room, e.classes || []);
    return m;
  }, [data, quarter, day, slot]);

  // 選択中キャンパスに属する教室・地域
  const campusRooms = useMemo(
    () => (data?.rooms || []).filter((r) => r.campus === campus),
    [data, campus]
  );
  const campusAreas = useMemo(() => {
    const set = new Set(campusRooms.map((r) => r.area));
    return AREA_ORDER.filter((a) => set.has(a));
  }, [campusRooms]);

  // キャンパス内の全教室を 地域 → 建物 で入れ子グルーピング
  const { areaGroups, freeTotal, busyTotal, roomTotal } = useMemo(() => {
    let freeTotal = 0, busyTotal = 0;
    const byArea = new Map(); // area -> Map(building -> rooms[])
    for (const r of campusRooms) {
      const classes = occMap.get(r.room);
      const busy = !!classes;
      if (busy) busyTotal++; else freeTotal++;
      if (status === "free" && busy) continue;
      if (status === "busy" && !busy) continue;
      if (areaFilter && r.area !== areaFilter) continue;
      if (!byArea.has(r.area)) byArea.set(r.area, new Map());
      const bmap = byArea.get(r.area);
      if (!bmap.has(r.building)) bmap.set(r.building, []);
      bmap.get(r.building).push({ room: r.room, busy, classes: classes || [] });
    }
    const areaGroups = [...byArea.entries()]
      .map(([area, bmap]) => {
        const buildings = [...bmap.entries()]
          .map(([building, list]) => ({
            building,
            list: list.sort((a, b) => (a.busy === b.busy ? a.room.localeCompare(b.room) : a.busy ? 1 : -1)),
          }))
          .sort((a, b) => (a.building === "その他" ? 1 : b.building === "その他" ? -1 : a.building.localeCompare(b.building)));
        const count = buildings.reduce((s, b) => s + b.list.length, 0);
        return { area, buildings, count };
      })
      .sort((a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area));
    return { areaGroups, freeTotal, busyTotal, roomTotal: campusRooms.length };
  }, [campusRooms, occMap, areaFilter, status]);

  const isNow = dayIdx === nc.dayIdx && slot === nc.slot && quarter === nc.quarter && year === String(currentAcademicYear());
  const resetToNow = () => {
    setYear(String(currentAcademicYear()));
    setQuarter(nc.quarter);
    setDayIdx(nc.dayIdx);
    setSlot(nc.slot);
  };

  const pill = (active, col = T.accent) => ({
    padding: mob ? "6px 12px" : "6px 14px", borderRadius: 8,
    border: `1px solid ${active ? col : T.bd}`,
    background: active ? `${col}15` : T.bg2,
    color: active ? col : T.txD,
    fontSize: mob ? 12 : 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: mob ? 18 : 20, fontWeight: 800, color: T.txH }}>空き教室</h2>
          <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>
            {loading ? "読み込み中..." : error ? "エラー" : `${campus} ・ ${day}曜 ${SLOT_LABEL[slot]} ・ ${quarter}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <select value={year} onChange={(e) => setYear(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
            {yearOpts.map((y) => <option key={y} value={y}>{y}年度</option>)}
          </select>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
            {(data?.quarters || ["1Q", "2Q", "3Q", "4Q"]).map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
      </div>

      {/* キャンパス選択 */}
      {!loading && !error && (data?.campuses?.length || 0) > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {data.campuses.map((c) => {
            const on = c === campus;
            return (
              <button key={c} onClick={() => { setCampus(c); setAreaFilter(null); }} style={{
                padding: mob ? "7px 16px" : "8px 20px", borderRadius: 10,
                border: `1.5px solid ${on ? T.accent : T.bd}`,
                background: on ? T.accent : T.bg2,
                color: on ? "#fff" : T.txD,
                fontSize: mob ? 13 : 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>{c}</button>
            );
          })}
        </div>
      )}

      {/* 今へ戻る / 時間外案内 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={resetToNow} disabled={isNow} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
          border: `1px solid ${isNow ? T.bd : T.accent}`, background: isNow ? T.bg2 : `${T.accent}15`,
          color: isNow ? T.txD : T.accent, fontSize: 12, fontWeight: 600, cursor: isNow ? "default" : "pointer", opacity: isNow ? 0.7 : 1,
        }}>
          {I.clock}{isNow ? "現在の時間帯" : "今に合わせる"}
        </button>
        {nc.isWeekend && <span style={{ fontSize: 11, color: T.txD }}>※土日は授業がないため月曜を表示中</span>}
        {!nc.isWeekend && nc.offHours && isNow && <span style={{ fontSize: 11, color: T.txD }}>※現在は授業時間外です</span>}
      </div>

      {/* 曜日セレクタ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }}>
        {DAYS.map((d, i) => (
          <button key={d} onClick={() => setDayIdx(i)} style={pill(i === dayIdx)}>{d}</button>
        ))}
      </div>

      {/* 時限セレクタ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
        {SLOT_LABEL.map((lbl, i) => (
          <button key={lbl} onClick={() => setSlot(i)} style={{ ...pill(i === slot), display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.2 }}>
            <span>{lbl}</span>
            <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>{SLOT_TIMES[i]}</span>
          </button>
        ))}
      </div>

      {/* 表示ステータス */}
      {!loading && !error && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setStatus("free")} style={pill(status === "free", T.green)}>空き {freeTotal}</button>
          <button onClick={() => setStatus("busy")} style={pill(status === "busy", T.red)}>使用中 {busyTotal}</button>
          <button onClick={() => setStatus("all")} style={pill(status === "all", T.txH)}>すべて {roomTotal}</button>
        </div>
      )}

      {/* 地域フィルタ (選択中キャンパス内) */}
      {!loading && !error && campusAreas.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
          <button onClick={() => setAreaFilter(null)} style={pill(areaFilter === null, T.txH)}>全地域</button>
          {campusAreas.map((a) => (
            <button key={a} onClick={() => setAreaFilter(a === areaFilter ? null : a)} style={pill(a === areaFilter, T.accent)}>{a}</button>
          ))}
        </div>
      )}

      {/* 本体 */}
      {loading && <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>読み込み中...</div>}
      {!loading && error && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>
          データの取得に失敗しました<br /><span style={{ fontSize: 12 }}>{error}</span>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => load(year)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>再試行</button>
          </div>
        </div>
      )}
      {!loading && !error && areaGroups.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>
          {roomTotal === 0
            ? "教室データがありません"
            : status === "free" ? "この時間に空いている教室はありません"
            : status === "busy" ? "この時間に使用中の教室はありません"
            : "該当する教室はありません"}
        </div>
      )}

      {!loading && !error && areaGroups.map(({ area, buildings, count }) => (
        <div key={area} style={{ marginBottom: 22 }}>
          {/* 地域ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 4, height: 18, borderRadius: 2, background: T.accent }} />
            <div style={{ flex: 1, fontSize: mob ? 15 : 16, fontWeight: 800, color: T.txH }}>{area}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.txD }}>{count}室</span>
          </div>

          {/* 建物ごと */}
          {buildings.map(({ building, list }) => {
            const col = buildingColor(building);
            const canNav = building !== "その他" && typeof goToBuilding === "function";
            return (
              <div key={building} style={{ marginBottom: 14, marginLeft: mob ? 0 : 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "3px 0", borderBottom: `2px solid ${col}30` }}>
                  <div style={{ minWidth: 28, height: 26, padding: "0 8px", borderRadius: 8, background: `${col}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: col }}>{building}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.txH }}>{building === "その他" ? "その他の教室" : `${building} 棟`}</div>
                  {canNav && <button onClick={() => goToBuilding(building)} title={`${building} 棟を地図で見る`}
                    style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", color: col, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                    {I.map}地図
                  </button>}
                  <span style={{ fontSize: 11, fontWeight: 600, color: col, padding: "2px 10px", borderRadius: 6, background: `${col}15` }}>{list.length}室</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map(({ room, busy, classes }) => (
                    <div key={room} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: mob ? "8px 10px" : "9px 12px",
                      borderRadius: 10,
                      border: `1px solid ${busy ? `${T.red}25` : `${T.green}30`}`,
                      background: busy ? `${T.red}08` : `${T.green}0c`,
                    }}>
                      <span style={{ color: busy ? T.red : T.green, display: "flex", flexShrink: 0 }}>{I.pin}</span>
                      <span style={{ fontSize: mob ? 13 : 14, fontWeight: 700, color: T.txH, flexShrink: 0, minWidth: mob ? 64 : 80 }}>{room}</span>
                      {busy ? (
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                          {classes.length === 0
                            ? <span style={{ fontSize: 12, color: T.txD }}>授業あり</span>
                            : classes.map((c, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                                {c.code && <span style={{ fontSize: 11, fontWeight: 700, color: T.red, flexShrink: 0 }}>{c.code}</span>}
                                <span style={{ fontSize: mob ? 12 : 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "（科目名なし）"}</span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.green, padding: "2px 10px", borderRadius: 6, background: `${T.green}18` }}>空き</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ fontSize: 10, color: T.txD, marginTop: 16, lineHeight: 1.6 }}>
        ※ シラバスの授業データから「その時限に授業が割り当てられていない教室」を表示しています。
        補講・会議・予約等の利用は反映されないため、実際の空き状況とは異なる場合があります。
      </div>
    </div>
  );
};
