-- =============================================================
-- お知らせ: 2026年度 2Q 期末試験の日程を追加
-- 「期末試験を確認」ボタン（link='exams'）付き。
-- 前提: admin-features.sql を適用済み（announcements.link カラムが必要）
--       exam-seed-2026-2q.sql で試験データを投入済み
-- =============================================================

-- created_by は admin_users に登録された管理者から自動選択（ハードコード不要）。
-- 同じお知らせが既にあれば二重投入しない（再実行しても安全）。
INSERT INTO announcements (title, body, type, active, popup, link, created_by)
SELECT
  '📅 2026年度 2Q 期末試験の日程を追加しました',
  E'学士課程 2026年度 第2Q の期末試験時間割をアプリに追加しました。\n下の「期末試験を確認」ボタンから、あなたの履修科目の試験日・時限・教室をチェックできます。\n\n試験期間: 7/29(水) 〜 8/6(木)',
  'update',   -- 種別: アップデート（緑）
  true,       -- active: 公開
  true,       -- popup: 起動時にモーダル表示（バナーだけにするなら false に）
  'exams',    -- 遷移先ボタン → 期末試験画面
  au.moodle_user_id
FROM admin_users au
JOIN profiles p ON p.moodle_id = au.moodle_user_id
WHERE NOT EXISTS (
  SELECT 1 FROM announcements a
  WHERE a.link = 'exams'
    AND a.title = '📅 2026年度 2Q 期末試験の日程を追加しました'
)
ORDER BY au.moodle_user_id
LIMIT 1;

-- 補足: 上のINSERTが「0 rows」の場合、admin_users にレコードが無い環境です。
--   その場合は自分の moodle_id を直接指定して投入してください:
--
-- INSERT INTO announcements (title, body, type, active, popup, link, created_by)
-- VALUES (
--   '📅 2026年度 2Q 期末試験の日程を追加しました',
--   E'学士課程 2026年度 第2Q の期末試験時間割をアプリに追加しました。\n下の「期末試験を確認」ボタンから、あなたの履修科目の試験日・時限・教室をチェックできます。\n\n試験期間: 7/29(水) 〜 8/6(木)',
--   'update', true, true, 'exams',
--   <あなたのmoodle_id>
-- );
