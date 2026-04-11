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

/** 学籍番号パーサー（新形式 + 旧医歯学系8桁） */
function parseStudentId(id) {
  if (!id) return null;
  const m = id.match(/^(\d{2})([BMDR])(\d)(\d)?/i);
  if (m) return { yearGroup: m[1] + m[2].toUpperCase(), schoolNum: m[3], subNum: m[4] || null };
  // 旧医歯学系: 8桁数字 (例: 11220001)
  const mL = id.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL && /^(11|21|22|31|32|39)$/.test(mL[1])) {
    return { yearGroup: mL[2] + "B", schoolNum: null, subNum: null };
  }
  return null;
}

/**
 * 学籍番号を解決する（自分のデータのみ参照）
 * 1. profiles.student_id（DB保存済み）
 * 2. loginId 自体が学籍番号形式
 * 3. クレデンシャルの portalUserId
 */
async function resolveStudentId(loginId, profileStudentId) {
  if (profileStudentId && parseStudentId(profileStudentId)) return profileStudentId;
  if (parseStudentId(loginId)) return loginId;
  try {
    const creds = await loadCredentials(loginId);
    if (creds?.portalUserId && parseStudentId(creds.portalUserId)) return creds.portalUserId;
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
      sb.from('profiles').select('banned, ban_reason, dept, year_group, unit, student_id, avatar, color').eq('moodle_id', auth.userid).maybeSingle().then(r => r.data),
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

    return NextResponse.json({ userid: auth.userid, fullname: auth.fullname, isAdmin, dept: profile?.dept || null, yearGroup, unit: profile?.unit || null, studentId, avatar: profile?.avatar || null, color: profile?.color || null });
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

    // avatar: data URI, preset SVG, single character, or null
    if ('avatar' in body) {
      const av = body.avatar;
      if (av !== null && typeof av !== 'string') {
        return NextResponse.json({ error: 'Invalid avatar' }, { status: 400 });
      }
      // data URI は最大 100KB に制限
      if (av && av.length > 100000) {
        return NextResponse.json({ error: 'Avatar too large' }, { status: 400 });
      }
      updates.avatar = av || null;
    }

    // color: hex color code or null
    if ('color' in body) {
      const col = body.color;
      if (col !== null && (typeof col !== 'string' || col.length > 20)) {
        return NextResponse.json({ error: 'Invalid color' }, { status: 400 });
      }
      updates.color = col || null;
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
