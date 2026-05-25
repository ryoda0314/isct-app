/**
 * Textbook raw_text splitter / classifier.
 *
 * Input:  raw_text from course_textbooks_raw (already has <br/> → \n)
 * Output: array of { text, kind, reason } where
 *           kind: 'book'       — likely a real book to look up
 *                 'noise'      — "no textbook" / "distributed in class" etc.
 *                 'annotation' — parenthesized note, chapter range, etc.
 *
 * Stage A of the normalization pipeline: prepare clean candidate lines
 * before sending to openBD (ISBN) or Google Books / NDL (name search).
 */

// Whole-line "no textbook" expressions (case-insensitive, leading/trailing punct allowed)
const NOISE_WHOLE = [
  /^(なし|無し|特に\s*なし|特に\s*無し|無|指定\s*なし|指定\s*しない|特に\s*指定\s*しない|特に\s*定めない|未定)\s*[。.．]?\s*$/i,
  /^(none|n\/?a|tbd|tba|handouts?|as\s+necessary)\s*[。.．]?\s*$/i,
  /^online\s+materials?\s*[.．。]?\s*$/i,
  /^to\s+be\s+announced\b/i,                                // 末尾punctuation/句不問
  /^youtube(動画|\s*video)?\s*[.．。]?\s*$/i,
];

