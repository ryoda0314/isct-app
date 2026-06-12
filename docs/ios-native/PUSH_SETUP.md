# iOS プッシュ通知（APNs）セットアップ

iOS の Capacitor アプリは WKWebView でリモートサイトを読み込むため **Web Push が使えない**。
ネイティブ通知は `@capacitor/push-notifications` + APNs 直接送信で実現する。

コード側はすべて実装済み。動作させるには以下の **手動作業** が必要。

## 構成

```
iOS端末(@capacitor/push-notifications) → APNsトークン取得
  → POST /api/push/device → device_push_tokens テーブル
通知発火: createNotification() [lib/notify.js]
  ├ sendPushToUser()  Web Push (web/PWA)
  └ sendApnsToUser()  APNs HTTP/2 (native iOS)  ← lib/apns.js
```

実装ファイル:
- `lib/apns.js` — APNs 送信（ES256 JWT + http2、外部依存なし）
- `app/api/push/device/route.js` — トークン登録/削除 API
- `supabase/device-push-tokens.sql` — トークン保存テーブル
- `campus-sns/nativePush.js` / `campus-sns/hooks/useNotifications.js` — クライアント登録
- `ios/App/App/AppDelegate.swift` / `App.entitlements` — APNs デリゲート + aps-environment

---

## 1. Supabase テーブル作成

`supabase/device-push-tokens.sql` を Supabase SQL Editor で実行。

## 2. Apple Developer で APNs Auth Key (.p8) を作成

1. https://developer.apple.com → **Certificates, Identifiers & Profiles** → **Keys** → ＋
2. 名前を入力し **Apple Push Notifications service (APNs)** にチェック → Continue → Register
3. `.p8` ファイルをダウンロード（**再ダウンロード不可**・1回のみ）
4. 控えておく値:
   - **Key ID** — キー詳細ページに表示
   - **Team ID** — 右上アカウント or Membership ページ
   - Bundle ID — `ac.isct.campus`

## 3. 環境変数（Vercel + ローカル `.env.local`）

| 変数 | 値 |
|---|---|
| `APNS_KEY_ID` | 上記 Key ID |
| `APNS_TEAM_ID` | 上記 Team ID |
| `APNS_PRIVATE_KEY` | `.p8` の中身（`-----BEGIN PRIVATE KEY-----` から末尾まで） |
| `APNS_BUNDLE_ID` | `ac.isct.campus`（省略時の既定値） |

`.p8` を 1 行 env に入れる場合は改行を `\n` にエスケープ（コード側で復元する）。
Vercel: Project → Settings → Environment Variables（Production/Preview 両方）。

> 既定の送信先は本番 APNs (`api.push.apple.com`)。Xcode デバッグ実機は sandbox トークンになるが、
> `lib/apns.js` が `BadDeviceToken` 時に自動で sandbox へフォールバックするため特別な設定は不要。

## 4. Xcode 設定（実機ビルド時）

1. `npx cap open ios`
2. App ターゲット → **Signing & Capabilities** → ＋ Capability
   - **Push Notifications** を追加（`App.entitlements` の `aps-environment` が認識される）
   - **Background Modes** を追加し **Remote notifications** にチェック
3. 署名チームが Apple Developer アカウントになっていることを確認

## 5. 動作確認（**実機必須** / シミュレータ不可）

1. アプリ起動 → 通知許可ダイアログ → 許可
2. Supabase `device_push_tokens` に行が入る
3. 別アカウントから DM 送信 → 通知が届く（フォアグラウンド/バックグラウンド/アプリ終了の各状態）
4. 通知タップ → 該当画面へ遷移
5. アプリ削除後に送信 → `410`/`BadDeviceToken` でトークンが自動削除される（サーバーログで確認）
