# キャンパスロワイヤル（仮称）実装仕様書

バーチャルキャンパスの中のゲームの 1 つ目。大岡山キャンパスの 3D マップを舞台にした、最後の 1 人になるまで戦うバトルロワイヤル型のゲーム。

- 作成日：2026-11-25
- 対象リポジトリ：`isct`（ScienceTokyo App。Next.js + React、3D は MapLibre のカスタムレイヤー）
- この文書の読み手：このリポジトリで実装を行うコーディングエージェント。会話の経緯は知らない前提で書いている。
- 行番号は 2026-11-25 時点の作業ツリー（未コミットの変更を含む）のもの。ずれるので、関数名を目印にすること。

---

## 0. 最初に守ること

1. **`public/map-3d/features.json` を書きかえない。** 本番の 3D データで、複数のセッションが同時に書いている。読むだけ。
2. **コミット・push・`wrangler deploy`・本番への反映はしない。** すべてユーザーの明示の指示があってから。
3. **作業ツリーは他のセッションと共有している。** `git status` に出る他人の未コミットの変更（`campus3d*.js` 多数、`CampusMap3D.jsx` など）を戻さない・整形しない・まとめてコミットしない。自分が触ったファイルだけを扱う。
4. **`CampusMap3D.jsx`（約 4,000 行）への変更は小さく、足すだけにする。** ゲームの中身はすべて新しいファイルに置き、`CampusMap3D.jsx` には 8 章の「game フック」を呼ぶ行だけを足す。既存の行の整形・並べかえ・改名はしない。
5. **地図（キャンパスナビ＝`views/NavigationView.jsx`）には何も足さない。** 通信もゲームも、バーチャルキャンパス（`views/VirtualCampusView.jsx`）からだけ入る。
6. 既存の「みんなと歩く」（部屋サーバーの `WalkRoom`、`campus3dPeers.js`）の動きを変えない。公開済みで使われている。
7. 特定の既存ゲームの名前・キャラクター・武器の名前や見た目・UI の写しは作らない。ジャンルの仕組みだけを使う。

---

## 1. 何を作るか

- バーチャルキャンパスの入口に「ゲーム」を選ぶ所を作り、その 1 つ目として「キャンパスロワイヤル」を入れる。あとから別のゲームを足せる形にする。
- 1 試合の流れ：ロビーで集まる → キャンパスの上を飛ぶ飛行機に乗る → 好きな所で飛び降りてパラシュートで降りる → キャンパスに落ちている装備・物資を拾う → 戦う → 安全地帯が縮む → 最後の 1 人が勝ち。
- 1 試合は 4〜8 分。2〜24 人。スマホ（横向き）と PC の両方で遊べる。
- ひとりで試せる「練習」も作る（サーバーなしで同じルールが動く。開発中の確認にも使う）。

### v1 に入れるもの・入れないもの

| 入れる（v1） | 後回し（この仕様の対象外。作らない） |
|---|---|
| ソロ（全員が敵）の試合 | デュオ・スクワッド、蘇生 |
| 飛行機・降下・パラシュート | 乗り物（自転車・車）を試合で使う |
| 装備 5 種＋素手、回復 4 種、ヘルメット | 投げ物（水風船など）、アタッチメント、レア度 |
| 安全地帯（5 段階） | 補給物資の投下、天気・夜の試合 |
| 観戦（脱落後は自由に飛んで見る） | ボット、ランキングの保存（Supabase）、フレンド招待 |
| 練習（ひとり、的あて） | 手に持った装備の 3D 表示（一人称のビューモデル） |
| 合言葉の部屋（部屋名を URL に入れるだけ） | 音声チャット、自由入力のチャット |

---

## 2. いまある仕組み（確認済みの事実）

実装の前に次のファイルを読むこと。ここに書いた内容は 2026-11-25 に読んで確かめたもの。

### 2.1 最初に読むファイル

| ファイル | 何が書いてあるか |
|---|---|
| `cf-walk-rooms/src/index.js`（130 行） | 部屋サーバー。Cloudflare Workers + Durable Objects。`WalkRoom` クラス、Hibernation API、状態は WebSocket の添え書き（`serializeAttachment`）。通信の形は冒頭のコメント |
| `cf-walk-rooms/wrangler.toml` | `ROOMS` バインディング、`ALLOWED_ORIGINS`、`MAX_PEERS`、migration `v1` |
| `cf-walk-rooms/test/relay.test.mjs` | `wrangler dev` に対する通信テストの書き方 |
| `campus-sns/campus3dPeers.js`（156 行） | クライアントの通信部品 `createPeerLink`。送信の間引き、受信の補間（260 ms 遅らせる）、つなぎ直し |
| `campus-sns/views/VirtualCampusView.jsx`（155 行） | バーチャルキャンパスの画面。`CampusMap3D` に `peers`（通信）と `walkOverlay`（歩く画面に重ねる DOM）を渡す |
| `campus-sns/campus3dWalk.js`（1,133 行） | 歩く物理。`walkWorld(...)` が当たり判定の世界を作る。`stepBody`（歩く）・`stepFly`（飛ぶ）・`eyeCamera` |
| `campus-sns/campus3dJet.js`（94 行） | ジェット機。空中の当たり判定の書き方（`obstructed`）の手本 |
| `campus-sns/campus3dVehicleMesh.js`（608 行） | 人の形 `peopleMeshes`、乗り物の形 `vehicleMeshes`、`peerFrameMeshes` |
| `campus-sns/campus3dVehicleGeometry.js` | 形を作る部品（`Part`, `tube`, `box`, `cyl`, `ellipsoid`, `rgb` …）。export 済み |
| `campus-sns/campus3dLayer.js` の `createVehiclesLayer`（1021 行〜） | 毎フレーム形を受け取って描くレイヤー。`{ groups: [{ id, ver, solid, glass, screen, glow }] }` |
| `campus-sns/components/CampusMap3D.jsx` | `walkTick`（1925 行〜）、`peersFrame`・`placePeerTags`（2565 行〜）、`walkRay`（2199 行〜）、入力の `useEffect`（3076 行〜）、歩く画面の JSX（3871 行〜） |
| `campus-sns/campus3dInventory.js`・`components/MapInventory.jsx` | ふだんの持ち物（9 マスの欄）。試合中は使わないが、見た目と `.cb3-rot` の書き方の手本 |
| `scripts/test-campus-peers.mjs`・`scripts/test-campus-deck.mjs` | Node でのテストの書き方（にせの WebSocket、`walkWorld` を Node で作る） |

### 2.2 座標と単位

- 平面：`campus3dFeatures.js` の `toXY([lng, lat])` → `[x, y]`。キャンパスの中心（北緯 35.6048、東経 139.6835）からの東・北の m。逆は `toLngLat`。
- 高さ `z`：標高 m。キャンパスの地面はおよそ 25〜40 m。いちばん高い屋上はおよそ 80 m（西8号館の塔屋）。
- 向き `yaw`：度。北が 0、時計回り。前の向きは `[sin(yaw), cos(yaw)]`（`campus3dVehicleMath.js` の `fwdOf`）。
- 上下の向き `pitch`：MapLibre の pitch。0 が真下、90 が水平、180 が真上（`campus3dWalk.js` の `PITCH`）。
- 歩く人の `z` は足の高さ。目は `z + EYE`（1.62 m）。
- 細かく作ってある範囲（2026-11-25 に測った値）：x −407〜466、y −487〜593（約 870 × 1,080 m）。歩ける範囲そのものはもっと広い（下地の地図の端から 40 m 内側）が、外は作り込みのない街。

### 2.3 歩く世界 `walkWorld` が返すもの（870 行）

`{ surfacesAt, pavedHeight, floorBelow, blocked, blockedSpan, move, freeNear, pick, setDyn, setDynFloor, coverAt, beltAt }`

- `floorBelow(x, y, ref)` → `ref` 以下でいちばん高い足場 `{ z, deck }`（地面・屋上・階の床・橋・階段）。なければ `null`。
- `blocked(x, y, z)` → 足の高さ `z` の体（+0.1〜+1.8 m）が壁・建物に重なるか。
- `blockedSpan(x, y, lo, hi)` → 高さの区間 `[lo, hi]` が重なるか（乗り物・弾の判定に使える）。
- `freeNear(x, y, z)` → 建物の中・壁ぎわなら近くの立てる点 `[x, y, z]`。
- 地面そのものには立体がない。地面より下かどうかは `floorBelow(x, y, z + 0.05) === null` で見る（`campus3dJet.js` の `obstructed` と同じ）。
- ガラスの壁も歩けない＝弾も通らない扱いになる（v1 はそれでよい）。

### 2.4 通信（いまの「みんなと歩く」）

