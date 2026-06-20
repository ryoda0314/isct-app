import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import {
  hasOdptKey, getStationTimetable, getStationTitleMap, getTrainTypeMap,
} from '../../../../lib/api/odpt.js';
import { jstNow, todayCalendars, departureMinutes } from '../../../../lib/api/jp-calendar.js';

// 駅・方向の本日の発車を返す。GET ?railway=&station=&direction=&type=&lang=ja
// 主種別(type)の直近2本(main) + 種別問わず直近3本(supplement)。

const locStr = (obj, lang) => (obj ? (obj[lang] || obj.ja || obj.en || '') : '');

function operatorOf(railway) {
  const tail = String(railway).split(':')[1] || ''; // "Tokyu.Meguro"
  const op = tail.split('.')[0];                     // "Tokyu"
  return op ? `odpt.Operator:${op}` : null;
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    if (!hasOdptKey()) {
      return NextResponse.json({ available: false, reason: 'odpt_key_missing' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const railway = searchParams.get('railway');
    const station = searchParams.get('station');
    const direction = searchParams.get('direction');
    const type = searchParams.get('type') || null;
    const lang = searchParams.get('lang') || 'ja';
    if (!railway || !station || !direction) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const now = jstNow();
    const cals = todayCalendars(now);
    const tt = await getStationTimetable(railway, station, direction, cals);
    if (!tt.available) {
      return NextResponse.json({ available: false, reason: 'no_open_data' });
    }

    const operator = operatorOf(railway);
    const [titleMap, typeMap] = await Promise.all([
      getStationTitleMap(railway).catch(() => ({})),
      operator ? getTrainTypeMap(operator).catch(() => ({})) : Promise.resolve({}),
    ]);

    const upcoming = tt.departures
      .map((d) => {
        const mins = departureMinutes(d.departureTime, now.minutes);
        return { ...d, mins, minutesUntil: mins - now.minutes };
      })
      .filter((d) => d.minutesUntil >= 0)
      .sort((a, b) => a.mins - b.mins);

    const fmt = (d) => ({
      time: d.departureTime,
      minutesUntil: d.minutesUntil,
      trainType: d.trainType,
      trainTypeTitle: locStr(typeMap[d.trainType], lang) || '',
      destination: d.destination && d.destination[0] ? locStr(titleMap[d.destination[0]], lang) : '',
      isRegisteredType: type ? d.trainType === type : true,
      isLast: d.isLast,
    });

    const registered = type ? upcoming.filter((d) => d.trainType === type) : upcoming;
    const main = registered.slice(0, 2).map(fmt);
    const supplement = upcoming.slice(0, 3).map(fmt);

    return NextResponse.json({
      available: true,
      finished: upcoming.length === 0, // 本日の運行終了
      calendar: tt.calendar,
      registeredType: type,
      registeredTypeTitle: type ? (locStr(typeMap[type], lang) || '') : '',
      main,
      supplement,
    });
  } catch (err) {
    console.error('[Train departures]', err);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }
}
