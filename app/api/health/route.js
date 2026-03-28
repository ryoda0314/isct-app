import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep');

  if (deep) {
    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.from('profiles').select('moodle_id').limit(1);
      return NextResponse.json({
        status: 'ok',
        supabase: error ? `error: ${error.message}` : 'connected',
        env: {
          SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          SERVICE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          CRED_SECRET: !!process.env.CRED_SECRET,
          ADMIN_IDS: !!process.env.ADMIN_IDS,
        },
      });
    } catch (e) {
      return NextResponse.json({
        status: 'error',
        message: e.message,
        stack: e.stack?.split('\n').slice(0, 5),
      }, { status: 500 });
    }
  }

  return NextResponse.json({ status: 'ok' });
}
