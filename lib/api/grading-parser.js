// 成績評価セクションの生テキストから割合付きの項目を抽出するパーサ。
//
// 入力例:
//   「期末試験により評価する。」                          → has_breakdown=false
//   「期末試験（65%）および演習（35%）で評価する。」      → 2項目, total=100
//   「中間試験40%、期末試験40%、レポート20%」              → 3項目, total=100
//
// 出力:
//   { breakdown: [{label, percent, category}] | null,
//     total_percent: number | null,
//     has_breakdown: boolean }

const CATEGORY_RULES = [
  // 順序重要: 「小テスト」が「試験」より先に来る必要がある
  { cat: 'quiz',         kw: ['小テスト', '小試験', 'クイズ', 'quiz', '小レポート'] },
  { cat: 'exam',         kw: ['期末試験', '中間試験', '定期試験', '中間考査', '期末考査', '中間テスト', '期末テスト', '試験', 'テスト', 'final', 'midterm', 'exam'] },
  { cat: 'report',       kw: ['レポート', '宿題', 'report', '提出物', 'assignment', '課題提出', '小課題'] },
  { cat: 'exercise',     kw: ['演習', '問題演習', '練習問題', 'exercise'] },
  { cat: 'practice',     kw: ['実習', '実験', 'lab', 'practice'] },
  { cat: 'presentation', kw: ['発表', 'プレゼンテーション', 'プレゼン', 'presentation', '口頭発表', '報告会'] },
  { cat: 'attendance',   kw: ['出席', '出席状況', 'attendance'] },
  { cat: 'participation',kw: ['参加', '受講態度', '受講姿勢', '授業態度', '貢献', '取り組み', '活動', 'participation'] },
  { cat: 'project',      kw: ['プロジェクト', '成果物', '作品', 'project'] },
  { cat: 'discussion',   kw: ['討論', 'ディスカッション', '議論', 'discussion'] },
  { cat: 'report',       kw: ['課題'] }, // 「課題」単体は最後にreportへ寄せる
];

export function categorizeLabel(label) {
  if (!label) return 'other';
  const lower = label.toLowerCase();
  for (const r of CATEGORY_RULES) {
    for (const k of r.kw) {
      if (label.includes(k) || lower.includes(k.toLowerCase())) return r.cat;
    }
  }
  return 'other';
}

// %表記が無いテキストから「評価手段が1カテゴリだけ言及されている」場合に
// 100%として推定する。複数カテゴリが見つかった場合は null を返す (rawOnly 維持)。
//
// 注意: 「小テスト」を「試験」より先に判定すること (試験のサブセット)
const SINGLE_INFERENCE_RULES = [
  { cat: 'quiz',         patterns: [/小テスト/, /クイズ/, /小試験/] },
  { cat: 'exam',         patterns: [/期末試験/, /中間試験/, /定期試験/, /中間考査/, /期末考査/, /中間テスト/, /期末テスト/, /(?<!小)試験/, /(?<!小)テスト/] },
  { cat: 'report',       patterns: [/レポート/, /中間報告/, /最終報告/, /宿題/, /提出物/, /(?<!小)課題/, /report/i] },
  { cat: 'exercise',     patterns: [/演習/, /問題演習/] },
  { cat: 'practice',     patterns: [/実習/, /実験/] },
  { cat: 'presentation', patterns: [/口頭発表/, /(?<!口頭)発表/, /プレゼンテーション/, /プレゼン/, /報告会/] },
  { cat: 'attendance',   patterns: [/出席/, /出席状況/] },
  { cat: 'participation',patterns: [/受講態度/, /授業態度/, /取り組み/, /参加状況/, /(?<!授業)参加/] },
  { cat: 'project',      patterns: [/プロジェクト/, /成果物/, /作品/] },
  { cat: 'discussion',   patterns: [/討論/, /ディスカッション/, /議論/] },
];

