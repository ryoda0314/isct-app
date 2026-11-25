// 期末試験時間割 PDF の取り込み（lib/exam-import）の確認。
//   node scripts/test-exam-import.mjs
//
// 1. 資料/ にある公式 PDF（2025 2Q・4Q、2026 2Q・3Q）を解析し、supabase/exam-seed-*.sql と行ごとに照合する
//    （2025 年の seed は手で縮めていた: 教員名の「※」・「他」でまとめた教員・科目名の副題・教室の注記を落としている。
//     そこはキー・曜日・科目名の先頭だけを比べる。2026 年の seed は全項目が一致すること）
// 2. runExamImport を偽の Supabase で動かし、差分だけ書く・前回取り込んだ行だけ消す・検査に落ちたら書かない、を確かめる
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExamTimetablePdf, validateParsed } from '../lib/exam-import/parsePdf.js';
import { runExamImport, STATE_KEY, classesKey } from '../lib/exam-import/run.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => new Uint8Array(fs.readFileSync(path.join(root, p)));
const keyOf = (r) => `${r.code_raw}|${r.date}|${r.period}`;

function parseSeed(sql) {
  return [...sql.matchAll(/^\s*\((.+)\),?\s*(--.*)?$/gm)].map((m) => {
    const v = [...m[1].matchAll(/'((?:[^']|'')*)'|NULL/g)].map((x) => (x[1] == null ? null : x[1].replace(/''/g, "'")));
    const [code, code_raw, name, date, day, period, room, instructor, year, quarter] = v;
    return { code, code_raw, name, date, day, period, room, instructor, year, quarter };
  }).filter((r) => r.date);
}

// ── 1. 公式 PDF と seed の照合 ──
const CASES = [
  { pdfs: [['資料/life-undergraduate-exam-timetable_2025_2Q.pdf', 'undergraduate']], seed: 'supabase/exam-seed-2025-2q.sql', ay: 2025, q: 2, abridged: true },
  { pdfs: [['資料/life-undergraduate-exam-timetable_2025_4Q.pdf', 'undergraduate']], seed: 'supabase/exam-seed-2025-4q.sql', ay: 2025, q: 4, abridged: true },
  { pdfs: [['資料/life-undergraduate-exam-timetable.pdf', 'undergraduate']], seed: 'supabase/exam-seed-2026-2q.sql', ay: 2026, q: 2 },
  {
    pdfs: [['資料/life-undergraduate-exam-timetable_2026_3Q.pdf', 'undergraduate'], ['資料/life-graduate-exam-timetable_2026_3Q.pdf', 'graduate']],
    seed: 'supabase/exam-seed-2026-3q.sql', ay: 2026, q: 3, withClassExam: true,
  },
];
const parsedBySeed = {};
for (const c of CASES) {
  const seed = parseSeed(fs.readFileSync(path.join(root, c.seed), 'utf8'));
  const rows = [];
  for (const [p, level] of c.pdfs) {
    const res = await parseExamTimetablePdf(read(p), level);
    assert.equal(res.academicYear, c.ay, `${p}: academic year`);
    assert.equal(res.quarter, c.q, `${p}: quarter`);
    assert.deepEqual(validateParsed(res), [], `${p}: validation problems`);
    rows.push(...res.rows);
  }
  parsedBySeed[c.seed] = rows;
  const exams = rows.filter((r) => r.kind === 'exam' || (c.withClassExam && r.kind === 'class_exam'));
  const want = new Map(seed.map((s) => [keyOf(s), s]));
  for (const r of exams) {
    const s = want.get(keyOf(r));
    assert.ok(s, `${c.seed}: parsed exam not in seed: ${keyOf(r)}`);
    want.delete(keyOf(r));
    assert.equal(r.day, s.day, `${keyOf(r)}: weekday`);
    if (c.abridged) {
      assert.ok(r.name.startsWith(s.name), `${keyOf(r)}: name "${r.name}" should start with "${s.name}"`);
      continue;
    }
    assert.equal(r.name, s.name, `${keyOf(r)}: name`);
    assert.equal(r.room || null, s.room || null, `${keyOf(r)}: room`);
    assert.equal(r.instructor || null, s.instructor || null, `${keyOf(r)}: instructor`);
  }
  assert.equal(want.size, 0, `${c.seed}: seed rows not parsed: ${[...want.keys()].slice(0, 5).join(' ')}`);
  const kinds = rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {});
  console.log(`ok  ${c.seed}: ${exams.length} exams match (${JSON.stringify(kinds)})`);
}

