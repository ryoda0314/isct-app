"""撮った画面の上下の色と、ヘッダー下端・タブバー上端（CSS px）を測って src/promo2/screens.json に書く。
動画側で、ステータスバー（54px）とホームインジケータ（20px）の帯をこの色で塗り、縦長の画面はヘッダーとタブバーを固定してスクロールさせる。
    python promo-video/capture/measure_screens.py
"""
import glob, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'public', 'promo2', 'screens')
OUT = os.path.join(HERE, '..', 'src', 'promo2', 'screens.json')

def hexc(c):
    return '#%02x%02x%02x' % tuple(int(v) for v in c)

res = {}
for fp in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    name = os.path.splitext(os.path.basename(fp))[0]
    im = np.asarray(Image.open(fp).convert('RGB')).astype(int)
    H, W, _ = im.shape
    s = W / 390  # 端末の倍率
    top = np.median(im[0:max(1, int(2 * s))].reshape(-1, 3), axis=0)
    bot = np.median(im[H - int(3 * s):H].reshape(-1, 3), axis=0)
    # 左端の列を上から見て、色が変わる位置（ヘッダーとタブバーの境界線）を拾う
    col = im[:, int(3 * s)]
    edges = [y for y in range(1, H) if np.abs(col[y] - col[y - 1]).sum() > 6]
    head = next((y for y in edges if 40 * s <= y <= 80 * s), None)
    tab_top = next((y for y in reversed(edges) if H - 70 * s <= y <= H - 30 * s), None)
    lum = 0.299 * top[0] + 0.587 * top[1] + 0.114 * top[2]
    res[name] = {
        'w': W, 'h': H, 'css_h': round(H / s), 'top': hexc(top), 'bottom': hexc(bot), 'dark': bool(lum < 110),
        'tab_top': round(tab_top / s, 1) if tab_top else None, 'header': round(head / s, 1) if head else None,
    }
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
for k, v in res.items():
    print(f"{k:22s} {v['css_h']:5d} top {v['top']} bot {v['bottom']} dark {int(v['dark'])} header {v['header']} tab {v['tab_top']}")