// Prefix patterns: if a line starts with these, it's noise regardless of what follows
const NOISE_PREFIX = [
  /^授業中に指示/,
  /^授業で指示/,
  /^授業中に紹介/,
  /^授業で紹介/,
  /^授業中に配布/,
  /^授業で配布/,
  /^授業内で配布/,
  /^授業内で適宜/,
  /^授業に使う資料/,
  /^授業で扱う資料/,
  /^授業時に/,
  /^講義中に(?:配布|指示|紹介)/,
  /^講義で配布/,
  /^講義資料/,                                              // 「講義資料を配布する」「講義資料は…」両対応
  /^配布資料/,                                              // 「配布資料は」「配布資料・…」
  /^配布する/,
  /^毎回の(?:講義|授業)/,                                   // 「毎回の講義で資料を…」
  /^LMS/i,                                                  // 「LMSにアップロード」「LMSにより…」
  /^参考資料/,                                              // 「参考資料は…LMSにアップする」
  /^必要に応じ.{0,20}(?:指定|配布|配付|紹介|指示|使用)/,    // 「必要に応じて/必要に応じ + 配布/配付/メディア教材を使用」
  /^必要がある場合/,                                        // 「必要がある場合は、講義中に紹介します」
  /^講義時に/,                                              // 「講義時に紙で…資料を配布」
  /^説明補足資料/,                                          // 「説明補足資料は…LMSに」
  /^各回の(?:補助|補足|講義|授業)?資料/,                    // 「各回の補助資料は…」
  /^教科書は使用しない/,                                    // 「教科書は使用しない。授業では...」
  /^授業では(?:受講生|教員|スクリプト)/,                    // 「授業では、受講生が作成する...」
  /^英和辞/,                                                // 「英和辞書、もしくは...」
  /^course\s+materials?/i,                                  // 「Course materials and supplementary readings...」
  /^additional\s+(?:reading|materials?)/i,                  // 「Additional reading materials and handouts...」
  /^visual\s+and\s+audio/i,                                 // 「visual and audio materials will be prepared」
  /^handouts?\s+(?:to\s+be|will\s+be)/i,                    // 「handouts to be distributed」
  /^受講生は/,                                              // 「受講生は講義資料をLMSからダウンロード」
  /^講義開始時/,                                            // 「講義開始時に資料を配布」
  /^講義(?:動画|音源|資料)/,                                // 「講義動画や音源はLMSで共有」
  /^授業で使用した資料/,                                    // 「授業で使用した資料は…LMSで公開」
  /^初回の(?:授業|講義).{0,10}(?:教科書|参考書).{0,10}(?:紹介|指示)/, // 「初回の授業で教科書を紹介する」
  /^なし\s*[(（]特に/,                                      // 「なし(特に指定しない)」
  /^ドキュメンタリー/,                                      // 「ドキュメンタリー、アメリカ -食品...」
  /^[（(].{0,4}[)）]\s*$/,                                  // "(上)" 等の単独パーレン
  /^授業では/,                                              // 「授業では受講生が...」
  // ── 高ボリューム未マッチから追加 ──
  /^担当教員(?:の|が)?(?:指定|指示|指導|配布|準備|紹介|決定)/,         // 「担当教員の指定による」「担当教員が配布」
  /^初回(?:の)?(?:授業|講義).{0,10}(?:決|紹介|指示|配布|決定|決まる)/, // 「初回授業で決めます」「初回の授業で紹介する」
  /^メンター教員/,                                                     // 「メンター教員から別途指示」
  /^各(?:教員|講義|授業|回)/,                                          // 「各教員が配布する」「各講義の事前」「各回の…」
  /^講義内で/,                                                         // 「講義内で随時紹介します」
  /^講座(?:の中で|内で|内に)/,                                         // 「講座の中で随時配布、指示をする」
  /^教科書(?:はありません|について|は講義中|は授業中|は次回|は適宜|は別途)/, // 「教科書はありません」「教科書については授業中に説明する」
  /^授業中に(?:推薦|紹介|配布|指示|提示|案内|決定|決|指定)/,           // 「授業中に推薦する」
  /^授業で使う/,                                                       // 「授業で使うスライドと関連資料はウェブで配布」
  /^授業時に/,                                                         // 既存
  /^資料(?:は|を)/,                                                    // 「資料はScience Tokyo LMS」「資料を…配布」
  /^補助資料/,                                                         // 「補助資料講義資料を…」
  /^独自テキスト/,                                                     // 「独自テキストの電子配布を行う」
  /^独自(?:資料|教材)/,                                                // 「独自資料を配布」
  /^Science\s+Tokyo\s+LMS/i,                                            // 「Science Tokyo LMSで…」
  /^LMS\s*(?:で|に|から|を)/i,                                          // 「LMSで配布」
  /^随時/,                                                             // 「随時LMSで配布」「随時紹介」
  /^必要(?:な|に応じて|に応じ).{0,15}(?:資料|配布|指示|紹介|提示|配付)/, // 「必要な講義資料は授業中に配布」
  /^演習問題(?:を|は|について)/,                                       // 「演習問題を配布する」
  /^参考文献/,                                                         // 「参考文献，参考資料は授業で適宜紹介」
  /^テキスト内に/,                                                     // 「テキスト内に参考書・参考文献が示されています」
  /^[一-鿿A-Za-z]{2,15}\s*(?:I{1,3}|II?I?|[1-3])?\s*に準ずる/,        // 「電磁気学IIに準ずる」
  /^ハンドアウト/,                                                     // 「ハンドアウト等を用意する」
  /^また[、,]/,                                                        // 「また、以下に挙げたもの以外にも…」
  /^amazon/i,                                                          // 「amazon.co.jpなどで入手」
  /^https?:\/\//i,                                                     // URL のみの行
  /^P\s*[:：]/i,                                                       // 「P: 教科書中に記載の参考書」(枠付き記号)
  /^N\s*[:：]/i,                                                       // 「N: …」
  // ── 第2弾: 再サンプリングで上位の noise パターン ──
  /^講義の中で/,                                                       // ×57
  /^学生が(?:派遣|協議|決定|選|担当)/,                                  // ×38
  /^授業で(?:指定|配布|紹介|使用|用い)(?:のもの|したもの|するもの)?/, // ×32
  /^Specified\s+by/i,                                                  // ×32
  /^未定[．.。]/,                                                      // ×26
  /^英(?:文|語)(?:表記)?(?:を|に)/,                                    // ×24
  /^受講(?:する|者|生)/,                                               // ×24
  /^派遣先(?:の|で)/,                                                  // ×16
  /^必要に応じて設定/,                                                 // ×16
  /^特にありません/,                                                   // ×12
  /^とくになし/,
  /^目次(?:ページ|の)/,                                                // ×12
  /^Will\s+be\s+(?:announced|offered|distributed|provided|given|determined)/i,
  /^[A-Z]{2,6}\s+https?:\/\//i,                                        // 略称+URL
  /^(?:NPR|BBC|CNN|National\s+Geographic|Scientific\s+American|TIME|Newsweek)\s*$/i,
  /^生命理工学系/,                                                     // ×8
  /^[一-鿿]{2,12}学系\s*が?作成/,                                      // 学院名+「が作成する独自テキスト」
  /^Handouts?\s*[\/／]/i,                                              // 「Handouts/プリント教材」
  /^事前学(?:修|習)/,                                                  // ×8
  /^テキスト(?:は|を)(?:授業|適宜|別途|講義|事前|事後)/,                // ×8
  /^[一-鿿]{2,10}語の?辞書/,                                            // ×8 「ドイツ語の辞書を毎回持参」
  /^(?:独和|英和|和英|仏和|和仏|独英|英独|西和|和西|伊和|露和|中和|和中)\s*辞典/, // 辞書持参指示
  /^主体的(?:な|に)/,
  /^課題(?:書|図書)(?:は|を)/,
  /^検討する資料/,
  /^その他.{0,8}(?:必要に応じて|参考書は|参考書を|講義の中で)/,
  /^進行に応じて/,
  /^作成資料/,
  /^授業に関連する/,
  /^授業(?:中|内)?(?:に|で)?(?:インターネット|ネット)/,
  /^教室で配布/,
  /^授業に(?:は|おいて)/,                                              // 「授業には独和辞典を持参」「授業においてレジュメを配布」
  /^[一-鿿A-Za-z]{2,12}\s+http/,                                       // タイトル+URL（雑誌URL）
  /^As\s+required/i,
  /^Selected\s+(?:articles?|materials?|chapters?)/i,
  /^Reading\s+(?:list|materials?)\s+(?:will|to)/i,
  /^Topic-specific/i,
  /^See\s+(?:syllabus|materials?)/i,
  // ── 第3弾: 残2169サンプルより ──
  /^参考書は(?:指定|配布|別途|授業中|講義中|不要|なし|ない|無|案内|紹介|示)/, // 「参考書は指定しない…」
  /^[一-鿿ァ-ヶー]{2,10}語の?辞書/,                          // 「ドイツ語の辞書を毎回持参」(カナ著者名対応)
  /^担当教員(?:の|が)?(?:指定|指示|指導|配布|準備|紹介|決定|作成)/, // 「担当教員の作成する教材」追加
  /^講義担当者/,                                            // ×7 「講義担当者が適宜指示する」
  /^実験テキスト/,                                          // ×6 「実験テキストは実験時に配布」
  /^プリント(?:教材|資料)/,                                 // ×6 「プリント教材を配布」
  /^TED\s+Talks/i,                                          // ×6 「TED Talks https://」
  /^TED\b/,                                                 // 単独 TED
  /^The\s+Conversation/i,                                   // ×6
  /^Smithsonian/i,                                          // ×6 「Smithsonian Magazine」
  /^BBC(?:\s+News)?/i,                                      // ×6 「BBC News: Science」
  /^Instructions\s+will\s+be/i,                             // ×6 「Instructions will be given」
  /^None\s+required/i,                                      // ×5 「None required」
  /^All\s+(?:materials?|reading|content)/i,                 // ×5 「All materials to be distributed」
  /^授業内に/,                                              // ×5 「授業内に適宜指示する」
  /^クラスによっては?/,                                      // ×5 「クラスによっては担当教員が指定」
  /^Y[Oo]utube/,                                            // ×5 「Youtubeなどの動画」
  /^動画サイト/,
  /^学生と/,                                                // ×5 「学生と相談の上決める」
  /^講義に用いる資料/,                                       // ×5 「講義に用いる資料は、LMSから配布」
  /^定価\s*\d/,                                             // ×6 「定価 2,200円（本体2,000円＋税）」
  /^社会・人間科学/,                                         // ×6 「社会・人間科学演習プロジェクト支援実践計画書」
  /^[A-Z][a-z]{1,15}\s+[A-Za-z\s]{0,30}https?:\/\//i,      // 「Title words https://...」
  /^[一-鿿ァ-ヶー\s]{2,15}\s+https?:\/\//,                  // 日本語タイトル+URL
  /^適宜.{0,10}(配布|指示|紹介|提示)/,
  /^研究室ごとに指示/,
  /^担当教員の指(?:導|示)/,
  /^担当教員が(?:指定|配布|指示)/,
  /^教員(?:が|の)?作成(?:した)?(?:テキスト|資料)/,
  /^教員(?:が|の)指(?:定|示)/,
  /^マニュアル等を配布/,
  /^独和辞典/,        // language-class generic suggestions
  /^辞書/,
  /^授業内で適宜提示/,
  /^その他.{0,5}(?:配布|指示)/,
  /^教科書は(?:指定しない|クラス毎|定めない|決まって|決めない|ない|無い|授業中に|配布|特に|各自|毎回|不要)/,
  /^特に指定しない/,                                        // 単独「特に指定しない」
  /^T2SCHOLA/i,                                             // 「T2SCHOLAにアップロード」
  /^授業は(?:両|各)教科書/,                                // "授業は両教科書に対応..."
  /^その他.{0,3}必要に応じて/,                              // "その他、必要に応じて..."
  /^演習(?:中|内|で).{0,50}(?:配布|紹介|指示)/,             // "演習中に適宜...配布..."
  /^どちらの版も/,                                          // edition annotation
];

// Patterns indicating a real book entry (any match → kind='book')
// NOTE: Japanese publisher patterns use lookahead instead of \b
// because \b is ASCII-only and fails between two non-ASCII chars.
const BOOK_MARKERS = [
  /『[^』]+』/,                            // Japanese single-quoted title
  /「[^」]+」/,                            // Japanese corner-bracket title
  /"[^"]{3,}"/,                            // English double-quoted title (≥3 chars)
  /\bISBN[\s\-:]?[\d\-Xx]{10,17}/i,        // ISBN labeled
  /\b97[89][\d\-]{10,15}\b/,               // bare 13-digit ISBN
  // Japanese publisher suffixes — must be at the end of a word/clause
  /(?:出版社|出版会|出版|書店|書房|書院|同人社?|学会|協会|公社|学術図書|プレス|ブックス)(?=[）)\s,，、。．\.]|$)/,
  // Standalone "社" / "館" — much more common as publisher endings; require clause boundary after
  /[^一-龯a-zA-Z]?(?:社|館|堂|店)(?=[）)\s,，、。．\.]|$)/,
  // English publisher / common academic press names
  /\b(?:publishing|press|publisher|Routledge|Springer|Wiley|Elsevier|McGraw[-\s]?Hill|Pearson|Academic\s+Press|MIT\s+Press|Cambridge\s+University\s+Press|Oxford\s+University\s+Press|Asakura\s+Publishing)\b/i,
];

