// トレセン（トレーニングルーム）の開館スケジュール — 当面ハードコード。
// hours は全ユーザー共通の静的データなのでサーバー不要。変更はこのファイルを編集するだけ。
// 将来 DB / スクレイプ化する場合もこの API（todayHours / isOpenNow / monthSchedule）を保てば
// 呼び出し側は変えずに済む。

// 入口に貼る静的QRのペイロード（サーバー app/api/gym/checkin の EXPECTED_QR と一致させる）。
export const GYM_QR = "sciencetokyo-gym:ookayama";

// 混雑度しきい値（現在人数 → ラベル）。参考値運用なので控えめな段階で十分。
export const CONGESTION = [
  { max: 4,        key: "gym.congEmpty" },   // 空いている
  { max: 9,        key: "gym.congMild" },    // やや混雑
  { max: 14,       key: "gym.congBusy" },    // 混雑
  { max: Infinity, key: "gym.congFull" },    // 非常に混雑
];
export const congestionKey = (count) => (CONGESTION.find((c) => count <= c.max) || CONGESTION[0]).key;

// ── 通常の曜日別開館時間 ─────────────────────────────────
// 0=日 1=月 2=火 3=水 4=木 5=金 6=土。closed:true で休館。
export const WEEKLY = {
  0: { closed: true },                    // 日
  1: { open: "10:00", close: "17:45" },   // 月
  2: { open: "10:00", close: "17:45" },   // 火
  3: { open: "10:00", close: "17:45" },   // 水
  4: { open: "10:00", close: "17:45" },   // 木
  5: { open: "10:00", close: "17:45" },   // 金
  6: { closed: true },                    // 土
};

// ── 臨時の例外（日付別オーバーライド）──────────────────
// type: 'closed'(休館) | 'short'(短縮) | 'class'(授業による利用停止)
//       | 'inspection'(安全点検) | 'special'(臨時変更)
// closed 系以外は open/close を併記すると短縮開館として扱う。
// 例:
//   { date: "2026-06-25", type: "short",      open: "10:00", close: "14:00", label: "短縮開館" },
//   { date: "2026-06-27", type: "closed",     label: "安全点検のため休館" },
//   { date: "2026-07-01", type: "inspection", label: "設備点検" },
export const EXCEPTIONS = [
  // ここに臨時変更を追加
];

// 表示用ラベル/アイコン（色だけで区別しない）。i18n キーで解決。
export const STATUS_META = {
  open:       { key: "gym.statusNormal",     mark: "○", labelKey: "gym.legendNormal" },
  short:      { key: "gym.statusShort",      mark: "△", labelKey: "gym.legendShort" },
  closed:     { key: "gym.statusClosed",     mark: "×", labelKey: "gym.legendClosed" },
  class:      { key: "gym.statusClass",      mark: "授", labelKey: "gym.legendClass" },
  inspection: { key: "gym.statusInspection", mark: "点", labelKey: "gym.legendInspection" },
  special:    { key: "gym.statusSpecial",    mark: "！", labelKey: "gym.legendSpecial" },
};

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// 指定日の開館情報を返す: { type, closed, open?, close?, label? }
export function hoursFor(date) {
  const iso = toISO(date);
  const ex = EXCEPTIONS.find((e) => e.date === iso);
  if (ex) {
    const closed = ex.type === "closed" || ex.type === "class" || ex.type === "inspection" || !ex.open;
    return { type: ex.type, closed, open: ex.open, close: ex.close, label: ex.label };
  }
  const w = WEEKLY[date.getDay()] || { closed: true };
  if (w.closed) return { type: "closed", closed: true };
  return { type: "open", closed: false, open: w.open, close: w.close };
}

// 本日の開館情報
export const todayHours = (now = new Date()) => hoursFor(now);

// 最終入館時刻（閉館 closeBeforeMin 分前。既定15分前）。"HH:MM" or null
export function lastEntry(hours, closeBeforeMin = 15) {
  if (!hours || hours.closed || !hours.close) return null;
  const m = toMin(hours.close) - closeBeforeMin;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// いま開館中か（最終入館を過ぎていても閉館までは開館中扱い）
export function isOpenNow(now = new Date()) {
  const h = hoursFor(now);
  if (h.closed || !h.open || !h.close) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= toMin(h.open) && cur < toMin(h.close);
}

// カレンダー描画用: 指定年月の全日 [{ date(Date), iso, dow, ...hoursFor }]
export function monthSchedule(year, month /* 0-indexed */) {
  const days = new Date(year, month + 1, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    out.push({ date, iso: toISO(date), dow: date.getDay(), ...hoursFor(date) });
  }
  return out;
}
