"""ずんだもんの紹介映像（ZundaPromo）の BGM と効果音を numpy で作る（素材はすべてこのスクリプトで合成）。
    python promo-video/capture/zunda_audio.py
出力（public/zundamon/）:
  bgm.wav      ゆるく跳ねる明るい曲（120BPM・ヘ長調・4/4）。前奏2小節のあと A・B・A'・B' を繰り返す（約 150 秒）
  bgm_end.wav  締めのジングル（2小節＋余韻。映像のエンドカードで鳴らす）
  sfx/*.wav    効果音（ぽんっ・ぼよん・ピコン・キラキラ・ガーン・はてな・完了・ジャーン など）
"""
import os
import wave
import numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM          # 0.5 秒
E8 = BEAT / 2            # 8分音符
BAR = BEAT * 4           # 2 秒
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'zundamon')
os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_of(n):
    return np.arange(n) / SR


def fade(y, a=0.002, r=0.01):
    a, r = int(a * SR), int(r * SR)
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if r:
        y[-r:] *= np.linspace(1, 0, r)
    return y


# ── 楽器 ─────────────────────────────────────────────
def marimba(m, vel=1.0, length=0.9):
    t = t_of(int(length * SR))
    f = hz(m)
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t * 4.5)
         + 0.5 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 11)
         + 0.16 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 30))
    return fade(y * vel, 0.003, 0.05)


def glock(m, vel=1.0, length=1.4):
    t = t_of(int(length * SR))
    f = hz(m)
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t * 3.2)
         + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)
         + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 10))
    return fade(y * vel, 0.001, 0.05)


_ks = {}
def pluck(m, length=0.5, damp=0.996):
    """Karplus-Strong の弦（ギター・ウクレレ風）。音の高さごとに作り置き"""
    key = (m, length, damp)
    if key not in _ks:
        f = hz(m)
        n = int(SR / f)
        buf = rng.uniform(-1, 1, n)
        buf = np.convolve(buf, np.ones(3) / 3, mode='same')  # 弾いた瞬間を少しやわらかく
        out = np.zeros(int(length * SR))
        for i in range(len(out)):
            j = i % n
            out[i] = buf[j]
            buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % n])
        _ks[key] = fade(lowpass(out, 0.65), 0.001, 0.03)
    return _ks[key].copy()


def bass(m, dur, vel=1.0):
    t = t_of(int((dur + 0.05) * SR))
    f = hz(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    env = np.exp(-t * 3.0) * 0.7 + 0.3
    y = np.tanh(1.6 * y * env) * vel
    return fade(y, 0.004, 0.04)


def lowpass(x, a):
    """1次の簡単なローパス（a: 0〜1、小さいほどこもる）"""
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def kick(vel=1.0):
    t = t_of(int(0.32 * SR))
    f = 48 + 95 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 8.5)
    y[: int(0.002 * SR)] += np.linspace(0.6, 0, int(0.002 * SR))  # 頭の小さなクリック
    return fade(y * vel, 0.0005, 0.02)


def snare(vel=1.0):
    t = t_of(int(0.25 * SR))
    noise = rng.uniform(-1, 1, len(t))
    noise = noise - lowpass(noise, 0.08)  # 低いところを抜く
    body = np.sin(2 * np.pi * 195 * t) * np.exp(-t * 30)
    y = 0.75 * noise * np.exp(-t * 22) + 0.5 * body
    return fade(y * vel, 0.0005, 0.02)


def clap(vel=1.0):
    t = t_of(int(0.3 * SR))
    noise = rng.uniform(-1, 1, len(t))
    noise = noise - lowpass(noise, 0.15)
    env = np.zeros(len(t))
    for k, d in enumerate([0.0, 0.011, 0.022]):
        s = int(d * SR)
        env[s:] += np.exp(-(t[: len(t) - s]) * (90 if k < 2 else 18))
    return fade(noise * env * 0.6 * vel, 0.0005, 0.02)


def hat(vel=1.0, open_=False):
    t = t_of(int((0.25 if open_ else 0.06) * SR))
    noise = rng.uniform(-1, 1, len(t))
    noise = noise - lowpass(noise, 0.7)  # 高いところだけ（シャリッとした空気感）
    y = noise * np.exp(-t * (14 if open_ else 70)) * 0.35
    return fade(y * vel, 0.0005, 0.01)