- 1 部屋＝ Durable Object 1 つ。JSON の配列を WebSocket で送る。受けたメッセージは 200 バイトまで、1 接続あたり 1 秒 12 個まで。
- クライアントは動いているとき 1 秒 5 回、止まると 4 秒に 1 回だけ位置を送る。
- 無料プランの数え方：受けたメッセージ 20 個で 1 リクエスト（1 日 10 万リクエストまで）。配る側は数えない。
- 部屋サーバーは公開済み：`wss://isct-walk-rooms.learnguages-poly.workers.dev`（`VirtualCampusView.jsx` の `WALK_ROOMS_URL`）。`middleware.js` の CSP `connect-src` にこのホストが入っている。同じホストに経路を足すぶんには CSP を変えなくてよい。

### 2.5 スマホの歩く画面

- スマホを縦に持っていても、歩く画面は 90° 回して横向きに描く（外側の箱に `.cb3-full.cb3-rot`）。
- そのため：`(orientation: landscape)` のメディアクエリは回しているあいだ効かない → 同じ規則を `.cb3-rot ` を前につけてもう一度書く。大きさは `vh`・`innerHeight` ではなく箱からの % で決める。セーフエリアは `var(--cb3-sl|sr|st|sb, env(...))` を使う。
- ポインターの座標は回っている。`CampusMap3D.jsx` の `canvasPt` と `lookBy` の呼び方（3082〜3146 行）と同じ変換をすること。
- 3D はスマホではすでに重い（GL のバッファ 115〜146 MB）。毎フレーム GPU に送る頂点を増やさない（11 章）。

---

## 3. ゲームデザイン

数値はすべて `campus3dRoyaleRules.js` の定数にまとめ、サーバーとクライアントが同じファイルを読む。あとで調整しやすいように、コードの中に数値を散らさない。

### 3.1 表現の方針

- 見た目は**おもちゃのブラスター**（光の弾を撃つ道具）にする。本物の銃の形・名前にしない。血は出さない。
- 当たると「アウト」になって退場する（倒れた体は残さず、その場に持ち物の箱が残る）。画面の言葉は「撃破」「アウト」「残り○人」。
- 理由：実在の大学のキャンパスが舞台で、アプリはストアで配っている。写実的な暴力表現はストアの年齢区分と大学の印象の両方に響く。
- 名前・色・形は装備の表（3.5）の 1 か所で決める。あとで変えるときはその表だけを直せばよい作りにする。

### 3.2 試合の流れ（フェーズ）

| フェーズ | 長さ | 何が起きるか |
|---|---|---|
| `lobby` | 人が集まるまで | ウッドデッキ（入口。x 46, y 121.5）のまわりを歩ける。撃てない・減らない。「準備OK」を押す |
| `countdown` | 10 秒 | 準備OKが 2 人以上で、(a) ロビーの全員が準備OK、または (b) 2 人目の準備OKから 30 秒たつと始まる。準備OKを押していない人はこの試合は観戦 |
| `play` | 4〜8 分 | 時刻 `t0` に始まる。全員が飛行機に乗った状態から。降下 → 物資 → 戦い → 安全地帯 |
| `end` | 15 秒 | 結果の表（順位・撃破数・与えたダメージ）。そのあと `lobby` に戻る（接続はそのまま） |

- 試合の途中で入った人は、次の試合まで観戦。
- 試合中に接続が切れた人は、その場でアウト（持ち物の箱を残す）。v1 では復帰なし。
- 生き残りが 1 人以下になったら `end`。

### 3.3 人数による大きさ（ティア）

少人数だと広すぎて出会えないので、試合を始めるときの参加人数で、はじめの安全地帯の大きさと時間を決める。

| ティア | 参加人数 | はじめの半径 `r0` | 時間の倍率 |
|---|---|---|---|
| `S` | 2〜4 | 160 m | 0.6 |
| `M` | 5〜10 | 300 m | 0.8 |
| `L` | 11〜24 | 700 m（作り込んだ範囲の全体） | 1.0 |

- はじめの円の中心：`L` は (30, 55)。`S`・`M` は「拠点」の表（10.3）からシードで 1 つ選ぶ。
- 物資は、はじめの円＋50 m の中にある置き場所だけに出す。

### 3.4 飛行機と降下

- 飛行機の線：はじめの円の中心から半径 `0.3 × r0` 以内の点（シードで決める）を通る直線。向きもシードで決める。始点と終点は、中心から半径 `r0 + 150 m` の円との交点。
- 高さは標高 260 m で一定（`PLANE_Z`。実装時に、いちばん高い屋上より 150 m 以上高いことを `floorBelow` で確かめる）。速さ 30 m/s。
- 飛行機の位置は `t0` と時刻から計算できる（通信しない）。全員が同じ飛行機に乗っている。
- 飛び降りられるのは、出発から 3 秒後〜終点の 2 秒前。終点の 2 秒前にまだ乗っている人は自動で降ろす。
- 飛行機の形は、いまあるジェット機の形（`vehicleMeshes` の `kind: "jet"`）をそのまま使う。新しい模型は作らない。

降下の動き（新しい関数 `stepDrop`。`stepFly` と同じ形の入出力にする）：

| 状態 | 下りる速さ | 横の速さ（入力した向きへ） | 備考 |
|---|---|---|---|
| 落下 | 30 m/s | 最大 18 m/s（加速 12 m/s²） | 「走る」を押しているあいだは急降下：下り 48 m/s、横は最大 6 m/s |
| パラシュート | 6.5 m/s | 最大 10 m/s | 後ろ入力でブレーキ：下り 5 m/s、横は最大 3 m/s。閉じられない |

- パラシュートは、足もとのいちばん高い足場（`floorBelow(x, y, z)`）から 60 m 以下になると自動で開く。落下が 1 秒続いたあとは、ジャンプのボタンで手動でも開ける。
- 横に動いた先が `blockedSpan(x, y, z, z + 1.8)` なら横の動きを止める（壁に沿って落ちる）。
- 足が足場に着いたら着地。着地点が `blocked` なら `freeNear` へずらす。屋上にも降りられる。
- **落下ダメージは v1 ではなし**（屋上に降りて下りられなくなった人が飛び降りられるように）。定数 `FALL_DAMAGE = null` として、あとで入れられる形だけ残す。
- 降下中のカメラは後ろ上からの三人称（自分の体とパラシュートが見える）。地面では今までどおり一人称。

目安：最短（急降下）で約 12 秒、早く開いて粘ると約 30 秒・横に約 300 m 動ける。

### 3.5 体力と装備

- HP 100、シールド 0〜100。はじめは HP 100・シールド 0・素手のみ。ダメージはシールドから先に減る。
- 装備の枠：ブラスター 2 つ＋素手。3 つ目を拾うと、持っているものと入れかわる（古いほうはその場に落ちる）。