function inferSingleCategory(norm) {
  // カテゴリごとに最初にヒットしたラベルを記録
  const found = {};
  for (const rule of SINGLE_INFERENCE_RULES) {
    for (const pat of rule.patterns) {
      const m = norm.match(pat);
      if (m) {
        if (!found[rule.cat]) found[rule.cat] = [];
        // 同じラベルを重複させない
        if (!found[rule.cat].includes(m[0])) found[rule.cat].push(m[0]);
      }
    }
  }
  const cats = Object.keys(found);
  if (cats.length !== 1) {
    return { breakdown: null, total_percent: null, has_breakdown: false };
  }
  const cat = cats[0];
  // 部分文字列の重複を除去 (例: "試験" は "期末試験" のサブ文字列なので除去)
  const all = found[cat];
  const dedup = all.filter(l =>
    !all.some(other => other !== l && other.includes(l))
  );
  // ラベルは同カテゴリで最大3つまで結合 (e.g. "中間試験/期末試験")
  const labels = (dedup.length > 0 ? dedup : all).slice(0, 3);
  return {
    breakdown: [{
      label: labels.join('/'),
      percent: 100,
      category: cat,
      is_inferred: true,
    }],
    total_percent: 100,
    has_breakdown: true,
  };
}

// 全角→半角 (数字・括弧・%)。範囲表記はパース側で別途扱うため正規化しない。
function normalize(text) {
  return text
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/[％]/g, '%')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[，]/g, ',')
    .replace(/[、]/g, ',')
    .replace(/\s+/g, ' ');
}

// 括弧の深度を考慮してトップレベルの区切り文字でだけ分割する。
// "期末試験(および中間試験)の結果" → ["期末試験(および中間試験)の結果"]  (内側のは無視)
// "中間試験、期末試験"             → ["中間試験", "期末試験"]
const SEP_PATTERN = /^(?:および|及び|または|又は|あるいは|なお|また|さらに|加えて|並びに|\sand\s|\sor\s|\swith\s|[,、・\/／+＋\n。．])/;
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '(' || ch === '（') { depth++; i++; continue; }
    if (ch === ')' || ch === '）') { depth = Math.max(0, depth - 1); i++; continue; }
    if (depth === 0) {
      const slice = text.slice(i);
      const m = slice.match(SEP_PATTERN);
      if (m) {
        out.push(text.slice(last, i));
        i += m[0].length;
        last = i;
        continue;
      }
    }
    i++;
  }
  out.push(text.slice(last));
  return out;
}

