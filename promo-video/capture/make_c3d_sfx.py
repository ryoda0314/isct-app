"""大岡山キャンパス 3D マップ紹介映像（CampusMapFilm）用の効果音を numpy で合成して out/c3d_public/c3d/sfx/ に書き出す。

    python capture/make_c3d_sfx.py

外部素材を使わないので、ライセンス表記は不要。
  thunder_near.wav … 近い落雷：裂ける音（高い帯域の短い破裂）＋低いうなり（数秒）
  thunder_far.wav  … 遠い雷：こもった低いごろごろ（裂ける音なし）
  rain.wav         … 雨の音（ざーっという広い帯域のノイズ＋粒の当たる音。前後をなめらかに）
"""
import os
import wave

import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "c3d_public", "c3d", "sfx")
rng = np.random.default_rng(1110)


def write_wav(name, left, right=None, peak_db=-3):
    right = left if right is None else right
    st = np.stack([left, right], axis=1)
    st = st / np.abs(st).max() * 10 ** (peak_db / 20)
    os.makedirs(ROOT, exist_ok=True)
    with wave.open(os.path.join(ROOT, name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())
    print(f"wrote {name}: {len(left) / SR:.2f}s")


def lowpass(x, fc):
    """周波数領域で滑らかに切る（1 次のなだらかな肩）"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 4), len(x))


def bandpass(x, f0, f1):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / np.sqrt(1 + (f0 / np.maximum(f, 1)) ** 4) / np.sqrt(1 + (f / f1) ** 4)
    return np.fft.irfft(X * g, len(x))


def rumble(n, seed, fc=120, slow=6.0):
    """ごろごろ：低い帯域のノイズに、ゆっくり揺れる強弱（いくつもの山）"""
    r = np.random.default_rng(seed)
    base = lowpass(r.standard_normal(n), fc)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for _ in range(14):
        c = r.uniform(0.05, n / SR * 0.85)
        w = r.uniform(0.15, 0.7)
        env += r.uniform(0.3, 1.0) * np.exp(-0.5 * ((t - c) / w) ** 2)
    env += 0.4 * np.exp(-t / (n / SR / slow))
    return base * env


def thunder(near, seed, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    body = rumble(n, seed + 1, fc=150 if near else 90) * np.exp(-t / (dur * 0.45))
    out = body / np.abs(body).max()
    if near:
        # 裂ける音：はじめの 0.25 秒、広い帯域のパチパチ（短い破裂の連なり）
        crack = np.zeros(n)
        for _ in range(60):
            c = int(SR * abs(r.normal(0.05, 0.06)))
            if c >= n - 2000:
                continue
            k = np.arange(1500)
            crack[c:c + 1500] += r.uniform(0.3, 1) * r.standard_normal(1500) * np.exp(-k / r.uniform(60, 300))
        crack = bandpass(crack, 300, 9000)
        out = out * 0.9 + 0.55 * crack / np.abs(crack).max()
        # 落ちた直後の重い一撃
        hit = lowpass(r.standard_normal(n), 60) * np.exp(-t / 0.35)
        out += 0.8 * hit / np.abs(hit).max()
    # 左右に少しずらして広がりを
    d = int(SR * 0.012)
    left = out
    right = np.concatenate([np.zeros(d), out[:-d]]) * 0.92 + 0.08 * lowpass(r.standard_normal(n), 100) * np.exp(-t / dur)
    fade = np.minimum(1, (n - np.arange(n)) / (SR * 0.6))
    return left * fade, right * fade


def rain(dur, seed):
    n = int(SR * dur)
    r = np.random.default_rng(seed)
    # ざーっ：ピンクに近いノイズ（高い帯域を少し落とす）
    def hiss(s):
        x = np.random.default_rng(s).standard_normal(n)
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(n, 1 / SR)
        X = X / np.sqrt(np.maximum(f, 40) / 40) ** 0.7 / np.sqrt(1 + (f / 7000) ** 2)
        return np.fft.irfft(X, n)
    L = hiss(seed)
    R = hiss(seed + 7)
    # 粒の当たる音
    for ch in (L, R):
        for _ in range(int(dur * 260)):
            c = r.integers(0, n - 800)
            k = np.arange(800)
            ch[c:c + 800] += r.uniform(0.2, 1.0) * np.sin(2 * np.pi * r.uniform(1800, 5200) * k / SR) * np.exp(-k / r.uniform(40, 140)) * 6
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (SR * 0.8))
    return L * fade, R * fade


l, rr = thunder(True, 11, 5.0)
write_wav("thunder_near.wav", l, rr, peak_db=-1)
l, rr = thunder(True, 23, 4.2)
write_wav("thunder_near2.wav", l, rr, peak_db=-2)
l, rr = thunder(False, 37, 5.5)
write_wav("thunder_far.wav", l, rr, peak_db=-4)
l, rr = rain(8.0, 5)
write_wav("rain.wav", l, rr, peak_db=-6)
