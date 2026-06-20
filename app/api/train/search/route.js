import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import {
  hasOdptKey, searchStations, getRailway, getRailDirection, getTrainTypeMap,
} from '../../../../lib/api/odpt.js';

// 駅名（正式名称）検索 → 路線/方向/種別メタを付けて返す。ルート登録UI用。
// GET ?q=大岡山&lang=ja

const locStr = (obj, lang) => (obj ? (obj[lang] || obj.ja || obj.en || '') : '');

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    if (!hasOdptKey()) {
      return NextResponse.json({ error: 'odpt_key_missing', results: [] }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const lang = searchParams.get('lang') || 'ja';
    if (!q) return NextResponse.json({ results: [] });

    const stations = await searchStations(q);

    const results = await Promise.all(stations.map(async (s) => {
      const rw = await getRailway(s.railway).catch(() => null);
      const dirIds = (rw && rw['odpt:railDirection']) || [];
      const directions = await Promise.all(
        dirIds.map((d) => getRailDirection(d).catch(() => ({ id: d, title: { ja: d } })))
      );
      const typeMap = await getTrainTypeMap(s.operator).catch(() => ({}));
      return {
        station: s.station,
        stationTitle: locStr(s.stationTitle, lang),
        railway: s.railway,
        railwayTitle: rw ? locStr(rw['odpt:railwayTitle'] || { ja: rw['dc:title'] }, lang) : '',
        operator: s.operator,
        directions: directions.map((d) => ({ id: d.id, title: locStr(d.title, lang) })),
        trainTypes: Object.entries(typeMap).map(([id, title]) => ({ id, title: locStr(title, lang) })),
      };
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Train search]', err);
    return NextResponse.json({ error: 'Internal error', results: [] }, { status: 500 });
  }
}
