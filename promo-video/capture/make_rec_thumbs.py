"""機能の壁（src/film/scenes/Finale.jsx）で小さく流す、操作動画の縮小版を作る。
public/film/rec/<名前>/NNNN.jpg（2倍）→ public/film/rec_thumbs/<名前>/NNNN.jpg（1倍・偶数コマだけ＝15fps）。
壁には何十枚も並ぶので、原寸のまま読むと書き出しのメモリと時間が足りなくなる。
    python promo-video/capture/make_rec_thumbs.py
"""
import glob, os, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'public', 'film', 'rec')
OUT = os.path.join(HERE, '..', 'public', 'film', 'rec_thumbs')

total = 0
for d in sorted(glob.glob(os.path.join(SRC, 'rec_*'))):
    name = os.path.basename(d)
    if name == 'rec_desk':  # PC の画面は壁に並べない
        continue
    out = os.path.join(OUT, name)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    files = sorted(glob.glob(os.path.join(d, '*.jpg')))
    for fp in files[::2]:
        im = Image.open(fp).convert('RGB')
        im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(os.path.join(out, os.path.basename(fp)), quality=82)
    total += len(files[::2])
    print(f'{name:20s} {len(files[::2])}')
print('total', total)