// 3Q の補講（授業）行の中身を少し確かめる
const q3 = parsedBySeed['supabase/exam-seed-2026-3q.sql'];
const cls = q3.filter((r) => r.kind === 'class');
assert.equal(cls.length, 190);
assert.ok(cls.some((r) => r.code_raw === 'LAE.E133-01' && r.date === '2026-11-25' && r.period === '1-2' && r.room === 'M-155'));
// 表の外の改訂メモ（「11/16(月)追加」）は講義室に入れない
assert.ok(!q3.some((r) => /追加|修正|\d+\/\d+/.test(r.room || '')));
// 講義室の結合セルは同じ科目の全セクションに入る
const b103 = q3.filter((r) => r.code === 'LAS.B103' && r.date === '2026-12-02');
assert.equal(b103.length, 8);
assert.ok(b103.every((r) => r.room === 'M-110,M-178,M-278,M-374（詳細はLMS要確認）'));
console.log('ok  3Q classes, revision notes, merged room cell');

// ── 2. runExamImport（偽の Supabase）──
function fakeSupabase({ exams = [], settings = {} } = {}) {
  const db = { exam_schedules: exams.map((r, i) => ({ id: i + 1, created_by: null, ...r })), site_settings: Object.entries(settings).map(([key, value]) => ({ key, value })) };
  let nextId = db.exam_schedules.length + 1;
  const writes = [];
  const table = (name) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(col, val) { filters.push((r) => String(r[col]) === String(val)); return q; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return q; },
      maybeSingle() { const r = db[name].filter((x) => filters.every((f) => f(x))); return Promise.resolve({ data: r[0] || null, error: null }); },
      then(resolve) { resolve({ data: db[name].filter((x) => filters.every((f) => f(x))), error: null }); },
      upsert(rows, { onConflict }) {
        const cols = onConflict.split(',');
        for (const row of [].concat(rows)) {
          writes.push({ op: 'upsert', table: name, row });
          const hit = db[name].find((x) => cols.every((c) => x[c] === row[c]));
          if (hit) Object.assign(hit, row); else db[name].push({ id: nextId++, created_by: null, ...row });
        }
        return Promise.resolve({ error: null });
      },
      delete() {
        return { in(col, vals) { writes.push({ op: 'delete', table: name, vals }); db[name] = db[name].filter((x) => !vals.includes(x[col])); return Promise.resolve({ error: null }); } };
      },
    };
    return q;
  };
  return { from: table, db, writes };
}

const pdfs = { undergraduate: read('資料/life-undergraduate-exam-timetable_2026_3Q.pdf'), graduate: read('資料/life-graduate-exam-timetable_2026_3Q.pdf') };
const seed3q = parseSeed(fs.readFileSync(path.join(root, 'supabase/exam-seed-2026-3q.sql'), 'utf8'));

// (a) seed がすでに入っている本番と同じ状態: 試験は 1 行も書かない。補講と状態だけ書く
{
  const sb = fakeSupabase({ exams: seed3q });
  const res = await runExamImport(sb, { pdfs });
  for (const s of res.sources) {
    assert.equal(s.status, 'imported', `${s.level}: ${s.problems}`);
    assert.equal(s.added.length + s.updated.length + s.removed.length, 0, `${s.level}: no exam changes expected`);
  }
  assert.equal(sb.writes.filter((w) => w.table === 'exam_schedules').length, 0);
  const stored = sb.db.site_settings.find((x) => x.key === classesKey('2026', '3Q')).value;
  assert.equal(stored.classes.length, 190);
  assert.deepEqual([...new Set(stored.classes.map((c) => c.level))].sort(), ['graduate', 'undergraduate']);
  const state = sb.db.site_settings.find((x) => x.key === STATE_KEY).value;
  assert.equal(state.sources.undergraduate.counts.exams, 187);
  assert.equal(state.sources.graduate.counts.exams, 18);

  // 同じ PDF をもう一度: 何も解析せず unchanged（状態の確認日時だけ更新）
  const before = sb.writes.length;
  const again = await runExamImport(sb, { pdfs });
  assert.deepEqual(again.sources.map((s) => s.status), ['unchanged', 'unchanged']);
  assert.deepEqual(sb.writes.slice(before).map((w) => w.row?.key), [STATE_KEY]);
  console.log('ok  import over existing seed writes nothing; same PDF → unchanged');
}

