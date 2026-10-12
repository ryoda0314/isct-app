"""ずんだもん立ち絵素材2.3（坂本アヒル・PSDTool 形式）のパーツを PNG に書き出す。
public/zundamon/parts/<id>.png と、各パーツの位置（PSD の 1082x1650 の座標）を src/zundamon/parts.json に書く。
映像の側（src/zundamon/Zundamon.jsx）でパーツを重ね、目・口・眉・腕・顔色・枝豆を場面ごとに切り替える（まばたき・口パクも）。
    python promo-video/capture/export_zundamon.py
"""
import json, os, warnings
from psd_tools import PSDImage
warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
PSD = os.path.join(HERE, 'assets', 'zundamon', 'ずんだもん立ち絵素材2.3.psd')
OUT = os.path.join(HERE, '..', 'public', 'zundamon', 'parts')
MANIFEST = os.path.join(HERE, '..', 'src', 'zundamon', 'parts.json')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)

# PSD のグループの道筋 → 映像の側で使う名前。服装2（素体・水着など）とパーカー・アヒルちゃんは使わない
GROUPS = {
    ('尻尾的なアレ',): 'tail',
    ('*服装1', '*いつもの服'): 'body',
    ('*服装1', '!左腕'): 'armL',
    ('*服装1', '!右腕'): 'armR',
    ('!口',): 'mouth',
    ('!顔色',): 'face',
    ('!目',): 'eyes',
    ('!目', '*目セット'): 'white',
    ('!目', '*目セット', '!黒目'): 'pupil',
    ('!眉',): 'brow',
    ('!枝豆',): 'eda',
    ('記号など',): 'mark',
}
SKIP = {'*(非表示)', '*パーカー(裏地とセットで使用)', 'アヒルちゃん', '*目セット'}

psd = PSDImage.open(PSD)
manifest = {'size': list(psd.size), 'parts': {}}

def clean(n):
    return n.lstrip('*!')

def walk(layer, path):
    for l in layer:
        p = path + (l.name,)
        if l.is_group():
            walk(l, p)
            continue
        if l.name in SKIP:
            continue
        key = None
        for k, v in GROUPS.items():
            if p[:len(k)] == k and (len(p) == len(k) + 1 or p == k):
                key = v
        if p == ('*服装1', '*いつもの服'):
            key = 'body'
        if key is None:
            continue
        name = clean(l.name) if key not in ('tail', 'body') else key
        pid = f'{key}.{name}' if key not in ('tail', 'body') else key
        im = l.topil()
        if im is None:
            continue
        x0, y0, x1, y1 = l.bbox
        fn = f'{len(manifest["parts"]):03d}.png'
        im.save(os.path.join(OUT, fn))
        manifest['parts'][pid] = {'file': fn, 'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}

walk(psd, ())
json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(manifest['parts']), 'parts')
for k in manifest['parts']:
    print(' ', k)


