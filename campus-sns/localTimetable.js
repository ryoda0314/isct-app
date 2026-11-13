// ============================================================
// 「時間割をつくる」の保存と、アプリの時間割形式への変換（ログイン任意化 Phase 6）
//
// 保存（localStorage mytt_v1）: { [年度]: [entry] }
//   entry = { id, code, section, name, credits, quarters:[1..4], slots:[{ day:'月', ps:1, pe:2, room }], free?:true }
// これを LMS の時間割と同じ形（授業オブジェクト・qData）に直して App に渡すと、
// 時間割・ホームの今日の授業・カレンダー・自分の試験・教科書/成績評価の「自分の」・出欠・検索がそのまま動く。
// 使うのは「LMS の時間割がない人」（ゲスト・LMS に授業が無いアカウント）だけ（App.jsx）。
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { buildTimetable } from "../lib/transform/timetable-builder.js";
import { roomToBuildingId, roomToLabel } from "../lib/transform/course-transform.js";

const KEY = "mytt_v1";
const EVT = "sct:mytt-changed";
const PALETTE = ["#6375f0", "#e5534b", "#3dae72", "#d4843e", "#a855c7", "#2d9d8f", "#c75d8e", "#c6a236", "#61afef", "#e06c75", "#98c379", "#c678dd", "#d19a66", "#56b6c2"];

export function loadMyTT() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function saveMyTT(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  try { window.dispatchEvent(new Event(EVT)); } catch {}
}

export const entriesOf = (data, year) => data?.[year] || [];

/** 1 年度分を書き換える（fn は旧配列 → 新配列） */
export function updateYear(year, fn) {
  const data = loadMyTT();
  const next = fn(entriesOf(data, year));
  if (next.length) data[year] = next; else delete data[year];
  saveMyTT(data);
}

/** "1-2Q" → [1,2]、"3Q" → [3]、分からなければ fallback */
export function quartersOf(q, fallback) {
  const m = String(q || "").match(/^(\d)(?:-(\d))?Q$/);
  if (!m) return [fallback];
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** シラバスの 1 セクション → entry */
export function entryFromSection(course, sec, fallbackQ) {
  return {
    id: `${course.code}_${sec.section || "-"}`,
    code: course.code,
    section: sec.section || null,
    name: course.name,
    credits: course.credits ?? null,
    quarters: quartersOf(sec.quarter, fallbackQ),
    slots: (sec.slots || []).map((s) => ({ day: s.day, ps: s.period_start, pe: s.period_end || s.period_start, room: s.room || "" })),
  };
}

export const slotLabel = (s) => `${s.day}${s.ps}-${s.pe}`;
const hashIdx = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETTE.length; };

/** entry → 授業オブジェクト（lib/transform/course-transform.js の transformCourses と同じ形） */
export function toCourse(e, year) {
  const [first, ...rest] = e.slots || [];
  const room = first?.room || "";
  return {
    id: `local_${e.id}`,
    local: true, // 端末の時間割の授業（LMS の教材・課題は無い）
    moodleId: null,
    code: e.code || "",
    codeRaw: e.code || "",
    section: e.section || null,
    name: e.name,
    per: first ? slotLabel(first) : "未設定",
    room: room || "未設定",
    col: PALETTE[hashIdx(e.code || e.name)],
    mem: 0,
    quarter: e.quarters?.[0] || 1,
    quarters: e.quarters || [],
    quarterGuessed: false,
    year: Number(year),
    periodStart: first?.ps ?? null,
    periodEnd: first?.pe ?? null,
    building: roomToBuildingId(room),
    bldg: roomToLabel(room),
    extraSlots: rest.map((s) => ({ per: slotLabel(s), room: s.room || "" })),
    syllabusUrl: null,
    credits: e.credits ?? null,
    requirement: null,
  };
}

export function toCoursesAndQData(data) {
  const courses = [];
  for (const [year, list] of Object.entries(data || {})) for (const e of list) courses.push(toCourse(e, year));
  const qData = {};
  for (const q of [1, 2, 3, 4]) {
    const C = courses.filter((c) => (c.quarters?.length ? c.quarters.includes(q) : c.quarter === q));
    qData[q] = { C, TT: buildTimetable(C) };
  }
  return { courses, qData };
}

/** App 用: 端末の時間割（変更を購読） */
export function useLocalTimetable() {
  const [data, setData] = useState(() => (typeof window === "undefined" ? {} : loadMyTT()));
  useEffect(() => {
    const h = () => setData(loadMyTT());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener("storage", h); };
  }, []);
  return useMemo(() => ({ data, ...toCoursesAndQData(data) }), [data]);
}
