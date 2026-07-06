import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// 認証ユーザーの利用イベントをバッチ受信して usage_events に追記する。
// クライアント(campus-sns/analytics.js)がイベントをメモリに溜め、まとめて
// 1 リクエストで送る → DB は 1 回の複数行 INSERT で済む（IO 予算対策）。

const VALID_EVENTS = new Set(['app_open', 'resume', 'feature_open']);
const MAX_BATCH = 50;          // 1 リクエストあたりのイベント上限
const FEATURE_RE = /^[a-zA-Z0-9_:-]{1,40}$/;  // view id の許容形式（course:xxx 等も許可）

// ユーザー単位の簡易レート制限（60 req/min）。バッチ送信なので十分緩い。
const hits = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { if (now - v.s > 60000) hits.delete(k); } }, 60000).unref?.();
function checkRate(userid) {
  const now = Date.now();
  let rec = hits.get(userid);
  if (!rec || now - rec.s > 60000) { rec = { s: now, c: 0 }; hits.set(userid, rec); }
  rec.c++;
  return rec.c <= 60;
}

// POST /api/track  body: { events: [{ event, feature?, ts?, sid? }, ...] }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const moodleId = auth.userid;

    if (!checkRate(moodleId)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
    const events = Array.isArray(body?.events) ? body.events : null;
    if (!events || !events.length) return NextResponse.json({ error: 'No events' }, { status: 400 });
    if (events.length > MAX_BATCH) return NextResponse.json({ error: 'Batch too large' }, { status: 400 });

    const nowMs = Date.now();
    const rows = [];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      if (!VALID_EVENTS.has(e.event)) continue;
      // feature は feature_open のときだけ意味を持つ。形式が不正なら捨てる。
      let feature = null;
      if (e.event === 'feature_open') {
        if (typeof e.feature !== 'string' || !FEATURE_RE.test(e.feature)) continue;
        feature = e.feature;
      }
      // クライアント時刻は検証する。未来/古すぎる値はサーバー時刻に丸める。
      let ts = typeof e.ts === 'number' ? e.ts : nowMs;
      if (!Number.isFinite(ts) || ts > nowMs + 60000 || ts < nowMs - 24 * 60 * 60 * 1000) ts = nowMs;
      const sid = (typeof e.sid === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(e.sid)) ? e.sid : null;
      rows.push({
        moodle_id: moodleId,
        session_id: sid,
        event: e.event,
        feature,
        ts: new Date(ts).toISOString(),
      });
    }

    if (!rows.length) return NextResponse.json({ ok: true, inserted: 0 });

    const sb = getSupabaseAdmin();
    const { error } = await sb.from('usage_events').insert(rows);
    if (error) {
      console.error('[Track]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error('[Track]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
