import crypto from 'node:crypto';
import { LOCAL_PASSPHRASE } from '../config.js';

// =============================================================
// App SSO — 「ScienceTokyoでログイン」プロバイダ
//
// 自作の外部アプリ(store_apps の target_type='url')が、ScienceTokyo App の
// アカウントでログインできるようにする OAuth 風フロー。
//
//   1) 外部アプリ → GET /api/sso/authorize?redirect_uri=&state=
//        ScienceTokyo セッションを確認し、短命の署名付き code を発行して
//        redirect_uri へ 302。
//   2) 外部アプリ(サーバー) → POST /api/sso/token { code, client_secret }
//        code を検証し、ユーザー情報 { id, name } を返す。
//
// code は LOCAL_PASSPHRASE 由来の鍵で HMAC 署名したステートレストークン。
// client_secret は外部アプリと共有する秘密(env APP_SSO_SECRET)。code 単体を
// 傍受されても secret 無しには交換できない(OAuth の confidential client 相当)。
// =============================================================

const HMAC_KEY = crypto.createHash('sha256')
  .update(`app-sso:${LOCAL_PASSPHRASE}`)
  .digest();

const CODE_TTL_MS = 120 * 1000; // 2分

/** 外部アプリと共有する client_secret。未設定なら SSO 無効。 */
export function getClientSecret() {
  return process.env.APP_SSO_SECRET || '';
}

/** 定数時間で文字列比較。 */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

/** 認可コードを発行。sub=moodleユーザーid, name=氏名, aud=redirect_uri origin。 */
export function signCode({ sub, name, aud }) {
  const payload = JSON.stringify({
    sub: String(sub), name: name || '', aud: aud || '',
    iat: Date.now(), exp: Date.now() + CODE_TTL_MS,
  });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_KEY).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

/** 認可コードを検証。成功で { sub, name, aud } / 失敗で null。 */
export function verifyCode(code) {
  if (!code || typeof code !== 'string') return null;
  const dot = code.indexOf('.');
  if (dot === -1) return null;
  const b64 = code.slice(0, dot);
  const sig = code.slice(dot + 1);
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac('sha256', HMAC_KEY).update(b64).digest('hex');
  if (!safeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (!p.sub || !p.exp || Date.now() > p.exp) return null;
    return { sub: p.sub, name: p.name || '', aud: p.aud || '' };
  } catch { return null; }
}

/** URL の origin を返す(不正なら null)。 */
export function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}
