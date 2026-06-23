// script.md を解析し、VOICEVOX ENGINE で各セリフの音声(WAV)を生成しつつ、
// Remotion で動画化するための timeline.json（口パクタイミング・字幕・テロップ・尺）を書き出す。
//
// 前提: VOICEVOX(エンジン)をローカル起動（既定 http://127.0.0.1:50021）。
// 使い方: node generate_voices.mjs   （promo-video/ ディレクトリ内で）
//
// 出力:
//   public/voice/001_metan.wav ...   … セリフ音声（Remotionが参照）
//   timeline.json                    … 動画生成用のタイムライン
//   public/voice/manifest.csv        … 一覧（字幕流用・確認用）

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 設定 ─────────────────────────────────────────────
const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const GAP_SEC = 0.30;          // セリフ間の無音ポーズ
const SPEED = 1.25;            // 話す速さ（1.0=標準。大きいほど速い。1.2〜1.4目安）
const STRIP_PARENS = true;     // （独り言）を読み上げから除外

// VOICEVOX スピーカーID（ずんだもん ノーマル=3 / 四国めたん ノーマル=2）
const SPEAKERS = {
  zundamon: { id: 3, slug: 'zundamon' },
  metan:    { id: 2, slug: 'metan' },
};
// ─────────────────────────────────────────────────────

// 台本ファイルは --script で指定可（既定 script.md）。複数動画を作り分けられる。
const _si = process.argv.indexOf('--script');
const SCRIPT = resolve(__dirname, _si >= 0 ? process.argv[_si + 1] : 'script.md');
const PUBLIC_VOICE = resolve(__dirname, 'public', 'voice');
const TIMELINE = resolve(__dirname, 'public', 'timeline.json'); // Remotionが staticFile で参照

// 感情タグ（日本語）→ 表情キー（PNGファイル名と一致）
const EMOTION = {
  '普通': 'normal', '笑': 'happy', 'うれしい': 'happy', '喜': 'happy',
  'テンション': 'excited', '興奮': 'excited', 'わくわく': 'excited',
  '驚き': 'surprised', '驚': 'surprised', 'びっくり': 'surprised',
  '困り': 'troubled', '困': 'troubled', 'うーん': 'troubled',
  'ドヤ': 'doya', '自慢': 'doya', '得意': 'doya',
};

function detectSpeaker(line) {
  const m = line.match(/^\s*\*\*(ずんだもん|四国めたん|めたん)\*\*(?:\[([^\]]+)\])?\s*[：:]\s*(.+)$/);
  if (!m) return null;
  return {
    speaker: m[1] === 'ずんだもん' ? SPEAKERS.zundamon : SPEAKERS.metan,
    expr: EMOTION[(m[2] || '').trim()] || 'normal',
    text: m[3],
  };
}

function cleanText(text) {
  let t = text.replace(/\*\*/g, '').replace(/【[^】]*】/g, '');
  if (STRIP_PARENS) t = t.replace(/[（(][^）)]*[）)]/g, '');
  t = t.replace(/——/g, '、').replace(/[♪♡☆★]/g, '').replace(/\s+/g, ' ').trim();
  return t;
}

// 字幕用テキスト（読み上げと違い、独り言や記号も残して見せる）
function subtitleText(text) {
  return text.replace(/\*\*/g, '').replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();
}

