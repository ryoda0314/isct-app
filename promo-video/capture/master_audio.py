"""書き出した動画の音（WAV）を、配信向けの大きさにそろえる（ラウドネス正規化＋先読みリミッター）。
    python promo-video/capture/master_audio.py in.wav out.wav [--target -15] [--ceiling -2.0]

- 大きさ（BS.1770 の統合ラウドネス）と true peak は、ffmpeg の loudnorm で測る（Remotion に同梱の ffmpeg にはリミッターもコンプレッサーも無いので、
  ゲインとピーク処理はここで numpy で行う）
- リミッター：先読み 5ms でピークの手前から下げ、40dB/秒で戻す（ゲインは常に「その先 5ms の最大のピークを天井に収める値」以下）
- 1 回目の結果を測り直して、リミッターで下がった分を足してもう 1 回（2 回で目標から ±0.3LU 以内に入る）
"""
import json
import re
import subprocess
import sys
import wave

import numpy as np

FF = None


def ffmpeg():
    global FF
    if FF is None:
        import os
        FF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe')
    return FF


def measure(path):
    out = subprocess.run([ffmpeg(), '-hide_banner', '-nostats', '-i', path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    j = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', out, re.S).group(0))
    return float(j['input_i']), float(j['input_tp'])


def read(path):
    w = wave.open(path)
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    assert w.getsampwidth() == 2, '16bit の WAV だけ'
    x = np.frombuffer(w.readframes(n), '<i2').astype(np.float32).reshape(-1, ch) / 32768
    return x, sr


def write(path, x, sr):
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def limit(x, sr, ceiling_db, look_ms=5.0, release_db_per_s=40.0):
    """先読みリミッター。x は (n, ch)。戻り値は処理後の信号と、いちばん下げたところの量（dB）"""
    ceil = 10 ** (ceiling_db / 20)
    peak = np.abs(x).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))  # そのサンプルを天井に収めるゲイン
    la = max(1, int(sr * look_ms / 1000))
    # 先 la サンプルのうち最も小さいゲイン（ピークが来る前から下げ始める）
    padded = np.concatenate([need, np.ones(la)])
    gmin = np.lib.stride_tricks.sliding_window_view(padded, la + 1).min(axis=1)[: len(need)]
    # 戻り：dB で直線的に戻す。G[n] = min(0, min_{m<=n}(Gmin[m] + (n-m)·rate))
    rate = release_db_per_s / sr
    gdb = 20 * np.log10(np.maximum(gmin, 1e-9))
    idx = np.arange(len(gdb), dtype=np.float64)
    g = np.minimum(0.0, np.minimum.accumulate(gdb - idx * rate) + idx * rate)
    # 下げ始めをなめらかに（直前 la サンプルの平均。どの点でも、その先 la のピークを超えない）
    lin = 10 ** (g / 20)
    c = np.cumsum(np.concatenate([np.ones(la), lin]))
    smooth = (c[la:] - c[:-la]) / la
    return x * smooth[:, None], float(20 * np.log10(smooth.min()))


def main():
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    target = float(args[args.index('--target') + 1]) if '--target' in args else -15.0
    ceiling = float(args[args.index('--ceiling') + 1]) if '--ceiling' in args else -2.0
    x, sr = read(src)
    i0, tp0 = measure(src)
    gain = target - i0
    for it in range(2):
        y, gr = limit(x * 10 ** (gain / 20), sr, ceiling)
        write(dst, y, sr)
        i1, tp1 = measure(dst)
        print(f'  pass {it + 1}: gain {gain:+.2f} dB  limiter max {gr:.2f} dB -> {i1:.2f} LUFS  true peak {tp1:.2f} dBTP')
        if abs(i1 - target) <= 0.3:
            break
        gain += target - i1
    print(f'  {src} ({i0:.2f} LUFS, {tp0:.2f} dBTP) -> {dst} ({i1:.2f} LUFS, {tp1:.2f} dBTP)')


if __name__ == '__main__':
    main()
