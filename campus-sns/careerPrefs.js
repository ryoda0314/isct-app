// キャリアの「自分の興味」と照合（すべて端末の中）。
//
// 興味・条件・保存・既読は localStorage にだけ置き、サーバーにもアカウントにも送らない
// （職業安定法の「特定募集情報等提供」にしないため。計画書 2 章）。公開 API は全件を返すだけで、
// 照合・並べ替え・絞り込みはここで行う。ログアウトしても消さない（accountStorage.js の KEEP_EXACT）。
import { useSyncExternalStore } from "react";
import { DEPT_FIELDS, gradFromYearGroup } from "../lib/career-tags.js";

export const PREFS_KEY = "career_prefs_v1";
export const SEEN_KEY = "career_seen_v1";
export const SAVED_KEY = "career_saved_v1";

export const DEFAULT_PREFS = {
  fields: [], skills: [],
  degree: null, gradYear: null,
  mode: "mine",            // mine = 興味に合うもの / all = すべて
  onlyEligible: true,      // 対象が自分でないとはっきりしているものを除く（書かれていないものは残す）
  cond: { paid: false, remote: false, duration: null, reward: null },
  sort: "match",           // match / deadline / new
  setup: false,            // 初回の案内を閉じたか（選んだ・あとで）
};

const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 容量・プライベートモード */ } };

let prefs = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

export function getPrefs() {
  if (!prefs) {
    const p = read(PREFS_KEY, {});
    prefs = { ...DEFAULT_PREFS, ...p, cond: { ...DEFAULT_PREFS.cond, ...(p.cond || {}) } };
  }
  return prefs;
}

export function setPrefs(patch) {
  const cur = getPrefs();
  const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
  prefs = { ...next, cond: { ...DEFAULT_PREFS.cond, ...(next.cond || {}) } };
  write(PREFS_KEY, prefs);
  notify();
}

export function useCareerPrefs() {
  const p = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, getPrefs, () => DEFAULT_PREFS);
  return [p, setPrefs];
}

// 既読: 最後にキャリアを開いた時刻（ホームの「興味に合う新着」用）
export const getSeenAt = () => read(SEEN_KEY, 0) || 0;
export const markSeen = () => write(SEEN_KEY, Date.now());

/** 所属（yearGroup "25B" など）から学位と卒業年 */
export const targetFromYearGroup = (yg) => gradFromYearGroup(yg);

/** 所属の系から分野の候補（押したときだけ使う） */
export const fieldsForDept = (dept) => DEPT_FIELDS[dept] || [];

export const hasInterests = (p) => (p.fields?.length || 0) + (p.skills?.length || 0) > 0;

/**
 * 掲載と興味の照合。score が大きいほど上。reasons は「なぜ出ているか」のチップ。
 * 一致したと数えるのは分野かスキル。系の歓迎は理由と加点だけ（系で絞らない）。
 */
export function matchListing(item, p, dept) {
  const f = (item.fields || []).filter((x) => p.fields.includes(x));
  const req = (item.skills_req || []).filter((x) => p.skills.includes(x));
  const pref = (item.skills_pref || []).filter((x) => p.skills.includes(x) && !req.includes(x));
  const deptHit = !!dept && (item.depts || []).includes(dept);
  const score = f.length * 2 + req.length + pref.length * 0.5 + (deptHit ? 1 : 0);
  const reasons = [
    ...f.map((id) => ({ t: "field", id })),
    ...req.map((id) => ({ t: "req", id })),
    ...pref.map((id) => ({ t: "pref", id })),
    ...(deptHit ? [{ t: "dept", id: dept }] : []),
  ];
  return { matched: f.length + req.length + pref.length > 0, score, reasons };
}

/** 対象（学位・卒業年）が自分に当てはまるか: ok / no / unknown（書かれていない・自分の情報が無い） */
export function eligibility(item, p) {
  const degs = item.degrees || [], years = item.grad_years || [];
  if (!degs.length && !years.length) return "unknown";
  if (degs.length && p.degree && !degs.includes(p.degree)) return "no";
  if (years.length && p.gradYear && !years.includes(Number(p.gradYear))) return "no";
  if ((degs.length && !p.degree) || (years.length && !p.gradYear)) return "unknown";
  return "ok";
}

/** 締切（無ければ開催日）。並べ替え・表示用 */
export function dueOf(item) {
  if (item.deadline) return Date.parse(`${item.deadline}T23:59:59+09:00`);
  if (item.starts_at) return Date.parse(item.starts_at);
  return null;
}