| id | 画面の名前（仮） | 弾の種類 | 1 発 | 1 秒の発数 | 撃ち方 | 弾倉 | リロード | 満額の距離 → 最小（倍率 @ 距離） | 届く距離 | ばらつき | 頭の倍率 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fist` | 素手 | － | 18 | 2 | 近接 | － | － | － | 2.2 m | － | 1.0 |
| `pistol` | ハンドブラスター | `light` | 24 | 4 | 1 発ずつ | 12 | 1.3 秒 | 25 m → 0.6 @ 70 m | 120 m | 1.0° | 1.5 |
| `smg` | ラピッドブラスター | `light` | 15 | 11 | 連射 | 30 | 1.9 秒 | 18 m → 0.5 @ 55 m | 90 m | 2.2° | 1.5 |
| `ar` | ロングブラスター | `medium` | 26 | 6.5 | 連射 | 25 | 2.2 秒 | 50 m → 0.7 @ 150 m | 250 m | 1.2° | 1.5 |
| `shotgun` | ワイドブラスター | `shell` | 10 × 8 粒 | 1.1 | 1 発ずつ | 5 | 2.6 秒 | 7 m → 0.2 @ 25 m | 35 m | 5° | 1.25 |
| `sniper` | スコープブラスター | `heavy` | 90 | 0.7 | 1 発ずつ | 4 | 3.0 秒 | 減らない | 400 m | 構え 0.15°／腰だめ 4° | 2.0 |

- 距離による倍率は、満額の距離から最小の距離まで直線で下げ、その先は最小のまま。
- ばらつきの倍率：動いている × 1.6、空中 × 2.2、構え（ADS）× 0.5、しゃがみ × 0.8。
- 構え：画角を狭める（ふつう 70° → 50°、`sniper` は 15°）。構え中は動く速さ 0.6 倍。
- 反動：1 発ごとに上へ少し跳ね、撃ちやめると戻る（装備ごとの角度は定数に。目安 0.4〜2.5°）。
- 弾は即着（撃った瞬間に当たりを決める）。飛ぶ弾の計算はしない。光の線（トレーサー）は見た目だけ。
- 弾の持てる上限：`light` 150、`medium` 125、`shell` 24、`heavy` 15。
- 当たりの形：体＝足から 0.25〜1.45 m の線分のまわり半径 0.32 m。頭＝足から 1.6 m の点のまわり半径 0.17 m。

回復と防具（キャンパスの自販機・生協にある物にする）：

| id | 名前 | 効果 | 使う時間 | 持てる数 |
|---|---|---|---|---|
| `tea` | お茶 | HP +25（100 まで） | 2.5 秒 | 5 |
| `bento` | 弁当 | HP を 100 に | 6 秒 | 2 |
| `coffee` | コーヒー | シールド +25（100 まで） | 2.5 秒 | 5 |
| `energy` | エナジードリンク | シールドを 100 に | 5 秒 | 2 |
| `helmet` | ヘルメット | 頭の倍率を 1.0 に（`sniper` だけ 1.3） | すぐ | 1 |

- 回復を使っているあいだは走れない。撃つ・持ちかえると取り消し。ダメージを受けても取り消さない（v1）。

### 3.6 物資

- 置き場所はあらかじめ作った表（10 章。約 300〜400 点）。試合ごとに、シードで「どの点に何が出るか」が決まる。同じシードなら全員同じ。
- 1 点あたりの中身（重み）：ブラスター 34、弾 28、回復 26、ヘルメット 6、なし 6。
  - ブラスターの内訳：`pistol` 30、`smg` 24、`ar` 22、`shotgun` 16、`sniper` 8。ブラスターには弾倉 1 つぶんの弾がついてくる。
  - 弾の 1 個：`light` 30、`medium` 25、`shell` 6、`heavy` 5（種類は等しい重み）。
  - 回復の内訳：`tea` 40、`coffee` 35、`bento` 12、`energy` 13。
  - 屋内の点はブラスターの重みを 1.3 倍。「拠点」の印がついた点は 4 割以上がブラスターになるよう補う。
- 拾う：横 2.0 m 以内・高さの差 1.6 m 以内。
  - 弾・回復（上限まで）と、枠が空いているときのブラスターは、近づくだけで自動で拾う（PC もスマホも）。
  - 枠がいっぱいのときのブラスターの入れかえは、PC は F キー、スマホは画面に出る「拾う」ボタン。
  - 2 人が同時に拾おうとしたら、サーバーに先に届いたほうのもの。
- アウトになった人の持ち物は、その場に物資として落ちる。

### 3.7 安全地帯

円が 5 回縮む。円の外にいると 1 秒ごとにダメージ（シールドを無視して HP が減る）。作り込んだ範囲の外（2.2）も円の外と同じ扱い。

| 段階 | 待つ | 縮む | 縮んだあとの半径 | 外のダメージ／秒 |
|---|---|---|---|---|
| 0（降下） | 飛行機の飛ぶ時間＋20 秒 | － | `r0` | 0 |
| 1 | 60 秒 | 60 秒 | `0.5 × r0` | 1 |
| 2 | 45 秒 | 45 秒 | `0.25 × r0` | 2 |
| 3 | 40 秒 | 40 秒 | `0.11 × r0` | 4 |
| 4 | 30 秒 | 30 秒 | `0.04 × r0` | 7 |
| 5 | 20 秒 | 30 秒 | 0 | 10 |

- 「待つ」「縮む」の秒数にはティアの時間の倍率（3.3）を掛ける。
- 次の円は必ず前の円の中に全部入る。次の中心は、前の円の中にある「屋外の置き場所」の点からシードで選ぶ（建物の壁の中が最後の円にならないように）。
- 縮んでいるあいだは、中心と半径を前の円から次の円へ時間で直線に動かす。
- 円は `t0`・シード・ティアと時刻だけから計算できる純関数 `zoneAt(match, t)` にする。サーバーもクライアントも同じ関数を使い、円そのものは通信しない。

### 3.8 アウトになったあと

- 自由に飛んで見られる観戦（いまある `stepFly`。壁は抜けない）。ほかの人からは見えない・当たらない。
- 「次の人を見る」ボタンで、生き残っている人の後ろへ移る。
- 「ロビーへ戻る」でいつでも抜けられる。
- 試合中は敵の名前の札を出さない（札は壁ごしに見えてしまう）。ロビーと観戦中だけ出す。

---

## 4. 全体の作り

```
VirtualCampusView.jsx ── ゲームの一覧（vcGames.js）── 「みんなと歩く」＝ 今までどおり createPeerLink
        │                                          └ 「キャンパスロワイヤル」
        │ props.peers（通信） props.game（フック） props.walkOverlay（HUD）
        ▼
CampusMap3D.jsx（歩く画面。game フックを呼ぶ行だけ足す）
        ▲
campus3dRoyale.js（クライアントの試合の進行：降下・撃つ・拾う・観戦）
   ├ campus3dRoyaleRules.js   定数と純関数（円・物資・ダメージ・飛行機）  ← サーバーも読む
   ├ campus3dRoyaleSpawns.js  物資の置き場所の表（生成物）               ← サーバーも読む
   ├ campus3dRoyaleMatch.js   試合の状態機械（権威側のルール）           ← サーバーも読む・練習では端末の中で動く
   ├ campus3dRoyaleLink.js    部屋サーバーとの通信（createPeerLink と同じ形＋試合のメッセージ）
   ├ campus3dRoyaleMesh.js    物資・パラシュート・円の壁・光の線の形
   ├ campus3dRoyaleAudio.js   効果音（WebAudio で合成。音声ファイルなし）
   └ components/MapRoyale.jsx HUD（体力・装備・ミニマップ・残り人数・ボタン・結果）

cf-walk-rooms/src/index.js  ── 経路 /royale/<部屋> → RoyaleRoom（新しい Durable Object のクラス）
cf-walk-rooms/src/royale.js    RoyaleRoom：WebSocket を campus3dRoyaleMatch.js の状態機械につなぐだけ
```

### 4.1 いちばん大事な決めごと：ルールは 1 つの純粋な状態機械にする

`campus3dRoyaleMatch.js` は、DOM も WebSocket も時計も持たない。

```js
// 例（名前は変えてよい。形はこのとおりに）
const match = createRoyaleMatch({ spawns, rules, random });      // 部屋 1 つぶんの状態
const out = match.handle(playerId, msg, now);                   // 受けたメッセージ 1 個 → 出すメッセージの並び
const out2 = match.tick(now);                                   // 時間で進むもの（フェーズ・円のダメージ）
// out = [{ to: "all" | "others" | playerId, from: playerId, msg: [...] }, ...]
```

- サーバー（`RoyaleRoom`）はこれに WebSocket と Durable Object のアラームをつなぐだけ。
- 練習（ひとり）は、同じものを端末の中で動かす（にせの通信路）。
- テストは Node でこれを直接動かす（`wrangler` なしで試合 1 本を数ミリ秒で回せる）。

`campus3dRoyaleRules.js`・`campus3dRoyaleSpawns.js`・`campus3dRoyaleMatch.js` の 3 つは、**ほかのファイルを import しない**（`campus3dFeatures.js` などは React のフックまで引きこむので、Worker に入れられない）。必要な小さな関数は中に書く。

Worker からは `../../campus-sns/campus3dRoyaleMatch.js` のように相対パスで import する。`wrangler dev` でまとめられることを最初に確かめる。できなければ、`cf-walk-rooms/src/shared/` へコピーするスクリプトと、「2 か所が同じ内容か」を見るテストを足す。

### 4.2 だれが何を決めるか

| こと | 決める側 | 補足 |
|---|---|---|
| フェーズ、`t0`、シード、ティア | サーバー | |
| 円・飛行機の位置 | 両方が同じ純関数で計算 | 通信しない |
| 物資の中身 | 両方が同じ純関数で計算 | だれが拾ったかはサーバー |
| 自分の位置・動き | 自分の端末 | サーバーは速すぎる移動を捨てるだけ |
| 弾が当たったか（壁ごしでないか） | 撃った人の端末 | サーバーは建物の形を持たない |
| ダメージの量、HP、シールド、弾数、持ち物、アウト、順位 | サーバー | 端末は先に見せてよいが、サーバーの値で上書きする |
| 円のダメージ | サーバー | |

- サーバーは建物の形を持たない（`features.json` は 18 MB あり、Worker に載せない）。だから「壁ごしに当てた」「壁を抜けた」は端末を信じる。学内アプリの遊びとして、v1 はこれでよいとする。
- 全員の位置は全員に配られる（改造した端末なら壁ごしに位置が分かる）。これも v1 は受け入れる。

---

## 5. 通信の形

いまの `WalkRoom` と同じく、JSON の配列で、1 つ目が種類。経路は `wss://<同じホスト>/royale/<部屋名>`（部屋名は `[a-z0-9-]{1,32}`。ふつうは `main`、合言葉の部屋は合言葉をそのまま）。

