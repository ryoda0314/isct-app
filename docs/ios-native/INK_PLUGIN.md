# InkPlugin — ネイティブ PencilKit 手書きキャンバス

GoodNotes 同等の書き心地（120〜240Hz・ゼロ遅延・筆圧/傾き・パームリジェクション）を
実現するため、**描画面だけをネイティブ PencilKit に置き換える**プラグイン。
ライブラリ・保存・背景生成は従来どおり Web（`campus-sns/views/NotesView.jsx`）が担う。

> 背景: 実機の Web ペン入力は約60Hz・`getCoalescedEvents` 無効で点が粗く、速描き時に
> 折れ線になる（Webの限界）。PencilKit はネイティブで高頻度サンプルを取得できる。

## 構成（連続スクロール / PKToolPicker）

```
WKWebView (sciencetokyo.app, 既存UI)
   │  Ink.open({ pages:[{bg,w,h}...], drawing? })
   ▼
InkPlugin (Swift, 全画面オーバーレイ)
   InkCanvasController
     ├─ PKCanvasView (= UIScrollView, ピンチズーム/スクロール)
     │    └─ backgroundContainer (全ページ縦積み, 各ページの背景PNG)
     │    └─ drawing (PKDrawing, ノート全体の手書き)
     ├─ PKToolPicker (ペン/マーカー/消しゴム/なげなわ/定規/色/太さ)
     └─ Done ボタン → 保存データを resolve → dismiss
   │  resolve { drawing: base64(PKDrawing), thumbnails:[ink PNG/ページ] }
   ▼
Web が drawing(再編集用) と PNG(サムネ/エクスポート用) を IndexedDB に保存
```

- **1つの PKCanvasView** をノート全体の高さ（全ページの合計＋ページ間ギャップ）で確保し、
  背景画像を縦に積んで `canvasView.insertSubview(bg, at: 0)`（スクロール連動）。
  手書きは1つの `PKDrawing` に集約。ページ境界は見た目上のギャップのみ。
- ズーム/スクロール/パームリジェクションは PKCanvasView 標準機能。

## JS API（`campus-sns/plugins/inkCanvas.js`）

```js
inkAvailable()  // iPad ネイティブ かつ Ink プラグインが登録済みなら true
openInk({ pages, drawing })  // 全画面エディタを開き、Doneで解決
  // pages: [{ bg: <base64 PNG, プレフィックス無>, w:Number, h:Number }]
  // drawing: <base64 PKDrawing> | undefined（新規は省略）
  // → { drawing: <base64 PKDrawing>, thumbnails: [<base64 PNG ink-only>/ページ] }
```

座標系: PKDrawing はページレイアウト（points）座標。各ページの ink PNG は透明背景
（背景は Web 側が持っているので合成は Web で行う＝サムネ/PDF書き出し）。

## 保存データモデル（Web 側 IndexedDB）

ノート JSON に以下を追加（ネイティブ編集のノート）:
```jsonc
{
  "engine": "pencilkit",      // これがあれば openInk を使う
  "pkDrawing": "<base64>",    // ノート全体の PKDrawing
  "pages": [ { "id", "w", "h", "pdfIndex?" } ],  // 背景定義は従来通り
  // strokes は使わない（engine=pencilkit のとき）
}
```
既存の Web ベクターノート（`strokes`）はそのまま Web レンダラで表示（当面は読み取り/編集は
Web キャンバス）。新規 iPad ノートは `engine:"pencilkit"`。

## 導入手順（Xcode 必須・実機ビルド）

1. `cp docs/ios-native/InkPlugin.swift ios/App/App/InkPlugin.swift`
   （Xcode の PBXGroup `App` に追加。group path に注意＝既存プラグインと同様）
2. `ios/App/App/ViewController.swift` の `capacitorDidLoad()` に登録を追加:
   ```swift
   bridge?.registerPluginInstance(InkPlugin())
   ```
3. `ios/App/App/capacitor.config.json` の `packageClassList` に `"InkPlugin"` を追加
   （他プラグインと同様。Filesystem 等が未登録なのと同じ仕組み）
4. PencilKit は権限不要（Info.plist 変更なし）。最低 iOS 13、PKToolPicker は iOS 14+ 推奨
5. `npx cap sync ios && npx cap open ios` → 実機ビルド

## このリポジトリに含むファイル
- `docs/ios-native/InkPlugin.swift` … プラグイン雛形（本体）
- `campus-sns/plugins/inkCanvas.js` … JS ブリッジ
- `NotesView.jsx` 統合 … **次ステップ**（ネイティブが実機で動いてから配線）

## v1 スコープと TODO
- v1: open で渡したページ群を編集→Doneで保存。**ページ追加はネイティブ右下「＋」で
  空白ページを足す**（背景は白紙）。PDF/テンプレ背景は Web 生成画像を使用。
- TODO（v2）: ネイティブからのページ追加で Web 由来テンプレ背景を取得 / なげなわ移動の
  Web 連携 / 既存 Web ノートの PencilKit 移行（背景画像化）/ ダーク背景対応。

## 制約（重要）
- 描画部分は **Xcode 再ビルドが必要**＝「Web 即時デプロイ」では更新できない。
- 私（AI）は Xcode ビルド/実機検証ができないため、**ビルドと実機確認はあなたの環境**で実施。
- iPad 以外（PC/プレビュー）は従来の Web キャンバスにフォールバック。
