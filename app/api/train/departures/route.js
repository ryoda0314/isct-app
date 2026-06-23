import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { jstNow, todayDayType, departureMinutes } from '../../../../lib/api/jp-calendar.js';
import { getStaticDestinationDepartures } from '../../../../lib/api/static-timetables.js';

// 出発駅→目的地の、本日ダイヤで「目的地に停車する」直近の発車を返す。
// GET ?origin=&dest=&lang=ja → { available, finished, trains:[{ time, minutesUntil,
//      trainTypeTitle, destination(行先), requiredMin(所要分) }] }
// ※ 現状は静的同梱(東急)のみ。ODPT 対応は将来拡張。

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const origin = searchParams.get('origin');
    const dest = searchParams.get('dest');
    const lang = searchParams.get('lang') || 'ja';
    if (!origin || !dest) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const src = getStaticDestinationDepartures(origin, dest, todayDayType(), lang);
    if (!src.available) {
      return NextResponse.json({ available: false, reason: 'no_data' });
    }

    // この目的地に来る列車種別（本日ダイヤ・時刻問わず）。クライアントの種別フィルタUI用。
    const availableTypes = [];
    const seenType = new Set();
    for (const d of src.departures) {
      if (d.trainType && !seenType.has(d.trainType)) {
        seenType.add(d.trainType);
        availableTypes.push({ id: d.trainType, title: d.trainTypeTitle || '' });
      }
    }

    const now = jstNow();
    const upcoming = src.departures
      .map((d) => {
        const m = departureMinutes(d.departureTime, now.minutes);
        return { ...d, _m: m, minutesUntil: m - now.minutes };
      })
      .filter((d) => d.minutesUntil >= 0)
      .sort((a, b) => a._m - b._m)
      .slice(0, 12)
      .map((d) => ({
        time: d.departureTime,
        minutesUntil: d.minutesUntil,
        trainType: d.trainType || '',
        trainTypeTitle: d.trainTypeTitle || '',
        destination: d.destination || '',
        requiredMin: d.requiredMin,
      }));

    return NextResponse.json({
      available: true,
      finished: upcoming.length === 0,
      availableTypes,
      trains: upcoming,
    });
  } catch (err) {
    console.error('[Train departures]', err);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }
}
