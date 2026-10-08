import React, { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { isDemoMode } from "../demoMode.js";
import { SPOTS, roomToSpot } from "../hooks/useLocationSharing.js";

const API = "";

const DAYS = ["月", "火", "水", "木", "金"];
const AREA_ORDER = ["本館・中央", "西地区", "南地区", "東・北地区", "石川台地区", "すずかけ台", "その他"];
const SLOT_START = ["8:50", "10:45", "13:30", "15:25", "17:15"];
const SLOT_END = ["10:30", "12:25", "15:10", "17:05", "18:55"];
const SLOT_TIMES = SLOT_START.map((s, i) => `${s}–${SLOT_END[i]}`);
// 各スロットの終了時刻 (分換算) — 現在スロット判定用
const SLOT_END_MIN = [10 * 60 + 30, 12 * 60 + 25, 15 * 60 + 10, 17 * 60 + 5, 18 * 60 + 55];
const DAY_START_MIN = 8 * 60 + 50;

// 建物コード → 名前（キャンパスナビの建物と同じ名前。"W5" → "西5号館"）。
// 喫煙所なども S1 のような記号を持つので、建物の区分のスポットだけから引く
const BUILDING_CATS = new Set(["central", "west", "south", "eastnorth", "ishikawa", "midori"]);
const CODE_NAME = (() => {
  const m = new Map([["M", "本館"]]);
  for (const s of SPOTS) {
    if (!BUILDING_CATS.has(s.cat) || !s.short || m.has(s.short) || !/^[A-Z]{1,3}\d{0,2}[A-Z]?$/.test(s.short)) continue;
    m.set(s.short, s.label.replace(/（.*?）/g, "").replace(/・.*$/, ""));
  }
  return m;
})();
const buildingLabel = (code, campus) => {
  if (code === "その他") return t("freeroom.otherRooms");
  if (campus === "すずかけ台") return t("freeroom.buildingName", { building: code });
  return CODE_NAME.get(code) || code;
};

// 建物名から始まる教室名は、見出しと重なる建物名を省く（"南1号館化学系講義室" → "化学系講義室"）
const roomName = (room) => room.replace(/^(?:大岡山)?(?:西|南|北|東|石川台|石)\d+号館\s*/, "") || room;

// 教室名 → 階(フロア)情報。
// "M-278"→2F, "W5-106"→1F, "M-B07"→B1F, "石川台1号館2階253"→2F,
// "南5号館112"→1F, "SP-2007"→2F, "建築製図室"→階不明
function floorInfo(room) {
  // 1) 明示的な「N階」表記を最優先 (建物番号より優先)
  let m = room.match(/(\d{1,2})\s*階/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 12) return { label: `${n}F`, sort: n }; }
  // 2) 「NF」表記 (前後が英字でない数字+F)
  m = room.match(/(?:^|[^0-9A-Za-z])(\d{1,2})F(?![A-Za-z])/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 12) return { label: `${n}F`, sort: n }; }
  // 3) コード形式: 末尾ハイフン以降の室番号 (先頭桁=階。地下はB始まり)
  const dash = room.lastIndexOf("-");
  const part = dash >= 0 ? room.slice(dash + 1) : room;
  if (/^B\d/i.test(part)) return { label: "B1F", sort: -1 };
  m = part.match(/^(\d{3,4})/);
  if (m) return { label: `${m[1][0]}F`, sort: parseInt(m[1][0]) };
  // 4) 名称室中に現れる3〜4桁の室番号 (南5号館112, 統合創造工房201-A号室, E207)
  m = room.match(/(\d{3,4})/);
  if (m) return { label: `${m[1][0]}F`, sort: parseInt(m[1][0]) };
  return { label: "階不明", sort: 999 };
}

// 建物の中の並び：階 → 室番号
const sortRooms = (list) => list
  .map((r) => ({ r, f: floorInfo(r.room).sort }))
  .sort((a, b) => a.f - b.f || a.r.room.localeCompare(b.r.room, "ja", { numeric: true }))
  .map((x) => x.r);

// その日の5コマのうち、slot から続けて空いている最後のコマ（使用中なら -1）
const freeUntil = (strip, slot) => {
  if (strip[slot]) return -1;
  let e = slot;
  while (e < 4 && !strip[e + 1]) e++;
  return e;
};
// 使用中の教室が次に空くコマ（無ければ -1）
const nextFree = (strip, slot) => {
  for (let i = slot + 1; i < 5; i++) if (!strip[i]) return i;
  return -1;
};
const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");