// ラベルから不要文字/接続詞を剥がす
function cleanLabel(s) {
  if (!s) return '';
  let r = s;
  // ラベル末尾の (およそ / (約 / 程度 を除去
  r = r.replace(/\s*[(（](?:およそ|約|およそ|だいたい|approximately|about)\s*$/i, '');
  r = r.replace(/(?:程度|くらい|ほど)$/, '');
  // 末尾の数字残骸 (範囲表記の正規化で前半が残るパターン: "課題(30" → "課題")
  r = r.replace(/\s*[(（:：]\s*\d+(?:\.\d+)?\s*[)）]?$/, '');
  // 開閉括弧の中身が数字だけならその塊ごと削除 ("等(30%)" → "等" 既に%は外で消費済)
  r = r.replace(/\s*[(（][^)）]{0,8}[)）]\s*$/, (m) => /\d/.test(m) ? '' : m);
  // 前後の不要文字 (末尾の ) ） は後段のペア対応ロジックで判定するため除外)
  r = r.replace(/^[\s,、。\.・\/／+＋\-—–:：;；()（）&および及びまたは又はあるいは・と等で]+/, '');
  r = r.replace(/[\s,、。\.・\/／+＋\-—–:：;；(（&]+$/, '');
  // 文頭の助詞/接頭辞
  r = r.replace(/^(?:による|などの|等の|の|から算出|から|及び|また|なお|さらに)/, '');
  // 文末の助詞/動詞
  r = r.replace(/(?:による|により|を含む|に基づき|を|から算出|に応じて|の合算|の合計|の総合|を総合|で評価|で計算|から)$/, '');
  // 末尾の `)`: 対応する `(` がラベル内に無ければゴミとして削除、
  // 対応があれば「期末試験(および中間試験)」のような正当なペアとみなし残す
  {
    let m;
    while ((m = r.match(/[)）]$/))) {
      // 末尾から対応する開き括弧を探す
      let depth = 0;
      let openIdx = -1;
      for (let i = r.length - 1; i >= 0; i--) {
        const c = r[i];
        if (c === ')' || c === '）') depth++;
        else if (c === '(' || c === '（') {
          depth--;
          if (depth === 0) { openIdx = i; break; }
        }
      }
      if (openIdx === -1) {
        r = r.slice(0, -1);  // 対応無し → 1つだけ削って再ループ
      } else {
        break;  // 対応あり → ペアごと残す
      }
    }
  }
  r = r.replace(/^[「『〈《]+/, '').replace(/[」』〉》]+$/, '');

  // ラベル中央に対応する開き括弧が無い閉じ括弧があれば、そこで打ち切る
  // "中間試験)の結果" → "中間試験"  (元は "(中間試験)の結果" の前半が剥がされた残り)
  {
    const closeIdx = r.search(/[)）]/);
    if (closeIdx > 0) {
      const before = r.slice(0, closeIdx);
      if (!/[(（]/.test(before)) {
        r = before.trim();
      }
    }
  }

  // 末尾の冗長な後置句 (評価情報としての意味が無い装飾語)
  //   "の結果", "の成績", "の点数", "の評価", "の合計", "の合算", "など", "等"
  // 1回ずつだけ削る (連続置換で意味語まで削らないように)
  r = r.replace(/(?:の(?:結果|成績|点数|評価|出来|状況)|など|等)$/, '');

  return r.trim();
}

/**
 * @param {string} text - 成績評価セクションの生テキスト (改行はそのままでOK)
 * @returns {{breakdown: Array<{label,percent,category}>|null, total_percent: number|null, has_breakdown: boolean}}
 */
