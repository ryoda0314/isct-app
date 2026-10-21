/**
 * ScienceTokyo App → 自分の Google カレンダーへの同期 (Google Apps Script)
 *
 * アプリの購読URL(iCal)を定期的に読み、指定したカレンダーに予定を書き込む。
 * 「URLで追加」した購読カレンダーと違い、予定が自分のカレンダーの中に入る。
 * 作った予定には目印(タグ)を付け、次回以降はそれだけを更新・削除する。
 * 自分で入れた予定には触らない。
 *
 * セットアップ:
 *  1. https://script.google.com →「新しいプロジェクト」→ このファイルの中身を全部貼り付けて保存
 *  2. 下の FEED_URL に、アプリの「カレンダー → 連携」でコピーしたURL(https://…/api/ical/….ics)を入れる
 *  3. CALENDAR_NAME を書き込み先のカレンダー名にする
 *  4. 上の関数選択で setup を選んで「実行」→ 権限を許可（カレンダーと外部URLへのアクセス）
 *     → 初回同期が走り、以後 SYNC_MINUTES ごとに自動で同期される
 *  5. 「URLで追加」した「ScienceTokyo App」カレンダーは登録解除する（予定が二重に見えるため）
 *
 * やめるとき: uninstall を実行 → 自動同期を止め、このスクリプトが作った予定をすべて削除する。
 */

const FEED_URL = ''; // 例: 'https://sciencetokyo.app/api/ical/xxxxxxxx.ics'
const CALENDAR_NAME = 'Ryo의 일정';
const SYNC_MINUTES = 30; // 1, 5, 10, 15, 30 のどれか

// 種類ごとの予定の色（書かなければカレンダーの色）。種類: class / deadline / exam / event / my
const KIND_COLOR = {
  deadline: CalendarApp.EventColor.ORANGE,
  exam: CalendarApp.EventColor.RED,
};
// 種類ごとの通知（開始の何分前か）。授業は毎回鳴るとうるさいので通知なし。書かなければカレンダーの既定の通知
const KIND_REMINDERS = {
  class: [],
};

const TAG_UID = 'stapp_uid';
const TAG_HASH = 'stapp_hash';
const DAY = 86400000;
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // 実行時間の上限(6分)の手前で止め、続きは次回に回す

function setup() {
  if (!/^https:\/\/.+\/api\/ical\/[A-Za-z0-9_-]{32}\.ics$/.test(FEED_URL)) {
    throw new Error('FEED_URL にアプリの購読URL (https://…/api/ical/….ics) を入れてください');
  }
  getCalendar_();
  removeTriggers_();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(SYNC_MINUTES).create();
  sync();
}

function uninstall() {
  removeTriggers_();
  const cal = getCalendar_();
  const now = Date.now();
  let n = 0;
  for (const ev of cal.getEvents(new Date(now - 800 * DAY), new Date(now + 800 * DAY))) {
    if (!ev.getTag(TAG_UID)) continue;
    ev.deleteEvent();
    n++;
    pause_();
  }
  console.log(`自動同期を止め、${n} 件の予定を削除しました`);
}

function sync() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return; // 前回の同期がまだ動いている
  try {
    syncLocked_();
  } finally {
    lock.releaseLock();
  }
}

