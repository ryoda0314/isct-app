-- 出欠(attendance_records)に「休講(cancelled)」ステータスを許可する堅牢化。
-- ベースDDL(migration.sql)では status は CHECK 制約なしの text。
-- 値の妥当性は API(app/api/attendance/route.js の STATUSES)で担保しているが、
-- DB 側にも制約を張っておく（任意）。冪等なので何度実行しても安全。
alter table attendance_records drop constraint if exists attendance_records_status_check;
alter table attendance_records
  add constraint attendance_records_status_check
  check (status in ('present', 'absent', 'late', 'cancelled'));
