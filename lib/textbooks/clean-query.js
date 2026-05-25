/**
 * Clean a raw textbook line into a search query string,
 * and try to extract a likely title for higher-precision search.
 *
 * Examples (raw → cleaned):
 *   "■ ランダウ著,『力学』(理論物理学教程)，東京図書"
 *     → query:  "ランダウ著 『力学』(理論物理学教程) 東京図書"
 *     → title:  "力学"
 *
 *   "参考書：　大熊政明著，「新・演習工業力学」（数理工学社）"
 *     → query:  "大熊政明著 「新・演習工業力学」 数理工学社"
 *     → title:  "新・演習工業力学"
 *
 *   "後半：…講談社 ISBN 978-4-06-156543-0"
 *     → ISBN は除去
 */

/** Remove leading bullets / numbering / "前半:" / etc. */
function stripPrefix(line) {
  return line
    .replace(/^\s*[■●▪・◆◇○●※]\s*/, '')
    .replace(/^\s*\d+[.)）、]\s*/, '')
    .replace(/^\s*[(（]\d+[)）]\s*/, '')
    // 角括弧プレフィックス: "[参考書]", "[教科書]" etc.
    .replace(/^\s*[\[【［]\s*(?:教科書|参考書|推薦書|テキスト|主教材|副教材)\s*[\]】］]\s*/, '')
    .replace(/^\s*(?:前半|後半|前期|後期)[:：]\s*/, '')
    .replace(/^\s*(?:教科書|参考書|推薦書|推薦|テキスト)[:：]\s*/, '')
    // 「第N章」「第N回」 + 範囲版「第N〜M章」「第N～M回」
    .replace(/^\s*第\s*[\d０-９]+\s*[～〜~\-]\s*[\d０-９]+\s*(?:章|回)[:：\s]\s*/, '')
    .replace(/^\s*(?:第\s*\d+\s*章|第\s*\d+\s*回)[:：\s]\s*/, '')
    .trim();
}

/** Remove ISBN substrings (labeled and bare). */
function stripIsbns(line) {
  return line
    // "ISBN", "ISBN:", "ISBN-13:", "ISBN-10:" 等のラベル + 10〜24文字の数字/X/ハイフン列
    .replace(/\bISBN(?:[-\s]*(?:13|10))?[\s\-:]*[\dXx][\dXx\s\-‐–—−ー－]{9,22}/gi, ' ')
    // ラベルだけ残っている場合 (数字部分が別途欠落)
    .replace(/\bISBN(?:[-\s]*(?:13|10))?\s*[:：]?\s*[,，]?/gi, ' ')
    .replace(/\b97[89][\d\-]{10,15}\b/g, ' ')
    .replace(/\bC\d{4}\b/g, ' ')  // CCC code "C3043"
    .trim();
}

/** Strip chapter/usage ranges like "（1～7回）" / "(8～15回)" / "16章・22章". */
function stripChapterRanges(line) {
  return line
    .replace(/[（(]\s*\d+\s*[～〜~\-–]\s*\d+\s*回\s*[）)]/g, ' ')
    .replace(/[（(]\s*\d+\s*[～〜~\-–]\s*\d+\s*章\s*[）)]/g, ' ')
    .replace(/\d+\s*章\s*[・,，]\s*\d+\s*章/g, ' ')
    .replace(/\b\d{1,2}章\b/g, ' ')
    .trim();
}

/** Strip price suffixes like "￥2000+tax". */
function stripPrice(line) {
  return line
    .replace(/[¥￥]\s*\d[\d,]*(?:\+\s*tax)?/gi, ' ')
    .replace(/\b\d{3,5}\s*円\b/g, ' ')
    .trim();
}

/** Strip URLs and trailing colon noise like "出版社）：https://..." */
function stripUrls(line) {
  return line
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[：:]\s*$/, ' ')  // 行末の置き場違いの「：」
    .trim();
}

/** Collapse multiple spaces. */
function collapseSpaces(s) {
  return s.replace(/\s+/g, ' ').replace(/\s*([、,，。.：:])\s*/g, '$1 ').trim();
}

/**
 * Normalize smart quotes / mixed quotation marks to straight quotes.
 *   “...”  → "..."
 *   ‘...’  → '...'
 *   ""..."" → "..."   (二重引用)
 */
function normalizeQuotes(s) {
  return s
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/""+/g, '"');  // 連続する " を1つに
}

/**
 * Extract the most likely title from a line.
 * Priority:
 *   1. 『...』 (Japanese book brackets)
 *   2. 「...」 (Japanese corner brackets)
 *   3. "..." (English double quotes — smart quote variants normalized)
 *   4. "著者：タイトル, 出版社, 年" pattern (common in math/science syllabuses)
 */
