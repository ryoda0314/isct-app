// ============================================================
// 端末保存（ログイン任意化）
//
// ログインしていない（ゲスト）ときに、ふだんはサーバーに保存するデータを端末の localStorage に保存する。
// 対象: 自分の ToDo・自分の予定・電車の登録経路・出欠の記録・ジムのトレーニング記録（＋参加予定は eventRsvps）。
// 各フック（useTasks など）は、アカウントならサーバー、ゲストなら端末を使う（返す関数の形は同じ）。
//
// ログインしたら MigrateLocalData が「アカウントへ移しますか？」と聞き、MIGRATIONS で 1 件ずつ送る。
// 送れたものだけ端末から消す（失敗した分は端末に残る）。
// キーは accountStorage.js の許可リスト（guest_ 前方一致）に入っているので、ログアウトでは消えない。
// ============================================================

export const LOCAL = {
  tasks: "guest_tasks_v1",             // [{ id, t, d, due(ISO|null) }]
  events: "guest_events_v1",           // [{ id, title, color, memo, start(ISO), end(ISO|null) }]
  trainRoutes: "guest_train_routes_v1", // [{ id, origin_station, dest_station, label, sort_order, on_home, type_filter }]
  attendance: "guest_attendance_v1",   // { "kind|course|session": { kind, course_key, session_key, session_date, status } }
  gymWorkouts: "guest_gym_workouts_v1", // [{ id, exercise_name, weight_kg, reps, sets, notes, logged_at }]
};

export function readLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
export const newLocalId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// アカウントのデータが外から変わった（移行が終わった）ことを各フックに知らせる → サーバーから取り直す
export const ACCOUNT_DATA_EVENT = "sct:account-data-changed";
export const notifyAccountDataChanged = () => { try { window.dispatchEvent(new Event(ACCOUNT_DATA_EVENT)); } catch {} };

// ── 出欠: 端末の記録 ⇄ フックの records 形 { [kind]: { [course]: { [session]: status } } } ──
export function attendanceRecordsFromLocal() {
  const map = readLocal(LOCAL.attendance, {});
  const out = {};
  for (const e of Object.values(map)) {
    if (!e?.kind || !e?.status) continue;
    ((out[e.kind] ||= {})[e.course_key] ||= {})[e.session_key] = e.status;
  }
  return out;
}

const postJson = (url, body, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── ログイン時の移行。labelKey は i18n、count は件数、run は送って「送れなかった残り」を返す ──
export const MIGRATIONS = [
  {
    key: LOCAL.tasks, labelKey: "migrate.tasks",
    count: () => readLocal(LOCAL.tasks, []).length,
    run: async () => {
      const left = [];
      for (const it of readLocal(LOCAL.tasks, [])) {
        try {
          const r = await postJson("/api/tasks", { title: it.t, due: it.due || null });
          if (!r.ok) { left.push(it); continue; }
          if (it.d) { const row = await r.json(); await postJson("/api/tasks", { id: row.id, done: true }, "PATCH"); }
        } catch { left.push(it); }
      }
      return left;
    },
  },
  {
    key: LOCAL.events, labelKey: "migrate.events",
    count: () => readLocal(LOCAL.events, []).length,
    run: async () => {
      const list = readLocal(LOCAL.events, []);
      if (!list.length) return [];
      try {
        const r = await postJson("/api/my-events", { events: list.map(({ title, color, memo, start, end }) => ({ title, color: color || null, memo: memo || "", start, end: end || null })) });
        return r.ok ? [] : list;
      } catch { return list; }
    },
  },
  {
    key: LOCAL.trainRoutes, labelKey: "migrate.trainRoutes",
    count: () => readLocal(LOCAL.trainRoutes, []).length,
    run: async () => {
      const left = [];
      for (const it of readLocal(LOCAL.trainRoutes, [])) {
        try {
          const r = await postJson("/api/train/routes", { origin_station: it.origin_station, dest_station: it.dest_station, label: it.label || null, sort_order: it.sort_order || 0 });
          if (!r.ok) { left.push(it); continue; }
          const saved = await r.json();
          if (it.on_home || it.type_filter) {
            await postJson("/api/train/routes", { id: saved.id, ...(it.on_home ? { on_home: true } : {}), ...(it.type_filter ? { type_filter: it.type_filter } : {}) }, "PATCH").catch(() => {});
          }
        } catch { left.push(it); }
      }
      return left;
    },
  },
  {
    key: LOCAL.attendance, labelKey: "migrate.attendance",
    count: () => Object.keys(readLocal(LOCAL.attendance, {})).length,
    run: async () => {
      const left = {};
      for (const [k, e] of Object.entries(readLocal(LOCAL.attendance, {}))) {
        try {
          const r = await postJson("/api/attendance", { kind: e.kind, course_key: e.course_key, session_key: e.session_key, session_date: e.session_date || null, status: e.status });
          if (!r.ok) left[k] = e;
        } catch { left[k] = e; }
      }
      return Object.keys(left).length ? left : [];
    },
  },
  {
    key: LOCAL.gymWorkouts, labelKey: "migrate.gymWorkouts",
    count: () => readLocal(LOCAL.gymWorkouts, []).length,
    run: async () => {
      const left = [];
      for (const it of readLocal(LOCAL.gymWorkouts, [])) {
        try {
          const { id, ...fields } = it;
          const r = await postJson("/api/gym/workouts", fields);
          if (!r.ok) left.push(it);
        } catch { left.push(it); }
      }
      return left;
    },
  },
];

/** 端末に移行できるデータがあれば [{ key, labelKey, n }] を返す */
export function pendingMigrations() {
  return MIGRATIONS.map((m) => ({ key: m.key, labelKey: m.labelKey, n: m.count() })).filter((x) => x.n > 0);
}

/** 全部送る。送れなかった分は端末に残す。戻り値: { moved, failed } の件数 */
export async function runMigrations() {
  let moved = 0, failed = 0;
  for (const m of MIGRATIONS) {
    const n = m.count();
    if (!n) continue;
    const left = await m.run();
    const nLeft = Array.isArray(left) ? left.length : Object.keys(left).length;
    moved += n - nLeft; failed += nLeft;
    if (nLeft) writeLocal(m.key, left);
    else { try { localStorage.removeItem(m.key); } catch {} }
  }
  notifyAccountDataChanged();
  return { moved, failed };
}
