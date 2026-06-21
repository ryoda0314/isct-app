-- プロフィールの自己紹介(bio)カラム追加
-- 友達/自分のプロフィール画面で表示。本人のみ編集可（/api/auth/me PATCH 経由・service_role）。
alter table profiles add column if not exists bio text;
