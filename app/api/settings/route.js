import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { publicCache } from '../../../lib/public-api.js';

// Public endpoint — returns site settings. 未ログイン（ゲスト）も起動時に読むので CDN に 60 秒キャッシュさせる。
export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('site_settings').select('key, value');
    const settings = {};
    (data || []).forEach(s => { settings[s.key] = s.value; });

    const regLimit = settings.registration_limit || { enabled: false, maxUsers: 0, message: '' };
    let regClosed = false;
    if (regLimit.enabled) {
      if (regLimit.maxUsers <= 0) {
        regClosed = true; // 0 = 完全停止
      } else {
        const { count } = await sb.from('profiles').select('moodle_id', { count: 'exact', head: true });
        regClosed = count >= regLimit.maxUsers;
      }
    }
    return publicCache(NextResponse.json({
      // ゲスト向け API の非常停止（lib/public-api.js）。false のときクライアントはゲストにも紹介画面を出す
      guest_access: { enabled: settings.guest_access?.enabled !== false },
      telecom_restriction: settings.telecom_restriction || { enabled: false, message: '' },
      maintenance_mode: settings.maintenance_mode || { enabled: false, message: '' },
      feature_flags: settings.feature_flags || {},
      // キャリア（インターン・就職・イベント）を一般に公開しているか。false の間は管理者にだけ入口を出す
      career_public: settings.career?.public === true,
      registration_limit: { closed: regClosed, message: regLimit.message },
    }), 60);
  } catch (e) {
    console.error('[Settings GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
