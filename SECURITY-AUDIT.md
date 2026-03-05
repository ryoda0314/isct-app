# セキュリティ監査レポート -- ISCT Campus SNS

**監査日:** 2026-03-05
**最終更新:** 2026-03-06

## 総合サマリー

| 深刻度 | 件数 | ステータス |
|--------|------|-----------|
| CRITICAL | 5 | **全件対応済み** |
| HIGH | 7 | **全件対応済み** |
| MEDIUM | 8 | **全件対応済み** |
| LOW | 4 | L1 受容 / L2,L3,L4 **対応済み** |
| **合計** | **24** | |

---

## CRITICAL（致命的）

### C1. 全ユーザーが1つのセッションを共有（認可崩壊） ✅ 対応済み
- **場所:** `lib/auth/token-manager.js:5-8`
- **内容:** Moodleトークン・ユーザーIDがモジュールレベル変数に保存され、全リクエストで共有。ユーザーAのログイン後、BがAの権限で操作可能。
- **対策:** 署名付きHTTP-only Cookieによるセッション管理を実装 (`lib/auth/session.js`, `lib/auth/require-auth.js`)。全APIルートにセッション検証を追加。

### C2. RLSポリシーが `using (true)` -- 全データが匿名読み取り可能 ✅ 対応済み
- **場所:** `supabase/migration.sql:65-69`, `supabase/enable-rls.sql:13-49`
- **内容:** 全テーブルのSELECTが `anon` ロールに `using (true)`。公開 `NEXT_PUBLIC_SUPABASE_ANON_KEY` で全DM・友達関係・通知・メッセージを直接取得可能。
- **対策:** `dm_conversations`, `dm_messages`, `notifications`, `friendships`, `groups*` の anon SELECT ポリシーを削除。Supabase Dashboard で `enable-rls.sql` (v2) を再実行する必要あり。

### C3. 全DBクエリがService Role Key経由（RLSバイパス） ✅ 緩和済み
- **場所:** `lib/supabase/server.js:7-11`
- **内容:** 全APIがService Role Keyを使いRLSが無効化。キー漏洩時は全データの読み書き削除が可能。
- **対策:** C2のRLS強化とC1のセッション管理追加により、anonキー経由での直接アクセスを制限。APIレベルでの認証検証を全ルートに追加。

### C4. 未認証での資格情報上書き ✅ 対応済み
- **場所:** `app/api/auth/setup/route.js:5-20`
- **内容:** `POST /api/auth/setup` に認証チェックなし。攻撃者がサーバーのMoodleセッションを乗っ取り可能。
- **対策:** 初回セットアップ（credentials未存在）のみ許可。既存credentialsがある場合はセッションCookie検証必須に変更。

### C5. パスワードがURLクエリ文字列に平文で含まれる ✅ 対応済み
- **場所:** `lib/auth/sso-login.js:222-224`
- **内容:** `login/token.php` への fallback でパスワードがURLパラメータに含まれ、ログ等で漏洩。
- **対策:** `page.evaluate()` 内で `fetch()` POST リクエストに変更。

---

## HIGH（高）

### H1. 未認証での資格情報削除（DoS） ✅ 対応済み
- **場所:** `app/api/auth/credentials/route.js:5-9`
- **内容:** `DELETE /api/auth/credentials` が認証なし。1リクエストでアプリ機能停止。
- **対策:** `requireAuth()` による認証検証を追加。

### H2. IDOR -- DMの会話メンバー検証なし ✅ 対応済み
- **場所:** `app/api/dm/route.js:59-120`
- **内容:** `conversation_id` を指定すれば非参加者でもDMにメッセージ挿入可能。
- **対策:** `conversation_id` 指定時にuser1_id/user2_idとの一致を検証。

### H3. IDOR -- コース登録確認なし（メッセージ・教材・メンバー） ✅ 対応済み
- **場所:** `app/api/messages/route.js`, `app/api/shared-materials/route.js`, `app/api/data/members/route.js`
- **内容:** 未登録コースのメッセージ閲覧・投稿、教材DL、メンバー一覧取得が可能。
- **対策:** `lib/auth/course-enrollment.js` でMoodle APIによるコース登録確認を実装（10分キャッシュ）。全コース関連APIルートに検証を追加。

### H4. ファイルアップロードにサイズ・種類の検証なし ✅ 対応済み
- **場所:** `app/api/shared-materials/route.js:38-105`
- **内容:** `.html`等どんなファイルでもアップロード可能。公開URLからストアドXSS成立。
- **対策:** 最大10MBのサイズ制限と、危険な拡張子（`.html`, `.js`, `.svg`, `.exe` 等16種）のブロックリストを追加。

