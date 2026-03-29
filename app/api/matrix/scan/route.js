import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

// ユーザーあたり: 1時間に3回まで（マトリクスカードは1回読めれば十分）
// Supabaseで永続化し、serverlessコールドスタートでもリセットされない
const SCAN_LIMIT = 3;
const SCAN_WINDOW_MS = 60 * 60 * 1000; // 1h

async function checkUserScanLimit(userid) {
  const sb = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - SCAN_WINDOW_MS).toISOString();
  const { count } = await sb
    .from('matrix_scan_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userid)
    .gte('created_at', cutoff);
  return (count ?? 0) < SCAN_LIMIT;
}

async function logScan(userid) {
  const sb = getSupabaseAdmin();
  await sb.from('matrix_scan_log').insert({ user_id: userid }).catch(() => {});
}

// ファイルサイズ上限: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const PROMPT = `この画像はマトリクス認証カードです。
列ヘッダ: A B C D E F G H I J
行ヘッダ: 1 2 3 4 5 6 7

各セルの値（大文字アルファベット1文字）を読み取り、以下のJSON形式のみで返してください。説明不要。
{"A":{"1":"X","2":"X","3":"X","4":"X","5":"X","6":"X","7":"X"},"B":{...},...,"J":{...}}`;

export async function POST(request) {
  try {
    // 認証チェック — ログインユーザーのみ利用可能
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    // ユーザー単位レート制限（Supabase永続化）
    const allowed = await checkUserScanLimit(auth.userid);
    if (!allowed) {
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

    // スキャン実行をログに記録（レート制限カウント）
    await logScan(auth.userid);

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: '読み取りに失敗しました' }, { status: 500 });
    }

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: '結果のパースに失敗しました' }, { status: 500 });
    }

    const raw = JSON.parse(jsonMatch[0]);

    // サニタイズ: 想定されるキー(A-J, 1-7)のみ、値は大文字1文字のみ通す
    const matrix = {};
    let cells = 0;
    for (const col of COLS) {
      if (!raw[col] || typeof raw[col] !== 'object') continue;
      matrix[col] = {};
      for (const row of ROWS) {
        const v = raw[col][row];
        if (typeof v === 'string' && /^[A-Z]$/.test(v)) {
          matrix[col][row] = v;
          cells++;
        }
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
