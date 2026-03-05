# セキュリティ監査レポート -- ISCT Campus SNS

**監査日:** 2026-03-05

## 総合サマリー

| 深刻度 | 件数 | ステータス |
|--------|------|-----------|
| CRITICAL | 5 | **対応済み** |
| HIGH | 7 | H1,H2,H5,H7 対応済み / H3,H4,H6 未対応 |
| MEDIUM | 8 | M7 対応済み / その他 未対応 |
| LOW | 4 | 未対応 |
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

### H3. IDOR -- コース登録確認なし（メッセージ・教材・メンバー）
- **場所:** `app/api/messages/route.js`, `app/api/shared-materials/route.js`, `app/api/data/members/route.js`
- **内容:** 未登録コースのメッセージ閲覧・投稿、教材DL、メンバー一覧取得が可能。

### H4. ファイルアップロードにサイズ・種類の検証なし
- **場所:** `app/api/shared-materials/route.js:38-105`
- **内容:** `.html`等どんなファイルでもアップロード可能。公開URLからストアドXSS成立。

### H5. SSRF / トークン漏洩（プロキシのドメインチェック不備） ✅ 対応済み
- **場所:** `app/api/data/materials/proxy/route.js:17-31`
- **内容:** `startsWith` によるドメインチェックが回避可能。リダイレクト経由でwstoken漏洩。
- **対策:** `new URL()` でホスト名をパースして厳密に検証。`redirect: 'error'` でリダイレクトを無効化。

### H6. 暗号化パスフレーズが推測可能
- **場所:** `lib/config.js:7-11`
- **内容:** `CRED_SECRET` 未設定時、`hostname:username:campus-sns-v1` から導出。推測で復号可能。

### H7. `data/credentials.enc` が `.gitignore` に未記載 ✅ 対応済み
- **場所:** `.gitignore`
- **内容:** `git add .` で暗号化済み資格情報が誤コミットされるリスク。
- **対策:** `.gitignore` に `data/credentials.enc` と `*.enc` を追加。

---

## MEDIUM（中）

### M1. Content-Security-Policy ヘッダー未設定
- **場所:** `middleware.js`

### M2. HSTS (Strict-Transport-Security) 未設定
- **場所:** `middleware.js`

### M3. CSRF保護なし
- **場所:** 全APIルート（POST/PATCH/DELETE）

### M4. レート制限なし
- **場所:** 全APIルート（auth, message, upload全て）

### M5. PBKDF2 イテレーション 100,000回（OWASP推奨は600,000回以上）
- **場所:** `lib/credentials.js:6`

### M6. 公開Storageバケット（全アップロードファイルが公開URL）
- **場所:** `supabase/migration.sql:97-98`

### M7. エラーメッセージに `err.message` をそのまま返却 ✅ 対応済み
- **場所:** 全APIルート
- **対策:** 全ルートで `err.message` を `'Internal error'` に統一。

### M8. テキスト入力の最大長チェックなし
- **場所:** dm, messages, groups の各APIルート

---

## LOW（低）

### L1. TOTP SecretとPasswordが同一ファイルに暗号化保存
- **場所:** `lib/credentials.js`

### L2. トークンTTL 4時間はやや長い
- **場所:** `lib/auth/token-manager.js:11`

### L3. Circuit Breakerが自動リセットしない
- **場所:** `lib/auth/token-manager.js:20-22`

### L4. `X-XSS-Protection: 1` は非推奨（逆にリスク）
- **場所:** `middleware.js:8`
