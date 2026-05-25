# 教科書管理DB — 設計と現状

科学大シラバスからの教科書情報スクレイピング → 正規化 → 書籍正本DB化のパイプライン。
最終ゴールは「バーコード読取で得たデータと同型に扱える正本DB」。

---

## 全体構成

```
シラバスHTML
   │ Stage A: スクレイプ + 行分割 + ノイズ判定
   ▼
course_textbooks_raw  (生テキスト1行=1冊候補)
   │ Stage B: ISBN抽出 → openBD lookup
   ▼
   │ Stage C: NDL + Google Books 名前検索フォールバック
   ▼
course_books × books   (講義 ↔ 書籍正本の紐付け)
   │ Stage D: 管理者レビュー / 手動ISBN入力
   ▼
   学生UI: 講義詳細 → 教科書表示 (今後実装)
   バーコード読取UI: ISBN → books に直接登録 (今後実装)
```

---

## DB スキーマ

3つのテーブル:

### `course_textbooks_raw` ([supabase/course-textbooks-raw.sql](../supabase/course-textbooks-raw.sql))
シラバスHTML `<p class="c-p">` の生テキスト保存。`<br/>` は改行に変換。
- `course_code`, `syllabus_year`, `faculty`, `kind` (textbook/reference), `raw_text`, `source_url`
- UNIQUE: `(course_code, syllabus_year, faculty, kind)` — 再スクレイプで上書き

### `books` ([supabase/books.sql](../supabase/books.sql))
書誌正本。ISBN13がプライマリキー的役割。シラバス由来/バーコード由来/手動入力 を `source` カラムで区別。
- `isbn13`, `isbn10`, `title`, `author`, `publisher`, `published_year`, `cover_url`
- `source` ∈ {`openbd`, `google_books`, `ndl`, `barcode`, `manual`}
- `source_data` (jsonb) — 元APIレスポンス

### `course_books`
講義↔書籍リンク。1行=1冊。レビュー状態を管理。
- `course_code`, `syllabus_year`, `faculty`, `kind`
- `book_id` (nullable, books.id への FK)
- `raw_id` (course_textbooks_raw への FK)
- `raw_line` — 分割後の元テキスト1冊分
- `confidence` ∈ {`high`, `medium`, `low`, `none`}
- `status` ∈ {`pending`, `confirmed`, `rejected`, `not_a_book`}
- `note`

---

## パイプライン詳細

### Stage A: スクレイプ + 行分割

**実装**: [lib/textbooks/split.js](../lib/textbooks/split.js), [lib/api/syllabus-bulk.js](../lib/api/syllabus-bulk.js)

- `<h3 class="c-h3">教科書|参考書、講義資料等</h3>` 直後の `<p class="c-p">` から本文抽出
- 改行 `<br/>` を `\n` に、複数冊が `；` 区切りなら分割
- 各行を `book` / `noise` / `annotation` に分類
- フラグメント結合 (前行が book で current line が "出版社のみ" 等の場合、前行にマージ)

主な noise パターン (累計100種類超):
- 「特になし」「指定しない」等の whole-line 表現
- 「授業中に配布」「LMSにアップロード」等の prefix
- カナ著者リスト単独、年+出版社+ISBN フラグメント

### Stage B: ISBN正本化

**実装**: [lib/textbooks/isbn.js](../lib/textbooks/isbn.js), [lib/textbooks/openbd.js](../lib/textbooks/openbd.js), [lib/textbooks/normalize.js](../lib/textbooks/normalize.js)

- raw_line から ISBN-10/13 を正規表現で抽出 (チェックサム検証付き)
- 抽出した ISBN を openBD で一括 lookup (バッチ100件)
- HIT → `books` に upsert (source='openbd') → `course_books` に confidence='high' で紐付け
- MISS → confidence='low' で book_id=null

### Stage C: 名前検索フォールバック

**実装**: [lib/textbooks/clean-query.js](../lib/textbooks/clean-query.js), [lib/textbooks/ndl.js](../lib/textbooks/ndl.js), [lib/textbooks/googlebooks.js](../lib/textbooks/googlebooks.js), [lib/textbooks/enrich.js](../lib/textbooks/enrich.js)