def shaker(vel=1.0):
    t = t_of(int(0.07 * SR))
    noise = rng.uniform(-1, 1, len(t))
    noise = noise - lowpass(noise, 0.55)
    env = np.sin(np.pi * np.clip(t / 0.07, 0, 1)) ** 2
    return fade(noise * env * 0.18 * vel, 0.001, 0.005)


def crash(length=2.2, vel=1.0):
    t = t_of(int(length * SR))
    noise = rng.uniform(-1, 1, len(t))
    noise = lowpass(noise - lowpass(noise, 0.2), 0.45)
    y = noise * np.exp(-t * 2.2) * 0.35
    return fade(y * vel, 0.001, 0.1)


# ── 配置 ─────────────────────────────────────────────
class Track:
    def __init__(self, seconds):
        self.L = np.zeros(int(seconds * SR) + SR * 3)
        self.R = np.zeros_like(self.L)

    def add(self, y, at, gain=1.0, pan=0.0):
        s = int(round(at * SR))
        if s >= len(self.L):
            return
        y = y[: len(self.L) - s]
        gl = gain * np.sqrt((1 - pan) / 2)
        gr = gain * np.sqrt((1 + pan) / 2)
        self.L[s:s + len(y)] += y * gl
        self.R[s:s + len(y)] += y * gr


def reverb(L, R, seconds=1.3, wet=0.16):
    n = int(seconds * SR)
    t = t_of(n)
    irL = rng.normal(0, 1, n) * np.exp(-t / 0.32)
    irR = rng.normal(0, 1, n) * np.exp(-t / 0.32)
    irL[: int(0.012 * SR)] = 0
    irR[: int(0.017 * SR)] = 0
    irL, irR = lowpass(irL, 0.22), lowpass(irR, 0.22)
    irL /= np.sqrt(np.sum(irL ** 2))
    irR /= np.sqrt(np.sum(irR ** 2))
    size = 1
    while size < len(L) + n:
        size *= 2
    FL, FR = np.fft.rfft(L, size), np.fft.rfft(R, size)
    wl = np.fft.irfft(FL * np.fft.rfft(irL, size), size)[: len(L)]
    wr = np.fft.irfft(FR * np.fft.rfft(irR, size), size)[: len(R)]
    return L + wet * wl, R + wet * wr


def write(path, L, R=None, peak=0.89, trim=False):
    if R is None:
        R = L
    if trim:
        e = np.maximum(np.abs(L), np.abs(R))
        last = np.nonzero(e > e.max() * 0.003)[0]
        n = min(len(L), (last[-1] if len(last) else len(L)) + int(0.6 * SR))
        L, R = L[:n].copy(), R[:n].copy()
        L[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
        R[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    x = np.stack([L, R], axis=1)
    x = np.tanh(x * 1.1) / np.tanh(1.1)  # やわらかく頭を丸める
    x *= peak / max(1e-9, np.abs(x).max())
    pcm = (x * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'{os.path.relpath(path, OUT):18s} {len(L) / SR:6.1f}s')


# コード（ヘ長調）: 押さえる音（ギター風の6本に近い並び）とベースの根音
CH = {
    'F': ([53, 57, 60, 65, 69], 41), 'C': ([48, 55, 60, 64, 67], 48), 'Dm': ([50, 57, 62, 65, 69], 50),
    'Bb': ([46, 53, 58, 62, 65], 46), 'Am': ([45, 52, 57, 60, 64], 45), 'Gm': ([43, 50, 55, 58, 62], 43),
    'C7': ([48, 52, 58, 60, 64], 48),
}
PROG_A = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'F']
PROG_B = ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'Gm', 'C7']
# 主旋律（[8分の位置, 長さ(8分), 音]。-1 は休み）
MEL_A = [
    [[0, 1, 72], [1, 1, 69], [2, 2, 72], [4, 1, 74], [5, 1, 72], [6, 2, 69]],
    [[0, 1, 67], [1, 1, 69], [2, 2, 72], [4, 2, 67], [6, 2, 64]],
    [[0, 1, 69], [1, 1, 72], [2, 2, 74], [4, 1, 77], [5, 1, 76], [6, 2, 74]],
    [[0, 2, 72], [2, 1, 70], [3, 1, 69], [4, 4, 67]],
    [[0, 1, 72], [1, 1, 69], [2, 2, 72], [4, 1, 74], [5, 1, 76], [6, 2, 77]],
    [[0, 1, 76], [1, 1, 74], [2, 2, 72], [4, 2, 67], [6, 2, 69]],
    [[0, 2, 70], [2, 2, 69], [4, 2, 67], [6, 2, 70]],
    [[0, 4, 69], [4, 2, 65]],
]
MEL_B = [
    [[0, 1, 74], [1, 1, 74], [2, 2, 77], [4, 2, 74], [6, 2, 70]],
    [[0, 1, 76], [1, 1, 76], [2, 2, 79], [4, 2, 76], [6, 2, 72]],
    [[0, 2, 76], [2, 2, 72], [4, 2, 69], [6, 2, 72]],
    [[0, 3, 74], [3, 1, 72], [4, 4, 69]],
    [[0, 1, 70], [1, 1, 72], [2, 2, 74], [4, 2, 77], [6, 2, 74]],
    [[0, 1, 72], [1, 1, 74], [2, 2, 76], [4, 2, 79], [6, 2, 76]],
    [[0, 2, 74], [2, 2, 72], [4, 2, 70], [6, 2, 67]],
    [[0, 2, 72], [2, 2, 76], [4, 4, 79]],
]


