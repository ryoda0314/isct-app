import { useState, useEffect, useCallback } from 'react';
import { t } from "../i18n.js";
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_FESTIVAL_BOOTHS } from '../festivalDemoData.js';

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

async function api(method, body) {
  const r = await fetch('/api/festival', {
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

  const refresh = useCallback(async () => {
    // デモモードはテストデータを表示し、以降の操作もすべて端末内だけで行う
    if (isDemoMode()) { setBooths(prev => prev.length ? prev : DEMO_FESTIVAL_BOOTHS); setLoading(false); return; }
    try {
      const r = await fetch('/api/festival');
      if (r.ok) {
        const d = await r.json();
        setBooths(d.booths || []);
        setIsAdmin(!!d.isAdmin);
        if (d.couponWindow) setCouponWindow({ start: new Date(d.couponWindow.start), end: new Date(d.couponWindow.end) });
      }
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
        likeCount: prev?.likeCount || 0, liked: prev?.liked || false, isMine: true, createdAt: prev?.createdAt || new Date().toISOString(),
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

  const toggleHidden = useCallback(async (id) => {
    replace(await api('PATCH', { id, action: 'hide' }));
  }, []);

  // デモモードは開催前でも試せるよう、期間制限なし
  const couponOpen = isDemoMode() || (couponWindow && Date.now() >= couponWindow.start && Date.now() < couponWindow.end);

  return { booths, isAdmin, loading, refresh, save, toggleLike, remove, toggleHidden, redeemCoupon, couponOpen, couponWindow };
}