export function parseGradingBreakdown(text) {
  if (!text || typeof text !== 'string') {
    return { breakdown: null, total_percent: null, has_breakdown: false };
  }
  let norm = normalize(text);

  // 「ただし」「なお」「※」以降は条件節として除外
  // (実施できない場合のフォールバック規定が多く、本来の breakdown を歪める)
  const cutoff = norm.search(/(?:ただし|但し|なお[,、 ]|※|However[, ]|If [a-z])/);
  if (cutoff > 8) {
    norm = norm.slice(0, cutoff);
  }

  // 「X%」または範囲表記「X-Y%」を走査。範囲は percent_min/percent_max を保持し、
  // 「描画用 percent」には中央値を入れる。
  // 範囲は単一マッチを優先するため先に処理する。
  const pctRe = /\(?\s*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~〜～ー]\s*(\d{1,3}(?:\.\d+)?))?\s*%\s*\)?/g;
  const positions = [];
  let m;
  while ((m = pctRe.exec(norm)) !== null) {
    const a = parseFloat(m[1]);
    const b = m[2] != null ? parseFloat(m[2]) : null;
    if (b != null && b >= a) {
      positions.push({
        idx: m.index, end: m.index + m[0].length,
        percent: (a + b) / 2,
        percent_min: a, percent_max: b,
        is_range: true,
      });
    } else {
      positions.push({
        idx: m.index, end: m.index + m[0].length,
        percent: a, is_range: false,
      });
    }
  }
  if (positions.length === 0) {
    // %表記が無い場合のフォールバック:
    // 評価手段カテゴリが1種類しか言及されていないなら、それを100%として推定。
    // 例: 「期末試験により評価する」→ exam 100%
    //     「複数回のレポートによる」→ report 100%
    //     「中間試験と期末試験で評価する」→ exam 100% (同カテゴリは結合)
    //     「レポートと出席状況で評価する」→ 2カテゴリ → 推定せず rawOnly
    return inferSingleCategory(norm);
  }

  const items = [];
  let cursor = 0;
  for (const p of positions) {
    const before = norm.slice(cursor, p.idx);

    // 区切り文字で分割して最後のセグメントだけをラベル候補にする。
    // ただし「期末試験(および中間試験)」のような括弧内では区切らない。
    const segments = splitTopLevel(before);
    let label = segments[segments.length - 1] || '';

    // 「(50%)期末試験」のような後置パターンに備え、もし label が短すぎる/数字だけなら 1つ前のセグメントも見る
    label = cleanLabel(label);
    if (!label && segments.length >= 2) {
      label = cleanLabel(segments[segments.length - 2]);
    }

    // 文中導入句を後ろ側から削る
    label = label.replace(/^(?:理解度を|成績は|評価は|評価方法は|評価基準は|主に|総合的に)/, '').trim();
    // ラベルが長すぎる場合、助詞「を」「で」「により」「は」「に」を境に
    // 末尾セグメントだけ残す ("〜の理解度を期末試験" → "期末試験")
    if (label.length > 8) {
      const tail = label.match(/(?:を|で|により|は|について|に)([^をでにより]{2,30})$/);
      if (tail && tail[1].trim().length >= 2) {
        label = tail[1].trim();
      }
    }
    label = cleanLabel(label);

    if (label && label.length <= 40 && p.percent > 0 && p.percent <= 100) {
      const item = {
        label,
        percent: p.percent,
        category: categorizeLabel(label),
      };
      if (p.is_range) {
        item.percent_min = p.percent_min;
        item.percent_max = p.percent_max;
        item.is_range = true;
      }
      items.push(item);
    }
    cursor = p.end;
  }

  if (items.length === 0) {
    return { breakdown: null, total_percent: null, has_breakdown: false };
  }

  // 中央値ベースの合計
  const midTotal = items.reduce((s, i) => s + i.percent, 0);
  // 合計が 80〜110% の範囲なら「割合明示」として扱う
  const hasBreakdown = midTotal >= 80 && midTotal <= 110;

  // 範囲を含む breakdown は中央値合計が必ずしも 100% にならないので、
  // パース成功時は描画用の percent を 100% に揃うようスケーリングする。
  // (percent_min/percent_max は生値を保持して表示に使う)
  let scaledItems = items;
  if (hasBreakdown && midTotal > 0 && Math.abs(midTotal - 100) > 0.01) {
    const factor = 100 / midTotal;
    scaledItems = items.map(it => ({ ...it, percent: Math.round(it.percent * factor * 100) / 100 }));
  }

  return {
    breakdown: hasBreakdown ? scaledItems : null,
    total_percent: Math.round(midTotal * 10) / 10,
    has_breakdown: hasBreakdown,
  };
}

// カテゴリの日本語表示名 (UIで使用)
export const CATEGORY_LABELS = {
  exam: '試験',
  quiz: '小テスト',
  report: 'レポート',
  exercise: '演習',
  practice: '実習・実験',
  presentation: '発表',
  attendance: '出席',
  participation: '参加・態度',
  project: 'プロジェクト',
  discussion: '討論',
  other: 'その他',
};

// カテゴリの配色 (UI: 円グラフ・バー)
export const CATEGORY_COLORS = {
  exam:         '#e5534b',
  quiz:         '#f08a4b',
  report:       '#6375f0',
  exercise:     '#3dae72',
  practice:     '#2d9d8f',
  presentation: '#a855c7',
  attendance:   '#c6a236',
  participation:'#61afef',
  project:      '#c75d8e',
  discussion:   '#7b6cdc',
  other:        '#888888',
};