def play_bar(tr, at, chord, mel, part, bar_i, drums=True, lead=True):
    notes, root = CH[chord]
    # 裏拍のカッティング（ズン・チャ）：8分の裏で短く、弦を少しずらして鳴らす
    for k in (1, 3, 5, 7):
        for si, m in enumerate(notes):
            tr.add(pluck(m, 0.2, 0.985) * np.exp(-t_of(int(0.2 * SR)) * 14), at + k * E8 + si * 0.006, 0.17, -0.35 + 0.17 * si)
    # ベース：1拍目・2拍目の裏・3拍目・4拍目の裏（跳ねる）
    for k, m, d in ((0, root, 1.3), (3, root, 0.8), (4, root + 7 if root + 7 < 58 else root - 5, 1.2), (6, root + 12 if part == 'B' else root, 0.8)):
        tr.add(bass(m, d * E8), at + k * E8, 0.36)
    if drums:
        tr.add(kick(), at, 0.7)
        tr.add(kick(0.8), at + 4 * E8, 0.62)
        if bar_i % 4 == 3:
            tr.add(kick(0.6), at + 7 * E8, 0.5)
        tr.add(clap() if part == 'B' else snare(), at + 2 * E8, 0.42)
        tr.add(clap() if part == 'B' else snare(), at + 6 * E8, 0.42)
        for k in range(8):
            tr.add(hat(0.9 if k % 2 else 0.55), at + k * E8, 2.4, 0.35)
        for k in range(16):
            tr.add(shaker(1.0 if k % 2 else 0.6), at + k * E8 / 2, 2.0, -0.4)
    if lead:
        for s, ln, m in mel:
            if m < 0:
                continue
            tr.add(marimba(m, 1.0, max(0.5, ln * E8 + 0.35)), at + s * E8, 0.4, -0.08)
            if part == 'B':
                tr.add(glock(m + 12, 0.5), at + s * E8, 0.16, 0.3)


