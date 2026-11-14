// キャリア（インターン・就活・イベント）の掲載データ: 入力チェック、URL の正規化、公開してよい形への変換。
// 表は supabase/career.sql の career_listings。書き込みは管理者（app/api/admin/career）と定期処理だけ。
//
// 制度面の前提（計画書 2 章）: 載せた内容は募集元の記載どおりに出す（的確表示）。最終確認日を必ず持つ。
// 公開 API は絞り込みを受け取らない（興味はサーバーに送らない）ので、ここでも人の属性は扱わない。

import {
  CAREER_KINDS, CAREER_FIELDS, CAREER_SKILLS, REWARD_KINDS, PAY_KINDS, REMOTE_KINDS,
  DURATIONS, DEGREES, PROMO_KINDS, LISTING_STATUSES, DEPT_CODES,
} from './career-tags.js';

export const CAREER_TABLE = 'career_listings';

const LIMITS = { title: 120, org: 80, summary: 400, short: 120, period: 60, location: 80, url: 1000 };

// 制御文字を除いて前後の空白を落とし、長さを切る（改行は summary だけ残す）
function clean(v, max, { multiline = false } = {}) {
  if (v == null) return '';
  let s = String(v);
  s = s.split('').filter((c) => {
    const n = c.charCodeAt(0);
    if (multiline && (n === 10)) return true;
    return n >= 32 && n !== 127;
  }).join('');
  s = s.replace(/\r/g, '').trim();
  return s.slice(0, max);
}

function httpUrl(v) {
  const s = clean(v, LIMITS.url);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

/**
 * 重複判定用に URL を正規化する: スキーム・#以降・計測用パラメータ・末尾の / を除き、ホストを小文字に、
 * 残りのクエリを並べ替える。同じ募集に違う計測パラメータ付きで来ても同じ値になる。
 */
export function normalizeUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid|yclid|mc_[a-z]+|_ga|ref|ref_src)$/i.test(k)) u.searchParams.delete(k);
  }
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, '') || '';
  const q = u.searchParams.toString();
  return `${u.host.toLowerCase()}${path}${q ? `?${q}` : ''}`;
}

const subset = (arr, allowed, max = 30) =>
  Array.isArray(arr) ? [...new Set(arr.map(String).filter((x) => allowed.includes(x)))].slice(0, max) : [];

const oneOf = (v, allowed) => (v == null || v === '' ? null : allowed.includes(String(v)) ? String(v) : undefined);

function isoOrNull(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function dateOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? s : undefined;
}

/**
 * 管理画面からの入力を表の行にする。{ row } か { error }。
 * source は manual / tip / partner:<名前>（提携先の取り込みは別の経路で作るので、ここでは manual と tip だけ受ける）。
 */
