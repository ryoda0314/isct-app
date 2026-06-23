import generated from '../data/static-timetables.generated.json';

// 静的同梱の時刻表（ODPT 未提供＝東急など）。「出発駅から目的地で選ぶ」型。
// 各出発駅(origin)について、到達可能な目的地(stations)・本日ダイヤの発車(departures)・
// 列車の停車駅と所要分(patterns)を持つ。目的地に実際に停車する列車だけを所要時間付きで返せる。
// データは scripts/gen-tokyu-timetable.mjs で再生成（出典: ekitan、個人利用前提）。

const LINES = [generated]; // 出発駅を増やすときはここに足す

export const isStaticId = (id) => typeof id === 'string' && id.startsWith('static.');

const lineByOrigin = (origin) => LINES.find((l) => l.origin.station === origin);
const loc = (obj, lang) => (obj ? (obj[lang] || obj.ja || obj.en || '') : '');

// 静的に対応している出発駅の一覧（今は大岡山のみ）
export function staticOrigins(lang = 'ja') {
  return LINES.map((l) => ({ station: l.origin.station, title: loc(l.origin.title, lang) }));
}

// 目的地検索: 駅名(部分一致)で、各出発駅から到達可能な目的地を返す。
// 返り値: [{ origin, originTitle, dest, destTitle }]
export function searchStaticDestinations(query, lang = 'ja') {
  const q = (query || '').trim();
  if (!q) return [];
  const lc = q.toLowerCase();
  const out = [];
  for (const line of LINES) {
    for (const [dest, title] of Object.entries(line.stations)) {
      if (dest === line.origin.station) continue;
      const ja = title.ja || '', en = title.en || '';
      if (!(ja.includes(q) || en.toLowerCase().includes(lc))) continue;
      out.push({
        origin: line.origin.station,
        originTitle: loc(line.origin.title, lang),
        dest,
        destTitle: loc(title, lang),
      });
    }
  }
  return out;
}

export function staticStationTitle(stationId, lang = 'ja') {
  for (const line of LINES) {
    if (line.stations[stationId]) return loc(line.stations[stationId], lang);
  }
  return '';
}

// origin→dest の本日ダイヤ発車（dest に停車する列車だけ）を正規形で返す。
// 返り値: { available, departures:[{ departureTime:"HH:MM", trainType(id), trainTypeTitle(str),
//          destination(行先名), requiredMin(所要分) }] }
export function getStaticDestinationDepartures(origin, dest, dayType, lang = 'ja') {
  const line = lineByOrigin(origin);
  if (!line) return { available: false };
  if (!line.stations[dest]) return { available: false };
  const list = line.departures[dayType] || [];
  const departures = [];
  for (const d of list) {
    const stops = line.patterns[d.pattern]?.stops;
    if (!stops || stops[dest] == null) continue; // その列車は dest に停車しない
    departures.push({
      departureTime: d.time,
      trainType: d.type,
      trainTypeTitle: loc(line.trainTypes[d.type], lang),
      destination: d.terminus,            // 列車の行先（表示用）
      requiredMin: stops[dest],           // 大岡山→dest の所要分
    });
  }
  return { available: true, departures, attribution: line.source };
}
