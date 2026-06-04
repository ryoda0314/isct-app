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

// 教室名 → 階(フロア)情報。"M-278"→2F, "W5-106"→1F, "M-B07"→B1F, "建築製図室"→階不明
function floorInfo(room) {
  const dash = room.lastIndexOf("-");
  const part = dash >= 0 ? room.slice(dash + 1) : room;
  const m = part.match(/^(B?)(\d+)/i);
  if (!m) return { label: "階不明", sort: 999 };
  if (m[1]) return { label: "B1F", sort: -1 }; // 地下 (本館B1F等)
  const d = m[2];
  const fl = d.length >= 3 ? parseInt(d.slice(0, d.length - 2)) : parseInt(d[0]);
  if (!fl || Number.isNaN(fl)) return { label: "階不明", sort: 999 };
  return { label: `${fl}F`, sort: fl };
}

// 建物内の教室を階ごとにまとめる
function groupByFloor(list) {
  const m = new Map(); // label -> { sort, rooms[] }
  for (const r of list) {
    const f = floorInfo(r.room);
    if (!m.has(f.label)) m.set(f.label, { sort: f.sort, rooms: [] });
    m.get(f.label).rooms.push(r);
  }
  return [...m.entries()]
    .map(([label, v]) => ({ label, sort: v.sort, rooms: v.rooms }))
    .sort((a, b) => a.sort - b.sort);
}

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

  // ワンタップ用ピル
  const Pill = ({ on, col = T.accent, onClick, children, min }) => (
    <button onClick={onClick} style={{
      padding: mob ? "5px 9px" : "5px 11px", minWidth: min, borderRadius: 7, textAlign: "center",
      border: `1px solid ${on ? col : T.bd}`,
      background: on ? (col === T.accent ? T.accent : `${col}18`) : T.bg2,
      color: on ? (col === T.accent ? "#fff" : col) : T.txD,
      fontSize: mob ? 12 : 12.5, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap",
    }}>{children}</button>
  );
  const Sep = () => <span style={{ width: 1, height: 18, background: T.bd, margin: "0 2px", flexShrink: 0 }} />;
  const selStyle = {
    padding: mob ? "5px 6px" : "5px 8px", borderRadius: 7, border: `1px solid ${T.bd}`,
    background: T.bg2, color: T.txH, fontSize: mob ? 12 : 12.5, fontWeight: 600, cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.bg }}>
      {/* === 固定ヘッダー (中央寄せ・幅固定) === */}
      <div style={{ flexShrink: 0, padding: mob ? "10px 12px 9px" : "12px 20px 11px", borderBottom: `1px solid ${T.bd}`, background: T.bg }}>
        <div style={{ maxWidth: 760, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 7 }}>
          {/* 行1: キャンパス + 年度/Q */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {(data?.campuses || ["大岡山"]).map((c) => (
              <Pill key={c} on={c === campus} onClick={() => { setCampus(c); setAreaFilter(null); }}>{c}</Pill>
            ))}
            <Sep />
            <select value={year} onChange={(e) => setYear(e.target.value)} style={selStyle}>
              {yearOpts.map((y) => <option key={y} value={y}>{y}年度</option>)}
            </select>
            <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={selStyle}>
              {(data?.quarters || ["1Q", "2Q", "3Q", "4Q"]).map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {/* 行2: 曜日 + 時限 + 今 */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {DAYS.map((d, i) => (
              <Pill key={d} on={i === dayIdx} onClick={() => setDayIdx(i)} min={mob ? 30 : 34}>{d}</Pill>
            ))}
            <Sep />
            {SLOT_LABEL.map((lbl, i) => (
              <Pill key={lbl} on={i === slot} onClick={() => setSlot(i)} col={T.accent}>{lbl.replace("限", "")}</Pill>
            ))}
            <button onClick={resetToNow} disabled={isNow} title="現在の曜日・時限に合わせる" style={{
              display: "flex", alignItems: "center", gap: 3, padding: mob ? "5px 8px" : "5px 10px", borderRadius: 7,
              border: `1px solid ${isNow ? T.bd : T.accent}`, background: isNow ? T.bg2 : `${T.accent}15`,
              color: isNow ? T.txD : T.accent, fontSize: mob ? 11.5 : 12.5, fontWeight: 700, cursor: isNow ? "default" : "pointer", opacity: isNow ? 0.6 : 1, whiteSpace: "nowrap",
            }}>{I.clock}今</button>
            <span style={{ fontSize: 11, color: T.txD, marginLeft: 2 }}>{SLOT_TIMES[slot]}</span>
          </div>

          {/* 行3: 表示ステータス + 地域 */}
          {!loading && !error && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <Pill on={status === "free"} col={T.green} onClick={() => setStatus("free")}>空き {freeTotal}</Pill>
              <Pill on={status === "busy"} col={T.red} onClick={() => setStatus("busy")}>使用中 {busyTotal}</Pill>
              <Pill on={status === "all"} col={T.txH} onClick={() => setStatus("all")}>すべて {roomTotal}</Pill>
              {campusAreas.length > 1 && <>
                <Sep />
                <Pill on={areaFilter === null} col={T.txH} onClick={() => setAreaFilter(null)}>全地域</Pill>
                {campusAreas.map((a) => (
                  <Pill key={a} on={a === areaFilter} onClick={() => setAreaFilter(a === areaFilter ? null : a)}>{a}</Pill>
                ))}
              </>}
            </div>
          )}
          {(nc.isWeekend || (nc.offHours && isNow)) && (
            <div style={{ fontSize: 10.5, color: T.txD }}>
              {nc.isWeekend ? "※土日のため月曜を表示" : "※現在は授業時間外"}
            </div>
          )}
        </div>
      </div>

      {/* === スクロール本体 === */}
      <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
                {groupByFloor(list).map(({ label, rooms: fRooms }) => (
                  <div key={label} style={{ marginBottom: 8 }}>
                    {/* 階(フロア)見出し */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 6px 2px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: col, padding: "1px 8px", borderRadius: 5, background: `${col}12`, border: `1px solid ${col}25` }}>{label}</span>
                      <div style={{ flex: 1, height: 1, background: `${col}15` }} />
                      <span style={{ fontSize: 10, color: T.txD }}>{fRooms.length}室</span>
                    </div>
                    {(() => {
                      const hasBusy = fRooms.some((r) => r.busy);
                      const minW = hasBusy ? (mob ? 150 : 220) : (mob ? 92 : 110);
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))`, gap: 6, marginLeft: mob ? 0 : 6 }}>
                          {fRooms.map(({ room, busy, classes }) => busy ? (
                            <div key={room} title={classes.map((c) => `${c.code} ${c.name}`).join(" / ")} style={{
                              display: "flex", flexDirection: "column", gap: 2, padding: "6px 9px", borderRadius: 9,
                              border: `1px solid ${T.red}25`, background: `${T.red}08`, minWidth: 0,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ color: T.red, display: "flex", flexShrink: 0 }}>{I.pin}</span>
                                <span style={{ fontSize: mob ? 12.5 : 13.5, fontWeight: 700, color: T.txH }}>{room}</span>
                              </div>
                              {classes.length === 0
                                ? <span style={{ fontSize: 11, color: T.txD }}>授業あり</span>
                                : <div style={{ display: "flex", alignItems: "baseline", gap: 5, overflow: "hidden", paddingLeft: 2 }}>
                                    {classes[0].code && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.red, flexShrink: 0 }}>{classes[0].code}</span>}
                                    <span style={{ fontSize: 11.5, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {classes[0].name || "（科目名なし）"}{classes.length > 1 ? ` 他${classes.length - 1}` : ""}
                                    </span>
                                  </div>}
                            </div>
                          ) : (
                            <div key={room} title="空き" style={{
                              display: "flex", alignItems: "center", gap: 5, padding: "7px 9px", borderRadius: 9,
                              border: `1px solid ${T.green}30`, background: `${T.green}0c`, minWidth: 0,
                            }}>
                              <span style={{ color: T.green, display: "flex", flexShrink: 0 }}>{I.pin}</span>
                              <span style={{ fontSize: mob ? 12.5 : 13.5, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
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
      </div>
    </div>
  );
};