- `buildQuery()` で raw_line をクリーン (ISBN/章番号/価格/URL除去)
- `extractTitle()` で『…』「…」 "..." パターン抽出 + 「著者：タイトル」 / カナ著者+書名連結 / 「タイトル 第N版」 等の特殊パターン対応
- `searchableTitle()` で版次・巻号を除去 (`第N版`, `(上)(下)`, `[三訂版]` 等)
- 検索順:
  1. NDL `title=` (searchableTitle)
  2. NDL `any=` (クエリ先頭40文字)
  3. Google Books (full query + intitle:)
  4. Google Books (title-only)
- 類似度: bigram Jaccard + 部分一致ボーナス
  - ≥0.75 → confidence='medium'
  - ≥0.45 → confidence='low'

### Stage D: 管理者レビューUI

**実装**: [app/api/admin/route.js](../app/api/admin/route.js), [campus-sns/views/AdminView.jsx](../campus-sns/views/AdminView.jsx)

`/admin → 時間割取得` タブの末尾に2セクション:

1. **教科書一覧** (`course_textbooks_raw`)
   - 年度/学院/種別/コード本文 でフィルタ
   - 分割プレビュー表示 (book/noise/annotation バッジ付き)
   - 「教科書を取得」ボタン (Stage A 実行)

2. **正規化済み書籍** (`course_books × books`)
   - 年度/学院/信頼度/レビュー状態 でフィルタ
   - 「未マッチのみ」チェックで orphan 確認
   - 各行に4ボタン:
     - `✓ 確定` — マッチ正しい
     - `✗ 違う` — マッチ間違い (status=rejected)
     - `⊘ 本でない` — そもそも本ではない
     - `🔍 ISBN` — 手動でISBN入力 → openBD/GBooks lookup → 自動紐付け
   - `B: 正規化` ボタン (Stage B 実行)
   - `C: 名前検索で補完` ボタン (Stage C 実行) — ライブ進捗バー付き
   - `再ノイズ除去` ボタン — splitter 改善後の再分類

---

## 現状 (2026年度データ)

```
スクレイプ結果         : 8,312 raw_text 行
   ↓ Stage A noise除去 (累計 -2,046件)
                       : 5,047 候補行
   ↓ Stage B (openBD ISBN)
   ↓ Stage C (NDL + Google Books)
   ↓ DB直アクション (noise追加削除 -526件, 非書籍 -230件)
   ↓ Opus 4.7 知識ベース ISBN 推定 + openBD/NDL検証
                       : 3,115 行 (最終)

紐付け状況:
  高 (openBD/手動)     :   721 件
  中 (NDL/GB ≥0.75)    : 1,708 件
  低 (NDL/GB ≥0.45)    :   401 件
  未マッチ              :   285 件
                          ─────
            総マッチ     : 2,830 件 (90.0%)

books テーブル          : 1,772 冊 (ISBN付き正本)
```

### 学院別 HIT率 サンプル計測 (チューニング途中)

| 学院 | 行数 | HIT率 | 備考 |
|---|---:|---:|---|
| MTH (数学) | 90 | 100% | 「著者：タイトル」形式が定型 |
| LST (生命理工) | 58 | 87.7% | カナ著者抽出強化で大幅改善 |
| MEC (機械) | 51 | 76.5% | 古い洋書多め |
| LAE (英語) | 69 | 42% | Handouts中心、書籍ベースでない |

→ 理工系3学院加重平均 **約88%**、英語系を含む全体 **90.0%**

---

## API エンドポイント

すべて [app/api/admin/route.js](../app/api/admin/route.js):

| Action | メソッド | 用途 |
|---|---|---|
| `scrape_textbooks` | POST | Stage A (年度+学院 単位) |
| `normalize_textbooks` | POST | Stage B |
| `enrich_textbooks` | POST | Stage C |
| `recleanup_course_books` | POST | splitter 改善後の再分類削除 |
| `update_course_book` | POST | Stage D status 変更 |
| `manual_link_isbn` | POST | 手動ISBN入力 |
| `manual_create_book` | POST | 手動書誌作成 |
| `textbooks` | GET | course_textbooks_raw 一覧 (分割プレビュー含む) |
| `books` | GET | course_books×books JOIN 一覧 |
| `normalize_progress` | GET | Stage B 進捗 |
| `enrich_progress` | GET | Stage C 進捗 |

---

## 工程振り返り