def make_bgm():
    # 前奏2小節（主旋律なし）→ A B A' B' A B A' B' … を 75 小節（150 秒）
    bars = []
    bars += [('F', None, 'I', 0), ('C', None, 'I', 1)]
    form = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']
    for sec in form:
        prog, mel = (PROG_A, MEL_A) if sec == 'A' else (PROG_B, MEL_B)
        for i in range(8):
            bars.append((prog[i], mel[i], sec, i))
    bars = bars[:75]
    tr = Track(len(bars) * BAR)
    for bi, (chord, mel, part, i) in enumerate(bars):
        at = bi * BAR
        play_bar(tr, at, chord, mel or [], part, i, drums=True, lead=mel is not None)
        if part == 'B' and i == 0:
            tr.add(crash(1.6, 0.6), at, 0.18, 0.2)
    L, R = reverb(tr.L, tr.R)
    n = int(len(bars) * BAR * SR)
    L, R = L[:n], R[:n]
    # 終わりは 2 小節かけて消す（映像の側では締めのジングルの前に下げる）
    f = np.ones(n)
    f[-int(2 * BAR * SR):] = np.linspace(1, 0, int(2 * BAR * SR))
    write(os.path.join(OUT, 'bgm.wav'), L * f, R * f, peak=0.7)


def make_end():
    # Bb → C7（8分で刻みながら盛り上げる）→ F（1拍目にジャーン、マリンバのアルペジオ、余韻）
    tr = Track(6.5)
    for bi, chord in enumerate(['Bb', 'C7']):
        notes, root = CH[chord]
        at = bi * BEAT * 2
        for k in range(4):
            for si, m in enumerate(notes):
                tr.add(pluck(m, 0.25, 0.988), at + k * E8 + si * 0.006, 0.07 + 0.01 * k, -0.35 + 0.17 * si)
            tr.add(kick(0.7 + 0.1 * k), at + k * E8, 0.45)
        tr.add(bass(root, BEAT * 2), at, 0.34)
    at = BAR
    notes, root = CH['F']
    for si, m in enumerate(notes + [72, 77]):
        tr.add(pluck(m, 2.5, 0.9995), at + si * 0.012, 0.11, -0.4 + 0.12 * si)
    tr.add(bass(root, 2.5), at, 0.4)
    tr.add(kick(1.0), at, 0.7)
    tr.add(crash(3.5, 1.0), at, 0.3)
    for k, m in enumerate([65, 69, 72, 77, 81, 84]):
        tr.add(marimba(m, 0.9, 1.5), at + 0.06 * k, 0.3, -0.2 + 0.08 * k)
        tr.add(glock(m + 12, 0.6, 2.0), at + 0.06 * k + 0.03, 0.08, 0.3)
    L, R = reverb(tr.L, tr.R, 1.6, 0.22)
    n = int(6.0 * SR)
    write(os.path.join(OUT, 'bgm_end.wav'), L[:n], R[:n], peak=0.75)


