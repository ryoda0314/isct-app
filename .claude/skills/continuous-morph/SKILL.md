---
name: continuous-morph
description: Implement a gesture-driven continuous morph animation in React (swipe-to-minimize, drag-to-collapse, expand/contract). One element interpolates position/size/radius/opacity by a single progress value so the "end state" (e.g. a small pill/circle) is the SAME element at progress=1 — no separate element, no discrete jump. Use when the user wants a swipe/drag to smoothly transform a UI element into a minimized/different shape, or complains an animation "jumps"/"is discrete"/"drifts to center".
---

# continuous-morph — 指の動きに連動した連続変形

ある UI 要素を、スワイプ/ドラッグの進捗に合わせて**別の形（最小化ピル・円・小型表示など）へ連続的に変形**させるためのパターン。

正典例: [campus-sns/components/MiniPlayer.jsx](campus-sns/components/MiniPlayer.jsx)
（ミニプレイヤーを左右スワイプ → 端の丸いピルへ連続変形 → タップで復帰）

## 核心となる考え方

「変形前」と「変形後」を**別々の要素として出し分けない**。これが連続性を壊す最大の原因（離散的なジャンプ＝高さ・角丸・位置が一瞬で切り替わる）。

代わりに：

1. **進捗値 `p`（0→1）を一つ持つ**。`p=0` が通常状態、`p=1` が最小化（または変形後）状態。
2. **同じ 1 要素**の `left`/`width`/`height`/`borderRadius`/`opacity` を全部 `p` で補間する。
3. 最小化状態は「別の要素」ではなく「`p=1` に固定された同じ要素」として扱う。

```js
const p = minimized ? 1 : swipeP;   // swipeP はドラッグ中の進捗 0..1
```

これで「離れた丸い要素に切り替わる」不連続が原理的に消える。リリース時は `p` が
`swipeP → 1`（または `→ 0`）へ **CSS transition で滑らかに遷移**するだけ。

## 実装レシピ

### 1. state とドラッグ進捗

```js
const [minimized, setMinimized] = useState(false);
const [minSide, setMinSide] = useState("right");  // 寄せる端を記憶
const [dragX, setDragX] = useState(0);
const [dragging, setDragging] = useState(false);
const startXRef = useRef(0), startYRef = useRef(0);
const movedRef = useRef(false);   // スワイプ判定。タップ系 onClick の誤発火防止
const SWIPE_THRESHOLD = 80;

// ドラッグ量を 0..1 の進捗へ正規化（180px で最小形に到達）
const swipeP = Math.min(1, Math.abs(dragX) / 180);
const p = minimized ? 1 : swipeP;
```

### 2. ポインタハンドラ（横スワイプ検出・指追従）

```js
const onPointerDown = (e) => {
  startXRef.current = e.clientX; startYRef.current = e.clientY;
  movedRef.current = false; setDragging(true);
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
};
const onPointerMove = (e) => {
  if (!dragging) return;
  const dx = e.clientX - startXRef.current, dy = e.clientY - startYRef.current;
  if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) movedRef.current = true; // 横優位のみ
  if (movedRef.current) setDragX(dx);
};
const endDrag = () => {
  if (!dragging) return;
  setDragging(false);
  if (Math.abs(dragX) > SWIPE_THRESHOLD) { setMinSide(dragX < 0 ? "left" : "right"); setMinimized(true); }
  setDragX(0);
  setTimeout(() => { movedRef.current = false; }, 0);  // onClick ガードが読んだ後にリセット
};
```

### 3. 「中央に寄らない」位置補間 ★よくある不満

`left:50% + translateX(-50%)` のまま `width` だけ縮めると、要素は**自分の中心の周りに対称に縮む**＝中央へ寄って見える。
→ **中心位置そのものを端へ向かって動かす**：

```js
const side = minimized ? minSide : (dragX < 0 ? "left" : "right");
// 中央(50%) → 寄せる端(端から 24+8=32px) へ中心を連続移動
const leftCSS = side === "left"
  ? `calc(${(50*(1-p)).toFixed(2)}% + ${(32*p).toFixed(1)}px)`
  : `calc(${(50*(1-p)+100*p).toFixed(2)}% - ${(32*p).toFixed(1)}px)`;
```