/** 条件で絞る（種類ごとに意味のある条件だけ効かせる） */
export function passesCond(item, cond) {
  if (cond.paid && item.kind !== "event" && item.pay_kind !== "paid") return false;
  if (cond.remote && !(item.remote === "remote" || item.remote === "hybrid")) return false;
  if (cond.duration && item.kind === "intern" && item.duration !== cond.duration) return false;
  if (cond.reward && item.kind === "event") {
    const k = item.reward_kind;
    if (cond.reward === "money" && !(k === "all" || k === "conditional")) return false;
    if (cond.reward === "prize" && k !== "prize") return false;
    if (cond.reward === "any" && (!k || k === "none")) return false;
  }
  return true;
}

/**
 * 一覧を作る: 種類・条件・対象・モードで絞り、並べ替える。
 * 返り値 { list: [{ item, m, elig }], matchedCount, totalCount }。
 * mode が mine でも、ほかの掲載は「すべて」で必ず見られる（ここでは消さずに件数だけ数える）。
 */
export function buildList(items, p, { kind = "all", dept = null } = {}) {
  const useMine = p.mode === "mine" && hasInterests(p);
  const rows = [];
  let matchedCount = 0, totalCount = 0;
  for (const item of items) {
    if (kind !== "all" && item.kind !== kind) continue;
    if (!passesCond(item, p.cond)) continue;
    const elig = eligibility(item, p);
    if (p.onlyEligible && elig === "no") continue;
    totalCount++;
    const m = matchListing(item, p, dept);
    if (m.matched) matchedCount++;
    if (useMine && !m.matched) continue;
    rows.push({ item, m, elig });
  }
  const due = (r) => dueOf(r.item) ?? Infinity;
  const created = (r) => Date.parse(r.item.created_at || 0) || 0;
  const sort = p.sort === "match" && !useMine ? "deadline" : p.sort;
  rows.sort((a, b) => {
    if (sort === "new") return created(b) - created(a);
    if (sort === "match" && b.m.score !== a.m.score) return b.m.score - a.m.score;
    return due(a) - due(b);
  });
  return { list: rows, matchedCount, totalCount, useMine };
}

// ── 保存（この端末だけ）: id → { title, org, kind, deadline, starts_at, apply_url, savedAt } ──
// 掲載が終わっても名前とリンクを見られるよう、最低限の控えを持つ。
let saved = null;
const savedSubs = new Set();
export function getSaved() { if (!saved) saved = read(SAVED_KEY, {}) || {}; return saved; }
function writeSaved(next) { saved = next; write(SAVED_KEY, saved); savedSubs.forEach((f) => f()); }
export function toggleSaved(item) {
  const next = { ...getSaved() };
  if (next[item.id]) delete next[item.id];
  else next[item.id] = { title: item.title, org: item.org, kind: item.kind, deadline: item.deadline || null, starts_at: item.starts_at || null, apply_url: item.apply_url, savedAt: Date.now() };
  writeSaved(next);
}
export function removeSaved(id) { const next = { ...getSaved() }; delete next[id]; writeSaved(next); }
export function useSaved() {
  return useSyncExternalStore((cb) => { savedSubs.add(cb); return () => savedSubs.delete(cb); }, getSaved, () => ({}));
}

/**
 * 一覧を「興味に合う」と「そのほか」の 2 つに分ける（興味を選んでいなければ全部「そのほか」= すべて）。
 * 2 つとも同じ画面に続けて出すので、合わない募集が見えなくなることはない（計画書 2 章）。
 * test(item) … 画面のキーワード検索（端末の中だけで絞る）
 */
export function buildSections(items, p, { kind = "all", dept = null, test = null } = {}) {
  const interested = hasInterests(p);
  const matched = [], rest = [];
  for (const item of items) {
    if (kind !== "all" && item.kind !== kind) continue;
    if (!passesCond(item, p.cond)) continue;
    const elig = eligibility(item, p);
    if (p.onlyEligible && elig === "no") continue;
    if (test && !test(item)) continue;
    const m = matchListing(item, p, dept);
    (interested && m.matched ? matched : rest).push({ item, m, elig });
  }
  const due = (r) => dueOf(r.item) ?? Infinity;
  const created = (r) => Date.parse(r.item.created_at || 0) || 0;
  const by = (sort) => (a, b) => {
    if (sort === "new") return created(b) - created(a) || due(a) - due(b);
    if (sort === "match" && b.m.score !== a.m.score) return b.m.score - a.m.score;
    return due(a) - due(b);
  };
  matched.sort(by(p.sort === "new" || p.sort === "deadline" ? p.sort : "match"));
  rest.sort(by(p.sort === "new" ? "new" : "deadline"));
  return { matched, rest, interested };
}
