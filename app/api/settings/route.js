import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// Public endpoint — returns site settings visible to all authenticated users
export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('site_settings').select('key, value');
    const settings = {};
    (data || []).forEach(s => { settings[s.key] = s.value; });

    return NextResponse.json({
      telecom_restriction: settings.telecom_restriction || { enabled: false, message: '' },
      maintenance_mode: settings.maintenance_mode || { enabled: false, message: '' },
      feature_flags: settings.feature_flags || {},
    });
  } catch (e) {
    console.error('[Settings GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
