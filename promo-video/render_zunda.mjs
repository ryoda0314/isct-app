// ずんだもんの紹介映像（ZundaPromo）を書き出す → out/zunda-promo.mp4
// 映像は音なし、音は WAV で別に書き出して大きさをそろえ（capture/master_audio.py）、ffmpeg でつなぐ（AAC の先頭の遅れで音がずれないように。render_film.mjs と同じ）。
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const FFMPEG = path.resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
const V = path.resolve('out/z_v.mp4');
const A = path.resolve('out/z_a.wav');
const M = path.resolve('out/z_m.wav'); // 大きさをそろえた音（capture/master_audio.py）
const OUT = path.resolve('out/zunda-promo.mp4');
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.js') });
const composition = await selectComposition({ serveUrl, id: 'ZundaPromo' });
const common = { composition, serveUrl, concurrency: 6, timeoutInMilliseconds: 240000, chromiumOptions: { gl: 'angle' } };
await renderMedia({ ...common, codec: 'h264', crf: 18, muted: true, colorSpace: 'bt709', outputLocation: V });
await renderMedia({ ...common, codec: 'wav', outputLocation: A });
// 配信向けの大きさ（-15 LUFS）にそろえ、ピークは先読みリミッターで -2dBFS に収める
execFileSync('python', [path.resolve('capture/master_audio.py'), A, M, '--target', '-15', '--ceiling', '-2.0'], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', V, '-i', M, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', OUT]);
// （fs.rmSync は、日本語を含むパスでは何もせずに終わることがある（Node 24・Windows で確認）。消すのは unlinkSync で）
for (const p of [V, A, M]) if (existsSync(p)) unlinkSync(p);
console.log('wrote', OUT);
