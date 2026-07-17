-- =============================================================
-- お知らせ: 2026年度 2Q 期末試験の日程を追加
-- 「期末試験を確認」ボタン（link='exams'）付き。
-- 前提: admin-features.sql を適用済み（announcements.link カラムが必要）
--       exam-seed-2026-2q.sql で試験データを投入済み
-- =============================================================

-- ▼ 診断: まず現状を確認（任意）。exam行が出れば既に投入済み。
-- select id, title, active, popup, link, created_by, created_at
-- from announcements order by id desc limit 5;

-- ▼ 投入: created_by は「admin_users の管理者 → 居なければ任意のプロフィール」の順で自動選択。
--   admin_users が空でも必ず1件挿入される。二重投入はガード（再実行しても安全）。
INSERT INTO announcements (title, body, type, active, popup, link, created_by)
SELECT
  '📅 2026年度 2Q 期末試験の日程を追加しました',
  E'学士課程 2026年度 第2Q の期末試験時間割をアプリに追加しました。\n下の「期末試験を確認」ボタンから、あなたの履修科目の試験日・時限・教室をチェックできます。\n\n試験期間: 7/29(水) 〜 8/6(木)',
  'update',   -- 種別: アップデート（緑）
  true,       -- active: 公開
  false,      -- popup: false=ホームのバナーに常時表示 / true=起動時モーダル
  'exams',    -- 遷移先ボタン → 期末試験画面
  COALESCE(
    (SELECT au.moodle_user_id FROM admin_users au
       JOIN profiles p ON p.moodle_id = au.moodle_user_id
       ORDER BY au.moodle_user_id LIMIT 1),
    (SELECT moodle_id FROM profiles ORDER BY moodle_id LIMIT 1)
  )
WHERE NOT EXISTS (
  SELECT 1 FROM announcements a
  WHERE a.link = 'exams'
    AND a.title = '📅 2026年度 2Q 期末試験の日程を追加しました'
);

-- ▼ もし前回 popup=true で投入済み → 一度モーダルで確認すると再表示されない。
--   下記でバナー表示に切り替え＆公開状態にできる:
-- update announcements set popup = false, active = true where link = 'exams';
