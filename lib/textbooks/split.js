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

  // Default: treat as book candidate (low-confidence)
  return { text: line, kind: 'book', reason: 'マーカーなし(要確認)' };
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
