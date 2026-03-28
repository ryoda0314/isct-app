import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../lib/auth/course-enrollment.js';
import { notifyMentions } from '../../../lib/mentions.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';
import { getMutedIds } from '../../../lib/mutes.js';

const MAX_TEXT_LENGTH = 5000;
const VALID_TYPES = ['question', 'material', 'info', 'discussion', 'poll', 'anon'];
const VALID_EMOJIS = ['👍', '❤️', '😂', '😢', '🔥', '👏'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
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
      console.error('[Posts GET] enrollment check failed:', e.message);
      return NextResponse.json({ error: 'Enrollment check failed' }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 50);
    const before = searchParams.get('before');
    const search = searchParams.get('search');

    const sb = getSupabaseAdmin();

    // Fetch pinned posts (only on initial load, not pagination)
    let pinnedPosts = [];
    if (!before) {
      const { data: pinned } = await sb
        .from('posts')
        .select('*, profiles(name, avatar, color), comments(count)')
        .eq('course_id', courseId)
        .eq('pinned', true)
        .order('created_at', { ascending: false })
        .limit(3);
      if (pinned) {
        pinnedPosts = pinned.map(p => ({
          ...p,
          comment_count: p.comments?.[0]?.count || 0,
          comments: undefined,
        }));
      }
    }

    let query = sb
      .from('posts')
      .select('*, profiles(name, avatar, color), comments(count)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    // Exclude pinned from regular list
    query = query.or('pinned.is.null,pinned.eq.false');

    if (search) {
      query = query.ilike('text', `%${search}%`);
      query = query.limit(50);
    } else {
      query = query.limit(limit + 1);
      if (before) {
        query = query.lt('created_at', before);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Posts GET] query:', error.message, error.details, error.hint);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    // Filter out posts from blocked/muted users
    const [blockedIds, mutedIds] = await Promise.all([getBlockedIds(userid), getMutedIds(userid)]);
    const isHidden = (uid) => blockedIds.has(uid) || mutedIds.has(uid);
    const filterBlocked = (list) => (blockedIds.size === 0 && mutedIds.size === 0) ? list : list.filter(p => !isHidden(p.moodle_user_id));

    if (search) {
      const posts = filterBlocked(data).map(p => ({
        ...p,
        comment_count: p.comments?.[0]?.count || 0,
        comments: undefined,
      }));
      return NextResponse.json({ posts, pinnedPosts: [], hasMore: false });
    }

    // Filter blocked from pinned too
    pinnedPosts = filterBlocked(pinnedPosts);

    // Flatten comment count from [{count: N}] to comment_count: N
    const filtered = filterBlocked(data);
    const hasMore = filtered.length > limit;
    const posts = (hasMore ? filtered.slice(0, limit) : filtered).map(p => ({
      ...p,
      comment_count: p.comments?.[0]?.count || 0,
      comments: undefined,
    }));
    return NextResponse.json({ posts, pinnedPosts, hasMore });
  } catch (err) {
    console.error('[Posts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid, fullname } = auth;

    let course_id, text, type, year_group, poll_options, files;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      const jsonStr = fd.get('json');
      const parsed = JSON.parse(jsonStr);
      course_id = parsed.course_id;
      text = parsed.text;
      type = parsed.type || 'discussion';
      year_group = parsed.year_group || null;
      poll_options = parsed.poll_options;
      files = fd.getAll('files').filter(f => f instanceof File);
    } else {
      const body = await request.json();
      course_id = body.course_id;
      text = body.text;
      type = body.type || 'discussion';
      year_group = body.year_group || null;
      poll_options = body.poll_options;
    }

    if (!course_id || !text?.trim()) {
      return NextResponse.json({ error: 'course_id and text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    if (type === 'poll') {
      if (!Array.isArray(poll_options) || poll_options.length < 2 || poll_options.length > 6) {
        return NextResponse.json({ error: 'Poll needs 2-6 options' }, { status: 400 });
      }
    }

    // Validate files
    if (files && files.length > 0) {
      if (files.length > 3) {
        return NextResponse.json({ error: 'Max 3 files' }, { status: 400 });
      }
      for (const f of files) {
        if (f.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `File ${f.name} too large (max 10MB)` }, { status: 400 });
        }
        if (!ALLOWED_MIMES.includes(f.type)) {
          return NextResponse.json({ error: `File type ${f.type} not allowed` }, { status: 400 });
        }
      }
    }

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(course_id));
    } catch (e) {
      console.error('[Posts POST] enrollment check failed:', e.message);
      return NextResponse.json({ error: 'Enrollment check failed' }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    // NG word check
    const ngResult = await checkNgWords(text, { userId: userid, type: 'post', courseId: course_id });
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const profileData = { moodle_id: userid, name: fullname || `User ${userid}` };
    const { error: profileErr } = await sb.from('profiles').upsert(
      profileData,
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );
    if (profileErr) console.error('[Posts POST] profile upsert:', profileErr.message);

    const row = { course_id, moodle_user_id: userid, text: text.trim(), type };
    if (year_group) row.year_group = year_group;
    if (type === 'poll' && poll_options) {
      row.poll_options = poll_options;
      row.poll_votes = {};
    }

    // Upload files if any
    let attachments = null;
    if (files && files.length > 0) {
      attachments = [];
      const ts = Date.now();
      for (const f of files) {
        const path = `posts/${course_id}/${ts}_${f.name}`;
        const buf = Buffer.from(await f.arrayBuffer());
        const { error: upErr } = await sb.storage
          .from('post-attachments')
          .upload(path, buf, { contentType: f.type });
        if (upErr) {
          console.error('[Posts POST] upload:', upErr.message);
          continue;
        }
        const { data: urlData } = sb.storage.from('post-attachments').getPublicUrl(path);
        attachments.push({ name: f.name, path, size: f.size, type: f.type, url: urlData.publicUrl });
      }
      if (attachments.length > 0) row.attachments = attachments;
    }

    let { data, error } = await sb
      .from('posts')
      .insert(row)
      .select('*, profiles(name, avatar, color)')
      .single();

    // Retry without new columns if they don't exist yet
    if (error?.message && (error.message.includes('year_group') || error.message.includes('poll_') || error.message.includes('attachments'))) {
      delete row.year_group;
      delete row.poll_options;
      delete row.poll_votes;
      delete row.attachments;
      ({ data, error } = await sb
        .from('posts')
        .insert(row)
        .select('*, profiles(name, avatar, color)')
        .single());
    }

    if (error) {
      console.error('[Posts POST] insert:', error.message, error.details, error.hint);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    // Notify mentioned users (non-blocking)
    if (type !== 'anon') {
      try { await notifyMentions(text, userid, fullname, course_id, '投稿'); } catch (e) { console.error('[Posts POST] mentions:', e); }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Posts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const body = await request.json();
    const { post_id, action } = body;
    if (!post_id || !action) {
      return NextResponse.json({ error: 'post_id and action required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // --- LIKE ---
    if (action === 'like') {
      const { data: post, error: fetchErr } = await sb
        .from('posts')
        .select('likes')
        .eq('id', post_id)
        .single();

      if (fetchErr) {
        console.error('[Posts PATCH like] fetch:', fetchErr.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }

      const likes = post.likes || [];
      const newLikes = likes.includes(userid)
        ? likes.filter(id => id !== userid)
        : [...likes, userid];

      const { data, error } = await sb
        .from('posts')
        .update({ likes: newLikes })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();

      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- EDIT ---
    if (action === 'edit') {
      const { text } = body;
      if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
      if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'Text too long' }, { status: 400 });

      // Ownership check
      const { data: post, error: fetchErr } = await sb
        .from('posts')
        .select('moodle_user_id')
        .eq('id', post_id)
        .single();

      if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (post.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });

      const { data, error } = await sb
        .from('posts')
        .update({ text: text.trim(), edited_at: new Date().toISOString() })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();

      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- VOTE ---
    if (action === 'vote') {
      const { option } = body;
      if (!option) return NextResponse.json({ error: 'option required' }, { status: 400 });

      const { data: post, error: fetchErr } = await sb
        .from('posts')
        .select('poll_options, poll_votes')
        .eq('id', post_id)
        .single();

      if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (!post.poll_options || !post.poll_options.includes(option)) {
        return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
      }

      const votes = post.poll_votes || {};
      // Remove user from all options
      Object.keys(votes).forEach(k => {
        votes[k] = (votes[k] || []).filter(id => id !== userid);
      });
      // Add to chosen
      votes[option] = [...(votes[option] || []), userid];

      const { data, error } = await sb
        .from('posts')
        .update({ poll_votes: votes })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();

      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- REACT ---
    if (action === 'react') {
      const { emoji } = body;
      if (!emoji || !VALID_EMOJIS.includes(emoji)) {
        return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
      }

      const { data: post, error: fetchErr } = await sb
        .from('posts')
        .select('reactions')
        .eq('id', post_id)
        .single();

      if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

      const reactions = post.reactions || {};
      const arr = reactions[emoji] || [];
      if (arr.includes(userid)) {
        reactions[emoji] = arr.filter(id => id !== userid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...arr, userid];
      }

      const { data, error } = await sb
        .from('posts')
        .update({ reactions })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();

      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- PIN ---
    if (action === 'pin') {
      const { data: post, error: fetchErr } = await sb
        .from('posts')
        .select('moodle_user_id, pinned')
        .eq('id', post_id)
        .single();

      if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (post.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });

      const { data, error } = await sb
        .from('posts')
        .update({ pinned: !post.pinned })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();

      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[Posts PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { post_id } = await request.json();
    if (!post_id) {
      return NextResponse.json({ error: 'post_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Ownership check
    const { data: post, error: fetchErr } = await sb
      .from('posts')
      .select('moodle_user_id')
      .eq('id', post_id)
      .single();

    if (fetchErr || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    if (post.moodle_user_id !== userid) {
      return NextResponse.json({ error: 'Not your post' }, { status: 403 });
    }

    const { error } = await sb.from('posts').delete().eq('id', post_id);
    if (error) {
      console.error('[Posts DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Posts DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