### H5. SSRF / トークン漏洩（プロキシのドメインチェック不備） ✅ 対応済み
- **場所:** `app/api/data/materials/proxy/route.js:17-31`
- **内容:** `startsWith` によるドメインチェックが回避可能。リダイレクト経由でwstoken漏洩。
- **対策:** `new URL()` でホスト名をパースして厳密に検証。`redirect: 'error'` でリダイレクトを無効化。

### H6. 暗号化パスフレーズが推測可能 ✅ 対応済み
- **場所:** `lib/config.js:7-11`
- **内容:** `CRED_SECRET` 未設定時、`hostname:username:campus-sns-v1` から導出。推測で復号可能。
- **対策:** 新規インストールではランダムな秘密鍵を自動生成・永続化（`data/.cred-secret`）。既存環境はレガシー導出で後方互換を維持しつつ警告を表示。`.gitignore` に `.cred-secret` を追加。

### H7. `data/credentials.enc` が `.gitignore` に未記載 ✅ 対応済み
- **場所:** `.gitignore`
- **内容:** `git add .` で暗号化済み資格情報が誤コミットされるリスク。
- **対策:** `.gitignore` に `data/credentials.enc` と `*.enc` を追加。

---

## MEDIUM（中）

### M1. Content-Security-Policy ヘッダー未設定 ✅ 対応済み
- **場所:** `middleware.js`
- **対策:** CSP ヘッダーを追加。`default-src 'self'`, `connect-src` に Supabase と LMS ドメインを許可、`frame-ancestors 'none'` 等。

### M2. HSTS (Strict-Transport-Security) 未設定 ✅ 対応済み
- **場所:** `middleware.js`
- **対策:** `Strict-Transport-Security: max-age=63072000; includeSubDomains` を追加。

### M3. CSRF保護なし ✅ 対応済み
- **場所:** 全APIルート（POST/PATCH/DELETE）
- **対策:** middleware で Origin ヘッダーと Host の一致を検証。不一致の場合は 403 を返却。

### M4. レート制限なし ✅ 対応済み
- **場所:** 全APIルート（auth, message, upload全て）
- **対策:** middleware にインメモリ固定ウィンドウ式レート制限を追加（120リクエスト/分/IP）。

### M5. PBKDF2 イテレーション 100,000回（OWASP推奨は600,000回以上） ✅ 対応済み
- **場所:** `lib/credentials.js:6`
- **対策:** イテレーション回数を 600,000 に増加。保存時に `kdf_iterations` フィールドを記録し、旧データ（100k）との後方互換を維持。

### M6. 公開Storageバケット（全アップロードファイルが公開URL） ✅ 対応済み
- **場所:** `supabase/migration.sql:97-98`
- **対策:** API側で `getPublicUrl()` → `createSignedUrl()` (1時間有効) に変更。`supabase/private-bucket.sql` でバケットを非公開に変更するSQLを用意（要手動実行）。

### M7. エラーメッセージに `err.message` をそのまま返却 ✅ 対応済み
- **場所:** 全APIルート
- **対策:** 全ルートで `err.message` を `'Internal error'` に統一。

### M8. テキスト入力の最大長チェックなし ✅ 対応済み
- **場所:** dm, messages, groups の各APIルート
- **対策:** メッセージ本文 2,000文字、グループ名 100文字の上限を追加。

---

## LOW（低）

### L1. TOTP SecretとPasswordが同一ファイルに暗号化保存 ⚠️ 受容
- **場所:** `lib/credentials.js`
- **理由:** 単一ユーザーのローカルアプリであり、分離によるセキュリティ上のメリットが限定的。AES-256-GCM + PBKDF2 600k回で十分な保護。

### L2. トークンTTL 4時間はやや長い ✅ 対応済み
- **場所:** `lib/auth/token-manager.js:12`
- **対策:** TTL を 4時間 → 2時間に短縮。セッションCookieの `maxAge` も連動して変更。

### L3. Circuit Breakerが自動リセットしない ✅ 対応済み
- **場所:** `lib/auth/token-manager.js:20-22`
- **対策:** 60秒後に `failCount` を自動リセットするタイマーを追加。`invalidateToken()` でもタイマーをクリア。

### L4. `X-XSS-Protection: 1` は非推奨（逆にリスク） ✅ 対応済み
- **場所:** `middleware.js:8`
- **対策:** `X-XSS-Protection` ヘッダーを削除。CSP で代替。

---

## 手動対応が必要な項目

以下はSupabase Dashboard上で手動実行が必要です:

1. **RLSポリシー更新** (C2): `supabase/enable-rls.sql` を SQL Editor で実行
2. **Storageバケット非公開化** (M6): `supabase/private-bucket.sql` を SQL Editor で実行
