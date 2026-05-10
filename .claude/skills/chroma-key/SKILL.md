---
name: chroma-key
description: Remove a chroma-key (typically green) background from one or more images, producing transparent PNG/WebP output. Uses channel-difference scoring + soft thresholds + spill suppression. Use when the user wants to make a background transparent.
---

# chroma-key — 汎用クロマキー除去

緑/青/任意色の単色背景を持つ画像を、透過PNGまたはWebPに変換する。スタンプ・プロフィール画像・素材切り抜き等に汎用的に使える。

## アルゴリズム

3段構成：

### 1. 「対象色らしさ」スコア
- 緑背景: `score = g - max(r, b)`
- 青背景: `score = b - max(r, g)`
- 赤背景: `score = r - max(g, b)`
- 任意色: HSV色相距離 + 彩度の積（実装が複雑なので、まずは上記3色で対応提案）

→ 単純な `g > 100` より頑健。被写体に少し緑/青が含まれていても誤判定しない。

### 2. ハード/ソフト2段階しきい値
```
score >= T_HARD     → alpha = 0（完全透過）
T_SOFT < score < T_HARD → alpha = 線形補間（アンチエイリアス境界）
score <= T_SOFT     → alpha = 255（完全不透過）
```
推奨初期値: `T_HARD=70, T_SOFT=25`（典型的な彩度高い背景）

### 3. スピル抑制
半透明ピクセル（境界）の対象色チャンネルを他チャンネルの最大値にクランプ。
緑背景なら `g = min(g, max(r, b))` を `0 < alpha < 255` の範囲に適用。
→ 髪の毛や服の縁に残る緑被りが消える。

## 実装の流れ

### 必要なライブラリ
プロジェクトに `sharp` が入っていることを確認（Next.js プロジェクトならたいてい transitive で入っている）：
```bash
ls node_modules/sharp
```
無ければ `npm install sharp` を提案。

### スクリプト雛形

```js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function chromaKey({ src, out, color = 'green', tHard = 70, tSoft = 25, resize = null, format = 'webp' }) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    let score, targetIdx;
    if (color === 'green')      { score = g - Math.max(r, b); targetIdx = i + 1; }
    else if (color === 'blue')  { score = b - Math.max(r, g); targetIdx = i + 2; }
    else if (color === 'red')   { score = r - Math.max(g, b); targetIdx = i; }
    else throw new Error(`Unsupported color: ${color}`);

    let alpha;
    if (score >= tHard) alpha = 0;
    else if (score > tSoft) alpha = Math.round(255 - ((score - tSoft) * 255) / (tHard - tSoft));
    else alpha = 255;

    if (alpha < 255 && alpha > 0) {
      // Spill suppression: clamp target channel to next-highest channel
      const others = color === 'green' ? Math.max(r, b)
                   : color === 'blue'  ? Math.max(r, g)
                   :                     Math.max(g, b);
      buf[targetIdx] = Math.min(buf[targetIdx], others);
    }
    buf[i + 3] = alpha;
  }

  let pipeline = sharp(buf, { raw: { width, height, channels } });
  if (resize) pipeline = pipeline.resize(resize, resize, { fit: 'inside' });
  pipeline = format === 'webp' ? pipeline.webp({ quality: 88, effort: 5 })
           : format === 'png'  ? pipeline.png({ compressionLevel: 9 })
           : (() => { throw new Error(`Unsupported format: ${format}`); })();
  await pipeline.toFile(out);
  return fs.statSync(out).size;
}
```

## 引数（ユーザーから集める情報）

スキル起動時にユーザーから以下を確認・推測する：

| 引数 | 既定 | 説明 |
|---|---|---|
| `src` | （必須） | 入力画像パス。ファイル/フォルダ両対応するか確認 |
| `out` | `<src>.webp` 同階層 or 指定ディレクトリ | 出力先 |
| `color` | `green` | 抜く背景色。`green`/`blue`/`red` |
| `tHard` | 70 | これ以上のスコアは完全透過 |
| `tSoft` | 25 | これ以下のスコアは完全不透過 |
| `resize` | なし | 最大辺ピクセル（例: 480）。指定なら縮小 |
| `format` | `webp` | `webp` または `png` |

## 進め方

1. **入力確認**: src のパスとファイル数を `Glob` で確認。複数ファイルなら全部処理するか1つずつか確認
2. **背景色推定**: 1枚目を Read で表示して、「緑/青/赤背景でいいか」確認
3. **しきい値**: まず既定値で実行、結果を Read で確認、ユーザーが緑残り/穴あきを訴えたら調整
4. **スクリプト保存**: 単発なら `/tmp` でも可、再利用するなら `scripts/chroma-<name>.js` に保存提案
5. **実行**: `node` で実行、エラー時はエラー内容を解析して修正
6. **結果**: 出力サイズ・透過プレビュー（Read）を報告

## しきい値チューニングの目安

| 症状 | 対応 |
|---|---|
| 緑がフリンジに残る | `tHard` を 60 まで下げる |
| キャラの色（緑系の服・葉っぱ等）が透明化された | `tHard` を 90 まで上げる、または HSV方式に切り替え提案 |
| エッジがギザギザ | `tSoft` を 10 まで下げて soft 範囲を広げる |
| 全体が薄く透ける | `tSoft` を 35 まで上げる |

## 限界と注意

- **緑/青/赤の単色背景前提**: グラデーション背景・複雑な背景には使えない（提案を断る or 別手段を案内）
- **被写体に対象色が多いと破綻**: 緑髪のキャラに緑除去をかけると髪が抜ける。HSV方式や手動マスク併用を提案
- **JPEG入力は注意**: 圧縮ノイズで境界が荒れる。可能なら入力は元のPNG/可逆形式を使ってもらう
- **影は残りやすい**: 半透明の影が緑背景に落ちている場合、影部分も完全には抜けない（OK と判断するか前処理で除去するか）

## 関連

- このプロジェクトのスタンプ追加用に既に [scripts/process-stamps.js](scripts/process-stamps.js) が存在する。スタンプ追加なら `add-stamp` スキルを使う方が手早い
- 一般用途（プロフィール画像のBG除去等）は本スキル
