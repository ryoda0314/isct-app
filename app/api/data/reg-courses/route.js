import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// ── Department prefix → category for 100-level ──
function getCat100(code, name) {
  if (/^LAE\./.test(code) || /^LAJ\./.test(code)) return '語学';
  if (/^LAH\./.test(code)) return '文系教養';
  if (/^LAW\./.test(code)) return '体育・健康';
  if (/^LAS\.D/.test(code)) return '図学';
  if (/^LAT\./.test(code)) return '教職';
  if (/^X/.test(code)) return '学院別';
  if (/^LAS\.[PCA]/.test(code) && /実験|演習|ラボ/.test(name)) return '実験・演習';
  if (/^LAS\./.test(code) || /^ENT\./.test(code)) return '教養';
  return 'その他';
}

// ── Department prefix → category for 200+ level ──
const DEPT_MAP = {
  // 理学院
  MTH:'数学系', PHY:'物理学系', CHM:'化学系', EPS:'地球惑星科学系',
  // 工学院
  MEC:'機械系', CSC:'システム制御系', EEE:'電気電子系', IEE:'情報通信系',
  ICT:'経営工学系',
  // 物質理工学院
  MAT:'材料系', CAP:'応用化学系',
  // 情報理工学院
  MCS:'数理・計算科学系', ART:'人工知能系', ISC:'情報工学系',
  // 生命理工学院
  LST:'生命理工学系', HCB:'ライフエンジニアリング系',
  // 環境・社会理工学院
  ARC:'建築学系', CVE:'土木・環境工学系', TSE:'融合理工学系',
  UDE:'都市・環境学系', ESI:'社会・人間科学系', TIM:'技術経営専門職学位課程',
  GEG:'地球環境共創系',
  // 共通・教養
  LAE:'語学', LAJ:'日本語', LAH:'文系教養', LAW:'体育・健康', LAS:'理工系教養',
  LAT:'教職', LAL:'第二外国語', ENT:'教養',
  // 学院別
  XEG:'工学院共通', XEN:'環境・社会共通', XCO:'情報理工共通', XMC:'物質理工共通',
  XES:'環境・社会共通', XLS:'生命理工共通', XIP:'学際',
  // その他
  SCE:'理工系共通', SHS:'社会人', NCL:'原子核', ELS:'環境', ENR:'エネルギー',
  ENI:'工学系', SSS:'超スマート社会', SMT:'知能', TAL:'教養',
  STM:'材料系', DSA:'データサイエンス', MIS:'情報理工学院', ESD:'地球環境',
  TCM:'技術経営',
};

function getCatHigher(code) {
  const m = code.match(/^([A-Z]+)\./);
  if (!m) return 'その他';
  return DEPT_MAP[m[1]] || 'その他';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || '2026';
  const quarter = searchParams.get('quarter') || '1Q';
  const level = searchParams.get('level') || '1';       // 1,2,3,4,5,6
  const deptFilter = searchParams.get('dept') || '';     // e.g. "MEC,CSC"
  const excludeRaw = searchParams.get('exclude') || '';
  const searchQ = (searchParams.get('search') || '').trim().toLowerCase(); // cross-level name search
  const excludeNames = new Set(excludeRaw.split(',').map(s => s.trim()).filter(Boolean));
  const deptSet = deptFilter ? new Set(deptFilter.split(',').map(s => s.trim()).filter(Boolean)) : null;

  const sb = getSupabaseAdmin();
  const q = quarter.charAt(0);
  const range = q <= '2' ? '1-2Q' : '3-4Q';

  const { data, error } = await sb.from('syllabus_courses')
    .select('name,code,section,day,per,period_start,period_end,room,quarter,requirement')
    .eq('year', year)
    .or(`quarter.eq.${quarter},quarter.eq.${range},quarter.eq.1-4Q`)
    .limit(5000);

  if (error) {
    console.error('[reg-courses]', error.message);
    return Response.json({ categories: [] });
  }

  const courses = {};
  for (const row of (data || [])) {
    if (!row.code || !row.day || !row.name) continue;

    const m = row.code.match(/\.([A-Za-z]+)(\d)/);

    if (searchQ) {
      // Cross-level search: skip level/dept filter, match by name or code
      const nameL = row.name.toLowerCase();
      const codeL = row.code.toLowerCase();
      if (!nameL.includes(searchQ) && !codeL.includes(searchQ)) continue;
    } else {
      // Normal browse: filter by level + dept
      if (!m || m[2] !== level) continue;
      if (deptSet) {
        const pm = row.code.match(/^([A-Z]+)\./);
        if (!pm || !deptSet.has(pm[1])) continue;
      }
      // Normalize for exclude check
      const normName = row.name.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
                               .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41));
      if (excludeNames.has(row.name) || excludeNames.has(normName)) continue;
      let skip = false;
      for (const ex of excludeNames) {
        if (normName.includes(ex) || ex.includes(normName)) { skip = true; break; }
      }
      if (skip) continue;
    }

    const courseLevel = m ? m[2] : '1';
    const cat = courseLevel === '1' ? getCat100(row.code, row.name) : getCatHigher(row.code);

    if (!courses[row.code]) {
      courses[row.code] = { name: row.name, code: row.code, cat, requirement: row.requirement || null, sections: {} };
    }
    const sec = row.section || '';
    if (!courses[row.code].sections[sec]) {
      courses[row.code].sections[sec] = { section: sec, quarter: row.quarter, slots: [] };
    }
    const sk = `${row.day}${row.period_start}-${row.period_end}`;
    const slots = courses[row.code].sections[sec].slots;
    if (!slots.some(s => `${s.day}${s.period_start}-${s.period_end}` === sk)) {
      slots.push({ day: row.day, period_start: row.period_start, period_end: row.period_end, room: row.room });
    }
  }

  // Group by category
  const groups = {};
  for (const c of Object.values(courses)) {
    const secs = Object.values(c.sections).filter(s => s.slots.length > 0)
      .sort((a, b) => (a.section || '').localeCompare(b.section || '', undefined, { numeric: true }));
    if (!secs.length) continue;
    if (!groups[c.cat]) groups[c.cat] = [];
    groups[c.cat].push({ name: c.name, code: c.code, requirement: c.requirement, sections: secs });
  }

  // Sort categories
  const catOrder100 = ['実験・演習','教養','文系教養','語学','体育・健康','図学','学院別','教職','日本語','その他'];
  let categories;
  if (!searchQ && level === '1') {
    categories = catOrder100
      .filter(cat => groups[cat]?.length)
      .map(cat => ({ name: cat, courses: groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'ja')) }));
    for (const [cat, list] of Object.entries(groups)) {
      if (!catOrder100.includes(cat)) {
        categories.push({ name: cat, courses: list.sort((a, b) => a.name.localeCompare(b.name, 'ja')) });
      }
    }
  } else {
    // For 200+, sort alphabetically by category name
    categories = Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([name, list]) => ({ name, courses: list.sort((a, b) => a.name.localeCompare(b.name, 'ja')) }));
  }

  return Response.json({ categories });
}
