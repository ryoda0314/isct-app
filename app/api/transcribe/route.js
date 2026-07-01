import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { isAdmin } from '../../../lib/auth/is-admin.js';

// 準リアルタイム(チャンク)方式: 30秒程度の短い音声セグメントを1件ずつ受け取り、
// OpenAIの音声認識で文字起こしして返す。音声はここで破棄し、保存しない。
export const runtime = 'nodejs';
export const maxDuration = 60;

// 1セグメントの上限。チャンク方式なので通常は数百KBだが、念のため上限を設ける。
const MAX_SEGMENT_SIZE = 8 * 1024 * 1024; // 8MB

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    // 一旦、管理者のみ利用可能
    if (!(await isAdmin(auth.userid))) {
      return NextResponse.json({ error: 'この機能は現在管理者のみ利用できます' }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI APIが設定されていません' }, { status: 501 });
    }

    const formData = await request.formData();
    const file = formData.get('audio');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: '音声データが必要です' }, { status: 400 });
    }
    if (file.size > MAX_SEGMENT_SIZE) {
      return NextResponse.json({ error: '音声セグメントが大きすぎます' }, { status: 413 });
    }
    if (file.size < 200) {
      // 無音・極小セグメントは文字起こしする意味がない
      return NextResponse.json({ text: '' });
    }

    const lang = (formData.get('lang') || '').toString().trim(); // '' なら自動判定

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploadable = await toFile(bytes, file.name || 'segment.webm', {
      type: file.type || 'audio/webm',
    });

    const client = new OpenAI({ apiKey });
    const tr = await client.audio.transcriptions.create({
      file: uploadable,
      model: 'gpt-4o-transcribe',
      ...(lang ? { language: lang } : {}),
    });

    return NextResponse.json({ text: (tr.text || '').trim() });
  } catch (err) {
    console.error('[transcribe]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || '文字起こし中にエラーが発生しました' },
      { status: 500 },
    );
  }
}
