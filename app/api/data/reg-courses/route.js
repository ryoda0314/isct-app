import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

function getCat(code, name) {
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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || '2026';
  const quarter = searchParams.get('quarter') || '1Q';
  const excludeRaw = searchParams.get('exclude') || '';
  const excludeNames = new Set(excludeRaw.split(',').map(s => s.trim()).filter(Boolean));

  const sb = getSupabaseAdmin();
  const q = quarter.charAt(0);
  const range = q <= '2' ? '1-2Q' : '3-4Q';

  const { data, error } = await sb.from('syllabus_courses')
    .select('name,code,section,day,per,period_start,period_end,room,quarter')
    .eq('year', year)
    .or(`quarter.eq.${quarter},quarter.eq.${range},quarter.eq.1-4Q`)
    .limit(3000);

  if (error) {
    console.error('[reg-courses]', error.message);
    return Response.json({ categories: [] });
  }

  const courses = {};
  for (const row of (data || [])) {
    if (!row.code || !row.day || !row.name) continue;
    // 100-level only: first digit after letters in code suffix is '1'
    const m = row.code.match(/\.([A-Za-z]+)(\d)/);
    if (!m || m[2] !== '1') continue;

    // Normalize for exclude check
    const normName = row.name.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
                             .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41));
    if (excludeNames.has(row.name) || excludeNames.has(normName)) continue;
    // Also check if any exclude name is a substring
    let skip = false;
    for (const ex of excludeNames) {
      if (normName.includes(ex) || ex.includes(normName)) { skip = true; break; }
    }
    if (skip) continue;

    if (!courses[row.code]) {
      courses[row.code] = { name: row.name, code: row.code, cat: getCat(row.code, row.name), sections: {} };
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

  const catOrder = ['実験・演習','教養','文系教養','語学','体育・健康','図学','学院別','教職','日本語','その他'];
  const groups = {};
  for (const c of Object.values(courses)) {
    const secs = Object.values(c.sections).filter(s => s.slots.length > 0)
      .sort((a, b) => (a.section || '').localeCompare(b.section || '', undefined, { numeric: true }));
    if (!secs.length) continue;
    if (!groups[c.cat]) groups[c.cat] = [];
    groups[c.cat].push({ name: c.name, code: c.code, sections: secs });
  }

  const categories = catOrder
    .filter(cat => groups[cat]?.length)
    .map(cat => ({ name: cat, courses: groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'ja')) }));

  for (const [cat, list] of Object.entries(groups)) {
    if (!catOrder.includes(cat)) {
      categories.push({ name: cat, courses: list.sort((a, b) => a.name.localeCompare(b.name, 'ja')) });
    }
  }

  return Response.json({ categories });
}
