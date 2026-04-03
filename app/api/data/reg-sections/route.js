import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || '2026';
  const namesRaw = searchParams.get('names') || '';
  const names = namesRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (names.length === 0) {
    return Response.json({ courses: {} });
  }

  const sb = getSupabaseAdmin();

  // Build OR filter for course name matching
  const orFilter = names.map(n => `name.ilike.%${n}%`).join(',');

  const { data, error } = await sb.from('syllabus_courses')
    .select('name,section,day,per,period_start,period_end,room,quarter,code')
    .eq('year', year)
    .or(orFilter)
    .limit(500);

  if (error) {
    console.error('[reg-sections]', error.message);
    return Response.json({ courses: {} });
  }

  // Group by matched search name → section → slots
  const courses = {};
  for (const row of (data || [])) {
    if (!row.day) continue;

    const matchedName = names.find(n => row.name && row.name.includes(n));
    if (!matchedName) continue;

    if (!courses[matchedName]) courses[matchedName] = {};
    const sec = row.section || '';
    if (!courses[matchedName][sec]) {
      courses[matchedName][sec] = {
        section: sec,
        quarter: row.quarter,
        code: row.code,
        slots: [],
      };
    }
    // Avoid duplicate slots
    const sk = `${row.day}${row.period_start}-${row.period_end}`;
    if (!courses[matchedName][sec].slots.some(s => `${s.day}${s.period_start}-${s.period_end}` === sk)) {
      courses[matchedName][sec].slots.push({
        day: row.day,
        period_start: row.period_start,
        period_end: row.period_end,
        room: row.room,
      });
    }
  }

  // Convert to sorted arrays
  const result = {};
  for (const [name, sections] of Object.entries(courses)) {
    result[name] = Object.values(sections)
      .filter(s => s.slots.length > 0)
      .sort((a, b) => {
        if (!a.section && b.section) return -1;
        if (a.section && !b.section) return 1;
        return (a.section || '').localeCompare(b.section || '', undefined, { numeric: true });
      });
  }

  return Response.json({ courses: result });
}
