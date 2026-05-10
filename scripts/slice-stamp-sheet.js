// Process 16 individual stamp PNGs from imoticon/2/, removing the cyan chroma
// background and emitting WebPs to public/stamps/.
// Run: node scripts/slice-stamp-sheet.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC_DIR = path.resolve(__dirname, '..', 'imoticon', '2');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'stamps', 'campus');
const CATEGORY = 'campus';
const CATEGORY_LABEL = 'キャンパス';

// (filename, id, label) — order matters for the manifest, not the processing.
const STAMPS = [
  { src: 'ChatGPT Image 2026年5月10日 17_42_01 (1).png',  id: 'now_ookayama',  label: '今大岡山！' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_01 (2).png',  id: 'near_yushima',  label: '湯島寄りです' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_01 (3).png',  id: 'engr_face',     label: '理工の顔してる' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_01 (4).png',  id: 'med_face',      label: '医歯学の顔してる' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_02 (5).png',  id: 'togo_topic',    label: 'その話、統合向き' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_02 (6).png',  id: 'today_suzu',    label: '今日はすずかけ' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_02 (7).png',  id: 'lost_tamachi',  label: '田町で迷子' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_02 (8).png',  id: 'summon_ooka',   label: '大岡山に召喚' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_03 (9).png',  id: 'experimenting', label: '実験中です' },
  { src: 'ChatGPT Image 2026年5月10日 17_42_03 (10).png', id: 'kadai_oware',   label: '課題に追われています' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_48 (1).png',  id: 'med_eng',       label: '医工連携してる' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_48 (2).png',  id: 'kokuritsu_kyu', label: 'それ、指定国立級' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_48 (3).png',  id: 'back_to_lab',   label: '研究室に戻ります' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_49 (4).png',  id: 'mood_yushima',  label: '今日は湯島の気分' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_49 (5).png',  id: 'mem_tokyotech', label: '東工大の記憶' },
  { src: 'ChatGPT Image 2026年5月10日 17_44_49 (6).png',  id: 'mem_idaishika', label: '医科歯科の記憶' },
];

// "cyanness" = (g + b) / 2 - r. Chroma background ~RGB(155,234,254) gives ≈89.
// Sky inside illustrations can also be cyan-ish (~30-50), so a pure threshold
// would over-erase. We flood-fill from the image edges through cyan pixels:
// only the outer chroma region (continuous from the edge) becomes transparent.
// Sky enclosed by buildings/characters stays opaque since it's not connected
// to the edge through cyan-only paths.
const T_FLOOD = 25;  // loose: any pixel with cyanness >= this is "potentially chroma" for the flood
const T_SOFT_EDGE = 12;  // cyanness threshold for soft anti-alias on the boundary

async function processOne({ src, id }) {
  const srcPath = path.join(SRC_DIR, src);
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const buf = Buffer.from(data);
  const N = width * height;

  // Compute cyanness per pixel and a "is chroma candidate" mask
  const cyanScore = new Int16Array(N);
  const isChroma = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    const c = ((buf[i + 1] + buf[i + 2]) / 2) - buf[i];
    cyanScore[p] = c;
    if (c >= T_FLOOD) isChroma[p] = 1;
  }

  // Flood fill from edges through chroma candidates (4-connected BFS).
  const visited = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qTail = 0;
  function seed(p) {
    if (isChroma[p] && !visited[p]) { visited[p] = 1; queue[qTail++] = p; }
  }
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + (width - 1)); }

  let qHead = 0;
  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width, y = (p - x) / width;
    if (x > 0)          { const np = p - 1;     if (isChroma[np] && !visited[np]) { visited[np] = 1; queue[qTail++] = np; } }
    if (x < width - 1)  { const np = p + 1;     if (isChroma[np] && !visited[np]) { visited[np] = 1; queue[qTail++] = np; } }
    if (y > 0)          { const np = p - width; if (isChroma[np] && !visited[np]) { visited[np] = 1; queue[qTail++] = np; } }
    if (y < height - 1) { const np = p + width; if (isChroma[np] && !visited[np]) { visited[np] = 1; queue[qTail++] = np; } }
  }

  // Apply alpha:
  //   visited (outer chroma): alpha=0
  //   non-visited but adjacent to visited and cyanness > T_SOFT_EDGE: partial alpha (anti-alias the rounded card boundary)
  //   else: alpha=255
  function neighborVisited(p) {
    const x = p % width, y = (p - x) / width;
    if (x > 0          && visited[p - 1])     return true;
    if (x < width - 1  && visited[p + 1])     return true;
    if (y > 0          && visited[p - width]) return true;
    if (y < height - 1 && visited[p + width]) return true;
    return false;
  }
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (visited[p]) {
      buf[i + 3] = 0;
    } else {
      const c = cyanScore[p];
      if (c > T_SOFT_EDGE && neighborVisited(p)) {
        // Soft taper for boundary pixels next to the outer chroma
        const t = Math.min(1, (c - T_SOFT_EDGE) / (T_FLOOD - T_SOFT_EDGE));
        buf[i + 3] = Math.round(255 * (1 - t));
        // Spill suppression
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        if (g > r) buf[i + 1] = r;
        if (b > r) buf[i + 2] = r;
      } else {
        buf[i + 3] = 255;
      }
    }
  }

  const outPath = path.join(OUT_DIR, `${id}.webp`);
  await sharp(buf, { raw: { width, height, channels } })
    .resize(480, 480, { fit: 'inside' })
    .webp({ quality: 88, effort: 5 })
    .toFile(outPath);
  return fs.statSync(outPath).size;
}

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output: ${OUT_DIR}`);

  for (const s of STAMPS) {
    const sz = await processOne(s);
    console.log(`  ${s.id}.webp  ${(sz / 1024).toFixed(1)} KB`);
  }

  // Per-category manifest. Aggregate manifest at public/stamps/manifest.json
  // is built separately (see scripts/build-manifest.js).
  const manifest = {
    category: CATEGORY,
    label: CATEGORY_LABEL,
    stamps: STAMPS.map(s => ({ id: s.id, label: s.label, src: `/stamps/${CATEGORY}/${s.id}.webp` })),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ${CATEGORY}/manifest.json (${manifest.stamps.length} stamps)`);
}

run().catch(e => { console.error(e); globalThis.process.exit(1); });