function syncLocked_() {
  const t0 = Date.now();
  const outOfTime = () => Date.now() - t0 > TIME_BUDGET_MS;
  const cal = getCalendar_();

  const res = UrlFetchApp.fetch(FEED_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    // 404 = アプリで連携をやめたか、URLを再発行した。予定は消さずにここで止める。
    throw new Error(`購読URLの取得に失敗しました (HTTP ${res.getResponseCode()})。アプリでURLを再発行した場合は FEED_URL を新しいURLにしてください`);
  }
  const want = parseIcs_(res.getContentText('UTF-8')); // uid → 予定

  // このスクリプトが作った予定を集める（フィードにある予定の期間は必ず含める）
  const now = Date.now();
  let from = now - 200 * DAY;
  let to = now + 400 * DAY;
  for (const e of want.values()) {
    from = Math.min(from, e.start.getTime());
    to = Math.max(to, e.end.getTime());
  }
  const have = new Map();
  let created = 0, updated = 0, deleted = 0;
  for (const ev of cal.getEvents(new Date(from), new Date(to + DAY))) {
    const uid = ev.getTag(TAG_UID);
    if (!uid) continue; // 自分で入れた予定
    if (have.has(uid)) { ev.deleteEvent(); deleted++; pause_(); continue; } // 重複を片付ける
    have.set(uid, ev);
  }

  // 消えた予定・変わった予定
  for (const [uid, ev] of have) {
    if (outOfTime()) return logResult_(created, updated, deleted, true);
    const e = want.get(uid);
    if (!e) {
      // フィードから消えた予定（提出済みの課題・休講など）。過去の予定は履歴として残す。
      if (ev.getEndTime().getTime() >= now) { ev.deleteEvent(); deleted++; pause_(); }
      continue;
    }
    if (ev.getTag(TAG_HASH) === e.hash) { want.delete(uid); continue; } // 変更なし
    ev.deleteEvent(); // 変更あり → 下で作り直す
    updated++;
    pause_();
  }

  // 新しい予定（と作り直す予定）
  for (const [uid, e] of want) {
    if (outOfTime()) return logResult_(created, updated, deleted, true);
    let ev = null;
    try {
      const opts = { location: e.location, description: e.description };
      ev = e.allDay
        ? cal.createAllDayEvent(e.title, e.start, e.end, opts)
        : cal.createEvent(e.title, e.start, e.end, opts);
      ev.setTag(TAG_UID, uid);
      ev.setTag(TAG_HASH, e.hash);
      if (KIND_COLOR[e.kind]) ev.setColor(KIND_COLOR[e.kind]);
      if (KIND_REMINDERS[e.kind]) {
        ev.removeAllReminders();
        KIND_REMINDERS[e.kind].forEach((m) => ev.addPopupReminder(m));
      }
      if (!have.has(uid)) created++;
    } catch (err) {
      // 作成後の設定で止まった予定は目印がなく次回も見分けられない（二重になる）ので消しておく。次回作り直す。
      if (ev) try { ev.deleteEvent(); } catch (_) {}
      console.warn(`予定を作れませんでした（次回の同期で再試行）: ${e.title}: ${err.message}`);
    }
    pause_();
  }
  logResult_(created, updated, deleted, false);
}

// アプリのフィード(lib/ical.js が出力する形式)を読む: uid → { kind, title, start, end, allDay, location, description, hash }
function parseIcs_(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // 折り返し(改行+空白)を戻す
  const out = new Map();
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.UID && cur.DTSTART) {
        const e = toEvent_(cur);
        if (e) out.set(e.uid, e);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const head = line.slice(0, i);
    cur[head.split(';')[0].toUpperCase()] = { head, value: line.slice(i + 1) };
  }
  return out;
}

function toEvent_(p) {
  const text = (k) => (p[k] ? p[k].value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c)) : '');
  const uid = text('UID');
  const allDay = /VALUE=DATE(?!-)/i.test(p.DTSTART.head) || /^\d{8}$/.test(p.DTSTART.value);
  const start = allDay ? parseDate_(p.DTSTART.value) : parseDateTime_(p.DTSTART.value);
  if (!start) return null;
  let end = p.DTEND ? (allDay ? parseDate_(p.DTEND.value) : parseDateTime_(p.DTEND.value)) : null;
  if (!end || end < start) end = allDay ? new Date(start.getTime() + DAY) : start; // 締切は長さ0の予定
  const kind = uid.split('-')[0];
  const e = { uid, kind, title: text('SUMMARY') || '(無題)', start, end, allDay, location: text('LOCATION'), description: text('DESCRIPTION') };
  // 内容と見た目の設定が変わったら作り直すためのハッシュ
  const sig = JSON.stringify([e.title, start.getTime(), end.getTime(), allDay, e.location, e.description, String(KIND_COLOR[kind] || ''), KIND_REMINDERS[kind] || null]);
  e.hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig, Utilities.Charset.UTF_8));
  return e;
}

// 20261019T235000Z → Date（Z なしは日本時間として扱う）
function parseDateTime_(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return new Date(m[7] ? ms : ms - 9 * 3600000);
}

// 20261211 → スクリプトのタイムゾーンでその日の 0:00（終日の予定用）
function parseDate_(v) {
  return /^\d{8}$/.test(v) ? Utilities.parseDate(v, Session.getScriptTimeZone(), 'yyyyMMdd') : null;
}

function getCalendar_() {
  const cal = CalendarApp.getCalendarsByName(CALENDAR_NAME).find((c) => c.isOwnedByMe());
  if (!cal) throw new Error(`カレンダー「${CALENDAR_NAME}」が見つかりません。自分のカレンダーの名前を CALENDAR_NAME に入れてください`);
  return cal;
}

function removeTriggers_() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  }
}

// 予定を一気に作ると Google に止められるので少し間を空ける
function pause_() {
  Utilities.sleep(250);
}

function logResult_(created, updated, deleted, partial) {
  console.log(`同期: 追加 ${created} / 更新 ${updated} / 削除 ${deleted}${partial ? '（時間切れ。続きは次回）' : ''}`);
}
