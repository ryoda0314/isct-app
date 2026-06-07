import { UA, getBrowser, ensurePortalData } from './portal-session.js';

/**
 * Fetch + parse the 教務 facility reservation week-view grid for a building.
 *
 * The page (kyomu0.gakumu.titech.ac.jp/.../FacilityReservation/Top.aspx) only
 * renders the reservation grid for an authenticated portal session, so we reuse
 * the cached portal cookies (lib/api/portal-session.js), set them on a headless
 * page, navigate to the week-view URL, and parse the rendered DOM.
 */

const KYOMU_FR_BASE =
  'https://kyomu0.gakumu.titech.ac.jp/fr/Common/FacilityReservation/Top.aspx';

// Short in-memory cache — reservations change rarely; avoid hammering the portal.
const RES_TTL = 7 * 60 * 1000;
if (!globalThis.__frCache) globalThis.__frCache = new Map();
const frCache = globalThis.__frCache;

function weekUrl(dateYYYYMMDD, building) {
  return `${KYOMU_FR_BASE}?date=${dateYYYYMMDD}&w=1&b=${building}&nofilter=1&m=w`;
}

/**
 * Runs INSIDE the Puppeteer page. Scans ALL tables, finds the one whose header
 * row has the 7 day columns, and parses it into structured reservations.
 * `reqDate` (YYYYMMDD) is a fallback for computing the week start.
 */
function parseReservationScript(reqDate) {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Build a 2D grid honoring rowspan/colspan for one table.
  const buildGrid = (table) => {
    const grid = [];
    const occ = [];
    const ensure = (r) => { if (!grid[r]) { grid[r] = []; occ[r] = []; } };
    const rows = Array.from(table.rows);
    for (let r = 0; r < rows.length; r++) {
      ensure(r);
      let c = 0;
      for (const cell of Array.from(rows[r].cells)) {
        while (occ[r][c]) c++;
        const rs = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
        const cs = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
        const text = (cell.innerText || '');
        for (let dr = 0; dr < rs; dr++) {
          ensure(r + dr);
          for (let dc = 0; dc < cs; dc++) {
            occ[r + dr][c + dc] = true;
            grid[r + dr][c + dc] = text;
          }
        }
        c += cs;
      }
    }
    return grid;
  };

  // Day header cell: matches "8 (Mon)" (English) or "8（月）" (Japanese).
  const dayCellRe = /(\d{1,2})\s*[（(]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun|[日月火水木金土])\s*[）)]/i;
  const DOW_MAP = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' };
  const normDow = (s) => DOW_MAP[s.toLowerCase()] || s;

  // ── Find the reservation table: a table with a row that has >=5 day cells ──
  let grid = null, headerRow = -1, dayCols = null;
  for (const table of Array.from(document.querySelectorAll('table'))) {
    const g = buildGrid(table);
    for (let r = 0; r < g.length; r++) {
      const cols = [];
      for (let c = 0; c < g[r].length; c++) {
        const m = (g[r][c] || '').match(dayCellRe);
        if (m) cols.push({ col: c, dow: normDow(m[2]), dnum: parseInt(m[1], 10) });
      }
      if (cols.length >= 5) { grid = g; headerRow = r; dayCols = cols; break; }
    }
    if (grid) break;
  }

  // ── Title: building name + week range (search whole body) ──
  const bodyText = (document.body.innerText || '').replace(/　/g, ' ');
  const rangeRe = /([0-9]{4})\/(\d{1,2})\/(\d{1,2})\s*[（(].[）)]\s*[～~〜]\s*(?:([0-9]{4})\/)?(\d{1,2})\/(\d{1,2})/;
  const rm = bodyText.match(rangeRe);
  let weekStartDate = null, weekEnd = null, building = '';
  if (rm) {
    weekStartDate = new Date(parseInt(rm[1]), parseInt(rm[2]) - 1, parseInt(rm[3]));
    const endYear = rm[4] ? parseInt(rm[4]) : parseInt(rm[1]);
    weekEnd = ymd(new Date(endYear, parseInt(rm[5]) - 1, parseInt(rm[6])));
    const before = bodyText.slice(0, rm.index).trim();
    const bMatch = before.match(/([^\s>\/]+)\s*$/);
    if (bMatch) building = bMatch[1];
  } else if (reqDate && /^\d{8}$/.test(reqDate)) {
    const d = new Date(parseInt(reqDate.slice(0, 4)), parseInt(reqDate.slice(4, 6)) - 1, parseInt(reqDate.slice(6, 8)));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    weekStartDate = d;
  }
  // English page has no JP date range; derive week end from the start.
  if (!weekEnd && weekStartDate) {
    const we = new Date(weekStartDate); we.setDate(we.getDate() + 6); weekEnd = ymd(we);
  }
  // Building name (works for both languages, e.g. "Ookayama TakiPlaza").
  if (!building) {
    const bm = bodyText.match(/(?:Ookayama|Suzukakedai|大岡山|すずかけ台)?\s*TakiPlaza/i);
    if (bm) building = bm[0].replace(/\s+/g, ' ').trim();
  }

  if (!grid) {
    return { error: 'no-header', building, weekStart: weekStartDate ? ymd(weekStartDate) : null, weekEnd, days: [], spaces: [] };
  }

  const firstDayCol = dayCols[0].col;
  const headerCells = grid[headerRow];
  const excludeCols = new Set();
  for (let c = 0; c < firstDayCol; c++) {
    if (/見取り図|お知らせ|説明|Floor\s*plan|Description/i.test(headerCells[c] || '')) excludeCols.add(c);
  }
  const nameCols = [];
  for (let c = 0; c < firstDayCol; c++) if (!excludeCols.has(c)) nameCols.push(c);

  const days = dayCols.map((dc, i) => {
    let date = null;
    if (weekStartDate) { const d = new Date(weekStartDate); d.setDate(d.getDate() + i); date = ymd(d); }
    return { date, dow: dc.dow };
  });

  const timeRe = /[（(]?(\d{1,2}:\d{2})\s*[-–~〜ー―]\s*(\d{1,2}:\d{2})[）)]?/g;
  const parseCell = (text) => {
    if (!text) return [];
    const t = text.replace(/　/g, ' ');
    const matches = [...t.matchAll(timeRe)];
    const out = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const labelStart = m.index + m[0].length;
      const labelEnd = i + 1 < matches.length ? matches[i + 1].index : t.length;
      const label = t.slice(labelStart, labelEnd).replace(/\s+/g, ' ').trim();
      let title = label, org = '';
      const parts = label.split('：');
      if (parts.length >= 2) { org = parts[parts.length - 1].trim(); title = parts.slice(0, parts.length - 1).join('：').trim(); }
      out.push({ start: m[1], end: m[2], title, org });
    }
    return out;
  };

  // Link/label lines that are never part of a facility name. The mobile (spshow)
  // layout packs "Floor plan" + "Description" onto one line, so match as substrings.
  const NON_NAME = /Floor\s*plan|Descriptions?|見取り図|図面|お知らせ|^\s*(説明|PDF)\s*$/i;

  const spaces = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    // The name cell nests the area name, facility name and the Floor plan /
    // Description links — innerText flattens them onto separate lines. Split by
    // line, drop link labels, and dedupe (order-preserving) across all name cols.
    const seen = new Set();
    const nameParts = [];
    for (const c of nameCols) {
      for (let line of (grid[r][c] || '').split('\n')) {
        line = line.replace(/\s+/g, ' ').trim();
        if (!line || NON_NAME.test(line) || seen.has(line)) continue;
        seen.add(line);
        nameParts.push(line);
      }
    }
    const slots = dayCols.map((dc) => parseCell(grid[r][dc.col] || ''));
    if (nameParts.length === 0 && !slots.some((s) => s.length > 0)) continue;
    const group = nameParts.length >= 2 ? nameParts[0] : '';
    const name = nameParts.length >= 2 ? nameParts.slice(1).join(' ') : (nameParts[0] || '');
    spaces.push({ group, name, slots });
  }

  return { building, weekStart: weekStartDate ? ymd(weekStartDate) : null, weekEnd, days, spaces };
}