時刻はすべてサーバーの時計（ms）。端末は `t` でサーバーとの時計のずれを測る。

### 5.1 端末 → サーバー

| メッセージ | 意味 |
|---|---|
| `["j", name, col, rulesVer]` | 入る。`rulesVer` は `campus3dRoyaleRules.js` の `RULES_VER`（置き場所の表の版も含めた数）。合わなければ `["x","ver"]` |
| `["t", clientMs]` | 時計合わせ。入ったとき 3 回、そのあと 30 秒に 1 回 |
| `["r", 0 or 1]` | 準備OK／取り消し（ロビーだけ） |
| `["p", x, y, z, yaw, st]` | 位置。`st` は 5.3 |
| `["d"]` | 飛行機から飛び降りた |
| `["w", slot]` | 手に持つものを変えた（0 素手、1・2 ブラスター） |
| `["f", slot, n, yaw, pitch]` | 前の知らせからあと、`slot` の装備で `n` 発撃った。撃っているあいだ 1 秒 5 回まで |
| `["a", targetId, slot, head, k]` | 当たった。`head` は 0 体・1 頭、`k` は当たった粒の数（`shotgun` 以外は 1） |
| `["l", slot]` | リロードが終わった |
| `["g", lootId]` | 拾う |
| `["o", kind]` | 捨てる（`kind` は装備・回復の id） |
| `["u", kind, 0 or 1]` | 回復を使いはじめた／使い終わった |
| `["s", n]`・`["e", n]` | 定型のひとこと・合図（ロビーと観戦だけ。番号はいまの `PEER_PHRASES`・`PEER_EMOTES`） |

受けたメッセージは 200 バイトまで・1 秒 16 個まで（位置 8 ＋撃つ 5 ＋その他）。超えたぶんは黙って捨てる。

### 5.2 サーバー → 端末

| メッセージ | 送り先 | 意味 |
|---|---|---|
| `["h", myId, serverMs, snapshot]` | 本人 | 入ったとき。`snapshot = { phase, t0, seed, tier, players: [[id, name, col, alive, x, y, z, yaw, st, hold]], taken: [lootId…], drops: [[lootId, kind, n, x, y, z]…] }` |
| `["t", clientMs, serverMs]` | 本人 | 時計合わせの返事 |
| `["j", id, name, col]`・`["l", id]` | ほか全員 | 入った・出た |
| `["r", id, 0 or 1]` | 全員 | 準備OK |
| `["m", "countdown", startAtMs]` | 全員 | 始まる時刻 |
| `["m", "play", t0, seed, tier, [参加者の id…]]` | 全員 | 試合開始 |
| `["m", "end", winnerId, [[id, place, kills, damage]…]]` | 全員 | 結果 |
| `["m", "lobby"]`・`["m", "abort"]` | 全員 | ロビーへ戻る・試合の中止（6.3） |
| `["p", id, x, y, z, yaw, st]` | ほか全員 | 位置 |
| `["w", id, kind]` | ほか全員 | 手に持つもの |
| `["f", id, kind, n, yaw, pitch]` | ほか全員 | 撃った（光の線と音のため） |
| `["d", targetId, hp, sh, byId, kind, head]` | 全員 | ダメージの結果。`byId` 0 は円 |
| `["k", victimId, byId, kind, place, aliveLeft]` | 全員 | アウト |
| `["g", lootId, byId]` | 全員 | 物資がなくなった |
| `["o", lootId, kind, n, x, y, z]` | 全員 | 物資が落ちた（捨てた・アウトの箱）。id は 100000 から |
| `["i", hp, sh, helmet, [[kind, mag], [kind, mag]], [light, medium, shell, heavy], [tea, bento, coffee, energy], held]` | 本人 | 持ち物の正しい値。変わるたびに |
| `["x", reason]` | 本人 | 断り：`full`・`ver`・`bad` |

### 5.3 状態の番号 `st`

0〜7 はいまのまま（0 歩く、1 走る、2 座る、3 飛ぶ、4 自転車、5 車、6 ドローン、7 ジェット）。足す番号：

| 番号 | 意味 | ほかの人からの見え方 |
|---|---|---|
| 8 | 落下中 | 手足を広げた姿 |
| 9 | パラシュート | 傘（その人の色）と体 |
| 10 | 飛行機の中 | 描かない |
| 11 | 観戦・アウト | 描かない（サーバーも配らない） |
| 12 | しゃがみ | 低い姿（余力があれば。なければ歩くと同じでよい） |

`campus3dPeers.js` の `PEER_STATES` に名前を足す（番号はずらさない）。いまの `WalkRoom` は `st` を 0〜15 で受けるので変更はいらない。

### 5.4 位置を送る回数

- 試合中：動いているとき 1 秒 8 回（125 ms）、止まっているとき 2 秒に 1 回。受ける側の補間の遅れは 200 ms。
- ロビー・観戦：いまと同じ（1 秒 5 回・4 秒に 1 回）。観戦中の自分の位置は送らない。

---

## 6. サーバー（`RoyaleRoom`）

### 6.1 置き場所

- `cf-walk-rooms/src/royale.js` に `export class RoyaleRoom`。`src/index.js` には、経路 `/royale/<部屋>` を `env.ROYALE` に渡す数行と `export { RoyaleRoom }` だけ足す。`WalkRoom` の中は触らない。
- `wrangler.toml`：バインディング `ROYALE`（`class_name = "RoyaleRoom"`）、migration `tag = "v2"`・`new_sqlite_classes = ["RoyaleRoom"]`、`[vars]` に `ROYALE_MAX = "24"`。
- Origin の検査（`ALLOWED_ORIGINS`）は `WalkRoom` と同じものを通す。

### 6.2 中の作り

- Hibernation API（`ctx.acceptWebSocket`）を使う。接続ごとの添え書きには `{ id, name, col }` だけ置く。
- 試合の状態（`createRoyaleMatch` の返すもの）はメモリに持つ。
- `webSocketMessage` → `match.handle(id, msg, Date.now())` → 返ってきた並びを送る。
- 時間で進むものは Durable Object のアラーム（`ctx.storage.setAlarm`）：`countdown`・`play`・`end` のあいだだけ 1 秒ごとに `match.tick(now)`。`lobby` ではアラームを止める（部屋が眠れるように）。
- `webSocketClose` → `match.leave(id, now)`。

### 6.3 部屋が眠った・作り直されたとき

- フェーズと `t0` だけ `ctx.storage` に書いておく（フェーズが変わるときだけ）。
- コンストラクタで「保存では `play` なのにメモリに試合がない」と分かったら、試合を捨てて `["m","abort"]` を全員に送り、`lobby` に戻す。試合の途中からの復元は作らない。

### 6.4 サーバーが確かめること

状態機械（`campus3dRoyaleMatch.js`）の中に書く。断るときは何も返さない（黙って捨てる）。持ち物がずれたと思われるときは本人に `i` を送り直す。

| メッセージ | 確かめること |
|---|---|
| `p` | 数の範囲（いまの `WalkRoom` と同じ）。地上にいる人が 1 秒で横に 14 m より多く動いていたら、その位置を捨てる |
| `d` | `play` で、飛び降りられる時間の中か |
| `f` | 生きている。その枠に装備がある。弾倉に `n` 発ある。前の `f` からの時間 × 連射の速さ ＋ 2 発より多くない。通れば弾倉を減らし、「当たりの持ち分」を `n × 粒の数` 足す |
| `a` | 撃った人・当たった人が生きている。当たった人が飛行機の中でない。持ち分が `k` 以上ある（使ったぶん減らす）。サーバーが知っている 2 人の位置の距離が、届く距離 × 1.1 ＋ 5 m 以内。ダメージはサーバーがその距離で計算する |
| `l` | 最後に撃ってから（または前のリロードから）リロードの時間 − 0.15 秒がたっている。持っている弾から弾倉へ移す |
| `g` | 生きていて地上にいる。物資がまだある。サーバーが知っている位置から 4 m 以内。上限・枠の決まりどおりに入れる |
| `u` | 持っている。終わりの知らせが、はじめから使う時間 − 0.15 秒より後 |
| 円 | `p` を受けるたびと `tick` のたびに、前に見た時刻からの秒数 × その段階のダメージを引く（1 回に 2 秒ぶんまで） |

---

## 7. クライアントのモジュール

