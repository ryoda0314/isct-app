import { useState, useEffect } from 'react';
import { ME, SCHOOLS } from '../data.js';
import { getAuth } from '../authState.js';

const SCHOOL_NUM_MAP = {
  "0": "science", "1": "engineering", "2": "matsci",
  "3": "computing", "4": "lifesci", "5": "envsoc",
  "6": "medicine", "7": "dentistry",
};
// 旧医歯学系(〜23年度): 8桁数字, 先頭2桁=学科コード
const MED_LEGACY_MAP = {
  "11": "medicine", "21": "medicine", "22": "medicine",
  "31": "dentistry", "32": "dentistry", "39": "dentistry",
};

function parseStudentId(id) {
  if (!id || id.length < 4) return null;
  // 新形式: ○○[BMDR]○○○○○
  const m = id.match(/^(\d{2})([BMDR])(\d)/i);
  if (m) {
    const schoolKey = SCHOOL_NUM_MAP[m[3]] || null;
    return { yearGroup: m[1] + m[2].toUpperCase(), schoolKey, schoolName: schoolKey ? SCHOOLS[schoolKey]?.name : null };
  }
  // 旧医歯学系: 8桁数字
  const mL = id.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL && MED_LEGACY_MAP[mL[1]]) {
    const schoolKey = MED_LEGACY_MAP[mL[1]];
    return { yearGroup: mL[2] + "B", schoolKey, schoolName: SCHOOLS[schoolKey]?.name };
  }
  return null;
}

let cached = null;
let listeners = new Set();

// localStorage に保存されたアバター設定を読み込む
function loadPref() {
  try {
    const v = localStorage.getItem("userPref");
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

let pref = {}; // ログイン後に setCurrentUserFromAPI 経由で設定される（ゲストは guestProfile）

// ゲスト（未ログイン）の所属・表示設定は端末だけに保存する（ログイン任意化）。
// userPref に書くと「この端末でログインしていた」と誤判定されるので、別のキーにする。
const GUEST_KEY = "guestProfile";
function loadGuestPref() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || {}; } catch { return {}; }
}
/** ゲストになったとき（起動時・ログアウト時）に呼ぶ。端末の所属などを読み込む */
export function loadGuestProfile() {
  cached = null;
  pref = loadGuestPref();
  notify();
}
/** ログイン時の移行用: 端末に保存したゲストの所属 */
export function getGuestProfile() { return loadGuestPref(); }

function merge() {
  // pref の null/undefined で cached の有効値を潰さないようマージ。ゲストは ME（既定値）を土台にする
  const out = { ...(cached || ME) };
  for (const k of Object.keys(pref)) {
    if (pref[k] != null) out[k] = pref[k];
    else if (!(k in out) || out[k] == null) out[k] = pref[k];
  }
  return out;
}

function notify() {
  const u = merge();
  listeners.forEach(fn => fn(u));
}

export function setCurrentUserFromAPI(d) {
  if (!d?.userid) return;
  // ログイン確定時に localStorage から pref を読み込む（共有端末でも安全）
  pref = loadPref();
  cached = { ...ME, ...d, moodleId: d.userid, name: d.fullname || '', id: String(d.userid), isAdmin: !!d.isAdmin };

  // 学籍番号から学年グループ・学院を自動推定
  const sid = d.studentId || d.portalUserId || null;
  if (sid) {
    const parsed = parseStudentId(sid);
    if (parsed) {
      if (!cached.yearGroup && parsed.yearGroup) cached.yearGroup = parsed.yearGroup;
      if (!cached.school && parsed.schoolKey) cached.school = parsed.schoolKey;
    }
  }

  // API から取得した値をローカル pref に常に反映（API が source of truth）
  let changed = false;
  if (d.dept && pref.myDept !== d.dept) { pref = { ...pref, myDept: d.dept }; changed = true; }
  if (d.unit && pref.myUnit !== d.unit) { pref = { ...pref, myUnit: d.unit }; changed = true; }
  const effectiveYG = d.yearGroup || cached.yearGroup;
  if (effectiveYG && pref.yearGroup !== effectiveYG) { pref = { ...pref, yearGroup: effectiveYG }; changed = true; }
  // DB にアバター/カラーがあり、ローカルにまだ無い場合は DB の値を反映
  if (d.avatar && !pref.av) { pref = { ...pref, av: d.avatar }; changed = true; }
  if (d.color && !pref.col) { pref = { ...pref, col: d.color }; changed = true; }
  if (changed) { try { localStorage.setItem("userPref", JSON.stringify(pref)); } catch {} }

  notify();
}

// アバター（av, col）などユーザー設定をローカルに保存・反映
export function updateUserPref(patch) {
  pref = { ...pref, ...patch };
  if (getAuth().status !== "account") {
    // ゲスト: 端末にだけ保存し、サーバー（/api/auth/me）には送らない
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(pref)); } catch {}
    notify();
    return;
  }
  try { localStorage.setItem("userPref", JSON.stringify(pref)); } catch {}
  notify();

  // myDept / myUnit が変更されたら DB にも永続化
  if ('myDept' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dept: patch.myDept }),
    }).catch(() => {});
  }
  if ('myUnit' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit: patch.myUnit }),
    }).catch(() => {});
  }
  if ('yearGroup' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearGroup: patch.yearGroup }),
    }).catch(() => {});
  }
  if ('av' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: patch.av || null }),
    }).catch(() => {});
  }
  if ('col' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: patch.col || null }),
    }).catch(() => {});
  }
  if ('bio' in patch) {
    fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: patch.bio || null }),
    }).catch(() => {});
  }
}

export function resetCurrentUserCache() {
  cached = null;
  pref = {};
  // 以前は listeners.clear() していたが、それだと App の useCurrentUser が外れてしまい、
  // ログアウト → 別の人がログインしても App の user が更新されなかった。既定値（ME）を通知する。
  notify();
}

export function useCurrentUser(enabled = true) {
  const [user, setUser] = useState(() => cached ? merge() : { ...ME });

  useEffect(() => {
    const handler = (u) => setUser(u);
    listeners.add(handler);
    // cached があっても常にAPIで最新ユーザーを検証する（共有端末対策）
    if (cached) handler(merge());
    if (enabled && getAuth().status === "account") {
      (async () => {
        try {
          const r = await fetch('/api/auth/me');
          if (!r.ok) return;
          const d = await r.json();
          setCurrentUserFromAPI(d);
        } catch {}
      })();
    }
    return () => listeners.delete(handler);
  }, []);

  return user;
}
