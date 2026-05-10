// Chroma-key removal + WebP compression for DM stamps.
// Run once: node scripts/process-stamps.js
// Reads from imoticon/1/, writes to public/stamps/<id>.webp
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC_DIR = path.resolve(__dirname, '..', 'imoticon', '1');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'stamps');

const STAMPS = [
  { src: 'ChatGPT Image 2026年5月10日 14_58_58.png',       id: 'ryokai',   label: '了解！' },
  { src: 'ChatGPT Image 2026年5月10日 14_59_33 (1).png',   id: 'arigatou', label: 'ありがとう！' },
  { src: 'ChatGPT Image 2026年5月10日 14_59_33 (2).png',   id: 'otsukare', label: 'おつかれさま！' },
  { src: 'ChatGPT Image 2026年5月10日 14_59_33 (3).png',   id: 'gomenne',  label: 'ごめんね' },
  { src: 'ChatGPT Image 2026年5月10日 14_59_33 (4).png',   id: 'ok',       label: 'OK！' },
  { src: 'ChatGPT Image 2026年5月10日 14_59_34 (5).png',   id: 'matane',   label: 'またね！' },
];

// Greenness = g - max(r, b). 0 means not green at all; 255 means pure green.
// Pixels with greenness > T_HARD become fully transparent.
// Pixels between T_SOFT and T_HARD get linearly interpolated alpha (anti-alias edge).
const T_HARD = 70;
const T_SOFT = 25;

async function processOne({ src, id }) {
  const srcPath = path.join(SRC_DIR, src);
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const greenness = g - Math.max(r, b);
    let alpha;
    if (greenness >= T_HARD) alpha = 0;
    else if (greenness > T_SOFT) alpha = Math.round(255 - ((greenness - T_SOFT) * 255) / (T_HARD - T_SOFT));
    else alpha = 255;

    // Spill suppression: if pixel is partially transparent, clamp green channel
    // to max(r, b) so semi-transparent edges don't keep a green tint.
    if (alpha < 255 && alpha > 0) {
      buf[i + 1] = Math.min(g, Math.max(r, b));
    }
    buf[i + 3] = alpha;
  }

  const outPath = path.join(OUT_DIR, `${id}.webp`);
  await sharp(buf, { raw: { width, height, channels } })
    .resize(480, 480, { fit: 'inside' })
    .webp({ quality: 88, effort: 5 })
    .toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log(`  ${id}.webp  ${(stat.size / 1024).toFixed(1)} KB`);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output: ${OUT_DIR}`);
  for (const s of STAMPS) {
    await processOne(s);
  }
  // Also write a manifest so the client can list stamps without hardcoding
  const manifest = STAMPS.map(s => ({ id: s.id, label: s.label, src: `/stamps/${s.id}.webp` }));
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  manifest.json (${manifest.length} stamps)`);
})();
