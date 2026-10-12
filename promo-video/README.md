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

# インスタのストーリー用 縦動画（StoryPromo・1080x1920・約20秒）

```bash
npx next dev -p 3123            # （isct で）開発サーバを起動しておく
npm run story:capture           # 3Dナビの静止画と、建物が立ち上がる連番を撮る
npm run story:frames -- 100 300 # 確認用の静止画（out/frames/）
npm run story:render            # → out/story-promo.mp4
```

## 構成（150BPM・1小節 = 48フレーム）
| フレーム | 秒 | 内容 |
|---|---|---|
| 0–96 | 0.0–3.2 | 「大学生活、ぜんぶ入り。」ホームの画面とカード ※曲の「ドロップ」から始まる |
| 96–240 | 3.2–8.0 | NEW 3Dキャンパスナビ：建物が立ち上がって傾く（実アプリを1コマずつ撮った連番）→ ルート → 案内中 |
| 240–288 | 8.0–9.6 | 時間割 → 出欠 |
| 288–336 | 9.6–11.2 | 空き教室 → DM |
| 336–384 | 11.2–12.8 | 課題の提出 |
| 384–432 | 12.8–14.4 | 工大祭（出店一覧 → クーポン）※ここから曲の最後の4小節 |
| 432–480 | 14.4–16.0 | 実画面の壁「ほかにも、ぜんぶ入り。」 |
| 480–612 | 16.0–20.4 | エンドカード（曲の最後の一打 = 564f で締める） |

コードは [src/story/](src/story/)（尺は `theme.js` の `TS`）。

## 撮影・投稿について
- 3Dナビの連番は [capture/capture_story.mjs](capture/capture_story.mjs)。アプリのコードは変えず、撮影するときだけ MapLibre の地図をページの外から取り出し、カメラと建物の高さを1コマずつ動かして撮っている。
- 文字はストーリーの画面で隠れない範囲（上 250px・下 320px を空ける）に置いている。
- エンドカードの「リンクからすぐ使える ↓」の下（だいたい縦 1450〜1600px）が、投稿するときにリンクのスタンプを置く場所。
- BGM は ver2 と同じ曲の 57.65s〜（ドロップから8小節）と 172.85s〜（最後の4小節）。曲の最後の一打は 178.85s（最後の小節の4拍目）。

# 工大祭の出店団体むけ「出店を宣伝しませんか？」縦動画（FestPromo・1080x1920・約23.6秒）

```bash
npx next dev -p 3123            # （isct で）開発サーバを起動しておく
npm run fest:capture            # 工大祭ページ・出店ページ・申請フォームなどを撮る（座標は src/fest/rects.json に残る）
npm run fest:frames -- 100 300  # 確認用の静止画（out/frames/）
npm run fest:render             # → out/fest-promo.mp4
```

## 構成（150BPM・1小節 = 48フレーム）
| フレーム | 秒 | 内容 |
|---|---|---|
| 0–96 | 0.0–3.2 | 「工大祭に出店するみなさんへ。」「その出店、アプリで宣伝しませんか？」出店のポスターが漂う ※曲はベースの無い2小節 |
| 96–144 | 3.2–4.8 | ドロップ：工大祭ページ（呼びかけカードと出店一覧）「あなたの出店を、アプリに掲載。」 |
| 144–240 | 4.8–8.0 | 出店ページ（写真・クーポン・メニュー）→「マップで見る」 |
| 240–288 | 8.0–9.6 | キャンパスナビ（3D）で本館へ |
| 288–384 | 9.6–12.8 | 学生がクーポンを使う → 出店者に見える利用数（37 / 100） |
| 384–432 | 12.8–14.4 | 申請フォーム（下書きの自動保存） |
| 432–480 | 14.4–16.0 | メンバー用QR と、確認済みのメンバー（3 / 3人以上） |
| 480–528 | 16.0–17.6 | 申請 →「掲載されました」の通知 → 出店ページ |
| 528–708 | 17.6–23.6 | エンドカード（申請の3ステップ・掲載無料・sciencetokyo.app）。曲の最後の一打 = 660f で締める |

コードは [src/fest/](src/fest/)（尺は `theme.js` の `TF`）。部品はストーリー用と共通（[src/story/parts.jsx](src/story/parts.jsx)）。

