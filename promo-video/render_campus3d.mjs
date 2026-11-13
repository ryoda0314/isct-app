// 大岡山キャンパス 3D マップ紹介映像（CampusMapFilm）を書き出す。素材（3D の連番・曲・効果音・字体）は out/c3d_public。
//   node render_campus3d.mjs                  → out/campus3d-film.mp4（原寸）
//   node render_campus3d.mjs --scale=0.5      → out/campus3d-film_half.mp4（確かめ用）
//   node render_campus3d.mjs --stills=0,192,1728  → out/c3d_stills/fNNNN.jpg（そのコマだけ）
// 区間ごとに映像（音なし）を書き出し、音は WAV で一度に書き出して、最後に ffmpeg でつなぐ（render_film.mjs と同じ）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const scale = Number(opt('scale', '1'));
const concurrency = Number(opt('concurrency', '6'));
const parts = Number(opt('parts', '8'));
const stills = opt('stills', null);
const tag = scale === 1 ? '' : `_${scale === 0.5 ? 'half' : `x${scale}`}`;
const DIR = path.resolve(`out/c3d_parts${tag}`);
const OUT = path.resolve(`out/campus3d-film${tag}.mp4`);
const FFMPEG = path.resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
const publicDir = path.resolve('out/c3d_public');

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.js'), publicDir });
const composition = await selectComposition({ serveUrl, id: 'CampusMapFilm' });
const common = { composition, serveUrl, timeoutInMilliseconds: 240000, chromiumOptions: { gl: 'angle' } };

if (stills) {
  const dir = path.resolve('out/c3d_stills');
  mkdirSync(dir, { recursive: true });
  for (const f of stills.split(',').map(Number)) {
    await renderStill({ ...common, frame: f, output: path.join(dir, `f${String(f).padStart(4, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 88, scale: 0.5 });
    console.log('still', f);
  }
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
const N = composition.durationInFrames;
const size = Math.ceil(N / parts);
for (let k = 0; k < parts; k++) {
  const a = k * size;
  const b = Math.min(N - 1, (k + 1) * size - 1);
  const file = path.join(DIR, `part_${String(k).padStart(2, '0')}.mp4`);
  if (existsSync(file)) { console.log(`skip ${path.basename(file)} (${a}-${b})`); continue; }
  const tmp = `${file}.tmp.mp4`;
  if (existsSync(tmp)) unlinkSync(tmp); // rmSync は日本語のパスで効かないことがある
  const t0 = Date.now();
  let last = -1;
  await renderMedia({
    ...common, concurrency, codec: 'h264', crf: scale === 1 ? 16 : 22, scale, muted: true, colorSpace: 'bt709', frameRange: [a, b], outputLocation: tmp,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  part ${k} ${p * 10}%\r`); } },
  });
  execFileSync('cmd', ['/c', 'move', '/y', tmp, file]);
  console.log(`done ${path.basename(file)} (${a}-${b}) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const wav = path.join(DIR, 'audio.wav');
if (!existsSync(wav)) {
  await renderMedia({ ...common, concurrency, codec: 'wav', outputLocation: wav });
  console.log('done audio.wav');
}

const list = path.join(DIR, 'list.txt');
writeFileSync(list, Array.from({ length: parts }, (_, k) => `file '${path.join(DIR, `part_${String(k).padStart(2, '0')}.mp4`).replace(/\\/g, '/')}'`).join('\n'));
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', OUT]);
console.log('wrote', OUT);
