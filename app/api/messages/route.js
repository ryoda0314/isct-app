import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../lib/auth/course-enrollment.js';
import { checkNgWords } from '../../../lib/ng-filter.js';

const MAX_TEXT_LENGTH = 2000;
const toMoodleId = (id) => id?.startsWith('mc_') ? id.slice(3) : id;

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 });

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(courseId));
    } catch (e) {
      console.error('[Messages GET] enrollment check failed:', e.message);
      return NextResponse.json({ error: `Enrollment check failed: ${e.message}` }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .select('*, profiles(name, avatar, color)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      console.error('[Messages GET] query:', error.message, error.details, error.hint);
      return NextResponse.json({ error: `DB query failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Messages GET]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid, fullname } = auth;

    const { course_id, text, poll_options, poll_settings } = await request.json();
    if (!course_id || !text?.trim()) {
      return NextResponse.json({ error: 'course_id and text required' }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    if (poll_options) {
      if (!Array.isArray(poll_options) || poll_options.length < 2 || poll_options.length > 6) {
        return NextResponse.json({ error: 'Poll needs 2-6 options' }, { status: 400 });
      }
    }

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(course_id));
    } catch (e) {
      console.error('[Messages POST] enrollment check failed:', e.message);
      return NextResponse.json({ error: `Enrollment check failed: ${e.message}` }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    // NG word check
    const ngResult = await checkNgWords(text);
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const profileData = { moodle_id: userid, name: fullname || `User ${userid}` };
    const { error: profileErr } = await sb.from('profiles').upsert(
      profileData,
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );
    if (profileErr) console.error('[Messages POST] profile upsert:', profileErr.message);

    const row = { course_id, moodle_user_id: userid, text: text.trim() };
    if (poll_options) {
      row.poll_options = poll_options;
      row.poll_votes = {};
      row.poll_settings = poll_settings || {};
    }

    const { data, error } = await sb
      .from('messages')
      .insert(row)
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) {
      console.error('[Messages POST] insert:', error.message, error.details, error.hint);
      return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Messages POST]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { message_id, action, option } = await request.json();
    if (!message_id || action !== 'vote' || !option) {
      return NextResponse.json({ error: 'message_id, action=vote, and option required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data: msg, error: fetchErr } = await sb
      .from('messages')
      .select('poll_options, poll_votes, poll_settings')
      .eq('id', message_id)
      .single();

    if (fetchErr || !msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (!msg.poll_options || !msg.poll_options.includes(option)) {
      return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
    }

    const votes = msg.poll_votes || {};
    const multi = msg.poll_settings?.multi || false;
    const alreadyVoted = (votes[option] || []).includes(userid);

    if (multi) {
      // Toggle: add or remove from this option only
      if (alreadyVoted) {
        votes[option] = (votes[option] || []).filter(id => id !== userid);
      } else {
        votes[option] = [...(votes[option] || []), userid];
      }
    } else {
      // Single choice: remove from all, then add (or unvote if same)
      Object.keys(votes).forEach(k => {
        votes[k] = (votes[k] || []).filter(id => id !== userid);
      });
      if (!alreadyVoted) {
        votes[option] = [...(votes[option] || []), userid];
      }
    }

    const { data, error } = await sb
      .from('messages')
      .update({ poll_votes: votes })
      .eq('id', message_id)
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Messages PATCH]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}
