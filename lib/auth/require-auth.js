import { NextResponse } from 'next/server';
import { getToken } from './token-manager.js';
import { verifySession, COOKIE_NAME } from './session.js';

// ─────────────────────────────────────────────────────────────────────────────
// 認証は 2 層。
//   requireSession  … アカウントの本人確認だけ（署名 Cookie ＋ BAN ＋ 失効）。Moodle トークンは取らない。
//                     DM・投稿・タスクなど「ユーザー ID だけ使う」ルート用。LMS の不調でも止まらない。
//   requirePortal   … 上に加えて、保存済みの資格情報で Moodle トークン(wstoken)を取る（旧 requireAuth）。
//                     時間割・課題・教材など LMS を直接使うルート用。
// 401 の本文には code を付ける: NO_SESSION（ログインしていない／失効）・PORTAL_REAUTH（ログインは有効だが LMS に入れない）。
// ─────────────────────────────────────────────────────────────────────────────

// Throttle last_active_at updates to at most once per 15 minutes per user.
const _activeCache = new Map();
const ACTIVE_INTERVAL = 15 * 60 * 1000;

async function touchActivity(userid) {
  const now = Date.now();
  if (_activeCache.get(userid) > now - ACTIVE_INTERVAL) return;
  _activeCache.set(userid, now);
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    // The in-memory cache above is per-instance and resets on every serverless
    // cold start, so it can't dedupe across instances. Let the DB enforce the
    // throttle: only write when the stored value is actually stale. Instances
    // that find a fresh last_active_at match 0 rows and write nothing — no WAL,
    // no dead tuple. This removed the bulk of profiles write churn.
    const threshold = new Date(now - ACTIVE_INTERVAL).toISOString();
    await sb.from('profiles')
      .update({ last_active_at: new Date(now).toISOString() })
      .eq('moodle_id', userid)
      .or(`last_active_at.is.null,last_active_at.lt.${threshold}`);
  } catch {}
}

// ── profiles から認証に要る値（BAN・表示名・失効時刻）を 1 回で読む。60 秒キャッシュ ──
// 以前の BAN 判定（select banned）と同じ 1 クエリなので DB 負荷は増えない。
const _profCache = new Map();
const PROF_CACHE_TTL = 60_000;
// supabase/session-revocation.sql が未適用の環境では列が無い。そのときは列を外して読み、
// requireSession は失効を判定できないので requirePortal（従来どおり）に回す。
let _hasValidAfterCol = true;

async function loadAuthProfile(userid) {
  const now = Date.now();
  const key = String(userid);
  const hit = _profCache.get(key);
  if (hit && now - hit.ts < PROF_CACHE_TTL) return hit.v;
  let v;
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    const cols = _hasValidAfterCol ? 'banned, name, sessions_valid_after' : 'banned, name';
    let { data, error } = await sb.from('profiles').select(cols).eq('moodle_id', userid).maybeSingle();
    if (error && _hasValidAfterCol && /sessions_valid_after/.test(error.message || '')) {
      _hasValidAfterCol = false;
      ({ data, error } = await sb.from('profiles').select('banned, name').eq('moodle_id', userid).maybeSingle());
    }
    if (error) throw new Error(error.message);
    v = data
      ? { exists: true, banned: !!data.banned, name: data.name || '', validAfter: data.sessions_valid_after ? Date.parse(data.sessions_valid_after) || 0 : 0 }
      : { exists: false, banned: false, name: '', validAfter: 0 };
  } catch (e) {
    // DB に届かないときは従来の BAN 判定と同じく通す（DB 障害でアプリ全体を 401 にしない）。キャッシュはしない。
    console.error('[Auth] profile lookup failed:', e.message);
    return { exists: true, banned: false, name: '', validAfter: 0, failed: true };
  }
  _profCache.set(key, { v, ts: now });
  if (_profCache.size > 500) {
    for (const [k, x] of _profCache) if (now - x.ts > PROF_CACHE_TTL) _profCache.delete(k);
  }
  return v;
}

/** BAN・失効・名前の変更を、この実行環境のキャッシュに即反映する（他のインスタンスは最大 60 秒遅れ） */
export function invalidateAuthProfile(userid) {
  _profCache.delete(String(userid));
}

const noSession = (msg = 'Not authenticated') =>
  NextResponse.json({ error: msg, code: 'NO_SESSION' }, { status: 401 });
const portalReauth = () =>
  NextResponse.json({ error: 'Authentication failed', code: 'PORTAL_REAUTH' }, { status: 401 });
const bannedRes = () =>
  NextResponse.json({ error: 'アカウントが停止されています', banned: true, code: 'BANNED' }, { status: 403 });

const isRevoked = (session, prof) => !!prof.validAfter && (Number(session.createdAt) || 0) < prof.validAfter;

/**
 * LMS 層: 認証済み・BAN されていない・Moodle トークンが取れるセッションか確かめる。
 * 成功: { wstoken, userid, fullname, loginId, error: null }。失敗: { error: NextResponse }。
 */
export async function requirePortal(request, verified = null) {
  const session = verified || verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return { error: noSession() };

  let tokenData;
  try {
    tokenData = await getToken(session.loginId);
  } catch (e) {
    console.error(`[Auth] getToken failed for loginId=${session.loginId}:`, e.message);
    return { error: portalReauth() };
  }

  const prof = await loadAuthProfile(tokenData.userid);
  if (prof.banned) return { error: bannedRes() };
  if (isRevoked(session, prof)) return { error: noSession('Session revoked') };

  // Non-blocking activity tracking
  touchActivity(tokenData.userid).catch(() => {});
  return { ...tokenData, loginId: session.loginId, error: null };
}

/** 旧名。LMS を使うルートはこのまま（requirePortal と同じ） */
export const requireAuth = requirePortal;

/**
 * アカウント層: 署名 Cookie・BAN・失効だけを確かめる。Moodle トークンは取らない（wstoken は null）。
 * 成功: { userid, fullname(profiles.name), loginId, wstoken: null, error: null }。
 *
 * 次のときは requirePortal に回す（＝従来と同じ判定。ログイン済みの人を誤って締め出さないため）:
 *   - Cookie に moodleUserId が無い（古い形式）
 *   - profiles に行が無い（アカウント削除直後の別端末の Cookie かもしれない。資格情報も消えていれば従来どおり 401）
 *   - sessions_valid_after 列が未作成（失効を判定できない）
 */
export async function requireSession(request) {
  const session = verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return { error: noSession() };

  const userid = Number(session.moodleUserId);
  if (!Number.isSafeInteger(userid) || userid <= 0) return requirePortal(request, session);

  const prof = await loadAuthProfile(userid);
  if (!prof.exists || !_hasValidAfterCol) return requirePortal(request, session);
  if (prof.banned) return { error: bannedRes() };
  if (isRevoked(session, prof)) return { error: noSession('Session revoked') };

  touchActivity(userid).catch(() => {});
  return { userid, fullname: prof.name, loginId: session.loginId, wstoken: null, error: null };
}

/**
 * 公開ルート用: ログインしていれば requireSession の結果、していない（または無効）なら null。
 * 未ログインは正常な状態なのでエラーにしない。
 */
export async function optionalSession(request) {
  if (!request.cookies.get(COOKIE_NAME)?.value) return null;
  const auth = await requireSession(request);
  return auth.error ? null : auth;
}