### 7.1 `campus3dRoyaleRules.js`（純関数・import なし）

- `RULES_VER`、`WEAPONS`、`HEALS`、`AMMO_CAP`、`ZONE_STAGES`、`TIERS`、`PLANE`、`DROP`、`HIT`（当たりの形）、`PLAY_RECT`。
- `rng(seed)`（mulberry32 など、決まった乱数）、`tierFor(n)`。
- `matchPlan(seed, tier, spawns)` → `{ center0, r0, plane: { a, b, dur }, zones: [{ t0, t1, from, to, dps }], loot: Map(lootId → { kind, n }) }`。試合のはじめに 1 回だけ作る。
- `planeAt(plan, t)` → `{ x, y, z, yaw, on }`、`zoneAt(plan, t)` → `{ x, y, r, next: { x, y, r }, stage, shrinking, dps, until }`。
- `damageOf(kind, dist, head, helmet)`、`spreadOf(kind, { moving, air, ads, sneak })`。

### 7.2 `campus3dRoyaleLink.js`

- `createRoyaleLink({ url, name, col, WebSocketImpl, now, timers, onEvent })`。
- **`createPeerLink` と同じ名前のものを持つ**：`send(s)`・`peers(t)`・`status()`・`myId()`・`count()`・`say(n)`・`emote(n)`・`close()`。こうすると `CampusMap3D` の `peersFrame` がそのまま使える。`peers()` の各人に `hold`（手に持つものの id）と `alive` を足す。アウトの人・飛行機の中の人は `peers()` に出さない。
- 試合のメッセージは `onEvent(msg)` で `campus3dRoyale.js` に渡す。送るほうは `ready(v)`・`drop()`・`hold(slot)`・`fire(slot, n, yaw, pitch)`・`hit(...)`・`reload(slot)`・`take(lootId)`・`discard(kind)`・`heal(kind, done)`。
- `serverNow()`：時計のずれを足した時刻。
- 練習用に `createLocalRoyaleLink({ spawns, dummies })`：同じ形で、中で `createRoyaleMatch` を動かす。的（動かない・撃たない・HP 100 の参加者）を拠点のまわりに 8〜12 体置く。

### 7.3 `campus3dRoyale.js`（試合の進行。React を使わない）

`createRoyaleGame({ link, spawns, onUi })` が 8 章の game フックの形の物を返す。中でやること：

- 自分の状態：`lobby`／`plane`／`fall`／`chute`／`ground`／`out`。
- `stepDrop(s, input, dt, world)`（3.4）。`plane` のあいだは飛行機の位置に固定（見回せる）。
- 撃つ：
  1. 目の位置と視線（`api.ray(null)`）に、ばらつきの角度を足した向きを作る。
  2. 生きているほかの人（`link.peers()` の、いま描いている補間ずみの位置）の当たりの形（3.5）との交点のうち、いちばん近いものを探す。
  3. その距離（なければ届く距離）まで、視線を 0.5 m ずつ進めて `blockedSpan(x, y, z − 0.05, z + 0.05)` か `floorBelow(x, y, z + 0.05) === null` に当たるかを見る。当たったら 0.1 m 刻みで戻して壁の点を決める。壁が先なら外れ。
  4. 当たりなら `link.hit(...)` を送り、すぐ当たりの印（十字の色）を出す。ダメージの数はサーバーの `d` が来てから。
  5. 弾倉は自分の側で先に減らし、サーバーの `i` で合わせる。
- 拾う：30 m の升目に物資を入れておき、近くの升目だけを毎フレーム見る。
- 円：`zoneAt` を毎フレーム。外にいるあいだ画面のふちを色づけ（HUD）。自分の HP は減らさない（サーバーの値を待つ）。
- 観戦：アウトの `k` を受けたら `w.fly = true` と同じ扱いにし、`st` 11。
- HUD へは `onUi(state)` で、**変わったときだけ**知らせる（毎フレーム React を描き直さない。秒読みなどよく変わる数字は `ref` の `textContent` を直接書く。`CampusMap3D` の `vehHud` と同じやり方）。

### 7.4 `campus3dRoyaleMesh.js`

`createVehiclesLayer` に渡す形（`{ groups: [...] }`）を作る。部品は `campus3dVehicleGeometry.js` のものを使う。`campus3dVehicleMesh.js` の中だけにある部品（`Out`・`emit`・`poseOf`・`GlowMesh`・`personParts`・`walkJoints`）が要るときは、**そのファイルに `export` を足す**（写しを作らない）。

| 群 | 中身 | GPU へ送るとき |
|---|---|---|
| `loot` | 歩く人から 90 m 以内の物資。1 個 40〜150 三角形の小さな形。動かさない | 中身が変わったとき・歩く人が 30 m の升目をまたいだときだけ（`ver` を上げる） |
| `near` | 拾える物資の足もとの輪 | 毎フレーム（数十頂点） |
| `zone` | 円の壁。64 角形の筒、高さは地面 −20 m〜＋120 m、半透明 | 縮んでいるあいだは毎フレーム（128 三角形）。止まっているあいだは `ver` 固定 |
| `fx` | 光の線（撃って 0.12 秒で消える。自分とほかの人のぶん）、撃った瞬間の光 | 毎フレーム（あるときだけ） |
| `self` | 降下中の自分の体とパラシュート、飛行機 | 毎フレーム（降下中だけ） |

ほかの人の体は、いまの `cb-peers` 層（`peerFrameMeshes` → `peopleMeshes`）が描く。`peopleMeshes` を広げる：

- `q.hold`（装備の id）があれば、両手を前に出して小さな装備の形を持たせる。
- `q.st === 8`：手足を広げて腹ばいの姿。`q.st === 9`：体の上 4 m に傘（幅 5 m、その人の色）とひも。
- いまの呼び出し（`hold` なし、`st` 0〜7）の結果が 1 頂点も変わらないこと（`scripts/test-campus-people.mjs` が通ること）。

### 7.5 `components/MapRoyale.jsx`（HUD）

`VirtualCampusView` が `walkOverlay` として渡す（歩く画面の箱の中に描かれるので、スマホの回転に自動でついてくる）。

- 上の中央：残り人数、撃破数、円が縮むまでの秒数（縮んでいるあいだは「縮小中」）。
- 左上：ミニマップ（円いキャンバス、直径は箱の高さの 28%）。下地の建物の輪郭を 1 回だけオフスクリーンに描いておき、毎フレームは切り出し＋いまの円（実線）・次の円（点線）・飛行機の線・自分の矢印だけ。北が上。タップ（PC は M キー）で大きい地図。
- 右上：撃破の知らせ（新しい順に 4 行、6 秒で消える）。
- 下の中央：HP とシールドの棒、装備の枠 3 つ（弾倉／持っている弾）、回復 4 種の数。
- スマホの右下：撃つ（大きい丸。押しているあいだ連射。押したまま指を動かすと見回せる）、構え、リロード、ジャンプ（降下中は「開く」）。左下はいまあるスティック。
- まん中：十字（当たると 0.15 秒だけ色が変わる）。`sniper` の構え中はスコープの丸い枠。
- フェーズごとの重ね物：ロビー（人の一覧・準備OK・「練習」・合言葉の部屋）、秒読み、飛行機（「降りる」ボタンと地図）、アウト（順位・観戦のボタン）、結果の表。
- 見た目の決まり：白い角丸のカードに細い枠線（`VirtualCampusView.jsx` の `.vc-card`・`.vc-panel` と同じ調子）。**グラデーション・左の色帯・きらきらした飾りは使わない**（ユーザーが「AI っぽい」と嫌う）。文字は `i18n.js` に `roy.*` の鍵で足す（`ja` と `en` は必ず。書き方は `nav.vcampus` の行を見る）。
- スマホの回転（2.5）を守る。

### 7.6 `campus3dRoyaleAudio.js`

- 音声ファイルは足さない。WebAudio で作る短い音：撃つ（装備ごとに高さを変えたノイズ）、当たり、アウト、拾う、リロード、円の警告、飛行機。
- ほかの人の撃つ音は、距離で小さくし、左右に振る（`StereoPannerNode`）。120 m より遠い音は鳴らさない。
- `AudioContext` は、いま乗り物の音で使っているものを共有できるならそうする（`campus3dMotorAudio.js` と `CampusMap3D.jsx` の `ring` を見る）。できなければ、最初のタップで自分のものを作る。

### 7.7 `vcGames.js` と `VirtualCampusView.jsx`

```js
// campus-sns/vcGames.js
export const VC_GAMES = [
  { id: "royale", title: "roy.title", desc: "roy.desc", min: 2, max: 24, load: () => import("./campus3dRoyale.js") },
];
```

