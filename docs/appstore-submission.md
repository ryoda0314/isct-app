# App Store 申請依頼書

**アプリ名**: ScienceTokyo App
**バンドルID**: ac.isct.campus
**バージョン**: 1.0
**SKU**: sciencetokyo-app
**申請日**: 2026年4月7日
**申請者**: Ryo Tsukamoto

---

## 1. 基本情報

| 項目 | 内容 |
|------|------|
| プラットフォーム | iOS |
| プライマリ言語 | 日本語 |
| カテゴリ | 教育 (Education) |
| サブカテゴリ | - |
| 年齢レーティング | 12+（ユーザー生成コンテンツあり） |
| 価格 | 無料 |

---

## 2. バージョン情報

| 項目 | 内容 |
|------|------|
| バージョン | 1.0 |
| 著作権 | 2026 Ryo Tsukamoto |
| サポートURL | https://sciencetokyo.app/support |
| マーケティングURL | https://sciencetokyo.app |
| プライバシーポリシーURL | https://sciencetokyo.app/privacy |

---

## 3. プロモーション用テキスト（170文字以内）

```
東京科学大学の学生向けキャンパスSNS。時間割・課題の自動取得、友達の居場所共有、キャンパスナビ搭載。
```

---

## 4. 概要（4,000文字以内）

```
ScienceTokyo App は、東京科学大学の学生のためのキャンパスSNSアプリです。

【主な機能】
■ 時間割・課題管理
大学公式LMS（Moodle）と連携し、時間割・課題・成績を自動取得。期限が近い課題を通知でお知らせします。

■ キャンパスSNS
学内限定のSNS機能。投稿・コメント・リアクション・ダイレクトメッセージで、同じ大学の仲間とつながれます。

■ 友達の居場所
キャンパス内で友達がどこにいるかをリアルタイムで共有。待ち合わせや空きコマの合流に便利です（完全オプトイン）。

■ キャンパスナビ
キャンパス内のスポットを検索して、マップ上でナビゲーション。初めてのキャンパスでも迷いません。

■ すれ違い通信
同じ場所にいる人とプロフィールカードを自動交換。新しい出会いのきっかけに。

■ イベント管理
学内イベントの作成・参加・出欠管理ができます。

■ セキュリティ
パスコードロック・Face ID / 指紋認証に対応。大切な学業データを守ります。

※ 東京科学大学（旧 東京工業大学・東京医科歯科大学）の学生アカウントが必要です。
```

---

## 5. キーワード（100文字以内）

```
東京科学大学,東工大,時間割,Moodle,LMS,課題,キャンパス,SNS,大学生,スケジュール,ナビ,友達
```

---

## 6. スクリーンショット

### 必要サイズ

| デバイス | 解像度 | 必須 |
|----------|--------|------|
| iPhone 6.5" (iPhone 15 Pro Max等) | 1242×2688 / 1284×2778 | 必須 |
| iPhone 6.7" (iPhone 16 Pro Max等) | 1290×2796 | 推奨 |
| iPad 12.9" (iPad Pro) | 2048×2732 | iPad対応なら必須 |

### 撮影する画面（5〜6枚）

| # | 画面 | 訴求ポイント |
|---|------|-------------|
| 1 | ホーム画面 | 第一印象。全機能が一覧できる |
| 2 | 時間割 | メイン機能。データが入った状態 |
| 3 | 課題一覧 | 期限付きの課題が並んでいる状態 |
| 4 | キャンパスSNS（フィード） | 投稿・リアクションが見える状態 |
| 5 | 友達の居場所 / キャンパスナビ | マップ系で見栄え重視 |
| 6 | DM / チャット | SNS機能の補強 |

---

## 7. App Review 情報

### 連絡先

| 項目 | 内容 |
|------|------|
| 名 | Ryo |
| 姓 | Tsukamoto |
| 電話番号 | （電話番号を記入） |
| メールアドレス | （メールアドレスを記入） |

