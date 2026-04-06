-- =============================================================
-- Disk IO最適化: 不足インデックスの追加
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- 1. dm_conversations: user1_id / user2_id それぞれにインデックス
--    DM一覧取得の .or(`user1_id.eq.X,user2_id.eq.X`) が毎回シーケンシャルスキャンになっている
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user1
  ON dm_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user2
  ON dm_conversations(user2_id);

-- 2. bookmarks: (moodle_user_id, created_at desc) 複合インデックス
--    既存の idx_bookmarks_user は moodle_user_id のみで ORDER BY created_at をカバーできていない
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_time
  ON bookmarks(moodle_user_id, created_at DESC);

-- 3. notifications: read=false の未読通知フィルタ用部分インデックス
--    PATCH で .eq('read', false) のフィルタが走る
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(moodle_user_id, created_at DESC)
  WHERE read = false;

-- 4. profiles: last_active_at DESC インデックス（既存なら追加不要）
--    管理画面のアクティブユーザー一覧で使用
CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON profiles(last_active_at DESC);
