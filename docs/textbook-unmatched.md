# 未マッチ書籍一覧 (27件 / ユニーク 23件)

生成日: 2026-05-25 (低confidence監査後)
対象: course_books WHERE book_id IS NULL AND status='pending' AND syllabus_year='2026'

全 3017 件の course_books 状態:
- 高 confidence (high): 938 件 (31.1%)
- 中 confidence (medium): 1839 件 (61.0%)
- 低 confidence (low): 180 件 (6.0%)
- not_a_book: 33 件 (1.1%)
- **未マッチ: 27 件 (0.9%)**

→ **紐付け完了 98.0% / 処理完了 99.1%**

## 残り未マッチの内訳

| カテゴリ | ユニーク | 延べ件数 |
|---|---:|---:|
| 論文・記事 (書籍でない) | 11 | 11 |
| 複数候補リスト (どれか1冊を選ぶ形式) | 1 | 2 |
| ISBN無効/公開DB欠落 | 4 | 8 |
| 旧書/特殊出版物 (ISBN未公開) | 7 | 6 |

## 詳細

### 論文・記事 (書籍でない)
- Claude Amsler, The Quark Structure of Hadrons (講義ノート)
- Richard C. Aster, Brian Borchers, Clifford H. Thurber (incomplete citation)
- Avner Friedman, Shoshana Kamin (1980) gas porous medium paper
- Yoshikazu Giga, Robert V. Kohn (1987) blowup paper
- James G. March (1991) Exploration and Exploitation paper
- Cinzia Battistella et al (author list only)
- Ansari, S., Garud, R., Kumaraswamy (2016) strategic management paper
- T.Takeuchi, A.Wada: Buckling-Restrained Braces JSSI report
- Peleg and Sudhoelter Cooperative Games (book exists but author has 2 different)
- Benninga, S., & Mofkadi (2022) Financial Modeling MIT (no ISBN in book yet)
- Robert E. Blankenship Molecular mechanisms of photosynthesis (book; openBD/NDL miss)

### 複数候補リスト
- 代数学（永尾汎著, 朝倉）、環と加群（山崎圭二郎著, 岩波）、代数学I+II（桂利行著, 東大）、代数学2+3（雪江明彦著, 日評）など (×2)

### ISBN無効/公開DB欠落
- 『Vital Voices (1) People & Cultures on Video Elementary』 (×2)
- 『Vital Voices (2) People & Cultures on Video Intermediate』 (×2)
- National Geographic Learning ISBN 9798214179926 (×2)
- NASA Systems Engineering Handbook (NASA/SP-2007-6105) (×2)

### 旧書/特殊出版物 (ISBN未公開)
- 新実験化学講座 基礎技術３ 光(I),(II) 日本化学会編 1975年 (ISBN以前)
- NPO法人PCM Tokyo『PCMハンドブック計画編』2016 (NPO自費出版)
- 日本建築学会関東支部：免震・制振構造の設計 (支部資料, 内部品番)
- N. Nolan「N-Heterocyclic Carbenes in Synthesis」ISBN 3-527-31400-8 (絶版/ISBN無効化)
- 国広悌二「量子力学」東京図書 2018 (openBD/NDL未収録)
- 赤崎正則『プラズマ工学の基礎』産業図書 (古書, openBD未収録)
- K. Linga Murty Nuclear Materials Wiley-VCH (publisher catalog only)

## 対応

これら 27 件は管理者 UI ([/admin/textbooks](../campus-sns/views/AdminView.jsx)) の「手動登録」または「✗違う」ボタンで個別レビュー可能。
全自動マッチングはこれ以上の改善余地が少ない (ISBN が割り当てられていない・公開 API に無い書誌のみ残存)。