// キャンパスナビへ（建物のスポットは教室名から引く。"W5-104" → 西5号館）
const spotIdOf = (rooms) => {
  for (const r of rooms) {
    const sp = roomToSpot(r);
    if (sp?.id) return sp.id;
  }
  return null;
};

// 背景の明るさで暗いテーマかを見分ける（切り替えのつまみの色に使う）
const isDarkT = () => {
  const h = String(T.bg || "#ffffff").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};
const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// 教室をクリックしたとき: その教室の週間(曜日×時限)空き状況
function RoomScheduleModal({ sel, occ, quarter, year, mob, nowDay, nowSlot, nowActive, onClose, goToBuilding }) {
  const { room, building, campus } = sel;
  const fl = floorInfo(room).label;
  const bName = buildingLabel(building, campus);
  let freeN = 0;
  const grid = DAYS.map((d) =>
    SLOT_START.map((_, si) => {
      const entry = (occ?.[quarter]?.[d]?.[si] || []).find((e) => e.room === room);
      if (!entry) freeN++;
      return entry || null;
    })
  );
  const spotId = typeof goToBuilding === "function" ? spotIdOf([room]) : null;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", padding: mob ? 0 : 24 }}>
      <div role="dialog" aria-modal="true" aria-label={room} onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, maxHeight: mob ? "88%" : "90%", overflowY: "auto", background: T.bg2,
        borderRadius: mob ? "16px 16px 0 0" : 16, boxShadow: "0 24px 60px rgba(0,0,0,.35)", paddingBottom: mob ? "env(safe-area-inset-bottom)" : 0,
      }}>
        {mob && <div style={{ width: 36, height: 4, borderRadius: 2, background: T.bd, margin: "8px auto 0" }} />}
        {/* 見出し */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: mob ? "12px 16px 0" : "18px 20px 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.txH, lineHeight: 1.3, wordBreak: "break-all" }}>{room}</div>
            <div style={{ fontSize: 12.5, color: T.txD, marginTop: 3, lineHeight: 1.5 }}>
              {bName}{fl !== "階不明" ? ` ・ ${fl}` : ""} ・ {t("freeroom.modalSubtitle", { year, quarter, free: freeN })}
            </div>
          </div>
          <button onClick={onClose} aria-label="close" style={{ width: 32, height: 32, borderRadius: 16, background: T.bg3, border: "none", color: T.tx, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{I.x}</button>
        </div>

        {/* 週間の表 */}
        <div style={{ padding: mob ? "14px 16px 18px" : "16px 20px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto repeat(5, 1fr)", gap: 4 }}>
            <div />
            {DAYS.map((d, di) => {
              const today = nowActive && di === nowDay;
              return (
                <div key={d} style={{ textAlign: "center", fontSize: 12.5, fontWeight: today ? 700 : 600, color: today ? T.accent : T.txD, paddingBottom: 2 }}>{t("dow.s." + d)}</div>
              );
            })}
            {SLOT_START.map((s, si) => (
              <React.Fragment key={s}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.txH, whiteSpace: "nowrap" }}>{t("period.range", { a: 2 * si + 1, b: 2 * si + 2 })}</span>
                  <span style={{ fontSize: 10.5, color: T.txD, fontVariantNumeric: "tabular-nums" }}>{s}</span>
                </div>
                {DAYS.map((d, di) => {
                  const entry = grid[di][si];
                  const isNowCell = nowActive && di === nowDay && si === nowSlot;
                  const c0 = entry?.classes?.[0];
                  return (
                    <div key={d} title={entry ? entry.classes.map((c) => `${c.code} ${c.name}`).join(" / ") : t("freeroom.free")} style={{
                      minHeight: mob ? 48 : 52, borderRadius: 8, padding: "5px 6px", boxSizing: "border-box", minWidth: 0,
                      background: entry ? T.bg3 : `${T.green}17`, boxShadow: isNowCell ? `inset 0 0 0 2px ${T.accent}` : "none",
                      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: entry ? "flex-start" : "center", gap: 1, overflow: "hidden",
                    }}>
                      {entry ? (
                        <>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.tx, maxWidth: "100%", ...ellipsis }}>{c0?.name || c0?.code || t("freeroom.inUse")}</span>
                          {c0?.name && c0?.code && <span style={{ fontSize: 9.5, color: T.txD, maxWidth: "100%", ...ellipsis }}>{c0.code}</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.green }}>{t("freeroom.free")}</span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            {spotId && (
              <button onClick={() => { onClose(); goToBuilding(spotId); }} style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ display: "flex", transform: "scale(.85)" }}>{I.map}</span>{t("freeroom.routeTo", { name: bName })}
              </button>
            )}
            <span style={{ fontSize: 11.5, color: T.txD }}>{t("freeroom.legend")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
// 実際の画面に近い量（約80教室）を、時限ごとの混み具合に合わせて決まった並びで埋める
const DEMO_DATA = (() => {
  const SPEC = [
    ["大岡山", "本館・中央", "M", ["M-110", "M-112", "M-124", "M-134", "M-156", "M-178", "M-278", "M-B07", "M-B43"]],
    ["大岡山", "西地区", "W5", ["W5-104", "W5-106", "W5-107", "W5-108", "W5-201", "W5-202"]],
    ["大岡山", "西地区", "WL1", ["WL1-201", "WL1-301", "WL1-401"]],
    ["大岡山", "西地区", "WL2", ["WL2-101", "WL2-201", "WL2-301", "WL2-401"]],
    ["大岡山", "西地区", "W9", ["W9-321", "W9-322", "W9-323", "W9-324", "W9-325", "W9-326"]],
    ["大岡山", "南地区", "S1", ["南1号館化学系講義室", "南1号館計算機室"]],
    ["大岡山", "南地区", "S2", ["S2-201", "S2-202", "S2-203", "S2-204", "S2-301"]],
    ["大岡山", "南地区", "S3", ["S3-206", "S3-207", "S3-215"]],
    ["大岡山", "南地区", "S4", ["S4-201", "S4-202", "S4-203", "南4号館3階第2演習室"]],
    ["大岡山", "南地区", "S5", ["S5-101", "S5-102", "S5-106", "S5-107"]],
    ["大岡山", "南地区", "S7", ["S7-201", "S7-202"]],
    ["大岡山", "東・北地区", "E1", ["E1-101", "E1-201"]],
    ["大岡山", "石川台地区", "I1", ["I1-255", "I1-256"]],
    ["大岡山", "石川台地区", "I3", ["I3-107", "I3-108", "I3-301"]],
    ["すずかけ台", "すずかけ台", "G1", ["G1-101", "G1-102", "G1-103"]],
    ["すずかけ台", "すずかけ台", "J2", ["J2-201", "J2-202"]],
    ["すずかけ台", "すずかけ台", "B2", ["B2-301", "B2-302"]],
  ];
  const COURSES = [
    ["CSC.T243", "データ構造とアルゴリズム"], ["MCS.T223", "線形代数学第二"], ["LAS.M102", "微分積分学第二"], ["LAS.P104", "電磁気学基礎２"],
    ["EEE.C261", "制御工学"], ["MEC.D211", "材料力学第一"], ["LAL.E331", "英語第三"], ["CVE.M203", "測量学"],
    ["MAT.P204", "物理化学(化学熱力学）"], ["TSE.A233", "工学計測基礎第二"], ["LAH.S101", "哲学A"], ["MCS.T213", "確率と統計"],
    ["LAL.S204", "スペイン語初級４"], ["CSC.T263", "コンピュータアーキテクチャ"], ["MCS.T335", "数値解析"], ["ARC.D201", "建築設計製図第一"],
  ];
  const rooms = SPEC.flatMap(([campus, area, building, list]) => list.map((room) => ({ room, building, campus, area })));
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const BUSY = [0.5, 0.55, 0.45, 0.3, 0.1]; // 時限ごとの混み具合
  const quarters = ["1Q", "2Q", "3Q", "4Q"];
  const occ = {};
  for (const q of quarters) {
    occ[q] = {};
    for (const d of DAYS) {
      occ[q][d] = SLOT_START.map((_, s) => rooms
        .filter((r) => (hash(`${q}${d}${s}${r.room}`) % 1000) / 1000 < BUSY[s])
        .map((r) => {
          const [code, name] = COURSES[hash(`${r.room}${q}${d}${s}c`) % COURSES.length];
          return { room: r.room, classes: [{ code, name }] };
        }));
    }
  }
  const buildings = [...new Set(rooms.map((r) => r.building))];
  return { year: String(currentAcademicYear()), rooms, buildings, campuses: ["大岡山", "すずかけ台"], areas: AREA_ORDER.filter((a) => rooms.some((r) => r.area === a)), quarters, occ, totalCourses: 0 };
})();

// 等幅の切り替え（曜日・時限）。選んだ項目は浮き上がったつまみ、今日・今の時限は文字をアクセント色に
const Segmented = ({ items, value, onChange, mark }) => {
  const thumb = isDarkT() ? T.bg4 : T.bg2;
  return (
    <div role="tablist" style={{ display: "flex", gap: 2, padding: 3, borderRadius: 11, background: T.bg3 }}>
      {items.map((it, i) => {
        const on = i === value;
        const now = mark === i;
        return (
          <button key={i} role="tab" aria-selected={on} className="fr-btn" onClick={() => onChange(i)} style={{
            flex: 1, minWidth: 0, padding: it.sub ? "5px 2px 4px" : "7px 2px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
            background: on ? thumb : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04)" : "none",
            color: now ? T.accent : on ? T.txH : T.tx, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: on || now ? 700 : 600, whiteSpace: "nowrap" }}>{it.label}</span>
            {it.sub && <span style={{ fontSize: 10.5, fontWeight: 500, color: now ? T.accent : T.txD, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{it.sub}</span>}
          </button>
        );
      })}
    </div>
  );
};

export const FreeRoomView = ({ mob, goToBuilding }) => {
  const nc = useMemo(() => nowContext(), []);
  const [year, setYear] = useState(() => String(currentAcademicYear()));
  const [quarter, setQuarter] = useState(nc.quarter);
  const [dayIdx, setDayIdx] = useState(nc.dayIdx);
  const [slot, setSlot] = useState(nc.slot);
  const [campus, setCampus] = useState("大岡山");
  const [areaFilter, setAreaFilter] = useState(null); // null = 全地区
  const [showBusy, setShowBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selRoom, setSelRoom] = useState(null); // {room, building, campus, area} クリックした教室
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
      .catch((e) => setError(e.message || t("freeroom.fetchFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  const day = DAYS[dayIdx];

  // その曜日の時限ごとの使用中教室 → [Map<room, classes[]>] × 5
  const busyBySlot = useMemo(
    () => SLOT_START.map((_, s) => new Map((data?.occ?.[quarter]?.[day]?.[s] || []).map((e) => [e.room, e.classes || []]))),
    [data, quarter, day]
  );

  // 選択中キャンパスの教室（その日の5コマの空き状況つき）
  const campusRooms = useMemo(
    () => (data?.rooms || []).filter((r) => r.campus === campus).map((r) => {
      const strip = busyBySlot.map((m) => m.has(r.room));
      return { ...r, strip, busy: strip[slot], classes: busyBySlot[slot].get(r.room) || [] };
    }),
    [data, campus, busyBySlot, slot]
  );
  const q = norm(query);
  const matchQuery = useCallback(
    (r) => !q || norm(r.room).includes(q) || norm(r.building).includes(q) || norm(buildingLabel(r.building, r.campus)).includes(q),
    [q]
  );

  // 地区ごとの空き数（地区の切り替えに出す）と、表示する教室を 地区 → 建物 にまとめる
  const { areaStats, groups } = useMemo(() => {
    const areaStats = new Map();
    const byArea = new Map();
    for (const r of campusRooms) {
      if (!matchQuery(r)) continue;
      const st = areaStats.get(r.area) || { free: 0, total: 0 };
      st.total++;
      if (!r.busy) st.free++;
      areaStats.set(r.area, st);
      if (areaFilter && r.area !== areaFilter) continue;
      if (r.busy && !showBusy) continue;
      if (!byArea.has(r.area)) byArea.set(r.area, new Map());
      const bmap = byArea.get(r.area);
      if (!bmap.has(r.building)) bmap.set(r.building, []);
      bmap.get(r.building).push(r);
    }
    const groups = [...byArea.entries()]
      .sort((a, b) => AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0]))
      .map(([area, bmap]) => ({
        area,
        buildings: [...bmap.entries()]
          .sort((a, b) => (a[0] === "その他" ? 1 : b[0] === "その他" ? -1 : a[0].localeCompare(b[0], "ja", { numeric: true })))
          .map(([building, list]) => {
            // その建物の（検索で絞った）全教室での空き数
            const all = campusRooms.filter((r) => r.building === building && matchQuery(r));
            return { building, list: sortRooms(list), free: all.filter((r) => !r.busy).length, total: all.length, spotId: spotIdOf(all.map((r) => r.room)) };
          }),
      }));
    return { areaStats, groups };
  }, [campusRooms, matchQuery, areaFilter, showBusy]);

  const campusAreas = useMemo(() => AREA_ORDER.filter((a) => campusRooms.some((r) => r.area === a)), [campusRooms]);
  const isNow = dayIdx === nc.dayIdx && slot === nc.slot && quarter === nc.quarter && year === String(currentAcademicYear());
  const resetToNow = () => {
    setYear(String(currentAcademicYear()));
    setQuarter(nc.quarter);
    setDayIdx(nc.dayIdx);
    setSlot(nc.slot);
  };
  const nowActive = quarter === nc.quarter && year === String(currentAcademicYear());
  const dayMark = nowActive && !nc.isWeekend ? nc.dayIdx : -1;
  const slotMark = nowActive && !nc.isWeekend && !nc.offHours && dayIdx === nc.dayIdx ? nc.slot : -1;

  const dark = isDarkT();
  const hair = dark ? T.bd : `${T.bd}a6`; // 行の区切り線
  const rowH = mob ? 44 : 40;
  const css = `.fr-row{position:relative}.fr-row+.fr-row::before{content:"";position:absolute;left:31px;right:0;top:0;border-top:1px solid ${hair}}.fr-row:hover{background:${T.bg3}}.fr-btn:focus-visible,.fr-row:focus-visible{outline:2px solid ${T.accent};outline-offset:-2px}.fr-chips::-webkit-scrollbar{display:none}`;

  // ── いつ（曜日・時限）──
  const timeBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.txH }}>
            {t("dow.f." + day)} {t("period.range", { a: 2 * slot + 1, b: 2 * slot + 2 })}
          </span>
          <span style={{ fontSize: 13, color: T.txD, fontVariantNumeric: "tabular-nums" }}>{SLOT_TIMES[slot]}</span>
        </div>
        {isNow ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.green, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: T.green, boxShadow: `0 0 0 3px ${T.green}26` }} />{t("freeroom.nowBadge")}
          </span>
        ) : (
          <button className="fr-btn" onClick={resetToNow} title={t("freeroom.nowTooltip")} style={{ height: 28, padding: "0 12px", borderRadius: 14, border: "none", background: `${T.accent}14`, color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
            {t("freeroom.backToNow")}
          </button>
        )}
      </div>
      <Segmented items={DAYS.map((d) => ({ label: t("dow.s." + d) }))} value={dayIdx} onChange={setDayIdx} mark={dayMark} />
      <Segmented items={SLOT_START.map((s, i) => ({ label: t("period.range", { a: 2 * i + 1, b: 2 * i + 2 }), sub: s }))} value={slot} onChange={setSlot} mark={slotMark} />
      {(nc.isWeekend || (nc.offHours && isNow)) && (
        <div style={{ fontSize: 11.5, color: T.txD }}>{nc.isWeekend ? t("freeroom.weekendNote") : t("freeroom.offHoursNote")}</div>
      )}
    </div>
  );

  // ── どこ（検索・キャンパス・年度とクォーター・使用中も表示）──
  const campuses = data?.campuses || ["大岡山"];
  const quarters = data?.quarters?.length ? data.quarters : ["1Q", "2Q", "3Q", "4Q"];
  const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='${encodeURIComponent(T.txD)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
  const selectSt = {
    appearance: "none", WebkitAppearance: "none", height: 34, padding: "0 28px 0 11px", borderRadius: 9, border: `1px solid ${T.bd}`,
    background: `${T.bg2} ${chevron} no-repeat right 10px center`, color: T.txH, fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", fontFamily: "inherit", minWidth: 0,
  };
  const searchBox = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 40, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txD }}>
      <span style={{ display: "flex" }}>{I.search}</span>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("freeroom.search")} aria-label={t("freeroom.search")}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 14, fontFamily: "inherit" }} />
      {query && <button onClick={() => setQuery("")} aria-label="clear" style={{ display: "flex", padding: 0, border: "none", background: "transparent", color: T.txD, cursor: "pointer", transform: "scale(.8)" }}>{I.x}</button>}
    </div>
  );
  const selects = (
    <>
      {campuses.length > 1 && (
        <select value={campus} onChange={(e) => { setCampus(e.target.value); setAreaFilter(null); }} style={{ ...selectSt, flex: mob ? "none" : 1 }} aria-label="campus">
          {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <select value={`${year}|${quarter}`} onChange={(e) => { const [y, qq] = e.target.value.split("|"); setYear(y); setQuarter(qq); }} style={{ ...selectSt, flex: mob ? "none" : 1 }} aria-label="term">
        {yearOpts.flatMap((y) => (y === year ? quarters : ["1Q", "2Q", "3Q", "4Q"]).map((qq) => (
          <option key={`${y}${qq}`} value={`${y}|${qq}`}>{t("freeroom.yearLabel", { year: y })} {qq}</option>
        )))}
      </select>
    </>
  );
  const busySwitch = (
    <button role="switch" aria-checked={showBusy} className="fr-btn" onClick={() => setShowBusy((v) => !v)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 0, border: "none", background: "transparent", borderRadius: 6,
      color: T.tx, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", width: mob ? "auto" : "100%",
    }}>
      {t("freeroom.showBusy")}
      <span style={{ width: 36, height: 22, borderRadius: 11, background: showBusy ? T.accent : T.bg4, position: "relative", flexShrink: 0, transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 2, left: showBusy ? 16 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
      </span>
    </button>
  );

  // ── 地区（スマホは横に並べてスクロール、PC は縦の一覧）──
  const areaItems = [{ key: null, label: t("freeroom.allAreas") }, ...campusAreas.map((a) => ({ key: a, label: a }))];
  const statOf = (key) => {
    if (key) return areaStats.get(key) || { free: 0, total: 0 };
    let free = 0, total = 0;
    for (const v of areaStats.values()) { free += v.free; total += v.total; }
    return { free, total };
  };
  const areaChips = campusAreas.length > 1 && (
    <div className="fr-chips" style={mob
      ? { display: "flex", gap: 6, overflowX: "auto", margin: "0 -12px", padding: "0 12px", scrollbarWidth: "none" }
      : { display: "flex", flexDirection: "column", gap: 2 }}>
      {areaItems.map(({ key, label }) => {
        const on = areaFilter === key;
        const n = statOf(key).free;
        return (
          <button key={label} className="fr-btn" onClick={() => setAreaFilter(key)} style={mob ? {
            flexShrink: 0, display: "flex", alignItems: "baseline", gap: 5, padding: "6px 12px", borderRadius: 20,
            border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}14` : T.bg2, color: on ? T.accent : T.tx,
            fontSize: 12.5, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
          } : {
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "none",
            background: on ? `${T.accent}14` : "transparent", color: on ? T.accent : T.tx, fontSize: 13.5, fontWeight: on ? 700 : 500,
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          }}>
            <span style={{ flex: mob ? "none" : 1 }}>{label}</span>
            <span style={{ fontSize: mob ? 11.5 : 12.5, fontWeight: 500, color: on ? T.accent : T.txD, fontVariantNumeric: "tabular-nums" }}>{n}</span>
          </button>
        );
      })}
    </div>
  );

  // ── 教室の行（描画のたびに部品を作り直さないよう、ただの関数で描く）──
  const roomRow = (r) => {
    const until = freeUntil(r.strip, slot);
    const nf = r.busy ? nextFree(r.strip, slot) : -1;
    const c0 = r.classes[0];
    return (
      <button key={r.room} className="fr-row" onClick={() => setSelRoom({ room: r.room, building: r.building, campus: r.campus, area: r.area })} title={`${r.room} — ${t("freeroom.clickForWeek")}`} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: rowH, padding: "0 14px", border: "none",
        background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: r.busy ? "transparent" : T.green, boxShadow: r.busy ? `inset 0 0 0 1.5px ${T.bd}` : "none" }} />
        <span style={{ fontSize: 15, fontWeight: 500, color: r.busy ? T.txD : T.txH, minWidth: 0, flexShrink: r.busy ? 0 : 1, maxWidth: r.busy ? "55%" : "none", ...ellipsis }}>{roomName(r.room)}</span>
        {r.busy && <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.txD, ...ellipsis }}>{c0 ? (c0.name || c0.code) : t("freeroom.hasClass")}</span>}
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 13, color: T.txD, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {!r.busy ? t("freeroom.until", { time: SLOT_END[until] }) : nf >= 0 ? t("freeroom.freeFrom", { time: SLOT_START[nf] }) : t("freeroom.noFreeAfter")}
        </span>
      </button>
    );
  };

  // ── 建物のカード ──
  const buildingCard = ({ building, list, free, total, spotId }) => {
    const name = buildingLabel(building, campus);
    const canNav = !!spotId && typeof goToBuilding === "function";
    return (
      <div key={building} style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 14, overflow: "hidden", breakInside: "avoid", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 50, padding: canNav ? "0 8px 0 14px" : "0 14px", borderBottom: `1px solid ${hair}` }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: T.txH, minWidth: 0, ...ellipsis }}>{name}</span>
          {name !== building && building !== "その他" && <span style={{ fontSize: 12, fontWeight: 600, color: T.txD, flexShrink: 0 }}>{building}</span>}
          <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12.5, color: T.txD, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            <b style={{ fontWeight: 700, color: free ? T.txH : T.txD }}>{free}</b> / {t("freeroom.roomCount", { n: total })}
          </span>
          {canNav && (
            <button className="fr-btn" onClick={() => goToBuilding(spotId)} title={t("freeroom.mapTooltip", { name })} aria-label={t("freeroom.mapTooltip", { name })} style={{
              width: 34, height: 34, borderRadius: 10, border: "none", background: T.bg3, color: T.tx, cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ display: "flex", transform: "scale(.85)" }}>{I.map}</span>
            </button>
          )}
        </div>
        {list.map(roomRow)}
      </div>
    );
  };

  const body = (
    <>
      {loading && <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>{t("common.loading")}</div>}
      {!loading && error && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 14 }}>
          {t("freeroom.loadError")}<br /><span style={{ fontSize: 12 }}>{error}</span>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => load(year)} style={{ height: 34, padding: "0 16px", borderRadius: 9, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t("freeroom.retry")}</button>
          </div>
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 16px", color: T.txD, fontSize: 14, lineHeight: 1.7 }}>
          {campusRooms.length === 0 ? t("freeroom.emptyNoData") : q ? t("freeroom.emptyNoMatch") : t("freeroom.emptyNoFree")}
          {!showBusy && campusRooms.length > 0 && !q && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowBusy(true)} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t("freeroom.showBusy")}</button>
            </div>
          )}
        </div>
      )}
      {!loading && !error && groups.map(({ area, buildings }, gi) => (
        <section key={area} style={{ marginTop: gi === 0 && !mob ? 2 : 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 4px 8px" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.txH }}>{area}</h3>
            <span style={{ fontSize: 12, color: T.txD }}>{t("freeroom.statusFree", { n: statOf(area).free })}</span>
          </div>
          <div style={mob ? undefined : { columnWidth: 300, columnGap: 12 }}>
            {buildings.map(buildingCard)}
          </div>
        </section>
      ))}
      {!loading && !error && (
        <div style={{ fontSize: 11, color: T.txD, margin: "14px 4px 0", lineHeight: 1.6 }}>{t("freeroom.disclaimer")}</div>
      )}
    </>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.bg }}>
      <style>{css}</style>
      {mob ? (
        <>
          {/* スマホ：いつ（曜日・時限）だけを上に固定し、ほかは一覧と一緒に流れる */}
          <div style={{ flexShrink: 0, padding: "10px 12px 12px", background: T.bg, borderBottom: `1px solid ${hair}`, zIndex: 2 }}>
            {timeBlock}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {searchBox}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {selects}
                <div style={{ flex: 1 }} />
                {busySwitch}
              </div>
              {areaChips}
            </div>
            {body}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24, padding: "16px 20px 0", maxWidth: 1320, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {/* PC：左に条件（いつ・どこ・地区）、右に結果 */}
          <aside style={{ width: 296, flexShrink: 0, overflowY: "auto", paddingBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}` }}>{timeBlock}</div>
            {searchBox}
            <div style={{ display: "flex", gap: 6 }}>{selects}</div>
            <div style={{ padding: "0 2px" }}>{busySwitch}</div>
            {areaChips && <div style={{ padding: 6, borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}` }}>{areaChips}</div>}
          </aside>
          <main style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingBottom: 24 }}>
            {body}
          </main>
        </div>
      )}

      {selRoom && (
        <RoomScheduleModal
          sel={selRoom} occ={data?.occ} quarter={quarter} year={year} mob={mob}
          nowDay={nc.dayIdx} nowSlot={nc.slot}
          nowActive={nowActive}
          onClose={() => setSelRoom(null)} goToBuilding={goToBuilding}
        />
      )}
    </div>
  );
};
