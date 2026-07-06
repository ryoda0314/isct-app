import { NextResponse } from 'next/server';
import { verifyCode, getClientSecret, safeEqual, originOf } from '../../../../lib/auth/app-sso.js';

// POST /api/sso/token  { code, client_secret, redirect_uri? }
// 外部アプリ「サーバー」から呼ぶ(client_secret を守るためブラウザからは呼ばない)。
// 成功: { user: { id, name } }
export async function POST(request) {
  const secret = getClientSecret();
  if (!secret) return NextResponse.json({ error: 'SSO not configured' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const { code, client_secret, redirect_uri } = body || {};

  if (!client_secret || !safeEqual(client_secret, secret)) {
    return NextResponse.json({ error: 'invalid client' }, { status: 401 });
  }

  const claims = verifyCode(code);
  if (!claims) return NextResponse.json({ error: 'invalid or expired code' }, { status: 400 });

  // code は発行時の redirect_uri origin(aud)に束縛。渡されていれば一致を確認。
  if (redirect_uri) {
    const o = originOf(redirect_uri);
    if (!o || (claims.aud && claims.aud !== o)) {
      return NextResponse.json({ error: 'redirect_uri mismatch' }, { status: 400 });
    }
  }

  return NextResponse.json({ user: { id: claims.sub, name: claims.name || '' } });
}
