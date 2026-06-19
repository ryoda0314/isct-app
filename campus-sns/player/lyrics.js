// =============================================================
// 歌詞パーサー。管理者が貼り付けた生テキストを解析する。
//   - LRC形式（[mm:ss.xx]行テキスト）→ 同期歌詞（タップでシーク／自動ハイライト）
//   - タイムタグが1つも無ければ → プレーン歌詞（スクロール表示のみ）
// 1行に複数タイムタグ（[00:10][00:40]同じ歌詞）や、メタタグ（[ti:][ar:][offset:]）にも対応。
// =============================================================

// [mm:ss.xx] / [mm:ss.xxx] / [mm:ss] にマッチ（グローバル）
const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

// 解析結果: { synced: boolean, lines: [{ time: number|null, text: string }] }
// synced=true の lines は time 昇順。time は秒（小数）。
export function parseLyrics(raw) {
  if (!raw || typeof raw !== 'string') return { synced: false, lines: [] };

  // [offset:+/-ms] でタイミングを補正（LRC仕様。任意）
  let offset = 0;
  const offsetMatch = raw.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) offset = (Number(offsetMatch[1]) || 0) / 1000;

  const rows = raw.split(/\r?\n/);
  const isMeta = (line) => /^\[[a-z]+:.*\]$/i.test(line.trim());

  const parseTimes = (line) => {
    TIME_TAG.lastIndex = 0;
    const times = [];
    let m;
    while ((m = TIME_TAG.exec(line)) !== null) {
      const min = Number(m[1]) || 0;
      const sec = Number(m[2]) || 0;
      // 小数部は桁数に応じて補正（"5"→0.5, "50"→0.5, "500"→0.5）
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
      times.push(min * 60 + sec + frac);
    }
    return times;
  };

  // タイムタグが1つでもあれば同期歌詞として扱う
  const hasAnyTime = rows.some((line) => parseTimes(line).length > 0);

  if (hasAnyTime) {
    const synced = [];
    let lastTime = 0; // 未打刻の歌詞行は直前のタイムへ引き継ぐ（同期表示から漏らさない）
    for (const line of rows) {
      const times = parseTimes(line);
      const text = line.replace(TIME_TAG, '').trim();
      if (times.length > 0) {
        for (const t0 of times) {
          const tt = Math.max(0, t0 + offset);
          synced.push({ time: tt, text });
          if (tt > lastTime) lastTime = tt;
        }
      } else if (text !== '' && !isMeta(line)) {
        // タイム未指定の歌詞行 → 直前の行と同じタイミングに寄せる（空行・メタタグは除外）
        synced.push({ time: Math.max(0, lastTime), text });
      }
    }
    // 安定ソート（同タイムは入力順を維持）
    synced.sort((a, b) => a.time - b.time);
    return { synced: true, lines: synced };
  }

  // プレーン: 先頭/末尾の空行を落とし、本文の空行は段落区切りとして残す
  const plain = rows.filter((line) => !isMeta(line)).map((line) => line.trim());
  while (plain.length && plain[0] === '') plain.shift();
  while (plain.length && plain[plain.length - 1] === '') plain.pop();
  return { synced: false, lines: plain.map((text) => ({ time: null, text })) };
}

// 秒 → LRC タイムタグ "[mm:ss.xx]"
export function formatLrcTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

// 行配列 → LRC文字列。time がある行はタグ付き、無い行はそのままテキスト。
export function linesToLrc(lines) {
  return (lines || [])
    .map((l) => (l.time != null && Number.isFinite(l.time) ? `${formatLrcTime(l.time)}${l.text}` : l.text))
    .join('\n');
}

// 現在再生位置(秒)に対応する同期歌詞の行インデックスを返す（無ければ -1）。
// time <= currentTime を満たす最後の行。
export function activeLineIndex(lines, currentTime) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}
