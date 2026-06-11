// Server-side Supabase Realtime Broadcast helper.
//
// WHY BROADCAST INSTEAD OF postgres_changes:
//   The browser subscribes to Realtime with the anon key (no auth session).
//   dm_messages / group_messages / notifications have `deny_all` RLS for anon
//   (2026-04-12 security hardening, supabase/security-hardening.sql). Realtime
//   postgres_changes enforces the SUBSCRIBER's RLS, so anon would receive ZERO
//   change events — which is why DM/chat had no realtime and the unread badge
//   only updated on the 60s poll.
//
//   Broadcast bypasses table RLS entirely: the server (service_role) emits a
//   CONTENT-FREE "ping" (`{event:'new'}`, empty payload) on a public channel,
//   and the client re-fetches the real data via the authorized /api/* routes.
//   No DM content ever crosses the broadcast channel, so re-enabling realtime
//   does NOT reopen the anon-read hole the pentest closed.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Channel/topic name builders — MUST stay in sync with the client subscriptions
// in campus-sns/hooks/useDM.js, useUnreadDM.js and useGroupChat.js.
// useDMList and useUnreadDM run on the same browser/client, so they use DISTINCT
// topics — two RealtimeChannels sharing one topic on a single client conflicts.
export const dmListTopic = (userId) => `dm_list:${userId}`;     // DM list + open conversation
export const dmUnreadTopic = (userId) => `dm_unread:${userId}`; // unread badge
export const groupTopic = (groupId) => `group_msg:${groupId}`;  // open group chat

// Fire-and-(briefly)-wait broadcast of a content-free ping to one or more topics.
// Best-effort: a realtime delivery failure must never break message send.
export async function broadcast(topics, event = 'new', payload = {}) {
  if (!URL_BASE || !SERVICE_KEY) return;
  const list = (Array.isArray(topics) ? topics : [topics]).filter(Boolean);
  if (list.length === 0) return;
  const messages = list.map((topic) => ({ topic, event, payload, private: false }));
  try {
    await fetch(`${URL_BASE}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error('[realtime] broadcast failed:', e?.message || e);
  }
}
