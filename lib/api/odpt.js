import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

// ODPT (公共交通オープンデータセンター) API v4 client.
// 時刻表データは https://api.odpt.org/api/v4/ から取得し、acl:consumerKey でキーを付与する。
// レスポンスは DATA_DIR にファイルキャッシュ（カタログ系=長期、時刻表=1日）。
// 出典表記義務: 「公共交通オープンデータセンター」。UI 側にクレジットを出すこと。

const ODPT_BASE = 'https://api.odpt.org/api/v4';
const CACHE_FILE = path.join(DATA_DIR, 'odpt-cache.json');

const DAY = 24 * 60 * 60 * 1000;
export const CATALOG_TTL = 30 * DAY;   // 駅/路線/種別カタログは滅多に変わらない
export const TIMETABLE_TTL = 1 * DAY;  // 時刻表はダイヤ改正時のみ

const apiKey = () => process.env.ODPT_API_KEY || process.env.ODPT_CONSUMER_KEY || '';
export const hasOdptKey = () => !!apiKey();

// ── 単一ファイルに { [cacheKey]: { t, data } } を保持（syllabus-cache と同方針） ──
let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); }
  catch { _cache = {}; }
  return _cache;
}
function saveCache() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache));
  } catch {}
}

// 汎用 GET。type 例: 'odpt:Station' / 'odpt:Railway' / 'odpt:StationTimetable'
async function odptGet(type, params = {}, ttl = CATALOG_TTL) {
  const key = apiKey();
  if (!key) throw new Error('ODPT_API_KEY_MISSING');

  const cacheKey = `${type}?${new URLSearchParams(params).toString()}`;
  const c = loadCache();
  const hit = c[cacheKey];
  if (hit && Date.now() - hit.t < ttl) return hit.data;

  const qs = new URLSearchParams({ ...params, 'acl:consumerKey': key });
  const url = `${ODPT_BASE}/${type}?${qs.toString()}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    if (hit) return hit.data; // ネットワーク不通 → 古いキャッシュで凌ぐ
    throw e;
  }
  if (!res.ok) {
    if (hit) return hit.data; // 4xx/5xx → 古いキャッシュにフォールバック
    throw new Error(`ODPT ${type} ${res.status}`);
  }
  const data = await res.json();
  c[cacheKey] = { t: Date.now(), data };
  saveCache();
  return data;
}

// 多言語タイトルから lang を選ぶ（無ければ ja → en → dc:title → id 末尾）
export function pickTitle(obj, titleKey, lang = 'ja') {
  if (!obj) return '';
  const tt = obj[titleKey];
  if (tt && typeof tt === 'object') return tt[lang] || tt.ja || tt.en || '';
  return obj['dc:title'] || '';
}

const sameAs = (o) => o['owl:sameAs'] || o['@id'];
const idTail = (id) => (id ? String(id).split(/[:.]/).pop() : '');

// ── 駅名（正式名称）で検索。ODPT は dc:title 完全一致のみ対応 ──
// 返り値: 路線ごとに 1 件。{ station, railway, operator, stationTitle{ja,en} }
export async function searchStations(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const list = await odptGet('odpt:Station', { 'dc:title': q }, CATALOG_TTL);
  return (Array.isArray(list) ? list : []).map((s) => ({
    station: sameAs(s),
    railway: s['odpt:railway'],
    operator: s['odpt:operator'],
    stationTitle: s['odpt:stationTitle'] || { ja: s['dc:title'] || q },
  }));
}

// 路線オブジェクト（railDirection 配列 / stationOrder / タイトルを含む）
export async function getRailway(railwayId) {
  const list = await odptGet('odpt:Railway', { 'owl:sameAs': railwayId }, CATALOG_TTL);
  return (Array.isArray(list) && list[0]) || null;
}

// RailDirection id → { id, title{ja,en} }
export async function getRailDirection(dirId) {
  if (!dirId) return null;
  const list = await odptGet('odpt:RailDirection', { 'owl:sameAs': dirId }, CATALOG_TTL);
  const o = (Array.isArray(list) && list[0]) || null;
  return {
    id: dirId,
    title: o ? (o['odpt:railDirectionTitle'] || { ja: o['dc:title'] || idTail(dirId) }) : { ja: idTail(dirId) },
  };
}

// 路線上の全駅の id→title マップ（行先表示・終端解決に使う）
export async function getStationTitleMap(railwayId) {
  const list = await odptGet('odpt:Station', { 'odpt:railway': railwayId }, CATALOG_TTL);
  const map = {};
  for (const s of (Array.isArray(list) ? list : [])) {
    map[sameAs(s)] = s['odpt:stationTitle'] || { ja: s['dc:title'] || idTail(sameAs(s)) };
  }
  return map;
}

// 事業者の列車種別 id→title マップ
export async function getTrainTypeMap(operatorId) {
  const list = await odptGet('odpt:TrainType', { 'odpt:operator': operatorId }, CATALOG_TTL);
  const map = {};
  for (const tt of (Array.isArray(list) ? list : [])) {
    map[sameAs(tt)] = tt['odpt:trainTypeTitle'] || { ja: tt['dc:title'] || idTail(sameAs(tt)) };
  }
  return map;
}

// 駅・方向・カレンダー候補から駅時刻表の stationTimetableObject 配列を返す。
// calendars は優先順（先頭から試す）。見つからなければカレンダー無指定で取得し候補に一致するものを選ぶ。
// 返り値: { available, departures:[{departureTime, trainType, destination[]}], calendar } | { available:false }
export async function getStationTimetable(railwayId, stationId, directionId, calendars) {
  const base = { 'odpt:station': stationId, 'odpt:railDirection': directionId };
  if (railwayId) base['odpt:railway'] = railwayId;

  for (const cal of calendars) {
    const list = await odptGet('odpt:StationTimetable', { ...base, 'odpt:calendar': cal }, TIMETABLE_TTL);
    const obj = (Array.isArray(list) ? list : [])[0];
    if (obj && Array.isArray(obj['odpt:stationTimetableObject']) && obj['odpt:stationTimetableObject'].length) {
      return normalizeTimetable(obj);
    }
  }
  // フォールバック: カレンダー無指定で全取得し、候補カレンダーに一致 → なければ先頭
  const all = await odptGet('odpt:StationTimetable', base, TIMETABLE_TTL);
  const arr = Array.isArray(all) ? all : [];
  if (!arr.length) return { available: false };
  const match = arr.find((o) => calendars.includes(o['odpt:calendar'])) || arr[0];
  return normalizeTimetable(match);
}

function normalizeTimetable(obj) {
  const departures = (obj['odpt:stationTimetableObject'] || []).map((o) => ({
    departureTime: o['odpt:departureTime'] || o['odpt:arrivalTime'] || null,
    trainType: o['odpt:trainType'] || null,
    destination: o['odpt:destinationStation'] || [],
    isLast: !!o['odpt:isLast'],
  })).filter((d) => d.departureTime);
  return { available: true, calendar: obj['odpt:calendar'], departures };
}
