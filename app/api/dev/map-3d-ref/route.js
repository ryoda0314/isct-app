// 3D構造物エディタ（/editor/3d）の下絵（なぞる用の写真・図面）の一覧。開発サーバー（next dev）でだけ動く。
// 下絵は data/map-3d-ref/（リポジトリに入れない）に置き、manifest.json に [{ id, label, file, corners（左上・右上・右下・左下の
// [経度, 緯度]）, note }] を書く。画像は ./[file] で配る。本番では 404
import { NextResponse } from 'next/server';
import { readManifest } from './refs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ refs: await readManifest() });
}