# ── 効果音 ───────────────────────────────────────────
def sfx():
    S = os.path.join(OUT, 'sfx')
    # ぽんっ（字幕や吹き出しが出る）
    t = t_of(int(0.12 * SR))
    f = 700 * np.exp(np.log(1600 / 700) * np.clip(t / 0.05, 0, 1))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)
    write(os.path.join(S, 'pop.wav'), fade(y, 0.001, 0.01), peak=0.6, trim=True)
    # タップ（画面を押す）
    t = t_of(int(0.05 * SR))
    y = np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 160) + 0.4 * rng.uniform(-1, 1, len(t)) * np.exp(-t * 300)
    write(os.path.join(S, 'tap.wav'), fade(y, 0.0005, 0.005), peak=0.45, trim=True)
    # ぼよん（ずんだもんが跳ねる）
    t = t_of(int(0.45 * SR))
    f = 180 * (1 + 0.9 * t / 0.45) * (1 + 0.25 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 5))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    write(os.path.join(S, 'boing.wav'), fade(y, 0.002, 0.03), peak=0.6, trim=True)
    # しゅっ（場面の切り替え）
    t = t_of(int(0.38 * SR))
    noise = rng.uniform(-1, 1, len(t))
    a = 0.02 + 0.5 * (t / 0.38) ** 1.5
    y = np.empty_like(noise)
    acc = 0.0
    for i in range(len(noise)):
        acc += a[i] * (noise[i] - acc)
        y[i] = acc
    y = (y - lowpass(y, 0.03)) * np.sin(np.pi * t / 0.38) ** 1.2
    write(os.path.join(S, 'swish.wav'), fade(y, 0.005, 0.03), peak=0.5, trim=True)
    # ピコン（通知）
    tr = Track(1.0)
    tr.add(glock(83, 1.0, 0.6), 0.0, 0.5)
    tr.add(glock(88, 1.0, 0.8), 0.09, 0.6)
    write(os.path.join(S, 'pikon.wav'), *reverb(tr.L, tr.R, 0.8, 0.12), peak=0.55, trim=True)
    # キラキラ（ひらめく・うれしい）
    tr = Track(1.6)
    for k, m in enumerate([84, 88, 91, 96, 100]):
        tr.add(glock(m, 0.8, 1.0), 0.045 * k, 0.4, -0.5 + 0.25 * k)
    write(os.path.join(S, 'kira.wav'), *reverb(tr.L, tr.R, 1.0, 0.2), peak=0.55, trim=True)
    # 完了（提出できた）：マリンバで上がる和音
    tr = Track(1.8)
    for k, m in enumerate([65, 69, 72, 77]):
        tr.add(marimba(m, 1.0, 1.3), 0.07 * k, 0.5, -0.2 + 0.13 * k)
    tr.add(glock(89, 0.7, 1.3), 0.3, 0.25, 0.3)
    write(os.path.join(S, 'success.wav'), *reverb(tr.L, tr.R, 1.0, 0.18), peak=0.6, trim=True)
    # ガーン（あせる・困った）：低い不協和音を叩いてゆっくり消える
    tr = Track(2.2)
    for m in (36, 37, 43, 48, 49):
        tr.add(lowpass(pluck(m, 2.0, 0.9993), 0.12), 0.0, 0.45)
    tr.add(kick(1.0), 0.0, 0.6)
    write(os.path.join(S, 'gaan.wav'), *reverb(tr.L, tr.R, 1.4, 0.25), peak=0.7, trim=True)
    # はてな（？）：上がっていく音
    t = t_of(int(0.42 * SR))
    f = 420 * np.exp(np.log(980 / 420) * np.clip(t / 0.3, 0, 1)) * (1 + 0.02 * np.sin(2 * np.pi * 9 * t))
    y = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)) * np.minimum(1, t / 0.02) * np.exp(-np.maximum(0, t - 0.3) * 20)
    write(os.path.join(S, 'hatena.wav'), fade(y, 0.002, 0.02), peak=0.5, trim=True)
    # ジャーン（タイトル）
    tr = Track(3.0)
    notes, root = CH['F']
    for si, m in enumerate(notes + [72, 77]):
        tr.add(pluck(m, 2.4, 0.9995), si * 0.01, 0.12, -0.4 + 0.12 * si)
    tr.add(bass(root, 2.0), 0.0, 0.4)
    tr.add(kick(1.0), 0.0, 0.7)
    tr.add(crash(2.6, 1.0), 0.0, 0.3)
    for k, m in enumerate([77, 81, 84, 89]):
        tr.add(glock(m + 12, 0.7, 1.5), 0.05 + 0.05 * k, 0.12, 0.3)
    write(os.path.join(S, 'jan.wav'), *reverb(tr.L, tr.R, 1.5, 0.22), peak=0.75, trim=True)
    # しょんぼり（ヘロヘロ）：下がっていく2音
    tr = Track(1.6)
    tr.add(marimba(67, 1.0, 0.8), 0.0, 0.5)
    tr.add(marimba(61, 1.0, 1.1), 0.32, 0.5)
    write(os.path.join(S, 'shobon.wav'), *reverb(tr.L, tr.R, 1.0, 0.18), peak=0.5, trim=True)
    # ひそひそ（内緒話）：小さく2回はねる
    tr = Track(0.8)
    tr.add(marimba(84, 0.8, 0.4), 0.0, 0.35)
    tr.add(marimba(81, 0.8, 0.5), 0.12, 0.35)
    write(os.path.join(S, 'hiso.wav'), tr.L, tr.R, peak=0.4, trim=True)
    # ティック（テーマや言語が替わる）
    t = t_of(int(0.06 * SR))
    y = np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 90) + 0.5 * np.sin(2 * np.pi * 3100 * t) * np.exp(-t * 140)
    write(os.path.join(S, 'tick.wav'), fade(y, 0.0005, 0.005), peak=0.4, trim=True)


if __name__ == '__main__':
    sfx()
    make_end()
    make_bgm()
