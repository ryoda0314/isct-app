import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { isAdmin } from '../../../lib/auth/is-admin.js';

// 授業の文字起こし全文を受け取り、構造化した要約(Markdown)を返す。
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TRANSCRIPT_CHARS = 100_000; // 約90分の講義に十分。超過分は末尾を切る。

const SYSTEM_PROMPT = `あなたは大学の講義を要約する優秀なアシスタントです。
与えられるのは音声認識による講義の文字起こしで、誤認識・言い淀み・重複が含まれます。
それを踏まえて、学生が後から復習しやすい形に整理してください。

出力は日本語のMarkdownで、次の見出し構成に従ってください:

## 概要
2〜4文で講義全体の要点。

## キーポイント
- 箇条書きで重要な論点を5〜10個。各項目は簡潔に。

## 重要な用語・定義
- 用語: 説明（講義に出てきたもののみ。無ければ「特になし」）。

## 復習・確認事項
- 試験や課題で問われそうな点、理解しておくべき点を箇条書き。

文字起こしに無い情報は創作しないこと。聞き取れていない箇所を無理に補完しないこと。`;

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

    const body = await request.json().catch(() => ({}));
    let transcript = String(body?.transcript || '').trim();
    if (!transcript) {
      return NextResponse.json({ error: '文字起こしが空です' }, { status: 400 });
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
    }
    const title = String(body?.title || '').trim().slice(0, 120);

    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model: 'gpt-5.2',
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${title ? `講義タイトル: ${title}\n\n` : ''}以下は講義の文字起こしです。要約してください。\n\n${transcript}`,
        },
      ],
    });

    const summary = resp.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      return NextResponse.json({ error: '要約の生成に失敗しました' }, { status: 500 });
    }
    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[lecture-summary]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || '要約中にエラーが発生しました' },
      { status: 500 },
    );
  }
}
