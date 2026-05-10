---
name: add-stamp
description: Add new DM stamp(s) to the ScienceTokyo App. Processes raw stamp images (chroma-key + WebP), updates the server allowlist, client STAMPS array, and manifest. Use when the user wants to add stamps to DMs.
---

# add-stamp — DMスタンプ追加ワークフロー

ScienceTokyo App の DM 機能に新しいスタンプを追加するためのスキル。

## 前提

- スタンプ素材（緑背景PNG）が `imoticon/<N>/` フォルダにある
- 既存の処理スクリプト [scripts/process-stamps.js](scripts/process-stamps.js) を持つ
- スタンプIDは半角英数（`a-z0-9_`）でDB保存される

## 連動箇所（同期させる場所）

スタンプ追加時に**必ず**揃えるべき4ヶ所：

1. **`scripts/process-stamps.js`** — `STAMPS` 配列にエントリ追加（src ファイル名・id・label）
2. **`app/api/dm/route.js`** — `ALLOWED_STAMP_IDS` Set に新しいID追加（サーバー側allowlist）
3. **`campus-sns/views/DMView.jsx`** — `STAMPS` 配列に `{id, label}` 追加（ピッカーUI用）
4. **`public/stamps/manifest.json`** — スクリプト実行時に自動再生成される（手で書かない）

これらが食い違うと「サーバーは受け付けるがUIに出ない」「UIに出るがサーバーで弾かれる」みたいなバグになる。

## 手順

### 1. ユーザーが追加したいスタンプを把握

- ユーザーが画像を `imoticon/<N>/` に置いた前提でフォルダをチェック
- 新規ファイルを `imoticon/1/` の既存処理済み6枚（ryokai/arigatou/otsukare/gomenne/ok/matane）と差分で特定
- 各スタンプについてユーザーに確認：
  - **id**: 半角英数小文字。日本語の意味の英訳/ローマ字（例: 「おやすみ」→ `oyasumi`、「すごい」→ `sugoi`）
  - **label**: 表示用日本語（例: 「おやすみ！」「すごい！」）
- ファイル名と id/label の対応をユーザーに提示して確認を取る

### 2. process-stamps.js の STAMPS 配列を更新

```js
const STAMPS = [
  // 既存6個 ...
  { src: '<新しいファイル名>.png', id: '<新id>', label: '<新label>' },
];
```

### 3. スクリプト実行

```bash
node scripts/process-stamps.js
```

出力:
- `public/stamps/<id>.webp` 生成
- `public/stamps/manifest.json` 全体再生成

### 4. 結果を Read で確認

- 新規 webp を Read で開いて緑が綺麗に抜けているか確認（ユーザーに見せる）
- 緑のフリンジが残っていたらしきい値 `T_HARD`/`T_SOFT` を調整して再実行
  - 緑残り → `T_HARD` を下げる（70 → 60）
  - 必要なピクセルが透明化されてしまう → `T_HARD` を上げる、または `T_SOFT` を上げる

### 5. サーバー allowlist 更新

[app/api/dm/route.js](app/api/dm/route.js) の `ALLOWED_STAMP_IDS`:

```js
const ALLOWED_STAMP_IDS = new Set(['ryokai', 'arigatou', 'otsukare', 'gomenne', 'ok', 'matane', '<新id>']);
```

### 6. クライアント STAMPS 配列更新

[campus-sns/views/DMView.jsx](campus-sns/views/DMView.jsx) の `STAMPS`:

```js
const STAMPS = [
  // 既存 ...
  { id: '<新id>', label: '<新label>' },
];
```

### 7. 整合性チェック

最後に以下を Grep で確認：

- 3つの `STAMPS` / `ALLOWED_STAMP_IDS` の id 集合が一致しているか
- `public/stamps/<id>.webp` が物理ファイルとして存在しているか
- `manifest.json` に新エントリが入っているか

### 8. 報告

ユーザーに以下を報告：
- 追加したスタンプ（id/label/サイズ）
- 緑除去の見た目（プレビュー画像を Read で表示）
- 何のデプロイも追加migrationも不要（カラムは既存の `stamp_id text`）であることを明記
- DB再起動・migration不要なので Vercel デプロイのみで反映される

## 命名規則のヒント

- id は短く意味を表す英単語/ローマ字（5〜10字推奨）
- 既存IDと衝突しないこと
- ハイフン（`-`）よりアンダースコア（`_`）優先
- label は感嘆符付きの短いフレーズ推奨（既存と統一感）

## トラブルシューティング

| 症状 | 原因と対応 |
|---|---|
| process-stamps.js が SRC_DIR 見つからない | `imoticon/<N>/` のNを確認。`SRC_DIR` 定数を編集する必要があれば修正提案 |
| WebP の縁に緑残り | `T_HARD` を 60〜65 に下げる |
| キャラの緑成分が透明化される（緑系の服など） | しきい値方式の限界。HSV色相距離方式に書き換える必要あり。提案するがユーザー確認 |
| サーバーが「Unknown stamp」を返す | allowlist 更新漏れ。step 5 を再確認 |
| UIに出ない | DMView の STAMPS 更新漏れ。step 6 を再確認 |

## やってはいけないこと

- `manifest.json` を手で編集する（スクリプトが上書きするので無駄になる）
- スタンプ削除時に webp ファイルだけ消して allowlist/STAMPS を残す（DBに過去のスタンプIDがあると404になる。削除は別タスク）
- migration SQL を新規作成する（カラム `stamp_id` は既に存在）
