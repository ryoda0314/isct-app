import webpush from 'web-push';
import { getSupabaseAdmin } from './supabase/server.js';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = 'mailto:admin@sciencetokyo.app';

let configured = false;
function ensureVapid() {
  if (configured || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

/**
 * Send a Web Push notification to all subscriptions for a user.
 * payload: { title, body, url?, tag? }
 */
export async function sendPushToUser(moodleId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  ensureVapid();

  const sb = getSupabaseAdmin();
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('moodle_id', moodleId);

  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const stale = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        // 410 Gone or 404 = subscription expired, clean up
        if (err.statusCode === 410 || err.statusCode === 404) {
          stale.push(sub.id);
        }
      }
    })
  );

  // Remove stale subscriptions
  if (stale.length) {
    await sb.from('push_subscriptions').delete().in('id', stale);
  }
}

/**
 * Send the same Web Push payload to many users with MINIMAL disk IO:
 * one query fetches every recipient's subscriptions instead of N per-user
 * queries. Use this for fan-outs (e.g. a new course post to all members).
 * payload: { title, body, url?, tag? }
 */
export async function sendPushToUsers(moodleIds, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const ids = [...new Set((moodleIds || []).filter(id => id != null))];
  if (!ids.length) return;
  ensureVapid();

  const sb = getSupabaseAdmin();
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('moodle_id', ids);

  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const stale = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) stale.push(sub.id);
      }
    })
  );

  if (stale.length) {
    await sb.from('push_subscriptions').delete().in('id', stale);
  }
}
