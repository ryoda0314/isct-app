// ============================================================
// 履修登録補助（RegView）と「時間割をつくる」（TTBuilderView）で共有するロジック（ログイン任意化 Phase 6）
//
// 曜日・時限の扱いは時間割画面（TTView）・サーバーの buildTimetable と同じ:
//   5 日（月〜金）× 5 コマ（1-2 / 3-4 / 5-6 / 7-8 / 9-10 限）。マスの位置は [曜日index, コマindex]。
// ============================================================
import { useState, useEffect } from "react";

const DAY_INDEX = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4 };

/** シラバス DB の時限 { day:'月', period_start, period_end } → マスの位置 [[曜日, コマ], ...]（5-8 限のような 2 コマ分も） */
export const toGridSlots = (s) => {
  const di = DAY_INDEX[s.day];
  if (di == null) return [];
  const startPi = Math.floor((s.period_start - 1) / 2);
  const endPi = Math.floor(((s.period_end || s.period_start) - 1) / 2);
  const out = [];
  for (let pi = startPi; pi <= endPi; pi++) if (pi >= 0 && pi < 5) out.push([di, pi]);
  return out;
};

/** 選んだ科目（各 c に sel:[[曜日,コマ],...]）→ 5×5 のマス。同じマスに 2 つ目が来たら conflict に先客の名前を入れる */
export function buildGrid(active) {
  const g = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const c of active) for (const s of c.sel) {
    const prev = g[s[1]][s[0]];
    if (prev) g[s[1]][s[0]] = { ...c, conflict: prev.name };
    else g[s[1]][s[0]] = c;
  }
  return g;
}

/** 縦に続く同じ科目のマスを 1 つにまとめる → [{ di, pi, c, span }] */
export function mergeCells(grid) {
  const entries = [];
  const visited = new Set();
  for (let pi = 0; pi < 5; pi++) for (let di = 0; di < 5; di++) {
    if (visited.has(`${pi}-${di}`)) continue;
    const c = grid[pi][di];
    let span = 1;
    if (c && !c.conflict) {
      for (let pj = pi + 1; pj < 5; pj++) {
        const next = grid[pj][di];
        if (next && next.id === c.id && !next.conflict) { span++; visited.add(`${pj}-${di}`); }
        else break;
      }
    }
    entries.push({ di, pi, c, span });
  }
  return entries;
}

/**
 * 科目名・コードで学年をまたいで検索（/api/data/reg-courses?search=）。2 文字以上で 300ms 後に取りに行く。
 * 戻り値: { cats: null（未検索）| [{ name, courses:[{ name, code, credits, sections:[{ section, quarter, slots:[{day,period_start,period_end,room}] }] }] }], loading }
 */
export function useRegCourseSearch(year, quarter, search) {
  const [cats, setCats] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!search || search.length < 2) { setCats(null); setLoading(false); return; }
    setLoading(true);
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/data/reg-courses?year=${year}&quarter=${quarter}&search=${encodeURIComponent(search)}`)
        .then((r) => r.json()).then((d) => { if (live) { setCats(d.categories || []); setLoading(false); } })
        .catch(() => { if (live) { setCats([]); setLoading(false); } });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [search, quarter, year]);
  return { cats, loading };
}
