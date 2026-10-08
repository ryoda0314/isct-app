"""最高傑作版（AppPromoFilm）用の効果音と、フィルムの粒子（グレイン）を合成して public/film/ に書き出す。

    python make_film_sfx.py

外部素材を使わず numpy だけで作るので、ライセンス表記は不要。
  sfx/riser.wav   … ブレイクの直前に2小節かけて持ち上げる音（ノイズと音程が上がっていき、すっと抜ける）
  sfx/impact.wav  … ロゴが現れる「ドロップ」の一撃（低い沈み込み＋空気の破裂＋長い余韻）
  sfx/shimmer.wav … きらめき（高い鈴の粒がこぼれる）
  sfx/swish.wav   … 場面を素早く切り替えるときの短い風切り音
  sfx/tick.wav    … テーマや言語を1拍ごとに切り替えるときの小さな「カチッ」
  sfx/wind.wav    … ブレイクの空に流れる、やわらかい風
  grain/g0〜g7.png … 画面全体に重ねるフィルムの粒子（512px のタイル）
"""
import os
import wave

import numpy as np
from PIL import Image

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "film")
rng = np.random.default_rng(2026)


def write_wav(name, left, right=None, peak_db=-3):
    right = left if right is None else right
    st = np.stack([left, right], axis=1)
    st = st / np.abs(st).max() * 10 ** (peak_db / 20)
    os.makedirs(os.path.join(ROOT, "sfx"), exist_ok=True)
    with wave.open(os.path.join(ROOT, "sfx", name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())
    print(f"wrote sfx/{name}: {len(left) / SR:.2f}s")


def band_noise(n, fc_of_x, width=0.6, seed=0):
    """中心周波数が時間とともに変わる帯域ノイズ（STFT で帯域を掛ける）"""
    r = np.random.default_rng(seed)
    noise = r.standard_normal(n + 4096)
    hop, win = 256, 2048
    window = np.hanning(win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    out = np.zeros(len(noise))
    norm = np.zeros(len(noise))
    for i in range(1 + (len(noise) - win) // hop):
        s = i * hop
        fc = fc_of_x(min(1.0, s / n))
        band = np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / fc) / width) ** 2)
        out[s:s + win] += np.fft.irfft(np.fft.rfft(noise[s:s + win] * window) * band) * window
        norm[s:s + win] += window ** 2
    return (out / np.maximum(norm, 1e-6))[:n]


def room(x, taps=((0.023, 0.22), (0.041, 0.15), (0.067, 0.1), (0.097, 0.07), (0.131, 0.05))):
    wet = np.zeros_like(x)
    for d, g in taps:
        k = int(SR * d)
        wet[k:] += g * x[:-k]
    return wet


def riser():
    dur = 3.2  # 2小節（150BPM）
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = t / dur
    noise = band_noise(n, lambda u: 300 * (30 ** (u ** 1.6)), 0.7, seed=11)
    # 音程が上がっていく2つの音（5度で重ねる）
    f = 110 * (2 ** (3 * x ** 1.5))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = 0.35 * np.sin(ph) + 0.2 * np.sin(ph * 1.5) + 0.08 * np.sin(ph * 2)
    env = x ** 2.4
    tail = np.where(x > 0.96, np.exp(-(x - 0.96) / 0.012), 1.0)  # 最後の 0.13 秒ですっと抜ける
    sig = (noise * 1.2 + tone) * env * tail
    pan = 0.12 * np.sin(2 * np.pi * x * 3)
    write_wav("riser.wav", sig * (1 - pan), sig * (1 + pan))


def impact():
    dur = 2.6
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = 38 + 70 * np.exp(-t / 0.09)  # 沈み込む低音
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55) * (1 - np.exp(-t / 0.004))
    burst = band_noise(n, lambda u: 2400 * (0.25 ** u), 1.1, seed=5) * np.exp(-t / 0.18) * 0.9
    air = band_noise(n, lambda u: 6000, 0.9, seed=6) * np.exp(-t / 0.9) * 0.18
    sig = sub * 1.4 + burst + air
    sig = sig + room(sig) * 1.4
    write_wav("impact.wav", sig, np.roll(sig, int(SR * 0.006)) * 0.98)


def shimmer():
    dur = 2.0
    n = int(SR * dur)
    t = np.arange(n) / SR
    l = np.zeros(n)
    r = np.zeros(n)
    notes = [2093.0, 2349.3, 2637.0, 3136.0, 3520.0, 4186.0]  # ペンタトニックの高い粒
    for k in range(26):
        st = 0.03 * k + rng.uniform(0, 0.03)
        f0 = notes[rng.integers(len(notes))] * (2 if rng.random() < 0.25 else 1)
        tt = np.clip(t - st, 0, None)
        on = (t >= st).astype(float)
        g = np.exp(-tt / rng.uniform(0.18, 0.5)) * (1 - np.exp(-tt / 0.002)) * on * (1 - k / 30)
        s = np.sin(2 * np.pi * f0 * tt) * g + 0.3 * np.sin(2 * np.pi * f0 * 2.01 * tt) * g * np.exp(-tt / 0.08)
        p = rng.uniform(0.15, 0.85)
        l += s * (1 - p)
        r += s * p
    write_wav("shimmer.wav", l + room(l), r + room(r), peak_db=-6)


def swish():
    dur = 0.42
    n = int(SR * dur)
    x = np.arange(n) / n
    sig = band_noise(n, lambda u: 700 * (5 ** np.sin(np.pi * u)), 0.5, seed=9)
    env = np.sin(np.pi * x) ** 1.6
    pan = 0.5 + 0.45 * np.tanh((x - 0.5) * 6)
    write_wav("swish.wav", sig * env * (1 - pan) * 1.3, sig * env * pan * 1.3)


def tick():
    t = np.arange(int(SR * 0.06)) / SR
    f = 2600 - 900 * (t / t[-1])
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.008) * (1 - np.exp(-t / 0.0006))
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.0009) * 0.4
    write_wav("tick.wav", s + click, peak_db=-6)


def wind():
    dur = 6.4
    n = int(SR * dur)
    x = np.arange(n) / n
    l = band_noise(n, lambda u: 500 + 350 * np.sin(2 * np.pi * u * 1.3), 0.9, seed=21)
    r = band_noise(n, lambda u: 520 + 330 * np.sin(2 * np.pi * u * 1.1 + 1), 0.9, seed=22)
    env = np.sin(np.pi * x) ** 0.8 * (0.75 + 0.25 * np.sin(2 * np.pi * x * 2.3))
    write_wav("wind.wav", l * env, r * env, peak_db=-9)


def grain():
    os.makedirs(os.path.join(ROOT, "grain"), exist_ok=True)
    for i in range(8):
        g = rng.normal(128, 34, (512, 512))
        # 1px だと細かすぎるので、少しだけぼかした粒に
        g = (g + np.roll(g, 1, 0) + np.roll(g, 1, 1)) / 3
        Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "L").save(os.path.join(ROOT, "grain", f"g{i}.png"))
    print("wrote grain/g0-g7.png")


if __name__ == "__main__":
    riser()
    impact()
    shimmer()
    swish()
    tick()
    wind()
    grain()
