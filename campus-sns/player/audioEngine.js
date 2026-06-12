// =============================================================
// audioEngine: React ツリーの外に常駐する単一の HTMLAudioElement。
// 画面遷移・再レンダリング・レイアウト切替（PC/モバイル）でも絶対に止まらないので、
// バックグラウンド再生が成立する。Media Session API でロック画面/通知の操作にも対応。
//
// React からは useMusicPlayer() で購読する（useSyncExternalStore）。
// 音源URLは API が返す署名URL（6時間有効）。期限切れ時は onError で曲を読み直す想定。
// =============================================================

import { isNativeVolume, getSystemVolume, setSystemVolume, onSystemVolumeChange } from '../plugins/systemVolume.js';

let audio = null;            // HTMLAudioElement（遅延生成）
let queue = [];              // 再生キュー（トラックの配列）
let index = -1;             // queue 内の現在位置
let repeat = 'off';          // 'off' | 'all' | 'one'
let shuffle = false;
let volume = 1;              // 0..1。音量の唯一の真実。iOS は audio.volume を無視するため
                             // この変数を基準にし、システム音量へは setSystemVolume で反映する。
const listeners = new Set();

// 購読側に渡すスナップショット（イミュータブル）。useSyncExternalStore のため参照を維持する。
let snapshot = {
  track: null,        // 現在のトラック { id, title, artist, audio:{url}, cover:{url}, duration }
  playing: false,
  currentTime: 0,
  duration: 0,
  repeat: 'off',
  shuffle: false,
  hasQueue: false,
  volume: 1,
};

const isClient = () => typeof window !== 'undefined';

function rebuildSnapshot() {
  snapshot = {
    track: index >= 0 ? queue[index] || null : null,
    playing: !!audio && !audio.paused && !audio.ended,
    currentTime: audio?.currentTime || 0,
    duration: audio?.duration && Number.isFinite(audio.duration) ? audio.duration : (snapshot.track?.duration || 0),
    repeat,
    shuffle,
    hasQueue: queue.length > 0,
    // volume 変数が唯一の真実。audio.volume は iOS で常に 1.0 を返すため参照しない
    // （初期化が間に合わない間スライダーが最大に張り付くのを防ぐ）。
    volume,
  };
}

function emit() {
  rebuildSnapshot();
  for (const l of listeners) l();
}

function ensureAudio() {
  if (audio || !isClient()) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = volume;
  // iOS PWA でもバックグラウンド継続するための基本設定
  audio.setAttribute('playsinline', '');

  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('loadedmetadata', emit);
  audio.addEventListener('durationchange', emit);
  // 再生位置は毎フレーム emit するとコスト高なので timeupdate（~4Hz）に任せる
  audio.addEventListener('timeupdate', emit);
  audio.addEventListener('error', () => {
    console.warn('[audioEngine] playback error', audio?.error?.code);
    emit();
  });
  return audio;
}

function setMediaSessionMeta(track) {
  if (!isClient() || !('mediaSession' in navigator) || !track) return;
  try {
    const artwork = track.cover?.url
      ? [{ src: track.cover.url, sizes: '512x512', type: 'image/png' }]
      : [];
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.title || '無題',
      artist: track.artist || 'ScienceTokyo Music',
      album: 'ScienceTokyo Music',
      artwork,
    });
  } catch {}
}

function setMediaSessionHandlers() {
  if (!isClient() || !('mediaSession' in navigator)) return;
  const set = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  };
  set('play', () => engine.play());
  set('pause', () => engine.pause());
  set('previoustrack', () => engine.prev());
  set('nexttrack', () => engine.next());
  set('seekto', (d) => { if (d.seekTime != null) engine.seek(d.seekTime); });
  set('seekbackward', (d) => engine.seek(Math.max(0, (audio?.currentTime || 0) - (d.seekOffset || 10))));
  set('seekforward', (d) => engine.seek((audio?.currentTime || 0) + (d.seekOffset || 10)));
}

