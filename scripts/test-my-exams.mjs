// 自分の試験まわり（campus-sns/myExams.js）と試験の通知（lib/exam-reminders.js・lib/deadline-notify.js）の確認。
//   node scripts/test-my-exams.mjs
import assert from 'node:assert/strict';
import {
  matchMyExams, matchMyClasses, applyExamPrefs, periodTimes, examKeys,
  setExamEdit, clearExamEdit, keepExamEdit, linkExam, unlinkExam, hideExam, unhideExam,
} from '../campus-sns/myExams.js';
import { pickThreshold, EXAM_THRESHOLDS } from '../lib/deadline-notify.js';

// ── 時限の時刻 ──
assert.deepEqual(periodTimes('1-2'), { start: '08:50', end: '10:30' });
assert.deepEqual(periodTimes('3-4'), { start: '10:45', end: '12:25' });
assert.deepEqual(periodTimes('1-4'), { start: '08:50', end: '12:25' });
assert.deepEqual(periodTimes('9-10'), { start: '17:15', end: '18:55' });
assert.deepEqual(periodTimes('5'), { start: '13:30', end: '15:10' });
assert.equal(periodTimes('11-12'), null);
assert.equal(periodTimes('集中'), null);
console.log('ok  periodTimes');

// ── 照合 ──
const ex = (o) => ({ year: '2026', quarter: '3Q', day: '水', period: '1-2', room: 'M-110', instructor: 'A', ...o });
const exams = [
  ex({ id: 1, code: 'LAL.C203', code_raw: 'LAL.C203-04', name: '中国語初級３ C04', date: '2026-11-25' }),
  ex({ id: 2, code: 'LAL.C203', code_raw: 'LAL.C203-07', name: '中国語初級３ C07', date: '2026-11-25', room: 'M-356' }),
  ex({ id: 3, code: 'MTH.B211', code_raw: 'MTH.B211', name: '幾何学概論第一', date: '2026-11-26', day: '木', period: '3-4' }),
  ex({ id: 4, code: 'PHY.Q207', code_raw: 'PHY.Q207', name: '量子力学', date: '2026-11-27', day: '金', period: '5-6' }),
  // 年度と日付の年度が食い違う行（2025年度の試験なのに 2026年度の日付）は誰の試験にもしない
  ex({ id: 5, code: 'MTH.B211', code_raw: 'MTH.B211', name: '幾何学概論第一', date: '2026-11-30', year: '2025' }),
];
const courses = [
  { id: 'mc_1', code: 'LAL.C203', codeRaw: 'LAL.C203-04', year: '2026', quarter: 3, col: '#123456' },
  { id: 'mc_2', code: 'MTH.B211', codeRaw: 'MTH.B211', year: '2026', quarters: [3, 4] },
  { id: 'mc_3', code: 'PHY.Q207', codeRaw: 'PHY.Q207', year: '2026', quarter: 2 }, // 2Q の科目 → 3Q の試験には合わない
];
assert.deepEqual(matchMyExams(exams, courses).map((e) => e.id), [1, 3]);
const block = { year: '2026', quarter: '3Q', classes: [
  { code: 'LAL.C203', code_raw: 'LAL.C203-04', date: '2026-11-30', period: '1-2' },
  { code: 'LAL.C203', code_raw: 'LAL.C203-09', date: '2026-11-30', period: '1-2' },
  { code: 'MTH.B211', code_raw: 'MTH.B211', date: '2026-12-01', period: '3-4' },
] };
assert.deepEqual(matchMyClasses(block, courses).map((c) => c.code_raw), ['LAL.C203-04', 'MTH.B211']);
assert.deepEqual(matchMyClasses({ ...block, quarter: '2Q' }, courses), []);
console.log('ok  matchMyExams / matchMyClasses');

