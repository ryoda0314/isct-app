// 期末試験時間割 PDF（学士課程・大学院課程）を行の配列にする。
// 表は上揃えの 7 列（日付・区分・時限・科目コード・科目名・担当教員・講義室）。
// 列の境目は「見出しの中心どうしの間で、文字がいちばん少ない縦の隙間」から求め、
// 左揃えの科目名・担当教員だけは「各行の 1 行目でその列が始まる x の最頻値」で決め直す
// （列ごとに左揃え・中央揃えが混ざっているので、見出しの中点では切れない）。
// 見出しのある頁から次の見出しの頁までを同じレイアウトとして学習する（頁ごとに座標の縮尺が違うことがある）。
// 確かめ方: node scripts/test-exam-import.mjs（2025 2Q・4Q、2026 2Q・3Q の公式 PDF と照合）

// unpdf に入っている pdf.js 5 は Node 22 からの API を使う。Promise.withResolvers などは pdf.js が自分で補うが、
// URL.parse と Uint8Array.fromBase64 は補わないので、Vercel の Node が古くても動くようここで補ってから読み込む。
if (typeof URL.parse !== 'function') URL.parse = (url, base) => { try { return new URL(url, base); } catch { return null; } };
if (typeof Uint8Array.fromBase64 !== 'function') Uint8Array.fromBase64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const loadPdfjs = () => import('unpdf');

const HEADERS = ['日付', '区分', '時限', '科目コード', '科目名', '担当教員', '講義室'];
const COLS = ['date', 'kind', 'period', 'code', 'title', 'instructor', 'room'];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
// クォーターごとの試験期間の月（年度の年に対する [年のずれ, 月]）
const QUARTER_MONTHS = { 1: [[0, 5], [0, 6]], 2: [[0, 7], [0, 8]], 3: [[0, 11], [0, 12]], 4: [[1, 1], [1, 2]] };
const CODE_RE = /^[A-Z]{2,4}\.[A-Z]\d{3}(-\d{2})?$/;
const PERIOD_RE = /^\d{1,2}(-\d{1,2})?$/;

