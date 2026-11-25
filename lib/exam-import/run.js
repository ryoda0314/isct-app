// 大学公式の期末試験時間割 PDF を取り込む（cron と管理画面の両方から呼ぶ）。
//
// 1. PDF を取ってきて sha256 を前回と比べる（同じなら何もしない。force で強制）
// 2. parsePdf.js で行にし、validateParsed の検査に通らなければ書かない
// 3. 期末試験・「授業&試験」は exam_schedules へ。変わった行だけ upsert し、
//    前回この取り込みが入れた行のうち今回の PDF から消えた行だけ消す（手で足した行・seed には触らない）
// 4. 「授業」（試験期間中の授業・補講）は site_settings の exam_week_classes_<年度>_<nQ> に JSON で置く
// 5. 状態（ハッシュ・確認日時・件数・問題）は site_settings の exam_import_state に残す
//
// 書き込みは差分だけなので、PDF が変わらない日は状態 1 行の更新で済む（Nano のディスク IO 対策）。
import crypto from 'node:crypto';
import { parseExamTimetablePdf, validateParsed } from './parsePdf.js';
import { EXAM_SOURCES, STATE_KEY, classesKey } from './keys.js';

export { EXAM_SOURCES, STATE_KEY, classesKey };

const FIELDS = ['code', 'name', 'day', 'room', 'instructor'];
const keyOf = (r) => `${r.code_raw}|${r.date}|${r.period}`;

async function fetchPdf(url, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; exam-timetable-check)' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function readSetting(sb, key) {
  const { data, error } = await sb.from('site_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`site_settings read ${key}: ${error.message}`);
  return data?.value ?? null;
}

async function writeSetting(sb, key, value) {
  const { error } = await sb.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`site_settings write ${key}: ${error.message}`);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb service role
 * @param {{ dryRun?: boolean, force?: boolean, fetchImpl?: typeof fetch, pdfs?: Record<string, Uint8Array> }} opts
 *   pdfs: テスト用。level → PDF の中身（渡すと取りに行かない）
 * @returns {Promise<{ dryRun: boolean, sources: Array }>}
 */
