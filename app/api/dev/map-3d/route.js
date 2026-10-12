// 3D表示の構造物エディタ（/editor/3d）の保存先。開発サーバー（next dev）でだけ動き、
// public/map-3d/features.json を書き換える。本番では 404（保存はエディタの「JSON を書き出す」で）
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFeatures, serializeFeatures } from '../../../../campus-sns/campus3dFeatures.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = path.join(process.cwd(), 'public', 'map-3d', 'features.json');
const isDev = () => process.env.NODE_ENV === 'development';
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET() {
  if (!isDev()) return notFound();
  return NextResponse.json({ ok: true });
}

export async function POST(req) {
  if (!isDev()) return notFound();
  // 別のサイトから書き換えられないよう、同じオリジンからの JSON だけ受け付ける
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return NextResponse.json({ error: 'json only' }, { status: 415 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const features = parseFeatures(body);
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, serializeFeatures(features), 'utf8');
  return NextResponse.json({ ok: true, count: features.length });
}
