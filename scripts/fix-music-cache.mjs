// 一度きりの修正スクリプト: music-public の公式曲ファイルを cacheControl=1年 で再アップロード。
// 既存オブジェクトは cacheControl='max-age=undefined' のため CDN キャッシュが効かない。
// 実行: node scripts/fix-music-cache.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'post-attachments', DST = 'music-public';

const { data, error } = await sb.from('music_tracks')
  .select('audio, cover').eq('is_public', true);
if (error) { console.error('query failed', error.message); process.exit(1); }

const items = [];
for (const r of data) {
  if (r.audio?.path) items.push({ path: r.audio.path, type: r.audio.type || 'audio/mpeg' });
  if (r.cover?.path) items.push({ path: r.cover.path, type: 'image/*' });
}
console.log('files to fix:', items.length);

let ok = 0, fail = 0;
for (const it of items) {
  const dl = await sb.storage.from(SRC).download(it.path);
  if (dl.error) { console.log('DL FAIL', it.path, dl.error.message); fail++; continue; }
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const ct = dl.data.type && dl.data.type !== 'application/octet-stream' ? dl.data.type : it.type;
  const up = await sb.storage.from(DST).upload(it.path, buf, {
    contentType: ct,
    cacheControl: '31536000', // 1年。ファイル名はタイムスタンプ付きで不変なので長期キャッシュ可
    upsert: true,
  });
  if (up.error) { console.log('UP FAIL', it.path, up.error.message); fail++; continue; }
  console.log('OK', it.path);
  ok++;
}
console.log(`done ok=${ok} fail=${fail}`);
