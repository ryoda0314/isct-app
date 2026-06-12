# 端末間連携（QR + 封印ボックス）— ネイティブ実装仕様

別端末との認証情報連携を、**サーバーに平文を一切渡さず**に行うための仕様。
JS 側（`campus-sns/deviceLink.js`）・サーバー側（`/api/device-link`, `supabase/device-link.sql`）は実装済み。
このドキュメントは **ネイティブ（iOS/Android）で実装すべき2つのプラグイン** の契約を定義する。

> 実装・実機検証は Mac（iOS）/ Windows or Mac（Android）で行う。Windows 単体では暗号の動作確認は不可。

---

## 全体フロー

```
新端末B（未ログイン）                      初期端末A（ログイン済・Keychainに資格情報）
DeviceLink.begin()
  → {linkId, pub}（privは端末内に保持）
QR表示 {v:1,t:'sciencetokyo-link',linkId,pub}
                                          QRスキャン → parseLinkPayload()
                                          確認ダイアログ
                                          DeviceLink.seal({recipientPub:pub})
                                            → Keychainから資格情報を読む
                                            → pubで封印 → {ciphertext}
                          ◀──────────────  POST /api/device-link {linkId,recipientPub,ciphertext}
GET /api/device-link?linkId=... をポーリング
  → {status:'sealed', ciphertext}
DeviceLink.complete({ciphertext})
  → privで開封 → 資格情報をKeychainへ保存
端末上でSSO(acquireWsToken)→セッション確立
```

サーバーが持つのは「B の使い捨て公開鍵で封印された暗号文」だけ。privは B の端末から出ないので**サーバーは復号不可**。

---

## 前提: 資格情報のローカル保存（SecureCreds）

QR連携は「A の Keychain に資格情報がある」ことが前提（＝Phase B の土台）。先にこれを実装する。

保存する資格情報バンドル（JSON）:
```json
{
  "userId": "...", "password": "...", "totpSecret": "...",
  "portalUserId": "...", "portalPassword": "...", "matrix": { "A": {"1":"..."}, ... },
  "loginId": "...", "moodleUserId": 12345
}
```

### プラグイン `SecureCreds`
| メソッド | 引数 | 戻り | 実装 |
|---|---|---|---|
| `save` | `{ bundle: <JSON文字列> }` | `{ ok: true }` | iOS: Keychain（`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`）/ Android: EncryptedSharedPreferences or Keystore-wrapped |
| `load` | — | `{ bundle: <JSON文字列> }` or `{ bundle: null }` | 同上から読み出し |
| `clear` | — | `{ ok: true }` | 削除（ログアウト時に呼ぶ） |

> 既存の `capacitor-native-biometric` の Keychain 保存を流用してもよいが、汎用JSONを入れるなら専用プラグインが素直。

移行（既存ユーザー）: 初回起動で `/api/auth/credentials?type=isct`（＋portal）から取得 → `SecureCreds.save` → 以降は端末ローカルを正にする。最終的にサーバー保存を廃止。

---

## プラグイン `DeviceLink`

Capacitor プラグイン名 `DeviceLink`（`registerPlugin('DeviceLink')`）。暗号は **Curve25519 + crypto_box_seal 互換**（封印ボックス: 送信者匿名・受信者公開鍵のみで暗号化）。

### `begin()` — 新端末B
- X25519 鍵ペアを生成。**privは端末メモリ（またはKeychain一時項目）に linkId 紐づけで保持**、JSへ返さない。
- `linkId` = 32バイト乱数の base64url（`[A-Za-z0-9_-]{43}` 程度。サーバ正規表現は 32〜128 文字）。
- 戻り: `{ linkId: string, pub: string(base64) }`

### `complete({ ciphertext })` — 新端末B
- 直前の `begin()` の priv で `ciphertext`（base64）を開封 → JSON バンドル復元。
- `SecureCreds.save` 相当で Keychain に保存。
- 一時 priv を破棄。
- 戻り: `{ ok: true }`（開封失敗時は reject）

### `seal({ recipientPub })` — 初期端末A
- `SecureCreds.load` で資格情報バンドル（JSON文字列）を取得。**無ければ reject**（A未設定）。
- `recipientPub`（base64）宛に封印ボックスで暗号化。
- 戻り: `{ ciphertext: string(base64) }`

### 暗号の相互運用メモ
- iOS: CryptoKit に crypto_box_seal 直接は無い。`Curve25519.KeyAgreement` + HKDF + `ChaChaPoly`/AES-GCM で「封印ボックス」を自前実装するか、**libsodium（swift-sodium / Clibsodium）を導入**して `crypto_box_seal`/`crypto_box_seal_open` を使うのが確実。
- Android: **libsodium-jni / lazysodium-android** で `cryptoBoxSeal`/`cryptoBoxSealOpen`、または Tink の HybridEncrypt。
- **iOS と Android で同一アルゴリズム/エンコードに揃えること**（A=Android, B=iOS のような混在連携を成立させるため）。libsodium 同士が最も安全・簡単。封印ボックスのフォーマット（`ephemeral_pub(32) || ciphertext`、nonce は `blake2b(eph_pub‖recipient_pub)`）に統一する。

---

## セキュリティ要件
- A 側に必ず確認ダイアログ（「この端末にログイン情報を渡しますか？」）。MITM（攻撃者のQRをAに読ませる）対策として、可能なら QR に短い確認コードを含め、両端末で数字一致を表示。
- `linkId` は単回使用（サーバが初回GETで削除）・3分TTL。
- ciphertext は priv 無しでは無意味なので、リレー漏洩でも安全。
- ログアウト時に `SecureCreds.clear()` を呼ぶ。

---

## 実装順序（推奨）
1. `SecureCreds`（Keychain/Keystore 保存）+ 既存ユーザー移行 → これで Phase B の土台
2. `DeviceLink`（begin/complete/seal）+ libsodium 導入
3. UI 配線（下記）

## UI（JS側・別途実装）
- **B**: セットアップ画面に「別の端末から引き継ぐ」→ `startLinkAsNewDevice()` で QR 表示（QRエンコーダが必要。`qrcode` を依存追加）＋ `awaitLinkedCredentials()` でポーリング。
- **A**: 設定（ProfileView）に「この端末を引き継ぎ元にする」→ 既存 `QRScanner.jsx` でスキャン → `parseLinkPayload()` → 確認 → `approveLink()`。
- 注意: middleware が `Permissions-Policy: camera=()` を付けているため、カメラ起動が必要なら要調整（現状 `QRScanner` は画像取込フォールバックあり）。