- `VirtualCampusView` に状態 `mode`（`"walk"` か ゲームの id）を足す。入口のカードの下に「ゲーム」の一覧を出す。
- `mode === "walk"`：いまとまったく同じ（`createPeerLink` で部屋 `main`）。
- `mode === "royale"`：`createPeerLink` を閉じ、`createRoyaleLink`（部屋サーバーが使えなければ「練習」だけ選べる）を作り、`CampusMap3D` に `peers={royaleLink}`・`game={game}`・`walkOverlay={<MapRoyale … />}`・`lookMode="day"` を渡す。
- ゲームのコードは `import()` で後から読む（「みんなと歩く」だけの人に余計なコードを読ませない）。
- 深いリンク：`#vcampus/royale` で直接ロビーへ（`App.jsx` 211 行の `deepLinkRef` に 1 つ足す）。

---

## 8. `CampusMap3D.jsx` への組み込み（game フック）

`props.game` がなければ、いまと 1 行も動きが変わらないこと。足すのは次の呼び出しだけ。

```js
// props.game の形（campus3dRoyale.js の createRoyaleGame が返す）
{
  flags: { inventory: false, vehicles: false, phone: false, debugFly: false, peerTags: () => boolean },
  begin(api),   // 歩きはじめた直後。api = { world, map, walkRef, ray(pt), toast(text), repaint() }
  end(),        // 歩くのをやめた
  input(inp),   // 入力を書きかえて返す（構え中は遅く、など）。inp = { fwd, side, turn, jump, sprint, sneak }
  step(w, s, inp, dt, now),  // 自分で動かしたら新しい s、いつもの歩き（stepBody）に任せるなら null
  camera(w, view, dt),       // { x, y, z, yaw, pitch, roll } か null（目の位置のまま）
  fov(w),                    // 画角（度）か null
  st(w),                     // 送る状態の番号か null
  key(code, down, ev),       // 使ったら true（いつものキーの処理をしない）
  pointer(kind, button),     // マウスを固定しているあいだの "down" / "up"。使ったら true
  frame(now),                // 描くもの { groups: [...] } か null
  matrix(M, canvas),         // 描く前の行列（画面に印を置くとき。省略可）
}
```

| 場所（関数名で探す） | 足すこと |
|---|---|
| `beginWalk` | `props.game` があれば、持ち物（`loadInventory()`。1902 行のあたり）と乗り物（`w.veh`。1912 行のあたり）を作らない。`w.game = props.game` を置き、`game.begin(api)` を呼ぶ |
| `finishWalk`／`stopWalk` | `game.end()` |
| `walkTick` の入力を読む所（1947 行〜） | game があるとき、上下を見るキーは `PageUp`／`PageDown` だけにする（`R`・`F` はリロード・拾うに使う）。`fwd` などをまとめて `game.input(...)` に通す |
| `walkTick` の動きの分かれ（1998 行〜の `if (w.seat) … else if (w.veh?.ride) …`） | いちばん先に `const gs = w.game?.step(w, s, inp, dt, now); if (gs) s = gs; else …（いまの分かれ）` |
| `walkTick` の画角（`fovTarget`。2102 行） | `w.game?.fov(w) ?? （いまの式）` |
| `walkTick` のカメラ（`const vc = VHc?.cam`。2159 行） | `const vc = w.game?.camera(w, view, dt) || VHc?.cam`（`view` の定義より後に置く） |
| `peersFrame`（2565 行〜） | `st:` の式の頭に `w.game?.st(w) ??` |
| `placePeerTags`（2585 行〜） | `w.game && !w.game.flags.peerTags()` なら札を全部隠して戻る |
| レイヤーを足す所（`cb-peers` を作っている 1140 行のあたり） | `props.game` があるときだけ `createVehiclesLayer({ id: "cb-royale", …, frame: () => walkRef.current?.game?.frame(performance.now()) ?? null, onMatrix: … })` |
| 入力の `useEffect` の `down`・`up`（3095 行〜） | マウスを固定しているとき：先にエレベーターのボタン（`pressLiftAt`）を見て、当たっていなければ `game.pointer("down", e.button)`。`up` も渡す。固定していないときの最初のクリックで固定するのはいまのまま |
| 同じく `keyDown`・`keyUp` | 入力欄などを除いたあとのいちばん先で `if (w.game?.key(e.code, true, e)) { e.preventDefault(); return; }` |
| 歩く画面の JSX（3871 行〜） | game があるとき：`MapInventory`・`MapPhone`・`MapVehicles`・乗り物のボタン・飛ぶ／すり抜けのボタン・ルートのボタンを出さない。「走る」「やめる」は残す。いまの十字（`.cb3-cross`）は消して、HUD の十字に任せる |

- 試合中は、時刻・天気の見え方を全員同じにする：`VirtualCampusView` から `lookMode="day"` を渡す（`CampusMap3D` の 503 行。渡すと見え方が固定される）。天気は「なし」にする（`campus3dEnv.js` の `weatherSet`。`CampusMap3D` の中の `weatherRef` をどう触るかは実装時に読んで決める）。
- 「東工大時代」への切りかえ（タイムスリップ）は `VirtualCampusView` ではもともと出ていないことを確かめる。
- 自動ドア・エレベーターは端末ごとに動いている（同期していない）。v1 はそのまま。

---

## 9. 操作

| すること | PC | スマホ |
|---|---|---|
| 動く・見回す | WASD・マウス（いまのまま） | 左のスティック・画面をなぞる（いまのまま） |
| 走る・ジャンプ・しゃがむ | Shift・Space・C（いまのまま） | 「走る」・ジャンプのボタン（しゃがむは v1 なし） |
| 撃つ | 左クリック（押しているあいだ） | 撃つボタン |
| 構える | 右クリック（押しているあいだ） | 構えボタン（押すたびに切りかえ） |
| リロード | R | リロードのボタン（弾倉が空なら自動でも始める） |
| 持ちかえ | 1・2・3、ホイール | 装備の枠をタップ |
| 拾う・入れかえ | F | 「拾う」ボタン（出たときだけ） |
| 回復 | 4〜7 | 回復のアイコンをタップ |
| 地図 | M | ミニマップをタップ |
| 飛び降りる・パラシュートを開く | Space | ジャンプのボタン（文字が「降りる」「開く」に変わる） |
| 急降下 | Shift | 「走る」 |

---

## 10. 物資の置き場所の表

### 10.1 作るもの

- `scripts/gen-campus-royale-spawns.mjs`：`public/map-3d/features.json` と下地の地図から `walkWorld` を Node で作り（作り方は `scripts/test-campus-deck.mjs`・`scripts/test-campus-main-building.mjs` を見る。地面の高さ `groundAt` の用意のしかたもそこにある）、置き場所を選んで `campus-sns/campus3dRoyaleSpawns.js` に書き出す。
- 書き出す形：`export const SPAWNS_VER = <数>; export const SPAWNS = [[x, y, z, flags], …]; export const HUBS = [{ id, name, x, y }, …];`。`x`・`y`・`z` は小数 1 けた。`flags` は 1 屋内、2 拠点、4 屋外の広い所（円の中心の候補）。並びの番号がそのまま物資の id。

### 10.2 点の選び方

1. 屋外：作り込んだ範囲（2.2）に 12 m の升目を置き、升目ごとにずらした 1 点を取る。`floorBelow(x, y, 地面 + 0.6)` があり、`blocked` でなく、建物の屋根の下でない（`coverAt(x, y)` が足より上にない）点だけ残す。
2. 屋内：`type === "floor"` の構造物（228 個）ごとに、床の形（`coords`。`holes` を除く）の中に 6 m の升目で点を取り、`blocked` でなく、足場がその階の床の高さ（±0.3 m）である点を、1 つの階につき 4 点まで残す。
3. **歩いて行ける点だけ残す。** 入口のウッドデッキ (46, 121.5) から、`world.move` を 1 m ずつ 8 方向に使った幅優先の探索で届いた所の集まりを作り、そこから 1.5 m 以内の点だけを残す。エレベーターでしか行けない階の点は落ちてよい。探索が重すぎる場合は升目を 1.5 m にする。それでも無理なら、屋内の点を「その階の床に階段（`type === "stairs"` か階の `stairs`）がつながっている階だけ」に絞る方法に切りかえ、その旨を報告する。
4. 点どうしは 5 m 以上あける。合計 300〜400 点になるよう升目の大きさを調整する。

### 10.3 拠点

拠点は `HUBS` に入れ、その 40 m 以内の点に「拠点」の印（flags 2）をつける。名前と場所は、`features.json` の構造物の id の頭の文字（下の表）から、その建物群の重心を取って決める。表の座標は 2026-11-25 に測った目安。

