// 時間割例（supabase/timetable-examples.sql）。
// 1行 = 1人 × 年度 × Q。固有番号は moodle_id を HMAC した匿名ID で、moodle_id 自体は保存しない。
// 鍵を持つサーバーは moodle_id から番号を計算できる（＝仮名。オフ・削除・公開切り替えに使う）。
// 書き込み: /api/data/all-meta・/api/data/all がデータ読み込みのたびに recordTimetableExample を呼ぶ。
//   前回の内容の要約（profiles.timetable_examples_sig）は呼び出し側が既に読んでいる profiles 行に入っているので、
//   変わっていなければ DB には一切触らない。変わったときだけ読み書きする。
// 読み出し: 学生向け（履修登録補助）は本人が公開をオンにした行だけ。管理画面は全行。

import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase/server.js';
import { LOCAL_PASSPHRASE } from './config.js';
import { entryFromStudent, resolveAffiliation, SCHOOL_NAMES, DEPT_NAMES } from './student-affiliation.js';

// 匿名IDの鍵は CRED_SECRET から用途別に導出する（CRED_SECRET を変えると全員の番号が変わる）
const ANON_KEY = Buffer.from(crypto.hkdfSync('sha256', LOCAL_PASSPHRASE, '', 'timetable-examples/anon-id', 32));
export const anonIdOf = (moodleId) => crypto.createHmac('sha256', ANON_KEY).update(String(moodleId)).digest('base64url').slice(0, 22);

const CODE_RE = /^[A-Z]{2,4}\.[A-Z]\d{3}$/;
const REQUIREMENTS = new Set(['必修', '選択必修', '選択']);

/**
 * transformCourses の科目 → 年度×Q ごとの行（anon_id・shared 以外）。
 * 除外: 科目コードの無い LMS コース（案内ページ・医歯学系）、申告専用の親コース、
 * Q が今日の月からの推測でしかない科目（別の Q に入ってしまうため）。
 */
export function buildExampleRows(courses, { studentId, yearGroup, dept }) {
  const entry = entryFromStudent(studentId, yearGroup);
  const { schoolKey, deptKey } = resolveAffiliation({ dept, studentId });
  const byKey = new Map();
  for (const c of courses) {
    const year = Number(c.year);
    if (!year || !CODE_RE.test(c.code) || c.section === '申告専用' || c.quarterGuessed) continue;
    const slots = [...new Set([c.per, ...(c.extraSlots || []).map(s => s.per)].filter(p => p && p !== '未設定'))];
    // transformCourses は名前の後ろにセクションを付けている（"機械系基礎実験 B"）ので外す
    const name = c.section && c.name.endsWith(` ${c.section}`) ? c.name.slice(0, -(c.section.length + 1)) : c.name;
    const item = {
      code: c.code, section: c.section || null, name, slots,
      credits: c.credits ?? null,
      requirement: REQUIREMENTS.has(c.requirement) ? c.requirement : null,
    };
    for (const q of (c.quarters?.length ? c.quarters : [c.quarter])) {
      if (!(q >= 1 && q <= 4)) continue;
      const k = `${year}|${q}`;
      if (!byKey.has(k)) byKey.set(k, { year, quarter: q, courses: [] });
      byKey.get(k).courses.push(item);
    }
  }
  return [...byKey.values()].map(({ year, quarter, courses: cs }) => {
    const grade = entry ? year - entry.entryYear + 1 : null;
    const row = {
      year, quarter,
      entry_year: entry?.entryYear ?? null,
      degree: entry?.degree ?? null,
      grade: grade >= 1 && grade <= 9 ? grade : null,
      school: schoolKey,
      dept: deptKey,
      courses: cs.sort((a, b) => a.code.localeCompare(b.code) || String(a.section).localeCompare(String(b.section))),
    };
    row.hash = crypto.createHash('md5')
      .update(JSON.stringify([row.entry_year, row.degree, row.grade, row.school, row.dept, row.courses]))
      .digest('base64url');
    return row;
  });
}

/**
 * 時間割例を記録する。profile = 呼び出し側が読んだ profiles 行（select('*')）。
 * 行が無い・列が未作成（SQL 未実行）・オフにしている・前回と同じ内容 のときは DB に触らない。
 */
export async function recordTimetableExample(userid, courses, { studentId, yearGroup, profile }) {
  if (!profile || !('timetable_examples_sig' in profile) || profile.timetable_examples_opt_out) return;
  const rows = buildExampleRows(courses, { studentId, yearGroup, dept: profile.dept || null });
  if (!rows.length) return;
  const sig = crypto.createHash('md5').update(rows.map(r => `${r.year}|${r.quarter}|${r.hash}`).join(',')).digest('base64url');
  if (profile.timetable_examples_sig === sig) return;

  const sb = getSupabaseAdmin();
  if ((await writeChangedRows(sb, anonIdOf(userid), rows, !!profile.timetable_examples_share)) == null) return;
  const { error: sErr } = await sb.from('profiles').update({ timetable_examples_sig: sig }).eq('moodle_id', userid);
  if (sErr) console.error('[TimetableExamples] sig update failed:', sErr.message);
}

