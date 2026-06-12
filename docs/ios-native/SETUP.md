# iOS ネイティブセットアップ手順（MacBook）

Windows 側で開発したネイティブ変更を MacBook に持っていって Xcode でビルド・実機確認するための手順。
`ios/` は `.gitignore` 対象なので、カスタムソースは **このディレクトリ (`docs/ios-native/`) 経由で運ぶ** のが正規ルート。

---

## 0. 前提（初回のみ）

- **Xcode**（App Store。Command Line Tools 含む）
- **Node.js**（Windows 側と同じメジャーで可。`nvm` 推奨）
- **CocoaPods**: `sudo gem install cocoapods` もしくは `brew install cocoapods`
- Apple Developer アカウント（実機ビルド時の署名用）

## 1. コードを取得

```bash
cd isct
git pull            # ← Windows 側で push 済みであること
npm install
```

> Windows 側のコミットが push されていないと最新が来ない。push 状況を先に確認すること。

## 2. iOS プロジェクトを生成 / 同期

```bash
npx cap add ios     # 初回のみ（ios/ を生成）
npx cap sync ios    # 2回目以降は基本これだけ（プラグイン・設定を反映）
```

## 3. カスタムファイルを配置（毎回）

`cap sync` は `docs/ios-native/` の手書きソースまでは入れてくれないので手動コピーする:

```bash
cp docs/ios-native/PortalPlugin.swift      ios/App/App/PortalPlugin.swift
cp docs/ios-native/TimetablePlugin.swift   ios/App/App/TimetablePlugin.swift
cp docs/ios-native/SecureCredsPlugin.swift ios/App/App/SecureCredsPlugin.swift
cp docs/ios-native/capacitor.config.json   ios/App/App/capacitor.config.json
```

> `SecureCredsPlugin.swift` も `ViewController.swift` の `capacitorDidLoad` で
> `bridge?.registerPluginInstance(SecureCredsPlugin())` 登録が必要（登録済み）。

（ウィジェットを使う場合は `docs/ios-native/WIDGET_SETUP.md` を参照）

## 4. Xcode でビルド

```bash
npx cap open ios
```

Xcode が開いたら:
1. `PortalPlugin.swift` がプロジェクト（App ターゲット）に含まれているか確認。
   なければ **File > Add Files to "App"** で `ios/App/App/PortalPlugin.swift` を追加し、
   Target Membership で **App** にチェック。
2. **Signing & Capabilities** で Team を設定。
3. 実機 or シミュレータを選んで **Build & Run**（⌘R）。

> アプリは `https://sciencetokyo.app` を読み込む WebView ラッパー（`server.url` 方式）。
> Web 側の変更はデプロイ済みの本番から配信されるので、ネイティブ側でビルドが要るのは
> **Swift/プラグインを変えたときだけ**。

---

## 今回の変更点：オンデバイス wstoken 取得（`acquireWsToken`）

サーバーの Puppeteer SSO に依存していた Moodle wstoken の再取得を、端末側で完結させた。
これにより wstoken が（数週間で）失効してもサーバー資格情報なしで自動リカバリできる。

### 関係ファイル
- `PortalPlugin.swift` … `acquireWsToken(_:)` を追加。非表示の `WKWebView` で ISCT SSO を完走し、
  `moodlemobile://token=...` リダイレクトを `decidePolicyFor` で横取り → base64 デコード →
  `:::` 区切りの 2 番目が wstoken。`core_webservice_get_site_info` で userid も取得して返す。
- （JS 側）`campus-sns/moodleClient.js` の `refreshClientToken` が
  **ネイティブ SSO 優先 → 失敗時サーバー `/api/auth/token/refresh` フォールバック**。
- （JS 側）`campus-sns/plugins/portalWebView.js` に `acquireWsToken` ブリッジ。

> JS 側は本番（sciencetokyo.app）デプロイで配信されるため、iOS ビルドに必要なのは
> `PortalPlugin.swift` の更新のみ。

### 実機での動作確認

`acquireWsToken` は Moodle が `invalidtoken` を返したとき（＝トークン失効時）に
自動で走る。Xcode のコンソール（または Console.app）で `PortalPlugin: [token]` の
ログを追う。正常時のログ順序の目安:

```
PortalPlugin: [token] loading ISCT SSO start URL
PortalPlugin: [token] didFinish: https://isct.ex-tic.com/auth/session...
PortalPlugin: [token] didFinish: .../second_factor   (TOTP 入力)
PortalPlugin: [token] navigating to mobile launch
PortalPlugin: [token] intercepted launch redirect
PortalPlugin: [token] resolved (userid=XXXXX)
```

強制的に失効を再現したい場合は、サーバー側で当該ユーザーの `user_tokens` 行を削除するか、
LMS 上でモバイルトークンを失効させてからアプリで LMS データ（時間割・課題など）を開く。

### 確認すべきポイント / 落ちやすい所
- **`moodlemobile://` の横取り**: 端末によっては `decidePolicyFor` ではなく
  プロビジョナルナビゲーションのエラーとして来ることがある。iOS では `decidePolicyFor`
  で拾えるはずだが、もし `[token] timeout`（45秒）で失敗するなら、横取りが効いていない。
  その場合は `didFailProvisionalNavigation` でも URL を見て `handleTokenRedirect` を
  呼ぶよう追加する（Android 側は `onReceivedError` で既に二重化済み）。
- **TOTP の有効期限**: SSO 完走に時間がかかるとコードが切れることがある。失敗が頻発する
  なら totpSecret を端末に渡して都度生成する方式へ変更を検討（現状はサーバー生成コードを使用）。
- **Phase A の注意**: 資格情報はまだサーバー `/api/auth/credentials?type=isct` から取得している。
  端末ローカル（Keychain）化は次フェーズ。

---

## 変更を Windows 側へ戻すとき

Mac で `PortalPlugin.swift` を直接編集した場合は、**必ず `docs/ios-native/` にコピーバック**してから
コミットすること（`ios/` は ignore されるため、ここに入れないと履歴に残らない）:

```bash
cp ios/App/App/PortalPlugin.swift docs/ios-native/PortalPlugin.swift
git add docs/ios-native/PortalPlugin.swift
git commit -m "ios: <変更内容>"
```
