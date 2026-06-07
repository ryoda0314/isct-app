import { useSyncExternalStore } from 'react';
import { engine } from '../player/audioEngine.js';

// 常駐オーディオエンジン（React外シングルトン）の状態を購読するフック。
// 返り値: { track, playing, currentTime, duration, repeat, shuffle, hasQueue, ...操作 }
// playTracks/toggle/next/prev/seek/toggleRepeat/toggleShuffle/syncQueue はエンジンに直結。
export function useMusicPlayer() {
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot, // server snapshot（SSR時は track:null の初期スナップショット）
  );
  return {
    ...state,
    playTracks: engine.playTracks,
    toggle: engine.toggle,
    play: engine.play,
    pause: engine.pause,
    next: engine.next,
    prev: engine.prev,
    seek: engine.seek,
    toggleRepeat: engine.toggleRepeat,
    toggleShuffle: engine.toggleShuffle,
    syncQueue: engine.syncQueue,
  };
}
