import { useState, useEffect, useCallback } from 'react';
import { t } from "../i18n.js";
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_FESTIVAL_BOOTHS, DEMO_FESTIVAL_APPS } from '../festivalDemoData.js';

const MAX_EDGE = 1200;

// 画像を長辺1200pxに縮小して WebP（非対応なら JPEG）に再エンコードする。
// 公開バケットの egress と2MB上限の両方を抑えるため、アップロード前に必ず通す。
async function compressImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error(t("festival.imageReadFailed"));
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const toBlob = (type, q) => new Promise(r => c.toBlob(r, type, q));
  let blob = await toBlob("image/webp", 0.8);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.82);
  if (!blob) throw new Error(t("festival.imageReadFailed"));
  return blob;
}

async function uploadImage(file) {
  const blob = await compressImage(file);
  const signRes = await fetch('/api/festival', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sign-upload', type: blob.type, size: blob.size }),
  });
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(sign.error || t("toast.signedUrlFailed"));
  const { error } = await getSupabaseClient().storage
    .from(sign.bucket)
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: blob.type });
  if (error) throw new Error(error.message || t("toast.uploadFailed"));
  return { path: sign.path };
}

async function api(method, body, url = '/api/festival') {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || t("toast.saveFailed"));
  return d;
}

export function useFestival() {
  const [booths, setBooths] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [couponWindow, setCouponWindow] = useState(null);
  const [myApps, setMyApps] = useState([]);

  const refresh = useCallback(async () => {
    // デモモードはテストデータを表示し、以降の操作もすべて端末内だけで行う
    if (isDemoMode()) { setBooths(prev => prev.length ? prev : DEMO_FESTIVAL_BOOTHS); setMyApps(prev => prev.length ? prev : DEMO_FESTIVAL_APPS); setLoading(false); return; }
    try {
      const r = await fetch('/api/festival');
      if (r.ok) {
        const d = await r.json();
        setBooths(d.booths || []);
        setIsAdmin(!!d.isAdmin);
        if (d.couponWindow) setCouponWindow({ start: new Date(d.couponWindow.start), end: new Date(d.couponWindow.end) });
      }
      // 自分の申請（未ログインなら 401 で空のまま）
      const ra = await fetch('/api/festival/applications');
      if (ra.ok) setMyApps((await ra.json()).applications || []);
    } catch (e) { console.error('[useFestival]', e); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const replace = (b) => setBooths(prev => prev.map(x => x.id === b.id ? b : x));

  // form: {name, org, category, description, building, location, hours, link}
  // imageFile: 新しい画像 / removeImage: 既存画像を外す
  const save = useCallback(async (id, form, imageFile, removeImage) => {
    if (isDemoMode()) {
      const prev = id ? booths.find(b => b.id === id) : null;
      const b = {
        ...prev, ...form, id: id || `test-local-${Date.now()}`,
        coupon: form.coupon ? { ...form.coupon, limit: form.coupon.limit ? Number(form.coupon.limit) : null, used: prev?.coupon?.used || 0, myUsedAt: null } : null,
        imageUrl: imageFile ? URL.createObjectURL(imageFile) : removeImage ? null : prev?.imageUrl || null,
        likeCount: prev?.likeCount || 0, liked: prev?.liked || false, canEdit: true, createdAt: prev?.createdAt || new Date().toISOString(),
      };
      setBooths(list => id ? list.map(x => x.id === id ? b : x) : [b, ...list]);
      return b;
    }
    const body = { ...form };
    if (imageFile) body.image = await uploadImage(imageFile);
    else if (removeImage) body.image = null;
    if (id) {
      const b = await api('PATCH', { ...body, id, action: 'edit' });
      replace(b);
      return b;
    }
    const b = await api('POST', body);
    setBooths(prev => [b, ...prev]);
    return b;
  }, [booths]);

  const toggleLike = useCallback(async (id) => {
    // 楽観更新
    setBooths(prev => prev.map(b => b.id === id ? { ...b, liked: !b.liked, likeCount: b.likeCount + (b.liked ? -1 : 1) } : b));
    if (isDemoMode()) return;
    try {
      const d = await api('PATCH', { id, action: 'like' });
      setBooths(prev => prev.map(b => b.id === id ? { ...b, ...d } : b));
    } catch { refresh(); }
  }, [refresh]);

  const remove = useCallback(async (id) => {
    if (!isDemoMode()) await api('DELETE', { id });
    setBooths(prev => prev.filter(b => b.id !== id));
  }, []);

  // 店頭でクーポンを使う。成功（または使用済み）なら使用時刻を返す。
  const redeemCoupon = useCallback(async (id) => {
    let usedAt, used;
    if (isDemoMode()) {
      const b = booths.find(x => x.id === id);
      if (b?.coupon?.limit && b.coupon.used >= b.coupon.limit) throw new Error(t("festival.couponSoldOut"));
      usedAt = b?.coupon?.myUsedAt || new Date().toISOString();
      used = (b?.coupon?.used || 0) + (b?.coupon?.myUsedAt ? 0 : 1);
    } else {
      ({ usedAt, used } = await api('POST', { action: 'use-coupon', id }));
    }
    setBooths(prev => prev.map(b => b.id === id && b.coupon ? { ...b, coupon: { ...b.coupon, myUsedAt: usedAt, used } } : b));
    return usedAt;
  }, [booths]);

  // 掲載申請（boothId があれば掲載中の出店の変更申請）。memberProofs は scanMember で得た証明。
  const apply = useCallback(async (form, imageFile, removeImage, memberProofs, boothId) => {
    if (isDemoMode()) {
      if (!boothId && memberProofs.length + 1 < 3) throw new Error(t("festival.applyNeedMembers", { n: 3 - 1 - memberProofs.length }));
      const a = { id: `test-app-${Date.now()}`, status: 'pending', boothId: boothId || null, name: form.name, createdAt: new Date().toISOString() };
      setMyApps(prev => [a, ...prev]);
      return a;
    }
    const { imagePath, ...rest } = form;
    const body = { ...rest, memberProofs, boothId: boothId || undefined };
    if (imageFile) body.image = await uploadImage(imageFile);
    else if (imagePath) body.image = { path: imagePath }; // 一時保存の時点で上げ済み
    else if (removeImage) body.image = null;
    const a = await api('POST', body, '/api/festival/applications');
    setMyApps(prev => [a, ...prev]);
    return a;
  }, []);

  // 一時保存用に画像を先に上げる → { path, url }
  const uploadDraftImage = useCallback(async (file) => {
    if (isDemoMode()) return { path: `demo/${Date.now()}`, url: URL.createObjectURL(file) };
    const { path } = await uploadImage(file);
    const { data } = getSupabaseClient().storage.from('festival-public').getPublicUrl(path);
    return { path, url: data.publicUrl };
  }, []);

  // メンバー用QR（自分を代表者に読み取ってもらう）
  const getMemberQr = useCallback(async () => {
    if (isDemoMode()) return { code: `ISCTFEST1:demo.${Date.now()}`, ttl: 90 };
    return api('POST', { action: 'member-qr' }, '/api/festival/applications');
  }, []);

  // 代表者がメンバーのQRを読み取る → { proof, member }
  const scanMember = useCallback(async (code) => {
    if (isDemoMode()) {
      const n = Math.floor(Math.random() * 900) + 100;
      return { proof: `demo-${n}`, member: { id: 900200 + n, name: `テスト メンバー${n}` } };
    }
    return api('POST', { action: 'scan-member', code }, '/api/festival/applications');
  }, []);

  const withdraw = useCallback(async (id) => {
    if (!isDemoMode()) await api('PATCH', { id, action: 'withdraw' }, '/api/festival/applications');
    setMyApps(prev => prev.map(a => a.id === id ? { ...a, status: 'withdrawn' } : a));
  }, []);

  const toggleHidden = useCallback(async (id) => {
    replace(await api('PATCH', { id, action: 'hide' }));
  }, []);

  // デモモードは開催前でも試せるよう、期間制限なし
  const couponOpen = isDemoMode() || (couponWindow && Date.now() >= couponWindow.start && Date.now() < couponWindow.end);

  return { booths, isAdmin, myApps, apply, withdraw, getMemberQr, scanMember, uploadDraftImage, loading, refresh, save, toggleLike, remove, toggleHidden, redeemCoupon, couponOpen, couponWindow };
}
