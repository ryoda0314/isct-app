-- Add a dedup key to notifications so repeated triggers (e.g. deadline
-- reminders posted on every app load / from multiple devices) collapse into
-- a single notification instead of spamming the user.
--
-- NULLs are treated as distinct by a UNIQUE index, so existing notification
-- types that don't set dedup_key (dm, comment, mention, friend_request, ...)
-- are unaffected — only rows that opt in by setting dedup_key are deduped.

alter table notifications add column if not exists dedup_key text;

create unique index if not exists uq_notifications_dedup
  on notifications(moodle_user_id, dedup_key);
