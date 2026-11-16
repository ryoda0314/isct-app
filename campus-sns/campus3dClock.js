// 世界の時計（デジタルツインの芯 1：2026-11-10）。太陽・月・星・季節・天気・電車が、同じ「いまの時刻」を読む。
// ふだんは本当の今（live）。デバッグで日時と進む速さを決められる（set：決めた時刻から speed 倍で進む。0 なら止まる）。
// テストの window.__mapClock（見え方）・window.__trainClock（電車）は今までどおりそちらが先（campus3dSky.lookClock・campus3dTrains.serviceClock）
// タイムスリップ（slip：2026-11-16）：日付だけ決めた日（日本時間の "YYYY-MM-DD"）にして、時刻は本当の今の時刻のまま進む。
// 日付は変わらない（その日の 24 時を過ぎると同じ日の 0 時へ）。見え方のボタン（昼・夕方・夜）はそのまま効く（worldIsSet は false）
const S = { mode: "live", base: 0, at: 0, speed: 1, day: null, dayStart: 0 };
const subs = new Set();
const perf = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const DAY_MS = 86400000;
const JST = 9 * 3600000;

// いまの時刻（ミリ秒）
export function worldNow(p = perf()) {
  if (S.mode === "live") return Date.now();
  if (S.mode === "slip") return S.dayStart + ((((Date.now() + JST) % DAY_MS) + DAY_MS) % DAY_MS);
  return S.base + (p - S.at) * S.speed;
}
export const worldDate = () => new Date(worldNow());
// 状態 { mode（live / set / slip）, speed, time, day（タイムスリップの日。ほかは null） }
export const worldClock = () => ({ mode: S.mode, speed: S.mode === "set" ? S.speed : 1, time: worldNow(), day: S.mode === "slip" ? S.day : null });
// デバッグで決めた時刻か（本当の今でない。タイムスリップは含めない）
export const worldIsSet = () => S.mode === "set";
// 世界の日付（日本時間の "YYYY-MM-DD"）。feature の from・until と比べる
export function worldDay(ms = worldNow()) {
  const d = new Date(ms + JST);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
// タイムスリップしている日（していなければ null）
export const slipDay = () => (S.mode === "slip" ? S.day : null);

function emit() {
  const st = worldClock();
  subs.forEach((fn) => {
    try {
      fn(st);
    } catch {
      /* ほかの受け手は止めない */
    }
  });
}
// 時刻（ミリ秒）と速さを決める。time を省くと今の時刻のまま、speed を省くと今の速さのまま
export function setWorldClock({ time, speed } = {}) {
  const now = worldNow();
  const sp = speed ?? (S.mode === "live" ? 1 : S.speed);
  S.mode = "set";
  S.base = Number.isFinite(time) ? time : now;
  S.at = perf();
  S.speed = sp;
  S.day = null;
  emit();
}
// 本当の今に戻す
export function worldLive() {
  S.mode = "live";
  S.speed = 1;
  S.day = null;
  emit();
}
// その日へタイムスリップ（day は日本時間の "YYYY-MM-DD"。時刻は今の時刻のまま）。日付として読めなければ何もしない
export function slipTo(day) {
  const t0 = typeof day === "string" ? Date.parse(`${day}T00:00:00+09:00`) : NaN;
  if (!Number.isFinite(t0) || worldDay(t0) !== day) return false;
  S.mode = "slip";
  S.speed = 1;
  S.day = day;
  S.dayStart = t0;
  emit();
  return true;
}
// 変わったとき（決めた・戻した）に呼ぶ。返り値で外す
export function onWorldClock(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// 日本時間の年月日・時分（表示・入力用）
export function jstParts(ms) {
  const d = new Date(ms + 9 * 3600000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
// 日本時間の "YYYY-MM-DD" と "HH:MM" から時刻（ミリ秒）
export function jstTime(day, hm = "12:00") {
  const t = Date.parse(`${day}T${hm.length === 5 ? `${hm}:00` : hm}+09:00`);
  return Number.isFinite(t) ? t : NaN;
}
// 日本時間のその年の何日目（1 月 1 日 0 時が 0。小数つき）
export function dayOfYear(ms) {
  const p = jstParts(ms);
  const start = Date.UTC(p.y, 0, 1) - 9 * 3600000;
  return (ms - start) / 86400000;
}
