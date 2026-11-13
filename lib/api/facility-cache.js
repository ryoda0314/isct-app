// ============================================================
// Taki Plaza の予約状況: 定期的に読み取って DB に保存し、アプリは DB を参照する。
//
// 以前は開くたびにサーバーでヘッドレスブラウザを起動し、旧ポータルにログインして教務Webの予約ページを
// 読み取っていた（最大 60 秒・利用者ごとにポータルの資格情報が必要）。遅いので、月 1 回ほど
// （supabase/facility-reservations.sql の pg_cron → /api/cron/facility-reservations）数週分をまとめて
// 読み取り、facility_reservation_weeks に保存する。読み取りには FACILITY_SCRAPE_LOGIN_ID
// （運営のアカウント。ポータルの資格情報を保存済みのもの）の資格情報を使う。
// ============================================================
import { getSupabaseAdmin } from '../supabase/server.js';
import { loadCredentials } from '../credentials.js';
import { fetchReservationWeeks } from './facility-reservations.js';

export const FR_TABLE = 'facility_reservation_weeks';
const pad = (n) => String(n).padStart(2, '0');
const isoUTC = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** 今週（日本時間）の月曜から weeks 週分の月曜を YYYYMMDD で */
export function upcomingMondays(weeks, now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    out.push(isoUTC(d).replace(/-/g, ''));
  }
  return out;
}

/**
 * 数週分を読み取って保存する。戻り値: { requested, saved, failed:[{date,error}] }
 * 古い週（4 週より前）は消す。
 */
export async function refreshFacilityReservations({ weeks = 6, building = '1' } = {}) {
  const loginId = process.env.FACILITY_SCRAPE_LOGIN_ID;
  if (!loginId) throw new Error('FACILITY_SCRAPE_LOGIN_ID is not set');
  const creds = await loadCredentials(loginId);
  if (!creds?.portalUserId || !creds?.portalPassword || !creds?.matrix) {
    throw new Error('portal credentials are not saved for FACILITY_SCRAPE_LOGIN_ID');
  }
  const dates = upcomingMondays(weeks);
  const results = await fetchReservationWeeks({ loginId, creds, dates, building });
  const fetchedAt = new Date().toISOString();
  const rows = results
    .filter((r) => r.data && !r.data.error && r.data.weekStart)
    .map((r) => ({ building: String(building), week_start: r.data.weekStart, data: r.data, fetched_at: fetchedAt }));
  const sb = getSupabaseAdmin();
  if (rows.length) {
    const { error } = await sb.from(FR_TABLE).upsert(rows, { onConflict: 'building,week_start' });
    if (error) throw new Error(error.message);
  }
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 28);
  await sb.from(FR_TABLE).delete().lt('week_start', isoUTC(cutoff));
  return {
    requested: dates.length,
    saved: rows.length,
    failed: results.filter((r) => r.data?.error).map((r) => ({ date: r.date, error: String(r.data.error).slice(0, 200) })),
  };
}

/** date（YYYY-MM-DD）を含む週の保存データ。無ければ null。 */
export async function readFacilityWeek({ date, building = '1' }) {
  const d = new Date(`${date}T00:00:00Z`);
  const from = new Date(d);
  from.setUTCDate(from.getUTCDate() - 6);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(FR_TABLE)
    .select('week_start, data, fetched_at')
    .eq('building', String(building))
    .lte('week_start', date)
    .gte('week_start', isoUTC(from))
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const e = new Error(error.message);
    e.code = error.code;
    throw e;
  }
  return data || null;
}