## 撮影について
- [capture/capture_fest.mjs](capture/capture_fest.mjs)。デモモードでは工大祭の申請・下書き・メンバー用QR・読み取り・クーポンがその端末の中だけで動くので、実際の操作で撮っている。
  - 申請フォームは「焼きそば屋」の内容を入力し、メンバーは Python の qrcode で作った `ISCTFEST1:` で始まる QR 画像を「スクリーンショットから読み取る」で2人読み取らせている。
  - デモの出店の【テスト】や「テスト団体A」、読み取ったメンバーの「テスト メンバーNNN」は、撮るときだけ架空の名前に置き換えている（動画内に「画面の出店はサンプルです」と注記）。
- 「掲載無料」は、アプリに掲載の料金や支払いの仕組みが無いことから入れている。

# 最高傑作版（AppPromoFilm・1920x1080・約3分）

これまでの紹介映像（ver1・ver2・ストーリー用・工大祭用）をふまえた、曲を頭から最後まで通しで使う長編版。
春のキャンパスを空から見下ろすところから始まり、ブレイクでツバメがロゴになり、
アプリの季節のテーマ（桜・新緑・紅葉・雪）とともに1年をたどって、曲の最後の一打で締める。ナレーションなし。
端末の画面はすべて、アプリを実際に操作して1コマずつ撮った動画（スクロール・タップ・画面の切り替え）。端末は iPhone の3Dモデル。
テーマや言語の切り替えは、設定の画面を操作するところは見せず、画面がそのまま塗り替わる・言葉が変わるところだけを見せる。

```bash
npx next dev -p 3123            # （isct で）開発サーバを起動しておく
npm run film:capture            # 実画面と3Dキャンパスの連番を撮る（30分ほど）
npm run film:record             # アプリを操作する動画を撮る（10分ほど）→ src/film/recs.json と壁用の縮小版も作る
npm run film:sfx                # 効果音とフィルムの粒子を合成
npm run film:frames -- 236 1760 # 確認用の静止画（out/frames/）
npm run film:render             # → out/app-promo-film.mp4（8区間に分けて書き出してつなぐ。25分ほど）
npm run film:preview            # → out/app-promo-film_half.mp4（半分の大きさの確認用。5分ほど）
```

[render_film.mjs](render_film.mjs) は、映像を音なしで8区間に分けて書き出し（できている区間は飛ばすので、途中で落ちても続きから）、音（曲と効果音）は WAV で一度に書き出して、最後に ffmpeg でつなぐ（音は AAC 320k）。
一度に書き出すと、機能の壁など大きい画像をたくさん読む場面でブラウザのメモリが足りなくなって落ちることがあったため。機能の壁では 1倍の縮小版（public/film/thumbs・public/film/rec_thumbs）を使っている。
端末は three.js（WebGL）で描くので、書き出しと静止画はブラウザの GL を ANGLE にしている（`chromiumOptions: { gl: 'angle' }`）。

開発サーバについて：isct で別の `next dev` がすでに動いているとき（たとえば 3000 番）は、同じフォルダでもう1つ起動しないこと（`.next` を取り合って、どちらのページも 500 になる）。
そのときは、動いているサーバを撮影に使う：`APP_URL=http://localhost:3000 npm run film:record`（`film:capture` も同じ）。