/** 既にある行と hash を比べ、変わった年度×Q だけ書く。成功したら書いた行数、失敗したら null */
async function writeChangedRows(sb, anonId, rows, shared) {
  const years = [...new Set(rows.map(r => r.year))];
  const { data: existing, error: eErr } = await sb.from('timetable_examples')
    .select('year, quarter, hash').eq('anon_id', anonId).in('year', years);
  if (eErr) { console.error('[TimetableExamples] read failed:', eErr.message); return null; }
  const have = new Map((existing || []).map(e => [`${e.year}|${e.quarter}`, e.hash]));
  const changed = rows.filter(r => have.get(`${r.year}|${r.quarter}`) !== r.hash);
  if (changed.length) {
    const now = new Date().toISOString();
    const { error } = await sb.from('timetable_examples')
      .upsert(changed.map(r => ({ anon_id: anonId, ...r, shared, updated_at: now })), { onConflict: 'anon_id,year,quarter' });
    if (error) { console.error('[TimetableExamples] upsert failed:', error.message); return null; }
  }
  return changed.length;
}

/**
 * 旧T2SCHOLA（2024年度以前）の時間割を記録する。/api/data/timetable-past が呼ぶ。
 * 本人が過去の時間割を開いたとき（とプロフィールのボタン）にしか走らないので、profiles はここで読む。
 * 学年は行ごとに「その年度 − 入学年度 + 1」。今のLMSの分の要約（timetable_examples_sig）には触らない。
 * 戻り値: { years: [記録できた年度], rows: 行数, written: 書き換えた行数 } / 記録しなかったら null
 */
export async function recordPastTimetableExamples(userid, courses) {
  const sb = getSupabaseAdmin();
  const { data: profile, error } = await sb.from('profiles').select('*').eq('moodle_id', userid).maybeSingle();
  if (error || !profile || !('timetable_examples_sig' in profile) || profile.timetable_examples_opt_out) return null;
  const rows = buildExampleRows(courses, { studentId: profile.student_id, yearGroup: profile.year_group, dept: profile.dept || null });
  if (!rows.length) return { years: [], rows: 0, written: 0 };
  const written = await writeChangedRows(sb, anonIdOf(userid), rows, !!profile.timetable_examples_share);
  if (written == null) return null;
  return { years: [...new Set(rows.map(r => r.year))].sort(), rows: rows.length, written };
}

export async function deleteTimetableExamples(userid) {
  const { error } = await getSupabaseAdmin().from('timetable_examples').delete().eq('anon_id', anonIdOf(userid));
  if (error) throw error;
}

/** 本人の設定 { optOut: 収集オフ, share: 他の学生に公開 } */
export async function getExampleSettings(userid) {
  const { data, error } = await getSupabaseAdmin().from('profiles')
    .select('timetable_examples_opt_out, timetable_examples_share').eq('moodle_id', userid).maybeSingle();
  if (error) throw error;
  return { optOut: !!data?.timetable_examples_opt_out, share: !!data?.timetable_examples_share };
}

/**
 * 設定を変える。収集をオフにすると記録を消し、公開もオフになる。公開をオンにすると収集もオンになる。
 * 要約も消すので、収集をオンに戻すと次の読み込みで記録し直す。
 */
export async function setExampleSettings(userid, { optOut, share }) {
  const cur = await getExampleSettings(userid);
  const next = { optOut: optOut ?? cur.optOut, share: share ?? cur.share };
  if (optOut === true) next.share = false;
  if (share === true) next.optOut = false;
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('profiles').update({
    timetable_examples_opt_out: next.optOut,
    timetable_examples_share: next.share,
    timetable_examples_sig: null,
  }).eq('moodle_id', userid);
  if (error) throw error;
  if (next.optOut) await deleteTimetableExamples(userid);
  else if (next.share !== cur.share) {
    const { error: uErr } = await sb.from('timetable_examples').update({ shared: next.share }).eq('anon_id', anonIdOf(userid));
    if (uErr) throw uErr;
  }
  return next;
}

/**
 * 学生向け: 公開中の時間割例（本人の分は除く）。新しい年度から。固有番号は返さない。
 * grade は "B2" など。school / dept は任意。
 */
export async function listSharedExamples(sb, userid, { grade, quarter, school, dept, limit = 20 }) {
  const m = String(grade || '').match(/^([BMDR])(\d)$/);
  if (!m || !(quarter >= 1 && quarter <= 4)) return [];
  let q = sb.from('timetable_examples')
    .select('year, quarter, degree, grade, school, dept, courses')
    .eq('shared', true).eq('degree', m[1]).eq('grade', Number(m[2])).eq('quarter', quarter)
    .neq('anon_id', anonIdOf(userid));
  if (school) q = q.eq('school', school);
  if (dept) q = q.eq('dept', dept);
  const { data, error } = await q.order('year', { ascending: false }).order('updated_at', { ascending: false }).limit(Math.min(limit, 50));
  if (error) throw error;
  // 出す項目を明示する（固有番号などを学生側に漏らさない）
  return (data || [])
    .filter(r => Array.isArray(r.courses) && r.courses.length)
    .map(({ year, quarter, degree, grade, school, dept, courses }) => ({ year, quarter, degree, grade, school, dept, courses }));
}

