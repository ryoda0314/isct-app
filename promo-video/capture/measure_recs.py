"""アプリの操作動画（public/film/rec/<名前>/）の各コマの上下の色と、タップと設定の切り替えの記録をまとめて src/film/recs.json に書く。
動画の側で、ステータスバーとホームインジケータの帯をこの色で塗り（テーマが途中で変わっても追いつく）、
タップした位置に印を出し、分解図ではカードの位置を使う。
    python promo-video/capture/measure_recs.py
"""
import glob, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'public', 'film', 'rec')
OUT = os.path.join(HERE, '..', 'src', 'film', 'recs.json')

def hexc(c):
    return '#%02x%02x%02x' % tuple(int(v) for v in c)

res = {}
for d in sorted(glob.glob(os.path.join(SRC, 'rec_*'))):
    name = os.path.basename(d)
    log = json.load(open(os.path.join(d, 'log.json'), encoding='utf-8')) if os.path.exists(os.path.join(d, 'log.json')) else {}
    files = sorted(glob.glob(os.path.join(d, '*.jpg')))
    tops, bots, darks = [], [], []
    for fp in files:
        im = np.asarray(Image.open(fp).convert('RGB').reduce(4)).astype(int)
        top = np.median(im[0:1].reshape(-1, 3), axis=0)
        bot = np.median(im[-1:].reshape(-1, 3), axis=0)
        tops.append(hexc(top))
        bots.append(hexc(bot))
        darks.append(int(0.299 * top[0] + 0.587 * top[1] + 0.114 * top[2] < 110))
    taps = [[e['f'], e['tap'][0], e['tap'][1]] for e in log.get('log', []) if 'tap' in e]
    cards = {str(e['f']): e['cards'] for e in log.get('log', []) if 'cards' in e}
    # 画面の操作なしでアプリの設定を切り替えた瞬間（テーマ・言語）。映像の側で効果音を合わせる
    marks = [[e['f'], e['mark']] for e in log.get('log', []) if 'mark' in e]
    res[name] = {'frames': len(files), 'w': log.get('width', 390), 'h': log.get('height', 770), 'top': tops, 'bottom': bots, 'dark': darks, 'taps': taps, 'cards': cards, 'marks': marks}
    print(f"{name:20s} {len(files):4d} frames  taps {len(taps)}  marks {len(marks)}  cards {sum(len(v) for v in cards.values())}")
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False)
print('wrote src/film/recs.json')
