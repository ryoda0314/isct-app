# ずんだもん紹介動画 自動生成パイプライン

ScienceTokyo App の紹介動画（ずんだもん解説）を、台本から **音声合成 → 立ち絵が口パクする動画(MP4)** まで自動生成する。

```
script.md ──┐
            ├─(generate_voices.mjs + VOICEVOX)─▶ public/voice/*.wav + public/timeline.json
            │        （セリフ音声 / 口パクタイミング / 字幕 / テロップ / 尺）
            └────────────────────────────────────▶ (Remotion) ─▶ out/video.mp4
                                                     立ち絵・口パク・字幕・テロップ・章背景
```

- 台本: [script.md](script.md)
- 音声＋タイムライン生成: [generate_voices.mjs](generate_voices.mjs)
- 動画合成(Remotion): [src/](src/)

---

## セットアップ（初回のみ）

1. **VOICEVOX** をインストール＆起動（音声の素・無料）
   https://voicevox.hiroshiba.jp/ — 起動すると内蔵エンジンが `http://127.0.0.1:50021` で立つ。
   キャラに **ずんだもん** と **四国めたん** が含まれること。
2. 依存インストール（このフォルダで）— ※導入済み
   ```bash
   cd promo-video
   npm install
   ```

---

## 使い方

すべて `promo-video/` ディレクトリ内で実行。

| コマンド | 内容 |
|---|---|
| `npm run voices` | VOICEVOXで音声を合成し `public/voice/*.wav` と `public/timeline.json` を生成 |
| `npm run studio` | Remotion Studio を開いてブラウザでプレビュー＆微調整 |
| `npm run render` | 本番MP4を `out/video.mp4` に書き出し |
| `npm run all`    | 上記 voices → render を一括実行 |
| `npm run render:test` | VOICEVOX不要。`sample-timeline.json` で短い動作確認動画を出す |

**通常フロー**：VOICEVOX起動 → `npm run voices` → `npm run studio` で確認 → `npm run render`。

---

## 立ち絵を「本物」に差し替える（任意）

初期状態は簡易プレースホルダー（緑＝ずんだもん／ピンク＝四国めたん）。
YMM4などで使う配布立ち絵PNGに差し替えられる。

1. 立ち絵PNGを `promo-video/public/assets/` に置く（口開き・口閉じの2枚があると口パクする。1枚でも可）
2. [src/PromoVideo.jsx](src/PromoVideo.jsx) 冒頭の `ASSETS` を編集:
   ```js
   const ASSETS = {
     zundamon: { closed: 'assets/zunda_close.png', open: 'assets/zunda_open.png' },
     metan:    { closed: 'assets/metan_close.png', open: 'assets/metan_open.png' },
   };
   ```
3. `npm run studio` で確認 → `npm run render`

> 口パクは VOICEVOX の発話タイミング（母音区間）から自動計算済み。立ち絵を入れるだけで同期する。

---

## 調整ポイント

- **声/スタイル**: [generate_voices.mjs](generate_voices.mjs) の `SPEAKERS`（ずんだもん=3 / 四国めたん=2。あまあま声などに変更可）
- **間（ま）**: 同 `GAP_SEC`（セリフ間ポーズ秒）
- **解像度/FPS**: 同 `WIDTH/HEIGHT/FPS`（既定 1920x1080 / 30fps）
- **章ごとの背景色・字幕・テロップ位置・揺れ**: [src/PromoVideo.jsx](src/PromoVideo.jsx)
- **アプリ画面録画の差し込み**: 台本の【画面】ト書きが録画リスト。録画クリップを Studio 上で重ねるか、`PromoVideo.jsx` に `<Video>` で合成

---

## ディレクトリ構成

```
promo-video/
  package.json          … Remotion等の依存（アプリ本体とは独立）
  remotion.config.js
  script.md             … 台本
  generate_voices.mjs   … 音声＋timeline.json 生成（VOICEVOX API）
  sample-timeline.json  … VOICEVOX無しのテスト用ダミー
  src/
    index.js            … registerRoot
    Root.jsx            … Composition定義（尺を timeline から自動算出）
    PromoVideo.jsx      … 立ち絵・口パク・字幕・テロップ・背景
  public/               … Remotionが配信（生成物はgit管理外）
    voice/*.wav, timeline.json
    assets/             … 本物の立ち絵PNG（任意）
  out/                  … 書き出しMP4（git管理外）
```

## クレジット（公開時必須）
動画概要欄に「VOICEVOX:ずんだもん」「VOICEVOX:四国めたん」を明記すること。
立ち絵を使う場合は各配布元の規約・クレジットにも従う。
