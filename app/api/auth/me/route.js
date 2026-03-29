import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { loadCredentials } from '../../../../lib/credentials.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function checkAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
  return !!data;
}

/** 学籍番号 "25B10001" → { yearGroup: "25B", schoolNum: "1" } */
function parseStudentId(id) {
  if (!id) return null;
  const m = id.match(/^(\d{2})([BMDR])(\d)/i);
  if (!m) return null;
  return { yearGroup: m[1] + m[2].toUpperCase(), schoolNum: m[3] };
}

/**
 * 学籍番号を解決する（複数ソースから探す）
 * 1. profiles.student_id（DB保存済み）
 * 2. loginId 自体が学籍番号形式
 * 3. クレデンシャルの portalUserId
 * 4. user_credentials から学籍番号形式の login_id を検索
 */
async function resolveStudentId(loginId, profileStudentId) {
  // 1. DB に保存済み
  if (profileStudentId && parseStudentId(profileStudentId)) return profileStudentId;
  // 2. loginId 自体が学籍番号形式
  if (parseStudentId(loginId)) return loginId;
  // 3. クレデンシャルから portalUserId を取得
  try {
    const creds = await loadCredentials(loginId);
    if (creds?.portalUserId && parseStudentId(creds.portalUserId)) return creds.portalUserId;
  } catch {}
  // 4. user_credentials テーブルから学籍番号形式の login_id を検索
  //    (ISCTとPortalが別々に保存された場合のフォールバック)
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('user_credentials')
      .select('login_id')
      .filter('login_id', 'neq', loginId);
    if (data) {
      for (const row of data) {
        if (parseStudentId(row.login_id)) {
          // この login_id のクレデンシャルを復号して確認
          try {
            const creds = await loadCredentials(row.login_id);
            // portalUserId があればそれが学籍番号
            if (creds?.portalUserId && parseStudentId(creds.portalUserId)) return creds.portalUserId;
            // userId 自体が学籍番号形式ならそれを使う
            if (parseStudentId(creds?.userId)) return creds.userId;
          } catch {}
          // 復号できなくても login_id 自体が学籍番号形式ならそれを使う
          return row.login_id;
        }
      }
    }
  } catch {}
  return null;
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const sb = getSupabaseAdmin();
    const [isAdmin, profile] = await Promise.all([
      checkAdmin(auth.userid),
      sb.from('profiles').select('banned, ban_reason, dept, year_group, unit, student_id').eq('moodle_id', auth.userid).maybeSingle().then(r => r.data),
    ]);

    if (profile?.banned) {
      return NextResponse.json({
        error: 'アカウントが停止されています',
        banned: true,
        banReason: profile.ban_reason || null,
      }, { status: 403 });
    }

    let yearGroup = profile?.year_group || null;
    let studentId = profile?.student_id || null;

    // student_id / year_group が未設定なら自動解決
    if (!studentId || !yearGroup) {
      const sid = await resolveStudentId(auth.loginId, studentId);
      if (sid) {
        studentId = sid;
        const parsed = parseStudentId(sid);
        if (!yearGroup && parsed) yearGroup = parsed.yearGroup;

        // DB に保存（次回以降は即座に返せる）
        const updates = {};
        if (!profile?.student_id && studentId) updates.student_id = studentId;
        if (!profile?.year_group && yearGroup) updates.year_group = yearGroup;
        if (Object.keys(updates).length > 0) {
          sb.from('profiles').update(updates).eq('moodle_id', auth.userid).then(() => {
            console.log(`[AuthMe] Auto-set for user ${auth.userid}:`, updates);
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ userid: auth.userid, fullname: auth.fullname, isAdmin, dept: profile?.dept || null, yearGroup, unit: profile?.unit || null, studentId });
  } catch (err) {
    console.error('[AuthMe] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const updates = {};

    // dept: validate it's a known department prefix or null (to reset)
    if ('dept' in body) {
      const dept = body.dept;
      if (dept !== null && (typeof dept !== 'string' || dept.length > 10)) {
        return NextResponse.json({ error: 'Invalid dept' }, { status: 400 });
      }
      updates.dept = dept;
    }

    // unit: e.g. "25B-7" or null
    if ('unit' in body) {
      const unit = body.unit;
      if (unit !== null && (typeof unit !== 'string' || unit.length > 20)) {
        return NextResponse.json({ error: 'Invalid unit' }, { status: 400 });
      }
      updates.unit = unit;
    }

    // year_group: e.g. "25B" or null
    if ('yearGroup' in body) {
      const yg = body.yearGroup;
      if (yg !== null && (typeof yg !== 'string' || yg.length > 5)) {
        return NextResponse.json({ error: 'Invalid yearGroup' }, { status: 400 });
      }
      updates.year_group = yg;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    await sb.from('profiles').update(updates).eq('moodle_id', auth.userid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AuthMe] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