// ── 管理画面 ──

const DEGREE_ORDER = { B: 0, M: 1, D: 2, R: 3 };
const gradeKeyOf = (r) => (r.degree && r.grade ? `${r.degree}${r.grade}` : null);

async function selectAll(build) {
  const PAGE = 1000;
  let out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * 年度・Q（null=全Q）・学院・学系・学年（"B2" など）で絞った時間割例と、その集計。
 * 学年×学院の人数表は学院・学系・学年で絞る前の全体（同じ年度・Q）を返す。
 */
export async function adminTimetableExamples(sb, { year, quarter, school, dept, grade }) {
  const years = [...new Set((await selectAll(() => sb.from('timetable_examples').select('year').order('year', { ascending: false }))).map(r => r.year))];
  const jst = new Date(Date.now() + 9 * 3600000);
  const currentAY = jst.getUTCMonth() >= 3 ? jst.getUTCFullYear() : jst.getUTCFullYear() - 1;
  const y = year || years[0] || currentAY;

  const rows = await selectAll(() => {
    let q = sb.from('timetable_examples').select('anon_id, year, quarter, degree, grade, school, dept, courses, shared, updated_at').eq('year', y);
    if (quarter) q = q.eq('quarter', quarter);
    return q.order('anon_id').order('quarter');
  });

  // 学年 × 学院の人数（重複なし）
  const cells = new Map();
  for (const r of rows) {
    const k = `${gradeKeyOf(r) || ''}|${r.school || ''}`;
    if (!cells.has(k)) cells.set(k, new Set());
    cells.get(k).add(r.anon_id);
  }
  const breakdown = [...cells].map(([k, s]) => { const [g, sc] = k.split('|'); return { grade: g || null, school: sc || null, n: s.size }; });
  const gradeSort = (a, b) => (a == null) - (b == null) || (DEGREE_ORDER[a?.[0]] ?? 9) - (DEGREE_ORDER[b?.[0]] ?? 9) || Number(a?.slice(1)) - Number(b?.slice(1));
  const grades = [...new Set(breakdown.map(c => c.grade))].sort(gradeSort);

  const inSchool = rows.filter(r => !school || r.school === school);
  const deptCounts = {};
  for (const r of inSchool) if (r.dept) (deptCounts[r.dept] ||= new Set()).add(r.anon_id);

  const group = inSchool.filter(r => (!dept || r.dept === dept) && (!grade || gradeKeyOf(r) === grade));
  const n = new Set(group.map(r => r.anon_id)).size;

  const DAY = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4 };
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new Set()));
  const byCode = new Map();
  let courseSum = 0, creditSum = 0, creditRecords = 0;
  for (const r of group) {
    const cs = Array.isArray(r.courses) ? r.courses : [];
    courseSum += cs.length;
    let cr = 0, known = false;
    for (const c of cs) {
      if (!byCode.has(c.code)) byCode.set(c.code, { code: c.code, name: c.name, users: new Set(), slots: {} });
      const agg = byCode.get(c.code);
      agg.users.add(r.anon_id);
      for (const s of c.slots || []) {
        agg.slots[s] = (agg.slots[s] || 0) + 1;
        const m = s.match(/([月火水木金])(\d+)[-–ー](\d+)/);
        if (!m) continue;
        for (let row = Math.floor((m[2] - 1) / 2); row <= Math.floor((m[3] - 1) / 2); row++) {
          if (row >= 0 && row < 5) grid[row][DAY[m[1]]].add(r.anon_id);
        }
      }
      if (c.credits != null) { cr += Number(c.credits); known = true; }
    }
    if (known) { creditSum += cr; creditRecords++; }
  }
  const courses = [...byCode.values()]
    .map(a => ({ code: a.code, name: a.name, n: a.users.size, slots: Object.entries(a.slots).sort((x, z) => z[1] - x[1]).slice(0, 2).map(([s]) => s) }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code))
    .slice(0, 300);
  const examples = [...group]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, 100)
    .map(({ updated_at, ...r }) => r);

  return {
    years, year: y, quarter: quarter || null, n, records: group.length,
    breakdown, grades,
    depts: Object.entries(deptCounts).map(([k, s]) => ({ key: k, n: s.size })).sort((a, b) => b.n - a.n),
    schoolNames: SCHOOL_NAMES, deptNames: DEPT_NAMES,
    avgCourses: group.length ? Math.round((courseSum / group.length) * 10) / 10 : null,
    avgCredits: creditRecords ? Math.round((creditSum / creditRecords) * 10) / 10 : null,
    shared: new Set(group.filter(r => r.shared).map(r => r.anon_id)).size,
    grid: grid.map(row => row.map(s => s.size)),
    courses,
    examples,
  };
}