export async function runExamImport(sb, { dryRun = false, force = false, fetchImpl = fetch, pdfs = null } = {}) {
  const now = new Date().toISOString();
  const state = (await readSetting(sb, STATE_KEY)) || { sources: {} };
  state.sources = state.sources || {};
  const results = [];
  const parsed = []; // { src, prev, year, quarter, exams, classes }

  for (const src of EXAM_SOURCES) {
    const prev = state.sources[src.level] || {};
    const r = { level: src.level, url: src.url, status: 'error', problems: [] };
    results.push(r);
    try {
      const buf = pdfs ? pdfs[src.level] : await fetchPdf(src.url, fetchImpl);
      if (!buf) { r.status = 'skipped'; continue; }
      // メンテナンス画面の HTML などが返ってきたときは解析しない
      if (String.fromCharCode(...buf.slice(0, 4)) !== '%PDF') throw new Error('not a PDF');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      r.sha256 = sha256;
      if (!force && prev.sha256 === sha256) {
        r.status = 'unchanged';
        Object.assign(r, { year: prev.year, quarter: prev.quarter });
        state.sources[src.level] = { ...prev, checkedAt: now };
        continue;
      }
      // pdf.js は渡したバッファを切り離す（空になる）ので、コピーを渡す
      const res = await parseExamTimetablePdf(new Uint8Array(buf), src.level);
      const problems = validateParsed(res);
      const year = String(res.academicYear), quarter = `${res.quarter}Q`;
      Object.assign(r, { year, quarter, rows: res.rows.length });
      if (problems.length) {
        r.status = 'invalid';
        r.problems = problems.slice(0, 30);
        state.sources[src.level] = { ...prev, checkedAt: now, lastProblem: { at: now, sha256, problems: r.problems } };
        continue;
      }
      const exams = res.rows.filter((x) => x.kind === 'exam' || x.kind === 'class_exam').map((x) => ({
        code: x.code, code_raw: x.code_raw, name: x.name, date: x.date, day: x.day, period: x.period,
        room: x.room || null, instructor: x.instructor || null, year, quarter,
      }));
      const classes = res.rows.filter((x) => x.kind === 'class').map((x) => ({
        code: x.code, code_raw: x.code_raw, name: x.name, name_en: x.name_en || null, date: x.date, day: x.day,
        period: x.period, room: x.room || null, instructor: x.instructor || null, level: src.level,
      }));
      Object.assign(r, { exams: exams.length, classes: classes.length });
      parsed.push({ src, prev, sha256, year, quarter, exams, classes, r });
    } catch (e) {
      r.status = 'error';
      r.problems = [String(e?.message || e)];
      state.sources[src.level] = { ...prev, checkedAt: now, lastProblem: { at: now, problems: r.problems } };
    }
  }

  // 年度・クォーターごとに DB と突き合わせる
  const byQ = new Map();
  for (const p of parsed) {
    const k = `${p.year}|${p.quarter}`;
    if (!byQ.has(k)) byQ.set(k, []);
    byQ.get(k).push(p);
  }
  for (const [, group] of byQ) {
    const { year, quarter } = group[0];
    const { data: existingRows, error } = await sb.from('exam_schedules')
      .select('id, code, code_raw, name, date, day, period, room, instructor, created_by')
      .eq('year', year).eq('quarter', quarter);
    if (error) throw new Error(`exam_schedules read: ${error.message}`);
    const existing = new Map((existingRows || []).map((x) => [keyOf(x), x]));

    for (const p of group) {
      const upserts = [], added = [], updated = [];
      for (const row of p.exams) {
        const ex = existing.get(keyOf(row));
        if (!ex) { upserts.push(row); added.push(keyOf(row)); continue; }
        const changed = FIELDS.filter((f) => (ex[f] || null) !== (row[f] || null));
        if (changed.length) { upserts.push(row); updated.push(`${keyOf(row)} (${changed.join(',')})`); }
      }
      // 前回この取り込みが同じ年度・クォーターに入れた行のうち、今回の PDF に無いもの
      const newKeys = new Set(p.exams.map(keyOf));
      const prevKeys = (p.prev.year === year && p.prev.quarter === quarter && Array.isArray(p.prev.examKeys)) ? p.prev.examKeys : [];
      let stale = prevKeys.filter((k) => !newKeys.has(k) && existing.has(k) && existing.get(k).created_by == null);
      if (prevKeys.length && p.exams.length < prevKeys.length * 0.5) {
        p.r.problems.push(`exam rows dropped from ${prevKeys.length} to ${p.exams.length}; not deleting anything`);
        stale = [];
      }
      Object.assign(p.r, { added, updated, removed: stale });

      // 試験期間中の授業: この課程のぶんだけ入れ替える
      const ckey = classesKey(year, quarter);
      const cur = (await readSetting(sb, ckey)) || { classes: [] };
      const others = (cur.classes || []).filter((c) => c.level !== p.src.level);
      const mine = (cur.classes || []).filter((c) => c.level === p.src.level);
      const classesChanged = JSON.stringify(mine) !== JSON.stringify(p.classes);
      p.r.classesChanged = classesChanged;

      if (!dryRun) {
        if (upserts.length) {
          const { error: e1 } = await sb.from('exam_schedules').upsert(upserts.map((x) => ({ ...x, updated_at: now })), { onConflict: 'code_raw,date,period' });
          if (e1) throw new Error(`exam_schedules upsert: ${e1.message}`);
        }
        if (stale.length) {
          const ids = stale.map((k) => existing.get(k).id);
          const { error: e2 } = await sb.from('exam_schedules').delete().in('id', ids);
          if (e2) throw new Error(`exam_schedules delete: ${e2.message}`);
        }
        if (classesChanged) {
          const sources = { ...(cur.sources || {}), [p.src.level]: { url: p.src.url, page: p.src.page, sha256: p.sha256, importedAt: now } };
          await writeSetting(sb, ckey, { year, quarter, updatedAt: now, sources, classes: [...others, ...p.classes] });
        }
      }
      p.r.status = 'imported';
      state.sources[p.src.level] = {
        sha256: p.sha256, checkedAt: now, importedAt: now, year, quarter,
        counts: { exams: p.exams.length, classes: p.classes.length },
        examKeys: [...newKeys],
      };
    }
  }

  if (!dryRun) await writeSetting(sb, STATE_KEY, state);
  return { dryRun, at: now, sources: results };
}
