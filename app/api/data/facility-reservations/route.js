import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { fetchReservations } from '../../../../lib/api/facility-reservations.js';

export const maxDuration = 60;

function todayYYYYMMDD() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let creds;
  try {
    creds = await loadCredentials(session.loginId);
  } catch {
    return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
  }

  if (!creds.portalUserId || !creds.portalPassword || !creds.matrix) {
    return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get('date');
  const date = /^\d{8}$/.test(rawDate || '') ? rawDate : todayYYYYMMDD();
  const rawB = searchParams.get('b');
  const building = /^\d+$/.test(rawB || '') ? rawB : '1';
  const debug = searchParams.get('debug') === '1';

  const headers = { 'Cache-Control': debug ? 'no-store' : 'private, max-age=300' };

  try {
    const data = await fetchReservations({
      loginId: session.loginId,
      creds,
      dateYYYYMMDD: date,
      building,
      debug,
    });
    if (data?.error && !debug) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers });
  } catch (err) {
    console.error('[FacilityReservations API] Error:', err.message);
    const failedStep = err.failedStep;
    const stepMessages = {
      connect: 'ポータルサイトに接続できませんでした。時間をおいて再度お試しください。',
      password: 'ポータルのアカウントまたはパスワードが正しくありません。設定画面から再登録してください。',
      matrix: 'マトリクス認証に失敗しました。設定画面からマトリクスカードを再登録してください。',
      network: 'ページの読み込みがタイムアウトしました。通信環境を確認して再度お試しください。',
    };
    return NextResponse.json(
      { error: stepMessages[failedStep] || '予約状況の取得に失敗しました。' },
      { status: 500, headers },
    );
  }
}
