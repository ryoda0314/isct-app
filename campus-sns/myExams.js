// 「自分の試験」まわりの共通処理（画面を持たない。サーバーの all-meta からも使う）。
//
// - matchMyExams: 公開の試験日程のうち、履修している科目のもの（以前は試験・ホーム・カレンダーに同じ判定が 3 つあった）
// - matchMyClasses: 試験期間中の授業・補講（/api/exams?classes=1）のうち、履修している科目のもの
// - periodTimes: 「3-4」→ 10:45〜12:25 のような時限の時刻
// - 自分用の修正: 日時・教室を自分で直す／載っていない試験を自分の試験に加える／外す。端末に保存する（exam_prefs_v1）。
//   公式の値が修正したあとで変わったら conflict を立て、画面で「公式に合わせる／自分の修正を残す」を選べるようにする。

const normQ = (q) => { if (q == null || q === "") return ""; const m = String(q).match(/(\d)/); return m ? m[1] : ""; };
// 試験日(YYYY-MM-DD)が属する年度: 4月〜翌3月が同一年度
const examAY = (ds) => { const [y, m] = ds.split("-").map(Number); return m - 1 >= 3 ? y : y - 1; };
const courseInYQ = (c, ey, eq) => {
  if (ey && (!c.year || String(c.year) !== ey)) return false;
  if (eq) {
    // 複数クォーター科目(例:1-2Q)は該当する全クォーターにマッチ
    const qs = c.quarters && c.quarters.length ? c.quarters.map(String) : c.quarter == null ? [] : [normQ(c.quarter)];
    if (!qs.includes(eq)) return false;
  }
  return true;
};
// 枝番のある科目（LAL.C203-04）は枝番まで、ない科目はベースコードで比べる
const sameCourse = (c, row) => (c.codeRaw && c.codeRaw !== c.code ? c.codeRaw === row.code_raw : !!c.code && c.code === row.code);

/** 公開の試験のうち履修している科目のもの。年度・クォーターもそろえる */
export function matchMyExams(exams, courses) {
  if (!courses?.length || !exams?.length) return [];
  return exams.filter((e) => {
    const ey = e.year == null ? "" : String(e.year);
    const eq = normQ(e.quarter);
    // 試験の年度と、日付の年度が一致すること（2026年度の試験→2026年度の日付にだけ）
    if (ey && e.date && String(examAY(e.date)) !== ey) return false;
    return courses.some((c) => courseInYQ(c, ey, eq) && sameCourse(c, e));
  });
}

/** 試験期間中の授業・補講のうち履修している科目のもの。block = /api/exams の examWeekClasses */
export function matchMyClasses(block, courses) {
  if (!block?.classes?.length || !courses?.length) return [];
  const ey = String(block.year || ""), eq = normQ(block.quarter);
  return block.classes.filter((cl) => courses.some((c) => courseInYQ(c, ey, eq) && sameCourse(c, cl)));
}

/** その授業・試験に当たる履修科目（色・建物を借りる） */
export const courseOf = (row, courses) => (courses || []).find((c) => sameCourse(c, row)) || null;

// 時限の時刻（1〜10 限。11 限以降は時刻が分からないので null）
const SLOTS = [["08:50", "10:30"], ["10:45", "12:25"], ["13:30", "15:10"], ["15:25", "17:05"], ["17:15", "18:55"]];
/** "3-4" → { start: "10:45", end: "12:25" }。分からなければ null */
export function periodTimes(period) {
  const m = String(period || "").match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2] || m[1]);
  const s = SLOTS[Math.ceil(a / 2) - 1], e = SLOTS[Math.ceil(b / 2) - 1];
  return s && e ? { start: s[0], end: e[1] } : null;
}

// ── 自分用の修正 ──

const PREFS_KEY = "exam_prefs_v1";
export const PREF_FIELDS = ["date", "period", "room"];
const EMPTY = { edits: {}, linked: {}, hidden: {} };

/**
 * 試験を見分けるキー。公式の日時が変わっても同じ試験と分かるよう、日時ではなく
 * 年度・クォーター・科目コード（＋同じ科目の何番目の試験か）で作る。
 */
const baseKey = (e) => `${e.year}-${e.quarter}|${e.code_raw || e.code}`;
/** 試験の配列にまとめてキーを振る（Map: 試験 → キー） */
export function examKeys(all) {
  const groups = new Map();
  for (const e of all || []) {
    const b = baseKey(e);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(e);
  }
  const keys = new Map();
  for (const [b, list] of groups) {
    list.sort((x, y) => `${x.date}|${x.period}`.localeCompare(`${y.date}|${y.period}`))
      .forEach((e, i) => keys.set(e, i > 0 ? `${b}|${i}` : b));
  }
  return keys;
}
/** 1 つの試験のキー（all はその試験を含む公開の試験全部） */
export const examKeyOf = (e, all) => examKeys(all || [e]).get(e) || baseKey(e);

export function loadExamPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    return v && typeof v === "object" ? { ...EMPTY, ...v } : { ...EMPTY };
  } catch { return { ...EMPTY }; }
}

