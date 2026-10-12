// ずんだもんの声（VOICEVOX）を台本（src/zundamon/script.json）から合成する。
//   1) VOICEVOX のエンジンを起動しておく（%LOCALAPPDATA%\Programs\VOICEVOX\vv-engine\run.exe。127.0.0.1:50021）
//   2) node promo-video/capture/zunda_voice.mjs          （台本・設定が変わった行だけ作り直す）
//      node promo-video/capture/zunda_voice.mjs --force  （全部作り直す）
//
// 出力: public/zundamon/voice/<id>.wav（48kHz・モノ）と src/zundamon/voice.json
//   voice.json: { <id>: { dur, gain, moras: [[開始秒, 終了秒, 母音, 子音, カナ], ...], kana, hash } }
//   moras は口パク用（母音ごとに口の形を変える）。時刻は WAV の頭からの秒。gain は行ごとの音量をそろえた倍率（WAV に適用済み）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'src', 'zundamon', 'script.json');
const OUT_DIR = join(ROOT, 'public', 'zundamon', 'voice');
const OUT_JSON = join(ROOT, 'src', 'zundamon', 'voice.json');
const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const FORCE = process.argv.includes('--force');

// 声の設定（全行共通）。少しだけ速く、抑揚を強めに（紹介動画のテンポ）
const PARAMS = { speedScale: 1.2, intonationScale: 1.18, pitchScale: 0, volumeScale: 1.0, prePhonemeLength: 0.08, postPhonemeLength: 0.12, outputSamplingRate: 48000, outputStereo: false };
const TARGET_RMS = 0.11; // 声のある部分の RMS をこのくらいにそろえる（ピークは 0.89 まで）

const script = JSON.parse(readFileSync(SCRIPT, 'utf8'));
const prev = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, 'utf8')) : {};
mkdirSync(OUT_DIR, { recursive: true });

const post = async (path, body) => {
  const r = await fetch(`${ENGINE}${path}`, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r;
};

// 16bit PCM の WAV から、声のある部分の RMS とピーク
const levels = (buf) => {
  let off = 12;
  let data = null;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size;
  }
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < data.length; i += 2) {
    const v = Math.abs(data.readInt16LE(i)) / 32768;
    if (v > peak) peak = v;
    if (v > 0.01) { sum += v * v; n++; }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), samples: data.length / 2 };
};

// 16bit PCM の data 部分に倍率をかける（その場で書き換える）
const applyGain = (buf, g) => {
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      for (let i = off + 8; i + 1 < off + 8 + size; i += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf.readInt16LE(i) * g))), i);
      return;
    }
    off += 8 + size;
  }
};

const out = {};
for (const scene of script.scenes) {
  for (const line of scene.lines) {
    const speaker = script.styles[line.style];
    if (speaker == null) throw new Error(`${line.id}: スタイル「${line.style}」がありません`);
    const say = line.say || line.text.replace(/\n/g, '');
    const hash = createHash('sha1').update(JSON.stringify({ say, speaker, PARAMS })).digest('hex').slice(0, 12);
    const wav = join(OUT_DIR, `${line.id}.wav`);
    if (!FORCE && prev[line.id]?.hash === hash && existsSync(wav)) {
      out[line.id] = prev[line.id];
      continue;
    }
    const q = await (await post(`/audio_query?${new URLSearchParams({ text: say, speaker })}`)).json();
    Object.assign(q, PARAMS);
    const buf = Buffer.from(await (await post(`/synthesis?speaker=${speaker}`, q)).arrayBuffer());
    writeFileSync(wav, buf);
    // 1音（モーラ）ごとの時刻。長さはすべて speedScale で割ったものが実際の長さ
    const sp = q.speedScale;
    const moras = [];
    let t = q.prePhonemeLength / sp;
    for (const ap of q.accent_phrases) {
      for (const m of ap.moras) {
        const d = ((m.consonant_length || 0) + m.vowel_length) / sp;
        moras.push([+t.toFixed(4), +(t + d).toFixed(4), m.vowel, m.consonant || '', m.text]);
        t += d;
      }
      if (ap.pause_mora) {
        const d = ((ap.pause_mora.consonant_length || 0) + ap.pause_mora.vowel_length) / sp;
        moras.push([+t.toFixed(4), +(t + d).toFixed(4), 'pau', '', '、']);
        t += d;
      }
    }
    const lv = levels(buf);
    const dur = lv.samples / q.outputSamplingRate;
    const gain = Math.min(TARGET_RMS / lv.rms, 0.89 / lv.peak);
    applyGain(buf, gain); // 行ごとの大きさをそろえて書き直す（映像の側では音量 1 のまま鳴らす）
    writeFileSync(wav, buf);
    out[line.id] = { dur: +dur.toFixed(4), gain: +gain.toFixed(3), peak: +lv.peak.toFixed(3), moras, kana: q.kana, hash };
    console.log(`${line.id.padEnd(4)} ${dur.toFixed(2)}s  計算 ${(t + q.postPhonemeLength / sp).toFixed(2)}s  gain ${gain.toFixed(2)}  ${q.kana}`);
  }
}
writeFileSync(OUT_JSON, JSON.stringify(out, null, 0));
const total = Object.values(out).reduce((s, v) => s + v.dur, 0);
console.log(`${Object.keys(out).length} 行・声の合計 ${total.toFixed(1)} 秒 → ${OUT_JSON}`);