| 拠点 | 目安の位置 (x, y) | id の頭（分かっているもの） |
|---|---|---|
| 本館 | (25, −20) | `hon-` ほか |
| ウッドデッキ・70周年記念講堂 | (46, 121) | `deck-`, `k70-` |
| Taki Plaza | (100, 155) | `taki-` |
| 百年記念館 | (124, 223) | 名前に「百年記念館」 |
| 大岡山駅前 | (190, 270) | `ok-`, `mc-`, `ts-` |
| 西8号館 | (−95, 14) | `w8e-`, `w8w-`, `w8-` |
| 西講義棟・西2・西3号館 | (−90, −25) | `wl1-`, `wl2-` |
| 西5・西9号館 | (−70, 130) | 名前に「西5号館」「西9号館」 |
| 南2・南4号館 | (68, −180) | `s4-`、名前に「南2号館」 |
| 石川台 | (90, −420) | `i1-`, `i2-`, `i5-`, `i6-` |
| グラウンド | 測ること | `gr-` |
| 屋内運動場 | 測ること | `gst-`、名前に「屋内運動場」 |

### 10.4 地図が変わったとき

`features.json` はよく変わる。`scripts/test-campus-royale-spawns.mjs` で「表のすべての点が、いまの `features.json` でも `blocked` でなく足場がある」ことを見る。落ちたら生成スクリプトを回し直し、`SPAWNS_VER` を上げる（`RULES_VER` に含める）。

---

## 11. 重さと無料枠

### 11.1 描画

- 毎フレーム GPU に送ってよいのは、`near`・`fx`・`self`・縮んでいるあいだの `zone` と、ほかの人の体（いまもそう）だけ。物資（`loot`）は変わったときだけ送る。
- `Mesh` のインスタンスの `pos`・`nrm`・`col` を直接読んだり push したりしない（中は型つき配列で、取り出すのは `result()`）。新しい形は `Part` → `Out`／`emit` の流れで作る。
- React の描き直しは、状態が変わったときだけ。フレームごとの数字は DOM に直接書く。
- 確かめ方：`walkTick` 1 回の時間を、ゲームあり・なしで比べる（24 人ぶんのにせの人を置いて）。ゲームのぶんが 1 フレーム 2 ms を超えないこと（PC の Chrome）。

### 11.2 Cloudflare の無料プラン

- 受けるメッセージ：1 人 1 試合でおよそ 5,000 個（位置 1 秒 8 回 × 8 分＋撃つ・拾う）＝ 250 リクエストぶん。1 日 10 万リクエストなら、のべ 400 人・試合ほど（「みんなと歩く」と共有）。
- 動いている時間：試合中は部屋が眠らない。1 試合（8 分）でおよそ 60 GB 秒、1 日の枠 13,000 GB 秒でおよそ 200 試合。
- ロビーではアラームを止め、位置を送る回数を下げて、部屋が眠れるようにする。
- この見積もりは計算だけ。公開したあとに Cloudflare の画面で実際の数を見ること（実装の範囲外）。

---

## 12. テスト

このリポジトリのテストは `node scripts/test-campus-*.mjs`（`ok`／`FAIL` を数えて、失敗があれば終了コード 1）。同じ書き方で足す。

| ファイル | 見ること |
|---|---|
| `scripts/test-campus-royale-rules.mjs` | 同じシードなら同じ結果。円は必ず前の円の中。最後の半径は 0。飛行機の線がはじめの円を通る。ダメージの距離の倍率（満額・途中・最小）。物資の割合が重みどおり（1 万回） |
| `scripts/test-campus-royale-match.mjs` | にせの参加者で試合 1 本：準備OK → 秒読み → 開始 → 飛び降り → 拾う（2 人が同じ物を拾うと 1 人だけ）→ 撃つ（弾がないと通らない・速すぎると通らない・遠すぎる当たりは通らない）→ ダメージはシールドから → アウトで箱が落ちる → 円の外で動かない人が減っていく → 最後の 1 人で `end` → `lobby`。切断はアウト。途中で入った人は観戦。準備OKを押していない人は参加しない |
| `scripts/test-campus-royale-link.mjs` | にせの WebSocket（`test-campus-peers.mjs` と同じ作り）：送信の間引き、補間、時計合わせ、アウトの人が `peers()` から消える |
| `scripts/test-campus-royale-drop.mjs` | 本物の `walkWorld` で `stepDrop`：屋上に着地する・地面に着地する・壁の中に入らない・60 m で自動で開く・急降下と粘りで着地までの時間が 3.4 の目安どおり |
| `scripts/test-campus-royale-shot.mjs` | 視線と体・頭の当たり。壁の向こうの人には当たらない（本物の `walkWorld` で、本館の壁をはさんで） |
| `scripts/test-campus-royale-spawns.mjs` | 10.4 |
| `scripts/test-campus-people.mjs`（いまあるもの） | `peopleMeshes` を広げたあとも通る。`hold`・`st` 8・9 の確認を足す |
| `cf-walk-rooms/test/royale.test.mjs` | `npx wrangler dev --local --port 8799` に 3 接続：入る・準備・開始・位置が配られる・撃ってアウト・結果。いまの `relay.test.mjs` も通る（`WalkRoom` がこわれていない） |

ブラウザでの確かめ（各段階の終わりに）：

- 開発サーバーは `next dev` を 1 つだけ。画面は `/#vcampus`。
- 2 つのブラウザ（Puppeteer でよい）を `wrangler dev` の部屋につなぎ、試合 1 本を最後まで通す。スクリーンショットを残す。
- スマホの大きさ（390 × 844、タッチあり）で、回して描かれた画面の HUD とボタンの位置を見る。横長（844 × 390）でも見る。
- 既存のテスト `scripts/test-campus-*.mjs` が、自分の変更の前後で同じ結果であること（もともと落ちているものは、落ちたままでよい。前後を比べて報告する）。

---

## 13. 作る順番と、終わりの条件

各段階の終わりで止まり、やったこと・確かめた結果（テストの出力）・残った問題を報告する。次へ進むのは報告のあと。

### 段階 1：ルールと状態機械（画面なし）

- `campus3dRoyaleRules.js`・`campus3dRoyaleMatch.js`・置き場所の生成スクリプトと表。
- 終わりの条件：`test-campus-royale-rules`・`-match`・`-spawns` が全部 ok。置き場所の数と、拠点ごとの数を報告。

### 段階 2：ひとりで試合が回る（練習）

- game フック（8 章）、`vcGames.js`、`campus3dRoyale.js`、`campus3dRoyaleMesh.js`、`MapRoyale.jsx`（最低限：体力・装備・ミニマップ・十字）、練習用の通信路。
- 終わりの条件：ブラウザで「練習」を選ぶ → 飛行機 → 降下 → 着地 → 拾う → 的を撃ってアウトにする → 円が縮む → 結果、が PC とスマホの大きさで通る。`props.game` を渡さない画面（`/#navi` の 3D と、「みんなと歩く」）が前と同じに動く。`-drop`・`-shot`・`-people` が ok。

### 段階 3：みんなで試合

- `RoyaleRoom`、`campus3dRoyaleLink.js`、ロビー、観戦、結果。
- 終わりの条件：`cf-walk-rooms/test/royale.test.mjs` と `relay.test.mjs` が ok。2 つのブラウザで試合 1 本が通り、勝ち負けが両方の画面で合っている。

### 段階 4：仕上げ

- 効果音、スマホのボタンの押しやすさ、文言（`ja`・`en`）、合言葉の部屋、`#vcampus/royale`。
- 終わりの条件：11.1 の重さの数字、スマホの大きさのスクリーンショット一式。

### 公開（実装の範囲外。ユーザーが指示したときだけ）

`npx wrangler deploy`（`cf-walk-rooms`）→ アプリを `main` へ。先に部屋サーバー、あとでアプリの順。

---

## 14. まだ決まっていないこと（ユーザーに確かめる）

実装は下の「仮の決め」で進めてよい。変えやすいように、どれも 1 か所で決まる作りにしておく。

| こと | 仮の決め |
|---|---|
| ゲームの名前 | 「キャンパスロワイヤル」 |
| 装備の見た目 | おもちゃのブラスター・血なし・「アウト」（3.1）。写実的な銃にしたい場合は装備の表と形だけ差しかえる |
| 1 部屋の人数 | 24 人まで |
| ログイン | なしでも遊べる（名前は「ゲスト」）。いまのバーチャルキャンパスと同じ |
| 成績の保存 | 端末の中だけ（`localStorage` に勝ち数・撃破数）。サーバーには保存しない |
| 落下ダメージ | なし |
| ストアの年齢区分 | シューティングの要素が入るので、公開の前に App Store／Google Play の申告（暴力表現の項目）を見直す必要がある。実装の範囲外だが、公開の前に必ず伝える |