export function extractTitle(rawLine) {
  if (!rawLine) return null;
  // Strip leading prefix ([参考書] / 番号 / ・ etc.) before quote scan
  const line = normalizeQuotes(stripPrefix(rawLine));
  // Priority: English quotes win when both are present and the English
  // string looks like a primary title (≥6 chars), so e.g.
  //   "Neuroscience –Exploring the brain– Fourth edition" ... 「神経科学－脳の探求－」
  // we want the English original, not the JP gloss.
  const m3 = line.match(/"([^"]{6,})"/);
  if (m3) return m3[1].trim();
  const m1 = line.match(/『([^』]+)』/);
  if (m1) return m1[1].trim();
  const m2 = line.match(/「([^」]+)」/);
  if (m2) return m2[1].trim();
  const m3b = line.match(/"([^"]{3,})"/);
  if (m3b) return m3b[1].trim();
  // Pattern: "著者名(CJK・英字 max ~20字)：タイトル, 出版社, 年" or similar
  // Example: 雪江明彦：代数学1 群論入門, 日本評論社, 2010.
  //          堀田良之：代数入門－環と加群－，裳華房, 1987.
  //          桂利行：代数学I 群と環, 東京大学出版会, 2004.
  // Authors are short (≤20 chars), title is everything between : and first , / ，
  const m4 = line.match(/^[\s（(]*([一-鿿぀-ヿ・\.A-Za-z\s]{2,25})[:：]\s*([^,，、；;]{3,80})(?=[,，、； ;]|$)/);
  if (m4) {
    const title = m4[2].trim();
    if (!/(?:配布|配付|指示|紹介|アップ|します|する$)/.test(title)) {
      return title;
    }
  }
  // Pattern: 行頭がカタカナ著者(3-15文字) + ―/空白 + タイトル
  // Examples:
  //   "ボルトショア―有機化学（上）第８版 化学同人"     → "有機化学"
  //   "アトキンス 生命科学のための物理化学 第3版"     → "生命科学のための物理化学"
  //   "ヴォート 生化学 第４版（上）"                  → "生化学"
  //   "マッカーリ、サイモン、物理化学 第12版"          → "物理化学"
  //   "ボルハルトショア―現代有機化学･問題の解き方 化学同人" → "現代有機化学･問題の解き方"
  // 終端: ( / 第N版 / 年 / カンマ / 全角空白+publisher / 行末
  const m5 = line.match(/^[ァ-ヶー・]{3,15}[、,，]?[ァ-ヶー・\s、,，]{0,20}?[―ー\-‐]?\s*([^（()「」『』"，,、；;]{2,30}?)\s*(?:[（(]|第\s*[\d０-９]+\s*版|[，,、；;]|[\s　]+(?:\d{4}年?|[一-鿿]{2,8}(?:社|館|堂|店|院|房|出版|プレス|ブックス|書店))|$)/);
  if (m5) {
    const title = m5[1].trim()
      .replace(/^(?:著|編|共著|編著)\s*/, '')
      .replace(/[　\s]+$/, '');
    if (title.length >= 2 && !/^[ァ-ヶー・\s、,，]+$/.test(title)) {  // 全部カナだけは著者残骸なので除外
      return title;
    }
  }
  // Pattern: "タイトル 第N版 (...)" — タイトルが版次の前にある
  // Examples:
  //   "細胞の分子生物学 第６版 （Alberts 他、ニュートンプレス）" → "細胞の分子生物学"
  //   "シュライバーアトキンス無機化学 第6版 東京化学同人"          → "シュライバーアトキンス無機化学"
  const m6 = line.match(/^([^（()『「"]{3,30}?)\s+第\s*[\d０-９]+\s*版/);
  if (m6) {
    const title = m6[1].trim();
    if (title.length >= 3) return title;
  }
  return null;
}

/**
 * Strip volume/edition annotations from a title so NDL/Google Books can
 * find broader matches. Keep the original title for similarity scoring.
 *
 *   "解析入門I"           → "解析入門"
 *   "アトキンス物理化学（下）第10版"  → "アトキンス物理化学"
 *   "電磁気学II"          → "電磁気学"
 *   "新・演習工業力学"    → "新・演習工業力学" (untouched)
 */
export function searchableTitle(title) {
  if (!title) return null;
  let t = title;
  // 全角・半角括弧の版次表現
  t = t.replace(/[（(](?:上|中|下|前|後|新装|改訂|新|別)(?:巻|版|装版|訂版)?[）)]\s*/g, '');
  // 角括弧の版次表現: [三訂版] [改訂版] [新装版] 等
  t = t.replace(/[\[【［](?:三訂|改訂|新装|新|初|二訂|四訂|五訂|増補|復刻)(?:版|新装版|訂版)?[\]】］]\s*/g, '');
  t = t.replace(/\s*第\s*[\d０-９]+\s*版\s*/g, '');
  t = t.replace(/\s*[\d０-９]+(?:st|nd|rd|th)?\s*edition\s*/gi, '');
  t = t.replace(/\s*(?:上|下|前|後)巻\s*/g, '');
  // trailing Roman numeral I, II, III, IV, V (但し本文に意味ある場合は誤削除注意)
  t = t.replace(/\s+[IVX]{1,4}\s*$/, '');
  return t.trim();
}

/**
 * Build a cleaned search query from a raw_line.
 *
 * Returns { query, title } where:
 *   query — full cleaned string (good for Google Books `q` param)
 *   title — best-guess title extracted from quotes, or null
 */
export function buildQuery(rawLine) {
  if (!rawLine) return { query: '', title: null };
  let s = rawLine;
  s = stripPrefix(s);
  s = stripIsbns(s);
  s = stripChapterRanges(s);
  s = stripPrice(s);
  s = stripUrls(s);
  s = collapseSpaces(s);
  const title = extractTitle(rawLine);
  return { query: s, title };
}