| 段階 | matched 増 / 削除 |
|---|---:|
| **削除累計** | |
| recleanup ×3 (splitter改善後の再分類) | -1,290 |
| DB直 noise削除 R1〜R3 | -526 |
| 非書籍 一括削除 | -230 |
| **削除合計** | **-2,046** |
| | |
| **マッチ追加** | |
| Stage B 初回 (openBD HIT) | +325 |
| Stage C 初回 (NDL 1,352 + GB 71) | +1,423 |
| Stage C 2回目 (Google quota復活) | +237 |
| Group A 再ISBN lookup (NDL ISBN直引き) | +221 |
| Group B+C タイトル候補強化 NDL | +127 |
| Group D 洋書 | +41 |
| 最終パス | +66 |
| **Opus 4.7 手動マッピング検証** | **+185** |
| **マッチ合計** | **約2,830件** |

### Opus 4.7 知識ベース ISBN 推定 (Stage D 補完)

未マッチ 496件のうち、私 (Opus 4.7) が直接書誌情報から ISBN を推定:
- 提供したマッピング: 172件
- openBD/NDL で実在検証成功: 129件 (75%)
- course_books に紐付け: 185件 (複数講義参照分含む)

検証失敗24件は誤推定 (旧版ISBN、別出版社のもの等) — Stage D で手動修正対象。

---

## 残課題と運用方針

### 未マッチ 285件 (9.1%) の性質

- 私の ISBN 推測が誤って検証で弾かれた本 (24件)
- 認知度の低い書籍・極小出版社・絶版本
- 引用符なし著者-書名連結 (`冨田、宇宙システム入門、東京大学出版`)
- 古い洋書 (1970-1990年代の絶版)
- データタイポで補完不能

→ Stage D の `🔍 ISBN` 手動入力で個別対応する領域。

### 既知の落とし穴

- `normalize` 再実行で **course_books が DELETE→INSERT される**
  - status='confirmed'/'rejected' の人手レビュー結果は保護されるが、book_id+confidence は再構築
  - 対策: `recleanup_course_books` を使うと course_books は保持したまま noise だけ削除可能

- 医歯学系 (`yushima2.tmd.ac.jp`) は公開エンドポイントに教科書欄なし
  - スキーマは `faculty='med'/'den'` を受け入れる準備済み
  - 認証必要ルートが見つかれば対応可能

- Google Books は per-minute quota 制限あり
  - `.env.local` に `GOOGLE_BOOKS_API_KEY` 設定済み (100k/日)
  - 長時間処理だと途中で停止することあり → NDL でフォールバック

### 次フェーズ候補

1. **Stage D 運用開始** — 未マッチ285件を `🔍 ISBN` で手動補完
2. **`✓ 確定` 一括承認UI** — 信頼度=高 721件をまとめて confirmed に
3. **学生UI実装** — 時間割→講義詳細→教科書表示 (1,772冊が利用可能)
4. **バーコード読取UI** — モバイルPWAでISBNスキャン→books追加
5. **医歯学系対応** — 認証ルート検証

---

## 関連ファイル一覧

### コード
- [lib/textbooks/split.js](../lib/textbooks/split.js) — 行分割・noise分類
- [lib/textbooks/isbn.js](../lib/textbooks/isbn.js) — ISBN抽出・検証
- [lib/textbooks/openbd.js](../lib/textbooks/openbd.js) — openBD クライアント
- [lib/textbooks/ndl.js](../lib/textbooks/ndl.js) — NDL Search クライアント
- [lib/textbooks/googlebooks.js](../lib/textbooks/googlebooks.js) — Google Books クライアント + 類似度計算
- [lib/textbooks/clean-query.js](../lib/textbooks/clean-query.js) — クエリ正規化・タイトル抽出
- [lib/textbooks/normalize.js](../lib/textbooks/normalize.js) — Stage B オーケストレータ
- [lib/textbooks/enrich.js](../lib/textbooks/enrich.js) — Stage C オーケストレータ
- [lib/api/syllabus-bulk.js](../lib/api/syllabus-bulk.js) — `fetchDeptTextbooks` (Stage A)

### マイグレーション
- [supabase/course-textbooks-raw.sql](../supabase/course-textbooks-raw.sql)
- [supabase/books.sql](../supabase/books.sql)

### UI
- [campus-sns/views/AdminView.jsx](../campus-sns/views/AdminView.jsx) — `TextbooksViewer` / `BooksViewer` 含む
- [app/api/admin/route.js](../app/api/admin/route.js) — admin API
