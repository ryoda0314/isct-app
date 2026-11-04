// 下絵の画像（manifest.json に書いたファイルだけ）。開発サーバーでだけ動く。本番では 404
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REF_DIR, readManifest } from '../refs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export async function GET(req, { params }) {
  const notFound = NextResponse.json({ error: 'not found' }, { status: 404 });
  if (process.env.NODE_ENV !== 'development') return notFound;
  const { file } = await params;
  const ref = (await readManifest()).find((r) => r.file === file);
  const type = TYPES[path.extname(file || '').toLowerCase()];
  if (!ref || !type || path.basename(file) !== file) return notFound;
  try {
    const body = await fs.readFile(path.join(REF_DIR, file));
    return new NextResponse(body, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
  } catch {
    return notFound;
  }
}
