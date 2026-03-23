# ストア申請 & セキュリティ TODO

**作成日:** 2026-03-24
**アプリ:** ScienceTokyo (ac.isct.campus)
**対象:** iOS App Store / Google Play Store

---

## 1. リジェクト確定（必ず対応）

### 1-1. iOS Privacy Manifest の作成
- **状態:** 未作成
- **理由:** Apple は 2024年春から `PrivacyInfo.xcprivacy` を必須化。ないと即リジェクト
- **対応:** `ios/App/App/PrivacyInfo.xcprivacy` を作成
- **宣言が必要な API:**
  - `NSPrivacyAccessedAPICategoryUserDefaults` — localStorage (WKWebView 経由)
  - `NSPrivacyAccessedAPICategorySystemBootTime` — Date.now() 利用
- **収集データの宣言:**
  - ユーザーID（Moodle ID）
  - 位置情報（友達の居場所機能）
  - 投稿コンテンツ（SNS機能）

### 1-2. iOS Info.plist に権限説明を追加
- **状態:** カメラ等の権限説明なし
- **対応:** `ios/App/App/Info.plist` に以下を追加
  - `NSCameraUsageDescription` — QRスキャナー用（TOTP設定）
  - `NSLocationWhenInUseUsageDescription` — 友達の居場所・キャンパスナビ用
  - `NSFaceIDUsageDescription` — アプリロック用（生体認証追加時）

### 1-3. プライバシーポリシー URL
- **状態:** アプリ内にはあるが、外部URLとして未公開
- **理由:** App Store Connect / Google Play Console の入力必須欄
- **対応:** `https://sciencetokyo.app/privacy` 等で公開する

---

## 2. 高確率でリジェクト（早急に対応）

### 2-1. Android `allowBackup="true"`
- **場所:** `android/app/src/main/AndroidManifest.xml:5`
- **理由:** Google Play セキュリティ審査で指摘。バックアップからユーザーデータが抜ける
- **対応:** `android:allowBackup="false"` に変更

### 2-2. Android `<access origin="*" />`
- **場所:** `android/app/src/main/res/xml/config.xml:3`
- **理由:** 全オリジン許可は Play ストアで警告対象
- **対応:** 必要なドメインのみ許可に変更
  ```xml
  <access origin="https://sciencetokyo.app" />
  <access origin="https://*.supabase.co" />
  <access origin="https://lms.s.isct.ac.jp" />
  ```

### ~~2-3. CSP から `unsafe-eval` を削除~~ → 対応不要
- **場所:** `middleware.js:101`
- **理由:** pdf.js 3.x（教材PDFプレビュー）が `new Function()` を内部使用しており、削除すると壊れる
- **判断:** CSP はサーバーサイドの HTTP ヘッダであり、Apple/Google のストア審査で直接チェックされない。現状維持

### 2-4. cleartext HTTP の ATS 例外文書化
- **場所:** `android/app/src/main/res/xml/network_security_config.xml`
- **状態:** titech.ac.jp, isct.ac.jp, ex-tic.com で HTTP 許可
- **理由:** Apple はなぜ HTTP が必要か説明を求める場合あり
- **対応:**
  - iOS: Info.plist に `NSAppTransportSecurity` 例外とその理由コメント
  - App Store Connect 審査メモ欄に「学内ポータル (titech.ac.jp) が HTTPS 未対応のため」と記載

---

## 3. 推奨（審査通過率向上 & UX）

### 3-1. 生体認証の統合（Face ID / Touch ID）
- **状態:** PIN ロックのみ実装済み（useAppLock.js）
- **理由:** Apple が「なぜ Face ID を使わないのか」と指摘する場合あり
- **対応:**
  - Capacitor 用生体認証プラグインを導入
  - `useAppLock.js` の `verify` に生体認証を組み込み
  - Info.plist に `NSFaceIDUsageDescription` を追加

### 3-2. iOS スプラッシュスクリーンのガイドライン準拠
- **理由:** Apple HIG ではスプラッシュに余計なアニメーション非推奨
- **対応:** LaunchScreen.storyboard がシンプルなロゴのみか確認

### 3-3. App Store 審査メモの準備
- **理由:** WebView ベースアプリは「ネイティブ機能を使え」と言われやすい
- **対応:** 審査メモに以下を記載
  - 大学公式 LMS (Moodle) との連携が主機能
  - 位置情報を使ったキャンパスナビゲーション
  - QRスキャンによる TOTP 設定
  - ネイティブプラグイン（PortalPlugin）で SSO 認証を実装

---

## 4. セキュリティ監査残項目（任意）

以下は学内向けアプリとしては許容範囲だが、ストア公開で信頼性を上げるなら対応。

| # | 項目 | 場所 | 優先度 |
|---|------|------|--------|
| S1 | セッション Cookie 有効期限 10年 | `lib/auth/session.js:10` | 低（アプリロックで緩和済み） |
| S2 | Puppeteer `--no-sandbox` | `lib/auth/sso-login.js:32` | 低（Vercel 環境では標準） |
| S3 | Admin ID が環境変数 | `app/api/admin/route.js:5` | 低（サーバー側のみ） |
| S4 | 認証 API がパスワード平文返却 | `app/api/auth/credentials/route.js:33` | 低（HTTPS + 認証必須） |
| S5 | Rate limiter がインメモリ | `middleware.js:4-24` | 低（ないよりマシ） |
| S6 | 検索パラメータ長さ未検証 | `app/api/admin/route.js:57` | 低（Supabase 側に制限あり） |
| S7 | MIME タイプがクライアント依存 | `app/api/posts/route.js:157` | 中（スプーフィング可能） |
| S8 | エラーメッセージに DB 詳細 | 複数 API ルート | 低（学内限定） |

---

## 5. ストア申請に必要な素材

- [ ] アプリアイコン（1024x1024、角丸なし PNG）
- [ ] スクリーンショット（iPhone 6.7", 6.1", iPad 12.9"）
- [ ] アプリ説明文（日本語 / 英語）
- [ ] キーワード（App Store 用、100文字以内）
- [ ] カテゴリ選択（教育 or ソーシャルネットワーキング）
- [ ] 年齢レーティング（コンテンツ質問への回答）
- [ ] プライバシーポリシー URL
- [ ] サポート URL
- [ ] Apple Developer Program 登録（年間 12,800 円）
- [ ] Google Play デベロッパー登録（$25 一回払い）

---

## 対応順序（推奨）

```
Phase 1: リジェクト回避（1-1 〜 2-4）
  ↓
Phase 2: 生体認証追加（3-1）
  ↓
Phase 3: 素材準備 & 審査メモ（3-3, 5）
  ↓
Phase 4: 申請
```
