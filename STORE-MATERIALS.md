# ストア申請素材

---

## App Store 審査メモ（App Store Connect → App Review Information → Notes）

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
- Account: (審査用テストアカウントをここに記入)
```

---

## アプリ説明文（日本語）

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

## App Description (English)

```
ScienceTokyo App is a campus companion app for Institute of Science Tokyo students.

KEY FEATURES:
■ Timetable & Assignments
Automatically syncs with the university's official LMS (Moodle) to display your timetable, assignments, and grades. Get notified about upcoming deadlines.

■ Campus SNS
A university-exclusive social network. Share posts, comment, react, and send direct messages to connect with fellow students.

■ Friend Location Sharing
See where your friends are on campus in real-time. Perfect for meetups between classes. (Fully opt-in)

■ Campus Navigation
Search for campus spots and get map-based navigation. Never get lost on campus.

■ Encounter Cards
Automatically exchange profile cards with nearby students. A fun way to make new connections.

■ Event Management
Create, join, and manage campus events with RSVP tracking.

■ Security
Passcode lock with Face ID / fingerprint authentication to protect your academic data.

* Requires an Institute of Science Tokyo (formerly Tokyo Tech) student account.
```

---

## App Store キーワード（100文字以内）

```
東京科学大学,東工大,時間割,Moodle,LMS,課題,キャンパス,SNS,大学生,スケジュール,ナビ,友達
```

---

## Google Play 短い説明（80文字以内）

```
東京科学大学の学生向けキャンパスSNS。時間割・課題の自動取得、友達の居場所共有、キャンパスナビ搭載。
```

---

## カテゴリ

- **App Store:** 教育 (Education)
- **Google Play:** 教育 (Education)

---

## 年齢レーティング回答ガイド

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

→ 予想レーティング: **12+** (iOS) / **Everyone 10+** (Android)

---

## 残りの手動準備タスク

- [ ] アプリアイコン 1024x1024 PNG（角丸なし）を用意
- [ ] スクリーンショットを撮影
  - iPhone 6.7" (1290x2796) — iPhone 15 Pro Max
  - iPhone 6.1" (1179x2556) — iPhone 15 Pro
  - iPad 12.9" (2048x2732) — iPad Pro
- [ ] 審査用テストアカウントを作成して審査メモに記入
- [ ] サポート URL を用意（例: https://sciencetokyo.app/support）
- [ ] Apple Developer Program に登録（年間 12,800 円）
- [ ] Google Play デベロッパーに登録（$25 一回払い）
