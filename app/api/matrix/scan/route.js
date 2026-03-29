import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

// IPあたり: 1時間に3回まで（マトリクスカードは1回読めれば十分）
const scanHits = new Map();
const SCAN_LIMIT = 3;
const SCAN_WINDOW = 60 * 60 * 1000; // 1h
// 5分ごとに古いエントリを掃除
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of scanHits) {
    if (now - v.s > SCAN_WINDOW) scanHits.delete(k);
  }
}, 5 * 60 * 1000);

// ファイルサイズ上限: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const PROMPT = `この画像はマトリクス認証カードです。
列ヘッダ: A B C D E F G H I J
行ヘッダ: 1 2 3 4 5 6 7

各セルの値（大文字アルファベット1文字）を読み取り、以下のJSON形式のみで返してください。説明不要。
{"A":{"1":"X","2":"X","3":"X","4":"X","5":"X","6":"X","7":"X"},"B":{...},...,"J":{...}}`;

export async function POST(request) {
  try {
    // レート制限チェック
    const ip = request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || '127.0.0.1';
    const now = Date.now();
    let rec = scanHits.get(ip);
    if (!rec || now - rec.s > SCAN_WINDOW) {
      rec = { s: now, c: 0 };
      scanHits.set(ip, rec);
    }
    rec.c++;
    if (rec.c > SCAN_LIMIT) {
      return NextResponse.json(
        { error: `読み取り回数の上限に達しました（${SCAN_LIMIT}回/時間）。手入力してください。` },
        { status: 429 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI APIが設定されていません' }, { status: 501 });
    }

    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) {
      return NextResponse.json({ error: '画像が必要です' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '画像サイズは5MB以下にしてください' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mime = file.type || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      return NextResponse.json({ error: 'JPEG/PNG/WebP画像のみ対応' }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-5.2',
      max_completion_tokens: 512,
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