export function saveExamPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  try { window.dispatchEvent(new Event("exam-prefs-changed")); } catch {}
}

const snapOf = (e) => ({ code: e.code, code_raw: e.code_raw, name: e.name, date: e.date, day: e.day, period: e.period, room: e.room, instructor: e.instructor, year: e.year, quarter: e.quarter });
const dowOf = (ds) => (ds ? ["日", "月", "火", "水", "木", "金", "土"][new Date(`${ds}T00:00:00`).getDay()] : null);

/** 修正を保存する（fields に公式と同じ値だけが残ったら修正を消す） */
export function setExamEdit(prefs, exam, key, fields) {
  const edits = { ...prefs.edits };
  const official = exam._official || snapOf(exam);
  const changed = {};
  for (const f of PREF_FIELDS) if (fields[f] != null && fields[f] !== "" && fields[f] !== official[f]) changed[f] = fields[f];
  if (Object.keys(changed).length) edits[key] = { fields: changed, base: Object.fromEntries(PREF_FIELDS.map((f) => [f, official[f] ?? null])), snap: snapOf(official), at: new Date().toISOString() };
  else delete edits[key];
  return { ...prefs, edits };
}

/** 公式に合わせる（修正を消す） */
export const clearExamEdit = (prefs, key) => { const edits = { ...prefs.edits }; delete edits[key]; return { ...prefs, edits }; };

/** 自分の修正を残す（今の公式の値を「修正したときの公式」として覚え直す） */
export function keepExamEdit(prefs, key, current) {
  const ed = prefs.edits[key];
  if (!ed) return prefs;
  return { ...prefs, edits: { ...prefs.edits, [key]: { ...ed, base: Object.fromEntries(PREF_FIELDS.map((f) => [f, current?.[f] ?? null])), snap: current ? snapOf(current) : ed.snap } } };
}

export const linkExam = (prefs, key, exam) => { const hidden = { ...prefs.hidden }; delete hidden[key]; return { ...prefs, hidden, linked: { ...prefs.linked, [key]: snapOf(exam) } }; };
export const unlinkExam = (prefs, key) => { const linked = { ...prefs.linked }; delete linked[key]; return { ...prefs, linked }; };
export const hideExam = (prefs, key) => { const linked = { ...prefs.linked }; delete linked[key]; return { ...prefs, linked, hidden: { ...prefs.hidden, [key]: true } }; };
export const unhideExam = (prefs, key) => { const hidden = { ...prefs.hidden }; delete hidden[key]; return { ...prefs, hidden }; };

/**
 * 自分の試験に修正・追加・非表示を当てる。
 * @param myExams matchMyExams の結果（公式の値）
 * @param allExams 読み込んである公開の試験全部（追加した試験・消えた試験を探すのに使う）
 * @returns 試験の配列。各要素に _key、修正があれば _official（公式の値）・_edited（直した項目）・_conflict（公式が後から変わった項目）、
 *          自分で加えた試験に _linked、公式から消えた試験に _gone を付ける
 */
export function applyExamPrefs(myExams, allExams, prefs) {
  const p = prefs || EMPTY;
  const all = allExams || [];
  const loadedYQ = new Set(all.map((e) => `${e.year}-${e.quarter}`));
  const keys = examKeys(all);
  const byKey = new Map([...keys].map(([e, k]) => [k, e]));
  const out = [];
  const seen = new Set();
  const push = (e, extra = {}) => {
    const key = keys.get(e) || baseKey(e);
    if (seen.has(key) || p.hidden[key]) return;
    seen.add(key);
    const ed = p.edits[key];
    if (!ed) { out.push({ ...e, ...extra, _key: key }); return; }
    const merged = { ...e, ...extra, ...ed.fields, _key: key, _official: snapOf(e), _edited: Object.keys(ed.fields) };
    if (ed.fields.date) merged.day = dowOf(ed.fields.date);
    merged._conflict = Object.keys(ed.fields).filter((f) => (ed.base?.[f] ?? null) !== (e[f] ?? null));
    out.push(merged);
  };
  for (const e of myExams || []) push(e);
  for (const [key, snap] of Object.entries(p.linked || {})) {
    const cur = byKey.get(key);
    if (cur) push(cur, { _linked: true });
    else if (loadedYQ.has(`${snap.year}-${snap.quarter}`) && !seen.has(key)) { seen.add(key); out.push({ ...snap, _key: key, _linked: true, _gone: true }); }
  }
  // 修正した試験が公式から消えたとき: 読み込んだクォーターの中なら、修正したときの内容で残して知らせる
  for (const [key, ed] of Object.entries(p.edits || {})) {
    if (seen.has(key) || byKey.has(key) || p.hidden[key] || !ed.snap) continue;
    if (!loadedYQ.has(`${ed.snap.year}-${ed.snap.quarter}`)) continue;
    seen.add(key);
    out.push({ ...ed.snap, ...ed.fields, _key: key, _official: ed.snap, _edited: Object.keys(ed.fields), _conflict: [], _gone: true });
  }
  return out.sort((a, b) => `${a.date}|${a.period}`.localeCompare(`${b.date}|${b.period}`));
}
