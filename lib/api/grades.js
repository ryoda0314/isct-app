import puppeteer from 'puppeteer-core';

const KYOMU_GRADES_URL = 'https://kyomu0.gakumu.titech.ac.jp/Titech/Student/%E6%88%90%E7%B8%BE%E9%96%B2%E8%A6%A7/PID2_0.aspx';

/**
 * Parse the grade table HTML from 教務Webシステム.
 * Runs inside Puppeteer page context.
 */
function parseGradesScript() {
  const result = { summary: {}, categories: [], courses: [] };

  // Parse summary info (student ID, name)
  const headerCells = document.querySelectorAll('table td');
  for (let i = 0; i < headerCells.length; i++) {
    const text = headerCells[i].textContent?.trim();
    if (text === '学籍番号' && headerCells[i + 1]) {
      result.summary.studentId = headerCells[i + 1].textContent?.trim();
    }
    if (text === '氏名' && headerCells[i + 1]) {
      result.summary.name = headerCells[i + 1].textContent?.trim();
    }
  }

  // Parse all tables
  const tables = document.querySelectorAll('table');

  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    let colMap = null; // Dynamically detected column indices

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const texts = cells.map(c => c.textContent?.trim().replace(/\s+/g, ' '));

      if (texts.length === 0) continue;

      // GPA row: "教養科目群 | 78.95" etc.
      if (texts[0] === '教養科目群' || texts[0] === '専門科目群' || texts[0] === '全体') {
        if (!result.summary.gpa) result.summary.gpa = {};
        const key = texts[0] === '教養科目群' ? 'liberal' :
          texts[0] === '専門科目群' ? 'major' : 'overall';
        result.summary.gpa[key] = parseFloat(texts[1]) || 0;
        continue;
      }

      // Total credits: "合計 | 95"
      if (texts[0] === '合計' && texts.length === 2) {
        const v = parseInt(texts[1]);
        if (v > 0) result.summary.totalCredits = v;
        continue;
      }

      // Category credits: "文系教養科目 | 9"
      if (texts.length === 2 && /^\d+$/.test(texts[1]) && !['小計', '合計'].includes(texts[0]) && texts[0] !== '科目区分') {
        result.categories.push({ name: texts[0].replace(/\s*※$/, ''), credits: parseInt(texts[1]) });
        continue;
      }

      // Detect header row → build column map
      if (texts.includes('科目コード') && texts.includes('成績')) {
        colMap = {};
        for (let ci = 0; ci < texts.length; ci++) {
          const t = texts[ci];
          if (t === '科目コード' && colMap.code === undefined) colMap.code = ci;
          else if (t === '授業科目名' && colMap.name === undefined) colMap.name = ci;
          else if ((t === '教員名' || t === '担当教員') && colMap.instructor === undefined) colMap.instructor = ci;
          else if ((t === '単位' || t === '単位数') && colMap.credits === undefined) colMap.credits = ci;
          else if (t === '成績' && colMap.grade === undefined) colMap.grade = ci;
          else if ((t === 'Q' || t === '学期') && colMap.quarter === undefined) colMap.quarter = ci;
          else if (t?.includes('修得') && colMap.period === undefined) colMap.period = ci;
          else if (t === '推奨' && colMap.rec === undefined) colMap.rec = ci;
        }
        continue;
      }

      // Parse course rows using the detected column map
      if (colMap && colMap.code !== undefined) {
        const codeVal = texts[colMap.code];
        if (!codeVal || !/^[A-Z]{2,4}\.[A-Z]\d{3}/.test(codeVal)) continue;

        const getName = (idx) => {
          if (idx === undefined || !texts[idx]) return '';
          return texts[idx].split('\n').map(s => s.trim()).filter(Boolean)[0] || texts[idx];
        };
        const getClean = (idx) => {
          if (idx === undefined || !texts[idx]) return '';
          return texts[idx].split('\n').map(s => s.trim()).filter(Boolean).pop() || texts[idx];
        };

        const course = {
          recommendation: colMap.rec !== undefined ? (texts[colMap.rec] || '') : '',
          code: codeVal,
          name: getName(colMap.name),
          instructor: getClean(colMap.instructor).replace(/^※/, ''),
          credits: getClean(colMap.credits),
          grade: texts[colMap.grade] || '',
          quarter: colMap.quarter !== undefined ? (texts[colMap.quarter] || '') : '',
          period: colMap.period !== undefined ? (texts[colMap.period] || '') : '',
        };

        const numGrade = parseInt(course.grade);
        if (!isNaN(numGrade)) {
          course.gradeNum = numGrade;
        }

        result.courses.push(course);
      }
    }
  }

  return result;
}

/**
 * Fetch grades from 教務Webシステム via portal login.
 *
 * @param {Object} creds - { userId, password, matrix }
 * @returns {Object} parsed grade data
 */