/** Diagnostics dump (runs in page) — used when debug=true. */
function diagScript() {
  const grid = document.querySelector('.tblMonth');
  let firstDataRowHtml = '';
  if (grid && grid.rows.length > 1) {
    firstDataRowHtml = (grid.rows[1].outerHTML || '').slice(0, 3000);
  }
  return {
    url: location.href,
    title: document.title,
    tableCount: document.querySelectorAll('table').length,
    tables: Array.from(document.querySelectorAll('table')).map((t) => ({
      id: t.id, cls: t.className, rows: t.rows.length,
      txt: (t.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
    })),
    gridHeaderHtml: grid && grid.rows[0] ? (grid.rows[0].outerHTML || '').slice(0, 2000) : '',
    firstDataRowHtml,
    bodySnippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
  };
}

/**
 * @param {Object} opts
 * @param {string} opts.loginId
 * @param {Object} opts.creds   - { portalUserId, portalPassword, matrix }
 * @param {string} opts.dateYYYYMMDD
 * @param {number|string} [opts.building=1]
 * @param {boolean} [opts.debug=false]
 */
export async function fetchReservations({ loginId, creds, dateYYYYMMDD, building = 1, debug = false }) {
  const cacheKey = `${loginId}:${dateYYYYMMDD}:${building}`;
  if (!debug) {
    const cached = frCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < RES_TTL) return cached.data;
  }

  const { cookies } = await ensurePortalData(loginId, {
    portalUserId: creds.portalUserId,
    portalPassword: creds.portalPassword,
    matrix: creds.matrix,
  });

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
    await page.setUserAgent(UA);
    await page.setCookie(...cookies);
    // Portal SSO JS uses window.open; keep navigation in the same tab.
    await page.evaluateOnNewDocument(() => {
      window.open = function (url) { if (url) window.location.href = url; return window; };
    });

    await page.goto(weekUrl(dateYYYYMMDD, building), { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // SSO may have opened a new tab — select the page actually on the reservation page.
    const pages = await browser.pages();
    let active = page;
    for (const p of pages) {
      const u = p.url();
      if (/FacilityReservation/i.test(u)) { active = p; break; }
    }
    if (active === page && !/FacilityReservation/i.test(page.url())) {
      for (const p of pages) {
        if (/kyomu0\.gakumu/i.test(p.url())) { active = p; break; }
      }
    }
    // If we ended up on kyomu but not on the reservation page, navigate there now
    // (SSO session is established) and re-wait.
    if (!/FacilityReservation/i.test(active.url()) && /kyomu0\.gakumu/i.test(active.url())) {
      await active.goto(weekUrl(dateYYYYMMDD, building), { waitUntil: 'networkidle2' });
      await new Promise((r) => setTimeout(r, 800));
    }

    let diag = null;
    if (debug || process.env.FR_DEBUG) {
      try { diag = await active.evaluate(diagScript); console.log('[FR][DBG]', JSON.stringify(diag)); } catch {}
    }

    const data = await active.evaluate(parseReservationScript, dateYYYYMMDD);
    await browser.close();
    browser = null;

    if (debug) data._debug = diag;
    if (!data.error) frCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } finally {
    if (browser) await browser.close();
  }
}