export function buildListing(input = {}) {
  const kind = oneOf(input.kind, CAREER_KINDS);
  if (!kind) return { error: '種類（インターン・就職・イベント）を選んでください' };
  const title = clean(input.title, LIMITS.title);
  const org = clean(input.org, LIMITS.org);
  if (!title) return { error: 'タイトルを入れてください' };
  if (!org) return { error: '組織名を入れてください' };
  const apply_url = httpUrl(input.apply_url);
  if (!apply_url) return { error: '応募先の URL（http/https）を入れてください' };
  const org_url = httpUrl(input.org_url);
  const source_url = httpUrl(input.source_url);
  if (org_url === null || source_url === null) return { error: 'URL は http か https で始まるものにしてください' };

  const fields = subset(input.fields, CAREER_FIELDS);
  if (!fields.length) return { error: '分野を 1 つ以上選んでください（興味との照合に使います）' };

  const status = oneOf(input.status, LISTING_STATUSES);
  const pay_kind = oneOf(input.pay_kind, PAY_KINDS);
  const remote = oneOf(input.remote, REMOTE_KINDS);
  const duration = oneOf(input.duration, DURATIONS);
  const reward_kind = oneOf(input.reward_kind, REWARD_KINDS);
  const promo = oneOf(input.promo, PROMO_KINDS);
  if ([status, pay_kind, remote, duration, reward_kind, promo].includes(undefined)) return { error: '選択肢に無い値があります' };

  const starts_at = isoOrNull(input.starts_at);
  const ends_at = isoOrNull(input.ends_at);
  const deadline = dateOrNull(input.deadline);
  if ([starts_at, ends_at, deadline].includes(undefined)) return { error: '日付の形が正しくありません' };
  if (starts_at && ends_at && ends_at < starts_at) return { error: '終了が開始より前になっています' };

  const reward_text = clean(input.reward_text, LIMITS.short);
  if (kind === 'event') {
    if (!reward_kind) return { error: 'イベントは「もらえるもの」の種類を選んでください（なしも選べます）' };
    if (reward_kind !== 'none' && !reward_text) return { error: 'もらえるものの内容を、募集元の記載どおりに入れてください' };
    if (!starts_at && !deadline) return { error: 'イベントは開催日か締切を入れてください' };
  }

  let intern_type = input.intern_type == null || input.intern_type === '' ? null : Number(input.intern_type);
  if (intern_type != null && !(Number.isInteger(intern_type) && intern_type >= 1 && intern_type <= 4)) return { error: 'インターンの類型は 1〜4 です' };

  let reward_max = input.reward_max == null || input.reward_max === '' ? null : Number(input.reward_max);
  if (reward_max != null && !(Number.isInteger(reward_max) && reward_max >= 0 && reward_max <= 100_000_000)) return { error: '金額（最大）は 0 以上の整数（円）です' };

  const grad_years = Array.isArray(input.grad_years)
    ? [...new Set(input.grad_years.map(Number).filter((y) => Number.isInteger(y) && y >= 2020 && y <= 2045))].sort().slice(0, 8)
    : [];

  const source = input.source === 'tip' ? 'tip' : 'manual';

  return {
    row: {
      kind, title, org,
      org_url: org_url || null,
      summary: clean(input.summary, LIMITS.summary, { multiline: true }) || null,
      apply_url,
      apply_url_norm: normalizeUrl(apply_url),
      source, source_url: source_url || null,
      fields,
      skills_req: subset(input.skills_req, CAREER_SKILLS),
      skills_pref: subset(input.skills_pref, CAREER_SKILLS),
      depts: subset(input.depts, DEPT_CODES, 40),
      degrees: subset(input.degrees, DEGREES),
      grad_years,
      intern_type,
      duration,
      period_text: clean(input.period_text, LIMITS.period) || null,
      pay_kind,
      pay_text: clean(input.pay_text, LIMITS.short) || null,
      remote,
      location: clean(input.location, LIMITS.location) || null,
      reward_kind: kind === 'event' ? reward_kind : null,
      reward_text: kind === 'event' ? (reward_text || null) : null,
      reward_max: kind === 'event' ? reward_max : null,
      starts_at, ends_at, deadline,
      promo,
      promo_note: clean(input.promo_note, LIMITS.short) || null,
      ...(status ? { status } : {}),
    },
  };
}

/** 今日（日本時間）の YYYY-MM-DD */
export function todayJST(now = Date.now()) {
  const d = new Date(now + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}

/**
 * 掲載中として見せてよいか: published で、締切が今日以降（または随時）、開催が終わっていない。
 * 終了日の無いイベントは、開始から 1 日たったら終わったとみなす。
 */
export function isActiveListing(row, now = Date.now()) {
  if (!row || row.status !== 'published') return false;
  if (row.deadline && row.deadline < todayJST(now)) return false;
  const end = row.ends_at ? Date.parse(row.ends_at) : row.starts_at ? Date.parse(row.starts_at) + 86400e3 : null;
  if (end != null && end < now) return false;
  return true;
}

// 公開 API で返す列（管理用の列 created_by / link_status などは出さない）
export const PUBLIC_COLUMNS = [
  'id', 'kind', 'title', 'org', 'org_url', 'summary', 'apply_url', 'source', 'source_url',
  'fields', 'skills_req', 'skills_pref', 'depts', 'degrees', 'grad_years',
  'intern_type', 'duration', 'period_text', 'pay_kind', 'pay_text', 'remote', 'location',
  'reward_kind', 'reward_text', 'reward_max', 'starts_at', 'ends_at', 'deadline',
  'promo', 'promo_note', 'checked_at', 'created_at', 'updated_at',
];

export function toPublic(row) {
  const out = {};
  for (const k of PUBLIC_COLUMNS) out[k] = row[k] ?? null;
  return out;
}
