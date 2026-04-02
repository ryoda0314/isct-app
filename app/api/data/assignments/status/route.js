import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth/require-auth.js';
import { fetchSubmissionStatus } from '../../../../../lib/api/assignments.js';
import { updateAssignmentStatus } from '../../../../../lib/transform/assignment-transform.js';

const CONCURRENCY = 10;

export async function POST(request) {
  try {
    const T0 = Date.now();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken } = auth;

    const { assignments } = await request.json();
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ statuses: {} });
    }
    console.log(`[AssignStatus Timing] start: ${assignments.length} items, concurrency=${CONCURRENCY}`);

    // Fetch submission status with concurrency limit
    const statuses = {};
    let failed = 0;

    for (let i = 0; i < assignments.length; i += CONCURRENCY) {
      const batch = assignments.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ id, moodleId }) => {
          try {
            const status = await fetchSubmissionStatus(wstoken, moodleId);
            const updated = updateAssignmentStatus({ id, moodleId, st: 'not_started' }, status);
            statuses[id] = { st: updated.st, sub: updated.sub || null };
          } catch (e) {
            failed++;
            console.error(`[AssignStatus] Failed for ${id} (moodle:${moodleId}):`, e.message);
            statuses[id] = { st: 'not_started', sub: null };
          }
        })
      );
    }

    if (failed > 0) {
      console.warn(`[AssignStatus] ${failed}/${assignments.length} fetches failed`);
    }

    console.log(`[AssignStatus Timing] done: ${Date.now() - T0}ms (${assignments.length} items, ${failed} failed)`);
    return NextResponse.json({ statuses });
  } catch (err) {
    console.error('[AssignStatus] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
