-- Per-user push notification preferences (synced from the app's 通知設定).
-- The server checks these before sending Web Push / APNs, so turning a
-- category off also stops pushes while the app is closed.
-- No row = everything on (default). Run in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS notification_prefs (
  moodle_id  bigint PRIMARY KEY REFERENCES profiles(moodle_id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT true,   -- master switch
  course     boolean NOT NULL DEFAULT true,   -- course timeline posts
  deadline   boolean NOT NULL DEFAULT true,   -- assignment / task deadlines
  dm         boolean NOT NULL DEFAULT true,   -- direct messages
  event      boolean NOT NULL DEFAULT true,   -- events
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (API routes) can read/write.
