import crypto from 'node:crypto';
import { LOCAL_PASSPHRASE } from './config.js';
import { checkNgWords } from './ng-filter.js';

// 学園祭（工大祭）の出店・展示。/api/festival と /api/festival/applications で共有する定義。
export const TABLE = 'festival_booths';
export const BUCKET = 'festival-public';
export const CURRENT_FESTIVAL = 'koudaisai2026';
export const VALID_CATEGORIES = ['food', 'drink', 'exhibit', 'game', 'stage', 'goods', 'other'];
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
export const MAX_MENU_ITEMS = 30;
export const LIMITS = { menuName: 40, menuDesc: 120, name: 60, org: 60, description: 2000, location: 100, hours: 100, link: 300, building: 40, couponTitle: 40, couponDetail: 200 };
// クーポンを使える期間（工大祭の2日間, JST）
export const COUPON_START = new Date('2026-10-10T00:00:00+09:00');
export const COUPON_END = new Date('2026-10-12T00:00:00+09:00');

export const COLS = 'id, festival, owner_id, name, org, category, description, building, location, hours, link, image, likes, hidden, coupon_title, coupon_detail, coupon_limit, coupon_used, menu, created_at, updated_at';

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
    menu: Array.isArray(b.menu) ? b.menu : [],
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

  // メニュー: 名前のない行は捨てる。価格は 0〜100000 の整数か null
  const menu = [];
  for (const it of Array.isArray(body.menu) ? body.menu : []) {
    const name = clean(it?.name, LIMITS.menuName);
    if (!name) continue;
    let price = null;
    if (it.price != null && it.price !== '') {
      price = Number(it.price);
      if (!Number.isInteger(price) || price < 0 || price > 100000) return { error: `「${name}」の価格は0〜100000の整数で入力してください` };
    }
    menu.push({ name, description: clean(it.description, LIMITS.menuDesc), price });
  }
  if (menu.length > MAX_MENU_ITEMS) return { error: `メニューは${MAX_MENU_ITEMS}品までです` };
  row.menu = menu;

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

  const ng = await checkNgWords([row.name, row.org, row.description, row.location, row.hours, row.coupon_title, row.coupon_detail, ...row.menu.flatMap(m => [m.name, m.description])].filter(Boolean).join('\n'), { userId: userid, type: 'festival_booth' });
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

export const LINK_TABLE = 'festival_member_links';
export const DRAFT_TABLE = 'festival_drafts';

// メンバーの本人確認は対面のQRで行う（IDの手入力による水増しを防ぐ）。
//  1. メンバーが自分の「メンバー用QR」を表示する（90秒で失効、署名つき）
//  2. 代表者がそれを読み取ると、代表者の「確認済みメンバー名簿」に登録される（期限なし）
//  3. 申請時はサーバーが名簿からメンバーを引く（クライアントから人数を偽れない）
const KEY = crypto.createHash('sha256').update(`festival-member:${LOCAL_PASSPHRASE}`).digest();
const sign = (s) => crypto.createHmac('sha256', KEY).update(s).digest('base64url').slice(0, 22);
const sameSig = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const nowSec = () => Math.floor(Date.now() / 1000);
export const MEMBER_QR_TTL = 90;
const QR_PREFIX = 'ISCTFEST1:';

export function makeMemberQr(userid) {
  const body = `${userid}.${nowSec() + MEMBER_QR_TTL}`;
  return `${QR_PREFIX}${body}.${sign(`qr:${body}`)}`;
}

// 読み取ったQRを検証し、メンバーの moodle id を返す。不正・期限切れは { error }
export function readMemberQr(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(QR_PREFIX)) return { error: 'メンバー用QRではありません' };
  const [uid, exp, sig] = raw.slice(QR_PREFIX.length).split('.');
  if (!uid || !exp || !sig || !sameSig(sig, sign(`qr:${uid}.${exp}`))) return { error: 'QRを確認できませんでした' };
  if (Number(exp) < nowSec()) return { error: 'QRの有効期限が切れています。メンバーに表示し直してもらってください' };
  return { userid: Number(uid) };
}

// 見送りになった申請の内容（festival_booths の列の形）をフォームの下書きの形に戻す
export function draftFromPayload(sb, p) {
  return {
    f: {
      name: p.name || '', org: p.org || '', category: p.category || 'food', description: p.description || '',
      building: p.building || '', location: p.location || '', hours: p.hours || '', link: p.link || '',
    },
    menu: (p.menu || []).map(m => ({ name: m.name || '', description: m.description || '', price: m.price != null ? String(m.price) : '' })),
    couponOn: !!p.coupon_title,
    cp: { title: p.coupon_title || '', detail: p.coupon_detail || '', limit: p.coupon_limit ? String(p.coupon_limit) : '' },
    image: p.image?.path ? { path: p.image.path, url: sb.storage.from(BUCKET).getPublicUrl(p.image.path).data.publicUrl } : null,
    removeImage: false,
  };
}
