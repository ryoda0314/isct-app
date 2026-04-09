/**
 * App Store 審査用ダミーアカウント作成スクリプト
 *
 * Usage: node scripts/seed-review-account.js
 *
 * Creates:
 * - profiles entry
 * - email_auth entry (for email login)
 * - course_enrollments
 * - sample posts, messages, etc.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const SUPABASE_URL = 'https://vxviyseylbefmwynybgx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY を環境変数にセットしてください');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-review-account.js');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Review Account Config ──
const REVIEW_MOODLE_ID = 99999;
const REVIEW_LOGIN_ID = 'apple-review';
const REVIEW_EMAIL = 'review@sciencetokyo.app';
const REVIEW_PASSWORD = 'SciTokyo2026!';
const REVIEW_NAME = 'App Review';
const REVIEW_STUDENT_ID = '25B99999';
const REVIEW_YEAR_GROUP = '25B';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function main() {
  console.log('=== App Store 審査用アカウント作成 ===\n');

  // 1. Profile
  console.log('1. プロフィール作成...');
  const { error: profileErr } = await sb.from('profiles').upsert({
    moodle_id: REVIEW_MOODLE_ID,
    name: REVIEW_NAME,
    avatar: 'R',
    color: '#4A90D9',
    dept: '工学院',
    year_group: REVIEW_YEAR_GROUP,
    unit: '25B-7',
    student_id: REVIEW_STUDENT_ID,
    status: 'offline',
  }, { onConflict: 'moodle_id' });
  if (profileErr) console.error('  Error:', profileErr.message);
  else console.log('  OK');

  // 2. Email Auth
  console.log('2. メール認証レコード作成...');
  const pwHash = await hashPassword(REVIEW_PASSWORD);
  const { error: emailErr } = await sb.from('email_auth').upsert({
    email: REVIEW_EMAIL,
    login_id: REVIEW_LOGIN_ID,
    moodle_id: REVIEW_MOODLE_ID,
    pw_hash: pwHash,
  }, { onConflict: 'email' });
  if (emailErr) console.error('  Error:', emailErr.message);
  else console.log('  OK');

  // 3. Course Enrollments（実際のコースIDを取得して登録）
  console.log('3. コース登録...');
  const { data: courses } = await sb
    .from('courses')
    .select('moodle_id, fullname')
    .limit(8);

  if (courses?.length) {
    const enrollments = courses.map(c => ({
      moodle_user_id: REVIEW_MOODLE_ID,
      course_moodle_id: c.moodle_id,
    }));
    const { error: enrollErr } = await sb
      .from('course_enrollments')
      .upsert(enrollments, { onConflict: 'moodle_user_id,course_moodle_id' });
    if (enrollErr) console.error('  Error:', enrollErr.message);
    else console.log(`  OK (${courses.length} courses: ${courses.map(c => c.fullname).join(', ')})`);
  } else {
    console.log('  Skip (no courses found)');
  }

  // 4. Sample Post
  console.log('4. サンプル投稿作成...');
  if (courses?.length) {
    const { error: postErr } = await sb.from('posts').upsert({
      id: 'review-post-1',
      moodle_user_id: REVIEW_MOODLE_ID,
      course_moodle_id: courses[0].moodle_id,
      content: 'テスト投稿です。App Store審査用のサンプルデータです。',
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (postErr) console.error('  Error:', postErr.message);
    else console.log('  OK');
  }

  // 5. User Token (dummy - so /api/auth/me works without SSO)
  console.log('5. ユーザートークン作成...');
  const { error: tokenErr } = await sb.from('user_tokens').upsert({
    login_id: REVIEW_LOGIN_ID,
    wstoken: 'review-dummy-token',
    moodle_user_id: REVIEW_MOODLE_ID,
    fullname: REVIEW_NAME,
  }, { onConflict: 'login_id' });
  if (tokenErr) console.error('  Error:', tokenErr.message);
  else console.log('  OK');

  console.log('\n=== 完了 ===');
  console.log(`\nログイン情報:`);
  console.log(`  メール: ${REVIEW_EMAIL}`);
  console.log(`  パスワード: ${REVIEW_PASSWORD}`);
  console.log(`  Moodle ID: ${REVIEW_MOODLE_ID}`);
  console.log(`\n※ App Store Connect の Review Information → Notes に以下を記載:`);
  console.log(`  Email: ${REVIEW_EMAIL}`);
  console.log(`  Password: ${REVIEW_PASSWORD}`);
  console.log(`  Login via "メールでログイン" option on the login screen.`);
}

main().catch(console.error);
