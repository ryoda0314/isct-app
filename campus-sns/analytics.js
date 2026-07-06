// 利用状況アナリティクス（クライアント側）
//
// 方針: イベントを 1 件ずつ送らず、メモリのキューに溜めて「まとめて」送る。
//   - サーバーは 1 回の複数行 INSERT で済む → DB の IO 予算にやさしい。
//   - 送信タイミング: 一定件数 / 一定間隔 / 画面を離れるとき(sendBeacon)。
//
// 使い方:
//   import { track, setAnalyticsEnabled } from './analytics.js';
//   setAnalyticsEnabled(true);          // 実ログイン時のみ有効化（demo/guest は無効）
//   track('app_open');
//   track('feature_open', 'timetable');

const ENDPOINT = '/api/track';
const FLUSH_INTERVAL = 20000;   // 20 秒ごとに定期フラッシュ
const FLUSH_AT = 15;            // キューがこの件数に達したら即フラッシュ
const MAX_BATCH = 50;           // 1 送信あたりの上限（サーバーと一致）

let enabled = false;
let queue = [];
let timer = null;
let listenersBound = false;

// 起動ごとに一意なセッション ID（= 1 回の利用の単位）。フルロードで新規発行。
const sessionId = genSid();

function genSid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  } catch {}
  return 'sid' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

export function setAnalyticsEnabled(v) {
  enabled = !!v;
  if (enabled) bindLifecycle();
  else { queue = []; if (timer) { clearInterval(timer); timer = null; } }
}

export function track(event, feature, meta) {
  if (!enabled || typeof window === 'undefined') return;
  const e = { event, sid: sessionId, ts: Date.now() };
  if (feature) e.feature = feature;
  if (meta) e.meta = meta;
  queue.push(e);
  if (queue.length >= FLUSH_AT) flush();
  else scheduleTimer();
}

function scheduleTimer() {
  if (timer) return;
  timer = setInterval(() => { if (queue.length) flush(); }, FLUSH_INTERVAL);
}

// キューを送信。keepalive 付き fetch を使う（sendBeacon は相対 URL がネイティブの
// fetch インターセプタを通らず送信先が狂うため使わない）。keepalive なら離脱・
// バックグラウンド遷移中でも送り切れる。エラーは握りつぶす（分析ログの取りこぼしは
// 機能に影響しない）。失敗分はキューに戻して次回に回す。
export function flush() {
  if (!queue.length) return;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  const payload = JSON.stringify({ events: batch });

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'include',
  }).then(r => {
    if (!r.ok && r.status !== 401 && r.status !== 429) queue.unshift(...batch);
  }).catch(() => { queue.unshift(...batch); });
}

function bindLifecycle() {
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;
  // 画面を離れる/バックグラウンドに入るタイミングで取りこぼさず送る。
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => flush());
}