### デモアカウント

| 項目 | 内容 |
|------|------|
| ユーザー名 | （審査用テストアカウントを記入） |
| パスワード | （パスワードを記入） |

### 審査メモ

```
ScienceTokyo App is a campus companion app for Institute of Science Tokyo (formerly Tokyo Institute of Technology) students.

While this app uses a WKWebView for its primary UI, it relies heavily on native Capacitor plugins for core functionality:

1. Native SSO Authentication — A custom PortalPlugin bridges the native layer to handle university single sign-on (SSO) via the institutional IdP (Shibboleth). This cannot be achieved with a standard web page.

2. Biometric Authentication — The app uses Face ID / Touch ID (via capacitor-native-biometric) for the app lock feature, providing secure access control beyond a simple PIN.

3. Camera Access — The app uses the device camera for QR code scanning to configure TOTP (Time-based One-Time Password) two-factor authentication.

4. Location Services — The app uses precise location for campus navigation and optional friend location sharing within the campus.

5. Background App State Detection — The app uses Capacitor's App plugin to detect pause/resume lifecycle events for the security lock feature.

The app connects to the university's official LMS (Moodle) to retrieve timetables, assignments, and grades. It also provides a campus SNS with posts, direct messaging, events, and a proximity-based "encounter" card exchange feature.

HTTP exceptions (titech.ac.jp, isct.ac.jp): The university's legacy portal systems do not support HTTPS. These domains are restricted to the university's internal services only.

Demo account for review:
- URL: https://sciencetokyo.app
- Account: （審査用テストアカウントをここに記入）
```

---

## 8. 年齢レーティング回答ガイド

| 質問 | 回答 |
|------|------|
| 暴力的なコンテンツ | なし |
| 性的なコンテンツ | なし |
| アルコール・タバコ・薬物 | なし |
| ギャンブル | なし |
| ホラー/恐怖 | なし |
| ユーザー生成コンテンツ (UGC) | **あり**（SNS投稿・メッセージ） |
| 個人情報の収集 | **あり**（位置情報、プロフィール） |
| 制限なしのウェブアクセス | なし |

→ 予想レーティング: **12+**

---

## 9. プライバシー情報（App Store Connect「アプリのプライバシー」セクション）

### 収集するデータタイプ

| データタイプ | 収集 | 用途 | ユーザーに紐付け | トラッキング |
|-------------|------|------|-----------------|-------------|
| ユーザーID | あり | アプリの機能 | はい | いいえ |
| 名前 | あり | アプリの機能 | はい | いいえ |
| 精密な位置情報 | あり | アプリの機能 | はい | いいえ |
| その他のユーザーコンテンツ | あり | アプリの機能 | はい | いいえ |

---

## 10. 暗号化（輸出コンプライアンス）

本アプリは HTTPS (TLS) および AES-256-GCM を使用しています。
→ 輸出コンプライアンス情報の提出が必要。
→ 「標準的な暗号化のみを使用（HTTPS等）」に該当 → 免除対象。

---

## 11. チェックリスト

- [ ] 概要・キーワード・プロモーションテキスト入力
- [ ] サポートURL・マーケティングURL入力
- [ ] 著作権入力
- [ ] カテゴリを「教育」に設定
- [ ] プライバシーポリシーURL設定
- [ ] プライバシー情報入力
- [ ] 年齢レーティング回答
- [ ] スクリーンショット撮影・アップロード（iPhone 6.5"）
- [ ] スクリーンショット撮影・アップロード（iPad 12.9"）
- [ ] 審査用テストアカウント作成・記入
- [ ] App Review 連絡先入力
- [ ] 審査メモ入力
- [ ] Xcode から Archive → App Store Connect にビルドアップロード
- [ ] ビルドを選択
- [ ] 輸出コンプライアンス回答
- [ ] 「審査用に追加」ボタンで提出