// (b) 空の DB: 205 行入る。dryRun では何も書かない
{
  const sb = fakeSupabase();
  const dry = await runExamImport(sb, { pdfs, dryRun: true });
  assert.equal(dry.sources[0].added.length, 187);
  assert.equal(sb.writes.length, 0);
  await runExamImport(sb, { pdfs });
  assert.equal(sb.db.exam_schedules.filter((r) => r.year === '2026' && r.quarter === '3Q').length, 205);
  console.log('ok  empty DB → 205 rows; dry run writes nothing');
}

// (c) 前回この取り込みが入れた行が PDF から消えたら消す。手で足した行（created_by あり）と、取り込みが入れていない行は残す
{
  const ghost = { code: 'ZZZ.A100', code_raw: 'ZZZ.A100', name: '消えた試験', date: '2026-11-27', day: '金', period: '1-2', room: 'M-110', instructor: null, year: '2026', quarter: '3Q' };
  const manual = { ...ghost, code_raw: 'ZZZ.A101', code: 'ZZZ.A101', name: '手で足した試験', created_by: 42 };
  const seedOnly = { ...ghost, code_raw: 'ZZZ.A102', code: 'ZZZ.A102', name: 'seed にだけある試験' };
  const sb = fakeSupabase({
    exams: [...seed3q, ghost, manual, seedOnly],
    settings: { [STATE_KEY]: { sources: { undergraduate: { sha256: 'old', year: '2026', quarter: '3Q', examKeys: [...seed3q.slice(0, 187).map(keyOf), keyOf(ghost), keyOf(manual)] } } } },
  });
  const res = await runExamImport(sb, { pdfs });
  assert.deepEqual(res.sources[0].removed, [keyOf(ghost)]);
  assert.ok(!sb.db.exam_schedules.some((r) => r.code_raw === 'ZZZ.A100'));
  assert.ok(sb.db.exam_schedules.some((r) => r.code_raw === 'ZZZ.A101'));
  assert.ok(sb.db.exam_schedules.some((r) => r.code_raw === 'ZZZ.A102'));
  console.log('ok  stale rows: only rows this importer added are deleted');
}

// (d) 教室が変わった行だけ upsert する
{
  const changed = seed3q.map((r) => (r.code_raw === 'LAL.C203-04' ? { ...r, room: 'W9-999' } : r));
  const sb = fakeSupabase({ exams: changed });
  const res = await runExamImport(sb, { pdfs });
  assert.deepEqual(res.sources[0].updated, ['LAL.C203-04|2026-11-25|1-2 (room)']);
  const ups = sb.writes.filter((w) => w.table === 'exam_schedules');
  assert.equal(ups.length, 1);
  assert.equal(ups[0].row.room, 'M-B104');
  console.log('ok  changed room → one upsert');
}

// (e) PDF でないもの・壊れた PDF は書かない
{
  const sb = fakeSupabase({ exams: seed3q });
  const res = await runExamImport(sb, { pdfs: { undergraduate: new TextEncoder().encode('<html>maintenance</html>'), graduate: null } });
  assert.equal(res.sources[0].status, 'error');
  assert.equal(res.sources[1].status, 'skipped');
  assert.equal(sb.writes.filter((w) => w.table === 'exam_schedules').length, 0);
  console.log('ok  broken source → no exam writes');
}

console.log('all exam import checks passed');
