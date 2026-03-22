# Portal WebView Auto-Login (Android)

Capacitor カスタムプラグイン `PortalPlugin.java` による、TiTech ポータルと ISCT ポータルの自動ログイン実装ドキュメント。

## アーキテクチャ

```
[JS] portalWebView.js → registerPlugin('Portal')
       ↓
[Native] PortalPlugin.java → WebView overlay (Activity の子 View)
       ↓
[API] /api/auth/credentials → 認証情報 + TOTP コード取得
```

- メイン Activity 上に WebView overlay を重ねる方式（別 Activity ではない）
- 下部に 78dp のマージンでアプリのナビゲーションバーを避ける
- ツールバー: 閉じる / 戻る / 進む / リロード
- ローディングオーバーレイで自動ログイン中の画面を隠す

## ファイル構成

| ファイル | 役割 |
|---|---|
| `android/app/src/main/java/ac/isct/campus/PortalPlugin.java` | Capacitor プラグイン本体 |
| `android/app/src/main/java/ac/isct/campus/MainActivity.java` | プラグイン登録 |
| `campus-sns/plugins/portalWebView.js` | JS ブリッジ |
| `app/api/auth/credentials/route.js` | 認証情報 API（TOTP 生成含む） |
| `lib/auth/totp.js` | TOTP 生成（otplib） |
| `android/app/src/main/res/xml/network_security_config.xml` | ネットワークセキュリティ設定 |

> **注意**: `android/` は `.gitignore` に含まれており、バージョン管理外。

## 共通の注意点

### WebView でのフォーム操作

| 方法 | 動作 | 備考 |
|---|---|---|
| `btn.click()` | **動かない** | Android WebView は untrusted event として扱う |
| `form.requestSubmit()` | **不安定** | 成功を返すが実際に送信されないケースあり |
| `form.submit()` | **確実** | JS イベントハンドラをバイパスするが、Rails 等の標準フォームには問題なし |

入力値の設定は `.value = '...'` の直接代入で十分。React 的な native setter + dispatchEvent は不要。

### SSL / ネットワーク

- `network_security_config.xml` で対象ドメインを許可
- SSL エラーハンドラで `.titech.ac.jp` / `.isct.ac.jp` / `.ex-tic.com` は `handler.proceed()`
- 一部ページが HTTP を使うため `cleartextTrafficPermitted="true"` が必要

### SAML SSO

- **Third-party cookies 必須**: `CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)`
- SAML assertion ページの form は **1回だけ** submit する（フラグで制御）
- URL に `/saml` を含むページが複数存在するため、re-submit ループに注意

---

## TiTech ポータル

### ログインフロー

```
Step 1: usr_name + usr_password → OK ボタンクリック
Step 2: マトリクス認証（message3 / message4 / message5）
```

### URL

```
https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&...
```

### マトリクス認証の仕組み

1. ページ内の `td`/`th` セルから `[A,1]` 形式のラベルを読み取る
2. 保存済みマトリクスデータ `{ "A": { "1": "G", ... }, ... }` から対応する値を取得
3. `message3`, `message4`, `message5` の input に値をセット → OK ボタンクリック

### ハマりポイント

- ポータル内リンクが `target="_blank"` で開くものがあり、`WebChromeClient.onCreateWindow` で同一 WebView に読み込む必要がある
- マトリクス認証ページの判定は URL の `AUTHMETHOD=IG` で行う

---

## ISCT ポータル

### ログインフロー

```
Step 1: input#identifier (Science Tokyo ID) + input#password → form.submit()
Step 2: /second_factor → input#totp (TOTP コード) → form.submit()
Step 3: SAML assertion form → 1回だけ submit
Step 4: SSO コールバック → ポータルホームページ
```

### URL

```
https://isct.ex-tic.com/auth/session
```

> `portal.isct.ac.jp` ではないので注意！

### 状態管理

```java
private boolean isctLoginDone = false;
private boolean isctTotpDone = false;
private boolean isctSamlDone = false;
```

`onPageFinished` で URL に応じて適切な injection を呼び分け、各フラグで2重実行を防止。