// Annotation patterns (parenthesized notes, chapter info)
const ANNOTATION_PATTERNS = [
  /^[(（][^)）]*[)）]\s*$/,                // pure parenthesized
  /^\s*[(（][^)）]*[)）]\s*[。．]?\s*$/,    // pure parenthesized with trailing punct
];

// Strip leading bullets / numbering / 前半:/後半: / sequence markers
function stripPrefix(line) {
  return line
    .replace(/^\s*[■●▪・◆◇○●※]\s*/, '')             // bullet
    .replace(/^\s*\d+[.)）、]\s*/, '')                 // "1) " "1. " "1、"
    .replace(/^\s*[(（]\d+[)）]\s*/, '')                // "(1) "
    .replace(/^\s*[\[【［]\s*(?:教科書|参考書|推薦書|テキスト|主教材|副教材)\s*[\]】］]\s*/, '') // "[参考書]"
    .replace(/^\s*(?:前半|後半|前期|後期)[:：]\s*/, '') // "前半："
    .replace(/^\s*第\s*[\d０-９]+\s*[～〜~\-]\s*[\d０-９]+\s*(?:章|回)[:：\s]\s*/, '') // "第1～5回："
    .replace(/^\s*(?:第\s*\d+\s*章|第\s*\d+\s*回)[:：\s]\s*/, '') // "第1章: "
    .trim();
}