## 構成（150BPM・1小節 = 48フレーム。区切りは [src/film/theme.js](src/film/theme.js) の `TL`）
| フレーム | 秒 | 内容 |
|---|---|---|
| 0–192 | 0.0–6.4 | 暗闇に「4月。」（曲のイントロ・低音だけ） |
| 144–576 | 4.8–19.2 | 真上から見た春のキャンパス → ビートと同時に建物が立ち上がり、低く滑る（実アプリの3D地図を1コマずつ撮った連番） |
| 576–768 | 19.2–25.6 | 「授業は、どこ？」建物の上に「？」が増えていく |
| 768–1344 | 25.6–44.8 | 情報は、あちこちに。窓とログインが拍ごとに増え、ツバメが突き抜けて吹き飛ぶ |
| 1344–1728 | 44.8–57.6 | ブレイク：夜明けの空とツバメ。「大学生活を、ひとつに。」 |
| 1728 | 57.6 | ドロップ：ツバメがアイコンに着地してロゴ。映画の黒帯が開く |
| 1824–2112 | 60.8–70.4 | ホーム（4/8。スクロールして戻る）→ 端末が斜めを向き、天気・お知らせ・チャット・締切のカードが拍ごとに浮き上がる（分解図） |
| 2112–2880 | 70.4–96.0 | 春：ホームが桜のテーマへ斜めに塗り替わる → 時間割 → 授業のチャットで投票・行事に「参加」→ 3Dキャンパスナビ（駅から西9号館へルートが伸びる連番）→ 検索して案内を開始 |
| 2880–3648 | 96.0–121.6 | 夏：ホームが新緑へ → 締切の通知 → 課題のやることにチェックして、アプリで PDF を提出・空き教室・DMを送ってスタンプ（横に友達 → DM） |
| 3648–4032 | 121.6–134.4 | 秋：ホームが紅葉へ → 工大祭の夜の3Dキャンパスに提灯 → 出店をさがしてクーポンを使う（アプリの「クーポン使用済み」画面） |
| 4032–4416 | 134.4–147.2 | 冬：ホームが雪へ → 雪のキャンパス → 成績とGPA・学年暦「そして、次の1年へ。」 |
| 4416–4800 | 147.2–160.0 | 17のテーマ（ホームが流れたまま、1拍ごとにアプリ全体の色が変わる）・5つの言語（1拍ごとに画面の言葉が変わる）・スマホとPC（PC 版を操作する動画） |
| 4800–5184 | 160.0–172.8 | 機能の壁「大学生活の、ぜんぶ。」（操作動画がある機能は壁の中でも動いている） |
| 5184–5430 | 172.8–181.0 | エンドカード（URL・QR）。曲の最後の一打（5364f）で締める |

コードは [src/film/](src/film/)。場面は [src/film/scenes/](src/film/scenes/)。

## 撮影について（[capture/capture_film.mjs](capture/capture_film.mjs)）
- 季節ごとに、テーマと端末の日付を変えて撮る（春 2026-04-08 桜 / 夏 2026-06-17 新緑 / 秋 2026-10-10 紅葉 / 冬 2027-01-27 雪）。デモのデータは日付に合わせて「1Q 水曜授業 第1回」「4Q …」などが変わる。
- 3Dキャンパスはアプリのコードを変えずに撮る：MapLibre の地図をページの外から取り出して 1920x1080 いっぱいに広げ、カメラ・建物の高さ・ルートの線を1コマずつ動かして2倍で撮り、1920x1080 に縮める。
  アプリの名前ラベルは消して位置だけ `src/film/maps/*.json` に記録し、動画の側で札として描き直している。ルートの線（大岡山駅 → 西9号館）はアプリと同じ経路グラフで求めたもの（`src/promo2/campusRoute.json`）。
- 工大祭の夜の提灯の光と、冬の雪・春の花びらなどは動画の側で足している。工大祭の出店はデモのサンプル（動画内に注記）。
- 撮影時だけ画面の文字を整える処理（undefined点・工大祭の【テスト】）は ver2 と同じ（[capture/lib.mjs](capture/lib.mjs)）。
- 「水曇り」テーマは画面全体に曇りガラスの効果がかかるため、テーマを並べる場面からは外している（「17のテーマ」はアプリのテーマ数）。

## 操作動画について（[capture/record_film.mjs](capture/record_film.mjs)・[capture/record_lib.mjs](capture/record_lib.mjs)）
- ページの時間を timeweb（[capture/vendor/timeweb.js](capture/vendor/timeweb.js)・BSD-3-Clause・[ライセンス](capture/vendor/timeweb.LICENSE)）で仮想にして、「操作 → 1/30 秒進める → 撮る」を1コマずつ繰り返す。重い画面でもコマ落ちせず、アニメーションやトランジションも 30fps でそのまま撮れる。
- 操作（タップ・スクロール・文字の入力）は動画のフレーム番号で決めてあり、映像の側で拍に合わせて置く。タップした位置は log.json に残し、映像の側でタップの印と効果音を出す。
- テーマと言語は、設定の画面を出さずにアプリの state（App.jsx の themePref・langPref の useState）を直接切り替えて撮る（`setAppState`。アプリの塗り替わり方はタップしたときと同じ）。季節の扉は扉の2小節目の頭で、17のテーマと5つの言語は1拍ごと。切り替えたフレームは log.json の mark に残る。季節の扉では、映像の側で切り替え前のコマから後のコマへ斜めに塗り替える。
- 隣り合ってつながる動画（ホーム → 春の扉 → 時間割、夏の扉 → 課題、テーマ → 言語）は、天気（実データ）の値がずれないように続けて撮る（`npm run film:record` でまとめて撮れば揃う）。
- sitelen pona は今は入れていない：アプリの外枠（App.jsx のいちばん外の div）にインラインの font-family があり、body の .sitelen-pona より優先されるので、ボタンと入力欄しか表語文字にならないため。
- [capture/measure_recs.py](capture/measure_recs.py) が各コマの上下の色（ステータスバーとホームインジケータの帯）とタップ・カードの位置を src/film/recs.json にまとめ、[capture/make_rec_thumbs.py](capture/make_rec_thumbs.py) が機能の壁用の縮小版を作る。
- 課題のアプリ内提出は、デモでは Moodle に送らずに本番と同じ段階（アップロード中 → 提出中 → 確認中 → 提出しました）を進む（デモの課題「実験レポート第2回」に提出の設定を付けてある）。撮影ではファイル選択に capture/assets/fibonacci_report.pdf を渡す。
- 撮影のときだけの置き換え（アプリの動きはそのまま）：現在地は大岡山駅の改札前に固定（仮想時間では位置の取得が時間切れになるため）、クーポンの確認ダイアログは OK、DM の送信は送った内容をそのまま返す（デモにはサーバがないため）。
- デモでは授業の教材が読めない（「教材の取得に失敗しました」）ので、授業を開いたらすぐチャットへ移る。グループのチャットと友達のプロフィールも中身が出ないので使わない。

