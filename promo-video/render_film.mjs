// 最高傑作版（AppPromoFilm）を区間ごとに書き出してつなぐ。
//   node render_film.mjs                 → out/app-promo-film.mp4（原寸）
//   node render_film.mjs --scale=0.5     → out/app-promo-film_half.mp4（確認用）
//   node render_film.mjs --concurrency=6 --parts=8
//
// 3分あるので一度に書き出すと、途中でブラウザが落ちたときに最初からやり直しになる。
// 映像は音なしで区間ごとに書き出し（できている区間は飛ばす）、音（曲と効果音）は WAV で一度に書き出して、最後に ffmpeg でつなぐ。
// 音を最後に1回だけ AAC にするので、区間の継ぎ目で音が途切れない。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const scale = Number(opt('scale', '1'));
const concurrency = Number(opt('concurrency', '6'));
const parts = Number(opt('parts', '8'));
const tag = scale === 1 ? '' : `_${scale === 0.5 ? 'half' : `x${scale}`}`;
const DIR = path.resolve(`out/film_parts${tag}`);
const OUT = path.resolve(`out/app-promo-film${tag}.mp4`);
const FFMPEG = path.resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
mkdirSync(DIR, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.js') });
const composition = await selectComposition({ serveUrl, id: 'AppPromoFilm' });
const N = composition.durationInFrames;
const size = Math.ceil(N / parts);

// 端末は three.js（WebGL）で描くので、ブラウザの GL は ANGLE（既定の swangle では遅い）
const common = { composition, serveUrl, concurrency, timeoutInMilliseconds: 240000, chromiumOptions: { gl: 'angle' } };
for (let k = 0; k < parts; k++) {
  const a = k * size;
  const b = Math.min(N - 1, (k + 1) * size - 1);
  const file = path.join(DIR, `part_${String(k).padStart(2, '0')}.mp4`);
  if (existsSync(file)) { console.log(`skip ${path.basename(file)} (${a}-${b})`); continue; }
  const tmp = `${file}.tmp.mp4`;
  rmSync(tmp, { force: true });
  const t0 = Date.now();
  let last = -1;
  await renderMedia({
    ...common, codec: 'h264', crf: scale === 1 ? 16 : 22, scale, muted: true, colorSpace: 'bt709', frameRange: [a, b], outputLocation: tmp,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  part ${k} ${p * 10}%\r`); } },
  });
  execFileSync(process.platform === 'win32' ? 'cmd' : 'mv', process.platform === 'win32' ? ['/c', 'move', '/y', tmp, file] : [tmp, file]);
  console.log(`done ${path.basename(file)} (${a}-${b}) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// 音（曲と効果音）
const wav = path.join(DIR, 'audio.wav');
if (!existsSync(wav)) {
  await renderMedia({ ...common, codec: 'wav', outputLocation: wav });
  console.log('done audio.wav');
}

// つなぐ（映像はそのまま、音は AAC 320k）
const list = path.join(DIR, 'list.txt');
writeFileSync(list, Array.from({ length: parts }, (_, k) => `file '${path.join(DIR, `part_${String(k).padStart(2, '0')}.mp4`).replace(/\\/g, '/')}'`).join('\n'));
// 色の目印（BT.709）は区間の映像に一部しか付かないので、つなぐときに付け直す（再エンコードはしない）
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', OUT]);
console.log('wrote', OUT);
