import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { requireAuth } from '../../../../lib/auth/require-auth.js';

/** Normalize fullwidth digits (０-９) to halfwidth (0-9) */
const norm = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || '2026';
  const quarter = searchParams.get('quarter') || '';
  const namesRaw = searchParams.get('names') || '';
  const names = namesRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (names.length === 0) {
    return Response.json({ courses: {} });
  }

  const sb = getSupabaseAdmin();

  // Strip trailing digits for broader matching (scraper strips them as section IDs)
  const searchTerms = [...new Set(names.map(n => n.replace(/\d+$/, '')))].slice(0, 50);
  // Sanitize for PostgREST filter injection: escape parens, commas, and percent
  const orFilter = searchTerms.map(n => {
    const safe = n.replace(/[()（）,%]/g, '_');
    return `name.ilike.%${safe}%`;
  }).join(',');

  let query = sb.from('syllabus_courses')
    .select('name,section,day,per,period_start,period_end,room,quarter,code')
    .eq('year', year)
    .or(orFilter);

  // Match exact quarter + ranges that span it (e.g. "1Q" → "1Q","1-2Q","1-4Q")
  if (quarter) {
    const safeQ = quarter.replace(/[^0-9Q\-]/g, '').slice(0, 5);
    const q = safeQ.charAt(0);
    const range = q <= '2' ? 'quarter.eq.1-2Q' : 'quarter.eq.3-4Q';
    query = query.or(`quarter.eq.${safeQ},${range},quarter.eq.1-4Q`);
  }

  const { data, error } = await query.limit(2000);

  if (error) {
    console.error('[reg-sections]', error.message);
    return Response.json({ courses: {} });
  }

  // Group by matched search name → section → slots
  const courses = {};
  for (const row of (data || [])) {
    if (!row.day) continue;

    // Match with fullwidth/halfwidth normalization
    const rn = norm(row.name || '');
    const matchedName = names.find(n => {
      const nn = norm(n);
      return rn.includes(nn) || nn.includes(rn);
    });
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
