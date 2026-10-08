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

---

# アプリ紹介アニメーション（AppPromo・約54秒）

ずんだもん版とは別の、ナレーションなし・BGMのみのモーショングラフィックス版。
アプリ画面は画像ではなく React で再現して動かしているので、文言や数字を変えても画質が落ちない。

| コマンド | 内容 |
|---|---|
| `npm run studio` | Remotion Studio で `AppPromo` を選んでプレビュー |
| `npm run promo:render` | `out/app-promo.mp4` に書き出し |
| `npm run promo:frames -- 300 708` | 指定フレームを `out/frames/` に静止画で書き出し（見た目の確認用） |
| `npm run promo:sfx` | 効果音（通知音・風切り音）を numpy で再生成 |

## 構成（BGM が 150BPM なので 1小節 = 48フレームに全カットを合わせている）

| フレーム | 秒 | シーン |
|---|---|---|
| 0–192 | 0.0–6.4 | 課題提起（サイトがバラバラ・ログイン何回目？）※曲のイントロ |
| 192–288 | 6.4–9.6 | ツバメが飛来してアイコン完成「ぜんぶ、ひとつに。」※ハイハットが入る瞬間 |
| 288–480 | 9.6–16.0 | 01 ホーム |
| 480–672 | 16.0–22.4 | 02 時間割（LMS連携・次の授業） |
| 672–864 | 22.4–28.8 | 03 締切のプッシュ通知（文言は lib/deadline-notify.js と同じ） |
| 864–1056 | 28.8–35.2 | 04 チャット |
| 1056–1248 | 35.2–41.6 | 05 キャンパスナビ（スマホ画面が全画面に広がる） |
| 1248–1344 | 41.6–44.8 | 30以上の機能タイル |
| 1344–1440 | 44.8–48.0 | スマホ・PC ※ベースが抜けるブレイク |
| 1440–1620 | 48.0–54.0 | エンドカード（sciencetokyo.app） |

境界は [src/promo/theme.js](src/promo/theme.js) の `T`。シーンごとのコードは [src/promo/scenes/](src/promo/scenes/)、
スマホ内の画面は [src/promo/screens/](src/promo/screens/)。

## 素材
- BGM: `public/promo/bgm.mp3`（`public/bgm/soundorbis - Hey So Jungle [Country Release].mp3` のコピー）。**公開前に配布元の規約とクレジット表記を確認すること。**
- フォント: `public/fonts/NotoSansJP-VF.ttf`（Noto Sans JP, SIL Open Font License）
- アイコン: `public/promo/icon.png`（iOS の AppIcon 1024px の角を透過）、`swallow.png`（ツバメの切り抜き）、`icon-plate.png`（ツバメを抜いた土台）
- PC画面: `public/promo/desktop-timetable.png`（promo-screenshots の時間割。開発用オーバーレイを塗りつぶし済み）
- 効果音: `public/promo/sfx/*.wav`（make_promo_sfx.py で合成。外部素材なし）
- マップはイラスト調の架空配置で、実際の建物配置を厳密に再現したものではない

---

# アプリ紹介アニメーション ver2（AppPromoV2・約59秒）

ver1 と同じくナレーションなし・BGMのみ。こちらは**アプリの実画面**（デモモードで撮影）を使い、
ある学生の1日（朝 → 1限 → 昼休み → 放課後 → 週末の工大祭）をたどる構成にしている。

| コマンド | 内容 |
|---|---|
| `npm run promo2:capture` | 実画面を撮り直す（別ターミナルで `npx next dev -p 3123` を起動しておく）→ `public/promo2/screens/` |
| `python capture/measure_screens.py` | 撮った画面の上下の色・見出しとタブバーの位置を `src/promo2/screens.json` に書く（撮り直したら実行） |
| `node capture/gen_route.cjs` | 3Dキャンパスのルート（大岡山駅 → 西9号館）をアプリと同じ経路グラフで求める |
| `npm run promo2:frames -- 640 1360` | 指定フレームを静止画で確認 |
| `npm run promo2:render` | `out/app-promo-v2.mp4` に書き出し |

## 構成（150BPM・1小節 = 48フレーム）

| フレーム | 秒 | シーン |
|---|---|---|
| 0–384 | 0.0–12.8 | 夜明け → ロック画面に通知 → 機能の言葉が端末へ → ロック解除して画面に飛び込む ※曲のブレイク（ベースなし） |
| 384–480 | 12.8–16.0 | ツバメがアイコンに着地 ※ベースが戻る「ドロップ」 |
| 480–624 | 16.0–20.8 | 8:40 ホーム（天気・締切のカードが浮き上がる） |
| 624–816 | 20.8–27.2 | 8:42 3Dキャンパス（OSM の建物を立ち上げ、駅から西9号館までルート）→ 実際のナビ画面 |
| 816–960 | 27.2–32.0 | 8:50 1限：時間割と出欠 |
| 960–1104 | 32.0–36.8 | 12:40 昼休み：空き教室と DM |
| 1104–1248 | 36.8–41.6 | 17:20 放課後：締切の通知 → アプリから提出 |
| 1248–1392 | 41.6–46.4 | 10/10 工大祭：出店一覧 → 学生限定クーポン |
| 1392–1536 | 46.4–51.2 | 実画面の輪（テーマ違いも）「まだまだ、ぜんぶ入り。」 |
| 1536–1764 | 51.2–58.8 | エンドカード（曲の最後の一打 = 1727f で締める） |

コードは [src/promo2/](src/promo2/)（尺は `theme2.js` の `T2`）。

## 撮影と画面について
- デモモード（`/#demo`）で、端末の時刻を **2026-06-17（2Q の水曜）** の各時刻に、現在地を大岡山駅前に差し替えて撮っている（[capture/lib.mjs](capture/lib.mjs)）。
- 撮影時だけ画面の文字を整えている（アプリのデータは変えていない）：
  - デモの課題データに配点がなく「undefined点」と表示されるので消す
  - 工大祭のデモ出店の【テスト】・TEST の印を外し、架空の団体名にする（動画内に「画面の出店はサンプルです」と注記）
  - 出店を申請した人にだけ出る「あなたの申請」欄（デモでは見送りの申請が入っている）を隠す
- デモモードでは課題の提出とクーポンの使用ができないので、**提出シート**（AsgnView の SubmitSheet）と**クーポン使用済み画面**（FestivalView の UsedOverlay）は、アプリのコードと同じ見た目・文言で描いている（[src/promo2/overlays.jsx](src/promo2/overlays.jsx)）。
- 3Dキャンパスはアプリのイラスト地図と同じ `campus-sns/campusBasemapData.js`（© OpenStreetMap contributors）から描いている。建物の高さは面積からの推定。

## 音
- BGM は ver1 と同じ曲の2か所を使う：曲の 44.85s〜（ブレイク8小節 → ベース復帰後24小節）と、172.85s〜（最後の4小節）。8小節の区切りどうしを2フレームの等パワーで入れ替えているので継ぎ目は聞こえない。
- 拍は映像のカット（12フレーム格子）の約 23ms 後に来る（書き出した動画の音声を元の曲と相互相関して確認）。
- 効果音は `make_promo_sfx.py` で合成（ver2 でタップ音 `pop.wav` と完了音 `success.wav` を追加）。

## フォントの読み込み
並列書き出しでまれに大きいファイルの転送が途中で切れ（`ERR_CONTENT_LENGTH_MISMATCH`）、1つのタブのフォント読み込みが止まって書き出しが失敗することがあった。
[src/promo/fonts.js](src/promo/fonts.js) は fetch に時間制限を付けて取り直すようにしてある。