const cjk = (s) => (s.match(/[　-ヿ㐀-鿿＀-￯]/g) || []).length;
const isEnLine = (l) => { const t = l.replace(/\s/g, ''); return t.length > 0 && cjk(t) / t.length < 0.35; };
// 折り返した行をつなぐ（英数字どうし・読点のあとだけ空白を入れる）
export function joinWrap(lines) {
  return lines.reduce((acc, l) => {
    if (!acc) return l;
    const a = acc.slice(-1), b = l[0];
    // 「SAETIA SUPAT」+「他」のように、英字の名前のあとの「他」も空白で区切る
    const glue = (/[,、]/.test(a) || (/[A-Za-z0-9)]/.test(a) && /[A-Za-z0-9(他]/.test(b))) ? ' ' : '';
    return acc + glue + l;
  }, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

function lineText(items) {
  let s = '', end = null;
  for (const it of items) {
    if (end != null && it.x - end >= 2) s += ' ';
    s += it.str;
    end = it.x + it.w;
  }
  return s.trim();
}

// 項目を y（上から）→ x の順に行へまとめ、行の文字列の配列にする
function toLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((l) => lineText(l.items.sort((a, b) => a.x - b.x))).filter(Boolean);
}

// 見出しの中心 c[k] と c[k+1] の間で、文字の重なりが最も少ない区間の真ん中を境目にする
function columnBorders(centers, dataItems, right) {
  const W = Math.ceil(right) + 2;
  const cover = new Int32Array(W);
  for (const it of dataItems) {
    for (let x = Math.max(0, Math.floor(it.x)); x < Math.min(W, Math.ceil(it.x + it.w)); x++) cover[x]++;
  }
  const borders = [];
  for (let k = 0; k < centers.length - 1; k++) {
    const a = Math.ceil(centers[k]), b = Math.floor(centers[k + 1]);
    let min = Infinity;
    for (let x = a; x <= b; x++) min = Math.min(min, cover[x]);
    let best = null, run = null;
    for (let x = a; x <= b + 1; x++) {
      if (x <= b && cover[x] === min) { if (run == null) run = x; }
      else if (run != null) { if (!best || x - run > best[1] - best[0]) best = [run, x]; run = null; }
    }
    borders.push((best[0] + best[1]) / 2);
  }
  return borders;
}

function pickDate(day, dow, academicYear, quarter, bannerMonths) {
  const cands = [];
  const months = bannerMonths.length ? bannerMonths.map((m) => [m.year - academicYear, m.month]) : QUARTER_MONTHS[quarter] || [];
  for (const [dy, m] of months) {
    const y = academicYear + dy;
    const d = new Date(Date.UTC(y, m - 1, day));
    if (d.getUTCMonth() !== m - 1) continue;
    if (DOW[d.getUTCDay()] === dow) cands.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return cands.length === 1 ? cands[0] : null;
}

function formatRoom(lines) {
  if (!lines.length) return '';
  const noteAt = lines.findIndex((l) => /^\*/.test(l) || /LMS/.test(l));
  const main = joinWrap(noteAt >= 0 ? lines.slice(0, noteAt) : lines);
  return noteAt >= 0 ? `${main}（詳細はLMS要確認）` : main;
}

/**
 * @param {Uint8Array} data PDF の中身
 * @param {'undergraduate'|'graduate'} level
 * @returns {Promise<{academicYear:number, quarter:number, rows:Array, warnings:string[]}>}
 */
export async function parseExamTimetablePdf(data, level) {
  const { getDocumentProxy } = await loadPdfjs();
  const pdf = await getDocumentProxy(data);
  const warnings = [];
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    pages.push(tc.items.filter((i) => i.str && i.str.trim())
      .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  const allText = pages.map((items) => items.map((i) => i.str).join(' ')).join(' ');
  const t = allText.match(/Schedule of Final Exams[^-]*-\s*(\d{4})\s*([1-4])Q\s*-/);
  if (!t) throw new Error('title (Schedule of Final Exams -YYYY nQ-) not found');
  const academicYear = Number(t[1]), quarter = Number(t[2]);

  // 日付の見出し（例: 11 月 25 日 (水)）から、この PDF に出てくる月を集める
  const bannerMonths = [];
  for (const m of allText.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    const month = Number(m[1]);
    const year = academicYear + (month <= 3 ? 1 : 0);
    if (!bannerMonths.some((b) => b.month === month)) bannerMonths.push({ year, month });
  }

  // 見出しのある頁から次の見出しの頁の手前までを 1 つのレイアウトとして扱う
  const groups = [];
  pages.forEach((items, pi) => {
    const heads = HEADERS.map((h) => items.find((i) => i.str === h));
    if (heads.every(Boolean)) {
      const headerY = Math.min(...heads.map((h) => h.y));
      groups.push({ heads, pages: [{ pi, body: items.filter((i) => i.y < headerY - 8) }] });
    } else if (groups.length) {
      groups[groups.length - 1].pages.push({ pi, body: items });
    } else {
      warnings.push(`page ${pi + 1}: no header and no earlier layout`);
    }
  });

  const modeX = (xs) => {
    const n = new Map();
    for (const x of xs) { const k = Math.round(x); n.set(k, (n.get(k) || 0) + 1); }
    let best = null;
    for (const [k, c] of n) if (!best || c > best[1]) best = [k, c];
    return best ? best[0] : null;
  };

  const rawRows = [];
  for (const g of groups) {
    const centers = g.heads.map((h) => h.x + h.w / 2);
    const all = g.pages.flatMap((p) => p.body);
    const left = g.heads[0].x - 30;
    const borders = columnBorders(centers, all.filter((i) => i.x >= left), Math.max(...all.map((i) => i.x + i.w)));
    // 科目名・担当教員は左揃え: 各行の 1 行目で、その列が始まる x の最頻値の少し左を境目にする
    const anchorsOf = (body) => body.filter((i) => i.x >= left && i.x < borders[0] && /^\d{1,2}\(/.test(i.str));
    const titleXs = [], instrXs = [];
    for (const p of g.pages) {
      for (const a of anchorsOf(p.body)) {
        const line = p.body.filter((i) => Math.abs(i.y - a.y) <= 2).sort((x, y) => x.x - y.x);
        const code = line.find((i) => CODE_RE.test(i.str.replace(/\s/g, '')));
        if (!code) continue;
        const after = line.filter((i) => i.x > code.x + code.w + 2);
        if (after[0]) titleXs.push(after[0].x);
        for (const i of after.slice(1)) if (i.x < borders[5]) instrXs.push(i.x);
      }
    }
    const titleX = modeX(titleXs), instrX = modeX(instrXs.filter((x) => titleX == null || x > titleX + 60));
    if (titleX != null) borders[3] = titleX - 3;
    if (instrX != null && instrX < borders[5]) borders[4] = instrX - 3;
    const roomCenter = centers[6];
    // 表の右端。その外にある改訂メモ（「11/16 追加」「修正」）は読まない
    const right = Math.min(2 * roomCenter - borders[5] - 3, roomCenter + 65);
    const colOf = (it) => {
      if (it.x < left || it.x >= right) return -1;
      let k = 0;
      while (k < borders.length && it.x >= borders[k]) k++;
      return k;
    };
    for (const { pi, body: pageBody } of g.pages) {
    const body = pageBody.filter((i) => colOf(i) >= 0);
    // 行の起点 = 日付列の「25(」
    const anchors = body.filter((i) => colOf(i) === 0 && /^\d{1,2}\(/.test(i.str)).sort((a, b) => b.y - a.y);
    anchors.forEach((a, ai) => {
      const top = a.y + 3;
      const bottom = ai + 1 < anchors.length ? anchors[ai + 1].y + 3 : -Infinity;
      const cells = COLS.map(() => []);
      for (const it of body) {
        if (it.y > top || it.y <= bottom) continue;
        cells[colOf(it)].push(it);
      }
      rawRows.push({ page: pi + 1, cells: cells.map(toLines) });
    });
    }
  }

  const rows = [];
  for (const r of rawRows) {
    const [dateL, kindL, periodL, codeL, titleL, instrL, roomL] = r.cells;
    const dm = (dateL[0] || '').replace(/\s/g, '').match(/^(\d{1,2})\((.)\)$/);
    const code_raw = (codeL[0] || '').replace(/\s/g, '');
    const period = (periodL[0] || '').replace(/\s/g, '');
    const kindJa = kindL[0] || '';
    const kind = kindJa.startsWith('期末試験') ? 'exam' : kindJa.startsWith('授業&') || kindJa.startsWith('授業＆') ? 'class_exam' : kindJa.startsWith('授業') ? 'class' : null;
    const date = dm ? pickDate(Number(dm[1]), dm[2], academicYear, quarter, bannerMonths) : null;
    let enAt = titleL.findIndex((l, i) => i > 0 && isEnLine(l));
    if (enAt < 0) enAt = titleL.length;
    rows.push({
      kind, kindLabel: kindJa, level, page: r.page,
      code: code_raw.replace(/-\d+$/, ''), code_raw,
      name: joinWrap(titleL.slice(0, enAt)), name_en: joinWrap(titleL.slice(enAt)),
      date, day: dm ? dm[2] : null, period,
      instructor: joinWrap(instrL) || null,
      _roomLines: roomL,
    });
  }

  // 講義室の結合セル: 同じ日・時限・科目（枝番違い）が続き、講義室が空の行や注記だけの行があれば、
  // まとめて 1 つの講義室として全行に入れる
  const isNoteOnly = (lines) => lines.length > 0 && /^(\*|を確認|confirm|the exam)/i.test(lines[0]);
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && rows[j].date === rows[i].date && rows[j].period === rows[i].period && rows[j].code === rows[i].code && rows[j].page === rows[i].page) j++;
    const group = rows.slice(i, j);
    const merged = group.length > 1 && group.some((g) => !g._roomLines.length || isNoteOnly(g._roomLines)) && group.some((g) => g._roomLines.length && !isNoteOnly(g._roomLines));
    if (merged) {
      const room = formatRoom(group.flatMap((g) => g._roomLines));
      group.forEach((g) => { g.room = room; });
    } else {
      group.forEach((g) => { g.room = formatRoom(g._roomLines); });
    }
    i = j;
  }
  rows.forEach((r) => { delete r._roomLines; if (!r.room) r.room = null; });
  return { academicYear, quarter, rows, warnings };
}

/** 取り込んでよいかの検査。問題の一覧を返す（空なら合格）。 */
export function validateParsed(result, { minRows = 5 } = {}) {
  const problems = [];
  const { rows } = result;
  if (!rows.length || rows.length < minRows) problems.push(`rows too few: ${rows.length}`);
  const keys = new Set();
  rows.forEach((r, i) => {
    const where = `row ${i + 1} (p${r.page} ${r.code_raw || '?'})`;
    if (!r.kind) problems.push(`${where}: unknown kind "${r.kindLabel}"`);
    if (!CODE_RE.test(r.code_raw)) problems.push(`${where}: bad course code`);
    if (!PERIOD_RE.test(r.period)) problems.push(`${where}: bad period "${r.period}"`);
    if (!r.date) problems.push(`${where}: date not resolved`);
    if (!r.name) problems.push(`${where}: empty name`);
    if (/\n/.test(`${r.name}${r.room}${r.instructor}`)) problems.push(`${where}: newline left`);
    if (/\b\d{1,2}\/\d{1,2}\b|追加|修正/.test(r.room || '')) problems.push(`${where}: revision note in room "${r.room}"`);
    const k = `${r.code_raw}|${r.date}|${r.period}`;
    if (keys.has(k)) problems.push(`${where}: duplicate key ${k}`);
    keys.add(k);
  });
  const exams = rows.filter((r) => r.kind !== 'class');
  if (exams.some((r) => !r.room)) problems.push(`exam rows without room: ${exams.filter((r) => !r.room).map((r) => r.code_raw).join(' ')}`);
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (dates.length && (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5 > 21) problems.push(`dates span more than 3 weeks: ${dates[0]}..${dates[dates.length - 1]}`);
  return problems;
}
