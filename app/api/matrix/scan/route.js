import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

const PROMPT = `この画像はマトリクス認証カードです。
列ヘッダ: A B C D E F G H I J
行ヘッダ: 1 2 3 4 5 6 7

各セルの値（大文字アルファベット1文字）を読み取り、以下のJSON形式のみで返してください。説明不要。
{"A":{"1":"X","2":"X","3":"X","4":"X","5":"X","6":"X","7":"X"},"B":{...},...,"J":{...}}`;

export async function POST(request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI APIが設定されていません' }, { status: 501 });
    }

    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) {
      return NextResponse.json({ error: '画像が必要です' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mime = file.type || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      return NextResponse.json({ error: 'JPEG/PNG/WebP画像のみ対応' }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' },
          },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: '読み取りに失敗しました' }, { status: 500 });
    }

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: '結果のパースに失敗しました' }, { status: 500 });
    }

    const matrix = JSON.parse(jsonMatch[0]);

    // バリデーション
    let cells = 0;
    for (const col of COLS) {
      if (!matrix[col] || typeof matrix[col] !== 'object') continue;
      for (const row of ROWS) {
        const v = matrix[col][row];
        if (typeof v === 'string' && /^[A-Z]$/.test(v)) cells++;
      }
    }

    if (cells < 30) {
      return NextResponse.json({ error: `読み取りが不十分です（${cells}/70セル）` }, { status: 422 });
    }

    return NextResponse.json({ matrix, cells });
  } catch (err) {
    console.error('Matrix scan error:', err);
    return NextResponse.json(
      { error: err.message || '読み取り中にエラーが発生しました' },
      { status: 500 },
    );
  }
}