## 端末（iPhone の3Dモデル・[src/film/ModelPhone.jsx](src/film/ModelPhone.jsx)）
- public/film/iphone.glb は、ダウンロードした iPhone の3Dモデル（Blender のデータ）から書き出したもの。表示部分の中心を原点、1単位 = 画面の 1px にしてある。
- 本体は three.js で描き（1つの WebGL を使い回して端末ごとの 2D キャンバスへ写す）、画面の中身は DOM のまま、表示部分の4隅の投影へ matrix3d で貼る。ガラスの映り込みは別に描いて重ねる。
- **公開する前に、3Dモデルの配布元のライセンス（クレジット表記が必要か、商用・公開での利用ができるか）を確認すること。** ダウンロードしたフォルダにはライセンスのファイルが入っていない。

## 音
- BGM は ver1・ver2 と同じ曲を頭から最後まで通しで使う。曲の小節頭は 0.047s + 1.6s × n。1 フレームから読むので、拍はカットの約 14ms 後に来る（書き出した動画の音を元の曲と相互相関して、ずれが 1ms 未満なことを確認）。曲の最後の一打は 178.84s（動画の 5364f）。
- 効果音は numpy で合成（[make_film_sfx.py](make_film_sfx.py)。ver2 の pop・chime・success・whoosh も使う）。

# X（Twitter）用（XPromo・1080x1080・約30秒）

タイムラインで音なしの自動再生でも伝わるよう、見出しを画面の上に大きく置いた正方形の動画。工大祭は扱わない（ホームの工大祭のお知らせも撮影のときに隠している）。

```bash
npm run film:record   # rec_x_* も一緒に撮る（APP_URL の注意は最高傑作版と同じ）
npm run x:render      # → out/x-promo.mp4（映像と音を別に書き出してつなぐ。AAC の先頭の遅れを出さないため）
```

| フレーム | 内容 |
|---|---|
| 0–96 | 「大学生活を、ひとつに。」ホームのテーマが1拍ごとに替わる |
| 96–192 | 時間割 → 授業のチャットで投票 |
| 192–336 | 3Dキャンパスナビ：検索 → ここへ案内 → 案内を開始 |
| 336–432 | 課題をアプリで提出：PDF を選ぶ → 提出する →「提出しました」 |
| 432–528 | 空き教室 |
| 528–624 | DM とスタンプ |
| 624–672 | スマホでも、PCでも（PC 版の操作動画） |
| 672–918 | エンドカード（URL・QR）。曲の最後の一打（852f）で締める |

曲は最高傑作版と同じ曲の終盤（最高傑作版の 4512f＝小節の頭から）。コードは [src/x/XPromo.jsx](src/x/XPromo.jsx)。操作動画は X 用に、操作が拍に来るよう撮り直した短いもの（capture/record_film.mjs の rec_x_*）。

# ずんだもんが紹介する ScienceTokyo App（ZundaPromo・1920x1080・約2分16秒）