// ── 自分用の修正 ──
const EMPTY = { edits: {}, linked: {}, hidden: {} };
const keys = examKeys(exams);
const k1 = keys.get(exams[0]), k4 = keys.get(exams[3]);
assert.equal(k1, '2026-3Q|LAL.C203-04');
let prefs = setExamEdit(EMPTY, exams[0], k1, { date: '2026-11-25', period: '1-2', room: 'W9-999' });
assert.deepEqual(prefs.edits[k1].fields, { room: 'W9-999' }, 'only changed fields are kept');
let mine = applyExamPrefs(matchMyExams(exams, courses), exams, prefs);
let e1 = mine.find((e) => e._key === k1);
assert.equal(e1.room, 'W9-999');
assert.deepEqual(e1._edited, ['room']);
assert.deepEqual(e1._conflict, []);
assert.equal(e1._official.room, 'M-110');

// 公式の教室があとで変わった → conflict
const exams2 = exams.map((e) => (e.id === 1 ? { ...e, room: 'S2-202' } : e));
mine = applyExamPrefs(matchMyExams(exams2, courses), exams2, prefs);
e1 = mine.find((e) => e._key === k1);
assert.deepEqual(e1._conflict, ['room']);
assert.equal(e1.room, 'W9-999');
// 自分の修正を残す → conflict が消える
const kept = keepExamEdit(prefs, k1, e1._official);
assert.deepEqual(applyExamPrefs(matchMyExams(exams2, courses), exams2, kept).find((e) => e._key === k1)._conflict, []);
// 公式に合わせる → 修正が消える
const cleared = clearExamEdit(prefs, k1);
assert.equal(applyExamPrefs(matchMyExams(exams2, courses), exams2, cleared).find((e) => e._key === k1).room, 'S2-202');
// 公式と同じ値で保存したら修正は残らない
assert.deepEqual(setExamEdit(EMPTY, exams[0], k1, { date: '2026-11-25', period: '1-2', room: 'M-110' }).edits, {});

// 日付を直すと曜日も合わせる
prefs = setExamEdit(EMPTY, exams[0], k1, { date: '2026-11-27' });
assert.equal(applyExamPrefs(matchMyExams(exams, courses), exams, prefs).find((e) => e._key === k1).day, '金');

// 載っていない試験を自分の試験に加える・外す
prefs = linkExam(EMPTY, k4, exams[3]);
mine = applyExamPrefs(matchMyExams(exams, courses), exams, prefs);
assert.ok(mine.find((e) => e._key === k4)._linked);
assert.equal(applyExamPrefs(matchMyExams(exams, courses), exams, unlinkExam(prefs, k4)).some((e) => e._key === k4), false);
// 外す（履修科目の試験を非表示）→ 戻す
prefs = hideExam(EMPTY, k1);
assert.equal(applyExamPrefs(matchMyExams(exams, courses), exams, prefs).some((e) => e._key === k1), false);
assert.equal(applyExamPrefs(matchMyExams(exams, courses), exams, unhideExam(prefs, k1)).some((e) => e._key === k1), true);

// 直した試験が公式から消えた → 修正したときの内容で残し _gone を付ける（同じクォーターを読み込んでいるときだけ）
prefs = setExamEdit(EMPTY, exams[0], k1, { room: 'W9-999' });
const without1 = exams.filter((e) => e.id !== 1);
const gone = applyExamPrefs(matchMyExams(without1, courses), without1, prefs).find((e) => e._key === k1);
assert.ok(gone && gone._gone && gone.room === 'W9-999');
assert.equal(applyExamPrefs([], [], prefs).length, 0, 'other quarter not loaded → not shown');
console.log('ok  edits / conflicts / link / hide / gone');

// ── 試験の通知の閾値（前日・1時間前。3 時間前には鳴らさない）──
const H = 3600 * 1000;
const order = ['24h', '1h'];
assert.equal(pickThreshold(23 * H, EXAM_THRESHOLDS, order), '24h');
assert.equal(pickThreshold(2.9 * H, EXAM_THRESHOLDS, order), '24h');
assert.equal(pickThreshold(0.5 * H, EXAM_THRESHOLDS, order), '1h');
assert.equal(pickThreshold(25 * H, EXAM_THRESHOLDS, order), null);
assert.equal(pickThreshold(2.9 * H), '3h', 'assignments keep 24h/3h');
console.log('ok  exam reminder thresholds');
console.log('all my-exams checks passed');