function classifyLine(line) {
  const stripped = stripPrefix(line);
  if (!stripped) return { text: line, kind: 'noise', reason: 'empty after prefix strip' };

  // Noise: whole-line "no textbook" expressions
  for (const re of NOISE_WHOLE) {
    if (re.test(stripped)) return { text: line, kind: 'noise', reason: '無し系の表現' };
  }
  // Noise: prefix patterns
  for (const re of NOISE_PREFIX) {
    if (re.test(stripped)) return { text: line, kind: 'noise', reason: '配布資料/教員指定' };
  }

  // Annotation: pure parenthesized
  for (const re of ANNOTATION_PATTERNS) {
    if (re.test(stripped)) return { text: line, kind: 'annotation', reason: '注釈/補足' };
  }

  // Book markers
  for (const re of BOOK_MARKERS) {
    if (re.test(stripped)) return { text: line, kind: 'book', reason: null };
  }

  // Fallback: short Japanese line ending without book markers — treat as annotation
  if (stripped.length < 8) {
    return { text: line, kind: 'annotation', reason: '短すぎる' };
  }

  // No book markers but might still be a real book (e.g. 「理工系学生のための基礎化学 無機化学編，植草他，化学同人」)
  // OR could be a fragment/orphan (author list, metadata, etc.). Use isFragment to distinguish.
  // If looks like a fragment WITHOUT any book marker → annotation (will be deleted by recleanup or kept as low priority)
  if (isFragmentLike(stripped)) {
    return { text: line, kind: 'annotation', reason: 'フラグメント様' };
  }

  // Default: treat as book candidate (low-confidence)
  return { text: line, kind: 'book', reason: 'マーカーなし(要確認)' };
}