# ── 手を振る腕（向かって右の手＝左腕「手を挙げる」）を、肘のところでなめらかに曲げた絵を角度ごとに作る ──
# パーツを肩で丸ごと回すと、体の脇に沿った袖の裾が体から外れて切り口が見える。切って回すと袖口との間に隙間が出る。
# そこで、肘より手前（二の腕・袖）は動かさず、肘のまわりで角度が 0 からなめらかに増えるように絵をゆがめる（継ぎ目が出ない）。
# 出力: public/zundamon/parts/wave/NN.png（-14°〜+14°・0.5°おき）と、parts.json の wave（置く位置と角度）
def make_wave_frames(amp=14.0, step=0.5, pad=80):
    import numpy as np
    from PIL import Image
    pid = 'armL.手を挙げる'
    info = manifest['parts'][pid]
    src = np.asarray(Image.open(os.path.join(OUT, info['file'])).convert('RGBA')).astype(np.float64)
    H0, W0 = src.shape[:2]
    R, G, B, A = (src[..., i] for i in range(4))
    opaque = A > 8
    dark = (R < 150) & opaque
    skin = opaque & ~dark & (R - G >= 10)
    sleeve = opaque & ~dark & ~skin
    # 袖口の中心（肌のうち袖に接するところ）と、腕の向き（肌の主軸）
    near_sleeve = np.zeros_like(sleeve)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            near_sleeve |= np.roll(np.roll(sleeve, dy, 0), dx, 1)
    ys, xs = np.nonzero(skin & near_sleeve)
    C = np.array([xs.mean(), ys.mean()])
    ky, kx = np.nonzero(skin)
    pts = np.stack([kx, ky], 1).astype(float)
    c = pts - pts.mean(0)
    w, v = np.linalg.eigh(c.T @ c)
    axis = v[:, np.argmax(w)]
    if np.dot(pts.mean(0) - C, axis) < 0:
        axis = -axis
    tk = (pts - C) @ axis
    tmax = tk.max()
    t_e = 0.42 * tmax                                   # 肘（袖口から指先までの 4 割のところ）
    E = pts[np.abs(tk - t_e) < 3].mean(0)               # 肘の、腕の太さの真ん中
    half = 0.22 * tmax                                  # この幅でなめらかに曲げる

    # 余白をつけたキャンバス（手が動く分）。前乗算アルファで補間して、縁が黒ずまないようにする
    Wp, Hp = W0 + 2 * pad, H0 + 2 * pad
    pm = np.zeros((Hp, Wp, 4))
    pm[pad:pad + H0, pad:pad + W0, :3] = src[..., :3] * (src[..., 3:4] / 255.0)
    pm[pad:pad + H0, pad:pad + W0, 3] = src[..., 3]
    Cp, Ep = C + pad, E + pad
    gx, gy = np.meshgrid(np.arange(Wp, dtype=float), np.arange(Hp, dtype=float))
    t = (gx - Cp[0]) * axis[0] + (gy - Cp[1]) * axis[1]
    ramp = np.clip((t - (t_e - half)) / (2 * half), 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)                 # smoothstep

    def sample(px, py):
        x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
        fx = px - x0; fy = py - y0
        out = np.zeros((Hp, Wp, 4))
        for oy, wy in ((0, 1 - fy), (1, fy)):
            for ox, wx in ((0, 1 - fx), (1, fx)):
                xi = x0 + ox; yi = y0 + oy
                ok = (xi >= 0) & (xi < Wp) & (yi >= 0) & (yi < Hp)
                val = np.zeros((Hp, Wp, 4))
                val[ok] = pm[yi[ok], xi[ok]]
                out += val * (wx * wy)[..., None]
        return out

    wave_dir = os.path.join(OUT, 'wave')
    os.makedirs(wave_dir, exist_ok=True)
    angles = [round(-amp + k * step, 3) for k in range(int(round(2 * amp / step)) + 1)]
    for k, ang in enumerate(angles):
        phi = np.deg2rad(ang) * ramp
        dx, dy = gx - Ep[0], gy - Ep[1]
        cs, sn = np.cos(-phi), np.sin(-phi)               # 出力の点 → 元の絵の点（逆に回す）
        px = Ep[0] + cs * dx - sn * dy
        py = Ep[1] + sn * dx + cs * dy
        out = sample(px, py)
        a = out[..., 3]
        rgb = np.where(a[..., None] > 0, out[..., :3] / np.maximum(a[..., None], 1e-6) * 255.0, 0)
        img = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8)
        Image.fromarray(img, 'RGBA').save(os.path.join(wave_dir, f'{k:02d}.png'))
    manifest['wave'] = {
        'x': info['x'] - pad, 'y': info['y'] - pad, 'w': Wp, 'h': Hp,
        'angles': angles, 'elbow': [round(info['x'] + E[0], 1), round(info['y'] + E[1], 1)],
    }
    for k in ('wave.arm', 'wave.sleeve'):
        manifest['parts'].pop(k, None)
    print(f'wave: {len(angles)} frames ({angles[0]}..{angles[-1]} deg), elbow {manifest["wave"]["elbow"]}')


make_wave_frames()
json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