### 4. サイズ・角丸の連続補間（CSS calc で px とレスポンシブ幅を混ぜる）

```js
width:  `calc(min(960px, 100% - 16px) * ${(1-p).toFixed(3)} + ${(48*p).toFixed(1)}px)`, // full → 48px
height: `${(62*(1-p) + 48*p).toFixed(1)}px`,   // 通常高 → 48px
borderRadius: 16 + p*8,                         // 16 → 24（48×48＋r24 でほぼ円）
```

`calc(<length> * <number>)` は OK（長さ×無次元）。`<length> * <length>` は不可。`min()` は calc 内に直書きできる。

### 5. transition は「ドラッグ中は切る／離したら効かせる」

```js
transition: dragging ? "none"
  : "left .28s ease, width .28s ease, height .28s ease, border-radius .28s ease, opacity .28s ease",
```

- ドラッグ中 `none` → 指にピタッと追従（遅延ゼロ）
- 離した瞬間だけ transition が効く → `p` が 0 or 1 へ滑らかに収束（リリースの連続性）
- タップ復帰（`minimized:false`）も `p:1→0` で同じ transition により連続的に戻る

### 6. 中身のクロスフェード（変形後の見た目へ）

通常内容を `p` でフェードアウトし、変形後の見た目（カバー画像/アイコン）を絶対配置でフェードイン：

```js
const contentOpacity = Math.max(0, 1 - p*2);       // p>=0.5 で内容消滅
const coverOpacity   = Math.max(0, (p-0.5)/0.5);   // p>=0.5 から出現
```
```jsx
<div style={{ opacity: contentOpacity, pointerEvents: p > 0.5 ? "none" : undefined }}>…通常内容…</div>
{p > 0 && <div style={{ position:"absolute", inset:0, opacity: coverOpacity, pointerEvents:"none" }}>…変形後…</div>}
```

### 7. クリックとスワイプの両立

- スワイプ後に子ボタンの onClick が誤発火しないよう、**各 onClick を `if (!movedRef.current) …` でガード**。
- 最小化中は要素全体の `onClick` で復帰：`onClick={minimized ? () => { if (!movedRef.current) setMinimized(false); } : undefined}`。
- 縦スクロールを潰さないよう要素に `touchAction: "pan-y"`。

## チューニングつまみ

| 効かせたい挙動 | いじる場所 |
|---|---|
| 縮みきるまでの距離（速い/遅い） | `swipeP` の除数（既定 180） |
| 最小化が確定する閾値 | `SWIPE_THRESHOLD`（既定 80） |
| 最小形のサイズ | `width`/`height` の `48`、`leftCSS` の `32`(=幅/2+余白) |
| 円の丸さ | `borderRadius` の係数（最小形が正方形なら 1辺/2 で真円） |
| 内容と変形後の切替点 | `contentOpacity`/`coverOpacity` の `0.5` |
| アニメ速度 | transition の `.28s` |

## 落とし穴（やりがちな失敗）

- **変形前後を別要素で出し分ける** → 高さ/角丸/位置がジャンプ＝「離散的」。必ず 1 要素 ＋ `p` に統一する。
- **`width` だけ縮める** → 中央に寄って見える。`left`(中心位置)も端へ動かす。
- **ドラッグ中も transition を効かせる** → 指の動きが遅れてヌルつく。ドラッグ中は `none`。
- **`movedRef` ガード忘れ** → スワイプの終わりにボタンが暴発（再生/展開してしまう）。
- **`calc()` で length×length** → 無効。length×number にする。
- **`box-sizing` を考慮しない高さ** → border 込みでクリップ。アプリは `*{box-sizing:border-box}` なので height は border 込みで指定（例 62px）。

## 適用の判断

このスキルを使うのは「スワイプ/ドラッグで A の形 → B の形へなめらかに変形」させたいとき。
ユーザーが「離散的」「ジャンプする」「中央に寄る」「連続的に」と言ったら、上の §3〜§5 が原因と対策。
単なる開閉トグル（瞬時 or 単純フェードでよい）なら、ここまでの progress 補間は不要。