/**
 * Detect lines that look like fragments even standalone (no parent book context).
 * Used to convert orphan fragment lines into 'annotation' instead of 'book'.
 * More aggressive than isFragment (which is used for backward-merge with parent book).
 */
function isFragmentLike(text) {
  if (!text) return false;
  // Pure kana author list with commas: "エウヘニオ・デル・プラド、齋藤華子、仲道慎治"
  if (/^[ァ-ヶー・]{3,30}([、,]\s*[一-鿿ァ-ヶー\s]{2,20}){1,5}\s*$/.test(text)) return true;
  // Year + publisher + ISBN line: "2019年、朝日出版社 ISBN: 978-..."
  if (/^\d{4}年[、,]?\s*[一-鿿]+(?:社|館|堂|店|出版|プレス)\s*(?:ISBN|isbn)/i.test(text)) return true;
  // Publisher + ISBN only (no title): "朝日出版社 ISBN: 978-..."
  if (/^[一-鿿]{2,15}(?:社|館|堂|店|出版|プレス)\s+ISBN/i.test(text)) return true;
  // Author + role only: "安藤幸治 著・辻井宗明 監修"
  if (/^[一-鿿\s]{2,15}\s*著\s*[・,、]\s*[一-鿿\s]{2,15}\s*(?:監修|編集|編|訳)\s*$/.test(text)) return true;
  // Multiple author list with 共著: "朝倉政典・落合理・北山貴裕・田口雄一郎 共著（培風館）"
  if (/^[一-鿿\s]{2,15}(?:[・]\s*[一-鿿\s]{2,15}){2,}\s+共著/.test(text)) return true;
  // Metadata fragments: "判型・ページ数 B5・96ページ", "ISBN 9784... Student Book"
  if (/^判型/.test(text)) return true;
  if (/^[A-B]\d.{0,3}[・]\d+ページ/.test(text)) return true;
  if (/^ISBN\s+97\d{10,16}\s+Student\s+Book/i.test(text)) return true;
  if (/^税込/.test(text) || /^定価/.test(text)) return true;
  return false;
}

/**
 * Detect "fragment" lines that look like continuation of a previous book entry.
 * Examples that should be merged with the preceding book line:
 *   "(金星堂)ISBN 9784785741447"      — publisher + ISBN only
 *   "Jonathan Lynch / 委文 光太郎 共著"   — author line in English-class textbooks
 *   "成美堂　2,530円（本体2,300円+税）"   — publisher + price
 *   "東京：三修社、2018年。"            — place + publisher + year
 *   "価格 2,750円（本体2,500円+税）"     — price only
 */
