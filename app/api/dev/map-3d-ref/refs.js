// 下絵（data/map-3d-ref/manifest.json）を読む。route.js と [file]/route.js で使う
import fs from 'node:fs/promises';
import path from 'node:path';

export const REF_DIR = path.join(process.cwd(), 'data', 'map-3d-ref');

export async function readManifest() {
  try {
    const list = JSON.parse(await fs.readFile(path.join(REF_DIR, 'manifest.json'), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && typeof r.file === 'string' && Array.isArray(r.corners) && r.corners.length === 4) : [];
  } catch {
    return [];
  }
}
