import HOLIDAYS from '../data/jp-holidays.json';

// 日本の祝日（内閣府CSV由来。年1回 lib/data/jp-holidays.json を更新すること）
const HOLIDAY_SET = new Set(HOLIDAYS);

// JST(Asia/Tokyo) 基準の現在日時。Vercel は UTC のため必ずこちらを使う。
// 返り値: { ymd:"YYYY-MM-DD", minutes: 0-1439, dow:"Sat" 等 }
export function jstNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return {
    ymd: `${m.year}-${m.month}-${m.day}`,
    minutes: parseInt(m.hour, 10) * 60 + parseInt(m.minute, 10),
    dow: m.weekday,
  };
}

export function isJapaneseHoliday(ymd) {
  return HOLIDAY_SET.has(ymd);
}

// 今日に対応する ODPT カレンダー候補（優先順）。
// 土日祝 → SaturdayHoliday 系、平日 → Weekday。事業者ごとの表記差を候補で吸収する。
export function todayCalendars(now = jstNow()) {
  const weekend = now.dow === 'Sat' || now.dow === 'Sun';
  if (weekend || isJapaneseHoliday(now.ymd)) {
    return ['odpt.Calendar:SaturdayHoliday', 'odpt.Calendar:Holiday', 'odpt.Calendar:Sunday', 'odpt.Calendar:Saturday'];
  }
  return ['odpt.Calendar:Weekday'];
}

// 静的時刻表用: 今日が 'weekday' | 'saturday' | 'holiday'(日曜・祝日) か。
// 多くの路線で土曜と休日のダイヤは別なので3区分にする。
export function todayDayType(now = jstNow()) {
  if (isJapaneseHoliday(now.ymd) || now.dow === 'Sun') return 'holiday';
  if (now.dow === 'Sat') return 'saturday';
  return 'weekday';
}

// "HH:MM" → 0時起点の分。深夜跨ぎ補正: 夜遅く(>=20:00)に見た 0:00〜3:59 発は翌日扱い(+1440)。
export function departureMinutes(hhmm, nowMinutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  let mins = h * 60 + m;
  if (nowMinutes >= 20 * 60 && mins < 4 * 60) mins += 24 * 60;
  return mins;
}
