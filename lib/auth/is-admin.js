import { getSupabaseAdmin } from '../supabase/server.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

/** moodleユーザーIDが管理者かどうか（環境変数 ADMIN_IDS または admin_users テーブル）。 */
export async function isAdmin(userid) {
  if (!userid) return false;
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