function isFragment(text) {
  if (!text) return false;
  // Pure parenthesized publisher + ISBN: "(金星堂)ISBN 9784785741447"
  if (/^[（(][^）)]{2,12}[)）]\s*ISBN/i.test(text)) return true;
  // "Author1 / Author2 共著"
  if (/^[^/]{2,40}\s*\/\s*[^/]{2,40}\s*共著\s*$/.test(text)) return true;
  // "東京：出版社、年。" — place + publisher + year
  if (/^[一-鿿]{2,5}[:：][^、,]+[、,]\s*\d{4}年?[.．。]?\s*$/.test(text)) return true;
  // "X 円（本体Y円+税）" or "価格 2,750円"
  if (/^[^,，。.]*\s\d[\d,]*\s*円(?:\s*[（(].*[)）])?\s*$/.test(text)) return true;
  if (/^価格\s+\d[\d,]*\s*円/.test(text)) return true;
  // ISBN単独行: "ISBN-13: 978-432005716" など、ISBNラベルから始まる短行
  if (/^\s*ISBN[\s\-:]*[\dXx\s\-]{8,24}\s*$/i.test(text)) return true;
  // 出版社単独行: "成美堂" のように publisher word のみ ≤8文字
  if (/^[一-鿿]{2,8}(?:社|館|堂|店|院|房|出版|プレス|ブックス)\s*$/.test(text)) return true;
  // 年+出版社+ISBN: "2019年、朝日出版社 ISBN: 978-4-255-55102-9"
  if (/^\d{4}年[、,]\s*[一-鿿]+\s*(?:ISBN|isbn)/i.test(text)) return true;
  // 出版社+ISBN単独: "朝日出版社 ISBN: 978-4-255-55149-4"
  if (/^[一-鿿]{2,15}\s+ISBN/i.test(text)) return true;
  // カタカナ著者リスト単独: "エウヘニオ・デル・プラド、齋藤華子、仲道慎治"
  if (/^[ァ-ヶー・]{3,30}[、,]\s*[一-鿿ァ-ヶー\s、,]{3,50}$/.test(text) && !/[『』「」"]|出版|書店|書房/.test(text)) return true;
  // 著者+役割行: "安藤幸治 著・辻井宗明 監修"
  if (/^[一-鿿\s]{2,15}\s*著\s*[・,、]\s*[一-鿿\s]{2,15}\s*(?:監修|編集|編|訳)\s*$/.test(text)) return true;
  // 判型・ページ数: "判型・ページ数 B5・96ページ"
  if (/^判型/.test(text) || /^[A-B]\d.{0,3}・\d+ページ/.test(text)) return true;
  // 税込/価格: "税込2,420円"
  if (/^税込/.test(text)) return true;
  return false;
}

/**
 * Split raw_text into classified lines.
 *
 * Pipeline:
 *   1. Split by newlines (already converted from <br/>)
 *   2. Further split each line by `;` / `；` (multi-book lines)
 *   3. Classify each segment
 *   4. Merge fragment lines back into the preceding book line
 *
 * @param {string} rawText
 * @returns {Array<{text: string, kind: 'book'|'noise'|'annotation', reason: string|null}>}
 */
export function splitTextbookLines(rawText) {
  if (!rawText) return [];
  // Phase 1: newline split
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Phase 2: further split each line by `;` / `；` if it contains multiple
  // book-like segments (avoid splitting English subtitles that contain `;`)
  const segments = [];
  for (const l of lines) {
    const parts = l.split(/\s*[；;]\s*/);
    if (parts.length > 1) {
      // Only treat as multi-book if at least 2 segments look book-like
      // (have quoted title or ISBN or publisher word)
      const bookLike = parts.filter(p =>
        /『[^』]+』|「[^」]+」|"[^"]{3,}"|ISBN|出版|書店|書房|書院|社\b|学会/.test(p)
      );
      if (bookLike.length >= 2) {
        for (const p of parts) {
          const t = p.trim();
          if (t) segments.push(t);
        }
        continue;
      }
    }
    segments.push(l);
  }
  // Phase 3: classify
  const classified = segments.map(classifyLine);
  // Phase 4: merge fragments backward
  for (let i = 1; i < classified.length; i++) {
    const cur = classified[i];
    const prev = classified[i - 1];
    if (prev.kind === 'book' && cur.kind === 'book' && isFragment(cur.text)) {
      prev.text = prev.text + ' ' + cur.text;
      classified.splice(i, 1);
      i--;
    }
  }
  return classified;
}

/**
 * Convenience: summarize the split for a single raw_text entry.
 */
export function summarizeSplit(rawText) {
  const lines = splitTextbookLines(rawText);
  const counts = { book: 0, noise: 0, annotation: 0 };
  for (const l of lines) counts[l.kind]++;
  return { lines, counts };
}