export async function fetchGrades({ userId, password, matrix }) {
  let browser;
  try {
    // Get browser
    let launchFn;
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const chromium = (await import('@sparticuz/chromium')).default;
      chromium.setHeadlessMode = true;
      chromium.setGraphicsMode = false;
      const execPath = await chromium.executablePath();
      launchFn = () => puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: chromium.headless,
      });
    } else {
      const { executablePath } = await import('puppeteer');
      launchFn = () => puppeteer.launch({
        headless: 'new',
        executablePath: executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }

    browser = await launchFn();
    let page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Portal login
    const PORTAL_LOGIN_URL =
      'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login?Template=userpass_key&AUTHMETHOD=UserPassword&GAREASONCODE=-1&GARESOURCEID=resourcelistID2&GAURI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList&Reason=-1&APPID=resourcelistID2&URI=https://portal.nap.gsic.titech.ac.jp/GetAccess/ResourceList';

    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name="usr_name"]', { visible: true });
    await page.type('input[name="usr_name"]', userId, { delay: 20 });
    await page.type('input[name="usr_password"]', password, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    // Matrix auth
    await page.waitForSelector('input[name="message3"]', { visible: true });
    const matrixLabels = await page.evaluate(() => {
      const labels = [];
      for (const cell of document.querySelectorAll('td, th')) {
        const t = cell.textContent?.trim();
        if (t && /^\[[A-J],\s*\d\]$/i.test(t)) labels.push(t);
      }
      return labels;
    });

    if (matrixLabels.length < 3) {
      throw new Error(`Expected 3 matrix labels, found ${matrixLabels.length}`);
    }

    const inputNames = ['message3', 'message4', 'message5'];
    for (let i = 0; i < 3; i++) {
      const match = matrixLabels[i].match(/\[([A-J]),\s*(\d)\]/i);
      const val = matrix[match[1].toUpperCase()]?.[match[2]] || '';
      await page.type(`input[name="${inputNames[i]}"]`, val, { delay: 20 });
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);

    const afterLoginUrl = page.url();
    console.log(`[Grades] After portal login: ${afterLoginUrl}`);

    // Find kyomu link selector, then click it via Puppeteer (not evaluate) to trigger proper navigation + SSO
    const kyomuLinkIndex = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const keywords = ['教務', 'kyomu', 'gakumu'];
      for (let i = 0; i < links.length; i++) {
        const text = (links[i].textContent || '').trim();
        const href = links[i].href || '';
        const haystack = (text + ' ' + href).toLowerCase();
        if (keywords.some(k => haystack.includes(k))) {
          // Remove target="_blank" so it navigates in same tab
          links[i].removeAttribute('target');
          return i;
        }
      }
      return -1;
    });

    if (kyomuLinkIndex >= 0) {
      console.log(`[Grades] Clicking kyomu link (index ${kyomuLinkIndex})...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
        page.evaluate((idx) => {
          document.querySelectorAll('a')[idx].click();
        }, kyomuLinkIndex),
      ]);
      await new Promise(r => setTimeout(r, 2000));

      let currentUrl = page.url();
      console.log(`[Grades] After kyomu click: ${currentUrl}`);

      // Check if new tab was opened instead
      const allPages = await browser.pages();
      if (allPages.length > 1) {
        console.log(`[Grades] ${allPages.length} tabs open, checking for kyomu tab...`);
        for (const p of allPages) {
          const pUrl = p.url();
          if (pUrl.includes('kyomu') || pUrl.includes('gakumu')) {
            console.log(`[Grades] Found kyomu tab: ${pUrl}`);
            page = p;
            currentUrl = pUrl;
            break;
          }
        }
      }

      // Navigate to grades within the established session
      if (currentUrl.includes('kyomu') || currentUrl.includes('gakumu')) {
        console.log(`[Grades] On kyomu domain, navigating to grades...`);
        await page.goto(KYOMU_GRADES_URL, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log(`[Grades] Not on kyomu after click, trying direct grades URL...`);
        await page.goto(KYOMU_GRADES_URL, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
      }
    } else {
      console.log(`[Grades] No kyomu link found, navigating directly...`);
      await page.goto(KYOMU_GRADES_URL, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 2000));
    }

    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[Grades] Final URL: ${finalUrl}`);
    console.log(`[Grades] Page title: ${pageTitle}`);

    // Check if we actually reached the grades page or got redirected
    const pageInfo = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const bodyText = document.body?.innerText?.substring(0, 500) || '';
      return {
        tableCount: tables.length,
        hasForm: !!document.querySelector('form'),
        bodySnippet: bodyText,
        url: location.href,
      };
    });
    console.log(`[Grades] Page info: ${pageInfo.tableCount} tables, url=${pageInfo.url}`);

    if (pageInfo.tableCount === 0) {
      console.error(`[Grades] No tables found. Page snippet: ${pageInfo.bodySnippet}`);
      throw new Error(`Grades page not loaded (${pageInfo.tableCount} tables). URL: ${pageInfo.url}`);
    }

    // Parse grades
    const data = await page.evaluate(parseGradesScript);

    console.log(`[Grades] Fetched ${data.courses.length} courses for ${userId}`, data.courses[0] ? `first: ${JSON.stringify(data.courses[0])}` : '');

    // If no courses found, collect debug info before closing browser
    if (data.courses.length === 0) {
      const debug = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const info = [];
        tables.forEach((t, i) => {
          const rows = t.querySelectorAll('tr');
          if (rows.length > 0) {
            const cells = Array.from(rows[0].querySelectorAll('td, th'))
              .map(c => c.textContent?.trim().substring(0, 50));
            info.push({ table: i, rows: rows.length, firstRow: cells });
          }
        });
        return info;
      });
      console.warn(`[Grades] 0 courses parsed. Tables:`, JSON.stringify(debug));
      data._debug = { finalUrl, pageTitle, tables: debug };
    }

    await browser.close();
    browser = null;

    return data;

  } catch (error) {
    console.error('[Grades] Fetch failed:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