### TOTP コード

- サーバーサイドで生成: `otplib.authenticator.generate(secret)`
- API 経由で取得: `GET /api/auth/credentials?type=isct` → `{ userId, password, totpCode }`
- ネイティブ側で生成する必要はない

### ハマりポイント

| 問題 | 原因 | 解決策 |
|---|---|---|
| ログインページで無限ループ | `/auth/` を含むリンクをクリックするフォールバックが自ページにマッチ | リンククリックのフォールバック自体を削除 |
| `/second_factor` で HTTP エラー | 上記の無限ループが原因で不正なリクエストが送信されていた | 同上 |
| 「Please wait for a moment...」で停止 | SAML form の2重送信 | `isctSamlDone` フラグで1回だけ実行 |
| SSO Cookie が機能しない | Third-party cookies がデフォルトで無効 | `setAcceptThirdPartyCookies(webView, true)` |

### ログインページの構造（ex-tic.com）

- Rails アプリ（`authenticity_token` 付きフォーム）
- 3つの form が存在: ログイン / パスワードレス(WebAuthn) / キャンセル
- `input#password` が CSS で非表示の場合があるが、`form.submit()` なら表示させなくても送信可能

---

## LMS 課題ページ（SSO 経由）

### 概要

LMS（`lms.s.isct.ac.jp`）の課題ページを、ISCT SSO 自動ログイン経由で開く機能。

### URL 形式

```
https://lms.s.isct.ac.jp/2025/mod/assign/view.php?id={cmid}
```

- `cmid` は Moodle API `mod_assign_get_assignments` のレスポンスから取得

### フロー

```
openLmsPage(url, credentials)
  ↓
ISCT SSO で認証 (isct.ex-tic.com/auth/session)
  ↓ login → TOTP → SAML
SSO 完了後、lmsTargetUrl へ自動遷移
  ↓
LMS ページ読み込み完了 → ローディング非表示
```

### 実装のポイント

| 項目 | 詳細 |
|---|---|
| 認証方式 | LMS URL を直接開くのではなく、**まず ISCT SSO で認証してから LMS に遷移** |
| `lmsTargetUrl` | SSO 完了後の遷移先を保持する変数。遷移後に `null` にリセット |
| 2回目以降 | WebView の Cookie で SSO 認証済み → ログインフォームなし → 非認証ページ検出で直接 LMS へ遷移 |
| 認証済み判定 | `onPageFinished` の URL に `/auth/`, `/saml/`, `/login` を含まない場合 |
| ローディング | LMS ページの `onPageFinished` で非表示（SSO 完了時点では非表示にしない） |

### ハマりポイント

| 問題 | 原因 | 解決策 |
|---|---|---|
| `/second_factor` で `ERR_HTTP_RESPONSE_CODE_FAILURE` | LMS URL を直接開くと SSO リダイレクトチェーンで別のセッション状態になる | LMS URL を直接開かず、先に `isct.ex-tic.com/auth/session` で認証 → 完了後に LMS へ遷移 |
| 2回目以降が無限ローディング | SSO 認証済みでログインフォームが表示されず `injectIsctLogin` が `wait` を返し続ける | `handleIsctPageFinished` で非認証ページ（URL に `/auth/` 等を含まない）を検出し SSO スキップ |
| ローディングが早く消える | SSO 完了時点で `hideLoading()` を呼んでいた | LMS 遷移時は `hideLoading()` を呼ばず、LMS の `onPageFinished` で消す |

---

## ボトムナビ連携

WebView overlay 表示中でもアプリのボトムナビバーを操作可能にする仕組み。

### 実装

- overlay の `bottomMargin = dp(78)` でボトムナビ領域を確保
- 透明な `navInterceptor` ビュー（78dp）をボトムに配置
- タップ時: overlay を `removeOverlay()` で閉じた後、`MotionEvent` を Capacitor WebView に転送
- `getBridge().getWebView()` で Capacitor WebView を取得し `dispatchTouchEvent` でタップを再現

これにより1タップで「WebView 閉じる + タブ遷移」が可能。
