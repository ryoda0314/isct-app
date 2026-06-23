-- =============================================================
-- music-public バケット: 全員配信の公式曲(is_public)の音源・カバーを置く「公開」バケット。
--
-- 目的: 公開バケットの object は安定URL(/storage/v1/object/public/...)で配信され CDN キャッシュが効く。
--       従来は非公開バケット post-attachments + 署名URL で配信していたが、署名URLはトークンが毎回
--       変わるためキャッシュが一切効かず、全員の再生ごとに mp3 をフル転送 → Storage egress が爆発していた。
--       (2026-06 に Free Plan egress 5GB 超過。Storage egress が全体の90%、実体は65MBのみ＝同一ファイルの大量再DL)
--
-- 個人曲(is_public=false)は引き続き非公開バケット post-attachments + 署名URL のまま（秘匿のため）。
--
-- Supabase Dashboard の SQL Editor で実行（冪等：再実行可）。
-- 実行後、既存7曲の実体ファイルを post-attachments → music-public へコピーする必要がある
-- （object のバイト実体は SQL ではコピーできないため Storage API で実施）。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('music-public', 'music-public', true, 52428800)  -- 50MB/ファイル
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- 公開バケットは object の読み取りに RLS ポリシー不要（public=true で誰でも GET 可能）。
-- 書き込みは service_role（/api/music 経由）のみで行うため、anon/authenticated 用の
-- storage.objects ポリシーは意図的に作らない。
