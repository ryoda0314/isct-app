import { useState, useEffect } from 'react';
import { ME, SCHOOLS } from '../data.js';

const SCHOOL_NUM_MAP = {
  "0": "science", "1": "engineering", "2": "matsci",
  "3": "computing", "4": "lifesci", "5": "envsoc",
};

function parseStudentId(id) {
  if (!id || id.length < 4) return null;
  const m = id.match(/^(\d{2})([BMDR])(\d)/i);
  if (!m) return null;
  const schoolKey = SCHOOL_NUM_MAP[m[3]] || null;
  return { yearGroup: m[1] + m[2].toUpperCase(), schoolKey, schoolName: schoolKey ? SCHOOLS[schoolKey]?.name : null };
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

let pref = loadPref();

function merge() {
  // pref の null/undefined で cached の有効値を潰さないようマージ
  const out = { ...cached };
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
  if (changed) { try { localStorage.setItem("userPref", JSON.stringify(pref)); } catch {} }

  notify();
}

// アバター（av, col）などユーザー設定をローカルに保存・反映
export function updateUserPref(patch) {
  pref = { ...pref, ...patch };
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
}

export function useCurrentUser(enabled = true) {
  const [user, setUser] = useState(() => cached ? merge() : { ...(cached || ME), ...pref });

  useEffect(() => {
    const handler = (u) => setUser(u);
    listeners.add(handler);
    if (cached) { handler(merge()); return () => listeners.delete(handler); }
    if (enabled) {
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
