import { checkNgWords } from './ng-filter.js';

// 学園祭（工大祭）の出店・展示。/api/festival と /api/festival/applications で共有する定義。
export const TABLE = 'festival_booths';
export const BUCKET = 'festival-public';
export const CURRENT_FESTIVAL = 'koudaisai2026';
export const VALID_CATEGORIES = ['food', 'drink', 'exhibit', 'game', 'stage', 'goods', 'other'];
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
export const LIMITS = { name: 60, org: 60, description: 2000, location: 100, hours: 100, link: 300, building: 40, couponTitle: 40, couponDetail: 200 };
// クーポンを使える期間（工大祭の2日間, JST）
export const COUPON_START = new Date('2026-10-10T00:00:00+09:00');
export const COUPON_END = new Date('2026-10-12T00:00:00+09:00');

export const COLS = 'id, festival, owner_id, name, org, category, description, building, location, hours, link, image, likes, hidden, coupon_title, coupon_detail, coupon_limit, coupon_used, created_at, updated_at';

export const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

export function toClient(sb, b, userid, admin, myUses) {
  const likes = b.likes || [];
  return {
    id: b.id,
    name: b.name,
    org: b.org,
    category: b.category,
    description: b.description,
    building: b.building,
    location: b.location,
    hours: b.hours,
    link: b.link,
    imageUrl: b.image?.path ? sb.storage.from(BUCKET).getPublicUrl(b.image.path).data.publicUrl : null,
    likeCount: likes.length,
    liked: userid ? likes.includes(userid) : false,
    canEdit: !!admin,
    // 掲載した代表者本人（内容の変更を申請できる）
    isMine: !!userid && b.owner_id === userid,
    hidden: admin ? b.hidden : undefined,
    coupon: b.coupon_title ? {
      title: b.coupon_title,
      detail: b.coupon_detail,
      limit: b.coupon_limit,
      used: b.coupon_used || 0,
      myUsedAt: myUses?.get(b.id) || null,
    } : null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

// 入力のバリデーション。成功時は { row }、失敗時は { error }。
export async function buildRow(body, userid) {
  const name = clean(body.name, LIMITS.name);
  if (!name) return { error: '出店名を入力してください' };
  if (!VALID_CATEGORIES.includes(body.category)) return { error: 'カテゴリが不正です' };

  const row = {
    name,
    category: body.category,
    org: clean(body.org, LIMITS.org),
    description: clean(body.description, LIMITS.description),
    building: clean(body.building, LIMITS.building),
    location: clean(body.location, LIMITS.location),
    hours: clean(body.hours, LIMITS.hours),
    link: clean(body.link, LIMITS.link),
  };
  if (row.link && !/^https?:\/\/[^\s]+$/i.test(row.link)) return { error: 'リンクは http(s):// から始まるURLにしてください' };

  // クーポン: null / 未指定ならなし。上限は 1〜10000 の整数か null（上限なし）。
  const c = body.coupon;
  row.coupon_title = c ? clean(c.title, LIMITS.couponTitle) : null;
  row.coupon_detail = row.coupon_title ? clean(c.detail, LIMITS.couponDetail) : null;
  row.coupon_limit = null;
  if (row.coupon_title && c.limit != null && c.limit !== '') {
    const n = Number(c.limit);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return { error: 'クーポンの枚数は1〜10000で入力してください' };
    row.coupon_limit = n;
  }

  const ng = await checkNgWords([row.name, row.org, row.description, row.location, row.hours, row.coupon_title, row.coupon_detail].filter(Boolean).join('\n'), { userId: userid, type: 'festival_booth' });
  if (ng.blocked) return { error: '禁止ワードが含まれています' };

  // 画像: 自分のプレフィックス配下のパスのみ受理。null 指定で削除。
  if (body.image === null) row.image = null;
  else if (body.image?.path) {
    if (typeof body.image.path !== 'string' || !body.image.path.startsWith(`festival/${userid}/`)) return { error: 'invalid image path' };
    row.image = { path: body.image.path };
  }
  return { row };
}
// ── 掲載申請 ──
export const APP_TABLE = 'festival_applications';
export const MIN_MEMBERS = 3;   // 代表者を含む
export const MAX_MEMBERS = 20;
const LOGIN_RE = /^[a-z0-9._-]{2,40}$/;

// Science Tokyo ID の表記ゆれを吸収（前後の空白・大文字・メールアドレス形式）
export const normalizeLogin = (v) => String(v || '').trim().toLowerCase().replace(/@.*$/, '');
export const isValidLogin = (v) => LOGIN_RE.test(v);

// 各 ID がアプリに登録済みかを調べる。login_id は入力どおりの大文字小文字で保存されているため両方で引く。
// 戻り値: Map(normalizedLogin -> { registered, userid, name })
export async function lookupMembers(sb, logins) {
  const variants = [...new Set(logins.flatMap(l => [l, l.toUpperCase()]))];
  const [cred, tok] = await Promise.all([
    sb.from('user_credentials').select('login_id').in('login_id', variants),
    sb.from('user_tokens').select('login_id, moodle_user_id, fullname').in('login_id', variants),
  ]);
  const out = new Map(logins.map(l => [l, { registered: false, userid: null, name: null }]));
  for (const r of cred.data || []) {
    const e = out.get(normalizeLogin(r.login_id));
    if (e) e.registered = true;
  }
  for (const r of tok.data || []) {
    const e = out.get(normalizeLogin(r.login_id));
    if (e) Object.assign(e, { registered: true, userid: r.moodle_user_id, name: r.fullname || null });
  }
  return out;
}