async function audioQuery(text, speakerId) {
  const r = await fetch(`${ENGINE}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  if (!r.ok) throw new Error(`audio_query ${r.status}: ${await r.text()}`);
  return r.json();
}

async function synthesize(query, speakerId) {
  const r = await fetch(`${ENGINE}/synthesis?speaker=${speakerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!r.ok) throw new Error(`synthesis ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

// audio_query から「尺(秒)」と「口の開閉区間(秒)」を算出
function analyzeTiming(query) {
  const speed = query.speedScale || 1;
  let t = (query.prePhonemeLength || 0) / speed;
  const mouth = []; // [openStartSec, openEndSec]

  for (const ph of query.accent_phrases) {
    for (const mora of ph.moras) {
      const cons = (mora.consonant_length || 0) / speed;
      const vow = (mora.vowel_length || 0) / speed;
      t += cons; // 子音区間は口を閉じ気味
      const v = (mora.vowel || '').toLowerCase();
      const silent = v === '' || v === 'n' || v === 'cl' || v === 'pau' || v === 'sil';
      if (!silent && vow > 0) mouth.push([t, t + vow]); // 母音で口を開く
      t += vow;
    }
    if (ph.pause_mora) t += (ph.pause_mora.vowel_length || 0) / speed; // ポーズは閉じ
  }
  t += (query.postPhonemeLength || 0) / speed;
  return { duration: t, mouth };
}

async function main() {
  try {
    const v = await fetch(`${ENGINE}/version`);
    console.log(`[voicevox] engine ${ENGINE} v${(await v.text()).trim()}`);
  } catch {
    console.error(`\n[エラー] VOICEVOXエンジンに接続できません: ${ENGINE}`);
    console.error('VOICEVOXアプリを起動してから再実行してください。\n');
    process.exit(1);
  }

  const md = await readFile(SCRIPT, 'utf8');
  const lines = md.split(/\r?\n/);

  // 章見出し・直近のテロップ・直近の実画像を追跡しながらセリフを拾う
  let chapter = '';
  let telop = [];
  let inTelop = false;
  let curImage = '';   // 【図】path で設定。次の【図】か章替わりまで継続
  const events = [];

  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) { chapter = h[1].replace(/[🟢🔵🟡]/g, '').replace(/（[^）]*）/g, '').trim(); telop = []; inTelop = false; curImage = ''; continue; }
    const fig = line.match(/^【図】\s*(.+)$/);  // 例: 【図】screens/home.png （なし で解除）
    if (fig) { const v = fig[1].trim(); curImage = (v === 'なし' || v === 'none') ? '' : v; inTelop = false; continue; }
    if (/^【テロップ】/.test(line)) { telop = []; inTelop = true; const rest = line.replace(/^【テロップ】/, '').trim(); if (rest) telop.push(rest.replace(/\*\*/g,'')); continue; }
    if (inTelop && /^\s*[-・]/.test(line)) { telop.push(line.replace(/^\s*[-・]\s*/, '').replace(/\*\*/g,'').trim()); continue; }
    if (/^【/.test(line)) { inTelop = false; } // 別のト書きでテロップ収集終了
    const sp = detectSpeaker(line);
    if (sp) {
      const read = cleanText(sp.text);
      if (!read) continue;
      events.push({ speaker: sp.speaker, expr: sp.expr, read, sub: subtitleText(sp.text), chapter, telop: telop.slice(0, 6), image: curImage });
      inTelop = false;
    }
  }

  if (!events.length) { console.error('セリフ行が見つかりませんでした。'); process.exit(1); }

  await mkdir(PUBLIC_VOICE, { recursive: true });
  console.log(`[voicevox] ${events.length} セリフを合成します...`);

  const segments = [];
  const manifest = [['seq','speaker','file','duration','text']];
  const warnedImg = new Set();

  for (let i = 0; i < events.length; i++) {
    const { speaker, expr, read, sub, chapter, telop } = events[i];
    let image = events[i].image || null;
    if (image && !existsSync(resolve(__dirname, 'public', image))) {
      if (!warnedImg.has(image)) { console.log(`  [画像未配置→スキップ] public/${image}`); warnedImg.add(image); }
      image = null;
    }
    const seq = String(i + 1).padStart(3, '0');
    const file = `${seq}_${speaker.slug}.wav`;

    const query = await audioQuery(read, speaker.id);
    query.speedScale = SPEED;  // 話速を反映（尺・口パクも analyzeTiming が追従）
    const { duration, mouth } = analyzeTiming(query);
    const wav = await synthesize(query, speaker.id);
    await writeFile(join(PUBLIC_VOICE, file), wav);

    process.stdout.write(`  [${seq}] ${speaker.slug} ${duration.toFixed(2)}s: ${sub.slice(0,22)}${sub.length>22?'…':''}\n`);
    segments.push({
      seq, speaker: speaker.slug, expr, audio: `voice/${file}`,
      text: sub, duration: +duration.toFixed(3),
      gapAfter: GAP_SEC, mouth: mouth.map(([a,b]) => [+a.toFixed(3), +b.toFixed(3)]),
      chapter, telop, image,
    });
    manifest.push([seq, speaker.slug, file, duration.toFixed(2), sub]);
  }

  const timeline = { fps: FPS, width: WIDTH, height: HEIGHT, segments };
  await writeFile(TIMELINE, JSON.stringify(timeline, null, 2), 'utf8');
  const csv = manifest.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  await writeFile(join(PUBLIC_VOICE, 'manifest.csv'), csv, 'utf8');

  const total = segments.reduce((s, x) => s + x.duration + x.gapAfter, 0);
  console.log(`\n[完了] ${events.length}音声 + timeline.json を生成（推定尺 ${Math.floor(total/60)}分${Math.round(total%60)}秒）`);
  console.log('次: npm run studio（プレビュー）/ npm run render（MP4書き出し）');
}

main().catch(err => { console.error('[失敗]', err.message); process.exit(1); });