function pickNextIndex() {
  if (queue.length === 0) return -1;
  if (repeat === 'one') return index;
  if (shuffle) {
    if (queue.length === 1) return repeat === 'all' ? index : -1;
    // 現在以外からランダムに選ぶ（Math.random はエンジン内なので許容）
    let n;
    do { n = Math.floor(Math.random() * queue.length); } while (n === index);
    return n;
  }
  if (index + 1 < queue.length) return index + 1;
  return repeat === 'all' ? 0 : -1;
}

function onEnded() {
  const next = pickNextIndex();
  if (next === -1) { emit(); return; }
  loadAndPlay(next);
}

function loadAndPlay(i) {
  const a = ensureAudio();
  const track = queue[i];
  if (!a || !track?.audio?.url) return;
  index = i;
  a.src = track.audio.url;
  a.currentTime = 0;
  setMediaSessionMeta(track);
  setMediaSessionHandlers();
  a.play().catch((e) => console.warn('[audioEngine] play() rejected', e?.message));
  emit();
}

export const engine = {
  // トラック群を読み込んで startId（未指定なら先頭）から再生
  playTracks(tracks, startId) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    queue = tracks.filter((t) => t?.audio?.url);
    if (queue.length === 0) return;
    const start = startId ? queue.findIndex((t) => t.id === startId) : 0;
    loadAndPlay(start === -1 ? 0 : start);
  },

  // 再生/一時停止トグル
  toggle() {
    const a = ensureAudio();
    if (!a || index < 0) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
    emit();
  },
  play() { const a = ensureAudio(); if (a && index >= 0) a.play().catch(() => {}); emit(); },
  pause() { if (audio) audio.pause(); emit(); },

  next() {
    if (queue.length === 0) return;
    const i = shuffle ? pickNextIndex() : (index + 1 < queue.length ? index + 1 : (repeat === 'all' ? 0 : -1));
    if (i === -1) return;
    loadAndPlay(i);
  },
  prev() {
    if (queue.length === 0) return;
    // 3秒以上経過していたら頭出し、それ以前なら前の曲
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; emit(); return; }
    const i = index - 1 >= 0 ? index - 1 : (repeat === 'all' ? queue.length - 1 : 0);
    loadAndPlay(i);
  },

  seek(sec) {
    const a = ensureAudio();
    if (a && Number.isFinite(sec)) { a.currentTime = Math.max(0, sec); emit(); }
  },

  setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v)));
    const a = ensureAudio();
    if (a) a.volume = volume;   // web 用（iOS は無視するが無害）
    setSystemVolume(volume);    // iOS 用（web は no-op）。初期化状態に依存せず常に反映する。
    emit();
  },

  toggleRepeat() {
    repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    emit();
  },
  toggleShuffle() { shuffle = !shuffle; emit(); },

  // ライブラリから曲が消えた等の理由で現在キューを掃除/更新する
  syncQueue(tracks) {
    if (!Array.isArray(tracks)) return;
    const curId = snapshot.track?.id;
    queue = queue
      .map((t) => tracks.find((n) => n.id === t.id) || null)
      .filter(Boolean);
    index = curId ? queue.findIndex((t) => t.id === curId) : -1;
    if (index === -1 && audio) { audio.pause(); }
    emit();
  },

  // 購読 API（useSyncExternalStore 用）
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() { return snapshot; },
};

// iOS ネイティブ: 起動時にシステム音量を取り込み、ハードウェアボタン/コントロールセンターの
// 変更を購読して volume に反映する（読み取り方向）。書き込み(setVolume)は init 完了を待たず
// 常に効くので、ここが失敗してもスライダー操作は機能する（反映が片方向になるだけ）。
// web では isNativeVolume() が false なので何もしない。
function initNativeVolume() {
  if (!isClient() || !isNativeVolume()) return;
  getSystemVolume().then((cur) => {
    console.log('[audioEngine] system volume linked:', cur);
    if (typeof cur === 'number') { volume = cur; emit(); }
  });
  onSystemVolumeChange((val) => {
    if (typeof val !== 'number') return;
    volume = Math.min(1, Math.max(0, val));
    emit();
  });
}

initNativeVolume();
