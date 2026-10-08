"""アプリ紹介アニメ（AppPromo）用の効果音を合成して public/promo/sfx/ に書き出す。

    python make_promo_sfx.py

外部素材を使わず numpy だけで作るので、ライセンス表記は不要。
  chime.wav … プッシュ通知の「ピロン」（2音の減衰サイン波）
  whoosh.wav … ツバメが横切る風切り音（帯域が掃引するノイズ）
  pop.wav … 画面をタップしたときの小さな「ポッ」（ver2）
  success.wav … 提出・クーポン使用の「ピコピコン」（3音のアルペジオ、ver2）
"""
import os
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "promo", "sfx")


def write_wav(name, left, right=None):
    right = left if right is None else right
    st = np.stack([left, right], axis=1)
    peak = np.abs(st).max()
    st = st / peak * 10 ** (-3 / 20)  # ピーク -3 dBFS
    data = (st * 32767).astype("<i2").tobytes()
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"wrote {name}: {len(left) / SR:.2f}s")


def chime():
    dur = 1.3
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros_like(t)
    for start, f0, amp in [(0.0, 1318.51, 1.0), (0.105, 1760.0, 0.9)]:
        tt = np.clip(t - start, 0, None)
        on = (t >= start).astype(float)
        env = (1 - np.exp(-tt / 0.003)) * np.exp(-tt / 0.32) * on
        tone = np.sin(2 * np.pi * f0 * tt) + 0.22 * np.sin(2 * np.pi * 2 * f0 * tt) * np.exp(-tt / 0.12) \
            + 0.08 * np.sin(2 * np.pi * 3.01 * f0 * tt) * np.exp(-tt / 0.06)
        out += amp * env * tone
    # ごく短いルーム感（早期反射を数本）
    wet = np.zeros_like(out)
    for d, g in [(0.023, 0.22), (0.041, 0.15), (0.067, 0.1)]:
        n = int(SR * d)
        wet[n:] += g * out[:-n]
    l = out + wet
    r = out + np.roll(wet, int(SR * 0.004))
    write_wav("chime.wav", l, r)


def whoosh():
    dur = 0.75
    n = int(SR * dur)
    rng = np.random.default_rng(3)
    noise = rng.standard_normal(n + 4096)
    hop, win = 256, 2048
    window = np.hanning(win)
    frames = 1 + (len(noise) - win) // hop
    out = np.zeros(len(noise))
    norm = np.zeros(len(noise))
    freqs = np.fft.rfftfreq(win, 1 / SR)
    for i in range(frames):
        s = i * hop
        x = (i * hop) / n
        # 中心周波数 400Hz → 2.6kHz → 900Hz と山なりに掃引
        fc = 400 * (6.5 ** np.sin(np.pi * min(x, 1) * 0.92))
        band = np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / fc) / 0.55) ** 2)
        spec = np.fft.rfft(noise[s:s + win] * window) * band
        out[s:s + win] += np.fft.irfft(spec) * window
        norm[s:s + win] += window ** 2
    out = (out / np.maximum(norm, 1e-6))[:n]
    t = np.arange(n) / n
    env = (t / 0.62) ** 2.2 * (t < 0.62) + np.exp(-(t - 0.62) / 0.06) * (t >= 0.62)
    sig = out * env
    pan = 0.5 + 0.45 * np.tanh((t - 0.5) * 5)  # 左→右へ抜ける
    write_wav("whoosh.wav", sig * (1 - pan) * 1.4, sig * pan * 1.4)


def bell(t, start, f0, amp, decay):
    tt = np.clip(t - start, 0, None)
    on = (t >= start).astype(float)
    env = (1 - np.exp(-tt / 0.003)) * np.exp(-tt / decay) * on
    return amp * env * (np.sin(2 * np.pi * f0 * tt) + 0.22 * np.sin(2 * np.pi * 2 * f0 * tt) * np.exp(-tt / 0.12))


def success():
    t = np.arange(int(SR * 1.2)) / SR
    out = bell(t, 0.0, 1046.5, 0.8, 0.2) + bell(t, 0.07, 1318.51, 0.85, 0.22) + bell(t, 0.14, 1567.98, 1.0, 0.38)
    wet = np.zeros_like(out)
    for d, g in [(0.023, 0.22), (0.041, 0.15), (0.067, 0.1)]:
        n = int(SR * d)
        wet[n:] += g * out[:-n]
    write_wav("success.wav", out + wet, out + np.roll(wet, int(SR * 0.004)))


def pop():
    t = np.arange(int(SR * 0.09)) / SR
    f = 620 + 900 * np.exp(-t / 0.012)  # 1.5kHz から素早く下がる
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.018)
    click = np.random.default_rng(7).standard_normal(len(t)) * np.exp(-t / 0.0012) * 0.25
    write_wav("pop.wav", np.sin(phase) * env + click)


if __name__ == "__main__":
    chime()
    whoosh()
    pop()
    success()
