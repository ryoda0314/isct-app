import http2 from 'node:http2';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase/server.js';

// APNs token-based (.p8) auth. Mirror of lib/push.js but for native iOS.
// No external deps: ES256 JWT is signed with node:crypto, delivery uses node:http2.
const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'ac.isct.campus';
// .p8 PEM, may carry literal "\n" when stored in a single-line env var.
const PRIVATE_KEY = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');

const PROD_HOST = process.env.APNS_HOST || 'api.push.apple.com';
const SANDBOX_HOST = 'api.sandbox.push.apple.com';

function configured() {
  return !!(KEY_ID && TEAM_ID && PRIVATE_KEY);
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Apple wants the provider token regenerated at most ~once/20min and treats it
// as valid for up to 60min. Cache and refresh well inside that window.
let cachedJwt = null;
let cachedAt = 0;
function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedAt < 2400) return cachedJwt; // refresh after 40min
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const payload = base64url(JSON.stringify({ iss: TEAM_ID, iat: now }));
  const signingInput = `${header}.${payload}`;
  // ES256 in JOSE form requires the raw R‖S signature (ieee-p1363), not DER.
  const sig = crypto.sign(null, Buffer.from(signingInput), {
    key: PRIVATE_KEY,
    dsaEncoding: 'ieee-p1363',
  });
  cachedJwt = `${signingInput}.${base64url(sig)}`;
  cachedAt = now;
  return cachedJwt;
}

// Deliver one notification to one device token on a given host.
// Returns { status, reason } — reason is APNs' failure code (e.g. BadDeviceToken).
function sendOne(host, token, body) {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on('error', () => resolve({ status: 0, reason: 'ConnectionError' }));

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let data = '';
    req.on('response', (headers) => { status = headers[':status']; });
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      client.close();
      let reason = null;
      if (status !== 200) { try { reason = JSON.parse(data || '{}').reason; } catch {} }
      resolve({ status, reason });
    });
    req.on('error', () => { client.close(); resolve({ status: 0, reason: 'RequestError' }); });

    req.end(JSON.stringify(body));
  });
}

/**
 * Send an APNs push to every native device token registered for a user.
 * payload: { title, body, url? }
 * Best-effort: never throws. Expired tokens (410 / BadDeviceToken) are pruned.
 */
export async function sendApnsToUser(moodleId, payload) {
  if (!configured() || !moodleId) return;

  const sb = getSupabaseAdmin();
  const { data: tokens } = await sb
    .from('device_push_tokens')
    .select('id, token')
    .eq('moodle_id', moodleId);
  if (!tokens?.length) return;

  const apsBody = {
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
    url: payload.url,
  };
  const stale = [];

  await Promise.allSettled(tokens.map(async ({ id, token }) => {
    let res = await sendOne(PROD_HOST, token, apsBody);
    // Debug builds register sandbox tokens; prod host rejects them as BadDeviceToken.
    if (res.status === 400 && res.reason === 'BadDeviceToken' && PROD_HOST !== SANDBOX_HOST) {
      res = await sendOne(SANDBOX_HOST, token, apsBody);
    }
    if (res.status === 410 || res.reason === 'BadDeviceToken' || res.reason === 'Unregistered') {
      stale.push(id);
    }
  }));

  if (stale.length) {
    await sb.from('device_push_tokens').delete().in('id', stale);
  }
}
