import { NextResponse } from 'next/server';
import { requireSession, optionalSession } from './auth/require-auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// 未ログイン（ゲスト）にも開く API の共通部品（ログイン任意化）。
//
// 2 種類ある:
//   publicGate(request)        … 誰が見ても同じ結果を返すルート用（試験日程・シラバス検索・電車など）。
//                                 通常は誰でも通す。CDN キャッシュしてよい（publicCache）。
//   guestOrSession(request)    … 見る人で結果が変わるルート用（掲示板・音楽など）。
//                                 ログインしていれば auth、していなければ null。CDN キャッシュはしない。
//
// 非常停止: site_settings の guest_access = { "enabled": false } にすると、どちらも「要ログイン」に戻る
// （Supabase Nano の Disk IO が詰まったときなどに、ゲスト由来の負荷をすぐ止めるため）。
// 行が無い・読めないときは「開いている」とみなす。
// ─────────────────────────────────────────────────────────────────────────────

const GUEST_FLAG_TTL = 60_000;
let _guestFlag = { enabled: true, ts: 0 };

export async function guestAccessEnabled() {
  const now = Date.now();
  if (now - _guestFlag.ts < GUEST_FLAG_TTL) return _guestFlag.enabled;
  let enabled = true;
  try {
    const { getSupabaseAdmin } = await import('./supabase/server.js');
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('site_settings').select('value').eq('key', 'guest_access').maybeSingle();
    if (data?.value && data.value.enabled === false) enabled = false;
  } catch {}
  _guestFlag = { enabled, ts: now };
  return enabled;
}

const guestClosed = () =>
  NextResponse.json({ error: 'Not authenticated', code: 'NO_SESSION', guestClosed: true }, { status: 401 });

/** 誰が見ても同じ結果のルート用。通すなら null、止めるならエラーレスポンスを返す */
export async function publicGate(request) {
  if (await guestAccessEnabled()) return null;
  const auth = await requireSession(request);
  return auth.error ? guestClosed() : null;
}

/** 見る人で結果が変わるルート用。{ auth: ログイン中なら auth、未ログインなら null, error } */
export async function guestOrSession(request) {
  const auth = await optionalSession(request);
  if (auth) return { auth, error: null };
  if (!(await guestAccessEnabled())) return { auth: null, error: guestClosed() };
  return { auth: null, error: null };
}

/**
 * 誰が見ても同じ 200 レスポンスに CDN キャッシュの指示を付ける。
 * middleware は /api に private, no-store を付けるが、PUBLIC_CACHEABLE に載せたパスだけはそれを付けない。
 */
export function publicCache(res, sMaxAge = 120) {
  if (res?.ok) res.headers.set('Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 5}`);
  return res;
}
