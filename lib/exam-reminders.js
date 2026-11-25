// 自分の試験の通知（前日・1 時間前）用に、近い試験を assignment_deadlines に入れる項目にする。
// all-meta が履修科目を組み立てたあとに呼び、syncAssignmentDeadlines の extra に渡す。
// 送るのは /api/cron/deadline-reminders（EXAM_THRESHOLDS は lib/deadline-notify.js）。
// 照合は画面と同じ campus-sns/myExams.js。試験画面で自分が直した日時・教室は端末にしか無いので、ここでは公式の値で通知する。
import { getSupabaseAdmin } from './supabase/server.js';
import { matchMyExams, periodTimes, courseOf } from '../campus-sns/myExams.js';
import { EXAM_ID_PREFIX } from './deadline-notify.js';

const TTL = 10 * 60 * 1000;
let cache = { at: 0, rows: [] };

const jstDate = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** これから 15 日以内の試験（インスタンスごとに 10 分キャッシュ。all-meta はアプリを開くたびに呼ばれるので） */
async function upcomingExams() {
  const now = Date.now();
  if (now - cache.at < TTL) return cache.rows;
  const { data, error } = await getSupabaseAdmin().from('exam_schedules')
    .select('id, code, code_raw, name, date, period, room, year, quarter')
    .gte('date', jstDate(now)).lte('date', jstDate(now + 15 * 864e5));
  if (error) throw new Error(error.message);
  cache = { at: now, rows: data || [] };
  return cache.rows;
}

/**
 * @param {Array} courses all-meta の transformCourses の結果
 * @returns {Promise<Array<{ id: string, title: string, cid: string|null, due: string }>>}
 */
export async function examReminderItems(courses) {
  if (!courses?.length) return [];
  const mine = matchMyExams(await upcomingExams(), courses);
  const out = [];
  for (const e of mine) {
    const pt = periodTimes(e.period);
    if (!pt || !e.date) continue; // 時刻の分からない試験は通知しない
    out.push({
      id: `${EXAM_ID_PREFIX}${e.code_raw || e.code}_${e.date}_${e.period}`,
      title: `${e.name}（${e.period}限${e.room ? `・${e.room}` : ''}）`,
      cid: courseOf(e, courses)?.id || null,
      due: `${e.date}T${pt.start}:00+09:00`,
    });
  }
  return out;
}
