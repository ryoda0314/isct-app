-- 通知の発生元ユーザー（フレンド申請者など）を保持する actor_id を追加。
-- 通知画面からフレンド申請を承認/拒否するために、申請者IDを pending リストと突き合わせる。
alter table notifications add column if not exists actor_id bigint;