---

## 15. この PC・このリポジトリの落とし穴

- リポジトリのパスに日本語が入っている（`…\作成したもの\isct`）。Node 24 の `fs.rmSync` はこのパスで何もせずに終わることがある → `unlinkSync`／`rmdirSync` を使う。
- Git Bash で `/dev/null` をコマンドの**引数**に渡さない（`nul` という本物のファイルができて、ほかのセッションの道具がこわれる）。捨てたい出力は一時ファイルへ。
- 長い heredoc は失敗しやすい。ファイルはエディタの書きこみで作る。
- `next dev` は 1 つだけ動かす。ヘッドレスの Chrome に `--use-angle=swiftshader` をつけない（3D が描けなくなる）。
- `wrangler dev` を止めるときは、ポートを持っている PID を止める（子の `workerd`／`node` が残る）。
- `data/syllabus-cache.json` は動いているアプリが書きかえる。自分の変更に含めない。
- `ALLOWED_ORIGINS` に入っていない Origin（開発サーバーのポートが違うなど）だと、接続は 403 で黙って切れる。`wrangler dev --var ALLOWED_ORIGINS:` で空にするか、自分の Origin を足して試す。

---

## 16. 実装メモ（2026-11-25、段階 1〜4 を実装した時点）

この仕様で実装した。Codex が途中まで作った段階 1 のファイル（試合の進行・テスト 2 本）は、この仕様のルールの名前と合わなかったため置きかえた（元の写しは作業用フォルダにだけ残っている）。

### どこに何があるか

| ファイル | 中身 |
|---|---|
| `campus-sns/campus3dRoyaleRules.js` | 数・計画（`matchPlan`）・円（`zoneAt`）・飛行機・ダメージ |
| `campus-sns/campus3dRoyaleMatch.js` | 試合の状態機械（部屋サーバー・練習・テストで共通） |
| `campus-sns/campus3dRoyaleSpawns.js` | 物資の置き場所 365 点（版 2）と拠点 12（生成物） |
| `campus-sns/campus3dRoyaleLink.js` | 通信（部屋サーバー）と練習用の端末の中の試合 |
| `campus-sns/campus3dRoyale.js` | 端末の進み（降下 `stepDrop`・撃つ `rayTarget`／`wallDist`・拾う・観戦・カメラ・ミニマップ） |
| `campus-sns/campus3dRoyaleMesh.js`・`campus3dRoyaleModels.js` | 物資・円の壁・光の線・パラシュート・ブラスターの形 |
| `campus-sns/campus3dRoyaleAudio.js` | 効果音 |
| `campus-sns/components/MapRoyale.jsx` | 表示（HUD・ロビー・結果・観戦・スマホのボタン） |
| `campus-sns/vcGames.js` | ゲームの一覧 |
| `cf-walk-rooms/src/royale.js` | 部屋サーバーの `RoyaleRoom`（`/royale/<部屋>`） |
| `scripts/gen-campus-royale-spawns.mjs`・`scripts/lib-campus-royale-world.mjs` | 置き場所の生成と、Node で歩く世界を組む部品 |

既存のファイルへの変更：`CampusMap3D.jsx`（8 章の game フックの呼び出しと、ゲーム中に出さない物の条件だけ）、`campus3dVehicleMesh.js`（`peopleMeshes` に `pool`・`hold`・st 8/9、書き出しの部品の export）、`VirtualCampusView.jsx`（ゲームの一覧と切りかえ）、`App.jsx`（`#vcampus/royale`）、`i18n.js`（`roy.*`）、`cf-walk-rooms/src/index.js`・`wrangler.toml`（経路・バインディング・migration v2）。

### 仕様から変えたこと

- `["a", target, slot, heads, k]` の `heads` は「頭に当たった数」（散弾は 8 粒のうちの数）。
- 端末 → 部屋のメッセージは 1 秒 24 個・ためて 48 個まで（位置 8・撃つ 5・当たり 5 を考えて 16 から上げた）。当たりも 0.2 秒ごとにまとめて送る。
- 一部だけ拾われた物資は `["o", id, kind, 残り, x, y, z]` で知らせる（置き場所の番号でも）。
- 空中でアウトになった人の持ち物は `z = null` で落とし、端末がその下のいちばん高い足場に置く（部屋は高さの差を見ない）。
- 部屋が眠って起きたとき、保存したフェーズが `play` なら `["m","abort"]`、`end`・`countdown` なら `["m","lobby"]`（結果の 15 秒のあいだ誰も送らないと眠る）。
- 外れた弾の線は 40 m まで。壁の判定は 0.25 m の升目で 1.5 秒使い回す（撃ち続けたときの重さを 1/4 にした）。
- 飛び降りた直後、60 m 以内の飛行機は描かない（カメラの前をふさぐ）。三人称のカメラは壁があっても 2.5 m より寄せない。
- 開発中だけ `window.__royale` にゲームを出す（ヘッドレスのテスト用）。

### 確かめたこと（2026-11-25）

- Node：rules 11・match 14・link 3・drop 4・shot 4・spawns 3・people 14（既存 9 は変えずに通る）。部屋サーバー（`wrangler dev`）：royale 14・既存の relay 11。
- ブラウザ（ユーザーの `next dev` :3000）：練習を入口 → 飛行機 → 降下 → 着地 → 的を撃ってアウト → 回復 → 地図まで（PC・横向きのスマホ・縦持ちで回して描く画面）。2 つのブラウザを手元の部屋サーバーにつないで、ロビー → 秒読み → 降下 → 素手で相手をアウト → 優勝と結果まで。ページのエラー 0。
- 1 フレームの重さ（PC の Chrome、step＋frame）：飛行機 0.7 ms・降下 0.6 ms・地上 0.5 ms・撃ち続けて平均 0.8 ms（95% 点 2.4 ms）。

### 見た目の作り直し（2026-11-25、ユーザー「まだ安っぽいゲーム感が強い」）

- 一人称の手と装備（`campus3dRoyaleViewmodel.js`）：`cb-royale-vm` 層（いちばん上・深さを消してから描く）。歩く揺れ・視点の遅れ・反動・構え（照準を目の線へ）・リロード（弾倉の抜き差し）・持ちかえ・走ると下げる・回復（飲む）・素手のパンチ・着地の沈み・銃口の光。手元は画角と切り離す（構えても大きくならない。`vmScale`）。手は暗い手袋（肌の手と明るい袖が安っぽく見えたため）、袖は自分の色を暗くした色、袖口に自分の色の光る帯。素手の構えは肘を外に出して前腕が見えるように。
- HUD（`MapRoyale.jsx`）：半透明の暗い面と記号。方位の帯、動くと広がる十字、命中の印、ダメージの数字（相手の頭の上。`cb-royale` 層の行列で画面へ）、撃たれた向きの赤い弧、大きな知らせ（試合開始・撃破・残り人数・縮小・優勝・アウト）、アウトのまとめ、リロード・回復の輪。
- 効果（`campus3dRoyaleMesh.js`）：細い芯とにじみの光の線、当たった火花・壁の火花、アウトの破片と光の柱、着地の砂ぼこり、縞が流れる円の壁、近くの物資の脈打つ輪、輸送機。
- 人の形：近く（30 m 以内）は丸みのある形（`smoothPersonParts`）、試合中は背中にバッグ、練習の的は胸に的の印。遠くは今までの軽い形。練習の的は物資のない点から先に選び、物資の点に立つ的の足もとの物資は練習のはじめに拾われた扱いにする（`matchPlan` の `dummyLoot` → Match が `taken` に入れて `g` を送る）。物資の点に立つと、落ちているブラスターが的の脚を突き抜けて見えたため。本物の置き場所では中心の近くの屋外の点はほとんど物資があるので、ずらす方法では足りなかった。
- 模型（ブラスター・物資・パラシュート・輸送機）と効果音は、別のエージェントが作り直した（`campus3dRoyaleModels.js`・`campus3dRoyaleAudio.js`）。

### まだのこと

- 部屋サーバーの公開（`npx wrangler deploy`）とアプリの `main` への反映。公開までは、本番の画面ではオンラインの部屋につながらず、練習だけ遊べる。
- 本物のスマホでの操作（撃つボタンを押したまま見回す・横向き・縦持ち）。
- PC でマウスを固定できないとき（ドラッグで見回すとき）は撃てない。
- 置き場所は屋外が約 77 m おき。少ないと感じたら `gen-campus-royale-spawns.mjs` の `TARGET` を上げて作り直す（版が上がる）。グラウンドの拠点のまわり 40 m には点がない。
- ストアの年齢区分の見直し（14 章）。