迷子のずんだもんが「西9号館がないのだ〜！」と慌てるところから始まり、アプリの機能を8章で紹介して、App Store の案内で締める。
端末の画面はすべてアプリを実際に操作した動画。操作のフレームを声の言葉（カナ）に合わせて撮ってあるので、映像では録画を 1 倍速のまま流す（コマを止めたり飛ばしたりしないので、アプリの動きがなめらか）。

```bash
npm run zunda:voice    # 台本 src/zundamon/script.json → 声（VOICEVOX のエンジンを 127.0.0.1:50021 で起動しておく）。変わった行だけ作り直す
node capture/record_film.mjs rec_z_home,rec_z_tt,rec_z_navi,rec_z_asgn,rec_z_free,rec_z_dm,rec_z_theme   # 声に合わせて操作を撮る（声を作り直したら撮り直す）
python capture/measure_recs.py
npm run zunda:audio    # BGM・締めのジングル・効果音を合成（public/zundamon/）
npm run zunda:render   # → out/zunda-promo.mp4
```

- **台本**：[src/zundamon/script.json](src/zundamon/script.json)。`text` は字幕、`say` は読み（英字・記号・「〜」を読める形にしたもの）、`style` は VOICEVOX のずんだもんのスタイル、`expr` は表情（[expressions.js](src/zundamon/expressions.js)）。行の id は名前で引くので、行を消しても詰めない。
- **尺**：行の長さは声の長さで決まる（[schedule.js](src/zundamon/schedule.js)。映像の timeline.js と撮影の record_film.mjs の `zrec` が同じ計算を使う）。画面の操作は `Z.w('行id', 'カナ')`（その言葉が始まる、録画のフレーム）で決めてあり、録画の 0 コマ目は章の頭。台本を直したら、声 → 撮影 → 書き出しの順に流し直す。
- **立ち絵**：[capture/export_zundamon.py](capture/export_zundamon.py) が PSD から 70 パーツを書き出し、[Zundamon.jsx](src/zundamon/Zundamon.jsx) が重ねる。まばたき（2〜4.5秒おき）と、声の母音に合わせた口パク（ま行・ば行・ぱ行の頭は口を閉じる）をする。
  手を振るときは、パーツを回さず、肘のところでなめらかに曲げた絵（-14°〜+14°・0.5°おき・`public/zundamon/parts/wave/`）を角度で選ぶ。腕のパーツには体の脇に沿った袖の裾まで入っているので、肩で回すと裾が体から外れて切り口が見え、袖口で切って回すと袖口との間に隙間が出るため。
- **声の大きさ**：行ごとに声のある部分の RMS をそろえて WAV に書き込んである（ピークは 0.89 まで）。
- **撮影**：`capture/record_film.mjs` の `rec_z_*`（章ごとに 1 本）。日付は 6/17（水）8:45：今日のスケジュールに 1限（英語第二・西9号館 8:50）・3〜4限の実験・夜の部活が並ぶ。
- **デモのデータ**（プロモーションのために自由に書き換えてよい）：コースに年度を付けて「今日のスケジュール」に授業が出るようにし、夜の予定（写真部）を足した。授業の教材は Moodle の代わりにデモの教材（campus-sns/demoData.js の `demoCourseContents`）を本番と同じ変換に通して出す。PDF は `public/demo/materials/lecture_ja.pdf・lecture_en.pdf`（[capture/make_demo_pdfs.mjs](capture/make_demo_pdfs.mjs) で作る。科目ごとに作ると日本語のフォントが毎回埋め込まれて 13MB になるので共通の 2 つ）。
- **音の大きさ**：書き出した音を [capture/master_audio.py](capture/master_audio.py) で −15 LUFS・true peak −1.5dBTP 以下にそろえてからつなぐ（大きさは ffmpeg の loudnorm で測り、ゲインと先読みリミッターは numpy。Remotion に同梱の ffmpeg にはリミッターが無い）。BGM は声の間だけ下げ、締めのジングルは BGM の小節の頭から鳴らして、最後の一打がずんだもんの最後の台詞の終わりに来るようにしてある。

## クレジット（公開時に表記する）
- 音声：VOICEVOX:ずんだもん（[利用規約](https://zunko.jp/con_ongen_kiyaku.html)。クレジット表記が必要）
- 立ち絵：坂本アヒル「ずんだもん立ち絵素材2.3」（readme：改変・加工・商用は公式ガイドラインに準じて可、表記は任意。[公式ガイドライン](https://zunko.jp/guideline.html)）
- BGM・効果音：このリポジトリのスクリプトで合成したオリジナル
- 映像の最後にもクレジットを出している
