// AppPromo の任意フレームを静止画で書き出す（見た目の確認用）
//   node preview_frames.mjs 100 250 520          → out/frames/f0100.png ...
//   node preview_frames.mjs --scale=1 708        → 原寸で書き出し（既定は 0.5）
//   node preview_frames.mjs --id=AppPromoV2 400  → ver2 を書き出す（--out=フォルダ で書き出し先も変えられる）
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const args = process.argv.slice(2);
const scaleArg = args.find((a) => a.startsWith('--scale='));
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 0.5;
const id = (args.find((a) => a.startsWith('--id=')) || '--id=AppPromo').split('=')[1];
const outDir = (args.find((a) => a.startsWith('--out=')) || `--out=${path.resolve('out/frames')}`).slice(6);
const frames = args.filter((a) => !a.startsWith('--')).map(Number);
if (!frames.length) {
  console.error('usage: node preview_frames.mjs [--scale=0.5] <frame> [frame...]');
  process.exit(1);
}

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.js') });
const composition = await selectComposition({ serveUrl, id });
for (const frame of frames) {
  const output = path.resolve(outDir, `f${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale, timeoutInMilliseconds: 180000 });
  console.log('wrote', output);
}
