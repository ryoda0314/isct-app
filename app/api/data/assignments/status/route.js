import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth/require-auth.js';
import { fetchBulkSubmissions } from '../../../../../lib/api/assignments.js';

export async function POST(request) {
  try {
    const T0 = Date.now();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { assignments } = await request.json();
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    // Build lookup: moodleId → campus id
    const idMap = {};
    const moodleIds = [];
    for (const { id, moodleId } of assignments) {
      idMap[moodleId] = id;
      moodleIds.push(moodleId);
    }
    console.log(`[AssignStatus Timing] start: ${moodleIds.length} items (bulk)`);

    // Single bulk API call instead of N individual calls
    const statuses = {};
    let matched = 0;
    try {
      const bulk = await fetchBulkSubmissions(wstoken, moodleIds);
      for (const a of (bulk.assignments || [])) {
        const campusId = idMap[a.assignmentid];
        if (!campusId) continue;
        // Find current user's submission
        const sub = (a.submissions || []).find(s => s.userid === userid);
        if (!sub) {
          statuses[campusId] = { st: 'not_started', sub: null };
          matched++;
          continue;
        }
        let st = 'not_started';
        if (sub.status === 'submitted') st = 'completed';
        else if (sub.status === 'draft') st = 'in_progress';
        else if (sub.status === 'new' && sub.timemodified > 0) st = 'in_progress';
        statuses[campusId] = { st, sub: st === 'completed' ? new Date(sub.timemodified * 1000).toISOString() : null };
        matched++;
      }
    } catch (e) {
      console.error('[AssignStatus] Bulk fetch failed:', e.message);
    }

    console.log(`[AssignStatus Timing] done: ${Date.now() - T0}ms (${matched}/${assignments.length} matched)`);
    return NextResponse.json({ statuses });
  } catch (err) {
    console.error('[AssignStatus] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
